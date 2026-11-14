// The cart: two horses at the pole, the driver with his whip. W: on (gyí!), S: whoa / back, A/D: steer,
// Space: the whip — a burst of gallop. The camera follows behind; drag to look round. On a touch screen the stick
// (touch.js) gives the same, graded.
import * as THREE from 'three';
import * as MD from './models.js';
import { paintMaterial } from './paint.js';
import { BRIDGES, toBridge } from './world.js';

const TAU = Math.PI * 2;

export class Cart {
  constructor(scene, world, animals, { x = 6, z = 9, yaw = -Math.PI / 2 } = {}) {
    this.world = world;
    this.root = new THREE.Group();
    scene.add(this.root);
    const wood = paintMaterial('wood', 0xffffff, { vertexColors: true });
    const cloth = paintMaterial('cloth', 0xffffff, { vertexColors: true });
    this.cart = MD.makeCart({ pole: false });
    this.cart.group.traverse((o) => { if (o.isMesh) o.material = wood; });
    this.cart.driver.material = cloth;
    // root: where the cart stands and which way it faces; body: the cart itself, tilted to the ground under its
    // wheels; the horses each tilted to the ground under their own hooves
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.body.add(this.cart.group);
    // the pole (rúd): from the front axle forward between the two horses, at their chests; set every frame, since the
    // horses tilt to their own ground and the cart to its own
    this.pole = new THREE.Mesh(MD.part(new THREE.CylinderGeometry(0.04, 0.055, 1, 8).translate(0, 0.5, 0), '#6b4a2e'), wood);
    this.root.add(this.pole);
    // the pair at the pole: a white and a bay, in collars, the traces back to the swingletree
    const harness = MD.merge([
      MD.part(new THREE.TorusGeometry(0.26, 0.07, 6, 14), '#2a1a12', MD.M(0, 1.42, -0.62, 1.1, 0, 0)),
      MD.part(new THREE.BoxGeometry(0.62, 0.06, 0.12), '#2a1a12', MD.M(0, 1.2, -0.1)),
      MD.part(MD.limb([0.2, 1.3, -0.55], [0.22, 0.75, 1.15], 0.025), '#2a1a12'),
      MD.part(MD.limb([-0.2, 1.3, -0.55], [-0.22, 0.75, 1.15], 0.025), '#2a1a12'),
    ]);
    this.horses = [animals.make('horse', 'white'), animals.make('horse', 'bay')];
    this.horses.forEach((h, i) => {
      h.root.position.set(i ? -0.5 : 0.5, 0, -3.1);
      h.root.add(new THREE.Mesh(harness, wood));
      this.root.add(h.root);
    });
    // the reins: from the driver's hands to each bit
    const reinGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0.3, 1.75, -1.4), new THREE.Vector3(0.46, 1.62, -4.3),
      new THREE.Vector3(0.06, 1.75, -1.4), new THREE.Vector3(-0.46, 1.62, -4.3)]);
    this.body.add(new THREE.LineSegments(reinGeo, new THREE.LineBasicMaterial({ color: 0x1a120c })));

    this.x = x; this.z = z; this.yaw = yaw; this.y = 0;
    this.speed = 0; this.steer = 0; this.phase = 0; this.pitch = 0; this.roll = 0;
    this.boost = 0; this.whipT = 0; this.gait = 0;
    this.keys = new Set();
    this.obstacles = null;   // () => [{ x, z, r }]: the beasts, which the cart may not drive through
    this.onWhip = null; this.onStep = null;
    this.lastStep = 0;
    this.place();
  }

  get forward() { return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }

  whip() {
    if (this.whipT > 0) return;
    this.whipT = 0.55;
    this.boost = 3.2;
    this.onWhip?.();
  }

  update(dt, input) {
    // the touch stick (stickX, stickY in −1…1, null when untouched) is graded: how far it is pushed, how fast
    // the horses go and how hard they turn; pushed sideways from a standstill, they set off at a walk
    const sx = input.stickX ?? 0, sy = input.stickY ?? 0;
    const stickOn = sy > 0.18 || (Math.abs(sx) > 0.45 && sy > -0.3);
    const up = input.up || stickOn, down = input.down || (!stickOn && sy < -0.35);
    const thr = input.up ? 1 : stickOn ? Math.max(0.3, Math.min(1, Math.hypot(sx, Math.max(0, sy)))) : 1;
    const steerIn = (input.left ? 1 : 0) - (input.right ? 1 : 0) || -sx;
    if (input.whip) this.whip();
    this.boost = Math.max(0, this.boost - dt);
    this.whipT = Math.max(0, this.whipT - dt);
    const top = this.boost > 0 ? 12.5 : 6.8 * thr;
    if (up) this.speed += (this.speed < top ? (this.boost > 0 ? 4.5 : 2.4) : -2.0) * dt;
    else if (down) this.speed -= (this.speed > 0 ? 7 : 1.2) * dt;
    else this.speed *= Math.exp(-dt * (this.speed > top ? 1.2 : 0.55));
    this.speed = Math.max(-2.2, Math.min(this.speed, 13));
    if (!up && !down && Math.abs(this.speed) < 0.05) this.speed = 0;
    // horses steer less at a gallop; at a walk the cart turns in little room (a street corner, a bridgehead)
    const steerMax = 0.78 - Math.min(0.48, Math.abs(this.speed) * 0.054);
    this.steer += (steerIn * steerMax - this.steer) * Math.min(1, dt * 4.5);
    // onto a narrow bridge the horses find the way themselves: lined up with it, drawn to its middle
    if (Math.abs(this.speed) > 0.05) this.guide(dt, steerIn);
    const yawRate = (this.speed / 3.8) * Math.tan(this.steer);
    const nyaw = this.yaw + yawRate * dt;
    const fx = -Math.sin(nyaw), fz = -Math.cos(nyaw);
    const nx = this.x + fx * this.speed * dt, nz = this.z + fz * this.speed * dt;
    if (this.free(nx, nz, nyaw)) { this.x = nx; this.z = nz; this.yaw = nyaw; }
    else if (this.free(this.x, this.z, nyaw)) { this.yaw = nyaw; this.speed *= 0.3; }
    else { this.speed = -this.speed * 0.25; this.bumped = 0.4; }

    // the horses' gait follows the speed: walk, trot, gallop
    const s = Math.abs(this.speed);
    const gait = s < 0.08 ? 0 : s < 1.8 ? s / 1.8 : s < 5 ? 1 + (s - 1.8) / 3.2 : Math.min(3, 2 + (s - 5) / 4);
    this.gait += (gait - this.gait) * Math.min(1, dt * 3);
    const freq = this.gait < 1 ? 0.9 : this.gait < 2 ? 0.9 + (this.gait - 1) * 0.5 : 1.4 + (this.gait - 2) * 0.55;
    if (this.gait > 0.05) this.phase += freq * dt * Math.sign(this.speed || 1);
    // hoofbeats for the sound: four per cycle at a walk, two at a trot, a gallop's rolling three
    const beats = this.gait < 1.5 ? 4 : this.gait < 2.5 ? 2 : 3;
    const bi = Math.floor(this.phase * beats);
    if (bi !== this.lastStep && this.gait > 0.1) { this.lastStep = bi; this.onStep?.(this.gait); }
    // the model's own clips: standing, walking (quickened into a trot), galloping
    for (const [i, h] of this.horses.entries()) {
      if (s < 0.08) h.play(i ? 'Idle' : 'Idle_2', 0.5, 1);
      else if (s < 2.6 || this.speed < 0) h.play('Walk', 0.35, Math.sign(this.speed) * Math.max(0.6, s / 1.7));
      else h.play('Gallop', 0.3, THREE.MathUtils.clamp(0.55 + (s - 2.6) * 0.09, 0.55, 1.4));
      h.mixer.update(dt * (1 + i * 0.03));
    }
    for (const w of this.cart.wheels) w.mesh.rotation.x -= (this.speed * dt) / w.r;
    // the whip goes up and cracks forward
    const wt = this.whipT > 0 ? Math.sin((1 - this.whipT / 0.55) * Math.PI) : 0;
    this.cart.whip.rotation.x = -wt * 1.1;
    this.cart.whip.rotation.z = wt * 0.3;
    this.place(dt);
  }

  /** near a narrow bridge's end, heading along it: turn the cart in line with it and slide it to the middle */
  guide(dt, steerIn) {
    const f = this.forward;
    for (const b of BRIDGES) {
      if (b.width > 5) continue;
      const bl = toBridge(this.x, this.z, b);
      if (Math.abs(bl.x) > b.len + 5 || Math.abs(bl.z) > b.width / 2 + 2.5) continue;
      const ax = b.c, az = -b.s;                               // the bridge's axis (+x local) in the world
      const along = f.x * ax + f.z * az;
      if (Math.abs(along) < 0.5) continue;
      // coming off it, past the end of its walls, the driver is free to turn: the horses are only led ONTO the bridge
      if (Math.abs(bl.x) > (b.wall || b.len * 0.6) - 1.5 && along * Math.sign(this.speed) * bl.x > 0) continue;
      const sgn = Math.sign(along) * Math.sign(this.speed);
      const want = Math.atan2(-ax * Math.sign(along), -az * Math.sign(along));
      let dy = want - this.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      const k = Math.min(1, dt * 3.5) * (Math.abs(steerIn) > 0.25 ? 0.5 : 1);
      if (this.free(this.x, this.z, this.yaw + dy * k)) this.yaw += dy * k;
      const pull = bl.z * Math.min(1, dt * 3.5 * Math.min(1, Math.abs(this.speed) / 2));
      const nx = this.x - b.s * pull, nz = this.z - b.c * pull;        // (local z runs along (s, c) in the world)
      if (sgn !== 0 && this.free(nx, nz, this.yaw)) { this.x = nx; this.z = nz; }
    }
  }

  /** the cart's footprint and the horses' is clear (of the world, and of the beasts — though it may always back away
   *  from one that has walked into it) */
  free(x, z, yaw) {
    const pts = (x, z, yaw) => {
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = -fz, rz = fx;
      // a: metres behind the middle (negative = ahead), b: to the right
      return [[1.6, 0.75], [1.6, -0.75], [-1.8, 0.75], [-1.8, -0.75], [-4.6, 0.6], [-4.6, -0.6], [-3.0, 0], [0, 0.75], [0, -0.75]]
        .map(([a, b]) => [x - fx * a + rx * b, z - fz * a + rz * b]);
    };
    const now = pts(x, z, yaw);
    for (const [px, pz] of now) if (this.world.blocked(px, pz)) return false;
    const obs = this.obstacles?.();
    if (obs && obs.length) {
      const was = pts(this.x, this.z, this.yaw);
      for (const o of obs) {
        if ((o.x - x) ** 2 + (o.z - z) ** 2 > 100) continue;
        for (let i = 0; i < now.length; i++) {
          const d = Math.hypot(now[i][0] - o.x, now[i][1] - o.z);
          if (d < o.r && d <= Math.hypot(was[i][0] - o.x, was[i][1] - o.z) + 1e-4) return false;
        }
      }
    }
    return true;
  }

  place(dt = 1) {
    const g = this.world.groundY;
    const sn = Math.sin(this.yaw), cs = Math.cos(this.yaw);
    // the ground at a point given in the cart's own frame (x right, z back)
    const gh = (lx, lz) => g(this.x + lx * cs + lz * sn, this.z - lx * sn + lz * cs);
    // where each wheel's hub must be so the rim touches the ground and goes into it nowhere (over a crest, a bend of
    // the road, the edge of a ramp): the highest of a few points along its contact
    const WHEELS = [[0.62, -1.1, 0.45], [-0.62, -1.1, 0.45], [0.66, 1.1, 0.55], [-0.66, 1.1, 0.55]];
    const hub = WHEELS.map(([lx, lz, r]) => {
      let h = -1e9;
      for (const d of [-0.36, -0.18, 0, 0.18, 0.36]) h = Math.max(h, gh(lx, lz + d) + Math.sqrt(r * r - d * d));
      return h;
    });
    const front = (hub[0] + hub[1]) / 2 - 0.45, rear = (hub[2] + hub[3]) / 2 - 0.55;
    const right = (hub[0] - 0.45 + hub[2] - 0.55) / 2, left = (hub[1] - 0.45 + hub[3] - 0.55) / 2;
    const k = Math.min(1, dt * 14);
    this.pitch += (Math.atan2(front - rear, 2.2) - this.pitch) * k;
    this.roll += (Math.atan2(right - left, 1.28) - this.roll) * k;
    // the height: all four wheels on the ground on the whole, and none of them in it
    const sp = Math.sin(this.pitch), sr = Math.sin(this.roll);
    const need = WHEELS.map(([lx, lz, r], i) => hub[i] - r + lz * sp - lx * sr);
    const y = Math.max(need.reduce((a, b) => a + b, 0) / 4, Math.max(...need) - 0.02);
    this.y = y > this.y ? y : this.y + (y - this.y) * k;
    this.root.position.set(this.x, this.y, this.z);
    this.root.rotation.set(0, this.yaw, 0);
    this.body.rotation.set(this.pitch, 0, this.roll, 'XYZ');
    // each horse stands on the ground under its own hooves, tilted to it (fore hooves ~0.65 m ahead of its middle)
    for (const h of this.horses) {
      const lx = h.root.position.x, lz = -3.1;
      const gf = gh(lx, lz - 0.65), gb = gh(lx, lz + 0.65);
      const hp = Math.atan2(gf - gb, 1.3);
      h.pitch = h.pitch === undefined ? hp : h.pitch + (hp - h.pitch) * k;
      h.root.position.set(lx, (gf + gb) / 2 - this.y, lz);
      h.root.rotation.set(h.pitch, 0, 0);
    }
    // the pole: the front axle (on the cart) to the point between the horses' chests (on the horses)
    this.body.updateMatrix();
    const a = new THREE.Vector3(0, 0.45, -1.1).applyMatrix4(this.body.matrix);
    const b = new THREE.Vector3();
    for (const h of this.horses) { h.root.updateMatrix(); b.add(new THREE.Vector3(0, 1.05, -0.95).applyMatrix4(h.root.matrix)); }
    b.multiplyScalar(0.5);
    b.x = 0;                                   // (each horse's point lies in its own middle: the pole runs between them)
    const d = b.clone().sub(a);
    this.pole.position.copy(a);
    this.pole.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    this.pole.scale.set(1, d.length(), 1);
  }
}

