// The living things of the plain: the grey cattle (grazing, drinking, ambling, stepping out of the cart's way), the
// csikósok galloping their round, the herd dog running with the cart, and the drops of sunlight to gather.
import * as THREE from 'three';
import * as MD from './models.js';
import { paintMaterial } from './paint.js';
import { BRIDGES, fromBridge, groundY, paintingToGround, PAINTED, riverEdge, rng, terrainH, toBridge } from './world.js';

// herds: centre, radius, count. The first ones are the painting's own: the cattle drinking on the far bank,
// the herd on the plain behind them, and the three on our bank in the foreground.
export const HERDS = [
  { x: -22, z: -31, r: 14, n: 6, drink: true },
  { x: -55, z: -110, r: 35, n: 16 },
  { x: 150, z: 170, r: 35, n: 14 },
  { x: -230, z: 120, r: 35, n: 12 },
  { x: 120, z: -250, r: 30, n: 10 },
];
const FOREGROUND = PAINTED.cattle.map((c) => { const g = paintingToGround(c.px, c.py); return [g.x, g.z, c.yaw, c.s]; });
const COW_COATS = ['grey', 'grey', 'cream', 'greyDark'];

/** stand a beast on the ground under its hooves, not just under its middle: tilted along its length and across, so on
 * a bank or a hillside no hoof hangs in the air (len: fore to hind hooves, wid: left to right, at scale 1) */
export function standOn(root, x, z, yaw, len = 1.3, wid = 0.45, k = 1) {
  const s = root.scale.x, L = len * s / 2, Wd = wid * s / 2;
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = -fz, rz = fx;
  const gf = groundY(x + fx * L, z + fz * L), gb = groundY(x - fx * L, z - fz * L);
  const gr = groundY(x + rx * Wd, z + rz * Wd), gl = groundY(x - rx * Wd, z - rz * Wd);
  const pitch = Math.max(-0.5, Math.min(0.5, Math.atan2(gf - gb, 2 * L)));
  const roll = Math.max(-0.35, Math.min(0.35, Math.atan2(gr - gl, 2 * Wd)));
  const y = Math.min((gf + gb) / 2, (gl + gr) / 2 + 0.02);
  root.userData.pitch = root.userData.pitch === undefined ? pitch : root.userData.pitch + (pitch - root.userData.pitch) * k;
  root.userData.roll = root.userData.roll === undefined ? roll : root.userData.roll + (roll - root.userData.roll) * k;
  root.position.set(x, y, z);
  root.rotation.set(root.userData.pitch, yaw, root.userData.roll, 'YXZ');
}

export class Cattle {
  constructor(scene, animals, herds = HERDS, { kind = 'cow', coats = COW_COATS, foreground = true, seed = 77 } = {}) {
    const R = rng(seed);
    this.cows = [];
    this.kind = kind;
    const place = (x, z, yaw, opts = {}) => {
      const a = animals.make(kind, coats[Math.floor(R() * coats.length)]);
      scene.add(a.root);
      a.root.scale.setScalar(0.92 + R() * 0.16);
      this.cows.push({ a, x, z, yaw, home: { x, z }, hr: opts.hr || 10, target: null, t: R() * 6,
        mode: opts.drink ? 'drink' : opts.fixed ? 'idle' : 'graze', speed: 0, fixed: !!opts.fixed });
    };
    if (foreground) for (const [x, z, yaw, s] of FOREGROUND) { place(x, z, yaw, { fixed: true, hr: 2 }); this.cows[this.cows.length - 1].a.root.scale.setScalar(s); }
    for (const h of herds) {
      let k = 0, tries = 0;
      while (k < h.n && tries++ < 400) {
        const ang = R() * Math.PI * 2, r = Math.sqrt(R()) * h.r;
        const x = h.x + Math.cos(ang) * r, z = h.z + Math.sin(ang) * r;
        const e = riverEdge(x, z);
        if (h.drink) { if (e < 0.4 || e > 3) continue; } else if (e < 4) continue;
        place(x, z, h.drink ? Math.PI + (R() - 0.5) * 1.6 : R() * Math.PI * 2, { drink: h.drink, hr: h.r });
        k++;
      }
    }
    this.rand = R;
    this.frameNo = 0;
    this.update(0.016, null, null);
  }

