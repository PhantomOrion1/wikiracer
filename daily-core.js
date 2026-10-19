// Daily challenge core, shared by the game (browser) and tools/build-pages.js (Node), so the
// daily archive pages always show exactly the pair the game served that day.
(function (root) {
  const DAILY_EPOCH = Date.UTC(2026, 9, 17); // first day of the pair schedule
  // Shown numbers start higher than the internal day index, so 19 Oct 2026 displays as #214.
  // Display only: which pair a day gets is still decided by the day index.
  const NUMBER_OFFSET = 211;
  const dateKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const dailyNumber = (key) => {
    const [y, m, d] = key.split('-').map(Number);
    return Math.round((Date.UTC(y, m - 1, d) - DAILY_EPOCH) / 864e5) + 1;
  };
  function hashStr(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function seeded(seed) {
    let a = seed;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function dailyPair(key) {
    const PAIRS = root.PAIRS, POOL = root.POOL;
    const pool = [...(PAIRS.daily || []), ...PAIRS.hard];
    const n = dailyNumber(key);
    // After the hand-picked run, every day is generated from the Vital Articles snapshot with a
    // date-seeded RNG: a lesser-known start and a core target from a different subject.
    if (n > pool.length && POOL.familiar.length) {
      const rnd = seeded(hashStr(`daily-${key}`));
      const F = POOL.familiar;
      const [start, g1] = F[Math.floor(rnd() * F.length)];
      let end = F[Math.floor(rnd() * F.length)];
      for (let k = 0; k < 8 && (end[1] === g1 || end[0] === start); k++) end = F[Math.floor(rnd() * F.length)];
      return { start, end: end[0], n: n + NUMBER_OFFSET, key };
    }
    const i = (((n - 1) % pool.length) + pool.length) % pool.length;
    const cycle = Math.floor((n - 1) / pool.length);
    const rnd = seeded(hashStr(`cycle-${cycle}`));
    const order = pool.map((_, k) => k);
    for (let k = order.length - 1; k > 0; k--) {
      const j = Math.floor(rnd() * (k + 1));
      [order[k], order[j]] = [order[j], order[k]];
    }
    const [start, end] = pool[order[i]];
    return { start, end, n: n + NUMBER_OFFSET, key };
  }

  root.WRDaily = { DAILY_EPOCH, NUMBER_OFFSET, dateKey, dailyNumber, hashStr, seeded, dailyPair };
})(typeof window !== 'undefined' ? window : globalThis);
