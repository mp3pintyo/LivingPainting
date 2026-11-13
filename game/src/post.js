// After the scene is drawn: the tone curve, then an oil-paint filter (a generalised Kuwahara filter with polynomial
// sector weights) that melts every solid thing into smooth, flat patches of paint — which is what makes horses,
// houses and cattle read as parts of the painting rather than objects in front of it. Then the glow of what burns
// bright, dark contours where depth breaks (he drew his cattle and his bridge in outline), the ridge of the paint,
// the canvas — and the gallery: the scan on the wall in a gilt frame, which grows to fill the screen and then gives
// way to the living scene.
import * as THREE from 'three';
import { GLSL_COMMON } from './paint.js';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// ---- 1. tone: HDR scene → display space (identity up to 0.75, so the canvas shows as its scan)
const TONE = /* glsl */ `
uniform sampler2D tScene;
uniform float uExposure;
uniform float uSat;
varying vec2 vUv;
vec3 shoulder(vec3 c) { vec3 k = 0.75 + 0.25 * (1.0 - exp(-(c - 0.75) / 0.25)); return mix(c, k, step(0.75, c)); }
vec3 toSRGB(vec3 c) { c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main() {
  vec3 c = texture2D(tScene, vUv).rgb * uExposure;
  c = shoulder(max(c, 0.0));
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = max(vec3(0.0), mix(vec3(l), c, uSat));
  gl_FragColor = vec4(toSRGB(c), 1.0);
}`;

// ---- 2. the oil-paint filter (Kyprianidis et al., generalised Kuwahara with polynomial weighting, 8 sectors)
const KUWAHARA = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uPx;
uniform float uQ;
varying vec2 vUv;
void main() {
  const float R = float(RADIUS);
  vec4 m[8]; vec3 s[8];
  for (int k = 0; k < 8; k++) { m[k] = vec4(0.0); s[k] = vec3(0.0); }
  const float eta = 0.84;
  const float zeta2 = 0.33;
  vec3 c = texture2D(tSrc, vUv).rgb;
  float w0 = 0.125;
  for (int k = 0; k < 8; k++) { m[k] += vec4(c * w0, w0); s[k] += c * c * w0; }
  for (int j = 0; j <= RADIUS; j++) {
    for (int i = -RADIUS; i <= RADIUS; i++) {
      if (j == 0 && i <= 0) continue;
      vec2 v = vec2(float(i), float(j)) / R;
      if (dot(v, v) > 1.0) continue;
      vec3 c0 = texture2D(tSrc, vUv + vec2(float(i), float(j)) * uPx).rgb;
      vec3 c1 = texture2D(tSrc, vUv - vec2(float(i), float(j)) * uPx).rgb;
      vec3 cc0 = c0 * c0, cc1 = c1 * c1;
      float g = exp(-3.125 * dot(v, v));
      float xx = zeta2 - eta * v.x * v.x, yy = zeta2 - eta * v.y * v.y;
      float z, wx;
      z = max(0.0, v.y + xx); wx = z * z * g; m[0] += vec4(c0 * wx, wx); s[0] += cc0 * wx; m[4] += vec4(c1 * wx, wx); s[4] += cc1 * wx;
      z = max(0.0, -v.x + yy); wx = z * z * g; m[2] += vec4(c0 * wx, wx); s[2] += cc0 * wx; m[6] += vec4(c1 * wx, wx); s[6] += cc1 * wx;
      z = max(0.0, -v.y + xx); wx = z * z * g; m[4] += vec4(c0 * wx, wx); s[4] += cc0 * wx; m[0] += vec4(c1 * wx, wx); s[0] += cc1 * wx;
      z = max(0.0, v.x + yy); wx = z * z * g; m[6] += vec4(c0 * wx, wx); s[6] += cc0 * wx; m[2] += vec4(c1 * wx, wx); s[2] += cc1 * wx;
      vec2 r = 0.70710678 * vec2(v.x - v.y, v.x + v.y);
      xx = zeta2 - eta * r.x * r.x; yy = zeta2 - eta * r.y * r.y;
      z = max(0.0, r.y + xx); wx = z * z * g; m[1] += vec4(c0 * wx, wx); s[1] += cc0 * wx; m[5] += vec4(c1 * wx, wx); s[5] += cc1 * wx;
      z = max(0.0, -r.x + yy); wx = z * z * g; m[3] += vec4(c0 * wx, wx); s[3] += cc0 * wx; m[7] += vec4(c1 * wx, wx); s[7] += cc1 * wx;
      z = max(0.0, -r.y + xx); wx = z * z * g; m[5] += vec4(c0 * wx, wx); s[5] += cc0 * wx; m[1] += vec4(c1 * wx, wx); s[1] += cc1 * wx;
      z = max(0.0, r.x + yy); wx = z * z * g; m[7] += vec4(c0 * wx, wx); s[7] += cc0 * wx; m[3] += vec4(c1 * wx, wx); s[3] += cc1 * wx;
    }
  }
  vec4 o = vec4(0.0);
  for (int k = 0; k < 8; k++) {
    m[k].rgb /= m[k].w;
    s[k] = abs(s[k] / m[k].w - m[k].rgb * m[k].rgb);
    float sigma2 = s[k].r + s[k].g + s[k].b;
    float w = 1.0 / (1.0 + pow(255.0 * sigma2, uQ * 0.5));
    o += vec4(m[k].rgb * w, w);
  }
  gl_FragColor = vec4(o.rgb / o.w, 1.0);
}`;

// ---- 3. glow: what burns bright, blurred (quarter resolution)
const BRIGHT = /* glsl */ `
uniform sampler2D tSrc;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb;
  float l = max(c.r, max(c.g, c.b));
  gl_FragColor = vec4(c * smoothstep(0.84, 1.0, l), 1.0);
}`;
const BLUR = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uDir;
varying vec2 vUv;
void main() {
  vec3 s = texture2D(tSrc, vUv).rgb * 0.227;
  s += (texture2D(tSrc, vUv + uDir * 1.385).rgb + texture2D(tSrc, vUv - uDir * 1.385).rgb) * 0.316;
  s += (texture2D(tSrc, vUv + uDir * 3.231).rgb + texture2D(tSrc, vUv - uDir * 3.231).rgb) * 0.070;
  gl_FragColor = vec4(s, 1.0);
}`;

