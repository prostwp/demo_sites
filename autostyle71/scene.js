// Tint try-on: a real glTF car in a studio; the picker sets how much light the rear glass lets through.
import * as THREE from "three";
import { GLTFLoader } from "./vendor/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "./vendor/addons/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "./vendor/addons/environments/RoomEnvironment.js";
import { OrbitControls } from "./vendor/addons/controls/OrbitControls.js";

window.tryonStarted = true; // the page's fallback text checks this: imports resolved and the module runs

const stage = document.getElementById("stage");
const status = document.getElementById("stage-load");
const hint = document.getElementById("drag-hint");
const turn = document.getElementById("turn");
const pctLabel = document.getElementById("readout-pct");
const buttons = [...document.querySelectorAll(".films button")];
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const FRONT_VLT = 0.7; // ГОСТ: front side windows let through at least 70%
// glass parts of the Volvo S90 model, matched on names reduced to letters
const REAR = ["reardoorglass", "quarterpanelglass", "windsheildrear", "sunroof"];
const FRONT = ["frontdoorglass"];
const WINDSHIELD = ["windsheildglass"];
const key = (name) => name.toLowerCase().replace(/[^a-z]/g, "");

// visible light transmission -> opacity of the dark film layer
const opacityFor = (vlt) => 1 - vlt * 0.9;
const say = (text) => { status.textContent = text; };

// the picker works without 3D too: it updates the percentage, and the scene listens when it is running
let onFilm = () => {};
buttons.forEach((b) => b.addEventListener("click", () => {
  buttons.forEach((x) => x.setAttribute("aria-pressed", x === b));
  pctLabel.textContent = b.dataset.pct;
  onFilm(opacityFor(Number(b.dataset.vlt)));
}));

let renderer;
try {
  // dense screens already look smooth, so skip MSAA there to save the GPU
  renderer = new THREE.WebGLRenderer({ antialias: devicePixelRatio < 1.5, alpha: true, powerPreference: "high-performance" });
} catch (e) {
  say("3D не запустился в этом браузере. Плотность плёнки можно выбрать кнопками.");
}
if (renderer && softwareRendered(renderer)) {
  // without the GPU a car this detailed runs at about one frame per second, so don't even fetch it
  renderer.dispose();
  renderer = null;
  say("Чтобы покрутить машину в 3D, включите в настройках браузера «Использовать аппаратное ускорение». Плотность плёнки можно выбрать кнопками.");
}
if (renderer) init();

function softwareRendered(r) {
  const gl = r.getContext();
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  const name = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  return /swiftshader|llvmpipe|software|basic render/i.test(name);
}

