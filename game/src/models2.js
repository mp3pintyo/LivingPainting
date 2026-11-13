// The second round of models: what the plain is gathered round. Each one after a Csontváry painting —
// the one-arched bridge, white houses, round tower and minaret of Római híd Mosztárban (1903); the cedar of
// A magányos cédrus (1907) — or after life on the Hortobágy: the bridge fair (hídi vásár), its tents and people.
import * as THREE from 'three';
import { M, holeOf, limb, merge, part } from './models.js';

// ------------------------------------------------------------------- the bridge at Mostar

// As he painted it: one tall, slightly pointed arch springing from the water's edge, a thin deck with a steep hump
// over it, slim parapets; the ends run level into the banks, at the town's height.
export const MOSTAR_BRIDGE = { half: 17, ramp: 7, width: 4.6, base: 10, rise: 4, span: 27, spring: 0.3, archRise: 12.3, bottom: -3.2 };

/** the road over it: base is the banks' height; a steep hump, like his */
export function mostarDeckY(lx) {
  const B = MOSTAR_BRIDGE, ax = Math.abs(lx);
  if (ax <= B.half) return B.base + B.rise * (1 - (ax / B.half) ** 1.6);
  if (ax <= B.half + B.ramp) return B.base;
  return 0;
}
/** the arch's soffit: two arcs meeting in a soft point (0 outside the span) */
export function mostarArchY(x) {
  const B = MOSTAR_BRIDGE, R = B.span / 2, c = 0.12 * R, rho = R + c;
  if (Math.abs(x) >= R) return B.spring;
  const top = Math.sqrt(rho * rho - c * c);
  return B.spring + (B.archRise / top) * Math.sqrt(Math.max(0, rho * rho - (Math.abs(x) + c) ** 2));
}

export function makeMostarBridge() {
  const B = MOSTAR_BRIDGE;
  const L = B.half + B.ramp, R = B.span / 2;
  const shape = new THREE.Shape();
  // the abutments go straight down into the banks
  shape.moveTo(-L, B.bottom);
  // (past the hump the road runs on the quay itself: there the stone is kept just under the ground, so that the two
  // are never drawn in one plane — that shimmers)
  for (let x = -L; x <= L + 1e-6; x += 0.5) {
    // (it goes under at a slant, a little before the hump's foot, where the quay comes up to meet it)
    const t = Math.min(1, Math.max(0, (Math.abs(x) - (B.half - 1.5)) / 2));
    shape.lineTo(x, mostarDeckY(x) - 0.35 * t * t * (3 - 2 * t));
  }
  shape.lineTo(L, B.bottom);
  shape.lineTo(-L, B.bottom);
  const h = new THREE.Path();
  h.moveTo(-R, B.bottom + 0.4);
  for (let i = 0; i <= 40; i++) { const x = -R + (2 * R * i) / 40; h.lineTo(x, mostarArchY(x)); }
  h.lineTo(R, B.bottom + 0.4);
  h.lineTo(-R, B.bottom + 0.4);
  shape.holes.push(holeOf(h));
  const body = new THREE.ExtrudeGeometry(shape, { depth: B.width, bevelEnabled: false, steps: 1 });
  body.translate(0, 0, -B.width / 2);
  // grey-olive stone, as on his canvas (it only warms where the sun strikes it); the soffit in shadow, darker and greener
  const stone = new THREE.Color('#bcb296'), road = new THREE.Color('#a8997c'), under = new THREE.Color('#615d4c');
  const nrm = body.attributes.normal;
  const bodyP = part(body, (c, x, y, z, i) => {
    const ny = nrm.getY(i), nz = nrm.getZ(i);
    if (ny > 0.6 && y > B.base - 0.5) c.copy(road);
    else if (Math.abs(nz) < 0.5 && Math.abs(x) < R + 0.05 && y < mostarArchY(x) + 0.05) c.copy(under);
    else c.copy(stone).offsetHSL(0, 0, Math.sin(y * 1.7 + x * 0.4) * 0.025);
  });
  const ps = new THREE.Shape();
  const PL = B.half + 3;
  ps.moveTo(-PL, mostarDeckY(-PL) - 0.2);
  for (let x = -PL; x <= PL + 1e-6; x += 0.5) ps.lineTo(x, mostarDeckY(x) + 0.7);
  for (let x = PL; x >= -PL - 1e-6; x -= 0.5) ps.lineTo(x, mostarDeckY(x) - 0.2);
  const par = new THREE.ExtrudeGeometry(ps, { depth: 0.35, bevelEnabled: false, steps: 1 });
  return merge([bodyP, part(par, '#b8ae93', M(0, 0, B.width / 2 - 0.35)), part(par, '#b8ae93', M(0, 0, -B.width / 2))]);
}

/** a house of Mostar, as on his canvas: a plain block, whitewashed or cream, pink, ochre, pale green; rows of small
 *  dark windows on every side, a door; a dark line of shadow under the eaves; the roof low and hipped or a gable, of
 *  blue-black slate or grey slabs, a few of red tile */
