// Home page 3D brain (window.BRAIN) with its chart-style legend. Needs the "three" import map.
import { mountBrain } from "./brain3d.js";

const B = window.BRAIN, LIFTED = window.LIFTED;
const NAMES = { "ACB": "Nucleus accumbens", "dSTR": "Dorsal striatum", "LS": "Lateral septum", "ACA": "Anterior cingulate",
  "PL/ILA": "Prelimbic and infralimbic", "Olfactory": "Olfactory areas", "other": "Other areas" };
const SHORT = { "ACB": "Accumbens", "dSTR": "Dorsal striatum", "LS": "Lateral septum", "ACA": "Anterior cingulate",
  "PL/ILA": "Prelimbic, infralimbic", "Olfactory": "Olfactory", "other": "Other" };
document.getElementById("count").textContent = B.units_n.toLocaleString("en-US") + " neurons";
document.getElementById("mice").textContent = B.animals_n;
document.getElementById("sess").textContent = B.sessions_n;

const brain = mountBrain(document.getElementById("brain"), B, { shell: "#dad9d9", shellStrength: .38, probe: "#ee5525",
  probeOpacity: .4, colors: LIFTED, pointSize: .3, view: [12.5, 5, 7.5], showProbes: false, firing: window.FIRING,
  speed: 0.125, rotate: true });
if (brain) {
  const ul = document.getElementById("legend");
  const add = (html, onToggle, cls, on = true) => {
    const li = document.createElement("li");
    if (cls) li.className = cls;
    li.innerHTML = `<button type="button" aria-pressed="${on}">${html}</button>`;
    const btn = li.firstChild;
    btn.addEventListener("click", () => { const on = btn.getAttribute("aria-pressed") !== "true"; btn.setAttribute("aria-pressed", on); onToggle(on); });
    ul.appendChild(li);
  };
  for (const g of B.groups) {
    const n = brain.groups[g]?.count; if (!n) continue;
    add(`<i style="background:${LIFTED[g]}"></i><span title="${NAMES[g]}">${SHORT[g]}</span><span>${n.toLocaleString("en-US")}</span>`, on => brain.setGroup(g, on));
  }
  add(`<i></i><span>Probe shanks</span><span>${B.probes.length}</span>`, on => brain.setProbes(on), "probe", false);
  if (window.FIRING) add(`<i></i><span>Firing</span><span>${window.FIRING.window_s} s</span>`, on => brain.setFiring(on), "firing");
}
