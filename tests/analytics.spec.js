const { test, expect } = require('@playwright/test');
const { mockWikipedia } = require('./helpers');

// The two ids are picked so one falls inside the 25% sample and one outside (same hash as app.js).
async function raceAndCollect(page, id) {
  const events = [];
  await mockWikipedia(page);
  await page.unroute('https://*.posthog.com/**');
  await page.route('https://*.posthog.com/**', (r) => { const d = r.request().postDataJSON(); if (d && d.batch) events.push(...d.batch); r.fulfill({ status: 200, body: '{}' }); });
  await page.addInitScript((aid) => { try { localStorage.setItem('wr-aid', JSON.stringify(aid)); } catch {} }, id);
  await page.goto('/?s=Dog&e=Wolf&d=medium');
  await page.fill('#name-input', 'Tester');
  await page.click('#banner-play');
  await expect(page.locator('#article-title')).toHaveText('Dog', { timeout: 20000 });
  await page.click('#article a[title="Canidae"]');
  await page.click('#article a[title="Wolf"]');
  await expect(page.locator('#results')).not.toHaveClass(/hidden/);
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.waitForTimeout(5000); // analytics flush after 4s
  return events;
}

test('Analytics: noisy events are sampled per visitor, key events always sent', async ({ browser }) => {
  test.setTimeout(60000);
  const ids = ['test-visitor-70', 'test-visitor-0']; // [inside the 25% sample, outside it]
  const outside = await raceAndCollect(await (await browser.newContext({ timezoneId: 'Australia/Sydney' })).newPage(), ids[1]);
  const names = outside.map((e) => e.event);
  expect(names).toContain('app_open');
  expect(names).toContain('race_end');
  expect(names).not.toContain('race_start');
  const inside = await raceAndCollect(await (await browser.newContext({ timezoneId: 'Australia/Sydney' })).newPage(), ids[0]);
  const start = inside.find((e) => e.event === 'race_start');
  expect(start).toBeTruthy();
  expect(start.properties.sample_rate).toBe(4);
  expect(inside.find((e) => e.event === 'race_end').properties.sample_rate).toBeUndefined();
});
