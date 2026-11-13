// Paint on the animals themselves. A few hundred touches of the brush are pinned to points of each beast's hide and
// carried with them as it moves: every frame each pin is put through the same bones as the skin it sits on, with the
// way its stroke runs (along the body, down the legs) and the way its surface faces. Only the beasts nearest the eye
// get them (a pool of slots); far off the model's own paint is enough.
//
// After "Oil paint" by blendi on Patch (https://patch.gg/blendi/oil-paint, src/oilpaint/pins.js), MIT License,
// Copyright (c) 2026 Patch. Csontváry's beasts are smooth and one-toned, so the touches are soft and close in colour:
// they make a painted hide, not a shaggy one.
import * as THREE from 'three';
import { GLSL_COMMON, GLSL_SKY, GLSL_PAINT, shared } from './paint.js';
import { GLSL_BRUSH } from './brush.js';

const STYLE = {
  // pins per beast, stroke size across/along in metres, the height (model units) below which a surface is a leg
  horse: { count: 300, size: [0.07, 0.15], leg: 2.1, scale: 0.42 },
  cow: { count: 320, size: [0.075, 0.15], leg: 1.9, scale: 0.3 },
  dog: { count: 140, size: [0.035, 0.07], leg: 1.2, scale: 0.2 },
};

const VERT = /* glsl */ `
${GLSL_COMMON}
${GLSL_PAINT}
attribute vec3 aPos;
attribute vec3 aDir;
attribute vec3 aNrm;
attribute vec3 aCol;
attribute vec4 aData;      // seed, across, along, alive
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform float uPixel;      // world size of a pixel at unit distance
uniform float uFlash;
varying vec2 vUv;
varying vec3 vC1;
varying vec3 vC2;
varying vec4 vAxis;
varying float vFog;
uniform float uFogDensity;
uniform float uFogStart;
const float COLS = 4.0, ROWS = 2.0;
vec4 hash4(float n) { return fract(sin(vec4(n, n + 1.7, n + 3.1, n + 5.3)) * vec4(43758.5453, 22578.1459, 19642.3490, 31337.731)); }
void main() {
  vec3 Nn = normalize(aNrm);
  vec3 toEye = cameraPosition - aPos;
  float dist = length(toEye);
  vec4 vc = viewMatrix * vec4(aPos, 1.0);
  float facing = dot(Nn, toEye / dist);
  // only where the hide faces the eye: at the silhouette the touches would stand out like shingles
  if (aData.w < 0.5 || facing < 0.3 || dist < 0.3) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec4 r = hash4(aData.x);
  // three mixes, as everywhere: by how the hide faces the low sun, broken touch by touch
  float lit = clamp(dot(Nn, uSunDir) * 0.75 + 0.45, 0.0, 1.0);
  vec3 c = aCol * paint3(vec3(0.8, 0.77, 0.74) + uSunCol * 0.3, vec3(0.7, 0.69, 0.7) + uSunCol * 0.1, vec3(0.5, 0.53, 0.62), lit, r.x);
  float whiteness = smoothstep(0.32, 0.7, luma(aCol));
  c *= mix(vec3(1.0), mix(vec3(0.82, 0.94, 1.12), vec3(1.1, 1.0, 0.82), lit), whiteness * 0.8);
  c += aCol * uLampCol * lampAt(aPos, Nn);
  c += aCol * vec3(0.5, 0.55, 0.9) * uFlash * 0.6;
  c = jitterC(c, r.yzw, 0.22);
  vC1 = c;
  vC2 = jitterC(c * 1.1, r.wxy, 0.25);
  // the card: facing the eye, laid along the stroke's direction on the canvas, lifted a little off the hide
  vec3 vd = mat3(viewMatrix) * normalize(aDir);
  float fl = length(vd.xy);
  vec2 along = fl > 1e-4 ? vd.xy / fl : vec2(0.0, 1.0);
  along = normalize(mix(vec2(cos(r.x * 6.283), sin(r.x * 6.283)), along, smoothstep(0.08, 0.4, fl)));
  vec2 across = vec2(along.y, -along.x);
  float px = dist * uPixel;
  vec2 half_ = clamp(aData.yz * (0.8 + 0.45 * r.y), vec2(2.5, 4.0) * px, vec2(200.0, 400.0) * px) * 0.5 * smoothstep(0.3, 0.55, facing);
  vc.xyz *= 1.0 - min(0.15 * max(half_.x, half_.y) / dist, 0.3);
  vc.xy += across * position.x * half_.x + along * position.y * half_.y;
  gl_Position = projectionMatrix * vc;
  float cell = r.z < 0.5 ? 4.0 + floor(r.z * 3.999) : floor(r.z * 3.999);   // half of them round pressed dabs
  float flip = r.w > 0.5 ? -1.0 : 1.0;
  vec2 q = vec2(position.x * flip, position.y) * 0.5 + 0.5;
  vUv = (vec2(mod(cell, COLS), floor(cell / COLS)) + q) / vec2(COLS, ROWS);
  vAxis = vec4(across * flip, along);
  vFog = clamp(1.0 - exp(-max(dist - uFogStart, 0.0) * uFogDensity), 0.0, 1.0);
}`;

