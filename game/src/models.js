// Everything in the world is built here from simple solids, in metres, facing -z (north). Each model is a merged
// geometry with vertex colours (one draw per material), or a small rig of them where something moves (horses' legs,
// wheels, the cattle's heads). The painting shader does the rest.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

/** matrix from position, rotation (xyz, radians) and scale */
export function M(px = 0, py = 0, pz = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  return new THREE.Matrix4().compose(_v.set(px, py, pz), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
}

/** a part: non-indexed, transformed, flat colour (or a function of the vertex) — position, normal, color only */
export function part(geo, color, m = null) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (m) g.applyMatrix4(m);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  const c = new THREE.Color();
  const p = g.attributes.position;
  for (let i = 0; i < n; i++) {
    if (typeof color === 'function') color(c, p.getX(i), p.getY(i), p.getZ(i), i, g);
    else c.set(color);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** an arch's opening as a hole of an extruded shape, wound so that its walls and vault face into the opening
 *  (drawn the other way, ExtrudeGeometry turns them inward and they are culled: the bridge reads as a flat sheet) */
export function holeOf(path) { return new THREE.Path(path.getPoints(24).reverse()); }

export function merge(parts) {
  const g = mergeGeometries(parts.filter(Boolean), false);
  g.computeBoundingSphere();
  return g;
}

/** a cylinder from a to b (radii r0 at a, r1 at b) */
export function limb(a, b, r0, r1 = r0, seg = 8) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1);
  g.translate(0, len / 2, 0);
  const dir = B.clone().sub(A).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  g.applyMatrix4(new THREE.Matrix4().compose(A, q, new THREE.Vector3(1, 1, 1)));
  return g;
}

function tube(points, r0, r1, seg = 16, radial = 7) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const g = new THREE.TubeGeometry(curve, seg, 1, radial, false);
  // taper: scale each ring toward the curve
  const p = g.attributes.position;
  const pts = curve.getSpacedPoints(seg);
  for (let i = 0; i <= seg; i++) {
    const r = r0 + (r1 - r0) * (i / seg);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      _v.fromBufferAttribute(p, k).sub(pts[i]).multiplyScalar(r).add(pts[i]);
      p.setXYZ(k, _v.x, _v.y, _v.z);
    }
  }
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------- the nine-arched bridge

// The nine-arched bridge as he painted it. Its proportions are measured on the scan and taken back through the
// painter's eye (the bridge's face runs away from him at about 51°, so on the canvas every width is foreshortened and
// the arches look far narrower than they are drawn here). In units of one pitch P (arch + pier):
//   arch 0.75 P wide, pier 0.25 P; before each pier a flat-fronted block 0.52 P wide, standing 1.08 P out of the
//   water under a pointed cap (0.13 P); the arches' crowns 1.88 P above the water at the middle of the bridge, lower
//   toward its ends (the road is humped and the arches follow it); over the crowns 0.12 P of wall, a cream band of
//   0.22 P, 0.66 P of salmon wall and parapet, a dark red coping — 2.9 P above the water in the middle, 2.05 P at the
//   ends. At each end a plain block of brick 1.4 P wide, then the wing wall running down with the road.
// The blocks are dark olive with moss, greyer where the courses show lower down, black at the water; the piers above
// them pale stone, which also rings every arch; inside, the arches are dark, glowing orange low down.
// (in the game P = 5 m; every height is then taken a fifth lower than measured, so the bridge sits less steeply in the plain)
export const BRIDGE = { span: 3.75, pier: 1.25, n: 9, abut: 7, ramp: 38, crown: 10.4, endH: 8.0, width: 9, bottom: -3.2,
  blockW: 2.6, blockTop: 3.87, blockOut: 0.9, capH: 0.52, crownDrop: 3.16, bandTop: 1.8, bandBottom: 2.68, parapet: 1.0 };
BRIDGE.half = (BRIDGE.n * BRIDGE.span + (BRIDGE.n - 1) * BRIDGE.pier) / 2 + BRIDGE.abut;

/** the road's height over the bridge, at lx metres along it from the middle */
export function bridgeDeckY(lx) {
  const B = BRIDGE, ax = Math.abs(lx);
  if (ax <= B.half) return B.endH + (B.crown - B.endH) * (1 - (ax / B.half) ** 2);
  if (ax <= B.half + B.ramp) {
    const t = (ax - B.half) / B.ramp, s = t * t * (3 - 2 * t);
    return B.endH * (1 - s) + 0.05 * s;
  }
  return 0;
}