function init() {
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  stage.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const light = () => { scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; };
  light();
  scene.environmentIntensity = 0.9;

  const camera = new THREE.PerspectiveCamera(30, 1.5, 0.1, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.enableDamping = !reduceMotion;
  controls.autoRotate = false; // hold the side view so the windows stay in sight; the visitor turns it
  controls.autoRotateSpeed = 0.8;
  controls.minPolarAngle = Math.PI * 0.32;
  controls.maxPolarAngle = Math.PI * 0.47;
  renderer.domElement.style.touchAction = "pan-y"; // keep vertical page scroll on phones
  // OrbitControls with damping only moves the camera inside update(), so the loop must keep running
  // for the whole drag and until the inertia has died out — not stop after one frame
  let dragging = false;
  controls.addEventListener("start", () => { hint.style.opacity = 0; dragging = true; wake(); });
  controls.addEventListener("end", () => { dragging = false; wake(); });

  // keyboard and screen-reader way to turn the car: a quarter-ish turn per press
  let spin = 0;
  turn.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    hint.style.opacity = 0;
    spin += Number(b.dataset.turn) * Math.PI / 6;
    wake();
  }));
  const yAxis = new THREE.Vector3(0, 1, 0);
  const orbit = (angle) => {
    camera.position.sub(controls.target).applyAxisAngle(yAxis, angle).add(controls.target);
    camera.lookAt(controls.target);
  };

  const film = (vlt) => new THREE.MeshPhysicalMaterial({
    color: 0x07090c, metalness: 0, roughness: 0.08, envMapIntensity: 0.45,
    transparent: true, opacity: opacityFor(vlt), depthWrite: false,
  });
  const rearGlass = film(0.15);
  const frontGlass = film(FRONT_VLT);
  const windshield = film(0.9);
  let target = rearGlass.opacity;
  let fit = null; // set once the model is loaded and measured

  onFilm = (opacity) => {
    target = opacity;
    if (reduceMotion) rearGlass.opacity = opacity;
    wake();
  };
  const pressed = buttons.find((b) => b.getAttribute("aria-pressed") === "true");
  if (pressed) rearGlass.opacity = target = opacityFor(Number(pressed.dataset.vlt));

  // the model is ~7 MB: fetch it only when the visitor scrolls close to this section
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  let started = false;
  const start = () => { if (started) return; started = true; nearby.disconnect(); loadCar(); };
  const nearby = new IntersectionObserver(([e]) => { if (e.isIntersecting) start(); }, { rootMargin: "600px 0px" });
  nearby.observe(stage);
  // backup: some browsers never report the section as visible, so fetch anyway once the page has settled —
  // but not on metered or slow connections, where only scrolling to the car should spend the traffic
  const net = navigator.connection;
  const frugal = net && (net.saveData || /(^|-)2g|3g/.test(net.effectiveType || ""));
  if (!frugal) addEventListener("load", () => setTimeout(start, 5000), { once: true });

  const loadCar = () => loader.load("model/volvo.glb?v=7", (gltf) => {
    const car = gltf.scene;
    car.traverse((o) => {
      if (!o.isMesh) return;
      // thin see-through parts (lamps, trim glass) look the same in one pass and save a draw call each
      if (o.material.transparent) o.material.forceSinglePass = true;
      const n = key(o.name);
      if (o.material?.name !== "Glass") return; // only real glass: name prefixes also match frames and null backings
      if (REAR.some((r) => n.startsWith(r))) o.material = rearGlass;
      else if (FRONT.some((r) => n.startsWith(r))) o.material = frontGlass;
      else if (WINDSHIELD.some((r) => n.startsWith(r))) o.material = windshield;
      if (o.material === rearGlass || o.material === frontGlass || o.material === windshield) o.renderOrder = 2;
    });

    // centre the car on the floor and frame it
    const box = new THREE.Box3().setFromObject(car);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    car.position.sub(new THREE.Vector3(center.x, box.min.y, center.z));
    scene.add(car);
    scene.add(groundShadow(size));
    fit = () => {
      // distance that keeps the whole car (bounding sphere) inside the narrower field of view
      const radius = size.length() / 2;
      const vFov = THREE.MathUtils.degToRad(camera.fov);
      const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
      const dist = (radius / Math.sin(Math.min(vFov, hFov) / 2)) * 0.68;
      // side view at window height, a touch from the rear: look across the car's short axis
      const dir = size.z > size.x ? new THREE.Vector3(1, 0.12, -0.35).normalize() : new THREE.Vector3(0.35, 0.12, -1).normalize();
      controls.target.set(0, size.y * 0.5, 0);
      camera.position.copy(controls.target).addScaledVector(dir, dist);
      controls.update();
    };
    fit();
    status.remove();
    turn.hidden = false;
    wake();
  }, (e) => {
    if (e.total) status.querySelector("span").textContent = Math.round((e.loaded / e.total) * 100) + "%";
  }, () => {
    say("Не удалось загрузить 3D-модель. Обновите страницу.");
  });

  const resize = () => {
    const w = stage.clientWidth, h = stage.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 1.2 ? 40 : 30;
    camera.updateProjectionMatrix();
    fit?.();
    wake();
  };
  new ResizeObserver(resize).observe(stage);

  let visible = true, running = false, lost = false;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) wake(); }).observe(stage);
  controls.addEventListener("change", wake);

  // the GPU can drop the context (driver reset, too many tabs); three.js rebuilds its state on restore,
  // but the studio lighting was rendered into a texture and has to be made again
  renderer.domElement.addEventListener("webglcontextlost", (e) => { e.preventDefault(); lost = true; });
  renderer.domElement.addEventListener("webglcontextrestored", () => { lost = false; light(); wake(); });

  function wake() {
    if (!running && visible && !lost) { running = true; requestAnimationFrame(frame); }
  }
  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (lost) { running = false; return; }
    rearGlass.opacity += (target - rearGlass.opacity) * Math.min(dt * 7, 1);
    if (spin) {
      const step = reduceMotion || Math.abs(spin) < 0.002 ? spin : spin * Math.min(dt * 8, 1);
      orbit(step);
      spin -= step;
    }
    const moved = controls.update(dt);
    renderer.render(scene, camera);
    const settled = Math.abs(target - rearGlass.opacity) < 0.002 && !dragging && !moved && !spin;
    if (!visible || settled) { running = false; return; }
    requestAnimationFrame(frame);
  }
  resize();
}

function groundShadow(size) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(128, 128, 8, 128, 128, 128);
  grad.addColorStop(0, "rgba(0,0,0,0.85)");
  grad.addColorStop(0.55, "rgba(0,0,0,0.45)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size.x * 1.5, size.z * 1.35),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.002;
  return m;
}
