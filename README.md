# ONLYSNACKPACK — reality (2008)

A real social website built to feel like the web circa 2008: Windows-XP-style desktop shell, CRT TV main feed, polaroid posts, music players on posts, a guestbook, 59 mini-apps in "Temple TV", spotlight dark mode, glitter cursor trail, and an admin-only broadcast zone.

No build step. Pure Node + Express on the backend, vanilla JS/CSS/HTML on the frontend. Data persists to JSON files in `./data/` (no external DB needed).

## Quick start
```bash
npm install
npm start
```
Open http://localhost:3000.

## Features
- Boot screen ("welcome to reality (2008)") with progress bar
- Windows-XP chrome: draggable windows, taskbar + green Start button, start menu with avatar, desktop icons (double-click), MSN-style popup toasts
- CRT TV frame with antennae, dials, speaker grille, ON AIR LED, visitor counter, scanlines
- Posts as polaroids, with optional photo / video / music attachment
  - 5 post styles: polaroid / neon / sticky note / CRT terminal / zine
- Comments render as yellow/blue speech bubbles
- Follow people, likes, share-link copy, delete your own posts
- Communities: create, customize color/icon/background, join/leave
- Profile ID card (holographic credit-card style) with photo, user code, join date, followers/following
- Music library with upload (up to 60 MB), global now-playing bar with seek + volume
- Guestbook: anyone can sign, no account needed
- Admin ONLYSNACKPACK zone — password `packers`. Admins can broadcast photo/video/text; everyone can view.
- Spotlight dark mode (circle of light follows the cursor) — toggle in tray ☾ or settings
- Glitter particle trail on cursor, blinkies badge row
- 59 Temple TV apps (notepad, paint, calc, synth, 8-ball, snake, breakout, pong, invaders, binary clock, fireworks, starfield, …) — all genuinely functional
- Persistent login via localStorage token
- Tooltips on every sidebar button so you know what you are clicking
- Settings: accent color (swatches + custom picker), font, font size, glitter toggle, scanline toggle, custom CSS

## Admin
Password: `packers` (send as `x-admin-password` header, or type it in the gate).

## Deploying
The app is just a single Node process that listens on the `PORT` env var (defaults to 3000) and writes to `./data/`. Any host that runs Node 18+ works:

- **Render / Railway / Fly.io / Heroku-ish:** push this repo, set build command `npm install`, start command `npm start`. Make sure `./data/` is writable (or mount a volume, since those platforms wipe the filesystem on deploys — JSON data won't survive a restart without persistent disk).
- **Glitch / Replit:** remix the repo as a node app and hit run. Glitch keeps `.data/` persistent; put the db there if you want long-term storage, or leave it default.
- **VPS (DigitalOcean droplet / EC2 / any Linux box):**
  ```bash
  git clone <your-repo-url>
  cd onlysnackpackready
  npm install
  npm install -g pm2
  pm2 start server.js --name onlysnackpack
  pm2 save
  ```
  Then put nginx/caddy in front with TLS if you want https.

For a zero-config "just show friends right now" link, you can run:
```bash
npx localtunnel --port 3000
```
from the project directory while `npm start` is running — it will give you a temporary public URL.