export function makeBridge() {
  const B = BRIDGE;
  const L = B.half + B.ramp, R = B.span / 2, WATER = -0.45;
  const archX = (k) => -B.half + B.abut + R + k * (B.span + B.pier);
  const crownY = (x) => bridgeDeckY(x) - B.crownDrop;          // every arch reaches up to the same distance under the road
  const springY = (k) => crownY(archX(k)) - R;
  const shape = new THREE.Shape();
  shape.moveTo(-L, B.bottom);
  for (let x = -L; x <= L + 1e-6; x += 1) shape.lineTo(x, bridgeDeckY(x));
  shape.lineTo(L, B.bottom);
  shape.lineTo(-L, B.bottom);
  for (let k = 0; k < B.n; k++) {
    const cx = archX(k), sp = springY(k);
    const h = new THREE.Path();
    h.moveTo(cx - R, B.bottom + 0.3);
    h.lineTo(cx - R, sp);
    h.absarc(cx, sp, R, Math.PI, 0, true);
    h.lineTo(cx + R, B.bottom + 0.3);
    h.lineTo(cx - R, B.bottom + 0.3);
    shape.holes.push(holeOf(h));
  }
  const body = new THREE.ExtrudeGeometry(shape, { depth: B.width, bevelEnabled: false, curveSegments: 18, steps: 1 });
  body.translate(0, 0, -B.width / 2);
  const brick = new THREE.Color('#d6a089'), stain = new THREE.Color('#b9654e'), road = new THREE.Color('#8d7b68'), under = new THREE.Color('#7a5446');
  const dark = new THREE.Color('#2a1a15'), glow = new THREE.Color('#a9602f'), flank = new THREE.Color('#a39b98'), mortarP = new THREE.Color('#c9c2bc'), black = new THREE.Color('#0b0c0b');
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const bodyP = part(body, (c, x, y, z, i) => {
    const ny = body.attributes.normal.getY(i), nz = body.attributes.normal.getZ(i);
    if (ny > 0.6 && y > 0.3) { c.copy(road); return; }
    const inside = Math.abs(nz) < 0.5 && Math.abs(x) < B.half - B.abut + 0.2 && y > B.bottom + 0.35 && y < crownY(x) + 0.3;
    if (inside) {
      if (y < B.blockTop) {
        // the piers' flanks down to the water: grey brick, its courses drawn, dark at the waterline
        c.copy(flank);
        if (Math.abs(((y * 2.2) % 1 + 1) % 1 - 0.5) > 0.38) c.lerp(mortarP, 0.6);
        c.lerp(black, 1 - sm(WATER - 0.1, WATER + 1.1, y));
      } else {
        // inside the arch: an orange glow low down, deep shade under the crown
        c.copy(glow).lerp(dark, sm(0.12, 0.7, (y - B.blockTop) / Math.max(0.5, crownY(x) - B.blockTop)));
      }
      return;
    }
    if (ny < -0.5) { c.copy(under); return; }
    // the salmon wall, stained redder in patches as on the canvas
    c.copy(brick).lerp(stain, 0.55 * sm(0.55, 0.85, 0.5 + 0.5 * Math.sin(x * 0.83 + 1.3) * Math.sin(y * 1.9 + x * 0.21)));
  });
  // the parapets: a low wall each side, a dark red coping on top
  const pshape = new THREE.Shape();
  const PL = L - 4;
  pshape.moveTo(-PL, bridgeDeckY(-PL) - 0.3);
  for (let x = -PL; x <= PL + 1e-6; x += 1) pshape.lineTo(x, bridgeDeckY(x) + B.parapet);
  for (let x = PL; x >= -PL - 1e-6; x -= 1) pshape.lineTo(x, bridgeDeckY(x) - 0.3);
  const par = new THREE.ExtrudeGeometry(pshape, { depth: 0.55, bevelEnabled: false, steps: 1 });
  const coping = new THREE.Color('#6b3029');
  const parCol = (c, x, y) => { c.copy(y > bridgeDeckY(x) + B.parapet - 0.16 ? coping : brick); };
  const p1 = part(par, parCol, M(0, 0, B.width / 2 - 0.55));
  const p2 = part(par, parCol, M(0, 0, -B.width / 2));

  const extras = [];
  const cream = new THREE.Color('#e8d9bd'), tuft = new THREE.Color('#3f4a2a'), redline = new THREE.Color('#7a3329');
  const creamCol = (c, x, y) => { c.copy(cream).offsetHSL(0, 0, Math.sin(x * 3.1 + y * 5.3) * 0.025); };
  const ZF = B.width / 2;
  const face = (geo, col, x, y, out = 0.05, sx = 1, sy = 1) => {
    for (const s of [1, -1]) extras.push(part(geo, col, M(x, y, s * (ZF + out), 0, s > 0 ? 0 : Math.PI, 0, sx, sy, 1)));
  };
  // a strip along the face between two depths below the road (x0..x1 along the bridge), laid just proud of it
  const strip = (x0, x1, top, bot, col, out) => {
    const sh = new THREE.Shape();
    sh.moveTo(x0, bridgeDeckY(x0) - bot);
    for (let x = x0; x < x1; x += 1) sh.lineTo(x, bridgeDeckY(x) - top);
    sh.lineTo(x1, bridgeDeckY(x1) - top);
    for (let x = x1; x > x0; x -= 1) sh.lineTo(x, bridgeDeckY(x) - bot);
    sh.lineTo(x0, bridgeDeckY(x0) - bot);
    const g = new THREE.ExtrudeGeometry(sh, { depth: out, bevelEnabled: false, steps: 1 });
    extras.push(part(g, col, M(0, 0, ZF - 0.02)), part(g, col, M(0, 0, -ZF - out + 0.02)));
  };
  // the broad cream band over the arches, a dark green tuft on it above every pier
  const A0 = B.half - B.abut;
  strip(-A0, A0, B.bandTop, B.bandBottom, creamCol, 0.14);
  for (let k = 0; k <= B.n; k++) {
    const x = archX(0) - R - B.pier / 2 + k * (B.span + B.pier) + (k % 2 ? 0.5 : -0.4);
    if (Math.abs(x) > A0 - 0.8) continue;
    face(new THREE.CircleGeometry(0.5, 10), tuft.getHex(), x, bridgeDeckY(x) - B.bandTop - 0.4, 0.17, 1.9, 0.42);
  }
  // a pale ring of stone round every arch, half a pier thick, its legs running down to the caps: on each pier the
  // rings of the two arches meet, so above the green the pier is pale, and the salmon wall begins where they part
  const RW = B.pier / 2 + 0.01;
  for (let k = 0; k < B.n; k++) {
    const cx = archX(k), sp = springY(k);
    face(new THREE.RingGeometry(R, R + RW, 26, 1, 0, Math.PI), creamCol, cx, sp);
    for (const e of [1, -1]) {
      if ((k === 0 && e < 0) || (k === B.n - 1 && e > 0)) continue;          // (at the end blocks the ring simply ends)
      face(new THREE.PlaneGeometry(RW, sp - B.blockTop + 0.02), creamCol, cx + e * (R + RW / 2), (sp + B.blockTop) / 2);
    }
  }
  // two iron ties on each pier, between the rings (the pier itself is the wall's own brick: no pale panel on it)
  for (let k = 0; k < B.n - 1; k++) {
    const px = archX(k) + R + B.pier / 2;
    for (const e of [1, -1]) face(new THREE.PlaneGeometry(0.2, 0.2), '#2b2320', px + e * 0.38, Math.min(springY(k), springY(k + 1)) + R * 0.95, 0.07);
  }
  // the masses before the piers: round like columns (half of one stands out of the wall), wider than the pier, dark
  // olive with moss, greyer where the courses show lower down, black where they meet the water; a pointed cap on each
  const moss = new THREE.Color('#45411e'), mossLow = new THREE.Color('#403d28'), course = new THREE.Color('#4a4634'), mortar = new THREE.Color('#7b7666'), cap = new THREE.Color('#78652e');
  const top = B.blockTop, bh = top - B.bottom;
  const blockCol = (c, x, y) => {
    const t = Math.min(1, Math.max(0, (y - WATER) / (top - WATER)));          // 0 at the water, 1 under the cap
    c.copy(course).lerp(mossLow, sm(0.1, 0.45, t)).lerp(moss, sm(0.4, 0.75, t));
    if (Math.abs(((y * 2.2) % 1 + 1) % 1 - 0.5) > 0.4) c.lerp(mortar, 0.45 * (1 - t));    // the courses, clearest low down
    c.lerp(black, 1 - sm(WATER - 0.05, WATER + 0.7, y));
    c.offsetHSL(0, 0, Math.sin(x * 2.3 + y * 4.1) * 0.012);
  };
  for (let k = 0; k < B.n - 1; k++) {
    const px = archX(k) + R + B.pier / 2;
    for (const s of [1, -1]) {
      extras.push(part(new THREE.CylinderGeometry(0.5, 0.5, bh, 20, 28), blockCol, M(px, B.bottom + bh / 2, s * (ZF - 0.02), 0, 0, 0, B.blockW, 1, B.blockOut * 2)));
      // (a cone over the column: its apex stands at the face)
      extras.push(part(new THREE.ConeGeometry(0.5, B.capH, 20, 1), (c, x, y) => { c.copy(cap).offsetHSL(0, 0, (y - top - B.capH * 0.5) * 0.05); },
        M(px, top + B.capH / 2, s * (ZF - 0.02), 0, 0, 0, B.blockW * 1.04, 1, B.blockOut * 2.08)));
    }
  }
  // each end: a plain block of brick standing a little proud, as high as the parapet; beyond it the wing wall, cream
  // above a red line, running down with the road
  for (const e of [1, -1]) {
    const bx = e * (B.half - B.abut / 2 + 0.3), topY = bridgeDeckY(bx) + B.parapet;
    for (const s of [1, -1]) extras.push(part(new THREE.BoxGeometry(B.abut - 0.4, topY - B.bottom, 0.7, 1, 30, 1), (c, x, y) => {
      c.copy(brick).offsetHSL(0, 0.02, 0.03);
      if (Math.abs(((y * 1.6) % 1 + 1) % 1 - 0.5) > 0.42) c.offsetHSL(0, 0, 0.035);
      c.lerp(black, 0.8 * (1 - sm(WATER - 0.1, WATER + 0.9, y)));
    }, M(bx, (topY + B.bottom) / 2, s * (ZF + 0.3))));
    const x0 = e > 0 ? B.half + 0.2 : -B.half - 16, x1 = e > 0 ? B.half + 16 : -B.half - 0.2;
    strip(x0, x1, -B.parapet + 0.2, 1.2, creamCol, 0.62);
    strip(x0, x1, 1.2, 1.42, redline.getHex(), 0.66);
  }
  return merge([bodyP, p1, p2, ...extras]);
}

