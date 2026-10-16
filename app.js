(() => {
  'use strict';

  const API = 'https://en.wikipedia.org/w/api.php';
  const PEER_PREFIX = 'wikirace-room-v1-';
  const PUBLIC_SLOTS = 8;
  const publicPeerId = (i) => `${PEER_PREFIX}public-${i}`;
  const MAX_PLAYERS = 5;
  const COUNTDOWN_MS = 3300;
  const GRACE_MS = 4000;
  const LIMITS = { easy: 150e3, medium: 300e3, hard: 600e3, random: 600e3, custom: 300e3, challenge: 300e3 };
  const DIFF_LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard', random: 'Random', custom: 'Custom', challenge: 'Challenge' };
  const COLORS = ['#3355ff', '#f76707', '#2f9e44', '#d6336c', '#7048e8'];
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
  const cleanName = (n) => String(n || '')
    .replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, '')
    .replace(/\s+/g, ' ').trim().slice(0, 20) || 'Player';
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
  async function api(params) {
    const url = API + '?' + new URLSearchParams({ format: 'json', formatversion: '2', origin: '*', ...params });
    const r = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!r.ok) throw new Error(`Wikipedia request failed (${r.status})`);
    return r.json();
  }

  const articleCache = new Map();
  function fetchArticle(title) {
    const key = normTitle(title);
    if (articleCache.has(key)) return articleCache.get(key);
    const p = api({
      action: 'parse', page: title, prop: 'text|displaytitle', redirects: '1',
      disableeditsection: '1', disabletoc: '1', disablelimitreport: '1',
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
      exintro: '1', explaintext: '1', exsentences: '3', piprop: 'thumbnail', pithumbsize: '400',
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
  const usedPairs = new Set();
  async function validatePair(s, e) {
    const [a, b] = await Promise.all([fetchInfo(s), fetchInfo(e)]);
    if (sameTitle(a.title, b.title)) throw new Error('Start and target are the same article');
    return { start: a.title, end: b.title };
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
    const list = window.PAIRS[diff];
    let pool = list.filter((p) => !usedPairs.has(p.join('→')));
    if (!pool.length) {
      list.forEach((p) => usedPairs.delete(p.join('→')));
      pool = list;
    }
    const p = pool[Math.floor(Math.random() * pool.length)];
    usedPairs.add(p.join('→'));
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
    window.Flappy.close();
    game = {
      start: round.start, end: round.end, difficulty: round.difficulty, limit: round.limit || limitFor(round.difficulty),
      mode, ...extra,
      clicks: 0, penalties: 0, tabLeaves: 0, path: [], stack: [], current: null,
      startTime: 0, elapsed: 0, finished: false, result: null, busy: false, away: false, suppressAway: false,
    };
    show('game');
    $('#hud-target').textContent = round.end;
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

    if (result === 'finished' && g.mode !== 'duel') {
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
    if (result === 'timeout') toast("⏰ Time's up!", 3000);
    renderPath();
    renderRacers();
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
    if (!g || $('#results').classList.contains('hidden')) return;
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
      add('🐦 Flappy Wiki', '', () => window.Flappy.open());
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
    const text = `🏁 I got from ${g.start} to ${g.end} in ${plural(score(g), 'click')} on Wikirace. Can you beat me?\n${url}`;
    if (navigator.share) navigator.share({ text }).catch(() => copyText(text));
    else copyText(text);
  }

  // ---------- solo ----------
  async function startSolo(diff, custom) {
    toast('Picking articles…', 1500);
    try {
      const pair = await pickPair(diff, custom);
      startGame({ ...pair, difficulty: diff, limit: limitFor(diff) }, 'solo');
    } catch (e) {
      toast(e.message);
    }
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
    $('#spectate').classList.remove('hidden');
    renderSpectate();
  }

  function closeSpectate() {
    spec.id = null;
    spec.title = null;
    $('#spectate').classList.add('hidden');
  }

  async function renderSpectate() {
    if (!spec.id) return;
    const p = net.players[spec.id];
    if (!p) { closeSpectate(); return; }
    const who = $('#spec-who');
    const status = p.status === 'playing' ? `${plural(p.clicks, 'click')}${p.penalties ? ` +${p.penalties}` : ''}` : p.status === 'finished' ? `finished in ${plural(score(p), 'click')} 🎉` : p.status;
    who.innerHTML = `${avatar(p)}<div><b>${esc(p.name)}</b><div class="muted">${esc(status)} · target <b>${esc(net.round ? net.round.end : '')}</b></div></div>`;
    $('#spec-path').innerHTML = p.path && p.path.length
      ? p.path.map((s, i) => `${i ? '<span class="edge"></span>' : ''}<span class="node ${s.back ? 'back' : ''}">${esc(s.t)}</span>`).join('')
      : `<span class="muted">Live: now on <b>${esc(p.title)}</b></span>`;
    if (p.title && !sameTitle(p.title, spec.title)) {
      spec.title = p.title;
      try {
        const art = await fetchArticle(p.title);
        if (spec.title !== p.title) return;
        const built = buildArticle(art);
        $('#spec-title').textContent = built.title;
        $('#spec-article').replaceChildren(...built.nodes);
        $('#spectate .spec-body').scrollTop = 0;
      } catch {}
    }
  }

  // ---------- multiplayer networking (PeerJS; the host's browser is the authority) ----------
  const freshNet = () => ({
    peer: null, isHost: false, isPublic: false, matching: false, slot: null, code: null, myId: null,
    conns: new Map(), hostConn: null, players: {}, phase: 'lobby', round: null, roundNum: 0, diff: 'easy',
    joined: false, roundStartedAt: 0, autoStartAt: 0, nextAt: 0, timers: {},
    send() {},
  });
  let net = freshNet();
  let matchToken = 0;

  const newPlayer = (name, color) => ({
    name, color, status: 'lobby', clicks: 0, penalties: 0, tabLeaves: 0, title: '', time: 0, path: [],
    wins: 0, connected: true, inRound: false, verify: null, flagReason: '',
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
    return [...buf].map((n) => a[n % a.length]).join('');
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
      const peer = new Peer(isPublic ? publicPeerId(slot) : PEER_PREFIX + code, { debug: 0 });
      net.peer = peer;
      let opened = false;
      peer.on('open', () => {
        if (net !== me) return;
        opened = true;
        resolve();
        renderLobby();
      });
      peer.on('connection', (conn) => hostAccept(conn, me));
      peer.on('disconnected', () => { if (net === me && !peer.destroyed) peer.reconnect(); });
      peer.on('error', (err) => {
        if (net !== me) return;
        if (!opened) { reject(err); return; }
        if (err.type !== 'peer-unavailable') toast('Connection problem: ' + err.type);
      });
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
        setLobbyStatus('Send the invite link to your friends (up to 5 players), then start the race.');
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
      const p = net.players[conn.peer];
      if (!p) return;
      if (net.phase === 'lobby' || !p.inRound) delete net.players[conn.peer];
      else {
        p.connected = false;
        if (p.status === 'playing') p.status = 'left';
        checkRoundOver();
      }
      if (spec.id === conn.peer) closeSpectate();
      scheduleAutoStart();
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
        if (p) { p.name = cleanName(msg.name); break; }
        if (activeCount() >= MAX_PLAYERS) {
          if (conn && conn.open) conn.send({ type: 'error', message: `That room is full (max ${MAX_PLAYERS} players)` });
          setTimeout(() => conn && conn.close(), 400);
          return;
        }
        net.players[id] = newPlayer(cleanName(msg.name), nextColor());
        toast(`${net.players[id].name} joined`);
        scheduleAutoStart();
        break;
      }
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
      net.nextAt = Date.now() + 15000;
      net.timers.next = setTimeout(hostBackToLobby, 15000);
    }
  }

  // Each player gets their own view of the state: while you're racing you can't see where
  // anyone else is or which route they took.
  function stateFor(viewerId) {
    const viewer = net.players[viewerId];
    const racing = viewer && viewer.status === 'playing';
    const players = {};
    for (const [id, p] of Object.entries(net.players)) {
      players[id] = racing && id !== viewerId ? { ...p, title: '', path: [] } : p;
    }
    return {
      type: 'state', players, phase: net.phase, round: net.round, isPublic: net.isPublic,
      autoStartIn: net.autoStartAt ? Math.max(0, net.autoStartAt - Date.now()) : 0,
      nextIn: net.nextAt && net.phase === 'results' ? Math.max(0, net.nextAt - Date.now()) : 0,
    };
  }

  function broadcast() {
    for (const [id, conn] of net.conns) {
      if (conn.open && net.players[id]) conn.send(stateFor(id));
    }
    renderNet();
  }

  function scheduleAutoStart() {
    if (!net.isHost || !net.isPublic) return;
    clearTimeout(net.timers.auto);
    if (net.phase !== 'lobby' || activeCount() < 2) {
      net.autoStartAt = 0;
      return;
    }
    const delay = activeCount() >= MAX_PLAYERS ? 4000 : 20000;
    const at = Date.now() + delay;
    if (!net.autoStartAt || at < net.autoStartAt) net.autoStartAt = at;
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
      if (net.isPublic) net.diff = ['easy', 'medium', 'hard'][Math.floor(Math.random() * 3)];
      const pair = await pickPair(net.diff, [$('#room-start').value, $('#room-end').value]);
      net.roundNum++;
      const round = { ...pair, difficulty: net.diff, n: net.roundNum, limit: limitFor(net.diff) };
      for (const [id, p] of Object.entries(net.players)) {
        if (!p.connected) { delete net.players[id]; continue; }
        Object.assign(p, { status: 'playing', clicks: 0, penalties: 0, tabLeaves: 0, title: pair.start, time: 0, path: [], inRound: true, verify: null, flagReason: '' });
      }
      net.phase = 'playing';
      net.round = round;
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
      else Object.assign(p, { status: 'lobby', inRound: false });
    }
    goToLobbyScreen();
    scheduleAutoStart();
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

  // --- guest ---
  function attachGuest(conn, name, me, fail) {
    net.hostConn = conn;
    net.send = (msg) => { if (conn.open) conn.send(msg); };
    const onOpen = () => {
      if (net !== me) return;
      net.joined = true;
      conn.send({ type: 'hello', name });
      setLobbyStatus(net.isPublic ? 'Matched! Waiting for racers…' : "You're in! Waiting for the host to start.");
      renderLobby();
    };
    if (conn.open) onOpen();
    else conn.on('open', onOpen);
    conn.on('data', (d) => { if (net === me) guestHandle(d, fail); });
    conn.on('close', () => {
      if (net !== me) return;
      stopTimer();
      game = null;
      closeResults();
      closeSpectate();
      $('#countdown').classList.add('hidden');
      if (net.isPublic) {
        toast('The room closed. Finding you a new race…', 3000);
        quickMatch();
      } else {
        fail('The host closed the room');
      }
    });
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

    const me = net;
    const fail = (message) => {
      if (net !== me) return;
      toast(message, 4000);
      leaveRoomAndGoHome();
    };
    setTimeout(() => { if (!me.joined) fail("Couldn't reach that room. Check the code and that the host still has it open."); }, 15000);

    const peer = new Peer({ debug: 0 });
    net.peer = peer;
    peer.on('open', () => {
      if (net !== me) return;
      net.myId = peer.id;
      attachGuest(peer.connect(PEER_PREFIX + code, { reliable: true }), name, me, fail);
    });
    peer.on('error', (err) => {
      if (err.type === 'peer-unavailable') fail(`Room ${code} wasn't found. It may have closed.`);
      else if (!me.joined) fail('Connection problem: ' + err.type);
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
      net.autoStartAt = d.autoStartIn ? Date.now() + int(d.autoStartIn, 0, 60e3) : 0;
      net.nextAt = d.nextIn ? Date.now() + int(d.nextIn, 0, 60e3) : 0;
      if (net.phase === 'lobby' && prevPhase !== 'lobby') goToLobbyScreen();
      renderNet();
    } else if (d.type === 'start' && d.round) {
      const r = d.round;
      const round = { start: str(r.start, 300), end: str(r.end, 300), difficulty: str(r.difficulty, 20), n: int(r.n, 0, 1e9), limit: int(r.limit, 30e3, 30 * 60e3) };
      if (!round.start || !round.end) return;
      net.round = round;
      net.phase = 'playing';
      beginRound(round);
    } else if (d.type === 'kicked') {
      fail('The host removed you from the room');
    } else if (d.type === 'error') {
      fail(str(d.message, 200) || 'Could not join');
    }
  }

  // --- quick match: finds an open public room, or opens one for others to find ---
  function findPublicRoom(me) {
    return new Promise((resolve) => {
      const peer = new Peer({ debug: 0 });
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
        if (best) resolve({ peer, conn: best[1].conn, slot: best[0] });
        else {
          const free = [];
          for (let i = 0; i < PUBLIC_SLOTS; i++) if (!results.get(i)) free.push(i);
          peer.destroy();
          resolve({ free });
        }
      };
      const timer = setTimeout(finish, 6000);
      const check = () => { if (results.size >= PUBLIC_SLOTS) finish(); };
      peer.on('open', () => {
        for (let i = 0; i < PUBLIC_SLOTS; i++) {
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

    for (let attempt = 0; attempt < 3; attempt++) {
      const me = net;
      const res = await findPublicRoom(me);
      if (token !== matchToken) { if (res.peer) res.peer.destroy(); return; }
      if (res.conn) {
        Object.assign(net, { peer: res.peer, myId: res.peer.id, slot: res.slot, matching: false });
        const fail = (message) => { if (net === me) { toast(message, 4000); leaveRoomAndGoHome(); } };
        res.peer.on('error', (err) => { if (err.type !== 'peer-unavailable' && !me.joined) fail('Connection problem: ' + err.type); });
        attachGuest(res.conn, name, me, fail);
        return;
      }
      let retry = false;
      for (const slot of res.free) {
        try {
          await hostRoom({ name, isPublic: true, slot });
          if (token !== matchToken) { leaveRoom(); return; }
          setLobbyStatus('Waiting for other racers to join. The race starts automatically once 2 or more are here.');
          renderLobby();
          return;
        } catch (e) {
          if (token !== matchToken) return;
          leaveRoom();
          net = freshNet();
          Object.assign(net, { isPublic: true, matching: true });
          if (e && e.type === 'unavailable-id') { retry = true; break; } // someone just took it: search again
          toast('Matchmaking failed: ' + (e && e.type || 'error'));
          show('home');
          return;
        }
      }
      if (!retry) break;
    }
    if (token !== matchToken) return;
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

  function beginRound(round) {
    fetchArticle(round.start).catch(() => {});
    fetchInfo(round.end).catch(() => {});
    closeResults();
    closeSpectate();
    window.Flappy.close();
    const overlay = $('#countdown');
    $('#cd-diff').textContent = `${DIFF_LABEL[round.difficulty] || ''} · ${fmtTime(round.limit)} on the clock`;
    $('#cd-route').innerHTML = `${esc(round.start)} → <b>${esc(round.end)}</b>`;
    overlay.classList.remove('hidden');
    let n = 3;
    const step = () => {
      const num = $('#cd-num');
      num.textContent = n > 0 ? n : 'Go!';
      num.style.animation = 'none';
      void num.offsetWidth;
      num.style.animation = '';
      if (n < 0) {
        overlay.classList.add('hidden');
        if (net.round && net.round.n === round.n && net.phase === 'playing') startGame(round, 'duel');
        return;
      }
      n--;
      setTimeout(step, n < 0 ? 600 : 900);
    };
    step();
  }

  function leaveRoom() {
    const old = net;
    clearTimers();
    net = freshNet();
    try { old.hostConn && old.hostConn.close(); } catch {}
    for (const c of old.conns.values()) { try { c.close(); } catch {} }
    try { old.peer && old.peer.destroy(); } catch {}
    if (location.search.includes('room=')) history.replaceState(null, '', baseUrl());
  }

  function leaveRoomAndGoHome() {
    matchToken++;
    leaveRoom();
    stopTimer();
    game = null;
    closeResults();
    closeSpectate();
    window.Flappy.close();
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
    $('#room-label').textContent = pub ? 'Quick match' : 'Room code';
    $('#room-code').textContent = pub ? (net.matching ? 'Searching…' : 'Public room') : net.code || '·····';
    $('#room-code').classList.toggle('pub', pub);
    $('#invite').classList.toggle('hidden', pub);
    $('#invite-link').value = net.code && !pub ? inviteLink() : '';
    $('#skip-room').classList.toggle('hidden', !pub || net.matching);
    $('#host-controls').classList.toggle('hidden', !net.isHost || pub);
    $('#guest-wait').classList.toggle('hidden', net.isHost && !pub);

    const count = activeCount();
    let wait;
    if (net.matching) wait = '🔎 Searching for an open room…';
    else if (net.phase === 'playing') wait = "A race is in progress. You'll be in the next one. Spectate someone or play Flappy meanwhile.";
    else if (net.phase === 'results') wait = 'Round just finished. Next one coming up…';
    else if (pub && count < 2) wait = 'Waiting for at least one more racer to join…';
    else if (pub && net.autoStartAt) wait = `Race starts in <b data-autostart>${Math.ceil((net.autoStartAt - Date.now()) / 1000)}</b>s (random difficulty)`;
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
      return `<li class="${id === net.myId ? 'me' : ''}">
        ${avatar(pl)}<span class="pname">${esc(p.name)}</span>
        ${id === 'host' ? `<span class="badge host">${pub ? 'room host' : 'host'}</span>` : ''}
        ${p.wins ? `<span class="wins">🏆 ${p.wins}</span>` : ''}
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
    if ($('#lobby').classList.contains('active')) renderLobby();
    renderRacers();
    renderResults();
    renderSpectate();
  }

  // Small 1s ticker for countdown labels (auto-start, next round).
  setInterval(() => {
    const a = $('[data-autostart]');
    if (a && net.autoStartAt) a.textContent = Math.max(0, Math.ceil((net.autoStartAt - Date.now()) / 1000));
    const n = $('[data-next-in]');
    if (n && net.nextAt) n.textContent = `Next round in ${Math.max(0, Math.ceil((net.nextAt - Date.now()) / 1000))}s`;
  }, 500);

  // ---------- wiring ----------
  function init() {
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

    $('#quick-match').addEventListener('click', quickMatch);
    $('#create-room').addEventListener('click', createRoom);
    $('#join-form').addEventListener('submit', (e) => { e.preventDefault(); joinRoom($('#join-code').value); });
    $('#leave-lobby').addEventListener('click', leaveRoomAndGoHome);
    $('#skip-room').addEventListener('click', quickMatch);
    $('#copy-invite').addEventListener('click', () => copyText(inviteLink()));
    $$('#room-diff .btn').forEach((b) => b.addEventListener('click', () => {
      net.diff = b.dataset.diff;
      $$('#room-diff .btn').forEach((x) => x.classList.toggle('selected', x === b));
      $('#room-custom').classList.toggle('hidden', net.diff !== 'custom');
    }));
    $('#start-race').addEventListener('click', hostStartRace);

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
      if (e.target.closest('[data-flappy]')) window.Flappy.open();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      $('#panel').classList.remove('open');
      closeSpectate();
    });
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
          startGame({ ...pair, difficulty: d, limit: limitFor(d) }, 'challenge', { challenge });
        } catch (err) {
          toast(err.message);
        }
      });
    }
  }

  init();
})();