export const MOSTAR_WALLS = ['#f1ece2', '#efe6d4', '#ecd8cb', '#e6d2a4', '#f1ece2', '#e9dcd2', '#dfc98a', '#c9d1a8'];
export const MOSTAR_ROOFS = ['#484a56', '#6c6a6c', '#3d404c', '#b8492c', '#8b8b90', '#a8452c', '#55535a'];
export function makeMostarHouse(rng, { w = 7, d = 6, h = 6, wall = null, roofCol = null, footing = 8, gable = null } = {}) {
  const walls = [], roof = [], wood = [];
  const white = new THREE.Color(wall || MOSTAR_WALLS[Math.floor(rng() * MOSTAR_WALLS.length)]).offsetHSL(0, 0, (rng() - 0.5) * 0.04);
  const isGable = gable === null ? rng() < 0.42 : gable;
  walls.push(part(new THREE.BoxGeometry(w, h, d), white.getHex(), M(0, h / 2, 0)));
  walls.push(part(new THREE.BoxGeometry(w + 0.3, footing, d + 0.3), '#cfc3a8', M(0, -footing / 2 + 0.4, 0)));   // a stone footing down the slope
  wood.push(part(new THREE.BoxGeometry(w + 0.45, 0.24, d + 0.45), '#5b5550', M(0, h - 0.04, 0)));                // the eaves' shadow
  const dark = '#24201e', floors = Math.max(1, Math.floor((h - 0.6) / 2.7));
  const nx = Math.max(1, Math.floor(w / 2.3)), nz = Math.max(1, Math.floor(d / 2.5)), door = Math.floor(rng() * nx);
  for (let f = 0; f < floors; f++) {
    const y = 1.7 + f * 2.7;
    for (let i = 0; i < nx; i++) {
      const x = -w / 2 + (i + 0.5) * (w / nx);
      for (const s of [1, -1]) {
        if (f === 0 && s === 1 && i === door) { wood.push(part(new THREE.BoxGeometry(1.05, 2.0, 0.08), '#3a2a20', M(x, 1.0, d / 2 + 0.02))); continue; }
        wood.push(part(new THREE.BoxGeometry(0.72, 1.2, 0.07), dark, M(x, y, s * (d / 2 + 0.02))));
      }
    }
    for (let i = 0; i < nz; i++) {
      const z = -d / 2 + (i + 0.5) * (d / nz);
      for (const s of [1, -1]) wood.push(part(new THREE.BoxGeometry(0.07, 1.2, 0.72), dark, M(s * (w / 2 + 0.02), y, z)));
    }
  }
  // the roof, low: hipped, or a gable with the wall running up into it
  const ov = 0.5, W2 = w / 2 + ov, D2 = d / 2 + ov, rh = Math.min(w, d) * (isGable ? 0.36 : 0.28), rl = isGable ? W2 : Math.max(0.3, W2 - D2);
  const y0 = h, y1 = h + rh;
  const A = [-W2, y0, -D2], Bp = [W2, y0, -D2], C = [W2, y0, D2], Dp = [-W2, y0, D2], R1 = [-rl, y1, 0], R2 = [rl, y1, 0];
  const tris = [...A, ...R2, ...Bp, ...A, ...R1, ...R2, ...Dp, ...C, ...R2, ...Dp, ...R2, ...R1];
  if (!isGable) tris.push(...A, ...Dp, ...R1, ...Bp, ...R2, ...C);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(tris, 3));
  g.computeVertexNormals();
  roof.push(part(g, new THREE.Color(roofCol || MOSTAR_ROOFS[Math.floor(rng() * MOSTAR_ROOFS.length)]).offsetHSL((rng() - 0.5) * 0.02, 0, (rng() - 0.5) * 0.06).getHex()));
  if (isGable) {
    const yg = y1 - rh * (ov / D2) * 0.5, gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute([w / 2, h, d / 2, w / 2, h, -d / 2, w / 2, yg, 0, -w / 2, h, -d / 2, -w / 2, h, d / 2, -w / 2, yg, 0], 3));
    gg.computeVertexNormals();
    walls.push(part(gg, white.getHex()));
  }
  return { walls: merge(walls), roof: merge(roof), wood: merge(wood) };
}

export function makeMinaret() {
  const p = [];
  p.push(part(new THREE.CylinderGeometry(1.1, 1.3, 20, 14), '#efe9dd', M(0, 10, 0)));
  p.push(part(new THREE.CylinderGeometry(1.7, 1.5, 0.6, 14), '#d8d0c2', M(0, 15.5, 0)));      // the balcony
  p.push(part(new THREE.CylinderGeometry(0.9, 0.9, 3, 12), '#efe9dd', M(0, 21.5, 0)));
  p.push(part(new THREE.ConeGeometry(1.2, 5, 12), '#5d6670', M(0, 25.5, 0)));
  p.push(part(limb([0, 28, 0], [0, 29.4, 0], 0.06), '#c9a24a'));
  return merge(p);
}

export function makeRoundTower() {
  // his Halebija: a tall drum of grey stone, a little tapered, the top cut level with a darker rim, few slits
  const p = [];
  p.push(part(new THREE.CylinderGeometry(3.9, 4.6, 24, 20), '#a9a392', M(0, 12 - 6, 0)));
  p.push(part(new THREE.CylinderGeometry(4.1, 3.95, 1.0, 20), '#7d776a', M(0, 18.5, 0)));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    p.push(part(new THREE.BoxGeometry(0.45, 1.3, 0.1), '#2a2520', M(Math.cos(a) * 4.05, 13 + (i % 2) * 2.5, Math.sin(a) * 4.05, 0, -a + Math.PI / 2, 0)));
  }
  return merge(p);
}

/** dark, rounded river rocks (the ones his falls pour over at Mostar) */
export function makeRocks(rng, n = 5, spread = 2.4, size = 1.6) {
  const p = [];
  for (let i = 0; i < n; i++) {
    const s = size * (0.6 + rng() * 0.6);
    p.push(part(new THREE.IcosahedronGeometry(1, 2), new THREE.Color('#3c4646').offsetHSL(0, 0, (rng() - 0.5) * 0.08).getHex(),
      M((rng() - 0.5) * spread * 2, s * 0.3, (rng() - 0.5) * spread, rng(), rng() * 6, 0, s * 1.2, s * 0.85, s)));
  }
  return merge(p);
}

