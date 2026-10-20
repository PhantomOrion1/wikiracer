// Security tests: hostile Wikipedia HTML, abusive names, a malicious player, and a malicious host.
const { test, expect } = require('@playwright/test');
const { mockWikipedia, trackErrors, openHome, createPrivateRoom, joinPrivateRoom, hostStartCustom, rawConnect, rawSend } = require('./helpers');

const XSS_PAYLOADS = [
  '<script>window.__xss=1</script>',
  '<img src=x onerror="window.__xss=2">',
  '<svg onload="window.__xss=3"><a xlink:href="javascript:window.__xss=4"><text>x</text></a></svg>',
  '<a href="javascript:window.__xss=5">click</a>',
  '<a href="JaVaScRiPt:window.__xss=6">click</a>',
  '<iframe src="https://example.com" srcdoc="<script>parent.__xss=7</script>"></iframe>',
  '<object data="javascript:window.__xss=8"></object><embed src="javascript:window.__xss=9">',
  '<meta http-equiv="refresh" content="0;url=https://example.com">',
  '<base href="https://evil.example/">',
  '<form action="https://evil.example"><input name=q><button>go</button></form>',
  '<details open ontoggle="window.__xss=10">x</details>',
  '<math><mtext><mglyph><style><img src=x onerror="window.__xss=11"></style></mglyph></mtext></math>',
  '<img srcset="javascript:window.__xss=12 1x" src="data:image/svg+xml,<svg onload=window.__xss=13>">',
  '<div style="background:url(javascript:window.__xss=14)">styled</div>',
  '<video poster="javascript:window.__xss=15"></video>',
  '<a href="https://evil.example/phish">external</a>',
  '<noscript><p title="</noscript><img src=x onerror=window.__xss=16>"></noscript>',
  '<template><img src=x onerror="window.__xss=17"></template>',
];

test.describe('Wikipedia HTML sanitiser', () => {
  test('strips every executable vector and never runs injected code', async ({ page }) => {
    const errors = trackErrors(page);
    await mockWikipedia(page);
    await openHome(page);
    const report = await page.evaluate((payloads) => {
      const host = document.createElement('div');
      document.body.append(host);
      const problems = [];
      for (const p of payloads) {
        const built = window.__wr.buildArticle({ title: 'T', displaytitle: 'T', html: `<div class="mw-parser-output">${p}</div>` });
        host.replaceChildren(...built.nodes);
        for (const el of host.querySelectorAll('*')) {
          if (/^(script|iframe|frame|object|embed|form|input|button|base|meta|link|noscript|template)$/i.test(el.tagName)) problems.push(`${p} -> <${el.tagName}>`);
          for (const a of el.attributes) {
            if (/^on/i.test(a.name) || a.name === 'srcdoc') problems.push(`${p} -> ${a.name}`);
            if (/^\s*(javascript|vbscript|data):/i.test(a.value) && /href|src|poster|srcset|background/i.test(a.name)) problems.push(`${p} -> ${a.name}=${a.value}`);
          }
          if (el.tagName === 'A' && /evil\.example/.test(el.getAttribute('href') || '')) problems.push(`${p} -> live external link`);
        }
      }
      return problems;
    }, XSS_PAYLOADS);
    await page.waitForTimeout(800);
    expect(report).toEqual([]);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
    expect(errors).toEqual([]);
  });

  test('CSP blocks inline handlers even if something slipped through', async ({ browser }) => {
    const ctx = await browser.newContext({ bypassCSP: false });
    const page = await ctx.newPage();
    await mockWikipedia(page);
    await page.goto('/?debug');
    await page.waitForTimeout(1500);
    await page.evaluate(() => { document.body.insertAdjacentHTML('beforeend', '<img src="x" onerror="window.__csp=1">'); });
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => window.__csp)).toBeUndefined();
    await ctx.close();
  });

  test('refuses to run inside a third-party frame (clickjacking)', async ({ page }) => {
    // Two made-up origins served through Playwright (Chrome blocks real sites framing localhost):
    // game.test serves the real files from disk, evil.test frames it.
    const path = require('path'); const fs = require('fs');
    const root = path.join(__dirname, '..');
    await page.route('http://game.test/**', (r) => {
      const u = new URL(r.request().url()); const f = path.join(root, u.pathname === '/' ? 'index.html' : u.pathname);
      if (!f.startsWith(root) || !fs.existsSync(f)) return r.fulfill({ status: 404, body: '' });
      const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' }[path.extname(f)] || 'application/octet-stream';
      r.fulfill({ contentType: type, body: fs.readFileSync(f) });
    });
    await page.route('http://evil.test/', (r) => r.fulfill({ contentType: 'text/html',
      body: '<h1>win a prize</h1><iframe src="http://game.test/?debug" style="width:800px;height:600px"></iframe>' }));
    await mockWikipedia(page);
    await page.goto('http://evil.test/');
    await page.waitForTimeout(4000);
    if (page.url().startsWith('http://game.test')) return; // broke out of the frame: fine
    const frame = page.frames().find((f) => f.url().startsWith('http://game.test'));
    expect(frame, JSON.stringify(page.frames().map((f) => f.url()))).toBeTruthy();
    // The game UI must not exist inside the frame.
    expect(await frame.evaluate(() => !!document.querySelector('#home, #quick-match'))).toBe(false);
  });
});

