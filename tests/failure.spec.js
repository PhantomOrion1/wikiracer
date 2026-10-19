// Failure-mode tests: what players see when Wikipedia, PeerJS, PostHog or the network fail, when
// the host disappears mid-race, and with 8 players across two rooms at once.
const { test, expect } = require('@playwright/test');
const { mockWikipedia, trackErrors, openHome, createPrivateRoom, joinPrivateRoom, hostStartCustom } = require('./helpers');

test('Wikipedia down: solo shows a clear message, retries, and returns home without crashing', async ({ page }) => {
  const errors = trackErrors(page);
  await mockWikipedia(page, { fail: true });
  await openHome(page);
  await page.click('[data-solo=easy]');
  await expect(page.locator('#toast')).toContainText(/busy|failed|try again|Couldn't/i, { timeout: 30000 });
  await expect(page.locator('#home')).toHaveClass(/active/, { timeout: 60000 });
  expect(errors).toEqual([]);
});

test('Wikipedia slow (4s per request): the race still starts', async ({ page }) => {
  await mockWikipedia(page, { delayMs: 4000 });
  await openHome(page, 'Slowpoke');
  await page.click('#solo-custom-toggle');
  await page.fill('#solo-custom input[name=start]', 'Dog');
  await page.fill('#solo-custom input[name=end]', 'Wolf');
  await page.click('#solo-custom button[type=submit]');
  await expect(page.locator('#article-title')).toHaveText('Dog', { timeout: 45000 });
});

test('Network drops mid-race: a click shows a message, and play resumes when back online', async ({ page, context }) => {
  const errors = trackErrors(page);
  await mockWikipedia(page);
  await openHome(page, 'Offline');
  await page.click('#solo-custom-toggle');
  await page.fill('#solo-custom input[name=start]', 'Dog');
  await page.fill('#solo-custom input[name=end]', 'Wolf');
  await page.click('#solo-custom button[type=submit]');
  await expect(page.locator('#article-title')).toHaveText('Dog', { timeout: 20000 });
  await page.unroute('https://en.wikipedia.org/w/api.php**');
  await page.route('https://en.wikipedia.org/w/api.php**', (r) => r.abort('internetdisconnected'));
  await page.locator('#article a[data-wr="Canidae"]').click();
  await expect(page.locator('#toast')).toContainText(/connection/i, { timeout: 30000 });
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#article-title')).toHaveText('Dog');
  await page.unroute('https://en.wikipedia.org/w/api.php**');
  await mockWikipedia(page);
  await page.locator('#article a[data-wr="Canidae"]').click();
  await expect(page.locator('#article-title')).toHaveText('Canidae', { timeout: 20000 });
  expect(errors).toEqual([]);
});

test('PostHog blocked (ad blockers): the game is unaffected', async ({ page }) => {
  const errors = trackErrors(page);
  await mockWikipedia(page);
  await page.unroute('https://*.posthog.com/**');
  await page.route('https://*.posthog.com/**', (r) => r.abort('blockedbyclient'));
  await openHome(page, 'Blocker');
  await page.click('#solo-custom-toggle');
  await page.fill('#solo-custom input[name=start]', 'Dog');
  await page.fill('#solo-custom input[name=end]', 'Wolf');
  await page.click('#solo-custom button[type=submit]');
  await expect(page.locator('#article-title')).toHaveText('Dog', { timeout: 20000 });
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.waitForTimeout(1000);
  expect(errors).toEqual([]);
});

test('PeerJS unreachable: quick match fails gracefully back to home', async ({ page }) => {
  const errors = trackErrors(page);
  await mockWikipedia(page);
  await page.route('**/*peerjs.com/**', (r) => r.abort('failed'));
  await page.routeWebSocket(/peerjs\.com/, (ws) => ws.close());
  await openHome(page, 'NoNet');
  await page.click('#quick-match');
  await expect(page.locator('#toast')).toContainText(/failed|problem|busy|try again/i, { timeout: 60000 });
  await expect(page.locator('#home')).toHaveClass(/active/, { timeout: 60000 });
  expect(errors).toEqual([]);
});

test('Host closes their tab mid-race: a guest takes over and the race carries on', async ({ browser }) => {
  const ctxs = await Promise.all([0, 1, 2].map(() => browser.newContext()));
  const [host, g1, g2] = await Promise.all(ctxs.map((c) => c.newPage()));
  for (const p of [host, g1, g2]) await mockWikipedia(p);
  const g1Errors = trackErrors(g1);
  const code = await createPrivateRoom(host, 'Host');
  await joinPrivateRoom(g1, 'Guest1', code);
  await joinPrivateRoom(g2, 'Guest2', code);
  await host.waitForFunction(() => Object.keys(window.__wr.net().players).length === 3);
  await hostStartCustom(host, 'Dog', 'Wolf');
  await expect(g1.locator('#article-title')).toHaveText('Dog', { timeout: 20000 });
  const t0 = Date.now();
  await ctxs[0].close(); // host vanishes
  // Poll until exactly one guest has taken over and the other has reconnected to it.
  await expect.poll(async () => {
    const st = await Promise.all([g1, g2].map((p) => p.evaluate(() => ({ host: window.__wr.net().isHost, migrating: window.__wr.net().migrating }))));
    return st.filter((x) => x.host).length === 1 && st.every((x) => !x.migrating);
  }, { timeout: 60000, intervals: [500] }).toBe(true);
  console.log(`handover took ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  // the race continues for both
  for (const p of [g1, g2]) await expect(p.locator('#game')).toHaveClass(/active/);
  await g2.locator('#article a[data-wr="Canidae"]').click();
  await expect(g2.locator('#article-title')).toHaveText('Canidae', { timeout: 20000 });
  expect(g1Errors).toEqual([]);
  await ctxs[1].close(); await ctxs[2].close();
});

test('8 players across two rooms race at the same time', async ({ browser }) => {
  test.setTimeout(240000);
  const ctxs = await Promise.all(Array.from({ length: 8 }, () => browser.newContext()));
  const pages = await Promise.all(ctxs.map((c) => c.newPage()));
  for (const p of pages) await mockWikipedia(p);
  const errs = pages.map(trackErrors);
  const rooms = [pages.slice(0, 4), pages.slice(4, 8)];
  await Promise.all(rooms.map(async (room, r) => {
    const code = await createPrivateRoom(room[0], `Host${r}`);
    for (let i = 1; i < room.length; i++) await joinPrivateRoom(room[i], `P${r}${i}`, code);
    await room[0].waitForFunction(() => Object.keys(window.__wr.net().players).length === 4, null, { timeout: 30000 });
    await hostStartCustom(room[0], 'Dog', 'Wolf');
  }));
  for (const p of pages) await expect(p.locator('#article-title')).toHaveText('Dog', { timeout: 30000 });
  // everyone plays the 2-click route; the round should end with a winner for both rooms
  await Promise.all(pages.map(async (p) => {
    await p.waitForTimeout(2200);
    await p.locator('#article a[data-wr="Canidae"]').click();
    await expect(p.locator('#article-title')).toHaveText('Canidae', { timeout: 20000 });
    await p.locator('#article a[data-wr="Wolf"]').click();
  }));
  for (const p of pages) await expect(p.locator('#results-body h2')).toContainText(/wins/i, { timeout: 60000 });
  expect(errs.flat()).toEqual([]);
  await Promise.all(ctxs.map((c) => c.close()));
});

test('A guest whose browser crashes is dropped by the host (heartbeat)', async ({ browser }) => {
  const ctxs = await Promise.all([0, 1].map(() => browser.newContext()));
  const [host, g] = await Promise.all(ctxs.map((c) => c.newPage()));
  for (const p of [host, g]) await mockWikipedia(p);
  const code = await createPrivateRoom(host, 'Host');
  await joinPrivateRoom(g, 'Ghost', code);
  await host.waitForFunction(() => Object.keys(window.__wr.net().players).length === 2);
  await ctxs[1].close(); // no clean goodbye
  await host.waitForFunction(() => Object.keys(window.__wr.net().players).length === 1, null, { timeout: 25000 });
  await expect(host.locator('#lobby')).not.toContainText('Ghost');
  await ctxs[0].close();
});

test('PeerJS is not loaded up front, and loads on demand when someone joins a room', async ({ browser }) => {
  const ctxs = await Promise.all([0, 1].map(() => browser.newContext()));
  const [host, guest] = await Promise.all(ctxs.map((c) => c.newPage()));
  for (const p of [host, guest]) await mockWikipedia(p);
  const code = await createPrivateRoom(host, 'Host');
  await guest.goto('/?debug');
  await guest.waitForFunction(() => window.__wr);
  expect(await guest.evaluate(() => typeof window.Peer)).toBe('undefined'); // not on the critical path
  await guest.fill('#name-input', 'Lazy');
  await guest.fill('#join-code', code);
  await guest.click('#join-form button[type=submit]');
  await guest.waitForFunction(() => window.__wr.net().joined, null, { timeout: 25000 });
  await Promise.all(ctxs.map((c) => c.close()));
});

test('PeerJS file blocked: multiplayer says so and the rest of the game still works', async ({ page }) => {
  const errors = trackErrors(page);
  await mockWikipedia(page);
  await page.route('**/vendor/peerjs.min.js', (r) => r.abort('blockedbyclient'));
  await page.goto('/?debug');
  await page.waitForFunction(() => window.__wr);
  await page.fill('#name-input', 'Blocked');
  await page.click('#create-room');
  await expect(page.locator('#toast')).toContainText(/Multiplayer failed to load/i, { timeout: 15000 });
  expect(errors).toEqual([]);
});

test('Quick match opens more public rooms when every room is full', async ({ browser }) => {
  const ctxs = await Promise.all([0, 1].map(() => browser.newContext()));
  const [full, player] = await Promise.all(ctxs.map((c) => c.newPage()));
  for (const p of [full, player]) await mockWikipedia(p);
  // Search one room per page, so filling room 0 forces the search onto the next page.
  await player.route('**/config.json*', async (r) => {
    const res = await r.fetch(); const j = await res.json(); j.publicSlots = 1;
    r.fulfill({ response: res, json: j });
  });
  await openHome(full);
  await full.evaluate(async () => {
    const peer = new Peer('wikirace-room-v1-test-public-0', { debug: 0 });
    await new Promise((res, rej) => { peer.on('open', res); peer.on('error', rej); });
    peer.on('connection', (c) => c.on('data', (d) => { if (d && d.type === 'probe') c.send({ type: 'lobbyinfo', count: 8, phase: 'playing', accepting: false }); }));
    window.__fullRoom = peer;
  });
  await openHome(player, 'Overflow');
  await player.click('#quick-match');
  await player.waitForFunction(() => window.__wr.net().isHost && window.__wr.net().slot === 1, null, { timeout: 40000 });
  await Promise.all(ctxs.map((c) => c.close()));
});

test('Joining by code keeps trying until the host shows up (e.g. host switched apps)', async ({ browser }) => {
  const ctxs = await Promise.all([0, 1].map(() => browser.newContext()));
  const [host, friend] = await Promise.all(ctxs.map((c) => c.newPage()));
  for (const p of [host, friend]) await mockWikipedia(p);
  const code = 'Q' + Math.random().toString(36).slice(2, 6).toUpperCase().replace(/[^A-Z]/g, 'Z').padEnd(4, 'Z');
  await openHome(host, 'Host');
  await openHome(friend, 'Friend');
  await friend.fill('#join-code', code);
  await friend.click('#join-form button[type=submit]');
  await friend.waitForTimeout(6000); // the room doesn't exist yet
  expect(await friend.evaluate(() => window.__wr.net().joined)).toBeFalsy();
  await expect(friend.locator('#lobby')).toHaveClass(/active/); // still trying, not bounced home
  await expect(friend.locator('#lobby')).toContainText(/Waiting for room/);
  await host.evaluate((c) => window.__wr.hostRoom({ name: 'Host', code: c }), code);
  await friend.waitForFunction(() => window.__wr.net().joined, null, { timeout: 30000 });
  await host.waitForFunction(() => Object.keys(window.__wr.net().players).length === 2);
  await Promise.all(ctxs.map((c) => c.close()));
});

test('Votes: a tie between real players can go Hard, and bots never outvote a person', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await mockWikipedia(page);
  await openHome(page);
  const results = await page.evaluate(() => {
    const net = window.__wr.net();
    net.isHost = true;
    net.players = { host: { connected: true, vote: 'hard' }, friend: { connected: true, vote: 'easy' }, b1: { connected: true, vote: 'easy' }, b2: { connected: true, vote: 'easy' } };
    net.bots = new Map([['b1', {}], ['b2', {}]]);
    const tie = {}; for (let i = 0; i < 400; i++) { const v = window.__wr.tallyVotes(); tie[v] = (tie[v] || 0) + 1; }
    net.players.friend.vote = null;
    const solo = new Set(); for (let i = 0; i < 50; i++) solo.add(window.__wr.tallyVotes());
    return { tie, solo: [...solo] };
  });
  expect(results.tie.hard).toBeGreaterThan(140); // ~50%, was ~18%
  expect(results.tie.medium || 0).toBe(0);
  expect(results.solo).toEqual(['hard']); // two bots voting easy can't outvote one person voting hard
  await ctx.close();
});
