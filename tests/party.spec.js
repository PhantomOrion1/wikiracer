// Party modes in private rooms: Speed Race, Fog of War, Wiki Bingo, Battle Royale.
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

test('Party button shows the 4 modes to everyone; only the host can pick', async ({ browser }) => {
  const [host, guest] = await room(browser, ['Host', 'Guest']);
  await host.click('[data-diff=party]');
  await expect(host.locator('#party-modes .party-mode')).toHaveCount(4);
  await expect(guest.locator('#party-panel')).toBeVisible();
  await expect(guest.locator('#party-modes .party-mode')).toHaveCount(4);
  await expect(guest.locator('[data-party=speed]')).toBeDisabled();
  await expect(guest.locator('#party-note')).toContainText('The host is picking a mode.');
  await host.click('[data-party=fog]');
  await expect(guest.locator('[data-party=fog]')).toHaveClass(/selected/);
  // Battle Royale needs 3 players
  await host.click('[data-party=royale]');
  await expect(host.locator('#start-race')).toBeDisabled();
  await expect(host.locator('#party-note')).toContainText('at least 3 players');
});

test('Speed Race: the fastest finish wins even with more clicks', async ({ browser }) => {
  const [host, guest] = await room(browser, ['Host', 'Speedy']);
  await host.evaluate(() => { window.__WR_TEST_PAIR = { start: 'Dog', end: 'Wolf' }; });
  await pickParty(host, 'speed');
  await host.click('#start-race');
  await expect(guest.locator('#article-title')).toHaveText('Dog', { timeout: 20000 });
  await expect(host.locator('#article-title')).toHaveText('Dog', { timeout: 20000 });
  // Guest: 4 clicks (detour + back) but first. Host: 2 clicks, later.
  // (Each page needs ~0.7s+ of reading or the finish is flagged as too fast.)
  await clickTo(guest, 'Cat'); await guest.waitForTimeout(900);
  await guest.click('#btn-back');
  await expect(guest.locator('#article-title')).toHaveText('Dog'); await guest.waitForTimeout(900);
  await clickTo(guest, 'Canidae'); await guest.waitForTimeout(900);
  await guest.click('#article a[title="Wolf"]');
  await host.waitForTimeout(2500);
  await clickTo(host, 'Canidae');
  await host.click('#article a[title="Wolf"]');
  await expect(host.locator('#results h2')).toContainText('Speedy wins!', { timeout: 20000 });
});

test('Fog of War: only the first paragraph of each article is shown', async ({ browser }) => {
  const [host] = await room(browser, ['Host', 'Guest']);
  const errors = trackErrors(host);
  await host.evaluate(() => { window.__WR_TEST_PAIR = { start: 'Dog', end: 'Wolf' }; });
  await pickParty(host, 'fog');
  await host.click('#start-race');
  await expect(host.locator('#article-title')).toHaveText('Dog', { timeout: 20000 });
  await expect(host.locator('#article a[title="Canidae"]')).toHaveCount(1); // first paragraph's links stay
  await expect(host.locator('#article')).toContainText('🌫');
  await expect(host.locator('#article .fog-note')).toBeVisible();
  await clickTo(host, 'Canidae');
  await expect(host.locator('#article')).toContainText('🌫');
  expect(errors).toEqual([]);
});

test('Wiki Bingo: same card for everyone, tap to pick a target, a full line wins', async ({ browser }) => {
  const [host, guest] = await room(browser, ['Host', 'Bingo']);
  await host.evaluate(() => { window.__WR_TEST_BINGO = { start: 'Dog', cards: ['Canidae', 'Wolf', 'Fox', 'Cat', 'Mouse', 'Bone', 'Pizza', 'Italy', 'Moon'] }; });
  await pickParty(host, 'bingo');
  await host.click('#start-race');
  await expect(guest.locator('#article-title')).toHaveText('Dog', { timeout: 20000 });
  await expect(guest.locator('#bingo-grid .bingo-cell')).toHaveCount(9);
  await expect(host.locator('#bingo-grid .bingo-cell')).toHaveCount(9);
  // Choosing a target shows it in the target card
  await guest.click('[data-bingo="4"]');
  await expect(guest.locator('#target-card')).toContainText('Mouse');
  await expect(guest.locator('#hud-target')).toContainText('Mouse');
  // Top row: Canidae, Wolf, Fox
  await clickTo(guest, 'Canidae');
  await expect(guest.locator('[data-bingo="0"]')).toHaveClass(/marked/);
  await guest.waitForTimeout(900);
  await clickTo(guest, 'Wolf'); await guest.waitForTimeout(900);
  await guest.click('#btn-back'); await guest.waitForTimeout(900);
  await expect(guest.locator('#article-title')).toHaveText('Canidae');
  await guest.click('#article a[title="Fox"]');
  await expect(guest.locator('#results')).toContainText('Bingo!', { timeout: 15000 });
  await host.click('#btn-giveup');
  await host.click('#confirm-ok');
  await expect(host.locator('#results h2')).toContainText('Bingo wins!', { timeout: 20000 });
  await expect(host.locator('#results')).toContainText('★ 3/9');
});

test('Battle Royale: last place is knocked out each round until one is left', async ({ browser }) => {
  test.setTimeout(120000);
  const [host, a, b] = await room(browser, ['Host', 'Alice', 'Bob']);
  await host.evaluate(() => { window.__WR_TEST_PAIR = { start: 'Dog', end: 'Wolf' }; });
  await pickParty(host, 'royale');
  await expect(host.locator('#start-race')).toBeEnabled();
  // Round 1: Bob gives up → Bob is out
  await host.click('#start-race');
  for (const p of [host, a, b]) await expect(p.locator('#article-title')).toHaveText('Dog', { timeout: 20000 });
  await clickTo(host, 'Canidae'); await host.click('#article a[title="Wolf"]');
  await clickTo(a, 'Canidae'); await a.click('#article a[title="Wolf"]');
  await b.click('#btn-giveup'); await b.click('#confirm-ok');
  await expect(host.locator('#results')).toContainText('Bob is knocked out · 2 left', { timeout: 20000 });
  // Round 2: only Host and Alice race; Bob watches
  await host.click('#results-actions >> text=Next round');
  await expect(host.locator('#royale-status')).toContainText('2 left');
  await expect(host.locator('#lobby-players')).toContainText('knocked out');
  await host.click('#start-race');
  await expect(a.locator('#article-title')).toHaveText('Dog', { timeout: 20000 });
  await expect(b.locator('#wait-text')).toContainText("knocked out", { timeout: 20000 });
  expect(await b.evaluate(() => !!window.__wr.game() && !window.__wr.game().finished)).toBe(false);
  await a.click('#btn-giveup'); await a.click('#confirm-ok');
  await clickTo(host, 'Canidae'); await host.click('#article a[title="Wolf"]');
  await expect(host.locator('#results h2')).toContainText('Host wins the Battle Royale!', { timeout: 20000 });
  await expect(a.locator('#results h2')).toContainText('Host wins the Battle Royale!', { timeout: 20000 });
});
