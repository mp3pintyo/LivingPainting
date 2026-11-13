// Screenshots of the HUD demo page (game/hud-test.html): minimap, nearby list, leaderboard — desktop and phone.
//   node tools/hud-shot.mjs [outDir=test-results/hud]
// Uses Playwright's own Chromium (isolated, does not touch the user's browser). Starts tools/serve.mjs on :8096 if
// nothing answers there, and stops it again at the end. Exits 1 on page errors, console errors or failed checks.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(ROOT, process.argv[2] || 'test-results/hud');
const BASE = 'http://127.0.0.1:8096';
fs.mkdirSync(OUT, { recursive: true });

async function up() {
  try { const r = await fetch(`${BASE}/hud-test.html`, { signal: AbortSignal.timeout(1500) }); return r.ok; } catch { return false; }
}
let server = null;
if (!(await up())) {
  server = spawn(process.execPath, [path.join(ROOT, 'tools/serve.mjs'), '--port=8096'], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 50 && !(await up()); i++) await new Promise((r) => setTimeout(r, 100));
  if (!(await up())) { console.error('a szerver nem indult el'); server.kill(); process.exit(1); }
  console.log('szerver elindítva (pid', server.pid + ')');
}

const problems = [];
const check = (ok, what) => { console.log(ok ? '  ok  ' : '  HIBA', what); if (!ok) problems.push(what); };
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist'] });

async function open(viewport, opts, query, initScript = null) {
  const ctx = await browser.newContext({ viewport, ...opts });
  if (initScript) await ctx.addInitScript(initScript);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`oldalhiba: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`[${m.type()}] ${m.text()}`); });
  await page.goto(`${BASE}/hud-test.html${query}`);
  await page.waitForFunction(() => window.__hud?.ready);
  return { ctx, page };
}
const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, name) }); console.log('kép:', path.join(OUT, name)); };

try {
  // ---------------------------------------------------------------- desktop
  {
    console.log('asztali, 1400×790');
    const { ctx, page } = await open({ width: 1400, height: 790 }, {}, '?t=4&still');
    await page.waitForTimeout(150);
    await shot(page, 'desktop-a.png');

    // later on the path, a different selection (Tab goes through the game's handler), map scrolled
    await page.evaluate(() => window.__hud.setTime(38));
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const sel = await page.evaluate(() => window.__hud.hl.selected?.id);
    check(!!sel && sel !== 'hid', `Tab választ (most: ${sel})`);
    const selRow = await page.evaluate(() => document.querySelectorAll('.hl-item.sel').length);
    check(selRow === 1, 'pontosan egy kiemelt sor');
    await page.waitForTimeout(120);
    await shot(page, 'desktop-b.png');

    // far from the target: the rim pointer; and the map zoomed out
    await page.evaluate(() => { const h = window.__hud; h.hl.select('mostar'); h.mm.zoom = 0.7; h.setTime(70); });
    await page.waitForTimeout(120);
    await shot(page, 'desktop-c.png');

    // the board: typing must not reach the game, Enter saves, Escape closes
    await page.evaluate(() => { window.__hud.mm.zoom = 1; window.__hud.openBoard(); window.__hud.log.gameKeys.length = 0; });
    await page.waitForTimeout(450);
    await shot(page, 'board-desktop-new.png');
    const focused = await page.evaluate(() => document.activeElement?.id);
    check(focused === 'board-name', `a névmező kapja a fókuszt (${focused})`);
    await page.keyboard.press('Control+A');
    await page.keyboard.type('Kovács Pista WASD és egy nagyon hosszú név');
    const val = await page.inputValue('#board-name');
    check(val.length === 16, `a név legfeljebb 16 betű („${val}”)`);
    await page.keyboard.press('Enter');
    const leaked = await page.evaluate(() => window.__hud.log.gameKeys.slice());
    check(leaked.length === 0, `a billentyűk nem jutnak a játékhoz (${leaked.join(',') || 'semmi'})`);
    const stored = await page.evaluate(() => window.__hud.loadEntries().some((e) => e.name.startsWith('Kovács Pista')));
    check(stored, 'mentve a localStorage-ba');
    const me = await page.evaluate(() => document.querySelector('.board tr.me')?.textContent);
    check(!!me, `a saját sor kiemelve (${me})`);
    await page.waitForTimeout(100);
    await shot(page, 'board-desktop-saved.png');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const inCard = await page.evaluate(() => !!document.activeElement?.closest('.board-card'));
    check(inCard, 'a Tab a kártyán belül marad');
    await page.keyboard.press('Escape');
    const closed = await page.evaluate(() => ({ hidden: document.querySelector('.board').hidden, log: window.__hud.log }));
    check(closed.hidden && closed.log.close === 1, 'Escape bezár, onClose lefut');
    check(!closed.log.gameKeys.includes('Escape'), 'az Escape nem jut a játékhoz');

    // showOnly from the corner button
    await page.click('#btn-gallery');
    await page.waitForTimeout(450);
    const onlyRun = await page.evaluate(() => document.querySelector('.board-run').hidden && !document.querySelector('.board').hidden);
    check(onlyRun, 'showOnly: csak a tábla');
    await shot(page, 'board-desktop-only.png');
    await page.click('.board-again');
    check(await page.evaluate(() => window.__hud.log.again === 1 && document.querySelector('.board').hidden), 'Újra: onAgain, bezár');
    await ctx.close();
  }

  // ---------------------------------------------------------------- phone
  {
    console.log('telefon, 390×844 @2x');
    const { ctx, page } = await open({ width: 390, height: 844 }, { deviceScaleFactor: 2, isMobile: true, hasTouch: true }, '?t=22&still');
    await page.waitForTimeout(150);
    await shot(page, 'phone.png');
    const visibleRows = await page.evaluate(() => [...document.querySelectorAll('.hl-item')].filter((n) => n.offsetParent).length);
    check(visibleRows === 1, `telefonon egy sor látszik (${visibleRows})`);
    await page.evaluate(() => window.__hud.openBoard());
    await page.waitForTimeout(450);
    await shot(page, 'board-phone.png');
    await ctx.close();
  }

  // ---------------------------------------------------------------- no storage at all
  {
    console.log('tároló nélkül');
    const { ctx, page } = await open({ width: 900, height: 700 }, {}, '?still', () => {
      Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('tiltva', 'SecurityError'); } });
    });
    await page.evaluate(() => window.__hud.openBoard());
    await page.fill('#board-name', 'Tároló nélkül');
    await page.click('.board-save');
    const ok = await page.evaluate(() => !!document.querySelector('.board tr.me') && /csak most/.test(document.querySelector('.board-note').textContent));
    check(ok, 'localStorage nélkül is működik');
    await ctx.close();
  }
} finally {
  await browser.close();
  if (server) { server.kill(); console.log('szerver leállítva'); }
}

const errs = problems;
if (errs.length) { console.log('\nPROBLÉMÁK:\n' + errs.join('\n')); process.exit(1); }
console.log('\nminden rendben');
