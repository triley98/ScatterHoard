import './style.css';
import { Game, RULES } from './game.js';
import { ForestScene } from './scene.js';
import { WoodlandAudio } from './audio.js';

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
const dialogs = ['help-dialog', 'pause-dialog', 'results-dialog'].map($);
let forest;
let countdown = 0;
let lastCountdownNumber = 0;
let messageTimer;
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
}
function showMessage(text, duration = 2500) {
  clearTimeout(messageTimer);
  $('arena-message').textContent = text;
  $('arena-message').classList.add('visible');
  messageTimer = setTimeout(
    () => $('arena-message').classList.remove('visible'),
    duration,
  );
}

function beginRound() {
  if (!forest) return;
  for (const dialog of dialogs) if (dialog.open) dialog.close();
  helpPreviousPhase = null;
  pendingRestart = false;
  clearInputs();
  game.reset();
  game.phase = 'countdown';
  forest.reset();
  countdown = 3;
  lastCountdownNumber = 3;
  $('countdown-number').textContent = '3';
  $('countdown-overlay').hidden = false;
  $('arena-message').classList.remove('visible');
  $('game-canvas').focus({ preventScroll: true });
  audio.play('tick');
  syncUI();
}

function pauseGame() {
  if (anyDialogOpen()) return;
  if (game.phase === 'playing') game.pause();
  else if (game.phase === 'countdown') game.phase = 'paused-countdown';
  else return;
  clearInputs();
  $('pause-dialog').showModal();
  syncUI();
}

function resumeGame() {
  pendingRestart = false;
  $('pause-dialog').close();
  if (game.phase === 'paused-countdown') game.phase = 'countdown';
  else game.resume();
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
    `${total} ${total === 1 ? 'acorn' : 'acorns'} tucked away. ${game.drops} dropped. One very busy minute.`;
  $('results-dialog').showModal();
  audio.play('finish');
}

function openHelp() {
  if (anyDialogOpen()) return;
  helpPreviousPhase = game.phase;
  if (game.phase === 'playing') game.pause();
  else if (game.phase === 'countdown') game.phase = 'paused-countdown';
  clearInputs();
  $('help-dialog').showModal();
  syncUI();
}

$('help-dialog').addEventListener('close', () => {
  if (helpPreviousPhase === 'playing' && game.phase === 'paused') game.resume();
  if (helpPreviousPhase === 'countdown' && game.phase === 'paused-countdown')
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
$('start-button').addEventListener('click', beginRound);
$('rematch-button').addEventListener('click', beginRound);
$('pause-restart-button').addEventListener('click', beginRound);
$('resume-button').addEventListener('click', resumeGame);
$('pause-button').addEventListener('click', pauseGame);
$('restart-button').addEventListener('click', () => {
  if (game.phase === 'finished') beginRound();
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
    if (event.code === 'Space') game.requestDig(0);
    if (event.code === 'Enter') game.requestDig(1);
  }
});
window.addEventListener('keyup', (event) => keys.delete(event.code));
window.addEventListener('blur', () => {
  clearInputs();
  pauseGame();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    clearInputs();
    pauseGame();
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
    if (!anyDialogOpen()) game.requestDig(Number(button.dataset.bury));
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

function handleEvents() {
  for (const event of game.drainEvents()) {
    forest?.onEvent(event);
    if (['pickup', 'bury', 'drop'].includes(event.type)) audio.play(event.type);
    const name = event.player === 0 ? 'Red' : 'Ash';
    if (event.type === 'pickup')
      showMessage(
        `${name} found an acorn. Find a square and ${event.player === 0 ? 'press Space' : 'press Enter'}!`,
        2200,
      );
    if (event.type === 'bury')
      showMessage(
        event.player === event.territory
          ? `${name} tucked one away. Nice digging!`
          : `That’s ${event.territory === 0 ? 'Red’s' : 'Ash’s'} patch! Their side gets the point.`,
        2300,
      );
    if (event.type === 'hint')
      showMessage(
        event.reason === 'empty'
          ? `${name}, find an acorn first. Run over one to pick it up.`
          : 'That square is already taken. Try the next one.',
      );
    if (event.type === 'finish') showResults();
  }
}

function syncUI() {
  const phase = game.phase;
  const running = [
    'playing',
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
  $('round-label').textContent =
    phase === 'ready'
      ? 'YOUR NEXT WOODLAND RIVALRY'
      : phase === 'playing'
        ? 'MAKE EVERY ACORN COUNT'
        : finished
          ? 'THE CLEARING HAS SPOKEN'
          : phase === 'countdown'
            ? 'PAWS AT THE READY'
            : 'A LITTLE BREATHER';
  $('clock-caption').textContent =
    phase === 'ready'
      ? 'A one-minute scramble'
      : phase === 'playing'
        ? `${Math.min(12, game.drops)} of 12 acorns dropped`
        : finished
          ? 'Time’s up. Tails high.'
          : phase === 'countdown'
            ? 'The scramble starts soon'
            : 'Round paused';
  $('start-button').hidden = running;
  $('start-button').innerHTML = finished
    ? `Play again ${arrowIcon}`
    : `Let’s forage ${arrowIcon}`;
  $('pause-button').hidden = !running;
  $('pause-button').disabled =
    phase === 'paused' || phase === 'paused-countdown';
  $('restart-button').hidden = phase !== 'playing';
  $('pause-title').innerHTML = pendingRestart
    ? 'A fresh<br><em>start?</em>'
    : 'Taking a<br><em>breather.</em>';
  $('pause-dialog').querySelector('p').textContent = pendingRestart
    ? 'Start over with an empty board, or get back to this round.'
    : 'Your acorns aren’t going anywhere. Ready when you are.';
  if (phase === 'ready') {
    $('toolbar-title').textContent = 'A little hustle. A lot of hoarding.';
    $('toolbar-subtitle').textContent =
      'Bring a friend. The forest will keep score.';
  } else if (finished) {
    $('toolbar-title').textContent =
      game.winner === null
        ? 'An evenly matched pair of paws.'
        : `${game.winner === 0 ? 'Red' : 'Ash'} wins this little woodland rivalry.`;
    $('toolbar-subtitle').textContent = 'There’s always room for a rematch.';
  } else {
    $('toolbar-title').textContent = 'Find it. Carry it. Bury it.';
    $('toolbar-subtitle').textContent =
      'Stay still to dig. Your patch is where your points grow.';
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
    carry.textContent = player.dig
      ? 'Digging…'
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
  if (game.phase === 'countdown') {
    countdown -= dt;
    const number = Math.ceil(countdown);
    if (number > 0 && number !== lastCountdownNumber) {
      $('countdown-number').textContent = number;
      lastCountdownNumber = number;
      audio.play('tick');
    }
    if (countdown <= 0) {
      $('countdown-overlay').hidden = true;
      game.start();
      clearInputs();
      audio.play('go');
      showMessage('Off you scurry! Run over an acorn to pick it up.');
    }
  } else game.update(dt, inputs());
  handleEvents();
  if (now >= nextUI) {
    syncUI();
    nextUI = now + 80;
  }
  forest?.render(now / 1000, dt);
  requestAnimationFrame(frame);
}
syncUI();
requestAnimationFrame(frame);
