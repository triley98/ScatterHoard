import './style.css';
import { Game, RULES } from './game.js';
import { ForestScene } from './scene.js';
import { WoodlandAudio } from './audio.js';
import { OnlineSession, lobbyBase, defaultLobby } from './online.js';
import { PlayerBadges, badgeIcon } from './badges.js';

const $ = (id) => document.getElementById(id);
const arrowIcon =
  '<svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 15 15 5M5 5h10v10"/></svg>';
const game = new Game();
const audio = new WoodlandAudio();
const keys = new Set();
const gameKeys = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
  'Enter',
]);
const dialogs = [
  'help-dialog',
  'pause-dialog',
  'results-dialog',
  'lobby-dialog',
].map($);
let online = null;
let remoteState = null;
let lastInputAt = 0;
let onlineDig = false;
const badges = new PlayerBadges($('player-badges'), $('game-announcements'));
for (const icon of document.querySelectorAll('[data-legend-icon]'))
  icon.innerHTML = badgeIcon(icon.dataset.legendIcon);
const sessionQuery = new URLSearchParams(location.search);
$('lobby-server').value =
  sessionQuery.get('lobby') ||
  defaultLobby(location.origin, import.meta.env.VITE_LOBBY_URL,
    localStorage.getItem('scatterhoard-lobby'));
let forest;
let countdown = 0;
let lastCountdownNumber = 0;
let helpPreviousPhase = null;
let previousScores = [0, 0];
let pendingRestart = false;

try {
  forest = new ForestScene($('game-canvas'), game);
} catch (error) {
  console.error('Could not initialize the woodland renderer:', error);
  $('renderer-error').hidden = false;
  $('start-button').disabled = true;
  $('toolbar-title').textContent = 'The clearing needs a little help.';
  $('toolbar-subtitle').textContent =
    'Enable WebGL in your browser and refresh to play.';
}

function anyDialogOpen() {
  return dialogs.some((dialog) => dialog.open);
}
function clearInputs() {
  keys.clear();
  onlineDig = false;
  online?.input({ x: 0, z: 0 });
}
function showMessage(text) {
  // Connection and clipboard feedback stays in the lobby status, outside the playing field.
  $('connection-status').textContent = text;
}

function beginMatch() {
  if (!forest) return;
  if (online) {
    if (online.closed) return;
    online.send('ready');
    for (const dialog of dialogs) if (dialog.open) dialog.close();
    clearInputs();
    return;
  }
  for (const dialog of dialogs) if (dialog.open) dialog.close();
  helpPreviousPhase = null;
  pendingRestart = false;
  clearInputs();
  game.reset();
  game.phase = 'countdown';
  forest.reset();
  badges.clear();
  countdown = 3;
  lastCountdownNumber = 3;
  $('countdown-number').textContent = '3';
  $('countdown-overlay').hidden = false;
  $('game-canvas').focus({ preventScroll: true });
  audio.play('tick');
  syncUI();
}

function pauseGame() {
  if (anyDialogOpen()) return;
  if (online) {
    clearInputs();
    $('pause-dialog').showModal();
    syncUI();
    return;
  }
  if (['playing', 'intermission'].includes(game.phase)) game.pause();
  else if (game.phase === 'countdown') game.phase = 'paused-countdown';
  else return;
  clearInputs();
  $('pause-dialog').showModal();
  syncUI();
}

function resumeGame() {
  pendingRestart = false;
  $('pause-dialog').close();
  if (!online) {
    if (game.phase === 'paused-countdown') game.phase = 'countdown';
    else game.resume();
  }
  clearInputs();
  $('game-canvas').focus({ preventScroll: true });
  syncUI();
}

function showResults() {
  clearInputs();
  $('countdown-overlay').hidden = true;
  $('result-red').textContent = game.scores[0];
  $('result-grey').textContent = game.scores[1];
  const winner = game.winner;
  const name = winner === 0 ? 'Red' : 'Ash';
  $('results-title').innerHTML =
    winner === null
      ? 'A perfectly even<br><em>little rivalry.</em>'
      : `${name} takes<br><em>the clearing.</em>`;
  $('results-subtitle').textContent =
    winner === null
      ? 'Same score. Same squirrel-sized ambition.'
      : 'Good paws. Great planning. Well played, both of you.';
  const total = game.scores[0] + game.scores[1];
  $('results-detail').textContent =
    `${total} ${total === 1 ? 'acorn' : 'acorns'} tucked away. ${game.drops + game.bonusDrops} dropped. Three very busy rounds.`;
  $('results-rounds').replaceChildren(
    ...game.roundResults.map((result) => {
      const row = document.createElement('div');
      row.innerHTML = `<span>Round ${result.round}</span><strong>Red ${result.scores[0]} <span>—</span> Ash ${result.scores[1]}</strong>`;
      return row;
    }),
  );
  $('results-dialog').showModal();
  audio.play('finish');
}

