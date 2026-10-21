// Finds real shortest routes between article pairs on live English Wikipedia and saves them to
// tools/routes.json, which build-pages.js turns into the /route/… pages. Run it again to refresh:
//   node tools/find-routes.js            (only pairs not in routes.json yet)
//   node tools/find-routes.js --all      (recheck every pair)
//
// "Shortest" is exact for the length we report: a 2-click route is only saved after checking every
// link on the start page for a direct link to the target, and a 3-click route only after checking
// that no 2-click route exists. Pairs with no route in 3 clicks are skipped. build-pages.js leaves
// out routes through reference-box pages like Wikidata or ISBN.
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'routes.json');
const API = 'https://en.wikipedia.org/w/api.php';
const UA = 'WikiRacerRouteBuilder/1.0 (https://wikiracer.live; route pages)';

// Pairs people search for ("how to get to Jesus on Wikipedia"), plus the race-ideas pairs.
const PAIRS = [
  ['Banana', 'Jesus'], ['Minecraft', 'Jesus'], ['Pizza', 'Jesus'], ['Taylor Swift', 'Jesus'], ['SpongeBob SquarePants', 'Jesus'],
  ['Cat', 'Philosophy'], ['Pizza', 'Philosophy'], ['Minecraft', 'Philosophy'], ['Taylor Swift', 'Philosophy'],
  ['Taylor Swift', 'Kevin Bacon'], ['Pizza', 'Kevin Bacon'], ['Minecraft', 'Kevin Bacon'], ['Banana', 'Kevin Bacon'],
  ['Pizza', 'Albert Einstein'], ['Dog', 'Moon'], ['Cat', 'Ancient Rome'],
  ['Golf', 'Vikings'], ['Spider-Man', 'Photosynthesis'], ['Hamburger', 'Space Shuttle'], ['Bitcoin', 'Leonardo da Vinci'],
  ['Taylor Swift', 'Black hole'], ['Minecraft', 'Roman Empire'], ['Mount Everest', 'Jazz'], ['Pokémon', 'Charles Darwin'],
  ['Banana', 'Albert Einstein'], ['William Shakespeare', 'Internet'], ['Sushi', 'Association football'], ['Netflix', 'Napoleon'],
  ['Emoji', 'Great Wall of China'], ['Lego', 'Moon'], ['Coca-Cola', 'Antarctica'], ['Cheese', 'World War II'],
  ['Penguin', 'Isaac Newton'], ['Volleyball', 'Ancient Greece'],
  ['Fidget spinner', 'Ottoman Empire'], ['Axolotl', 'Stock exchange'], ['Spork', 'Pythagorean theorem'], ['Lighthouse', 'K-pop'],
  ['Bubble wrap', 'Mongolia'], ['Toaster', 'Genghis Khan'], ['Platypus', 'Morse code'], ['Kazoo', 'Antarctica'],
  ['Pickleball', 'Byzantine Empire'], ['Saxophone', 'Mitochondrion'], ['Sudoku', 'Great Barrier Reef'], ['Origami', 'Quantum mechanics'],
  ['Yo-yo', 'Tsar Bomba'], ['Rubber duck', 'French Revolution'], ['Tardigrade', 'Eurovision Song Contest'], ['Bagpipes', 'Photosynthesis'],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(params) {
  const url = `${API}?${new URLSearchParams({ format: 'json', formatversion: '2', maxlag: '5', ...params })}`;
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    if (r.ok) {
      const j = await r.json();
      if (!j.error) { await sleep(120); return j; }
      if (j.error.code !== 'maxlag') throw new Error(j.error.info);
    }
    await sleep(2000 * (attempt + 1));
  }
  throw new Error('Wikipedia API kept failing');
}

// Follows "continue" for list-style queries.
async function all(params, pick, cap) {
  const out = [];
  let cont = {};
  do {
    const j = await api({ ...params, ...cont });
    out.push(...pick(j));
    cont = j.continue || null;
  } while (cont && out.length < cap);
  return out;
}

async function resolve(title) {
  const j = await api({ action: 'query', titles: title, redirects: '1', prop: 'info' });
  const p = j.query.pages[0];
  if (p.missing) throw new Error(`No article "${title}"`);
  return p.title;
}

const linksOf = (t, cap = 4000) => all({ action: 'query', prop: 'links', titles: t, plnamespace: '0', pllimit: 'max' },
  (j) => (j.query.pages[0].links || []).map((l) => l.title), cap);

// The target plus its redirects: a link to "Albert einstein" still lands on Albert Einstein.
async function targetNames(t) {
  const j = await api({ action: 'query', prop: 'redirects', titles: t, rdnamespace: '0', rdlimit: 'max' });
  return [t, ...((j.query.pages[0].redirects || []).map((r) => r.title))];
}