test.describe('Player names', () => {
  test('abusive, spoofing and HTML names are neutralised', async ({ page }) => {
    await mockWikipedia(page);
    await openHome(page);
    const out = await page.evaluate(() => [
      'fuck', 'n1gg3r', 'sh1t head', 'b!tch', 'Grace', '‮evil‬', '<img src=x onerror=1>', 'x'.repeat(200), '', null,
    ].map((n) => window.__wr.cleanName(n)));
    expect(out.slice(0, 4)).toEqual(['Player', 'Player', 'Player', 'Player']);
    expect(out[4]).toBe('Grace');
    expect(out[5]).toBe('evil');
    expect(out[6]).toBe('<img src=x onerror=1'); // 20-char cap; kept as plain text and escaped when rendered (malicious host test)
    expect(out[7].length).toBe(20);
    expect(out[8]).toBe('Player');
    expect(out[9]).toBe('Player');
  });
});

test.describe('Malicious player (talks to a real host)', () => {
  test('forged finishes, floods, oversized and malformed messages are rejected', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const evilCtx = await browser.newContext();
    const host = await hostCtx.newPage();
    const evil = await evilCtx.newPage();
    const hostErrors = trackErrors(host);
    await mockWikipedia(host);
    await mockWikipedia(evil);
    const code = await createPrivateRoom(host, 'Host');
    await openHome(evil);
    await rawConnect(evil, code);

    // malformed / prototype-pollution / abusive name / oversized name
    await rawSend(evil, ['just a string', 42, null, [], { type: {} }, { type: 'hello', name: { a: 1 } },
      JSON.parse('{"type":"hello","name":"x","__proto__":{"polluted":true}}')]);
    await rawSend(evil, [{ type: 'hello', name: 'y'.repeat(100000) }]);
    await host.waitForTimeout(1500);
    expect(await host.evaluate(() => ({}).polluted)).toBeUndefined();
    await rawSend(evil, [{ type: 'hello', name: 'n1gg3r' }]);
    await host.waitForFunction(() => Object.keys(window.__wr.net().players).length === 2);
    const evilId = await evil.evaluate(() => window.__evil.peer.id);
    expect(await host.evaluate((id) => window.__wr.net().players[id].name, evilId)).toBe('Player');

    // forged finish 1: instant finish with a technically valid route → flagged as too fast
    await hostStartCustom(host, 'Dog', 'Canidae');
    await host.waitForTimeout(3600); // countdown
    await rawSend(evil, [{ type: 'finish', path: [{ t: 'Dog' }, { t: 'Canidae', via: 'Canidae' }], penalties: 0 }]);
    await host.waitForFunction((id) => window.__wr.net().players[id].status === 'finished', evilId);
    const p1 = await host.evaluate((id) => window.__wr.net().players[id], evilId);
    expect(p1.verify).toBe('failed');
    expect(p1.flagReason).toMatch(/faster/i);

    // forged progress values are clamped
    expect(p1.clicks).toBeLessThanOrEqual(999);

    // flood: hundreds of messages a second get dropped and the sender is cut off
    await rawSend(evil, Array.from({ length: 400 }, () => ({ type: 'progress', clicks: 1, title: 'Dog' })));
    await evil.waitForFunction(() => window.__evil.closed, null, { timeout: 20000 });
    expect(hostErrors).toEqual([]);
    await hostCtx.close(); await evilCtx.close();
  });

  test('a finish whose route uses a link that does not exist is flagged', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const evilCtx = await browser.newContext();
    const host = await hostCtx.newPage();
    const evil = await evilCtx.newPage();
    await mockWikipedia(host);
    await mockWikipedia(evil);
    const code = await createPrivateRoom(host, 'Host');
    await openHome(evil);
    await rawConnect(evil, code);
    await rawSend(evil, [{ type: 'hello', name: 'cheater' }]);
    await host.waitForFunction(() => Object.keys(window.__wr.net().players).length === 2);
    const evilId = await evil.evaluate(() => window.__evil.peer.id);
    await hostStartCustom(host, 'Dog', 'Wolf');
    await host.waitForTimeout(3600 + 2500); // countdown, then long enough not to be "too fast"
    // Dog does not link to Pizza; Pizza does not link to Wolf.
    await rawSend(evil, [{ type: 'finish', path: [{ t: 'Dog' }, { t: 'Pizza', via: 'Pizza' }, { t: 'Wolf', via: 'Wolf' }] }]);
    await host.waitForFunction((id) => ['ok', 'failed'].includes(window.__wr.net().players[id].verify), evilId, { timeout: 20000 });
    const p = await host.evaluate((id) => window.__wr.net().players[id], evilId);
    expect(p.verify).toBe('failed');
    expect(p.flagReason).toMatch(/no link/i);
    await hostCtx.close(); await evilCtx.close();
  });
});

