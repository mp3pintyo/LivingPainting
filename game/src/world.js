// The world: Csontváry's Great Hortobágy and what lies round it, close together — a dream geography in one hand.
// From the opening viewpoint (0, 1.7…3.2, 0) looking north the world stands roughly where the painting has it: the
// river across the foreground, the nine-arched bridge coming in from the right to end in the middle, the herd
// drinking on the far bank, the storm on the left, the clearing on the right. Round it, within a few hundred metres:
//   east   the Hortobágyi csárda and the bridge fair (hídi vásár), by the great road
//   south  farmsteads (tanyák) with haystacks and well sweeps
//   north-east  a hill with the lonely cedar (A magányos cédrus, 1907) above a turquoise lake, the river's source
//   west   the river runs into a gorge: the town and one-arched bridge of Római híd Mosztárban (1903)
//   about  kunhalmok (the plain's old burial mounds) with a lone tree each, wells, herds, the horse herd
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { GLSL_COMMON, GLSL_SKY, paintMaterial, shared } from './paint.js';
import * as MD from './models.js';
import * as M2 from './models2.js';

export const WATER_Y = -0.45;
const GRID = { cx: 0, cz: -60, size: 1800, n: 600 };
export const WORLD_RADIUS = 520;
export const WORLD_CENTER = new THREE.Vector2(0, -60);

// ------------------------------------------------------------------- deterministic noise

function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------- layout

// bridges: where they stand, how the road runs over them (lx: metres along, from the middle)
const KB = MD.BRIDGE, MB = M2.MOSTAR_BRIDGE;
export const BRIDGES = [
  { id: 'kilenc', x: 32.7, z: -49.7, rotY: -0.9524, len: KB.half + KB.ramp, width: KB.width, wall: KB.half + KB.ramp * 0.75, deck: MD.bridgeDeckY },
  { id: 'mostar', x: -330, z: -50, rotY: 1.37, len: MB.half + MB.ramp, width: MB.width, wall: MB.half + 2, deck: M2.mostarDeckY },
  { id: 'patak', x: -120, z: 18, rotY: -3.0419, len: M2.FOOT_BRIDGE.half + M2.FOOT_BRIDGE.ramp, width: M2.FOOT_BRIDGE.width,
    wall: 0, deck: M2.footDeckY },
];
for (const b of BRIDGES) { b.c = Math.cos(b.rotY); b.s = Math.sin(b.rotY); }
export const BRIDGE_AT = BRIDGES[0];
/** world → bridge-local (x along the bridge, z across) */
export function toBridge(x, z, b = BRIDGES[0]) {
  const dx = x - b.x, dz = z - b.z;
  return { x: dx * b.c - dz * b.s, z: dx * b.s + dz * b.c };
}
export function fromBridge(lx, lz, b = BRIDGES[0]) {
  return { x: b.x + lx * b.c + lz * b.s, z: b.z - lx * b.s + lz * b.c };
}
const KW = fromBridge(-BRIDGES[0].len, 0, BRIDGES[0]);   // the nine-arched bridge's north-west end, on the far bank
const KE = fromBridge(BRIDGES[0].len, 0, BRIDGES[0]);    // its south-east end, on our bank
const MN = fromBridge(BRIDGES[1].len, 0, BRIDGES[1]);    // Mostar: the north end
const MS = fromBridge(-BRIDGES[1].len, 0, BRIDGES[1]);   //          the south end
export const BRIDGE_TOP = { ...fromBridge(0, 0), y: KB.crown };

// The opening view (the painter's eye): where a pixel of the scan (3421 × 1741) lands on the ground — or at height
// h above it. This puts the painting's own foreground figures where he painted them, so that while the scan gives
// way to the living scene, the two line up instead of showing double.
export const EYE = { y: 3.2, hfov: 66 * Math.PI / 180, aspect: 3421 / 1741, horizonV: 0.3906 };
EYE.tanH = Math.tan(EYE.hfov / 2); EYE.tanV = EYE.tanH / EYE.aspect;
EYE.pitch = Math.atan(-(1 - 2 * EYE.horizonV) * EYE.tanV);
export function paintingToGround(px, py, h = 0) {
  const x = (px / 3421) * 2 - 1, y = 1 - (py / 1741) * 2;
  const c = Math.cos(EYE.pitch), s = Math.sin(EYE.pitch);
  const dx = x * EYE.tanH, dy = s + y * EYE.tanV * c, dz = -c + y * EYE.tanV * s;
  const t = (h - EYE.y) / dy;
  return { x: dx * t, z: dz * t };
}
// the painting's foreground, in scan pixels: the feet of each beast (the middle of the body), its facing, size
export const PAINTED = {
  cattle: [
    { px: 690, py: 1730, yaw: 2.25, s: 1.05 },     // the great ox on the left, head turned to us
    { px: 1000, py: 1722, yaw: -1.75, s: 1.0 },    // the cow in the middle, walking right
    { px: 1110, py: 1700, yaw: -1.6, s: 0.48 },    // her calf
    { px: 1500, py: 1714, yaw: -2.55, s: 1.05 },   // the ox on the right, head to us
  ],
  dog: { px: 2810, py: 1515, yaw: 1.4 },
  herdsman: { px: 190, py: 1390, h: 1.62, yaw: 0.35 },   // his face
};

export const LAKE = { x: 438, z: -236, rx: 100, rz: 80 };
export const GORGE = { x: -330, z: -50, r: 110, fall: 70, h: 9 };
export const CEDAR_HILL = { x: 300, z: -108, r: 66, h: 20 };
// the mountain behind Mostar (Római híd Mosztárban): a dark blue-violet mass, its sunlit flank salmon-pink; beyond
// the world's rim, so that from where he stood (up the river, looking down it) it rises right behind the bridge and
// its tower and fills the picture's top, as on his canvas; the river turns south round its foot
export const MOUNTAIN = { x: -560, z: -215, r: 105, h: 160 };
// Mostar's left bank climbs: on his canvas the houses are stacked up a slope to the round tower
export const MOSTAR_HILL = { x: -337, z: 10, r: 24, h: 11 };
export function mountainH(x, z) {
  const d = Math.hypot(x - MOUNTAIN.x, z - MOUNTAIN.z);
  const r = MOUNTAIN.r * (0.88 + 0.24 * noise2(x / 70 + 13, z / 70));
  return MOUNTAIN.h * Math.exp(-((d / r) ** 2.6)) * (0.92 + 0.16 * noise2(x / 18, z / 18));
}
// a point on the lake's shore at angle a (its own wobble included), `off` metres out from the water (negative: in it)
export function shorePoint(a, off = 0) {
  const rr = 1 + 0.08 * Math.sin(a * 3 + 1) + 0.05 * Math.sin(a * 7);
  const k = 1 + off / ((LAKE.rx + LAKE.rz) / 2);
  return { x: LAKE.x + Math.cos(a) * LAKE.rx * rr * k, z: LAKE.z + Math.sin(a) * LAKE.rz * rr * k };
}
// the shore promenade (Halászat Castellammaréban, Sétalovaglás a tengerparton): along the lake's south side
export const SHORE = { a0: 2.3, a1: 0.9 };
const shoreLine = (off, n = 10) => Array.from({ length: n + 1 }, (_, i) => { const p = shorePoint(SHORE.a0 + (SHORE.a1 - SHORE.a0) * (i / n), off); return [p.x, p.z]; });
// the brook that comes down from the south to the river, west of the painting's view
const BROOK = [[-150, 212, 3], [-140, 140, 3], [-128, 80, 3.2], [-121, 30, 3.5], [-118, -5, 4], [-112, -30, 6]];
export const MOUNDS = [{ x: -236, z: -170, r: 22, h: 5 }, { x: 22, z: 252, r: 20, h: 4.5 }, { x: -192, z: 72, r: 24, h: 5.5 }];

// the river: x, z, half-width. It rises in the lake, runs south-west to the flood the nine-arched bridge stands
// in, passes under it, runs west across the painting's foreground, and enters the gorge at Mostar.
const RIVER = [
  [370, -232, 10], [320, -224, 11], [262, -212, 12], [200, -186, 13], [148, -148, 15], [112, -112, 19], [82, -85, 24], [56, -60, 27],
  [36.2, -44.8, 29], [12, -26, 14], [-15, -19, 9.5], [-50, -22, 11], [-110, -35, 13], [-170, -40, 13], [-230, -42, 11],
  [-280, -42, 12], [-330, -50, 13], [-380, -66, 12], [-430, -95, 11], [-462, -78, 11], [-500, -30, 12], [-570, 50, 12], [-800, 250, 12], [-1100, 480, 12],
];
// the roads
const ROADS = [
  [[KW.x, KW.z], [-60, -150], [-160, -170], [-260, -140], [-318, -98], [MN.x, MN.z]],         // the great road, west to Mostar
  [[KE.x, KE.z], [110, 40], [200, 70], [330, 95], [520, 100]],                                    // and east, past the csárda
  [[-80, 14], [-20, 11], [20, 10], [55, 15], [KE.x + 3, KE.z + 3]],                               // the track the cart starts on
  [[-80, 14], [-160, 22], [-250, 8], [-300, -8], [MS.x, MS.z]],                                    // along our bank to Mostar
  [[55, 15], [80, 110], [110, 190], [150, 262]],                                                   // south to the farms
  [[200, 70], [258, 18], [292, -62], [298, -104]],                                                  // up to the cedar
  [[298, -104], [340, -150], [352, -176]],                                                          // down to the lake shore
  [[-160, -170], [-182, -262], [-150, -335]],                                                       // to the horse herd
  [[-160, 22], [-205, 110]],                                                                        // to the south-west mound
  [[KW.x, KW.z], [20, -200], [-30, -300]],                                                          // north, across the far plain
  [[352, -176], ...shoreLine(12)],                                                                  // the promenade by the lake
];

