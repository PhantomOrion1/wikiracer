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
  await page.routeWebSocket(/peerjs\.com|localhost:9010|127\.0\.0\.1:8787|workers\.dev/, (ws) => ws.close());
  await page.route(/localhost:9010|127\.0\.0\.1:8787/, (r) => r.abort('failed'));
  await openHome(page, 'NoNet');
  await page.click('#quick-match');
  await expect(page.locator('#toast')).toContainText(/matchmaking|try again|connection/i, { timeout: 60000 });
  await expect(page.locator('#toast')).not.toContainText(/socket|network\b/);
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
  test.setTimeout(90000);
  const ctxs = await Promise.all([0, 1].map(() => browser.newContext()));
  const [host, g] = await Promise.all(ctxs.map((c) => c.newPage()));
  for (const p of [host, g]) await mockWikipedia(p);
  const code = await createPrivateRoom(host, 'Host');
  await joinPrivateRoom(g, 'Ghost', code);
  await host.waitForFunction(() => Object.keys(window.__wr.net().players).length === 2);
  await ctxs[1].close(); // no clean goodbye
  // Marked as reconnecting first (a short grace period), then removed.
  await host.waitForFunction(() => Object.values(window.__wr.net().players).some((p) => p.awaiting), null, { timeout: 25000 });
  await host.waitForFunction(() => Object.keys(window.__wr.net().players).length === 1, null, { timeout: 40000 });
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
    const peer = new Peer('wikirace-room-v1-test-public-0', { debug: 0, ...(window.__WR_TEST_PEER || {}) });
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

test('Double-clicking a solo start only starts one game', async ({ page }) => {
  await mockWikipedia(page);
  await openHome(page, 'Clicky');
  await page.click('#solo-custom-toggle');
  await page.fill('#solo-custom input[name=start]', 'Dog');
  await page.fill('#solo-custom input[name=end]', 'Wolf');
  await page.locator('#solo-custom button[type=submit]').dblclick();
  await page.locator('#solo-custom button[type=submit]').click({ force: true }).catch(() => {});
  await expect(page.locator('#article-title')).toHaveText('Dog', { timeout: 20000 });
  await page.waitForTimeout(5000); // give any second launch time to show up
  expect(await page.evaluate(() => window.__wr.gamesStarted())).toBe(1);
});

test('Private room: the difficulty you pick is what you get, and new rooms start on Medium', async ({ browser }) => {
  const ctxs = await Promise.all([0, 1].map(() => browser.newContext()));
  const [host, friend] = await Promise.all(ctxs.map((c) => c.newPage()));
  for (const p of [host, friend]) await mockWikipedia(p);
  let code = await createPrivateRoom(host, 'Host');
  await host.click('[data-diff=hard]');
  // leave and make a new room: it starts on Medium again, and the buttons say so
  await host.click('#leave-lobby');
  await host.click('#create-room');
  await host.waitForFunction((old) => window.__wr.net().peer && window.__wr.net().peer.open && window.__wr.net().code !== old, code, { timeout: 20000 });
  code = await host.evaluate(() => window.__wr.net().code);
  await expect(host.locator('#room-code')).toHaveText(code);
  expect(await host.evaluate(() => [window.__wr.net().diff, document.querySelector('#room-diff .selected').dataset.diff])).toEqual(['medium', 'medium']);
  await host.click('[data-diff=hard]');
  await joinPrivateRoom(friend, 'Friend', code);
  await host.click('#start-race');
  await host.waitForFunction(() => window.__wr.net().phase === 'playing', null, { timeout: 30000 });
  expect(await friend.evaluate(() => window.__wr.net().round.difficulty)).toBe('hard');
  await Promise.all(ctxs.map((c) => c.close()));
});