function openHelp() {
  if (anyDialogOpen()) return;
  helpPreviousPhase = game.phase;
  if (!online && ['playing', 'intermission'].includes(game.phase)) game.pause();
  else if (!online && game.phase === 'countdown')
    game.phase = 'paused-countdown';
  clearInputs();
  $('help-dialog').showModal();
  syncUI();
}

$('help-dialog').addEventListener('close', () => {
  if (
    !online &&
    ['playing', 'intermission'].includes(helpPreviousPhase) &&
    game.phase === 'paused'
  )
    game.resume();
  if (
    !online &&
    helpPreviousPhase === 'countdown' &&
    game.phase === 'paused-countdown'
  )
    game.phase = 'countdown';
  helpPreviousPhase = null;
  clearInputs();
  syncUI();
});
$('pause-dialog').addEventListener('cancel', (event) => {
  event.preventDefault();
  resumeGame();
});
for (const button of document.querySelectorAll('[data-close]'))
  button.addEventListener('click', () => $(button.dataset.close).close());
for (const dialog of dialogs)
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog || dialog.id === 'pause-dialog') return;
    const rect = dialog.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      dialog.close();
  });
$('start-button').addEventListener('click', beginMatch);
$('rematch-button').addEventListener('click', beginMatch);
$('pause-restart-button').addEventListener('click', beginMatch);
$('resume-button').addEventListener('click', resumeGame);
$('pause-button').addEventListener('click', pauseGame);
$('restart-button').addEventListener('click', () => {
  if (game.phase === 'finished') beginMatch();
  else {
    pendingRestart = true;
    pauseGame();
  }
});
$('help-button').addEventListener('click', openHelp);
$('sound-button').addEventListener('click', () => {
  audio.toggle();
  syncSound();
});

function syncSound() {
  $('sound-button').innerHTML = audio.enabled
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="m16 9 5 6m0-6-5 6"/></svg>';
  const label = audio.enabled ? 'Turn sound off' : 'Turn sound on';
  $('sound-button').setAttribute('aria-label', label);
  $('sound-button').setAttribute('aria-pressed', String(audio.enabled));
  $('sound-button').title = label;
}
syncSound();

window.addEventListener('keydown', (event) => {
  if (anyDialogOpen() || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.code === 'Escape') {
    event.preventDefault();
    pauseGame();
    return;
  }
  if (
    !['playing', 'countdown'].includes(game.phase) ||
    !gameKeys.has(event.code)
  )
    return;
  event.preventDefault();
  keys.add(event.code);
  if (!event.repeat && game.phase === 'playing') {
    if (online) {
      if (event.code === 'Space' || event.code === 'Enter') onlineDig = true;
    } else {
      if (event.code === 'Space') game.requestDig(0);
      if (event.code === 'Enter') game.requestDig(1);
    }
  }
});
window.addEventListener('keyup', (event) => keys.delete(event.code));
window.addEventListener('blur', () => {
  clearInputs();
  if (!online) pauseGame();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    clearInputs();
    if (!online) pauseGame();
  }
});

for (const button of document.querySelectorAll('[data-key]')) {
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    if (anyDialogOpen() || game.phase !== 'playing') return;
    button.setPointerCapture(event.pointerId);
    keys.add(button.dataset.key);
  });
  const release = () => keys.delete(button.dataset.key);
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', release);
}
for (const button of document.querySelectorAll('[data-bury]'))
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    if (!anyDialogOpen()) {
      if (online) onlineDig = true;
      else game.requestDig(Number(button.dataset.bury));
    }
  });

function inputs() {
  return [
    {
      x: Number(keys.has('KeyD')) - Number(keys.has('KeyA')),
      z: Number(keys.has('KeyS')) - Number(keys.has('KeyW')),
    },
    {
      x: Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft')),
      z: Number(keys.has('ArrowDown')) - Number(keys.has('ArrowUp')),
    },
  ];
}

