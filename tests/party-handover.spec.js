// Party modes when the host leaves (heavy: 3–4 browsers each, so they run after the main suite).
const { test, expect } = require('@playwright/test');
const { mockWikipedia, trackErrors, createPrivateRoom, joinPrivateRoom } = require('./helpers');

async function room(browser, names) {
  const ctxs = await Promise.all(names.map(() => browser.newContext()));
  const pages = await Promise.all(ctxs.map((c) => c.newPage()));
  for (const p of pages) await mockWikipedia(p);
  const code = await createPrivateRoom(pages[0], names[0]);
  for (let i = 1; i < pages.length; i++) await joinPrivateRoom(pages[i], names[i], code);
  await pages[0].waitForFunction((n) => Object.keys(window.__wr.net().players).length === n, names.length);
  return pages;
}
async function pickParty(host, mode) {
  await host.click('[data-diff=party]');
  await host.click(`[data-party=${mode}]`);
}
const clickTo = async (p, title) => { await p.click(`#article a[title="${title}"]`); await expect(p.locator('#article-title')).toHaveText(title); };

// Host leaving: whoever takes over keeps the party mode (and a Battle Royale's knockouts).
async function waitNewHost(pages) {
  await expect.poll(async () => {
    const st = await Promise.all(pages.map((p) => p.evaluate(() => ({ host: window.__wr.net().isHost, migrating: window.__wr.net().migrating }))));
    return st.filter((s) => s.host).length === 1 && st.every((s) => !s.migrating);
  }, { timeout: 60000, intervals: [500] }).toBe(true);
  for (const p of pages) if (await p.evaluate(() => window.__wr.net().isHost)) return p;
}

test('Wiki Bingo survives the host leaving mid-race, and the next round is still Bingo', async ({ browser }) => {
  test.setTimeout(120000);
  const pages = await room(browser, ['Host', 'Ann', 'Ben']);
  const [host, a, b] = pages;
  await host.evaluate(() => { window.__WR_TEST_BINGO = { start: 'Dog', cards: ['Canidae', 'Wolf', 'Fox', 'Cat', 'Mouse', 'Bone', 'Pizza', 'Italy', 'Moon'] }; });
  await pickParty(host, 'bingo');
  await host.click('#start-race');
  await expect(a.locator('#bingo-grid .bingo-cell')).toHaveCount(9, { timeout: 20000 });
  await host.context().close(); // host vanishes
  const nh = await waitNewHost([a, b]);
  await clickTo(a, 'Canidae'); await a.waitForTimeout(900);
  await clickTo(a, 'Wolf'); await a.waitForTimeout(900);
  await a.click('#btn-back'); await a.waitForTimeout(900);
  await a.click('#article a[title="Fox"]');
  await b.click('#btn-giveup'); await b.click('#confirm-ok');
  await expect(nh.locator('#results h2')).toContainText('Ann wins!', { timeout: 30000 });
  await nh.click('#results-actions >> text=Next round');
  await expect(nh.locator('[data-party=bingo]')).toHaveClass(/selected/);
});

test('Battle Royale survives the host leaving: knocked-out players stay out', async ({ browser }) => {
  test.setTimeout(150000);
  const pages = await room(browser, ['Host', 'Ann', 'Ben', 'Cal']);
  const [host, a, b, c] = pages;
  await host.evaluate(() => { window.__WR_TEST_PAIR = { start: 'Dog', end: 'Wolf' }; });
  await pickParty(host, 'royale');
  await host.click('#start-race');
  for (const p of pages) await expect(p.locator('#article-title')).toHaveText('Dog', { timeout: 20000 });
  for (const p of [host, a, b]) { await clickTo(p, 'Canidae'); await p.click('#article a[title="Wolf"]'); }
  await c.click('#btn-giveup'); await c.click('#confirm-ok');
  await expect(a.locator('#results')).toContainText('Cal is knocked out · 3 left', { timeout: 20000 });
  await host.click('#results-actions >> text=Next round');
  await expect(a.locator('#lobby-players')).toContainText('knocked out', { timeout: 20000 });
  await host.context().close(); // host vanishes in the lobby
  const nh = await waitNewHost([a, b, c]);
  expect(nh).not.toBe(c);
  await expect(nh.locator('[data-party=royale]')).toHaveClass(/selected/, { timeout: 20000 });
  await nh.evaluate(() => { window.__WR_TEST_PAIR = { start: 'Dog', end: 'Wolf' }; });
  // (Starting before everyone has reconnected shows "Waiting for players to reconnect…" instead of resetting.)
  await nh.waitForFunction(() => Object.values(window.__wr.net().players).every((p) => p.connected), null, { timeout: 30000 });
  await nh.click('#start-race');
  const other = nh === a ? b : a;
  await expect(other.locator('#article-title')).toHaveText('Dog', { timeout: 20000 });
  await expect(c.locator('#wait-text')).toContainText('knocked out', { timeout: 20000 });
});
