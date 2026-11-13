// How steady is the paint as the eye moves? (After the steadiness tools of "Oil paint" by blendi on Patch, MIT.)
// The world is frozen (no time passes), the eye is moved forward a little at a time, and each picture is compared
// with the one before: the mean change per pixel (0-255) over the lower part of the screen (the ground) and over
// the whole. The real motion of 2 cm moves far ground by well under a pixel, so most of what changes is the paint
// crawling or flickering. Lower is steadier.
//   node tools/steady.mjs [--q=low,medium,high] [--step=0.02] [--n=8] [--at=x,y,z,lookX,lookY,lookZ] [--extra=hatch=0]
// --at puts the eye elsewhere than beside the cart (a hill, the gorge); --extra adds to the page's query.
// The game must be served (npm run game, port 8096).
import { chromium } from '@playwright/test';

const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const qs = arg('q', 'low,medium,high').split(',');
const step = +arg('step', 0.02), n = +arg('n', 8);
const at = arg('at', '') ? arg('at', '').split(',').map(Number) : null, extra = arg('extra', '');
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
for (const q of qs) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`http://127.0.0.1:8096/?play&q=${q}${extra ? '&' + extra : ''}`);
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 180_000 });
  const res = await page.evaluate(async ({ step, n, at }) => {
    const g = window.__game;
    g.autoplay = true;
    for (let i = 0; i < 30; i++) g.frame(1 / 60);
    g.state = 'view';
    const c = g.cart, cam = g.camera;
    cam.position.set(c.x + 6, c.y + 3, c.z + 10);
    cam.lookAt(c.x - 30, c.y, c.z - 40);
    if (at) { cam.position.set(at[0], at[1], at[2]); cam.lookAt(at[3], at[4], at[5]); }
    const fwd = cam.getWorldDirection(cam.position.clone()).setY(0).normalize();
    const cv = document.createElement('canvas');
    const grab = () => {
      g.frame(0);
      const src = g.renderer.domElement;
      cv.width = src.width; cv.height = src.height;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(src, 0, 0);
      return ctx.getImageData(0, 0, cv.width, cv.height).data;
    };
    let prev = grab();
    const H = cv.height, W = cv.width, y0 = Math.floor(H * 0.55);
    let groundSum = 0, allSum = 0;
    const same = grab();
    let noise = 0;
    for (let i = 0; i < prev.length; i += 4) noise += Math.abs(prev[i] - same[i]);
    for (let k = 0; k < n; k++) {
      cam.position.addScaledVector(fwd, step);
      const cur = grab();
      let gs = 0, as = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const d = (Math.abs(cur[i] - prev[i]) + Math.abs(cur[i + 1] - prev[i + 1]) + Math.abs(cur[i + 2] - prev[i + 2])) / 3;
        as += d; if (y >= y0) gs += d;
      }
      groundSum += gs / (W * (H - y0)); allSum += as / (W * H);
      prev = cur;
    }
    return { ground: groundSum / n, all: allSum / n, still: noise / (W * H) };
  }, { step, n, at });
  console.log(`q=${q.padEnd(6)}  talaj: ${res.ground.toFixed(2)}   egész kép: ${res.all.toFixed(2)}   (álló kép önmagával: ${res.still.toFixed(2)})`);
  await page.close();
}
await browser.close();
