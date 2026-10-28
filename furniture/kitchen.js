// Parametric fitted kitchen: straight or L-shaped. Units are metres. The back wall is z = 0, the left wall x = 0,
// run A goes along the back wall, run B (L only) along the left wall. Modules are laid out automatically from
// the wall lengths; appliances are built in. Everything is static, so it is merged into one mesh per material.
import * as THREE from "three";
import { mergeGeometries } from "./vendor/addons/utils/BufferGeometryUtils.js";
import { box, reseed } from "./wardrobe.js";

const PL = 0.1;      // plinth
const BH = 0.72;     // base carcass height
const D = 0.56;      // base carcass depth
const CT = 0.038;    // worktop thickness
const CTD = 0.6;     // worktop depth
const FT = 0.018;    // front thickness
const GAP = 0.003;   // gap between fronts
const UB = 1.45;     // underside of the wall cabinets
const UD = 0.32;     // wall cabinet depth
const TOP = PL + BH + CT; // worktop surface height

// lay the modules out along each wall
export function plan(cfg) {
  const L = cfg.layout === "l";
  const a = cfg.a, b = L ? cfg.b : 0;
  const tallsFor = (len) => (len >= 3.0 ? ["oven", "fridge"] : len >= 2.3 ? ["fridge"] : []);
  const fill = (r) => {
    if (r < 0.01) return [];
    const n = r < 0.25 ? 1 : Math.ceil(r / 0.8);
    return Array.from({ length: n }, () => ({ type: r / n < 0.3 ? "narrow" : "drawers", w: r / n }));
  };
  const runA = [], runB = [];
  if (!L) {
    const talls = tallsFor(a);
    const lb = a - 0.6 * talls.length;
    const dw = lb >= 1.95;
    const r = lb - 0.6 - 0.6 - (dw ? 0.45 : 0);
    const n = r < 0.25 ? 1 : Math.ceil(r / 0.8);
    const left = n > 1 ? (r / n) * Math.floor(n / 2) : 0;
    runA.push(...fill(left), { type: "sink", w: 0.6 });
    if (dw) runA.push({ type: "dw", w: 0.45 });
    runA.push(...fill(r - left), { type: "cook", w: 0.6, oven: !talls.includes("oven") });
    talls.forEach((t) => runA.push({ type: t, w: 0.6, tall: true }));
  } else {
    // A: corner, hob, tall units; B (from the open end towards the corner): sink and dishwasher
    const talls = tallsFor(a);
    const r = a - 0.6 - 0.6 - 0.6 * talls.length;
    const half = r > 0.5 ? r / 2 : 0;
    runA.push({ type: "corner", w: 0.6 }, ...fill(half), { type: "cook", w: 0.6, oven: !talls.includes("oven") }, ...fill(r - half));
    talls.forEach((t) => runA.push({ type: t, w: 0.6, tall: true }));
    const lb = b - CTD;
    const dw = lb >= 1.45;
    const rb = lb - 0.6 - (dw ? 0.45 : 0);
    const end = rb > 0.6 ? rb / 2 : rb;
    runB.push(...fill(end), { type: "sink", w: 0.6 });
    if (dw) runB.push({ type: "dw", w: 0.45 });
    runB.push(...fill(rb - end));
  }
  return { runA, runB };
}

