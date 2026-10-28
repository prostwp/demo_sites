// Parametric sliding-door wardrobe. Units are metres; the back of the corpus sits on z = 0 (against the wall),
// the doors are in front, x is centred. Static parts are merged per material, each door stays its own group
// so it can slide.
import * as THREE from "three";
import { mergeGeometries } from "./vendor/addons/utils/BufferGeometryUtils.js";

export const T = 0.016;      // board thickness (ЛДСП 16 мм)
const PLINTH = 0.07;         // plinth height under the bottom panel
const FRONT = 0.1;           // depth kept for the two door tracks
const PW = 0.022;            // vertical door profile width
const TEX = 1.1;             // metres of wood covered by one texture image

// seeded, so changing a colour doesn't reshuffle the grain on every board
let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
export const reseed = () => { seed = 1; };

// Box with UVs in world units, so wood grain keeps its scale on any size of part.
// Grain runs vertically on uprights and along the width on horizontal boards.
export function box(w, h, d, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d);
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  const du = rnd() * 3, dv = rnd() * 3; // each board gets its own piece of the grain
  for (let i = 0; i < p.count; i++) {
    const px = p.getX(i) + x, py = p.getY(i) + y, pz = p.getZ(i) + z;
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    let u, v;
    if (ax > 0.5) { u = pz; v = py; }
    else if (ay > 0.5) { u = pz; v = px; }
    else if (w > h) { u = py; v = px; } // horizontal fronts: grain along the width
    else { u = px; v = py; }
    uv.setXY(i, u / TEX + du, v / TEX + dv);
  }
  g.translate(x, y, z);
  return g;
}

function rod(len, x, y, z) {
  const g = new THREE.CylinderGeometry(0.0125, 0.0125, len, 20, 1);
  g.rotateZ(Math.PI / 2);
  g.translate(x, y, z);
  return g;
}

// how the inside of one section is laid out, from the bottom up
const LAYOUTS = {
  balanced: ["rail", "drawers", "shelves", "rail"],
  rails: ["rail", "rail", "shelves", "rail"],
  shelves: ["shelves", "drawers", "shelves", "rail"],
};

