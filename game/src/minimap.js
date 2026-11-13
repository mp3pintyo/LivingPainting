// Minimap — a small round painted map in a gilded ring: north-up, centred on the cart. Plain Canvas2D, no three.js.
// The static layers (plain, hills, lakes, river, roads, bridges) are painted ONCE into an offscreen canvas that covers
// the whole world at ≤1 px per metre; each update only blits the visible window and draws the moving marks.
// Styles: css/hud2.css (.mm …).
//
//   const mm = new Minimap(hudElement, mapData);
//   mm.update({ x, z, yaw }, target /* {x,z} | null */, drops /* [{x,z}] */);   // ~10× a second
//   mm.zoom = 1.5;                                                              // 1 = ±180 m, 2 = ±90 m
//
// mapData = { bounds: {cx, cz, r}, river: [[x, z, halfWidth], …], lakes: [{x, z, rx, rz}], roads: [[[x, z], …], …],
//             bridges: [{x1, z1, x2, z2, width}], hills: [{x, z, r}], landmarks: [{id, name, sub, x, z, icon}] }
// World: metres, x = east, z = south (north is -z). The player faces (-sin yaw, -cos yaw); yaw 0 = north.
import { ICON_PATHS } from './highlights.js';

const BASE_RANGE = 180;           // metres from the centre to the rim at zoom 1
const MAP_R = 0.451;              // the painted disc, as a fraction of the element's size (the ring frames the rest)
const RING_BAND = 0.473;          // the middle of the ring's dark band (where the off-map target pointer sits)
const MAX_TEX = 2048;             // the static canvas never exceeds this many pixels a side

// colours of the painted map (Csontváry's Hortobágy: pale greens, straw, ochre; deep teal water)
const C = {
  beyond: '#2b2620',
  plain: '#a3a777',
  patches: ['#b9b783', '#c7b47a', '#9da26f', '#8e9a68', '#c9a86a', '#b0b98d', '#a39462'],
  strokes: ['#d6c890', '#bcc08a', '#859060', '#c6a060', '#9eae86', '#e0d3a2', '#7d8456', '#b49a63'],
  hill: '62, 70, 44',
  hillLight: '226, 214, 160',
  bank: '#6f6a45',
  water: '#1d5a5e',
  waterMid: '#2a7470',
  waterGlint: 'rgba(196, 226, 214, 0.35)',
  lake: '#3f9c98',
  lakeLight: '#7cc6b9',
  lakeRim: '#d9cf9f',
  roadEdge: 'rgba(110, 92, 58, 0.55)',
  road: '#dcc796',
  bridgeEdge: '#4b3a2c',
  bridge: '#e4d3b3',
  gold: '#d9b56a',
  goldLight: '#f3dca3',
  ink: '#f3ead6',
  dark: '#1b140b',
};

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

/** bounds that enclose everything in the data, when none are given */
function guessBounds(d) {
  const pts = [];
  for (const p of d.river || []) pts.push(p);
  for (const r of d.roads || []) pts.push(...r);
  for (const l of d.landmarks || []) pts.push([l.x, l.z]);
  if (!pts.length) return { cx: 0, cz: 0, r: 500 };
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, r: Math.max(x1 - x0, z1 - z0) / 2 + 50 };
}

/** the union of a polyline's segments with linearly varying half-width, as one path (trapezoids + discs) */
function widePath(ctx, pts, grow = 0, scale = 1) {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const [x, z, w0] = pts[i];
    const w = w0 * scale + grow;
    ctx.moveTo(x + w, z);
    ctx.arc(x, z, w, 0, Math.PI * 2);
    if (i === pts.length - 1) break;
    const [bx, bz, bw0] = pts[i + 1];
    const bw = bw0 * scale + grow;
    const dx = bx - x, dz = bz - z, len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len, nz = dx / len;
    // wound the same way as the arcs (positive angle direction), so the nonzero fill makes one solid union
    ctx.moveTo(x - nx * w, z - nz * w);
    ctx.lineTo(bx - nx * bw, bz - nz * bw);
    ctx.lineTo(bx + nx * bw, bz + nz * bw);
    ctx.lineTo(x + nx * w, z + nz * w);
    ctx.closePath();
  }
}

