// 3D wardrobe configurator: the form in main.js owns the settings and the price,
// this module only draws them. Frames are rendered on demand, and keep coming while the visitor drags,
// the inertia dies out, the doors slide or the camera reframes.
import * as THREE from "three";
import { RoomEnvironment } from "./vendor/addons/environments/RoomEnvironment.js";
import { OrbitControls } from "./vendor/addons/controls/OrbitControls.js";
import { buildWardrobe } from "./wardrobe.js";
import { buildKitchen } from "./kitchen.js";

window.konStarted = true; // the page's fallback text checks this

const stage = document.getElementById("kon-stage");
const status = document.getElementById("kon-load");
const hint = document.getElementById("kon-hint");
const doorsBtn = document.getElementById("kon-doors");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const say = (text) => { status.hidden = false; status.textContent = text; };

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: devicePixelRatio < 1.5, powerPreference: "high-performance" });
} catch (e) {
  say("3D не запустился в этом браузере. Размеры и цену можно подобрать справа.");
}
if (renderer && softwareRendered(renderer)) {
  renderer.dispose();
  renderer = null;
  say("Чтобы покрутить шкаф в 3D, включите в браузере «Использовать аппаратное ускорение». Размеры и цену можно подобрать справа.");
}
if (renderer) init();

function softwareRendered(r) {
  const gl = r.getContext();
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  const name = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  return /swiftshader|llvmpipe|software|basic render/i.test(name);
}

