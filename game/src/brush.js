// The brush sheet: eight marks of a loaded bristle brush, made in code. Each cell holds one mark laid along +v:
// r is how thick the paint stands (for the light that rakes across it), g is where there is paint at all, b is a slow
// streak along the bristles (where a second colour was picked up and not mixed in).
//
// Adapted from "Oil paint" by blendi on Patch (https://patch.gg/blendi/oil-paint, src/oilpaint/brush.js),
// MIT License, Copyright (c) 2026 Patch. Changed for Csontváry's thin paint: the marks are flatter, their edges
// fuller, and they run dry less.
import * as THREE from 'three';

export const BRUSH_COLS = 4;
export const BRUSH_ROWS = 2;
const CW = 128, CH = 256;

const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const smooth = (t) => t * t * (3 - 2 * t);
const n1 = (x, seed) => { const i = Math.floor(x), f = smooth(x - i); return hash(i + seed * 57.3) * (1 - f) + hash(i + 1 + seed * 57.3) * f; };
const n2 = (x, y, seed) => {
  const i = Math.floor(x), j = Math.floor(y), fx = smooth(x - i), fy = smooth(y - j);
  const h = (a, b) => hash(a * 1.31 + b * 91.7 + seed * 13.9);
  return (h(i, j) * (1 - fx) + h(i + 1, j) * fx) * (1 - fy) + (h(i, j + 1) * (1 - fx) + h(i + 1, j + 1) * fx) * fy;
};
const sstep = (a, b, x) => smooth(Math.min(1, Math.max(0, (x - a) / (b - a))));

// one mark: kind 0 a long stroke, 1 a short pressed dab, 2 a stroke with a curve to it
function mark(u, v, seed, kind) {
  const bend = kind === 2 ? (seed % 2 ? 0.3 : -0.3) : (hash(seed * 3.1) - 0.5) * 0.1;
  const ub = u - bend * (4 * (v - 0.5) * (v - 0.5) - 0.5);
  const wob = (n1(v * 5, seed + 3) - 0.5) * 0.08;
  const a = Math.abs(ub + wob);
  if (kind === 1) {
    const r = Math.hypot(ub / 0.7, (v - 0.5) / 0.46);
    const edge = 1 + (n1(Math.atan2(v - 0.5, ub) * 2.2 + 9, seed) - 0.5) * 0.24;
    const inside = 1 - sstep(edge - 0.18, edge, r);
    const ridge = n1(ub * 13 + n1(v * 3, seed) * 1.5, seed + 31);
    const height = inside * (0.4 + 0.16 * ridge + 0.2 * sstep(0.5, 0.95, r) + 0.1 * n2(ub * 4, v * 6, seed));
    return [height, inside, n2(ub * 3.2, v * 1.3, seed + 20)];
  }
  const half = 0.66 * (0.85 + 0.15 * Math.sin(Math.PI * Math.min(1, v * 1.15))) * (1 + (n1(v * 7, seed + 1) - 0.5) * 0.08);
  const start = 0.04 + 0.04 * n1(ub * 5, seed + 2);
  const end = 0.97 - 0.16 * n1(ub * 4.5 + 2, seed + 4) - 0.04 * n1(ub * 19, seed + 6);
  const side = 1 - sstep(half - 0.12, half, a);
  const head = sstep(start, start + 0.05, v);
  const tail = 1 - sstep(end - 0.04, end + 0.02, v);
  // only the very end runs a little dry
  const dryness = sstep(end - 0.12, end, v);
  const bristle = n1(ub * 13, seed + 8) * 0.7 + n1(ub * 31, seed + 9) * 0.3;
  const gap = bristle > dryness * 0.5 - 0.04 ? 1.0 : 0.0;
  const alpha = side * head * tail * gap;
  const furrow = n1(ub * 12 + n1(v * 2.5, seed + 12) * 1.2, seed + 33) * 0.7 + n1(ub * 29, seed + 34) * 0.3;
  const load = 1 - 0.5 * sstep(0.1, 0.9, v);
  const squeezed = sstep(half - 0.3, half - 0.06, a);
  const height = alpha * (0.32 + 0.16 * furrow + 0.2 * squeezed + 0.2 * load * (1 - sstep(start, start + 0.25, v)) + 0.08 * n2(ub * 3, v * 7, seed + 14));
  return [Math.min(1, height), alpha, n2(ub * 3.4, v * 1.1, seed + 20)];
}

export function createBrushSheet() {
  const W = CW * BRUSH_COLS, H = CH * BRUSH_ROWS;
  const data = new Uint8Array(W * H * 4);
  const kinds = [0, 0, 0, 2, 1, 1, 0, 2];
  for (let cell = 0; cell < 8; cell++) {
    const cx = cell % BRUSH_COLS, cy = Math.floor(cell / BRUSH_COLS);
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
      const u = ((x + 0.5) / CW) * 2 - 1, v = (y + 0.5) / CH;
      const m = 0.9;
      const [h, a, s] = Math.abs(u) > m || v < 0.04 || v > 0.96 ? [0, 0, 0.5] : mark(u / m, (v - 0.04) / 0.92, cell * 7 + 1, kinds[cell]);
      const i = ((cx * CW + x) + (cy * CH + y) * W) * 4;
      data[i] = Math.round(h * 255); data[i + 1] = Math.round(a * 255); data[i + 2] = Math.round(s * 255); data[i + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, W, H);
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

// GLSL: sample one mark of the sheet at cell-local (x across -1..1, y along 0..1), with an explicit level
export const GLSL_BRUSH = /* glsl */ `
uniform sampler2D tBrush;
vec4 brushMark(float cell, vec2 xy, float lod) {
  vec2 q = vec2(clamp(xy.x * 0.5 + 0.5, 0.0, 1.0), clamp(xy.y, 0.0, 1.0));
  vec2 uv = (vec2(mod(cell, ${BRUSH_COLS}.0), floor(cell / ${BRUSH_COLS}.0)) + q) / vec2(${BRUSH_COLS}.0, ${BRUSH_ROWS}.0);
  return textureLod(tBrush, uv, lod);
}
`;
