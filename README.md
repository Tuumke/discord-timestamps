# Discord Timestamp Generator

Static single-page tool that builds Discord timestamp codes (`<t:UNIX:FORMAT>`).
Discord renders them in each reader's own timezone and language.

## Features

- Date, time and timezone picker (DST-safe conversion)
- All seven formats (`t T d D f F R`) with live preview and one-click copy
- Quick adjust: Now, ±1d, ±1h, +15m, +1w
- Load an existing Unix timestamp (seconds or ms) or `<t:…>` code
- Shareable link: the selected moment is kept in the URL hash (`#1700000000`)
- Light/dark follows system theme, works on mobile

## Run locally

Open `index.html` in a browser, or:

```bash
python -m http.server 8765
```

## Hosting

Served by GitHub Pages from the `main` branch root. No build step, no dependencies.
