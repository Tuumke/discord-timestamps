# Discord Timestamps

Static single-page tool that builds Discord timestamp codes (`<t:UNIX:FORMAT>`).
Discord renders them in each reader's own timezone and language.

Live: https://tuumke.github.io/discord-timestamps/

## Features

- Date, time and timezone picker (DST-safe conversion), plus a Now button
- All seven formats (`R t T d D f F`) with live preview and one-click copy
- Shareable link: the selected moment is kept in the URL hash (`#1700000000`)
- Follows the OS light/dark setting, including native date/time pickers
- Skeleton rows until the script has filled in the codes
- Semantic colors: success (copied), warning (moment is in the past), danger (incomplete input, copy failed)

## Security

- Strict Content-Security-Policy: only the site's own `app.js` and `style.css` load; no inline code, no third-party requests
- No `innerHTML`; the URL hash is parsed defensively and range-checked
- No dependencies, no build step

## Run locally

```bash
python -m http.server 8765
```

## Hosting

GitHub Pages from the `main` branch root.