  update(dt, cart, cam) {
    const R = this.rand;
    this.frameNo++;
    for (const [i, c] of this.cows.entries()) {
      if (!c.fixed) {
        c.t -= dt;
        let fleeing = false;
        if (cart) {
          const dx = c.x - cart.x, dz = c.z - cart.z, d2 = dx * dx + dz * dz;
          if (d2 < 120 && Math.abs(cart.speed) > 0.5) {
            fleeing = true;
            const d = Math.sqrt(d2) + 1e-3;
            c.target = { x: c.x + (dx / d) * 9, z: c.z + (dz / d) * 9 };
            c.mode = 'walk'; c.t = 3;
          }
        }
        if (c.t <= 0) {
          if (c.mode === 'walk' || c.mode === 'drink' || R() < 0.6) {
            c.mode = c.mode === 'drink' ? 'drink' : R() < 0.75 ? 'graze' : 'idle'; c.t = 5 + R() * 12; c.target = null;
          } else {
            const ang = R() * Math.PI * 2, r = Math.sqrt(R()) * c.hr;
            c.target = { x: c.home.x + Math.cos(ang) * r, z: c.home.z + Math.sin(ang) * r };
            c.mode = 'walk'; c.t = 14;
          }
        }
        let want = 0;
        if (c.mode === 'walk' && c.target) {
          const dx = c.target.x - c.x, dz = c.target.z - c.z, d = Math.hypot(dx, dz);
          if (d < 0.6) { c.mode = 'graze'; c.t = 4 + R() * 8; c.target = null; }
          else {
            const yaw = Math.atan2(-dx, -dz);
            let dy = yaw - c.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
            c.yaw += dy * Math.min(1, dt * 1.8);
            want = fleeing ? 2.4 : 0.85;
          }
        }
        c.speed += (want - c.speed) * Math.min(1, dt * 2);
        const nx = c.x - Math.sin(c.yaw) * c.speed * dt, nz = c.z - Math.cos(c.yaw) * c.speed * dt;
        if (riverEdge(nx, nz) > 0.5) { c.x = nx; c.z = nz; } else { c.target = null; c.mode = 'graze'; }
      }
      const a = c.a;
      standOn(a.root, c.x, c.z, c.yaw, 1.3, 0.45, Math.min(1, dt * 8));
      if (c.speed > 0.2) a.play(c.speed > 1.5 ? 'Gallop' : 'Walk', 0.4, c.speed > 1.5 ? c.speed / 6 : c.speed / 0.9);
      else a.play(c.mode === 'graze' || c.mode === 'drink' ? 'Eating' : (i % 2 ? 'Idle' : 'Idle_2'), 0.6, 1);
      // far away, the animation can go at a slower beat
      let far = 1;
      if (cam) { const d2 = (cam.position.x - c.x) ** 2 + (cam.position.z - c.z) ** 2; far = d2 > 300 * 300 ? 6 : d2 > 120 * 120 ? 2 : 1; }
      if ((this.frameNo + i) % far === 0) a.mixer.update(dt * far);
    }
  }
}

// ------------------------------------------------------------------- the csikósok

