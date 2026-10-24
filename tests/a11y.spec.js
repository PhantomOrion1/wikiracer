// Accessibility: axe-core WCAG 2.1 A/AA checks on the home page, a live race and every static page.
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { mockWikipedia, openHome } = require('./helpers');

const scan = async (page) => {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} × ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
};

for (const scheme of ['light', 'dark']) {
  test.describe(`${scheme} mode`, () => {
    test.use({ colorScheme: scheme });
    // Dark is the site default; light is what the switch (top-left) picks and remembers.
    test.beforeEach(async ({ page }) => { await page.addInitScript((t) => { try { localStorage.setItem('wr-theme', t); } catch {} }, scheme); });
    test('home page has no WCAG A/AA violations', async ({ page }) => {
      await mockWikipedia(page);
      await openHome(page);
      await page.waitForTimeout(1200); // entrance animations
      expect(await scan(page)).toEqual([]);
    });
    test('race screen has no WCAG A/AA violations', async ({ page }) => {
      await mockWikipedia(page);
      await openHome(page, 'A11y');
      await page.click('#solo-custom-toggle');
      await page.fill('#solo-custom input[name=start]', 'Dog');
      await page.fill('#solo-custom input[name=end]', 'Wolf');
      await page.click('#solo-custom button[type=submit]');
      await expect(page.locator('#article-title')).toHaveText('Dog', { timeout: 20000 });
      expect(await scan(page)).toEqual([]);
    });
    for (const url of ['/how-to-play/', '/multiplayer/', '/faq/', '/wiki-race-ideas/', '/wikipedia-speedrun/', '/privacy/', '/404.html']) {
      test(`${url} has no WCAG A/AA violations`, async ({ page }) => {
        await page.goto(url);
        expect(await scan(page)).toEqual([]);
      });
    }
  });
}