/** white water falling: a curved sheet; the material streaks it downward */
export function makeWaterfall(w = 6, h = 9) {
  const g = new THREE.PlaneGeometry(w, h, 8, 12);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), t = (h / 2 - y) / h;
    p.setZ(i, Math.sin(t * Math.PI * 0.5) * 1.6 + Math.sin(p.getX(i) * 1.3) * 0.15);
    p.setX(i, p.getX(i) * (0.45 + 0.75 * Math.pow(Math.max(0, t), 0.8)));    // it leaves the rock narrow and spreads as it falls
  }
  g.computeVertexNormals();
  g.translate(0, h / 2, 0);
  return g;
}

// ------------------------------------------------------------------- the lonely cedar

/** A magányos cédrus (1907), built to his picture: seen from the front (+z, coming up the road from the south) it
 * stands as he painted it; x is his canvas's left–right, about 0.043 m to a pixel of an 890 px reproduction.
 *  - a slim trunk, pinkish ochre streaked darker, a gentle S; at the foot pale roots splayed out like a beast lying down;
 *  - on its right a white dry branch rising straight up beside it, its tip bent over like a bird's head;
 *  - at the top a dark knot, and from it a very wide, flat, roof-like crown of dark needles, most of it to the left;
 *  - at its right end the boughs arch over and fall in long hanging plumes, like a fountain;
 *  - to the left, long thin wavy whips running out to the edge of the picture, each ending in a hanging feather of
 *    needles (the lowest reaching down to a third of the height).
 * Needles are drawn as single strokes (thin three-sided spikes), not as blobs. Height ~29 m. */