export function makeRider(shirt = '#3d5a8a', { lady = false, hat = '#1d1a17' } = {}) {
  const p = [];
  if (lady) {
    // the riding habit: a long skirt falling down the horse's near side, a fitted jacket, a broad pale hat
    const prof = [[0.0, 0.3], [0.2, 0.3], [0.3, 0.0], [0.42, -0.55], [0.46, -0.85], [0.0, -0.86]].map(([r, y]) => new THREE.Vector2(r, y));
    p.push(MD.part(new THREE.LatheGeometry(prof, 12), shirt, MD.M(0.12, 0, 0, 0, 0, 0, 0.8, 1, 0.9)));
    p.push(MD.part(MD.limb([0, 0.25, 0], [0, 0.62, -0.06], 0.15, 0.13, 9), shirt));
    p.push(MD.part(new THREE.SphereGeometry(0.1, 10, 8), '#c99a7a', MD.M(0, 0.76, -0.08)));
    p.push(MD.part(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 16), hat, MD.M(0, 0.86, -0.08, 0.15, 0, 0)));
    p.push(MD.part(new THREE.CylinderGeometry(0.11, 0.12, 0.1, 12), hat, MD.M(0, 0.92, -0.08, 0.15, 0, 0)));
    p.push(MD.part(MD.limb([0.15, 0.52, -0.05], [0.2, 0.3, -0.32], 0.045), shirt));
    p.push(MD.part(MD.limb([-0.15, 0.52, -0.05], [-0.18, 0.3, -0.32], 0.045), shirt));
    return MD.merge(p);
  }
  p.push(MD.part(MD.limb([0, 0, 0], [0, 0.6, -0.08], 0.17, 0.15, 9), shirt));
  p.push(MD.part(MD.limb([0, 0.28, 0], [0, 0.58, -0.07], 0.175, 0.16, 9), '#1f1d1c'));
  p.push(MD.part(new THREE.SphereGeometry(0.11, 10, 8), '#b0785a', MD.M(0, 0.74, -0.1, 0, 0, 0, 0.95, 1.1, 1)));
  p.push(MD.part(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 14), hat, MD.M(0, 0.84, -0.1)));
  p.push(MD.part(new THREE.CylinderGeometry(0.095, 0.11, 0.12, 10), hat, MD.M(0, 0.91, -0.1)));
  for (const s of [1, -1]) {
    p.push(MD.part(MD.limb([0.13 * s, 0.02, 0], [0.3 * s, -0.25, -0.15], 0.08, 0.07), '#e8e2d4'));      // the wide gatya
    p.push(MD.part(MD.limb([0.3 * s, -0.25, -0.15], [0.27 * s, -0.62, 0.0], 0.07, 0.05), '#161311'));  // boots
  }
  p.push(MD.part(MD.limb([0.18, 0.52, -0.05], [0.25, 0.3, -0.35], 0.05), shirt));
  p.push(MD.part(MD.limb([-0.18, 0.52, -0.05], [-0.3, 0.95, -0.2], 0.05), shirt));           // the whip arm up
  p.push(MD.part(MD.limb([-0.3, 0.95, -0.2], [-0.5, 1.9, 0.35], 0.012, 0.006), '#3a2a1e'));
  return MD.merge(p);
}

/** a rider who stays in the saddle: rises and falls with the horse's body bone */
export function mountRider(horse, mesh, seat = 1.55) {
  horse.root.add(mesh);
  mesh.position.set(0, seat, -0.1);
  const body = horse.bones.Body;
  const w = new THREE.Vector3(), r = new THREE.Vector3();
  horse.root.updateMatrixWorld(true);
  const rest = body.getWorldPosition(w).y - horse.root.getWorldPosition(r).y;
  return () => {
    body.getWorldPosition(w); horse.root.getWorldPosition(r);
    mesh.position.y = seat + (w.y - r.y - rest) * 0.9;
  };
}