function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
  const x = ax + dx * t - px, z = az + dz * t - pz;
  return [Math.sqrt(x * x + z * z), t];
}
function lineEdge(line, x, z) {
  let best = 1e9;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1];
    const [d, t] = segDist(x, z, a[0], a[1], b[0], b[1]);
    const e = d - (a[2] + (b[2] - a[2]) * t);
    if (e < best) best = e;
  }
  return best;
}
function lakeEdge(x, z) {
  const dx = (x - LAKE.x) / LAKE.rx, dz = (z - LAKE.z) / LAKE.rz;
  const a = Math.atan2(dz, dx);
  const q = Math.sqrt(dx * dx + dz * dz) / (1 + 0.08 * Math.sin(a * 3 + 1) + 0.05 * Math.sin(a * 7));
  return (q - 1) * Math.min(LAKE.rx, LAKE.rz);
}
/** how far outside the water (negative: in it): the river or the lake */
export function riverEdge(x, z) {
  return Math.min(lakeEdge(x, z), lineEdge(RIVER, x, z), lineEdge(BROOK, x, z));
}
export function roadDist(x, z) {
  let best = 1e9;
  for (const r of ROADS) for (let i = 0; i < r.length - 1; i++) {
    const [d] = segDist(x, z, r[i][0], r[i][1], r[i + 1][0], r[i + 1][1]);
    if (d < best) best = d;
  }
  return best;
}
export function gorgeW(x, z) { return smooth(GORGE.r + GORGE.fall, GORGE.r, Math.hypot(x - GORGE.x, z - GORGE.z)); }

/** the land's own height (no bridges) */
export function terrainH(x, z, e = riverEdge(x, z), rd = roadDist(x, z)) {
  let h = 0.15 + 0.32 * noise2(x / 230 + 7, z / 230) + 0.1 * noise2(x / 45 + 3, z / 45);
  // the cedar's hill and the mounds
  const hd = Math.hypot(x - CEDAR_HILL.x, z - CEDAR_HILL.z);
  h += CEDAR_HILL.h * Math.exp(-((hd / CEDAR_HILL.r) ** 2)) * (1 + 0.08 * noise2(x / 20, z / 20));
  for (const m of MOUNDS) h += m.h * Math.exp(-((Math.hypot(x - m.x, z - m.z) / m.r) ** 2));
  h += mountainH(x, z);
  h += MOSTAR_HILL.h * Math.exp(-((Math.hypot(x - MOSTAR_HILL.x, z - MOSTAR_HILL.z) / MOSTAR_HILL.r) ** 2));
  // the plateau the gorge is cut into
  const g = gorgeW(x, z);
  h += g * (GORGE.h + 1.2 * noise2(x / 25, z / 25));
  // roads are worn into the ground (not on the hills)
  h = h + (Math.min(h, 0.2 + g * GORGE.h) - h) * smooth(6, 2, rd) * (1 - smooth(1, 4, h - 0.6 - g * GORGE.h));
  // the bridges' approaches are levelled
  for (const b of BRIDGES) {
    const bl = toBridge(x, z, b);
    if (Math.abs(bl.z) < b.width + 4 && Math.abs(bl.x) < b.len + 10 && b.id === 'kilenc') h = h + (0.1 - h) * 0.8;
  }
  // the river's bed: gentle banks on the plain, sheer walls in the gorge
  const s = g > 0.5 ? smooth(9, 0.5, e) : smooth(4, -4, e);
  h = h * (1 - s) - 2.4 * s;
  // at Mostar the banks are built up to the bridge's ends: quays at the road's height, no step onto the bridge
  const mb = BRIDGES[1], ml = toBridge(x, z, mb);
  const w = smooth(mb.len + 16, mb.len + 3, Math.abs(ml.x)) * smooth(mb.width / 2 + 9, mb.width / 2 + 3, Math.abs(ml.z)) * smooth(1.5, 7, e) * smooth(MB.span / 2 - 1, MB.span / 2 + 4, Math.abs(ml.x));
  if (w > 0) h += (MB.base - h) * w;
  return h;
}

// the heights the ground mesh is drawn with (its grid's vertices): what stands on the ground stands on the drawn
// triangles, not on the smooth function between them (on a curved bank the two differ by a hand's breadth)
let GRID_H = null;
/** the drawn ground's height: the grid's own triangle at (x, z) (the smooth function outside the grid) */
export function meshH(x, z) {
  if (!GRID_H) return terrainH(x, z);
  const { cx, cz, size, n } = GRID, step = size / n, N1 = n + 1;
  const gx = (x - (cx - size / 2)) / step, gz = (z - (cz - size / 2)) / step;
  const i = Math.floor(gx), j = Math.floor(gz);
  if (i < 0 || j < 0 || i >= n || j >= n) return terrainH(x, z);
  const u = gx - i, v = gz - j;
  const a = GRID_H[j * N1 + i], b = GRID_H[j * N1 + i + 1], c = GRID_H[(j + 1) * N1 + i], d = GRID_H[(j + 1) * N1 + i + 1];
  // the quad is cut along b–c, as the index buffer cuts it
  return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
}

/** where a wheel or a hoof stands: the drawn land, or the road over a bridge */
export function groundY(x, z) {
  const h = meshH(x, z);
  for (const b of BRIDGES) {
    const bl = toBridge(x, z, b);
    if (Math.abs(bl.z) < b.width / 2 - (b.wall ? 0.4 : -0.1) && Math.abs(bl.x) < b.len) return Math.max(h, b.deck(bl.x));
  }
  return h;
}

// ------------------------------------------------------------------- the ground

