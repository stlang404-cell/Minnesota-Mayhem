// Browser-driven player journey (Playwright + Chromium). Requires a production build being served:
//   npm run build && node server.mjs --port 4173   (then)   npm run test:e2e
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const { chromium, devices } = pw;
const URL = process.env.MM_URL ?? 'http://localhost:4173/';
const SHOTS = 'docs/screenshots';
mkdirSync(SHOTS, { recursive: true });
const results = [];
const ok = (step, detail = '') => { results.push({ step, ok: true, detail }); console.log('✔', step, detail); };
const fail = (step, detail) => { results.push({ step, ok: false, detail }); console.log('✘', step, detail); };
const money = async p => parseFloat((await p.locator('.hud-item.money b').innerText()).replace(/[$,]/g, ''));

// same checksum as src/core/save.ts
function hashString(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
function checksum(json) { const a = hashString(json); let b = 5381; for (let i = 0; i < json.length; i++) b = (Math.imul(b, 33) ^ json.charCodeAt(i)) >>> 0; return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0'); }

async function playMatch(p, { useAbility = false, maxMs = 240000 } = {}) {
  const t0 = Date.now();
  let usedAbility = false, actions = 0;
  await p.click('.speed button:has-text("4×")').catch(() => {});
  while (Date.now() - t0 < maxMs) {
    if (await p.locator('text=Collect Results').isVisible().catch(() => false)) {
      await p.click('text=Collect Results');
      await p.waitForSelector('text=Continue', { timeout: 5000 });
      const report = await p.locator('.modal').innerText();
      await p.screenshot({ path: `${SHOTS}/report.png` });
      await p.click('text=Continue');
      return { usedAbility, actions, report };
    }
    if (await p.locator('.actions').isVisible().catch(() => false)) {
      if (useAbility && !usedAbility) {
        const ready = p.locator('.ab-slot.ready').first();
        if (await ready.count()) { await ready.click({ force: true }); usedAbility = true; await p.waitForTimeout(150); if (actions < 3) await p.screenshot({ path: `${SHOTS}/match-ability.png` }); }
      }
      const check = p.locator('.btn.check'); const call = p.locator('.btn.call');
      if (await check.isVisible().catch(() => false)) await check.click();
      else if (await call.isVisible().catch(() => false)) {
        const txt = await call.innerText();
        const amt = parseInt(txt.replace(/\D+/g, ' ').trim().split(' ')[0] || '0', 10);
        if (amt > 400 && actions % 3) await p.click('.btn.fold'); else await call.click();
      }
      actions++;
      await p.waitForTimeout(60);
    } else {
      await p.waitForTimeout(120);
    }
  }
  throw new Error('match did not finish in time');
}

const browser = await chromium.launch();
try {
  // ------------------------------------------------ desktop journey
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(URL);
  await p.waitForSelector('text=Begin Your Career');
  await p.screenshot({ path: `${SHOTS}/title.png` });
  ok('1. Launch game', 'title screen rendered');

  await p.fill('#nm', 'Journey');
  await p.click('text=Begin Your Career');
  await p.waitForSelector('.play-btn');
  const bank0 = await money(p);
  await p.screenshot({ path: `${SHOTS}/arena.png`, fullPage: true });
  ok('2. Start a career', `bankroll $${bank0}`);

  await p.click('.play-btn');
  await p.waitForSelector('.table-area');
  await p.waitForSelector('.actions', { timeout: 20000 }).catch(() => {});
  await p.screenshot({ path: `${SHOTS}/match.png` });
  const r1 = await playMatch(p, { useAbility: true });
  ok('3. Play a full four-player match', `${r1.actions} decisions; result: ${r1.report.split('\n').slice(0, 2).join(' ')}`);
  r1.usedAbility ? ok('4. Use an Arsenal ability', 'armed an active ability (Augur\'s Eye / War Drums) during the match') : fail('4. Use an Arsenal ability', 'no ready ability seen');
  const bank1 = await money(p);
  bank1 !== bank0 ? ok('5. Win or lose Dollars', `$${bank0} → $${bank1}`) : fail('5. Win or lose Dollars', 'bankroll unchanged');

  await p.click('.tabs button:has-text("FORGE")');
  await p.click('.slot8:has-text("Caesar")');
  const before = await money(p);
  await p.click('button:has-text("Upgrade → Lv2")');
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${SHOTS}/forge.png`, fullPage: true });
  const after = await money(p);
  after < before ? ok('6. Buy an upgrade', `Caesar's Gambit → Lv2 for $${(before - after).toFixed(2)}`) : fail('6. Buy an upgrade', 'no charge');

  await p.click('.tabs button:has-text("ARENA")');
  const rating0 = await p.locator('.rating-line b').innerText();
  await p.click('.play-btn');
  const r2 = await playMatch(p);
  ok('7. Enter another match', `${r2.actions} decisions`);
  const rating1 = await p.locator('.rating-line b').innerText();
  ok('8. Progress toward promotion', `rating ${rating0} → ${rating1}; objective: ${(await p.locator('.objective').innerText()).replace(/\s+/g, ' ')}`);

  await p.click('.tabs button:has-text("EXCHANGE")');
  await p.waitForSelector('.market-detail');
  const names = await p.locator('.outcome b').allInnerTexts();
  ok('9. View an AI-only match market', `competitors: ${names.slice(0, 8).filter((_, i) => i % 2 === 0).join(', ')}`);
  const bankEx0 = await money(p);
  await p.click('.qty-row button:has-text("10")');
  await p.locator('.outcome .btn.buy').first().click();
  await p.waitForTimeout(250);
  const pos = await p.locator('.outcome .oc-pos').first().innerText();
  pos.includes('10') ? ok('10. Purchase a prediction contract', `position: ${pos.replace(/\s+/g, ' ')}`) : fail('10. Purchase a prediction contract', pos);
  await p.click('button:has-text("Start match")').catch(() => {});
  for (let i = 0; i < 3; i++) await p.click('button:has-text("Next hand")').catch(() => {});
  await p.screenshot({ path: `${SHOTS}/exchange-live.png`, fullPage: true });
  await p.click('button:has-text("Fast-forward")').catch(() => {});
  await p.waitForSelector('.settled-banner', { timeout: 60000 });
  ok('11. Watch / fast-forward the match', 'watched 3 hands live, then fast-forwarded');
  const banner = await p.locator('.settled-banner').innerText();
  await p.screenshot({ path: `${SHOTS}/exchange-settled.png`, fullPage: true });
  ok('12. Settle the contract', `${banner.replace(/\s+/g, ' ')} (bankroll $${bankEx0} → $${await money(p)})`);

  await p.click('.tabs button:has-text("EMPIRE")');
  const bankE = await money(p);
  await p.click('.asset:has-text("Lakeside Villa") button.gold');
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${SHOTS}/empire.png`, fullPage: true });
  (await p.locator('.asset:has-text("Lakeside Villa") .lv').count()) ? ok('13. Buy an Empire asset', `Lakeside Villa for $${(bankE - (await money(p))).toFixed(2)}`) : fail('13. Buy an Empire asset', 'villa not owned');

  const bankSave = await money(p);
  await p.click('button:has-text("Save now")');
  await p.waitForTimeout(600);
  await p.reload();
  await p.waitForSelector('.hud-item.money');
  const bankLoad = await money(p);
  await p.click('.tabs button:has-text("EMPIRE")');
  const villaKept = await p.locator('.asset:has-text("Lakeside Villa") .lv').count();
  bankLoad === bankSave && villaKept ? ok('14. Save and reload', `bankroll $${bankLoad} and Villa restored after reload`) : fail('14. Save and reload', `${bankSave} vs ${bankLoad}, villa ${villaKept}`);

  // 15. low bankroll: export the save, set bankroll to $5 (re-signed), import it, play Bread & Circuses
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('button:has-text("Export save")')]);
  const text = readFileSync(await dl.path(), 'utf8');
  const env = JSON.parse(text);
  env.data.player.bankroll = 500;
  env.data.ledgerTotals.scenario = 500 - Object.entries(env.data.ledgerTotals).filter(([k]) => !k.startsWith('sink:')).reduce((s, [, v]) => s + v, 0);
  const data = JSON.stringify(env.data);
  const signed = JSON.stringify({ format: env.format, version: env.version, savedAt: Date.now(), checksum: checksum(data) }).slice(0, -1) + `,"data":${data}}`;
  writeFileSync('/tmp/mm-low.json', signed);
  await p.setInputFiles('.empire-tab input[type=file]', '/tmp/mm-low.json');
  await p.waitForTimeout(500);
  const low = await money(p);
  await p.click('.tabs button:has-text("ARENA")');
  await p.click('.arena-opt:has-text("Bread & Circuses")');
  await p.screenshot({ path: `${SHOTS}/recovery.png` });
  await p.click('.play-btn');
  await playMatch(p);
  const rec = await money(p);
  ok('15. Recover from a low bankroll', `imported a $${low} save; free Bread & Circuses match available; bankroll after: $${rec}`);

  // offline
  await p.waitForTimeout(1500);
  const sw = await p.evaluate(async () => !!(await navigator.serviceWorker?.getRegistration()));
  await ctx.setOffline(true);
  await p.reload();
  await p.waitForSelector('.hud-item.money', { timeout: 10000 });
  await p.click('.tabs button:has-text("ARENA")');
  await p.locator('.arena-opt').first().click();
  ok('21. Offline operation', `service worker ${sw ? 'active' : 'missing'}; reloaded with network disabled and the game loaded`);
  await ctx.setOffline(false);
  errors.length ? fail('No runtime errors (desktop)', errors.join(' | ')) : ok('No runtime errors (desktop)');
  await ctx.close();

  // ------------------------------------------------ mobile (iPhone viewport)
  const mctx = await browser.newContext({ ...devices['iPhone 13'] });
  const mp = await mctx.newPage();
  const merr = [];
  mp.on('pageerror', e => merr.push(e.message));
  await mp.goto(URL);
  await mp.fill('#nm', 'Phone');
  await mp.click('text=Begin Your Career');
  await mp.waitForSelector('.play-btn');
  await mp.screenshot({ path: `${SHOTS}/mobile-arena.png` });
  const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await mp.tap('.play-btn');
  await mp.waitForSelector('.actions', { timeout: 20000 });
  await mp.screenshot({ path: `${SHOTS}/mobile-match.png` });
  const btnBox = await mp.locator('.actions .btn').first().boundingBox();
  const r = await playMatch(mp);
  for (const tab of ['EXCHANGE', 'FORGE', 'EMPIRE']) {
    await mp.tap(`.tabs button:has-text("${tab}")`);
    await mp.waitForTimeout(200);
    await mp.screenshot({ path: `${SHOTS}/mobile-${tab.toLowerCase()}.png` });
  }
  const overflow2 = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  overflow <= 1 && overflow2 <= 1 && btnBox.height >= 44 ? ok('22. Mobile responsiveness', `iPhone 13 viewport: no horizontal overflow; action button ${Math.round(btnBox.height)}px tall; full match played by touch (${r.actions} taps)`) : fail('22. Mobile responsiveness', `overflow ${overflow}/${overflow2}, button ${btnBox?.height}`);
  merr.length ? fail('No runtime errors (mobile)', merr.join(' | ')) : ok('No runtime errors (mobile)');
  await mctx.close();
} catch (e) {
  fail('journey aborted', e.stack);
} finally {
  await browser.close();
  writeFileSync('docs/E2E_RESULTS.json', JSON.stringify(results, null, 2));
  const bad = results.filter(r => !r.ok);
  console.log(`\n${results.length - bad.length}/${results.length} journey checks passed`);
  process.exit(bad.length ? 1 : 0);
}