export function makeCedar(rng) {
  const trunk = [], crown = [];
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const UP = V(0, 1, 0), DOWN = V(0, -1, 0);
  // ---- strokes: thin spikes, three faces each
  const pos = [], nor = [], col = [];
  const cc = new THREE.Color(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), nn = new THREE.Vector3();
  const stroke = (a, b, w, hex) => {
    const d = b.clone().sub(a).normalize();
    const u = new THREE.Vector3().crossVectors(d, UP);
    if (u.lengthSq() < 1e-4) u.set(1, 0, 0);
    u.normalize();
    const v = new THREE.Vector3().crossVectors(u, d);
    const o = [0, 1, 2].map((k) => { const t = (k / 3) * Math.PI * 2; return a.clone().addScaledVector(u, Math.cos(t) * w).addScaledVector(v, Math.sin(t) * w); });
    cc.set(hex);
    for (let k = 0; k < 3; k++) {
      const p0 = o[k], p1 = o[(k + 1) % 3];
      nn.crossVectors(e1.subVectors(p1, p0), e2.subVectors(b, p0)).normalize();
      for (const p of [p0, p1, b]) { pos.push(p.x, p.y, p.z); nor.push(nn.x, nn.y, nn.z); col.push(cc.r, cc.g, cc.b); }
    }
  };
  const darks = ['#1f4a33', '#27573a', '#1b3f2c', '#2f6a44'], lights = ['#4c8a52', '#5f9c5c', '#3f7a4a'];
  const needleCol = () => (rng() < 0.7 ? darks : lights)[Math.floor(rng() * 3)];
  // a feather of needles: a rachis from `at` along `dir`, needles both sides, raked forward and drooping
  const feather = (at, dir, len, width, droop = 0.45, cols = null) => {
    const d = dir.clone().normalize();
    const side = new THREE.Vector3().crossVectors(d, UP);
    if (side.lengthSq() < 1e-4) side.set(0, 0, 1);
    side.normalize();
    stroke(at, at.clone().addScaledVector(d, len), 0.07, '#3a3024');
    const n = Math.max(6, Math.round(len * 6));
    for (let i = 1; i <= n; i++) {
      const t = i / n, p = at.clone().addScaledVector(d, len * t * 0.97);
      const w = width * Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.95)), 0.6);
      for (const sgn of [-1, 1]) {
        const nd = d.clone().multiplyScalar(0.6).addScaledVector(side, sgn * (0.75 + rng() * 0.2)).addScaledVector(DOWN, droop + rng() * 0.2).normalize();
        stroke(p, p.clone().addScaledVector(nd, w * (0.75 + rng() * 0.5)), 0.085, cols ? cols[Math.floor(rng() * cols.length)] : needleCol());
      }
    }
  };
  // a tuft at a whip's end, as he drew them: a level twig, the needles hanging from it like the teeth of a comb
  const comb = (at, dir, len, drop) => {
    const d = dir.clone().normalize();
    stroke(at, at.clone().addScaledVector(d, len), 0.08, '#3a3024');
    const n = Math.round(len * 9);
    for (let i = 0; i < n; i++) {
      const t = (i + rng()) / n, p = at.clone().addScaledVector(d, len * t);
      p.z += (rng() - 0.5) * 0.5;
      const l = drop * (0.45 + 0.75 * Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.8))) * (0.7 + rng() * 0.6);
      stroke(p, p.clone().addScaledVector(V(d.x * 0.45 + (rng() - 0.5) * 0.15, -1, (rng() - 0.5) * 0.25).normalize(), l), 0.09, needleCol());
    }
  };
  // a branch as a wavy polyline of limbs from a to b, its middle lifted by `lift`
  const whip = (a, b, lift, r0, r1, colour, wave = 0.5) => {
    const pts = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6, p = a.clone().lerp(b, t);
      p.y += lift * Math.sin(Math.PI * t) + wave * Math.sin(t * 9 + a.y) * Math.sin(Math.PI * t);
      p.z += wave * 0.6 * Math.cos(t * 7 + a.x) * Math.sin(Math.PI * t);
      pts.push(p);
    }
    for (let i = 0; i < 6; i++) trunk.push(part(limb(pts[i].toArray(), pts[i + 1].toArray(), r0 + (r1 - r0) * (i / 6), r0 + (r1 - r0) * ((i + 1) / 6), 5), colour));
    return pts;
  };
  // ---- the trunk: pale at the foot, orange-brown above, hatched darker down its length, nearly black above the
  // fork; a gentle S up to the dark knot
  const pale = new THREE.Color('#e9d8c6'), ochre = new THREE.Color('#b9713f'), streak = new THREE.Color('#7a4128'), dusk = new THREE.Color('#33241d');
  const barkCol = (c, x, y, z) => {
    c.copy(pale).lerp(ochre, Math.min(1, Math.max(0, (y - 0.4) / 4.5)));
    if (Math.sin(Math.atan2(z, x) * 11 + y * 0.22) > 0.35) c.lerp(streak, 0.5);
    c.lerp(dusk, Math.min(1, Math.max(0, (y - 20.5) / 3.5)));
  };
  const spine = [V(0, -1, 0), V(0.1, 1.6, 0), V(0.25, 4, 0), V(-0.35, 10, 0), V(-0.2, 15, 0), V(0.35, 20, 0), V(0.6, 24.5, 0)];
  const rad = [2.6, 1.6, 1.22, 1.04, 0.96, 0.82, 0.64];
  for (let i = 0; i < spine.length - 1; i++) trunk.push(part(limb(spine[i].toArray(), spine[i + 1].toArray(), rad[i], rad[i + 1], 14), barkCol));
  trunk.push(part(new THREE.SphereGeometry(1, 12, 8), '#2b1f1a', M(0.6, 24.9, 0, 0, 0, 0, 0.9, 1.2, 0.9)));   // the dark knot
  // the roots: splayed out on the ground, pale, like feet
  for (const [x, z, r] of [[-4.2, 0.6, 0.75], [4.6, 0.8, 0.8], [3.0, -2.2, 0.55], [-2.2, -2.0, 0.5], [0.8, 3.2, 0.55], [-2.6, 2.4, 0.45]]) {
    trunk.push(part(limb([0, 2.4, 0], [x * 0.55, 0.3, z * 0.55], r + 0.55, r, 8), barkCol));
    trunk.push(part(limb([x * 0.55, 0.25, z * 0.55], [x, -0.2, z], r, 0.12, 8), barkCol));
  }
  // the stub low on its left, curled like a beast's paw
  trunk.push(part(limb([-0.3, 4.3, 0.1], [-2.0, 5.1, 0.3], 0.5, 0.34, 8), barkCol));
  trunk.push(part(limb([-2.0, 5.1, 0.3], [-2.9, 4.5, 0.4], 0.34, 0.1, 8), barkCol));
  // the second stem, dead and white, rising straight up beside the trunk from the fork, its tip bent over to the right
  const dry = '#efe7dc';
  trunk.push(part(limb([0.0, 11.2, 0.3], [1.7, 14.5, 0.4], 0.62, 0.56, 8), barkCol));
  trunk.push(part(limb([1.7, 14.5, 0.4], [2.3, 19.5, 0.4], 0.54, 0.42, 8), dry));
  trunk.push(part(limb([2.3, 19.5, 0.4], [2.6, 21.6, 0.4], 0.42, 0.28, 8), dry));
  trunk.push(part(limb([2.6, 21.6, 0.4], [3.7, 21.1, 0.4], 0.28, 0.05, 8), dry));        // the bird's head
  trunk.push(part(limb([0.2, 15.5, 0], [1.1, 16.0, 0.2], 0.14, 0.05, 6), dry));          // a broken stub
  trunk.push(part(limb([-0.1, 9.6, 0], [-0.9, 10.0, 0.1], 0.15, 0.05, 6), dry));
  trunk.push(part(limb([-0.6, 17.6, 0.2], [-9.8, 18.9, 0.6], 0.2, 0.05, 6), '#e3cba4'));  // the pale broken bough, pointing left
  // ---- the crown: one very wide, flat-topped sheet of needles (it spans the canvas: 19 m to the left of the trunk,
  // 14 to the right), darkest on top, thinning to its left end; lighter layers hang under its left half
  const twig = '#6a3f33', black = '#231a17';
  void twig;
  const sheet = (x, y, z, rx, rz, th, top, under, nTop, nUnder) => {
    const g = new THREE.SphereGeometry(1, 40, 10);
    const pa = g.attributes.position, ph = rng() * 6;
    for (let i = 0; i < pa.count; i++) {
      const ang = Math.atan2(pa.getZ(i), pa.getX(i));
      const f = 0.86 + 0.1 * Math.sin(ang * 7 + ph) + 0.07 * Math.sin(ang * 15 + ph * 2) + 0.05 * Math.sin(ang * 29 + ph);
      pa.setX(i, pa.getX(i) * f); pa.setZ(i, pa.getZ(i) * f);
      if (pa.getY(i) > 0) pa.setY(i, pa.getY(i) * 0.55);          // flat on top
    }
    g.computeVertexNormals();
    const ct = new THREE.Color(top), cu = new THREE.Color(under);
    crown.push(part(g, (c, px, py, pz, i, gg) => { c.copy(cu).lerp(ct, Math.min(1, Math.max(0, gg.attributes.normal.getY(i) * 0.8 + 0.5))); },
      M(x, y, z, 0, 0, 0, rx, th, rz)));
    // his needles are level strokes, swept to the left by the wind: over the top dark, under it lighter
    for (let k = 0; k < nTop + nUnder; k++) {
      const an = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * 0.96, up = k < nTop;
      const dome = th * Math.sqrt(1 - rr * rr * 0.98);
      const a0 = V(x + Math.cos(an) * rx * rr * 0.9, y + (up ? dome * 0.55 + 0.04 : -dome - 0.04), z + Math.sin(an) * rz * rr * 0.9);
      const len = 1.4 + rng() * 2.4;
      stroke(a0, a0.clone().add(V(-len, (up ? -0.04 : -0.2) - rng() * 0.22, (rng() - 0.5) * 0.6)), 0.11, up ? needleCol() : lights[Math.floor(rng() * 3)]);
    }
    // its fringe: feathers raked outward and to the left, a little down
    const nf = Math.round((rx + rz) * 1.5);
    for (let k = 0; k < nf; k++) {
      const an = (k / nf) * Math.PI * 2 + rng() * 0.2;
      feather(V(x + Math.cos(an) * rx * 0.86, y - 0.1, z + Math.sin(an) * rz * 0.86), V(Math.cos(an) - 0.45, -0.16 - rng() * 0.18, Math.sin(an) * 0.6), 2.4 + rng() * 2.0, 0.95, 0.25);
    }
  };
  sheet(-2.5, 27.3, 0, 17, 7.2, 1.5, '#1b4633', '#2f6f47', 520, 320);
  sheet(-12.5, 26.6, 0.4, 7.5, 4.6, 0.9, '#205039', '#3a8050', 150, 110);
  sheet(7.5, 27.7, -0.3, 6.5, 5.0, 1.1, '#1b4633', '#2f6f47', 130, 90);
  sheet(-6.5, 25.2, 0.6, 10.5, 5.4, 0.5, '#2f7a4c', '#55a063', 160, 170);
  sheet(-10.5, 23.8, -0.5, 7.0, 3.8, 0.38, '#3a8853', '#66ab6c', 90, 110);
  // the black boughs in it: from the knot out under the sheet, and a loop by the knot with the sky showing through
  const knot = V(0.6, 24.8, 0);
  whip(knot, V(-6.5, 26.9, 0.5), 0.6, 0.42, 0.12, black, 0.2);
  whip(knot, V(-11.5, 26.2, -0.7), 0.9, 0.32, 0.08, black, 0.3);
  whip(knot, V(-3.0, 26.6, -2.2), 0.4, 0.3, 0.1, black, 0.2);
  whip(V(0.6, 24.9, 0), V(3.3, 25.5, 0.2), 1.1, 0.32, 0.24, black, 0);
  whip(V(3.3, 25.5, 0.2), V(1.0, 26.7, 0), -0.5, 0.24, 0.12, black, 0);
  // to the right the great bough arches over like a crook, and long pale plumes hang from it like a fountain
  whip(knot, V(9, 27.6, 0), 1.3, 0.5, 0.27, black, 0.15);
  const crook = whip(V(9, 27.6, 0), V(13.9, 24.2, 0.3), 1.2, 0.27, 0.08, black, 0.1);
  const plume = ['#6fa585', '#86b594', '#5a9474', '#9cc3a4'];
  for (let k = 0; k < 12; k++) {
    const at = k < 7 ? crook[k].clone() : V(10.5 + rng() * 4, 27.0 - rng() * 0.6, (rng() - 0.5) * 7);
    at.z += (rng() - 0.5) * 1.5;
    feather(at, V(0.12 + rng() * 0.2, -1, (rng() - 0.5) * 0.25), 4.5 + rng() * 4, 1.15, 0.5, plume);
  }
  // ---- the long whips to the left: red-brown and violet, waving, each ending in a hanging comb of needles
  // (tips from his picture: x, y)
  const tips = [[-16.1, 21.5], [-20.2, 20.4], [-17.0, 18.3], [-18.7, 16.8], [-11.4, 16.6], [-14.6, 14.4], [-9.0, 13.1], [-17.6, 9.0], [-21.5, 18.8], [-13.0, 19.6],
    [-12.5, 22.8], [-7.5, 20.9], [-15.5, 11.6]];
  const whipCols = ['#8a4a3a', '#6b3a40', '#7a4636'];
  tips.forEach(([x, y], i) => {
    const z = ((i % 3) - 1) * 3.2 + (rng() - 0.5) * 1.5;
    const y0 = 14 + rng() * 9;
    const pts = whip(V(0.1, y0, 0), V(x, y + 1.2, z), 1.6 + rng() * 1.2, 0.3, 0.06, whipCols[i % 3], 0.5);
    const tip = pts[pts.length - 1];
    comb(tip.clone().add(V(1.2, 0, 0)), V(-1, -0.1, (rng() - 0.5) * 0.3), 4.2 + rng() * 1.8, 1.7);
    feather(tip, V(-1, -0.4, (rng() - 0.5) * 0.4), 2.4 + rng(), 0.9, 0.3);
    feather(pts[4], V(-0.5, -0.9, 0), 1.8 + rng(), 0.8, 0.35);
  });
  const ng = new THREE.BufferGeometry();
  ng.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  ng.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  ng.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  crown.push(ng);
  return { trunk: merge(trunk), crown: merge(crown) };
}

