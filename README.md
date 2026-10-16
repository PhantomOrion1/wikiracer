# 🏁 Wikirace

Get from one Wikipedia article to another using only the links on the page. Fewest clicks wins.

**Play:** https://phantomorion1.github.io/wikirace/

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
- `pairs.js`: curated start → target pairs per difficulty
- `styles.css`: styles

Article content comes from Wikipedia under CC BY-SA.
