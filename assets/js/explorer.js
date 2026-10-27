// Raster player for one whole session (tools/export_raster.py -> window.SESSION + cNNN.js chunks).
// The raster plays a window of W seconds in real time; the overview strip shows the full session
// (population rate, press rate, cues) with a box marking where the raster is. The page moves
// through the session with seek() and setWindow().
(function () {
  function decode(b64, Type) {
    const bin = atob(b64), buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return new Type(buf.buffer);
  }
  function lowerBound(arr, lo, hi, v) {
    while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < v) lo = m + 1; else hi = m; }
    return lo;
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // Contiguous runs of the same region group, for labelling depth bands next to the raster.
  function bands(data, minRows) {
    const g = data.unit_group, out = [];
    let start = 0;
    for (let i = 1; i <= g.length; i++) {
      if (i === g.length || g[i] !== g[start]) {
        if (i - start >= (minRows || 6)) out.push({ group: data.groups[g[start]], from: start, to: i });
        start = i;
      }
    }
    return out;
  }

  // opts: raster, overview (canvases), base (chunk folder URL), window (s), rowColor(group) -> css,
  //       autoplay (true plays even under reduced motion, false never plays on load),
  //       minWindow / maxWindow (s, limits when resizing the box on the strip),
  //       colors {press, cue, inactive, pop, rate, box, axis}, onUpdate(state), onUser({t, W}) after a drag or key
  // The window box on the strip is centred on the window but drawn wider than to scale: MIN_BOX CSS px at the
  // shortest window plus GROW px per extra second, so short windows on a long session can be grabbed and their
  // length seen. The "Session time" readout gives the exact span.
  const MIN_BOX = 14, GROW = 1.5;
  function create(opts) {
    const D = opts.data, n = D.n_units, dur = D.duration_s, CH = D.chunk_s;
    const rowColors = D.unit_group.map(i => opts.rowColor(D.groups[i]));
    const pop = decode(D.pop_rate, Uint16Array), rate = decode(D.press_rate, Uint16Array);
    const ev = D.events, col = opts.colors;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches && !/[?&]motion\b/.test(location.search);
    const rc = opts.raster.getContext("2d"), oc = opts.overview.getContext("2d");
    const chunks = new Map();

    let W = opts.window || 8, t = clamp(D.start_s != null ? D.start_s : 0, 0, dur - W);
    let playing = opts.autoplay === true || (!reduce && opts.autoplay !== false), last = null, raf = 0, visible = true;
    let dpr = 1, rw = 1, rh = 1, ow = 1, oh = 1, overviewImg = null;

    // each chunk is a script calling LabChunk(i, base64), loaded on demand
    window.LabChunk = (i, b64) => {
      const c = chunks.get(i); if (!c) return;
      const buf = decode(b64, Uint8Array).buffer;
      c.offsets = new Uint32Array(buf, 0, n + 1);
      c.times = new Uint16Array(buf, (n + 1) * 4);
      c.ready = true; if (!playing) draw();
    };
    function chunk(i) {
      if (i < 0 || i >= D.n_chunks) return null;
      let c = chunks.get(i);
      if (!c) {
        c = { ready: false };
        chunks.set(i, c);
        const s = document.createElement("script");
        s.src = `${opts.base}c${String(i).padStart(3, "0")}.js`;
        s.onerror = () => chunks.delete(i);
        document.head.appendChild(s);
      }
      return c;
    }

    function size(cv) {
      const r = cv.getBoundingClientRect();
      cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr));
      return [cv.width, cv.height];
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      [rw, rh] = size(opts.raster);
      [ow, oh] = size(opts.overview);
      buildOverview();
      draw();
    }

    // full-session strip: population rate (filled), press rate (line), cue ticks along the top
    function buildOverview() {
      const off = document.createElement("canvas"); off.width = ow; off.height = oh;
      const x = off.getContext("2d"), top = Math.round(oh * 0.16), H = oh - top;
      const nb = pop.length, px = ow / nb;
      let pmax = 0, rmax = 0;
      for (let i = 0; i < nb; i++) { pmax = Math.max(pmax, pop[i]); rmax = Math.max(rmax, rate[i]); }
      x.fillStyle = col.pop;
      x.beginPath(); x.moveTo(0, oh);
      for (let i = 0; i < nb; i++) x.lineTo(i * px, oh - (pop[i] / pmax) * H * 0.92);
      x.lineTo(ow, oh); x.closePath(); x.fill();
      x.strokeStyle = col.press; x.lineWidth = 1.5 * dpr; x.lineJoin = "round";
      x.beginPath();
      for (let i = 0; i < nb; i++) { const y = oh - (rate[i] / rmax) * H * 0.92; i ? x.lineTo(i * px, y) : x.moveTo(0, y); }
      x.stroke();
      x.fillStyle = col.cue;
      for (const c of ev.cue) x.fillRect(Math.round(c / dur * ow), 0, Math.max(1, dpr), top - 2 * dpr);
      overviewImg = off;
    }

    function inWindow(arr) {
      let k = 0;
      for (const v of arr) if (v >= t && v < t + W) k++;
      return k;
    }

    function draw() {
      // raster
      rc.clearRect(0, 0, rw, rh);
      const px = rw / W, rowH = rh / n;
      const tickH = Math.max(1.5 * dpr, rowH * 0.9), tickW = Math.max(1.6 * dpr, Math.min(3 * dpr, px * 0.004));
      for (const [type, c] of [["inactive", col.inactive], ["cue", col.cue], ["press", col.press]]) {
        if (!c) continue;
        rc.fillStyle = c;
        for (const e of ev[type]) if (e >= t && e < t + W) rc.fillRect(Math.round((e - t) * px), 0, Math.max(1, dpr * (type === "press" ? 1.5 : 1)), rh);
      }
      let shown = 0;
      for (let ci = Math.floor(t / CH); ci <= Math.floor((t + W) / CH); ci++) {
        const c = chunk(ci); if (!c || !c.ready) continue;
        const c0 = ci * CH, lo = Math.max(0, (t - c0) * 1000), hi = (t + W - c0) * 1000;
        for (let u = 0; u < n; u++) {
          const a = c.offsets[u], b = c.offsets[u + 1];
          if (a === b) continue;
          rc.fillStyle = rowColors[u];
          const y = u * rowH + (rowH - tickH) / 2;
          for (let k = lowerBound(c.times, a, b, lo); k < b && c.times[k] < hi; k++) {
            rc.fillRect((c0 + c.times[k] / 1000 - t) * px - tickW / 2, y, tickW, tickH); shown++;
          }
        }
      }
      chunk(Math.floor((t + W) / CH) + 1);   // prefetch the next minute
      // overview + window box
      oc.clearRect(0, 0, ow, oh);
      if (overviewImg) oc.drawImage(overviewImg, 0, 0);
      const [bx, bx1] = boxSpan(ow, dpr), bw = bx1 - bx;
      oc.fillStyle = col.boxFill; oc.fillRect(bx, 0, bw, oh);
      oc.strokeStyle = col.box; oc.lineWidth = 1.5 * dpr; oc.strokeRect(bx, dpr, bw, oh - 2 * dpr);
      // grips on both edges show the box can be resized
      oc.fillStyle = col.box;
      const gh = Math.round(oh * 0.4), gy = Math.round((oh - gh) / 2), gw = 3 * dpr;
      oc.fillRect(bx - gw / 2, gy, gw, gh); oc.fillRect(bx + bw - gw / 2, gy, gw, gh);
      opts.overview.setAttribute("aria-valuenow", Math.round(t));
      opts.overview.setAttribute("aria-valuetext", `${fmt(t)} to ${fmt(t + W)}, ${Math.round(W)} seconds`);
      if (opts.onUpdate) opts.onUpdate({ t, W, dur, playing, shown, rate: shown / n / W,
        presses: inWindow(ev.press), cues: inWindow(ev.cue), inactive: inWindow(ev.inactive) });
    }

    // where the window box is drawn on a strip `width` units wide, `k` units per CSS px
    function boxSpan(width, k) {
      const c = (t + W / 2) / dur * width, bw = Math.max(W / dur * width, (MIN_BOX + (W - minW) * GROW) * k);
      return [c - bw / 2, c + bw / 2];
    }

    function frame(now) {
      if (last != null) { t += (now - last) / 1000; if (t > dur - W) t = 0; }
      last = now;
      if (visible) draw();
      if (playing) raf = requestAnimationFrame(frame);
    }
    function play() { if (playing) return; playing = true; last = null; raf = requestAnimationFrame(frame); }
    function pause() { playing = false; cancelAnimationFrame(raf); draw(); }
    function seek(v) { t = clamp(v, 0, dur - W); last = null; if (!playing) draw(); }
    function setWindow(w) { const mid = t + W / 2; W = w; seek(mid - W / 2); }

    // the window box on the strip: drag it to move through the session, drag either edge to change its length,
    // or press anywhere else on the strip to move it there (and keep dragging). Arrow keys move it, Up and Down
    // change its length. Playback pauses while dragging and resumes after.
    const ov = opts.overview, minW = opts.minWindow || 4, maxW = Math.min(opts.maxWindow || 60, dur);
    ov.tabIndex = 0;
    ov.setAttribute("role", "slider");
    ov.setAttribute("aria-label", "Part of the session shown above. Drag to move, drag an edge to resize; arrow keys move, Up and Down resize");
    ov.setAttribute("aria-valuemin", 0); ov.setAttribute("aria-valuemax", Math.round(dur));
    const timeAt = e => { const r = ov.getBoundingClientRect(); return clamp((e.clientX - r.left) / r.width, 0, 1) * dur; };
    function zone(e) {
      const r = ov.getBoundingClientRect(), x = e.clientX - r.left;
      const [x0, x1] = boxSpan(r.width, 1);
      const edge = e.pointerType === "touch" ? 14 : 8, inner = Math.min(edge, (x1 - x0) / 3);
      if (x >= x0 - edge && x <= x0 + inner) return "left";
      if (x >= x1 - inner && x <= x1 + edge) return "right";
      return x > x0 && x < x1 ? "move" : "jump";
    }
    const CURSOR = { left: "ew-resize", right: "ew-resize", move: "grab", jump: "pointer" };
    let drag = null;
    const changed = () => { last = null; draw(); if (opts.onUser) opts.onUser({ t, W }); };
    ov.addEventListener("pointermove", e => {
      if (!drag) { ov.style.cursor = CURSOR[zone(e)]; return; }
      const dx = e.clientX - drag.x0;
      if (drag.mode === "move") t = clamp(drag.t0 + dx / ov.getBoundingClientRect().width * dur, 0, dur - W);
      else {
        // resizing keeps the middle of the window in place; the dragged edge follows the pointer and the other mirrors it
        const mid = drag.t0 + drag.W0 / 2;
        W = Math.round(clamp(drag.W0 + (drag.mode === "right" ? 2 : -2) * dx / GROW, minW, maxW));
        t = clamp(mid - W / 2, 0, dur - W);
      }
      changed();
    });
    ov.addEventListener("pointerdown", e => {
      if (e.button !== 0) return;
      let mode = zone(e);
      if (mode === "jump") { t = clamp(timeAt(e) - W / 2, 0, dur - W); mode = "move"; }
      drag = { mode, x0: e.clientX, t0: t, W0: W, resume: playing };
      if (playing) pause();
      ov.setPointerCapture(e.pointerId);
      ov.style.cursor = mode === "move" ? "grabbing" : "ew-resize";
      changed();
    });
    const end = e => {
      if (!drag) return;
      const resume = drag.resume; drag = null;
      ov.style.cursor = CURSOR[zone(e)];
      if (resume) play();
    };
    ov.addEventListener("pointerup", end);
    ov.addEventListener("pointercancel", end);
    ov.addEventListener("keydown", e => {
      const step = e.shiftKey ? W : Math.max(1, W / 4);
      if (e.key === "ArrowLeft") t = clamp(t - step, 0, dur - W);
      else if (e.key === "ArrowRight") t = clamp(t + step, 0, dur - W);
      else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        const mid = t + W / 2;
        W = clamp(W + (e.key === "ArrowUp" ? 2 : -2), minW, maxW);
        t = clamp(mid - W / 2, 0, dur - W);
      } else if (e.key === "Home") t = 0;
      else if (e.key === "End") t = dur - W;
      else return;
      e.preventDefault();
      changed();
    });

    new ResizeObserver(resize).observe(opts.raster);
    new ResizeObserver(resize).observe(opts.overview);
    new IntersectionObserver(es => es.forEach(e => { visible = e.isIntersecting; })).observe(opts.raster);
    resize();
    if (playing) raf = requestAnimationFrame(frame);

    return { play, pause, seek, setWindow, get playing() { return playing; }, get t() { return t; }, get W() { return W; }, reduce };
  }

  function fmt(s) {
    s = Math.max(0, Math.floor(s));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  window.LabExplorer = { create, bands, fmt };
})();