export class Riders {
  /** a ring of riders: the csikósok at a gallop, or a slow procession (walk) */
  constructor(scene, animals, { path = { cx: -160, cz: -250, rx: 150, rz: 90 }, line = null, speed = 10, clip = 'Gallop', timeScale = 1.05,
    coats = ['bay', 'white', 'black', 'chestnut'], shirts = ['#3d5a8a', '#2f4f7a', '#465f8f', '#3a4e6e'], gap = 7, ladies = [], hats = [], spread = 1 } = {}) {
    this.riderMat = paintMaterial('cloth', 0xffffff, { vertexColors: true });
    this.riders = [];
    for (let i = 0; i < coats.length; i++) {
      const h = animals.make('horse', coats[i]);
      scene.add(h.root);
      h.play(clip, 0, timeScale);
      const rider = makeRider(shirts[i % shirts.length], { lady: ladies.includes(i), hat: hats[i % (hats.length || 1)] || '#1d1a17' });
      const follow = mountRider(h, new THREE.Mesh(rider, this.riderMat));
      this.riders.push({ h, follow, s: i * gap + (i % 2) * 3, side: (i % 2 ? 1 : -1) * (1 + (i % 3) * 0.6) * spread });
    }
    this.speed = speed;
    this.path = path;
    this.line = line;
    if (line) {
      this.cum = [0];
      for (let i = 1; i < line.length; i++) this.cum.push(this.cum[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
      this.L = this.cum[this.cum.length - 1];
    }
  }
  pointAt(s) {
    if (this.line) {
      // to and fro along the line: there, turn about, back
      const L = this.L, u0 = ((s % (2 * L)) + 2 * L) % (2 * L), back = u0 > L, u = back ? 2 * L - u0 : u0;
      let i = 1; while (i < this.cum.length - 1 && this.cum[i] < u) i++;
      const a = this.line[i - 1], b = this.line[i], t = (u - this.cum[i - 1]) / Math.max(1e-6, this.cum[i] - this.cum[i - 1]);
      const tx = (b[0] - a[0]) * (back ? -1 : 1), tz = (b[1] - a[1]) * (back ? -1 : 1);
      return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, tx, tz };
    }
    const P = this.path, L = 2 * Math.PI * Math.sqrt((P.rx * P.rx + P.rz * P.rz) / 2);
    const a = (s / L) * Math.PI * 2;
    return { x: P.cx + Math.cos(a) * P.rx, z: P.cz + Math.sin(a) * P.rz, tx: -Math.sin(a) * P.rx, tz: Math.cos(a) * P.rz };
  }
  update(dt) {
    for (const r of this.riders) {
      r.s += this.speed * dt;
      const p = this.pointAt(r.s);
      const tl = Math.hypot(p.tx, p.tz), tx = p.tx / tl, tz = p.tz / tl;
      const x = p.x + -tz * r.side, z = p.z + tx * r.side;
      const ox = x, oz = z;
      const yaw = Math.atan2(-tx, -tz);
      if (r.yaw === undefined) r.yaw = yaw;
      let dy = yaw - r.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      r.yaw += dy * Math.min(1, dt * 2.5);                        // turning about takes a moment
      standOn(r.h.root, ox, oz, r.yaw, 1.3, 0.45, Math.min(1, dt * 8));
      r.h.mixer.update(dt);
      r.follow();
    }
  }
}

/** the herd dog: keeps to the cart's right side, trotting and galloping with it */
export class Dog {
  constructor(scene, animals) {
    this.a = animals.make('dog', 'white');
    scene.add(this.a.root);
    this.x = 0; this.z = 0; this.yaw = 0; this.speed = 0;
  }
  place(x, z, yaw) { this.x = x; this.z = z; this.yaw = yaw; }
  /** on a bridge the dog keeps to the road between the parapets: (x, z) brought back into that lane (null: not on one) */
  static lane(x, z, ifCartOn = null) {
    for (const b of BRIDGES) {
      const bl = toBridge(x, z, b);
      if (Math.abs(bl.x) >= b.len) continue;
      // the dog itself counts as on the bridge while it is over the road or the parapets and the road is off the ground;
      // its goal beside the cart counts whenever the cart is on the bridge
      if (ifCartOn) { const cl = toBridge(ifCartOn.x, ifCartOn.z, b); if (Math.abs(cl.x) >= b.len || Math.abs(cl.z) >= b.width / 2) continue; }
      else if (Math.abs(bl.z) > b.width / 2 + 0.3 || b.deck(bl.x) < 0.4) continue;
      const lim = b.width / 2 - (b.wall ? (b.id === 'kilenc' ? 0.55 : 0.35) : 0.15) - 0.5;
      if (Math.abs(bl.z) <= lim) return null;
      return fromBridge(bl.x, Math.sign(bl.z) * lim, b);
    }
    return null;
  }
  update(dt, cart) {
    const f = cart.forward, rx = -f.z, rz = f.x;
    // what the cart cannot drive through, the dog does not run through either (wells, houses, people, water)
    // … nor through the beasts (cattle, horses, riders) or the cart and its team: `beasts` gives them as circles
    const blocked = cart.world?.blocked, beasts = this.beasts?.() || [];
    const solid = (x, z) => {
      if (blocked && blocked(x, z)) return true;
      for (const o of beasts) if ((x - o.x) ** 2 + (z - o.z) ** 2 < (o.r + 0.3) ** 2) return true;
      return false;
    };
    let tx = cart.x + rx * 2.4 - f.x * 1.0, tz = cart.z + rz * 2.4 - f.z * 1.0;
    // its place is at the cart's right wheel; where something stands there, at the left one, or behind the cart
    for (const [side, back] of [[2.4, 1.0], [-2.4, 1.0], [0, 3.4]]) {
      tx = cart.x + rx * side - f.x * back; tz = cart.z + rz * side - f.z * back;
      if (!solid(tx, tz)) break;
    }
    const tl = Dog.lane(tx, tz, cart);
    if (tl) { tx = tl.x; tz = tl.z; }
    const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz);
    const want = d < 0.4 ? 0 : Math.min(14, d * 1.6 + Math.abs(cart.speed) * 0.6);
    this.speed += (want - this.speed) * Math.min(1, dt * 4);
    if (d > 0.05) {
      const yaw = Math.atan2(-dx, -dz);
      let dy = yaw - this.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.yaw += dy * Math.min(1, dt * 6);
    }
    if (d > 40) { this.x = tx; this.z = tz; }
    // a step along its heading; if something stands there, round it: the nearest free heading to either side
    // (already inside something — set down there, or a beast walked over it — it may always walk out)
    const step = this.speed * dt, inside = solid(this.x, this.z);
    let moved = step <= 0;
    for (const turn of [0, 0.5, -0.5, 1.0, -1.0, 1.5, -1.5]) {
      if (moved) break;
      const a = this.yaw + turn, nx = this.x - Math.sin(a) * step, nz = this.z - Math.cos(a) * step;
      // (looking a little ahead as well, so that it turns before it touches)
      if (!inside && (solid(nx, nz) || solid(nx - Math.sin(a) * 0.45, nz - Math.cos(a) * 0.45))) continue;
      this.x = nx; this.z = nz; moved = true;
      if (turn) this.yaw += turn * Math.min(1, dt * 10);
    }
    if (!moved) this.speed = 0;
    // shut in behind something long for a while (a wall, the river): it finds its way back to the cart
    this.stuck = !moved || (this.speed < 0.5 && d > 6) ? (this.stuck || 0) + dt : 0;
    if (this.stuck > 2.5 && !solid(tx, tz)) { this.x = tx; this.z = tz; this.stuck = 0; }
    const dl = Dog.lane(this.x, this.z);
    if (dl) { this.x = dl.x; this.z = dl.z; }
    if (this.speed < 0.3) { let dy = cart.yaw - this.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); this.yaw += dy * Math.min(1, dt * 2); }
    standOn(this.a.root, this.x, this.z, this.yaw, 0.7, 0.3, Math.min(1, dt * 8));
    if (this.speed > 4) this.a.play('Gallop', 0.25, this.speed / 7);
    else if (this.speed > 0.4) this.a.play('Walk', 0.25, this.speed / 1.4);
    else this.a.play('Idle', 0.5, 1);
    this.a.mixer.update(dt);
  }
}