function handleEvents(events = game.drainEvents()) {
  for (const event of events) {
    forest?.onEvent(event);
    badges.onEvent(event);
    if (['pickup', 'bury', 'drop', 'unearth'].includes(event.type))
      audio.play(event.type === 'unearth' ? 'pickup' : event.type);
    if (event.type === 'powerup')
      audio.play(
        ['slowdown', 'hungry-crow'].includes(event.kind) ? 'drop' : 'bury',
      );
    if (event.type === 'roundEnd' || event.type === 'roundStart') {
      clearInputs();
      audio.play(event.type === 'roundStart' ? 'go' : 'tick');
    }
    if (event.type === 'finish') showResults();
  }
}

function resetToLocal() {
  online?.leave();
  online = null;
  remoteState = null;
  forest.networked = false;
  game.reset();
  forest.reset();
  clearInputs();
  for (const dialog of dialogs) if (dialog.open) dialog.close();
  $('room-bar').hidden = true;
  badges.clear();
  $('connection-status').textContent = 'Two squirrels. One screen.';
  $('local-mode').classList.add('active');
  $('online-mode').classList.remove('active');
  $('local-mode').setAttribute('aria-pressed', 'true');
  $('online-mode').setAttribute('aria-pressed', 'false');
  const address = new URL(location.href);
  address.searchParams.delete('room');
  address.searchParams.delete('lobby');
  history.replaceState(null, '', address);
  syncUI();
}
function connectRoom(session) {
  online?.leave();
  online = session;
  const address = new URL(location.href);
  address.searchParams.set('room', session.code);
  if (session.base !== location.origin)
    address.searchParams.set('lobby', session.base);
  history.replaceState(null, '', address);
  remoteState = null;
  forest.networked = true;
  game.reset();
  forest.reset();
  clearInputs();
  $('lobby-dialog').close();
  $('room-bar').hidden = false;
  $('local-mode').classList.remove('active');
  $('online-mode').classList.add('active');
  $('local-mode').setAttribute('aria-pressed', 'false');
  $('online-mode').setAttribute('aria-pressed', 'true');
  $('connection-status').textContent = 'Connecting to the clearing…';
  $('room-description').textContent = `Room ${session.code} · Connecting…`;
  session.addEventListener('welcome', () => {
    $('connection-status').textContent =
      `Online · You’re ${session.slot === 0 ? 'Red' : 'Ash'}`;
    $('room-description').textContent =
      `Room ${session.code} · You’re ${session.slot === 0 ? 'Red' : 'Ash'}`;
  });
  session.addEventListener('state', ({ detail: { state, events } }) => {
    const oldPhase = game.phase;
    if (!remoteState || state.epoch !== remoteState.epoch) {
      forest.reset();
      badges.clear();
    }
    remoteState = state;
    Object.assign(game, state);
    handleEvents(events);
    if (
      state.phase === 'finished' &&
      oldPhase !== 'finished' &&
      !events.some((e) => e.type === 'finish')
    )
      showResults();
    if (state.phase === 'paused')
      $('connection-status').textContent =
        'Round paused · Waiting for your friend to reconnect…';
    else
      $('connection-status').textContent = state.seats.every((s) => s.connected)
        ? `Online · You’re ${session.slot === 0 ? 'Red' : 'Ash'}`
        : 'Waiting for your friend. Share the room code.';
    syncUI();
  });
  session.addEventListener('reconnecting', () => {
    clearInputs();
    $('connection-status').textContent =
      'Connection interrupted. Reconnecting…';
  });
  session.addEventListener('failure', ({ detail }) => {
    $('connection-status').textContent = detail;
    showMessage(detail, 10000);
    syncUI();
  });
  session.connect();
}
async function enterLobby(host) {
  $('lobby-error').textContent = '';
  $('host-room').disabled = true;
  $('join-room').disabled = true;
  try {
    const base = lobbyBase($('lobby-server').value.trim());
    localStorage.setItem('scatterhoard-lobby', base);
    const session = host
      ? await OnlineSession.host(base)
      : OnlineSession.join(base, $('room-code').value);
    connectRoom(session);
  } catch (error) {
    $('lobby-error').textContent = error.message;
    $('lobby-settings').open = true;
  } finally {
    $('host-room').disabled = false;
    $('join-room').disabled = false;
  }
}
$('online-mode').addEventListener('click', () => {
  if (online && !online.closed) return;
  if (!anyDialogOpen()) {
    clearInputs();
    if (['playing', 'intermission'].includes(game.phase)) game.pause();
    else if (game.phase === 'countdown') game.phase = 'paused-countdown';
    $('lobby-dialog').showModal();
  }
});
$('lobby-dialog').addEventListener('close', () => {
  if (!online && game.phase === 'paused') game.resume();
  else if (!online && game.phase === 'paused-countdown')
    game.phase = 'countdown';
});
$('local-mode').addEventListener('click', () => {
  if (online) resetToLocal();
});
$('leave-room').addEventListener('click', resetToLocal);
$('host-room').addEventListener('click', () => enterLobby(true));
$('join-form').addEventListener('submit', (event) => {
  event.preventDefault();
  enterLobby(false);
});
$('copy-invite').addEventListener('click', async () => {
  const invite = new URL(location.href);
  invite.search = '';
  invite.searchParams.set('room', online.code);
  if (online.base !== location.origin)
    invite.searchParams.set('lobby', online.base);
  try {
    await navigator.clipboard.writeText(invite.href);
    showMessage('Invite link copied. Send it to your friend!');
  } catch {
    showMessage(
      `Room code: ${online.code}. Your friend can enter it in Online play.`,
      7000,
    );
  }
});
if (sessionQuery.has('room')) {
  $('room-code').value = sessionQuery.get('room').toUpperCase().slice(0, 6);
  $('lobby-dialog').showModal();
}

