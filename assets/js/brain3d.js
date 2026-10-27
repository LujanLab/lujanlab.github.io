// Rotatable 3D brain from window.BRAIN (tools/export_brain.py): glass CCF shell, region meshes,
// every good unit as a point and each probe shank as a line. With window.FIRING-style spikes
// (tools/export_firing.py) each point swells and brightens when its unit fires. Needs the "three" import map.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

function decode(b64, Type) {
  const bin = atob(b64), buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return new Type(buf.buffer);
}

// CCF (AP, DV, ML) in 10 um steps -> scene units of 1 mm, centred on the brain.
function toScene(p, c) {
  return [(p[2] - c[2]) / 100, -(p[1] - c[1]) / 100, -(p[0] - c[0]) / 100];
}

function glass(color, strength, base) {
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, strength: { value: strength }, base: { value: base } },
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 color; uniform float strength; uniform float base; varying vec3 vN; varying vec3 vV;
      void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
      gl_FragColor = vec4(color, clamp(base + f*strength, 0.0, 1.0)); }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
}

function meshGeometry(m, c) {
  const pos = decode(m.pos, Uint16Array), idx = decode(m.idx, Uint32Array);
  const v = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 3) {
    const s = toScene([pos[i], pos[i + 1], pos[i + 2]], c);
    v[i] = s[0]; v[i + 1] = s[1]; v[i + 2] = s[2];
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(v, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  return g;
}

// Round points sized like PointsMaterial (size in scene units at distance 1), scaled by the "fire" attribute.
function dotMaterial(color, size) {
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, size: { value: size }, scale: { value: 300 } },
    vertexShader: `attribute float fire; uniform float size; uniform float scale; varying float vF;
      void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vF = fire;
      gl_PointSize = size * (0.55 + 1.6*fire) * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 color; varying float vF;
      void main(){ if (length(gl_PointCoord - 0.5) > 0.5) discard;
      gl_FragColor = vec4(mix(color, vec3(1.0), 0.55*vF), 1.0); }`,
  });
}

// Spike ticks per unit from the delta-coded bytes written by tools/export_firing.py.
function decodeFiring(f) {
  const off = decode(f.offsets, Uint32Array), bytes = decode(f.times, Uint8Array);
  const n = off.length - 1, start = new Uint32Array(n + 1), ticks = new Float32Array(f.n_spikes);
  let k = 0;
  for (let u = 0; u < n; u++) {
    start[u] = k;
    let acc = 0;
    for (let i = off[u]; i < off[u + 1]; i++) { acc += bytes[i]; if (bytes[i] < 255) ticks[k++] = acc * f.tick_s; }
  }
  start[n] = k;
  return { start, ticks, window: f.window_s };
}

