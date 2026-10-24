# ScatterHoard

Two squirrels, a hidden stash, and one busy minute. A browser game with smooth movement across a 40 × 10 clearing viewed at 45 degrees. Red starts on the left; Ash, the grey squirrel, starts on the right.

Play together on one keyboard, or host an online room on Cloudflare and share its six-character code. Online matches use a server-authoritative Durable Object and WebSockets, with a maximum of two players. Hidden burial locations never appear in client snapshots or events.

## Play

The static website is published through GitHub Pages at **https://triley98.github.io/ScatterHoard/**. Online play additionally needs the Cloudflare deployment below. The Cloudflare Worker serves the entire website and lobby at a single public HTTPS URL, so that address supports both modes automatically.

- **Same keyboard:** click **Let’s forage**. Red moves with WASD and digs with Space; Ash moves with arrow keys and digs with Enter.
- **Online:** click **Online with a friend → Host a clearing**, then copy the invite link. Your friend opens it and chooses **Join clearing**. Host is Red, guest is Ash. Both choose **Ready to forage** to start. Online, either movement key set and either dig key control only your assigned squirrel.
- Touch devices get directional and Dig buttons.
- A WebGL-capable browser is required. Sound is optional and starts muted.

If using the GitHub Pages frontend with a separate Cloudflare lobby, expand **Lobby server** and enter the Worker's public HTTPS address. Invite links carry this public address automatically. For a default shared endpoint, set the GitHub repository variable `SCATTERHOARD_LOBBY_URL` to the deployed Worker URL; the Pages workflow builds it as `VITE_LOBBY_URL`. That URL is public configuration, never a secret.

## Rules

- Movement is continuous and independent of the invisible 40-column, 10-row grid. There are no visible grid lines, cell outlines, dirt piles, sprouts, or other burial markers. Remember where the squirrels dig.
- Each round lasts 60 seconds after a three-second countdown. One acorn drops immediately, then every five seconds through second 55: 12 regular acorns. Powerups can add bonus acorns.
- Walk over an acorn to pick it up. Each squirrel carries one at a time.
- **Dig while carrying** to bury your acorn in the hidden cell beneath you. Stay still for 0.55 seconds; moving cancels digging and keeps your acorn. A cell holds one buried acorn. Attempting to bury in an occupied cell takes a complete dig, fails, and keeps the carried acorn. Nothing highlights an occupied location in advance.
- **Dig empty-handed** to search the hidden cell. If an opponent planted an acorn there, it moves into your paws and its old territory loses a point. Take it home and bury it to score for your half. You cannot excavate your own planted acorns.
- Every completed empty-handed search independently has a **10% powerup chance**, including searches that uncover an acorn. Cancelled digs and burials do not roll. Each of the five outcomes is equally likely when a powerup is found:

| Outcome             | Effect                                                       |
| ------------------- | ------------------------------------------------------------ |
| Acorn rain          | Three extra acorns drop on the finder's side.                |
| Fleet paws          | 1.6× movement speed for six seconds.                         |
| A corvid accomplice | A corvid steals one buried acorn from the opponent's half.   |
| Heavy paws          | 0.6× movement speed for six seconds.                         |
| A hungry corvid     | A corvid steals one buried acorn from the finder's own half. |

Powerups show a notification naming the finder and the outcome. Speed effects show their remaining time beside the player and replace an existing speed effect instead of stacking. A corvid only removes an acorn if its target half has one; otherwise the notification reports that it found nothing. Its decorative swoop does not reveal a burial location.

Location determines the score: columns 1–20 score for Red and 21–40 for Ash, regardless of who planted the acorn. Most buried at time-up wins; equal scores draw.

Local play pauses with Esc, Pause, opening help, or leaving the tab. Online menus and background tabs do not pause the other player. A network disconnection pauses the shared match for up to 30 seconds while that player's browser reconnects with its private session ticket. After that, the round resets and both players can ready up again. Rooms expire after 15 minutes. Deploying a new Worker or a platform restart can reset an active match; rooms are intended for short games, not permanent storage.

## Run and test

