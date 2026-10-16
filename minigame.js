// Lane Rush: a tiny top-down racing game to play while you wait.
// Three lanes, driving left → right; tap the top/bottom half (or ↑ ↓, W/S) to change lanes. Dodge traffic and cones,
// grab checkered flags for bonus points. It speeds up the longer you last.
window.MiniGame = (() => {
  'use strict';
  // Landscape: the car drives left → right across three horizontal lanes.
  const W = 640, H = 300;
  const LANES = 3, ROAD_Y = 34, ROAD_H = H - 68, LANE_H = ROAD_H / LANES;
  const CAR_L = 78, CAR_W = 42, CAR_X = 70;
  const laneY = (l) => ROAD_Y + LANE_H * l + LANE_H / 2;
  let canvas, ctx, raf = 0, last = 0, s = null, open = false, slot = null;
  let best = 0;
  try { best = parseInt(localStorage.getItem('wr-lanerush-best'), 10) || 0; } catch {}

  const css = (name, fallback) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

  function reset() {
    s = {
      mode: 'ready', t: 0, lane: 1, y: laneY(1), speed: 300, dist: 0, bonus: 0, things: [], spawn: 0.4,
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
      s.things.push({ kind: Math.random() < 0.3 ? 'cone' : 'car', lane: lanes[i], x: W + CAR_L, hue: Math.random() < 0.5 ? 0 : 1 });
    }
    if (Math.random() < 0.35) s.things.push({ kind: 'flag', lane: lanes[blocked], x: W + CAR_L + 50 });
  }

  function update(dt) {
    s.t += dt;
    s.flash = Math.max(0, s.flash - dt * 3);
    s.y += (laneY(s.lane) - s.y) * Math.min(1, dt * 14);
    s.pops = s.pops.filter((p) => (p.life -= dt) > 0);
    if (s.mode !== 'play') return;
    s.speed = Math.min(820, 300 + s.t * 10);
    s.dist += s.speed * dt;
    s.stripe = (s.stripe + s.speed * dt) % 60;
    s.spawn -= dt;
    if (s.spawn <= 0) {
      spawnRow();
      s.spawn = Math.max(0.5, 1.15 - s.t * 0.012) * (340 / s.speed) * 1.7;
    }
    for (const o of s.things) {
      o.x -= (o.kind === 'car' ? s.speed * 0.55 : s.speed) * dt;
      const len = o.kind === 'cone' ? 28 : o.kind === 'flag' ? 30 : CAR_L;
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

  // A top-down car pointing right: wheels, body, racing stripe, windscreen.
  function drawCar(x, cy, body, stripe) {
    const y = cy - CAR_W / 2;
    rect(x + 10, y - 5, 18, 7, '#111'); rect(x + 10, y + CAR_W - 2, 18, 7, '#111');
    rect(x + CAR_L - 26, y - 5, 18, 7, '#111'); rect(x + CAR_L - 26, y + CAR_W - 2, 18, 7, '#111');
    rect(x, y, CAR_L, CAR_W, body);
    rect(x, cy - 5, CAR_L, 10, stripe);
    rect(x + CAR_L - 36, y + 7, 16, CAR_W - 14, 'rgba(0,0,0,.65)');
    rect(x + CAR_L - 4, y - 2, 7, CAR_W + 4, body);
    rect(x - 3, y - 2, 7, CAR_W + 4, '#111');
  }

  function draw() {
    const red = css('--accent', '#e63323');
    rect(0, 0, W, H, '#1c1c1c');
    // kerbs top and bottom, scrolling left
    for (let x = -60 - (s.stripe % 60); x < W + 60; x += 30) {
      const on = Math.floor((x + s.stripe) / 30) % 2 === 0;
      rect(x, ROAD_Y - 14, 30, 14, on ? red : '#f4f2ed');
      rect(x, ROAD_Y + ROAD_H, 30, 14, on ? red : '#f4f2ed');
    }
    rect(0, ROAD_Y, W, ROAD_H, '#2a2a2a');
    for (let l = 1; l < LANES; l++) for (let x = -60 - (s.stripe % 60); x < W + 60; x += 60) rect(x, ROAD_Y + LANE_H * l - 2, 30, 4, 'rgba(244,242,237,.55)');
    if (s.mode === 'ready') for (let j = 0; j < ROAD_H / 14; j++) for (let i = 0; i < 2; i++) rect(CAR_X + CAR_L + 30 + i * 14, ROAD_Y + j * 14, 14, 14, (i + j) % 2 ? '#f4f2ed' : '#111');

    for (const o of s.things) {
      const cy = laneY(o.lane);
      if (o.kind === 'car') drawCar(o.x, cy, o.hue ? '#f4f2ed' : '#555', o.hue ? '#111' : '#f4f2ed');
      else if (o.kind === 'cone') {
        ctx.fillStyle = '#ff8a1f'; ctx.beginPath(); ctx.moveTo(o.x, cy); ctx.lineTo(o.x + 28, cy - 15); ctx.lineTo(o.x + 28, cy + 15); ctx.fill();
        rect(o.x + 12, cy - 8, 5, 16, '#f4f2ed'); rect(o.x + 27, cy - 18, 5, 36, '#111');
      } else {
        rect(o.x, cy - 17, 3, 34, '#f4f2ed');
        for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) rect(o.x + 3 + i * 6, cy - 17 + j * 6, 6, 6, (i + j) % 2 ? '#111' : '#f4f2ed');
      }
    }
    drawCar(CAR_X, s.y, red, '#f4f2ed');

    ctx.textAlign = 'right';
    ctx.fillStyle = '#f4f2ed';
    ctx.font = '400 30px Bungee, Archivo, sans-serif';
    if (s.mode !== 'ready') ctx.fillText(score(), W - 18, ROAD_Y + 36);
    ctx.textAlign = 'center';
    for (const p of s.pops) { ctx.globalAlpha = Math.min(1, p.life * 2); ctx.fillStyle = red; ctx.font = '400 20px Bungee, sans-serif'; ctx.fillText('+25', p.x, p.y - (0.7 - p.life) * 50); ctx.globalAlpha = 1; }
    if (s.flash) { ctx.globalAlpha = s.flash * 0.5; rect(0, 0, W, H, red); ctx.globalAlpha = 1; }
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

  return { open: show, close, isOpen: () => open, isInline: () => !!slot };
})();
