// The showcase page drives the game's engine (an iframe in ?embed mode, same origin): each chapter flies the eye to
// its place and sets which of the painter's techniques are on; the switches turn them off and on; the brush sheet
// and the map are drawn from the running engine itself.
const frame = document.getElementById('engine');
const loader = document.getElementById('loader');
const chapters = [...document.querySelectorAll('section.chapter')];
const DEFAULT = { oil: 1, paint3: 1, brush: 1, dabs: 1, lamps: 1, weave: 1, shadow: 0.32, clear: 0, hatch: 1, matte: 1, townshadow: 1, cedarsky: 1 };

let g = null, active = null, pendingPose = null;

function engine() {
  try { const w = frame.contentWindow; return w && w.__game && w.__game.ready ? w.__game : null; } catch { return null; }
}

function waitForEngine() {
  const tick = () => {
    g = engine();
    if (!g) return setTimeout(tick, 250);
    loader.classList.add('done');
    if (pendingPose) { apply(pendingPose); pendingPose = null; } else if (active) apply(active);
    drawBrushSheet();
    drawMap();
  };
  tick();
}

// ---- chapters: fly there, set the look
function apply(sec) {
  if (!g) { pendingPose = sec; return; }
  const pose = JSON.parse(sec.dataset.pose || 'null');
  const look = { ...DEFAULT, ...JSON.parse(sec.dataset.look || '{}') };
  if (sec.classList.contains('hero')) look.scan = 1 - (+document.getElementById('scan').value) / 100;
  g.setLook(look);
  if (pose) g.show(pose);
  // the chapter's switches show what is on
  for (const b of sec.querySelectorAll('.switch')) b.setAttribute('aria-pressed', String(isOn(b.dataset.toggle, look)));
}
function isOn(key, look) {
  if (key === 'shadowfull') return look.shadow > 0.9;
  return !!look[key];
}

// the chapter the middle of the screen is in (robust however far a scroll jumps)
let ticking = false;
function pick() {
  ticking = false;
  const mid = window.innerHeight / 2;
  const sec = chapters.find((c) => { const r = c.getBoundingClientRect(); return r.top <= mid && r.bottom > mid; }) || chapters[0];
  if (sec !== active) { active = sec; apply(sec); }
}
window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(pick); } }, { passive: true });
window.addEventListener('resize', pick);
pick();

// ---- switches
document.addEventListener('click', (e) => {
  const b = e.target.closest('.switch');
  if (!b || !g) return;
  const on = b.getAttribute('aria-pressed') !== 'true';
  b.setAttribute('aria-pressed', String(on));
  const k = b.dataset.toggle;
  if (k === 'shadowfull') g.setLook({ shadow: on ? 1 : 0.32 });
  else if (k === 'clear') g.setLook({ clear: on ? 1 : 0 });
  else g.setLook({ [k]: on ? 1 : 0 });
});

// ---- the painting ⟷ world slider
document.getElementById('scan').addEventListener('input', (e) => { if (g) g.setLook({ scan: 1 - e.target.value / 100 }); });

