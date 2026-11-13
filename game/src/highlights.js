// Highlights — the "nearby" list in the corner of the HUD: the nearest (or selected) landmarks with a line-drawn gold
// icon, the name, a small-caps subtitle, the distance and an arrow pointing to it relative to the cart's heading.
// Plain DOM, no three.js. Styles: css/hud2.css (.hl, .hl-item …).
//
//   const hl = new Highlights(hudElement, landmarks);   // landmarks: [{ id, name, sub, x, z, icon }]
//   hl.update({ x, z, yaw });                            // ~10× a second
//   window.addEventListener('keydown', (e) => { if (e.code === 'Tab') { e.preventDefault(); hl.next(); } });
//
// World: metres, x = east, z = south. The player faces (-sin yaw, -cos yaw); yaw 0 = north.

/** Line icons on a 24×24 grid, as SVG path data (also used by the minimap through Path2D). Stroke them, never fill. */
export const ICON_PATHS = {
  // Kilenclyukú híd: a deck over a row of arches
  bridge: 'M2 8.5h20M2 11.5h20M3 11.5V19M21 11.5V19M3 19a3 3 0 0 1 6 0a3 3 0 0 1 6 0a3 3 0 0 1 6 0',
  // csárda: a thatched house with a chimney and a door
  inn: 'M2.5 11.5L12 4l9.5 7.5M5 10v10h14V10M10 20v-5h4v5M16 7V3.5h2.2V9',
  // gémeskút: a post, the long sweep, the rope with its bucket over the curb
  well: 'M5 21V9M2 13.2L22 4.2M20 5.1V12M18.6 12h2.8l-.5 2.6h-1.8zM15 21v-3.5h7V21M2 21h20',
  // a lone cedar: flat, layered crown on a trunk
  tree: 'M12 21V6M9 21h6M3.5 14c3-2.2 14-2.2 17 0M5.5 10.5c2.6-1.8 10.4-1.8 13 0M8 7c1.6-1.2 6.4-1.2 8 0M10.5 4h3',
  // a town: houses, a dome and a minaret
  town: 'M2 21h20M3 21v-7l3.5-2.5L10 14v7M10 21v-5.5a3.5 3.5 0 0 1 7 0V21M19.5 21V8M18.3 8l1.2-4 1.2 4M13.5 12v-1',
  // a ruin: broken columns and half an arch
  ruin: 'M2 21h20M5 21V9.5M9.5 21V7M5 9.5c0-2.2 2-3.6 4.5-2.5M14.5 21v-6.5l1.6 1 1.4-1.6M19 21v-3.8M3.8 9.5h2.4M8.3 7h2.4',
  // a fair: a striped booth with a pennant
  fair: 'M3 20v-8.5L12 6l9 5.5V20M3 11.5h18M7.5 11.5v3M12 11.5v3M16.5 11.5v3M9 20v-4h6v4M12 6V2.5l3.2 1.2L12 4.9',
  // a farm (tanya): a low house and a haystack
  farm: 'M1.5 20.5h21M3 20.5V13l5-4 5 4v7.5M6.5 20.5v-3.5h3v3.5M14.5 20.5c0-5.5 1.6-8.5 3.5-8.5s3.5 3 3.5 8.5M16 15.5h4',
  // a herd: the head of a Hungarian grey bull with its wide horns
  herd: 'M2.5 5.5C4 9 7 10 9.5 10M21.5 5.5C20 9 17 10 14.5 10M8.5 9.5c0 6 1.6 11 3.5 11s3.5-5 3.5-11M8.5 10h7M10.5 17.5h3M10 13h.01M14 13h.01',
};

const SVG_NS = 'http://www.w3.org/2000/svg';

/** an <svg> element with the line icon of the given type (unknown types fall back to a small star) */
export function iconSvg(type, className = 'hl-icon') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', className);
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', ICON_PATHS[type] || 'M12 3l2.4 6.3H21l-5.3 4 2 6.7L12 16l-5.7 4 2-6.7L3 9.3h6.6z');
  svg.appendChild(p);
  return svg;
}

/** Hungarian distance: "85 m", "1,2 km" */
export function formatDistance(m) {
  if (!Number.isFinite(m)) return '';
  if (m < 995) return `${Math.max(5, Math.round(m / 5) * 5)} m`;
  return `${(m / 1000).toFixed(m < 9950 ? 1 : 0).replace('.', ',')} km`;
}

/** bearing of (dx, dz) from north, clockwise, radians */
export const bearing = (dx, dz) => Math.atan2(dx, -dz);

const SHOW = 4;

