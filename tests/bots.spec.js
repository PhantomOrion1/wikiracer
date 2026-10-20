const { test, expect } = require('@playwright/test');
const { mockWikipedia, openHome } = require('./helpers');
test('1 human + 2 bots: one bot readies, race does not start early', async ({ page }) => {
  test.setTimeout(60000);
  await mockWikipedia(page);
  await openHome(page, 'Solo');
  await page.click('#quick-match');
  await page.waitForFunction(() => window.__wr.net().isHost && window.__wr.net().phase === 'lobby', null, { timeout: 30000 });
  await page.evaluate(() => { const n = window.__wr.net(); while ([...n.bots.keys()].filter((id) => n.players[id]).length < 2) window.__wr.addBot(); });
  const r = await page.evaluate(() => { const n = window.__wr.net(); return [...n.bots.keys()].filter((id) => n.players[id]).length; });
  test.skip(r !== 2, 'bot count not 2');
  await page.waitForFunction(() => { const n = window.__wr.net(); return [...n.bots.keys()].filter((id) => n.players[id]?.ready).length === 1; }, null, { timeout: 10000 });
  await page.waitForTimeout(3000);
  const st = await page.evaluate(() => { const n = window.__wr.net(); return { phase: n.phase, ready: [...n.bots.keys()].filter((id) => n.players[id]?.ready).length, readyGo: n.readyGo }; });
  console.log('STATE', JSON.stringify(st));
  expect(st).toEqual({ phase: 'lobby', ready: 1, readyGo: false });
});