/** the grass banks at the bridge's feet (his green mound by the wing wall): the approach ramps are earth, sloping
 *  out from the road's edge to the ground. Ground paint; bridge-local like makeBridge(). */
export function makeBridgeBanks() {
  const B = BRIDGE, L = B.half + B.ramp, pos = [], col = [];
  const c0 = new THREE.Color('#5f8236'), c1 = new THREE.Color('#7b9a3e'), c = new THREE.Color();
  const P = (x, s, t) => { const h = bridgeDeckY(x) - 0.25; return [x, h * (1 - t) - 0.3 * t, s * (B.width / 2 + 0.1 + t * (1.1 * h + 0.6))]; };
  for (const e of [1, -1]) for (const s of [1, -1]) {
    for (let x = B.half + 9; x < L + 2; x += 1.5) {
      const xa = e * x, xb = e * Math.min(x + 1.5, L + 2);
      for (let k = 0; k < 4; k++) {
        const t0 = k / 4, t1 = (k + 1) / 4;
        const q = [P(xa, s, t0), P(xb, s, t0), P(xb, s, t1), P(xa, s, t1)];
        // (wound so that the bank faces up and out)
        const ux = q[1][0] - q[0][0], uz = q[1][2] - q[0][2], vx = q[3][0] - q[0][0], vz = q[3][2] - q[0][2];
        const tri = uz * vx - ux * vz > 0 ? [q[0], q[1], q[2], q[0], q[2], q[3]] : [q[0], q[2], q[1], q[0], q[3], q[2]];
        for (const v of tri) { pos.push(...v); c.copy(c0).lerp(c1, 0.5 + 0.5 * Math.sin(v[0] * 0.9 + v[2] * 1.3)); col.push(c.r, c.g, c.b); }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------- horses

const COATS = { bay: '#6e3a22', chestnut: '#8a4a26', dark: '#3a2418', grey: '#b8b2a8' };

/** a horse rig: { group, legs:[{hip,knee,front}], body } facing -z, hooves on y=0 */
export function makeHorse(coat = 'bay', opts = {}) {
  const col = COATS[coat] || coat;
  const dark = '#1c1410';
  const g = new THREE.Group();
  const parts = [];
  const barrel = new THREE.CapsuleGeometry(0.34, 1.0, 6, 12);
  parts.push(part(barrel, col, M(0, 1.2, 0, Math.PI / 2, 0, 0, 0.8, 1, 1)));
  parts.push(part(new THREE.SphereGeometry(0.36, 12, 8), col, M(0, 1.22, 0.5, 0, 0, 0, 0.82, 0.95, 0.9)));   // rump
  parts.push(part(new THREE.SphereGeometry(0.34, 12, 8), col, M(0, 1.25, -0.55, 0, 0, 0, 0.8, 1.0, 0.9)));   // chest
  parts.push(part(limb([0, 1.3, -0.62], [0, 1.85, -1.0], 0.26, 0.15, 10), col));                             // neck
  parts.push(part(limb([0, 1.95, -1.02], [0, 1.6, -1.42], 0.15, 0.1, 10), col));                             // head
  parts.push(part(new THREE.SphereGeometry(0.1, 8, 6), dark, M(0, 1.58, -1.44, 0, 0, 0, 1, 0.9, 1.1)));      // muzzle
  parts.push(part(new THREE.ConeGeometry(0.04, 0.14, 5), col, M(0.07, 2.06, -1.0, -0.2, 0, 0.15)));          // ears
  parts.push(part(new THREE.ConeGeometry(0.04, 0.14, 5), col, M(-0.07, 2.06, -1.0, -0.2, 0, -0.15)));
  parts.push(part(limb([0, 2.0, -0.98], [0, 1.45, -0.55], 0.05, 0.06, 5), dark, M(0, 0.04, 0.03)));          // mane
  parts.push(part(limb([0, 1.32, 0.78], [0, 0.7, 1.02], 0.07, 0.12, 6), dark));                              // tail
  if (opts.harness) {
    parts.push(part(new THREE.TorusGeometry(0.27, 0.06, 6, 14), '#2a1a12', M(0, 1.5, -0.72, 0.9, 0, 0)));     // collar
    parts.push(part(new THREE.BoxGeometry(0.72, 0.05, 0.12), '#2a1a12', M(0, 1.28, -0.2)));                   // girth strap
    parts.push(part(limb([0.2, 1.3, -0.6], [0.2, 1.05, 1.2], 0.025), '#2a1a12'));                             // traces
    parts.push(part(limb([-0.2, 1.3, -0.6], [-0.2, 1.05, 1.2], 0.025), '#2a1a12'));
  }
  const body = new THREE.Group();
  body.add(new THREE.Mesh(merge(parts), null));
  g.add(body);
  const legs = [];
  const upperG = merge([part(limb([0, 0, 0], [0, -0.48, 0], 0.09, 0.06), col)]);
  const lowerG = merge([part(limb([0, 0, 0], [0, -0.38, 0], 0.05, 0.045), col),
    part(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 8), dark, M(0, -0.43, 0))]);
  for (const [x, z, front] of [[0.17, -0.52, 1], [-0.17, -0.52, 1], [0.17, 0.5, 0], [-0.17, 0.5, 0]]) {
    const hip = new THREE.Group(); hip.position.set(x, 0.99, z);
    const up = new THREE.Mesh(upperG, null); hip.add(up);
    const knee = new THREE.Group(); knee.position.set(0, -0.48, 0); hip.add(knee);
    knee.add(new THREE.Mesh(lowerG, null));
    body.add(hip);
    legs.push({ hip, knee, front: !!front, x });
  }
  return { group: g, body, legs };
}

/** pose a horse: phase in cycles, gait 0 = standing … 1 = walk … 2 = trot … 3 = gallop */
export function poseHorse(h, phase, gait) {
  const TAU = Math.PI * 2;
  const amp = gait < 1 ? gait * 0.25 : gait < 2 ? 0.25 + (gait - 1) * 0.2 : 0.45 + (gait - 2) * 0.25;
  const gallop = THREE.MathUtils.clamp(gait - 2, 0, 1);
  for (const L of h.legs) {
    // trot: diagonal pairs together; gallop: front pair then hind pair, a little apart
    const trotOff = (L.front ? 0 : 0.5) + (L.x > 0 ? 0 : 0.5);
    const galOff = (L.front ? 0 : 0.45) + (L.x > 0 ? 0 : 0.1);
    const off = trotOff * (1 - gallop) + galOff * gallop;
    const a = (phase + off) * TAU;
    L.hip.rotation.x = -Math.sin(a) * amp;
    L.knee.rotation.x = (L.front ? 1 : -0.6) * Math.max(0, Math.cos(a)) * amp * 1.6;
  }
  h.body.position.y = gait > 0.5 ? Math.abs(Math.sin(phase * TAU * (gallop > 0.5 ? 1 : 2))) * 0.05 * Math.min(gait, 2.5) : 0;
  h.body.rotation.x = gallop * Math.sin(phase * TAU) * 0.06;
}

// ------------------------------------------------------------------- people

const SKIN = '#b0785a', HAT = '#1d1a17';

/** the herdsman in his suba, leaning on his crook */
export function makeHerdsman() {
  const parts = [];
  const suba = new THREE.LatheGeometry([[0.0, 0.06], [0.47, 0.06], [0.44, 0.4], [0.36, 0.95], [0.29, 1.32], [0.2, 1.48], [0.0, 1.5]]
    .map(([r, y]) => new THREE.Vector2(r, y)), 16);
  parts.push(part(suba, '#e6d9bd'));
  // his face is strikingly round and red, as Csontváry painted it; a black moustache, a broad hat, a long pipe
  parts.push(part(new THREE.SphereGeometry(0.135, 14, 12), '#bf5a3c', M(0, 1.62, -0.02, 0, 0, 0, 1.0, 1.05, 0.95)));
  parts.push(part(new THREE.SphereGeometry(0.03, 6, 5), '#1a1210', M(0.05, 1.66, -0.135)));
  parts.push(part(new THREE.SphereGeometry(0.03, 6, 5), '#1a1210', M(-0.05, 1.66, -0.135)));
  parts.push(part(limb([-0.11, 1.57, -0.12], [0.11, 1.57, -0.12], 0.025, 0.025, 6), '#1d1410'));             // moustache
  parts.push(part(new THREE.CylinderGeometry(0.27, 0.26, 0.03, 18), HAT, M(0, 1.73, 0, -0.12, 0, 0.06)));     // the broad brim
  parts.push(part(new THREE.CylinderGeometry(0.11, 0.135, 0.14, 12), HAT, M(0, 1.81, 0.01, -0.12, 0, 0.06)));
  parts.push(part(limb([0.02, 1.55, -0.13], [-0.16, 1.18, -0.36], 0.018, 0.014, 6), '#5a3a22'));            // the pipe
  parts.push(part(new THREE.CylinderGeometry(0.045, 0.035, 0.09, 8), '#2a1a12', M(-0.17, 1.2, -0.37)));
  parts.push(part(new THREE.SphereGeometry(0.075, 8, 6), '#c47a5a', M(-0.05, 1.12, -0.33, 0, 0, 0, 1.4, 0.8, 1)));  // the hand on the suba
  parts.push(part(limb([0.32, 0.0, -0.25], [0.28, 1.45, -0.22], 0.025), '#5a4030'));                           // crook
  parts.push(part(new THREE.TorusGeometry(0.06, 0.018, 5, 10, Math.PI), '#5a4030', M(0.22, 1.47, -0.22)));
  return merge(parts);
}

/** the driver, seated (origin at the seat), reins in hand */
export function makeDriver() {
  const parts = [];
  parts.push(part(limb([0, 0.05, 0], [0, 0.62, -0.02], 0.2, 0.17, 10), '#ece6da'));                         // shirt
  parts.push(part(limb([0, 0.25, 0.01], [0, 0.6, 0.0], 0.205, 0.18, 10), '#1f1d1c', M(0, 0, 0.0)));          // vest
  parts.push(part(new THREE.SphereGeometry(0.11, 12, 10), SKIN, M(0, 0.76, -0.03, 0, 0, 0, 0.95, 1.1, 1)));
  parts.push(part(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 16), HAT, M(0, 0.86, -0.02)));
  parts.push(part(new THREE.CylinderGeometry(0.095, 0.11, 0.12, 12), HAT, M(0, 0.93, -0.02)));
  parts.push(part(new THREE.BoxGeometry(0.13, 0.03, 0.03), '#2a1d14', M(0, 0.71, -0.13)));
  for (const s of [1, -1]) {
    parts.push(part(limb([0.19 * s, 0.55, 0], [0.22 * s, 0.32, -0.22], 0.06, 0.05), '#ece6da'));          // arms
    parts.push(part(limb([0.22 * s, 0.32, -0.22], [0.12 * s, 0.32, -0.45], 0.05, 0.045), '#ece6da'));
    parts.push(part(limb([0.1 * s, 0.05, 0], [0.11 * s, 0.05, -0.42], 0.08, 0.07), '#222'));               // thighs
    parts.push(part(limb([0.11 * s, 0.05, -0.42], [0.12 * s, -0.42, -0.45], 0.065, 0.06), '#141210'));     // boots
  }
  return merge(parts);
}

// ------------------------------------------------------------------- the cart (lőcsös szekér)

/** cart rig: { group, wheels:[{mesh,r}], driver, pole }  — its middle on y=0, facing -z */
export function makeCart({ pole = true } = {}) {
  const wood = '#6d5236', woodDark = '#3e2c1d', iron = '#26221f';
  const g = new THREE.Group();
  const parts = [];
  const bedY = 0.95;
  parts.push(part(new THREE.BoxGeometry(0.9, 0.06, 3.0), wood, M(0, bedY, 0)));                          // floor
  for (const s of [1, -1]) {
    // the ladder sides, leaning out
    const lean = 0.32 * s;
    parts.push(part(limb([0.45 * s, bedY + 0.05, -1.55], [0.45 * s, bedY + 0.05, 1.55], 0.04), wood));
    parts.push(part(limb([0.72 * s, bedY + 0.62, -1.6], [0.72 * s, bedY + 0.62, 1.6], 0.045), wood));
    for (let i = 0; i < 9; i++) {
      const z = -1.45 + i * 0.36;
      parts.push(part(limb([0.45 * s, bedY + 0.05, z], [0.72 * s, bedY + 0.62, z], 0.022), woodDark));
    }
    // the lőcs: a curved prop from the axle end up to the top rail, front and back
    for (const z of [-1.1, 1.1]) parts.push(part(limb([0.6 * s, 0.45, z], [0.74 * s, bedY + 0.6, z * 0.98], 0.035), woodDark));
    void lean;
  }
  parts.push(part(new THREE.BoxGeometry(1.25, 0.05, 0.28), wood, M(0, bedY + 0.45, -1.0)));             // the seat board
  parts.push(part(new THREE.BoxGeometry(1.0, 0.12, 0.14), woodDark, M(0, 0.45, -1.1)));                 // axles
  parts.push(part(new THREE.BoxGeometry(1.05, 0.12, 0.14), woodDark, M(0, 0.55, 1.1)));
  if (pole) parts.push(part(limb([0, 0.45, -1.1], [0, 0.95, -4.3], 0.05, 0.04), wood));                // the pole (the driven cart draws its own, between the horses)
  parts.push(part(new THREE.BoxGeometry(1.1, 0.07, 0.09), woodDark, M(0, 0.7, -2.0)));                  // the swingletree bar
  parts.push(part(new THREE.CylinderGeometry(0.3, 0.38, 0.4, 10), '#b9a46a', M(0, bedY + 0.25, 0.7, 0, 0, 0, 1, 1, 1.6)));  // a load of hay
  parts.push(part(new THREE.BoxGeometry(0.5, 0.35, 0.4), '#7b5a3a', M(0.15, bedY + 0.2, 0.0)));          // a chest
  const body = new THREE.Mesh(merge(parts), null);
  g.add(body);
  const wheels = [];
  const wheelGeo = (r) => {
    const w = [];
    w.push(part(new THREE.TorusGeometry(r, 0.045, 6, 24), iron, M(0, 0, 0, 0, Math.PI / 2, 0)));
    w.push(part(new THREE.TorusGeometry(r - 0.05, 0.035, 5, 24), wood, M(0, 0, 0, 0, Math.PI / 2, 0)));
    w.push(part(new THREE.CylinderGeometry(0.09, 0.09, 0.22, 10), woodDark, M(0, 0, 0, 0, 0, Math.PI / 2)));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      w.push(part(limb([0, 0, 0], [0, Math.cos(a) * (r - 0.05), Math.sin(a) * (r - 0.05)], 0.022), wood));
    }
    return merge(w);
  };
  const fr = 0.45, rr = 0.55;
  const fG = wheelGeo(fr), rG = wheelGeo(rr);
  for (const [x, z, r, geo] of [[0.62, -1.1, fr, fG], [-0.62, -1.1, fr, fG], [0.66, 1.1, rr, rG], [-0.66, 1.1, rr, rG]]) {
    const m = new THREE.Mesh(geo, null);
    m.position.set(x, r, z);
    g.add(m);
    wheels.push({ mesh: m, r });
  }
  const driver = new THREE.Mesh(makeDriver(), null);
  driver.position.set(0.18, bedY + 0.48, -0.98);
  g.add(driver);
  // the whip: a long stick held up, its lash a soft curve
  const whip = new THREE.Group();
  whip.position.set(0.45, bedY + 0.8, -1.35);
  const whipGeo = merge([part(limb([0, 0, 0], [0.15, 1.3, -0.5], 0.018, 0.01), '#4a3524'),
    part(tube([[0.15, 1.3, -0.5], [0.3, 1.2, -0.2], [0.35, 0.9, 0.2], [0.3, 0.6, 0.4]], 0.008, 0.004, 10, 4), '#2a1f17')]);
  whip.add(new THREE.Mesh(whipGeo, null));
  g.add(whip);
  return { group: g, body, wheels, driver, whip };
}

// ------------------------------------------------------------------- grey cattle

/** the body of a Hungarian grey (head and horns apart), facing -z, hooves on y=0 */
export function makeCowBody() {
  const parts = [];
  const hide = '#e4dfd3', dark = '#3a3430';
  const fore = (c, x, y, z) => c.set(z < -0.35 ? '#c4beb2' : hide);
  parts.push(part(new THREE.CapsuleGeometry(0.39, 1.2, 8, 14), fore, M(0, 1.1, 0.02, Math.PI / 2, 0, 0, 0.76, 1, 0.95)));
  parts.push(part(new THREE.SphereGeometry(0.36, 10, 8), '#cdc7ba', M(0, 1.12, -0.55, 0, 0, 0, 0.78, 0.95, 0.9)));  // chest
  parts.push(part(new THREE.SphereGeometry(0.3, 10, 8), hide, M(0, 1.2, 0.62, 0, 0, 0, 0.85, 0.85, 0.8)));          // rump
  parts.push(part(new THREE.SphereGeometry(0.22, 8, 6), '#cfc8bb', M(0, 0.8, -0.72, 0, 0, 0, 0.55, 1.0, 0.8)));     // dewlap
  for (const [x, z] of [[0.2, -0.55], [-0.2, -0.55], [0.2, 0.6], [-0.2, 0.6]]) {
    parts.push(part(limb([x, 0.95, z], [x, 0.06, z], 0.12, 0.08), hide));
    parts.push(part(new THREE.CylinderGeometry(0.075, 0.085, 0.09, 8), dark, M(x, 0.045, z)));
  }
  parts.push(part(limb([0, 1.22, 0.9], [0, 0.5, 1.0], 0.04, 0.03, 5), hide));
  parts.push(part(new THREE.SphereGeometry(0.07, 6, 5), dark, M(0, 0.46, 1.0, 0, 0, 0, 1, 1.6, 1)));
  return merge(parts);
}

/** the head with its lyre horns; origin at the neck joint (0, 1.15, -0.72 on the body) */
export function makeCowHead() {
  const parts = [];
  parts.push(part(limb([0, 0, 0.1], [0, -0.03, -0.38], 0.3, 0.2, 10), '#c2bbaf'));                      // neck
  parts.push(part(limb([0, 0.02, -0.32], [0, -0.34, -0.74], 0.17, 0.125, 10), '#e4ded2'));              // head
  parts.push(part(new THREE.SphereGeometry(0.11, 8, 6), '#2e2724', M(0, -0.34, -0.74, 0, 0, 0, 1, 0.8, 0.9)));  // muzzle
  parts.push(part(new THREE.SphereGeometry(0.035, 6, 4), '#111', M(0.11, -0.08, -0.48)));
  parts.push(part(new THREE.SphereGeometry(0.035, 6, 4), '#111', M(-0.11, -0.08, -0.48)));
  for (const s of [1, -1]) {
    parts.push(part(new THREE.ConeGeometry(0.06, 0.18, 5), '#d8d1c4', M(0.17 * s, 0.0, -0.36, 0, 0, -1.6 * s)));   // ears
    // the horn: out, up, then the tips turning out and back — a lyre
    const h = tube([[0.08 * s, 0.08, -0.34], [0.32 * s, 0.14, -0.36], [0.52 * s, 0.38, -0.34], [0.58 * s, 0.68, -0.22], [0.66 * s, 0.86, -0.1]], 0.05, 0.012, 14, 6);
    parts.push(part(h, (c, x, y) => c.set(y > 0.62 ? '#2b2420' : '#e9e0cc')));
  }
  return merge(parts);
}

/** a white, shaggy herd dog */
export function makeDog() {
  const parts = [];
  const coat = '#ece6d6';
  parts.push(part(new THREE.CapsuleGeometry(0.22, 0.55, 5, 10), coat, M(0, 0.55, 0, Math.PI / 2, 0, 0, 0.95, 1, 1)));
  parts.push(part(new THREE.SphereGeometry(0.2, 10, 8), coat, M(0, 0.72, -0.48, 0, 0, 0, 1, 1, 1.05)));
  parts.push(part(new THREE.SphereGeometry(0.05, 6, 4), '#111', M(0, 0.68, -0.68)));
  for (const [x, z] of [[0.12, -0.25], [-0.12, -0.25], [0.12, 0.25], [-0.12, 0.25]]) parts.push(part(limb([x, 0.45, z], [x, 0.0, z], 0.08, 0.07), coat));
  parts.push(part(limb([0, 0.62, 0.4], [0, 0.35, 0.55], 0.08, 0.06), coat));
  return merge(parts);
}

// ------------------------------------------------------------------- the well sweep (gémeskút)

/** a well sweep (gémeskút). `ground(lx, lz)`: the ground's height there, relative to the foot of the post — on a
 *  slope the curb and the trough stand on their own ground (and reach down into it), not on the post's level */
export function makeWell(ground = () => 0) {
  const wood = '#6b5a46', dark = '#3f3428';
  const parts = [];
  const gc = ground(0, -5.2), gt = Math.min(ground(1.3, -3.0), ground(1.3, -6.2)), gtop = Math.max(ground(1.3, -3.0), ground(1.3, -6.2));
  parts.push(part(limb([0, -0.6, 0], [0, 4.0, 0], 0.15, 0.12), wood));                                  // the forked post
  parts.push(part(limb([0, 3.9, 0], [0.18, 4.35, 0], 0.07), wood));
  parts.push(part(limb([0, 3.9, 0], [-0.18, 4.35, 0], 0.07), wood));
  // the sweep: pivoted at the fork, its long arm up over the well, a weight on the short arm
  const piv = [0, 4.2, 0], tip = [0, 7.0, -5.2], back = [0, 2.7, 2.6];
  parts.push(part(limb(back, tip, 0.1, 0.05), wood));
  parts.push(part(new THREE.BoxGeometry(0.35, 0.35, 0.5), '#6f6a62', M(back[0], back[1] - 0.1, back[2])));
  const by = Math.min(gc + 2.05, tip[1] - 1.2);                                                         // the bucket hangs over the curb
  parts.push(part(limb(tip, [0, by + 0.15, -5.2], 0.03), dark));                                        // the pole down to the bucket
  parts.push(part(new THREE.CylinderGeometry(0.15, 0.12, 0.3, 8), dark, M(0, by, -5.2)));
  // the curb and the trough, each on its own ground, their sides going down into the slope
  parts.push(part(new THREE.BoxGeometry(1.2, 1.8, 1.2), wood, M(0, gc - 0.1, -5.2)));
  parts.push(part(new THREE.BoxGeometry(0.95, 0.1, 0.95), '#1e1a16', M(0, gc + 0.77, -5.2)));
  const th = gtop + 0.45 - (gt - 0.6);
  parts.push(part(new THREE.BoxGeometry(0.6, th, 3.2), wood, M(1.3, gtop + 0.45 - th / 2, -4.6)));
  void piv;
  return merge(parts);
}

// ------------------------------------------------------------------- buildings

/** a long, whitewashed, reed-roofed house (csárda, tanya). Returns { walls, roof, wood } geometries */
export function makeHouse({ w = 14, d = 7, h = 2.8, roofH = 4.2, porch = true, chimneys = 1, seed = 1 } = {}) {
  const white = '#e9e1cf', plinth = '#8f8574', shutter = '#38543f', glass = '#1b1c20';
  const walls = [], wood = [];
  walls.push(part(new THREE.BoxGeometry(w, h, d), (c, x, y) => c.set(y < 0.45 ? plinth : white), M(0, h / 2, 0)));
  // Windows on both long sides. On the front (the porch side) the doors, as on the houses of the Plain in his time:
  //  - in the middle bay the door of the pitvar: a single leaf in a plank frame, standing open by day (a dark
  //    doorway, as on his Felvidéki utca), and before it the low outer half-door of laths (lécrácsos félajtó, verőce);
  //  - on a longer house, in the last bay, the door of the kamra: shut, of upright planks held by two battens.
  const nWin = Math.max(2, Math.floor(w / 3.2));
  const di = Math.floor((nWin - 1) / 2), ki = w >= 12 ? nWin - 1 : -1;
  const frame = '#7a6248', lath = '#8a7458', plank = '#5a3d27', batten = '#46301f', sill = '#9a9080';
  const doorway = (x, shut) => {
    const zf = -d / 2 - 0.02, dw = 1.05, dh = 1.95;
    for (const e of [1, -1]) wood.push(part(new THREE.BoxGeometry(0.12, dh + 0.1, 0.12), frame, M(x + e * (dw / 2 + 0.06), (dh + 0.1) / 2, zf)));
    wood.push(part(new THREE.BoxGeometry(dw + 0.34, 0.14, 0.14), frame, M(x, dh + 0.1, zf)));
    wood.push(part(new THREE.BoxGeometry(dw + 0.3, 0.1, 0.34), sill, M(x, 0.05, zf - 0.1)));                // the threshold stone
    if (shut) {
      for (let k = 0; k < 4; k++) wood.push(part(new THREE.BoxGeometry(dw / 4 - 0.015, dh, 0.05), k % 2 ? plank : '#62442c', M(x - dw / 2 + (k + 0.5) * (dw / 4), dh / 2, zf - 0.01)));
      for (const y of [0.45, 1.5]) wood.push(part(new THREE.BoxGeometry(dw - 0.06, 0.13, 0.04), batten, M(x, y, zf - 0.05)));
      wood.push(part(new THREE.BoxGeometry(0.05, 0.16, 0.05), '#1d1a17', M(x + dw / 2 - 0.14, 1.0, zf - 0.06)));   // the latch
    } else {
      wood.push(part(new THREE.BoxGeometry(dw, dh, 0.05), '#17130f', M(x, dh / 2, zf + 0.03)));              // the dark of the pitvar
      wood.push(part(new THREE.BoxGeometry(0.05, dh, 0.5), plank, M(x - dw / 2 + 0.03, dh / 2, zf + 0.3)));    // the leaf, swung in
      // the half-door of laths
      const hh = 1.0, n = 6;
      for (let k = 0; k < n; k++) wood.push(part(new THREE.BoxGeometry(0.07, hh, 0.035), lath, M(x - dw / 2 + 0.07 + k * ((dw - 0.14) / (n - 1)), hh / 2 + 0.06, zf - 0.08)));
      for (const y of [0.22, hh - 0.05]) wood.push(part(new THREE.BoxGeometry(dw, 0.08, 0.04), lath, M(x, y, zf - 0.11)));
    }
  };
  for (let i = 0; i < nWin; i++) {
    const x = -w / 2 + (i + 0.5) * (w / nWin);
    for (const s of [1, -1]) {
      if (s === -1 && (i === di || i === ki)) { doorway(x, i === ki); continue; }
      const z = s * (d / 2 + 0.02);
      wood.push(part(new THREE.BoxGeometry(0.7, 0.8, 0.05), glass, M(x, 1.55, z)));
      wood.push(part(new THREE.BoxGeometry(0.34, 0.86, 0.06), shutter, M(x - 0.55, 1.55, z)));
      wood.push(part(new THREE.BoxGeometry(0.34, 0.86, 0.06), shutter, M(x + 0.55, 1.55, z)));
    }
  }
  // the hipped reed roof, low over the walls
  const ov = 0.7, W2 = w / 2 + ov, D2 = d / 2 + ov, rl = Math.max(0.5, W2 - D2 * 0.95), y0 = h - 0.15, y1 = h + roofH;
  const A = [-W2, y0, -D2], Bp = [W2, y0, -D2], C = [W2, y0, D2], Dp = [-W2, y0, D2], R1 = [-rl, y1, 0], R2 = [rl, y1, 0];
  const tri = [...A, ...R2, ...Bp, ...A, ...R1, ...R2, ...Dp, ...C, ...R2, ...Dp, ...R2, ...R1, ...A, ...Dp, ...R1, ...Bp, ...R2, ...C];
  void tri;
  // the thatch lies in level tiers, each a little proud of the one above (Felvidéki utca): ochre and brown by turns,
  // the ridge dark
  const tiers = 6, roof = [];
  const Wt = (t) => W2 + (rl - W2) * t, Dt = (t) => D2 * (1 - t), Yt = (t) => y0 + (y1 - y0) * t;
  for (let k = 0; k < tiers; k++) {
    const t0 = k / tiers, t1 = (k + 1) / tiers, st = k ? 0.1 : 0;
    const w0 = Wt(t0) + st, d0 = Dt(t0) + st, w1 = Wt(t1), d1 = Dt(t1), ya = Yt(t0) - (k ? 0.06 : 0), yb = Yt(t1);
    const a = [[-w0, ya, -d0], [w0, ya, -d0], [w0, ya, d0], [-w0, ya, d0]], b = [[-w1, yb, -d1], [w1, yb, -d1], [w1, yb, d1], [-w1, yb, d1]];
    const tt = [];
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; tt.push(...a[i], ...b[j], ...a[j], ...a[i], ...b[i], ...b[j]); }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute(tt, 3));
    tg.computeVertexNormals();
    const tone = k === tiers - 1 ? '#5f5238' : (k + seed) % 2 ? '#8e7a4d' : '#a38d5b';
    roof.push(part(tg, (c, x, y) => c.set(tone).offsetHSL(0, 0, y - ya < 0.12 ? -0.05 : 0)));
  }
  if (porch) {
    // the tornác: white columns along the front under the roof's eave
    for (let i = 0; i <= nWin; i++) {
      const x = -w / 2 + 0.3 + i * ((w - 0.6) / nWin);
      walls.push(part(new THREE.BoxGeometry(0.32, h - 0.1, 0.32), white, M(x, (h - 0.1) / 2, -d / 2 - 0.55)));
    }
  }
  for (let i = 0; i < chimneys; i++) {
    const x = (i - (chimneys - 1) / 2) * (w * 0.4);
    walls.push(part(new THREE.BoxGeometry(0.55, 1.6, 0.55), white, M(x, y1 - 0.6, 0.2)));
  }
  void seed;
  return { walls: merge(walls), roof: merge(roof), wood: wood.length ? merge(wood) : null };
}

