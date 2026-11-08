(() => {
  'use strict';
  const canvas = document.querySelector('#canvas');
  const ctx = canvas.getContext('2d');
  const pauseButton = document.querySelector('#pause');
  const palette = [260, 350, 35, 160, 215, 290, 65];
  const timeSlider = document.querySelector('#time');
  let lifeTime = 0, simulationSpeed = 1;
  let gesture = null;
  const ripples = [];
  const count = 50;
  const step = 1 / 120;
  let width = 0, height = 0, particles = [], paused = false;
  let lastTime = 0, accumulated = 0, frameId = null;
  const random = (min, max) => min + Math.random() * (max - min);

  let audioContext = null, masterGain = null, soundEnabled = false, voices = 0;
  const soundButton = document.querySelector('#sound');
  document.querySelector('#toggle-controls').addEventListener('click', event => {
    const panel = document.querySelector('#control-panel');
    panel.hidden = !panel.hidden;
    event.currentTarget.setAttribute('aria-expanded', String(!panel.hidden));
    event.currentTarget.setAttribute('aria-label', panel.hidden ? 'Show controls' : 'Hide controls');
  });
  soundButton.addEventListener('click', async () => {
    try {
      if (!audioContext) {
        const Audio = window.AudioContext || window.webkitAudioContext;
        audioContext = new Audio();
        masterGain = audioContext.createGain(); masterGain.gain.value = 0;
        const limiter = audioContext.createDynamicsCompressor();
        masterGain.connect(limiter); limiter.connect(audioContext.destination);
      }
      soundEnabled = !soundEnabled;
      masterGain.gain.setTargetAtTime(soundEnabled ? .45 : 0, audioContext.currentTime, .02);
      soundButton.setAttribute('aria-pressed', String(soundEnabled));
      soundButton.textContent = soundEnabled ? 'Sound on' : 'Sound off';
      if (soundEnabled) await audioContext.resume();
    } catch {
      soundEnabled = false;
      if (masterGain) masterGain.gain.value = 0;
      soundButton.textContent = 'No audio'; soundButton.disabled = true;
    }
  });

  function impactSound(age, impact, wall = false) {
    if (!soundEnabled || paused || document.hidden || audioContext.state !== 'running' || voices >= 24) return;
    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
    // Volume follows growth: muted at birth, strongest at midlife, fading in old age.
    const volume = (.015 + .10 * Math.sin(Math.PI * age)) * Math.min(1, impact / 45);
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime((wall ? 160 : 300) + (1 - age) * 180, now);
    oscillator.frequency.exponentialRampToValueAtTime(wall ? 75 : 160, now + .12);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + .004);
    gain.gain.exponentialRampToValueAtTime(.0001, now + .16);
    oscillator.connect(gain); gain.connect(masterGain);
    voices++;
    oscillator.onended = () => { voices--; oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(now); oscillator.stop(now + .18);
  }

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
    releaseGesture(); ripples.length = 0;
    lifeTime = 0; simulationSpeed = 1; timeSlider.value = '0';
    timeSlider.setAttribute('aria-valuetext', '1× speed');
    const scale = Math.min(1, Math.max(.65, width / 800));
    particles = Array.from({ length: count }, (_, i) => {
      const r = random(5, 15) * scale * 1.75;
      const angle = random(0, Math.PI * 2), speed = random(9, 20);
      return { x: random(r, width - r), y: random(r, height - r), r, baseRadius: r,
        birthOffset: (i + .5) / count, cycle: random(90, 150),
        polarity: i % 2 === 0 ? 1 : -1, wallCooldown: 0,
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
      // After midlife, an outward field gradually replaces the fading pull.
      const oldAge = Math.max(0, (p.age - .5) * 2);
      p.repulsion = 36 * oldAge * oldAge * (3 - 2 * oldAge);
      p.targetSpeed = 26 - 21 * p.age;
      p.color = `hsl(${p.hue}, ${12 + 55 * p.pull}%, ${35 + 35 * fullness}%)`;
      p.opacity = .12 + .78 * fullness;
      p.x = Math.max(p.r, Math.min(width - p.r, p.x));
      p.y = Math.max(p.r, Math.min(height - p.r, p.y));
    });
  }

  function update(dt) {
    lifeTime += dt * simulationSpeed;
    updateLife();
    const range = Math.min(420, width * .9);
    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        const a = particles[i], b = particles[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const distance = Math.hypot(dx, dy);
        if (distance < .01 || distance > range) continue;
        // Matching groups attract; opposite groups repel over the same range.
        // Solid contact is handled separately from the long-range field.
        const spacing = (a.r + b.r) * 2 + 8;
        // Leave breathing room before contact instead of pinning clusters solid.
        const pressure = 65 * Math.max(0, 1 - distance / spacing);
        const alignment = a.polarity * b.polarity;
        const falloff = 1 - distance / range;
        const field = (alignment > 0 ? 10 : -28) * falloff;
        const fx = dx / distance * dt, fy = dy / distance * dt;
        const forceA = field * b.pull - b.repulsion * falloff - pressure;
        const forceB = field * a.pull - a.repulsion * falloff - pressure;
        if (a !== gesture?.particle) { a.vx += fx * forceA; a.vy += fy * forceA; }
        if (b !== gesture?.particle) { b.vx -= fx * forceB; b.vy -= fy * forceB; }
      }
    }
    particles.forEach(p => {
      p.wallCooldown = Math.max(0, p.wallCooldown - dt);
      if (p === gesture?.particle) return;
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
        const factor = Math.min(60 / speed, 1 + (target / speed - 1) * .004);
        p.vx *= factor; p.vy *= factor;
      }
      p.x += p.vx * dt; p.y += p.vy * dt;
      bounceEdges(p);
    });
    ripples.forEach(r => { r.age += dt; });
    while (ripples.length && ripples[0].age > .8) ripples.shift();
    // Multiple passes resolve contacts within small clusters.
    for (let pass = 0; pass < 4; pass++) {
      for (let i = 0; i < count; i++) {
        for (let j = i + 1; j < count; j++) resolveCollision(particles[i], particles[j]);
      }
      particles.forEach(bounceEdges);
    }
  }

  function resolveCollision(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const distance = Math.hypot(dx, dy), contact = a.r + b.r;
    if (distance >= contact || contact < .01) return;
    const nx = distance > .00001 ? dx / distance : 1;
    const ny = distance > .00001 ? dy / distance : 0;
    // Larger particles carry more mass; the floor stabilizes near-zero sizes.
    const invA = a === gesture?.particle ? 0 : 1 / Math.max(4, a.r * a.r);
    const invB = b === gesture?.particle ? 0 : 1 / Math.max(4, b.r * b.r);
    const invTotal = invA + invB;
    const overlap = contact - distance + .001;
    a.x -= nx * overlap * invA / invTotal;
    a.y -= ny * overlap * invA / invTotal;
    b.x += nx * overlap * invB / invTotal;
    b.y += ny * overlap * invB / invTotal;
    const closingSpeed = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (closingSpeed >= 0) return;
    impactSound((a.age + b.age) / 2, -closingSpeed);
    const impulse = -(1 + .95) * closingSpeed / invTotal;
    a.vx -= impulse * nx * invA; a.vy -= impulse * ny * invA;
    b.vx += impulse * nx * invB; b.vy += impulse * ny * invB;
  }

  function wallImpact(p, x, y, nx, ny, impact) {
    if (p === gesture?.particle || impact <= 0) return;
    impactSound(p.age, impact, true);
    if (p.wallCooldown > 0 || impact < 5) return;
    p.wallCooldown = .4;
    ripples.push({ x, y, age: 0 });
    particles.forEach(other => {
      if (other === p || other === gesture?.particle) return;
      const distance = Math.hypot(other.x - x, other.y - y);
      if (distance >= 180) return;
      const kick = Math.min(55, impact * 1.5) * (1 - distance / 180);
      other.vx += nx * kick; other.vy += ny * kick;
    });
  }

  function bounceEdges(p) {
    if (p.x < p.r) {
      wallImpact(p, 0, p.y, 1, 0, -p.vx);
      p.x = p.r; p.vx = Math.min(80, Math.abs(p.vx) * 1.2);
    }
    if (p.x > width - p.r) {
      wallImpact(p, width, p.y, -1, 0, p.vx);
      p.x = width - p.r; p.vx = -Math.min(80, Math.abs(p.vx) * 1.2);
    }
    if (p.y < p.r) {
      wallImpact(p, p.x, 0, 0, 1, -p.vy);
      p.y = p.r; p.vy = Math.min(80, Math.abs(p.vy) * 1.2);
    }
    if (p.y > height - p.r) {
      wallImpact(p, p.x, height, 0, -1, p.vy);
      p.y = height - p.r; p.vy = -Math.min(80, Math.abs(p.vy) * 1.2);
    }
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    particles.forEach(p => {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 16;
      ctx.globalAlpha = p.opacity; ctx.fill();
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    });
    ripples.forEach(r => {
      ctx.beginPath(); ctx.arc(r.x, r.y, 8 + r.age * 190, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(184,160,237,${.25 * (1 - r.age / .8)})`;
      ctx.lineWidth = 1; ctx.stroke();
    });
  }

  function releaseGesture() {
    if (!gesture) return;
    const id = gesture.id;
    gesture = null;
    if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  }

  canvas.addEventListener('pointerdown', event => {
    if (gesture || event.button !== 0) return;
    const x = event.clientX, y = event.clientY;
    const particle = particles.reduce((best, p) => {
      const d = Math.hypot(p.x - x, p.y - y);
      return d <= Math.max(p.r + 8, 20) && (!best || d < best.d) ? { p, d } : best;
    }, null)?.p;
    gesture = { id: event.pointerId, particle, x, y, startX: x, startY: y,
      offsetX: particle ? particle.x - x : 0, offsetY: particle ? particle.y - y : 0,
      last: event.timeStamp, moved: false };
    canvas.setPointerCapture(event.pointerId);
    if (particle) { particle.vx = 0; particle.vy = 0; }
  });
  canvas.addEventListener('pointermove', event => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const g = gesture, p = g.particle;
    if (Math.hypot(event.clientX - g.startX, event.clientY - g.startY) > 5) g.moved = true;
    if (p) {
      const dt = Math.max(.016, (event.timeStamp - g.last) / 1000);
      p.vx = (event.clientX - g.x) / dt;
      p.vy = (event.clientY - g.y) / dt;
      const speed = Math.hypot(p.vx, p.vy);
      if (speed > 60) { p.vx *= 60 / speed; p.vy *= 60 / speed; }
      p.x = event.clientX + g.offsetX; p.y = event.clientY + g.offsetY;
      bounceEdges(p);
      draw();
    }
    g.x = event.clientX; g.y = event.clientY; g.last = event.timeStamp;
  });
  canvas.addEventListener('pointerup', event => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const g = gesture;
    if (!g.moved) {
      particles.forEach(p => {
        let dx = p.x - g.x, dy = p.y - g.y, distance = Math.hypot(dx, dy);
        if (distance > 160) return;
        if (distance < .01) { const angle = random(0, Math.PI * 2); dx = Math.cos(angle); dy = Math.sin(angle); distance = 1; }
        const kick = 50 * (1 - distance / 160);
        p.vx += dx / distance * kick; p.vy += dy / distance * kick;
      });
      ripples.push({ x: g.x, y: g.y, age: 0 });
    } else if (g.particle && event.timeStamp - g.last > 120) {
      g.particle.vx = 0; g.particle.vy = 0;
    }
    releaseGesture(); draw();
  });
  canvas.addEventListener('pointercancel', releaseGesture);
  canvas.addEventListener('lostpointercapture', releaseGesture);

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
    timeSlider.setAttribute('aria-valuetext', `${Number(simulationSpeed.toFixed(2))}× movement, ${Number((simulationSpeed ** 2).toFixed(2))}× life cycles`);
  });
  document.querySelector('#reset').addEventListener('click', reset);
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', syncAnimation);
  resize(); reset(); syncAnimation();
})();