// Which of `froms` link to any of `tos` (≤50)? Returns [from, linkTitle] pairs.
async function whoLinks(froms, tos) {
  const hits = [];
  for (let i = 0; i < froms.length; i += 50) {
    const batch = froms.slice(i, i + 50);
    const j = await all({ action: 'query', prop: 'links', titles: batch.join('|'), pltitles: tos.slice(0, 50).join('|'), pllimit: 'max' },
      (x) => x.query.pages.flatMap((p) => (p.links || []).map((l) => [p.title, l.title])), 1e5);
    hits.push(...j);
  }
  return hits;
}

async function lengths(titles) {
  const len = {};
  for (let i = 0; i < titles.length; i += 50) {
    const j = await api({ action: 'query', prop: 'info', titles: titles.slice(i, i + 50).join('|') });
    for (const p of j.query.pages) len[p.title] = p.length || 0;
  }
  return len;
}

async function descriptions(titles) {
  const out = {};
  for (let i = 0; i < titles.length; i += 50) {
    const j = await api({ action: 'query', prop: 'description', titles: titles.slice(i, i + 50).join('|'), redirects: '1' });
    const back = {};
    for (const r of j.query.redirects || []) back[r.to] = r.from;
    for (const p of j.query.pages) if (p.description) { out[p.title] = p.description; if (back[p.title]) out[back[p.title]] = p.description; }
  }
  return out;
}

async function findRoute(s0, e0) {
  const start = await resolve(s0);
  const end = await resolve(e0);
  const L1 = [...new Set(await linksOf(start))];
  const targets = await targetNames(end);
  const tset = new Set(targets);
  if (L1.some((t) => tset.has(t))) return { start, end, clicks: 1, routes: [[start, end]] };

  // 2 clicks: every page the start links to, checked for a link to the target.
  const hits2 = await whoLinks(L1, targets);
  if (hits2.length) {
    const mids = [...new Set(hits2.map(([m]) => m))];
    const len = await lengths(mids);
    mids.sort((a, b) => (len[b] || 0) - (len[a] || 0));
    return { start, end, clicks: 2, routes: mids.slice(0, 8).map((m) => [start, m, end]) };
  }

  // 3 clicks: links of the biggest pages the start links to, against pages that link to the target.
  const back = new Set(await all({ action: 'query', list: 'backlinks', bltitle: end, blnamespace: '0', bllimit: 'max', blredirect: '1' },
    (j) => j.query.backlinks.flatMap((b) => [b.title, ...((b.redirlinks || []).map((r) => r.title))]), 30000));
  const len1 = await lengths(L1);
  const hubs = [...L1].sort((a, b) => (len1[b] || 0) - (len1[a] || 0)).slice(0, 40);
  const routes = [];
  for (const h of hubs) {
    const L2 = await linksOf(h, 6000);
    for (const m of L2) if (back.has(m) && m !== start && m !== end) routes.push([start, h, m, end]);
    if (routes.length >= 30) break;
  }
  if (!routes.length) return null;
  // Confirm the last hop really links to the target (backlinks can be stale), then keep variety.
  const ok = new Set((await whoLinks([...new Set(routes.map((r) => r[2]))].slice(0, 200), targets)).map(([m]) => m));
  const good = routes.filter((r) => ok.has(r[2]));
  if (!good.length) return null;
  const seenMid = new Set();
  const varied = good.filter((r) => (seenMid.has(r[1]) ? false : seenMid.add(r[1])));
  return { start, end, clicks: 3, routes: [...varied, ...good.filter((r) => !varied.includes(r))].slice(0, 6) };
}

(async () => {
  const saved = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : [];
  const key = (s, e) => `${s}→${e}`.toLowerCase();
  const have = new Map(saved.map((r) => [key(r.asked[0], r.asked[1]), r]));
  const redo = process.argv.includes('--all');
  const out = [];
  for (const [s, e] of PAIRS) {
    const prev = have.get(key(s, e));
    if (prev && !redo) { out.push(prev); continue; }
    try {
      const r = await findRoute(s, e);
      if (!r) { console.log(`skip  ${s} → ${e} (no route in 3 clicks)`); continue; }
      const titles = [...new Set(r.routes.flat())];
      r.descriptions = await descriptions(titles);
      r.asked = [s, e];
      r.checked = new Date().toISOString().slice(0, 10);
      out.push(r);
      console.log(`${r.clicks} clicks  ${r.routes[0].join(' → ')}`);
    } catch (err) {
      console.log(`error ${s} → ${e}: ${err.message}`);
      if (prev) out.push(prev);
    }
    fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
  }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
  console.log(`saved ${out.length} routes`);
})();
