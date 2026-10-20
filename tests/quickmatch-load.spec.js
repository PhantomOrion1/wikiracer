// Load: 12 people press Quick match at the same moment; everyone must end up in a room.
const { test, expect } = require('@playwright/test');
const { mockWikipedia, openHome } = require('./helpers');
test('12 simultaneous quick matches', async ({ browser }) => {
  test.setTimeout(5 * 60 * 1000);
  const N = 12;
  const ctxs = await Promise.all(Array.from({ length: N }, () => browser.newContext()));
  const pages = await Promise.all(ctxs.map((c) => c.newPage()));
  for (const p of pages) await mockWikipedia(p);
  await Promise.all(pages.map((p, i) => openHome(p, `QM${i}`)));
  await Promise.all(pages.map((p) => p.click('#quick-match')));
  await pages[0].waitForTimeout(25000);
  const st = await Promise.all(pages.map((p) => p.evaluate(() => { const n = window.__wr.net(); return { slot: n.slot, in: !!(n.joined || (n.isHost && n.peer && n.peer.open)), home: document.getElementById('home').classList.contains('active'), toast: document.getElementById('toast').textContent }; })));
  const rooms = {}; st.forEach((s) => { rooms[s.slot] = (rooms[s.slot] || 0) + 1; });
  expect(st.filter((s) => s.home).map((s) => s.toast)).toEqual([]);
  expect(st.filter((s) => s.in).length).toBe(N);
  expect(Math.max(...Object.values(rooms))).toBeLessThanOrEqual(8);
  await Promise.all(ctxs.map((c) => c.close()));
});
