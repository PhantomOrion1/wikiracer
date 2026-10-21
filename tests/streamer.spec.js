const { test, expect } = require('@playwright/test');
const { mockWikipedia, createPrivateRoom, joinPrivateRoom } = require('./helpers');

test('Streamer mode: room code can be hidden, invite still copies the real link, setting is remembered', async ({ browser }) => {
  const ctx = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  const host = await ctx.newPage();
  await mockWikipedia(host);
  const code = await createPrivateRoom(host, 'Streamer');
  await expect(host.locator('#hide-code')).toHaveAttribute('aria-label', 'Hide room code');
  await host.click('#hide-code');
  await expect(host.locator('#room-code')).toHaveText('•••••');
  await expect(host.locator('#hide-code')).toHaveAttribute('aria-label', 'Show room code');
  await expect(host.locator('#invite-link')).not.toHaveValue(new RegExp(code));
  expect(await host.content()).not.toContain(code);
  await host.click('#copy-invite');
  expect(await host.evaluate(() => navigator.clipboard.readText())).toContain(`?room=${code}`);

  // A friend can still join with the real code, and the host's screen stays hidden.
  const g = await (await browser.newContext()).newPage();
  await mockWikipedia(g);
  await joinPrivateRoom(g, 'Friend', code);
  await expect(host.locator('#lobby-players')).toContainText('Friend', { timeout: 20000 });
  await expect(host.locator('#room-code')).toHaveText('•••••');

  // Remembered next time.
  await host.reload();
  const code2 = await host.evaluate(async () => { document.querySelector('#name-input').value = 'Streamer'; document.querySelector('#create-room').click(); await new Promise((r) => setTimeout(r, 4000)); return window.__wr.net().code; });
  await expect(host.locator('#room-code')).toHaveText('•••••');
  await host.click('#hide-code');
  await expect(host.locator('#room-code')).toHaveText(code2);
});