// ------------------------------------------------------------------- the bridge fair

/** a market stall: four posts, a pitched cloth roof (white, or striped), a counter with wares */
export function makeStall(rng) {
  const cloth = [], wood = [];
  const w = 3.2 + rng() * 1.4, d = 2.4, h = 2.2;
  for (const [x, z] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) wood.push(part(limb([x, 0, z], [x, h + (z < 0 ? 0.5 : 0), z], 0.06), '#5a4330'));
  const cl = rng() < 0.5 ? '#efe7d4' : '#d9c9a4';
  const stripe = rng() < 0.4 ? (rng() < 0.5 ? '#9c3b2a' : '#3e5a7a') : null;
  const g = new THREE.BoxGeometry(w + 0.5, 0.05, d + 0.6, Math.ceil(w * 2), 1, 1);
  cloth.push(part(g, (c, x) => c.set(stripe && Math.floor((x + 10) * 1.6) % 2 ? stripe : cl), M(0, h + 0.27, 0, Math.atan2(0.5, d), 0, 0)));
  wood.push(part(new THREE.BoxGeometry(w * 0.9, 0.9, 0.7), '#6b4f36', M(0, 0.45, -d / 2 + 0.4)));
  // wares: pots, jugs, baskets, loaves
  for (let i = 0; i < 6; i++) {
    const x = -w * 0.4 + (i / 5) * w * 0.8;
    const k = rng();
    if (k < 0.4) wood.push(part(new THREE.SphereGeometry(0.18, 8, 6), '#a85a34', M(x, 1.05, -d / 2 + 0.4, 0, 0, 0, 1, 1.2, 1)));
    else if (k < 0.7) wood.push(part(new THREE.CylinderGeometry(0.2, 0.16, 0.25, 8), '#8f7448', M(x, 1.02, -d / 2 + 0.4)));
    else wood.push(part(new THREE.SphereGeometry(0.16, 8, 5), '#c99a55', M(x, 0.98, -d / 2 + 0.4, 0, 0, 0, 1.4, 0.6, 1)));
  }
  return { cloth: merge(cloth), wood: merge(wood) };
}