// ------------------------------------------------------------------- drops of light

const ORB_VERT = /* glsl */ `
attribute float aAlive;
attribute float aSeed;
uniform float uTime;
uniform float uPx;
varying float vAlive;
varying float vSeed;
void main() {
  vec3 p = position;
  p.y += sin(uTime * 1.3 + aSeed * 6.28) * 0.25;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aAlive * uPx * 2.2 / max(-mv.z, 1.0) * (1.0 + 0.15 * sin(uTime * 3.0 + aSeed * 20.0));
  vAlive = aAlive; vSeed = aSeed;
}`;
const ORB_FRAG = /* glsl */ `
uniform float uTime;
varying float vAlive;
varying float vSeed;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c) * 2.0;
  if (r > 1.0 || vAlive < 0.01) discard;
  float a = atan(c.y, c.x);
  float rays = 0.5 + 0.5 * sin(a * 6.0 + uTime * 1.5 + vSeed * 10.0);
  float core = smoothstep(0.35, 0.0, r);
  float halo = smoothstep(1.0, 0.3, r) * (0.35 + 0.25 * rays);
  vec3 col = vec3(1.6, 1.15, 0.55) * core * 2.0 + vec3(1.0, 0.62, 0.25) * halo;
  gl_FragColor = vec4(col, 1.0);
}`;

