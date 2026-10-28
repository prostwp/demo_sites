// 3D wardrobe configurator: the form in main.js owns the settings and the price,
// this module only draws them. Frames are rendered on demand, and keep coming while the visitor drags,
// the inertia dies out, the doors slide or the camera reframes.
import * as THREE from "three";
import { RoomEnvironment } from "./vendor/addons/environments/RoomEnvironment.js";
import { OrbitControls } from "./vendor/addons/controls/OrbitControls.js";
import { buildWardrobe } from "./wardrobe.js";

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
  scene.add(floor, wall, skirting);
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

  let current = null, dims = null, cfg = null;
  let fitDist = 5, opening = 0; // opening: 0 closed, 1 back doors slid left, 2 front doors slid right

  function rebuild(next) {
    const prevSize = cfg && cfg.w === next.w && cfg.h === next.h && cfg.d === next.d;
    cfg = next;
    if (current) { scene.remove(current.group); current.group.traverse((o) => o.geometry?.dispose()); }
    if (dims) { scene.remove(dims); dims.traverse((o) => { o.geometry?.dispose(); o.material?.map?.dispose(); o.material?.dispose(); }); }
    const facade = (i) => {
      if (cfg.facade === "combo") return [MAT[cfg.corpus === "white" ? "oak" : cfg.corpus] || MAT.oak, MAT.mirror, MAT[cfg.corpus === "white" ? "oak" : cfg.corpus] || MAT.oak];
      if (cfg.facade === "mix") return i % 2 ? MAT.mirror : MAT[cfg.corpus === "white" ? "white" : cfg.corpus];
      return MAT[cfg.facade];
    };
    const corpus = cfg.corpus === "white" ? MAT.white : cfg.corpus === "graphite" ? MAT.graphite : MAT.oak;
    current = buildWardrobe(cfg, { corpus, back: back[cfg.corpus] || back.oak, metal: PROFILE[cfg.profile] || PROFILE.silver, chrome, facade });
    scene.add(current.group);
    current.doors.forEach((dr) => { dr.userData.x = dr.position.x; });
    applyOpening(true);
    dims = dimensions(cfg);
    scene.add(dims);
    contact.scale.set(cfg.w + 0.5, 1, cfg.d + 0.6);
    contact.position.set(0, 0.001, cfg.d / 2 + 0.05);
    renderer.shadowMap.needsUpdate = true;
    if (!prevSize) frame3(true);
    wake();
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
    const r = Math.hypot(cfg.w + 0.5, cfg.h + 0.3) / 2;
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    fitDist = (r / Math.sin(Math.min(vFov, hFov) / 2)) * 0.98;
    controls.target.set(0, cfg.h * 0.5, cfg.d * 0.5);
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
  doorsBtn.hidden = false;
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

// dimension lines like on a measurement sheet: width on top, height on the left, depth on the floor
function dimensions(cfg) {
  const g = new THREE.Group();
  const mat = new THREE.LineBasicMaterial({ color: 0x2a2824 });
  const line = (pts) => g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(...p))), mat));
  const tick = 0.05;
  const { w, h, d } = cfg;
  const yW = h + 0.14, xH = -w / 2 - 0.14, xD = w / 2 + 0.16;
  line([[-w / 2, yW, d], [w / 2, yW, d]]);
  line([[-w / 2, yW - tick, d], [-w / 2, yW + tick, d]]);
  line([[w / 2, yW - tick, d], [w / 2, yW + tick, d]]);
  line([[xH, 0, d], [xH, h, d]]);
  line([[xH - tick, 0, d], [xH + tick, 0, d]]);
  line([[xH - tick, h, d], [xH + tick, h, d]]);
  line([[xD, 0.002, 0], [xD, 0.002, d]]);
  line([[xD - tick, 0.002, 0], [xD + tick, 0.002, 0]]);
  line([[xD - tick, 0.002, d], [xD + tick, 0.002, d]]);
  const mm = (m) => Math.round(m * 1000).toLocaleString("ru-RU");
  g.add(label(mm(w), 0, yW + 0.0, d));
  g.add(label(mm(h), xH, h / 2, d));
  g.add(label(mm(d), xD + 0.02, 0.09, d / 2));
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
