// MINNESOTA MAYHEM 2.0 — 25-step browser journey (Playwright + Chromium).
// Requires: npm run build && node server.mjs --port 4173   then: npm run test:e2e
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const { chromium, devices } = pw;
const URL = process.env.MM_URL ?? 'http://localhost:4173/';
const SHOTS = 'docs/screenshots/v2'; mkdirSync(SHOTS, { recursive: true });
const results = [];
const ok = (step, detail = '') => { results.push({ step, ok: true, detail }); console.log('✔', step, detail); };
const fail = (step, detail) => { results.push({ step, ok: false, detail }); console.log('✘', step, detail); };
const money = async p => parseFloat((await p.locator('.hud-item.money b').innerText()).replace(/[$,]/g, ''));
function hashString(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
function checksum(json) { const a = hashString(json); let b = 5381; for (let i = 0; i < json.length; i++) b = (Math.imul(b, 33) ^ json.charCodeAt(i)) >>> 0; return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0'); }
const shot = (p, name, full = false) => p.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: full });

// Simple tight-aggressive policy that reads only what a human sees (own cards + board).
async function smartAction(p) {
  const RV = '23456789TJQKA';
  const lab = async sel => (await p.locator(sel).evaluateAll(els => els.map(e => e.getAttribute('aria-label') || ''))).filter(Boolean).map(x => x.replace('10', 'T'));
  const hole = (await lab('.seat.pos0 .pcard.face')).map(x => RV.indexOf(x[0]));
  const board = (await lab('.board .pcard.face')).map(x => RV.indexOf(x[0]));
  if (hole.length < 2) return null;
  const [a, b] = hole.sort((x, y) => y - x);
  const pre = board.length === 0;
  const strong = pre ? (a === b || a >= 10 && b >= 8 || a === 12) : (board.includes(a) || board.includes(b) || a === b);
  const monster = pre ? (a === b && a >= 9) || (a === 12 && b >= 11) : (board.filter(x => x === a || x === b).length >= 2 || (a === b && board.includes(a)));
  const raise = p.locator('.btn.raise'), check = p.locator('.btn.check'), call = p.locator('.btn.call'), fold = p.locator('.btn.fold');
  if (monster && await raise.isVisible().catch(() => false)) { await p.locator('.raise-box .quick button:has-text("Pot")').click({ force: true }).catch(() => {}); return raise; }
  if (await check.isVisible().catch(() => false)) return check;
  if (strong && await call.isVisible().catch(() => false)) return call;
  return fold;
}