function init() {
  let visible = true, running = false, lost = false, last = performance.now();
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // r186 dropped the "soft" variant; shadow.radius softens PCF
  renderer.shadowMap.autoUpdate = false; // the light never moves; redo shadows only when the wardrobe changes
  stage.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe7e1d7);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const light = () => { scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture; };
  light();
  scene.environmentIntensity = 0.6;

  // low from the left, so the wardrobe throws a soft shadow onto the wall on its right
  const sun = new THREE.DirectionalLight(0xfff1e0, 2.1);
  sun.position.set(-3.4, 3.3, 2.7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 6;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3.4, bottom: -0.4, near: 0.5, far: 10 });
  scene.add(sun, sun.target);

  // textures: wood decors share one loader; until an image arrives the board shows its base colour
  const loader = new THREE.TextureLoader();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const wood = (file) => {
    const t = loader.load("tex/" + file + ".webp?v=1", wake);
    t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping; // the photos don't tile; mirroring hides the seams
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(8, maxAniso);
    return t;
  };
  const tex = { oak: wood("oak"), walnut: wood("walnut"), ash: wood("ash-dark"), grey: wood("oak-grey") };
  const ldsp = (map, color = 0xffffff) => new THREE.MeshPhysicalMaterial({ map, color, roughness: 0.58, clearcoat: 0.12, clearcoatRoughness: 0.5 });
  const plain = (color, roughness = 0.6) => new THREE.MeshPhysicalMaterial({ color, roughness, clearcoat: 0.1, clearcoatRoughness: 0.6 });
  const MAT = {
    mirror: new THREE.MeshStandardMaterial({ color: 0xe6ecef, metalness: 1, roughness: 0.035, envMapIntensity: 1.25 }),
    bronze: new THREE.MeshStandardMaterial({ color: 0xc9a88c, metalness: 1, roughness: 0.05, envMapIntensity: 1.2 }),
    oak: ldsp(tex.oak), walnut: ldsp(tex.walnut), ash: ldsp(tex.ash), grey: ldsp(tex.grey),
    white: plain(0xf3f0ea, 0.7), graphite: plain(0x3b3b3a, 0.55),
  };
  // the studio environment reflects as grey boxes; mirrors get a room instead
  roomReflection("img/w5.webp?v=1", (t) => { MAT.mirror.envMap = MAT.bronze.envMap = t; MAT.mirror.needsUpdate = MAT.bronze.needsUpdate = true; wake(); });

  const PROFILE = {
    silver: new THREE.MeshStandardMaterial({ color: 0xd4d7da, metalness: 1, roughness: 0.32 }),
    black: new THREE.MeshStandardMaterial({ color: 0x1d1d1f, metalness: 0.6, roughness: 0.4 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xd6b47a, metalness: 1, roughness: 0.3 }),
  };
  const chrome = new THREE.MeshStandardMaterial({ color: 0xeeeeee, metalness: 1, roughness: 0.15 });
  const back = { oak: plain(0xd9c4a5, 0.8), white: plain(0xece8e1, 0.8), graphite: plain(0x4a4947, 0.8) };

  // kitchen: satin enamel fronts, stone or wood worktops, black glass appliances
  const enamel = (color) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.35 });
  const FRONT = {
    white: enamel(0xf1eee8), cashmere: enamel(0xd6c8b4), sage: enamel(0x8c9883), navy: enamel(0x2f3a4a), graphite: enamel(0x393939),
    oak: MAT.oak, walnut: MAT.walnut,
  };
  const WORKTOP = {
    marble: new THREE.MeshPhysicalMaterial({ map: canvasTex(marble), roughness: 0.2, clearcoat: 0.5, clearcoatRoughness: 0.15 }),
    black: new THREE.MeshPhysicalMaterial({ map: canvasTex(speckle("#1b1b1c", 14)), roughness: 0.3, clearcoat: 0.4, clearcoatRoughness: 0.2 }),
    concrete: new THREE.MeshStandardMaterial({ map: canvasTex(speckle("#a29e96", 22)), roughness: 0.85 }),
    oak: ldsp(tex.oak, 0xe9dccb),
  };
  const KM = {
    carcass: plain(0xe9e4dc, 0.75),
    plinth: plain(0x2c2b29, 0.7),
    steel: new THREE.MeshStandardMaterial({ color: 0xcfd2d4, metalness: 1, roughness: 0.28 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x0c0c0d, roughness: 0.08, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.03 }),
    chrome,
    shelf: MAT.oak,
    led: new THREE.MeshBasicMaterial({ color: 0xffe2b0, toneMapped: false }),
    hob: new THREE.MeshPhysicalMaterial({ map: canvasTex(hob, 512), roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.03 }),
  };

  // room: a floor and the wall the wardrobe stands against
  const floorTex = wood("oak-grey");
  floorTex.repeat.set(9, 9);
  floorTex.rotation = Math.PI / 2;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshStandardMaterial({ map: floorTex, color: 0xd8cfc2, roughness: 0.75 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = 3;
  floor.receiveShadow = true;
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(14, 6), new THREE.MeshStandardMaterial({ color: 0xebe5dc, roughness: 0.95 }));
  wall.position.set(0, 3, -0.001);
  wall.receiveShadow = true;
  const skirting = new THREE.Mesh(new THREE.BoxGeometry(14, 0.07, 0.014), plain(0xf2eee8, 0.6));
  skirting.position.set(0, 0.035, 0.007);
  // the left wall only shows up for an L-shaped kitchen
  const sideWall = new THREE.Mesh(new THREE.PlaneGeometry(8, 6), wall.material);
  sideWall.rotation.y = Math.PI / 2;
  sideWall.receiveShadow = true;
  sideWall.visible = false;
  scene.add(floor, wall, skirting, sideWall);
  const contact = contactShadow();
  scene.add(contact);

  const camera = new THREE.PerspectiveCamera(32, 1.4, 0.05, 40);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.enableDamping = !reduceMotion;
  controls.minPolarAngle = Math.PI * 0.3;
  controls.maxPolarAngle = Math.PI * 0.5;
  controls.minAzimuthAngle = -0.85; // it's against a wall: no looking from behind
  controls.maxAzimuthAngle = 0.85;
  renderer.domElement.style.touchAction = "pan-y";
  let dragging = false;
  controls.addEventListener("start", () => { hint.style.opacity = 0; dragging = true; wake(); });
  controls.addEventListener("end", () => { dragging = false; wake(); });
  controls.addEventListener("change", wake);
  camera.position.set(0.9, 1.5, 5);
  controls.target.set(0, 1.2, 0.3);

  let current = null, dims = null, cfg = null, size = null, sizeKey = "";
  let fitDist = 5, opening = 0; // opening: 0 closed, 1 back doors slid left, 2 front doors slid right

  function rebuild(next) {
    cfg = next;
    if (current) { scene.remove(current.group); current.group.traverse((o) => o.geometry?.dispose()); }
    if (dims) { scene.remove(dims); dims.traverse((o) => { o.geometry?.dispose(); o.material?.map?.dispose(); o.material?.dispose(); }); }
    if (cfg.kind === "kitchen") buildKitchenScene();
    else buildWardrobeScene();
    // shadows cover whatever was built
    const half = Math.max(size.w, size.d) / 2 + 1;
    Object.assign(sun.shadow.camera, { left: -half, right: half, top: size.h + 1, bottom: -1 });
    sun.target.position.set(0, 0, size.d / 2);
    sun.position.set(-3.4, 3.3, 2.7 + size.d / 2);
    sun.shadow.camera.updateProjectionMatrix();
    renderer.shadowMap.needsUpdate = true;
    const key = [cfg.kind, size.w, size.h, size.d].join();
    if (key !== sizeKey) { sizeKey = key; frame3(true); }
    wake();
  }

  function buildKitchenScene() {
    const L = cfg.layout === "l";
    current = buildKitchen(cfg, { ...KM, front: FRONT[cfg.front] || FRONT.white, top: WORKTOP[cfg.top] || WORKTOP.marble, splash: WORKTOP[cfg.top] || WORKTOP.marble });
    current.group.position.x = -cfg.a / 2;
    current.doors = [];
    scene.add(current.group);
    size = { w: cfg.a, h: current.height, d: L ? cfg.b : 0.6 };
    sideWall.visible = L;
    sideWall.position.set(-cfg.a / 2 - 0.001, 3, 4);
    dims = drawDims(current.dims.map((d) => ({ ...d, a: [d.a[0] - cfg.a / 2, d.a[1], d.a[2]], b: [d.b[0] - cfg.a / 2, d.b[1], d.b[2]] })));
    scene.add(dims);
    contact.scale.set(cfg.a + 0.4, 1, L ? cfg.b + 0.3 : 1.1);
    contact.position.set(0, 0.001, L ? cfg.b / 2 : 0.35);
    doorsBtn.hidden = true;
  }

  function buildWardrobeScene() {
    sideWall.visible = false;
    doorsBtn.hidden = false;
    const facade = (i) => {
      if (cfg.facade === "combo") return [MAT[cfg.corpus === "white" ? "oak" : cfg.corpus] || MAT.oak, MAT.mirror, MAT[cfg.corpus === "white" ? "oak" : cfg.corpus] || MAT.oak];
      if (cfg.facade === "mix") return i % 2 ? MAT.mirror : MAT[cfg.corpus === "white" ? "white" : cfg.corpus];
      return MAT[cfg.facade];
    };
    const corpus = cfg.corpus === "white" ? MAT.white : cfg.corpus === "graphite" ? MAT.graphite : MAT.oak;
    current = buildWardrobe(cfg, { corpus, back: back[cfg.corpus] || back.oak, metal: PROFILE[cfg.profile] || PROFILE.silver, chrome, facade });
    scene.add(current.group);
    applyOpening(true);
    const { w, h, d } = cfg;
    size = { w, h, d };
    dims = drawDims([
      { a: [-w / 2, h + 0.14, d], b: [w / 2, h + 0.14, d], tick: [0, 1, 0], text: w },
      { a: [-w / 2 - 0.14, 0, d], b: [-w / 2 - 0.14, h, d], tick: [1, 0, 0], text: h },
      { a: [w / 2 + 0.16, 0.002, 0], b: [w / 2 + 0.16, 0.002, d], tick: [1, 0, 0], text: d, at: [w / 2 + 0.18, 0.09, d / 2] },
    ]);
    scene.add(dims);
    contact.scale.set(w + 0.5, 1, d + 0.6);
    contact.position.set(0, 0.001, d / 2 + 0.05);
  }

  // where each door should go for the current opening state
  function doorTarget(dr, i) {
    const dw = current.doorWidth;
    if (opening === 1 && i % 2 === 1) return dr.userData.home - (dw - 0.022);
    if (opening === 2 && i % 2 === 0) return dr.userData.home + (i === current.doors.length - 1 ? -(dw - 0.022) : dw - 0.022);
    return dr.userData.home;
  }
  function applyOpening(snap) {
    current.doors.forEach((dr, i) => { dr.userData.to = doorTarget(dr, i); if (snap) dr.position.x = dr.userData.to; });
  }
  doorsBtn.addEventListener("click", () => {
    opening = (opening + 1) % 3;
    doorsBtn.setAttribute("aria-pressed", opening > 0);
    doorsBtn.textContent = opening === 0 ? "Сдвинуть двери" : opening === 1 ? "Сдвинуть другие" : "Закрыть двери";
    applyOpening(reduceMotion);
    renderer.shadowMap.needsUpdate = true;
    wake();
  });

  // frame the whole wardrobe with its dimension lines; keep the visitor's viewing angle
  function frame3(keepAngle) {
    const r = Math.hypot(Math.max(size.w, size.d * 0.9) + 0.5, size.h + 0.3) / 2;
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    fitDist = (r / Math.sin(Math.min(vFov, hFov) / 2)) * 0.98;
    controls.target.set(0, size.h * 0.5, Math.min(size.d * 0.5, 1.4));
    if (!keepAngle || reduceMotion) placeCamera(fitDist);
  }
  const dir = new THREE.Vector3();
  function placeCamera(dist) {
    dir.copy(camera.position).sub(controls.target).normalize();
    camera.position.copy(controls.target).addScaledVector(dir, dist);
  }

  // follow the form; main.js keeps the state on window.wardrobe and announces every change
  if (window.wardrobe) rebuild(window.wardrobe);
  addEventListener("wardrobe:change", (e) => rebuild(e.detail));
  status.hidden = true;
  // start from a three-quarter view
  camera.position.copy(controls.target).add(new THREE.Vector3(0.35, 0.12, 1).normalize().multiplyScalar(fitDist));

  const resize = () => {
    const w = stage.clientWidth, h = stage.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (cfg) { frame3(true); placeCamera(fitDist); }
    wake();
  };
  new ResizeObserver(resize).observe(stage);

  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) wake(); }).observe(stage);
  renderer.domElement.addEventListener("webglcontextlost", (e) => { e.preventDefault(); lost = true; });
  renderer.domElement.addEventListener("webglcontextrestored", () => { lost = false; light(); renderer.shadowMap.needsUpdate = true; wake(); });

  function wake() {
    if (!running && visible && !lost) { running = true; last = performance.now(); requestAnimationFrame(frame); }
  }
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (lost) { running = false; return; }
    let busy = false;
    // slide doors
    if (current) for (const dr of current.doors) {
      const diff = dr.userData.to - dr.position.x;
      if (Math.abs(diff) > 0.0005) {
        dr.position.x += diff * Math.min(dt * 6, 1);
        busy = true;
      } else dr.position.x = dr.userData.to;
    }
    if (busy) renderer.shadowMap.needsUpdate = true;
    // ease the camera to the new framing after a size change
    const dist = camera.position.distanceTo(controls.target);
    if (Math.abs(dist - fitDist) > 0.002) { placeCamera(dist + (fitDist - dist) * Math.min(dt * 5, 1)); busy = true; }
    const moved = controls.update(dt);
    renderer.render(scene, camera);
    if (!visible || (!busy && !dragging && !moved)) { running = false; return; }
    requestAnimationFrame(frame);
  }
  resize();
}