test('Leaving the tab hides the article (no click penalty), and it comes back on return', async ({ page }) => {
  await mockWikipedia(page);
  await openHome(page, 'Away');
  await page.click('#solo-custom-toggle');
  await page.fill('#solo-custom input[name=start]', 'Dog');
  await page.fill('#solo-custom input[name=end]', 'Wolf');
  await page.click('#solo-custom button[type=submit]');
  await expect(page.locator('#article-title')).toHaveText('Dog', { timeout: 20000 });
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(page.locator('#article')).toBeHidden();
    await expect(page.locator('.away-cover')).toContainText('Come back to keep racing');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.locator('#article')).toBeVisible();
  }
  expect(await page.evaluate(() => window.__wr.game().penalties)).toBe(0);
});

test('Contents list jumps to sections without costing a click', async ({ page }) => {
  await mockWikipedia(page);
  // give the fake article some sections (registered last, so it runs first and falls back to the mock)
  await page.route('https://en.wikipedia.org/w/api.php**', (route) => {
    const q = new URL(route.request().url()).searchParams;
    if (q.get('action') === 'parse' && /dog/i.test(q.get('page'))) {
      const html = '<div class="mw-parser-output"><p>Dog links to <a href="/wiki/Canidae" title="Canidae">Canidae</a>.</p>'
        + ['History', 'Breeds', 'Senses'].map((h) => `<div class="mw-heading mw-heading2"><h2 id="${h}">${h}</h2></div>${'<p>Text.</p>'.repeat(40)}`).join('') + '</div>';
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ parse: { title: 'Dog', displaytitle: 'Dog', text: html } }) });
    }
    return route.fallback();
  });
  await openHome(page, 'Reader');
  await page.click('#solo-custom-toggle');
  await page.fill('#solo-custom input[name=start]', 'Dog');
  await page.fill('#solo-custom input[name=end]', 'Wolf');
  await page.click('#solo-custom button[type=submit]');
  await expect(page.locator('#article-title')).toHaveText('Dog', { timeout: 20000 });
  await expect(page.locator('#toc-list button')).toHaveText(['History', 'Breeds', 'Senses']);
  await page.locator('#toc-list button', { hasText: 'Senses' }).click();
  await expect.poll(() => page.evaluate(() => Math.abs(document.getElementById('Senses').getBoundingClientRect().top) < 200), { timeout: 5000 }).toBe(true);
  expect(await page.evaluate(() => window.__wr.game().clicks)).toBe(0);
});

test('Feedback is emailed (with a PostHog backup copy)', async ({ page }) => {
  await mockWikipedia(page);
  let mail = null, backup = null;
  await page.route('https://formsubmit.co/**', (r) => { mail = { url: r.request().url(), body: r.request().postDataJSON() }; r.fulfill({ status: 200, contentType: 'application/json', body: '{"success":"true"}' }); });
  await page.route('https://*.posthog.com/**', (r) => { if (r.request().url().includes('/capture/')) backup = r.request().postDataJSON(); r.fulfill({ status: 200, body: '{}' }); });
  await openHome(page);
  await page.click('#feedback-open');
  await page.click('.fb-kinds label:has(input[value=idea])');
  await page.fill('#feedback-text', 'Add a team mode');
  await page.click('#feedback-form button[type=submit]');
  await expect(page.locator('#toast')).toContainText('Thanks');
  expect(mail.url).toBe('https://formsubmit.co/ajax/jursolife@gmail.com');
  expect(mail.body).toMatchObject({ type: 'Idea', message: 'Add a team mode', _subject: 'WikiRacer Idea' });
  expect(backup.properties).toMatchObject({ kind: 'idea', message: 'Add a team mode' });
  await expect(page.locator('#feedback')).toBeHidden();
});

test('Browser back during a race asks first, then returns home inside the game', async ({ page }) => {
  await mockWikipedia(page);
  await page.goto('/privacy/'); // a page visited before the game
  await openHome(page, 'Backer');
  await page.click('#solo-custom-toggle');
  await page.fill('#solo-custom input[name=start]', 'Dog');
  await page.fill('#solo-custom input[name=end]', 'Wolf');
  await page.click('#solo-custom button[type=submit]');
  await expect(page.locator('#article-title')).toHaveText('Dog', { timeout: 20000 });
  await page.goBack();
  await expect(page.locator('#confirm')).toBeVisible();
  await page.click('#confirm-cancel'); // keep racing
  await expect(page.locator('#game')).toHaveClass(/active/);
  await page.goBack();
  await page.click('#confirm-ok');
  await expect(page.locator('#home')).toHaveClass(/active/);
  expect(new URL(page.url()).pathname).toBe('/'); // still on the game, not the privacy page
});