/** a round white tent (sátor) with a peak and a pennant */
export function makeTent() {
  const prof = [[0, 4.2], [0.25, 4.0], [1.6, 2.6], [2.6, 1.8], [2.7, 0]].map(([r, y]) => new THREE.Vector2(r, y));
  return {
    cloth: merge([part(new THREE.LatheGeometry(prof, 16), (c, x, y) => c.set(y > 1.75 && y < 1.95 ? '#9c3b2a' : '#efe7d6'))]),
    wood: merge([part(limb([0, 4.0, 0], [0, 5.2, 0], 0.04), '#4a3626'), part(new THREE.BoxGeometry(0.02, 0.35, 0.6), '#b0342a', M(0, 5.0, 0.3))]),
  };
}

export function makeBarrel() {
  const prof = [[0, 0], [0.36, 0], [0.42, 0.45], [0.36, 0.9], [0, 0.9]].map(([r, y]) => new THREE.Vector2(r, y));
  return merge([part(new THREE.LatheGeometry(prof, 12), (c, x, y) => c.set(Math.abs(y - 0.2) < 0.04 || Math.abs(y - 0.7) < 0.04 ? '#2e2620' : '#7a5a3a'))]);
}

// people of the fair, in the dress of the plain: men in hats, white shirts and wide gatya or dark trousers and
// vests; women in full skirts, aprons and kerchiefs. Standing, facing -z (origin at the feet).
const SKIN = ['#b0785a', '#c08a68', '#a06a4c'];
export function makePerson(rng, sex = rng() < 0.5 ? 'm' : 'f', { white = false } = {}) {
  const p = [];
  const skin = SKIN[Math.floor(rng() * SKIN.length)];
  if (sex === 'm') {
    const gatya = rng() < 0.5;
    const legs = gatya ? '#ece6d8' : '#2a2724';
    for (const s of [1, -1]) {
      p.push(part(limb([0.11 * s, 0.05, 0], [0.12 * s, 0.85, 0], gatya ? 0.14 : 0.08, gatya ? 0.12 : 0.08), legs));
      p.push(part(new THREE.BoxGeometry(0.12, 0.12, 0.26), '#161311', M(0.11 * s, 0.06, -0.04)));
    }
    p.push(part(limb([0, 0.85, 0], [0, 1.45, 0], 0.18, 0.2, 10), '#ece6da'));
    if (rng() < 0.7) p.push(part(limb([0, 1.05, 0.01], [0, 1.45, 0.0], 0.195, 0.21, 10), rng() < 0.5 ? '#1f1d1c' : '#3a4e6e'));
    for (const s of [1, -1]) p.push(part(limb([0.22 * s, 1.42, 0], [0.26 * s, 0.95, -0.05], 0.06, 0.05), '#ece6da'));
    p.push(part(new THREE.SphereGeometry(0.11, 10, 8), skin, M(0, 1.6, -0.02, 0, 0, 0, 0.95, 1.1, 1)));
    p.push(part(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 14), '#1d1a17', M(0, 1.7, 0)));
    p.push(part(new THREE.CylinderGeometry(0.095, 0.11, 0.12, 10), '#1d1a17', M(0, 1.77, 0)));
  } else {
    const skirts = ['#9c3b2a', '#3e5a7a', '#5a3a5e', '#2e4a3a', '#b0842e'];
    const skirt = white ? '#efe9dc' : skirts[Math.floor(rng() * skirts.length)];
    const prof = [[0.0, 0.08], [0.42, 0.08], [0.36, 0.5], [0.24, 0.92], [0.0, 0.94]].map(([r, y]) => new THREE.Vector2(r, y));
    p.push(part(new THREE.LatheGeometry(prof, 14), skirt));
    if (!white) p.push(part(new THREE.BoxGeometry(0.4, 0.62, 0.05), '#ede6d4', M(0, 0.6, -0.31, -0.15, 0, 0)));      // the apron
    p.push(part(limb([0, 0.9, 0], [0, 1.4, 0], 0.17, 0.16, 10), white || rng() < 0.5 ? '#ece6da' : '#2a2724'));
    for (const s of [1, -1]) p.push(part(limb([0.19 * s, 1.36, 0], [0.22 * s, 0.98, -0.12], 0.055, 0.045), '#ece6da'));
    p.push(part(new THREE.SphereGeometry(0.11, 10, 8), skin, M(0, 1.53, -0.02, 0, 0, 0, 0.95, 1.1, 1)));
    p.push(part(new THREE.SphereGeometry(0.13, 10, 8), white || rng() < 0.5 ? '#f2ede2' : '#9c3b2a', M(0, 1.58, 0.02, 0, 0, 0, 1, 1, 1.05)));   // the kerchief
  }
  return merge(p);
}

/** a woman of the round dance under the cedar (Zarándoklás a cédrusokhoz): a long white robe to the ground, dark
 *  hair down her back, the arms flung out and up to her neighbours' hands (`reach` to the side, `lift` above the
 *  shoulder), the body leaning into the dance (`sway`). Facing -z, origin at the feet. */
