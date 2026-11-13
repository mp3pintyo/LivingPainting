// The painter's hand: shared GLSL (noise, brush dabs, palette toning, the sky's haze) and the material factory.
// Every surface of the world is painted with the same procedure: two coats of brush dabs laid along a direction
// that suits the surface (grass along the wind, walls level, roofs down the slope, beasts along the body), each dab
// toned with the colours measured on the painting, lit at its own ridge, and fading into the haze of the plain.
// Csontváry's hand is smooth and luminous: broad, blended strokes, little ground showing between them — not the
// swirling, gappy brushwork of a Van Gogh.
import * as THREE from 'three';
import { GLSL_BRUSH } from './brush.js';

export const GLSL_COMMON = /* glsl */ `
float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), u.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
float fbm3(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 3; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s / 0.875; }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 saturate3(vec3 c, float s) { float l = luma(c); return max(vec3(0.0), mix(vec3(l), c, s)); }
vec3 hueShift(vec3 c, float a) {
  const vec3 k = vec3(0.57735);
  float ca = cos(a), sa = sin(a);
  return c * ca + cross(k, c) * sa + k * dot(k, c) * (1.0 - ca);
}
vec2 rot2(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }

// One brush stroke in a field of them: cells laid in offset rows, each holding one tapered dab.
struct Dab {
  float id;      // random 0..1 per stroke
  float id2;     // a second random per stroke
  float mask;    // 1 on the stroke, 0 between strokes
  float across;  // -1..1 across the stroke
  float along;   // 0..1 along the stroke
  vec2 center;   // the stroke's middle, in the same space as p
};
Dab dab(vec2 p, vec2 size, float seed) {
  vec2 q = p / size;
  float row = floor(q.y);
  float shift = hash11(row * 1.37 + seed * 17.0) * 13.0;
  float x = q.x + shift;
  float col = floor(x);
  vec2 cid = vec2(col, row);
  Dab d;
  d.id = hash21(cid + seed * 7.13);
  d.id2 = hash21(cid * 1.7 + 3.1 + seed * 3.7);
  vec2 g = vec2(x - col, q.y - row) - 0.5;
  g.y += g.x * (d.id2 - 0.5) * 0.35;            // no two strokes quite parallel
  g.y -= (d.id - 0.5) * 0.12;
  float len = mix(0.8, 1.06, d.id2);
  float ax = abs(g.x) * 2.0 / len;
  float ay = abs(g.y) * 2.0 / 0.96;
  float taper = 1.0 - 0.38 * smoothstep(0.35, 1.0, ax);   // full in the middle, thinning as the brush lifts
  d.mask = smoothstep(1.0, 0.72, ax) * smoothstep(taper, taper - 0.42, ay);
  d.across = clamp(g.y * 2.0 / 0.96, -1.0, 1.0);
  d.along = g.x / len + 0.5;
  d.center = vec2((col + 0.5 - shift) * size.x, (row + 0.5) * size.y);
  return d;
}
`;

