// Pregnancy research card: PVN oxytocin-cell GCaMP around the cue (window.OXT from tools/export_oxt.py), static.
// Heatmap of the 40 strongest trials on top, their mean +/- SEM below, one shared time axis. Hovering a heatmap row
// draws that trial over the mean and names it; a crosshair follows the pointer through both panels; ticks mark
// each trial's lever press.
(function () {
  const O = window.OXT, box = document.querySelector("[data-oxt]");
  if (!O || !box) return;
  const canvas = box.querySelector("canvas"), svg = box.querySelector("svg"), read = box.querySelector(".oxt-read");
  const NS = "http://www.w3.org/2000/svg", n = O.rows.length, nb = O.mean.length, t1 = O.t0 + O.dt * (nb - 1);
  // below baseline blue, above it violet: the card's own colour, chosen to sit beside the site's orange
  const STOPS = ["#5592ad", "#16242b", "#111111", "#24183a", "#9f7aea", "#ece3ff"].map(h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)));
  const color = v => {
    const f = Math.max(0, Math.min(1, (v / O.lim + 1) / 2)) * (STOPS.length - 1), i = Math.min(STOPS.length - 2, Math.floor(f)), r = f - i;
    return STOPS[i].map((c, k) => Math.round(c + (STOPS[i + 1][k] - c) * r));
  };
  const DEFAULT = "Oxytocin cell Ca²⁺ dynamics";
  const el = (tag, attrs, parent = svg) => { const e = document.createElementNS(NS, tag); for (const a in attrs) e.setAttribute(a, attrs[a]); parent.appendChild(e); return e; };

  // heatmap pixels: one row per trial, one column per time bin
  canvas.width = nb; canvas.height = n;
  const ctx = canvas.getContext("2d"), img = ctx.createImageData(nb, n);
  O.rows.forEach((r, i) => r.forEach((v, j) => { const c = color(v), p = (i * nb + j) * 4; img.data.set([c[0], c[1], c[2], 255], p); }));
  ctx.putImageData(img, 0, 0);

  let L, hover = { row: -1 }, cross, rowBox, trial, trialPress, tRead;
  function build() {
    const r = box.getBoundingClientRect(), W = Math.max(1, r.width), H = Math.max(1, r.height);
    const padX = 14, top = 40, split = Math.round(H * 0.56), bottom = H - 26;
    const X = s => padX + (s - O.t0) / (t1 - O.t0) * (W - 2 * padX);
    const lo = Math.min(...O.mean.map((m, i) => m - O.sem[i]), -1), hi = Math.max(...O.mean.map((m, i) => m + O.sem[i])) * 1.15;
    const ty0 = split + 14;
    const Y = v => bottom - (v - lo) / (hi - lo) * (bottom - ty0);
    L = { W, H, X, Y, top, split, padX, rowH: (split - top) / n };
    Object.assign(canvas.style, { left: `${padX}px`, top: `${top}px`, width: `${W - 2 * padX}px`, height: `${split - top}px` });
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.replaceChildren();
    // cue on both panels
    el("rect", { class: "cue", x: X(O.cue[0]), y: ty0, width: X(O.cue[1]) - X(O.cue[0]), height: bottom - ty0 });
    for (const c of O.cue) el("line", { class: "cue-edge", x1: X(c), x2: X(c), y1: top, y2: bottom });
    el("text", { class: "lab", x: (X(O.cue[0]) + X(O.cue[1])) / 2, y: H - 8, "text-anchor": "middle" }).textContent = "Cue";
    // press ticks inside the heatmap (presses after +10 s fall outside the window)
    O.meta.forEach((m, i) => {
      if (m.latency > t1) return;
      const y = top + (i + 0.5) * L.rowH;
      el("line", { class: "press", x1: X(m.latency), x2: X(m.latency), y1: y - L.rowH * 0.45, y2: y + L.rowH * 0.45 });
    });
    // mean +/- SEM
    el("line", { class: "zero", x1: padX, x2: W - padX, y1: Y(0), y2: Y(0) });
    const up = O.mean.map((m, i) => `${X(O.t0 + i * O.dt).toFixed(1)},${Y(m + O.sem[i]).toFixed(1)}`);
    const dn = O.mean.map((m, i) => `${X(O.t0 + i * O.dt).toFixed(1)},${Y(m - O.sem[i]).toFixed(1)}`).reverse();
    el("polygon", { class: "sem", points: up.concat(dn).join(" ") });
    el("path", { class: "mean", d: O.mean.map((m, i) => `${i ? "L" : "M"}${X(O.t0 + i * O.dt).toFixed(1)},${Y(m).toFixed(1)}`).join("") });
    // z scale bar
    const bar = [1, 2, 5, 10].reduce((a, b) => (Math.abs(b - (hi - lo) / 4) < Math.abs(a - (hi - lo) / 4) ? b : a));
    el("path", { class: "bar", d: `M${W - padX},${Y(0) - (Y(0) - Y(bar))}V${Y(0)}` });
    el("text", { class: "lab", x: W - padX - 4, y: Y(0) - (Y(0) - Y(bar)) / 2 + 3, "text-anchor": "end" }).textContent = `${bar} z`;
    // hover layer; the hovered trial is clipped to the trace panel (single trials can run far above the mean)
    const clip = el("clipPath", { id: "oxt-clip" }, el("defs", {}));
    el("rect", { x: 0, y: ty0, width: W, height: bottom - ty0 }, clip);
    trial = el("path", { class: "trial", "clip-path": "url(#oxt-clip)" });
    trialPress = el("line", { class: "press-now" });
    rowBox = el("rect", { class: "row-box", x: padX, width: W - 2 * padX, height: L.rowH });
    cross = el("line", { class: "cross", y1: top, y2: bottom });
    tRead = el("text", { class: "lab t-read", y: ty0 + 10 });
    show(hover.row, hover.t);
  }

  function show(row, t) {
    const on = t != null;
    cross.style.display = tRead.style.display = on ? "" : "none";
    if (on) {
      const x = L.X(t), j = Math.round((t - O.t0) / O.dt);
      cross.setAttribute("x1", x); cross.setAttribute("x2", x);
      tRead.setAttribute("x", Math.min(x + 6, L.W - 90)); tRead.textContent = `${t.toFixed(1)} s, mean ${O.mean[j].toFixed(1)} z`;
    }
    const has = row >= 0;
    trial.style.display = rowBox.style.display = has ? "" : "none";
    trialPress.style.display = has && O.meta[row].latency <= t1 ? "" : "none";
    read.classList.toggle("is-title", !has);
    if (!has) { read.textContent = DEFAULT; return; }
    const m = O.meta[row];
    rowBox.setAttribute("y", L.top + row * L.rowH);
    trial.setAttribute("d", O.rows[row].map((v, i) => `${i ? "L" : "M"}${L.X(O.t0 + i * O.dt).toFixed(1)},${L.Y(Math.max(v, -50)).toFixed(1)}`).join(""));
    const px = L.X(m.latency);
    trialPress.setAttribute("x1", px); trialPress.setAttribute("x2", px);
    trialPress.setAttribute("y1", L.split + 14); trialPress.setAttribute("y2", L.H - 26);
    read.textContent = `Mouse ${m.mouse}, day ${m.day}, trial ${m.trial}: press at ${m.latency} s, peak ${m.peak} z`;
  }

  function pick(e) {
    const b = box.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
    const t = O.t0 + (x - L.padX) / (L.W - 2 * L.padX) * (t1 - O.t0);
    hover.t = t >= O.t0 && t <= t1 ? t : null;
    hover.row = y >= L.top && y < L.split ? Math.min(n - 1, Math.floor((y - L.top) / L.rowH)) : hover.row;
    show(hover.row, hover.t);
  }
  box.addEventListener("pointermove", pick);
  box.addEventListener("pointerdown", pick);
  box.addEventListener("pointerleave", () => { hover = { row: -1 }; show(-1, null); });
  build();
  new ResizeObserver(build).observe(box);
})();
