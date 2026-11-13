// Light that is light: the lamps of Jajce and of the lake's promenade, the lanterns of the boats, the lit windows.
// Each is painted in strokes that add up instead of covering — a hot heart, a few short dashes round it like the
// rays Csontváry gave his electric lights, a soft ring — and the nearest few warm the surfaces round them
// (`uLamps`, read by the paint shader's lampAt). After "Oil paint" by blendi on Patch (MIT): "a few things are
// painted in strokes that add up instead of covering".
import * as THREE from 'three';
import { shared } from './paint.js';

const VERT = /* glsl */ `
attribute float aSize;
attribute float aSeed;
uniform float uPx;
uniform float uTime;
varying float vSeed;
varying float vFlick;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  vFlick = 0.9 + 0.1 * sin(uTime * (7.0 + aSeed * 5.0) + aSeed * 40.0);
  gl_PointSize = clamp(aSize * uPx / max(-mv.z, 0.5), 3.0, 260.0);
  vSeed = aSeed;
}`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uCol;
varying float vSeed;
varying float vFlick;
float h(float n) { return fract(sin(n * 127.1) * 43758.5453); }
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c) * 2.0;
  if (r > 1.0) discard;
  float a = atan(c.y, c.x);
  // the heart, laid on thick and hot
  float core = smoothstep(0.2, 0.0, r);
  // a soft ring of glow
  float halo = smoothstep(1.0, 0.15, r) * 0.28;
  // rays: eight dashes of paint pulled out from the heart, of uneven length, slowly breathing
  float k = floor((a / 6.28318 + 0.5) * 8.0 + 0.5);
  float ang = (k / 8.0 - 0.5) * 6.28318 + (h(k + vSeed * 9.0) - 0.5) * 0.25;
  vec2 dir = vec2(cos(ang), sin(ang));
  float along = dot(c * 2.0, dir), across = abs(dot(c * 2.0, vec2(-dir.y, dir.x)));
  float len = 0.45 + 0.45 * h(k * 3.1 + vSeed) + 0.06 * sin(uTime * 1.3 + k);
  float ray = step(0.18, along) * smoothstep(len, len - 0.15, along) * smoothstep(0.05, 0.012, across);
  vec3 col = uCol * (core * 2.4 + halo + ray * 0.9) * vFlick;
  col += vec3(1.0, 0.97, 0.9) * core * 0.8;
  gl_FragColor = vec4(col, 1.0);
}`;

export class Lights {
  /** lamps: [{ x, y, z, size?, strength? }] */
  constructor(scene, lamps) {
    this.lamps = lamps;
    const n = lamps.length;
    const pos = new Float32Array(n * 3), size = new Float32Array(n), seed = new Float32Array(n);
    lamps.forEach((l, i) => { pos.set([l.x, l.y, l.z], i * 3); size[i] = l.size ?? 1.6; seed[i] = Math.random(); });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uPx: { value: 900 }, uTime: shared.uTime, uCol: { value: new THREE.Color(1.4, 0.95, 0.45) } },
      vertexShader: VERT, fragmentShader: FRAG,
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this.near = [];
  }

  setPx(px) { this.mat.uniforms.uPx.value = px; }

  /** the nearest lamps to the eye light the surfaces round them */
  update(cam) {
    const L = shared.uLamps.value;
    const near = this.lamps.map((l) => [l, (l.x - cam.x) ** 2 + (l.z - cam.z) ** 2]).filter((e) => e[1] < 180 * 180).sort((a, b) => a[1] - b[1]);
    for (let i = 0; i < L.length; i++) {
      const e = near[i];
      if (e) L[i].set(e[0].x, e[0].y, e[0].z, e[0].strength ?? 0.55); else L[i].w = 0;
    }
  }
}
