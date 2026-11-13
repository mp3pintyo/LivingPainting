// Screenshots of the game in Playwright's own Chromium (isolated, does not touch the user's browser).
//   node tools/shot.mjs <steps.json> [outDir]
// steps.json: { "url": "/?view", "size": [1400, 790], "steps": [ { "js": "…body using g…", "frames": 30, "shot": "a.png" } ] }
// The game must be served (npm run game, port 8096). Prints page errors, shader errors and the js results.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const [file, outDir = 'test-results/shots'] = process.argv.slice(2);
const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const [w, h] = cfg.size || [1400, 790];
const page = await browser.newPage({ viewport: { width: w, height: h } });
page.on('pageerror', (e) => console.log('OLDALHIBA:', e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}]`, m.text().slice(0, 3000)); });
await page.goto('http://127.0.0.1:8096' + (cfg.url || '/?view'));
await page.waitForFunction(() => window.__game?.ready || document.getElementById('fatal')?.hidden === false, null, { timeout: 180_000 });
await page.evaluate(() => { const g = window.__game; g.autoplay = true; });
for (const step of cfg.steps) {
  if (step.js) console.log('js:', await page.evaluate(`(async () => { const g = window.__game; ${step.js} })()`));
  const t0 = Date.now();
  await page.evaluate(async (n) => {
    const g = window.__game;
    for (let i = 0; i < n; i++) { g.frame(1 / 60); if (i % 4 === 3) await new Promise((r) => setTimeout(r, 0)); }
  }, step.frames ?? 10);
  const ms = Date.now() - t0;
  if (step.shot) {
    await page.screenshot({ path: path.join(outDir, step.shot) });
    console.log('shot', step.shot, `${step.frames ?? 10} frames in ${ms} ms`);
  }
}
await browser.close();
