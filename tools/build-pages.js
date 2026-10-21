// Builds the static, indexable pages: how to play, multiplayer, FAQ, race ideas, speedrun tips,
// privacy & terms, 404, robots.txt and sitemap.xml.
// Run from anywhere: node tools/build-pages.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://wikiracer.live';
const NAME = 'WikiRacer Live';
const ISSUES = 'https://github.com/PhantomOrion1/wikiracer/issues';
const CSS_V = '5';

globalThis.window = globalThis;
require(path.join(ROOT, 'pairs.js'));
require(path.join(ROOT, 'vital.js'));
require(path.join(ROOT, 'daily-core.js'));

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const wikiUrl = (t) => 'https://en.wikipedia.org/wiki/' + encodeURIComponent(t.replace(/ /g, '_'));
const playUrl = (s, e, d) => `/?${new URLSearchParams({ s, e, ...(d ? { d } : {}) })}`;

const FOOT_LINKS = [
  ['/', 'Play'], ['/how-to-play/', 'How to play'], ['/multiplayer/', 'Play with friends'], ['/wiki-race-ideas/', 'Race ideas'],
  ['/wikipedia-speedrun/', 'Wikipedia speedrun'], ['/faq/', 'FAQ'], ['/privacy/', 'Privacy & terms'],
];