// cfg: { layout: "line"|"l", a, b, upper: "cab"|"high"|"shelf"|"none", handles: "gola"|"bar"|"push" }
// mats: { carcass, front, plinth, top, splash, steel, glass, chrome, shelf, led, hob }
export function buildKitchen(cfg, mats) {
  reseed();
  const parts = new Map();
  const m4 = new THREE.Matrix4();
  const add = (mat, g) => { g.applyMatrix4(m4); if (!parts.has(mat)) parts.set(mat, []); parts.get(mat).push(g); };
  const { runA, runB } = plan(cfg);
  const L = cfg.layout === "l";
  const UH = cfg.upper === "high" ? 0.92 : 0.72;
  const upTop = UB + UH;
  const tallTop = cfg.upper === "high" ? upTop : UB + 0.72;
  const gola = cfg.handles === "gola", bar = cfg.handles === "bar";
  const stats = { base: 0, upper: 0, talls: 0 };

  // one front panel with its handle; fronts lose 30 mm at the top under a gola profile
  const front = (x, y, w, h, z = D, handleAt = "top") => {
    add(mats.front, box(w - GAP, h - GAP, FT, x + w / 2, y + h / 2, z + FT / 2));
    if (bar) {
      const hy = handleAt === "mid" ? y + h / 2 : handleAt === "bottom" ? y + 0.06 : y + h - 0.06;
      const hw = Math.min(0.16, w * 0.5);
      add(mats.steel, box(hw, 0.012, 0.012, x + w / 2, hy, z + FT + 0.022));
      add(mats.steel, box(0.01, 0.01, 0.022, x + w / 2 - hw / 2 + 0.01, hy, z + FT + 0.011));
      add(mats.steel, box(0.01, 0.01, 0.022, x + w / 2 + hw / 2 - 0.01, hy, z + FT + 0.011));
    }
  };
  const glassPanel = (x, y, w, h) => {
    add(mats.glass, box(w - 0.01, h - 0.01, 0.02, x + w / 2, y + h / 2, D + 0.01));
    add(mats.steel, box(w * 0.7, 0.014, 0.016, x + w / 2, y + h - 0.06, D + 0.04));       // handle bar
    add(mats.steel, box(w - 0.03, 0.05, 0.004, x + w / 2, y + h - 0.03, D + 0.021));      // control strip
  };

  function baseModule(mod, x) {
    const { w } = mod;
    const fh = BH - (gola ? 0.03 : 0); // front height
    add(mats.carcass, box(w, BH, D, x + w / 2, PL + BH / 2, D / 2));
    add(mats.plinth, box(w, PL, 0.016, x + w / 2, PL / 2, D - 0.05));
    if (gola) add(mats.steel, box(w, 0.03, 0.02, x + w / 2, PL + BH - 0.015, D - 0.01));
    stats.base += w;
    switch (mod.type) {
      case "drawers": {
        const hs = [0.25, 0.375, 0.375];
        let y = PL + fh;
        hs.forEach((k) => { const h = fh * k; y -= h; front(x, y, w, h, D, "mid"); });
        break;
      }
      case "cook":
        if (mod.oven) {
          glassPanel(x, PL + fh - 0.6, w, 0.6); // oven right under the worktop, a drawer below it
          front(x, PL, w, fh - 0.6, D, "mid");
        } else {
          front(x, PL + fh / 2, w, fh / 2, D, "mid");
          front(x, PL, w, fh / 2, D, "mid");
        }
        // hob: black glass flush with the worktop, burner rings painted on its texture
        add(mats.hob, new THREE.BoxGeometry(0.58, 0.006, 0.51).translate(x + w / 2, TOP + 0.002, 0.3)); // plain 0..1 UVs for the rings
        break;
      case "dw":
        front(x, PL, w, fh, D, "top");
        break;
      default: { // doors: sink, corner, narrow
        const leaves = w > 0.55 ? 2 : 1;
        for (let k = 0; k < leaves; k++) front(x + (k * w) / leaves, PL, w / leaves, fh, D, "top");
      }
    }
  }

  function tallModule(mod, x) {
    const { w } = mod;
    const h = tallTop - PL;
    add(mats.carcass, box(w, h, D, x + w / 2, PL + h / 2, D / 2));
    add(mats.plinth, box(w, PL, 0.016, x + w / 2, PL / 2, D - 0.05));
    stats.talls++;
    if (mod.type === "fridge") {
      // integrated fridge-freezer behind two fronts
      front(x, PL, w, 0.78, D, "top");
      front(x, PL + 0.78, w, h - 0.78, D, "bottom");
    } else {
      front(x, PL, w, 0.36, D, "mid");
      front(x, PL + 0.36, w, 0.34, D, "mid");
      glassPanel(x, PL + 0.7, w, 0.6);
      glassPanel(x, PL + 1.3, w, 0.45);
      front(x, PL + 1.75, w, h - 1.75, D, "bottom");
    }
  }

  function upperModule(mod, x, w) {
    if (cfg.upper === "none" || cfg.upper === "shelf") return;
    const hood = mod.type === "cook";
    const h = hood ? UH - 0.3 : UH;
    const y0 = upTop - h;
    add(mats.carcass, box(w, h, UD, x + w / 2, y0 + h / 2, UD / 2));
    stats.upper += w;
    const leaves = w > 0.55 && !hood ? 2 : 1;
    for (let k = 0; k < leaves; k++) front(x + (k * w) / leaves, y0, w / leaves, h, UD, hood ? "bottom" : "bottom");
    if (hood) add(mats.steel, box(w - 0.04, 0.02, UD - 0.04, x + w / 2, y0 - 0.01, UD / 2)); // built-in hood
    else add(mats.led, box(w - 0.06, 0.005, 0.012, x + w / 2, y0 - 0.003, UD - 0.04));       // light strip
  }

  // one run of modules along a wall; place() sets the run's matrix
  // cornerExtra: run B's splashback and wall units continue into the corner above run A
  function run(mods, cornerExtra, openStart) {
    let x = 0, baseEnd = 0;
    mods.forEach((mod) => {
      if (mod.tall) tallModule(mod, x);
      else { baseModule(mod, x); baseEnd = x + mod.w; }
      x += mod.w;
    });
    // end panels in the front finish where a run is open to the room, instead of bare carcass
    const end = (ex, tall) => add(mats.front, box(FT, (tall ? tallTop : TOP - CT) - 0.004, D + FT, ex, ((tall ? tallTop : TOP - CT) + 0.004) / 2, (D + FT) / 2));
    if (openStart) end(-FT / 2, mods[0]?.tall);
    end(x + FT / 2, mods[mods.length - 1]?.tall);
    // worktop with a cut-out for the sink, and the sink itself
    const sinkX = (() => { let s = 0; for (const m of mods) { if (m.type === "sink") return s; s += m.w; } return -1; })();
    const slab = (x0, x1, z0, z1) => { if (x1 - x0 > 0.001 && z1 - z0 > 0.001) add(mats.top, box(x1 - x0, CT, z1 - z0, (x0 + x1) / 2, TOP - CT / 2, (z0 + z1) / 2)); };
    if (sinkX >= 0) {
      const s0 = sinkX + 0.06, s1 = sinkX + 0.54, z0 = 0.12, z1 = 0.52;
      slab(0, s0, 0, CTD); slab(s1, baseEnd, 0, CTD); slab(s0, s1, 0, z0); slab(s0, s1, z1, CTD);
      const cx = (s0 + s1) / 2, cz = (z0 + z1) / 2, dep = 0.19, yb = TOP - dep;
      add(mats.steel, box(s1 - s0, 0.004, z1 - z0, cx, yb, cz));
      add(mats.steel, box(s1 - s0, dep, 0.004, cx, yb + dep / 2, z0 + 0.002));
      add(mats.steel, box(s1 - s0, dep, 0.004, cx, yb + dep / 2, z1 - 0.002));
      add(mats.steel, box(0.004, dep, z1 - z0, s0 + 0.002, yb + dep / 2, cz));
      add(mats.steel, box(0.004, dep, z1 - z0, s1 - 0.002, yb + dep / 2, cz));
      add(mats.chrome, faucet(cx, TOP, 0.07));
    } else slab(0, baseEnd, 0, CTD);
    // splashback between worktop and wall cabinets
    const sh = UB - TOP, se = baseEnd + (cornerExtra ? CTD - 0.01 : 0);
    add(mats.splash, box(se, sh, 0.01, se / 2, TOP + sh / 2, 0.005));
    // wall cabinets above the base units, or open shelves
    if (cfg.upper === "shelf") {
      const sl = baseEnd + (cornerExtra ? CTD - 0.27 : 0) - 0.02;
      [UB + 0.08, UB + 0.48].forEach((y) => add(mats.shelf, box(sl, 0.03, 0.26, sl / 2 + 0.01, y, 0.13)));
      add(mats.led, box(sl - 0.1, 0.005, 0.012, sl / 2 + 0.01, UB + 0.08 - 0.018, 0.22));
    } else {
      let ux = 0;
      mods.forEach((mod, i) => {
        if (mod.tall) { ux += mod.w; return; }
        const last = i === mods.length - 1 || mods[i + 1].tall;
        upperModule(mod, ux, mod.w + (last && cornerExtra ? CTD - UD : 0));
        ux += mod.w;
      });
    }
    return { baseEnd, len: x };
  }

  // run A along the back wall
  m4.identity();
  const A = run(runA, false, !L);
  let B = null;
  if (L) {
    // run B along the left wall, built from its open end towards the corner: local x → world -z, local z → world +x
    m4.makeRotationY(Math.PI / 2).setPosition(0, 0, cfg.b);
    B = run(runB, true, true); // run A's worktop already covers the corner square
  }
  m4.identity();

  const group = new THREE.Group();
  for (const [mat, geos] of parts) {
    const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
    mesh.castShadow = mesh.receiveShadow = mat !== mats.led;
    group.add(mesh);
    geos.forEach((g) => g.dispose());
  }

  const top = Math.max(cfg.upper === "none" || cfg.upper === "shelf" ? TOP : upTop, runA.some((m) => m.tall) ? tallTop : 0);
  const dims = [{ a: [0, top + 0.14, CTD], b: [cfg.a, top + 0.14, CTD], tick: [0, 1, 0], text: cfg.a }];
  // the side wall's length runs towards the viewer, so it goes on the floor in front of run B
  if (L) dims.push({ a: [CTD + 0.14, 0.002, 0], b: [CTD + 0.14, 0.002, cfg.b], tick: [1, 0, 0], text: cfg.b, at: [CTD + 0.16, 0.09, cfg.b * 0.55] });
  return { group, dims, height: top, stats, runs: { A, B } };
}

function faucet(x, y, z) {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.22, 0), new THREE.Vector3(0, 0.3, 0.06), new THREE.Vector3(0, 0.27, 0.17), new THREE.Vector3(0, 0.22, 0.19),
  ]);
  const g = new THREE.TubeGeometry(curve, 40, 0.012, 14, false);
  const base = new THREE.CylinderGeometry(0.024, 0.026, 0.05, 24).translate(0, 0.025, 0);
  const lever = new THREE.CylinderGeometry(0.006, 0.006, 0.07, 10).rotateZ(Math.PI / 2.6).translate(0.03, 0.07, 0);
  const merged = mergeGeometries([g.toNonIndexed(), base.toNonIndexed(), lever.toNonIndexed()]);
  [g, base, lever].forEach((x) => x.dispose());
  merged.deleteAttribute("uv");
  merged.translate(x, y, z);
  return merged;
}
