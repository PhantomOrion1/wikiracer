# 🏁 WikiRacer

Get from one Wikipedia article to another using only the links on the page. Fewest clicks wins.

**Play:** https://wikiracer.live/

## Features

- **Daily challenge**: one hard pair per day (10:00 limit), the same for everyone, with one attempt. Ranked by clicks, then time. You get a percentile, a histogram of how everyone did, a streak counter and a shareable result. The other players' spread is simulated from a fixed model of typical hard-mode play, generated the same way for everyone each day, since there's no server.
- **Host handover**: if the host leaves, the next player in join order takes over the room automatically. Everyone else reconnects and the race carries on.
- **Live spectating**: follow a racer's scroll position and hovered link in real time.
- **No word search**: Ctrl/⌘+F is blocked mid-race, and link text is drawn with CSS so the browser's Find never matches a clickable link.
- **Time limits**: 2:30 easy, 5:00 medium, 10:00 hard.
- **Quick match**: join a random public race with strangers (up to 8 per room). Players vote on difficulty (public races lean Easy/Medium) and ready up; the race starts once most of the room is ready. Public rooms have codes (PUB01…) so friends can join the same one, and a private room's host can open it to the public.
- **Spectate**: once you're finished or out, watch any racer's screen live.
- **Lane Rush**: a quick racing mini-game (dodge traffic, grab flags) to play while you wait. Locked during countdowns and while you race.
- **Route comparison**: podium plus everyone's route side by side, with shared articles highlighted.
- **Anti-cheat**: the article is hidden while you're in another tab or window (the clock keeps running). The host re-checks every route against Wikipedia's link data, and fake routes get flagged. Times and click counts are measured by the host, not trusted from players. Racers can't see each other's pages until they finish.
- **Security**: strict Content-Security-Policy, Subresource Integrity on the CDN script, Wikipedia HTML stripped of scripts and event handlers, and peer messages validated and rate-limited.

## Running it at scale

- **`config.json`** holds live settings you can edit on GitHub without touching code (takes ~10 min to apply): fill-in racers (`bots.maxPerRoom: 0` turns them off), number of public rooms, and an optional self-hosted PeerJS server.
- **Fill-in racers**: quick-match rooms that are short on people get up to 2 fill-ins (names in `bots.js`). They take real routes through Wikipedia's link graph, play at four skill levels, and always finish or give up within 75% of the time limit. They back off automatically once rooms have real players, or when other public rooms are already busy.
- **Pairs**: `vital.js` is a snapshot of Wikipedia's Vital Articles (~4,500 articles, by subject), giving about 4 million start/target combinations. Each browser remembers the last 4,000 pairs it played and never repeats them.
- **Wikipedia API**: responses are cached at Wikimedia's edge (`smaxage`), and failed requests retry with backoff.
- **Names** are filtered for slurs and profanity.

## Analytics

Anonymous analytics go straight to PostHog's capture API (no tracking script, no names, honours Do Not Track). They're off until you add a key:

1. Create a free project at posthog.com (free tier: 1M events/month).
2. Copy the project API key (`phc_...`) into `config.json` → `analytics.posthogKey`. Use `https://eu.i.posthog.com` as `posthogHost` if your project is in the EU.

Events: `app_open`, `race_start`, `race_end`, `daily_end`, `quick_match`, `room_created`, `room_joined`, `round_start` (humans vs fill-ins), `spectate_open`, `share`, `flappy_game`, `host_migrated`, `issue` (failed loads, matchmaking, joins), `client_error`.

## Modes

- **Solo**: Easy / Medium / Hard curated pairs, random articles, or your own custom pair. Personal bests are saved in your browser.
- **Duel**: create a room, send the invite link, and up to 8 people race the same pair live. You see everyone's click count while racing, and full routes once you finish. Wins are tallied across rounds.
- **Challenge links**: after a solo race, "Challenge a friend" copies a link with your start, target and score so someone else can try to beat it.

## How it works

No browser extension is needed. Articles are fetched from the Wikipedia API and rendered inside the game, so every link click goes through the game and is counted. Search, external links, and category/file/help pages are blocked. The in-game Back button costs a click.

Duels are peer-to-peer over WebRTC using [PeerJS](https://peerjs.com/). The host's browser acts as the room server, so there's no backend to run, and the whole thing is a static site on GitHub Pages.

## Run locally

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Files

- `index.html`: screens (home, lobby, game, results)
- `app.js`: Wikipedia fetching and link handling, game logic, and duel networking
- `minigame.js`: the Lane Rush mini-game
- `pairs.js`: curated start → target pairs per difficulty
- `daily-core.js`: daily challenge picker
- `styles.css`, `pages.css`: styles for the game and the static pages
- `vendor/peerjs.min.js`: PeerJS 1.5.4, self-hosted and loaded on demand (SRI-pinned)
- `tools/build-pages.js`: builds the how-to, multiplayer, FAQ, ideas, speedrun and privacy & terms pages, plus `sitemap.xml`
- `tools/render-images.js`: renders `og.png` and the app icons

## Tests

```bash
cd tests && npm ci && npx playwright install webkit
npx playwright test
```

The suite runs on every push (`.github/workflows/ci.yml`) and covers:
- **security**: an HTML sanitiser fuzz, CSP, frame-busting, name filtering, a malicious player (forged finishes, floods, malformed and oversized messages) and a malicious host
- **failure modes**: Wikipedia down or slow, the network dropping mid-race, PostHog or PeerJS blocked, the host crashing mid-race, a guest crashing, and 8 players across two rooms
- **accessibility**: axe-core WCAG 2.1 AA checks in light and dark mode
- **smoke**: Chrome, desktop WebKit and iPhone-sized WebKit

Wikipedia is mocked in tests, so they're repeatable and don't hit rate limits. Multiplayer tests use the real PeerJS signalling server. CI also runs gitleaks over the full git history.

Article content comes from Wikipedia under CC BY-SA 4.0.