// cfg: { w, h, d (m), doors, interior }
// mats: { corpus, back, metal, chrome, facade(i, part) -> material }
export function buildWardrobe(cfg, mats) {
  const { w, h, d, doors: n } = cfg;
  reseed();
  const parts = new Map(); // material -> geometries
  const add = (mat, g) => { if (!parts.has(mat)) parts.set(mat, []); parts.get(mat).push(g); };
  const iw = w - 2 * T;            // inner width
  const idep = d - FRONT;          // inner depth (shelves stop before the door tracks)
  const yBot = PLINTH + T;         // top of the bottom panel
  const yTop = h - T;              // underside of the top panel
  const ih = yTop - yBot;

  // corpus
  add(mats.corpus, box(T, h, d, -w / 2 + T / 2, h / 2, d / 2));
  add(mats.corpus, box(T, h, d, w / 2 - T / 2, h / 2, d / 2));
  add(mats.corpus, box(iw, T, d, 0, h - T / 2, d / 2));
  add(mats.corpus, box(iw, T, d, 0, PLINTH + T / 2, d / 2));
  add(mats.corpus, box(iw, PLINTH, T, 0, PLINTH / 2, d - FRONT + 0.02));
  add(mats.back, box(iw, ih, 0.004, 0, yBot + ih / 2, 0.002));

  // sections: one per door, split by partitions
  const sw = (iw - (n - 1) * T) / n;
  const layout = LAYOUTS[cfg.interior] || LAYOUTS.balanced;
  const stats = { shelves: 0, rails: 0, drawers: 0 };
  for (let i = 0; i < n; i++) {
    const x0 = -iw / 2 + i * (sw + T);
    const cx = x0 + sw / 2;
    if (i > 0) add(mats.corpus, box(T, ih, idep, x0 - T / 2, yBot + ih / 2, idep / 2));
    const kind = layout[i % layout.length];
    const shelf = (y) => { add(mats.corpus, box(sw, T, idep - 0.01, cx, y, idep / 2)); stats.shelves++; };
    const topShelf = yTop - 0.36;
    shelf(topShelf); // hat shelf in every section
    if (kind === "rail") {
      add(mats.chrome, rod(sw, cx, topShelf - 0.07, idep / 2));
      stats.rails++;
      if (ih > 1.9) shelf(yBot + 0.32); // shoe shelf under long clothes
    } else if (kind === "drawers") {
      const dh = 0.2, nd = 3;
      for (let k = 0; k < nd; k++) {
        const y = yBot + 0.01 + k * (dh + 0.004) + dh / 2;
        add(mats.corpus, box(sw - 0.006, dh, T, cx, y, idep - T / 2 - 0.004));
        add(mats.chrome, box(Math.min(0.16, sw * 0.35), 0.012, 0.012, cx, y + dh / 2 - 0.03, idep + 0.002));
      }
      stats.drawers += nd;
      shelf(yBot + nd * (dh + 0.004) + 0.02);
      add(mats.chrome, rod(sw, cx, topShelf - 0.07, idep / 2));
      stats.rails++;
    } else {
      const top = topShelf, bottom = yBot;
      const count = Math.max(2, Math.round((top - bottom) / 0.36) - 1);
      for (let k = 1; k <= count; k++) shelf(bottom + ((top - bottom) * k) / (count + 1));
    }
  }

  // door tracks: aluminium rails under the top panel and on the bottom panel
  add(mats.metal, box(iw, 0.012, FRONT - 0.02, 0, yTop - 0.006, d - FRONT / 2));
  add(mats.metal, box(iw, 0.008, FRONT - 0.02, 0, yBot + 0.004, d - FRONT / 2));

  const group = new THREE.Group();
  for (const [mat, geos] of parts) {
    const m = new THREE.Mesh(mergeGeometries(geos), mat);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    geos.forEach((g) => g.dispose());
  }

  // doors: overlap by one profile, alternate between the front and back track
  const dw = (iw + PW * (n - 1)) / n;
  const dh = ih - 0.024;
  const doors = [];
  for (let i = 0; i < n; i++) {
    const door = buildDoor(dw, dh, i, mats);
    const x = -iw / 2 + dw / 2 + i * (dw - PW);
    const z = i % 2 ? d - 0.058 : d - 0.026;
    door.position.set(x, yBot + 0.012 + dh / 2, z);
    door.userData.home = x;
    group.add(door);
    doors.push(door);
  }
  return { group, doors, doorWidth: dw, stats };
}

function buildDoor(w, h, index, mats) {
  const parts = new Map();
  const add = (mat, g) => { if (!parts.has(mat)) parts.set(mat, []); parts.get(mat).push(g); };
  const PD = 0.032, rail = 0.03;
  add(mats.metal, box(PW, h, PD, -w / 2 + PW / 2, 0, 0));
  add(mats.metal, box(PW, h, PD, w / 2 - PW / 2, 0, 0));
  add(mats.metal, box(w - 2 * PW, rail, 0.02, 0, h / 2 - rail / 2, 0));
  add(mats.metal, box(w - 2 * PW, rail, 0.02, 0, -h / 2 + rail / 2, 0));
  const pw = w - 2 * PW, ph = h - 2 * rail;
  const panel = mats.facade(index);
  if (Array.isArray(panel)) {
    // combined door: wood above and below, a band of mirror in the middle, split by thin profiles
    const hs = [0.3, 0.4, 0.3].map((k) => ph * k);
    let y = -ph / 2;
    hs.forEach((hh, k) => {
      add(panel[k], box(pw, hh - (k ? 0.006 : 0), 0.008, 0, y + hh / 2 + (k ? 0.003 : 0), 0));
      if (k) add(mats.metal, box(pw, 0.008, 0.016, 0, y, 0));
      y += hh;
    });
  } else {
    add(panel, box(pw, ph, 0.008, 0, 0, 0));
  }
  const g = new THREE.Group();
  for (const [mat, geos] of parts) {
    const m = new THREE.Mesh(mergeGeometries(geos), mat);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    geos.forEach((x) => x.dispose());
  }
  return g;
}