// dimension lines like on a measurement sheet: each is a line with end ticks and its length in mm
function drawDims(list) {
  const g = new THREE.Group();
  const mat = new THREE.LineBasicMaterial({ color: 0x2a2824 });
  const line = (p, q) => g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([p, q]), mat));
  const mm = (m) => Math.round(m * 1000).toLocaleString("ru-RU");
  for (const d of list) {
    const a = new THREE.Vector3(...d.a), b = new THREE.Vector3(...d.b), t = new THREE.Vector3(...d.tick).multiplyScalar(0.05);
    line(a, b);
    line(a.clone().sub(t), a.clone().add(t));
    line(b.clone().sub(t), b.clone().add(t));
    const at = d.at ? new THREE.Vector3(...d.at) : a.clone().add(b).multiplyScalar(0.5);
    g.add(label(mm(d.text), at.x, at.y, at.z));
  }
  return g;
}

function label(text, x, y, z) {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 80;
  const g = c.getContext("2d");
  g.fillStyle = "#e7e1d7";
  g.fillRect(28, 14, 200, 52);
  g.fillStyle = "#2a2824";
  g.font = "500 38px 'JetBrains Mono', ui-monospace, Consolas, monospace";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 128, 42);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, toneMapped: false }));
  s.scale.set(0.46, 0.144, 1);
  s.position.set(x, y, z);
  s.renderOrder = 3;
  return s;
}

