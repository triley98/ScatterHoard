# ScatterHoard

A two-player, same-device browser game about squirrels with very big plans. Red starts on the left and Ash, a grey squirrel, starts on the right. Built with Three.js and Vite; no backend, accounts, or API keys required.

## Play on the website

The GitHub Pages deployment target is **https://triley98.github.io/ScatterHoard/**. This address becomes playable after Pages is enabled and the first deployment succeeds; it is not a verified live site until then.

The game runs directly in the browser. Both players use the same device; opening the website on two different devices does not connect them to the same match.

### Publish with GitHub Pages

1. Push this project, including `.github/workflows/deploy.yml`, to the repository's `main` branch.
2. In the repository's **Settings → Pages**, select **GitHub Actions** as the build and deployment source. GitHub may require an eligible plan if the repository is private.
3. Open **Actions → Deploy ScatterHoard website → Run workflow**. Subsequent pushes to `main` test, build, and publish automatically.
4. Wait for both build and deployment jobs to finish, then use the URL shown by the `github-pages` deployment.

The production build uses relative asset paths so it works at `/ScatterHoard/` as well as a domain root. You may instead upload the contents of `dist/` to another static website host; no application server is needed.

## Run locally

Use Node.js 24 (`.nvmrc`; Node 22.12+ supported) and npm.

```sh
npm ci
npm run dev
```

Open the address Vite prints, then choose **Let’s forage**. Both players share one keyboard. Touch devices also get directional buttons and a Bury button for each player. A WebGL-capable browser is required.

| Player                          | Move       | Bury  |
| ------------------------------- | ---------- | ----- |
| Red squirrel, left patch        | W A S D    | Space |
| Ash, grey squirrel, right patch | Arrow keys | Enter |

Press **Esc** or **Pause** to pause. Opening the instructions or leaving the browser tab also pauses the round. Sound starts muted and can be enabled in the header.

## Rules

- The ground is 40 columns wide and 10 rows deep, with a 45-degree orthographic camera.
- Movement is continuous, accelerates smoothly, and is independent of the grid. Both squirrels may cross the center line.
- Rounds last 60 seconds after a three-second countdown. One acorn drops immediately, then another every five seconds through second 55: 12 acorns total. Drops are random across the board.
- Walk over an acorn to pick it up. Each squirrel carries at most one.
- While carrying, an outline highlights the grid square under your squirrel. Press your Bury key and remain still for 0.55 seconds to plant it there. Moving cancels digging and keeps your acorn.
- Each cell holds at most one buried acorn. Simultaneous digs cannot reserve the same cell. Buried acorns remain planted for the rest of the round.
- **Location determines the score**: columns 1–20 score for Red; columns 21–40 score for Ash, regardless of who did the digging. There is no digging up or stealing buried acorns.
- The highest territory score at time-up wins. Equal scores are a draw. Rematches reset the board and both players.

This version is local multiplayer on one device. Networked multiplayer is not implemented.

## Validate and build

```sh
npm test         # Deterministic rules tests using Node's built-in test runner
npm run build   # Production files in dist/
npm run preview # Serve the production build
```

Browser tests use Playwright and Chromium, exercise both players' keyboard controls and the complete round lifecycle, and check mobile layout and sound controls:

```sh
# Chromium is already installed in the cloud environment at /usr/bin/chromium.
npm run test:e2e
```

On another machine, install Chromium and set `CHROMIUM_PATH` to its executable when it is not `/usr/bin/chromium`. The Playwright configuration starts Vite automatically if it is not already running. Software WebGL flags make browser tests work on machines without a GPU.

## Project layout

- `src/game.js` — rendering-independent rules, clock, movement, pickup, digging, and scoring.
- `src/scene.js` — 3D squirrels, forest, board, animation, and camera.
- `src/main.js` — keyboard/touch input, round lifecycle, dialogs, and HUD.
- `src/audio.js` — optional synthesized sound effects.
- `src/style.css` — responsive interface with locally bundled fonts.
- `tests/` — rules tests and browser integration tests.

All graphics are generated locally and fonts are bundled. Playing the built game makes no external asset or service requests. Deploy `dist/` to any static web host.
