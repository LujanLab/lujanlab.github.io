// Home page hero: the whole-session raster player and its readouts (window.SESSION, assets/js/explorer.js).
// Region colors lifted for dark grounds; shared by the raster and the 3D brain.
window.LIFTED = { "ACB": "#35c79f", "dSTR": "#8adbb5", "LS": "#cbead3", "ACA": "#dcaad2", "PL/ILA": "#b184b0", "Olfactory": "#86bdd8", "other": "#7a7a7a" };
(function () {
  const S = window.SESSION, fmt = LabExplorer.fmt, $ = id => document.getElementById(id);
  $("rUnits").textContent = S.n_units;
  $("dur").textContent = Math.round(S.duration_s / 60) + " min";
  $("axis").innerHTML = [0, 20, 40, 60, 80].map(m => `<span>${m} min</span>`).join("") + `<span>${Math.round(S.duration_s / 60)} min</span>`;

  for (const b of LabExplorer.bands(S, 8)) {
    const d = document.createElement("div");
    d.className = "band";
    d.style.top = (100 * b.from / S.n_units) + "%";
    d.style.height = (100 * (b.to - b.from) / S.n_units) + "%";
    d.innerHTML = `<i style="background:${LIFTED[b.group]}"></i><span>${b.group === "other" ? "Other" : b.group}</span>`;
    $("bands").appendChild(d);
  }

  const ex = LabExplorer.create({
    data: S, base: "assets/data/session/", window: 20, autoplay: true, minWindow: 4, maxWindow: 60,
    raster: $("raster"), overview: $("overview"),
    rowColor: g => LIFTED[g],
    colors: { press: "rgba(238,85,37,.8)", cue: "rgba(218,217,217,.55)", inactive: "rgba(218,217,217,.18)",
              pop: "#3a3a3a", box: "#ffffff", boxFill: "rgba(255,255,255,.10)" },
    onUpdate: s => {
      $("span").textContent = `Session time ${fmt(s.t)} to ${fmt(s.t + s.W)}`;
      $("rSpikes").textContent = s.shown.toLocaleString("en-US");
      $("rRate").textContent = s.rate.toFixed(1) + " Hz";
      $("rPress").textContent = s.presses;
      $("play").textContent = s.playing ? "Pause" : "Play";
      $("play").setAttribute("aria-pressed", String(!s.playing));
    },
    // dragging or resizing the box leaves the jump targets; a window button stays lit only if the length matches it
    onUser: s => {
      document.querySelectorAll("[data-jump]").forEach(o => o.setAttribute("aria-pressed", "false"));
      document.querySelectorAll("[data-w]").forEach(o => o.setAttribute("aria-pressed", String(+o.dataset.w === s.W)));
    },
  });

  // jump targets: the minute with the most presses and the middle of the longest pause
  const pr = S.events.press, rateArr = (b => { const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return new Uint16Array(u.buffer); })(S.press_rate);
  let busy = 0; for (let i = 1; i < rateArr.length; i++) if (rateArr[i] > rateArr[busy]) busy = i;
  let gap = [0, pr[0] || 0];
  for (let i = 1; i < pr.length; i++) if (pr[i] - pr[i - 1] > gap[1] - gap[0]) gap = [pr[i - 1], pr[i]];
  const JUMP = { busy: busy * S.rate_bin_s, quiet: (gap[0] + gap[1]) / 2 };
  document.querySelectorAll("[data-jump]").forEach(b => b.addEventListener("click", () => {
    document.querySelectorAll("[data-jump]").forEach(o => o.setAttribute("aria-pressed", String(o === b)));
    ex.seek(JUMP[b.dataset.jump] - ex.W / 2);
  }));
  document.querySelectorAll("[data-w]").forEach(b => b.addEventListener("click", () => {
    document.querySelectorAll("[data-w]").forEach(o => o.setAttribute("aria-pressed", String(o === b)));
    ex.setWindow(+b.dataset.w);
  }));
  $("play").addEventListener("click", () => (ex.playing ? ex.pause() : ex.play()));
  ex.seek(JUMP.busy - ex.W / 2);
})();