// The sky as a function of direction: the canvas (projected from the opening viewpoint) where the direction falls
// on it, Csontváry's storm and clearing continued round the rest of the dome, and the haze the plain fades into.
export const GLSL_SKY = /* glsl */ `
uniform sampler2D tSky;      // the scan's sky, bridge and plain filled in
uniform vec4 uCanvas;        // tan of half the canvas' field (x, y), cos / sin of the opening view's pitch
uniform float uCanvasAspect;
uniform vec3 uStorm[5];      // the storm wall, dark to pale (measured on the scan, linear)
uniform vec3 uCloud[5];      // the grey-mauve cloud above it
uniform vec3 uSunset[5];     // the clearing: rust, orange, cream
uniform vec3 uHazePale;      // the far plain where it meets the sky
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform float uTime;
uniform float uFlash;        // lightning: 0..1
uniform vec4 uBolt;          // azimuth, top elevation, brightness, seed
uniform float uClear;        // 0 = the storm as painted … 1 = it has passed (napút)
uniform float uCedar;        // 0 … 1: how near the eye is to the lonely cedar — there the sky is that picture's own
uniform vec4 uTown;          // Mostar: x, z, radius, 1 — there the sun throws sharp, lilac shadows, as on that canvas

vec3 lin3(vec3 c) { return pow(c, vec3(2.2)); }
// The sky of A magányos cédrus: emerald and turquoise, paling to cream at the horizon, a blue-green zenith; low in
// it lemon cloud dragged dry across the green, orange at its heart, white where it is heaped.
vec3 cedarSky(vec3 d) {
  float az = atan(d.x, -d.z), e = max(asin(clamp(d.y, -1.0, 1.0)), 0.0);
  vec2 cp = vec2(az * 2.0, e * 5.0);
  float n = fbm(cp + vec2(3.0, 1.0)), n2 = fbm(cp * vec2(1.6, 2.6) + vec2(11.0, 4.0));
  vec3 c = mix(lin3(vec3(0.93, 0.93, 0.80)), lin3(vec3(0.45, 0.81, 0.63)), smoothstep(0.0, 0.2, e + (n - 0.5) * 0.12));
  c = mix(c, lin3(vec3(0.20, 0.68, 0.50)), smoothstep(0.18, 0.5, e + (n2 - 0.5) * 0.2));
  c = mix(c, lin3(vec3(0.17, 0.60, 0.74)), smoothstep(0.55, 1.1, e + (n - 0.5) * 0.3));
  c = mix(c, lin3(vec3(0.85, 0.93, 0.86)), smoothstep(0.55, 0.8, n2) * 0.5);            // the green rubbed thin
  float band = smoothstep(0.015, 0.09, e) * (1.0 - smoothstep(0.26, 0.48, e));
  float cl = smoothstep(0.5, 0.68, fbm(vec2(az * 3.2 + 5.0, e * 14.0))) * band;
  vec3 cloud = mix(lin3(vec3(0.97, 0.84, 0.30)), lin3(vec3(0.94, 0.52, 0.14)), smoothstep(0.6, 0.85, fbm(vec2(az * 5.0, e * 20.0 + 2.0))));
  cloud = mix(cloud, lin3(vec3(0.97, 0.96, 0.90)), smoothstep(0.45, 0.75, fbm(vec2(az * 4.0 + 9.0, e * 11.0))));
  c = mix(c, cloud, cl * 0.92);
  return c + uSunCol * pow(max(dot(d, uSunDir), 0.0), 14.0) * 0.12;
}

vec3 pal5(int k, float t) {
  t = clamp(t, 0.0, 1.0) * 4.0;
  int i = int(min(floor(t), 3.0)); float f = t - float(i);
  if (k == 0) return mix(uStorm[i], uStorm[i + 1], f);
  if (k == 1) return mix(uCloud[i], uCloud[i + 1], f);
  return mix(uSunset[i], uSunset[i + 1], f);
}

// where a direction lands on the canvas: uv (texture convention, v up) and whether it is in front at all
vec3 canvasUV(vec3 d) {
  float c = uCanvas.z, s = uCanvas.w;
  float fz = d.y * s - d.z * c;
  if (fz <= 0.02) return vec3(-9.0, -9.0, 0.0);
  float ux = d.x, uy = d.y * c + d.z * s;
  return vec3(ux / fz / uCanvas.x * 0.5 + 0.5, uy / fz / uCanvas.y * 0.5 + 0.5, 1.0);
}
// how far outside the canvas, in canvas widths (0 on it)
float canvasOut(vec2 uv) {
  vec2 o = max(max(-uv, uv - 1.0), 0.0);
  return length(vec2(o.x, o.y / uCanvasAspect));
}
// how far inside the canvas from its nearest edge, in canvas widths (0 off it)
float canvasIn(vec2 uv) {
  vec2 i = min(uv, 1.0 - uv);
  return max(0.0, min(i.x, i.y / uCanvasAspect));
}

float stormSector(float az) { return smoothstep(-0.55 - uClear * 1.2, -1.15 - uClear * 1.4, az) * smoothstep(-3.14, -2.3, az) * (1.0 - uClear * 0.6); }
float sunsetSector(float az) { return smoothstep(-0.05, 0.45, az) * smoothstep(3.14, 2.2, az); }

// The sky away from the canvas, smooth (no strokes). The canvas' own left and right edges are carried round the
// dome at the same elevation — the storm's side round the west, the clearing's round the east, the two meeting
// behind the viewer in a dusk — and over that the storm wall low in the west, mauve billows, the low sun.
vec3 edgeColumn(float side, float e) {
  float v = 0.609 + clamp(e / 0.25, 0.0, 1.0) * 0.33;   // (the scan's very top is darkened by its frame)
  return textureLod(tSky, vec2(side, v), 3.0).rgb;
}
vec3 proceduralSky(vec3 d) {
  float az = atan(d.x, -d.z);
  float el = asin(clamp(d.y, -1.0, 1.0));
  float e = max(el, 0.0);
  float t = uTime;
  float sw = stormSector(az), ew = sunsetSector(az);
  float east = 0.5 + 0.5 * sin(az);
  vec3 L = edgeColumn(0.012, e), R = edgeColumn(0.988, e);
  vec3 sky = mix(L, R, smoothstep(0.15, 0.85, east));
  // behind the viewer the two meet in a violet dusk
  float south = smoothstep(1.9, 3.0, abs(az));
  sky = mix(sky, mix(sky, pal5(1, 0.7) * vec3(0.92, 0.95, 1.15), 0.55), south);
  // above the canvas' top the sky turns to the mauve cloud overhead
  vec3 zen = mix(pal5(1, 0.82), pal5(2, 0.45), ew * 0.4);
  sky = mix(sky, zen, smoothstep(0.24, 1.1, e));
  // the clearing burns hotter toward the low sun
  float sd = max(dot(d, uSunDir), 0.0);
  sky = mix(sky, pal5(2, 0.45) * vec3(1.25, 0.95, 0.7), pow(sd, 3.0) * 0.45 * ew);

  // billows: brighter crowns, darker hollows, drifting
  vec2 cp = vec2(az * 2.4 + t * 0.006, e * 6.0);
  float billow = fbm(cp + vec2(0.0, fbm(cp * 0.6) * 1.3));
  float lumpy = smoothstep(0.25, 0.85, billow);
  sky *= 0.86 + 0.28 * lumpy;
  vec3 warm = mix(pal5(1, 0.9), pal5(2, 0.5) * vec3(1.2, 0.95, 0.75), ew);
  sky = mix(sky, warm, smoothstep(0.62, 0.8, billow) * 0.35 * (1.0 - sw * 0.6));

  // the storm wall: ultramarine, ragged at its top, down to the horizon in the west
  float top = (0.22 + 0.22 * (fbm(vec2(az * 2.2 + 3.0, 1.7 + t * 0.003)) - 0.5) + 0.06 * (fbm(vec2(az * 9.0, 4.0 + t * 0.006)) - 0.5)) * sw;
  float rag = 0.05 * (fbm(vec2(az * 14.0, e * 14.0 + t * 0.01)) - 0.5);
  float wall = smoothstep(top + 0.015, top - 0.025, e + rag) * smoothstep(0.05, 0.3, sw);
  float boil = fbm(vec2(az * 6.0 - t * 0.008, e * 9.0));
  vec3 storm = pal5(0, 0.1 + boil * 0.7 + smoothstep(top - 0.12, top, e) * 0.25);
  storm += uFlash * vec3(0.55, 0.6, 0.95) * (0.35 + boil) * smoothstep(0.5, 0.0, abs(az - uBolt.x));
  sky = mix(sky, storm, wall);

  // the bolt itself
  if (uBolt.z > 0.0) {
    float jag = (fbm(vec2(e * 18.0, uBolt.w)) - 0.5) * 0.09 + (fbm(vec2(e * 70.0, uBolt.w + 3.0)) - 0.5) * 0.02;
    float dx = abs(az - uBolt.x - jag) * cos(el);
    float core = smoothstep(0.0035, 0.0, dx) * step(e, uBolt.y) * step(0.0, el);
    sky = mix(sky, vec3(1.6, 1.6, 2.2), core * uBolt.z);
  }

  // the low sun behind the torn cloud in the east, and its glow
  sky += uSunCol * (pow(sd, 10.0) * 0.22 + pow(sd, 60.0) * 0.18) * (1.0 - lumpy * 0.5);
  return sky;
}

// the canvas where the direction falls on it, the canvas' own edge colour carried outward, then the dome
vec3 skyBase(vec3 d, out float onCanvas) {
  vec3 cuv = canvasUV(d);
  vec3 proc = proceduralSky(d);
  onCanvas = 0.0;
  if (cuv.z < 0.5) return proc;
  float out_ = canvasOut(cuv.xy);
  // The canvas melts into the dome over a wide margin whose line is a cloud's, not a ruler's. Toward and past its
  // edge it is read ever more blurred (no single column or row of paint is ever dragged out into a streak), and
  // past the margin there is only the dome, painted in the canvas' own edge colours.
  float cloudy = fbm3(d.xz * 2.2 + vec2(d.y * 3.0, 0.0)) - 0.5;
  vec2 cl = clamp(cuv.xy, vec2(0.04), vec2(0.96, 0.9));
  vec3 soft = textureLod(tSky, cl, 7.5).rgb;
  float w = 1.0 - smoothstep(0.0, 0.32, out_ + 0.12 * cloudy);
  onCanvas = (out_ <= 0.0) ? 1.0 : 0.0;
  vec3 c = mix(proc, mix(proc, soft, 0.8), w);
  if (out_ <= 0.0) {
    float inner = canvasIn(cuv.xy) + 0.06 * cloudy;
    vec3 mid = textureLod(tSky, cuv.xy, 4.5).rgb;
    c = mix(c, mid, smoothstep(0.0, 0.07, inner));
    c = mix(c, textureLod(tSky, cuv.xy, 1.5).rgb, smoothstep(0.05, 0.16, inner));
  }
  return c;
}

// the colour the plain fades into at the horizon in this direction (cheap: no cloud noise)
vec3 hazeColor(vec3 d) {
  vec3 h = normalize(vec3(d.x, 0.03, d.z));
  float az = atan(h.x, -h.z);
  float sw = stormSector(az), ew = sunsetSector(az);
  float south = clamp(1.0 - sw - ew, 0.0, 1.0);
  float east = 0.5 + 0.5 * sin(az);
  vec3 c = mix(edgeColumn(0.012, 0.02), edgeColumn(0.988, 0.02), smoothstep(0.15, 0.85, east));
  vec3 cuv = canvasUV(h);
  if (cuv.z > 0.5) {
    float w = 1.0 - smoothstep(0.0, 0.35, canvasOut(cuv.xy));
    c = mix(c, textureLod(tSky, clamp(cuv.xy, vec2(0.002), vec2(0.998)), 5.0).rgb, w);
  }
  c = mix(c, uHazePale, 0.35);
  c += uFlash * vec3(0.25, 0.27, 0.4) * sw;
  c = mix(c, lin3(vec3(0.88, 0.93, 0.82)), uCedar * 0.9);
  return c;
}
`;