test.describe('Malicious host (a real guest joins it)', () => {
  test('hostile room state cannot inject HTML, CSS or crash the guest', async ({ browser }) => {
    const evilCtx = await browser.newContext();
    const guestCtx = await browser.newContext();
    const evil = await evilCtx.newPage();
    const guest = await guestCtx.newPage();
    const guestErrors = trackErrors(guest);
    await mockWikipedia(evil);
    await mockWikipedia(guest);
    await openHome(evil);
    const code = 'Q' + Math.random().toString(36).slice(2, 6).toUpperCase().replace(/[^A-Z]/g, 'Z').padEnd(4, 'Z');
    await evil.evaluate(async (roomId) => {
      const peer = new Peer(roomId, { debug: 0, ...(window.__WR_TEST_PEER || {}) });
      await new Promise((res, rej) => { peer.on('open', res); peer.on('error', rej); });
      peer.on('connection', (conn) => {
        conn.on('open', () => {
          const nasty = {
            [`x${'a'.repeat(10)}`]: { name: '<img src=x onerror="window.__xss=1">', color: 'red;background:url(https://evil.example/t.png)', status: 'playing', title: '<svg onload="window.__xss=2">', clicks: 1e12, inRound: true },
            'bad id with spaces': { name: 'ghost' },
            host: { name: 'Evil Host', color: '#ff0000', status: 'lobby', path: Array.from({ length: 5000 }, (_, i) => ({ t: `<b>${i}</b>` })) },
          };
          conn.send({ type: 'state', players: nasty, phase: 'lobby', round: null });
          conn.send({ type: 'error', message: '<img src=x onerror="window.__xss=3">' });
        });
      });
      window.__evilHost = peer;
    }, `wikirace-room-v1-${code}`);
    await guest.goto('/?debug');
    await guest.waitForFunction(() => window.__wr);
    await guest.fill('#name-input', 'Victim');
    await guest.fill('#join-code', code);
    await guest.click('#join-form button[type=submit]');
    await guest.waitForTimeout(6000);
    expect(await guest.evaluate(() => window.__xss)).toBeUndefined();
    expect(await guest.locator('img[onerror], svg[onload]').count()).toBe(0);
    const styles = await guest.evaluate(() => [...document.querySelectorAll('[style*="--c"]')].map((e) => e.getAttribute('style')));
    for (const st of styles) expect(st).not.toMatch(/url\(|background/);
    const players = await guest.evaluate(() => window.__wr.net().players);
    expect(players['bad id with spaces']).toBeUndefined();
    for (const p of Object.values(players)) {
      expect(p.clicks).toBeLessThanOrEqual(999);
      expect(p.path.length).toBeLessThanOrEqual(250);
    }
    expect(guestErrors).toEqual([]);
    await evilCtx.close(); await guestCtx.close();
  });
});