export function makeDancer(rng, { reach = 0.8, lift = 0.45, sway = 0 } = {}) {
  const p = [];
  const robe = ['#f1ece0', '#ece5d6', '#f4efe6'][Math.floor(rng() * 3)], skin = SKIN[Math.floor(rng() * SKIN.length)];
  const hair = ['#4a2a1c', '#6a3520', '#2e211b'][Math.floor(rng() * 3)];
  const prof = [[0.0, 0.02], [0.46, 0.02], [0.41, 0.3], [0.28, 0.8], [0.2, 1.18], [0.17, 1.4], [0.0, 1.42]].map(([r, y]) => new THREE.Vector2(r, y));
  p.push(part(new THREE.LatheGeometry(prof, 14), (c, x, y) => c.set(robe).offsetHSL(0, 0, y < 0.22 ? -0.05 : 0)));
  for (const s of [1, -1]) {
    const sh = [0.16 * s, 1.36, 0], el = [(0.16 + reach * 0.45) * s, 1.36 + lift * 0.3, -0.04], hd = [reach * s, 1.36 + lift, 0];
    p.push(part(limb(sh, el, 0.08, 0.065, 7), robe));          // the wide sleeve
    p.push(part(limb(el, hd, 0.05, 0.04, 6), skin));
  }
  p.push(part(new THREE.SphereGeometry(0.115, 10, 8), skin, M(0, 1.56, -0.02, 0, 0, 0, 0.95, 1.1, 1)));
  p.push(part(new THREE.SphereGeometry(0.13, 10, 8), hair, M(0, 1.6, 0.035, 0, 0, 0, 1, 1, 1.05)));
  p.push(part(limb([0, 1.58, 0.08], [0, 1.2, 0.15], 0.1, 0.05, 7), hair));
  const g = merge(p);
  if (sway) g.applyMatrix4(M(0, 0, 0, 0, 0, sway));
  return g;
}

// ------------------------------------------------------------------- round three: more of his pictures

/** a tree in blossom (Tavasz Mosztárban, Mandulavirágzás): a dark, crooked trunk, a cloud of white or pink */
export function makeBlossomTree(rng, { pink = false, height = 6 } = {}) {
  const trunk = [], crown = [];
  const lean = (rng() - 0.5) * 0.8;
  trunk.push(part(limb([0, 0, 0], [lean, height * 0.5, 0.2], 0.22, 0.14, 7), '#3a2a22'));
  for (let i = 0; i < 4; i++) {
    const a = rng() * Math.PI * 2, r = 1 + rng() * 1.6;
    trunk.push(part(limb([lean, height * 0.45, 0.2], [lean + Math.cos(a) * r, height * (0.75 + rng() * 0.2), Math.sin(a) * r], 0.1, 0.04, 5), '#3a2a22'));
  }
  // the blossom: many small, loose dabs along the boughs, sky showing through — a haze, not a ball
  const cols = pink ? ['#d9a3ad', '#e6bcc0', '#c98d9a', '#e8d2cf'] : ['#e3ddd0', '#dad3c6', '#e8e1d6', '#cfc8bb'];
  for (let i = 0; i < 26; i++) {
    const a = rng() * Math.PI * 2, r = 0.4 + rng() * 2.4, s = 0.36 + rng() * 0.42;
    crown.push(part(new THREE.IcosahedronGeometry(1, 1), cols[Math.floor(rng() * cols.length)],
      M(lean + Math.cos(a) * r, height * (0.62 + rng() * 0.4), Math.sin(a) * r, rng() * 3, rng() * 3, 0, s * 1.3, s * 0.7, s)));
  }
  return { trunk: merge(trunk), crown: merge(crown) };
}

/** a dry stone wall (the terraces of Mandulavirágzás): length along x */
export function makeStoneWall(rng, len = 10, h = 0.8) {
  const p = [];
  for (let x = -len / 2; x < len / 2; x += 0.55) {
    for (let y = 0; y < h; y += 0.32) {
      const s = 0.42 + rng() * 0.2;
      p.push(part(new THREE.DodecahedronGeometry(0.5, 0), new THREE.Color('#b5a68c').offsetHSL(0, 0, (rng() - 0.5) * 0.12).getHex(),
        M(x + rng() * 0.2, y + 0.16, (rng() - 0.5) * 0.15, rng() * 3, rng() * 3, rng() * 3, s, s * 0.6, s * 0.8)));
    }
  }
  return merge(p);
}

/** a street lamp of the 1900s (Jajce, Castellammare): an iron post, a lamp on top — the bulb apart */
export function makeLampPost() {
  return merge([
    part(limb([0, 0, 0], [0, 4.2, 0], 0.07, 0.05, 6), '#26221f'),
    part(new THREE.CylinderGeometry(0.16, 0.12, 0.3, 6), '#26221f', M(0, 0.15, 0)),
    part(limb([0, 4.1, 0], [0.45, 4.35, 0], 0.03), '#26221f'),
  ]);
}
export const LAMP_BULB = [0.45, 4.15, 0];

/** the canvas cover of a wagon (Vihar a pusztán): hoops and a white tilt over the cart's bed (cart-local) */
export function makeWagonCover() {
  const p = [];
  const g = new THREE.CylinderGeometry(0.85, 0.85, 2.6, 14, 1, true, -Math.PI / 2, Math.PI);
  p.push(part(g, '#e6dcc4', M(0, 1.2, 0.25, -Math.PI / 2, 0, 0, 0.62, 1, 0.75)));
  for (const z of [-1.0, 0.25, 1.5]) p.push(part(new THREE.TorusGeometry(0.85, 0.035, 5, 16, Math.PI), '#4a3626', M(0, 1.2, z, 0, 0, 0, 0.62, 0.75, 1)));
  return merge(p);
}