// The painter's three mixes, broken colour, and the lamps (after "Oil paint" by blendi on Patch, MIT): a thing is
// painted in three mixes — light, half-tone, shade — and each stroke takes one of them by how lit its spot is,
// its edges moved about stroke by stroke, so the light breaks into whole touches of paint, not a smooth gradient.
export const GLSL_PAINT = /* glsl */ `
uniform vec4 uLamps[12];     // xyz, strength (0: none)
uniform float uPaint3;       // 1: the three mixes; 0: plain continuous light (for comparison)
uniform float uBrushOn;      // 1: the brush sheet's marks; 0: the plain procedural dab
uniform vec3 uLampCol;
vec3 paint3(vec3 cl, vec3 cm, vec3 cs, float x, float r) {
  x += (r - 0.5) * 0.22;
  vec3 c = mix(cs, cm, smoothstep(0.24, 0.36, x));
  return mix(c, cl, smoothstep(0.56, 0.7, x));
}
vec3 jitterC(vec3 c, vec3 r, float amount) {
  float a = (r.y - 0.5) * 0.9 * amount;
  c = hueShift(c, a);
  float g = luma(c);
  c = mix(vec3(g), c, 1.0 + (r.z - 0.5) * 0.7 * amount);
  return max(c * (1.0 + (r.x - 0.5) * 0.5 * amount), 0.0);
}
// a lamp's light on a surface: it turns what is near toward the lamp's warm colour
float lampAt(vec3 p, vec3 n) {
  float s = 0.0;
  for (int i = 0; i < 12; i++) {
    vec4 L = uLamps[i];
    if (L.w <= 0.0) continue;
    vec3 d = L.xyz - p;
    float dist = length(d);
    float f = 1.0 - smoothstep(0.0, 11.0, dist);
    s += L.w * f * f * (0.35 + 0.65 * max(dot(n, d / max(dist, 1e-3)), 0.0));
  }
  return s;
}
`;

// ---------------------------------------------------------------- the paint material