Use Node.js 24 (`.nvmrc`; Node 22.12+ supported) and npm.

```sh
npm ci
npm run dev:online
```

This builds the site and runs the Cloudflare Worker and Durable Object locally on port 8787. No Cloudflare login or credentials are needed for local play and testing. Open the address Wrangler prints. For frontend hot reload, also run `npm run dev` in another terminal; Vite on port 5173 proxies `/api` and WebSockets to Wrangler on port 8787. Rebuild after frontend changes when viewing the Worker-served site directly.

```sh
npm test             # Rules, powerups, privacy, room lifecycle, and input validation
npm run build        # Production static website in dist/
npm run deploy:check # Build and bundle the Cloudflare deployment without publishing
npm run test:e2e     # Local gameplay and two isolated online browser sessions
```

Playwright starts Vite and the local Worker if needed. It uses `/usr/bin/chromium` in this cloud environment; set `CHROMIUM_PATH` if Chromium is elsewhere. It checks pickup/burial, occupied cells, the full round and rematch, UI powerup notifications, mobile layout, sound controls, online hosting/joining, synchronized movement, reconnect, and private snapshots. Software WebGL flags support CI without a GPU.

## Deploy the Cloudflare website and lobby

1. Select a Cloudflare account with Workers enabled. If prompted, register its `workers.dev` subdomain in the dashboard.
2. Create an account-scoped API token using Cloudflare's **Edit Cloudflare Workers** template, with access to the selected account and the Workers/Durable Objects deployment permissions. Keep it in secure environment settings or a secret manager. Never put its value in source code, the lobby form, or chat.
3. Supply `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` securely to the deployment process, then run:

```sh
npm ci
npm test
npm run deploy
```

Wrangler uploads the site assets, Worker, and SQLite-backed Durable Object migration from `wrangler.jsonc`. It prints the actual public game URL after a successful deployment. No account IDs or credentials are hardcoded. A successful local test or dry run does not establish that the public lobby is deployed.

For automatic GitHub deployment, add `CLOUDFLARE_ACCOUNT_ID` as a **repository Actions variable** and `CLOUDFLARE_API_TOKEN` as a **repository Actions secret**. The **Deploy Cloudflare game and lobby** workflow runs on pushes to `main` or manually. It is skipped until the account ID variable exists, and fails with a clear message if the token is missing. Environment secrets saved in the cloud setup UI are separate from GitHub Actions secrets.

`ALLOWED_ORIGINS` in `wrangler.jsonc` permits this repository's GitHub Pages origin and the local Vite origins. The Worker's own origin is always permitted. Add any custom frontend origin explicitly before hosting the frontend elsewhere. The service accepts only validated, bounded movement/dig inputs; scores, powerups, digs, and the clock are computed on the server. No client can submit coordinates, scores, inventory, or powerup outcomes.

### Static GitHub Pages

The separate **Deploy ScatterHoard website** workflow tests, builds, and publishes `dist/` on pushes to `main`. In **Settings → Pages**, choose **GitHub Actions** as the source. Static hosting serves the game; it does not run the Cloudflare multiplayer backend. Relative asset paths support `/ScatterHoard/` or a domain root.

## Project layout

- `src/game.js` — shared authoritative rules; private burial map and safe public snapshots.
- `src/scene.js` — unmarked clearing, squirrels, dense forest, and corvid swoops.
- `src/main.js` — local/online lifecycle, input, lobby interface, HUD, and notifications.
- `src/online.js` — room connection, private per-browser tickets, invite codes, and reconnect.
- `src/audio.js`, `src/style.css` — sound and responsive interface with bundled fonts.
- `server/room.js` — deterministic two-seat room, readiness, countdown, disconnect, and input validation.
- `server/worker.js` — Cloudflare HTTP/WebSocket endpoints and Durable Object lifecycle.
- `wrangler.jsonc` — Worker assets, bindings, migration, and allowed frontend origins.
- `tests/` — rules/lobby tests and real browser integration tests.

All graphics and fonts are bundled locally. Only online mode requires a network connection to the lobby. No player accounts are needed.
