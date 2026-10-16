# 🏁 WikiRacer

Get from one Wikipedia article to another using only the links on the page. Fewest clicks wins.

**Play:** https://phantomorion1.github.io/wikiracer/

## Features

- **Daily challenge**: one hard pair per day (10:00 limit), the same for everyone, with one attempt. Ranked by clicks, then time. You get a percentile, a histogram of how everyone did, a streak counter and a shareable result. The other players' spread is simulated from a fixed model of typical hard-mode play, generated the same way for everyone each day, since there's no server.
- **Host handover**: if the host leaves, the next player in join order takes over the room automatically. Everyone else reconnects and the race carries on.
- **Live spectating**: follow a racer's scroll position and hovered link in real time.
- **No word search**: Ctrl/⌘+F is blocked mid-race, and link text is drawn with CSS so the browser's Find never matches a clickable link.
- **Time limits**: 2:30 easy, 5:00 medium, 10:00 hard.
- **Quick match**: join a random public race with strangers (Omegle-style). It starts automatically once 2+ racers are in, with up to 5 per room. Hit "Next room" to skip.
- **Spectate**: once you're finished or out, watch any racer's screen live.
- **Flappy Wiki**: a mini-game to play while you wait.
- **Route comparison**: podium plus everyone's route side by side, with shared articles highlighted.
- **Anti-cheat**: leaving the tab costs +1 click after one warning. The host re-checks every route against Wikipedia's link data, and fake routes get flagged. Times and click counts are measured by the host, not trusted from players. Racers can't see each other's pages until they finish.
- **Security**: strict Content-Security-Policy, Subresource Integrity on the CDN script, Wikipedia HTML stripped of scripts and event handlers, and peer messages validated and rate-limited.

## Modes

- **Solo**: Easy / Medium / Hard curated pairs, random articles, or your own custom pair. Personal bests are saved in your browser.
- **Duel**: create a room, send the invite link, and up to 5 people race the same pair live. You see everyone's click count while racing, and full routes once you finish. Wins are tallied across rounds.
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
- `flappy.js`: the Flappy Wiki mini-game
- `pairs.js`: curated start → target pairs per difficulty
- `styles.css`: styles

Article content comes from Wikipedia under CC BY-SA.
