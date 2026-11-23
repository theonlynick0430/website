// Optimization landscapes.
//
// A faint 2D objective with several local minima, drawn as coloured contours, and a ball
// (an "ideal optimizer") that chases the global minimum with momentum: an underdamped
// spring plus a little sideways swirl, so it curves, overshoots, and then settles exactly.
//
// The landscape is a function of a single parameter p in [0, 1]. As p changes the whole
// landscape morphs, and the global minimum moves to height p (and wanders horizontally).
//
// Two instances use it:
//   - Desktop (>= 1100px, fine pointer): a scrollbar on the right edge. p = scroll progress,
//     and dragging/clicking the landscape scrolls the page.
//   - Mobile (<= 640px): a small panel beside the profile photo that cycles on its own:
//     morph to a new landscape, wait for the ball to settle, pause, repeat.
(function () {
  // ---------------------------------------------------------------- shared tunables
  const CONFIG = {
    cell: 5,              // contour grid resolution in CSS px (smaller = smoother, slower)
    levels: 14,           // number of contour lines
    lineWidth: 1,
    lineAlpha: 0.55,
    // Contour colours from deepest (index 0) to shallowest. Interpolated in between.
    palette: ["#3d3b80", "#3f6e9a", "#2a8a8c", "#6db39a", "#b9cf9a", "#e3d3a3"],
    ball: { radius: 5, fill: "#1d1f23", ring: "#ffffff", trail: 26 },
    spring: { freq: 0.75, damping: 0.42 }, // Hz, damping ratio (<1 => overshoot)
    swirl: 0.35,          // sideways curl on the ball's path, as a fraction of spring rate (0 = straight)
  };
  const MOBILE = {
    morphMs: 1600,        // how long one landscape takes to morph into the next
    pauseMs: 1400,        // pause after the ball settles before the next morph
  };

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const paletteRGB = CONFIG.palette.map(hexToRgb);
  const TAU = 6.283185;

  // ---------------------------------------------------------------- renderer
  // opts: { pad, locals, seed, xCenter, xAmp, cell, maxDpr, getProgress(), isAnimating(), onSettle() }
  function createLandscape(host, opts) {
    const fieldCv = host.querySelector(".landscape__field");
    const ballCv = host.querySelector(".landscape__ball");
    const fctx = fieldCv.getContext("2d");
    const bctx = ballCv.getContext("2d");

    let W = 0, H = 0, S = 0, dpr = 1;
    let active = false, raf = 0, lastP = -1, lastT = 0, settled = false;
    const ball = { x: 0, y: 0, vx: 0, vy: 0, init: false, path: [] };

    const rand = mulberry32(opts.seed);
    const locals = Array.from({ length: opts.locals }, (_, i) => ({
      yb: (i + 0.5) / opts.locals,
      yA: 0.04 + rand() * 0.07, yF: 0.6 + rand() * 1.6, yP: rand() * TAU,
      xb: 0.25 + rand() * 0.5,
      xA: 0.15 + rand() * 0.2, xF: 0.8 + rand() * 2.2, xP: rand() * TAU,
      d: 0.32 + rand() * 0.28, dF: 0.5 + rand() * 1.5, dP: rand() * TAU,
      s: 0.16 + rand() * 0.12,
    }));

    function globalMin(p) {
      const a = opts.xAmp;
      const fx = opts.xCenter + a * Math.sin(TAU * 1.3 * p + 0.4) + 0.3 * a * Math.sin(TAU * 3.1 * p + 1.7);
      return { x: fx * W, y: opts.pad + p * (H - 2 * opts.pad) };
    }

    // f(x, y) for landscape parameter p. Widths scale with the shorter side (S).
    function objective(p) {
      const g = globalMin(p);
      const sg = 0.3 * S;
      const ig = 1 / (2 * sg * sg);
      const keepOut = 1 / (2 * (1.7 * sg) ** 2);
      const wells = locals.map((l) => {
        const s = l.s * S;
        return {
          x: W * (l.xb + l.xA * Math.sin(TAU * l.xF * p + l.xP)),
          y: H * (l.yb + l.yA * Math.sin(TAU * l.yF * p + l.yP)),
          d: l.d * (0.75 + 0.25 * Math.sin(TAU * l.dF * p + l.dP)),
          i: 1 / (2 * s * s),
        };
      });
      const kx = 5 / S, ky = 4 / S, ph1 = p * 6, ph2 = p * 4;
      return (x, y) => {
        const gdx = x - g.x, gdy = y - g.y;
        const gr2 = gdx * gdx + gdy * gdy;
        // Local wells fade out near the global minimum so it always stays the deepest point.
        const shield = 1 - Math.exp(-gr2 * keepOut);
        let v = -Math.exp(-gr2 * ig);
        let loc = 0;
        for (let k = 0; k < wells.length; k++) {
          const w = wells[k];
          const dx = x - w.x, dy = y - w.y;
          loc += w.d * Math.exp(-(dx * dx + dy * dy) * w.i);
        }
        v -= loc * shield;
        v += 0.05 * Math.sin(x * kx + ph1) * Math.sin(y * ky - ph2);
        return v;
      };
    }

    function drawField(p) {
      const f = objective(p);
      const c = opts.cell || CONFIG.cell;
      const cols = Math.ceil(W / c) + 1;
      const rows = Math.ceil(H / c) + 1;
      const grid = new Float32Array(cols * rows);
      let lo = Infinity, hi = -Infinity;
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const v = f(i * c, j * c);
          grid[j * cols + i] = v;
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      }
      fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      fctx.clearRect(0, 0, W, H);
      fctx.lineWidth = CONFIG.lineWidth;
      fctx.lineJoin = "round";
      // Fixed absolute levels keep colours stable while the landscape morphs.
      const L0 = -1.0, L1 = 0.06;
      for (let k = 0; k < CONFIG.levels; k++) {
        const t = (k + 0.5) / CONFIG.levels;
        const level = L0 + t * (L1 - L0);
        if (level < lo || level > hi) continue;
        const [r, gC, b] = samplePalette(t);
        fctx.strokeStyle = `rgba(${r},${gC},${b},${CONFIG.lineAlpha})`;
        fctx.beginPath();
        marchingSquares(fctx, grid, cols, rows, c, level);
        fctx.stroke();
      }
    }

    function stepBall(target, p, dt) {
      if (!ball.init) {
        Object.assign(ball, { x: target.x, y: target.y, vx: 0, vy: 0, init: true });
        return;
      }
      const rm = reduceMotion.matches;
      const zeta = rm ? 1 : CONFIG.spring.damping;
      const w = 2 * Math.PI * CONFIG.spring.freq * (rm ? 2 : 1);
      const k = w * w, cdamp = 2 * zeta * w;
      // Swirl strength and direction drift with p, so paths curve both ways.
      const swirl = rm ? 0 : CONFIG.swirl * w * Math.sin(TAU * 1.7 * p + 0.9);
      // Semi-implicit Euler with small substeps for stability at low frame rates.
      const n = Math.max(1, Math.ceil(dt / (1 / 240)));
      const h = dt / n;
      for (let s = 0; s < n; s++) {
        // Spring toward the minimum plus a swirl perpendicular to the velocity. The swirl
        // does no work, so it curves the path without changing where the ball settles.
        ball.vx += (k * (target.x - ball.x) - cdamp * ball.vx - swirl * ball.vy) * h;
        ball.vy += (k * (target.y - ball.y) - cdamp * ball.vy + swirl * ball.vx) * h;
        ball.x += ball.vx * h;
        ball.y += ball.vy * h;
      }
    }

    function drawBall(target) {
      bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      bctx.clearRect(0, 0, W, H);

      // Faint marker on the true minimum.
      bctx.strokeStyle = "rgba(29,31,35,0.28)";
      bctx.lineWidth = 1;
      bctx.beginPath();
      bctx.moveTo(target.x - 4, target.y); bctx.lineTo(target.x + 4, target.y);
      bctx.moveTo(target.x, target.y - 4); bctx.lineTo(target.x, target.y + 4);
      bctx.stroke();

      // Fading trail (the optimizer's recent iterates).
      const pts = ball.path;
      for (let i = 1; i < pts.length; i++) {
        const a = i / pts.length;
        bctx.strokeStyle = `rgba(29,31,35,${0.22 * a})`;
        bctx.lineWidth = 1 + 1.5 * a;
        bctx.beginPath();
        bctx.moveTo(pts[i - 1][0], pts[i - 1][1]);
        bctx.lineTo(pts[i][0], pts[i][1]);
        bctx.stroke();
      }

      const r = CONFIG.ball.radius;
      bctx.shadowColor = "rgba(0,0,0,0.18)";
      bctx.shadowBlur = 6;
      bctx.shadowOffsetY = 1;
      bctx.fillStyle = CONFIG.ball.fill;
      bctx.beginPath();
      bctx.arc(ball.x, ball.y, r, 0, Math.PI * 2);
      bctx.fill();
      bctx.shadowColor = "transparent";
      bctx.strokeStyle = CONFIG.ball.ring;
      bctx.lineWidth = 1.5;
      bctx.stroke();
    }

    function frame(now) {
      raf = 0;
      if (!active || !W || !H) return;
      const step = lastT ? (now - lastT) / 1000 : 0;
      const dt = step > 0 ? Math.min(0.05, step) : 1 / 60;
      lastT = now;

      const p = opts.getProgress();
      if (p !== lastP) { drawField(p); lastP = p; }
      const target = globalMin(p);
      stepBall(target, p, dt);
      drawBall(target);

      const moving = Math.hypot(ball.vx, ball.vy) > 0.5 ||
                     Math.hypot(ball.x - target.x, ball.y - target.y) > 0.3;
      if (moving || opts.isAnimating()) {
        settled = false;
        ball.path.push([ball.x, ball.y]);
        if (ball.path.length > CONFIG.ball.trail) ball.path.shift();
        raf = requestAnimationFrame(frame);
      } else {
        // Settled: snap exactly, let the trail drain, then sleep until kicked again.
        ball.x = target.x; ball.y = target.y; ball.vx = ball.vy = 0;
        if (ball.path.length > 1) { ball.path.shift(); raf = requestAnimationFrame(frame); }
        else {
          lastT = 0;
          drawBall(target);
          if (!settled) { settled = true; opts.onSettle(); }
        }
      }
    }
    function kick() { if (active && !raf) raf = requestAnimationFrame(frame); }

    function resize() {
      const r = host.getBoundingClientRect();
      W = r.width; H = r.height; S = Math.min(W, H);
      dpr = Math.min(window.devicePixelRatio || 1, opts.maxDpr || 2);
      for (const cv of [fieldCv, ballCv]) {
        cv.width = Math.round(W * dpr);
        cv.height = Math.round(H * dpr);
      }
      lastP = -1;
      ball.init = false;
      ball.path = [];
      settled = false;
      kick();
    }

    function setActive(on) {
      active = on;
      if (on) resize();
      else if (raf) { cancelAnimationFrame(raf); raf = 0; }
    }

    new ResizeObserver(() => { if (active) resize(); }).observe(host);
    return { kick, setActive, invalidate() { lastP = -1; kick(); }, get height() { return H; } };
  }

  // ---------------------------------------------------------------- desktop: scrollbar
  (function desktop() {
    const host = document.querySelector(".landscape");
    if (!host) return;
    const root = document.documentElement;
    const mq = window.matchMedia("(min-width: 1100px) and (pointer: fine)");
    const pad = 28;

    function progress() {
      const max = root.scrollHeight - window.innerHeight;
      return max > 0 ? clamp(window.scrollY / max, 0, 1) : 0;
    }
    const ls = createLandscape(host, {
      pad, locals: 9, seed: 7, xCenter: 0.66, xAmp: 0.16,
      getProgress: progress, isAnimating: () => false, onSettle() {},
    });

    // Drag or click on the landscape to scroll.
    let dragging = false;
    function scrollToPointer(e) {
      const r = host.getBoundingClientRect();
      const p = clamp((e.clientY - r.top - pad) / (r.height - 2 * pad), 0, 1);
      window.scrollTo({ top: p * (root.scrollHeight - window.innerHeight), behavior: "instant" });
    }
    host.addEventListener("pointerdown", (e) => {
      dragging = true;
      host.setPointerCapture(e.pointerId);
      scrollToPointer(e);
      e.preventDefault();
    });
    host.addEventListener("pointermove", (e) => { if (dragging) scrollToPointer(e); });
    const endDrag = () => { dragging = false; };
    host.addEventListener("pointerup", endDrag);
    host.addEventListener("pointercancel", endDrag);

    function setActive(on) {
      root.classList.toggle("has-landscape", on);
      ls.setActive(on);
    }
    window.addEventListener("scroll", ls.kick, { passive: true });
    // Page height changes (images/fonts loading) change scroll progress.
    new ResizeObserver(ls.invalidate).observe(document.body);
    mq.addEventListener("change", (e) => setActive(e.matches));
    setActive(mq.matches);
  })();

  // ---------------------------------------------------------------- mobile: hero panel
  (function mobile() {
    const host = document.querySelector(".hero-landscape");
    if (!host) return;
    const mq = window.matchMedia("(max-width: 640px)");

    let p = 0.35, from = p, to = p, t0 = 0, morphing = false;
    let pauseTimer = 0, visible = true, enabled = false;
    let idle = false;       // ball has settled and is waiting for the next morph

    const ls = createLandscape(host, {
      pad: 18, locals: 7, seed: 11, xCenter: 0.55, xAmp: 0.3,
      cell: 2, maxDpr: 3,   // small panel: finer contour grid and full retina density
      getProgress: () => {
        if (morphing) {
          const u = clamp((performance.now() - t0) / MOBILE.morphMs, 0, 1);
          p = from + (to - from) * easeInOut(u);
          if (u >= 1) morphing = false;
        }
        return p;
      },
      isAnimating: () => morphing,
      onSettle: () => { idle = true; schedule(); },
    });

    function schedule() {
      clearTimeout(pauseTimer);
      if (!enabled || !visible || document.hidden || reduceMotion.matches) return;
      pauseTimer = setTimeout(next, MOBILE.pauseMs);
    }
    function next() {
      if (!enabled || !visible || document.hidden) return;
      // Pick a new landscape far enough from the current one to be a real change.
      let q;
      do { q = Math.random(); } while (Math.abs(q - p) < 0.3);
      from = p; to = q; t0 = performance.now(); morphing = true; idle = false;
      ls.kick();
    }

    // Only animate while the panel is on screen and the tab is visible.
    // Pausing cancels the pending morph, so resuming must restart the cycle if the ball
    // was already resting (otherwise nothing would ever schedule the next morph).
    function resume() { if (idle) schedule(); else ls.kick(); }
    new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      if (visible) resume(); else clearTimeout(pauseTimer);
    }).observe(host);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) clearTimeout(pauseTimer); else if (visible) resume();
    });

    function setActive(on) {
      enabled = on;
      if (!on) clearTimeout(pauseTimer);
      ls.setActive(on);
    }
    mq.addEventListener("change", (e) => setActive(e.matches));
    setActive(mq.matches);
  })();

  // ---------------------------------------------------------------- utils
  // Adds the iso-line segments for `level` to ctx's current path.
  function marchingSquares(ctx, grid, cols, rows, c, level) {
    const seg = (p, q) => { ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); };
    const lerpT = (v0, v1) => (level - v0) / (v1 - v0);
    for (let j = 0; j < rows - 1; j++) {
      for (let i = 0; i < cols - 1; i++) {
        const a = grid[j * cols + i];           // top-left
        const b = grid[j * cols + i + 1];       // top-right
        const d = grid[(j + 1) * cols + i];     // bottom-left
        const e = grid[(j + 1) * cols + i + 1]; // bottom-right
        const idx = (a > level ? 8 : 0) | (b > level ? 4 : 0) | (e > level ? 2 : 0) | (d > level ? 1 : 0);
        if (idx === 0 || idx === 15) continue;
        const x = i * c, y = j * c;
        const top = () => [x + c * lerpT(a, b), y];
        const right = () => [x + c, y + c * lerpT(b, e)];
        const bottom = () => [x + c * lerpT(d, e), y + c];
        const left = () => [x, y + c * lerpT(a, d)];
        switch (idx) {
          case 1: case 14: seg(left(), bottom()); break;
          case 2: case 13: seg(bottom(), right()); break;
          case 3: case 12: seg(left(), right()); break;
          case 4: case 11: seg(top(), right()); break;
          case 5: seg(left(), top()); seg(bottom(), right()); break;
          case 6: case 9: seg(top(), bottom()); break;
          case 7: case 8: seg(left(), top()); break;
          case 10: seg(left(), bottom()); seg(top(), right()); break;
        }
      }
    }
  }
  function easeInOut(u) { return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  function samplePalette(t) {
    const s = clamp(t, 0, 1) * (paletteRGB.length - 1);
    const i = Math.min(Math.floor(s), paletteRGB.length - 2);
    const u = s - i, a = paletteRGB[i], b = paletteRGB[i + 1];
    return [0, 1, 2].map((k) => Math.round(a[k] + (b[k] - a[k]) * u));
  }
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
})();