export class Highlights {
  /**
   * @param {HTMLElement} container  where the list goes (e.g. #hud); the list positions itself (top right)
   * @param {Array<{id:string,name:string,sub?:string,x:number,z:number,icon?:string}>} landmarks
   * @param {{selectedId?: string|null, count?: number, onSelect?: (lm:object|null)=>void}} [opts]
   */
  constructor(container, landmarks, opts = {}) {
    this.landmarks = (landmarks || []).slice();
    this.count = opts.count || SHOW;
    this.onSelect = opts.onSelect || null;
    this._sel = opts.selectedId === undefined ? (this.landmarks[0] || null)
      : this.landmarks.find((l) => l.id === opts.selectedId) || null;
    this._order = this.landmarks.slice();      // all landmarks, nearest first (as of the last update)
    this._dist = new Map();
    this._player = null;

    this.el = document.createElement('div');
    this.el.className = 'hl';
    this.el.setAttribute('role', 'list');
    this.el.setAttribute('aria-label', 'Látnivalók a közelben');
    const head = document.createElement('div');
    head.className = 'hl-head';
    head.innerHTML = '<span>A közelben</span><kbd>Tab</kbd>';
    this.el.appendChild(head);

    // a fixed pool of rows, refilled in place (no DOM churn at 10 Hz)
    this.rows = [];
    for (let i = 0; i < this.count; i++) {
      const row = document.createElement('div');
      row.className = 'hl-item';
      row.setAttribute('role', 'listitem');
      row.innerHTML = '<span class="hl-badge"></span><span class="hl-text"><span class="hl-name"></span>'
        + '<span class="hl-sub"></span></span><span class="hl-where"><span class="hl-arrow" aria-hidden="true">'
        + '<svg viewBox="0 0 16 16"><path d="M8 1.5l4.6 11L8 10l-4.6 2.5z"/></svg></span><span class="hl-dist"></span></span>';
      this.el.appendChild(row);
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        const lm = this.rows.find((r) => r.el === row)?.lm;
        if (lm) this.select(lm.id);
      });
      this.rows.push({
        el: row, lm: undefined, icon: null,
        badge: row.querySelector('.hl-badge'), name: row.querySelector('.hl-name'), sub: row.querySelector('.hl-sub'),
        arrow: row.querySelector('.hl-arrow'), dist: row.querySelector('.hl-dist'), d: '', a: NaN,
      });
    }
    container.appendChild(this.el);
  }

  /** the selected landmark (or null) */
  get selected() { return this._sel; }

  /** select a landmark by id (null: none) */
  select(id) {
    this._sel = id == null ? null : this.landmarks.find((l) => l.id === id) || null;
    if (this._player) this.update(this._player);
    this.onSelect?.(this._sel);
    return this._sel;
  }

  /** select the next landmark, nearest first (wraps around); returns it */
  next() {
    const list = this._order;
    if (!list.length) return null;
    const i = this._sel ? list.indexOf(this._sel) : -1;
    this._sel = list[(i + 1) % list.length];
    if (this._player) this.update(this._player);
    this.onSelect?.(this._sel);
    return this._sel;
  }

  /** distance (m) from the player to a landmark, as of the last update */
  distanceTo(lm) { return this._dist.get(lm); }

  setVisible(v) { this.el.hidden = !v; }

  setLandmarks(landmarks) {
    this.landmarks = (landmarks || []).slice();
    if (this._sel && !this.landmarks.includes(this._sel)) this._sel = this.landmarks.find((l) => l.id === this._sel.id) || null;
    this._order = this.landmarks.slice();
    for (const r of this.rows) r.lm = undefined;
    if (this._player) this.update(this._player);
  }

  /** @param {{x:number, z:number, yaw:number}} player */
  update(player) {
    this._player = { x: player.x, z: player.z, yaw: player.yaw || 0 };
    const { x, z, yaw } = this._player;
    for (const lm of this.landmarks) this._dist.set(lm, Math.hypot(lm.x - x, lm.z - z));
    this._order = this.landmarks.slice().sort((a, b) => this._dist.get(a) - this._dist.get(b));

    const shown = this._order.slice(0, this.count);
    if (this._sel && !shown.includes(this._sel)) {
      shown[shown.length - 1] = this._sel;               // the selected one always stays on the list
    }

    for (let i = 0; i < this.rows.length; i++) {
      const row = this.rows[i];
      const lm = shown[i];
      if (!lm) { row.el.hidden = true; row.lm = undefined; continue; }
      row.el.hidden = false;
      if (row.lm !== lm) {
        row.lm = lm;
        row.badge.replaceChildren(iconSvg(lm.icon));
        row.name.textContent = lm.name;
        row.sub.textContent = lm.sub || '';
        row.el.dataset.id = lm.id;
        row.d = '';
      }
      const sel = lm === this._sel;
      row.el.classList.toggle('sel', sel);
      if (sel) row.el.setAttribute('aria-current', 'true'); else row.el.removeAttribute('aria-current');
      const d = this._dist.get(lm);
      const txt = formatDistance(d);
      if (txt !== row.d) { row.dist.textContent = txt; row.d = txt; }
      // the arrow: the landmark's bearing relative to the heading (heading from north, clockwise, is -yaw)
      const rel = d < 3 ? 0 : bearing(lm.x - x, lm.z - z) + yaw;
      const deg = Math.round((((rel * 180) / Math.PI) % 360 + 360) % 360);
      if (deg !== row.a) { row.arrow.style.transform = `rotate(${deg}deg)`; row.a = deg; }
      row.el.classList.toggle('here', d < 25);
    }
  }

  dispose() { this.el.remove(); }
}
