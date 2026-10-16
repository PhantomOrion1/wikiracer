(() => {
  'use strict';

  const API = 'https://en.wikipedia.org/w/api.php';
  const PEER_PREFIX = 'wikirace-room-v1-';
  // Runtime settings. config.json (same folder) can override any of these without a code change,
  // e.g. turn fill-in racers down to 0 as the site gets busy, or point at your own PeerJS server.
  const CONFIG = {
    publicSlots: 12,
    bots: {
      enabled: true, maxPerRoom: 2, maxHumans: 2, secondChance: 0.5,
      firstDelayMs: [12000, 20000], secondDelayMs: [6000, 14000], leaveChance: 0.2,
      busyRoomsHalf: 3, busyRoomsOff: 6,
    },
    lobby: { soloWaitMs: 35000, groupWaitMs: 30000, readyGoMs: 5000, minAfterJoinMs: 8000, resultsMs: 15000 },
    peer: null,
    analytics: { posthogKey: '', posthogHost: 'https://us.i.posthog.com' },
  };
  async function loadConfig() {
    try {
      const r = await fetch(`config.json?m=${Math.floor(Date.now() / 300000)}`);
      if (!r.ok) return;
      const j = await r.json();
      if (typeof j.publicSlots === 'number') CONFIG.publicSlots = Math.max(1, Math.min(30, j.publicSlots));
      if (j.bots && typeof j.bots === 'object') Object.assign(CONFIG.bots, j.bots);
      if (j.lobby && typeof j.lobby === 'object') Object.assign(CONFIG.lobby, j.lobby);
      if (j.peer && typeof j.peer === 'object') CONFIG.peer = j.peer;
      if (j.analytics && typeof j.analytics === 'object') Object.assign(CONFIG.analytics, j.analytics);
    } catch {}
    flushAnalytics();
  }

  // ---------- analytics ----------
  // Anonymous product analytics sent straight to PostHog's capture API (no third-party script).
  // Stays off until config.json has analytics.posthogKey. Honours Do Not Track. Never sends names.
  const APP_VERSION = '16';
  const SESSION_ID = crypto.randomUUID();
  const aQueue = [];
  let aTimer = null;
  function anonId() {
    let id = store.get('wr-aid');
    if (!id) { id = crypto.randomUUID(); store.set('wr-aid', id); }
    return id;
  }
  function track(event, props = {}) {
    try {
      if (navigator.doNotTrack === '1' || window.doNotTrack === '1') return;
      aQueue.push({
        event,
        timestamp: new Date().toISOString(),
        properties: {
          ...props, distinct_id: anonId(), $session_id: SESSION_ID, app_version: APP_VERSION,
          $current_url: location.origin + location.pathname, mobile: matchMedia('(max-width: 760px)').matches,
        },
      });
      if (aQueue.length > 300) aQueue.splice(0, aQueue.length - 300);
      clearTimeout(aTimer);
      aTimer = setTimeout(flushAnalytics, 4000);
    } catch {}
  }
  function flushAnalytics() {
    const key = CONFIG.analytics.posthogKey;
    if (!key || !aQueue.length) return;
    const batch = aQueue.splice(0, aQueue.length).map((e) => ({ ...e, distinct_id: e.properties.distinct_id }));
    try {
      fetch(`${CONFIG.analytics.posthogHost.replace(/\/$/, '')}/batch/`, {
        method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: key, batch }),
      }).catch(() => {});
    } catch {}
  }
  addEventListener('pagehide', flushAnalytics);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flushAnalytics(); });
  addEventListener('error', (e) => track('client_error', { message: String(e.message || '').slice(0, 200), source: String(e.filename || '').split('/').pop(), line: e.lineno }));
  addEventListener('unhandledrejection', (e) => track('client_error', { message: String((e.reason && e.reason.message) || e.reason || '').slice(0, 200), kind: 'promise' }));
  const peerOpts = () => ({ debug: 0, ...(CONFIG.peer || {}) });
  // ?debug uses a separate set of public rooms so testing never lands in real players' races.
  const PUBLIC_NS = /[?&]debug\b/.test(location.search) ? 'test-public-' : 'public-';
  const publicPeerId = (i) => `${PEER_PREFIX}${PUBLIC_NS}${i}`;
  // Public rooms have codes too (PUB01, PUB02…) so friends can jump into the same one.
  // They look like any other room code and change daily (UTC, so every player agrees).
  const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const utcDay = (offset = 0) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);
  function codeFor(slot, day) {
    let h = 2166136261;
    const seed = `${PUBLIC_NS}${slot}:${day}`;
    for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
    let out = '';
    for (let i = 0; i < 5; i++) { h = Math.imul(h ^ (h >>> 13), 2246822507) >>> 0; out += CODE_ALPHABET[h % CODE_ALPHABET.length]; }
    return out;
  }
  const pubCode = (slot) => codeFor(slot, utcDay());
  function pubSlotFromCode(code) {
    for (const day of [utcDay(), utcDay(-1)]) {
      for (let i = 0; i < 30; i++) if (codeFor(i, day) === code) return i;
    }
    return null;
  }
  const MAX_PLAYERS = 8;
  const COUNTDOWN_MS = 3300;
  const GRACE_MS = 4000;
  const LIMITS = { easy: 150e3, medium: 300e3, hard: 600e3, random: 600e3, custom: 300e3, challenge: 300e3 };
  const DIFF_LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard', random: 'Random', custom: 'Custom', challenge: 'Challenge', daily: 'Daily' };
  const COLORS = ['#3355ff', '#f76707', '#2f9e44', '#d6336c', '#7048e8', '#0c8599', '#e8a400', '#8a5a44'];
  // Namespaces / interwiki prefixes that don't count as articles.
  const BLOCKED_NS = new Set([
    'file', 'image', 'media', 'category', 'help', 'special', 'wikipedia', 'wp', 'project',
    'template', 'portal', 'talk', 'user', 'user talk', 'wikipedia talk', 'file talk',
    'template talk', 'category talk', 'help talk', 'portal talk', 'draft', 'draft talk',
    'module', 'module talk', 'mediawiki', 'mediawiki talk', 'timedtext', 'book', 'gadget',
    'wikt', 'wiktionary', 'commons', 'c', 's', 'q', 'n', 'b', 'v', 'voy', 'species', 'd',
    'm', 'meta', 'mw', 'foundation', 'wmf', 'incubator',
  ]);
  const UNSAFE_TAGS = 'script, iframe, frame, frameset, object, embed, applet, form, input, button, textarea, select, base, meta, link, noscript, portal, template';

  // ---------- helpers ----------
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
  const normTitle = (t) => {
    t = String(t || '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
    return t.charAt(0).toUpperCase() + t.slice(1);
  };
  const sameTitle = (a, b) => normTitle(a) === normTitle(b);
  const fmtTime = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
  const int = (v, min, max) => Math.max(min, Math.min(max, Math.floor(Number(v)) || 0));
  const BAD_WORDS = ['fuck', 'shit', 'cunt', 'nigg', 'fag', 'retard', 'rape', 'nazi', 'hitler', 'whore', 'slut', 'dick', 'cock', 'pussy', 'bitch', 'wank', 'twat', 'porn', 'kike', 'spic', 'chink', 'tranny', 'paedo', 'pedo'];
  const isOffensive = (n) => {
    const flat = n.toLowerCase().replace(/[0@4]/g, (c) => ({ 0: 'o', '@': 'a', 4: 'a' }[c])).replace(/[1!|]/g, 'i').replace(/3/g, 'e').replace(/[5$]/g, 's').replace(/7/g, 't').replace(/[^a-z]/g, '');
    return BAD_WORDS.some((w) => flat.includes(w));
  };
  const cleanName = (n) => {
    const name = String(n || '')
      .replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, '')
      .replace(/\s+/g, ' ').trim().slice(0, 20) || 'Player';
    return isOffensive(name) ? 'Player' : name;
  };
  const limitFor = (diff) => LIMITS[diff] || LIMITS.custom;
  const score = (p) => (p.clicks || 0) + (p.penalties || 0);
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const baseUrl = () => location.origin + location.pathname;
  const peerReady = () => {
    if (typeof Peer === 'undefined') { toast('Multiplayer failed to load, check your connection'); return false; }
    return true;
  };

  let toastTimer;
  function toast(msg, ms = 2400) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  function show(id) {
    $$('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
    window.scrollTo(0, 0);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied to clipboard');
    } catch {
      window.prompt('Copy this:', text);
    }
  }

  // ---------- Wikipedia ----------
  // Wikipedia API with retry + backoff (429s, 5xx, rate-limit errors) so busy moments don't break races.
  async function api(params, tries = 3) {
    const url = API + '?' + new URLSearchParams({ format: 'json', formatversion: '2', origin: '*', ...params });
    for (let i = 0; ; i++) {
      try {
        const r = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer' });
        if (r.status === 429 || r.status >= 500) throw Object.assign(new Error(`Wikipedia is busy (${r.status})`), { retry: true });
        if (!r.ok) throw new Error(`Wikipedia request failed (${r.status})`);
        const j = await r.json();
        if (j.error && /ratelimit|maxlag|readonly/i.test(j.error.code || '')) throw Object.assign(new Error('Wikipedia is busy, try again'), { retry: true });
        return j;
      } catch (e) {
        const network = e instanceof TypeError;
        if (i >= tries - 1 || !(e.retry || network)) throw e;
        await new Promise((res) => setTimeout(res, 700 * 2 ** i + Math.random() * 500));
      }
    }
  }

  const articleCache = new Map();
  function fetchArticle(title) {
    const key = normTitle(title);
    if (articleCache.has(key)) return articleCache.get(key);
    const p = api({
      action: 'parse', page: title, prop: 'text|displaytitle', redirects: '1',
      disableeditsection: '1', disabletoc: '1', disablelimitreport: '1', smaxage: '1800', maxage: '1800',
    }).then((j) => {
      if (j.error) throw new Error(j.error.code === 'missingtitle' ? `"${title}" doesn't exist on Wikipedia` : j.error.info);
      return { title: j.parse.title, displaytitle: j.parse.displaytitle, html: j.parse.text };
    });
    articleCache.set(key, p);
    p.catch(() => articleCache.delete(key));
    return p;
  }

  const infoCache = new Map();
  function fetchInfo(title) {
    const key = normTitle(title);
    if (infoCache.has(key)) return infoCache.get(key);
    const p = api({
      action: 'query', titles: title, redirects: '1',
      prop: 'pageprops|description|pageimages|extracts',
      exintro: '1', explaintext: '1', exsentences: '3', piprop: 'thumbnail', pithumbsize: '400', smaxage: '3600', maxage: '3600',
    }).then((j) => {
      const pg = j.query && j.query.pages && j.query.pages[0];
      if (!pg || pg.missing || pg.invalid) throw new Error(`"${title}" isn't a Wikipedia article`);
      if (pg.ns !== 0) throw new Error(`"${title}" isn't a regular article`);
      return { title: pg.title, description: pg.description || '', extract: pg.extract || '', thumb: pg.thumbnail ? pg.thumbnail.source : '' };
    });
    infoCache.set(key, p);
    p.catch(() => infoCache.delete(key));
    return p;
  }

  async function randomTitles(n) {
    const j = await api({ action: 'query', list: 'random', rnnamespace: '0', rnlimit: String(n), rnfilterredir: 'nonredirects' });
    return j.query.random.map((r) => r.title);
  }

  function attachSuggest(input) {
    const list = document.getElementById(input.getAttribute('list'));
    let timer;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 2) return;
      timer = setTimeout(async () => {
        try {
          const r = await fetch(API + '?' + new URLSearchParams({ action: 'opensearch', search: q, limit: '8', namespace: '0', format: 'json', origin: '*' }));
          const j = await r.json();
          list.innerHTML = j[1].map((t) => `<option value="${esc(t)}">`).join('');
        } catch {}
      }, 200);
    });
  }

  // Checks a reported route against Wikipedia: every forward step must be a real link on the
  // previous page, back steps must match the history, and it must end at the target.
  // Returns null when the route is legit, otherwise a reason.
  async function verifyPath(round, path) {
    if (!path.length || !sameTitle(path[0].t, round.start)) return "Route doesn't begin at the start article";
    if (!sameTitle(path[path.length - 1].t, round.end)) return "Route doesn't reach the target";
    const stack = [path[0].t];
    const steps = [];
    for (let i = 1; i < path.length; i++) {
      const s = path[i];
      if (s.back) {
        if (stack.length < 2 || !sameTitle(stack[stack.length - 2], s.t)) return `Impossible back step at click ${i}`;
        stack.pop();
      } else {
        steps.push({ from: stack[stack.length - 1], via: normTitle(s.via || s.t), to: s.t, i });
        stack.push(s.t);
      }
    }
    if (!steps.length) return null;

    // 1. Each `via` must resolve (following redirects) to the article the player landed on.
    const resolved = new Map();
    const vias = [...new Set(steps.map((s) => s.via))];
    for (let i = 0; i < vias.length; i += 50) {
      const j = await api({ action: 'query', titles: vias.slice(i, i + 50).join('|'), redirects: '1' });
      const map = new Map();
      for (const n of j.query.normalized || []) map.set(n.from, n.to);
      const redir = new Map((j.query.redirects || []).map((r) => [r.from, r.to]));
      for (const v of vias.slice(i, i + 50)) {
        let t = map.get(v) || v;
        t = redir.get(t) || t;
        resolved.set(v, t);
      }
    }
    for (const s of steps) {
      if (!sameTitle(resolved.get(s.via), s.to)) return `Click ${s.i} doesn't lead to "${s.to}"`;
    }

    // 2. Each `via` must be linked from the page the player was on.
    const froms = [...new Set(steps.map((s) => normTitle(s.from)))];
    const found = new Set();
    for (let i = 0; i < froms.length; i += 50) {
      for (let k = 0; k < vias.length; k += 50) {
        let cont = {};
        for (let guard = 0; guard < 20; guard++) {
          const j = await api({
            action: 'query', prop: 'links', titles: froms.slice(i, i + 50).join('|'),
            pltitles: vias.slice(k, k + 50).join('|'), pllimit: 'max', ...cont,
          });
          for (const pg of j.query.pages || []) for (const l of pg.links || []) found.add(`${normTitle(pg.title)}→${normTitle(l.title)}`);
          if (!j.continue) break;
          cont = j.continue;
        }
      }
    }
    for (const s of steps) {
      if (!found.has(`${normTitle(s.from)}→${s.via}`)) return `"${s.from}" has no link to "${s.via}" (click ${s.i})`;
    }
    return null;
  }

  // ---------- picking pairs ----------
  // ---------- pair generation ----------
  // Pairs come from Wikipedia's Vital Articles (vital.js: ~1,000 core topics + ~3,500 more, by subject):
  //   easy   = two core articles from the same subject      (~100k combinations)
  //   medium = two core articles from different subjects   (~900k)
  //   hard   = a lesser-known article → a core article in a different subject (~3M)
  // plus the hand-picked pairs about a quarter of the time. Anything where the start links straight to
  // the target is rejected, and each browser remembers what it has played so pairs never repeat.
  const PLAYED_KEY = 'wr-played';
  const playedList = () => store.get(PLAYED_KEY) || [];
  const pairKey = (s, e) => `${normTitle(s)}→${normTitle(e)}`;
  function markPlayed(s, e) {
    const list = playedList().filter((k) => k !== pairKey(s, e));
    list.push(pairKey(s, e));
    store.set(PLAYED_KEY, list.slice(-4000));
  }
  function recentTitles(n = 40) {
    const set = new Set();
    for (const k of playedList().slice(-n)) k.split('→').forEach((t) => set.add(t));
    return set;
  }

  async function validatePair(s, e) {
    const [a, b] = await Promise.all([fetchInfo(s), fetchInfo(e)]);
    if (sameTitle(a.title, b.title)) throw new Error('Start and target are the same article');
    return { start: a.title, end: b.title };
  }

  async function linksDirectly(start, end) {
    const j = await api({ action: 'query', prop: 'links', titles: start, pltitles: end, redirects: '1', smaxage: '3600', maxage: '3600' });
    return ((j.query && j.query.pages) || []).some((pg) => pg.links && pg.links.length);
  }

  const anyOf = (arr) => arr[Math.floor(Math.random() * arr.length)];
  // Tiers of how recognisable an article is (vital.js):
  //   familiar = hand-picked topics almost anyone knows; ranked = core articles by real daily readers.
  const POOL = window.POOL || { familiar: [], ranked: [], subjects: [] };
  // Every pair is built from topics almost anyone knows; difficulty comes from how far apart they are,
  // not how obscure they are. Easy = a confirmed 2-click route, medium = different areas and not
  // directly linked, hard = no route shorter than 3 clicks.
  const FAMILIAR = POOL.familiar.map(([t, g]) => ({ t, s: g }));
  const EASY_POOL = FAMILIAR;

  function generatedCandidate(diff) {
    if (!FAMILIAR.length) return null;
    const a = anyOf(FAMILIAR);
    let b = anyOf(FAMILIAR);
    if (diff !== 'easy') for (let i = 0; i < 6 && b.s === a.s; i++) b = anyOf(FAMILIAR);
    return [a.t, b.t];
  }

  // How connected two articles are: the pages that sit between them (start → X → end), using each
  // page's first 500 links. Link lists are cached so repeat lookups cost nothing.
  const linkMemo = new Map();
  const memo = (key, fn) => { if (!linkMemo.has(key)) { const p = fn(); linkMemo.set(key, p); p.catch(() => linkMemo.delete(key)); } return linkMemo.get(key); };
  async function middles(start, end) {
    const [S, T] = await Promise.all([memo(`out:${start}`, () => linksOfPage(start)), memo(`in:${end}`, () => pagesLinkingTo(end))]);
    const tset = new Set(T.map((x) => normTitle(x.t)));
    return S.filter((x) => tset.has(normTitle(x.t)) && !sameTitle(x.t, end)).sort(byLen);
  }
  async function twoClickRoute(start, end) {
    const mids = await middles(start, end);
    return mids.length ? [start, mids[0].t, end] : null;
  }

  async function pickPair(diff, custom = []) {
    if (diff === 'custom') {
      const [s, e] = custom.map((x) => (x || '').trim());
      if (!s || !e) throw new Error('Enter a start and a target article');
      return validatePair(s, e);
    }
    if (diff === 'random') {
      for (let i = 0; i < 4; i++) {
        const [s, e] = await randomTitles(2);
        try { return await validatePair(s, e); } catch {}
      }
      throw new Error("Couldn't find random articles, try again");
    }
    const played = new Set(playedList());
    const recent = recentTitles();
    const fresh = ([s, e]) => !played.has(pairKey(s, e)) && !recent.has(normTitle(s)) && !recent.has(normTitle(e));
    const curated = (window.PAIRS[diff] || []).filter(fresh);
    let bestHard = null;
    for (let attempt = 0; attempt < (diff === 'hard' ? 4 : 8); attempt++) {
      const useCurated = curated.length && (Math.random() < 0.15 || !FAMILIAR.length);
      const cand = useCurated ? curated.splice(Math.floor(Math.random() * curated.length), 1)[0] : generatedCandidate(diff);
      if (!cand || !fresh(cand) || sameTitle(cand[0], cand[1])) continue;
      try {
        // Familiar titles are already known-good; only hand-picked pairs need checking.
        const pair = useCurated ? await validatePair(cand[0], cand[1]) : { start: cand[0], end: cand[1] };
        if (played.has(pairKey(pair.start, pair.end)) || await linksDirectly(pair.start, pair.end)) continue;
        if (diff === 'medium') return pair;
        const mids = await middles(pair.start, pair.end).catch(() => null);
        if (!mids) continue;
        if (diff === 'easy') {
          if (!mids.length) continue;
          return { ...pair, route: [pair.start, mids[0].t, pair.end] };
        }
        // Hard: the fewer pages in between, the harder. None at all is ideal.
        if (!mids.length) return pair;
        if (!bestHard || mids.length < bestHard.n) bestHard = { pair: { ...pair, route: [pair.start, mids[0].t, pair.end] }, n: mids.length };
      } catch {}
    }
    if (bestHard) return bestHard.pair;
    const p = anyOf(window.PAIRS[diff]);
    return validatePair(p[0], p[1]);
  }

  // ---------- article rendering ----------
  function classifyLink(a) {
    const href = a.getAttribute('href') || '';
    if (!href) return { type: 'none' };
    if (href.startsWith('#')) return { type: 'anchor', id: href.slice(1) };
    if (a.classList.contains('new') || href.includes('redlink=1')) return { type: 'dead', reason: "That article doesn't exist yet" };
    if (a.classList.contains('extiw') || a.classList.contains('external')) return { type: 'dead', reason: 'External links are off-limits' };
    const m = href.match(/^(?:https?:)?(?:\/\/en\.wikipedia\.org)?\/wiki\/([^?#]+)/) || href.match(/^\.\/([^?#]+)/);
    if (!m) return { type: 'dead', reason: 'External links are off-limits' };
    let title;
    try { title = decodeURIComponent(m[1]).replace(/_/g, ' '); } catch { return { type: 'dead', reason: 'Broken link' }; }
    const colon = title.indexOf(':');
    if (colon > 0 && BLOCKED_NS.has(title.slice(0, colon).trim().toLowerCase())) {
      return { type: 'dead', reason: 'Only links to other articles count' };
    }
    return { type: 'article', title: normTitle(title) };
  }

  // Parses Wikipedia HTML, strips anything executable, and rewires links so the game sees every click.
  function buildArticle(art) {
    const titleDoc = new DOMParser().parseFromString(art.displaytitle || '', 'text/html');
    const doc = new DOMParser().parseFromString(art.html, 'text/html');
    $$(`${UNSAFE_TAGS}, .mw-editsection, sup.reference, .mw-empty-elt, .ambox, .ombox, .mw-jump-link, .navbar, .noprint.portal, .mw-cite-backlink`, doc)
      .forEach((n) => n.remove());
    for (const el of doc.body.querySelectorAll('*')) {
      for (const attr of [...el.attributes]) {
        const name = attr.name.toLowerCase();
        if (name.startsWith('on') || name === 'srcdoc' || name === 'formaction' || name === 'action' || name === 'ping') el.removeAttribute(attr.name);
        else if (['href', 'src', 'xlink:href', 'srcset', 'poster', 'background'].includes(name) && /^\s*(javascript|vbscript|data):/i.test(attr.value)) el.removeAttribute(attr.name);
      }
    }
    $$('a', doc).forEach((a) => {
      const info = classifyLink(a);
      a.removeAttribute('target');
      a.setAttribute('draggable', 'false');
      if (info.type === 'article') {
        a.dataset.wr = info.title;
        a.setAttribute('href', '#');
        // Draw the link text with CSS (::before) instead of real text: the browser's
        // find-in-page can't see generated content, so word search never lands on a link.
        if (!a.querySelector('img') && a.textContent.trim()) {
          if (a.querySelector('i')) a.classList.add('wr-i');
          if (a.querySelector('b')) a.classList.add('wr-b');
          a.dataset.label = a.textContent;
          a.setAttribute('aria-label', a.textContent);
          a.replaceChildren();
        }
      } else if (info.type === 'anchor') {
        a.dataset.anchor = info.id;
      } else if (info.type === 'dead') {
        a.dataset.wrDead = info.reason;
        a.classList.add('wr-dead');
        a.setAttribute('href', '#');
      }
    });
    $$('img, source, video, audio', doc).forEach((img) => {
      img.setAttribute('draggable', 'false');
      for (const attr of ['src', 'srcset', 'poster']) {
        const v = img.getAttribute(attr);
        if (v) img.setAttribute(attr, v.replace(/(^|\s|,)\/\//g, '$1https://'));
      }
    });
    return { title: titleDoc.body.textContent || art.title, nodes: [...doc.body.childNodes] };
  }

  // ---------- game ----------
  let game = null;

  function startGame(round, mode, extra = {}) {
    stopTimer();
    closeResults();
    closeSpectate();
    window.MiniGame.close();
    markPlayed(round.start, round.end);
    track('race_start', {
      mode, difficulty: round.difficulty, start: round.start, end: round.end,
      room_players: mode === 'duel' ? Object.values(net.players).filter((p) => p.inRound).length : 1,
      public_room: mode === 'duel' ? !!net.isPublic : false,
    });
    game = {
      start: round.start, end: round.end, difficulty: round.difficulty, limit: round.limit || limitFor(round.difficulty),
      mode, ...extra,
      clicks: 0, penalties: 0, tabLeaves: 0, path: [], stack: [], current: null,
      startTime: 0, elapsed: 0, finished: false, result: null, busy: false, away: false, suppressAway: false,
    };
    show('game');
    $('#hud-target').textContent = round.end;
    const hd = $('#hud-diff');
    hd.textContent = DIFF_LABEL[round.difficulty] || round.difficulty || '';
    hd.className = `hud-diff ${round.difficulty || ''}`;
    $('#article-title').textContent = '';
    $('#article').replaceChildren();
    $('#panel').classList.remove('open');
    $('#racers-section').classList.toggle('hidden', mode !== 'duel');
    $('#racers-strip').classList.toggle('hidden', mode !== 'duel');
    updateHud();
    renderPath();
    renderTargetCard(round.end);
    renderRacers();
    game.timer = setInterval(tick, 250);
    goTo(round.start, { count: false });
  }

  function stopTimer() {
    if (game && game.timer) clearInterval(game.timer);
  }

  function tick() {
    const g = game;
    if (!g || !g.startTime || g.finished) return;
    g.elapsed = Date.now() - g.startTime;
    if (g.elapsed >= g.limit) finishGame('timeout');
    else updateHud();
  }

  function updateHud() {
    const g = game;
    if (!g) return;
    $('#hud-clicks').textContent = g.clicks;
    const pen = $('#hud-pen');
    pen.textContent = `+${g.penalties}`;
    pen.classList.toggle('hidden', !g.penalties);
    const left = g.limit - (g.finished ? g.elapsed : g.startTime ? Date.now() - g.startTime : 0);
    $('#hud-time').textContent = fmtTime(Math.max(0, left) + 999);
    $('#stat-time').classList.toggle('urgent', !g.finished && g.startTime && left < 30e3);
    $('#btn-back').disabled = g.finished || g.stack.length < 2;
    $('#btn-giveup').disabled = g.finished;
  }

  function sendProgress() {
    const g = game;
    if (g && g.mode === 'duel') net.send({ type: 'progress', clicks: g.clicks, penalties: g.penalties, tabLeaves: g.tabLeaves, title: g.current });
  }

  async function goTo(title, { count = true, back = false, via = null } = {}) {
    const g = game;
    if (!g || g.finished || g.busy) return;
    g.busy = true;
    $('#loading').classList.remove('hidden');
    let art;
    try {
      art = await fetchArticle(title);
    } catch (e) {
      track('issue', { kind: 'article_load', title: String(title).slice(0, 120), message: String(e.message || '').slice(0, 160) });
      toast(e.message || "Couldn't load that article");
      if (!g.current && game === g) {
        stopTimer();
        game = null;
        show(net.code || net.isPublic ? 'lobby' : 'home');
      }
      return;
    } finally {
      g.busy = false;
      $('#loading').classList.add('hidden');
    }
    if (game !== g || g.finished) return;

    if (count) g.clicks++;
    g.current = art.title;
    g.path.push({ t: art.title, via: via || title, back });
    if (back) g.stack.pop();
    else g.stack.push(art.title);
    if (!g.startTime) g.startTime = Date.now();

    const built = buildArticle(art);
    $('#article-title').textContent = built.title;
    $('#article').replaceChildren(...built.nodes);
    window.scrollTo(0, 0);
    $('#panel').classList.remove('open');
    updateHud();
    renderPath();
    sendProgress();
    hoverIdx = -1;
    sendView(true);
    if (sameTitle(art.title, g.end)) finishGame('finished');
  }

  function onArticleClick(e) {
    const a = e.target.closest('a');
    if (!a || !$('#article').contains(a)) return;
    e.preventDefault();
    if (e.type === 'auxclick') return;
    if (a.dataset.wr) {
      goTo(a.dataset.wr, { via: a.dataset.wr });
    } else if (a.dataset.anchor) {
      let id = a.dataset.anchor;
      try { id = decodeURIComponent(id); } catch {}
      const el = $('#article').querySelector(`[id="${CSS.escape(id)}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (a.dataset.wrDead) {
      toast(a.dataset.wrDead);
    }
  }

  function goBack() {
    if (!game || game.finished) return;
    if (game.stack.length < 2) return toast('Nowhere to go back to');
    goTo(game.stack[game.stack.length - 2], { back: true });
  }

  function giveUp() {
    if (!game || game.finished) return;
    game.suppressAway = true;
    const ok = confirm('Give up this race?');
    setTimeout(() => { if (game) game.suppressAway = false; }, 300);
    if (ok) finishGame('gaveup');
  }

  // Anti-cheat: leaving the tab (to search, open Wikipedia elsewhere, etc.) is tracked.
  // First time is a warning, then each departure costs +1 click.
  function markAway() {
    const g = game;
    if (!g || g.finished || !g.startTime || g.suppressAway || g.away) return;
    g.away = true;
  }
  function markReturn() {
    const g = game;
    if (!g || !g.away) return;
    g.away = false;
    if (g.finished) return;
    g.tabLeaves++;
    if (g.tabLeaves === 1) toast('⚠️ No leaving the tab mid-race! Next time costs +1 click.', 4000);
    else {
      g.penalties++;
      toast('⚠️ You left the tab: +1 click penalty', 3000);
    }
    updateHud();
    sendProgress();
  }

  function finishGame(result) {
    const g = game;
    if (!g || g.finished) return;
    g.finished = true;
    g.result = result;
    g.elapsed = g.startTime ? Math.min(Date.now() - g.startTime, g.limit) : 0;
    stopTimer();
    updateHud();

    if (result === 'finished' && g.mode !== 'duel' && g.mode !== 'daily') {
      const key = `wr-best:${g.start}→${g.end}`;
      const prev = store.get(key);
      g.prevBest = prev;
      if (!prev || score(g) < prev.clicks || (score(g) === prev.clicks && g.elapsed < prev.time)) {
        g.newBest = true;
        store.set(key, { clicks: score(g), time: g.elapsed });
      }
    }
    if (g.mode === 'duel') {
      net.send({
        type: { finished: 'finish', gaveup: 'giveup', timeout: 'timeout' }[result],
        path: g.path, penalties: g.penalties, tabLeaves: g.tabLeaves,
      });
    }
    track('race_end', {
      mode: g.mode, difficulty: g.difficulty, result, clicks: g.clicks, penalties: g.penalties, score: score(g),
      tab_leaves: g.tabLeaves, time_ms: g.elapsed, limit_ms: g.limit, start: g.start, end: g.end,
      back_clicks: g.path.filter((x) => x.back).length,
    });
    if (result === 'timeout') toast("⏰ Time's up!", 3000);
    renderPath();
    renderRacers();
    if (g.mode === 'solo' || g.mode === 'challenge') {
      shortestRoute(g.start, g.end).then((r) => { if (!r) g.noRoute = true; if (game === g) renderResults(); });
    }
    if (g.mode === 'daily') {
      shortestRoute(g.start, g.end).then(() => { if (!$('#results').classList.contains('hidden')) showDailyResults(g.dailyKey); });
      const rec = saveDaily(g);
      track('daily_end', { n: g.dailyN, result, score: rec.score, time_ms: rec.time, beat_pct: Math.round(dailyBeat(dailyStats(g.dailyKey), rec) * 100) });
      showDailyResults(g.dailyKey);
      return;
    }
    showResults();
  }

  async function renderTargetCard(title) {
    const el = $('#target-card');
    el.innerHTML = `<h3>Target</h3><div class="tname">${esc(title)}</div>`;
    try {
      const info = await fetchInfo(title);
      if (!game || !sameTitle(game.end, title)) return;
      el.innerHTML = `<h3>Target</h3>
        ${info.thumb ? `<img src="${esc(info.thumb)}" alt="">` : ''}
        <div class="tname">${esc(info.title)}</div>
        ${info.description ? `<div class="tdesc">${esc(info.description)}</div>` : ''}
        ${info.extract ? `<p class="textract">${esc(info.extract)}</p>` : ''}`;
    } catch {}
  }

  function renderPath() {
    if (!game) return;
    $('#path').innerHTML = game.path
      .map((p) => `<li class="${p.back ? 'back' : ''}">${p.back ? '↩ ' : ''}${esc(p.t)}</li>`)
      .join('');
  }

  // ---------- results / route comparison ----------
  const seenLanes = new Set();
  let confettiRound = null;

  function closeResults() {
    $('#results').classList.add('hidden');
    $('#confetti').replaceChildren();
  }

  function showResults() {
    $('#results').classList.remove('hidden');
    $('#results .modal').scrollTop = 0;
    renderResults();
  }

  function avatar(p) {
    return `<span class="avatar" style="--c:${esc(p.color || COLORS[0])}">${esc((p.name || '?').charAt(0).toUpperCase())}</span>`;
  }

  function statusChip(p) {
    if (p.status === 'finished') {
      if (p.verify === 'pending') return '<span class="chip-s pending">⏳ verifying</span>';
      if (p.verify === 'failed') return `<span class="chip-s bad" title="${esc(p.flagReason)}">🚩 flagged</span>`;
      if (p.verify === 'ok') return '<span class="chip-s ok">✔ verified</span>';
      return '<span class="chip-s ok">✔ finished</span>';
    }
    if (p.status === 'timeout') return '<span class="chip-s bad">⏰ out of time</span>';
    if (p.status === 'gaveup') return '<span class="chip-s bad">🏳️ gave up</span>';
    if (p.status === 'left') return '<span class="chip-s bad">🔌 left</span>';
    if (p.status === 'playing') return '<span class="chip-s live">● racing</span>';
    return '';
  }

  function sharedTitles(lanes, round) {
    const counts = new Map();
    for (const l of lanes) {
      const seen = new Set((l.path || []).filter((s) => !s.back).map((s) => normTitle(s.t)));
      for (const t of seen) counts.set(t, (counts.get(t) || 0) + 1);
    }
    const shared = new Set();
    for (const [t, c] of counts) if (c > 1 && !sameTitle(t, round.start) && !sameTitle(t, round.end)) shared.add(t);
    return shared;
  }

  function laneHtml(p, key, shared, round, rank) {
    const animate = !seenLanes.has(key) && p.path && p.path.length;
    if (animate) seenLanes.add(key);
    const path = p.path || [];
    let route;
    if (path.length) {
      route = path.map((s, i) => {
        const cls = ['node'];
        if (i === 0) cls.push('start');
        if (sameTitle(s.t, round.end) && i === path.length - 1) cls.push('end');
        if (s.back) cls.push('back');
        if (shared.has(normTitle(s.t))) cls.push('shared');
        return `${i ? '<span class="edge"></span>' : ''}<span class="${cls.join(' ')}" style="--d:${i * 90}ms">${s.back ? '↩ ' : ''}${esc(s.t)}</span>`;
      }).join('');
    } else if (p.status === 'playing') {
      route = `<span class="muted">Route hidden until they finish${p.title ? ` · now on <b>${esc(p.title)}</b>` : ''}</span>`;
    } else {
      route = '<span class="muted">No route</span>';
    }
    const canSpec = canSpectate(p);
    return `<div class="lane ${animate ? 'animate' : ''}" style="--c:${esc(p.color || COLORS[0])}">
      <div class="lane-head">
        <span class="lane-rank">${rank}</span>${avatar(p)}
        <span class="lane-name">${esc(p.name)}${p.id === net.myId ? ' <span class="muted">(you)</span>' : ''}</span>
        ${statusChip(p)}
        <span class="lane-stats">
          ${p.status === 'finished' || p.status === 'playing' ? `<span>🖱 ${plural(p.clicks || 0, 'click')}</span>` : ''}
          ${p.penalties ? `<span class="pen-chip">+${p.penalties} penalty</span>` : ''}
          ${p.status === 'finished' ? `<span>⏱ ${fmtTime(p.time)}</span>` : ''}
          ${p.tabLeaves ? `<span class="muted" title="Times they left the tab">👀 ${p.tabLeaves}</span>` : ''}
          ${canSpec ? `<button class="btn tiny" data-spectate="${esc(p.id)}">👁 Spectate</button>` : ''}
        </span>
      </div>
      ${p.verify === 'failed' && p.flagReason ? `<div class="flag-reason">🚩 ${esc(p.flagReason)}</div>` : ''}
      <div class="route-line">${route}</div>
    </div>`;
  }

  function podiumHtml(list) {
    const top = list.filter(validFinish).slice(0, 3);
    if (!top.length) return '';
    const order = [top[1], top[0], top[2]];
    return `<div class="podium">${order.map((p, i) => {
      if (!p) return '<div class="step empty"></div>';
      const place = i === 1 ? 1 : i === 0 ? 2 : 3;
      return `<div class="step p${place}" style="--c:${esc(p.color)}">
        ${place === 1 ? '<div class="crown">👑</div>' : ''}${avatar(p)}
        <div class="pod-name">${esc(p.name)}</div>
        <div class="pod-score">${score(p)} <small>clicks</small></div>
        <div class="pod-block">${place}</div>
      </div>`;
    }).join('')}</div>`;
  }

  function burstConfetti() {
    const box = $('#confetti');
    box.replaceChildren();
    const colors = ['#3355ff', '#f76707', '#2f9e44', '#d6336c', '#f0b400', '#7048e8'];
    for (let i = 0; i < 70; i++) {
      const c = document.createElement('i');
      c.style.left = Math.random() * 100 + '%';
      c.style.background = colors[i % colors.length];
      c.style.animationDelay = Math.random() * 0.6 + 's';
      c.style.animationDuration = 1.6 + Math.random() * 1.4 + 's';
      c.style.transform = `rotate(${Math.random() * 360}deg)`;
      box.append(c);
    }
    setTimeout(() => box.replaceChildren(), 3600);
  }

  function renderResults() {
    const g = game;
    if (!g || g.mode === 'daily' || $('#results').classList.contains('hidden')) return;
    const body = $('#results-body');
    const actions = $('#results-actions');
    const round = { start: g.start, end: g.end };
    const headline = g.result === 'finished' ? '🎉 You made it!' : g.result === 'timeout' ? "⏰ Time's up!" : '🏳️ You gave up';
    let html = '';

    if (g.mode === 'duel') {
      const done = net.phase === 'results';
      const list = ranked();
      const winner = done && list[0] && validFinish(list[0]) ? list[0] : null;
      const shared = sharedTitles(list, round);
      if (done && confettiRound !== net.round.n) {
        confettiRound = net.round.n;
        if (winner) burstConfetti();
      }
      html += `<div class="res-head">
        <div class="res-kicker">${esc(DIFF_LABEL[g.difficulty] || '')} · ${esc(g.start)} → ${esc(g.end)}</div>
        <h2>${done ? (winner ? `🏆 ${esc(winner.name)} wins!` : 'Round over, nobody made it') : headline}</h2>
        ${done ? '' : `<p class="muted">Waiting for ${plural(list.filter((p) => p.status === 'playing').length, 'racer')}… ${list.some((p) => p.verify === 'pending') ? 'Checking routes…' : ''}</p>`}
      </div>`;
      if (done) html += podiumHtml(list);
      html += `<h3 class="sec">Routes ${shared.size ? '<span class="legend"><span class="node shared mini">shared</span> visited by more than one racer</span>' : ''}</h3>`;
      html += `<div class="lanes">${list.map((p, i) => laneHtml(p, `${net.round.n}:${p.id}:${p.status}`, shared, round,
        validFinish(p) ? (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1) : '·')).join('')}</div>`;
      const spectators = Object.entries(net.players).filter(([, p]) => !p.inRound);
      if (spectators.length) html += `<p class="muted small-print">Also here: ${spectators.map(([, p]) => esc(p.name)).join(', ')}</p>`;
      if (net.isPublic && done && net.nextAt) html += `<p class="center next-in" data-next-in>Next round in ${Math.ceil((net.nextAt - Date.now()) / 1000)}s</p>`;
    } else {
      const me = { id: 'solo', name: $('#name-input').value.trim() || 'You', color: COLORS[0], status: g.result === 'finished' ? 'finished' : g.result, clicks: g.clicks, penalties: g.penalties, time: g.elapsed, tabLeaves: g.tabLeaves, path: g.path };
      if (g.result === 'finished' && (g.newBest || !g.prevBest) && confettiRound !== g) { confettiRound = g; burstConfetti(); }
      html += `<div class="res-head">
        <div class="res-kicker">${esc(DIFF_LABEL[g.difficulty] || '')} · ${esc(g.start)} → ${esc(g.end)}</div>
        <h2>${headline}</h2></div>
        <div class="big-stats">
          <div><b>${g.result === 'finished' ? score(g) : '—'}</b><small>clicks${g.penalties ? ` (incl. +${g.penalties})` : ''}</small></div>
          <div><b>${fmtTime(g.elapsed)}</b><small>of ${fmtTime(g.limit)}</small></div>
          ${g.result === 'finished' ? `<div><b>${g.newBest ? '🏅 New' : g.prevBest.clicks}</b><small>${g.newBest ? 'personal best' : 'your best'}</small></div>` : ''}
        </div>`;
      if (g.mode === 'challenge' && g.challenge && g.challenge.clicks && g.result === 'finished') {
        const c = g.challenge;
        const verdict = score(g) < c.clicks ? `You beat ${esc(c.by)}! 🔥` : score(g) === c.clicks ? `Tied with ${esc(c.by)}.` : `${esc(c.by)} wins this one.`;
        html += `<p><b>${verdict}</b> <span class="muted">${esc(c.by)} took ${plural(c.clicks, 'click')}.</span></p>`;
      }
      html += `<h3 class="sec">Your route</h3><div class="lanes">${laneHtml(me, `solo:${g.startTime}`, new Set(), round, '')}</div>`;
      const best = store.get(`wr-route:${pairKey(g.start, g.end)}`);
      if (best) html += `<h3 class="sec">Shortest route we found (${best.length - 1} clicks)</h3>${routeHtml(best)}`;
      else if (!g.noRoute) html += '<p class="muted small-print">Looking up the shortest route…</p>';
    }
    body.innerHTML = html;

    actions.innerHTML = '';
    const add = (label, cls, fn) => {
      const b = document.createElement('button');
      b.className = 'btn ' + cls;
      b.textContent = label;
      b.onclick = fn;
      actions.append(b);
    };
    if (g.mode === 'duel') {
      if (net.isHost && !net.isPublic) add(net.phase === 'results' ? 'Next round' : 'End round → lobby', 'primary', hostBackToLobby);
      else if (!net.isPublic) actions.insertAdjacentHTML('beforeend', `<p class="muted center full">${net.phase === 'results' ? 'Waiting for the host to start the next round…' : 'Waiting for everyone to finish…'}</p>`);
      if (game.finished) add('🏎 Lane Rush', '', () => { if (miniGameAllowed()) window.MiniGame.open(); });
      if (net.isPublic) add('⏭ Next room', '', () => { quickMatch(); });
      add('Leave', 'ghost', () => { leaveRoomAndGoHome(); });
    } else {
      if (g.result === 'finished') add('Challenge a friend', 'primary', () => shareChallenge(g));
      if (['easy', 'medium', 'hard', 'random'].includes(g.difficulty)) add('Next race', '', () => startSolo(g.difficulty));
      add('Home', 'ghost', () => { closeResults(); game = null; show('home'); });
    }
  }

  function shareChallenge(g) {
    const params = new URLSearchParams({ s: g.start, e: g.end, c: String(score(g)), d: g.difficulty });
    const name = $('#name-input').value.trim();
    if (name) params.set('by', cleanName(name));
    const url = `${baseUrl()}?${params}`;
    track('share', { kind: 'challenge' });
    const text = `🏁 I got from ${g.start} to ${g.end} in ${plural(score(g), 'click')} on WikiRacer. Can you beat me?\n${url}`;
    if (navigator.share) navigator.share({ text }).catch(() => copyText(text));
    else copyText(text);
  }

  // ---------- solo ----------
  async function startSolo(diff, custom) {
    toast('Picking articles…', 1500);
    try {
      const pair = await pickPair(diff, custom);
      const round = { ...pair, difficulty: diff, limit: limitFor(diff) };
      if (pair.route) store.set(`wr-route:${pairKey(pair.start, pair.end)}`, pair.route);
      await runCountdown(round);
      startGame(round, 'solo');
    } catch (e) {
      toast(e.message);
    }
  }

  // ---------- shortest known route ----------
  // Looks up a real short route through the link graph (same search the fill-in racers use) and caches it,
  // so results can show "how it could have been done" and the daily's stats are anchored to reality.
  const routeCache = new Map();
  function shortestRoute(start, end) {
    const key = pairKey(start, end);
    const saved = store.get(`wr-route:${key}`);
    if (saved) return Promise.resolve(saved);
    if (routeCache.has(key)) return routeCache.get(key);
    const p = planRoute(start, end)
      .then((plan) => {
        const best = [...(plan.routes || [])].sort((a, b) => a.length - b.length)[0] || null;
        if (best) store.set(`wr-route:${key}`, best);
        return best;
      })
      .catch(() => null);
    routeCache.set(key, p);
    return p;
  }
  const routeHtml = (r) => `<div class="path-inline">${r.map(esc).join('<span class="arrow">→</span>')}</div>`;

  // ---------- daily challenge ----------
  // One hard pair per calendar day, the same for everyone. Players are ranked by clicks, then time.
  // There's no server, so the "everyone else" numbers come from a statistical model seeded by the
  // date: everyone sees the same spread for the same day, and it fills up as the day goes on.
  const DAILY_EPOCH = Date.UTC(2026, 9, 17); // Daily #1
  const dateKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const dailyNumber = (key) => {
    const [y, m, d] = key.split('-').map(Number);
    return Math.round((Date.UTC(y, m - 1, d) - DAILY_EPOCH) / 864e5) + 1;
  };
  function hashStr(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function seeded(seed) {
    let a = seed;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Standard normal CDF (Abramowitz–Stegun approximation).
  function phi(x) {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989423 * Math.exp(-x * x / 2);
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return x > 0 ? 1 - p : p;
  }
  const lnCdf = (x, mu, sigma) => (x <= 0 ? 0 : phi((Math.log(x) - mu) / sigma));

  function dailyPair(key) {
    const pool = [...(window.PAIRS.daily || []), ...window.PAIRS.hard];
    const n = dailyNumber(key);
    // After the hand-picked run, every day is generated from the Vital Articles snapshot with a
    // date-seeded RNG: a lesser-known start and a core target from a different subject.
    if (n > pool.length && POOL.familiar.length) {
      const rnd = seeded(hashStr(`daily-${key}`));
      const F = POOL.familiar;
      const [start, g1] = F[Math.floor(rnd() * F.length)];
      let end = F[Math.floor(rnd() * F.length)];
      for (let k = 0; k < 8 && (end[1] === g1 || end[0] === start); k++) end = F[Math.floor(rnd() * F.length)];
      return { start, end: end[0], n, key };
    }
    const i = (((n - 1) % pool.length) + pool.length) % pool.length;
    const cycle = Math.floor((n - 1) / pool.length);
    const rnd = seeded(hashStr(`cycle-${cycle}`));
    const order = pool.map((_, k) => k);
    for (let k = order.length - 1; k > 0; k--) {
      const j = Math.floor(rnd() * (k + 1));
      [order[k], order[j]] = [order[j], order[k]];
    }
    const [start, end] = pool[order[i]];
    return { start, end, n, key };
  }

  // Model of how everyone else did today. Calibrated to typical hard WikiRacer play: the shortest
  // route is 3–4 clicks, most finishers take 2–3 more than that (median ~6), a long tail wanders
  // past 12, and 14–26% run out of time or give up. Times scale with clicks (~25s per page + reading).
  function dailyStats(key) {
    const rnd = seeded(hashStr(`stats-${key}`));
    // The model's guess at the best route, never longer than a real route we've actually found.
    const d = dailyPair(key);
    const real = store.get(`wr-route:${pairKey(d.start, d.end)}`);
    const modelPar = rnd() < 0.55 ? 3 : 4;
    const par = real ? Math.min(modelPar, real.length - 1) : modelPar;
    const dnf = 0.14 + rnd() * 0.12;
    const mu = Math.log(3.0 + rnd() * 1.5); // extra clicks above par (+1), log-normal
    const sigma = 0.5 + rnd() * 0.15;
    const secPerClick = 20 + rnd() * 10;
    const now = new Date();
    const dayFrac = key === dateKey(now) ? (now.getHours() * 60 + now.getMinutes()) / 1440 : 1;
    const players = Math.round((5000 + rnd() * 9000) * (0.06 + 0.94 * Math.pow(dayFrac, 0.8))) + 37;
    const buckets = [];
    for (let k = 0; k <= 12; k++) {
      const lo = k === 0 ? 0 : lnCdf(k + 0.5, mu, sigma);
      const hi = k === 12 ? 1 : lnCdf(k + 1.5, mu, sigma);
      buckets.push({ clicks: par + k, share: (hi - lo) * (1 - dnf), plus: k === 12 });
    }
    const timeMedian = (c) => (secPerClick * c + 35) * 1000;
    const timeSigma = 0.45;
    let acc = 0;
    let medianClicks = par;
    for (const b of buckets) { acc += b.share / (1 - dnf); if (acc >= 0.5) { medianClicks = b.clicks; break; } }
    return { par, dnf, buckets, players, timeMedian, timeSigma, medianClicks };
  }

  // Share of today's players you beat (fewer clicks wins; same clicks → faster time wins).
  function dailyBeat(stats, rec) {
    if (rec.result !== 'finished') return 0;
    const steps = rec.score;
    if (steps < stats.par) return 1 - 0.0004;
    let beat = stats.dnf;
    for (const b of stats.buckets) {
      if (b.clicks > steps || (b.plus && steps < b.clicks)) beat += b.share;
      else if (b.clicks === steps || (b.plus && steps >= b.clicks)) {
        const slower = 1 - lnCdf(rec.time, Math.log(stats.timeMedian(b.clicks)), stats.timeSigma);
        beat += b.share * slower;
      }
    }
    return Math.min(0.9996, beat);
  }
  const topLabel = (beat) => {
    const top = Math.max(0.1, (1 - beat) * 100);
    return top < 10 ? `Top ${top.toFixed(1)}%` : `Top ${Math.round(top)}%`;
  };
  const dailyRecord = (key) => store.get(`wr-daily:${key}`);

  function nextDailyIn() {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const s = Math.max(0, Math.floor((next - now) / 1000));
    return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  function streakInfo() {
    const s = store.get('wr-daily-streak') || { last: null, count: 0, best: 0 };
    const today = dateKey();
    const y = new Date(); y.setDate(y.getDate() - 1);
    const alive = s.last === today || s.last === dateKey(y);
    return { count: alive ? s.count : 0, best: s.best || 0 };
  }

  function renderDailyCard() {
    const key = dateKey();
    const d = dailyPair(key);
    const rec = dailyRecord(key);
    const stats = dailyStats(key);
    const streak = streakInfo();
    const card = $('#daily-card');
    const meta = `<div class="blk-meta">${streak.count ? `${streak.count}-day streak · ` : ''}${stats.players.toLocaleString()} today</div>`;
    if (rec) {
      const beat = dailyBeat(stats, rec);
      card.innerHTML = `<h2 class="blk-title">Daily #${d.n}</h2>
        <p class="blk-sub">${rec.result === 'finished'
          ? `Done: <b>${plural(rec.score, 'click')}</b> · ${fmtTime(rec.time)} · <b class="hl">${topLabel(beat)}</b>`
          : `${rec.result === 'timeout' ? 'Ran out of time' : rec.abandoned ? 'Left mid-race' : 'Gave up'} today.`}</p>
        <button class="sq" id="daily-results">See results</button>
        <div class="blk-meta">Next in <b data-next-daily>${nextDailyIn()}</b></div>`;
      $('#daily-results').onclick = () => showDailyResults(key);
    } else {
      card.innerHTML = `<h2 class="blk-title">Daily #${d.n}</h2>
        <p class="blk-sub">Hard · <b>? ? ? → ? ? ?</b> · one try</p>
        <button class="sq" id="daily-play">Start</button>
        ${meta}`;
      $('#daily-play').onclick = startDaily;
    }
  }

  async function startDaily() {
    const key = dateKey();
    if (dailyRecord(key)) return showDailyResults(key);
    const d = dailyPair(key);
    const btn = $('#daily-play');
    if (btn) { btn.disabled = true; btn.textContent = 'Loading…'; }
    let pair;
    try {
      pair = await validatePair(d.start, d.end);
    } catch (e) {
      toast(e.message);
      if (btn) { btn.disabled = false; btn.textContent = 'Start'; }
      return;
    }
    // The attempt is locked in the moment the pair is revealed: refreshing or leaving counts as giving up.
    const placeholder = { n: d.n, start: pair.start, end: pair.end, result: 'gaveup', abandoned: true, clicks: 0, penalties: 0, score: 0, time: 0, path: [] };
    store.set(`wr-daily:${key}`, placeholder);
    bumpStreak(key);
    const round = { ...pair, difficulty: 'hard', limit: LIMITS.hard };
    shortestRoute(pair.start, pair.end).then(() => {
      if (!game && !$('#results').classList.contains('hidden') && dailyRecord(key)) showDailyResults(key);
    });
    await runCountdown(round, `📅 Daily #${d.n} · Hard · ${fmtTime(LIMITS.hard)} on the clock`);
    startGame(round, 'daily', { dailyKey: key, dailyN: d.n });
  }

  function bumpStreak(key) {
    const s = store.get('wr-daily-streak') || { last: null, count: 0, best: 0 };
    if (s.last === key) return;
    const y = new Date();
    y.setDate(y.getDate() - 1);
    s.count = s.last === dateKey(y) ? s.count + 1 : 1;
    s.last = key;
    s.best = Math.max(s.best || 0, s.count);
    store.set('wr-daily-streak', s);
  }

  function saveDaily(g) {
    const rec = {
      n: g.dailyN, start: g.start, end: g.end, result: g.result, clicks: g.clicks, penalties: g.penalties,
      score: score(g), time: g.elapsed, path: g.path,
    };
    store.set(`wr-daily:${g.dailyKey}`, rec);
    bumpStreak(g.dailyKey);
    return rec;
  }

  function histogramHtml(stats, rec) {
    const bars = stats.buckets.slice(0, 10).map((b) => ({ label: String(b.clicks), share: b.share, mine: rec.result === 'finished' && rec.score === b.clicks }));
    const tail = stats.buckets.slice(10).reduce((a, b) => a + b.share, 0);
    bars.push({ label: `${stats.buckets[10].clicks}+`, share: tail, mine: rec.result === 'finished' && rec.score >= stats.buckets[10].clicks });
    if (rec.result === 'finished' && rec.score < stats.par) bars.unshift({ label: String(rec.score), share: 0.0004, mine: true });
    bars.push({ label: 'DNF', share: stats.dnf, mine: rec.result !== 'finished', dnf: true });
    const max = Math.max(...bars.map((b) => b.share));
    return `<div class="histo" role="img" aria-label="Distribution of clicks today">
      ${bars.map((b, i) => `<div class="hbar ${b.mine ? 'mine' : ''} ${b.dnf ? 'dnf' : ''}" style="--h:${Math.max(2, (b.share / max) * 100)}%;--d:${i * 50}ms">
        <span class="hpct">${b.share < 0.01 ? '<1' : Math.round(b.share * 100)}%</span>
        <span class="hfill">${b.mine ? '<span class="you">YOU</span>' : ''}</span>
        <span class="hlabel">${esc(b.label)}</span></div>`).join('')}
    </div><div class="histo-axis muted">clicks</div>`;
  }

  function shareDaily(rec, beat) {
    const squares = rec.path.slice(1).map((s, i, arr) => (s.back ? '🟨' : i === arr.length - 1 && rec.result === 'finished' ? '🟩' : '🟦')).join('')
      + '🟥'.repeat(rec.penalties || 0) + (rec.result === 'finished' ? '' : '⬛');
    const line = rec.result === 'finished'
      ? `🖱 ${plural(rec.score, 'click')} · ⏱ ${fmtTime(rec.time)} · ${topLabel(beat)}`
      : rec.result === 'timeout' ? '⏰ Ran out of time' : '🏳️ Gave up';
    track('share', { kind: 'daily' });
    const text = `WikiRacer Daily #${rec.n} 🏁\n${rec.start} → ${rec.end}\n${line}\n${squares}\n${baseUrl()}`;
    if (navigator.share) navigator.share({ text }).catch(() => copyText(text));
    else copyText(text);
  }

  function showDailyResults(key) {
    const rec = dailyRecord(key);
    if (!rec) return;
    const stats = dailyStats(key);
    const beat = dailyBeat(stats, rec);
    const finished = rec.result === 'finished';
    const playersBeaten = Math.round(beat * stats.players);
    const sameClicks = finished ? stats.buckets.find((b) => b.clicks === rec.score) : null;
    let verdict;
    if (!finished) verdict = `You're one of the ${Math.round(stats.dnf * 100)}% who didn't make it today. The target was a tough one!`;
    else if (rec.score < stats.par) verdict = `🤯 Nobody else found a route this short today! The next best was ${stats.par} clicks.`;
    else if (rec.score === stats.par) verdict = `🏆 You matched today's best route! Only ${Math.round((sameClicks ? sameClicks.share : 0) * 100)}% of players found a ${stats.par}-click path.`;
    else verdict = `You beat <b>${Math.round(beat * 100)}%</b> of players (${playersBeaten.toLocaleString()} of ${stats.players.toLocaleString()})${sameClicks ? `. ${Math.round(sameClicks.share * 100)}% also took ${rec.score} clicks, and your time broke the tie` : ''}.`;

    $('#results-body').innerHTML = `<div class="res-head">
        <div class="res-kicker">Daily #${rec.n} · Hard · ${esc(rec.start)} → ${esc(rec.end)}</div>
        <h2>${finished ? '🎉 Daily complete!' : rec.result === 'timeout' ? "⏰ Time's up!" : rec.abandoned ? '🚪 You left mid-challenge' : '🏳️ You gave up'}</h2></div>
      <div class="big-stats">
        <div><b>${finished ? rec.score : '—'}</b><small>clicks${rec.penalties ? ` (incl. +${rec.penalties})` : ''}</small></div>
        <div><b>${fmtTime(rec.time)}</b><small>time</small></div>
        <div class="rank-tile"><b>${finished ? topLabel(beat) : 'DNF'}</b><small>today</small></div>
      </div>
      <p class="verdict">${verdict}</p>
      <h3 class="sec">How everyone did today</h3>
      ${histogramHtml(stats, rec)}
      <div class="daily-facts">
        <span>👥 <b>${stats.players.toLocaleString()}</b> players</span>
        <span>⚡ Best today: <b>${finished ? Math.min(stats.par, rec.score) : stats.par}</b> clicks</span>
        <span>📊 Median: <b>${stats.medianClicks}</b> clicks · <b>${fmtTime(stats.timeMedian(stats.medianClicks))}</b></span>
        <span>🚫 Didn't finish: <b>${Math.round(stats.dnf * 100)}%</b></span>
      </div>
      ${(() => { const r = store.get(`wr-route:${pairKey(rec.start, rec.end)}`); return r ? `<h3 class="sec">Shortest route we found (${r.length - 1} clicks)</h3>${routeHtml(r)}` : ''; })()}
      <h3 class="sec">Your route</h3>
      <div class="lanes">${laneHtml({ id: 'daily', name: $('#name-input').value.trim() || 'You', color: COLORS[0], status: finished ? 'finished' : rec.result, clicks: rec.clicks, penalties: rec.penalties, time: rec.time, path: rec.path }, `daily:${key}`, new Set(), { start: rec.start, end: rec.end }, '')}</div>
      <p class="center muted next-daily">Next daily in <b data-next-daily>${nextDailyIn()}</b></p>`;
    const actions = $('#results-actions');
    actions.innerHTML = '';
    const add = (label, cls, fn) => {
      const b = document.createElement('button');
      b.className = 'btn ' + cls;
      b.textContent = label;
      b.onclick = fn;
      actions.append(b);
    };
    add('📤 Share result', 'primary', () => shareDaily(rec, beat));
    add('Home', 'ghost', () => { closeResults(); game = null; renderDailyCard(); show('home'); });
    $('#results').classList.remove('hidden');
    $('#results .modal').scrollTop = 0;
    if (finished && beat >= 0.75) burstConfetti();
  }

  // ---------- spectating ----------
  const spec = { id: null, title: null };

  function myStatus() {
    const me = net.players[net.myId];
    if (game && !game.finished && game.mode === 'duel') return 'playing';
    return me ? me.status : 'lobby';
  }

  function canSpectate(p) {
    return p && p.status === 'playing' && p.id !== net.myId && !!p.title && myStatus() !== 'playing';
  }

  function openSpectate(id) {
    const p = net.players[id];
    if (!canSpectate({ ...p, id })) return toast('You can spectate once you are out of the race');
    spec.id = id;
    spec.title = null;
    spec.view = null;
    $('#spec-hover').textContent = '';
    $('#spec-rail-dot').style.top = '0%';
    $('#spectate').classList.remove('hidden');
    net.send({ type: 'spectate', id });
    track('spectate_open');
    renderSpectate();
  }

  function closeSpectate() {
    spec.leaving = false;
    if (spec.id) net.send({ type: 'spectate', id: null });
    spec.id = null;
    spec.title = null;
    spec.view = null;
    $('#spectate').classList.add('hidden');
  }

  async function loadSpecArticle(title) {
    spec.title = title;
    try {
      const art = await fetchArticle(title);
      if (!sameTitle(spec.title, title)) return;
      const built = buildArticle(art);
      $('#spec-title').textContent = built.title;
      $('#spec-article').replaceChildren(...built.nodes);
      $('#spectate .spec-body').scrollTop = 0;
      applyView(false);
    } catch {}
  }

  // A racer's position, sent ~5x/second while someone is watching them: which top-level block of the
  // article is at the top of their screen (+ how far into it), overall scroll %, and the link
  // they're hovering. Block-based so it lines up even when the two screens are different sizes.
  function onView(d) {
    if (!spec.id || d.id !== spec.id) return;
    spec.view = d;
    if (d.t && !sameTitle(d.t, spec.title)) { loadSpecArticle(d.t); return; }
    applyView(true);
  }

  function applyView(smooth) {
    const v = spec.view;
    if (!v || !sameTitle(v.t, spec.title)) return;
    const box = $('#spectate .spec-body');
    const root = $('#spec-article .mw-parser-output') || $('#spec-article');
    const block = root.children[v.b];
    if (block) {
      const top = block.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop + v.f * block.offsetHeight;
      const far = Math.abs(top - box.scrollTop) > box.clientHeight;
      box.scrollTo({ top: Math.max(0, top - 8), behavior: smooth && !far ? 'smooth' : 'auto' });
    }
    $('#spec-rail-dot').style.top = `${Math.round(v.p * 100)}%`;
    $$('#spec-article .their-hover').forEach((a) => a.classList.remove('their-hover'));
    const links = $('#spec-article').querySelectorAll('a');
    const a = v.h >= 0 ? links[v.h] : null;
    if (a) a.classList.add('their-hover');
    $('#spec-hover').innerHTML = a ? `🖱 Hovering <b>${esc(a.dataset.label || a.textContent)}</b>` : '';
  }

  // --- racer side: send our view while someone watches ---
  let viewTimer = null;
  let lastView = '';
  let hoverIdx = -1;
  let lastWatchers = 0;

  function computeView() {
    const root = $('#article .mw-parser-output') || $('#article');
    const blocks = root.children;
    const top = $('.hud').getBoundingClientRect().bottom;
    // Skip floated boxes (infoboxes, images): they span many paragraphs and would anchor badly.
    const inFlow = (el) => getComputedStyle(el).float === 'none' && el.offsetHeight > 0;
    let i = 0;
    while (i < blocks.length - 1 && (!inFlow(blocks[i]) || blocks[i].getBoundingClientRect().bottom <= top)) i++;
    const r = blocks[i] ? blocks[i].getBoundingClientRect() : null;
    const f = r && r.height ? Math.max(0, Math.min(1, (top - r.top) / r.height)) : 0;
    const doc = document.documentElement;
    const pct = doc.scrollHeight > innerHeight ? scrollY / (doc.scrollHeight - innerHeight) : 0;
    return { t: game.current, b: i, f: Math.round(f * 1000) / 1000, p: Math.round(Math.min(1, pct) * 1000) / 1000, h: hoverIdx };
  }

  function sendView(force) {
    const g = game;
    if (!g || g.mode !== 'duel' || g.finished || !g.current) return;
    const me = net.players[net.myId];
    if (!me || !me.watchers) return;
    if (force) lastView = '';
    if (viewTimer) return;
    viewTimer = setTimeout(() => {
      viewTimer = null;
      if (!game || game.finished) return;
      const v = computeView();
      const key = JSON.stringify(v);
      if (key === lastView) return;
      lastView = key;
      net.send({ type: 'view', ...v });
    }, 200);
  }

  async function renderSpectate() {
    if (!spec.id) return;
    const p = net.players[spec.id];
    if (!p) { closeSpectate(); return; }
    // Nothing left to watch: the round is over, or they've crossed the line. Back to results.
    if (net.phase !== 'playing') { closeSpectate(); return; }
    if (p.status !== 'playing' && !spec.leaving) {
      spec.leaving = true;
      const id = spec.id;
      setTimeout(() => { if (spec.id === id) closeSpectate(); }, 2200);
    }
    const who = $('#spec-who');
    const status = p.status === 'playing' ? `${plural(p.clicks, 'click')}${p.penalties ? ` +${p.penalties}` : ''}` : p.status === 'finished' ? `finished in ${plural(score(p), 'click')} 🎉` : p.status;
    who.innerHTML = `${avatar(p)}<div><b>${esc(p.name)}</b><div class="muted">${esc(status)} · target <b>${esc(net.round ? net.round.end : '')}</b></div></div>`;
    $('#spec-path').innerHTML = p.path && p.path.length
      ? p.path.map((s, i) => `${i ? '<span class="edge"></span>' : ''}<span class="node ${s.back ? 'back' : ''}">${esc(s.t)}</span>`).join('')
      : `<span class="muted">Live: now on <b>${esc(p.title)}</b></span>`;
    if (p.title && !spec.title) loadSpecArticle(p.title);
  }

  // ---------- multiplayer networking (PeerJS; the host's browser is the authority) ----------
  const freshNet = () => ({
    peer: null, isHost: false, isPublic: false, matching: false, slot: null, code: null, myId: null,
    conns: new Map(), hostConn: null, players: {}, phase: 'lobby', round: null, roundNum: 0, diff: 'easy',
    joined: false, roundStartedAt: 0, autoStartAt: 0, nextAt: 0, timers: {},
    roomId: null, migrating: false, watchers: new Map(), myName: '', fail: null,
    bots: new Map(), busyRooms: 0, secondBotRolled: false,
    send() {},
  });
  let net = freshNet();
  let matchToken = 0;

  const newPlayer = (name, color) => ({
    name, color, status: 'lobby', clicks: 0, penalties: 0, tabLeaves: 0, title: '', time: 0, path: [],
    wins: 0, connected: true, inRound: false, verify: null, flagReason: '', ready: false, vote: null,
  });
  const activeCount = () => Object.values(net.players).filter((p) => p.connected).length;
  const nextColor = () => {
    const used = new Set(Object.values(net.players).map((p) => p.color));
    return COLORS.find((c) => !used.has(c)) || COLORS[Object.keys(net.players).length % COLORS.length];
  };
  const makeCode = () => {
    const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const buf = new Uint32Array(5);
    crypto.getRandomValues(buf);
    const code = [...buf].map((n) => a[n % a.length]).join('');
    return pubSlotFromCode(code) != null ? makeCode() : code;
  };
  const inviteLink = () => `${baseUrl()}?room=${net.code}`;
  const validFinish = (p) => p.status === 'finished' && p.verify !== 'failed';

  function getName() {
    const input = $('#name-input');
    const name = input.value.trim();
    if (!name) {
      input.focus();
      toast('Enter your name first');
      return null;
    }
    store.set('wr-name', name);
    return cleanName(name);
  }

  function ranked() {
    const group = (p) => (p.status === 'finished' ? (p.verify === 'failed' ? 2 : 0) : p.status === 'playing' ? 1 : p.status === 'left' ? 4 : 3);
    return Object.entries(net.players)
      .map(([id, p]) => ({ id, ...p }))
      .filter((p) => p.inRound)
      .sort((a, b) => group(a) - group(b) ||
        (a.status === 'finished' ? score(a) - score(b) || a.time - b.time : b.clicks - a.clicks));
  }

  function clearTimers() {
    for (const t of Object.values(net.timers)) clearTimeout(t);
    net.timers = {};
  }

  // --- host ---
  function hostRoom({ name, isPublic = false, slot = null, code = null }) {
    return new Promise((resolve, reject) => {
      net = freshNet();
      Object.assign(net, { isHost: true, isPublic, slot, code, myId: 'host' });
      net.players.host = newPlayer(name, COLORS[0]);
      net.send = (msg) => hostHandle('host', msg);
      const me = net;
      net.roomId = isPublic ? publicPeerId(slot) : PEER_PREFIX + code;
      const peer = new Peer(net.roomId, peerOpts());
      net.peer = peer;
      peer.on('open', () => {
        if (net !== me) return;
        resolve();
        renderLobby();
      });
      peer.on('error', (err) => { if (net === me && !peer.open) reject(err); });
      wireHostPeer(peer, me);
    });
  }

  function wireHostPeer(peer, me, viaPublic = false) {
    peer.on('connection', (conn) => { conn.viaPublic = viaPublic; hostAccept(conn, me); });
    peer.on('disconnected', () => { if (net === me && !peer.destroyed) peer.reconnect(); });
    peer.on('error', (err) => {
      if (net === me && peer.open && err.type !== 'peer-unavailable') toast('Connection problem: ' + err.type);
    });
  }

  async function createRoom() {
    const name = getName();
    if (!name || !peerReady()) return;
    matchToken++;
    leaveRoom();
    show('lobby');
    setLobbyStatus('Creating room…');
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await hostRoom({ name, code: makeCode() });
        track('room_created');
        setLobbyStatus('Send the invite link to your friends (up to 8 players), then start the race.');
        renderLobby();
        return;
      } catch (e) {
        leaveRoom();
        if (!e || e.type !== 'unavailable-id') { toast("Couldn't create a room: " + (e && e.type || 'error')); show('home'); return; }
      }
    }
    toast("Couldn't create a room, try again");
    show('home');
  }

  function hostAccept(conn, me) {
    const rate = { hits: [], strikes: 0 };
    conn.on('open', () => {
      if (net !== me) { conn.close(); return; }
      net.conns.set(conn.peer, conn);
      // Connections that never say hello (probes, idle sockets) get cleaned up.
      setTimeout(() => { if (net === me && !net.players[conn.peer]) conn.close(); }, 20000);
    });
    conn.on('data', (d) => {
      if (net !== me || !net.conns.has(conn.peer)) return;
      const now = Date.now();
      rate.hits = rate.hits.filter((t) => now - t < 1000);
      if (rate.hits.length >= 15) {
        if (++rate.strikes > 60) conn.close();
        return;
      }
      rate.hits.push(now);
      let size = 0;
      try { size = JSON.stringify(d).length; } catch { return; }
      if (size > 40000) return;
      hostHandle(conn.peer, d, conn);
    });
    conn.on('close', () => {
      if (net !== me) return;
      net.conns.delete(conn.peer);
      for (const set of net.watchers.values()) set.delete(conn.peer);
      net.watchers.delete(conn.peer);
      const p = net.players[conn.peer];
      if (!p) return;
      if (net.phase === 'lobby' || !p.inRound) delete net.players[conn.peer];
      else {
        p.connected = false;
        if (p.status === 'playing') p.status = 'left';
        checkRoundOver();
        maybeHurryBots();
      }
      if (spec.id === conn.peer) closeSpectate();
      scheduleAutoStart();
      botPolicy();
      broadcast();
    });
  }

  function cleanPath(v) {
    if (!Array.isArray(v)) return [];
    return v.slice(0, 250)
      .map((s) => ({ t: normTitle(str(s && s.t, 300)), via: normTitle(str(s && s.via, 300)), back: !!(s && s.back) }))
      .filter((s) => s.t);
  }

  function hostHandle(id, msg, conn) {
    if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;
    const p = net.players[id];
    switch (msg.type) {
      case 'probe':
        if (conn && conn.open) conn.send({ type: 'lobbyinfo', count: activeCount(), phase: net.phase, accepting: net.isPublic && activeCount() < MAX_PLAYERS });
        return;
      case 'hello': {
        if (!p && conn && conn.viaPublic && !net.isPublic) {
          if (conn.open) conn.send({ type: 'error', message: 'That room just went private' });
          setTimeout(() => conn.close(), 400);
          return;
        }
        if (p) {
          // Someone we already know: a rejoin after a host handover.
          p.name = cleanName(msg.name);
          p.connected = true;
          p.awaiting = false;
          applySnapshot(id, p, msg.snapshot);
          checkRoundOver();
          break;
        }
        if (activeCount() >= MAX_PLAYERS && net.bots.size && net.phase === 'lobby') removeBot([...net.bots.keys()].pop());
        if (activeCount() >= MAX_PLAYERS) {
          if (conn && conn.open) conn.send({ type: 'error', message: `That room is full (max ${MAX_PLAYERS} players)` });
          setTimeout(() => conn && conn.close(), 400);
          return;
        }
        net.players[id] = newPlayer(cleanName(msg.name), nextColor());
        toast(`${net.players[id].name} joined`);
        scheduleAutoStart(true);
        botPolicy();
        break;
      }
      case 'spectate': {
        for (const set of net.watchers.values()) set.delete(id);
        const target = str(msg.id, 200);
        if (target && net.players[target] && target !== id && (!p || p.status !== 'playing')) {
          if (!net.watchers.has(target)) net.watchers.set(target, new Set());
          net.watchers.get(target).add(id);
        }
        break;
      }
      case 'view': {
        // Relay a racer's live position to whoever is spectating them (never to other racers).
        if (!p || p.status !== 'playing') return;
        const set = net.watchers.get(id);
        if (!set || !set.size) return;
        const frac = (v) => Math.max(0, Math.min(1, Number(v) || 0));
        relayView(id, { type: 'view', id, t: normTitle(str(msg.t, 300)), b: int(msg.b, 0, 1e5), f: frac(msg.f), p: frac(msg.p), h: int(msg.h, -1, 1e5) });
        return;
      }
      case 'ready':
        if (!p || net.phase !== 'lobby' || !net.isPublic) return;
        p.ready = !!msg.ready;
        if (p.ready && !isBot(id)) botsFollowReady();
        scheduleAutoStart();
        break;
      case 'vote':
        if (!p || net.phase !== 'lobby' || !net.isPublic) return;
        p.vote = ['easy', 'medium', 'hard'].includes(msg.vote) ? msg.vote : null;
        break;
      case 'progress':
        if (p && p.status === 'playing') {
          p.clicks = int(msg.clicks, 0, 999);
          p.penalties = int(msg.penalties, 0, 999);
          p.tabLeaves = int(msg.tabLeaves, 0, 9999);
          p.title = normTitle(str(msg.title, 300));
        }
        break;
      case 'finish':
      case 'giveup':
      case 'timeout': {
        if (!p || p.status !== 'playing' || !net.round) return;
        const path = cleanPath(msg.path);
        // Time and click count are computed by the host, not trusted from the client.
        p.time = Math.max(0, Date.now() - net.roundStartedAt);
        p.path = path;
        p.clicks = Math.max(0, path.length - 1);
        p.penalties = int(msg.penalties, 0, 999);
        p.tabLeaves = int(msg.tabLeaves, 0, 9999);
        p.title = path.length ? path[path.length - 1].t : p.title;
        let type = msg.type;
        if (type === 'finish' && p.time > net.round.limit + GRACE_MS) type = 'timeout';
        if (type === 'finish') {
          p.status = 'finished';
          p.time = Math.min(p.time, net.round.limit);
          p.verify = 'pending';
          verifyPlayer(id);
        } else {
          p.status = type === 'giveup' ? 'gaveup' : 'timeout';
        }
        checkRoundOver();
        maybeHurryBots();
        break;
      }
      default:
        return;
    }
    broadcast();
  }

  async function verifyPlayer(id) {
    const me = net;
    const round = net.round;
    const p = net.players[id];
    let reason = null;
    try {
      reason = await verifyPath(round, p.path);
    } catch {
      reason = null; // Wikipedia unreachable: give the benefit of the doubt.
    }
    if (net !== me || net.round !== round || !net.players[id] || net.players[id].status !== 'finished') return;
    net.players[id].verify = reason ? 'failed' : 'ok';
    net.players[id].flagReason = reason || '';
    checkRoundOver();
    broadcast();
  }

  function checkRoundOver() {
    if (net.phase !== 'playing') return;
    const racers = Object.values(net.players).filter((p) => p.inRound);
    if (racers.some((p) => p.status === 'playing' || p.verify === 'pending')) return;
    net.phase = 'results';
    clearTimeout(net.timers.deadline);
    const top = ranked()[0];
    if (top && validFinish(top)) net.players[top.id].wins++;
    if (net.isPublic) {
      net.nextAt = Date.now() + CONFIG.lobby.resultsMs;
      net.timers.next = setTimeout(hostBackToLobby, CONFIG.lobby.resultsMs);
    }
  }

  // Each player gets their own view of the state: while you're racing you can't see where
  // anyone else is or which route they took.
  function stateFor(viewerId) {
    const viewer = net.players[viewerId];
    const racing = viewer && viewer.status === 'playing';
    const players = {};
    for (const [id, p] of Object.entries(net.players)) {
      const watchers = net.watchers.has(id) ? net.watchers.get(id).size : 0;
      players[id] = racing && id !== viewerId ? { ...p, title: '', path: [], watchers } : { ...p, watchers };
    }
    return {
      type: 'state', players, phase: net.phase, round: net.round, isPublic: net.isPublic,
      slot: net.slot, publicFromPrivate: !!net.publicFromPrivate,
      roundElapsed: net.phase !== 'lobby' && net.roundStartedAt ? Date.now() - net.roundStartedAt : 0,
      autoStartIn: net.autoStartAt ? Math.max(0, net.autoStartAt - Date.now()) : 0,
      nextIn: net.nextAt && net.phase === 'results' ? Math.max(0, net.nextAt - Date.now()) : 0,
    };
  }

  function broadcast() {
    for (const [id, conn] of net.conns) {
      if (conn.open && net.players[id]) conn.send(stateFor(id));
    }
    // The host's own copy carries watcher counts too.
    for (const [id, p] of Object.entries(net.players)) p.watchers = net.watchers.has(id) ? net.watchers.get(id).size : 0;
    renderNet();
  }

  // Public rooms start when most of the room is ready (short countdown), or after a longer fallback so
  // one idle player can't hold everyone up. Fill-ins only ready up after a real person has.
  // Whenever someone joins, the clock never has less than minAfterJoinMs left.
  const readyCount = () => Object.values(net.players).filter((p) => p.connected && p.ready).length;
  function scheduleAutoStart(joined = false) {
    if (!net.isHost || !net.isPublic) return;
    clearTimeout(net.timers.auto);
    const total = activeCount();
    if (net.phase !== 'lobby' || total < 2) {
      net.autoStartAt = 0;
      net.fallbackAt = 0;
      return;
    }
    const cfg = CONFIG.lobby;
    if (!net.fallbackAt) net.fallbackAt = Date.now() + (humanCount() >= 2 ? cfg.groupWaitMs : cfg.soloWaitMs);
    if (humanCount() >= 2) net.fallbackAt = Math.min(net.fallbackAt, Date.now() + cfg.groupWaitMs);
    const majority = readyCount() * 2 >= total; // half the room ready is enough
    let at = net.fallbackAt;
    if (total >= MAX_PLAYERS) at = Math.min(at, Date.now() + cfg.readyGoMs * 2);
    if (majority) at = Math.min(at, net.readyGo && net.autoStartAt ? net.autoStartAt : Date.now() + cfg.readyGoMs);
    if (joined) at = Math.max(at, Date.now() + cfg.minAfterJoinMs);
    net.readyGo = majority;
    net.autoStartAt = at;
    net.timers.auto = setTimeout(() => {
      net.autoStartAt = 0;
      if (net.phase === 'lobby' && activeCount() >= 2) hostStartRace();
      else broadcast();
    }, net.autoStartAt - Date.now());
  }

  async function hostStartRace() {
    if (!net.isHost || net.starting) return;
    net.starting = true;
    const btn = $('#start-race');
    btn.disabled = true;
    btn.textContent = 'Picking articles…';
    try {
      if (net.isPublic) net.diff = tallyVotes();
      const pair = await pickPair(net.diff, [$('#room-start').value, $('#room-end').value]);
      net.roundNum++;
      const round = { ...pair, difficulty: net.diff, n: net.roundNum, limit: limitFor(net.diff) };
      for (const [id, p] of Object.entries(net.players)) {
        if (!p.connected) { delete net.players[id]; continue; }
        Object.assign(p, { status: 'playing', clicks: 0, penalties: 0, tabLeaves: 0, title: pair.start, time: 0, path: [], inRound: true, verify: null, flagReason: '' });
      }
      net.phase = 'playing';
      net.round = round;
      net.watchers = new Map();
      track('round_start', {
        public: !!net.isPublic, difficulty: net.diff, humans: humanCount(),
        bots: [...net.bots.keys()].filter((id) => net.players[id]).length,
      });
      net.autoStartAt = 0;
      net.nextAt = 0;
      net.roundStartedAt = Date.now() + COUNTDOWN_MS;
      clearTimeout(net.timers.deadline);
      net.timers.deadline = setTimeout(() => {
        if (net.phase !== 'playing' || net.round !== round) return;
        for (const p of Object.values(net.players)) {
          if (p.inRound && p.status === 'playing') { p.status = 'timeout'; p.time = round.limit; }
        }
        checkRoundOver();
        broadcast();
      }, COUNTDOWN_MS + round.limit + GRACE_MS);
      for (const [id, conn] of net.conns) if (conn.open && net.players[id]) conn.send({ type: 'start', round });
      broadcast();
      beginRound(round);
      startBots(round);
    } catch (e) {
      toast(e.message);
      if (net.isPublic) scheduleAutoStart();
    } finally {
      net.starting = false;
      btn.disabled = false;
      btn.textContent = 'Start race';
    }
  }

  function hostBackToLobby() {
    if (!net.isHost) return;
    clearTimeout(net.timers.next);
    clearTimeout(net.timers.deadline);
    if (net.phase === 'playing') {
      for (const p of Object.values(net.players)) if (p.status === 'playing') p.status = 'gaveup';
      for (const p of Object.values(net.players)) if (p.verify === 'pending') p.verify = null;
      checkRoundOver();
    }
    net.phase = 'lobby';
    net.nextAt = 0;
    for (const [id, p] of Object.entries(net.players)) {
      if (!p.connected) delete net.players[id];
      else Object.assign(p, { status: 'lobby', inRound: false, ready: false, vote: null });
    }
    net.fallbackAt = 0;
    net.readyGo = false;
    for (const b of net.bots.values()) { clearTimeout(b.readyTimer); b.readyTimer = null; }
    if (net.isPublic) {
      botsAfterRound();
      for (const id of net.bots.keys()) botMaybeVote(id);
    }
    goToLobbyScreen();
    scheduleAutoStart();
    botPolicy();
    broadcast();
  }

  function kick(id) {
    if (!net.isHost || id === 'host') return;
    const conn = net.conns.get(id);
    if (conn && conn.open) conn.send({ type: 'kicked' });
    setTimeout(() => conn && conn.close(), 300);
    delete net.players[id];
    broadcast();
  }

  // ---------- fill-in racers for quick match ----------
  // Public rooms only (never private rooms or the daily). The host's browser runs them. They take
  // real routes found through the Wikipedia link graph, play at a range of skill levels, and always
  // finish (or give up) before 75% of the time limit. No more than CONFIG.bots.maxPerRoom per room, and
  // they back off as real players arrive, so they fade out naturally as the site gets busier.
  // Clients can't tell them apart: ids look like normal peer ids and the bot flag never leaves the host.
  const BOT_TIERS = [
    { w: 0.28, detours: [1, 3], secPerClick: [20, 36], warmup: [8, 16], giveUp: 0.16, pen: 0.12 }, // new to it
    { w: 0.38, detours: [0, 2], secPerClick: [14, 25], warmup: [6, 13], giveUp: 0.08, pen: 0.06 }, // casual
    { w: 0.25, detours: [0, 1], secPerClick: [9, 16], warmup: [4, 9], giveUp: 0.03, pen: 0.02 },   // good
    { w: 0.09, detours: [0, 0], secPerClick: [6, 11], warmup: [3, 7], giveUp: 0.01, pen: 0 },      // sharp
  ];
  const DIFF_MUL = { easy: 0.6, medium: 1, hard: 1.45, random: 1.6, custom: 1 };
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const pickWeighted = (list) => {
    let r = Math.random() * list.reduce((s, x) => s + x.w, 0);
    for (const x of list) { r -= x.w; if (r <= 0) return x; }
    return list[list.length - 1];
  };
  const isBot = (id) => net.bots && net.bots.has(id);
  const humanCount = () => Object.entries(net.players).filter(([id, p]) => p.connected && !isBot(id)).length;

  // Compare names by their letters only, so "liam" and "liam07" never end up in the same room.
  const nameBase = (n) => String(n).toLowerCase().replace(/[^a-z]/g, '');
  function botName() {
    const taken = new Set(Object.values(net.players).map((p) => nameBase(p.name)));
    const pool = (window.BOT_NAMES || []).filter((n) => !taken.has(nameBase(n)) && !recentBotNames.includes(n));
    const name = pool.length ? pool[Math.floor(Math.random() * pool.length)] : `racer${randInt(10, 99)}`;
    recentBotNames.push(name);
    if (recentBotNames.length > 40) recentBotNames.shift();
    return name;
  }
  const recentBotNames = [];

  function botsFollowReady() {
    for (const [id, b] of net.bots) {
      const p = net.players[id];
      if (!p || p.ready || b.readyTimer) continue;
      b.readyTimer = setTimeout(() => {
        b.readyTimer = null;
        if (net.phase !== 'lobby' || !net.players[id]) return;
        net.players[id].ready = true;
        scheduleAutoStart();
        broadcast();
      }, rand(900, 3800));
    }
  }

  // Fill-ins vote about half the time, usually siding with what real people picked.
  function botMaybeVote(id) {
    if (Math.random() > 0.5) return;
    setTimeout(() => {
      const p = net.players[id];
      if (!p || net.phase !== 'lobby' || p.vote) return;
      const human = Object.entries(net.players).find(([pid, x]) => !isBot(pid) && x.vote);
      p.vote = human && Math.random() < 0.65 ? human[1].vote : pickWeighted([{ v: 'easy', w: 0.4 }, { v: 'medium', w: 0.47 }, { v: 'hard', w: 0.13 }]).v;
      broadcast();
    }, rand(2500, 9000));
  }

  function tallyVotes() {
    const counts = { easy: 0, medium: 0, hard: 0 };
    for (const p of Object.values(net.players)) if (p.connected && p.vote) counts[p.vote]++;
    const top = Math.max(...Object.values(counts));
    // Public races lean easy/medium: no votes or a tie is a weighted pick, hard only now and then.
    const W = { easy: 0.45, medium: 0.45, hard: 0.1 };
    const pool = (top ? Object.keys(counts).filter((k) => counts[k] === top) : Object.keys(counts)).map((v) => ({ v, w: W[v] }));
    return pickWeighted(pool).v;
  }

  function addBot() {
    if (!net.isHost || !net.isPublic || net.phase !== 'lobby' || activeCount() >= MAX_PLAYERS) return;
    const id = crypto.randomUUID();
    net.players[id] = newPlayer(botName(), nextColor());
    net.bots.set(id, { tier: pickWeighted(BOT_TIERS), timers: [], view: { b: 0, p: 0 } });
    toast(`${net.players[id].name} joined`);
    botMaybeVote(id);
    if (Object.entries(net.players).some(([pid, x]) => !isBot(pid) && x.ready)) botsFollowReady();
    scheduleAutoStart(true);
    broadcast();
  }

  function clearBotTimers(id) {
    const b = net.bots.get(id);
    if (b) { b.timers.forEach(clearTimeout); b.timers = []; }
  }

  function removeBot(id) {
    if (!isBot(id)) return;
    clearBotTimers(id);
    net.bots.delete(id);
    for (const set of net.watchers.values()) set.delete(id);
    const p = net.players[id];
    if (p) {
      if (net.phase === 'lobby' || !p.inRound) delete net.players[id];
      else { p.connected = false; if (p.status === 'playing') p.status = 'left'; }
    }
    scheduleAutoStart();
    broadcast();
  }

  // How many fill-ins this room should have right now.
  function botTarget() {
    const cfg = CONFIG.bots;
    if (!cfg.enabled || !net.isHost || !net.isPublic) return 0;
    const humans = humanCount();
    if (humans === 0 || humans > cfg.maxHumans) return 0;
    let max = Math.min(cfg.maxPerRoom, 2, cfg.maxHumans + 1 - humans);
    // Other public rooms already busy means real players are around: lean on them instead.
    if (net.busyRooms >= cfg.busyRoomsOff) max = 0;
    else if (net.busyRooms >= cfg.busyRoomsHalf) max = Math.min(max, 1);
    return Math.min(max, MAX_PLAYERS - 1 - humans); // always leave a seat for a real person
  }

  function botPolicy() {
    if (!net.isHost || !net.isPublic) return;
    const target = botTarget();
    const bots = [...net.bots.keys()].filter((id) => net.players[id]);
    if (net.phase !== 'lobby') return;
    if (bots.length > target) {
      // Too many: one wanders off after a natural pause.
      if (!net.timers.botLeave) {
        net.timers.botLeave = setTimeout(() => {
          net.timers.botLeave = null;
          const extra = [...net.bots.keys()].filter((id) => net.players[id]);
          if (extra.length > botTarget()) removeBot(extra[extra.length - 1]);
          botPolicy();
        }, rand(1500, 5000));
      }
      return;
    }
    if (bots.length < target && !net.timers.botJoin) {
      const first = bots.length === 0;
      if (!first && net.secondBotRolled) return;
      if (!first) {
        net.secondBotRolled = true;
        if (Math.random() > CONFIG.bots.secondChance) return;
      }
      const [lo, hi] = first ? CONFIG.bots.firstDelayMs : CONFIG.bots.secondDelayMs;
      net.timers.botJoin = setTimeout(() => {
        net.timers.botJoin = null;
        if (net.phase === 'lobby' && [...net.bots.keys()].filter((id) => net.players[id]).length < botTarget()) addBot();
        botPolicy();
      }, rand(lo, hi));
    }
  }

  // After a round some fill-ins leave (more likely when real people are around), like real players do.
  function botsAfterRound() {
    const humans = humanCount();
    for (const id of [...net.bots.keys()]) {
      clearBotTimers(id);
      const chance = CONFIG.bots.leaveChance + (humans >= 2 ? 0.3 : 0);
      if (Math.random() < chance) removeBot(id);
    }
    net.secondBotRolled = false;
  }

  // --- route planning through the real link graph (~4–7 cached API calls per round) ---
  async function pagesQuery(params) {
    const j = await api({ action: 'query', redirects: '1', prop: 'info', smaxage: '3600', maxage: '3600', ...params });
    return ((j.query && j.query.pages) || []).filter((p) => !p.missing && p.ns === 0).map((p) => ({ t: p.title, len: p.length || 0 }));
  }
  const linksOfPage = (title) => pagesQuery({ generator: 'links', titles: title, gplnamespace: '0', gpllimit: 'max' });
  const pagesLinkingTo = (title) => pagesQuery({ generator: 'linkshere', titles: title, glhnamespace: '0', glhlimit: 'max', glhshow: '!redirect' });
  const byLen = (a, b) => b.len - a.len; // long articles are usually broad "hub" topics
  const topPick = (list) => list.sort(byLen)[Math.floor(Math.random() * Math.min(3, list.length))];

  async function linkPairs(froms, tos) {
    const j = await api({ action: 'query', prop: 'links', titles: froms.join('|'), pltitles: tos.join('|'), pllimit: 'max', smaxage: '3600', maxage: '3600' });
    const hits = [];
    for (const pg of (j.query && j.query.pages) || []) for (const l of pg.links || []) hits.push([pg.title, l.title]);
    return hits.sort(() => Math.random() - 0.5).slice(0, 6);
  }

  // Finds several real routes (shortest found first) so each fill-in can take a different one.
  async function planRoute(start, end) {
    const [S, T] = await Promise.all([linksOfPage(start), pagesLinkingTo(end)]);
    // Detour candidates: prominent pages linked from the start (what people actually wander into).
    const startLinks = [...S].sort(byLen).slice(0, 60).map((x) => x.t).filter((t) => !sameTitle(t, end));
    const plan = (routes) => ({ routes, startLinks });
    if (S.some((x) => sameTitle(x.t, end))) return plan([[start, end]]);
    const tset = new Set(T.map((x) => normTitle(x.t)));
    const common = S.filter((x) => tset.has(normTitle(x.t))).sort(byLen).slice(0, 6);
    if (common.length) return plan(common.map((x) => [start, x.t, end]));
    const xs = [...S].sort(byLen).slice(0, 50).map((x) => x.t);
    const ys = [...T].sort(byLen).slice(0, 100).map((x) => x.t);
    for (let i = 0; i < ys.length; i += 50) {
      const hits = await linkPairs(xs, ys.slice(i, i + 50));
      if (hits.length) return plan(hits.map(([x, y]) => [start, x, y, end]));
    }
    if (!xs.length) return plan([]);
    const hub = xs[Math.floor(Math.random() * Math.min(2, xs.length))];
    const Z = (await linksOfPage(hub)).filter((z) => !sameTitle(z.t, start));
    const zc = Z.filter((z) => tset.has(normTitle(z.t))).sort(byLen).slice(0, 6);
    if (zc.length) return plan(zc.map((z) => [start, hub, z.t, end]));
    const zs = Z.sort(byLen).slice(0, 50).map((z) => z.t);
    for (let i = 0; i < ys.length && zs.length; i += 50) {
      const hits = await linkPairs(zs, ys.slice(i, i + 50));
      if (hits.length) return plan(hits.map(([z, y]) => [start, hub, z, y, end]));
    }
    return plan([]);
  }

  async function startBots(round) {
    const ids = [...net.bots.keys()].filter((id) => net.players[id] && net.players[id].inRound);
    if (!ids.length) return;
    const me = net;
    let plan = null;
    try { plan = await planRoute(round.start, round.end); } catch {}
    if (net !== me || net.round !== round || net.phase !== 'playing') return;
    for (const id of ids) Object.assign(net.bots.get(id), { routeKey: null, hurried: false, script: null, holding: false });
    for (const id of ids) simulateBot(id, round, plan);
    maybeHurryBots();
  }

  function simulateBot(id, round, plan) {
    const b = net.bots.get(id);
    const p = net.players[id];
    if (!b || !p) return;
    const tier = b.tier;
    const dm = DIFF_MUL[round.difficulty] || 1;
    const cap = round.limit * 0.92;
    // Each round a fill-in is either on form (tight route, quick) or off it (extra detours, slower), so
    // they're sometimes better and sometimes worse than the person they're racing.
    const sharpChance = { 0: 0.25, 1: 0.4, 2: 0.55, 3: 0.7 }[BOT_TIERS.indexOf(tier)] ?? 0.45;
    const sharp = Math.random() < sharpChance;
    b.form = sharp ? 'sharp' : 'off';

    // Build the route: real shortest-ish path plus "explore and come back" detours for weaker players.
    const path = [{ t: round.start, via: round.start, back: false }];
    // Each fill-in takes its own route where possible, and stronger players favour the shortest.
    const routes = (plan && plan.routes) || [];
    const used = new Set([...net.bots.values()].map((x) => x.routeKey).filter(Boolean));
    const sorted = [...routes].sort((a, c) => a.length - c.length);
    const fresh = sorted.filter((r) => !used.has(r.join('|')));
    const options = fresh.length ? fresh : sorted;
    const route = options.length ? options[tier.giveUp < 0.05 ? 0 : Math.floor(Math.random() * options.length)] : null;
    b.routeKey = route ? route.join('|') : null;
    if (route) {
      const pool = plan.startLinks.filter((t) => !route.some((r) => sameTitle(r, t)));
      const extra = sharp ? 0 : randInt(1, 2);
      const detours = Math.min(pool.length, (sharp ? tier.detours[0] : randInt(tier.detours[0], tier.detours[1] + (dm > 1.2 ? 1 : 0))) + extra);
      for (let k = 0; k < detours; k++) {
        const w = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
        path.push({ t: w, via: w, back: false }, { t: round.start, via: round.start, back: true });
      }
      for (const t of route.slice(1)) path.push({ t, via: t, back: false });
    }
    const givesUp = !route || Math.random() < tier.giveUp * dm;

    // Timing: warm-up read of the first page, then a think time per click, inside ~92% of the clock.
    const nSteps = route ? path.length - 1 : randInt(2, 5);
    let times = [];
    let tSum = rand(tier.warmup[0], tier.warmup[1]) * 1000;
    for (let i = 0; i < nSteps; i++) {
      tSum += rand(tier.secPerClick[0], tier.secPerClick[1]) * Math.sqrt(dm) * (sharp ? 0.85 : 1.25) * 1000;
      times.push(tSum);
    }
    const budget = cap * rand(0.5, 0.97);
    const last = times[times.length - 1] + 1000;
    if (last > budget) times = times.map((t) => (t * budget) / last);

    // The bot's whole race as a script: pages to reveal at given times, then finish or give up.
    const script = { round, steps: [], end: null, penAt: null };
    if (givesUp) {
      const quitAt = Math.min(cap * rand(0.35, 0.95), (times[times.length - 1] || cap * 0.5) + rand(10e3, 60e3));
      // Follow the real route partway (never reaching the target), or explore links off the start page
      // and come back, so even a give-up route only uses real links.
      const wander = plan && plan.startLinks.length ? plan.startLinks : [];
      times.forEach((t, i) => {
        if (t >= quitAt) return;
        let step = null;
        if (route && i + 1 < path.length - 1) step = path[i + 1];
        else if (!route && wander.length) {
          step = i % 2 === 0 ? { t: wander[(i * 7 + 3) % wander.length], via: '', back: false } : { t: round.start, via: round.start, back: true };
        }
        if (step) script.steps.push({ at: t, step: { ...step, via: step.via || step.t } });
      });
      script.end = { type: 'gaveup', at: quitAt };
    } else {
      times.slice(0, -1).forEach((t, i) => script.steps.push({ at: t, step: path[i + 1] }));
      script.end = { type: 'finished', at: times[times.length - 1], last: path[path.length - 1] };
    }
    if (Math.random() < tier.pen) script.penAt = times[Math.floor(times.length / 2)] || 20000;
    b.script = script;
    b.done = 0; // steps already shown
    b.walk = [path[0]];
    runBotScript(id);
  }

  // Schedules whatever is left of a bot's script (also used to re-time it when hurrying).
  function runBotScript(id) {
    const b = net.bots.get(id);
    const p = net.players[id];
    if (!b || !p || !b.script) return;
    clearBotTimers(id);
    const { round } = b.script;
    const at = (ms, fn) => {
      b.timers.push(setTimeout(() => {
        if (net.players[id] !== p || p.status !== 'playing' || net.round !== round) return;
        fn();
      }, Math.max(0, net.roundStartedAt + ms - Date.now())));
    };
    if (b.script.penAt != null) at(b.script.penAt, () => { b.script.penAt = null; p.tabLeaves = 2; p.penalties = 1; broadcast(); });
    b.script.steps.forEach((s, i) => {
      if (i < b.done) return;
      at(s.at, () => {
        b.done = i + 1;
        b.walk.push(s.step);
        p.clicks = b.walk.length - 1;
        p.title = s.step.t;
        resetBotView(b);
        broadcast();
      });
    });
    at(b.script.end.at, () => {
      // Never let every fill-in finish while a real person is still racing: the last one waits a
      // page away from the target and wraps up once they're done (see maybeHurryBots).
      if (b.script.end.type === 'finished' && realPlayersRacing() && !otherBotsStillRacing(id)) {
        b.holding = true;
        return;
      }
      b.holding = false;
      if (b.script.end.type === 'finished' && b.script.end.last) { b.walk.push(b.script.end.last); b.script.end.last = null; }
      p.time = Math.min(round.limit, Date.now() - net.roundStartedAt);
      p.path = b.walk.map((x) => ({ ...x }));
      p.clicks = p.path.length - 1;
      if (b.script.end.type === 'gaveup') {
        p.status = 'gaveup';
      } else {
        p.status = 'finished';
        p.title = round.end;
        p.verify = 'pending';
        b.timers.push(setTimeout(() => {
          if (net.players[id] !== p || p.verify !== 'pending') return;
          p.verify = 'ok';
          checkRoundOver();
          broadcast();
        }, rand(500, 1800)));
      }
      checkRoundOver();
      broadcast();
    });
  }

  const realPlayersRacing = () => Object.entries(net.players).some(([pid, x]) => x.inRound && x.status === 'playing' && !isBot(pid));
  const otherBotsStillRacing = (id) => [...net.bots.keys()].some((bid) => bid !== id && net.players[bid] && net.players[bid].inRound && net.players[bid].status === 'playing');

  // Once every real person is done (finished, gave up or out of time), nobody should sit watching
  // fill-ins take minutes. Their remaining clicks get re-timed to a quick but human pace, staggered
  // so they don't all land at once: everyone's done within roughly 5–25 seconds.
  function maybeHurryBots() {
    if (!net.isHost || net.phase !== 'playing' || !net.bots.size) return;
    const racing = Object.entries(net.players).filter(([, p]) => p.inRound && p.status === 'playing');
    if (!racing.length || racing.some(([id]) => !isBot(id))) return;
    const now = Date.now() - net.roundStartedAt;
    let offset = rand(1500, 4500);
    for (const [id] of racing.sort(() => Math.random() - 0.5)) {
      const b = net.bots.get(id);
      if (!b || !b.script || b.hurried) continue;
      b.hurried = true;
      let t = now + offset;
      b.script.steps.forEach((s, i) => {
        if (i < b.done) return;
        t += rand(1800, 4200);
        s.at = Math.min(s.at, t);
      });
      b.script.end.at = b.holding
        ? now + offset + rand(2500, 8000)
        : Math.min(b.script.end.at, b.script.end.type === 'gaveup' ? now + offset + rand(2000, 9000) : t + rand(400, 1400));
      if (b.script.penAt != null) b.script.penAt = null;
      runBotScript(id);
      offset += rand(2500, 7000);
    }
  }

  // Spectating a fill-in: drift down the page like someone reading and skimming.
  function resetBotView(b) { b.view = { b: 0, p: 0 }; }
  setInterval(() => {
    if (!net.isHost || !net.bots || !net.bots.size) return;
    for (const [id, b] of net.bots) {
      const p = net.players[id];
      const set = net.watchers.get(id);
      if (!p || p.status !== 'playing' || !set || !set.size) continue;
      if (Math.random() < 0.7) b.view.b += randInt(0, 3);
      b.view.p = Math.min(0.95, b.view.b / 70);
      relayView(id, { type: 'view', id, t: p.title, b: b.view.b, f: Math.round(Math.random() * 100) / 100, p: b.view.p, h: -1 });
    }
  }, 1300);

  function relayView(id, out) {
    const set = net.watchers.get(id);
    if (!set) return;
    for (const w of set) {
      const viewer = net.players[w];
      if (!viewer || viewer.status === 'playing') continue;
      if (w === 'host') onView(out);
      else {
        const c = net.conns.get(w);
        if (c && c.open) c.send(out);
      }
    }
  }

  // --- opening a private room to the public ---
  // The host also claims a public slot, so quick match finds this room; friends already in stay put.
  async function hostTogglePublic() {
    if (!net.isHost) return;
    const btn = $('#toggle-public');
    if (net.isPublic && net.publicFromPrivate) {
      // Keep the public slot reserved so anyone who joined through it stays connected; quick match
      // just sees it as not accepting, and new strangers are turned away.
      for (const id of [...net.bots.keys()]) removeBot(id);
      clearTimeout(net.timers.auto);
      Object.assign(net, { isPublic: false, publicFromPrivate: false, autoStartAt: 0, fallbackAt: 0 });
      for (const p of Object.values(net.players)) Object.assign(p, { ready: false, vote: null });
      toast('Room is private again');
      broadcast();
      renderLobby();
      return;
    }
    if (net.isPublic || net.phase !== 'lobby') return;
    if (net.pubPeer && !net.pubPeer.destroyed && net.slot != null) {
      Object.assign(net, { isPublic: true, publicFromPrivate: true });
      toast(`Room is public again: ${pubCode(net.slot)}`);
      scheduleAutoStart(); botPolicy(); broadcast(); renderLobby();
      return;
    }
    const me = net;
    btn.disabled = true;
    btn.textContent = 'Opening…';
    for (let i = 0; i < CONFIG.publicSlots; i++) {
      const peer = await tryClaim(publicPeerId(i));
      if (net !== me) { if (peer) peer.destroy(); return; }
      if (!peer) continue;
      Object.assign(net, { pubPeer: peer, isPublic: true, publicFromPrivate: true, slot: i });
      wireHostPeer(peer, me, true);
      track('room_opened_public');
      toast(`Room is now public: ${pubCode(i)}`);
      btn.disabled = false;
      scheduleAutoStart();
      botPolicy();
      broadcast();
      renderLobby();
      return;
    }
    btn.disabled = false;
    toast('All public rooms are busy right now, try again soon');
    renderLobby();
  }

  // --- guest ---
  function attachGuest(conn, name, me, fail) {
    me.hostConn = conn;
    me.myName = name;
    me.fail = fail;
    me.send = (msg) => { if (conn.open) conn.send(msg); };
    const onOpen = () => {
      if (net !== me) return;
      const rejoin = me.joined;
      me.joined = true;
      me.migrating = false;
      conn.send({ type: 'hello', name, snapshot: mySnapshot() });
      if (spec.id) conn.send({ type: 'spectate', id: spec.id });
      if (!rejoin) track('room_joined', { public: !!me.isPublic });
      if (!rejoin) setLobbyStatus(me.isPublic ? 'Matched! Waiting for racers…' : "You're in! Waiting for the host to start.");
      else setLobbyStatus('Reconnected to the new host.');
      renderLobby();
    };
    if (conn.open) onOpen();
    else conn.on('open', onOpen);
    conn.on('data', (d) => { if (net === me) guestHandle(d, fail); });
    conn.on('close', () => {
      if (net !== me || me.hostConn !== conn) return;
      if (me.joined) migrateHost(me);
      else fail('The host closed the room');
    });
  }

  // ---------- host handover ----------
  // Every player knows the join order, so when the host disappears they all agree on who's next.
  // The successor claims the room's ID on the PeerJS server and rebuilds the room from the last
  // state it saw; everyone else reconnects to the same ID and re-sends their own progress.
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function mySnapshot() {
    const g = game;
    if (!g || g.mode !== 'duel' || !net.round) return null;
    return {
      round: net.round.n, status: g.finished ? g.result : 'playing',
      clicks: g.clicks, penalties: g.penalties, tabLeaves: g.tabLeaves, title: g.current || '',
      path: g.finished ? g.path : [], time: g.elapsed,
    };
  }

  function applySnapshot(id, p, s) {
    if (!s || typeof s !== 'object' || !net.round || int(s.round, 0, 1e9) !== net.round.n || !p.inRound) return;
    p.penalties = Math.max(p.penalties || 0, int(s.penalties, 0, 999));
    p.tabLeaves = Math.max(p.tabLeaves || 0, int(s.tabLeaves, 0, 9999));
    const path = cleanPath(s.path);
    if (p.status === 'playing' || p.status === 'left') {
      p.status = 'playing';
      p.clicks = int(s.clicks, 0, 999);
      if (s.title) p.title = normTitle(str(s.title, 300));
      if (['finished', 'gaveup', 'timeout'].includes(s.status)) {
        p.path = path;
        p.clicks = Math.max(0, path.length - 1);
        p.title = path.length ? path[path.length - 1].t : p.title;
        // They finished while the room had no host, so the host couldn't time it: use their clock,
        // capped by how long the round has actually been running.
        p.time = Math.min(int(s.time, 0, net.round.limit), Math.max(0, Date.now() - net.roundStartedAt));
        p.status = s.status;
        if (s.status === 'finished') { p.verify = 'pending'; verifyPlayer(id); }
      }
    } else if (p.status === 'finished' && (!p.path || !p.path.length) && path.length) {
      p.path = path;
    }
  }

  function tryClaim(roomId) {
    return new Promise((resolve) => {
      const peer = new Peer(roomId, peerOpts());
      const t = setTimeout(() => { peer.destroy(); resolve(null); }, 6000);
      peer.on('open', () => { clearTimeout(t); resolve(peer); });
      peer.on('error', () => { if (!peer.open) { clearTimeout(t); peer.destroy(); resolve(null); } });
    });
  }

  function tryConnect(peer, roomId, ms) {
    return new Promise((resolve) => {
      if (!peer || peer.destroyed) return resolve(null);
      if (peer.disconnected) { try { peer.reconnect(); } catch {} }
      const conn = peer.connect(roomId, { reliable: true });
      const t = setTimeout(() => { try { conn.close(); } catch {} resolve(null); }, ms);
      conn.on('open', () => { clearTimeout(t); resolve(conn); });
      conn.on('error', () => { clearTimeout(t); resolve(null); });
    });
  }

  function migrateHost(me) {
    if (me.migrating) return;
    me.migrating = true;
    me.send = () => {};
    const order = Object.keys(me.players).filter((id) => id !== 'host' && me.players[id].connected !== false);
    const rank = order.indexOf(me.myId);
    const oldHost = me.players.host ? me.players.host.name : 'The host';
    toast(rank === 0 ? `${oldHost} left. You're taking over as host…` : `${oldHost} left. Switching to a new host…`, 3500);
    setLobbyStatus('Host left. Handing the room over…');
    const t0 = Date.now();
    (async () => {
      while (net === me && Date.now() - t0 < 45000) {
        // Next in line claims straight away; the rest step in only if those ahead don't show up.
        if (rank >= 0 && Date.now() - t0 >= rank * 10000) {
          const peer = await tryClaim(me.roomId);
          if (net !== me) { if (peer) peer.destroy(); return; }
          if (peer) { takeOverAsHost(peer, me); return; }
        }
        const conn = await tryConnect(me.peer, me.roomId, 4000);
        if (net !== me) { if (conn) conn.close(); return; }
        if (conn) {
          attachGuest(conn, me.myName, me, me.fail);
          track('host_migrated', { role: 'reconnected' });
          toast('Reconnected. The race goes on!');
          return;
        }
        await sleep(1500);
      }
      if (net !== me) return;
      track('issue', { kind: 'migration_failed', public: !!me.isPublic });
      if (me.isPublic) { toast('The room closed. Finding you a new race…', 3000); quickMatch(); }
      else me.fail('Lost connection to the room');
    })();
  }

  function takeOverAsHost(peer, old) {
    try { old.peer && old.peer.destroy(); } catch {}
    for (const t of Object.values(old.timers)) clearTimeout(t);
    const n = freshNet();
    Object.assign(n, {
      isHost: true, isPublic: old.isPublic, slot: old.slot, code: old.code, roomId: old.roomId, myId: 'host', peer,
      phase: old.phase, round: old.round, roundNum: old.round ? old.round.n : 0, roundStartedAt: old.roundStartedAt, diff: old.diff,
      joined: true, myName: old.myName,
    });
    const players = { host: { ...old.players[old.myId], connected: true, awaiting: false, name: old.myName || 'Host' } };
    for (const [id, p] of Object.entries(old.players)) {
      if (id === old.myId) continue;
      if (id === 'host') {
        if (p.inRound && n.phase !== 'lobby') players[`gone-${Date.now()}`] = { ...p, connected: false, status: p.status === 'playing' ? 'left' : p.status };
        continue;
      }
      players[id] = { ...p, connected: false, awaiting: true };
    }
    n.players = players;
    n.send = (msg) => hostHandle('host', msg);
    net = n;
    if (spec.id && !players[spec.id]) closeSpectate();
    else if (spec.id) hostHandle('host', { type: 'spectate', id: spec.id });
    applySnapshot('host', players.host, mySnapshot());
    wireHostPeer(peer, n);
    if (old.isPublic && old.publicFromPrivate && old.slot != null) {
      Object.assign(n, { isPublic: true, publicFromPrivate: true, slot: old.slot });
      tryClaim(publicPeerId(old.slot)).then((pp) => {
        if (net !== n) { if (pp) pp.destroy(); return; }
        if (pp) { n.pubPeer = pp; wireHostPeer(pp, n, true); } else { n.isPublic = false; n.publicFromPrivate = false; n.slot = null; broadcast(); }
      });
    }

    for (const [id, p] of Object.entries(players)) {
      if (p.status === 'finished' && p.verify === 'pending' && p.path && p.path.length) verifyPlayer(id);
    }
    if (n.phase === 'playing' && n.round) {
      const round = n.round;
      n.timers.deadline = setTimeout(() => {
        if (net !== n || n.phase !== 'playing' || n.round !== round) return;
        for (const p of Object.values(n.players)) if (p.inRound && p.status === 'playing') { p.status = 'timeout'; p.time = round.limit; }
        checkRoundOver();
        broadcast();
      }, Math.max(1000, n.roundStartedAt + round.limit + GRACE_MS - Date.now()));
    }
    if (n.phase === 'results' && n.isPublic) {
      n.nextAt = Date.now() + CONFIG.lobby.resultsMs;
      n.timers.next = setTimeout(hostBackToLobby, CONFIG.lobby.resultsMs);
    }
    // Anyone who hasn't reconnected after 30s is gone.
    n.timers.rejoin = setTimeout(() => {
      if (net !== n) return;
      for (const [id, p] of Object.entries(n.players)) {
        if (!p.awaiting) continue;
        p.awaiting = false;
        if (n.phase === 'lobby' || !p.inRound) delete n.players[id];
        else if (p.status === 'playing') p.status = 'left';
      }
      checkRoundOver();
      scheduleAutoStart();
      broadcast();
    }, 30000);
    track('host_migrated', { role: 'new_host', phase: n.phase });
    toast("👑 You're the new host", 3500);
    setLobbyStatus(n.isPublic ? 'You are now hosting this public room.' : 'You are now the host. Send the invite link to friends, then start the race.');
    checkRoundOver();
    scheduleAutoStart();
    broadcast();
    renderLobby();
    renderResults();
  }

  function joinRoom(rawCode) {
    const code = String(rawCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 5) return toast('Room codes are 5 characters');
    const name = getName();
    if (!name || !peerReady()) return;
    matchToken++;
    leaveRoom();
    net = freshNet();
    net.code = code;
    show('lobby');
    setLobbyStatus(`Joining room ${code}…`);
    renderLobby();

    const pubSlot = pubSlotFromCode(code);
    net.roomId = pubSlot != null ? publicPeerId(pubSlot) : PEER_PREFIX + code;
    if (pubSlot != null) Object.assign(net, { isPublic: true, slot: pubSlot });
    const me = net;
    const fail = (message) => {
      if (net !== me) return;
      toast(message, 4000);
      leaveRoomAndGoHome();
    };
    setTimeout(() => { if (!me.joined) fail("Couldn't reach that room. Check the code and that the host still has it open."); }, 15000);

    const peer = new Peer(peerOpts());
    net.peer = peer;
    peer.on('open', () => {
      if (net !== me) return;
      net.myId = peer.id;
      attachGuest(peer.connect(net.roomId, { reliable: true }), name, me, fail);
    });
    peer.on('error', (err) => {
      if (me.joined) return; // after joining, errors are handled by the host handover
      track('issue', { kind: 'join_failed', error: err.type });
      if (err.type === 'peer-unavailable') fail(`Room ${code} wasn't found. It may have closed.`);
      else fail('Connection problem: ' + err.type);
    });
  }

  function guestHandle(d, fail) {
    if (!d || typeof d !== 'object') return;
    if (d.type === 'state' && d.players && typeof d.players === 'object') {
      const prevPhase = net.phase;
      net.players = d.players;
      net.phase = ['lobby', 'playing', 'results'].includes(d.phase) ? d.phase : 'lobby';
      net.round = d.round || null;
      net.isPublic = !!d.isPublic;
      net.slot = Number.isInteger(d.slot) ? d.slot : null;
      net.publicFromPrivate = !!d.publicFromPrivate;
      net.autoStartAt = d.autoStartIn ? Date.now() + int(d.autoStartIn, 0, 60e3) : 0;
      net.nextAt = d.nextIn ? Date.now() + int(d.nextIn, 0, 60e3) : 0;
      net.roundStartedAt = Date.now() - int(d.roundElapsed, -60e3, 3600e3);
      if (net.phase === 'lobby' && prevPhase !== 'lobby') goToLobbyScreen();
      renderNet();
    } else if (d.type === 'start' && d.round) {
      const r = d.round;
      const round = { start: str(r.start, 300), end: str(r.end, 300), difficulty: str(r.difficulty, 20), n: int(r.n, 0, 1e9), limit: int(r.limit, 30e3, 30 * 60e3) };
      if (!round.start || !round.end) return;
      net.round = round;
      net.phase = 'playing';
      beginRound(round);
    } else if (d.type === 'view') {
      onView({ id: str(d.id, 200), t: str(d.t, 300), b: int(d.b, 0, 1e5), f: Number(d.f) || 0, p: Number(d.p) || 0, h: int(d.h, -1, 1e5) });
    } else if (d.type === 'kicked') {
      fail('The host removed you from the room');
    } else if (d.type === 'error') {
      fail(str(d.message, 200) || 'Could not join');
    }
  }

  // --- quick match: finds an open public room, or opens one for others to find ---
  function findPublicRoom(me) {
    return new Promise((resolve) => {
      const peer = new Peer(peerOpts());
      me.peer = peer;
      const results = new Map();
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        const open = [...results].filter(([, r]) => r && r.info.accepting)
          .sort((a, b) => (a[1].info.phase === 'lobby' ? 0 : 1) - (b[1].info.phase === 'lobby' ? 0 : 1) || b[1].info.count - a[1].info.count);
        const best = open[0];
        for (const [, r] of results) if (r && (!best || r !== best[1])) r.conn.close();
        const busy = [...results.values()].filter((r) => r && r.info.count > 0).length;
        if (best) resolve({ peer, conn: best[1].conn, slot: best[0], busy });
        else {
          const free = [];
          for (let i = 0; i < CONFIG.publicSlots; i++) if (!results.get(i)) free.push(i);
          peer.destroy();
          resolve({ free, busy });
        }
      };
      const timer = setTimeout(finish, 6000);
      const check = () => { if (results.size >= CONFIG.publicSlots) finish(); };
      peer.on('open', () => {
        for (let i = 0; i < CONFIG.publicSlots; i++) {
          const conn = peer.connect(publicPeerId(i), { reliable: true });
          const onData = (d) => {
            if (d && d.type === 'lobbyinfo') {
              conn.off('data', onData);
              results.set(i, { conn, info: d });
              check();
            }
          };
          conn.on('data', onData);
          conn.on('open', () => conn.send({ type: 'probe' }));
        }
      });
      peer.on('error', (err) => {
        const m = String(err.message || '').match(/public-(\d+)/);
        if (err.type === 'peer-unavailable' && m) {
          if (!results.has(+m[1])) results.set(+m[1], null);
          check();
        } else if (!peer.open) {
          finish();
        }
      });
    });
  }

  async function quickMatch() {
    const name = getName();
    if (!name || !peerReady()) return;
    const token = ++matchToken;
    leaveRoom();
    stopTimer();
    game = null;
    closeResults();
    closeSpectate();
    net = freshNet();
    Object.assign(net, { isPublic: true, matching: true });
    show('lobby');
    setLobbyStatus('🔎 Looking for a race…');
    renderLobby();

    const qmStart = Date.now();
    for (let attempt = 0; attempt < 3; attempt++) {
      const me = net;
      const res = await findPublicRoom(me);
      if (token !== matchToken) { if (res.peer) res.peer.destroy(); return; }
      if (res.conn) {
        Object.assign(net, { peer: res.peer, myId: res.peer.id, slot: res.slot, matching: false, roomId: publicPeerId(res.slot) });
        const fail = (message) => { if (net === me) { toast(message, 4000); leaveRoomAndGoHome(); } };
        res.peer.on('error', (err) => { if (err.type !== 'peer-unavailable' && !me.joined) fail('Connection problem: ' + err.type); });
        me.myName = name;
        track('quick_match', { outcome: 'joined', search_ms: Date.now() - qmStart, busy_rooms: res.busy || 0, room_count: res.count || null });
        attachGuest(res.conn, name, me, fail);
        return;
      }
      let retry = false;
      for (const slot of res.free) {
        try {
          await hostRoom({ name, isPublic: true, slot });
          if (token !== matchToken) { leaveRoom(); return; }
          net.busyRooms = res.busy || 0;
          track('quick_match', { outcome: 'hosted', search_ms: Date.now() - qmStart, busy_rooms: net.busyRooms });
          setLobbyStatus('Waiting for other racers to join. The race starts automatically once 2 or more are here.');
          renderLobby();
          botPolicy();
          return;
        } catch (e) {
          if (token !== matchToken) return;
          leaveRoom();
          net = freshNet();
          Object.assign(net, { isPublic: true, matching: true });
          if (e && e.type === 'unavailable-id') { retry = true; break; } // someone just took it: search again
          track('issue', { kind: 'matchmaking', error: e && e.type });
          toast('Matchmaking failed: ' + (e && e.type || 'error'));
          show('home');
          return;
        }
      }
      if (!retry) break;
    }
    if (token !== matchToken) return;
    track('issue', { kind: 'all_rooms_busy' });
    toast('All public rooms are busy, try again in a moment', 4000);
    leaveRoomAndGoHome();
  }

  // --- shared ---
  function goToLobbyScreen() {
    stopTimer();
    game = null;
    closeResults();
    $('#countdown').classList.add('hidden');
    show('lobby');
    renderLobby();
  }

  // 3-2-1 overlay that reveals the start and target; resolves on "Go!".
  function runCountdown(round, kicker) {
    fetchArticle(round.start).catch(() => {});
    fetchInfo(round.end).catch(() => {});
    closeResults();
    closeSpectate();
    window.MiniGame.close();
    const overlay = $('#countdown');
    $('#cd-diff').textContent = kicker || `${DIFF_LABEL[round.difficulty] || ''} · ${fmtTime(round.limit)} on the clock`;
    $('#cd-route').innerHTML = `${esc(round.start)} → <b>${esc(round.end)}</b>`;
    overlay.classList.remove('hidden');
    return new Promise((resolve) => {
      let n = 3;
      const step = () => {
        const num = $('#cd-num');
        num.textContent = n > 0 ? n : 'Go!';
        num.style.animation = 'none';
        void num.offsetWidth;
        num.style.animation = '';
        if (n < 0) {
          overlay.classList.add('hidden');
          resolve();
          return;
        }
        n--;
        setTimeout(step, n < 0 ? 600 : 900);
      };
      step();
    });
  }

  function beginRound(round) {
    runCountdown(round).then(() => {
      if (net.round && net.round.n === round.n && net.phase === 'playing') startGame(round, 'duel');
    });
  }

  function leaveRoom() {
    const old = net;
    if (old.bots) for (const b of old.bots.values()) b.timers.forEach(clearTimeout);
    clearTimers();
    net = freshNet();
    try { old.hostConn && old.hostConn.close(); } catch {}
    for (const c of old.conns.values()) { try { c.close(); } catch {} }
    try { old.peer && old.peer.destroy(); } catch {}
    try { old.pubPeer && old.pubPeer.destroy(); } catch {}
    if (location.search.includes('room=')) history.replaceState(null, '', baseUrl());
  }

  function leaveRoomAndGoHome() {
    matchToken++;
    leaveRoom();
    stopTimer();
    game = null;
    closeResults();
    closeSpectate();
    window.MiniGame.close();
    $('#countdown').classList.add('hidden');
    show('home');
  }

  function setLobbyStatus(text) {
    $('#lobby-status').textContent = text;
  }

  function racerRow(p, i, showTitle) {
    let meta;
    if (p.status === 'finished') meta = `✔ ${plural(score(p), 'click')} · ${fmtTime(p.time)}${p.verify === 'failed' ? ' · 🚩' : ''}`;
    else if (p.status === 'gaveup') meta = 'gave up';
    else if (p.status === 'timeout') meta = 'out of time';
    else if (p.status === 'left') meta = 'left';
    else meta = `racing · ${plural(p.clicks, 'click')}${p.penalties ? ` +${p.penalties}` : ''}${showTitle && p.title ? ` · on ${esc(p.title)}` : ''}`;
    const rank = validFinish(p) ? `<span class="rank ${i === 0 ? 'gold' : ''}">${i === 0 ? '🏆' : i + 1}</span>` : '<span class="rank">·</span>';
    return `<li class="${p.id === net.myId ? 'me' : ''} ${p.connected === false ? 'off' : ''}">
      ${rank}${avatar(p)}<span class="pname">${esc(p.name)}</span><span class="pmeta">${meta}</span>
      ${canSpectate(p) ? `<button class="btn tiny" data-spectate="${esc(p.id)}">👁 Spectate</button>` : ''}</li>`;
  }

  function renderLobby() {
    const pub = net.isPublic;
    const code = pub && net.slot != null ? pubCode(net.slot) : net.code || (pub ? '' : '');
    $('#room-label').textContent = pub ? 'Public Room' : 'Private Room';
    $('#room-code').textContent = net.matching ? 'Searching…' : code || '·····';
    $('#room-code').classList.toggle('pub', !!net.matching);
    $('#invite').classList.toggle('hidden', !code || net.matching || pub);
    $('#invite-link').value = code ? `${baseUrl()}?room=${code}` : '';
    $('#skip-room').classList.toggle('hidden', !pub || net.matching || !!net.publicFromPrivate);
    const tp = $('#toggle-public');
    tp.classList.toggle('hidden', !net.isHost || (pub && !net.publicFromPrivate) || net.phase !== 'lobby');
    if (!tp.disabled) tp.textContent = pub ? 'Make private again' : 'Open to public';
    $('#host-controls').classList.toggle('hidden', !net.isHost || pub);
    $('#guest-wait').classList.toggle('hidden', net.isHost && !pub);
    const showPublic = pub && !net.matching && net.phase === 'lobby' && !!net.players[net.myId];
    $('#public-controls').classList.toggle('hidden', !showPublic);
    if (showPublic) {
      const me = net.players[net.myId];
      const counts = { easy: 0, medium: 0, hard: 0 };
      for (const p of Object.values(net.players)) if (p.connected && p.vote) counts[p.vote]++;
      $$('#vote-row [data-vote]').forEach((b) => {
        const v = b.dataset.vote;
        b.classList.toggle('selected', me.vote === v);
        b.querySelector('.vc').textContent = counts[v] ? counts[v] : '';
      });
      const total = activeCount();
      const readyN = Object.values(net.players).filter((p) => p.connected && p.ready).length;
      $('#ready-btn').textContent = me.ready ? 'Ready ✓' : "I'm ready";
      $('#ready-btn').classList.toggle('on', !!me.ready);
      $('#ready-text').innerHTML = total < 2 ? 'Waiting for someone to join…'
        : `<b>${readyN}/${total}</b> ready · race starts when 50% are ready`;
    }

    const count = activeCount();
    let wait;
    if (net.matching) wait = '🔎 Searching for an open room…';
    else if (net.phase === 'playing') wait = "A race is in progress. You'll be in the next one. Spectate someone or play Lane Rush meanwhile.";
    else if (net.phase === 'results') wait = 'Round just finished. Next one coming up…';
    else if (pub && count < 2) wait = 'Waiting for at least one more racer to join…';
    else if (pub && net.autoStartAt) wait = `Race starts in <b data-autostart>${Math.ceil((net.autoStartAt - Date.now()) / 1000)}</b>s · others can still join`;
    else wait = 'Waiting for the host to start the race…';
    $('#wait-text').innerHTML = wait;

    $('#player-count').textContent = count ? `${count}/${MAX_PLAYERS}` : '';
    const entries = Object.entries(net.players);
    $('#lobby-players').innerHTML = entries.length ? entries.map(([id, p]) => {
      const pl = { ...p, id };
      let meta = '';
      if (p.inRound) {
        meta = p.status === 'finished' ? `finished · ${plural(score(p), 'click')}` : p.status === 'playing' ? `racing · ${plural(p.clicks, 'click')}` : p.status === 'gaveup' ? 'gave up' : p.status === 'timeout' ? 'out of time' : p.status;
      } else if (net.phase !== 'lobby') meta = 'waiting for next round';
      if (p.awaiting) meta = 'reconnecting…';
      return `<li class="${id === net.myId ? 'me' : ''}">
        ${avatar(pl)}<span class="pname">${esc(p.name)}</span>
        ${id === 'host' ? `<span class="badge host">${pub ? 'room host' : 'host'}</span>` : ''}
        ${p.wins ? `<span class="wins">🏆 ${p.wins}</span>` : ''}
        ${pub && net.phase === 'lobby' && p.ready ? '<span class="badge ready">Ready</span>' : ''}
        ${meta ? `<span class="pmeta">${esc(meta)}</span>` : ''}
        ${canSpectate(pl) ? `<button class="btn tiny" data-spectate="${esc(id)}">👁 Spectate</button>` : ''}
        ${net.isHost && !pub && id !== 'host' ? `<button class="btn tiny ghost" data-kick="${esc(id)}" title="Remove player">✕</button>` : ''}
      </li>`;
    }).join('') : `<li class="muted">${net.matching ? 'Searching…' : 'Connecting…'}</li>`;
    const ready = net.isHost && net.peer && net.peer.open;
    $('#start-race').disabled = !ready || net.phase === 'playing' || net.starting;
  }

  function renderRacers() {
    if (!game || game.mode !== 'duel') return;
    const r = ranked();
    const reveal = game.finished;
    $('#racers').innerHTML = r.map((p, i) => racerRow(p, i, reveal)).join('');
    $('#racers-strip').innerHTML = r.filter((p) => p.id !== net.myId).map((p) => {
      const s = p.status === 'finished' ? `✔ ${score(p)}` : p.status === 'playing' ? `${p.clicks} clicks` : p.status === 'gaveup' ? 'gave up' : p.status;
      return `<span class="chip" style="--c:${esc(p.color)}"><b>${esc(p.name)}</b> ${esc(s)}</span>`;
    }).join('');
  }

  function renderNet() {
    const mine = net.players[net.myId];
    const watching = mine && game && game.mode === 'duel' && !game.finished ? mine.watchers || 0 : 0;
    if (watching > lastWatchers) sendView(true);
    lastWatchers = watching;
    const w = $('#hud-watch');
    w.textContent = `👁 ${watching} watching`;
    w.classList.toggle('hidden', !watching);
    if ($('#lobby').classList.contains('active')) renderLobby();
    renderRacers();
    renderResults();
    renderSpectate();
  }

  // Small 1s ticker for countdown labels (auto-start, next round).
  setInterval(() => {
    const a = $('[data-autostart]');
    if (a && net.autoStartAt) a.textContent = Math.max(0, Math.ceil((net.autoStartAt - Date.now()) / 1000));
    $$('[data-next-daily]').forEach((el) => { el.textContent = nextDailyIn(); });
    const n = $('[data-next-in]');
    if (n && net.nextAt) n.textContent = `Next round in ${Math.max(0, Math.ceil((net.nextAt - Date.now()) / 1000))}s`;
  }, 500);

  // ---------- mini-game gating ----------
  // Lane Rush is for waiting: not during a 3-2-1 countdown, not in the last seconds before a public
  // room auto-starts, and not while you're racing.
  function miniGameAllowed() {
    if (!$('#countdown').classList.contains('hidden')) return false;
    if (game && !game.finished) return false;
    if (net.isPublic && net.phase === 'lobby' && net.autoStartAt && net.autoStartAt - Date.now() < 10000) return false;
    return true;
  }
  function renderMiniGameButton() {
    const b = $('#lobby-flappy-btn');
    if (!b) return;
    const ok = miniGameAllowed();
    b.disabled = !ok;
    b.textContent = !ok ? 'Race starting… no time for Lane Rush' : window.MiniGame.isOpen() && window.MiniGame.isInline() ? 'Hide Lane Rush' : '🏎 Play Lane Rush while you wait';
  }
  setInterval(() => {
    if (window.MiniGame.isOpen() && !miniGameAllowed()) window.MiniGame.close();
    renderMiniGameButton();
  }, 500);

  // ---------- home page motion ----------
  // Example routes cycling under the logo (illustrative, each step is a real link on Wikipedia).
  // Home-page demo: a mini article where a cursor finds the right link, clicks it, and the page flips
  // to the next article. Each step's text is a short summary; [[x]] is a link, [[x|>]] the one to click.
  const DEMO_ROUTES = [
    [
      ['Pizza', 'Pizza is a [[flatbread]] dish topped with [[tomato]] and [[cheese]], first made famous in [[Naples|>]], Italy.'],
      ['Naples', 'Naples is a port city in southern [[Italy]] on the [[Bay of Naples]], in the shadow of [[Mount Vesuvius|>]].'],
      ['Mount Vesuvius', 'Mount Vesuvius is an active [[volcano|>]] near Naples, best known for burying [[Pompeii]] in AD 79.'],
      ['Volcano', 'A volcano is an opening in the Earth’s crust where molten rock, ash and gas escape.'],
    ],
    [
      ['Dog', 'The dog is a domesticated [[mammal]] of the family [[Canidae|>]], kept by humans for over 15,000 years.'],
      ['Canidae', 'Canidae is the family of dog-like [[carnivorans]], including [[foxes]], [[jackals]] and the [[wolf|>]].'],
      ['Wolf', 'The wolf is a large wild canine native to Eurasia and North America.'],
    ],
    [
      ['Chocolate', 'Chocolate is made from roasted [[cacao]] beans, first grown in [[Mesoamerica|>]] thousands of years ago.'],
      ['Mesoamerica', 'Mesoamerica is a historical region covering much of modern [[Mexico|>]] and [[Central America]], home of the [[Maya]].'],
      ['Mexico', 'Mexico is a country in North America, home to more than 120 million people.'],
    ],
  ];
  function runRouteDemo() {
    const board = $('.board');
    if (!board) return;
    const page = $('#route-demo'), title = $('#demo-title'), text = $('#demo-text'), url = $('#demo-url');
    const trail = $('#demo-trail'), clicks = $('#demo-clicks'), cursor = $('#demo-cursor');
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const render = (step) => {
      title.textContent = step[0];
      url.textContent = `wiki/${step[0].replace(/ /g, '_')}`;
      const target = ($('#board-target .tv') || {}).textContent || '';
      text.innerHTML = esc(step[1]).replace(/\[\[([^\]|]+)(\|&gt;)?\]\]/g, (_, label, next) =>
        `<span class="dl${next ? ' next' : ''}${sameTitle(label, target) ? ' tgt' : ''}">${label}</span>`);
    };
    const moveCursorTo = (el) => {
      const b = board.getBoundingClientRect(), r = el.getBoundingClientRect();
      cursor.style.transform = `translate(${r.left - b.left + r.width * 0.55}px, ${r.top - b.top + r.height * 0.55}px)`;
    };
    let i = Math.floor(Math.random() * DEMO_ROUTES.length);
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    // The trail is the chain being built: each clicked article pops onto the end.
    const showTrail = (names, upto, pop) => {
      trail.innerHTML = names.slice(0, upto + 1).map((n, j) =>
        `${j ? '<i>›</i>' : ''}<span class="${j === upto ? 'cur' : ''}${pop && j === upto ? ' pop' : ''}">${esc(n)}</span>`).join('');
      clicks.textContent = upto;
      if (pop) { clicks.classList.remove('bump'); void clicks.offsetWidth; clicks.classList.add('bump'); }
    };
    async function play() {
      const route = DEMO_ROUTES[i++ % DEMO_ROUTES.length];
      const names = route.map((s) => s[0]);
      const target = names[names.length - 1];
      $('#board-target').innerHTML = `<span class="tl">Target</span><span class="tv">${esc(target)}</span>`;
      board.classList.remove('done');
      showTrail(names, 0, false);
      for (let k = 0; k < route.length; k++) {
        render(route[k]);
        page.classList.remove('flip');
        void page.offsetWidth;
        page.classList.add('flip');
        if (k === route.length - 1) break;
        if (still) { await wait(2200); showTrail(names, k + 1, false); continue; }
        await wait(650);                       // read the page
        const link = text.querySelector('.dl.next');
        if (!link) break;
        moveCursorTo(link);
        await wait(700);                       // cursor travels to the link
        link.classList.add('hit');
        cursor.classList.add('press');
        await wait(200);
        cursor.classList.remove('press');
        await wait(350);                       // the clicked link stays lit…
        showTrail(names, k + 1, true);         // …then joins the chain
        await wait(650);
      }
      board.classList.add('done');
      await wait(2800);
      if (!$('#home').classList.contains('active') || document.hidden) await wait(1500);
      play();
    }
    cursor.style.transform = 'translate(70%, 260px)';
    play();
  }

  function initHowTo() {
    const box = $('#howto');
    ['#open-howto', '#open-howto-2'].forEach((sel) => $(sel) && $(sel).addEventListener('click', () => box.classList.remove('hidden')));
    $('#close-howto').addEventListener('click', () => box.classList.add('hidden'));
    box.addEventListener('click', (e) => { if (e.target === box) box.classList.add('hidden'); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') box.classList.add('hidden'); });
  }

  // ---------- wiring ----------
  function init() {
    runRouteDemo();
    initHowTo();
    const nameInput = $('#name-input');
    nameInput.value = store.get('wr-name') || '';
    nameInput.addEventListener('change', () => store.set('wr-name', nameInput.value.trim()));

    $$('[data-solo]').forEach((b) => b.addEventListener('click', () => startSolo(b.dataset.solo)));
    $('#solo-custom-toggle').addEventListener('click', () => $('#solo-custom').classList.toggle('hidden'));
    $('#solo-custom').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target;
      startSolo('custom', [f.start.value, f.end.value]);
    });
    $$('#solo-custom input, #room-custom input').forEach(attachSuggest);

    renderDailyCard();
    $('#quick-match').addEventListener('click', quickMatch);
    $('#create-room').addEventListener('click', createRoom);
    $('#join-form').addEventListener('submit', (e) => { e.preventDefault(); joinRoom($('#join-code').value); });
    $('#leave-lobby').addEventListener('click', leaveRoomAndGoHome);
    $('#skip-room').addEventListener('click', quickMatch);
    $('#copy-invite').addEventListener('click', () => copyText($('#invite-link').value || inviteLink()));
    $('#toggle-public').addEventListener('click', hostTogglePublic);
    $$('#room-diff .btn').forEach((b) => b.addEventListener('click', () => {
      net.diff = b.dataset.diff;
      $$('#room-diff .btn').forEach((x) => x.classList.toggle('selected', x === b));
      $('#room-custom').classList.toggle('hidden', net.diff !== 'custom');
    }));
    $('#start-race').addEventListener('click', hostStartRace);
    $('#ready-btn').addEventListener('click', () => {
      const me = net.players[net.myId];
      if (me) net.send({ type: 'ready', ready: !me.ready });
    });
    $$('#vote-row [data-vote]').forEach((b) => b.addEventListener('click', () => {
      const me = net.players[net.myId];
      if (me) net.send({ type: 'vote', vote: me.vote === b.dataset.vote ? null : b.dataset.vote });
    }));

    const article = $('#article');
    article.addEventListener('click', onArticleClick);
    article.addEventListener('auxclick', onArticleClick);
    article.addEventListener('contextmenu', (e) => { if (e.target.closest('a')) e.preventDefault(); });
    article.addEventListener('dragstart', (e) => e.preventDefault());
    $('#spec-article').addEventListener('click', (e) => { if (e.target.closest('a')) e.preventDefault(); });

    $('#btn-back').addEventListener('click', goBack);
    $('#btn-giveup').addEventListener('click', giveUp);
    $('#btn-panel').addEventListener('click', () => $('#panel').classList.toggle('open'));
    $('#spec-close').addEventListener('click', closeSpectate);

    document.addEventListener('click', (e) => {
      const s = e.target.closest('[data-spectate]');
      if (s) openSpectate(s.dataset.spectate);
      const k = e.target.closest('[data-kick]');
      if (k) kick(k.dataset.kick);
      if (e.target.closest('[data-flappy]') && miniGameAllowed()) window.MiniGame.open();
      if (e.target.closest('#lobby-flappy-btn')) {
        if (!miniGameAllowed()) return;
        if (window.MiniGame.isOpen() && window.MiniGame.isInline()) window.MiniGame.close();
        else { window.MiniGame.open($('#lobby-flappy')); $('#lobby-flappy').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
        renderMiniGameButton();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      $('#panel').classList.remove('open');
      closeSpectate();
    });
    window.addEventListener('scroll', () => sendView(false), { passive: true });
    article.addEventListener('mouseover', (e) => {
      const a = e.target.closest('a');
      const idx = a ? [...article.querySelectorAll('a')].indexOf(a) : -1;
      if (idx !== hoverIdx) { hoverIdx = idx; sendView(false); }
    });
    article.addEventListener('mouseleave', () => { hoverIdx = -1; sendView(false); });
    // Word search is off mid-race (the browser menu can still open Find, but links can't be matched).
    window.addEventListener('keydown', (e) => {
      if (!game || game.finished || !$('#game').classList.contains('active')) return;
      const k = e.key.toLowerCase();
      if (((e.ctrlKey || e.metaKey) && (k === 'f' || k === 'g')) || e.key === 'F3') {
        e.preventDefault();
        e.stopPropagation();
        toast('🔍 Word search is off during races. Read and click!');
      }
    }, true);
    document.addEventListener('visibilitychange', () => (document.hidden ? markAway() : markReturn()));
    window.addEventListener('blur', markAway);
    window.addEventListener('focus', markReturn);

    window.addEventListener('beforeunload', (e) => {
      if ((game && !game.finished) || (net.isHost && net.conns.size)) { e.preventDefault(); e.returnValue = ''; }
    });

    // Invite / challenge links
    const q = new URLSearchParams(location.search);
    const banner = $('#challenge-banner');
    if (q.get('room')) {
      const code = q.get('room').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
      $('#join-code').value = code;
      banner.innerHTML = `<h2>You've been invited to a race</h2>
        <p class="muted">Room <b>${esc(code)}</b>. Enter your name above, then join.</p>
        <button class="btn primary wide" id="banner-join">Join room ${esc(code)}</button>`;
      banner.classList.remove('hidden');
      $('#banner-join').addEventListener('click', () => joinRoom(code));
      if (!nameInput.value) nameInput.focus();
    } else if (q.get('s') && q.get('e')) {
      const challenge = { by: cleanName(q.get('by') || 'A friend'), clicks: int(q.get('c'), 0, 999) };
      const s = str(q.get('s'), 300);
      const e = str(q.get('e'), 300);
      const d = LIMITS[q.get('d')] ? q.get('d') : 'challenge';
      banner.innerHTML = `<h2>${esc(challenge.by)} challenged you</h2>
        <div class="route-big">${esc(s)} → <span style="color:var(--accent)">${esc(e)}</span></div>
        ${challenge.clicks ? `<p class="muted">Their score: <b>${plural(challenge.clicks, 'click')}</b>. Can you do better? You have ${fmtTime(limitFor(d))}.</p>` : ''}
        <button class="btn primary wide" id="banner-play">Accept challenge</button>`;
      banner.classList.remove('hidden');
      $('#banner-play').addEventListener('click', async () => {
        try {
          const pair = await validatePair(s, e);
          const round = { ...pair, difficulty: d, limit: limitFor(d) };
          await runCountdown(round, `${challenge.by}'s challenge · ${fmtTime(round.limit)} on the clock`);
          startGame(round, 'challenge', { challenge });
        } catch (err) {
          toast(err.message);
        }
      });
    }
  }

  loadConfig();
  init();
  {
    const q = new URLSearchParams(location.search);
    track('app_open', {
      entry: q.get('room') ? 'invite' : q.get('s') ? 'challenge' : 'direct',
      referrer_host: document.referrer ? new URL(document.referrer).hostname : '',
      played_before: playedList().length > 0,
    });
  }
  addEventListener('minigame-score', (e) => track('minigame_game', { score: e.detail }));
  addEventListener('minigame-close', () => renderMiniGameButton());
  if (/[?&]debug\b/.test(location.search)) window.__wr = { planRoute, shortestRoute, pickPair };
})();