// theme: { bg, shell, shellStrength, regionStrength, probe, pointSize, colors{group: css}, showRegions[] }
export function mountBrain(el, data, theme) {
  const t = Object.assign({ bg: null, shell: "#9fb3c8", shellStrength: 0.5, regionStrength: 0.35, probe: "#ffffff",
    probeOpacity: 0.22, pointSize: 0.3, colors: data.colors, showProbes: true, firing: null, speed: 1, decay: 0.06, rotate: false }, theme);
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
  if (!gl) {
    el.insertAdjacentHTML("beforeend", '<p class="brain-fallback">This 3D view needs WebGL, which your browser has turned off.</p>');
    return null;
  }
  const renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: true, alpha: !t.bg });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  if (t.bg) renderer.setClearColor(t.bg); else renderer.setClearColor(0x000000, 0);
  el.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);

  const rootPos = decode(data.root.pos, Uint16Array);
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < rootPos.length; i++) { const k = i % 3; lo[k] = Math.min(lo[k], rootPos[i]); hi[k] = Math.max(hi[k], rootPos[i]); }
  const c = lo.map((v, k) => (v + hi[k]) / 2);

  const groups = {};
  const root = new THREE.Mesh(meshGeometry(data.root, c), glass(t.shell, t.shellStrength, 0.015));
  root.renderOrder = 3;
  scene.add(root);

  for (const r of data.regions) {
    const m = new THREE.Mesh(meshGeometry(r, c), glass(t.colors[r.name] || r.color, t.regionStrength, 0.02));
    m.renderOrder = 2;
    scene.add(m);
    (groups[r.name] = groups[r.name] || {}).mesh = m;
  }

  const up = decode(data.unit_pos, Uint16Array), ug = decode(data.unit_group, Uint8Array);
  const REST = 0.28;   // "fire" value that draws a point at pointSize
  const layers = [];   // per group: its points, unit indices and fire attribute
  data.groups.forEach((name, gi) => {
    const pts = [], units = [];
    for (let i = 0; i < ug.length; i++) if (ug[i] === gi) { pts.push(...toScene([up[3 * i], up[3 * i + 1], up[3 * i + 2]], c)); units.push(i); }
    if (!pts.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pts), 3));
    const fire = new THREE.BufferAttribute(new Float32Array(units.length).fill(REST), 1);
    g.setAttribute("fire", fire);
    const p = new THREE.Points(g, dotMaterial(t.colors[name], t.pointSize));
    p.renderOrder = 1;
    scene.add(p);
    layers.push({ points: p, units, fire });
    (groups[name] = groups[name] || {}).points = p;
    groups[name].count = units.length;
  });

  // firing playback: loop the exported window; each spike sets that unit's point to full size, then it decays
  const F = t.firing ? decodeFiring(t.firing) : null;
  let firing = !!F, clock = 0, lastNow = null;   // clock: seconds of recording, advancing at t.speed
  const ptr = F ? F.start.slice(0, ug.length) : null, lastSpike = F ? new Float32Array(ug.length).fill(-1e9) : null;
  function stepFiring(now) {
    const dt = lastNow == null ? 0 : Math.min(0.1, (now - lastNow) / 1000);
    lastNow = now;
    clock += dt * t.speed;
    if (clock >= F.window) {
      clock -= F.window;
      for (let u = 0; u < ug.length; u++) { ptr[u] = F.start[u]; lastSpike[u] -= F.window; }
    }
    for (const L of layers) {
      const a = L.fire.array;
      for (let j = 0; j < L.units.length; j++) {
        const u = L.units[j], end = F.start[u + 1];
        while (ptr[u] < end && F.ticks[ptr[u]] <= clock) lastSpike[u] = F.ticks[ptr[u]++];
        a[j] = Math.exp(-(clock - lastSpike[u]) / t.decay);
      }
      L.fire.needsUpdate = true;
    }
  }
  function restFiring() {
    for (const L of layers) { L.fire.array.fill(REST); L.fire.needsUpdate = true; }
  }

  const seg = [];
  for (const pr of data.probes) {
    const [ap, top, ml, tip] = pr.p;
    seg.push(...toScene([ap, top, ml], c), ...toScene([ap, tip, ml], c));
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(seg), 3));
  const probes = new THREE.LineSegments(pg, new THREE.LineBasicMaterial({ color: t.probe, transparent: true, opacity: t.probeOpacity }));
  probes.visible = t.showProbes;
  scene.add(probes);

  // orbit around the recorded units, from an anterolateral, slightly dorsal view
  const ctr = [0, 0, 0];
  for (let i = 0; i < ug.length; i++) {
    const s = toScene([up[3 * i], up[3 * i + 1], up[3 * i + 2]], c);
    ctr[0] += s[0]; ctr[1] += s[1]; ctr[2] += s[2];
  }
  const target = new THREE.Vector3(...ctr.map(v => v / ug.length));
  camera.position.copy(target).add(new THREE.Vector3(...(t.view || [10, 4, 6])));
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 5; controls.maxDistance = 40;
  controls.target.copy(target);
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches && !/[?&]motion\b/.test(location.search);
  controls.autoRotate = t.rotate === true || !reduce;
  controls.autoRotateSpeed = 0.6;
  controls.addEventListener("start", () => { controls.autoRotate = false; });

  function resize() {
    const r = el.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false);
    const scale = r.height * renderer.getPixelRatio() / 2;
    for (const L of layers) L.points.material.uniforms.scale.value = scale;
    camera.aspect = r.width / Math.max(1, r.height);
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(el);
  resize();

  let visible = true;
  new IntersectionObserver(es => es.forEach(e => (visible = e.isIntersecting))).observe(el);
  renderer.setAnimationLoop(now => {
    if (!visible) { lastNow = null; return; }
    if (firing) stepFiring(now);
    controls.update();
    renderer.render(scene, camera);
  });

  return {
    groups,
    setGroup(name, on) {
      const g = groups[name]; if (!g) return;
      if (g.mesh) g.mesh.visible = on;
      if (g.points) g.points.visible = on;
    },
    setProbes(on) { probes.visible = on; },
    setRotate(on) { controls.autoRotate = on; },
    setFiring(on) { firing = on && !!F; lastNow = null; if (!firing) restFiring(); },
  };
}