export class ChaseCamera {
  constructor(camera, cart) {
    this.camera = camera; this.cart = cart;
    this.pos = new THREE.Vector3(); this.look = new THREE.Vector3();
    this.orbit = 0; this.lift = 0; this.dragging = false; this.far = false;
    // the mouse wheel: from just behind the driver's back (0.25) out to high over the plain (8); eased toward
    this.zoom = 1; this.zoomTo = 1;
    this.returns = true;   // after a drag, the camera drifts back behind the cart (the corner button turns it off)
    this.snap();
  }
  desired() {
    const c = this.cart, f = c.forward;
    const z = this.zoom;
    const dist = ((this.far ? 17 : 10) + Math.max(0, c.speed) * 0.35) * z;
    const h = Math.max(2.3, (this.far ? 7.5 : 4.0) * Math.pow(z, z > 1 ? 1.15 : 0.7)) + this.lift;
    const a = c.yaw + this.orbit;
    const pos = new THREE.Vector3(c.x + Math.sin(a) * dist, c.y + h, c.z + Math.cos(a) * dist);
    const look = new THREE.Vector3(c.x + f.x * 3.5, c.y + 1.8, c.z + f.z * 3.5);
    return { pos, look };
  }
  snap() { const d = this.desired(); this.pos.copy(d.pos); this.look.copy(d.look); }
  /** a wheel step: deltaY in pixels (a notch is ~100); each notch about a third nearer or farther */
  wheel(deltaY) {
    this.zoomTo = Math.min(8, Math.max(0.25, this.zoomTo * Math.exp(deltaY * 0.0032)));
  }
  update(dt) {
    this.zoom += (this.zoomTo - this.zoom) * (1 - Math.exp(-dt * 7));
    const d = this.desired();
    const k = 1 - Math.exp(-dt * 3.5);
    this.pos.lerp(d.pos, k);
    this.look.lerp(d.look, 1 - Math.exp(-dt * 6));
    const gy = this.cart.world.groundY(this.pos.x, this.pos.z) + 1.2;
    if (this.pos.y < gy) this.pos.y = gy;
    if (!this.dragging && this.returns) { this.orbit *= Math.exp(-dt * 1.2); this.lift *= Math.exp(-dt * 1.2); }
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
  }
}

export { TAU };