function buildGround(mat) {
  const { cx, cz, size, n } = GRID;
  const step = size / n, N1 = n + 1;
  const pos = new Float32Array(N1 * N1 * 3), col = new Float32Array(N1 * N1 * 3), surf = new Float32Array(N1 * N1 * 3);
  // his plain is fresh and light: yellow-green, pale green, warm straw where it dries
  const lush = new THREE.Color('#7b9a3e'), pale = new THREE.Color('#b9c47e'), dry = new THREE.Color('#c2ad66');
  const bank = new THREE.Color('#4f7032'), far = new THREE.Color('#adbd74'), rock = new THREE.Color('#8f8a78'), paving = new THREE.Color('#cdc4b3'), c = new THREE.Color();
  const H = new Float32Array(N1 * N1);
  for (let j = 0; j < N1; j++) for (let i = 0; i < N1; i++) {
    const x = cx - size / 2 + i * step, z = cz - size / 2 + j * step;
    const e = riverEdge(x, z), rd = roadDist(x, z);
    const h = terrainH(x, z, e, rd);
    const k = (j * N1 + i) * 3;
    H[j * N1 + i] = h;
    pos[k] = x; pos[k + 1] = h; pos[k + 2] = z;
    const n1 = noise2(x / 160 + 1, z / 160), n2 = noise2(x / 37 + 11, z / 37), n3 = noise2(x / 9, z / 9 + 5);
    c.copy(lush).lerp(pale, smooth(0.25, 0.8, n1));
    c.lerp(dry, smooth(0.6, 0.85, n2) * 0.55);
    c.lerp(far, smooth(60, 300, -z) * 0.3);
    c.lerp(bank, smooth(14, 2, e) * 0.6);
    // Mostar stands on pale stone, not on grass: paved streets and quays round the bridge
    const pv = smooth(84, 56, Math.hypot(x - BRIDGES[1].x, z - BRIDGES[1].z) + 14 * (n2 - 0.5)) * smooth(0.45, 0.85, gorgeW(x, z));
    if (pv > 0) c.lerp(paving, pv * (0.8 + 0.2 * n3));
    c.offsetHSL(0, 0, (n3 - 0.5) * 0.04);
    col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
    const road = smooth(3.4, 1.8, rd);
    surf[k] = road;
    surf[k + 1] = smooth(3.0, 0.2, e) * (1 - road);
    surf[k + 2] = smooth(0.74, 0.8, noise2(x / 70 + 40, z / 70)) * smooth(6, 20, e) * 0.6;
  }
  // steep ground is bare rock: the gorge's walls
  for (let j = 1; j < n; j++) for (let i = 1; i < n; i++) {
    const gx = (H[j * N1 + i + 1] - H[j * N1 + i - 1]) / (2 * step), gz = (H[(j + 1) * N1 + i] - H[(j - 1) * N1 + i]) / (2 * step);
    const slope = Math.hypot(gx, gz);
    const t = smooth(0.7, 1.5, slope);
    if (t > 0) {
      const k = (j * N1 + i) * 3;
      c.setRGB(col[k], col[k + 1], col[k + 2]).lerp(rock, t);
      col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
      surf[k] = 0; surf[k + 1] = 0; surf[k + 2] = 0;
    }
  }
  // the mountain: his dark blue-violet, the flank toward the low sun salmon-pink, streaked down the slope;
  // round the cedar the ground is his red earth
  // (A magányos cédrus: dark crimson and maroon earth, a ridge of ochre between them, vermilion at the tree's foot)
  const indigo = new THREE.Color('#38395f'), violet = new THREE.Color('#4d4a72'), salmon = new THREE.Color('#c98466'), m2 = new THREE.Color();
  const crimson = new THREE.Color('#7c2f26'), maroon = new THREE.Color('#472420'), ochre = new THREE.Color('#c4a567'), vermilion = new THREE.Color('#b23f27');
  // what rises from the plain is hatched along its form (paint.js): round a hill's middle, slanting down the mountain
  const hillC = new Float32Array(N1 * N1 * 2), hillW = new Float32Array(N1 * N1 * 3);
  const rises = [{ x: CEDAR_HILL.x, z: CEDAR_HILL.z, r: CEDAR_HILL.r * 1.7 }, ...MOUNDS.map((m) => ({ x: m.x, z: m.z, r: m.r * 1.9 })),
    { x: GORGE.x, z: GORGE.z, r: GORGE.r + GORGE.fall + 12, rim: true }];
  for (let j = 1; j < n; j++) for (let i = 1; i < n; i++) {
    const x = cx - size / 2 + i * step, z = cz - size / 2 + j * step, k = (j * N1 + i) * 3, v = j * N1 + i;
    const gx = (H[v + 1] - H[v - 1]) / (2 * step), gz = (H[v + N1] - H[v - N1]) / (2 * step);
    const gl = Math.hypot(gx, gz) + 1e-6;
    const mw = smooth(5, 22, mountainH(x, z));
    let near = rises[0], nd = 1e9;
    for (const h of rises) { const d = Math.hypot(x - h.x, z - h.z) / h.r; if (d < nd) { nd = d; near = h; } }
    hillC[v * 2] = near.x; hillC[v * 2 + 1] = near.z;
    const rim = near.rim ? smooth(0.02, 0.1, gorgeW(x, z)) * smooth(0.99, 0.9, gorgeW(x, z)) : 1;   // the plateau's outer slope only
    hillW[k] = (nd < 1 ? 1 : 0) * rim * smooth(0.035, 0.1, gl) * smooth(0.9, 0.6, gl) * (1 - mw);
    hillW[k + 1] = mw;
    const cd = Math.hypot(x - CEDAR_HILL.x - 6, z - CEDAR_HILL.z + 4), re = smooth(74, 42, cd) * 0.95;
    if (mw <= 0 && re <= 0) continue;
    c.setRGB(col[k], col[k + 1], col[k + 2]);
    if (mw > 0) {
      const lit = smooth(-0.1, 0.7, (-gx * 0.6 + gz * 0.8) / gl) * smooth(0.15, 0.6, gl);
      hillW[k + 2] = lit * (0.8 + 0.2 * noise2(x / 40 + 3, z / 40));
      m2.copy(indigo).lerp(violet, noise2(x / 9, z / 30)).lerp(salmon, lit * (0.75 + 0.25 * noise2(x / 5 + 3, z / 22)));
      c.lerp(m2, mw);
      surf[k] *= 1 - mw; surf[k + 1] *= 1 - mw; surf[k + 2] *= 1 - mw;
    }
    if (re > 0) {
      // rings round the tree, their edges wandering: vermilion under it, crimson, the ochre ridge, maroon below
      const rr = cd + 9 * (noise2(x / 22 + 5, z / 22) - 0.5) + 5 * (noise2(x / 7, z / 7 + 2) - 0.5);
      m2.copy(vermilion).lerp(crimson, smooth(6, 11, rr)).lerp(ochre, smooth(27, 30, rr) * smooth(37, 34, rr)).lerp(maroon, smooth(35, 44, rr));
      c.lerp(m2, re); surf[k + 2] *= 1 - re;
    }
    col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
  }
  const idx = new Uint32Array(n * n * 6);
  let q = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = j * N1 + i, b = a + 1, c2 = a + N1, d = c2 + 1;
    idx[q++] = a; idx[q++] = c2; idx[q++] = b; idx[q++] = b; idx[q++] = c2; idx[q++] = d;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSurf', new THREE.BufferAttribute(surf, 3));
  g.setAttribute('aHillC', new THREE.BufferAttribute(hillC, 2));
  g.setAttribute('aHillW', new THREE.BufferAttribute(hillW, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  GRID_H = H;
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  return mesh;
}

// the plain beyond, to the horizon: coarse, around the detailed square
function buildFar(mat) {
  const step = 60, R = 5400;
  const { cx, cz, size } = GRID;
  const x0 = cx - R, z0 = cz - R, n = Math.round((2 * R) / step), N1 = n + 1;
  const pos = new Float32Array(N1 * N1 * 3), col = new Float32Array(N1 * N1 * 3), surf = new Float32Array(N1 * N1 * 3);
  const far = new THREE.Color('#adbd74'), c = new THREE.Color();
  for (let j = 0; j < N1; j++) for (let i = 0; i < N1; i++) {
    const x = x0 + i * step, z = z0 + j * step, k = (j * N1 + i) * 3;
    pos[k] = x; pos[k + 1] = 0.15 + 0.32 * noise2(x / 230 + 7, z / 230) + 0.1 * noise2(x / 45 + 3, z / 45); pos[k + 2] = z;
    c.copy(far).offsetHSL(0, 0, (noise2(x / 300, z / 300) - 0.5) * 0.08);
    col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
  }
  const inside = (x, z) => x > cx - size / 2 && x < cx + size / 2 && z > cz - size / 2 && z < cz + size / 2;
  const idx = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    if (inside(x0 + (i + 0.5) * step, z0 + (j + 0.5) * step)) continue;
    const a = j * N1 + i, b = a + 1, c2 = a + N1, d = c2 + 1;
    idx.push(a, c2, b, b, c2, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSurf', new THREE.BufferAttribute(surf, 3));
  g.setAttribute('aHillC', new THREE.BufferAttribute(new Float32Array(N1 * N1 * 2), 2));
  g.setAttribute('aHillW', new THREE.BufferAttribute(new Float32Array(N1 * N1 * 3), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  return mesh;
}

// ------------------------------------------------------------------- the water

const WATER_SHADER = {
  name: 'PaintedWater',
  uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null } },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec3 vWorld;
    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorld = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`,
  fragmentShader: /* glsl */ `
    ${GLSL_COMMON}
    ${GLSL_SKY}
    uniform vec3 color;
    uniform sampler2D tDiffuse;
    uniform float uFogDensity;
    uniform float uFogStart;
    uniform vec3 uWaterDeep;
    uniform vec3 uWaterLight;
    uniform vec3 uTurqDeep;
    uniform vec3 uTurqLight;
    uniform vec4 uLake;      // x, z, radius: the lake is turquoise, as his seas are
    uniform vec4 uGorge;     // and so is the river in the gorge (Mostar)
    varying vec4 vUv;
    varying vec3 vWorld;
    void main() {
      vec3 V = cameraPosition - vWorld;
      float dist = length(V); V /= dist;
      // his water is almost still: the reflections are drawn down in soft vertical smears, ghostly, a faint
      // level ripple crossing them now and then
      float rip = (vnoise(vec2(vWorld.x * 0.08, vWorld.z * 1.4 + uTime * 0.3)) - 0.5);
      vec4 uvp = vUv;
      uvp.x += rip * 0.004 * uvp.w;
      float turq = max(1.0 - smoothstep(uLake.z * 0.7, uLake.z * 1.5, length(vWorld.xz - uLake.xy)),
                       1.0 - smoothstep(uGorge.z * 0.5, uGorge.z * 1.2, length(vWorld.xz - uGorge.xy)));
      // (his turquoise water is opaque, milky paint: what it mirrors is fainter there and drawn further down)
      vec3 refl = vec3(0.0);
      for (int k = -3; k <= 3; k++) {
        vec4 u2 = uvp;
        u2.y += float(k) * 0.006 * (1.0 + 1.8 * turq) * uvp.w;
        refl += textureProj(tDiffuse, u2).rgb;
      }
      refl /= 7.0;
      float mott = fbm3(vWorld.xz * vec2(0.02, 0.08));
      struct D { float id; float mask; } d;
      d.id = mott; d.mask = 0.6 + 0.4 * smoothstep(0.55, 0.75, vnoise(vec2(vWorld.x * 0.05, vWorld.z * 0.9)));
      float fres = 0.2 + 0.8 * pow(1.0 - max(V.y, 0.0), 4.0);
      vec3 deep = mix(mix(uWaterDeep, uTurqDeep, turq), mix(uWaterLight, uTurqLight, turq), d.id * 0.8);
      // his water is dark and green-blue; what it mirrors comes through darkened and tinted by it
      vec3 col = mix(deep, refl * mix(vec3(0.55, 0.7, 0.72), vec3(0.6, 0.85, 0.85), turq), clamp(0.25 + fres * 0.55 - turq * 0.3, 0.0, 0.8));
      col *= mix(0.92, 1.04, d.mask);
      float fog = 1.0 - exp(-max(dist - uFogStart, 0.0) * uFogDensity);
      col = mix(col, hazeColor(-V), clamp(fog, 0.0, 1.0));
      gl_FragColor = vec4(col, 1.0);
    }`,
};

function buildWater(w, h) {
  const geo = new THREE.PlaneGeometry(GRID.size, GRID.size);
  const water = new Reflector(geo, { textureWidth: w, textureHeight: h, clipBias: 0.01, shader: WATER_SHADER, color: 0xffffff });
  const u = water.material.uniforms;
  for (const k of Object.keys(shared)) u[k] = shared[k];
  u.uWaterDeep = { value: new THREE.Color('#0d2a31') };
  u.uWaterLight = { value: new THREE.Color('#24505a') };
  u.uTurqDeep = { value: new THREE.Color('#0f6f73') };
  u.uTurqLight = { value: new THREE.Color('#3fb4ad') };
  u.uLake = { value: new THREE.Vector4(LAKE.x, LAKE.z, (LAKE.rx + LAKE.rz) / 2, 0) };
  u.uGorge = { value: new THREE.Vector4(GORGE.x, GORGE.z, GORGE.r, 0) };
  water.rotation.x = -Math.PI / 2;
  water.position.set(GRID.cx, WATER_Y, GRID.cz);
  return water;
}

// falling water: white streaks running down a curved sheet
const FALL_MAT = () => new THREE.ShaderMaterial({
  uniforms: { uTime: shared.uTime },
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    ${GLSL_COMMON}
    uniform float uTime;
    varying vec2 vUv;
    void main() {
      // ragged sides and lip; ropes of white water over the turquoise, the rock showing through between them
      float edge = min(vUv.x, 1.0 - vUv.x);
      float rag = vnoise(vec2(vUv.y * 6.0, 3.0)) * 0.18 + vnoise(vec2(vUv.x * 9.0, 7.0)) * 0.06;
      if (edge < rag * 0.7 || vUv.y > 0.97 - vnoise(vec2(vUv.x * 7.0, 1.0)) * 0.08) discard;
      float s = vnoise(vec2(vUv.x * 14.0, vUv.y * 2.2 + uTime * 1.6)) * 0.6 + vnoise(vec2(vUv.x * 34.0, vUv.y * 4.0 + uTime * 2.6)) * 0.4;
      float rope = smoothstep(0.38, 0.62, s);
      if (rope < 0.15 && vnoise(vec2(vUv.x * 22.0, vUv.y * 3.0)) < 0.35) discard;
      vec3 c = mix(vec3(0.16, 0.42, 0.42), vec3(0.93, 0.96, 0.94), rope);
      c *= 0.82 + 0.18 * vUv.y;
      gl_FragColor = vec4(c, 1.0);
    }`,
  side: THREE.DoubleSide,
});

// ------------------------------------------------------------------- building it

class Batch {
  constructor() { this.parts = {}; }
  add(key, geo, m) {
    if (!geo) return;
    const g = geo.clone();
    if (m) g.applyMatrix4(m);
    (this.parts[key] ||= []).push(g);
  }
  build(mats, group) {
    for (const [key, list] of Object.entries(this.parts)) {
      const mesh = new THREE.Mesh(MD.merge(list), mats[key]);
      mesh.name = key;
      group.add(mesh);
    }
  }
}

function rotXZ(x, z, rot) { const c = Math.cos(rot), s = Math.sin(rot); return { x: x * c + z * s, z: -x * s + z * c }; }
function M4(x, y, z, rotY = 0, s = 1) { return MD.M(x, y, z, 0, rotY, 0, s); }

export function buildWorld(scene, { reflW = 512, reflH = 512 } = {}) {
  const group = new THREE.Group();
  scene.add(group);
  const mats = {
    ground: paintMaterial('ground', 0xffffff, { vertexColors: true, surf: true }),
    brick: paintMaterial('brick', 0xffffff, { vertexColors: true }),
    stone: paintMaterial('brick', 0xffffff, { vertexColors: true, palette: 'hide', palAmt: 0.06 }),
    wall: paintMaterial('wall', 0xffffff, { vertexColors: true }),
    roof: paintMaterial('roof', 0xffffff, { vertexColors: true, side: THREE.DoubleSide }),
    tile: paintMaterial('roof', 0xffffff, { vertexColors: true, side: THREE.DoubleSide, palette: 'brick', stroke: 0.3 }),
    wood: paintMaterial('wood', 0xffffff, { vertexColors: true, world: true }),
    cloth: paintMaterial('cloth', 0xffffff, { vertexColors: true, world: true }),
    beastStatic: paintMaterial('beast', 0xffffff, { vertexColors: true, world: true }),
    trunk: paintMaterial('trunk', 0xffffff, { vertexColors: true, world: true }),
    leaf: paintMaterial('leaf', 0xffffff, { vertexColors: true }),
    // the cedar's own: his colours kept (pale roots, white dry branch, dark needles), every needle stroke whole
    cedarBark: paintMaterial('trunk', 0xffffff, { vertexColors: true, world: true, palAmt: 0.03, gap: 0.95 }),
    cedarNeedles: paintMaterial('leaf', 0xffffff, { vertexColors: true, palAmt: 0.04, gap: 0.97, side: THREE.DoubleSide }),
  };

  // the mountain's hatching slants as it is seen from the town: across the line from Mostar's bridge to its top
  { const dx = MOUNTAIN.x - BRIDGES[1].x, dz = MOUNTAIN.z - BRIDGES[1].z, l = Math.hypot(dx, dz); shared.uMtnAcross.value.set(-dz / l, dx / l); }
  group.add(buildGround(mats.ground));
  group.add(buildFar(mats.ground));
  const water = buildWater(reflW, reflH);
  group.add(water);

  const batch = new Batch();
  const colliders = [];   // { x, z, r } circles and { x, z, hw, hd, rot } boxes
  const R = rng(1903);
  const H = (x, z) => meshH(x, z);       // (the drawn ground: what stands on it, stands on its triangles)
  const free = (x, z, road = 4, river = 6) => riverEdge(x, z) > river && roadDist(x, z) > road;
  const recolor = (geo, hexes) => {
    const c = geo.attributes.color, col = new THREE.Color();
    for (let i = 0; i < c.count; i++) { col.set(hexes[Math.floor(R() * hexes.length)]); c.setXYZ(i, col.r, col.g, col.b); }
    return geo;
  };

  // ---- the bridges
  const K = BRIDGES[0], Mo = BRIDGES[1];
  batch.add('brick', MD.makeBridge(), M4(K.x, 0, K.z, K.rotY));
  batch.add('ground', MD.makeBridgeBanks(), M4(K.x, 0, K.z, K.rotY));      // the grass banks of its approaches
  batch.add('stone', M2.makeMostarBridge(), M4(Mo.x, 0, Mo.z, Mo.rotY));

  // ---- houses: the csárda, the farmsteads (whitewashed, reed-roofed)
  const csarda = MD.makeHouse({ w: 26, d: 10, h: 3.0, roofH: 5.2, porch: true, chimneys: 2 });
  const farms = [
    { x: 122, z: 66, rot: -0.29, house: csarda },
    { x: 62, z: 142, rot: 0.25, w: 14 }, { x: 132, z: 214, rot: -0.15, w: 13 }, { x: 186, z: 268, rot: 0.4, w: 12 },
    { x: -46, z: 196, rot: 1.35, w: 13 }, { x: -330, z: -236, rot: 0.9, w: 12 }, { x: -262, z: 86, rot: 0.1, w: 14 },
    { x: 252, z: 64, rot: -0.5, w: 12 }, { x: 196, z: -262, rot: 0.7, w: 11 },
  ];
  for (const h of farms) {
    const geo = h.house || MD.makeHouse({ w: h.w, d: 6.5, h: 2.6, roofH: 3.6, porch: R() < 0.6, chimneys: 1 });
    const m = M4(h.x, H(h.x, h.z) - 0.1, h.z, h.rot);
    batch.add('wall', geo.walls, m); batch.add('roof', geo.roof, m); batch.add('wood', geo.wood, m);
    const w = h.house ? 26 : h.w, d = h.house ? 10 : 6.5;
    colliders.push({ x: h.x, z: h.z, hw: w / 2 + 0.8, hd: d / 2 + 1.6, rot: h.rot });
    if (!h.house) {
      for (let i = 0; i < 3; i++) {
        const a = R() * Math.PI * 2, r = 14 + R() * 12;
        const hx = h.x + Math.cos(a) * r, hz = h.z + Math.sin(a) * r;
        if (!free(hx, hz, 4, 6)) continue;
        batch.add('roof', MD.makeHaystack(), M4(hx, H(hx, hz) - 0.05, hz, R() * 6, 0.85 + R() * 0.3));
        colliders.push({ x: hx, z: hz, r: 1.9 });
      }
    }
  }

  // ---- trees
  const inPainting = (x, z) => z < 0 && Math.abs(x) < -z * 0.75 && -z < 700;
  const addTree = (x, z, opts) => {
    if (!free(x, z, 3.5, 5) || inPainting(x, z)) return;
    const t = MD.makeTree(R, opts);
    const m = M4(x, H(x, z) - 0.1, z, R() * 6);
    batch.add('trunk', t.trunk, m); batch.add('leaf', t.crown, m);
    colliders.push({ x, z, r: 0.8 });
  };
  for (const h of farms) for (let i = 0; i < 3; i++) {
    const a = R() * Math.PI * 2, r = 12 + R() * 14;
    addTree(h.x + Math.cos(a) * r, h.z + Math.sin(a) * r, { height: 8 + R() * 5, spread: 3 + R() * 2, poplar: R() < 0.3 });
  }
  for (let i = 0; i < 8; i++) addTree(160 + i * 24, 66 + i * 2.6 + 9, { height: 15 + R() * 4, spread: 2.6, poplar: true });
  for (const m of MOUNDS) addTree(m.x + 1, m.z - 1, { height: 9 + R() * 3, spread: 4.2 });
  // willows along the river's banks
  for (let i = 0; i < 26; i++) {
    const seg = RIVER[3 + Math.floor(R() * 12)];
    const a = R() * Math.PI * 2, x = seg[0] + Math.cos(a) * (seg[2] + 8), z = seg[1] + Math.sin(a) * (seg[2] + 8);
    if (riverEdge(x, z) < 3 || riverEdge(x, z) > 12 || gorgeW(x, z) > 0.2) continue;
    if (Math.hypot(x, z) < 40) continue;       // keep the painting's own view open
    addTree(x, z, { height: 7 + R() * 3, spread: 3.2 + R() * 1.5 });
  }

  // ---- the lonely cedar on its hill
  // (its long limbs sweep west: coming up the road from the south, one sees it as he painted it, the lake behind)
  const CX = CEDAR_HILL.x + 6, CZ = CEDAR_HILL.z - 4;
  const cedar = M2.makeCedar(R);
  const cm = M4(CX, H(CX, CZ) - 0.4, CZ, 0, 1.2);
  batch.add('cedarBark', cedar.trunk, cm); batch.add('cedarNeedles', cedar.crown, cm);
  colliders.push({ x: CX, z: CZ, r: 3.2 });
  // the women in white, dancing round it hand in hand (Zarándoklás a cédrusokhoz): a chain flung into the dance on
  // the side one comes up from, a stiller one beyond it, their hands level; each faces out from the tree
  const chain = (r, a0, n, lift, swing) => {
    for (let i = 0; i < n; i++) {
      const a = a0 + i * (1.6 / r), x = CX + Math.cos(a) * r, z = CZ + Math.sin(a) * r;
      if (roadDist(x, z) < 2.4) continue;
      const sway = swing * ((i % 2 ? 1 : -1) * 0.07 + (R() - 0.5) * 0.08);
      batch.add('cloth', M2.makeDancer(R, { lift: lift + (R() - 0.5) * 0.1 * swing, sway }), M4(x, H(x, z) - 0.03, z, Math.atan2(-Math.cos(a), -Math.sin(a))));
      colliders.push({ x, z, r: 0.45 });
    }
  };
  chain(13.5, 0.05, 16, 0.48, 1);
  chain(15.5, 2.75, 10, 0.06, 0);

  // ---- Mostar, after Római híd Mosztárban. Seen as he saw it — from up the river, looking down it at the bridge —
  // the right (north, +x) end runs into a tall square tower; below it, three small falls pour over dark rocks into the
  // river under a red-roofed house; on the left bank the grey round tower stands high above the houses; the houses
  // crowd to the bridgeheads, whitewashed or cream or pink, mostly under grey stone roofs; a minaret beyond.
  const town = [];
  const fallMat = FALL_MAT();
  const place = (p, dims, rot, opts = {}) => {
    // on the slope a house stands on its highest corner; its footing goes down to the lowest
    const cr = Math.cos(rot), sr = Math.sin(rot);
    let top = -1e9, low = 1e9, wet = false;
    for (const [ax, az] of [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const lx = ax * (dims.w / 2 + 1), lz = az * (dims.d / 2 + 1);
      const cx = p.x + lx * cr + lz * sr, cz = p.z - lx * sr + lz * cr, hh = H(cx, cz);
      top = Math.max(top, hh); low = Math.min(low, hh);
      if (!opts.wetOk && (riverEdge(cx, cz) < 9 || hh < WATER_Y + 0.6)) wet = true;   // (in the gorge the bed is under water up to 9 m from it)
    }
    if (wet) return false;
    const g = M2.makeMostarHouse(R, { ...dims, footing: Math.max(3, top - low + 2, opts.footing || 0) });
    const m = M4(p.x, top - 0.1, p.z, rot);
    batch.add('wall', g.walls, m); batch.add('tile', g.roof, m); batch.add('wood', g.wood, m);
    colliders.push({ x: p.x, z: p.z, hw: dims.w / 2 + 0.6, hd: dims.d / 2 + 0.6, rot });
    town.push({ x: p.x, z: p.z, r: Math.max(dims.w, dims.d) / 2 });
    return true;
  };
  const clear = (p, r, gap = 1.5) => town.every((t) => Math.hypot(t.x - p.x, t.z - p.z) > t.r + r + gap);
  // the square tower at the right bridgehead, beside the road, its footing down to the water
  place(fromBridge(MB.half + 2.5, MB.width / 2 + 5.2, Mo), { w: 8, d: 8, h: 12.5, wall: '#eadbd0', roofCol: '#5f5a57' }, Mo.rotY, { wetOk: true, footing: 16 });
  // the falls below it, a little up the river: each finds the waterline, its lip on the bank, rocks at its foot
  const towardRiver = (x, z) => {
    const ex = riverEdge(x + 0.5, z) - riverEdge(x - 0.5, z), ez = riverEdge(x, z + 0.5) - riverEdge(x, z - 0.5), l = Math.hypot(ex, ez) || 1;
    return [-ex / l, -ez / l];
  };
  const falls = [];
  for (const [lz, w] of [[15, 3.4], [21.5, 2.2], [27, 2.8]]) {
    let lx = 6; while (lx < 40 && riverEdge(fromBridge(lx, lz, Mo).x, fromBridge(lx, lz, Mo).z) < 3.4) lx += 0.1;
    const toe = fromBridge(lx, lz, Mo), [ox, oz] = towardRiver(toe.x, toe.z);
    const lip = { x: toe.x - ox * 1.4, z: toe.z - oz * 1.4 }, top = H(lip.x, lip.z);
    const f = new THREE.Mesh(M2.makeWaterfall(w, top - WATER_Y + 0.35), fallMat);
    f.position.set(lip.x + ox * 0.25, WATER_Y - 0.3, lip.z + oz * 0.25);
    f.rotation.y = Math.atan2(ox, oz);
    group.add(f);
    // (on his canvas the falls pour between dark boulders as big as the houses, and boil white where they land)
    batch.add('stone', M2.makeRocks(R, 6, w * 0.95, 2.7), M4(toe.x + ox * 1.2, WATER_Y - 0.9, toe.z + oz * 1.2, f.rotation.y));
    for (let k = 0; k < 9; k++) {
      const s = 0.3 + R() * 0.5, fx = toe.x + ox * (2.2 + R() * 2.6) + oz * (R() - 0.5) * w * 1.3, fz = toe.z + oz * (2.2 + R() * 2.6) - ox * (R() - 0.5) * w * 1.3;
      batch.add('wall', MD.merge([MD.part(new THREE.IcosahedronGeometry(1, 1), new THREE.Color('#e3ece6').offsetHSL(0, 0, (R() - 0.5) * 0.08).getHex(),
        MD.M(0, 0, 0, R(), R(), 0, s * 1.7, s * 0.3, s * 1.1))]), M4(fx, WATER_Y + 0.04, fz, f.rotation.y));
    }
    falls.push({ lx, lz });
  }
  // the small red-roofed house over the falls
  { const f = falls[1]; place(fromBridge(f.lx + 6.5, f.lz, Mo), { w: 6, d: 5, h: 4.2, wall: '#efe6d4', roofCol: '#b8492c' }, Mo.rotY + 0.05, { footing: 6 }); }
  // the round tower high on the left bank, the minaret beyond the right end
  let tw = null;
  for (const [lx, lz] of [[-56, 7], [-50, 12], [-34, 22], [-38, 30], [-44, 18], [-40, 40]]) {
    const p = fromBridge(lx, lz, Mo);
    if (roadDist(p.x, p.z) > 8 && riverEdge(p.x, p.z) > 10) { tw = p; break; }
  }
  if (tw) {
    batch.add('stone', M2.makeRoundTower(), M4(tw.x, H(tw.x, tw.z) - 0.5, tw.z, 0));
    colliders.push({ x: tw.x, z: tw.z, r: 5 }); town.push({ x: tw.x, z: tw.z, r: 5 });
  }
  for (const [lx, lz, s] of [[40, -30, 1], [56, -12, 0.82]]) {
    const mn = fromBridge(lx, lz, Mo);
    batch.add('wall', M2.makeMinaret(), M4(mn.x, H(mn.x, mn.z) - 0.3, mn.z, 0, s));
    colliders.push({ x: mn.x, z: mn.z, r: 1.8 }); town.push({ x: mn.x, z: mn.z, r: 2 });
  }
  // the houses: crowding to the bridgeheads, thinning away from them
  for (let i = 0, made = 0; i < 520 && made < 66; i++) {
    const side = i % 2 ? 1 : -1;
    const out = 11 + R() ** 1.7 * 62;
    const along = (R() - 0.5) * (50 + out * 1.4);
    const p = fromBridge(side * out, along, Mo);
    const near = out < 30;
    const dims = { w: 5 + R() * (near ? 5 : 3), d: 5 + R() * 3, h: 4.5 + Math.floor(R() * (near ? 3.5 : 2.5)) * 2.6 };
    const size = Math.max(dims.w, dims.d) / 2;
    if (roadDist(p.x, p.z) < size + 5 || gorgeW(p.x, p.z) < 0.7) continue;
    // the bridgeheads are kept open: room for a cart to come off the bridge and turn into the street
    if (out < Mo.len + 16 && Math.abs(along) < size + 8) continue;
    if (Math.min(Math.hypot(p.x - MS.x, p.z - MS.z), Math.hypot(p.x - MN.x, p.z - MN.z)) < size + 13) continue;
    if (!clear(p, Math.max(dims.w, dims.d) / 2, near ? -0.6 : 0.6)) continue;      // (crowded: at the bridgeheads wall to wall)
    if (falls.some((f) => Math.hypot(...[fromBridge(f.lx, f.lz, Mo)].map((q) => [q.x - p.x, q.z - p.z])[0]) < 10)) continue;
    if (place(p, dims, Mo.rotY + (R() - 0.5) * 0.3)) made++;
  }
  // a leafy tree at the left bridgehead and dark bushes down the left bank, as in his picture
  for (const [lx, lz, h] of [[-21, 10.5, 9], [-27, -11, 7.5], [-30, 17, 6.5]]) {      // (clear of the bridgehead's turning room)
    const p = fromBridge(lx, lz, Mo);
    if (!clear(p, 2) || roadDist(p.x, p.z) < 3.5) continue;
    const t = MD.makeTree(R, { height: h, spread: 3 });
    const m = M4(p.x, H(p.x, p.z) - 0.1, p.z, R() * 6);
    batch.add('trunk', t.trunk, m); batch.add('leaf', recolor(t.crown, ['#4f7a3a', '#5e8a44', '#3f6a34']), m);
    colliders.push({ x: p.x, z: p.z, r: 0.8 });
  }

  // ---- the bridge fair, between the great road and the river, east of the bridge
  const fair = { x: 128, z: 26 };
  for (let i = 0; i < 9; i++) {
    const x = fair.x - 22 + (i % 5) * 11 + (R() - 0.5) * 2, z = fair.z - 6 + Math.floor(i / 5) * 14 + (R() - 0.5) * 2;
    if (!free(x, z, 4, 6)) continue;
    const rot = -0.3 + (Math.floor(i / 5) ? Math.PI : 0);
    const st = M2.makeStall(R);
    const m = M4(x, H(x, z), z, rot);
    batch.add('cloth', st.cloth, m); batch.add('wood', st.wood, m);
    colliders.push({ x, z, hw: 2.4, hd: 1.6, rot });
  }
  for (const [x, z] of [[fair.x + 34, fair.z - 4], [fair.x + 30, fair.z + 12], [fair.x - 28, fair.z + 16]]) {
    const t = M2.makeTent();
    const m = M4(x, H(x, z), z, R() * 6);
    batch.add('cloth', t.cloth, m); batch.add('wood', t.wood, m);
    colliders.push({ x, z, r: 2.8 });
  }
  for (let i = 0; i < 10; i++) {
    const x = fair.x - 26 + R() * 52, z = fair.z - 2 + R() * 10;
    if (!free(x, z, 2.5, 5)) continue;
    batch.add('wood', M2.makeBarrel(), M4(x, H(x, z), z, R() * 6));
  }
  const people = [];
  for (let i = 0; i < 22; i++) {
    const x = fair.x - 26 + R() * 56, z = fair.z - 4 + R() * 18;
    if (!free(x, z, 2.2, 5) || colliders.some((c) => c.hw && Math.abs(x - c.x) < 3 && Math.abs(z - c.z) < 2.5)) continue;
    batch.add('cloth', M2.makePerson(R), M4(x, H(x, z), z, R() * 6.28));
    colliders.push({ x, z, r: 0.45 });
    people.push({ x, z });
  }
  // people at the csárda's porch and by the bridge
  for (const [x, z] of [[118, 58], [125, 57.5], [131, 59.5], [93, 33], [-6, 8]]) {
    batch.add('cloth', M2.makePerson(R), M4(x, H(x, z), z, R() * 6.28));
    colliders.push({ x, z, r: 0.45 });
  }

  const glowMat = paintMaterial('glow', new THREE.Color(2.6, 2.1, 1.25), { vertexColors: true });
  const glowGeo = [];
  const lamps = [];
  const bulb = (x, y, z, r = 0.17) => { glowGeo.push(MD.part(new THREE.SphereGeometry(r, 8, 6), '#ffffff', MD.M(x, y, z))); lamps.push({ x, y, z, size: r > 0.15 ? 1.7 : 1.2 }); };
  const tableau = { standing: [], lines: {} };

  // ---- Tavasz Mosztárban: trees in blossom among the white houses
  for (let i = 0, n = 0; i < 60 && n < 14; i++) {
    const t = town[Math.floor(R() * town.length)];
    if (!t) break;
    const a = R() * Math.PI * 2, r = 6 + R() * 8, x = t.x + Math.cos(a) * r, z = t.z + Math.sin(a) * r;
    const tb = toBridge(x, z, Mo);
    if (Math.abs(tb.x) < Mo.len + 16 && Math.abs(tb.z) < 8) continue;        // (not in the way at the bridgeheads)
    if (!free(x, z, 3.5, 8) || gorgeW(x, z) < 0.6 || colliders.some((c) => c.hw && Math.abs(x - c.x) < c.hw + 1.5 && Math.abs(z - c.z) < c.hd + 1.5)) continue;
    const bt = M2.makeBlossomTree(R, { pink: R() < 0.45, height: 5 + R() * 2.5 });
    const m = M4(x, H(x, z) - 0.1, z, R() * 6);
    batch.add('trunk', bt.trunk, m); batch.add('leaf', bt.crown, m);
    colliders.push({ x, z, r: 0.6 }); n++;
  }

  // ---- Mandulavirágzás: an almond orchard round the southern mound, on terraces of dry stone
  const MO = MOUNDS[1];
  for (let x = MO.x - 46; x <= MO.x + 54; x += 13) for (let z = MO.z - 38; z <= MO.z + 44; z += 12) {
    if (R() < 0.3) continue;
    const jx = x + (R() - 0.5) * 6, jz = z + (R() - 0.5) * 6;
    if (Math.hypot(jx - MO.x, jz - MO.z) < 10 || !free(jx, jz, 4.5, 6)) continue;
    const bt = M2.makeBlossomTree(R, { pink: R() < 0.75, height: 4.2 + R() * 2 });
    const m = M4(jx, H(jx, jz) - 0.1, jz, R() * 6);
    batch.add('trunk', bt.trunk, m); batch.add('leaf', bt.crown, m);
    colliders.push({ x: jx, z: jz, r: 0.55 });
  }
  for (const [x, z, len, rot] of [[MO.x - 26, MO.z - 33, 26, 0.05], [MO.x + 30, MO.z - 24, 28, -0.04], [MO.x - 30, MO.z + 14, 24, 0.08], [MO.x + 34, MO.z + 22, 26, 0.02], [MO.x, MO.z + 40, 34, -0.03]]) {
    if (!free(x, z, 5, 6)) continue;
    batch.add('stone', M2.makeStoneWall(R, len, 0.75), M4(x, H(x, z) - 0.1, z, rot));
    colliders.push({ x, z, hw: len / 2, hd: 0.5, rot });
  }

  // ---- Hídon átvonuló társaság: the little stone bridge over the brook, the company crossing it, a cow drinking
  const PB = BRIDGES[2];
  batch.add('stone', M2.makeFootBridge(), M4(PB.x, 0, PB.z, PB.rotY));
  tableau.lines.bridge = [[-86, 13.6], [-120, 18], [-156, 21.6]];
  tableau.standing.push({ kind: 'cow', coat: 'grey', x: -116.5, z: 31, yaw: Math.PI / 2 + 0.3, clip: 'Eating' });
  tableau.standing.push({ kind: 'dog', coat: 'white', x: -131, z: 12, yaw: 0.6, clip: 'Idle' });
  for (const [x, z] of [[-104, 22], [-108, 9.5], [-137, 25]]) { batch.add('cloth', M2.makePerson(R), M4(x, H(x, z), z, R() * 6.28)); colliders.push({ x, z, r: 0.45 }); }
  { const bt = M2.makeBlossomTree(R, { pink: false, height: 7 }); const m = M4(-128, H(-128, 34), 34, 1);
    batch.add('trunk', recolor(bt.trunk, ['#2e2420']), m); batch.add('leaf', recolor(bt.crown, ['#b8452e', '#c95a35', '#a63c28']), m); colliders.push({ x: -128, z: 34, r: 0.6 }); }   // his red tree

  // ---- Jajcei vízesés: a broad fall from the gorge's north rim, the electricity works above it
  for (const [dx, w, hgt] of [[-10, 7, 9.6], [-2, 6, 10.2], [6, 8, 9.4]]) {
    const f = new THREE.Mesh(M2.makeWaterfall(w, hgt), fallMat);
    f.position.set(-388 + dx, WATER_Y - 0.2, -85.5 + Math.abs(dx) * 0.1);
    group.add(f);
  }
  for (let i = 0; i < 40; i++) {
    const x = -400 + R() * 26, z = -84 + R() * 7, s = 0.25 + R() * 0.55;
    batch.add('wall', MD.merge([MD.part(new THREE.IcosahedronGeometry(1, 1), new THREE.Color('#dfe9e4').offsetHSL(0, 0, (R() - 0.5) * 0.1).getHex(),
      MD.M(0, 0, 0, R(), R(), 0, s * 1.6, s * 0.35, s))]), M4(x, WATER_Y + 0.05, z));
  }
  const ph = M2.makePowerHouse();
  const phM = M4(-394, H(-394, -112), -112, 0.1);
  batch.add('brick', ph.walls, phM); batch.add('roof', ph.roof, phM);
  colliders.push({ x: -394, z: -112, hw: 6.5, hd: 4.5, rot: 0.1 });
  for (const [x, y, z] of M2.POWERHOUSE_WINDOWS) { const v = new THREE.Vector3(x, y, z).applyMatrix4(phM); glowGeo.push(MD.part(new THREE.BoxGeometry(1.0, 1.6, 0.08), '#ffe2a0', MD.M(v.x, v.y, v.z, 0, 0.1, 0))); lamps.push({ x: v.x, y: v.y, z: v.z, size: 2.6, strength: 0.4 }); }

  // ---- Villanyvilágított fák Jajcéban: lamps along the road into Mostar, the trees round them lit yellow-green
  for (let i = 0; i <= 8; i++) {
    const t = i / 8, x0 = -260 + (-318 + 260) * t, z0 = -140 + (-98 + 140) * t;
    const side = i % 2 ? 1 : -1, nx = 0.59 * side, nz = 0.81 * side;      // across the road
    const lx = x0 + nx * 4.2, lz = z0 + nz * 4.2;
    const lm = M4(lx, H(lx, lz), lz, Math.atan2(-nx, -nz));
    batch.add('wood', M2.makeLampPost(), lm);
    const bv = new THREE.Vector3(...M2.LAMP_BULB).applyMatrix4(lm); bulb(bv.x, bv.y, bv.z);
    colliders.push({ x: lx, z: lz, r: 0.3 });
    if (i % 2 === 0) {
      const tx = x0 + nx * 8, tz = z0 + nz * 8;
      if (free(tx, tz, 3, 6)) {
        const tr = MD.makeTree(R, { height: 8 + R() * 3, spread: 3.2 });
        const m = M4(tx, H(tx, tz) - 0.1, tz, R() * 6);
        batch.add('trunk', tr.trunk, m); batch.add('leaf', recolor(tr.crown, ['#d6dc78', '#c6d066', '#e2e08a', '#b9c45e']), m);
        colliders.push({ x: tx, z: tz, r: 0.8 });
      }
    }
  }

  // ---- Halászat Castellammaréban: a seawall with lamps along the lake, fishermen, boats with lanterns, tall houses
  for (let i = 0; i < 12; i++) {
    const a = SHORE.a0 + (SHORE.a1 - SHORE.a0) * ((i + 0.5) / 12);
    const p0 = shorePoint(a, 2.5), p1 = shorePoint(a + (SHORE.a1 - SHORE.a0) / 12, 2.5);
    const len = Math.hypot(p1.x - p0.x, p1.z - p0.z) + 0.6, rot = Math.atan2(-(p1.z - p0.z), p1.x - p0.x);
    batch.add('stone', M2.makeStoneWall(R, len, 0.9), M4((p0.x + p1.x) / 2, H((p0.x + p1.x) / 2, (p0.z + p1.z) / 2) - 0.1, (p0.z + p1.z) / 2, rot));
    if (i % 2 === 0) {
      const lp = shorePoint(a, 6.5);
      const lm = M4(lp.x, H(lp.x, lp.z), lp.z, rot + Math.PI / 2);
      batch.add('wood', M2.makeLampPost(), lm);
      const bv = new THREE.Vector3(...M2.LAMP_BULB).applyMatrix4(lm); bulb(bv.x, bv.y, bv.z);
      colliders.push({ x: lp.x, z: lp.z, r: 0.3 });
    }
    if (i % 3 === 1) {
      const fp = shorePoint(a, 4);
      batch.add('cloth', M2.makeFisherman(R), M4(fp.x, H(fp.x, fp.z), fp.z, Math.atan2(-(LAKE.x - fp.x), -(LAKE.z - fp.z))));
      colliders.push({ x: fp.x, z: fp.z, r: 0.45 });
    }
  }
  const houseCols = ['#e7b7a8', '#efe8dc', '#d98f7a', '#efdcb8', '#e9cfc0'];
  for (let i = 0; i < 5; i++) {
    const a = SHORE.a0 + (SHORE.a1 - SHORE.a0) * (0.1 + i * 0.2);
    const hp = shorePoint(a, 34);
    if (!free(hp.x, hp.z, 5, 8)) continue;
    const dims = { w: 9 + R() * 3, d: 8, h: 11 + R() * 5, color: houseCols[i] };
    const sh = M2.makeShoreHouse(R, dims);
    const rot = Math.atan2(-(LAKE.x - hp.x), -(LAKE.z - hp.z)) + Math.PI;
    const m = M4(hp.x, H(hp.x, hp.z) - 0.2, hp.z, rot);
    batch.add('wall', sh.walls, m); batch.add('wood', sh.wood, m);
    colliders.push({ x: hp.x, z: hp.z, hw: dims.w / 2 + 0.6, hd: dims.d / 2 + 0.6, rot });
  }
  for (const [a, off, yaw] of [[1.95, -16, 0.4], [1.55, -24, -0.3], [1.2, -14, 1.2]]) {
    const bp = shorePoint(a, off);
    const bm = M4(bp.x, WATER_Y - 0.1, bp.z, yaw);
    batch.add('wood', M2.makeBoat(), bm);
    const lv = new THREE.Vector3(...M2.BOAT_LANTERN).applyMatrix4(bm); bulb(lv.x, lv.y, lv.z, 0.14);
    batch.add('cloth', M2.makeFisherman(R), M4(bp.x, WATER_Y + 0.25, bp.z, yaw + 2.2, 0.95));
  }
  tableau.lines.shore = shoreLine(11, 14);

  // ---- Vihar a pusztán: a covered wagon stopped on the plain, its horses grazing, the travellers resting
  {
    const T = { x: -330, z: -300 }, yaw = 0.8, fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = -fz, rz = fx;
    const wc = MD.makeCart();
    wc.driver.visible = false; wc.whip.visible = false;
    wc.group.add(new THREE.Mesh(M2.makeWagonCover(), mats.cloth));
    wc.group.traverse((o) => { if (o.isMesh && !o.material) o.material = mats.wood; });
    wc.group.position.set(T.x, H(T.x, T.z), T.z);
    wc.group.rotation.y = yaw;
    group.add(wc.group);
    colliders.push({ x: T.x, z: T.z, hw: 1.2, hd: 2.2, rot: yaw });
    for (const s of [1, -1]) tableau.standing.push({ kind: 'horse', coat: s > 0 ? 'chestnut' : 'bay', x: T.x + fx * 4.2 + rx * s * 0.9, z: T.z + fz * 4.2 + rz * s * 0.9, yaw: yaw + s * 0.25, clip: 'Eating' });
    for (const [a, b] of [[2.2, 1.5], [3.0, -0.5], [2.4, -2.0]]) {
      const x = T.x + rx * a + fx * b, z = T.z + rz * a + fz * b;
      batch.add('cloth', M2.makePerson(R), MD.M(x, H(x, z) - 0.55, z, 0, R() * 6.28, 0, 1, 0.68, 1));    // sitting on the grass
      colliders.push({ x, z, r: 0.5 });
    }
    for (let i = 0; i < 4; i++) {
      const x = T.x + rx * (3.6 + R()) + fx * (R() * 2 - 1), z = T.z + rz * (3.6 + R()) + fz * (R() * 2 - 1);
      batch.add('cloth', MD.merge([MD.part(new THREE.SphereGeometry(0.35, 8, 6), '#c9b892', MD.M(0, 0.28, 0, 0, 0, 0, 1, 0.8, 1.3))]), M4(x, H(x, z), z, R() * 6));
    }
    batch.add('roof', MD.makeHaystack(), M4(T.x - rx * 9, H(T.x - rx * 9, T.z - rz * 9), T.z - rz * 9, 0.3, 1.1));
    colliders.push({ x: T.x - rx * 9, z: T.z - rz * 9, r: 2 });
    tableau.wagon = T;
  }
  // the fair's horses, tied by the stalls
  tableau.standing.push({ kind: 'horse', coat: 'white', x: 150, z: 39, yaw: 2.6, clip: 'Idle' }, { kind: 'horse', coat: 'golden', x: 153, z: 41.5, yaw: 2.4, clip: 'Eating' });
  colliders.push({ x: 151.5, z: 40, r: 2.2 });
  group.add(new THREE.Mesh(MD.merge(glowGeo), glowMat));

  // ---- well sweeps: the painting's on the horizon, more by the farms and roads
  const wells = [[-305, -600, 0.4], [-95, -600, -0.3], [62, 58, 0.9], [-80, -172, 2.0], [-40, 150, 1.1], [180, 120, 0.2],
    [-180, -205, 2.6], [212, 30, 1.6], [-262, 56, 0.6], [40, -232, 2.2], [102, 252, 1.4], [-128, -300, 0.8], [96, 182, 0.3]];
  for (const [x, z, rot] of wells) {
    // (on a slope the curb and the trough stand on the ground where they are, not on the post's level)
    const h0 = H(x, z);
    const rel = (lx, lz) => { const o = rotXZ(lx, lz, rot); return H(x + o.x, z + o.z) - h0; };
    batch.add('wood', MD.makeWell(rel), M4(x, h0 - 0.05, z, rot));
    colliders.push({ x, z, r: 0.6 });
    const wp = rotXZ(0, -5.2, rot);
    colliders.push({ x: x + wp.x, z: z + wp.z, r: 1.2 });
  }

  // ---- the herdsman of the painting, at its lower left, and his dog by the water
  const hm = paintingToGround(PAINTED.herdsman.px, PAINTED.herdsman.py, PAINTED.herdsman.h);
  const dg = paintingToGround(PAINTED.dog.px, PAINTED.dog.py);
  batch.add('cloth', MD.makeHerdsman(), M4(hm.x, H(hm.x, hm.z) - 0.05, hm.z, PAINTED.herdsman.yaw));
  batch.add('beastStatic', MD.makeDog(), M4(dg.x, H(dg.x, dg.z), dg.z, PAINTED.dog.yaw));
  colliders.push({ x: hm.x, z: hm.z, r: 0.6 }, { x: dg.x, z: dg.z, r: 0.5 });

  batch.build(mats, group);

  // ---- collision for the cart
  const blocked = (x, z) => {
    for (const b of BRIDGES) {
      const bl = toBridge(x, z, b);
      // (inside the parapets; a bridge without them — the brook's — can be driven to its very edge)
      const onDeck = Math.abs(bl.z) < b.width / 2 - (b.wall ? 0.6 : 0) && Math.abs(bl.x) < b.len;
      if (onDeck) return false;
      if (Math.abs(bl.z) < b.width / 2 + 0.4 && Math.abs(bl.x) < b.wall) return true;   // walls and parapets
      // the grass banks beside the nine-arched bridge's ramps (too steep to drive)
      if (b.id === 'kilenc' && Math.abs(bl.x) > KB.half + 9 && Math.abs(bl.x) < b.len && Math.abs(bl.z) < b.width / 2 + 0.7 + 1.0 * Math.max(0, b.deck(bl.x) - 0.8)) return true;
    }
    if (riverEdge(x, z) < 0.6) return true;
    if (gorgeW(x, z) > 0.5 && riverEdge(x, z) < 8) return true;                         // the gorge's edge
    if (Math.hypot(x - WORLD_CENTER.x, z - WORLD_CENTER.y) > WORLD_RADIUS) return true;
    for (const c of colliders) {
      if (c.r) { if ((x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r) return true; continue; }
      const dx = x - c.x, dz = z - c.z, cr = Math.cos(c.rot), sr = Math.sin(c.rot);
      const lx = dx * cr - dz * sr, lz = dx * sr + dz * cr;
      if (Math.abs(lx) < c.hw && Math.abs(lz) < c.hd) return true;
    }
    return false;
  };

  const landmarks = [
    { id: 'kilenc', name: 'Kilenclyukú híd', sub: 'CÉL', x: BRIDGE_TOP.x, z: BRIDGE_TOP.z, icon: 'bridge' },
    { id: 'csarda', name: 'Hortobágyi csárda', sub: 'CSÁRDA', x: 122, z: 66, icon: 'inn' },
    { id: 'vasar', name: 'Hídi vásár', sub: 'VÁSÁR', x: fair.x, z: fair.z, icon: 'fair' },
    { id: 'cedrus', name: 'A magányos cédrus', sub: 'KILÁTÓ', x: CEDAR_HILL.x, z: CEDAR_HILL.z, icon: 'tree' },
    { id: 'to', name: 'A türkiz tó', sub: 'PART', x: 352, z: -180, icon: 'tree' },
    { id: 'mostar', name: 'Mostari híd', sub: 'VÁROS', x: Mo.x, z: Mo.z, icon: 'town' },
    { id: 'menes', name: 'A ménes', sub: 'CSIKÓSOK', x: -165, z: -300, icon: 'herd' },
    { id: 'tanyak', name: 'Tanyák', sub: 'TANYA', x: 120, z: 200, icon: 'farm' },
    { id: 'kunhalom', name: 'Kunhalom', sub: 'HALOM', x: MOUNDS[0].x, z: MOUNDS[0].z, icon: 'ruin' },
    { id: 'kut', name: 'Gémeskút', sub: 'KÚT', x: -80, z: -172, icon: 'well' },
    { id: 'patak', name: 'A kis kőhíd', sub: 'HÍDON ÁTVONULÓ TÁRSASÁG', x: -120, z: 18, icon: 'bridge' },
    { id: 'mandulas', name: 'Mandulás', sub: 'MANDULAVIRÁGZÁS', x: MOUNDS[1].x, z: MOUNDS[1].z, icon: 'tree' },
    { id: 'jajce', name: 'Jajcei vízesés', sub: 'VILLANYVILÁGÍTOTT FÁK', x: -388, z: -95, icon: 'town' },
    { id: 'setany', name: 'Tóparti sétány', sub: 'CASTELLAMMARE · SÉTALOVAGLÁS', x: shorePoint(1.6, 12).x, z: shorePoint(1.6, 12).z, icon: 'herd' },
    { id: 'ponyvas', name: 'Ponyvás szekér', sub: 'VIHAR A PUSZTÁN', x: tableau.wagon.x, z: tableau.wagon.z, icon: 'farm' },
  ];
  const mapData = {
    bounds: { cx: WORLD_CENTER.x, cz: WORLD_CENTER.y, r: WORLD_RADIUS + 40 },
    river: RIVER, lakes: [{ x: LAKE.x, z: LAKE.z, rx: LAKE.rx, rz: LAKE.rz }], roads: ROADS,
    bridges: BRIDGES.map((b) => { const a = fromBridge(-b.len, 0, b), e = fromBridge(b.len, 0, b); return { x1: a.x, z1: a.z, x2: e.x, z2: e.z, width: b.width }; }),
    hills: [{ x: MOUNTAIN.x, z: MOUNTAIN.z, r: MOUNTAIN.r }, { x: CEDAR_HILL.x, z: CEDAR_HILL.z, r: CEDAR_HILL.r }, { x: GORGE.x, z: GORGE.z, r: GORGE.r }, ...MOUNDS.map((m) => ({ x: m.x, z: m.z, r: m.r }))],
    landmarks,
  };

  // places for the drops of sunlight: along the roads and by every landmark
  const orbSpots = [];
  for (const r of ROADS) for (let i = 0; i < r.length - 1; i++) {
    const L = Math.hypot(r[i + 1][0] - r[i][0], r[i + 1][1] - r[i][1]);
    for (let s = 20; s < L; s += 46) {
      const t = s / L, side = (R() - 0.5) * 8;
      orbSpots.push({ x: r[i][0] + (r[i + 1][0] - r[i][0]) * t + side, z: r[i][1] + (r[i + 1][1] - r[i][1]) * t + side * 0.5 });
    }
  }
  for (const l of landmarks) if (l.id !== 'kilenc') orbSpots.push({ x: l.x + 8, z: l.z + 8 });

  return {
    group, mats, water, colliders, blocked, landmarks, mapData, orbSpots, groundY,
    lamps, roads: ROADS, crossings: [[KW, KE], [MN, MS], [fromBridge(-BRIDGES[2].len, 0, BRIDGES[2]), fromBridge(BRIDGES[2].len, 0, BRIDGES[2])]], tableau,
    resize(w, h) { water.getRenderTarget().setSize(w, h); },
  };
}
