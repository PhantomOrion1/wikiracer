// Lane Rush: a tiny top-down racing game to play while you wait.
// Three lanes; tap the left/right side (or ← →, A/D) to change lanes. Dodge traffic and cones,
// grab checkered flags for bonus points. It speeds up the longer you last.
window.MiniGame = (() => {
  'use strict';
  const W = 360, H = 520;
  const LANES = 3, ROAD_X = 40, ROAD_W = W - 80, LANE_W = ROAD_W / LANES;
  const CAR_W = 46, CAR_H = 78, CAR_Y = H - 110;
  const laneX = (l) => ROAD_X + LANE_W * l + LANE_W / 2;
  let canvas, ctx, raf = 0, last = 0, s = null, open = false, slot = null;
  let best = 0;
  try { best = parseInt(localStorage.getItem('wr-lanerush-best'), 10) || 0; } catch {}

  const css = (name, fallback) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

  function reset() {
    s = {
      mode: 'ready', t: 0, lane: 1, x: laneX(1), speed: 260, dist: 0, bonus: 0, things: [], spawn: 0.4,
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
      s.things.push({ kind: Math.random() < 0.3 ? 'cone' : 'car', lane: lanes[i], y: -CAR_H, hue: Math.random() < 0.5 ? 0 : 1 });
    }
    if (Math.random() < 0.35) s.things.push({ kind: 'flag', lane: lanes[blocked], y: -CAR_H - 40 });
  }

  function update(dt) {
    s.t += dt;
    s.flash = Math.max(0, s.flash - dt * 3);
    s.x += (laneX(s.lane) - s.x) * Math.min(1, dt * 14);
    s.pops = s.pops.filter((p) => (p.life -= dt) > 0);
    if (s.mode !== 'play') return;
    s.speed = Math.min(720, 260 + s.t * 9);
    s.dist += s.speed * dt;
    s.stripe = (s.stripe + s.speed * dt) % 60;
    s.spawn -= dt;
    if (s.spawn <= 0) {
      spawnRow();
      s.spawn = Math.max(0.42, 1.05 - s.t * 0.012) * (300 / s.speed) * 1.6;
    }
    for (const o of s.things) {
      o.y += (o.kind === 'car' ? s.speed * 0.55 : s.speed) * dt;
      const hitY = o.y + (o.kind === 'cone' ? 26 : o.kind === 'flag' ? 30 : CAR_H) > CAR_Y + 8 && o.y < CAR_Y + CAR_H - 8;
      const sameLane = Math.abs(laneX(o.lane) - s.x) < LANE_W * 0.55;
      if (hitY && sameLane && !o.gone) {
        if (o.kind === 'flag') { o.gone = true; s.bonus += 25; s.pops.push({ x: laneX(o.lane), y: CAR_Y - 10, life: 0.7 }); }
        else { crash(); return; }
      }
    }
    s.things = s.things.filter((o) => o.y < H + 40 && !o.gone);
  }

  function rect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }

  function drawCar(cx, y, body, stripe) {
    const x = cx - CAR_W / 2;
    rect(x - 5, y + 10, 7, 18, '#111'); rect(x + CAR_W - 2, y + 10, 7, 18, '#111');
    rect(x - 5, y + CAR_H - 26, 7, 18, '#111'); rect(x + CAR_W - 2, y + CAR_H - 26, 7, 18, '#111');
    rect(x, y, CAR_W, CAR_H, body);
    rect(cx - 5, y, 10, CAR_H, stripe);
    rect(x + 7, y + 20, CAR_W - 14, 16, 'rgba(0,0,0,.65)');
    rect(x - 2, y - 3, CAR_W + 4, 7, body);
    rect(x - 2, y + CAR_H - 5, CAR_W + 4, 7, '#111');
  }

  function draw() {
    const red = css('--accent', '#e63323');
    // grass + kerbs + road
    rect(0, 0, W, H, '#1c1c1c');
    for (let y = -60 + s.stripe; y < H; y += 30) {
      const on = Math.floor((y - s.stripe) / 30) % 2 === 0;
      rect(ROAD_X - 14, y, 14, 30, on ? red : '#f4f2ed');
      rect(ROAD_X + ROAD_W, y, 14, 30, on ? red : '#f4f2ed');
    }
    rect(ROAD_X, 0, ROAD_W, H, '#2a2a2a');
    for (let l = 1; l < LANES; l++) for (let y = -60 + s.stripe; y < H; y += 60) rect(ROAD_X + LANE_W * l - 2, y, 4, 30, 'rgba(244,242,237,.55)');
    // start line on the ready screen
    if (s.mode === 'ready') for (let i = 0; i < ROAD_W / 14; i++) for (let j = 0; j < 2; j++) rect(ROAD_X + i * 14, CAR_Y - 40 + j * 14, 14, 14, (i + j) % 2 ? '#f4f2ed' : '#111');

    for (const o of s.things) {
      const cx = laneX(o.lane);
      if (o.kind === 'car') drawCar(cx, o.y, o.hue ? '#f4f2ed' : '#555', o.hue ? '#111' : '#f4f2ed');
      else if (o.kind === 'cone') {
        ctx.fillStyle = '#ff8a1f'; ctx.beginPath(); ctx.moveTo(cx, o.y); ctx.lineTo(cx + 15, o.y + 28); ctx.lineTo(cx - 15, o.y + 28); ctx.fill();
        rect(cx - 9, o.y + 13, 18, 5, '#f4f2ed'); rect(cx - 18, o.y + 27, 36, 5, '#111');
      } else {
        rect(cx - 1, o.y, 3, 34, '#f4f2ed');
        for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) rect(cx + 2 + i * 6, o.y + j * 6, 6, 6, (i + j) % 2 ? '#111' : '#f4f2ed');
      }
    }
    drawCar(s.x, CAR_Y, red, '#f4f2ed');

    // score
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f4f2ed';
    ctx.font = '400 40px Bungee, Archivo, sans-serif';
    if (s.mode !== 'ready') ctx.fillText(score(), W / 2, 58);
    for (const p of s.pops) { ctx.globalAlpha = Math.min(1, p.life * 2); ctx.fillStyle = red; ctx.font = '400 20px Bungee, sans-serif'; ctx.fillText('+25', p.x, p.y - (0.7 - p.life) * 60); ctx.globalAlpha = 1; }
    if (s.flash) { ctx.globalAlpha = s.flash * 0.5; rect(0, 0, W, H, red); ctx.globalAlpha = 1; }
    if (s.mode === 'ready') banner('Lane Rush', 'Tap left / right (or ← →) to change lanes');
    if (s.mode === 'dead') banner('Crashed!', `Score ${score()} · Best ${best} · tap to go again`);
  }

  function banner(title, sub) {
    rect(24, H / 2 - 74, W - 48, 100, '#111');
    ctx.strokeStyle = css('--accent', '#e63323'); ctx.lineWidth = 3; ctx.strokeRect(24, H / 2 - 74, W - 48, 100);
    ctx.fillStyle = '#f4f2ed'; ctx.textAlign = 'center';
    ctx.font = '400 30px Bungee, Archivo, sans-serif'; ctx.fillText(title.toUpperCase(), W / 2, H / 2 - 30);
    ctx.font = '600 13px Archivo, sans-serif'; ctx.fillText(sub, W / 2, H / 2 + 2);
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
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { e.preventDefault(); steer(-1); }
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') { e.preventDefault(); steer(1); }
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
      steer(e.clientX - r.left < r.width / 2 ? -1 : 1);
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