export class Minimap {
  /**
   * @param {HTMLElement} container  where the map goes (e.g. #hud); it positions itself (bottom right)
   * @param {object} mapData         see the header
   * @param {{northLabel?: string, labelRadius?: number}} [opts]
   */
  constructor(container, mapData, opts = {}) {
    this.zoom = 1;
    this.northLabel = opts.northLabel ?? 'É';
    this.labelRadius = opts.labelRadius ?? 0.62;   // landmark names show inside this fraction of the visible radius
    this._icons = {};
    for (const [k, d] of Object.entries(ICON_PATHS)) this._icons[k] = new Path2D(d);

    this.el = document.createElement('div');
    this.el.className = 'mm';
    this.el.setAttribute('role', 'img');
    this.el.setAttribute('aria-label', 'Térkép');
    // the ring lies under the canvas: the map disc is clipped inside it, and the rim pointer is drawn on its band
    this.el.insertAdjacentHTML('beforeend', this._ringSvg());
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'mm-map';
    this.el.appendChild(this.canvas);
    this.el.insertAdjacentHTML('beforeend', this._northSvg());
    container.appendChild(this.el);
    this.ctx = this.canvas.getContext('2d');

    this._size = 0; this._dpr = 0;
    this._last = null;
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(() => { this._fit(); if (this._last) this._draw(...this._last); });
      this._ro.observe(this.el);
    }
    this.setData(mapData);
  }

  /** visible radius in metres (from the centre to the rim) */
  get range() { return BASE_RANGE / (this.zoom || 1); }

  setVisible(v) { this.el.hidden = !v; }

  /** the way to the target, [{x, z}, …] (or null): drawn under the landmarks as a gold dotted line */
  setRoute(points) { this.route = points && points.length > 1 ? points : null; }

  /** replace the map data and repaint the static layers */
  setData(mapData) {
    this.data = mapData || {};
    this.bounds = this.data.bounds || guessBounds(this.data);
    this.landmarks = this.data.landmarks || [];
    this._paintStatic();
    if (this._last) this._draw(...this._last);
  }

  /**
   * @param {{x:number, z:number, yaw:number}} player
   * @param {{x:number, z:number}|null} [target]
   * @param {Array<{x:number, z:number}>} [drops]
   */
  update(player, target = null, drops = null) {
    this._last = [player, target, drops];
    this._draw(player, target, drops);
  }

  dispose() { this._ro?.disconnect(); this.el.remove(); this._static = null; }

  // ------------------------------------------------------------------------------------------------ static layers

  _paintStatic() {
    const { cx, cz, r } = this.bounds;
    const ppm = Math.min(1, MAX_TEX / (2 * r));
    const n = Math.ceil(2 * r * ppm);
    const cv = makeCanvas(n, n);
    const g = cv.getContext('2d');
    this._static = cv;
    this._ppm = ppm;
    this._x0 = cx - r; this._z0 = cz - r;

    // world coordinates from here on (1 unit = 1 m)
    g.setTransform(ppm, 0, 0, ppm, -this._x0 * ppm, -this._z0 * ppm);
    g.save();
    g.beginPath(); g.arc(cx, cz, r, 0, Math.PI * 2); g.clip();
    const rnd = mulberry32(19031903);

    // the plain: a base tone, broad soft patches of green and ochre, then many short brush strokes
    g.fillStyle = C.plain;
    g.fillRect(cx - r, cz - r, 2 * r, 2 * r);
    const area = Math.PI * r * r;
    const patches = Math.round(area / 9000);
    for (let i = 0; i < patches; i++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * r;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, pr = 40 + rnd() * 140;
      const grad = g.createRadialGradient(x, z, 0, x, z, pr);
      const col = C.patches[(rnd() * C.patches.length) | 0];
      grad.addColorStop(0, col); grad.addColorStop(1, col + '00');
      g.globalAlpha = 0.35 + rnd() * 0.35;
      g.fillStyle = grad;
      g.beginPath(); g.ellipse(x, z, pr * 1.6, pr, (rnd() - 0.5) * 0.5, 0, Math.PI * 2); g.fill();
    }
    g.lineCap = 'round';
    const strokes = Math.round(area / 420);
    for (let i = 0; i < strokes; i++) {
      const x = cx + (rnd() * 2 - 1) * r, z = cz + (rnd() * 2 - 1) * r;
      const len = 10 + rnd() * 30, ang = (rnd() - 0.5) * 0.7 + (rnd() < 0.15 ? 0.6 : 0);  // mostly horizontal, like the canvas
      const dx = Math.cos(ang) * len / 2, dz = Math.sin(ang) * len / 2;
      g.globalAlpha = 0.1 + rnd() * 0.2;
      g.strokeStyle = C.strokes[(rnd() * C.strokes.length) | 0];
      g.lineWidth = 2 + rnd() * 5;
      g.beginPath(); g.moveTo(x - dx, z - dz);
      g.quadraticCurveTo(x, z + (rnd() - 0.5) * 4, x + dx, z + dz);
      g.stroke();
    }
    g.globalAlpha = 1;

    // hills: soft darker mounds, lit from the north-west
    for (const h of this.data.hills || []) {
      const sh = g.createRadialGradient(h.x + h.r * 0.12, h.z + h.r * 0.12, 0, h.x, h.z, h.r);
      sh.addColorStop(0, `rgba(${C.hill}, 0.42)`); sh.addColorStop(0.6, `rgba(${C.hill}, 0.22)`); sh.addColorStop(1, `rgba(${C.hill}, 0)`);
      g.fillStyle = sh; g.beginPath(); g.arc(h.x, h.z, h.r, 0, Math.PI * 2); g.fill();
      const li = g.createRadialGradient(h.x - h.r * 0.3, h.z - h.r * 0.3, 0, h.x - h.r * 0.3, h.z - h.r * 0.3, h.r * 0.55);
      li.addColorStop(0, `rgba(${C.hillLight}, 0.28)`); li.addColorStop(1, `rgba(${C.hillLight}, 0)`);
      g.fillStyle = li; g.beginPath(); g.arc(h.x - h.r * 0.3, h.z - h.r * 0.3, h.r * 0.55, 0, Math.PI * 2); g.fill();
      // a few contour-like strokes on the slope
      g.strokeStyle = `rgba(${C.hill}, 0.22)`; g.lineWidth = 2.5;
      for (let k = 1; k <= 2; k++) {
        g.beginPath(); g.arc(h.x, h.z, h.r * (0.3 + k * 0.18), Math.PI * (0.9 + rnd() * 0.2), Math.PI * (1.9 + rnd() * 0.3)); g.stroke();
      }
    }

    // lakes: a pale sandy rim, turquoise water, lighter in the middle
    for (const l of this.data.lakes || []) {
      g.fillStyle = C.lakeRim; g.globalAlpha = 0.7;
      g.beginPath(); g.ellipse(l.x, l.z, l.rx + 5, l.rz + 5, 0, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
      const lg = g.createRadialGradient(l.x - l.rx * 0.2, l.z - l.rz * 0.2, 0, l.x, l.z, Math.max(l.rx, l.rz));
      lg.addColorStop(0, C.lakeLight); lg.addColorStop(1, C.lake);
      g.fillStyle = lg; g.beginPath(); g.ellipse(l.x, l.z, l.rx, l.rz, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(235, 245, 230, 0.35)'; g.lineWidth = 2;
      for (let k = 0; k < 4; k++) {
        const oz = (rnd() - 0.5) * l.rz, w = l.rx * (0.25 + rnd() * 0.3), ox = (rnd() - 0.5) * l.rx * 0.6;
        g.beginPath(); g.moveTo(l.x + ox - w / 2, l.z + oz); g.lineTo(l.x + ox + w / 2, l.z + oz); g.stroke();
      }
    }

    // the river: an olive bank, deep teal water, a lighter current down the middle, glints
    const river = this.data.river || [];
    if (river.length > 1) {
      g.fillStyle = C.bank; g.globalAlpha = 0.75; widePath(g, river, 3.5); g.fill();
      g.globalAlpha = 1;
      g.fillStyle = C.water; widePath(g, river, 0); g.fill();
      g.fillStyle = C.waterMid; g.globalAlpha = 0.7; widePath(g, river, -1, 0.45); g.fill();
      g.globalAlpha = 1;
      g.strokeStyle = C.waterGlint; g.lineWidth = 1.6;
      for (let i = 0; i < river.length - 1; i++) {
        const [ax, az, aw] = river[i], [bx, bz] = river[i + 1];
        const len = Math.hypot(bx - ax, bz - az), n = Math.floor(len / 45);
        for (let k = 0; k < n; k++) {
          const t = (k + rnd()) / Math.max(1, n), off = (rnd() - 0.5) * aw;
          const px = ax + (bx - ax) * t, pz = az + (bz - az) * t, ux = (bx - ax) / len, uz = (bz - az) / len;
          const ox = -uz * off, oz = ux * off, s = 4 + rnd() * 7;
          g.beginPath(); g.moveTo(px + ox - ux * s, pz + oz - uz * s); g.lineTo(px + ox + ux * s, pz + oz + uz * s); g.stroke();
        }
      }
    }

    // roads: pale dusty ochre with a soft darker verge
    g.lineCap = 'round'; g.lineJoin = 'round';
    const roads = this.data.roads || [];
    const roadPath = (w, style) => {
      g.strokeStyle = style; g.lineWidth = w;
      for (const rd of roads) {
        if (rd.length < 2) continue;
        g.beginPath(); g.moveTo(rd[0][0], rd[0][1]);
        for (let i = 1; i < rd.length; i++) g.lineTo(rd[i][0], rd[i][1]);
        g.stroke();
      }
    };
    roadPath(8, C.roadEdge);
    roadPath(4.6, C.road);

    // bridges: a dark outline, pale stone deck, the piers as ticks
    for (const b of this.data.bridges || []) {
      const w = b.width || 8;
      g.lineCap = 'butt';
      g.strokeStyle = C.bridgeEdge; g.lineWidth = w + 4;
      g.beginPath(); g.moveTo(b.x1, b.z1); g.lineTo(b.x2, b.z2); g.stroke();
      g.strokeStyle = C.bridge; g.lineWidth = w;
      g.beginPath(); g.moveTo(b.x1, b.z1); g.lineTo(b.x2, b.z2); g.stroke();
      const len = Math.hypot(b.x2 - b.x1, b.z2 - b.z1), ux = (b.x2 - b.x1) / len, uz = (b.z2 - b.z1) / len;
      const piers = Math.max(2, Math.round(len / 16));
      g.strokeStyle = 'rgba(75, 58, 44, 0.75)'; g.lineWidth = 1.6;
      for (let k = 1; k < piers; k++) {
        const t = (k / piers) * len, px = b.x1 + ux * t, pz = b.z1 + uz * t;
        g.beginPath(); g.moveTo(px - uz * (w / 2 + 2), pz + ux * (w / 2 + 2)); g.lineTo(px + uz * (w / 2 + 2), pz - ux * (w / 2 + 2)); g.stroke();
      }
    }

    // the edge of the world: the paint thins out toward the rim
    const edge = g.createRadialGradient(cx, cz, r * 0.86, cx, cz, r);
    edge.addColorStop(0, 'rgba(43, 38, 32, 0)'); edge.addColorStop(1, 'rgba(43, 38, 32, 0.85)');
    g.fillStyle = edge; g.fillRect(cx - r, cz - r, 2 * r, 2 * r);
    g.restore();
  }

  // ---------------------------------------------------------------------------------------------------- per update

  _fit() {
    const s = Math.round(this.el.clientWidth || this.canvas.clientWidth || 220);
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    if (s === this._size && dpr === this._dpr) return;
    this._size = s; this._dpr = dpr;
    this.canvas.width = Math.round(s * dpr);
    this.canvas.height = Math.round(s * dpr);
    this._vignette = null;
  }

  _draw(player, target, drops) {
    if (!player) return;
    this._fit();
    const ctx = this.ctx, N = this.canvas.width;
    if (!N) return;
    const u = this._dpr * Math.max(0.78, Math.min(1, this._size / 220));   // device px per "glyph px"
    const c = N / 2, Rp = N * MAP_R, R = this.range, k = Rp / R;
    const px = player.x, pz = player.z;
    const sx = (x) => c + (x - px) * k, sy = (z) => c + (z - pz) * k;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, N, N);
    ctx.save();
    ctx.beginPath(); ctx.arc(c, c, Rp, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = C.beyond; ctx.fillRect(0, 0, N, N);

    // the static map: the window [px-R, px+R] × [pz-R, pz+R], clipped to the texture by hand
    const ppm = this._ppm, tex = this._static, tw = tex.width;
    let s0x = (px - R - this._x0) * ppm, s0y = (pz - R - this._z0) * ppm, s1x = s0x + 2 * R * ppm, s1y = s0y + 2 * R * ppm;
    let d0x = c - Rp, d0y = c - Rp, d1x = c + Rp, d1y = c + Rp;
    const f = (d1x - d0x) / (s1x - s0x);
    if (s0x < 0) { d0x -= s0x * f; s0x = 0; }
    if (s0y < 0) { d0y -= s0y * f; s0y = 0; }
    if (s1x > tw) { d1x -= (s1x - tw) * f; s1x = tw; }
    if (s1y > tw) { d1y -= (s1y - tw) * f; s1y = tw; }
    if (s1x > s0x && s1y > s0y) {
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(tex, s0x, s0y, s1x - s0x, s1y - s0y, d0x, d0y, d1x - d0x, d1y - d0y);
    }

    // the way there: a dark band with gold dots along it
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (this.route) {
      ctx.beginPath();
      this.route.forEach((p, i) => (i ? ctx.lineTo(sx(p.x), sy(p.z)) : ctx.moveTo(sx(p.x), sy(p.z))));
      ctx.strokeStyle = 'rgba(27, 20, 11, 0.55)'; ctx.lineWidth = 6 * u; ctx.stroke();
      ctx.setLineDash([0.1, 7 * u]);
      ctx.lineDashOffset = -((typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000) * 14 * u;
      ctx.strokeStyle = '#ffd884'; ctx.lineWidth = 3.4 * u; ctx.stroke();
      ctx.setLineDash([]);
    }

    // landmarks: a dark medallion with the gold icon; names near the centre
    const labelR = R * this.labelRadius, labels = [];
    for (const lm of this.landmarks) {
      const dx = lm.x - px, dz = lm.z - pz, d = Math.hypot(dx, dz);
      if (d > R * 1.08) continue;
      const x = sx(lm.x), y = sy(lm.z), br = 8.5 * u;
      ctx.fillStyle = 'rgba(27, 20, 11, 0.78)';
      ctx.beginPath(); ctx.arc(x, y, br, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = C.gold; ctx.lineWidth = 1 * u; ctx.stroke();
      const icon = this._icons[lm.icon];
      if (icon) {
        const s = (12.5 * u) / 24;
        ctx.save();
        ctx.translate(x - 12 * s, y - 12 * s); ctx.scale(s, s);
        ctx.strokeStyle = C.goldLight; ctx.lineWidth = 2.1; ctx.stroke(icon);
        ctx.restore();
      } else {
        ctx.fillStyle = C.goldLight; ctx.beginPath(); ctx.arc(x, y, 2.2 * u, 0, Math.PI * 2); ctx.fill();
      }
      if (d < labelR) labels.push({ lm, x, y, br, d });
    }
    if (labels.length) {
      const fs = Math.round(11.5 * u);
      ctx.font = `italic 600 ${fs}px "Cormorant Garamond", "EB Garamond", Georgia, serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      // nearest first; a label goes below its medallion, else above, else it is left out (no overlaps, the cart
      // arrow and the other medallions stay clear)
      labels.sort((a, b) => a.d - b.d);
      const taken = [{ x0: c - 10 * u, y0: c - 10 * u, x1: c + 10 * u, y1: c + 10 * u, lm: null }];   // the cart
      for (const l of labels) taken.push({ x0: l.x - l.br, y0: l.y - l.br, x1: l.x + l.br, y1: l.y + l.br, lm: l.lm });
      for (const l of labels) {
        const w = ctx.measureText(l.lm.name).width, h = fs * 1.05;
        let place = null;
        for (const cy of [l.y + l.br + 2 * u + h / 2, l.y - l.br - 2 * u - h / 2]) {
          const r = { x0: l.x - w / 2 - 2 * u, y0: cy - h / 2, x1: l.x + w / 2 + 2 * u, y1: cy + h / 2 };
          const others = taken.filter((t) => t.lm !== l.lm);
          const lim = (Rp - 3 * u) ** 2;
          const inside = [[r.x0, r.y0], [r.x1, r.y0], [r.x0, r.y1], [r.x1, r.y1]].every(([qx, qy]) => (qx - c) ** 2 + (qy - c) ** 2 < lim);
          if (inside && !others.some((t) => r.x0 < t.x1 && r.x1 > t.x0 && r.y0 < t.y1 && r.y1 > t.y0)) { place = { r, cy }; break; }
        }
        if (!place) continue;
        taken.push({ ...place.r, lm: null });
        ctx.globalAlpha = Math.max(0, Math.min(1, (labelR - l.d) / (labelR * 0.18)));
        ctx.lineWidth = 2.6 * u; ctx.strokeStyle = 'rgba(24, 18, 11, 0.7)';
        ctx.strokeText(l.lm.name, l.x, place.cy);
        ctx.fillStyle = C.ink; ctx.fillText(l.lm.name, l.x, place.cy);
      }
      ctx.globalAlpha = 1;
    }

    // drops: small golden dots with a halo
    if (drops) {
      for (const dr of drops) {
        const dx = dr.x - px, dz = dr.z - pz;
        if (dx * dx + dz * dz > R * R * 1.1) continue;
        const x = sx(dr.x), y = sy(dr.z);
        ctx.fillStyle = 'rgba(255, 210, 120, 0.28)';
        ctx.beginPath(); ctx.arc(x, y, 4.6 * u, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffd884';
        ctx.beginPath(); ctx.arc(x, y, 2.1 * u, 0, Math.PI * 2); ctx.fill();
      }
    }

    // the target: a gold ring and star when on the map
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
    let edgeTarget = null;
    if (target) {
      const dx = target.x - px, dz = target.z - pz, d = Math.hypot(dx, dz);
      if (d <= R - 10 * u / k) {
        const x = sx(target.x), y = sy(target.z), pulse = 1 + 0.18 * Math.sin(now * 4);
        ctx.strokeStyle = 'rgba(27, 20, 11, 0.7)'; ctx.lineWidth = 4 * u;
        ctx.beginPath(); ctx.arc(x, y, 9 * u * pulse, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = C.gold; ctx.lineWidth = 2 * u; ctx.stroke();
        this._star(ctx, x, y, 4.2 * u, C.goldLight);
      } else {
        edgeTarget = Math.atan2(dz, dx);
      }
    }

    // the cart: a soft view wedge and an arrow, turned by yaw (screen angle = -yaw)
    const yaw = player.yaw || 0;
    ctx.save();
    ctx.translate(c, c); ctx.rotate(-yaw);
    const wedge = ctx.createRadialGradient(0, 0, 0, 0, 0, 46 * u);
    wedge.addColorStop(0, 'rgba(255, 244, 214, 0.32)'); wedge.addColorStop(1, 'rgba(255, 244, 214, 0)');
    ctx.fillStyle = wedge;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 46 * u, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -9 * u); ctx.lineTo(6.2 * u, 7 * u); ctx.lineTo(0, 3.6 * u); ctx.lineTo(-6.2 * u, 7 * u); ctx.closePath();
    ctx.lineWidth = 2.6 * u; ctx.strokeStyle = 'rgba(27, 20, 11, 0.85)'; ctx.stroke();
    ctx.fillStyle = C.ink; ctx.fill();
    ctx.lineWidth = 1 * u; ctx.strokeStyle = C.gold; ctx.stroke();
    ctx.restore();

    // a soft inner shadow: the map sits a little below the ring
    if (!this._vignette) {
      const v = ctx.createRadialGradient(c, c, Rp * 0.72, c, c, Rp);
      v.addColorStop(0, 'rgba(20, 14, 8, 0)'); v.addColorStop(1, 'rgba(20, 14, 8, 0.38)');
      this._vignette = v;
    }
    ctx.fillStyle = this._vignette; ctx.fillRect(0, 0, N, N);
    ctx.restore();

    // the target off the map: a glowing gold pointer on the dark band of the ring, and a star just inside the rim
    if (edgeTarget !== null) {
      const ca = Math.cos(edgeTarget), sa = Math.sin(edgeTarget), rb = N * RING_BAND;
      const glow = ctx.createRadialGradient(c + ca * rb, c + sa * rb, 0, c + ca * rb, c + sa * rb, 12 * u);
      glow.addColorStop(0, 'rgba(255, 216, 132, 0.55)'); glow.addColorStop(1, 'rgba(255, 216, 132, 0)');
      ctx.fillStyle = glow; ctx.fillRect(c + ca * rb - 12 * u, c + sa * rb - 12 * u, 24 * u, 24 * u);
      ctx.save();
      ctx.translate(c + ca * rb, c + sa * rb);
      ctx.rotate(edgeTarget);
      ctx.beginPath(); ctx.moveTo(5.2 * u, 0); ctx.lineTo(-3.6 * u, 5.4 * u); ctx.lineTo(-3.6 * u, -5.4 * u); ctx.closePath();
      ctx.lineWidth = 1.6 * u; ctx.strokeStyle = 'rgba(27, 20, 11, 0.9)'; ctx.stroke();
      ctx.fillStyle = '#ffd884'; ctx.fill();
      ctx.restore();
      this._star(ctx, c + ca * (Rp - 8 * u), c + sa * (Rp - 8 * u), 4 * u, C.goldLight);
    }
  }

  _star(ctx, x, y, r, fill) {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 - Math.PI / 2, rr = i % 2 ? r * 0.42 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
  }

  /** the gilded frame: a double gold ring over a dark band, small ticks, the north letter at the top */
  _ringSvg() {
    const id = `mmg${Math.random().toString(36).slice(2, 8)}`;
    const ticks = [90, 180, 270].map((a) => {
      const r0 = 46.2, r1 = 48.4, t = (a - 90) * Math.PI / 180;
      return `<line x1="${50 + Math.cos(t) * r0}" y1="${50 + Math.sin(t) * r0}" x2="${50 + Math.cos(t) * r1}" y2="${50 + Math.sin(t) * r1}"/>`;
    }).join('');
    return `<svg class="mm-ring" viewBox="0 0 100 100" aria-hidden="true">
  <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#f6e2a8"/><stop offset="0.45" stop-color="#c79b4d"/>
    <stop offset="0.7" stop-color="#8f6a2e"/><stop offset="1" stop-color="#e8c983"/></linearGradient></defs>
  <circle cx="50" cy="50" r="47.3" fill="none" stroke="rgba(22,17,12,0.82)" stroke-width="4.4"/>
  <circle cx="50" cy="50" r="49.3" fill="none" stroke="url(#${id})" stroke-width="1.1"/>
  <circle cx="50" cy="50" r="45.6" fill="none" stroke="url(#${id})" stroke-width="0.6"/>
  <g stroke="#d9b56a" stroke-width="0.6" stroke-linecap="round" opacity="0.8">${ticks}</g>
</svg>`;
  }

  /** the north medallion, over the map */
  _northSvg() {
    return `<svg class="mm-ring mm-north" viewBox="0 0 100 100" aria-hidden="true">
  <circle cx="50" cy="3.6" r="4.6" fill="#1b140b" stroke="#d9b56a" stroke-width="0.8"/>
  <text x="50" y="5.35" text-anchor="middle" font-size="5.6" font-weight="700" fill="#f3dca3"
    font-family="'Cormorant Garamond','EB Garamond',Georgia,serif">${this.northLabel}</text>
</svg>`;
  }
}