const VERT = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vColor;
varying vec3 vObj;
varying vec3 vObjN;
varying vec3 vAxX;
varying vec3 vAxY;
varying vec3 vAxZ;
#ifdef SURF
attribute vec3 aSurf;
varying vec3 vSurf;
attribute vec2 aHillC;
attribute vec3 aHillW;
varying vec2 vHillC;
varying vec3 vHillW;
#endif
#include <skinning_pars_vertex>
void main() {
  vec3 transformed = position;
  vec3 objectNormal = normal;
#include <skinbase_vertex>
#include <skinnormal_vertex>
#include <skinning_vertex>
  mat4 m = modelMatrix;
#ifdef USE_INSTANCING
  m = m * instanceMatrix;
#endif
  vec4 wp = m * vec4(transformed, 1.0);
  vWorld = wp.xyz;
  mat3 m3 = mat3(m);
  vAxX = normalize(m3[0]); vAxY = normalize(m3[1]); vAxZ = normalize(m3[2]);
  vNormal = normalize(m3 * objectNormal);
  vObjN = objectNormal;
#ifdef WORLD_STROKES
  vObj = wp.xyz;
  vObjN = vNormal;
#else
  vObj = transformed * uObjScale;
#endif
  vColor = vec3(1.0);
#ifdef USE_COLOR
  vColor = color;
#endif
#ifdef USE_INSTANCING_COLOR
  vColor *= instanceColor;
#endif
#ifdef SURF
  vSurf = aSurf;
  vHillC = aHillC;
  vHillW = aHillW;
#endif
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
${GLSL_COMMON}
${GLSL_SKY}
${GLSL_BRUSH}
${GLSL_PAINT}
uniform vec3 uBase;
uniform vec3 uPal[5];       // band factors: a stroke's colour relative to the colour of the surface under it
uniform float uPalAmt;
uniform float uStroke;      // the nearest stroke's length, m
uniform float uWidth;       // stroke width / length
uniform float uPx;          // how long a stroke should look on screen, in 1080p pixels
uniform float uRelief;
uniform float uJitter;
uniform float uGap;         // the ground between strokes, relative to the surface colour
uniform float uEmissive;
uniform vec3 uSkyAmb;
uniform vec3 uGroundAmb;
uniform float uFogDensity;
uniform float uFogStart;
uniform float uResScale;    // screen height / 1080
uniform vec4 uBlobs[24];    // soft shadows under things: x, z, radius, strength
uniform float uWater;       // the river's level
uniform sampler2D tShadow;   // depth from the sun, round the cart
uniform mat4 uShadowMat;
uniform float uShadowOn;
uniform float uShadowAmt;
uniform vec2 uShadowTexel;
float sunShadow(vec3 wp, vec3 n) {
  if (uShadowOn < 0.5) return 1.0;
  vec4 sc = uShadowMat * vec4(wp + n * 0.25, 1.0);
  vec3 p = sc.xyz / sc.w * 0.5 + 0.5;
  if (p.x <= 0.0 || p.x >= 1.0 || p.y <= 0.0 || p.y >= 1.0 || p.z >= 1.0) return 1.0;
  float s = 0.0;
  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++)
    s += step(p.z - 0.0012, textureLod(tShadow, p.xy + vec2(float(i), float(j)) * uShadowTexel * 1.3, 0.0).r);
  s /= 9.0;
  vec2 e = min(p.xy, 1.0 - p.xy);
  return mix(1.0, s, smoothstep(0.0, 0.1, min(e.x, e.y)));
}
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vColor;
varying vec3 vObj;
varying vec3 vObjN;
varying vec3 vAxX;
varying vec3 vAxY;
varying vec3 vAxZ;
#ifdef SURF
varying vec3 vSurf;         // road, mud, salt
varying vec2 vHillC;        // the middle of the hill this ground belongs to
varying vec3 vHillW;        // how much it is hatched round that hill; how much it is the mountain; the mountain's sunlit side
uniform float uHatch;       // 1: hills, mountain and rock are hatched; 0: left smooth (for comparison)
uniform vec2 uMtnAcross;    // the mountain is hatched as he saw it from the town: the level direction across that view
uniform vec3 uMtnCol[4];    // its dark indigo and violet, its sunlit salmon and peach

// His later hand ("vonalkás technika", A magányos cédrus, the mountain of Római híd Mosztárban): a hill is built of
// short, thin touches laid side by side in rows that follow its form, each a shade apart from its neighbours.
struct Hatch { float mask; float id; float id2; float across; float along; };
Hatch hatch(float a, float v, float polar, float len, float wid, float seed) {
  float row = floor(v / wid);
  float u = mix(a, a * (row + 0.5) * wid, polar);       // round a hill the rows are rings: a is the angle
  float fy = v / wid - row - 0.5;
  float x = u / len + hash11(row * 1.37 + seed * 17.0) * 13.0;
  float col = floor(x), fx = x - col - 0.5;
  Hatch h;
  h.id = hash21(vec2(col, row) + seed * 7.13);
  h.id2 = hash21(vec2(col, row) * 1.7 + 3.1 + seed * 3.7);
  fy += fx * (h.id2 - 0.5) * 0.5;                       // no two touches quite parallel
  float l = mix(0.6, 1.0, h.id);                        // nor of one length
  float ax = abs(fx) * 2.0 / l, ay = abs(fy) * 2.0 / mix(0.55, 0.98, h.id2);
  h.mask = smoothstep(1.0, 0.7, ax) * smoothstep(1.0, 0.35, ay);
  h.across = clamp(fy * 2.0, -1.0, 1.0);
  h.along = clamp(fx / l + 0.5, 0.0, 1.0);
  return h;
}
// the colour of one touch: fine differences of value, warm and cool by turns, so the surface vibrates; now and
// then an accent (dark dashes on his ochre, specks of pure red and green in his dark earth); on the mountain the
// passage from shade to sun is made of whole touches of the two colours, never a blend
vec3 hatchTone(Hatch h, vec3 base, float mtn, float lit) {
  vec3 c = base * mix(vec3(0.86, 0.95, 1.16), vec3(1.15, 1.04, 0.86), step(0.5, h.id2));
  c = mix(base, c, 0.5) * (0.87 + 0.26 * h.id);
  float lb = luma(base);
  float acc = step(0.94, hash11(h.id * 57.3 + h.id2 * 11.1));
  vec3 speck = mix(vec3(0.3, 0.05, 0.03), vec3(0.05, 0.17, 0.07), step(0.6, h.id));
  c = mix(c, mix(speck, base * 0.55, smoothstep(0.05, 0.16, lb)), acc * 0.7 * (1.0 - mtn));
  float t = lit + (h.id - 0.5) * 0.9;
  vec3 mc = t > 0.5 ? mix(uMtnCol[2], uMtnCol[3], h.id2 * 0.7) : mix(uMtnCol[0], uMtnCol[1], h.id2);
  return mix(c, mc * (0.92 + 0.16 * h.id), mtn);
}
#endif

