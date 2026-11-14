// Touch controls for phones and tablets.
//   left half of the screen: a floating stick — where the thumb comes down, a ring appears under it; pushed up the
//     horses go (the further, the faster), down: whoa / back, sideways: steer (pushed sideways from a standstill the
//     cart sets off at a walk, so "push it where you want to go" works);
//   right half: drag to look round (the canvas's own handler), two fingers: nearer, farther;
//   the whip button above the minimap.
// Shown once the device has a coarse pointer, or at the first touch (body.touch).
// Output: stickX (−1 left … 1 right), stickY (−1 back … 1 on), null while no thumb is on the stick.

const R = 62;          // the ring's radius in CSS px: a full push
const DEAD = 0.14;     // a thumb resting on the stick does nothing

export class TouchControls {
  constructor(hud, { onWhip } = {}) {
    this.stickX = null; this.stickY = null;
    this.id = null;
    const zone = (this.zone = document.createElement('div'));
    zone.className = 'stick-zone';
    zone.innerHTML = '<div class="stick-base"><div class="stick-knob"></div></div>';
    hud.appendChild(zone);
    this.base = zone.firstElementChild;
    this.knob = this.base.firstElementChild;
    const whip = (this.whipBtn = document.createElement('button'));
    whip.type = 'button'; whip.className = 'btn-whip'; whip.title = 'Ostor';
    whip.setAttribute('aria-label', 'Ostor');
    whip.innerHTML = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M10 40 L22 20" stroke-width="4"/>' +
      '<path d="M22 20 C 28 8, 40 6, 42 14 C 44 22, 34 24, 30 18" stroke-width="2" fill="none"/></svg>';
    hud.appendChild(whip);
    whip.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      whip.classList.add('hit'); setTimeout(() => whip.classList.remove('hit'), 250);
      onWhip?.();
    });

    zone.addEventListener('pointerdown', (e) => this.down(e));
    zone.addEventListener('pointermove', (e) => { if (e.pointerId === this.id) this.move(e.clientX, e.clientY); });
    const up = (e) => { if (e.pointerId === this.id) this.release(); };
    zone.addEventListener('pointerup', up);
    zone.addEventListener('pointercancel', up);
    zone.addEventListener('lostpointercapture', up);
    for (const el of [zone, whip]) el.addEventListener('contextmenu', (e) => e.preventDefault());

    if (matchMedia('(pointer: coarse)').matches) this.enable();
    window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') this.enable(); }, { capture: true });
  }

  enable() {
    if (document.body.classList.contains('touch')) return;
    document.body.classList.add('touch');
    this.onEnable?.();
  }

  down(e) {
    if (this.id !== null) return;
    e.preventDefault();
    this.id = e.pointerId;
    try { this.zone.setPointerCapture(e.pointerId); } catch {}
    // the ring stays whole on the screen even if the thumb comes down at its very edge
    const m = R + 10;
    this.cx = Math.max(m, Math.min(window.innerWidth - m, e.clientX));
    this.cy = Math.max(m, Math.min(window.innerHeight - m, e.clientY));
    this.base.classList.add('on');
    this.base.style.left = `${this.cx}px`;
    this.base.style.top = `${this.cy}px`;
    this.move(e.clientX, e.clientY);
  }

  move(x, y) {
    let dx = x - this.cx, dy = y - this.cy;
    const d = Math.hypot(dx, dy);
    // past the rim the ring follows the thumb, so turning back the other way answers at once
    if (d > R) {
      const k = (d - R) / d;
      this.cx += dx * k; this.cy += dy * k;
      dx = x - this.cx; dy = y - this.cy;
      this.base.style.left = `${this.cx}px`;
      this.base.style.top = `${this.cy}px`;
    }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    let vx = dx / R, vy = -dy / R;
    const m = Math.hypot(vx, vy);
    if (m < DEAD) { vx = 0; vy = 0; }
    else { const s = (m - DEAD) / (1 - DEAD) / m; vx *= s; vy *= s; }
    this.stickX = vx; this.stickY = vy;
  }

  release() {
    if (this.id !== null) this.zone.classList.add('used');   // the "drag: drive" label has done its work
    this.id = null;
    this.stickX = null; this.stickY = null;
    this.base.classList.remove('on');
    this.base.style.left = ''; this.base.style.top = '';
    this.knob.style.transform = '';
  }
}