// A room for the mirrors to reflect: a photo of a room painted into the part of an equirectangular map
// that faces the viewer (+z), on a ceiling-wall-floor gradient so the edges fade into something plausible.
function roomReflection(src, done) {
  const img = new Image();
  img.onload = () => {
    // a flat mirror seen from a few metres only reflects ~30° of the map, so the photo covers about that much;
    // a wide map keeps it sharp on big screens, phones get half the size (and memory)
    const W = innerWidth > 800 ? 4096 : 2048, H = W / 2;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d");
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#f7f4ef"); sky.addColorStop(0.46, "#e8e2d8"); sky.addColorStop(0.535, "#d9d1c4");
    sky.addColorStop(0.55, "#bfa98d"); sky.addColorStop(1, "#9c8468");
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    // the room behind the viewer: tall bright windows, a darker cabinet and a hint of the photo's room
    g.filter = `blur(${W / 400}px)`;
    g.globalAlpha = 0.55;
    const w = W * 0.12, h = (w * img.height) / img.width;
    g.drawImage(img, W * 0.75 - w / 2, H * 0.55 - h * 0.62, w, h);
    g.globalAlpha = 1;
    g.fillStyle = "#fffdf8";
    [0.655, 0.715, 0.835].forEach((u) => g.fillRect(W * u, H * 0.2, W * 0.03, H * 0.34));
    g.fillStyle = "rgba(70,60,50,.35)";
    g.fillRect(W * 0.765, H * 0.36, W * 0.05, H * 0.19);
    g.filter = "none";
    const t = new THREE.CanvasTexture(c);
    t.mapping = THREE.EquirectangularReflectionMapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.generateMipmaps = false; // a mirror is never seen minified much; skip a third more memory
    t.minFilter = THREE.LinearFilter;
    done(t);
  };
  img.src = src;
}