vec3 toWorld(vec3 v) { return normalize(vAxX * v.x + vAxY * v.y + vAxZ * v.z); }

vec3 toneStroke(vec3 base, float id, float id2) {
  float t = 0.12 + id * 0.8;
  float f = t * 4.0; int i = int(min(floor(f), 3.0)); float k = f - float(i);
  vec3 band = mix(uPal[i], uPal[i + 1], k);
  vec3 c = base * mix(vec3(1.0), band, uPalAmt);
  c = hueShift(c, (id2 - 0.5) * uJitter);
  return c * (1.0 + (hash11(id * 91.7) - 0.5) * uJitter * 0.8);
}

struct Coat { vec3 albedo; float across; float along; float cover; float id; float height; };

// one touch of the brush: its mark from the sheet (the shape of the paint, its ridge, a streak of a second colour)
vec4 touch(Dab d, float lod) {
  float cell = floor(hash11(d.id * 13.7 + d.id2) * 7.999);
  return brushMark(cell, vec2(d.across, d.along), lod);
}

Coat paintLevel(vec2 q, float S, float lvl, vec3 base, vec3 under, vec2 fw) {
  vec2 size = vec2(S, S * uWidth);
  float lod = max(0.0, log2(max(fw.x / size.x * 256.0, fw.y / size.y * 128.0)));
  Dab a = dab(q, size, lvl * 3.1 + 1.0);
  vec2 qb = rot2(q, 0.22) + vec2(0.37, 0.61) * size;
  Dab b = dab(qb, size * vec2(0.92, 1.08), lvl * 3.1 + 2.0);
  vec4 ta = touch(a, lod), tb = touch(b, lod);
  float ma = mix(a.mask, smoothstep(0.3, 0.62, ta.g), uBrushOn), mb = mix(b.mask, smoothstep(0.3, 0.62, tb.g), uBrushOn);
  // far off, the marks blur together: the stroke's own soft mask carries it
  float far_ = smoothstep(3.0, 5.0, lod);
  ma = mix(ma, a.mask, far_); mb = mix(mb, b.mask, far_);
  Coat c;
  vec3 col = under;
  vec3 ca = toneStroke(base, a.id, a.id2), cb = toneStroke(base, b.id, b.id2);
  ca = mix(ca, ca * vec3(1.08, 1.05, 0.95), smoothstep(0.55, 0.8, ta.b) * 0.6);   // the streak picked up on the brush
  cb = mix(cb, cb * vec3(1.08, 1.05, 0.95), smoothstep(0.55, 0.8, tb.b) * 0.6);
  col = mix(col, ca, ma);
  col = mix(col, cb, mb);
  c.albedo = col;
  bool top = mb > 0.5;
  c.across = (top ? b.across : a.across) * max(ma, mb);
  c.along = (top ? b.along : a.along);
  c.cover = max(ma, mb);
  c.id = top ? b.id : a.id;
  c.height = top ? tb.r : ta.r;
  return c;
}