export class Orbs {
  constructor(scene, world, count = 40) {
    const R = rng(1909);
    this.list = [];
    // the given spots (by the roads and the landmarks), shuffled; then anywhere free
    const spots = (world.orbSpots || []).slice();
    for (let i = spots.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [spots[i], spots[j]] = [spots[j], spots[i]]; }
    for (const s of spots) {
      if (this.list.length >= count) break;
      if (world.blocked(s.x, s.z) || riverEdge(s.x, s.z) < 3) continue;
      if (this.list.some((o) => Math.hypot(o.x - s.x, o.z - s.z) < 25)) continue;
      this.list.push({ x: s.x, z: s.z, y: groundY(s.x, s.z) + 1.5, alive: true });
    }
    this.total = this.list.length;
    const pos = new Float32Array(this.list.length * 3), alive = new Float32Array(this.list.length), seed = new Float32Array(this.list.length);
    this.list.forEach((o, i) => { pos.set([o.x, o.y, o.z], i * 3); alive[i] = 1; seed[i] = R(); });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aAlive', new THREE.BufferAttribute(alive, 1));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPx: { value: 900 } },
      vertexShader: ORB_VERT, fragmentShader: ORB_FRAG,
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.geo = g;
  }
  /** take every drop within reach of p; returns how many */
  collect(p, reach = 3.2) {
    let n = 0;
    const alive = this.geo.attributes.aAlive;
    this.list.forEach((o, i) => {
      if (!o.alive) return;
      if ((o.x - p.x) ** 2 + (o.z - p.z) ** 2 < reach * reach && Math.abs(o.y - p.y - 1.2) < 3) { o.alive = false; alive.setX(i, 0); n++; }
    });
    if (n) alive.needsUpdate = true;
    return n;
  }
  nearest(p) {
    let best = null, bd = 1e18;
    for (const o of this.list) if (o.alive) { const d = (o.x - p.x) ** 2 + (o.z - p.z) ** 2; if (d < bd) { bd = d; best = o; } }
    return best;
  }
  remaining() { return this.list.filter((o) => o.alive).length; }
}

/** animals that stay where they were put: list of { kind, coat, x, z, yaw, clip, scale } */
export class Standing {
  constructor(scene, animals, list) {
    this.list = list.map((d, i) => {
      const a = animals.make(d.kind, d.coat);
      if (d.scale) a.root.scale.setScalar(d.scale);
      standOn(a.root, d.x, d.z, d.yaw || 0, d.kind === 'dog' ? 0.7 : 1.3, d.kind === 'dog' ? 0.3 : 0.45);
      a.play(d.clip || 'Idle', 0, 1);
      scene.add(a.root);
      return { a, i };
    });
  }
  update(dt) { for (const { a } of this.list) a.mixer.update(dt); }
}
