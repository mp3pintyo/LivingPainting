// Screenshots of the showcase page (npm run site, port 8097), chapter by chapter, in Playwright's own Chromium.
//   node tools/site-shot.mjs [outDir] [--phone]
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const outDir = process.argv.slice(2).find((a) => !a.startsWith('--')) || 'test-results/site';
const phone = process.argv.includes('--phone');
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage(phone ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 } : { viewport: { width: 1400, height: 790 } });
page.on('pageerror', (e) => console.log('OLDALHIBA:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[error]', m.text().slice(0, 300)); });
await page.goto('http://127.0.0.1:8097/');
await page.waitForSelector('#loader.done', { timeout: 240_000 });
const n = await page.evaluate(() => document.querySelectorAll('section.chapter').length);
for (let i = 0; i < n; i++) {
  await page.evaluate((i) => {
    const s = document.querySelectorAll('section.chapter')[i];
    const lab = s.querySelector('.label') || s;
    const r = lab.getBoundingClientRect();
    window.scrollTo(0, window.scrollY + r.top - 60);
  }, i);
  await page.waitForTimeout(3600);
  console.log('state', await page.evaluate(() => { const g = document.getElementById('engine').contentWindow.__game; return [g.state, g.camera.position.toArray().map((v) => v.toFixed(1)).join(','), g.camera.fov.toFixed(1), g.post.u.uScan.value]; }));
  const f = path.join(outDir, `${phone ? 'telefon' : 'fejezet'}-${String(i).padStart(2, '0')}.png`);
  await page.screenshot({ path: f });
  console.log('shot', f);
  if (phone && i >= 3) break;
}
await browser.close();