// ---- the brush sheet, read from the engine's own texture
function drawBrushSheet() {
  const cv = document.getElementById('brushsheet');
  const tex = g.shared?.tBrush?.value;
  if (!cv || !tex) return;
  const { data, width: W, height: H } = tex.image;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = ((H - 1 - y) * W + x) * 4, o = (y * W + x) * 4;      // (the texture's rows run bottom-up)
    const h = data[i] / 255, a = data[i + 1] / 255, s = data[i + 2] / 255;
    const st = Math.max(0, Math.min(1, (s - 0.55) / 0.25));
    // the paint: cream, warmer where it stands thick; the streak of a second colour bluish; the ground dark
    const r = 236 * (0.62 + 0.45 * h) * (1 - 0.35 * st), gg = 222 * (0.62 + 0.4 * h) * (1 - 0.15 * st), b = 190 * (0.6 + 0.3 * h) + 70 * st;
    img.data[o] = 43 + (Math.min(255, r) - 43) * a; img.data[o + 1] = 33 + (Math.min(255, gg) - 33) * a; img.data[o + 2] = 23 + (Math.min(255, b) - 23) * a; img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

// ---- the map of the world, with the way from the cart's start to the well sweep, planned by the engine
function drawMap() {
  const cv = document.getElementById('bigmap');
  const md = g.world?.mapData;
  if (!cv || !md) return;
  const ctx = cv.getContext('2d'), N = cv.width;
  const { cx, cz, r } = md.bounds;
  const k = N / (2 * r);
  const X = (x) => (x - cx) * k + N / 2, Y = (z) => (z - cz) * k + N / 2;
  ctx.save();
  ctx.beginPath(); ctx.arc(N / 2, N / 2, N / 2, 0, Math.PI * 2); ctx.clip();
  // the plain: pale green, broken in soft level strokes
  ctx.fillStyle = '#a9b77a'; ctx.fillRect(0, 0, N, N);
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 900; i++) {
    const x = rnd() * N, y = rnd() * N, w = 20 + rnd() * 70;
    ctx.strokeStyle = rnd() < 0.5 ? 'rgba(122,150,72,0.22)' : 'rgba(214,214,150,0.22)';
    ctx.lineWidth = 2 + rnd() * 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y + (rnd() - 0.5) * 6); ctx.stroke();
  }
  for (const h of md.hills) {
    const gr = ctx.createRadialGradient(X(h.x), Y(h.z), 0, X(h.x), Y(h.z), h.r * k);
    gr.addColorStop(0, 'rgba(70,96,46,0.45)'); gr.addColorStop(1, 'rgba(70,96,46,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(X(h.x), Y(h.z), h.r * k, 0, Math.PI * 2); ctx.fill();
  }
  // water
  ctx.fillStyle = '#1f6f78'; ctx.strokeStyle = '#1f6f78'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const l of md.lakes) { ctx.beginPath(); ctx.ellipse(X(l.x), Y(l.z), l.rx * k, l.rz * k, 0, 0, Math.PI * 2); ctx.fill(); }
  const riv = md.river;
  for (let i = 0; i < riv.length - 1; i++) {
    ctx.lineWidth = (riv[i][2] + riv[i + 1][2]) * k;
    ctx.beginPath(); ctx.moveTo(X(riv[i][0]), Y(riv[i][1])); ctx.lineTo(X(riv[i + 1][0]), Y(riv[i + 1][1])); ctx.stroke();
  }
  // roads, bridges
  ctx.strokeStyle = '#cbb27a'; ctx.lineWidth = 3.2;
  for (const road of md.roads) { ctx.beginPath(); road.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1])))); ctx.stroke(); }
  for (const b of md.bridges) {
    ctx.strokeStyle = '#5a3b33'; ctx.lineWidth = b.width * k + 3; ctx.beginPath(); ctx.moveTo(X(b.x1), Y(b.z1)); ctx.lineTo(X(b.x2), Y(b.z2)); ctx.stroke();
    ctx.strokeStyle = '#c08a72'; ctx.lineWidth = b.width * k; ctx.stroke();
  }
  // the way to the well sweep, by the roads, as the engine plans it
  const well = md.landmarks.find((l) => l.id === 'kut');
  if (g.roads && well) {
    const path = g.roads.route(8, 10, well.x, well.z);
    ctx.beginPath(); path.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.z)) : ctx.moveTo(X(p.x), Y(p.z))));
    ctx.strokeStyle = 'rgba(27,20,11,0.6)'; ctx.lineWidth = 9; ctx.stroke();
    ctx.setLineDash([0.1, 11]); ctx.strokeStyle = '#ffd884'; ctx.lineWidth = 6; ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#ffd884'; ctx.beginPath(); ctx.arc(X(8), Y(10), 7, 0, Math.PI * 2); ctx.fill();
  }
  // the places
  ctx.font = 'italic 600 17px "Cormorant Garamond", Georgia, serif'; ctx.textAlign = 'center';
  for (const l of md.landmarks) {
    const x = X(l.x), y = Y(l.z);
    ctx.fillStyle = 'rgba(27,20,11,0.85)'; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#e2c47c'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(24,18,11,0.75)'; ctx.strokeText(l.name, x, y - 11);
    ctx.fillStyle = '#f6ecd4'; ctx.fillText(l.name, x, y - 11);
  }
  ctx.restore();
  // north
  ctx.font = '600 22px "Cormorant Garamond", Georgia, serif'; ctx.fillStyle = '#2b2117'; ctx.textAlign = 'center';
  ctx.fillText('É', N / 2, 26);
}

frame.addEventListener('load', waitForEngine);
if (frame.contentDocument?.readyState === 'complete') waitForEngine();