test('Random pair uses familiar topics', async ({ page }) => {
  await mockWikipedia(page);
  await openHome(page);
  const res = await page.evaluate(async () => {
    const fam = new Set(window.POOL.familiar.map(([t]) => t));
    const out = [];
    for (let i = 0; i < 20; i++) { const p = await window.__wr.pickPair('random'); out.push(fam.has(p.start) && fam.has(p.end) && p.start !== p.end); }
    return out.every(Boolean);
  });
  expect(res).toBe(true);
});

test('Choose: everyone sees three pairs, only the host can pick, and the race uses the pick', async ({ browser }) => {
  const ctxs = await Promise.all([0, 1].map(() => browser.newContext()));
  const [host, friend] = await Promise.all(ctxs.map((c) => c.newPage()));
  for (const p of [host, friend]) await mockWikipedia(p);
  const code = await createPrivateRoom(host, 'Host');
  await joinPrivateRoom(friend, 'Friend', code);
  await host.click('[data-diff=custom]'); // Choose and Custom are one tab
  await expect(host.locator('#choose-list .choice')).toHaveCount(3);
  await expect(friend.locator('#choose-list .choice')).toHaveCount(3);
  await expect(friend.locator('#choose-list .choice').first()).toBeDisabled();
  await expect(friend.locator('#choose-shuffle')).toBeHidden();
  const before = await host.locator('#choose-list').innerText();
  await host.click('#choose-shuffle');
  await expect.poll(() => host.locator('#choose-list').innerText()).not.toBe(before);
  await host.locator('#choose-list .choice').nth(1).click();
  await expect(friend.locator('#choose-list .choice').nth(1)).toHaveClass(/selected/);
  const pick = await host.evaluate(() => window.__wr.net().choices[1]);
  // Picking a suggestion doesn't touch the "Or choose your own" boxes...
  await expect(host.locator('#room-start')).toHaveValue('');
  await expect(host.locator('#room-custom')).not.toHaveClass(/selected/);
  // ...typing switches to your own pair (and deselects the suggestion)...
  await host.fill('#room-start', 'Dog');
  await expect(host.locator('#room-custom')).toHaveClass(/selected/);
  await expect(friend.locator('#choose-list .choice.selected')).toHaveCount(0);
  // ...and clicking a suggestion again makes that the race.
  await host.locator('#choose-list .choice').nth(1).click();
  await expect(host.locator('#room-custom')).not.toHaveClass(/selected/);
  await host.click('#start-race');
  await friend.waitForFunction(() => window.__wr.net().round, null, { timeout: 20000 });
  expect(await friend.evaluate(() => { const r = window.__wr.net().round; return { start: r.start, end: r.end, difficulty: r.difficulty }; }))
    .toEqual({ start: pick.start, end: pick.end, difficulty: 'custom' });
  await Promise.all(ctxs.map((c) => c.close()));
});

test('Profile pictures: ghost by default, picker changes it, other players see it, bots get one', async ({ browser }) => {
  const ctxs = await Promise.all([0, 1].map(() => browser.newContext()));
  const [host, friend] = await Promise.all(ctxs.map((c) => c.newPage()));
  for (const p of [host, friend]) await mockWikipedia(p);
  await openHome(friend, 'Friend');
  await expect(friend.locator('#pfp-btn img')).toHaveAttribute('src', '/pfp/ghost.webp');
  await expect(friend.locator('#pfp-pop')).toBeHidden();
  await friend.click('#pfp-btn');
  await expect(friend.locator('#pfp-pop .pfp-opt')).toHaveCount(9);
  await friend.click('#pfp-pop [data-pfp=werewolf]');
  await expect(friend.locator('#pfp-pop')).toBeHidden();
  await expect(friend.locator('#pfp-btn img')).toHaveAttribute('src', '/pfp/werewolf.webp');
  const code = await createPrivateRoom(host, 'Host');
  await friend.fill('#join-code', code);
  await friend.click('#join-form button[type=submit]');
  await friend.waitForFunction(() => window.__wr.net().joined, null, { timeout: 25000 });
  await expect(host.locator('#lobby-players img[src="/pfp/werewolf.webp"]')).toHaveCount(1);
  await expect(host.locator('#lobby-players img[src="/pfp/ghost.webp"]')).toHaveCount(1); // host kept the default
  // a hostile pfp value is ignored
  expect(await host.evaluate(() => window.__wr.sanitizePlayers({ a: { name: 'x', pfp: '../../evil' } }).a.pfp)).toBe('ghost');
  await Promise.all(ctxs.map((c) => c.close()));
});

