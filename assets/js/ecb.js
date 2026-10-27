// Q2 home card: single GRAB-eCB trials (window.ECB from tools/export_ecb.py) drawn one at a time.
// Each trial is announced ("Reward" or "Omission"), its trace draws in, then stays as a faint line.
// Reward and omission alternate, each from the largest change to the smallest (the export's order).
// After all of them the card holds, fades and starts again. Runs only while on screen.
(function () {
  const E = window.ECB, box = document.querySelector("[data-ecb]");
  if (!E || !box) return;
  const svg = box.querySelector("svg"), label = box.querySelector(".ecb-label");
  const NS = "http://www.w3.org/2000/svg", W = 400, H = 250, pad = { l: 14, r: 10, t: 34, b: 30 };
  const ANNOUNCE = 600, DRAW = 1000, HOLD = 3000, FADE = 800;
  const COLOR = { reward: "#ee5525", omission: "#dad9d9" };
  const LABEL = { reward: "Reward", omission: "Omission" };

  const n = E.reward[0].length, t1 = E.t0 + E.dt * (n - 1);
  const all = E.reward.concat(E.omission).flat();
  const lo = Math.min(...all), hi = Math.max(...all);
  const x = s => pad.l + (s - E.t0) / (t1 - E.t0) * (W - pad.l - pad.r);
  const y = v => pad.t + (hi - v) / (hi - lo) * (H - pad.t - pad.b);
  const path = tr => tr.map((v, i) => `${i ? "L" : "M"}${x(E.t0 + i * E.dt).toFixed(1)},${y(v).toFixed(1)}`).join("");

  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("preserveAspectRatio", "none");
  // lever press line and scale bars (about a fifth of the z range, and 2 s)
  const zBar = [1, 2, 5, 10, 20, 50].reduce((a, b) => (Math.abs(b - (hi - lo) / 5) < Math.abs(a - (hi - lo) / 5) ? b : a)), sBar = 2, bx = W - pad.r - (x(sBar) - x(0)), by = H - 12;
  svg.innerHTML = `<line class="press" x1="${x(0)}" x2="${x(0)}" y1="${pad.t - 6}" y2="${H - pad.b + 4}"/>` +
    `<line class="zero" x1="${pad.l}" x2="${W - pad.r}" y1="${y(0)}" y2="${y(0)}"/>` +
    `<path class="bar" d="M${bx},${by - (y(0) - y(zBar))}V${by}H${W - pad.r}"/>`;
  box.querySelector(".ecb-press").style.left = `${x(0) / W * 100}%`;
  box.querySelector(".ecb-scale").textContent = `${zBar} z, ${sBar} s`;

  const layer = document.createElementNS(NS, "g");
  svg.appendChild(layer);
  // one cycle: reward 1, omission 1, reward 2, ... (both lists are sorted largest change first)
  function order() {
    const out = [];
    for (let i = 0; i < Math.max(E.reward.length, E.omission.length); i++) {
      if (i < E.reward.length) out.push(["reward", i]);
      if (i < E.omission.length) out.push(["omission", i]);
    }
    return out;
  }

  let queue = order(), k = 0, phase = "announce", start = null, current = null, currentTrace = null, visible = false, raf = 0;
  function step(now) {
    if (start == null) start = now;
    const dt = now - start;
    if (phase === "announce") {
      const [kind] = queue[k];
      label.textContent = LABEL[kind];
      label.style.color = COLOR[kind];
      label.style.opacity = "1";
      if (dt >= ANNOUNCE) {
        const [kind2, idx] = queue[k];
        current = document.createElementNS(NS, "path");
        currentTrace = E[kind2][idx];
        current.setAttribute("d", path(currentTrace.slice(0, 1)));
        current.setAttribute("class", "trace now");
        current.setAttribute("stroke", COLOR[kind2]);
        layer.appendChild(current);
        phase = "draw"; start = now;
      }
    } else if (phase === "draw") {
      const f = Math.min(1, dt / DRAW);
      // grow the path from the left (a dash reveal breaks with non-scaling strokes in a stretched SVG)
      current.setAttribute("d", path(currentTrace.slice(0, Math.max(1, Math.ceil(f * currentTrace.length)))));
      if (f >= 1) {
        current.setAttribute("class", "trace");
        label.style.opacity = "0";
        k++;
        phase = k < queue.length ? "announce" : "hold"; start = now;
      }
    } else if (phase === "hold") {
      if (dt >= HOLD) { phase = "fade"; start = now; }
    } else if (phase === "fade") {
      layer.style.opacity = String(Math.max(0, 1 - dt / FADE));
      if (dt >= FADE) {
        layer.replaceChildren(); layer.style.opacity = "1";
        queue = order(); k = 0; phase = "announce"; start = now;
      }
    }
    if (visible) raf = requestAnimationFrame(step);
  }

  new IntersectionObserver(es => es.forEach(e => {
    visible = e.isIntersecting;
    cancelAnimationFrame(raf);
    if (visible) { start = null; raf = requestAnimationFrame(step); }
  })).observe(box);
})();