void main() {
  vec3 N = normalize(vNormal);
  if (!gl_FrontFacing) N = -N;
  vec3 P = vObj;
  vec3 No = normalize(vObjN);
  if (!gl_FrontFacing) No = -No;
  vec3 base = uBase * vColor;

  // ---- the plane the strokes are laid in, and their direction in it
  vec3 an = abs(No);
  vec2 p; vec3 A1, A2;
  bool flat_ = an.y >= max(an.x, an.z);
  if (flat_) { p = P.xz; A1 = vec3(1, 0, 0); A2 = vec3(0, 0, 1); }
  else if (an.x >= an.z) { p = vec2(P.z, P.y); A1 = vec3(0, 0, 1); A2 = vec3(0, 1, 0); }
  else { p = vec2(P.x, P.y); A1 = vec3(1, 0, 0); A2 = vec3(0, 1, 0); }
  float ang = 0.0;
#if defined(KIND_GROUND)
  // level, long strokes, as he laid the plain; the slightest drift so no two fields run quite alike
  ang = 0.12 + (vnoise(P.xz / 420.0) - 0.5) * 0.35;
#elif defined(KIND_ROOF)
  if (flat_) ang = atan(No.z, No.x); else ang = 1.5708;
#elif defined(KIND_BEAST)
  if (flat_) ang = 1.5708;
#elif defined(KIND_TRUNK)
  if (!flat_) ang = 1.5708;
#endif
  vec2 L2 = vec2(cos(ang), sin(ang));
  vec2 q = vec2(dot(p, L2), dot(p, vec2(-L2.y, L2.x)));

  // ---- which size of stroke: a fixed pattern per scale, crossfaded as the surface recedes
  float px = length(fwidth(P));
  float want = px * uPx / max(uResScale, 0.3);
  float lvl = log2(max(want / uStroke, 1.0));
  float l0 = floor(lvl), lf = smoothstep(0.0, 1.0, fract(lvl));
  float S0 = uStroke * exp2(l0);

  vec3 under = base * uGap;
#ifdef SURF
  // the ground carries roads, mud and salt flats in the same coat
  vec3 roadCol = vec3(0.30, 0.24, 0.16), mudCol = vec3(0.055, 0.05, 0.035), saltCol = vec3(0.34, 0.36, 0.27);
  base = mix(base, roadCol, vSurf.x);
  base = mix(base, mudCol, vSurf.y);
  base = mix(base, saltCol, vSurf.z * (1.0 - vSurf.x));
  under = base * uGap;
  // along a road the strokes run with it: long dusty streaks
#endif
  vec2 fwq = fwidth(q);
  Coat c0 = paintLevel(q, S0, l0, base, under, fwq);
  Coat c1 = paintLevel(q, S0 * 2.0, l0 + 1.0, base, under, fwq);
  // from one size of stroke to the next: not a uniform crossfade (that leaves a muddy band, at a fixed distance from the
  // eye, travelling with it), but stroke by stroke — each larger touch comes in whole, at its own moment
  float tw = lf * 1.2 - 0.1, hw = hash11(c1.id * 7.31 + 2.9);
  float w = smoothstep(hw - 0.1, hw + 0.1, tw);
  vec3 albedo = mix(c0.albedo, c1.albedo, w);
  float across = mix(c0.across, c1.across, w);
  float along = mix(c0.along, c1.along, w);
  float Seff = S0 * (1.0 + w);
  float paintH = mix(c0.height, c1.height, w);
#ifdef KIND_GROUND
  // his plain: soft level bands of green and long dry-brush pulls of lighter paint — no repeated marks
  {
    float aa = 1.0 - smoothstep(0.8, 2.8, lvl);
    float band = fbm3(vec2(q.x * 0.022, q.y * 0.42) + vec2(0.0, 3.0));
    float pull = smoothstep(0.6, 0.82, vnoise(vec2(q.x * 0.07, q.y * 1.9))) * aa;
    vec3 g = base * (0.84 + 0.3 * band);
    g = mix(g, g * vec3(1.14, 1.12, 0.9), pull * 0.6);
    albedo = mix(g, albedo, 0.15 * aa);
    across *= 0.25 * aa; along = mix(0.5, along, 0.25 * aa);
  }
#ifdef SURF
  // what rises from the plain — the cedar's hill, the mounds, the mountain, bare rock — is hatched along its form
  {
    float steep = smoothstep(0.86, 0.68, N.y);
    float mtn = vHillW.y;
    float hwt = max(max(vHillW.x, mtn), steep) * (1.0 - vSurf.x) * uHatch;
    if (hwt > 0.004) {
      float a, v, polar = 0.0;
      if (mtn > 0.5) {
        vec2 pq = rot2(vec2(dot(vWorld.xz, uMtnAcross), vWorld.y), -0.62);    // slanting, as the ridge falls
        a = pq.x; v = pq.y;
      } else if (steep > vHillW.x) {
        // a rock wall: level rows up its face
        v = vWorld.y * 1.25;
        float sw = abs(N.x) - abs(N.z) + (hash11(floor(vWorld.y / 0.7) * 3.7) - 0.5) * 0.5;
        a = sw > 0.0 ? vWorld.z : vWorld.x;
      } else {
        vec2 dh = vWorld.xz - vHillC;
        a = atan(dh.y, dh.x); v = length(dh); polar = 1.0;
      }
      float pxh = sqrt(length(dFdx(vWorld)) * length(dFdy(vWorld)));     // (not the long axis of a grazing pixel)
      float lv = log2(max(pxh * 38.0 / max(uResScale, 0.3) / 0.5, 1.0));
      float h0 = floor(lv), hf = smoothstep(0.0, 1.0, fract(lv));
      float len0 = 0.5 * exp2(h0);
      Hatch ha = hatch(a, v, polar, len0, len0 * 0.11, h0 + 1.0);
      Hatch hb = hatch(a, v, polar, len0 * 2.0, len0 * 0.22, h0 + 2.0);
      float hsel = smoothstep(-0.1, 0.1, hf * 1.2 - 0.1 - hash11(hb.id * 7.31 + 2.9));
      // between the touches the ground shows: thinner, a little cooler
      vec3 thin = base * mix(vec3(0.88, 0.91, 0.99), vec3(0.95), mtn);
      vec3 hcol = mix(mix(thin, hatchTone(ha, base, mtn, vHillW.z), ha.mask), mix(thin, hatchTone(hb, base, mtn, vHillW.z), hb.mask), hsel);
      albedo = mix(albedo, hcol, hwt);
      across = mix(across, mix(ha.across * ha.mask, hb.across * hb.mask, hsel), hwt);
      along = mix(along, mix(ha.along, hb.along, hsel), hwt);
    }
  }
#endif
#endif

#ifdef KIND_BRICK
  // the green that grows on the piers just above the water, in pads
  float mossH = smoothstep(uWater + 2.2, uWater + 0.4, vWorld.y) * smoothstep(uWater - 0.6, uWater + 0.1, vWorld.y);
  float pads = smoothstep(0.4, 0.65, vnoise(vWorld.xz * 0.5 + vWorld.y * 1.3));
  // (dark: on his canvas the stone goes dark olive toward the water and almost black at it)
  albedo = mix(albedo, vec3(0.05, 0.058, 0.02) * (0.75 + 0.5 * hash11(floor(along * 3.0) + 0.3)), mossH * (0.45 + 0.4 * pads));
  albedo *= mix(1.0, 0.35, smoothstep(uWater + 0.5, uWater - 0.05, vWorld.y));
#endif

  vec3 V = normalize(cameraPosition - vWorld);
#if defined(KIND_BEAST) || defined(KIND_CLOTH)
  // ---- figures, as he painted them: one tone each, the body evenly lit from within, darkening only toward its
  // silhouette; no cast light, no shine. What is white (hide, sheepskin, shirts) is laid on thick: a crust.
  {
    vec3 fb = base;
    float facing = clamp(dot(N, V), 0.0, 1.0);
    float model = mix(0.6, 1.0, smoothstep(0.0, 0.75, facing)) * (0.9 + 0.1 * N.y);
    vec3 pc = P * 24.0;
    float crust = (vnoise(pc.xy) + vnoise(pc.zy + 7.0) + vnoise(pc.xz + 3.0)) / 3.0 - 0.5;
    float thick = smoothstep(0.3, 0.6, luma(fb));
    float warm = smoothstep(-0.5, 1.0, dot(N, uSunDir));
    // three mixes: the light, the half-tone, the shade — broken in patches across the body
    float zr = vnoise(P.xy * 3.0 + P.z * 2.0);
    float x = warm * model * mix(1.0, sunShadow(vWorld, N), 0.5);
    vec3 lit = fb * paint3(vec3(0.8, 0.77, 0.74) + uSunCol * 0.3, vec3(0.7, 0.69, 0.7) + uSunCol * 0.1, vec3(0.5, 0.53, 0.62), x, zr);
    lit = mix(fb * model * (vec3(0.8, 0.77, 0.74) + uSunCol * 0.3 * warm), lit, uPaint3);
    // (Bellák: he never painted white as white — yellow, blue and green play in it, as the light makes it)
    float whiteness = smoothstep(0.32, 0.7, luma(fb));
    vec3 tint = mix(vec3(0.8, 0.93, 1.1), vec3(1.1, 1.0, 0.8), warm);
    lit *= mix(vec3(1.0), tint, whiteness * 0.85);
    lit *= 1.0 + crust * 0.34 * thick;
    lit += fb * vec3(0.5, 0.55, 0.9) * uFlash * 0.6;
    lit += fb * uLampCol * lampAt(vWorld, N);
    float dist = length(vWorld - cameraPosition);
    float fog = clamp(1.0 - exp(-max(dist - uFogStart, 0.0) * uFogDensity), 0.0, 1.0);
    gl_FragColor = vec4(mix(lit, hazeColor((vWorld - cameraPosition) / dist), fog), 1.0);
    return;
  }
#endif
  // ---- light: the ridge of paint leans the normal, the low sun from the clearing, the storm's cold fill
  vec3 Lw = toWorld(A1 * L2.x + A2 * L2.y);
  vec3 Ww = toWorld(A1 * -L2.y + A2 * L2.x);
  float relief = uRelief * (0.4 + paintH);
  vec3 Nb = normalize(N - Ww * across * relief - Lw * (along - 0.5) * relief * 0.4);
  float ndl = dot(Nb, uSunDir);
  float diff = smoothstep(-0.45, 1.0, ndl);
  vec3 amb = mix(uGroundAmb, uSkyAmb, Nb.y * 0.5 + 0.5);
  // the shadow is taken by each stroke whole, at its middle: a shadow's edge is a ragged line of whole touches
  vec3 strokeMid = vWorld - Lw * (along - 0.5) * Seff - Ww * across * Seff * uWidth * 0.5;
  // he painted no cast shadows on the plain, only a trace — but in sunlit Mostar they lie sharp and lilac
  float town = uTown.w * (1.0 - smoothstep(uTown.z * 0.65, uTown.z, length(vWorld.xz - uTown.xy)));
  float shade = mix(1.0, sunShadow(mix(strokeMid, vWorld, town), N), mix(uShadowAmt * 0.7, 0.92, town));
#ifdef SURF
  for (int i = 0; i < 24; i++) {
    vec4 b = uBlobs[i];
    if (b.w <= 0.0) continue;
    float d = length(vWorld.xz - b.xy) / b.z;
    shade *= 1.0 - b.w * smoothstep(1.0, 0.25, d);
  }
#endif
  // three mixes, chosen stroke by stroke by how lit the stroke is; the shade is cool, blue-violet
  vec3 mixL = albedo * (amb + uSunCol * (1.15 + uClear * 0.25));
  vec3 mixM = albedo * (amb + uSunCol * 0.72) * vec3(0.96, 0.97, 1.02);
  vec3 mixS = albedo * (amb + uSunCol * 0.3) * mix(vec3(0.8, 0.9, 1.18), vec3(0.86, 0.84, 1.3), town);
  float litAmt = diff * shade;
  vec3 lit = mix(paint3(mixL, mixM, mixS, litAmt, hash11(c0.id * 31.7 + 0.3)), paint3(mixL, mixM, mixS, litAmt, hash11(c1.id * 31.7 + 0.3)), w);
  lit = mix(lit, albedo * (amb + uSunCol * litAmt * 1.15), mix(1.0, 0.3, uPaint3));   // a little of the true light, so form still reads
  float inShade = 1.0 - shade * smoothstep(-0.1, 0.3, ndl);
  float whiteness = smoothstep(0.32, 0.7, luma(albedo));
  lit *= mix(vec3(1.0), mix(vec3(1.1, 1.0, 0.82), vec3(0.82, 0.94, 1.12), inShade), whiteness * 0.7);
  float rim = pow(1.0 - max(dot(Nb, V), 0.0), 3.0);
  lit += albedo * uSunCol * rim * 0.35 * smoothstep(-0.2, 0.5, ndl);
  lit += albedo * vec3(0.5, 0.55, 0.9) * uFlash * 0.9 * (Nb.y * 0.5 + 0.5);
  lit += albedo * uLampCol * lampAt(vWorld, Nb);
  lit = mix(lit, albedo, uEmissive);

  // ---- the haze of the plain
  float dist = length(vWorld - cameraPosition);
  vec3 vd = (vWorld - cameraPosition) / dist;
  float fog = 1.0 - exp(-max(dist - uFogStart, 0.0) * uFogDensity);
  fog = clamp(fog, 0.0, 1.0);
#ifdef KIND_GROUND
  // the middle of his plain glows: pale, whitish green, lighter toward the horizon — light, not haze
  // (the plain only: not the mountain behind Mostar nor the hills, which keep their own colour)
  float glowT = smoothstep(50.0, 420.0, dist) * (1.0 - vSurf.y) * (1.0 - vSurf.x * 0.6) * (1.0 - smoothstep(6.0, 24.0, vWorld.y));
  lit = mix(lit, uHazePale * vec3(1.35, 1.42, 1.15) * (0.9 + 0.2 * vnoise(vWorld.xz * 0.01)), glowT * 0.42);
#endif
  lit = mix(lit, hazeColor(vd), fog);
  gl_FragColor = vec4(lit, 1.0);
}
`;

// ------------------------------------------------------------- shared uniforms and the factory

export const shared = {
  tSky: { value: null },
  uCanvas: { value: new THREE.Vector4(0.65, 0.33, 1, 0) },
  uCanvasAspect: { value: 1.965 },
  uStorm: { value: [] },
  uCloud: { value: [] },
  uSunset: { value: [] },
  uHazePale: { value: new THREE.Color(0.45, 0.47, 0.38) },
  uSunDir: { value: new THREE.Vector3(0.75, 0.24, -0.62).normalize() },
  uSunCol: { value: new THREE.Color(1.25, 0.92, 0.62) },
  uSkyAmb: { value: new THREE.Color(0.2, 0.24, 0.36) },
  uGroundAmb: { value: new THREE.Color(0.12, 0.13, 0.07) },
  uTime: { value: 0 },
  uFlash: { value: 0 },
  uBolt: { value: new THREE.Vector4(-1, 0, 0, 0) },
  uFogDensity: { value: 0.0006 },
  uFogStart: { value: 90 },
  uResScale: { value: 1 },
  uBlobs: { value: Array.from({ length: 24 }, () => new THREE.Vector4(0, 0, 1, 0)) },
  uWater: { value: -0.45 },
  uClear: { value: 0 },
  tShadow: { value: null },
  uShadowMat: { value: new THREE.Matrix4() },
  uShadowOn: { value: 0 },
  uShadowAmt: { value: 0.32 },
  tBrush: { value: null },
  uLamps: { value: Array.from({ length: 12 }, () => new THREE.Vector4(0, 0, 0, 0)) },
  uLampCol: { value: new THREE.Color(1.6, 1.05, 0.5) },
  uPaint3: { value: 1 },
  uBrushOn: { value: 1 },
  uShadowTexel: { value: new THREE.Vector2(1 / 2048, 1 / 2048) },
  uHatch: { value: 1 },
  uCedar: { value: 0 },
  uTown: { value: new THREE.Vector4(0, 0, 1, 0) },
  uMtnAcross: { value: new THREE.Vector2(0, -1) },
  uMtnCol: { value: [new THREE.Color('#2b2c4f'), new THREE.Color('#4f4b74'), new THREE.Color('#cf8f72'), new THREE.Color('#e4b59c')] },
};

const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

/** load the palette measured on the scan into the shared uniforms; returns the band-factor sets per region */
export function applyPalette(json) {
  const b = json.bands;
  shared.uStorm.value = b.storm.map(v3);
  shared.uCloud.value = b.cloud.map(v3);
  shared.uSunset.value = b.sunset.map(v3);
  const pale = b.plain[4];
  shared.uHazePale.value.setRGB(pale[0], pale[1], pale[2]);
  const factors = {};
  for (const [k, bands] of Object.entries(b)) {
    const mean = [0, 1, 2].map((i) => bands.reduce((s, x) => s + x[i], 0) / bands.length);
    factors[k] = bands.map((x) => new THREE.Vector3(...x.map((v, i) => v / Math.max(mean[i], 1e-4))));
  }
  return factors;
}

let FACTORS = null;
export function setFactors(f) { FACTORS = f; }

const KIND_DEFAULTS = {
  ground: { stroke: 0.8, width: 0.13, px: 44, relief: 0.16, jitter: 0.12, gap: 0.93, palette: 'plain', palAmt: 0.12, world: true },
  brick: { stroke: 0.34, width: 0.34, px: 24, relief: 0.24, jitter: 0.08, gap: 0.9, palette: 'brick', palAmt: 0.1, world: true },
  wall: { stroke: 0.5, width: 0.28, px: 28, relief: 0.16, jitter: 0.04, gap: 0.96, palette: 'hide', palAmt: 0.06, world: true },
  roof: { stroke: 0.4, width: 0.16, px: 26, relief: 0.55, jitter: 0.16, gap: 0.7, palette: 'road', palAmt: 0.12, world: true },
  wood: { stroke: 0.22, width: 0.22, px: 22, relief: 0.35, jitter: 0.1, gap: 0.75, palette: 'brick', palAmt: 0.12 },
  beast: { stroke: 0.14, width: 0.4, px: 16, relief: 0.12, jitter: 0.05, gap: 0.95, palette: 'hide', palAmt: 0.06 },
  cloth: { stroke: 0.12, width: 0.38, px: 16, relief: 0.18, jitter: 0.06, gap: 0.92, palette: 'hide', palAmt: 0.08 },
  trunk: { stroke: 0.3, width: 0.25, px: 22, relief: 0.4, jitter: 0.12, gap: 0.7, palette: 'grass', palAmt: 0.12 },
  leaf: { stroke: 0.3, width: 0.62, px: 18, relief: 0.4, jitter: 0.18, gap: 0.7, palette: 'grass', palAmt: 0.2, world: true },
  glow: { stroke: 0.2, width: 0.4, px: 18, relief: 0.0, jitter: 0.05, gap: 1.0, palette: 'sunset', palAmt: 0.05, emissive: 1 },
};

/**
 * A painted material.
 *  kind:  ground | brick | wall | roof | wood | beast | cloth | trunk | leaf | glow
 *  color: base colour (linear); multiplied by vertex colours when the geometry has them
 *  opts:  instanced, vertexColors, surf (ground carries aSurf), objScale (stroke space scale for object-space kinds)
 */
export function paintMaterial(kind, color = 0xffffff, opts = {}) {
  const k = { ...KIND_DEFAULTS[kind], ...opts };
  const defines = { [`KIND_${kind.toUpperCase()}`]: 1 };
  if (k.world) defines.WORLD_STROKES = 1;
  if (opts.surf) defines.SURF = 1;
  const pal = (FACTORS && FACTORS[k.palette]) || Array.from({ length: 5 }, () => new THREE.Vector3(1, 1, 1));
  const mat = new THREE.ShaderMaterial({
    defines,
    uniforms: {
      ...shared,
      uBase: { value: new THREE.Color(color) },
      uPal: { value: pal },
      uPalAmt: { value: k.palAmt },
      uStroke: { value: k.stroke },
      uWidth: { value: k.width },
      uPx: { value: k.px },
      uRelief: { value: k.relief },
      uJitter: { value: k.jitter },
      uGap: { value: k.gap },
      uEmissive: { value: k.emissive || 0 },
      uObjScale: { value: k.objScale || 1 },
    },
    vertexShader: 'uniform float uObjScale;\n' + VERT,
    fragmentShader: FRAG,
    vertexColors: !!opts.vertexColors,
    side: opts.side ?? THREE.FrontSide,
  });
  mat.userData.kind = kind;
  return mat;
}
