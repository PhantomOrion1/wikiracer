const { test, expect } = require('@playwright/test');
const { mockWikipedia, trackErrors, createPrivateRoom, joinPrivateRoom, hostStartCustom } = require('./helpers');

const HOME = {
  es: { lang: 'es', quick: 'Partida rápida', daily: /Reto diario #\d+/, sub: 'un enlace a la vez.' },
  pt: { lang: 'pt-BR', quick: 'Partida rápida', daily: /Desafio diário #\d+/, sub: 'um link de cada vez.' },
  de: { lang: 'de', quick: 'Schnelles Spiel', daily: /Tagesrennen #\d+/, sub: 'ein Link nach dem anderen.' },
  fr: { lang: 'fr', quick: 'Partie rapide', daily: /Défi du jour #\d+/, sub: 'un lien à la fois.' },
};

for (const [code, h] of Object.entries(HOME)) {
  test(`/${code}/ home page is in ${code}, with its own article pool and SEO tags`, async ({ page }) => {
    const errors = trackErrors(page);
    await mockWikipedia(page);
    await page.goto(`/${code}/`);
    await expect(page.locator('html')).toHaveAttribute('lang', h.lang);
    await expect(page.locator('#quick-match')).toContainText(h.quick);
    await expect(page.locator('#daily-card')).toContainText(h.daily);
    await expect(page.locator('.hero-sub')).toContainText(h.sub);
    await expect(page.locator('.headline.brand')).toContainText('Racer'); // the brand isn't translated
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', `https://wikiracer.live/${code}/`);
    expect(await page.locator('link[rel=alternate][hreflang]').count()).toBe(6);
    await expect(page.locator(`.lang-switch a[href="/${code}/"]`)).toHaveAttribute('aria-current', 'page');
    expect(await page.evaluate(() => window.POOL.familiar.length)).toBeGreaterThan(500);
    expect(errors).toEqual([]);
  });
}

test('Spanish race: articles come from es.wikipedia.org and the whole flow is in Spanish', async ({ page }) => {
  const errors = trackErrors(page);
  await mockWikipedia(page);
  const hosts = new Set();
  page.on('request', (r) => { if (r.url().includes('wikipedia.org/w/api.php')) hosts.add(new URL(r.url()).host); });
  await page.goto('/es/?s=Dog&e=Wolf&d=medium');
  await expect(page.locator('#challenge-banner')).toContainText('¿Listo para correr?');
  await page.fill('#name-input', 'Juju');
  await page.click('#banner-play');
  await expect(page.locator('#article-title')).toHaveText('Dog', { timeout: 20000 });
  await expect(page.locator('#stat-time small')).toHaveText('restante');
  await expect(page.locator('#btn-giveup')).toHaveText('Rendirse');
  await page.click('#article a[title="Canidae"]');
  await page.click('#article a[title="Wolf"]');
  await expect(page.locator('#results')).toContainText('¡Lo lograste!', { timeout: 15000 });
  await expect(page.locator('#results')).toContainText('Tu ruta');
  expect([...hosts]).toEqual(['es.wikipedia.org']);
  expect(errors).toEqual([]);
});

test('Mixed-language room: an English guest races on the German host\'s Wikipedia', async ({ browser }) => {
  test.setTimeout(90000);
  const [hc, gc] = await Promise.all([browser.newContext(), browser.newContext()]);
  const [host, guest] = await Promise.all([hc.newPage(), gc.newPage()]);
  for (const p of [host, guest]) await mockWikipedia(p);
  const guestHosts = new Set();
  guest.on('request', (r) => { if (r.url().includes('wikipedia.org/w/api.php')) guestHosts.add(new URL(r.url()).host); });
  const code = await createPrivateRoom(host, 'Gastgeber', '/de/');
  await joinPrivateRoom(guest, 'Guest', code);
  await host.waitForFunction(() => Object.keys(window.__wr.net().players).length === 2);
  await hostStartCustom(host, 'Dog', 'Wolf');
  await expect(guest.locator('#article-title')).toHaveText('Dog', { timeout: 20000 });
  await expect(guest.locator('#btn-giveup')).toHaveText('Give up'); // guest's own language for the interface
  expect([...guestHosts]).toContain('de.wikipedia.org');
  guestHosts.clear();
  await guest.click('#article a[title="Canidae"]');
  await expect(guest.locator('#article-title')).toHaveText('Canidae');
  expect([...guestHosts]).toEqual(['de.wikipedia.org']);
});

test('Each language has its own daily: finishing the English one does not mark the French one done', async ({ page }) => {
  await mockWikipedia(page);
  await page.goto('/');
  await page.evaluate(() => {
    const d = new Date();
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    localStorage.setItem(`wr-daily:${key}`, JSON.stringify({ n: 1, start: 'Dog', end: 'Wolf', result: 'finished', clicks: 2, penalties: 0, score: 2, time: 30000, path: [] }));
  });
  await page.reload();
  await expect(page.locator('#daily-card')).toContainText('See results');
  await page.goto('/fr/');
  await expect(page.locator('#daily-card')).toContainText('Jouer');
  await expect(page.locator('#daily-card')).not.toContainText('Voir les résultats');
});
