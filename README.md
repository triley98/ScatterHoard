# ScatterHoard

Two squirrels, a hidden stash, and three busy rounds. A browser game with smooth movement across a 40 × 15 clearing viewed at 45 degrees. Red starts on the left; Ash, the grey squirrel, starts on the right.

Play together on one keyboard, or host an online room on Cloudflare and share its six-character code. Online matches use a server-authoritative Durable Object and WebSockets, with a maximum of two players. Hidden burial locations never appear in client snapshots or events.

## Play

The static website is published through GitHub Pages at **https://triley98.github.io/ScatterHoard/**. The online lobby is deployed at **https://scatterhoard.scatterhoard.workers.dev**. GitHub Pages connects to it automatically. The Cloudflare Worker serves the entire website and lobby at a single public HTTPS URL, so that address supports both modes automatically.

- **Same keyboard:** click **Let’s forage**. Red moves with WASD and digs with Space; Ash moves with arrow keys and digs with Enter.
- **Online:** click **Online with a friend → Host a clearing**, then copy the invite link. Your friend opens it and chooses **Join clearing**. Host is Red, guest is Ash. Both choose **Ready to forage** to start. Online, either movement key set and either dig key control only your assigned squirrel.
- Touch devices get directional and Dig buttons.
- A WebGL-capable browser is required. Sound is optional and starts muted.

To use a different Cloudflare lobby, expand **Lobby server** and enter the Worker's public HTTPS address. Invite links carry this public address automatically. For a default shared endpoint, set the GitHub repository variable `SCATTERHOARD_LOBBY_URL` to the deployed Worker URL; the Pages workflow builds it as `VITE_LOBBY_URL`. That URL is public configuration, never a secret.

## Rules

- Movement is continuous and independent of the invisible 40-column, 15-row grid. There are no visible grid lines, cell outlines, dirt piles, sprouts, or other burial markers. Remember where the squirrels dig. Fixed moss mottling, fine grass grain, leaf litter, and grass clumps texture the surface without responding to digging. Each match randomly places two solid 3 × 3 rocks and two solid 2 × 2 tree stumps per half, mirrored across the center. Both types share the same randomized placement area, with at least two grid spaces of edge-to-edge clearance between all obstacles and clear starting routes. Acorns never spawn inside rocks or stumps.
- Each match has **three 60-second rounds**, with a three-second countdown before the match and a five-second break between rounds. The last three seconds of each break show the tree entrance. Buried acorns remain in their exact original cells and can be dug up in any later round. Scores, rocks, stumps, and any remaining speed effect also carry between rounds. At each round’s end, loose and carried acorns are removed and players return to their starting positions. During each three-second countdown, squirrels climb headfirst on all four paws down the double-size end trees, then move onto the board. The forest border contains trees, mushroom clusters, and bushes, including five tall trees with raised lower branches just behind the board, small foreground trees, and an outer band of varied trees and bushes that fills the distant edges. Leaves fall and drift in the wind; this decoration pauses with the game and respects reduced-motion preferences. The sun moves from left to right during each round, starting with the original daylight and gradually dimming during the final 15 seconds. Each new round restores the starting light. Rocks are single natural boulders without pedestals. One acorn drops at the start of each round, then every five seconds through second 55: **12 regular drops per round, 36 per match**, plus powerup bonuses. The timer resets each round; the board does not. The winner is decided by the final board after round three, rather than adding the three score snapshots together.
- Walk over an acorn to pick it up. Each squirrel carries one at a time.
- **Dig while carrying** to bury your acorn in the hidden cell beneath you. Stay still for 0.55 seconds; moving cancels digging and keeps your acorn. A cell holds one buried acorn. Attempting to bury in an occupied cell takes a complete dig, fails, and keeps the carried acorn. Nothing highlights an occupied location in advance.
- **Dig empty-handed** to search the hidden cell. Any buried acorn moves into your paws, **including your own**, and its old territory loses a point. Carry it to a new hiding spot and rebury it to score for that half.
- Every completed empty-handed search independently has a **10% powerup chance**, including searches that uncover an acorn. Cancelled digs and burials do not roll. Each of the five outcomes is equally likely when a powerup is found:

| Outcome           | Effect                                                     |
| ----------------- | ---------------------------------------------------------- |
| Acorn rain        | Three extra acorns drop on the finder's side.              |
| Fast feet        | 1.6× movement speed for six seconds.                       |
| A crow accomplice | A crow steals one buried acorn from the opponent's half.   |
| Slow feet        | 0.6× movement speed for six seconds.                       |
| A hungry crow     | A crow steals one buried acorn from the finder's own half. |

**Octagonal icon badges pop up above the squirrel’s head instead of gameplay message popups.** An acorn means an acorn was picked up or dug up; a turtle means Slow feet; winged feet mean Fast feet; a crow means either crow powerup; and an acorn with a down arrow and 3 means three extra acorns. Helpful effects use a green rim; harmful effects use a rust rim. Crow badges also carry a + or −. Temporary speed badges remain for the effect duration with a draining rim; other badges last three seconds. Badges track the rendered squirrel as it moves, have accessible descriptions, and leave no marks on the ground. A small shovel/check or cross badge provides feedback for burying or blocked digs. Empty searches show no badge. The help dialog includes an icon guide. Speed effects show remaining time in the HUD and replace each other instead of stacking. A crow only removes an acorn if its target half has one; its decorative swoop never reveals the cell.

Location determines the score: columns 1–20 score for Red and 21–40 for Ash, regardless of who planted the acorn. Most buried after the third round wins; equal scores draw. The results screen shows the cumulative board score at each round’s end. Only a new match clears the board.

Local play pauses with Esc, Pause, opening help, or leaving the tab. Online menus and background tabs do not pause the other player. A network disconnection pauses the shared match for up to 30 seconds while that player's browser reconnects with its private session ticket. After that, the round resets and both players can ready up again. Rooms expire after 15 minutes. Deploying a new Worker or a platform restart can reset an active match; rooms are intended for short games, not permanent storage.

## Reversible hopping experiment

Ground movement currently uses a four-legged bounding gait with a short airborne phase; squirrels stand upright when stationary. This is visual only. Set `HOPPING_MOVEMENT` to `false` in `src/movement.js` to restore upright ground movement while keeping four-paw climbing and the scenery updates.

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

Playwright starts Vite and the local Worker if needed. It uses `/usr/bin/chromium` in this cloud environment; set `CHROMIUM_PATH` if Chromium is elsewhere. It checks pickup/burial, occupied cells, the full three-round match and rematch, all five octagonal powerup icons and their overhead positions, mobile layout, sound controls, online hosting/joining, synchronized movement, reconnect, and private snapshots. Software WebGL flags support CI without a GPU.

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
- `src/scene.js` — unmarked clearing, squirrels, dense forest, and crow swoops.
- `src/main.js` — local/online three-round lifecycle, input, lobby interface, and HUD.
- `src/badges.js` — octagonal SVG icon badges, accessible descriptions, timed effects, and head tracking.
- `src/online.js` — room connection, private per-browser tickets, invite codes, and reconnect.
- `src/audio.js`, `src/style.css` — sound and responsive interface with bundled fonts.
- `server/room.js` — deterministic two-seat room, readiness, countdown, disconnect, and input validation.
- `server/worker.js` — Cloudflare HTTP/WebSocket endpoints and Durable Object lifecycle.
- `wrangler.jsonc` — Worker assets, bindings, migration, and allowed frontend origins.
- `tests/` — rules/lobby tests and real browser integration tests.

All graphics and fonts are bundled locally. Only online mode requires a network connection to the lobby. No player accounts are needed.
