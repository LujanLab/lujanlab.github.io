// eCB research card: 12 min stretches of GRAB-eCB photometry during FR4 drug self-administration (window.FR4 from
// tools/export_fr4.py), static. One row per stretch, all on the same dF/F scale; orange ticks under each row are
// active-lever presses, white triangles and faint lines mark drug infusions. Redrawn when the card resizes.
(function () {
  const F = window.FR4, box = document.querySelector("[data-fr4]");
  if (!F || !box) return;
  const svg = box.querySelector("svg"), title = box.querySelector(".fr4-title"), NS = "http://www.w3.org/2000/svg";
  const all = F.rows.flatMap(r => r.dff), lo = Math.min(...all), hi = Math.max(...all);
  const el = (tag, attrs, parent = svg) => { const e = document.createElementNS(NS, tag); for (const a in attrs) e.setAttribute(a, attrs[a]); parent.appendChild(e); return e; };
  const text = (attrs, s) => { el("text", attrs).textContent = s; };

  function build() {
    const r = box.getBoundingClientRect(), W = Math.max(1, r.width), H = Math.max(1, r.height);
    const padX = 14, top = title.getBoundingClientRect().height + 30, foot = 40, gap = 22, tick = 9, mark = 9;
    const nRows = F.rows.length, rowH = (H - top - foot - gap * (nRows - 1)) / nRows;
    const X = s => padX + s / F.duration * (W - 2 * padX);
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.replaceChildren();
    let unit = 0;
    F.rows.forEach((row, k) => {
      const y0 = top + k * (rowH + gap), traceTop = y0 + mark + 4, traceBot = y0 + rowH - tick - 4;
      const Y = v => traceBot - (v - lo) / (hi - lo) * (traceBot - traceTop);
      unit = (traceBot - traceTop) / (hi - lo);
      text({ class: "lab", x: padX, y: y0 - 4 }, row.label);
      for (const d of row.drug) {
        const x = X(d);
        el("line", { class: "drug-line", x1: x, x2: x, y1: traceTop, y2: traceBot });
        el("path", { class: "drug", d: `M${x - mark / 2},${y0}h${mark}l${-mark / 2},${mark}z` });
      }
      el("path", { class: "trace", d: row.dff.map((v, i) => `${i ? "L" : "M"}${X(i * F.dt).toFixed(1)},${Y(v).toFixed(1)}`).join("") });
      for (const p of row.press) el("line", { class: "press", x1: X(p), x2: X(p), y1: y0 + rowH - tick, y2: y0 + rowH });
    });
    // legend and scale bars along the bottom
    const yb = H - 14, sx = (W - 2 * padX) * 60 / F.duration;
    el("path", { class: "bar", d: `M${W - padX - sx},${yb}H${W - padX}` });
    text({ class: "lab", x: W - padX - sx / 2, y: yb + 11, "text-anchor": "middle" }, "1 min");
    el("path", { class: "bar", d: `M${W - padX},${yb}V${yb - unit}` });
    text({ class: "lab", x: W - padX - 4, y: yb - unit / 2, "text-anchor": "end" }, "1% ΔF/F");
    el("line", { class: "press", x1: padX + 2, x2: padX + 2, y1: yb - 8, y2: yb + 1 });
    text({ class: "lab", x: padX + 9, y: yb }, `Lever press (${F.schedule})`);
    el("path", { class: "drug", d: `M${padX + 118},${yb - 8}h9l-4.5,9z` });
    text({ class: "lab", x: padX + 132, y: yb }, "Drug infusion");
  }

  build();
  new ResizeObserver(build).observe(box);
})();
