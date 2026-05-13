# CaféOps — 8-Second Launch Video

Built with [Remotion](https://remotion.dev) · React · 1280×720 · 30fps · 8s (240 frames)

## Quick Start

```bash
npm install
npm run studio        # Opens Remotion Studio at http://localhost:3000
```

## Render to MP4

### Without music (renders immediately)
```bash
npm run render
# → out/launch-no-audio.mp4
```

### With music (recommended for final export)
1. Place an 8-second MP3 at `public/music.mp3`
   - Recommended free tracks (CC0 / royalty-free):
     - https://pixabay.com/music/search/upbeat-corporate/
     - https://freemusicarchive.org
   - Suggested search: "upbeat corporate tech 8 seconds"
2. Run:
```bash
npm run render:audio
# → out/launch.mp4
```

## Scenes (total 8 seconds)

| Scene | Frames | Duration | Content |
|-------|--------|----------|---------|
| Logo Reveal | 0–60 | 2.0s | CaféOps logo with ring animations + tagline |
| Feature Cards | 60–140 | 2.7s | 6 platform capabilities flying in |
| Events & Sponsors | 140–200 | 2.0s | 3 events + 4 sponsorship tier cards |
| CTA Outro | 200–240 | 1.3s | "Ready to Sponsor?" with pulsing button |

## Customise

- **Colours** — edit the `NAVY`, `BLUE`, `CYAN`, `AMBER` constants at the top of `src/LaunchVideo.jsx`
- **Text** — update event names, dates, prices in the `EVENTS` and `FEATURES` arrays
- **Logo name** — replace `CaféOps` with your product name
- **Duration** — change `durationInFrames` in `src/index.jsx` (30 frames = 1 second)

## Tech Stack

- Remotion 4 (React-based programmatic video)
- React 19
- No external UI libraries — pure CSS-in-JS via inline styles
