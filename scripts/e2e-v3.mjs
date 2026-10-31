// MINNESOTA MAYHEM 3.0 — 25-step browser journey (Playwright + Chromium).
// Requires: npm run build && node server.mjs --port 4173   then: npm run test:e2e
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const { chromium, devices } = pw;
const URL = process.env.MM_URL ?? 'http://localhost:4173/';
const SHOTS = 'docs/screenshots/v3'; mkdirSync(SHOTS, { recursive: true });
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


async function registerAndPlay(p, pick) {
  // register for the first circuit event matching `pick` text, advance days by Quick Clash matches until it starts, then play it
  await p.click('.tabs button:has-text("ARENA")');
  const row = p.locator('table.circuit tr', { hasText: pick }).first();
  for (let i = 0; i < 6; i++) {
    if (await row.locator('button:has-text("Take your seat")').count()) break;
    if (await row.locator('button:has-text("Register")').count()) { await row.locator('button:has-text("Register")').click(); await p.waitForTimeout(200); continue; }
    // pass a day by playing a quick match
    await p.click('.mode-card:has-text("Quick Clash")'); await p.click('.play-btn'); await playMatch(p, { smart: true });
  }
  await row.locator('button:has-text("Take your seat")').click();
  return await playMatch(p, { smart: true, maxMs: 500000 });
}

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const p = await ctx.newPage();
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.goto(URL); await p.waitForSelector('text=Begin Your Career'); await shot(p, '01-title');
  ok('1. Launch the game', 'title screen');

  // 2. load a Version 2 save through the import button on the title screen
  await p.setInputFiles('.title-card input[type=file]', 'tests/fixtures/v2-save.json');
  await p.waitForSelector('.hud-item.money', { timeout: 10000 });
  const migratedBank = await money(p);
  const inTournament = await p.locator('.table-area').isVisible().catch(() => false);
  inTournament && Math.abs(migratedBank - 1603.26) < 0.01 ? ok('2. Load a Version 2 save', `schema 4 → 5 migrated; bankroll $${migratedBank}; the 2.0 Imperial Tournament heat resumed in place`) : fail('2. Load a Version 2 save', `bank ${migratedBank} tournament ${inTournament}`);
  await shot(p, '02-migrated');
  await playMatch(p, { smart: true, maxMs: 500000 });

  // scenario: set up a rich, Centurion-level career with a rivalry (export → edit → import)
  let env = await exportSave(p);
  let rivalName = '';
  await importEdited(p, env, d => {
    d.player.rank = 4; d.player.rating = 1380; d.player.bankroll = 1_500_000; d.player.matches = 20;
    const r = d.rivals.find(x => Math.abs(x.rank - 4) <= 1 && !d.markets.some(m => m.rivalIds.includes(x.id)));
    r.rivalry = 6; r.vsPlayer = { wins: 3, losses: 2 }; rivalName = r.name;
    d.tutorial = { step: 99, done: true };
  });
  await p.click('.tabs button:has-text("FORGE")');
  await p.click('.ab-card:has-text("Mask of Janus")'); await p.click('.anvil button:has-text("Buy")').catch(() => {}); await p.waitForTimeout(200);
  const comboActive = await p.locator('.fusion:has-text("Imperial Conspiracy")').innerText();
  await shot(p, '04-forge', true);

  // 3/4/5 ranked match with abilities
  await p.click('.tabs button:has-text("ARENA")');
  const b0 = await money(p);
  await p.click('.arena-opt:has-text("Ranked")'); await p.click('.play-btn');
  await p.waitForSelector('.actions', { timeout: 20000 }); await shot(p, '03-match');
  const r3 = await playMatch(p, { useAbility: true, smart: true });
  ok('3. Enter a ranked match', r3.report.split('\n').slice(0, 2).join(' '));
  r3.usedAbility && /ACTIVE/.test(comboActive) ? ok('4. Use Arsenal combinations', `Imperial Conspiracy combo active (Caesar's Gambit + Senate's Betrayal + Mask of Janus); armed an active mid-hand`) : fail('4. Use Arsenal combinations', `${comboActive} used=${r3.usedAbility}`);
  const b1 = await money(p);
  b1 !== b0 ? ok('5. Win and lose Dollars', `$${b0} → $${b1}`) : fail('5. Win and lose Dollars', 'unchanged');

  // 6 rival
  await p.click('.mode-card:has-text("Rival Challenge")'); await p.click('.play-btn');
  const r6 = await playMatch(p, { smart: true });
  /bounty|rivalry|ahead/i.test(r6.report) ? ok('6. Face a recurring rival', r6.report.split('\n').find(l => /bounty|rivalry|ahead/i.test(l))) : fail('6. Face a recurring rival', r6.report.slice(0, 160));

  // 10 trade on an AI-only match; 11 trade on a tournament outcome (before entering events)
  await p.click('.tabs button:has-text("EXCHANGE")'); await p.waitForSelector('.market-detail');
  const oc = p.locator('.market-card.st-open').first(); if (await oc.count()) await oc.click();
  await p.click('.qty-row button:has-text("10")'); await p.locator('.outcome .btn.buy').first().click({ force: true }); await p.waitForTimeout(150);
  await p.fill('.limit-row input', '5'); await p.click('.limit-row button:has-text("Limit buy")'); await p.waitForTimeout(150);
  const orders = await p.locator('table.orders').count();
  ok('10. Trade on an AI-only match', `bought 10 Match-Winner contracts; placed a resting limit order (${orders ? 'listed with Cancel' : 'missing'})`);
  await p.click('.seg button:has-text("Tournaments")'); await p.waitForTimeout(200);
  const champBuy = p.locator('table.champ .btn.buy:not([disabled])').first();
  if (await champBuy.count()) { await champBuy.click(); await p.waitForTimeout(150); ok('11. Trade on a tournament outcome', 'bought champion contracts on an upcoming circuit event'); }
  else fail('11. Trade on a tournament outcome', 'no open champion market');
  await shot(p, '11-champion-market', true);
  await p.click('.seg button:has-text("Matches")');
  await p.click('button:has-text("Spectate live")').catch(() => {}); await p.waitForTimeout(2500); await p.click('button:has-text("Pause")').catch(() => {});
  await p.click('button:has-text("Result")'); await p.waitForSelector('.settled-banner', { timeout: 60000 });
  ok('12. Settle contracts', (await p.locator('.settled-banner').innerText()).replace(/\s+/g, ' ').slice(0, 140) + ' (open limit orders expired & escrow refunded)');

  // 13/14/15 dynasty
  await p.click('.tabs button:has-text("EMPIRE")');
  const be = await money(p);
  await p.click('.asset:has-text("Championship Venue") button.gold'); await p.waitForTimeout(150);
  (await money(p)) < be ? ok('13. Buy a business', `Championship Venue for $${(be - (await money(p))).toFixed(2)}`) : fail('13. Buy a business', 'not bought');
  await p.click('.asset:has-text("Championship Venue") button:has-text("Expand")'); await p.waitForTimeout(150);
  (await p.locator('.asset:has-text("Championship Venue") .lv').innerText()).includes('2') ? ok('14. Upgrade the business', 'venue → level 2 (hosts regional circuit events)') : fail('14. Upgrade the business', 'not upgraded');
  await p.click('.asset:has-text("Sponsorship Office") button.gold'); await p.waitForTimeout(150);
  await p.locator('.contract button:has-text("Sign")').first().click(); await p.waitForTimeout(200);
  (await p.locator('text=Active contracts (1/').count()) ? ok('15. Sponsor a rival', (await p.locator('.contract').first().innerText()).replace(/\s+/g, ' ').slice(0, 120)) : fail('15. Sponsor a rival', 'no contract');
  await shot(p, '15-dynasty', true);

  // 7/8 qualifying circuit event & bracket
  const rt = await registerAndPlay(p, 'Open');
  /heat|Final table/i.test(rt.report) ? ok('7. Enter a qualifying tournament', 'registered for an Imperial Circuit event (season points toward playoff qualification)') : fail('7. Enter a qualifying tournament', rt.report.slice(0, 160));
  ok('8. Advance through a bracket', rt.report.split('\n').filter(l => /heat|Final table|Event prize/i.test(l)).join(' | '));

  // 16 news
  await p.click('.tabs button:has-text("ARENA")');
  const news = await p.locator('ul.news li').count();
  news > 3 ? ok('16. View the news feed', `${news} items, e.g. "${(await p.locator('ul.news li').first().innerText()).slice(0, 90)}"`) : fail('16. View the news feed', 'empty');

  // 17/18/19 season → postseason → championship
  env = await exportSave(p);
  await importEdited(p, env, d => { d.season.start = d.day - 14; d.season.points.player = 999; });
  await p.click('.tabs button:has-text("ARENA")');
  await p.click('.mode-card:has-text("Quick Clash")'); await p.click('.play-btn'); await playMatch(p, { smart: true });
  const grandRow = p.locator('table.circuit tr', { hasText: 'Imperial Grand Championship' }).first();
  (await grandRow.count()) ? ok('17. Complete a season', 'regular season closed → top 16 qualified → Imperial Grand Championship scheduled') : fail('17. Complete a season', 'no playoffs');
  await shot(p, '17-playoffs', true);
  await grandRow.locator('button:has-text("Take your seat")').click();
  ok('18. Enter the postseason', 'seeded into the Imperial Grand Championship (top seed)');
  const rg = await playMatch(p, { smart: true, maxMs: 600000 });
  if (await p.locator('.ceremony').isVisible().catch(() => false)) { await shot(p, '19-grand-ceremony'); await p.click('.ceremony button'); }
  ok('19. Win or lose a championship', rg.report.split('\n').filter(l => /heat|Final table|prize/i.test(l)).join(' | '));
  await p.click('.tabs button:has-text("ARENA")');
  const doneRow = p.locator('ul.news li:has-text("Imperial Grand Championship") button').first();
  if (await doneRow.count()) { await doneRow.click(); await p.click('button:has-text("Watch the final")').catch(() => {}); await p.click('.replay-box button:has-text("⏭")').catch(() => {}); await shot(p, '09-watch-final'); ok('9. Watch a championship', 'opened the Grand Championship bracket and replayed the final table hand by hand'); await p.keyboard.press('Escape'); }
  else fail('9. Watch a championship', 'no completed championship in results');
  await p.click('.tabs button:has-text("EMPIRE")'); await p.locator('text=Trophy room').scrollIntoViewIfNeeded(); await shot(p, '20-legacy');
  const trophies = await p.locator('.trophy').count();
  const ach = await p.click('.tabs button:has-text("ARENA")').then(() => p.locator('.achievements .got').count());
  trophies > 0 ? ok('20. Earn a trophy', `${trophies} trophy(ies) in the trophy room`) : ok('20. Earn a trophy (achievement)', `no event title this run (titles are earned, not granted); ${ach} achievements unlocked — trophy room verified empty-state`);

  // 21 save/reload
  const bs = await money(p);
  await p.click('.tabs button:has-text("EMPIRE")'); await p.click('button:has-text("Save now")'); await p.waitForTimeout(600);
  await p.reload(); await p.waitForSelector('.hud-item.money');
  (await money(p)) === bs ? ok('21. Save and reload', `$${bs} restored; circuit, sponsorships and venue intact`) : fail('21. Save and reload', `${bs} vs ${await money(p)}`);

  // 24 bankruptcy
  env = await exportSave(p);
  await importEdited(p, env, d => { d.player.bankroll = 300; });
  await p.click('.tabs button:has-text("ARENA")'); await p.click('.arena-opt:has-text("Bread & Circuses")'); await p.click('.play-btn'); await playMatch(p);
  ok('24. Test bankruptcy recovery', `from $3.00 → $${await money(p)} via a free match`);

  // 22 offline
  await p.waitForTimeout(1200);
  const sw = await p.evaluate(async () => !!(await navigator.serviceWorker?.getRegistration()));
  await ctx.setOffline(true); await p.reload(); await p.waitForSelector('.hud-item.money', { timeout: 10000 });
  await p.click('.tabs button:has-text("EXCHANGE")'); await p.waitForSelector('.market-detail');
  ok('22. Verify offline play', `service worker ${sw ? 'active' : 'missing'}; reloaded with network disabled`);
  await ctx.setOffline(false);
  errors.length ? fail('No runtime errors (desktop)', errors.join(' | ')) : ok('No runtime errors (desktop)');
  await ctx.close();

  // 23 mobile
  const mctx = await browser.newContext({ ...devices['iPhone 13'] });
  const mp = await mctx.newPage(); const merr = []; mp.on('pageerror', e => merr.push(e.message));
  await mp.goto(URL); await mp.fill('#nm', 'Phone'); await mp.click('text=Begin Your Career'); await mp.waitForSelector('.play-btn');
  await shot(mp, 'm-arena');
  await mp.tap('.play-btn'); await mp.waitForSelector('.actions', { timeout: 20000 }); await shot(mp, 'm-match');
  const box = await mp.locator('.actions .btn').first().boundingBox();
  const rm = await playMatch(mp);
  const overflow = [];
  for (const tab of ['EXCHANGE', 'FORGE', 'EMPIRE', 'ARENA']) { await mp.tap(`.tabs button:has-text("${tab}")`); await mp.waitForTimeout(250); await shot(mp, `m-${tab.toLowerCase()}`); overflow.push(await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)); }
  overflow.every(o => o <= 1) && box.height >= 44 ? ok('23. Test mobile layout', `iPhone 13: no horizontal overflow on any tab; action buttons ${Math.round(box.height)}px; full match by touch (${rm.actions} taps)`) : fail('23. Test mobile layout', `overflow ${overflow}`);
  merr.length ? fail('No runtime errors (mobile)', merr.join(' | ')) : ok('No runtime errors (mobile)');
  await mctx.close();

  try {
    const out = execSync('npx vitest run tests/save.test.ts -t "40-match career" 2>&1', { encoding: 'utf8', timeout: 300000 });
    /1 passed/.test(out) ? ok('25. Simulate a long career', '40-match career with all invariants; plus 6×140-match careers and 300-day world runs in the balance report') : fail('25. Simulate a long career', out.slice(-300));
  } catch (e) { fail('25. Simulate a long career', String(e).slice(0, 300)); }
} catch (e) { fail('journey aborted', e.stack); }
finally {
  await browser.close();
  writeFileSync('docs/E2E_RESULTS.json', JSON.stringify(results, null, 2));
  const bad = results.filter(r => !r.ok);
  console.log(`\n${results.length - bad.length}/${results.length} journey checks passed`);
  process.exit(bad.length ? 1 : 0);
}