function syncUI() {
  const phase = game.phase;
  const mySeat = online && remoteState ? remoteState.seats[online.slot] : null;
  const running = [
    'playing',
    'intermission',
    'countdown',
    'paused',
    'paused-countdown',
  ].includes(phase);
  const finished = phase === 'finished';
  const seconds = Math.ceil(game.remaining);
  $('clock').textContent =
    `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  $('clock').setAttribute('aria-label', `${seconds} seconds remaining`);
  $('clock').parentElement.classList.toggle(
    'urgent',
    seconds <= 10 && phase === 'playing',
  );
  $('round-label').textContent = finished
    ? 'THREE ROUNDS. ONE WINNER.'
    : `ROUND ${game.round} OF ${RULES.rounds}`;
  $('clock-caption').textContent =
    phase === 'ready'
      ? 'Three one-minute rounds'
      : phase === 'playing'
        ? `${game.drops} of 36 drops${game.bonusDrops ? ` + ${game.bonusDrops} bonus` : ''}`
        : phase === 'intermission'
          ? 'The clearing stays. The rivalry continues.'
          : finished
            ? 'Time’s up. Tails high.'
            : phase === 'countdown'
              ? 'The scramble starts soon'
              : 'Match paused';
  const between = phase === 'intermission';
  $('countdown-overlay').hidden = ![
    'countdown',
    'paused-countdown',
    'intermission',
  ].includes(phase);
  $('countdown-label').textContent = between
    ? `ROUND ${game.round + 1} OF ${RULES.rounds} · ${game.intermissionRemaining > 3 ? 'A MOMENT TO REGROUP' : 'PAWS AT THE READY'}`
    : 'ROUND 1 OF 3 · PAWS AT THE READY';
  $('countdown-number').textContent = Math.max(
    1,
    Math.ceil(
      between
        ? game.intermissionRemaining
        : online
          ? remoteState?.countdown || 3
          : countdown,
    ),
  );
  document.querySelectorAll('#round-progress span').forEach((dot, i) => {
    dot.classList.toggle('complete', i < game.roundResults.length);
    dot.classList.toggle('current', i + 1 === game.round && !finished);
  });
  $('start-button').hidden = running;
  $('start-button').disabled =
    !forest || Boolean(online && (online.closed || !mySeat || mySeat.ready));
  $('start-button').innerHTML = finished
    ? `Play again ${arrowIcon}`
    : `Let’s forage ${arrowIcon}`;
  if (online)
    $('start-button').innerHTML = mySeat?.ready
      ? 'Waiting for your friend…'
      : `Ready to forage ${arrowIcon}`;
  $('pause-button').hidden = !running;
  $('pause-button').disabled =
    phase === 'paused' || phase === 'paused-countdown';
  $('restart-button').hidden = Boolean(online) || phase !== 'playing';
  $('pause-restart-button').hidden = Boolean(online);
  $('rematch-button').textContent = online
    ? 'Ready for a rematch'
    : 'One more match';
  $('pause-title').innerHTML = pendingRestart
    ? 'A fresh<br><em>start?</em>'
    : 'Taking a<br><em>breather.</em>';
  $('pause-dialog').querySelector('p').textContent = pendingRestart
    ? 'Start a new three-round match with an empty board, or keep playing.'
    : 'Your acorns aren’t going anywhere. Ready when you are.';
  if (online) {
    $('pause-title').innerHTML = 'A quick<br><em>breather.</em>';
    $('pause-dialog').querySelector('p').textContent =
      'The online round keeps going while this menu is open. Your squirrel stays still.';
  }
  if (phase === 'ready') {
    $('toolbar-title').textContent = 'Three rounds. A whole lot of hoarding.';
    $('toolbar-subtitle').textContent =
      'One clearing, three minutes. Every hiding spot carries over.';
  } else if (finished) {
    $('toolbar-title').textContent =
      game.winner === null
        ? 'An evenly matched pair of paws.'
        : `${game.winner === 0 ? 'Red' : 'Ash'} wins this little woodland rivalry.`;
    $('toolbar-subtitle').textContent = 'There’s always room for a rematch.';
  } else {
    $('toolbar-title').textContent = 'Hide it. Remember it. Steal theirs.';
    $('toolbar-subtitle').textContent =
      'Dig with empty paws to search. Every search might hold a surprise.';
  }
  if (phase === 'playing') {
    const tillDrop = Math.max(0, Math.ceil(game.nextDrop - game.elapsed));
    $('drop-label').innerHTML =
      `<span class="acorn-mini" aria-hidden="true"></span> ${game.nextDrop < 60 ? `NEXT ACORN IN ${tillDrop}s` : 'LAST DROP. MAKE IT COUNT.'}`;
  } else
    $('drop-label').innerHTML =
      '<span class="acorn-mini" aria-hidden="true"></span> AN ACORN EVERY 5 SECONDS';
  for (const id of [0, 1]) {
    const name = id === 0 ? 'red' : 'grey';
    const score = $(name + '-score');
    score.textContent = game.scores[id];
    if (previousScores[id] !== game.scores[id]) {
      score.classList.remove('score-bump');
      void score.offsetWidth;
      score.classList.add('score-bump');
      previousScores[id] = game.scores[id];
    }
    const player = game.players[id];
    const carry = $(name + '-carry');
    const effect = $(name + '-effect');
    effect.textContent = player.effect
      ? `${player.effect === 'speed-boost' ? 'Fast feet' : 'Slow feet'} · ${Math.max(0, Math.ceil(player.effectUntil - game.matchElapsed))}s`
      : '';
    effect.classList.toggle('slow', player.effect === 'slowdown');
    carry.textContent = player.dig
      ? player.dig.mode === 'search'
        ? 'Searching…'
        : 'Digging…'
      : player.carrying
        ? 'Acorn in paws'
        : 'Paws empty';
    carry.classList.toggle('loaded', player.carrying);
  }
}

let previousTime = performance.now();
let nextUI = 0;
function frame(now) {
  const dt = Math.min(Math.max(0, (now - previousTime) / 1000), 0.25);
  previousTime = now;
  if (online) {
    if (now - lastInputAt >= 50 && online.slot !== null) {
      const both = inputs();
      const input = {
        x: Math.max(-1, Math.min(1, both[0].x + both[1].x)),
        z: Math.max(-1, Math.min(1, both[0].z + both[1].z)),
      };
      online.input(input, onlineDig);
      onlineDig = false;
      lastInputAt = now;
    }
  } else if (game.phase === 'countdown') {
    countdown -= dt;
    const number = Math.ceil(countdown);
    if (number > 0 && number !== lastCountdownNumber) {
      $('countdown-number').textContent = number;
      lastCountdownNumber = number;
      audio.play('tick');
    }
    if (countdown <= 0) {
      $('countdown-overlay').hidden = true;
      game.start(true);
      clearInputs();
      audio.play('go');
    }
  } else game.update(dt, inputs());
  handleEvents();
  if (now >= nextUI) {
    syncUI();
    nextUI = now + 80;
  }
  if (forest) {
    game.countdown = online ? remoteState?.countdown : countdown;
    forest.render(now / 1000, dt);
    badges.render(forest, game, dt);
  }
  requestAnimationFrame(frame);
}
syncUI();
requestAnimationFrame(frame);