// soft dark patch under the wardrobe so it sits on the floor even where the sun's shadow doesn't reach
function contactShadow() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(64, 64, 10, 64, 64, 64);
  grad.addColorStop(0, "rgba(30,24,16,0.55)");
  grad.addColorStop(0.6, "rgba(30,24,16,0.25)");
  grad.addColorStop(1, "rgba(30,24,16,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  return m;
}

// procedural surfaces, painted once on a canvas
function canvasTex(paint, size = 1024) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  paint(c.getContext("2d"), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// white stone with soft grey veins
function marble(g, s) {
  g.fillStyle = "#f2f0eb";
  g.fillRect(0, 0, s, s);
  let seed = 7;
  const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const vein = (width, alpha, blur) => {
    g.filter = "blur(" + blur + "px)";
    g.strokeStyle = "rgba(118,116,120," + alpha + ")";
    g.lineWidth = width;
    g.beginPath();
    let x = r() * s, y = -20, a = 0.6 + r() * 0.8;
    g.moveTo(x, y);
    while (y < s + 20 && x > -50 && x < s + 50) {
      a += (r() - 0.5) * 0.22; // gentle drift: long flowing veins, not a web
      x += Math.cos(a) * 26;
      y += Math.abs(Math.sin(a)) * 26 + 6;
      g.lineTo(x, y);
    }
    g.stroke();
  };
  for (let i = 0; i < 5; i++) vein(18 + r() * 24, 0.07, 14);
  for (let i = 0; i < 5; i++) vein(1.2 + r() * 2, 0.22, 1);
  g.filter = "none";
}

// flecked surface: black stone or concrete
function speckle(base, spread) {
  return (g, s) => {
    g.fillStyle = base;
    g.fillRect(0, 0, s, s);
    const img = g.getImageData(0, 0, s, s), d = img.data;
    let seed = 3;
    for (let i = 0; i < d.length; i += 4) {
      seed = (seed * 16807) % 2147483647;
      const n = (seed / 2147483647 - 0.5) * spread;
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
    g.putImageData(img, 0, 0);
  };
}

// induction hob: four zones and a touch strip
function hob(g, s) {
  g.fillStyle = "#0d0d0e";
  g.fillRect(0, 0, s, s);
  g.strokeStyle = "rgba(235,235,235,.38)";
  g.lineWidth = 3;
  [[0.3, 0.3, 0.17], [0.72, 0.3, 0.13], [0.3, 0.72, 0.13], [0.72, 0.7, 0.17]].forEach(([x, y, r]) => {
    g.beginPath();
    g.arc(x * s, y * s, r * s, 0, Math.PI * 2);
    g.stroke();
  });
  g.fillStyle = "rgba(235,235,235,.45)";
  for (let i = 0; i < 6; i++) g.fillRect(s * (0.32 + i * 0.07), s * 0.94, s * 0.03, s * 0.012);
}