function page({ url, title, description, h1, crumbs = [], body, jsonld = [], noindex = false }) {
  const canonical = SITE + url;
  const trail = [['/', 'Home'], ...crumbs];
  const breadcrumb = url === '/404.html' ? null : {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [...trail, [url, h1]].map(([u, n], i) => ({ '@type': 'ListItem', position: i + 1, name: n, item: SITE + u })),
  };
  const ld = [breadcrumb, ...jsonld].filter(Boolean).map((o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`).join('\n  ');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  ${noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${canonical}">`}
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${NAME}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${SITE}/og.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="WikiRacer: race friends through Wikipedia, one link at a time">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="theme-color" content="#f4f2ed">
  <meta name="application-name" content="${NAME}">
  <link rel="icon" href="/favicon.ico" sizes="48x48">
  <link rel="icon" href="/icons/icon-96.png" sizes="96x96" type="image/png">
  <link rel="apple-touch-icon" href="/icons/icon-180.png">
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="preload" href="/fonts/archivo-latin-ad60be.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/fonts/fonts.css">
  <link rel="stylesheet" href="/pages.css?v=${CSS_V}">
  ${ld}
</head>
<body>
  <header class="top"><div class="in">
    <a class="logo" href="/">Wiki<span>Racer</span></a>
    <a class="play" href="/">Play now</a>
  </div></header>
  <main>
    ${crumbs.length ? `<p class="crumbs">${trail.map(([u, n]) => `<a href="${u}">${esc(n)}</a>`).join(' / ')} / ${esc(h1)}</p>` : ''}
    <h1>${esc(h1)}</h1>
    ${body}
  </main>
  <footer class="foot"><div class="in">
    <nav aria-label="Site">${FOOT_LINKS.map(([u, n]) => `<a href="${u}">${n}</a>`).join('')}</nav>
  </div></footer>
</body>
</html>
`;
}

function write(rel, html) {
  const file = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
}

// ---------- content pages ----------
const pages = [];
const add = (p) => { pages.push(p); write(p.url === '/404.html' ? '404.html' : path.join(p.url, 'index.html'), page(p)); };

add({
  url: '/how-to-play/',
  title: `How to Play a Wiki Race: Rules & Tips | ${NAME}`,
  description: 'How a wiki race works: start on one Wikipedia article, click links to reach the target in the fewest clicks. Rules, time limits, scoring and winning tips.',
  h1: 'How to play',
  crumbs: [],
  body: `
    <p class="lead">A wiki race (also called the Wikipedia game or a Wikipedia speedrun) is simple: you start on one Wikipedia article and race to another using only the links inside the articles. Fewest clicks wins.</p>
    <div class="cta"><a class="play" href="/">Start a race</a><a class="play ghost" href="/multiplayer/">Play with friends</a></div>

    <h2>The rules</h2>
    <ol class="steps">
      <li><b>You land on the start article.</b> The target is shown at the top of the screen the whole time.</li>
      <li><b>Click links inside the article.</b> No search box, no typing a URL, no external sites. Links to categories, files and other wikis are disabled.</li>
      <li><b>Reach the target.</b> The moment its article opens, you're done. The lowest number of clicks wins, and ties go to the faster time.</li>
    </ol>

    <h2>What counts as a click</h2>
    <p>Every article you open counts as one click, including going back with the <b>Go Back</b> button. Jumping to a section inside the same article is free.</p>

    <h2>Time limits</h2>
    <table>
      <thead><tr><th>Difficulty</th><th>Time</th><th>What the pair is like</th></tr></thead>
      <tbody>
        <tr><td><span class="tag easy">Easy</span></td><td>2:30</td><td>Well-known topics that are about two clicks apart.</td></tr>
        <tr><td><span class="tag medium">Medium</span></td><td>5:00</td><td>Topics from different areas with no direct link between them.</td></tr>
        <tr><td><span class="tag hard">Hard</span></td><td>10:00</td><td>No two-click route exists. You'll need a plan.</td></tr>
      </tbody>
    </table>

    <h2>Fair play</h2>
    <ul>
      <li><b>Leaving the tab</b> hides the article until you come back, and the clock keeps running.</li>
      <li><b>Find in page (Ctrl/⌘+F)</b> doesn't work on links, so you have to actually read.</li>
      <li><b>Every multiplayer route is checked</b> against Wikipedia's real links, and finishes that are impossibly fast get flagged.</li>
    </ul>

    <h2>Tips from fast racers</h2>
    <ul>
      <li><b>Go broad, then narrow.</b> Countries, cities, centuries and big subjects ("United States", "World War II", "Biology") link to almost everything.</li>
      <li><b>Think backwards.</b> Ask what article would definitely link to the target, then aim for that.</li>
      <li><b>Use the first paragraph and the infobox.</b> The most useful links are usually near the top.</li>
      <li><b>Don't over-read.</b> In a race, scanning beats reading. Back-tracking costs a click, so commit once you spot a good hub.</li>
    </ul>

    <h2>Game modes</h2>
    <p><b>Quick match</b> drops you into a public room with other players. <b>Private rooms</b> let you race up to 8 friends with a room code (<a href="/multiplayer/">how it works</a>). <b>Solo</b> lets you practise at any difficulty, and the <b>Daily challenge</b> gives everyone the same hard pair each day.</p>
    <div class="cta"><a class="play" href="/">Play now</a></div>`,
});

add({
  url: '/multiplayer/',
  title: `Play a Wikipedia Race With Friends Online | ${NAME}`,
  description: 'Race up to 8 friends through Wikipedia in real time. Make a private room, share the code, pick the start and target, and see everyone’s route at the end. Free, no sign-up.',
  h1: 'Play with friends',
  body: `
    <p class="lead">Race friends, classmates or coworkers through Wikipedia live. Everyone gets the same start and target, sees each other's progress, and compares routes at the end. It's free, there's nothing to install and you don't need an account.</p>
    <div class="cta"><a class="play" href="/">Create a room</a></div>

    <h2>Start a private race</h2>
    <ol class="steps">
      <li><b>Enter your name</b> on the home page and choose <b>Create room</b>.</li>
      <li><b>Share the 5-letter room code</b> or the invite link. Up to 8 players can join.</li>
      <li><b>Pick the race:</b> vote on Easy, Medium or Hard, or type in your own start and target articles.</li>
      <li><b>Race.</b> Everyone sees a 3-second countdown, then the clock starts for all players together.</li>
    </ol>

    <h2>Quick match</h2>
    <p>Want to race strangers? <b>Quick match</b> puts you in a public room. Players ready up, vote on difficulty, and the next race starts automatically. You can also open your private room to the public so others can join.</p>

    <h2>During and after the race</h2>
    <ul>
      <li><b>Live progress:</b> see how many clicks each racer has made.</li>
      <li><b>Spectate:</b> once you've finished or given up, you can watch other racers' screens live.</li>
      <li><b>Route comparison:</b> the results show every player's full path, so you can see who found the shortcut.</li>
      <li><b>Lane Rush:</b> a quick racing mini-game for when you're waiting on everyone else.</li>
    </ul>

    <h2>Fair and resilient</h2>
    <p>Every finishing route is checked against Wikipedia's real links, and impossible times are flagged. If the host's connection drops, another player takes over the room automatically, and the race carries on.</p>

    <h2>Ideas for a group</h2>
    <p>Use it as a classroom warm-up, an icebreaker for a team call, or a party game. Choose your own pair ("Pizza to the Moon landing") or try one from our <a href="/wiki-race-ideas/">list of race ideas</a>.</p>
    <div class="cta"><a class="play" href="/">Play now</a><a class="play ghost" href="/how-to-play/">Read the rules</a></div>`,
});

const FAQ = [
  ['What is a wiki race?', 'A wiki race is a game where players start on one Wikipedia article and try to reach a target article by clicking only the links inside the pages. The player who gets there in the fewest clicks wins, and ties go to the faster time. It’s also called the Wikipedia game, Wiki Game or Wikipedia speedrun.'],
  ['Is WikiRacer Live free?', 'Yes. It’s free to play, there are no ads, and you don’t need an account.'],
  ['How many people can play together?', 'Up to 8 players per room. Create a private room and share the 5-letter code or invite link, or use Quick match to join a public room.'],
  ['Can I choose the start and target articles?', 'Yes. In a private room or in Solo, pick Custom and type any two English Wikipedia articles. You can also share a challenge link so friends race the same pair.'],
  ['What counts as a click?', 'Every article you open counts as one click, including using Go Back. Jumping to a section within the same article is free.'],
  ['Can I use Ctrl+F or the search bar?', 'No. Search isn’t available, and Find in page doesn’t match link text, so you have to read and scan the article yourself.'],
  ['What happens if I switch tabs?', 'The article is hidden until you come back, so you can’t keep it open next to a search. The clock keeps running while you’re away.'],
  ['How do you stop cheating?', 'Every multiplayer route is re-checked against Wikipedia’s actual links, and finishes that are faster than anyone could read the pages are flagged in the results.'],
  ['What is the daily challenge?', 'Each day everyone gets the same hard pair. You get one attempt, ranked by clicks and then time.'],
  ['Does it work on phones?', 'Yes. It works in modern mobile browsers, including Safari on iPhone and Chrome on Android.'],
  ['Is this made by Wikipedia?', 'No. WikiRacer Live is an independent fan project. It isn’t affiliated with or endorsed by the Wikimedia Foundation. Article text comes from Wikipedia under the CC BY-SA 4.0 licence.'],
  ['Is WikiRacer Live suitable for classrooms?', 'Many teachers use wiki races to practise reading, research and reasoning about how topics connect. Private rooms keep a class together, and you can set the pair yourself. Article content comes straight from Wikipedia, so supervise younger students.'],
];
add({
  url: '/faq/',
  title: `Wiki Race FAQ: Rules, Multiplayer & Daily | ${NAME}`,
  description: 'Answers to common questions about WikiRacer Live: what a wiki race is, how clicks are counted, multiplayer rooms, the daily challenge, cheating and privacy.',
  h1: 'FAQ',
  body: `
    <p class="lead">Quick answers about wiki races and how WikiRacer Live works.</p>
    ${FAQ.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n    ')}
    <p class="muted spaced">Still stuck? <a href="${ISSUES}" rel="noopener">Ask on GitHub</a>.</p>
    <div class="cta"><a class="play" href="/">Play now</a></div>`,
  jsonld: [{
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  }],
});

// Race ideas: curated pairs from the game's own lists, each a one-click challenge link.
const pick = (arr, n, seed) => {
  const out = [...arr];
  const rnd = globalThis.WRDaily.seeded(seed);
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out.slice(0, n);
};
const ideaList = (pairs, d) => `<ul class="pairs">${pairs.map(([s, e]) => `<li><span class="route">${esc(s)}<span class="arrow" aria-hidden="true">→</span><span class="sr-only">to </span>${esc(e)}</span><a class="go" href="${esc(playUrl(s, e, d))}">Race this</a></li>`).join('')}</ul>`;
add({
  url: '/wiki-race-ideas/',
  title: `50 Wiki Race Ideas (Easy to Hard) | ${NAME}`,
  description: 'Fun Wikipedia race starting points and targets for friends, classrooms and parties, sorted by difficulty. Click any pair to race it instantly.',
  h1: 'Wiki race ideas',
  body: `
    <p class="lead">Stuck for a pair? Here are start and target articles that make good races, sorted by difficulty. Click <b>Race this</b> to play one now, or send the link to a friend.</p>
    <h2>Easy (about 2 clicks)</h2>
    <p>Good for warm-ups and new players.</p>
    ${ideaList(pick(PAIRS.easy, 16, 11), 'easy')}
    <h2>Medium (3–4 clicks)</h2>
    <p>Different worlds, no direct link. You'll need a hub article.</p>
    ${ideaList(pick(PAIRS.medium, 18, 22), 'medium')}
    <h2>Hard (no two-click route)</h2>
    <p>For people who already know that "United States" links to everything.</p>
    ${ideaList(pick(PAIRS.hard, 16, 33), 'hard')}
    <h2>Make your own</h2>
    <p>The best custom races connect two things your group cares about, like a band and a breakfast food, or your hometown and a dinosaur. In a private room choose <b>Custom</b> and type any two articles.</p>
    <div class="cta"><a class="play" href="/">Play now</a><a class="play ghost" href="/multiplayer/">Race with friends</a></div>`,
});

add({
  url: '/privacy/',
  title: `Privacy & Terms | ${NAME}`,
  description: 'What WikiRacer Live collects (very little), how to opt out, and the simple rules for playing.',
  h1: 'Privacy & terms',
  body: `
    <p class="lead">Short version: no accounts, no ads, no cookies. We collect a small amount of anonymous usage data to improve the game, and you can switch it off. By playing you agree to the short terms at the bottom.</p>
    <p class="muted">Last updated 17 October 2026.</p>

    <h2>What stays on your device</h2>
    <p>Your browser's local storage keeps your name, the pairs you've played (so you don't get repeats), your daily results and your settings. This never leaves your device unless you play multiplayer (see below). Clear your site data to remove it.</p>

    <h2>Multiplayer</h2>
    <p>Multiplayer connects your browser directly to the other players' browsers (WebRTC). The other players in your room see the name you choose and your race progress. As with any peer-to-peer connection, the players you connect to can technically see your IP address. To set up the connection, your browser briefly talks to the PeerJS signalling service (0.peerjs.com), which sees your IP address and a random ID.</p>

    <h2>Anonymous usage analytics</h2>
    <p>We send anonymous game events (for example "race started", "race finished", difficulty, number of clicks, device type and errors) to PostHog (US region) so we can see what's working. Events are linked to a random ID, not your name. We don't use cookies or advertising IDs, and we don't sell data.</p>
    <ul>
      <li>Outside Europe, the random ID is kept in local storage so repeat visits count as one person.</li>
      <li>If your device's time zone is in Europe, the ID only lives in memory for that visit and nothing analytics-related is stored on your device.</li>
      <li>If your browser sends <b>Do Not Track</b>, or you block PostHog with a content blocker, no analytics are sent and the game still works normally.</li>
    </ul>

    <h2>Feedback</h2>
    <p>If you use the Feedback button, your message, the type you picked and your device type are emailed to us through <a href="https://formsubmit.co" rel="noopener">FormSubmit</a>, and a copy is stored in PostHog with the same random ID. Don't include personal details you don't want stored.</p>

    <h2>Wikipedia</h2>
    <p>Articles are loaded straight from Wikipedia's public API, so the Wikimedia Foundation receives those requests under its own <a href="https://foundation.wikimedia.org/wiki/Policy:Privacy_policy" rel="noopener">privacy policy</a>. Fonts are served from this site, not Google.</p>

    <h2>Children</h2>
    <p>WikiRacer Live isn't directed at children under 13, and we don't knowingly collect information from them.</p>

    <h2>Your choices and contact</h2>
    <p>You can play without entering your real name, enable Do Not Track, block analytics, or clear site data at any time. Questions or deletion requests: <a href="${ISSUES}" rel="noopener">open an issue on GitHub</a>. Since we don't know who you are, include your analytics ID (shown in your browser's local storage as <code>wr-aid</code>) if you want its events deleted.</p>

    <h2 class="part" id="terms">Terms of use</h2>
    <h3>Play nicely</h3>
    <ul>
      <li>Don't use offensive or impersonating names. Obvious slurs are filtered automatically.</li>
      <li>Don't cheat, flood rooms, or try to disrupt other players' games or the service.</li>
      <li>Don't use the game to harass anyone.</li>
    </ul>
    <h3>Public rooms</h3>
    <p>Public rooms are open to anyone. Treat other racers with respect.</p>
    <h3>Wikipedia content</h3>
    <p>Article text is from Wikipedia, written by its volunteer contributors, and licensed under <a href="https://creativecommons.org/licenses/by-sa/4.0/" rel="noopener">CC BY-SA 4.0</a>. It's shown with links and layout adapted for the game. Each article in the game links to its original page and history. ${NAME} isn't affiliated with or endorsed by the Wikimedia Foundation, and Wikipedia® is its registered trademark.</p>
    <h3>No warranty</h3>
    <p>The game is a free hobby project provided "as is". It may change, break or go offline. To the extent the law allows, we're not liable for any loss from using it. Nothing here limits rights you have under consumer law that can't be excluded, including the Australian Consumer Law.</p>
    <h3>Changes</h3>
    <p>We may update this page and will change the date above when we do. Questions: <a href="${ISSUES}" rel="noopener">GitHub issues</a>.</p>`,
});

add({
  url: '/wikipedia-speedrun/',
  title: `Wikipedia Speedrun: How It Works & How to Get Faster | ${NAME}`,
  description: 'What a Wikipedia speedrun is, the two ways people score it, and the strategies fast runners use to get from any article to any other in a few clicks.',
  h1: 'Wikipedia speedrun',
  body: `
    <p class="lead">A Wikipedia speedrun is a race from one Wikipedia article to another using only the links inside the pages. It's the same game as a wiki race. "Speedrun" just puts the focus on beating your own best.</p>
    <div class="cta"><a class="play" href="/">Start a run</a><a class="play ghost" href="/how-to-play/">Rules</a></div>

    <h2>Two ways to score a run</h2>
    <table>
      <thead><tr><th>Format</th><th>Winner</th><th>Good for</th></tr></thead>
      <tbody>
        <tr><td><b>Fewest clicks</b></td><td>Shortest route; time breaks ties</td><td>Thinking, planning, fair on slow connections</td></tr>
        <tr><td><b>Fastest time</b></td><td>First to arrive, however many clicks</td><td>Streams, parties, quick reflexes</td></tr>
      </tbody>
    </table>
    <p>WikiRacer Live uses <b>fewest clicks, then time</b>, so a careful route beats frantic clicking, but speed still matters when two players tie.</p>

    <h2>Why almost every run is short</h2>
    <p>English Wikipedia has millions of articles, but they're densely linked. Most pairs of articles are only three or four clicks apart, because a small number of "hub" articles (big countries, major cities, centuries, broad sciences) link to a huge share of everything else. A good run is about finding the right hub quickly.</p>

    <h2>Strategies fast runners use</h2>
    <h3>1. Climb, then descend</h3>
    <p>From a narrow start, click up to something broad (a country, a field, a time period), then come back down towards the target's world. "Croissant → France → Europe → …" climbs fast.</p>
    <h3>2. Work backwards from the target</h3>
    <p>Before clicking anything, ask what page would definitely link to the target. For "Volcano" that's "Plate tectonics". For a footballer, it's their club or country. Now you're racing to an easier target.</p>
    <h3>3. Read the top, not the whole page</h3>
    <p>The lead paragraph and the infobox hold the densest, most general links. Long articles hide good links far down, but scrolling costs seconds.</p>
    <h3>4. Know your hubs</h3>
    <p>"United States", "United Kingdom", "World War II", "Latin", "Biology", "Mathematics" and the century pages ("20th century") connect almost everything. Learn which ones lead where.</p>
    <h3>5. Don't back-track unless you're sure</h3>
    <p>Going back costs a click. A slightly worse link forward is usually better than a step backwards.</p>

    <h2>Practise</h2>
    <ul>
      <li><b>Daily challenge:</b> one hard pair a day, the same for everyone, with one attempt.</li>
      <li><b>Solo:</b> Easy, Medium and Hard with time limits of 2:30, 5:00 and 10:00.</li>
      <li><b>Race ideas:</b> 50 pairs sorted by difficulty on the <a href="/wiki-race-ideas/">ideas page</a>.</li>
      <li><b>Race people:</b> Quick match or a <a href="/multiplayer/">private room</a> shows everyone's full route at the end, which is the fastest way to learn new shortcuts.</li>
    </ul>
    <div class="cta"><a class="play" href="/">Play now</a></div>`,
});

add({
  url: '/404.html',
  title: `Page not found | ${NAME}`,
  description: 'This page doesn’t exist.',
  h1: 'Dead end',
  noindex: true,
  body: `
    <p class="lead">This page doesn't exist. Even the best racers hit a dead link sometimes.</p>
    <div class="cta"><a class="play" href="/">Back to the race</a><a class="play ghost" href="/how-to-play/">How to play</a></div>`,
});

// ---------- route pages (search landing pages, not linked from the site's menus) ----------
// One page per pair in tools/routes.json (made by tools/find-routes.js from live Wikipedia).
const slug = (t) => t.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const routeUrl = (r) => `/route/${slug(r.start)}-to-${slug(r.end)}/`;
// Routes through reference-box pages (Wikidata, ISBN, …) are real links but useless advice, so they're
// left out; a pair whose only shortest route goes through one is skipped.
const META_PAGES = new Set(['Wikidata', 'ISBN', 'ISSN', 'Digital object identifier', 'PubMed', 'PubMed Central', 'Bibcode', 'JSTOR', 'OCLC',
  'ArXiv', 'Semantic Scholar', 'Geographic coordinate system', 'Wayback Machine', 'Internet Archive', 'Integrated Authority File',
  'Library of Congress Control Number', 'Virtual International Authority File', 'International Standard Name Identifier', 'WorldCat',
  'Wikimedia Commons', 'Wikisource', 'Wiktionary', 'Wikiquote', 'Wikipedia', 'Encyclopædia Britannica', 'IMDb']);
const ROUTES = (fs.existsSync(path.join(__dirname, 'routes.json')) ? JSON.parse(fs.readFileSync(path.join(__dirname, 'routes.json'), 'utf8')) : [])
  .map((r) => ({ ...r, routes: r.routes.filter((x) => !x.slice(1, -1).some((t) => META_PAGES.has(t))) }))
  .filter((r) => r.routes.length);
const chain = (route) => `<ol class="chain">${route.map((t, i) => `<li class="${i === 0 ? 'start' : i === route.length - 1 ? 'end' : ''}"><a href="${esc(wikiUrl(t))}" rel="nofollow noopener" target="_blank">${esc(t)}</a></li>`).join('')}</ol>`;
ROUTES.forEach((r, idx) => {
  const best = r.routes[0];
  const n = r.clicks;
  const clicks = `${n} click${n === 1 ? '' : 's'}`;
  const d = n <= 2 ? 'easy' : n === 3 ? 'medium' : 'hard';
  const desc = (t) => (r.descriptions && r.descriptions[t] ? ` <span class="muted">(${esc(r.descriptions[t])})</span>` : '');
  const others = r.routes.slice(1);
  const more = ROUTES.filter((x, i) => i !== idx).sort((a, b) => (a.end === r.end ? -1 : 0) - (b.end === r.end ? -1 : 0) || (a.start === r.start ? -1 : 0) - (b.start === r.start ? -1 : 0)).slice(0, 6);
  add({
    url: routeUrl(r),
    title: `${r.start} to ${r.end} on Wikipedia: Shortest Route (${clicks}) | ${NAME}`,
    description: `The shortest way from ${r.start} to ${r.end} on Wikipedia is ${clicks}: ${best.join(' → ')}. See other routes, then race it yourself.`,
    h1: `${r.start} to ${r.end} on Wikipedia`,
    body: `
    <p class="lead">The shortest route from <b>${esc(r.start)}</b> to <b>${esc(r.end)}</b> is <b>${clicks}</b>.</p>
    ${chain(best)}
    <div class="cta"><a class="play" href="${esc(playUrl(r.start, r.end, d))}">Race ${esc(r.start)} → ${esc(r.end)}</a><a class="play ghost" href="/">More races</a></div>
    <h2>Step by step</h2>
    <ol class="route-steps">${best.slice(0, -1).map((t, i) => `<li>On <b>${esc(t)}</b>${i === 0 ? desc(t) : ''}, click <b>${esc(best[i + 1])}</b>${desc(best[i + 1])}.</li>`).join('')}</ol>
    ${n > 1 ? `<p>No route is shorter: we checked every link on the ${esc(r.start)} article${n === 3 ? ', and none of those pages link straight to ' + esc(r.end) : ''}.</p>` : ''}
    ${others.length ? `<h2>Other ${n}-click routes</h2><ul class="alt-routes">${others.map((x) => `<li>${x.map(esc).join(' <span class="arrow" aria-hidden="true">→</span><span class="sr-only">to</span> ')}</li>`).join('')}</ul>` : ''}
    <h2>Can you find it in a race?</h2>
    <p>Knowing the answer is easy. Finding it with the clock running, using only the links inside each article, is the hard part. In WikiRacer you race friends or strangers from one article to another, and the fewest clicks wins.</p>
    <div class="cta"><a class="play" href="${esc(playUrl(r.start, r.end, d))}">Race this route</a><a class="play ghost" href="/multiplayer/">Race a friend</a></div>
    <p class="muted small">Checked against live Wikipedia on ${esc(r.checked)}. Articles change, so links can come and go.</p>
    ${more.length ? `<h2>More routes</h2><ul class="pairs">${more.map((x) => `<li><span class="route">${esc(x.start)}<span class="arrow" aria-hidden="true">→</span><span class="sr-only">to </span>${esc(x.end)}</span><a class="go" href="${routeUrl(x)}">${x.clicks} click${x.clicks === 1 ? '' : 's'}</a></li>`).join('')}</ul>` : ''}`,
  });
});

// ---------- robots, sitemap ----------
function buildSeoFiles() {
  write('robots.txt', `User-agent: *\nAllow: /\nDisallow: /tests/\nDisallow: /tools/\n\nSitemap: ${SITE}/sitemap.xml\n`);
  const today = new Date().toISOString().slice(0, 10);
  const urls = [{ loc: '/', pri: '1.0', freq: 'daily' }, ...pages.filter((p) => !p.noindex).map((p) => ({
    loc: p.url, pri: '0.7', freq: 'monthly',
  }))];
  write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${SITE}${u.loc}</loc><lastmod>${today}</lastmod><changefreq>${u.freq}</changefreq><priority>${u.pri}</priority></url>`).join('\n')}\n</urlset>\n`);
}

(async () => {
  buildSeoFiles();
  console.log(`built ${pages.length} pages + robots.txt + sitemap.xml`);
})();