// ---- 4. the canvas: contours, the ridge of the paint, weave, grain — and the gallery with the scan
const FINAL = /* glsl */ `
${GLSL_COMMON}
uniform sampler2D tPaint;
uniform sampler2D tGlow;
uniform sampler2D tDepth;
uniform sampler2D tScan;
uniform vec2 uRes;
uniform vec4 uRect;      // where the framed canvas sits on screen (uv: x0, y0, x1, y1)
uniform float uScan;     // 1 = the scan exactly, 0 = the living scene
uniform float uWall;     // 1 = the gallery wall round the frame
uniform float uTime;
uniform float uNear;
uniform float uFar;
uniform float uFlash;
uniform float uGlow;
uniform float uRelief;
uniform float uWeave;
uniform float uFoot;
uniform float uMatte;
varying vec2 vUv;

float linDepth(vec2 uv) {
  float z = texture2D(tDepth, uv).x * 2.0 - 1.0;
  return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear));
}

void main() {
  vec2 uv = vUv;
  vec2 px = 1.0 / uRes;
  float rs = uRes.y / 1080.0;
  // a hand, not a ruler: every edge wavers a little, as a brush-drawn line does
  vec2 hfc = uv * uRes / max(rs, 0.5);
  vec2 hand = (vec2(vnoise(hfc / 34.0), vnoise(hfc / 34.0 + 17.3)) - 0.5) * 2.6 * px * rs
            + (vec2(vnoise(hfc / 9.0 + 3.1), vnoise(hfc / 9.0 + 8.7)) - 0.5) * 0.9 * px * rs;
  vec3 s = texture2D(tPaint, uv + hand).rgb;

  // ---- the ridge of the paint: the picture's own light and dark read as relief, lit from the upper left
  float lx = luma(texture2D(tPaint, uv + vec2(1.5, 0.0) * px).rgb) - luma(texture2D(tPaint, uv - vec2(1.5, 0.0) * px).rgb);
  float ly = luma(texture2D(tPaint, uv + vec2(0.0, 1.5) * px).rgb) - luma(texture2D(tPaint, uv - vec2(0.0, 1.5) * px).rgb);
  // (his paint is uneven: thin in the darks, laid on very thick in places — the light passages)
  float thick = 0.4 + 1.4 * smoothstep(0.55, 0.9, luma(s));
  s *= 1.0 + clamp((-lx + ly) * uRelief * thick, -0.14, 0.14);

  // ---- contours: a wobbling ring of depth taps; where depth jumps, a thin dark line
  vec2 wob = (vec2(vnoise(uv * uRes * 0.012 + uTime * 0.05), vnoise(uv * uRes * 0.012 + 7.3)) - 0.5) * 1.5 * px * rs;
  float d0 = linDepth(uv + wob);
  float w = 2.2 * max(rs, 0.6);
  float dl = linDepth(uv + wob - vec2(w, 0) * px), dr = linDepth(uv + wob + vec2(w, 0) * px);
  float du = linDepth(uv + wob + vec2(0, w) * px), dd = linDepth(uv + wob - vec2(0, w) * px);
  float lap = (abs(dl + dr - 2.0 * d0) + abs(du + dd - 2.0 * d0)) / max(d0, 0.1);
  float edge = smoothstep(0.05, 0.2, lap) * smoothstep(600.0, 60.0, d0);
  edge *= 0.5 + 0.5 * vnoise(uv * uRes * 0.04 / max(rs, 0.5));
  s = mix(s, s * 0.55 + vec3(0.02, 0.025, 0.06), edge * 0.32);

  // ---- the glow of what burns bright
  s += texture2D(tGlow, uv).rgb * uGlow;
  // ---- the brightest passages roll off toward the white of the paint and never past it (after "Oil paint" by
  // blendi on Patch, MIT). No varnish: he never varnished his pictures and bound his colours lean (tempera in the
  // oil, 1964/67 examination), so the surface is matt — the darks a little chalky, not deepened; the colours pure.
  // (uMatte 0: the varnished look, deeper darks, for comparison)
  vec3 hiPaint = max(s - 0.82, 0.0);
  s = min(s, 0.82) + hiPaint / (1.0 + hiPaint * 4.0);
  s = mix(s, s * s * (3.0 - 2.0 * s), 0.18 * uFoot * (1.0 - uMatte));
  s = mix(s, s * 0.95 + vec3(0.05, 0.049, 0.045), uMatte * uFoot);

  // ---- the canvas: an irregular over-and-under weave that shows through thin paint (and hardly through thick,
  // light paint), and the paint skipping over its threads where it was dragged dry
  vec2 fc = uv * uRes;
  vec2 fw = fc / max(rs, 0.5);
  vec2 th = fw / 2.4 + (vec2(vnoise(fw * 0.04), vnoise(fw * 0.04 + 9.0)) - 0.5) * 1.2;
  vec2 cell = floor(th), f = fract(th);
  float over = mod(cell.x + cell.y, 2.0);
  float thread = mix(1.0 - abs(f.y - 0.5) * 2.0, 1.0 - abs(f.x - 0.5) * 2.0, over);
  float thin = 1.0 - smoothstep(0.5, 0.92, luma(s));
  s *= 1.0 + (thread - 0.55) * (0.045 + 0.08 * thin) * uWeave;
  float grain = hash21(floor(fw) + fract(uTime * 7.0)) - 0.5;
  s *= 1.0 + grain * 0.02;
  // ---- the dark band of the foreground that frames his picture from below
  s *= mix(1.0 - 0.34 * uFoot, 1.0, smoothstep(0.0, 0.4, uv.y));
  vec2 vc = uv - 0.5;
  s *= 1.0 - dot(vc, vc) * 0.3;
  s += vec3(0.05, 0.055, 0.08) * uFlash * 0.25;

  // ---- the scan, and the gallery round it
  vec2 suv = (uv - uRect.xy) / (uRect.zw - uRect.xy);
  bool inR = suv.x >= 0.0 && suv.y >= 0.0 && suv.x <= 1.0 && suv.y <= 1.0;
  if (inR && uScan > 0.0) {
    vec3 sc = texture2D(tScan, suv).rgb;
    float asp = (uRect.z - uRect.x) * uRes.x / ((uRect.w - uRect.y) * uRes.y);
    vec2 sp = suv * vec2(asp, 1.0);
    // the scene is worked over the scan like wet paint: a soft, slow front moving across the canvas, its edge
    // dragged into level brush-hairs — no cells, no torn shapes
    float n = fbm(sp * 1.4 + 3.0);
    n += 0.09 * (vnoise(sp * vec2(3.0, 46.0)) - 0.5) + 0.05 * (vnoise(sp * vec2(9.0, 120.0)) - 0.5);
    vec2 e2 = min(suv, 1.0 - suv) * vec2(asp, 1.0);
    n -= 0.22 * (1.0 - smoothstep(0.0, 0.25, min(e2.x, e2.y)));   // the edges melt first
    float keep = smoothstep(1.0 - uScan - 0.09, 1.0 - uScan + 0.09, n * 1.15 - 0.02);
    if (uScan >= 0.999) keep = 1.0;
    s = mix(s, sc, keep);
    // where the front passes, the paint is wet: a soft smear of the canvas' own colours, so the picture and the
    // living scene are never seen sharp on top of each other
    float front = 1.0 - abs(keep * 2.0 - 1.0);
    vec3 smear = textureLod(tScan, suv + vec2(0.0, (n - 0.5) * 0.01), 4.5).rgb;
    s = mix(s, smear, smoothstep(0.0, 0.7, front) * 0.9);
  }
  if (uWall > 0.0 && !inR) {
    vec2 o = max(uRect.xy - uv, uv - uRect.zw) * uRes;
    float dpx = max(o.x, o.y);
    float hpx = (uRect.w - uRect.y) * uRes.y;
    float fw = hpx * 0.055;
    vec3 wall = vec3(0.075, 0.07, 0.062) * (0.85 + 0.25 * fbm3(fc * 0.004)) * (1.0 + 0.04 * (hash21(fc) - 0.5));
    float cx = (uRect.x + uRect.z) * 0.5;
    float ly2 = uRect.w + 0.06;
    float spot = exp(-pow((uv.x - cx) / ((uRect.z - uRect.x) * 0.7), 2.0)) * smoothstep(-0.6, 0.0, uv.y - ly2) * (1.0 - smoothstep(0.0, 0.25, uv.y - ly2));
    wall *= 1.0 + spot * 2.2;
    vec3 col = wall;
    if (dpx < fw) {
      float t = dpx / fw;
      float prof = sin(t * 3.14159 * 2.5) * 0.5 + 0.5;
      vec2 dir = normalize(vec2(o.x > o.y ? sign(uv.x - cx) : 0.0, o.x > o.y ? 0.0 : sign(uv.y - 0.5)) + 1e-4);
      float lit = 0.75 + 0.35 * dir.y;
      vec3 gold = mix(vec3(0.33, 0.22, 0.09), vec3(0.85, 0.66, 0.34), prof) * lit;
      gold *= 0.9 + 0.2 * vnoise(fc * 0.2);
      if (t < 0.12) gold *= 0.45;
      col = gold;
    }
    s = mix(s, col, uWall);
  }
  gl_FragColor = vec4(s, 1.0);
}`;