test('Lane Rush on the results screen expands inline and carries on into the lobby', async ({ browser }) => {
  const ctxs = await Promise.all([0, 1].map(() => browser.newContext()));
  const [host, friend] = await Promise.all(ctxs.map((c) => c.newPage()));
  for (const p of [host, friend]) await mockWikipedia(p);
  const code = await createPrivateRoom(host, 'Host');
  await joinPrivateRoom(friend, 'Friend', code);
  await hostStartCustom(host, 'Dog', 'Wolf');
  await expect(host.locator('#article-title')).toHaveText('Dog', { timeout: 20000 });
  await host.waitForTimeout(2500);
  await host.locator('#article a[data-wr="Canidae"]').click();
  await expect(host.locator('#article-title')).toHaveText('Canidae', { timeout: 20000 });
  await host.locator('#article a[data-wr="Wolf"]').click();
  const btn = host.locator('#results-actions button', { hasText: 'Lane Rush' });
  await expect(btn).toBeVisible({ timeout: 20000 });
  await btn.click();
  await expect(host.locator('#results-flappy #flappy-canvas')).toBeVisible();
  await expect(host.locator('#flappy')).toBeHidden(); // no pop-up
  await expect(host.locator('#results-actions button', { hasText: 'Hide Lane Rush' })).toBeVisible();
  // friend gives up so the round ends; host goes back to the lobby: the run moves with them
  await friend.click('#btn-giveup');
  if (await friend.locator('#confirm').isVisible()) await friend.click('#confirm-ok');
  await host.locator('#results-actions button', { hasText: /Next round|End round/ }).click();
  await expect(host.locator('#lobby')).toHaveClass(/active/);
  await expect(host.locator('#lobby-flappy #flappy-canvas')).toBeVisible();
  expect(await host.evaluate(() => window.MiniGame.isOpen())).toBe(true);
  await Promise.all(ctxs.map((c) => c.close()));
});

test('Relay (TURN) credentials from config are fetched and used for connections', async ({ page }) => {
  await mockWikipedia(page);
  await page.route('**/config.json*', async (r) => {
    const res = await r.fetch(); const j = await res.json();
    j.turn = { meteredApp: 'wikiracertest', apiKey: 'test-key' };
    r.fulfill({ response: res, json: j });
  });
  let asked = null;
  await page.route('https://wikiracertest.metered.live/**', (r) => { asked = r.request().url(); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ urls: 'turns:relay.example:443?transport=tcp', username: 'u', credential: 'c' }]) }); });
  await openHome(page);
  await page.evaluate(() => window.__wr.loadIceServers());
  await expect.poll(() => page.evaluate(() => JSON.stringify(window.__wr.iceServers()))).toContain('turns:relay.example:443');
  expect(asked).toContain('apiKey=test-key');
});

test('Opening the site inside an app (e.g. Teams) suggests a real browser', async ({ browser }) => {
  const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 Teams/24000.0 Electron/27' });
  const page = await ctx.newPage();
  await mockWikipedia(page);
  await openHome(page);
  await expect(page.locator('#inapp-note')).toBeVisible();
  await ctx.close();
  const normal = await (await browser.newContext()).newPage();
  await mockWikipedia(normal);
  await openHome(normal);
  await expect(normal.locator('#inapp-note')).toBeHidden();
});

