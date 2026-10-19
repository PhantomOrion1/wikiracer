// Shared test helpers: a tiny fake Wikipedia (so tests are repeatable and don't depend on live
// articles or rate limits) and multiplayer utilities built on the real PeerJS signalling server.
const { expect } = require('@playwright/test');

// Fake link graph. Dog → Canidae → Wolf is the intended 2-click route; Dog does NOT link Pizza or Wolf.
const GRAPH = {
  Dog: ['Canidae', 'Cat', 'Bone'],
  Canidae: ['Wolf', 'Fox'],
  Cat: ['Mouse'],
  Wolf: ['Canidae'],
  Fox: [], Mouse: [], Bone: [],
  Pizza: ['Italy'], Italy: [],
};
const norm = (t) => { t = String(t || '').replace(/_/g, ' ').trim(); return t.charAt(0).toUpperCase() + t.slice(1); };

function articleHtml(title) {
  const links = GRAPH[title] || [];
  return `<div class="mw-parser-output"><p><b>${title}</b> is a test article. It links to ${
    links.map((l) => `<a href="/wiki/${encodeURIComponent(l.replace(/ /g, '_'))}" title="${l}">${l}</a>`).join(', ') || 'nothing'
  }.</p><p>More text so the page has some length.</p></div>`;
}

function wikiResponse(url) {
  const q = new URL(url).searchParams;
  const action = q.get('action');
  if (action === 'parse') {
    const t = norm(q.get('page'));
    if (!GRAPH[t]) return { error: { code: 'missingtitle', info: "The page you specified doesn't exist." } };
    return { parse: { title: t, displaytitle: `<span class="mw-page-title-main">${t}</span>`, text: articleHtml(t) } };
  }
  if (action === 'opensearch') return [q.get('search'), [], [], []];
  if (action === 'query') {
    const titles = (q.get('titles') || '').split('|').filter(Boolean).map(norm);
    if (q.get('generator') || q.get('list')) return { query: { pages: [] } };
    const pl = (q.get('pltitles') || '').split('|').filter(Boolean).map(norm);
    const pages = titles.map((t) => {
      if (!GRAPH[t]) return { title: t, missing: true };
      const page = { title: t, ns: 0, description: `Test article ${t}`, extract: `${t} is a test article.` };
      if ((q.get('prop') || '').includes('links')) {
        const links = (GRAPH[t] || []).filter((l) => !pl.length || pl.includes(norm(l)));
        if (links.length) page.links = links.map((l) => ({ ns: 0, title: l }));
      }
      return page;
    });
    return { batchcomplete: true, query: { pages } };
  }
  return { error: { code: 'unknown', info: 'not mocked' } };
}

async function mockWikipedia(page, { fail = false, delayMs = 0 } = {}) {
  await page.route('https://en.wikipedia.org/w/api.php**', async (route) => {
    if (fail) return route.abort('failed');
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(wikiResponse(route.request().url())) });
  });
  // Keep analytics and feedback emails out of test runs.
  await page.route('https://*.posthog.com/**', (r) => r.fulfill({ status: 200, body: '{}' }));
  await page.route('https://formsubmit.co/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"success":"true"}' }));
}

// Collects uncaught page errors so a test can assert the app never crashed.
function trackErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  return errors;
}

async function openHome(page, name) {
  await page.goto('/?debug');
  await page.waitForFunction(() => window.__wr);
  await page.evaluate(() => window.__wr.loadPeer());
  if (name) await page.fill('#name-input', name);
}

async function createPrivateRoom(page, name) {
  await openHome(page, name);
  await page.click('#create-room');
  await expect(page.locator('#room-code')).toHaveText(/^[A-Z0-9]{5}$/, { timeout: 20000 });
  await page.waitForFunction(() => window.__wr.net().peer && window.__wr.net().peer.open, null, { timeout: 20000 });
  return (await page.locator('#room-code').textContent()).trim();
}

async function joinPrivateRoom(page, name, code) {
  await openHome(page, name);
  await page.fill('#join-code', code);
  await page.click('#join-form button[type=submit]');
  await page.waitForFunction(() => window.__wr.net().joined, null, { timeout: 25000 });
}

async function hostStartCustom(page, start = 'Dog', end = 'Wolf') {
  await page.click('[data-diff=custom]');
  await page.fill('#room-start', start);
  await page.fill('#room-end', end);
  await page.click('#start-race');
  await page.waitForFunction(() => window.__wr.net().phase === 'playing', null, { timeout: 20000 });
}

// A raw PeerJS client running inside a page: lets a test act as a malicious player or host.
async function rawConnect(page, code) {
  await page.evaluate(async (roomId) => {
    window.__evil = { got: [], closed: false };
    const peer = new Peer({ debug: 0 });
    await new Promise((res, rej) => { peer.on('open', res); peer.on('error', rej); });
    const conn = peer.connect(roomId, { reliable: true });
    await new Promise((res, rej) => { conn.on('open', res); conn.on('error', rej); setTimeout(() => rej(new Error('connect timeout')), 20000); });
    conn.on('data', (d) => window.__evil.got.push(d));
    conn.on('close', () => { window.__evil.closed = true; });
    window.__evil.peer = peer;
    window.__evil.conn = conn;
  }, `wikirace-room-v1-${code}`);
}
const rawSend = (page, msgs) => page.evaluate((m) => { for (const x of m) window.__evil.conn.send(x); }, msgs);

module.exports = { GRAPH, mockWikipedia, trackErrors, openHome, createPrivateRoom, joinPrivateRoom, hostStartCustom, rawConnect, rawSend };