function pass(frag, uniforms, defines = {}) {
  return new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: frag, defines, depthTest: false, depthWrite: false });
}

export class Post {
  /** quality: 'high' (wide oil filter), 'medium', 'low' (no oil filter) */
  constructor(renderer, { quality = 'medium' } = {}) {
    this.renderer = renderer;
    this.quality = quality;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.quad = new THREE.Mesh(geo);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const ldr = { type: THREE.UnsignedByteType, depthBuffer: false };
    this.rtTone = new THREE.WebGLRenderTarget(4, 4, ldr);
    this.rtPaint = new THREE.WebGLRenderTarget(4, 4, ldr);
    this.rtG1 = new THREE.WebGLRenderTarget(4, 4, ldr);
    this.rtG2 = new THREE.WebGLRenderTarget(4, 4, ldr);
    for (const rt of [this.rtTone, this.rtPaint, this.rtG1, this.rtG2]) { rt.texture.minFilter = THREE.LinearFilter; rt.texture.generateMipmaps = false; }

    this.tone = pass(TONE, { tScene: { value: null }, uExposure: { value: 1.0 }, uSat: { value: 1.0 } });
    this.kuwa = pass(KUWAHARA, { tSrc: { value: this.rtTone.texture }, uPx: { value: new THREE.Vector2() }, uQ: { value: 8 } }, { RADIUS: 4 });
    this.bright = pass(BRIGHT, { tSrc: { value: null } });
    this.blur = pass(BLUR, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });
    this.final = pass(FINAL, {
      tPaint: { value: this.rtPaint.texture }, tGlow: { value: this.rtG1.texture }, tDepth: { value: null }, tScan: { value: null },
      uRes: { value: new THREE.Vector2(1, 1) }, uRect: { value: new THREE.Vector4(0, 0, 1, 1) }, uScan: { value: 1 }, uWall: { value: 1 },
      uTime: { value: 0 }, uNear: { value: 0.25 }, uFar: { value: 6000 }, uFlash: { value: 0 }, uGlow: { value: 0.28 }, uRelief: { value: 1.2 }, uWeave: { value: 1 }, uFoot: { value: 0 }, uMatte: { value: 1 },
    });
    this.u = this.final.uniforms;
    this.h = 1080;
  }

  setQuality(q) { this.quality = q; this.setSize(this.w || 4, this.h || 4); }

  setSize(w, h) {
    this.w = w; this.h = h;
    this.rtTone.setSize(w, h); this.rtPaint.setSize(w, h);
    const gw = Math.max(1, Math.floor(w / 4)), gh = Math.max(1, Math.floor(h / 4));
    this.rtG1.setSize(gw, gh); this.rtG2.setSize(gw, gh);
    this.gw = gw; this.gh = gh;
    // the oil filter's radius is in pixels: scale it with the screen so the patches keep their size on canvas
    const r = Math.round((this.quality === 'high' ? 4 : 3) * Math.max(0.7, h / 1080));
    this.kuwa.defines.RADIUS = Math.min(7, Math.max(2, r));
    this.kuwa.needsUpdate = true;
    this.kuwa.uniforms.uPx.value.set(1 / w, 1 / h);
    this.u.uRes.value.set(w, h);
  }

  draw(mat, target) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
  }

  render(sceneRT) {
    this.tone.uniforms.tScene.value = sceneRT.texture;
    this.u.tDepth.value = sceneRT.depthTexture;
    this.draw(this.tone, this.rtTone);
    if (this.quality === 'low') this.u.tPaint.value = this.rtTone.texture;
    else { this.draw(this.kuwa, this.rtPaint); this.u.tPaint.value = this.rtPaint.texture; }
    this.bright.uniforms.tSrc.value = this.rtTone.texture;
    this.draw(this.bright, this.rtG1);
    for (let i = 0; i < 2; i++) {
      this.blur.uniforms.tSrc.value = this.rtG1.texture; this.blur.uniforms.uDir.value.set((1 + i) / this.gw, 0);
      this.draw(this.blur, this.rtG2);
      this.blur.uniforms.tSrc.value = this.rtG2.texture; this.blur.uniforms.uDir.value.set(0, (1 + i) / this.gh);
      this.draw(this.blur, this.rtG1);
    }
    this.draw(this.final, null);
  }
}
