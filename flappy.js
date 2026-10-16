// Flappy Wiki: a tiny Flappy Bird clone to play while you wait for a race.
window.Flappy = (() => {
  'use strict';
  const W = 360, H = 520, GROUND = 60;
  const GRAVITY = 1500, FLAP = -430, SPEED = 150, GAP = 150, PIPE_W = 58, PIPE_EVERY = 1.45;
  let canvas, ctx, raf = 0, last = 0, s = null, open = false;
  let best = 0;
  try { best = parseInt(localStorage.getItem('wr-flappy-best'), 10) || 0; } catch {}

  function reset() {
    s = { mode: 'ready', bird: { y: H / 2 - 40, vy: 0 }, pipes: [], t: 0, score: 0, ground: 0, spawn: 0.6 };
  }

  function flap() {
    if (!s) return;
    if (s.mode === 'dead') {
      if (s.t < 0.5) return; // brief pause so you don't instantly restart
      reset();
    }
    if (s.mode === 'ready') s.mode = 'play';
    s.bird.vy = FLAP;
  }

  function die() {
    s.mode = 'dead';
    s.t = 0;
    dispatchEvent(new CustomEvent('flappy-score', { detail: s.score }));
    if (s.score > best) {
      best = s.score;
      try { localStorage.setItem('wr-flappy-best', String(best)); } catch {}
    }
    updateBest();
  }

  function update(dt) {
    s.t += dt;
    const b = s.bird;
    if (s.mode !== 'dead') s.ground = (s.ground + SPEED * dt) % 24;
    if (s.mode === 'ready') {
      b.y = H / 2 - 40 + Math.sin(s.t * 5) * 8;
      return;
    }
    b.vy += GRAVITY * dt;
    b.y += b.vy * dt;
    if (s.mode === 'dead') {
      b.y = Math.min(b.y, H - GROUND - 14);
      return;
    }
    s.spawn -= dt;
    if (s.spawn <= 0) {
      s.spawn = PIPE_EVERY;
      const top = 50 + Math.random() * (H - GROUND - GAP - 100);
      s.pipes.push({ x: W + 10, top, passed: false });
    }
    for (const p of s.pipes) {
      p.x -= SPEED * dt;
      if (!p.passed && p.x + PIPE_W < 90) { p.passed = true; s.score++; }
      const bx = 90, r = 13;
      if (bx + r > p.x && bx - r < p.x + PIPE_W && (b.y - r < p.top || b.y + r > p.top + GAP)) die();
    }
    s.pipes = s.pipes.filter((p) => p.x > -PIPE_W - 10);
    if (b.y + 13 > H - GROUND || b.y < -30) die();
  }

  function draw() {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#7cc8ff');
    sky.addColorStop(1, '#d7f0ff');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // clouds
    ctx.fillStyle = 'rgba(255,255,255,.8)';
    for (let i = 0; i < 4; i++) {
      const x = ((i * 120 - s.t * 12) % (W + 120) + W + 120) % (W + 120) - 60;
      ctx.beginPath();
      ctx.ellipse(x, 70 + i * 37 % 90, 34, 14, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // pipes styled like stacks of encyclopedia volumes
    for (const p of s.pipes) {
      drawPipe(p.x, 0, p.top, true);
      drawPipe(p.x, p.top + GAP, H - GROUND - p.top - GAP, false);
    }

    // ground
    ctx.fillStyle = '#c9a86a';
    ctx.fillRect(0, H - GROUND, W, GROUND);
    ctx.fillStyle = '#7bc043';
    ctx.fillRect(0, H - GROUND, W, 10);
    ctx.fillStyle = '#6aa83a';
    for (let x = -s.ground; x < W; x += 24) ctx.fillRect(x, H - GROUND, 12, 10);

    // bird: a little Wikipedia globe
    const b = s.bird;
    ctx.save();
    ctx.translate(90, b.y);
    ctx.rotate(Math.max(-0.5, Math.min(1.2, b.vy / 600)));
    ctx.fillStyle = '#f5f5f5';
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#222';
    ctx.font = 'bold 15px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('W', -1, 1);
    ctx.fillStyle = '#ffb400';
    ctx.beginPath(); ctx.moveTo(12, -2); ctx.lineTo(21, 2); ctx.lineTo(12, 6); ctx.fill();
    const wing = Math.sin(s.t * 25) * 4;
    ctx.fillStyle = '#ffd43b';
    ctx.beginPath(); ctx.ellipse(-7, 4 + wing, 8, 5, -0.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();

    // HUD
    ctx.textAlign = 'center';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(0,0,0,.55)';
    ctx.fillStyle = '#fff';
    if (s.mode !== 'ready') {
      ctx.font = '800 44px Inter, sans-serif';
      ctx.strokeText(s.score, W / 2, 70);
      ctx.fillText(s.score, W / 2, 70);
    }
    if (s.mode === 'ready') banner('Tap to flap', 'Dodge the encyclopedia stacks');
    if (s.mode === 'dead') banner('Game over', `Score ${s.score} · Best ${best} · tap to retry`);
  }

  function drawPipe(x, y, h, top) {
    if (h <= 0) return;
    const colors = ['#2f9e44', '#1971c2', '#c2255c', '#e8590c', '#6741d9'];
    const band = 26;
    for (let yy = 0; yy < h; yy += band) {
      const idx = Math.floor((yy + (top ? 0 : 3)) / band) % colors.length;
      ctx.fillStyle = colors[idx];
      ctx.fillRect(x, y + yy, PIPE_W, Math.min(band, h - yy));
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      ctx.fillRect(x + 8, y + yy + 9, PIPE_W - 16, 3);
    }
    ctx.strokeStyle = 'rgba(0,0,0,.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, PIPE_W, h);
    ctx.fillStyle = '#5c3d1e';
    const capY = top ? y + h - 10 : y;
    ctx.fillRect(x - 4, capY, PIPE_W + 8, 10);
  }

  function banner(title, sub) {
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.fillRect(30, H / 2 - 60, W - 60, 90);
    ctx.fillStyle = '#fff';
    ctx.font = '800 28px Inter, sans-serif';
    ctx.fillText(title, W / 2, H / 2 - 22);
    ctx.font = '500 13px Inter, sans-serif';
    ctx.fillText(sub, W / 2, H / 2 + 10);
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
    if (!open) return;
    if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); flap(); }
    if (e.key === 'Escape') close();
  }

  function init() {
    canvas = document.getElementById('flappy-canvas');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); flap(); });
    document.getElementById('flappy-close').addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', () => { if (document.hidden && s && s.mode === 'play') die(); });
  }

  function show() {
    if (!canvas) init();
    document.getElementById('flappy').classList.remove('hidden');
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
    const el = document.getElementById('flappy');
    if (el) el.classList.add('hidden');
  }

  return { open: show, close, isOpen: () => open };
})();