/** a small round-arched stone bridge over a brook (Hídon átvonuló társaság), length along x */
// the arch's crown (spring + span/2) stays 0.75 m under the road's crown, so the vault never cuts the deck
export const FOOT_BRIDGE = { half: 7, ramp: 5, width: 4.2, base: 0.35, rise: 2.3, span: 7.0, spring: -1.6 };
export function footDeckY(lx) {
  const B = FOOT_BRIDGE, ax = Math.abs(lx);
  if (ax <= B.half) return B.base + B.rise * Math.cos((ax / B.half) * Math.PI / 2);
  if (ax <= B.half + B.ramp) return B.base * (1 - (ax - B.half) / B.ramp) + 0.2 * ((ax - B.half) / B.ramp);
  return 0;
}
export function makeFootBridge() {
  const B = FOOT_BRIDGE, L = B.half + B.ramp;
  const shape = new THREE.Shape();
  shape.moveTo(-L, -2.6);
  for (let x = -L; x <= L + 1e-6; x += 0.4) shape.lineTo(x, footDeckY(x));
  shape.lineTo(L, -2.6); shape.lineTo(-L, -2.6);
  const h = new THREE.Path();
  const R = B.span / 2;
  h.moveTo(-R, -2.4); h.lineTo(-R, B.spring); h.absarc(0, B.spring, R, Math.PI, 0, true); h.lineTo(R, -2.4); h.lineTo(-R, -2.4);
  shape.holes.push(holeOf(h));
  const body = new THREE.ExtrudeGeometry(shape, { depth: B.width, bevelEnabled: false, curveSegments: 16, steps: 1 });
  body.translate(0, 0, -B.width / 2);
  const stone = new THREE.Color('#c9bb9c');
  const bp = part(body, (c, x, y, z, i) => {
    const ny = body.attributes.normal.getY(i);
    c.copy(ny > 0.6 ? new THREE.Color('#a8987a') : stone).offsetHSL(0, 0, Math.sin(x * 2.1 + y * 3.0) * 0.03);
  });
  return merge([bp]);
}

/** a fishing boat with its lantern hook (Halászat Castellammaréban); length along z */
export function makeBoat() {
  const hull = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  return merge([
    part(hull, '#5a3a26', M(0, 0.35, 0, 0, 0, 0, 0.9, 0.55, 2.6)),
    part(new THREE.BoxGeometry(1.5, 0.08, 0.3), '#6f4a30', M(0, 0.38, 0.4)),
    part(limb([0, 0.35, -1.9], [0, 2.4, -2.3], 0.03), '#3a2a1e'),
  ]);
}
export const BOAT_LANTERN = [0, 2.3, -2.3];

/** a fisherman with his rod, standing (origin at the feet, facing -z) */
export function makeFisherman(rng) {
  return merge([
    part(limb([0.1, 0.0, 0], [0.1, 0.85, 0], 0.08), '#2a2724'), part(limb([-0.1, 0.0, 0], [-0.1, 0.85, 0], 0.08), '#2a2724'),
    part(limb([0, 0.85, 0], [0, 1.45, 0], 0.18, 0.2, 9), rng() < 0.5 ? '#3a4e6e' : '#5a4636'),
    part(new THREE.SphereGeometry(0.11, 10, 8), '#b0785a', M(0, 1.6, -0.02)),
    part(new THREE.CylinderGeometry(0.13, 0.14, 0.1, 10), '#2a2420', M(0, 1.72, 0)),
    part(limb([0.2, 1.3, -0.1], [0.25, 1.25, -0.5], 0.05), '#3a4e6e'),
    part(limb([0.25, 1.25, -0.5], [0.4, 3.6, -3.4], 0.02, 0.008, 4), '#4a3524'),
  ]);
}

/** a tall house of the shore (Castellammare): plastered pink or white, rows of tall windows, a flat roof */
export function makeShoreHouse(rng, { w = 9, d = 8, h = 13, color = '#e7b7a8' } = {}) {
  const walls = [part(new THREE.BoxGeometry(w, h, d), color, M(0, h / 2, 0)),
    part(new THREE.BoxGeometry(w + 0.4, 0.4, d + 0.4), '#c9b9a6', M(0, h + 0.2, 0))];
  const wood = [];
  for (let y = 2.2; y < h - 1; y += 3) for (let x = -w / 2 + 1.2; x < w / 2 - 0.6; x += 1.8) {
    wood.push(part(new THREE.BoxGeometry(0.75, 1.5, 0.06), '#3c3a3c', M(x, y, d / 2 + 0.02)));
    wood.push(part(new THREE.BoxGeometry(0.75, 1.5, 0.06), '#3c3a3c', M(x, y, -d / 2 - 0.02)));
  }
  return { walls: merge(walls), wood: merge(wood) };
}

/** a low power house (the electricity works at Jajce): brick, tall arched windows */
export function makePowerHouse() {
  const walls = [part(new THREE.BoxGeometry(12, 6, 8), '#b5654a', M(0, 3, 0)), part(new THREE.BoxGeometry(1.4, 9, 1.4), '#a5573e', M(4.5, 4.5, 2))];
  const roof = [part(new THREE.CylinderGeometry(0.1, 7.2, 2.4, 4, 1), '#4a4440', M(0, 7.2, 0, 0, Math.PI / 4, 0, 1.2, 1, 0.8))];
  return { walls: merge(walls), roof: merge(roof) };
}
export const POWERHOUSE_WINDOWS = [[-4, 2.6, 4.05], [-1.3, 2.6, 4.05], [1.4, 2.6, 4.05], [-4, 2.6, -4.05], [-1.3, 2.6, -4.05], [1.4, 2.6, -4.05]];
