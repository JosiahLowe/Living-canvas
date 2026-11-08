(() => {
  'use strict';
  const canvas = document.querySelector('#canvas');
  const ctx = canvas.getContext('2d');
  const pauseButton = document.querySelector('#pause');
  const palette = [260, 350, 35, 160, 215, 290, 65];
  const timeSlider = document.querySelector('#time');
  let lifeTime = 0, simulationSpeed = 1;
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
    lifeTime = 0; simulationSpeed = 1; timeSlider.value = '0';
    timeSlider.setAttribute('aria-valuetext', '1× speed');
    const scale = Math.min(1, Math.max(.65, width / 800));
    particles = Array.from({ length: count }, (_, i) => {
      const r = random(5, 15) * scale * 1.25;
      const angle = random(0, Math.PI * 2), speed = random(15, 32);
      return { x: random(r, width - r), y: random(r, height - r), r, baseRadius: r,
        birthOffset: (i + .5) / count, cycle: random(90, 150),
        polarity: i % 2 === 0 ? 1 : -1,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        hue: palette[i % palette.length], turnIn: random(.5, 5) };
    });
    accumulated = 0;
    updateLife();
    draw();
  }

  function updateLife() {
    particles.forEach(p => {
      p.age = ((p.birthOffset + lifeTime / p.cycle) % 1 + 1) % 1;
      const fullness = Math.sin(Math.PI * p.age);
      p.r = p.baseRadius * fullness;
      p.pull = fullness * fullness;
      p.targetSpeed = 42 - 36 * p.age;
      p.color = `hsl(${p.hue}, ${12 + 55 * p.pull}%, ${35 + 35 * fullness}%)`;
      p.opacity = .12 + .78 * fullness;
      p.x = Math.max(p.r, Math.min(width - p.r, p.x));
      p.y = Math.max(p.r, Math.min(height - p.r, p.y));
    });
  }

  function update(dt) {
    lifeTime += dt;
    updateLife();
    const range = Math.min(280, width * .6);
    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        const a = particles[i], b = particles[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const distance = Math.hypot(dx, dy);
        if (distance < .01 || distance > range) continue;
        // Matching groups attract; opposite groups repel over the same range.
        // Every particle also pushes back at close range to prevent collapse.
        const core = a.r + b.r + 10;
        const field = 14 * a.polarity * b.polarity * (1 - distance / range);
        const repulsion = distance < core ? 90 * (1 - distance / core) : 0;
        const fx = dx / distance * dt, fy = dy / distance * dt;
        const forceA = field * b.pull - repulsion;
        const forceB = field * a.pull - repulsion;
        a.vx += fx * forceA; a.vy += fy * forceA;
        b.vx -= fx * forceB; b.vy -= fy * forceB;
      }
    }
    particles.forEach(p => {
      p.turnIn -= dt;
      if (p.turnIn <= 0) {
        const angle = random(-.65, .65), c = Math.cos(angle), s = Math.sin(angle);
        const vx = p.vx;
        p.vx = vx * c - p.vy * s; p.vy = vx * s + p.vy * c;
        p.turnIn = random(1.5, 6);
      }
      const speed = Math.hypot(p.vx, p.vy);
      if (speed > .001) {
        const target = p.targetSpeed;
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
      ctx.globalAlpha = p.opacity; ctx.fill();
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    });
  }

  function frame(time) {
    frameId = null;
    if (paused || document.hidden) return;
    if (lastTime) accumulated += Math.min((time - lastTime) / 1000, .05) * simulationSpeed;
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
  timeSlider.addEventListener('input', () => {
    // Logarithmic mapping gives equal room to slower and faster time.
    simulationSpeed = Math.pow(2, Number(timeSlider.value));
    timeSlider.setAttribute('aria-valuetext', `${Number(simulationSpeed.toFixed(2))}× speed`);
  });
  document.querySelector('#reset').addEventListener('click', reset);
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', syncAnimation);
  resize(); reset(); syncAnimation();
})();
