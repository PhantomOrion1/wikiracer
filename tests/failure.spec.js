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

test('Private room: the difficulty you pick is what you get, and new rooms remember it', async ({ browser }) => {
  const ctxs = await Promise.all([0, 1].map(() => browser.newContext()));
  const [host, friend] = await Promise.all(ctxs.map((c) => c.newPage()));
  for (const p of [host, friend]) await mockWikipedia(p);
  let code = await createPrivateRoom(host, 'Host');
  await host.click('[data-diff=hard]');
  // leave and make a new room: it should still be on Hard, and the buttons should say so
  await host.click('#leave-lobby');
  await host.click('#create-room');
  await host.waitForFunction((old) => window.__wr.net().peer && window.__wr.net().peer.open && window.__wr.net().code !== old, code, { timeout: 20000 });
  code = await host.evaluate(() => window.__wr.net().code);
  await expect(host.locator('#room-code')).toHaveText(code);
  expect(await host.evaluate(() => [window.__wr.net().diff, document.querySelector('#room-diff .selected').dataset.diff])).toEqual(['hard', 'hard']);
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
  await host.click('[data-diff=choose]');
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
  await expect(host.locator('#start-race')).toHaveText('Play this race');
  await host.click('#start-race');
  await friend.waitForFunction(() => window.__wr.net().round, null, { timeout: 20000 });
  expect(await friend.evaluate(() => { const r = window.__wr.net().round; return { start: r.start, end: r.end, difficulty: r.difficulty }; }))
    .toEqual({ start: pick.start, end: pick.end, difficulty: 'choose' });
  await Promise.all(ctxs.map((c) => c.close()));
});

test('Profile pictures: ghost by default, picker changes it, other players see it, bots get one', async ({ browser }) => {
  const ctxs = await Promise.all([0, 1].map(() => browser.newContext()));
  const [host, friend] = await Promise.all(ctxs.map((c) => c.newPage()));
  for (const p of [host, friend]) await mockWikipedia(p);
  await openHome(friend, 'Friend');
  await expect(friend.locator('#pfp-btn img')).toHaveAttribute('src', 'pfp/ghost.webp');
  await expect(friend.locator('#pfp-pop')).toBeHidden();
  await friend.click('#pfp-btn');
  await expect(friend.locator('#pfp-pop .pfp-opt')).toHaveCount(9);
  await friend.click('#pfp-pop [data-pfp=werewolf]');
  await expect(friend.locator('#pfp-pop')).toBeHidden();
  await expect(friend.locator('#pfp-btn img')).toHaveAttribute('src', 'pfp/werewolf.webp');
  const code = await createPrivateRoom(host, 'Host');
  await friend.fill('#join-code', code);
  await friend.click('#join-form button[type=submit]');
  await friend.waitForFunction(() => window.__wr.net().joined, null, { timeout: 25000 });
  await expect(host.locator('#lobby-players img[src="pfp/werewolf.webp"]')).toHaveCount(1);
  await expect(host.locator('#lobby-players img[src="pfp/ghost.webp"]')).toHaveCount(1); // host kept the default
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
