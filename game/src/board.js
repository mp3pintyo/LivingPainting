// Board — the local leaderboard ("Napút"): a museum-label card with the run just made, a name field and the top 10.
// Stored in localStorage (every access guarded; without storage it keeps the list for this session only).
// Plain DOM, no three.js. Styles: css/hud2.css (.board …).
//
//   const board = new Board(document.body, { onAgain: () => game.restart(), onClose: () => game.resume() });
//   board.show({ delivered: 7, total: 12, timeSec: 272.4 });   // after a run
//   board.showOnly();                                           // just the table
//
// While the card is open, key presses do not reach the game (keydown is stopped in the capture phase on window;
// keyup passes so held keys are released). Escape closes it (onClose), Enter in the name field saves.

export const STORAGE_KEY = 'elofestmeny.board.v1';
const NAME_KEY = 'elofestmeny.board.name';
const KEEP = 50;      // entries kept in storage
const SHOW = 10;      // rows shown
const NAME_MAX = 16;

let memory = [];      // used when localStorage is unavailable
let memoryName = '';

function readStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return memory.slice();
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter(valid) : [];
  } catch { return memory.slice(); }
}
function writeStore(list) {
  memory = list.slice();
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); return true; } catch { return false; }
}
function readName() {
  try { return localStorage.getItem(NAME_KEY) ?? memoryName; } catch { return memoryName; }
}
function writeName(n) {
  memoryName = n;
  try { localStorage.setItem(NAME_KEY, n); } catch { /* no storage */ }
}
function valid(e) {
  return e && typeof e.name === 'string' && Number.isFinite(e.delivered) && Number.isFinite(e.timeSec);
}

/** delivered desc, then time asc, then the earlier run first */
export function compareEntries(a, b) {
  return (b.delivered - a.delivered) || (a.timeSec - b.timeSec) || ((a.at || 0) - (b.at || 0));
}

