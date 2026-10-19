// Cross-browser smoke test (Chrome, desktop Safari engine, iPhone-sized Safari engine): the home
// page renders, a solo race runs, Lane Rush draws, and nothing throws.
const { test, expect } = require('@playwright/test');
const { mockWikipedia, trackErrors, openHome } = require('./helpers');

test('home, solo race and Lane Rush work without errors', async ({ page }) => {
  const errors = trackErrors(page);
  await mockWikipedia(page);
  await openHome(page, 'Smoke');
  await expect(page.locator('.headline')).toBeVisible();
  await expect(page.locator('#quick-match')).toBeVisible();
  // solo race on the fake graph, finish it, see results
  await page.click('#solo-custom-toggle');
  await page.fill('#solo-custom input[name=start]', 'Dog');
  await page.fill('#solo-custom input[name=end]', 'Wolf');
  await page.click('#solo-custom button[type=submit]');
  await expect(page.locator('#article-title')).toHaveText('Dog', { timeout: 20000 });
  await page.locator('#article a[data-wr="Canidae"]').click();
  await expect(page.locator('#article-title')).toHaveText('Canidae');
  await page.locator('#article a[data-wr="Wolf"]').click();
  await expect(page.locator('#results-body')).toContainText(/made it/i, { timeout: 15000 });
  // Lane Rush draws real pixels
  await page.click('#results-actions .btn.ghost');
  await page.evaluate(() => window.MiniGame.open());
  // Poll: slower CI machines can take a moment to draw the first frame.
  await expect.poll(() => page.evaluate(() => {
    const c = document.getElementById('flappy-canvas');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let i = 0; i < d.length; i += 4000) if (d[i] || d[i + 1] || d[i + 2]) n++;
    return n;
  }), { timeout: 5000 }).toBeGreaterThan(10);
  expect(errors).toEqual([]);
});