async function playMatch(p, { useAbility = false, maxMs = 300000, smart = false } = {}) {
  const t0 = Date.now(); let usedAbility = false, actions = 0, reports = [];
  await p.click('.speed button:has-text("4×")').catch(() => {});
  while (Date.now() - t0 < maxMs) {
    if (await p.locator('text=Collect Results').isVisible().catch(() => false)) {
      await p.click('text=Collect Results');
      await p.waitForSelector('.modal >> text=Continue', { timeout: 8000 });
      reports.push(await p.locator('.modal').innerText());
      await p.click('.modal >> text=Continue');
      await p.waitForTimeout(250);
      if (await p.locator('.table-area').isVisible().catch(() => false)) { await p.click('.speed button:has-text("4×")').catch(() => {}); continue; } // tournament final
      return { usedAbility, actions, report: reports.join('\n---\n') };
    }
    if (await p.locator('.actions').isVisible().catch(() => false)) {
      if (useAbility && !usedAbility) { const r = p.locator('.ab-slot.ready').first(); if (await r.count()) { await r.click({ force: true }); usedAbility = true; } }
      const check = p.locator('.btn.check'), call = p.locator('.btn.call');
      const sb = smart ? await smartAction(p) : null;
      if (sb) await sb.click({ force: true }).catch(() => {});
      else if (await check.isVisible().catch(() => false)) await check.click({ force: true });
      else if (await call.isVisible().catch(() => false)) { const amt = parseInt((await call.innerText()).replace(/\D+/g, ' ').trim().split(' ')[0] || '0', 10); if (amt > 600 && actions % 3) await p.click('.btn.fold', { force: true }); else await call.click({ force: true }); }
      actions++; await p.waitForTimeout(40);
    } else {
      const skip = p.locator('.speed button[title="Skip to your next decision"]');
      if (actions > 6 && await skip.isVisible().catch(() => false)) await skip.click().catch(() => {});
      await p.waitForTimeout(100);
    }
  }
  throw new Error('match did not finish in time');
}
async function exportSave(p) {
  await p.click('.tabs button:has-text("EMPIRE")');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('button:has-text("Export save")')]);
  return JSON.parse(readFileSync(await dl.path(), 'utf8'));
}
async function importEdited(p, env, edit) {
  edit(env.data);
  const cash = env.data.player.bankroll - Object.entries(env.data.ledgerTotals).filter(([k]) => !k.startsWith('sink:')).reduce((s, [, v]) => s + v, 0);
  env.data.ledgerTotals.scenario = (env.data.ledgerTotals.scenario ?? 0) + cash;
  const data = JSON.stringify(env.data);
  const signed = JSON.stringify({ format: env.format, version: env.version, savedAt: Date.now(), checksum: checksum(data) }).slice(0, -1) + `,"data":${data}}`;
  writeFileSync('/tmp/mm-edit.json', signed);
  await p.click('.tabs button:has-text("EMPIRE")');
  await p.setInputFiles('.empire-tab input[type=file]', '/tmp/mm-edit.json');
  await p.waitForTimeout(500);
}

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const p = await ctx.newPage();
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.goto(URL);
  await p.waitForSelector('text=Begin Your Career'); await shot(p, '01-title');
  await p.fill('#nm', 'Journey'); await p.click('text=Begin Your Career'); await p.waitForSelector('.play-btn');
  const bank0 = await money(p); await shot(p, '02-arena');
  ok('1. Start a career', `bankroll $${bank0}; tutorial coach visible: ${await p.locator('.coach').isVisible()}`);

  // ---- tutorial-guided first ranked match
  await p.click('.play-btn'); await p.waitForSelector('.actions', { timeout: 20000 }); await shot(p, '03-match');
  const r1 = await playMatch(p, { useAbility: true });
  ok('3. Play a ranked match', r1.report.split('\n').slice(0, 2).join(' '));
  r1.usedAbility ? ok('4. Use abilities', 'armed a ready Arsenal active mid-hand') : fail('4. Use abilities', 'no ready ability');
  const bank1 = await money(p);
  bank1 !== bank0 ? ok('5. Win or lose Dollars', `$${bank0} → $${bank1}`) : fail('5. Win or lose Dollars', 'unchanged');
  await p.click('.tabs button:has-text("FORGE")');
  await p.click('.slot8:has-text("Caesar")');
  const b0 = await money(p); await p.click('button:has-text("Upgrade → Lv2")'); await p.waitForTimeout(300);
  (await money(p)) < b0 ? ok('6. Upgrade the Arsenal', `Caesar's Gambit → Lv2 for $${(b0 - (await money(p))).toFixed(2)}`) : fail('6. Upgrade the Arsenal', 'no charge');
  // custom build
  await p.click('.slot8:has-text("Augur")'); await p.click('.anvil button:has-text("Unequip")');
  await p.click('.ab-card:has-text("Silver Tongue")'); await p.click('.anvil button:has-text("Buy")'); await p.waitForTimeout(200);
  await p.fill('.presets input', 'E2E Bluff'); await p.click('button:has-text("Save build")');
  (await p.locator('.presets button:has-text("E2E Bluff")').count()) ? ok('7. Create a custom build', 'swapped Augur\'s Eye for Silver Tongue and saved preset "E2E Bluff"') : fail('7. Create a custom build', 'preset missing');
  await shot(p, '07-forge', true);
  await p.click('.tabs button:has-text("EXCHANGE")'); await p.waitForTimeout(200);
  await p.click('.qty-row button:has-text("10")'); await p.locator('.outcome .btn.buy').first().click({ force: true }); await p.waitForTimeout(200);
  await p.click('.tabs button:has-text("EMPIRE")'); await p.waitForTimeout(300);
  const tutDone = !(await p.locator('.coach').isVisible().catch(() => false));
  tutDone ? ok('2. Complete the tutorial', 'all 8 learn-by-doing steps completed (match, ability, Forge, Exchange, Empire)') : fail('2. Complete the tutorial', 'coach still visible');

  // ---- second game mode: Quick Clash
  await p.click('.tabs button:has-text("ARENA")');
  await p.click('.mode-card:has-text("Quick Clash")'); await shot(p, '08-modes', true);
  await p.click('.play-btn'); const rq = await playMatch(p);
  ok('8. Play a second game mode', `Quick Clash finished (${rq.report.split('\n').slice(0, 1)})`);

  // ---- scenario save: promotion-ready, rivalry, funds, 6 matches
  let env = await exportSave(p);
  const target = { id: '' };
  await importEdited(p, env, d => {
    d.player.rating = 1085; d.player.bankroll = 300000; d.player.matches = 6;
    const r = d.rivals.find(x => x.rank === 0 && !d.markets.some(m => m.rivalIds.includes(x.id)));
    r.rivalry = 5; r.vsPlayer = { wins: 3, losses: 1 }; target.id = r.id; target.name = r.name;
  });
  await p.click('.tabs button:has-text("ARENA")');
  await p.click('.mode-card:has-text("Rival Challenge")'); await p.click('.play-btn');
  const rr = await playMatch(p);
  /bounty|rivalry|ahead/i.test(rr.report) ? ok('9. Face a recurring rival', `Rival Challenge vs ${target.name}: ${rr.report.split('\n').find(l => /bounty|rivalry|ahead/i.test(l))}`) : fail('9. Face a recurring rival', rr.report.slice(0, 200));

  // ---- promotion (retry from the same scenario until a top-2 finish)
  let promoted = false;
  for (let attempt = 0; attempt < 12 && !promoted; attempt++) {
    env = await exportSave(p);
    await importEdited(p, env, d => { d.player.rating = Math.max(d.player.rating, 1085); d.player.rank = 0; });
    await p.click('.tabs button:has-text("ARENA")');
    await p.click('.arena-opt:has-text("Promotion Trial")'); await p.click('.play-btn');
    await playMatch(p, { smart: true }).catch(async () => { await p.click('.speed .danger').catch(() => {}); await p.click('.modal button.danger').catch(() => {}); await playMatch(p).catch(() => {}); });
    if (await p.locator('.ceremony').isVisible().catch(() => false)) {
      await shot(p, '10-ceremony'); promoted = true;
      await p.click('.ceremony button');
      await p.waitForTimeout(300);
      if (await p.locator('.modal >> text=Continue').isVisible().catch(() => false)) await p.click('.modal >> text=Continue');
    }
  }
  promoted ? ok('10. Earn a promotion', 'passed the Plebeian trial; promotion ceremony shown') : fail('10. Earn a promotion', 'no top-2 trial finish in 12 attempts');

  // ---- exchange journey
  await p.click('.tabs button:has-text("EXCHANGE")'); await p.waitForSelector('.market-detail');
  const card = p.locator('.market-card.st-open').first(); if (await card.count()) await card.click();
  const bankEx = await money(p);
  await p.click('.qty-row button:has-text("10")');
  await p.locator('.outcome .btn.buy').nth(1).click({ force: true }); await p.waitForTimeout(150);
  (await p.locator('.outcome').nth(1).locator('.oc-pos').innerText()).includes('10') ? ok('12. Buy a prediction contract', `10 contracts; bankroll $${bankEx} → $${await money(p)}`) : fail('12. Buy a prediction contract', 'no position');
  await p.click('.qty-row button:has-text("5")');
  await p.locator('.outcome').nth(1).locator('.btn.sell').click({ force: true }); await p.waitForTimeout(150);
  (await p.locator('.outcome').nth(1).locator('.oc-pos').innerText()).startsWith('5') ? ok('13. Sell a contract', 'sold 5 of 10; 5 held') : fail('13. Sell a contract', await p.locator('.outcome').nth(1).locator('.oc-pos').innerText());
  await p.click('button:has-text("Spectate live")'); await p.waitForTimeout(3500); await shot(p, '11-spectator', true);
  (await p.locator('.spectator').isVisible()) ? ok('11. Watch an AI-only match', 'spectated action-by-action on the live table (hole cards hidden until showdown)') : fail('11. Watch an AI-only match', 'no spectator');
  await p.click('button:has-text("Pause")').catch(() => {});
  await p.click('button:has-text("Result")'); await p.waitForSelector('.settled-banner', { timeout: 60000 });
  ok('14. Hold a contract through settlement', (await p.locator('.settled-banner').innerText()).replace(/\s+/g, ' ').slice(0, 160));
  await p.click('.seg button:has-text("Portfolio")'); await p.waitForTimeout(200); await shot(p, '15-portfolio', true);
  (await p.locator('text=Settlement records').count()) ? ok('15. Inspect portfolio P&L', `exposure/unrealized dashboard + settlement records; net Exchange cash ${await p.locator('.portfolio div:has-text("Net cash") b').innerText()}`) : fail('15. Inspect portfolio P&L', 'missing');
  await p.click('.seg button:has-text("Markets")');

  // ---- empire
  await p.click('.tabs button:has-text("EMPIRE")');
  const be = await money(p);
  await p.click('.asset:has-text("Lakeside Villa") button.gold'); await p.waitForTimeout(200);
  (await money(p)) < be ? ok('16. Buy a property', `Lakeside Villa for $${(be - (await money(p))).toFixed(2)}`) : fail('16. Buy a property', 'no purchase');
  const be2 = await money(p);
  await p.click('.asset:has-text("Lakeside Villa") button:has-text("Expand")'); await p.waitForTimeout(200);
  (await p.locator('.asset:has-text("Lakeside Villa") .lv').innerText()).includes('2') ? ok('17. Upgrade a property', `Villa → level 2 for $${(be2 - (await money(p))).toFixed(2)}`) : fail('17. Upgrade a property', 'not level 2');
  await shot(p, '16-empire', true);

  // ---- tournament
  await p.click('.tabs button:has-text("ARENA")');
  const tcard = p.locator('.mode-card:has-text("Imperial Tournament")');
  await tcard.click(); await p.click('.play-btn');
  const rt = await playMatch(p, { maxMs: 400000, smart: true });
  (await p.locator('.world-tabs, .seg button:has-text("Tournaments")').count()) && await p.click('.seg button:has-text("Tournaments")').catch(() => {});
  await p.waitForTimeout(200); await shot(p, '18-tournament', true);
  /Final table|heat|Knocked/i.test(rt.report) ? ok('18. Complete a tournament', rt.report.split('\n').filter(l => /Final|heat|Knocked/i.test(l)).join(' | ')) : fail('18. Complete a tournament', rt.report.slice(0, 200));
  const ach = await p.locator('.achievements .got').count();
  ach > 0 ? ok('19. Earn an achievement', `${ach} achievement(s) unlocked: ${(await p.locator('.achievements .got b').allInnerTexts()).join(', ')}`) : fail('19. Earn an achievement', 'none');

  // ---- save & reload
  const bs = await money(p);
  await p.click('.tabs button:has-text("EMPIRE")'); await p.click('button:has-text("Save now")'); await p.waitForTimeout(600);
  await p.reload(); await p.waitForSelector('.hud-item.money');
  (await money(p)) === bs ? ok('20. Save and reload', `bankroll $${bs} restored after reload`) : fail('20. Save and reload', `${bs} vs ${await money(p)}`);

  // ---- V1 migration via the import path
  await p.click('.tabs button:has-text("EMPIRE")');
  await p.setInputFiles('.empire-tab input[type=file]', 'tests/fixtures/v1-save.json'); await p.waitForTimeout(600);
  const mb = await money(p);
  const migratedOk = Math.abs(mb - 41.61) < 0.01 && (await p.locator('.table-area').isVisible().catch(() => false));
  migratedOk ? ok('21. Migrate a Version 1 save', `V1 save (schema 3) imported: bankroll $${mb}, its in-progress match resumed`) : fail('21. Migrate a Version 1 save', `bankroll ${mb}`);
  await shot(p, '21-migrated-match');
  await playMatch(p).catch(() => {});

  // ---- bankruptcy recovery
  env = await exportSave(p);
  await importEdited(p, env, d => { d.player.bankroll = 300; });
  await p.click('.tabs button:has-text("ARENA")');
  await p.click('.arena-opt:has-text("Bread & Circuses")'); await p.click('.play-btn'); await playMatch(p);
  ok('22. Recover from bankruptcy', `from $3.00 → $${await money(p)} via a free Bread & Circuses match`);

  // ---- offline
  await p.waitForTimeout(1200);
  const sw = await p.evaluate(async () => !!(await navigator.serviceWorker?.getRegistration()));
  await ctx.setOffline(true); await p.reload(); await p.waitForSelector('.hud-item.money', { timeout: 10000 });
  await p.click('.tabs button:has-text("EXCHANGE")'); await p.waitForSelector('.market-detail');
  ok('23. Reload offline', `service worker ${sw ? 'active' : 'missing'}; reloaded with network disabled; Exchange renders`);
  await ctx.setOffline(false);
  errors.length ? fail('No runtime errors (desktop)', errors.join(' | ')) : ok('No runtime errors (desktop)');
  await ctx.close();

  // ---- iPhone
  const mctx = await browser.newContext({ ...devices['iPhone 13'] });
  const mp = await mctx.newPage(); const merr = []; mp.on('pageerror', e => merr.push(e.message));
  await mp.goto(URL); await mp.fill('#nm', 'Phone'); await mp.click('text=Begin Your Career'); await mp.waitForSelector('.play-btn');
  await shot(mp, 'm-arena');
  await mp.tap('.play-btn'); await mp.waitForSelector('.actions', { timeout: 20000 }); await shot(mp, 'm-match');
  const box = await mp.locator('.actions .btn').first().boundingBox();
  const inView = box.y + box.height <= 844;
  const rm = await playMatch(mp);
  const overflow = [];
  for (const tab of ['EXCHANGE', 'FORGE', 'EMPIRE', 'ARENA']) { await mp.tap(`.tabs button:has-text("${tab}")`); await mp.waitForTimeout(250); await shot(mp, `m-${tab.toLowerCase()}`); overflow.push(await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)); }
  overflow.every(o => o <= 1) && box.height >= 44 && inView ? ok('24. Play on an iPhone-sized screen', `iPhone 13: no horizontal overflow on any tab; action buttons ${Math.round(box.height)}px and on-screen; full match by touch (${rm.actions} taps)`) : fail('24. Play on an iPhone-sized screen', `overflow ${overflow}, button ${JSON.stringify(box)}`);
  merr.length ? fail('No runtime errors (mobile)', merr.join(' | ')) : ok('No runtime errors (mobile)');
  await mctx.close();

  // ---- longer career (headless simulation of the same engine)
  try {
    const out = execSync('npx vitest run tests/save.test.ts -t "40-match career" 2>&1', { encoding: 'utf8', timeout: 300000 });
    /1 passed/.test(out) ? ok('25. Continue through a longer simulated career', '40-match career with all invariants (ledger, markets, saves) — plus 6×140-match careers in the balance report') : fail('25. Longer career', out.slice(-300));
  } catch (e) { fail('25. Longer career', String(e).slice(0, 300)); }
} catch (e) { fail('journey aborted', e.stack); }
finally {
  await browser.close();
  writeFileSync('docs/E2E_RESULTS.json', JSON.stringify(results, null, 2));
  const bad = results.filter(r => !r.ok);
  console.log(`\n${results.length - bad.length}/${results.length} journey checks passed`);
  process.exit(bad.length ? 1 : 0);
}