/** seconds → "mm:ss" (minutes keep counting past 59) */
export function formatTime(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** the stored entries, sorted (best first) */
export function loadEntries() { return readStore().sort(compareEntries); }

export class Board {
  /**
   * @param {HTMLElement} [container=document.body]
   * @param {{onAgain?: ()=>void, onClose?: ()=>void}} [opts]
   */
  constructor(container = document.body, opts = {}) {
    this.onAgain = opts.onAgain || null;
    this.onClose = opts.onClose || null;
    this.result = null;
    this.saved = null;          // the entry saved from the current result
    this._prevFocus = null;

    const el = document.createElement('div');
    el.className = 'board';
    el.hidden = true;
    el.innerHTML = `
<div class="board-card" role="dialog" aria-modal="true" aria-labelledby="board-title" tabindex="-1">
  <p class="board-kicker">Élő festmény</p>
  <h2 id="board-title" class="board-title">Napút</h2>
  <div class="board-rule" aria-hidden="true"></div>
  <section class="board-run">
    <div class="board-score">
      <div class="board-big"><span class="glyph" aria-hidden="true">✦</span><span class="board-delivered">0</span><span class="board-of">/ <span class="board-total">0</span></span></div>
      <div class="board-cap">fénycsepp a Kilenclyukú hídon</div>
    </div>
    <div class="board-time-box"><div class="board-time">00:00</div><div class="board-cap">idő</div></div>
  </section>
  <form class="board-form" autocomplete="off">
    <label class="board-label" for="board-name">Írd be a neved a napútkönyvbe</label>
    <div class="board-row">
      <input id="board-name" class="board-name" name="name" type="text" maxlength="${NAME_MAX}" placeholder="a neved"
        spellcheck="false" autocapitalize="words" enterkeyhint="done" />
      <button type="submit" class="board-btn board-save">Mentés</button>
    </div>
    <p class="board-note" aria-live="polite"></p>
  </form>
  <table class="board-table">
    <caption class="board-cap-table">A legjobb tíz</caption>
    <thead><tr><th scope="col">#</th><th scope="col">név</th><th scope="col">fénycsepp</th><th scope="col">idő</th></tr></thead>
    <tbody></tbody>
  </table>
  <p class="board-empty" hidden>Még senki sem írta be a nevét.</p>
  <div class="board-actions">
    <button type="button" class="board-btn board-again">Újra</button>
    <button type="button" class="board-btn board-close ghost">Bezárás</button>
  </div>
</div>`;
    container.appendChild(el);
    this.el = el;
    const q = (s) => el.querySelector(s);
    this.card = q('.board-card');
    this.runEl = q('.board-run');
    this.form = q('.board-form');
    this.input = q('.board-name');
    this.saveBtn = q('.board-save');
    this.note = q('.board-note');
    this.tbody = q('tbody');
    this.table = q('.board-table');
    this.empty = q('.board-empty');
    this.againBtn = q('.board-again');
    this.closeBtn = q('.board-close');

    // keys typed in the name field must never reach the game
    const stop = (e) => e.stopPropagation();
    this.input.addEventListener('keydown', stop);
    this.input.addEventListener('keypress', stop);
    this.input.addEventListener('keyup', stop);
    this.form.addEventListener('submit', (e) => { e.preventDefault(); this.save(); });
    this.againBtn.addEventListener('click', () => { this.hide(); this.onAgain?.(); });
    this.closeBtn.addEventListener('click', () => this.close());
    el.addEventListener('pointerdown', (e) => { if (e.target === el) this.close(); });   // click on the backdrop
    // pointer and wheel events stay inside the card (the game drags the camera on the canvas below)
    for (const t of ['pointerdown', 'wheel', 'contextmenu']) this.card.addEventListener(t, stop);

    this._onKey = (e) => {
      if (this.el.hidden) return;
      e.stopPropagation();                                    // the game does not see keys while the card is open
      if (e.key === 'Escape') { e.preventDefault(); this.close(); return; }
      if (e.key === 'Tab') this._trapTab(e);
    };
  }

  get isOpen() { return !this.el.hidden; }

  /** the sorted entries */
  entries() { return loadEntries(); }

  /**
   * Open with a new result.
   * @param {{delivered:number, total:number, timeSec:number}} result
   */
  show(result) {
    this.result = {
      delivered: Math.max(0, Math.round(Number(result?.delivered) || 0)),
      total: Math.max(0, Math.round(Number(result?.total) || 0)),
      timeSec: Math.max(0, Number(result?.timeSec) || 0),
    };
    this.saved = null;
    this.el.querySelector('.board-delivered').textContent = this.result.delivered;
    this.el.querySelector('.board-total').textContent = this.result.total;
    this.el.querySelector('.board-time').textContent = formatTime(this.result.timeSec);
    this.runEl.hidden = false;
    this.form.hidden = false;
    this.input.disabled = false;
    this.saveBtn.disabled = false;
    this.saveBtn.textContent = 'Mentés';
    this.note.textContent = '';
    this.input.value = readName().slice(0, NAME_MAX);
    this._open();
    this._render();
    // focus the name field (on touch screens the card itself: a keyboard popping up would cover it)
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    if (coarse) this.card.focus({ preventScroll: true });
    else { this.input.focus({ preventScroll: true }); this.input.select(); }
  }

  /** Open only the table (no new score). */
  showOnly() {
    this.result = null;
    this.saved = null;
    this.runEl.hidden = true;
    this.form.hidden = true;
    this._open();
    this._render();
    this.closeBtn.focus({ preventScroll: true });
  }

  /** Save the current result under the typed name; returns the entry (or null). */
  save() {
    if (!this.result || this.saved) return this.saved;
    const name = (this.input.value || '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX) || 'névtelen';
    const entry = { name, ...this.result, timeSec: Math.round(this.result.timeSec * 10) / 10, at: Date.now() };
    const list = readStore();
    list.push(entry);
    list.sort(compareEntries);
    const stored = writeStore(list.slice(0, KEEP));
    writeName(name);
    this.saved = entry;
    this.input.value = name;
    this.input.disabled = true;
    this.saveBtn.disabled = true;
    this.saveBtn.textContent = 'Elmentve';
    const rank = list.indexOf(entry) + 1;
    this.note.textContent = (rank <= SHOW ? `Bekerültél a legjobbak közé: ${rank}. hely.` : `${rank}. hely.`)
      + (stored ? '' : ' (A böngésző nem enged menteni, a lista csak most él.)');
    this._render();
    this.againBtn.focus({ preventScroll: true });
    return entry;
  }

  /** Close and call onClose. */
  close() {
    if (this.el.hidden) return;
    this.hide();
    this.onClose?.();
  }

  /** Close without calling onClose. */
  hide() {
    if (this.el.hidden) return;
    this.el.hidden = true;
    window.removeEventListener('keydown', this._onKey, true);
    const f = this._prevFocus;
    this._prevFocus = null;
    if (f && typeof f.focus === 'function' && document.contains(f)) f.focus({ preventScroll: true });
    else if (document.activeElement && this.el.contains(document.activeElement)) document.activeElement.blur();
  }

  dispose() { this.hide(); this.el.remove(); }

  _open() {
    if (this.el.hidden) {
      this._prevFocus = document.activeElement;
      window.addEventListener('keydown', this._onKey, true);
    }
    this.el.hidden = false;
  }

  _render() {
    const list = loadEntries();
    const top = list.slice(0, SHOW);
    const rows = top.map((e, i) => ({ e, rank: i + 1 }));
    if (this.saved) {
      const i = list.findIndex((e) => e.at === this.saved.at && e.name === this.saved.name);
      if (i >= SHOW) rows.push({ gap: true }, { e: list[i], rank: i + 1 });
    }
    const frag = document.createDocumentFragment();
    for (const r of rows) {
      const tr = document.createElement('tr');
      if (r.gap) {
        tr.className = 'gap';
        tr.innerHTML = '<td colspan="4">…</td>';
      } else {
        const me = this.saved && r.e.at === this.saved.at && r.e.name === this.saved.name;
        if (me) tr.className = 'me';
        const cells = [`${r.rank}.`, r.e.name, `${r.e.delivered} / ${r.e.total}`, formatTime(r.e.timeSec)];
        cells.forEach((t, k) => {
          const td = document.createElement('td');
          td.textContent = t;
          td.className = ['rank', 'who', 'got', 'time'][k];
          tr.appendChild(td);
        });
      }
      frag.appendChild(tr);
    }
    this.tbody.replaceChildren(frag);
    this.table.hidden = rows.length === 0;
    this.empty.hidden = rows.length !== 0;
  }

  _trapTab(e) {
    const items = [...this.card.querySelectorAll('input, button, [tabindex]')]
      .filter((n) => !n.disabled && n.offsetParent !== null && n.tabIndex >= 0);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    const inside = this.card.contains(document.activeElement);
    if (e.shiftKey && (document.activeElement === first || !inside)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (document.activeElement === last || !inside)) { e.preventDefault(); first.focus(); }
  }
}