test('Work-network case: players connect through the relay using only TLS on port 443', async ({ browser }) => {
  test.setTimeout(90000);
  const ctxs = await Promise.all([0, 1].map(() => browser.newContext()));
  const [host, friend] = await Promise.all(ctxs.map((c) => c.newPage()));
  for (const p of [host, friend]) {
    await mockWikipedia(p);
    // keep only the TLS-on-443 relay, like a firewall that only allows HTTPS
    await p.route('**/config.json*', async (r) => {
      const res = await r.fetch(); const j = await res.json();
      j.turn = { iceServers: (j.turn.iceServers || []).filter((s) => String(s.urls).startsWith('turns:')) };
      r.fulfill({ response: res, json: j });
    });
  }
  await host.goto('/?debug&relay');
  await host.waitForFunction(() => window.__wr);
  await host.evaluate(() => window.__wr.loadIceServers());
  await host.waitForFunction(() => JSON.stringify(window.__wr.iceServers()).includes('turns:'));
  await host.evaluate(() => window.__wr.loadPeer());
  await host.fill('#name-input', 'Host');
  await host.click('#create-room');
  await expect(host.locator('#room-code')).toHaveText(/^[A-Z0-9]{5}$/, { timeout: 20000 });
  const code = (await host.locator('#room-code').textContent()).trim();
  await friend.goto('/?debug&relay');
  await friend.waitForFunction(() => window.__wr);
  await friend.evaluate(() => window.__wr.loadIceServers());
  await friend.waitForFunction(() => JSON.stringify(window.__wr.iceServers()).includes('turns:'));
  await friend.fill('#name-input', 'Friend');
  await friend.fill('#join-code', code);
  await friend.click('#join-form button[type=submit]');
  await friend.waitForFunction(() => window.__wr.net().joined, null, { timeout: 60000 });
  await host.waitForFunction(() => Object.keys(window.__wr.net().players).length === 2, null, { timeout: 20000 });
  // and the connection really is relayed
  const type = await friend.evaluate(async () => {
    const pc = window.__wr.net().hostConn.peerConnection;
    const stats = await pc.getStats(); let pair = null;
    stats.forEach((s) => { if (s.type === 'transport' && s.selectedCandidatePairId) pair = stats.get(s.selectedCandidatePairId); });
    if (!pair) stats.forEach((s) => { if (s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded') pair = s; });
    return pair ? stats.get(pair.localCandidateId).candidateType : 'unknown';
  });
  expect(type).toBe('relay');
  await Promise.all(ctxs.map((c) => c.close()));
});

test('Cloudflare relay on its own: players connect through it (relay-only)', async ({ browser }) => {
  test.setTimeout(90000);
  const ctxs = await Promise.all([0, 1].map(() => browser.newContext()));
  const [host, friend] = await Promise.all(ctxs.map((c) => c.newPage()));
  for (const p of [host, friend]) {
    await mockWikipedia(p);
    await p.route('**/config.json*', async (r) => {
      const res = await r.fetch(); const j = await res.json();
      j.turn = { credentialsUrl: j.turn.credentialsUrl }; // Cloudflare only, no Metered backup
      r.fulfill({ response: res, json: j });
    });
  }
  for (const p of [host, friend]) {
    await p.goto('/?debug&relay');
    await p.waitForFunction(() => window.__wr);
    await p.evaluate(() => window.__wr.loadIceServers());
    await p.waitForFunction(() => JSON.stringify(window.__wr.iceServers()).includes('turn.cloudflare.com'), null, { timeout: 15000 });
  }
  await host.evaluate(() => window.__wr.loadPeer());
  await host.fill('#name-input', 'Host'); await host.click('#create-room');
  await expect(host.locator('#room-code')).toHaveText(/^[A-Z0-9]{5}$/, { timeout: 20000 });
  const code = (await host.locator('#room-code').textContent()).trim();
  await friend.fill('#name-input', 'Friend'); await friend.fill('#join-code', code); await friend.click('#join-form button[type=submit]');
  await friend.waitForFunction(() => window.__wr.net().joined, null, { timeout: 60000 });
  await Promise.all(ctxs.map((c) => c.close()));
});


test('Quick match skips a public room whose host never answers', async ({ browser }) => {
  const ctxs = await Promise.all([0, 1].map(() => browser.newContext()));
  const [ghost, player] = await Promise.all(ctxs.map((c) => c.newPage()));
  for (const p of [ghost, player]) await mockWikipedia(p);
  await openHome(ghost);
  // Holds public slot 0 but never replies to probes (like a frozen phone tab).
  await ghost.evaluate(async () => {
    const peer = new Peer('wikirace-room-v1-test-public-0', { debug: 0, ...(window.__WR_TEST_PEER || {}) });
    await new Promise((res, rej) => { peer.on('open', res); peer.on('error', rej); });
    window.__silent = peer;
  });
  await openHome(player, 'Skipper');
  await player.click('#quick-match');
  await player.waitForFunction(() => window.__wr.net().isHost && window.__wr.net().slot >= 1, null, { timeout: 40000 });
  await Promise.all(ctxs.map((c) => c.close()));
});

test('Multiplayer hardening: no answer route in state, fake "host" refused, kick ends the round, short drop keeps your spot', async ({ browser }) => {
  test.setTimeout(120000);
  const ctxs = await Promise.all([0, 1, 2].map(() => browser.newContext()));
  const [host, friend, evil] = await Promise.all(ctxs.map((c) => c.newPage()));
  for (const p of [host, friend, evil]) await mockWikipedia(p);
  const code = await createPrivateRoom(host, 'Host');
  await joinPrivateRoom(friend, 'Friend', code);
  // someone connecting with the peer ID "host" is refused
  await openHome(evil);
  const refused = await evil.evaluate(async (roomId) => {
    const peer = new Peer('host', { debug: 0, ...(window.__WR_TEST_PEER || {}) });
    await new Promise((res) => { peer.on('open', res); peer.on('error', res); });
    if (!peer.open) return 'id-taken';
    const conn = peer.connect(roomId, { reliable: true });
    return new Promise((res) => { conn.on('close', () => res('closed')); setTimeout(() => res(conn.open ? 'still-open' : 'never-opened'), 6000); });
  }, `wikirace-room-v1-${code}`);
  expect(['closed', 'never-opened', 'id-taken']).toContain(refused);
  expect(await host.evaluate(() => window.__wr.net().players.host.name)).toBe('Host');
  // the planned route never reaches guests
  await hostStartCustom(host, 'Dog', 'Wolf');
  await friend.waitForFunction(() => window.__wr.net().round, null, { timeout: 20000 });
  expect(await friend.evaluate(() => 'route' in window.__wr.net().round)).toBe(false);
  // kicking the only other racer ends the round once the host finishes
  await expect(host.locator('#article-title')).toHaveText('Dog', { timeout: 20000 });
  await host.waitForTimeout(2500);
  await host.locator('#article a[data-wr="Canidae"]').click();
  await expect(host.locator('#article-title')).toHaveText('Canidae');
  await host.locator('#article a[data-wr="Wolf"]').click();
  const friendId = await friend.evaluate(() => window.__wr.net().myId);
  await host.evaluate((id) => document.querySelector(`[data-kick="${id}"]`) ? document.querySelector(`[data-kick="${id}"]`).click() : null, friendId);
  await host.evaluate((id) => { if (window.__wr.net().players[id]) window.__wr.kick(id); }, friendId);
  await host.waitForFunction(() => window.__wr.net().phase === 'results', null, { timeout: 15000 });
  await Promise.all(ctxs.map((c) => c.close()));
});

test('A player who drops in the lobby keeps their spot for a moment', async ({ browser }) => {
  const ctxs = await Promise.all([0, 1].map(() => browser.newContext()));
  const [host, friend] = await Promise.all(ctxs.map((c) => c.newPage()));
  for (const p of [host, friend]) await mockWikipedia(p);
  const code = await createPrivateRoom(host, 'Host');
  await joinPrivateRoom(friend, 'Friend', code);
  const id = await friend.evaluate(() => window.__wr.net().myId);
  await friend.evaluate(() => window.__wr.net().hostConn.close());
  await host.waitForFunction((pid) => window.__wr.net().players[pid] && window.__wr.net().players[pid].awaiting, id, { timeout: 15000 });
  expect(await host.evaluate((pid) => !!window.__wr.net().players[pid], id)).toBe(true); // not deleted straight away
  await Promise.all(ctxs.map((c) => c.close()));
});

test('Leaving during "Picking articles…" never starts a ghost race', async ({ browser }) => {
  const ctx = await browser.newContext();
  const host = await ctx.newPage();
  await mockWikipedia(host, { delayMs: 2500 });
  await createPrivateRoom(host, 'Host');
  await host.click('[data-diff=custom]');
  await host.fill('#room-start', 'Dog'); await host.fill('#room-end', 'Wolf');
  await host.click('#start-race');
  await host.click('#leave-lobby');
  await host.waitForTimeout(6000);
  expect(await host.evaluate(() => ({ phase: window.__wr.net().phase, game: !!window.__wr.game(), home: document.getElementById('home').classList.contains('active') })))
    .toEqual({ phase: 'lobby', game: false, home: true });
  await ctx.close();
});

test('An idle home visit makes no Wikipedia or relay calls; hovering Solo pre-picks', async ({ page }) => {
  let wiki = 0, relay = 0;
  page.on('request', (r) => { if (r.url().includes('wikipedia.org/w/api.php')) wiki++; if (r.url().includes('workers.dev') || r.url().includes('metered.live')) relay++; });
  await mockWikipedia(page);
  await page.goto('/?debug');
  await page.waitForTimeout(6000);
  expect({ wiki, relay }).toEqual({ wiki: 0, relay: 0 });
  await page.hover('#solo-card');
  await expect.poll(() => wiki, { timeout: 10000 }).toBeGreaterThan(0);
});

test('Relay logins still load when multiplayer is touched before config.json arrives', async ({ page }) => {
  await mockWikipedia(page);
  await page.route('**/config.json*', async (r) => {
    const res = await r.fetch(); const j = await res.json();
    j.turn = { meteredApp: 'wikiracertest', apiKey: 'test-key' };
    await new Promise((ok) => setTimeout(ok, 2500)); // slow network: config arrives late
    r.fulfill({ response: res, json: j });
  });
  await page.route('https://wikiracertest.metered.live/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ urls: 'turns:relay.example:443?transport=tcp', username: 'u', credential: 'c' }]) }));
  await page.goto('/?debug=1');
  await page.waitForFunction(() => window.__wr);
  await page.evaluate(() => { window.__wr.loadIceServers(); }); // before config has loaded
  await expect.poll(() => page.evaluate(() => JSON.stringify(window.__wr.iceServers())), { timeout: 10000 }).toContain('turns:relay.example:443');
});

test('Joining a code that does not exist shows a search, not a room', async ({ page }) => {
  await mockWikipedia(page);
  await openHome(page, 'Tester');
  await page.fill('#join-code', 'QZ7KX');
  await page.click('#join-form button[type=submit]');
  await expect(page.locator('#room-label')).toHaveText('Looking for room');
  await expect(page.locator('#room-code')).toHaveClass(/pending/);
  await expect(page.locator('#invite')).toBeHidden();
  await expect(page.locator('#lobby-players')).toContainText('Looking for this room');
});

test('Solo "Pick your own" only makes the Solo card taller', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockWikipedia(page);
  await page.goto('/');
  const heights = () => page.$$eval('.actions > .blk', (b) => b.map((x) => Math.round(x.getBoundingClientRect().height)));
  const before = await heights();
  await page.click('#solo-custom-toggle');
  const open = await heights();
  expect(open.slice(0, 3)).toEqual(before.slice(0, 3));
  expect(open[3]).toBeGreaterThan(before[3]);
  await page.click('#solo-custom-toggle');
  expect(await heights()).toEqual(before);
});
