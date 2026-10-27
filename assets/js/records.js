// Cumulative lever-press records for every session (window.GRAPHICS from tools/export_graphics.py).
// Hovering or tapping a line highlights it and shows that mouse's seeking and vulnerability scores.
window.LabRecords = function (svg, tip) {
  const G = window.GRAPHICS, R = G.records, SC = G.scores, NS = "http://www.w3.org/2000/svg";
  const w = 400, h = 250, pad = { l: 34, r: 8, t: 8, b: 20 };
  const tmax = Math.max(...R.map(r => r.duration_s)) / 60, nmax = Math.max(...R.map(r => r.press.length));
  // square-root y so sessions with a hundred presses are as readable as those with a thousand
  const x = m => pad.l + m / tmax * (w - pad.l - pad.r), y = n => h - pad.b - Math.sqrt(n / nmax) * (h - pad.t - pad.b);
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("preserveAspectRatio", "none");
  const step = r => {
    let d = `M${x(0)},${y(0)}`;
    r.press.forEach((t, i) => { d += `H${x(t / 60).toFixed(1)}V${y(i + 1).toFixed(1)}`; });
    return d + `H${x(r.duration_s / 60).toFixed(1)}`;
  };
  let html = `<path class="axis" d="M${pad.l},${pad.t}V${h - pad.b}H${w - pad.r}"/>`;
  for (let m = 0; m <= tmax; m += 30) html += `<text x="${x(m)}" y="${h - 6}" text-anchor="middle">${m} min</text>`;
  for (const n of [0, 50, 200, 1000]) if (n <= nmax) html += `<text x="${pad.l - 5}" y="${y(n) + 3}" text-anchor="end">${n}</text>`;
  svg.innerHTML = html;
  const paths = R.map(r => {
    const p = document.createElementNS(NS, "path");
    p.setAttribute("class", "sess"); p.setAttribute("d", step(r));
    svg.appendChild(p);
    return p;
  });

  const ROLE = { FR1a: "first self-administration session", FR1b: "second self-administration session", BE: "behavioral economics session" };
  const sign = v => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(2);
  const bar = v => { const f = Math.max(-2.5, Math.min(2.5, v)) / 2.5 * 50; return `<span class="bar"><i style="left:${50 + Math.min(0, f)}%;width:${Math.abs(f)}%"></i></span>`; };
  const idle = `Cumulative lever presses in all ${R.length} sessions from ${Object.keys(SC).length} mice. Hover a line for that mouse's scores.`;
  tip.innerHTML = idle;

  // presses so far at minute m, for finding the line nearest the pointer
  const countAt = (r, m) => { let lo = 0, hi = r.press.length; while (lo < hi) { const k = (lo + hi) >> 1; if (r.press[k] / 60 <= m) lo = k + 1; else hi = k; } return lo; };
  let current = -1;
  function pick(e) {
    const b = svg.getBoundingClientRect();
    const sx = (e.clientX - b.left) / b.width * w, sy = (e.clientY - b.top) / b.height * h;
    const m = (sx - pad.l) / (w - pad.l - pad.r) * tmax;
    let best = -1, bd = 14 * h / b.height;    // within about 14 screen pixels
    R.forEach((r, i) => { if (m < 0 || m > r.duration_s / 60) return; const d = Math.abs(y(countAt(r, m)) - sy); if (d < bd) { bd = d; best = i; } });
    show(best);
  }
  function show(i) {
    if (i === current) return;
    current = i;
    paths.forEach((p, k) => p.setAttribute("class", "sess" + (i < 0 ? "" : k === i ? " on" : " dim")));
    if (i < 0) { tip.innerHTML = idle; return; }
    svg.appendChild(paths[i]);   // draw the chosen line on top
    const r = R[i], s = SC[r.mouse];
    tip.innerHTML = `<b>Mouse ${r.mouse}</b>, ${ROLE[r.role] || r.role}<br>${r.press.length.toLocaleString("en-US")} presses in ${Math.round(r.duration_s / 60)} min` +
      (s ? `<div class="row">Seeking score ${bar(s.seeking)}<span>${sign(s.seeking)}</span></div>` +
           `<div class="row">Vulnerability score ${bar(s.vulnerability)}<span>${sign(s.vulnerability)}</span></div>` : "");
  }
  svg.addEventListener("pointermove", pick);
  svg.addEventListener("pointerdown", pick);
  svg.addEventListener("pointerleave", () => show(-1));
};
document.querySelectorAll("svg[data-records]").forEach(svg => window.LabRecords(svg, svg.parentElement.querySelector(".tip")));
