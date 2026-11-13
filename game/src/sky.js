// The dome: the canvas' own sky where the opening view looked, Csontváry's storm and clearing painted on round the
// rest of it, every part of it laid in soft, blended strokes. It follows the camera (it is at infinity).
import * as THREE from 'three';
import { GLSL_COMMON, GLSL_SKY, shared } from './paint.js';

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;   // on the far plane
}
`;

const FRAG = /* glsl */ `
${GLSL_COMMON}
${GLSL_SKY}
varying vec3 vDir;

vec3 dirOf(float az, float el) { float c = cos(el); return vec3(sin(az) * c, sin(el), -cos(az) * c); }

// one coat of sky strokes; az is taken on one side of a seam (the caller hides the seam)
vec3 skyStrokes(float az, float el, vec3 base, out float cover) {
  const float K = 34.0;                        // stroke space units per radian
  vec2 p = vec2(az * K, el * K * 1.15);
  float ang = 0.12 + (vnoise(p * 0.02 + vec2(uTime * 0.005, 0.0)) - 0.5) * 0.5;
  vec2 L = vec2(cos(ang), sin(ang));
  vec2 q = vec2(dot(p, L), dot(p, vec2(-L.y, L.x)));
  q.x += uTime * 0.05;                        // the paint creeps with the wind
  vec3 col = base;
  cover = 0.0;
  for (int k = 0; k < 2; k++) {
    float fk = float(k);
    vec2 qq = k == 0 ? q : rot2(q, 0.25) + vec2(0.41, 0.73);
    Dab d = dab(qq, vec2(1.25, 0.34) * (1.0 + fk * 0.2), 11.0 + fk * 5.0);
    // the stroke takes the sky's colour at its own middle: the picture painted again in strokes
    vec2 c = d.center;
    if (k == 1) c = rot2(c - vec2(0.41, 0.73), -0.25);
    c.x -= uTime * 0.05;
    vec2 pc = vec2(dot(c, vec2(L.x, -L.y)), dot(c, vec2(L.y, L.x)));
    float caz = pc.x / K, cel = pc.y / (K * 1.15);
    float dummy;
    vec3 sc = skyBase(dirOf(caz, max(cel, 0.0)), dummy);
    sc = hueShift(sc, (d.id2 - 0.5) * 0.12) * (0.93 + d.id * 0.14);
    float m = d.mask * 0.85;
    col = mix(col, sc, m);
    cover = max(cover, m);
  }
  return col;
}

void main() {
  vec3 d = normalize(vDir);
  float el = asin(clamp(d.y, -1.0, 1.0));
  vec3 haze = hazeColor(d);
  if (el < -0.002) { gl_FragColor = vec4(haze, 1.0); return; }
  float onC;
  vec3 base = skyBase(d, onC);
  float az = atan(d.x, -d.z);
  // his sky has no stroke marks: wet masses worked into each other, thin paint over the weave — only a faint
  // scumble, a little darker and lighter, as the brush dragged
  vec2 sp = vec2(d.x * 26.0 + d.y * 9.0, d.z * 26.0 - d.y * 13.0);
  float scum = fbm(sp) - 0.5;
  vec3 col = base * (1.0 + scum * 0.1);
  // deep in the canvas the scan is all there is; toward its edge it thins into the strokes
  vec3 cuv = canvasUV(d);
  if (cuv.z > 0.5) {
    float inner = canvasIn(cuv.xy);
    float w = smoothstep(0.06, 0.18, inner + 0.06 * (fbm3(d.xz * 2.2 + vec2(d.y * 3.0, 0.0)) - 0.5));
    col = mix(col, textureLod(tSky, cuv.xy, 0.0).rgb, w);
  }
  // by the lonely cedar the sky is that picture's own, the storm left behind
  if (uCedar > 0.003) {
    vec3 cs = cedarSky(d) * (1.0 + scum * 0.08);
    // (it comes on as paint does: the lighter passages first)
    col = mix(col, cs, smoothstep(0.0, 1.0, uCedar * 1.25 - 0.25 * (fbm3(d.xz * 3.0 + d.y) )));
  }
  // the last of the sky melts into the haze of the plain
  col = mix(haze, col, smoothstep(0.0, 0.025, el));
  gl_FragColor = vec4(col, 1.0);
}
`;

export function makeSky() {
  const geo = new THREE.SphereGeometry(4000, 96, 48);
  const mat = new THREE.ShaderMaterial({
    uniforms: shared,
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  // it rides with whichever camera is drawing (the reflection's too)
  mesh.onBeforeRender = (r, s, cam) => { mesh.position.copy(cam.position); mesh.updateMatrixWorld(); };
  return mesh;
}
