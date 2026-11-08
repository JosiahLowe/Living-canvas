(() => {
  'use strict';
  const canvas = document.querySelector('#canvas');
  const ctx = canvas.getContext('2d');
  const pauseButton = document.querySelector('#pause');
  const palette = ['#b8a0ed', '#ed9da6', '#edbd83', '#91c9ba', '#8caee7', '#cf9ed8', '#d5d998'];
  const count = 50;
  const step = 1 / 60;
  let width = 0, height = 0, particles = [], paused = false;
  let lastTime = 0, accumulated = 0, frameId = null;
  const random = (min, max) => min + Math.random() * (max - min);

  function resize() {
    const oldWidth = width, oldHeight = height;
    width = window.innerWidth;
    height = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    particles.forEach(p => {
      p.x = Math.max(p.r, Math.min(width - p.r, p.x * width / oldWidth));
      p.y = Math.max(p.r, Math.min(height - p.r, p.y * height / oldHeight));
    });
    draw();
  }

  function reset() {
    const scale = Math.min(1, Math.max(.65, width / 800));
    particles = Array.from({ length: count }, (_, i) => {
      const r = random(5, 15) * scale;
      const angle = random(0, Math.PI * 2), speed = random(15, 32);
      return { x: random(r, width - r), y: random(r, height - r), r, baseRadius: r,
        phase: random(0, Math.PI * 2), cycle: random(35, 65),
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        color: palette[i % palette.length], turnIn: random(.5, 5) };
    });
    accumulated = 0;
    draw();
  }

  function update(dt) {
    const range = Math.min(150, width * .32);
    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        const a = particles[i], b = particles[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const distance = Math.hypot(dx, dy);
        if (distance < .01 || distance > range) continue;
        // A soft repulsive core keeps attraction from collapsing into a clump.
        const core = a.r + b.r + 10;
        const force = distance < core ? -35 * (1 - distance / core) : 3 * (1 - distance / range);
        const fx = dx / distance * force * dt, fy = dy / distance * force * dt;
        a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
      }
    }
    particles.forEach(p => {
      // Each particle grows and recedes on its own slow, bounded cycle.
      p.phase = (p.phase + dt * Math.PI * 2 / p.cycle) % (Math.PI * 2);
      p.r = p.baseRadius * (1 + .12 * Math.sin(p.phase));
      p.turnIn -= dt;
      if (p.turnIn <= 0) {
        const angle = random(-.65, .65), c = Math.cos(angle), s = Math.sin(angle);
        const vx = p.vx;
        p.vx = vx * c - p.vy * s; p.vy = vx * s + p.vy * c;
        p.turnIn = random(1.5, 6);
      }
      const speed = Math.hypot(p.vx, p.vy);
      if (speed > .001) {
        const target = Math.max(12, Math.min(38, speed));
        const factor = 1 + (target / speed - 1) * .025;
        p.vx *= factor; p.vy *= factor;
      }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.x < p.r) { p.x = p.r; p.vx = Math.abs(p.vx); }
      if (p.x > width - p.r) { p.x = width - p.r; p.vx = -Math.abs(p.vx); }
      if (p.y < p.r) { p.y = p.r; p.vy = Math.abs(p.vy); }
      if (p.y > height - p.r) { p.y = height - p.r; p.vy = -Math.abs(p.vy); }
    });
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    particles.forEach(p => {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 16;
      ctx.globalAlpha = .85; ctx.fill();
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    });
  }

  function frame(time) {
    frameId = null;
    if (paused || document.hidden) return;
    if (lastTime) accumulated += Math.min((time - lastTime) / 1000, .05);
    lastTime = time;
    while (accumulated >= step) { update(step); accumulated -= step; }
    draw();
    frameId = requestAnimationFrame(frame);
  }

  function syncAnimation() {
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null; lastTime = 0; accumulated = 0;
    if (!paused && !document.hidden) frameId = requestAnimationFrame(frame);
  }
  pauseButton.addEventListener('click', () => {
    paused = !paused;
    pauseButton.setAttribute('aria-pressed', String(paused));
    pauseButton.querySelector('span').textContent = paused ? 'Resume' : 'Pause';
    document.querySelector('#pause-icon').setAttribute('d', paused ? 'M7 4l8 6-8 6Z' : 'M7 5v10M13 5v10');
    syncAnimation();
  });
  document.querySelector('#reset').addEventListener('click', reset);
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', syncAnimation);
  resize(); reset(); syncAnimation();
})();
