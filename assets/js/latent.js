// Q1 research card: the latent state of one session moving through its PC1-PC2 plane, drawn as SVG
// (window.LATENT from tools/export_latent.py). Plays the 150 s stretch at 5x and loops; the tail is coloured by
// engagement state and rings pulse at active presses and cues. On the right, the units on the probe's 4 shanks
// change colour with their speed against Rest, as in the video. The plane stretches to fill the card (PC1 and PC2
// get their own scales), and is redrawn when the card changes size. Runs only while on screen.
(function () {
  const L = window.LATENT, box = document.querySelector("[data-latent]");
  if (!L || !box) return;
  const svg = box.querySelector("svg"), label = box.querySelector(".latent-label");
  const NS = "http://www.w3.org/2000/svg";
  const SPEED = 5, TAIL_S = 8, PULSE_S = 0.6 * SPEED;            // pulse length in data seconds
  const COLOR = ["#6b6a6a", "#dad9d9", "#ee5525"];                // Disengaged, Rest, Press bout
  const [[x0, x1], [y0, y1]] = L.lims, nTail = Math.round(TAIL_S / L.dt), n = L.x.length;
  const el = (tag, attrs, parent = svg) => { const e = document.createElementNS(NS, tag); for (const a in attrs) e.setAttribute(a, attrs[a]); parent.appendChild(e); return e; };
  let X, Y, segs, dot, rings, units, scale = 1;

  // units on the 4 shanks: unit speed vs its own Rest mean, log2 x 64 (int8), one row of units per sample
  const P = L.probe, nU = P.shank.length;
  const speed = (b => { const s = atob(b), a = new Int8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i) << 24 >> 24; return a; })(P.speed);
  const SLOW = [85, 146, 173], REST = [218, 217, 217], FAST = [238, 85, 37];   // slower, Rest level, faster
  const speedColor = q => {
    const f = Math.max(-1, Math.min(1, q / 64 / 1.5)), to = f < 0 ? SLOW : FAST, a = Math.abs(f);
    return `rgb(${REST.map((c, i) => Math.round(c + (to[i] - c) * a)).join(",")})`;
  };

  // static layer (axes, session cloud, ellipses, probe) in the card's own pixels
  function build() {
    const r = box.getBoundingClientRect(), W = Math.max(1, r.width), H = Math.max(1, r.height);
    const padX = 18, padT = 40, padB = 22, PW = Math.max(70, Math.min(120, W * 0.22));
    X = v => padX + (v - x0) / (x1 - x0) * (W - PW - 2 * padX);
    Y = v => H - padB - (v - y0) / (y1 - y0) * (H - padT - padB);
    scale = Math.min(W, H) / 250;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.replaceChildren();
    el("line", { class: "axis", x1: X(x0), x2: X(x1), y1: Y(0), y2: Y(0) });
    el("line", { class: "axis", x1: X(0), x2: X(0), y1: Y(y0), y2: Y(y1) });
    el("text", { class: "ax-label", x: X(x1), y: Y(0) - 6, "text-anchor": "end" }).textContent = "PC1";
    el("text", { class: "ax-label", x: X(0) + 6, y: Y(y1) + 4 }).textContent = "PC2";
    const cloud = el("g", { class: "cloud" });
    for (const [a, b] of L.cloud) el("circle", { cx: X(a).toFixed(1), cy: Y(b).toFixed(1), r: 1.3 }, cloud);
    for (const [E, cls] of [[L.rest, "rest"], [L.bout, "bout"]]) {
      if (!E) continue;
      // the 1 SD ellipse as a polygon, so it follows the two axis scales
      const t = E.a * Math.PI / 180, pts = [];
      for (let i = 0; i < 64; i++) {
        const u = i / 64 * 2 * Math.PI, a = E.r[0] * Math.cos(u), b = E.r[1] * Math.sin(u);
        pts.push(`${X(E.c[0] + a * Math.cos(t) - b * Math.sin(t)).toFixed(1)},${Y(E.c[1] + a * Math.sin(t) + b * Math.cos(t)).toFixed(1)}`);
      }
      el("polygon", { class: cls, points: pts.join(" ") });
    }
    // probe strip on the right: 4 shanks drawn to the same depth scale, units at their peak channel
    const d0 = Math.min(...P.depth) - 70, d1 = Math.max(...P.depth) + 70, legendH = 34;
    const top = padT + 16;                                          // clear of the card's method label
    const D = v => top + (d1 - v) / (d1 - d0) * (H - top - padB - legendH);
    const sx = i => W - PW + PW * (i + 0.5) / 4, sw = Math.min(10, PW / 9);
    const probe = el("g", { class: "probe" });
    for (let i = 0; i < 4; i++) el("rect", { x: sx(i) - sw / 2, y: D(d1) - 6, width: sw, height: D(d0) - D(d1) + 6 }, probe);
    units = P.shank.map((s, i) => el("circle", { cx: (sx(s) + (P.side[i] ? 1 : -1) * sw * 0.28).toFixed(1),
      cy: D(P.depth[i]).toFixed(1), r: Math.max(2, Math.min(3.4, (H - padT - padB) / 160)) }, probe));
    const gy = H - padB - 8, gx0 = W - PW + 6, gx1 = W - 6;
    const grad = el("linearGradient", { id: "latent-speed" }, el("defs", {}));
    for (const [o, c] of [[0, SLOW], [0.5, REST], [1, FAST]]) el("stop", { offset: o, "stop-color": `rgb(${c})` }, grad);
    el("rect", { x: gx0, y: gy - 4, width: gx1 - gx0, height: 4, fill: "url(#latent-speed)" });
    el("text", { class: "ax-label", x: gx0, y: gy + 11 }).textContent = "slower";
    el("text", { class: "ax-label", x: gx1, y: gy + 11, "text-anchor": "end" }).textContent = "faster";
    el("text", { class: "ax-label", x: (gx0 + gx1) / 2, y: gy - 9, "text-anchor": "middle" }).textContent = "Latent speed";
    const tailG = el("g", { class: "tail" }), ringG = el("g", { class: "rings" });
    segs = Array.from({ length: nTail }, () => el("line", {}, tailG));
    dot = el("circle", { class: "now", r: 4.5 * scale });
    rings = L.press.map(t => ({ t, e: el("circle", { class: "ring press" }, ringG) }))
      .concat(L.cue.map(t => ({ t, e: el("circle", { class: "ring cue" }, ringG) })));
  }

  const idx = t => Math.min(n - 1, Math.max(0, Math.round(t / L.dt)));
  let clock = 0, last = null, visible = false, raf = 0, shown = -1;
  function frame(now) {
    if (last != null) clock = (clock + (now - last) / 1000 * SPEED) % L.duration;
    last = now;
    const i = idx(clock), st = L.s[i];
    for (let j = 0; j < nTail; j++) {
      const a = i - nTail + j, b = a + 1, s = segs[j];
      if (a < 0) { s.setAttribute("opacity", "0"); continue; }
      const age = 1 - j / nTail;
      s.setAttribute("x1", X(L.x[a]).toFixed(1)); s.setAttribute("y1", Y(L.y[a]).toFixed(1));
      s.setAttribute("x2", X(L.x[b]).toFixed(1)); s.setAttribute("y2", Y(L.y[b]).toFixed(1));
      s.setAttribute("stroke", COLOR[L.s[b]]);
      s.setAttribute("stroke-width", ((0.6 + 3.2 * (1 - age)) * scale).toFixed(2));
      s.setAttribute("opacity", (0.15 + 0.85 * (1 - age)).toFixed(2));
    }
    dot.setAttribute("cx", X(L.x[i]).toFixed(1)); dot.setAttribute("cy", Y(L.y[i]).toFixed(1)); dot.setAttribute("fill", COLOR[st]);
    for (const r of rings) {
      const ph = (clock - r.t) / PULSE_S;
      if (ph < 0 || ph > 1) { r.e.setAttribute("opacity", "0"); continue; }
      const k = idx(r.t);
      r.e.setAttribute("cx", X(L.x[k]).toFixed(1)); r.e.setAttribute("cy", Y(L.y[k]).toFixed(1));
      r.e.setAttribute("r", ((4 + 22 * ph) * scale).toFixed(1)); r.e.setAttribute("opacity", (1 - ph).toFixed(2));
    }
    const row = Math.min(Math.floor(clock / P.dt), speed.length / nU - 1) * nU;
    for (let u = 0; u < nU; u++) units[u].setAttribute("fill", speedColor(speed[row + u]));
    if (st !== shown) { label.textContent = L.states[st]; label.style.color = COLOR[st]; shown = st; }
    if (visible) raf = requestAnimationFrame(frame);
  }

  build();
  new ResizeObserver(() => { build(); if (!visible) frame(performance.now()); }).observe(box);
  new IntersectionObserver(es => es.forEach(e => {
    visible = e.isIntersecting;
    cancelAnimationFrame(raf);
    if (visible) { last = null; raf = requestAnimationFrame(frame); }
  })).observe(box);
})();