const FRAG = /* glsl */ `
uniform sampler2D tBrush;
varying vec2 vUv;
varying vec3 vC1;
varying vec3 vC2;
varying vec4 vAxis;
varying float vFog;
void main() {
  vec4 t = texture2D(tBrush, vUv);
  if (t.g < 0.55) discard;
  vec2 e = vec2(1.5 / 512.0, 0.0);
  float hu = texture2D(tBrush, vUv + e.xy).r - texture2D(tBrush, vUv - e.xy).r;
  float hv = texture2D(tBrush, vUv + e.yx).r - texture2D(tBrush, vUv - e.yx).r;
  vec2 g = vAxis.xy * hu + vAxis.zw * hv;
  float rake = 0.5 * g.x - 0.7 * g.y;
  vec3 col = mix(vC1, vC2, smoothstep(0.52, 0.78, t.b));
  col *= mix(0.96, 1.03, t.r);
  col *= 1.0 + rake * 0.6;              // thin paint: a gentle ridge only
  gl_FragColor = vec4(col, 1.0);
}`;

export class AnimalDabs {
  /** animals: the Animals registry (its .list of live beasts, its .kinds); slots: how many beasts get paint at once */
  constructor(scene, animals, { slots = 9, reach = 42 } = {}) {
    this.animals = animals;
    this.reach = reach;
    this.pins = {};
    let seed = 9151;
    const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    // the pins of each kind: spread evenly over the hide (bigger faces chosen more often)
    for (const [kind, K] of Object.entries(animals.kinds)) {
      const st = STYLE[kind];
      const g = K.geoms[Object.keys(K.geoms)[0]];
      const pos = g.attributes.position, nrm = g.attributes.normal, index = g.index;
      const tris = index ? index.count / 3 : pos.count / 3;
      const at = (t, k) => (index ? index.getX(t * 3 + k) : t * 3 + k);
      const sums = new Float32Array(tris);
      let total = 0;
      for (let t = 0; t < tris; t++) {
        a.fromBufferAttribute(pos, at(t, 0)); b.fromBufferAttribute(pos, at(t, 1)); c.fromBufferAttribute(pos, at(t, 2));
        total += b.sub(a).cross(c.sub(a)).length();
        sums[t] = total;
      }
      const list = [];
      for (let made = 0, tries = 0; made < st.count && tries < st.count * 40; tries++) {
        const want = rand() * total;
        let lo = 0, hi = tris - 1;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (sums[mid] < want) lo = mid + 1; else hi = mid; }
        // a point inside the triangle, kept with the vertex it is nearest to (that vertex's bones carry it)
        const v = at(lo, Math.floor(rand() * 3));
        const p = new THREE.Vector3().fromBufferAttribute(pos, v), n = new THREE.Vector3().fromBufferAttribute(nrm, v).normalize();
        // the way the stroke runs: down the legs, along the body elsewhere (projected onto the surface)
        const leg = p.y < st.leg && Math.abs(n.y) < 0.7 && Math.abs(p.x) < 1.2;
        const d = leg ? new THREE.Vector3(0, -1, 0) : new THREE.Vector3(0, 0, 1);
        d.addScaledVector(n, -d.dot(n));
        if (d.lengthSq() < 1e-4) d.set(1, 0, 0);
        list.push({ v, p, n, d: d.normalize(), seed: rand() * 1000 });
        made++;
      }
      this.pins[kind] = list;
    }
    const per = Math.max(...Object.values(this.pins).map((l) => l.length));
    this.per = per; this.slots = slots;
    const N = per * slots;
    this.aPos = new Float32Array(N * 3); this.aDir = new Float32Array(N * 3); this.aNrm = new Float32Array(N * 3);
    this.aCol = new Float32Array(N * 3); this.aData = new Float32Array(N * 4);
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    for (const [name, arr, sz] of [['aPos', this.aPos, 3], ['aDir', this.aDir, 3], ['aNrm', this.aNrm, 3], ['aCol', this.aCol, 3], ['aData', this.aData, 4]]) {
      const at = new THREE.InstancedBufferAttribute(arr, sz);
      at.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(name, at);
    }
    geo.instanceCount = N;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.geo = geo;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { ...shared, uPixel: { value: 0.001 } },
      vertexShader: VERT, fragmentShader: FRAG,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    scene.add(this.mesh);
    this.slot = new Array(slots).fill(null);
    this._v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this._col = new THREE.Color();
  }

  update(camera) {
    this.mat.uniforms.uPixel.value = (2 * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, this.h || 1080);
    const cam = camera.position, fwd = camera.getWorldDirection(this._v[0]).clone();
    // the nearest beasts in front of the eye
    const wp = new THREE.Vector3();
    const cand = [];
    for (const a of this.animals.list) {
      if (!a.root.visible || !a.root.parent) continue;
      a.root.getWorldPosition(wp);
      const dx = wp.x - cam.x, dz = wp.z - cam.z, d = Math.hypot(dx, dz);
      if (d > this.reach) continue;
      if (d > 6 && (dx * fwd.x + dz * fwd.z) / d < -0.2) continue;
      cand.push([a, d]);
    }
    cand.sort((x, y) => x[1] - y[1]);
    const chosen = cand.slice(0, this.slots).map((e) => e[0]);
    const [a, b, c] = this._v;
    for (let s = 0; s < this.slots; s++) {
      const beast = chosen[s];
      const base = s * this.per;
      if (!beast) { for (let i = 0; i < this.per; i++) this.aData[(base + i) * 4 + 3] = 0; continue; }
      const pins = this.pins[beast.kind];
      const st = STYLE[beast.kind];
      const mesh = beast.mesh;
      beast.root.updateMatrixWorld(true);
      const colA = mesh.geometry.attributes.color;
      const k = 0.08;
      for (let i = 0; i < this.per; i++) {
        const j = base + i;
        if (i >= pins.length) { this.aData[j * 4 + 3] = 0; continue; }
        const pin = pins[i];
        a.copy(pin.p); mesh.applyBoneTransform(pin.v, a); a.applyMatrix4(mesh.matrixWorld);
        b.copy(pin.p).addScaledVector(pin.n, k); mesh.applyBoneTransform(pin.v, b); b.applyMatrix4(mesh.matrixWorld);
        c.copy(pin.p).addScaledVector(pin.d, k); mesh.applyBoneTransform(pin.v, c); c.applyMatrix4(mesh.matrixWorld);
        this.aPos.set([a.x, a.y, a.z], j * 3);
        this.aNrm.set([b.x - a.x, b.y - a.y, b.z - a.z], j * 3);
        this.aDir.set([c.x - a.x, c.y - a.y, c.z - a.z], j * 3);
        this.aCol.set([colA.getX(pin.v), colA.getY(pin.v), colA.getZ(pin.v)], j * 3);
        const sc = beast.root.scale.x;
        this.aData.set([pin.seed, st.size[0] * sc, st.size[1] * sc, 1], j * 4);
      }
    }
    for (const n of ['aPos', 'aDir', 'aNrm', 'aCol', 'aData']) this.geo.attributes[n].needsUpdate = true;
  }
}
