const { test, expect } = require('@playwright/test');
const { mockWikipedia, trackErrors } = require('./helpers');

test('Challenge link: shows the friend\'s clicks while racing (not their pages), then both routes', async ({ page }) => {
  const errors = trackErrors(page);
  await mockWikipedia(page);
  const run = JSON.stringify([['Cat', 2], ['Dog', 4, 1], ['Canidae', 6], ['Wolf', 8]]);
  const q = new URLSearchParams({ s: 'Dog', e: 'Wolf', c: '4', d: 'medium', by: 'Juju', r: run, tm: '8', pf: 'zombie' });
  await page.goto('/?' + q);
  await expect(page.locator('#challenge-banner')).toContainText('Juju challenged you');
  await expect(page.locator('#challenge-banner')).toContainText('4 clicks in 0:08');
  await page.fill('#name-input', 'Friend');
  await page.click('#banner-play');
  await expect(page.locator('#article-title')).toHaveText('Dog', { timeout: 20000 });
  await expect(page.locator('#racers')).toContainText('Juju');
  await expect(page.locator('#racers')).toContainText(/racing · \d clicks?/);
  await expect(page.locator('#racers')).not.toContainText('Cat');
  await expect(page.locator('#racers')).toContainText('finished · 4 clicks · 0:08', { timeout: 15000 });
  // Beat them: 2 clicks.
  await page.click('#article a[title="Canidae"]');
  await expect(page.locator('#article-title')).toHaveText('Canidae');
  await page.click('#article a[title="Wolf"]');
  await expect(page.locator('#results')).toContainText('You beat Juju', { timeout: 15000 });
  await expect(page.locator('#results')).toContainText("Juju's route");
  await expect(page.locator('#results')).toContainText('Cat');
  expect(errors).toEqual([]);
});

test('Challenge a friend link carries the route and time', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await mockWikipedia(page);
  await page.addInitScript(() => { Object.defineProperty(Navigator.prototype, 'share', { value: undefined, configurable: true }); });
  await page.goto('/?s=Dog&e=Wolf&by=Someone&c=9');
  await page.fill('#name-input', 'Juju');
  await page.click('#banner-play');
  await expect(page.locator('#article-title')).toHaveText('Dog', { timeout: 20000 });
  await page.click('#article a[title="Canidae"]');
  await expect(page.locator('#article-title')).toHaveText('Canidae');
  await page.click('#article a[title="Wolf"]');
  await page.getByRole('button', { name: 'Challenge a friend' }).click();
  await expect(page.locator('#toast')).toContainText('Copied');
  const text = await page.evaluate(() => navigator.clipboard.readText());
  const u = new URL(text.split('\n').pop());
  expect(u.searchParams.get('by')).toBe('Juju');
  expect(JSON.parse(u.searchParams.get('r')).map((x) => x[0])).toEqual(['Canidae', 'Wolf']);
  expect(Number(u.searchParams.get('tm'))).toBeGreaterThanOrEqual(0);
});

test('Plain race link (race ideas, route pages) is not shown as a challenge', async ({ page }) => {
  await mockWikipedia(page);
  await page.goto('/?s=Dog&e=Wolf&d=medium');
  await expect(page.locator('#challenge-banner')).toContainText('Ready to race?');
  await expect(page.locator('#challenge-banner')).not.toContainText('challenged you');
  await expect(page.locator('#banner-play')).toHaveText('Start race');
});
