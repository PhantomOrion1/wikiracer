(() => {
  'use strict';

  const API = 'https://en.wikipedia.org/w/api.php';
  const PEER_PREFIX = 'wikirace-room-v1-';
  const MAX_PLAYERS = 8;
  // Namespaces / interwiki prefixes that don't count as articles.
  const BLOCKED_NS = new Set([
    'file', 'image', 'media', 'category', 'help', 'special', 'wikipedia', 'wp', 'project',
    'template', 'portal', 'talk', 'user', 'user talk', 'wikipedia talk', 'file talk',
    'template talk', 'category talk', 'help talk', 'portal talk', 'draft', 'draft talk',
    'module', 'module talk', 'mediawiki', 'mediawiki talk', 'timedtext', 'book', 'gadget',
    'wikt', 'wiktionary', 'commons', 'c', 's', 'q', 'n', 'b', 'v', 'voy', 'species', 'd',
    'm', 'meta', 'mw', 'foundation', 'wmf', 'incubator',
  ]);

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
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const baseUrl = () => location.origin + location.pathname;

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
    const r = await fetch(url);
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
      return {
        title: pg.title,
        description: pg.description || '',
        extract: pg.extract || '',
        thumb: pg.thumbnail ? pg.thumbnail.source : '',
      };
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

  // ---------- game ----------
  let game = null;

  function startGame(round, mode, extra = {}) {
    stopTimer();
    closeResults();
    game = {
      start: round.start, end: round.end, difficulty: round.difficulty, mode, ...extra,
      clicks: 0, path: [], stack: [], current: null,
      startTime: 0, elapsed: 0, finished: false, gaveUp: false, busy: false,
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
    if (game && game.startTime && !game.finished) $('#hud-time').textContent = fmtTime(Date.now() - game.startTime);
  }

  function updateHud() {
    if (!game) return;
    $('#hud-clicks').textContent = game.clicks;
    $('#hud-time').textContent = fmtTime(game.finished ? game.elapsed : game.startTime ? Date.now() - game.startTime : 0);
    $('#btn-back').disabled = game.finished || game.stack.length < 2;
    $('#btn-giveup').disabled = game.finished;
  }

  async function goTo(title, { count = true, back = false } = {}) {
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
        show(net.code ? 'lobby' : 'home');
      }
      return;
    } finally {
      g.busy = false;
      $('#loading').classList.add('hidden');
    }
    if (game !== g || g.finished) return;

    if (count) g.clicks++;
    g.current = art.title;
    g.path.push({ title: art.title, back });
    if (back) g.stack.pop();
    else g.stack.push(art.title);
    if (!g.startTime) g.startTime = Date.now();

    renderArticle(art);
    $('#panel').classList.remove('open');
    updateHud();
    renderPath();
    if (g.mode === 'duel') net.send({ type: 'progress', clicks: g.clicks, title: g.current });
    if (sameTitle(art.title, g.end)) finishGame(false);
  }

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
    return { type: 'article', title };
  }

  function renderArticle(art) {
    const titleDoc = new DOMParser().parseFromString(art.displaytitle || '', 'text/html');
    $('#article-title').textContent = titleDoc.body.textContent || art.title;

    const doc = new DOMParser().parseFromString(art.html, 'text/html');
    $$('script, link, meta, .mw-editsection, sup.reference, .mw-empty-elt, .ambox, .ombox, .mw-jump-link, .navbar, .noprint.portal, .mw-cite-backlink', doc)
      .forEach((n) => n.remove());
    $$('a', doc).forEach((a) => {
      const info = classifyLink(a);
      if (info.type === 'article') {
        a.dataset.wr = info.title;
        a.setAttribute('href', '#');
      } else if (info.type === 'anchor') {
        a.dataset.anchor = info.id;
      } else if (info.type === 'dead') {
        a.dataset.wrDead = info.reason;
        a.classList.add('wr-dead');
        a.setAttribute('href', '#');
        a.removeAttribute('target');
      }
    });
    $('#article').replaceChildren(...doc.body.childNodes);
    window.scrollTo(0, 0);
  }

  function onArticleClick(e) {
    const a = e.target.closest('a');
    if (!a || !$('#article').contains(a)) return;
    e.preventDefault();
    if (e.type === 'auxclick') return;
    if (a.dataset.wr) {
      goTo(a.dataset.wr);
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
    if (!confirm('Give up this race?')) return;
    finishGame(true);
  }

  function finishGame(gaveUp) {
    const g = game;
    if (!g || g.finished) return;
    g.finished = true;
    g.gaveUp = gaveUp;
    g.elapsed = g.startTime ? Date.now() - g.startTime : 0;
    stopTimer();
    updateHud();

    if (!gaveUp) {
      const key = `wr-best:${g.start}→${g.end}`;
      const prev = store.get(key);
      g.prevBest = prev;
      if (!prev || g.clicks < prev.clicks || (g.clicks === prev.clicks && g.elapsed < prev.time)) {
        g.newBest = true;
        store.set(key, { clicks: g.clicks, time: g.elapsed });
      }
    }
    if (g.mode === 'duel') {
      net.send({ type: gaveUp ? 'giveup' : 'finish', clicks: g.clicks, time: g.elapsed, path: g.path.map((p) => p.title) });
    }
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
      .map((p) => `<li class="${p.back ? 'back' : ''}">${p.back ? '↩ ' : ''}${esc(p.title)}</li>`)
      .join('');
  }

  function pathInline(titles) {
    return `<div class="path-inline">${titles.map(esc).join('<span class="arrow">→</span>')}</div>`;
  }

  // ---------- results ----------
  function closeResults() {
    $('#results').classList.add('hidden');
  }

  function showResults() {
    $('#results').classList.remove('hidden');
    renderResults();
  }

  function renderResults() {
    const g = game;
    if (!g || $('#results').classList.contains('hidden')) return;
    const body = $('#results-body');
    const actions = $('#results-actions');
    const headline = g.gaveUp ? '😮‍💨 You gave up' : '🎉 You made it!';
    const titles = g.path.map((p) => p.title);
    let html = `<h2>${headline}</h2>
      <div class="muted">${esc(g.start)} → <b>${esc(g.end)}</b></div>
      <div class="big-stats">
        <div><b>${g.gaveUp ? '—' : g.clicks}</b><small>clicks</small></div>
        <div><b>${fmtTime(g.elapsed)}</b><small>time</small></div>
        ${g.mode !== 'duel' && !g.gaveUp ? `<div><b>${g.newBest ? '🏅 New' : g.prevBest.clicks}</b><small>${g.newBest ? 'personal best' : 'your best'}</small></div>` : ''}
      </div>`;

    if (g.mode === 'challenge' && g.challenge && g.challenge.clicks && !g.gaveUp) {
      const c = g.challenge;
      const verdict = g.clicks < c.clicks ? `You beat ${esc(c.by)}! 🔥` : g.clicks === c.clicks ? `Tied with ${esc(c.by)}.` : `${esc(c.by)} wins this one.`;
      html += `<p><b>${verdict}</b> <span class="muted">${esc(c.by)} took ${plural(c.clicks, 'click')}.</span></p>`;
    }

    if (g.mode === 'duel') {
      const done = net.phase === 'results';
      const r = ranked();
      const winner = done && r[0] && r[0].status === 'finished' ? r[0] : null;
      html += `<h3 style="margin-top:16px">${done ? (winner ? `🏆 ${esc(winner.name)} wins the round!` : 'Round over') : 'Leaderboard (live)'}</h3>`;
      html += `<ul class="player-list">${r.map((p, i) => racerRow(p, i, true)).join('')}</ul>`;
    }

    html += `<h3 style="margin-top:16px">Your path</h3>${pathInline(titles)}`;
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
      if (net.isHost) add(net.phase === 'results' ? 'Next round' : 'End round → lobby', 'primary', hostBackToLobby);
      else actions.insertAdjacentHTML('beforeend', `<p class="muted center" style="flex-basis:100%;margin:0">${net.phase === 'results' ? 'Waiting for the host to start the next round…' : 'Waiting for everyone to finish…'}</p>`);
      add('Leave room', 'ghost', () => { leaveRoom(); closeResults(); show('home'); });
    } else {
      if (!g.gaveUp) add('Challenge a friend', 'primary', () => shareChallenge(g));
      if (['easy', 'medium', 'hard', 'random'].includes(g.difficulty)) add('Next race', '', () => startSolo(g.difficulty));
      add('Home', 'ghost', () => { closeResults(); game = null; show('home'); });
    }
  }

  function shareChallenge(g) {
    const params = new URLSearchParams({ s: g.start, e: g.end, c: String(g.clicks) });
    const name = $('#name-input').value.trim();
    if (name) params.set('by', name);
    const url = `${baseUrl()}?${params}`;
    const text = `🏁 I got from ${g.start} to ${g.end} in ${plural(g.clicks, 'click')} on Wikirace. Can you beat me?\n${url}`;
    if (navigator.share) navigator.share({ text }).catch(() => copyText(text));
    else copyText(text);
  }

  // ---------- solo ----------
  async function startSolo(diff, custom) {
    toast('Picking articles…', 1500);
    try {
      const pair = await pickPair(diff, custom);
      startGame({ ...pair, difficulty: diff }, 'solo');
    } catch (e) {
      toast(e.message);
    }
  }

  // ---------- duel networking (PeerJS, host relays state to everyone) ----------
  const freshNet = () => ({
    peer: null, isHost: false, code: null, myId: null, conns: new Map(), hostConn: null,
    players: {}, phase: 'lobby', round: null, roundNum: 0, diff: 'easy', joined: false,
    send() {},
  });
  let net = freshNet();

  const newPlayer = (name) => ({ name, status: 'lobby', clicks: 0, title: '', time: 0, path: [], wins: 0, connected: true, inRound: false });
  const cleanName = (n) => String(n || 'Player').replace(/\s+/g, ' ').trim().slice(0, 20) || 'Player';
  const makeCode = () => {
    const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({ length: 5 }, () => a[Math.floor(Math.random() * a.length)]).join('');
  };
  const inviteLink = () => `${baseUrl()}?room=${net.code}`;

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
    const order = { finished: 0, playing: 1, gaveup: 2, left: 3 };
    return Object.entries(net.players)
      .map(([id, p]) => ({ id, ...p }))
      .filter((p) => p.inRound)
      .sort((a, b) =>
        (order[a.status] ?? 4) - (order[b.status] ?? 4) ||
        (a.status === 'finished' ? a.clicks - b.clicks || a.time - b.time : b.clicks - a.clicks));
  }

  function createRoom() {
    const name = getName();
    if (!name) return;
    if (typeof Peer === 'undefined') return toast('Multiplayer failed to load, check your connection');
    leaveRoom();
    net = freshNet();
    net.isHost = true;
    net.myId = 'host';
    net.code = makeCode();
    net.players.host = newPlayer(name);
    net.send = (msg) => hostHandle('host', msg);
    show('lobby');
    setLobbyStatus('Creating room…');
    renderLobby();

    const me = net;
    const peer = new Peer(PEER_PREFIX + net.code, { debug: 0 });
    net.peer = peer;
    peer.on('open', () => {
      if (net !== me) return;
      setLobbyStatus('Send the invite link to your friends, then start the race when everyone is in.');
      renderLobby();
    });
    peer.on('connection', (conn) => {
      conn.on('open', () => {
        const active = Object.values(net.players).filter((p) => p.connected).length;
        if (active >= MAX_PLAYERS) {
          conn.send({ type: 'error', message: 'That room is full' });
          setTimeout(() => conn.close(), 400);
          return;
        }
        net.conns.set(conn.peer, conn);
      });
      conn.on('data', (d) => { if (net === me && net.conns.has(conn.peer)) hostHandle(conn.peer, d); });
      conn.on('close', () => {
        if (net !== me) return;
        net.conns.delete(conn.peer);
        const p = net.players[conn.peer];
        if (p) {
          if (net.phase === 'lobby' || !p.inRound) delete net.players[conn.peer];
          else {
            p.connected = false;
            if (p.status === 'playing') p.status = 'left';
            checkRoundOver();
          }
          broadcast();
        }
      });
    });
    peer.on('disconnected', () => { if (net === me && !peer.destroyed) peer.reconnect(); });
    peer.on('error', (err) => {
      if (net !== me) return;
      if (err.type === 'unavailable-id') { createRoom(); return; }
      if (err.type === 'peer-unavailable') return;
      toast('Connection problem: ' + err.type);
    });
  }

  function hostHandle(id, msg) {
    if (!msg || typeof msg !== 'object') return;
    const p = net.players[id];
    switch (msg.type) {
      case 'hello':
        net.players[id] = { ...newPlayer(cleanName(msg.name)), wins: p ? p.wins : 0 };
        break;
      case 'progress':
        if (p && p.status === 'playing') {
          p.clicks = Number(msg.clicks) || 0;
          p.title = String(msg.title || '').slice(0, 300);
        }
        break;
      case 'finish':
      case 'giveup':
        if (p && p.status === 'playing') {
          p.status = msg.type === 'finish' ? 'finished' : 'gaveup';
          p.clicks = Number(msg.clicks) || 0;
          p.time = Number(msg.time) || 0;
          p.path = Array.isArray(msg.path) ? msg.path.slice(0, 300).map((t) => String(t).slice(0, 300)) : [];
          p.title = p.path[p.path.length - 1] || p.title;
          checkRoundOver();
        }
        break;
      default:
        return;
    }
    broadcast();
  }

  function checkRoundOver() {
    if (net.phase !== 'playing') return;
    const racers = Object.values(net.players).filter((p) => p.inRound);
    if (racers.some((p) => p.status === 'playing')) return;
    net.phase = 'results';
    const top = ranked()[0];
    if (top && top.status === 'finished') net.players[top.id].wins++;
  }

  function broadcast() {
    const msg = { type: 'state', players: net.players, phase: net.phase, round: net.round };
    for (const conn of net.conns.values()) if (conn.open) conn.send(msg);
    renderNet();
  }

  async function hostStartRace() {
    const btn = $('#start-race');
    btn.disabled = true;
    btn.textContent = 'Picking articles…';
    try {
      const pair = await pickPair(net.diff, [$('#room-start').value, $('#room-end').value]);
      net.roundNum++;
      const round = { ...pair, difficulty: net.diff, n: net.roundNum };
      for (const [id, p] of Object.entries(net.players)) {
        if (!p.connected) { delete net.players[id]; continue; }
        Object.assign(p, { status: 'playing', clicks: 0, title: pair.start, time: 0, path: [], inRound: true });
      }
      net.phase = 'playing';
      net.round = round;
      for (const conn of net.conns.values()) if (conn.open) conn.send({ type: 'start', round });
      broadcast();
      beginRound(round);
    } catch (e) {
      toast(e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Start race';
    }
  }

  function hostBackToLobby() {
    if (!net.isHost) return;
    if (net.phase === 'playing') {
      for (const p of Object.values(net.players)) if (p.status === 'playing') p.status = 'gaveup';
      checkRoundOver();
    }
    net.phase = 'lobby';
    for (const p of Object.values(net.players)) Object.assign(p, { status: 'lobby', inRound: false });
    broadcast();
    goToLobbyScreen();
  }

  function joinRoom(rawCode) {
    const code = String(rawCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 5) return toast('Room codes are 5 characters');
    const name = getName();
    if (!name) return;
    if (typeof Peer === 'undefined') return toast('Multiplayer failed to load, check your connection');
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
      leaveRoom();
      show('home');
    };
    const timeout = setTimeout(() => { if (!me.joined) fail("Couldn't reach that room. Check the code and that the host still has it open."); }, 15000);

    const peer = new Peer({ debug: 0 });
    net.peer = peer;
    peer.on('open', (id) => {
      if (net !== me) return;
      net.myId = id;
      const conn = peer.connect(PEER_PREFIX + code, { reliable: true });
      net.hostConn = conn;
      net.send = (msg) => { if (conn.open) conn.send(msg); };
      conn.on('open', () => {
        if (net !== me) return;
        net.joined = true;
        clearTimeout(timeout);
        conn.send({ type: 'hello', name });
        setLobbyStatus('You\'re in! Waiting for the host to start.');
      });
      conn.on('data', (d) => { if (net === me) guestHandle(d, fail); });
      conn.on('close', () => {
        if (net !== me) return;
        if (game && !game.finished) { stopTimer(); game = null; }
        closeResults();
        fail('The host closed the room');
      });
    });
    peer.on('error', (err) => {
      if (err.type === 'peer-unavailable') fail(`Room ${code} wasn't found. It may have closed.`);
      else if (!me.joined) fail('Connection problem: ' + err.type);
    });
  }

  function guestHandle(d, fail) {
    if (!d || typeof d !== 'object') return;
    if (d.type === 'state') {
      const prevPhase = net.phase;
      net.players = d.players || {};
      net.phase = d.phase;
      net.round = d.round;
      if (d.phase === 'lobby' && prevPhase !== 'lobby') goToLobbyScreen();
      renderNet();
    } else if (d.type === 'start' && d.round) {
      beginRound(d.round);
    } else if (d.type === 'error') {
      fail(d.message || 'Could not join');
    }
  }

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
    const overlay = $('#countdown');
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
    net = freshNet();
    try { old.hostConn && old.hostConn.close(); } catch {}
    for (const c of old.conns.values()) { try { c.close(); } catch {} }
    try { old.peer && old.peer.destroy(); } catch {}
    if (location.search.includes('room=')) history.replaceState(null, '', baseUrl());
  }

  function setLobbyStatus(text) {
    $('#lobby-status').textContent = text;
  }

  function racerRow(p, i, showTitle) {
    const me = p.id === net.myId;
    let meta;
    if (p.status === 'finished') meta = `✔ ${plural(p.clicks, 'click')} · ${fmtTime(p.time)}`;
    else if (p.status === 'gaveup') meta = 'gave up';
    else if (p.status === 'left') meta = 'left';
    else meta = `racing · ${plural(p.clicks, 'click')}${showTitle && p.title ? ` · on ${esc(p.title)}` : ''}`;
    const rank = p.status === 'finished' ? `<span class="rank ${i === 0 ? 'gold' : ''}">${i === 0 ? '🏆' : i + 1}</span>` : '<span class="rank">·</span>';
    const pathHtml = showTitle && p.path && p.path.length && p.id !== net.myId ? pathInline(p.path) : '';
    return `<li class="${me ? 'me' : ''} ${p.connected === false ? 'off' : ''}" style="flex-wrap:wrap">
      ${rank}<span class="pname">${esc(p.name)}</span><span class="pmeta">${meta}</span>
      ${pathHtml ? `<div style="flex-basis:100%">${pathHtml}</div>` : ''}</li>`;
  }

  function renderLobby() {
    $('#room-code').textContent = net.code || '·····';
    $('#invite-link').value = net.code ? inviteLink() : '';
    $('#host-controls').classList.toggle('hidden', !net.isHost);
    $('#guest-wait').classList.toggle('hidden', net.isHost);
    $('#guest-wait p').textContent = net.phase === 'playing'
      ? 'A race is in progress. You\'ll be in the next one.'
      : 'Waiting for the host to start the race…';
    const entries = Object.entries(net.players);
    $('#lobby-players').innerHTML = entries.length ? entries.map(([id, p]) => {
      let meta = '';
      if (p.inRound) {
        meta = p.status === 'finished' ? `finished · ${plural(p.clicks, 'click')}` : p.status === 'playing' ? `racing · ${plural(p.clicks, 'click')}` : p.status;
      }
      return `<li class="${id === net.myId ? 'me' : ''}">
        <span class="pname">${esc(p.name)}</span>
        ${id === 'host' ? '<span class="badge host">host</span>' : ''}
        ${p.wins ? `<span class="wins">🏆 ${p.wins}</span>` : ''}
        ${meta ? `<span class="pmeta">${esc(meta)}</span>` : ''}
      </li>`;
    }).join('') : '<li class="muted">Connecting…</li>';
    const ready = net.isHost && net.peer && net.peer.open;
    $('#start-race').disabled = !ready || net.phase === 'playing';
  }

  function renderRacers() {
    if (!game || game.mode !== 'duel') return;
    const r = ranked();
    // Opponents' current article stays hidden until you've finished, so nobody can copy a route.
    const reveal = game.finished;
    $('#racers').innerHTML = r.map((p, i) => racerRow(p, i, reveal)).join('');
    $('#racers-strip').innerHTML = r.filter((p) => p.id !== net.myId).map((p) => {
      const s = p.status === 'finished' ? `✔ ${p.clicks}` : p.status === 'playing' ? `${p.clicks} clicks` : p.status;
      return `<span class="chip"><b>${esc(p.name)}</b> ${esc(s)}</span>`;
    }).join('');
  }

  function renderNet() {
    if ($('#lobby').classList.contains('active')) renderLobby();
    renderRacers();
    renderResults();
  }

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

    $('#create-room').addEventListener('click', createRoom);
    $('#join-form').addEventListener('submit', (e) => { e.preventDefault(); joinRoom($('#join-code').value); });
    $('#leave-lobby').addEventListener('click', () => { leaveRoom(); show('home'); });
    $('#copy-invite').addEventListener('click', () => copyText(inviteLink()));
    $$('#room-diff .btn').forEach((b) => b.addEventListener('click', () => {
      net.diff = b.dataset.diff;
      $$('#room-diff .btn').forEach((x) => x.classList.toggle('selected', x === b));
      $('#room-custom').classList.toggle('hidden', net.diff !== 'custom');
    }));
    $('#start-race').addEventListener('click', hostStartRace);

    $('#article').addEventListener('click', onArticleClick);
    $('#article').addEventListener('auxclick', onArticleClick);
    $('#btn-back').addEventListener('click', goBack);
    $('#btn-giveup').addEventListener('click', giveUp);
    $('#btn-panel').addEventListener('click', () => $('#panel').classList.toggle('open'));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#panel').classList.remove('open'); });

    window.addEventListener('beforeunload', (e) => {
      if ((game && !game.finished) || (net.isHost && net.conns.size)) { e.preventDefault(); e.returnValue = ''; }
    });

    // Invite / challenge links
    const q = new URLSearchParams(location.search);
    const banner = $('#challenge-banner');
    if (q.get('room')) {
      const code = q.get('room').toUpperCase().slice(0, 5);
      $('#join-code').value = code;
      banner.innerHTML = `<h2>You've been invited to a duel</h2>
        <p class="muted">Room <b>${esc(code)}</b>. Enter your name above, then join.</p>
        <button class="btn primary wide" id="banner-join">Join room ${esc(code)}</button>`;
      banner.classList.remove('hidden');
      $('#banner-join').addEventListener('click', () => joinRoom(code));
      if (!nameInput.value) nameInput.focus();
    } else if (q.get('s') && q.get('e')) {
      const challenge = { by: cleanName(q.get('by') || 'A friend'), clicks: parseInt(q.get('c'), 10) || 0 };
      const s = q.get('s');
      const e = q.get('e');
      banner.innerHTML = `<h2>${esc(challenge.by)} challenged you</h2>
        <div class="route-big">${esc(s)} → <span style="color:var(--accent)">${esc(e)}</span></div>
        ${challenge.clicks ? `<p class="muted">Their score: <b>${plural(challenge.clicks, 'click')}</b>. Can you do better?</p>` : ''}
        <button class="btn primary wide" id="banner-play">Accept challenge</button>`;
      banner.classList.remove('hidden');
      $('#banner-play').addEventListener('click', async () => {
        try {
          const pair = await validatePair(s, e);
          startGame({ ...pair, difficulty: 'challenge' }, 'challenge', { challenge });
        } catch (err) {
          toast(err.message);
        }
      });
    }
  }

  init();
})();
