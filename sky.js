(function () {
  var canvas = document.getElementById('realm-canvas');
  var btn = document.getElementById('motion-toggle');
  var label = btn ? btn.querySelector('.motion-label') : null;
  var storageKey = 'seishi-sky-paused';
  var prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var saved = null;
  try { saved = localStorage.getItem(storageKey); } catch (e) {}
  var paused = saved !== null ? saved === '1' : prefersReduced;

  function applyPauseState(state) {
    paused = state;
    document.body.classList.toggle('motion-paused', state);
    if (btn) btn.setAttribute('aria-pressed', String(state));
    if (label) label.textContent = state ? 'Play Sky' : 'Pause Sky';
  }

  applyPauseState(paused);

  if (btn) {
    btn.addEventListener('click', function () {
      applyPauseState(!paused);
      try { localStorage.setItem(storageKey, paused ? '1' : '0'); } catch (e) {}
    });
  }

  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');

  // Pre-render soft organic volumetric mist sprite (no geometric shapes)
  function makeMistSprite(size, tintRgb, alphaScale) {
    var off = document.createElement('canvas');
    off.width = size;
    off.height = size;
    var octx = off.getContext('2d');
    var puffs = [
      { x: 0.50, y: 0.52, r: 0.42, a: 0.24 },
      { x: 0.34, y: 0.56, r: 0.30, a: 0.18 },
      { x: 0.66, y: 0.55, r: 0.32, a: 0.18 },
      { x: 0.45, y: 0.43, r: 0.26, a: 0.14 },
      { x: 0.58, y: 0.46, r: 0.24, a: 0.13 }
    ];
    for (var i = 0; i < puffs.length; i++) {
      var p = puffs[i];
      var gx = p.x * size;
      var gy = p.y * size;
      var gr = p.r * size;
      var g = octx.createRadialGradient(gx, gy, gr * 0.05, gx, gy, gr);
      g.addColorStop(0, 'rgba(' + tintRgb + ',' + (p.a * alphaScale) + ')');
      g.addColorStop(0.55, 'rgba(' + tintRgb + ',' + (p.a * alphaScale * 0.38) + ')');
      g.addColorStop(1, 'rgba(' + tintRgb + ',0)');
      octx.fillStyle = g;
      octx.beginPath();
      octx.arc(gx, gy, gr, 0, Math.PI * 2);
      octx.fill();
    }
    return off;
  }

  var mistValleySprite = makeMistSprite(280, '135,160,188', 0.42);
  var mistCloudSprite = makeMistSprite(280, '165,184,210', 0.24);
  var smokeSprite = makeMistSprite(96, '36,30,32', 0.55);

  // Load real photorealistic dragon layers (760 x 510 exact anatomical alignment)
  var DRAG_W = 760;
  var DRAG_H = 510;
  var PIVOT_NEAR = { x: 469.0, y: 317.5 };
  var PIVOT_FAR = { x: 491.8, y: 295.9 };
  var MOUTH = { x: 643.4, y: 329.6 };

  var assets = { far: null, body: null, near: null };
  var loadedCount = 0;

  function loadImg(key, src) {
    var img = new Image();
    img.decoding = 'async';
    img.onload = function () {
      assets[key] = img;
      loadedCount++;
      if (loadedCount === 3) renderFrame(0);
    };
    img.src = src;
  }

  loadImg('far', 'assets/dragon-wing-far.png');
  loadImg('body', 'assets/dragon-body.png');
  loadImg('near', 'assets/dragon-wing-near.png');

  var vw = 1280;
  var vh = 800;
  var dpr = 1;

  function resize() {
    vw = window.innerWidth || 1280;
    vh = window.innerHeight || 800;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    canvas.style.width = vw + 'px';
    canvas.style.height = vh + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  resize();
  window.addEventListener('resize', resize);

  // Volumetric mist clouds (valley fog + high moonlit haze)
  var mists = [
    { kind: 'cloud', x: 0.08, y: 0.18, w: 0.52, h: 0.24, speed: 0.0055, alpha: 0.36 },
    { kind: 'cloud', x: 0.56, y: 0.26, w: 0.58, h: 0.25, speed: 0.0040, alpha: 0.30 },
    { kind: 'cloud', x: 0.85, y: 0.14, w: 0.45, h: 0.22, speed: 0.0068, alpha: 0.26 },
    { kind: 'valley', x: 0.02, y: 0.72, w: 0.62, h: 0.34, speed: 0.0085, alpha: 0.44 },
    { kind: 'valley', x: 0.42, y: 0.78, w: 0.68, h: 0.36, speed: 0.0062, alpha: 0.40 },
    { kind: 'valley', x: 0.76, y: 0.70, w: 0.56, h: 0.32, speed: 0.0095, alpha: 0.34 }
  ];

  // Subtle drifting twilight embers
  var embers = [];
  for (var e = 0; e < 24; e++) {
    embers.push({
      x: Math.random(),
      y: 0.35 + Math.random() * 0.7,
      r: 0.9 + Math.random() * 1.9,
      vy: 0.014 + Math.random() * 0.024,
      vx: (Math.random() - 0.35) * 0.012,
      phase: Math.random() * Math.PI * 2,
      alpha: 0.25 + Math.random() * 0.55
    });
  }

  // Real-time volumetric dragonfire & smoke particles emitted from dragon mouth
  var fireParticles = [];
  var smokeParticles = [];

  function spawnBreath(wx, wy, scale, vxBase) {
    for (var i = 0; i < 3; i++) {
      var spread = (Math.random() - 0.42) * 32;
      fireParticles.push({
        x: wx + (Math.random() - 0.5) * 6 * scale,
        y: wy + (Math.random() - 0.5) * 5 * scale,
        vx: vxBase + (120 + Math.random() * 95) * scale,
        vy: (12 + spread) * scale,
        r: (4.5 + Math.random() * 6.5) * scale,
        age: 0,
        life: 0.42 + Math.random() * 0.34
      });
    }
    if (Math.random() < 0.65) {
      smokeParticles.push({
        x: wx + 18 * scale,
        y: wy + 3 * scale,
        vx: vxBase * 0.35 + (45 + Math.random() * 35) * scale,
        vy: (-12 - Math.random() * 18) * scale,
        r: (14 + Math.random() * 14) * scale,
        age: 0,
        life: 1.5 + Math.random() * 0.9
      });
    }
  }

  // Natural asymmetric bird/dragon wingbeat curve (fast power downstroke, sweeping recovery)
  function flapCurve(phase) {
    var a = phase * Math.PI * 2;
    return Math.cos(a - 0.36 * Math.sin(a));
  }

  function drawDragon(opts) {
    if (loadedCount < 3) return null;
    var scale = opts.width / DRAG_W;
    var sNear = flapCurve(opts.wingPhase);
    var sFar = flapCurve(opts.wingPhase - 0.055);

    // Aerodynamic lift bob synced right after power downstroke
    var bobY = -Math.sin((opts.wingPhase - 0.18) * Math.PI * 2) * 14 * scale;
    var pitch = opts.pitch + Math.sin((opts.wingPhase - 0.12) * Math.PI * 2) * 0.032;

    // Near wing sweeps powerfully from high upstroke (+1.04) through foreshortened mid to downstroke (-0.56)
    var nearScaleY = 0.24 + sNear * 0.80;
    var nearRot = (1 - sNear) * 0.08 - 0.05;
    var nearSkew = (1 - sNear) * 0.045 - 0.03;

    // Far wing runs slightly tighter due to perspective foreshortening
    var farScaleY = 0.29 + sFar * 0.72;
    var farRot = (1 - sFar) * 0.06 - 0.04;

    ctx.save();
    ctx.globalAlpha = opts.alpha;
    if (opts.filter) ctx.filter = opts.filter;

    ctx.translate(opts.x, opts.y + bobY);
    if (opts.flipX) ctx.scale(-1, 1);
    ctx.rotate(pitch);
    ctx.scale(scale, scale);
    ctx.translate(-DRAG_W * 0.5, -DRAG_H * 0.55);

    // 1. Far wing (behind body)
    ctx.save();
    ctx.translate(PIVOT_FAR.x, PIVOT_FAR.y);
    ctx.rotate(farRot);
    ctx.scale(1, farScaleY);
    ctx.translate(-PIVOT_FAR.x, -PIVOT_FAR.y);
    ctx.drawImage(assets.far, 0, 0, DRAG_W, DRAG_H);
    ctx.restore();

    // 2. Dragon body, head, horns, legs & tail
    ctx.drawImage(assets.body, 0, 0, DRAG_W, DRAG_H);

    // Subtle fiery jaw glow when breathing dragonfire
    if (opts.fireIntensity > 0.02) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      var glow = ctx.createRadialGradient(MOUTH.x, MOUTH.y, 4, MOUTH.x, MOUTH.y, 78);
      glow.addColorStop(0, 'rgba(255,220,130,' + (0.65 * opts.fireIntensity) + ')');
      glow.addColorStop(0.45, 'rgba(235,105,36,' + (0.34 * opts.fireIntensity) + ')');
      glow.addColorStop(1, 'rgba(210,60,20,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(MOUTH.x, MOUTH.y, 78, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 3. Near wing (front layer)
    ctx.save();
    ctx.translate(PIVOT_NEAR.x, PIVOT_NEAR.y);
    ctx.rotate(nearRot);
    ctx.transform(1, 0, nearSkew, nearScaleY, 0, 0);
    ctx.translate(-PIVOT_NEAR.x, -PIVOT_NEAR.y);
    ctx.drawImage(assets.near, 0, 0, DRAG_W, DRAG_H);
    ctx.restore();

    ctx.restore();

    // Compute exact world-space mouth coordinates for fire breath emission
    var lx = (MOUTH.x - DRAG_W * 0.5) * scale;
    var ly = (MOUTH.y - DRAG_H * 0.55) * scale;
    var cosP = Math.cos(pitch);
    var sinP = Math.sin(pitch);
    var rx = lx * cosP - ly * sinP;
    var ry = lx * sinP + ly * cosP;
    return {
      mx: opts.x + (opts.flipX ? -rx : rx),
      my: opts.y + bobY + ry,
      scale: scale
    };
  }

  // Start time offset so main dragon is soaring in the dark open upper-left sky on load
  var simTime = 7.4;
  var lastTs = 0;

  function renderFrame(dt) {
    if (!paused) simTime += dt;

    ctx.clearRect(0, 0, vw, vh);

    // 1. High atmospheric cloud mist behind distant dragon
    for (var i = 0; i < mists.length; i++) {
      var m = mists[i];
      if (!paused) {
        m.x += m.speed * dt;
        if (m.x > 1.38) m.x = -0.38;
      }
      if (m.kind === 'cloud') {
        ctx.save();
        ctx.globalAlpha = m.alpha;
        ctx.globalCompositeOperation = 'screen';
        var cw = m.w * vw;
        var ch = m.h * vh;
        ctx.drawImage(mistCloudSprite, m.x * vw - cw * 0.5, m.y * vh - ch * 0.5, cw, ch);
        ctx.restore();
      }
    }

    // 2. Distant moonlit dragon gliding slowly right-to-left high near the moon
    var distW = Math.max(130, Math.min(205, vw * 0.145));
    var distCycle = 48;
    var distP = ((simTime + 10.5) % distCycle) / distCycle;
    var distSpan = vw + distW * 1.4;
    var distX = vw + distW * 0.7 - distP * distSpan;
    var distY = vh * 0.21 + Math.sin(distP * Math.PI * 2.5) * vh * 0.035;
    var distDy = Math.cos(distP * Math.PI * 2.5) * 0.055;

    drawDragon({
      x: distX,
      y: distY,
      width: distW,
      flipX: true,
      pitch: -distDy,
      wingPhase: (simTime / 2.65) % 1,
      alpha: 0.56,
      filter: 'brightness(0.56) saturate(0.55) blur(0.6px)',
      fireIntensity: 0
    });

    // 3. Soft drifting dark smoke plume (behind main dragon)
    for (var s = smokeParticles.length - 1; s >= 0; s--) {
      var sp = smokeParticles[s];
      if (!paused) {
        sp.age += dt;
        sp.x += sp.vx * dt;
        sp.y += sp.vy * dt;
        sp.vx *= Math.pow(0.45, dt);
        sp.r += 22 * dt;
      }
      if (sp.age >= sp.life) {
        smokeParticles.splice(s, 1);
        continue;
      }
      var sRatio = sp.age / sp.life;
      var sAlpha = Math.sin(sRatio * Math.PI) * 0.34;
      ctx.save();
      ctx.globalAlpha = sAlpha;
      ctx.drawImage(smokeSprite, sp.x - sp.r, sp.y - sp.r, sp.r * 2, sp.r * 2);
      ctx.restore();
    }

    // 4. Main photorealistic dragon soaring left-to-right across the twilight sky
    var mainW = Math.max(255, Math.min(440, vw * 0.30));
    var mainCycle = 29;
    var mainP = (simTime % mainCycle) / mainCycle;
    var mainSpan = vw + mainW * 1.35;
    var mainX = -mainW * 0.65 + mainP * mainSpan;
    var waveAngle = mainP * Math.PI * 3.0;
    var mainY = vh * (vw < 640 ? 0.23 : 0.25) + Math.sin(waveAngle) * vh * 0.042;
    var mainPitch = Math.cos(waveAngle) * 0.075;
    var mainVx = mainSpan / mainCycle;

    // Periodic realistic dragonfire breath while dragon is clearly inside viewport
    var breathCycle = simTime % 9.6;
    var breathing = breathCycle > 1.4 && breathCycle < 3.05 && mainX > vw * 0.10 && mainX < vw * 0.80;
    var fireIntensity = 0;
    if (breathing) {
      var bNorm = (breathCycle - 1.4) / 1.65;
      fireIntensity = Math.sin(bNorm * Math.PI);
    }

    var mouthPos = drawDragon({
      x: mainX,
      y: mainY,
      width: mainW,
      flipX: false,
      pitch: mainPitch,
      wingPhase: (simTime / 2.15) % 1,
      alpha: 0.96,
      filter: 'drop-shadow(0 16px 26px rgba(0,0,0,0.68))',
      fireIntensity: fireIntensity
    });

    if (!paused && breathing && mouthPos) {
      spawnBreath(mouthPos.mx, mouthPos.my, mouthPos.scale, mainVx);
    }

    // 5. Realistic volumetric dragonfire particles (additive hot core -> crimson embers)
    if (fireParticles.length > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (var f = fireParticles.length - 1; f >= 0; f--) {
        var fp = fireParticles[f];
        if (!paused) {
          fp.age += dt;
          fp.x += fp.vx * dt;
          fp.y += fp.vy * dt;
          fp.vx *= Math.pow(0.24, dt);
          fp.vy += (-16 + (Math.random() - 0.5) * 14) * dt;
          fp.r += 18 * dt;
        }
        if (fp.age >= fp.life) {
          fireParticles.splice(f, 1);
          continue;
        }
        var t = fp.age / fp.life;
        var a = (1 - t) * (1 - t) * 0.62;
        var fg = ctx.createRadialGradient(fp.x, fp.y, fp.r * 0.08, fp.x, fp.y, fp.r);
        if (t < 0.32) {
          fg.addColorStop(0, 'rgba(255,244,196,' + a + ')');
          fg.addColorStop(0.45, 'rgba(250,152,52,' + (a * 0.78) + ')');
          fg.addColorStop(1, 'rgba(180,48,18,0)');
        } else {
          fg.addColorStop(0, 'rgba(246,124,42,' + (a * 0.85) + ')');
          fg.addColorStop(0.5, 'rgba(186,46,20,' + (a * 0.55) + ')');
          fg.addColorStop(1, 'rgba(90,18,12,0)');
        }
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.arc(fp.x, fp.y, fp.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 6. Low drifting mountain valley mist
    for (var j = 0; j < mists.length; j++) {
      var mv = mists[j];
      if (mv.kind === 'valley') {
        ctx.save();
        ctx.globalAlpha = mv.alpha;
        ctx.globalCompositeOperation = 'screen';
        var mw = mv.w * vw;
        var mh = mv.h * vh;
        ctx.drawImage(mistValleySprite, mv.x * vw - mw * 0.5, mv.y * vh - mh * 0.5, mw, mh);
        ctx.restore();
      }
    }

    // 7. Subtle drifting warm twilight embers
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var k = 0; k < embers.length; k++) {
      var em = embers[k];
      if (!paused) {
        em.y -= em.vy * dt;
        em.x += (em.vx + Math.sin(simTime * 0.9 + em.phase) * 0.008) * dt;
        if (em.y < -0.05) {
          em.y = 1.05;
          em.x = Math.random();
        }
        if (em.x < -0.05) em.x = 1.05;
        if (em.x > 1.05) em.x = -0.05;
      }
      var flicker = 0.55 + 0.45 * Math.sin(simTime * 3.4 + em.phase);
      var ex = em.x * vw;
      var ey = em.y * vh;
      var er = em.r * 2.4;
      var eg = ctx.createRadialGradient(ex, ey, 0, ex, ey, er);
      eg.addColorStop(0, 'rgba(255,232,170,' + (em.alpha * flicker) + ')');
      eg.addColorStop(0.45, 'rgba(235,126,52,' + (em.alpha * flicker * 0.45) + ')');
      eg.addColorStop(1, 'rgba(210,75,24,0)');
      ctx.fillStyle = eg;
      ctx.beginPath();
      ctx.arc(ex, ey, er, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function tick(ts) {
    if (!lastTs) lastTs = ts;
    var dt = Math.min((ts - lastTs) / 1000, 0.05);
    lastTs = ts;
    renderFrame(dt);
    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
})();