/** a haystack (boglya): round, its top drawn to a point */
export function makeHaystack() {
  const prof = [[0, 3.2], [0.35, 3.15], [0.9, 2.8], [1.45, 2.0], [1.65, 1.1], [1.6, 0.25], [1.45, 0]].map(([r, y]) => new THREE.Vector2(r, y));
  return merge([part(new THREE.LatheGeometry(prof, 14), (c, x, y) => c.set(y > 2.6 ? '#8e7a48' : '#b49c5c')),
    part(limb([0, 2.8, 0], [0.05, 3.8, 0.02], 0.03), '#4a3a28')]);
}

/** a lone tree: { trunk, crown } — crown in world-stroke leaf paint */
export function makeTree(rng, { height = 9, spread = 3.4, poplar = false } = {}) {
  const bark = '#3b2e24';
  const lean = (rng() - 0.5) * 0.07 * height;
  const trunk = [part(limb([0, 0, 0], [lean * 0.4, height * 0.3, 0], 0.3, 0.22), bark), part(limb([lean * 0.4, height * 0.3, 0], [lean, height * 0.58, 0], 0.22, 0.14), bark)];
  const crown = [];
  // His foliage is a soft, ragged mass dabbed light over dark (the tree at Mostar's bridgehead, Felvidéki utca), not
  // a ball: each lump's surface is pushed in and out so its edge is broken, lighter and yellower where it faces up.
  const cDark = new THREE.Color(), cLight = new THREE.Color(), v = new THREE.Vector3();
  const lump = (x, y, z, sx, sy, sz, dark, light) => {
    const g = new THREE.IcosahedronGeometry(1, 2);
    const p = g.attributes.position, nrm = g.attributes.normal, ph = rng() * 20;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).normalize();
      const f = 1 + 0.16 * Math.sin(v.x * 4.1 + ph) * Math.sin(v.y * 3.7 + ph * 1.7) + 0.09 * Math.sin(v.z * 6.1 + v.x * 3.3 + ph * 0.6);
      nrm.setXYZ(i, v.x, v.y, v.z);
      p.setXYZ(i, v.x * f, v.y * f, v.z * f);
    }
    cDark.set(dark).offsetHSL((rng() - 0.5) * 0.03, 0, (rng() - 0.5) * 0.05); cLight.set(light);
    const m = M(x, y, z, rng() * 0.5, rng() * 6, 0, sx, sy, sz);
    crown.push(part(g, (c, px, py, pz, i, gg) => {
      const up = gg.attributes.normal.getY(i);
      const dab = Math.sin(px * 3.7 + pz * 2.9) * Math.sin(py * 4.3 + px * 1.3);   // touches of light among the dark
      c.copy(cDark).lerp(cLight, Math.min(1, Math.max(0, 0.15 + up * 0.55 + dab * 0.35)));
    }, m));
  };
  if (poplar) {
    // a jegenye: a tall, narrow flame of leaves, its outline stepped
    const n = 9;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, r = spread * 0.5 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.1 + t * 0.86)), 0.75) * (0.92 + rng() * 0.16);
      lump((rng() - 0.5) * 0.2 + lean, height * (0.17 + 0.8 * t), (rng() - 0.5) * 0.2, r, height * 0.11, r, '#4f6f37', '#8aa552');
    }
  } else {
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2, r = (i ? rng() : 0) * spread * 0.62;
      const s = spread * (i ? 0.34 + rng() * 0.3 : 0.62);
      lump(lean + Math.cos(a) * r, height * (i ? 0.58 + rng() * 0.34 : 0.74), Math.sin(a) * r, s, s * (0.7 + rng() * 0.2), s, '#3f5a2a', '#7f9c48');
      if (i < 5) trunk.push(part(limb([lean, height * 0.46, 0], [lean + Math.cos(a) * r * 0.8, height * 0.68, Math.sin(a) * r * 0.8], 0.12, 0.06), bark));
    }
  }
  return { trunk: merge(trunk), crown: merge(crown) };
}
