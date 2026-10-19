// Lane Rush: a tiny top-down racing game to play while you wait.
// Three lanes, driving left → right; tap the top/bottom half (or ↑ ↓, W/S) to change lanes. Dodge traffic,
// grab checkered flags for bonus points. It speeds up the longer you last.
window.MiniGame = (() => {
  'use strict';
  // Landscape: the car drives left → right across three horizontal lanes.
  const W = 640, H = 252;
  const LANES = 3, ROAD_Y = 12, ROAD_H = H - 24, LANE_H = ROAD_H / LANES;
  const CAR_L = 78, CAR_W = 42, CAR_X = 70;
  const laneY = (l) => ROAD_Y + LANE_H * l + LANE_H / 2;
  let canvas, ctx, raf = 0, last = 0, s = null, open = false, slot = null;
  let best = 0;
  try { best = parseInt(localStorage.getItem('wr-lanerush-best'), 10) || 0; } catch {}

  const css = (name, fallback) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

  function reset() {
    s = {
      mode: 'ready', t: 0, lane: 1, y: laneY(1), speed: 400, dist: 0, bonus: 0, things: [], spawn: 0.35, streaks: [],
      stripe: 0, crashAt: 0, flash: 0, pops: [],
    };
  }
  const score = () => Math.floor(s.dist / 40) + s.bonus;

  function steer(dir) {
    if (!s) return;
    if (s.mode === 'dead') { if (s.t - s.crashAt < 0.6) return; reset(); }
    if (s.mode === 'ready') s.mode = 'play';
    if (dir) s.lane = Math.max(0, Math.min(LANES - 1, s.lane + dir));
  }

  function crash() {
    s.mode = 'dead';
    s.crashAt = s.t;
    s.flash = 1;
    if (score() > best) {
      best = score();
      try { localStorage.setItem('wr-lanerush-best', String(best)); } catch {}
    }
    updateBest();
    dispatchEvent(new CustomEvent('minigame-score', { detail: score() }));
  }

  function spawnRow() {
    // Block one or two lanes, always leaving a way through; sometimes drop a flag in an open lane.
    const blocked = Math.random() < 0.35 ? 2 : 1;
    const lanes = [0, 1, 2].sort(() => Math.random() - 0.5);
    for (let i = 0; i < blocked; i++) {
      s.things.push({ kind: 'car', lane: lanes[i], x: W + CAR_L, hue: Math.random() < 0.5 ? 0 : 1 });
    }
    if (Math.random() < 0.35) s.things.push({ kind: 'flag', lane: lanes[blocked], x: W + CAR_L + 50 });
  }

  function update(dt) {
    s.t += dt;
    s.flash = Math.max(0, s.flash - dt * 3);
    s.y += (laneY(s.lane) - s.y) * Math.min(1, dt * 14);
    s.pops = s.pops.filter((p) => (p.life -= dt) > 0);
    if (s.mode !== 'play') return;
    s.speed = Math.min(1000, 400 + s.t * 15);
    s.dist += s.speed * dt;
    s.stripe = (s.stripe + s.speed * dt) % 60;
    s.spawn -= dt;
    if (s.spawn <= 0) {
      spawnRow();
      s.spawn = Math.max(0.42, 1.05 - s.t * 0.012) * (420 / s.speed) * 1.55;
    }
    if (Math.random() < dt * 18) s.streaks.push({ x: W + 10, y: ROAD_Y + 6 + Math.random() * (ROAD_H - 12), len: 30 + Math.random() * 60 });
    for (const k of s.streaks) k.x -= s.speed * 1.6 * dt;
    s.streaks = s.streaks.filter((k) => k.x + k.len > 0);
    for (const o of s.things) {
      o.x -= (o.kind === 'car' ? s.speed * 0.55 : s.speed) * dt;
      const len = o.kind === 'flag' ? 30 : CAR_L;
      const hitX = o.x < CAR_X + CAR_L - 8 && o.x + len > CAR_X + 8;
      const sameLane = Math.abs(laneY(o.lane) - s.y) < LANE_H * 0.55;
      if (hitX && sameLane && !o.gone) {
        if (o.kind === 'flag') { o.gone = true; s.bonus += 25; s.pops.push({ x: CAR_X + CAR_L / 2, y: laneY(o.lane) - 24, life: 0.7 }); }
        else { crash(); return; }
      }
    }
    s.things = s.things.filter((o) => o.x > -CAR_L - 40 && !o.gone);
  }

  function rect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }

  // roundRect needs Safari 16+; plain rectangles are fine on older browsers.
  const rr = (x, y, w, h, r, c) => { ctx.fillStyle = c; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); ctx.fill(); };

  // Player: a top-down open-wheel race car pointing right.
  function drawRacer(x, cy, red) {
    const L = CAR_L, Wd = CAR_W;
    // wheels
    rr(x + 8, cy - Wd / 2 - 4, 20, 11, 3, '#0d0d0d'); rr(x + 8, cy + Wd / 2 - 7, 20, 11, 3, '#0d0d0d');
    rr(x + L - 30, cy - Wd / 2 - 2, 18, 10, 3, '#0d0d0d'); rr(x + L - 30, cy + Wd / 2 - 8, 18, 10, 3, '#0d0d0d');
    // rear wing, sidepods, nose, front wing
    rr(x - 2, cy - Wd / 2 + 2, 8, Wd - 4, 2, '#111');
    rr(x + 6, cy - 13, 44, 26, 8, red);
    ctx.fillStyle = red; ctx.beginPath(); ctx.moveTo(x + 46, cy - 9); ctx.lineTo(x + L + 4, cy - 3); ctx.lineTo(x + L + 4, cy + 3); ctx.lineTo(x + 46, cy + 9); ctx.fill();
    rr(x + L - 4, cy - Wd / 2 + 4, 7, Wd - 8, 2, '#111');
    // stripe + cockpit + helmet
    rect(x + 8, cy - 2, L - 8, 4, '#f4f2ed');
    rr(x + 26, cy - 7, 20, 14, 6, '#111');
    ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(x + 36, cy, 5, 0, Math.PI * 2); ctx.fill();
  }

  // Traffic: a rounded road car pointing right (driving slower than you).
  function drawTraffic(x, cy, body) {
    const L = CAR_L - 6, Wd = CAR_W - 4;
    rr(x + 10, cy - Wd / 2 - 3, 16, 7, 2, '#0d0d0d'); rr(x + 10, cy + Wd / 2 - 4, 16, 7, 2, '#0d0d0d');
    rr(x + L - 26, cy - Wd / 2 - 3, 16, 7, 2, '#0d0d0d'); rr(x + L - 26, cy + Wd / 2 - 4, 16, 7, 2, '#0d0d0d');
    rr(x, cy - Wd / 2, L, Wd, 10, body);
    rr(x + L - 26, cy - Wd / 2 + 5, 12, Wd - 10, 4, 'rgba(20,20,20,.75)');
    rr(x + 12, cy - Wd / 2 + 5, 10, Wd - 10, 4, 'rgba(20,20,20,.55)');
    rect(x + L - 4, cy - Wd / 2 + 4, 3, 6, '#ffe8a3'); rect(x + L - 4, cy + Wd / 2 - 10, 3, 6, '#ffe8a3');
  }

  function draw() {
    const red = css('--accent', '#e63323');
    // verge (with a little texture that scrolls), kerbs, asphalt
    rect(0, 0, W, H, '#151515');
    for (let x = -60 - (s.stripe % 60); x < W + 60; x += 30) {
      const on = Math.floor((x + s.stripe) / 30) % 2 === 0;
      rect(x, ROAD_Y - 12, 30, 12, on ? red : '#f4f2ed');
      rect(x, ROAD_Y + ROAD_H, 30, 12, on ? red : '#f4f2ed');
    }
    rect(0, ROAD_Y, W, ROAD_H, '#2b2b2b');
    for (let l = 1; l < LANES; l++) for (let x = -60 - (s.stripe % 60); x < W + 60; x += 60) rect(x, ROAD_Y + LANE_H * l - 2, 32, 4, 'rgba(244,242,237,.5)');
    ctx.fillStyle = 'rgba(244,242,237,.08)';
    for (const k of s.streaks) ctx.fillRect(k.x, k.y, k.len, 2);
    if (s.mode === 'ready') for (let j = 0; j < ROAD_H / 12; j++) for (let i = 0; i < 2; i++) rect(CAR_X + CAR_L + 24 + i * 12, ROAD_Y + j * 12, 12, 12, (i + j) % 2 ? '#f4f2ed' : '#111');

    for (const o of s.things) {
      const cy = laneY(o.lane);
      if (o.kind === 'car') drawTraffic(o.x, cy, o.hue ? '#f4f2ed' : '#7a7a7a');
      else {
        // checkered flag lying on the track
        for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) rect(o.x + i * 6, cy - 12 + j * 6, 6, 6, (i + j) % 2 ? '#111' : '#f4f2ed');
        ctx.strokeStyle = red; ctx.lineWidth = 2; ctx.strokeRect(o.x - 1, cy - 13, 32, 26);
      }
    }
    drawRacer(CAR_X, s.y, red);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#f4f2ed';
    ctx.font = '400 26px Bungee, Archivo, sans-serif';
    if (s.mode !== 'ready') ctx.fillText(score(), W - 14, ROAD_Y + 30);
    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.fillStyle = '#8a8a8a';
    if (s.mode === 'play') ctx.fillText(`${Math.round(s.speed / 4)} km/h`, W - 14, ROAD_Y + ROAD_H - 8);
    ctx.textAlign = 'center';
    for (const p of s.pops) { ctx.globalAlpha = Math.min(1, p.life * 2); ctx.fillStyle = red; ctx.font = '400 20px Bungee, sans-serif'; ctx.fillText('+25', p.x, p.y - (0.7 - p.life) * 50); ctx.globalAlpha = 1; }
    if (s.flash) { ctx.globalAlpha = s.flash * 0.45; rect(0, 0, W, H, red); ctx.globalAlpha = 1; }
    if (s.mode === 'ready') banner('Lane Rush', 'Tap the top or bottom half (or ↑ ↓) to change lanes');
    if (s.mode === 'dead') banner('Crashed!', `Score ${score()} · Best ${best} · tap to go again`);
  }

  function banner(title, sub) {
    const bw = 420, bh = 96, bx = (W - bw) / 2, by = (H - bh) / 2;
    rect(bx, by, bw, bh, '#111');
    ctx.strokeStyle = css('--accent', '#e63323'); ctx.lineWidth = 3; ctx.strokeRect(bx, by, bw, bh);
    ctx.fillStyle = '#f4f2ed'; ctx.textAlign = 'center';
    ctx.font = '400 30px Bungee, Archivo, sans-serif'; ctx.fillText(title.toUpperCase(), W / 2, by + 44);
    ctx.font = '600 13px Archivo, sans-serif'; ctx.fillText(sub, W / 2, by + 74);
  }

  function loop(now) {
    if (!open) return;
    const dt = Math.min(0.033, (now - last) / 1000 || 0);
    last = now;
    update(dt);
    draw();
    raf = requestAnimationFrame(loop);
  }

  function updateBest() {
    const el = document.getElementById('flappy-best');
    if (el) el.textContent = best ? `Best: ${best}` : '';
  }

  function onKey(e) {
    if (!open || /INPUT|TEXTAREA/.test((e.target && e.target.tagName) || '')) return;
    if (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'ArrowLeft') { e.preventDefault(); steer(-1); }
    else if (e.code === 'ArrowDown' || e.code === 'KeyS' || e.code === 'ArrowRight') { e.preventDefault(); steer(1); }
    else if (e.code === 'Space') { e.preventDefault(); steer(0); }
    if (e.key === 'Escape' && !slot) close();
  }

  function init() {
    canvas = document.getElementById('flappy-canvas');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      steer(e.clientY - r.top < r.height / 2 ? -1 : 1);
    });
    document.getElementById('flappy-close').addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', () => { if (document.hidden && s && s.mode === 'play') crash(); });
  }

  // show(slot): with a slot element it plays inline (e.g. in the lobby, so you can still see who
  // joins); without one it opens as a pop-up.
  function show(target) {
    if (!canvas) init();
    const box = document.querySelector('.flappy-box');
    const overlay = document.getElementById('flappy');
    if (target) {
      target.appendChild(box);
      target.classList.remove('hidden');
      overlay.classList.add('hidden');
      slot = target;
    } else {
      overlay.appendChild(box);
      overlay.classList.remove('hidden');
      slot = null;
    }
    open = true;
    reset();
    updateBest();
    last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }

  function close() {
    open = false;
    cancelAnimationFrame(raf);
    const overlay = document.getElementById('flappy');
    const box = document.querySelector('.flappy-box');
    if (slot) { slot.classList.add('hidden'); if (overlay && box) overlay.appendChild(box); slot = null; }
    if (overlay) overlay.classList.add('hidden');
    dispatchEvent(new Event('minigame-close'));
  }

  // Move a running inline game to another slot without restarting it.
  function moveTo(target) {
    if (!open || !slot || !target || target === slot) return;
    const box = document.querySelector('.flappy-box');
    slot.classList.add('hidden');
    target.appendChild(box);
    target.classList.remove('hidden');
    slot = target;
  }

  return { open: show, close, moveTo, isOpen: () => open, isInline: () => !!slot };
})();
