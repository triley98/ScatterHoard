const ACORN =
  '<path d="M22 27h24c0 16-6 24-12 28-6-4-12-12-12-28Z" fill="#d69b55" stroke="#855632" stroke-width="2.4"/><path d="M18 28a16 14 0 0 1 32 0Z" fill="#795638" stroke="#614930" stroke-width="2.4"/><path d="M33 14c-1-6 3-9 7-9" fill="none" stroke="#614930" stroke-width="3.5" stroke-linecap="round"/>';
const ICONS = {
  acorn: ACORN,
  'acorn-rain':
    '<g transform="translate(-7 4) scale(.83)">' +
    ACORN +
    '</g><path d="M48 11v27m-8-8 8 8 8-8" stroke="#416947" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  turtle:
    '<path d="m20 39-5 9m28-9 5 9M20 23l-5-7m28 7 5-7" stroke="#718345" stroke-width="7" stroke-linecap="round"/><ellipse cx="30" cy="32" rx="18" ry="15" fill="#7d9950" stroke="#4a6536" stroke-width="2.5"/><path d="m30 20 8 6v12l-8 6-8-6V26Zm-8 6-8-1m24 1 8-1M22 38l-8 1m24-1 8 1" stroke="#c7ce83" stroke-width="2" fill="none"/><ellipse cx="52" cy="33" rx="8" ry="7" fill="#95ac62" stroke="#4a6536" stroke-width="2"/><circle cx="54" cy="31" r="1.7" fill="#243e31"/><path d="m12 33-7 3 7 2" fill="#7d9950"/>',
  'winged-feet':
    '<path d="M20 31C10 28 6 19 7 10c6 8 13 9 21 14m16 7c10-3 14-12 13-21-6 8-13 9-21 14" fill="#d9e2cb" stroke="#6c8862" stroke-width="2.5" stroke-linejoin="round"/><path d="m10 18 13 10m-10-3 9 8m32-15L41 28m10-3-9 8" stroke="#6c8862" stroke-width="2"/><path d="m22 24-3 17c-1 6 1 10 6 11 5 1 8-2 7-6l-3-6 3-15Zm20 0 3 17c1 6-1 10-6 11-5 1-8-2-7-6l3-6-3-15Z" fill="#bc8050" stroke="#795539" stroke-width="2.5"/><path d="m19 42 11 2m15-2-11 2" stroke="#efd0a0" stroke-width="2"/>',
  crow: '<path d="M18 41C8 43 5 48 6 52l17-3c13 2 24-6 25-17l7-6-8-5c-1-8-10-12-16-8-6 3-6 9-6 12-10 1-15 8-12 15Z" fill="#36433c" stroke="#24352c" stroke-width="2.5" stroke-linejoin="round"/><path d="m46 23 13 4-13 4" fill="#d4a557" stroke="#795c35" stroke-width="2"/><path d="M16 38c8-8 14-9 24-7-3 9-11 12-20 11" fill="#56665a" stroke="#24352c" stroke-width="2"/><circle cx="40" cy="21" r="2.2" fill="#f2e6c6"/><path d="m30 47-2 8m11-10 1 10m-16 0h8m4 0h8" fill="none" stroke="#795c35" stroke-width="2.5" stroke-linecap="round"/>',
  buried:
    '<path d="m38 12 10 10m-5-15 10 10-10 10-10-10Z" fill="#baa17a" stroke="#735d40" stroke-width="2.5" stroke-linejoin="round"/><path d="M37 25 19 43" stroke="#846644" stroke-width="6"/><path d="m15 37 12 12-10 9L6 47Z" fill="#8e9f86" stroke="#4d6650" stroke-width="2.5"/><path d="m38 43 6 6 12-14" fill="none" stroke="#527547" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>',
  miss: '<circle cx="28" cy="27" r="16" fill="#e2e7ce" stroke="#6c8060" stroke-width="3"/><path d="m40 40 14 14" stroke="#6c8060" stroke-width="6" stroke-linecap="round"/><path d="M24 22c0-7 12-7 12 0 0 5-8 4-8 9m0 6v1" fill="none" stroke="#6c8060" stroke-width="3" stroke-linecap="round"/>',
  blocked:
    '<path d="m16 16 32 32m0-32L16 48" stroke="#a8714c" stroke-width="7" stroke-linecap="round"/>',
};

export function badgeIcon(kind) {
  return `<svg viewBox="0 0 64 64" fill="none" aria-hidden="true">${ICONS[kind] || ICONS.miss}</svg>`;
}

/** DOM overlays projected from each rendered squirrel; no hidden board coordinates are used. */
export class PlayerBadges {
  constructor(root, announcements) {
    this.root = root;
    this.announcements = announcements;
    this.entries = [[], []];
    this.slots = [0, 1].map((id) => {
      const slot = document.createElement('div');
      slot.className = 'squirrel-badges';
      slot.dataset.player = id;
      root.append(slot);
      return slot;
    });
  }

  clear() {
    this.entries = [[], []];
    for (const slot of this.slots) slot.replaceChildren();
    this.announcements.textContent = '';
  }

  show(
    player,
    icon,
    description,
    { harmful = false, effect = null, key = icon, chip = '' } = {},
  ) {
    const entries = this.entries[player];
    const existing = entries.find((badge) => badge.key === key);
    if (existing) {
      existing.age = 0;
      existing.node.setAttribute('aria-label', description);
      existing.node.title = description;
      this.announcements.textContent = description;
      return;
    }
    if (effect) {
      for (let i = entries.length - 1; i >= 0; i--)
        if (entries[i].effect) {
          entries[i].node.remove();
          entries.splice(i, 1);
        }
    }
    if (entries.length >= 3) {
      const old = entries.findIndex((entry) => !entry.effect);
      entries.splice(old < 0 ? 0 : old, 1)[0].node.remove();
    }
    const node = document.createElement('div');
    node.className = `octagon-badge${harmful ? ' harmful' : ''}${effect ? ' timed' : ''}`;
    node.dataset.icon = icon;
    node.setAttribute('role', 'img');
    node.setAttribute('aria-label', description);
    node.title = description;
    node.innerHTML = `<span class="badge-face">${badgeIcon(icon)}${chip ? `<span class="badge-chip">${chip}</span>` : ''}</span>`;
    this.slots[player].append(node);
    entries.push({ key, node, age: 0, effect });
    this.announcements.textContent = description;
  }

  onEvent(event) {
    if (!Number.isInteger(event.player)) return;
    const name = event.player === 0 ? 'Red' : 'Ash';
    if (event.type === 'pickup' || event.type === 'unearth')
      this.show(
        event.player,
        'acorn',
        `${name} ${event.type === 'unearth' ? 'dug up' : 'picked up'} an acorn.`,
      );
    if (event.type === 'bury')
      this.show(event.player, 'buried', `${name} buried an acorn.`);
    if (event.type === 'miss')
      this.show(event.player, 'miss', `${name} found no acorn here.`);
    if (event.type === 'hint')
      this.show(event.player, 'blocked', `${name} cannot dig here.`, {
        harmful: true,
      });
    if (event.type !== 'powerup') return;
    const badges = {
      'acorn-rain': [
        'acorn-rain',
        'Three extra acorns dropped on your side.',
        false,
        null,
        '3',
      ],
      'speed-boost': [
        'winged-feet',
        'Fast feet: a six-second speed boost.',
        false,
        'speed-boost',
        '',
      ],
      slowdown: [
        'turtle',
        'Slow feet: a six-second slowdown.',
        true,
        'slowdown',
        '',
      ],
      'friendly-crow': [
        'crow',
        event.stolen
          ? 'A friendly crow stole an acorn from the other patch.'
          : 'A friendly crow found no acorns to steal.',
        false,
        null,
        '+',
      ],
      'hungry-crow': [
        'crow',
        event.stolen
          ? 'A hungry crow stole an acorn from your patch.'
          : 'A hungry crow found no acorns to steal.',
        true,
        null,
        '−',
      ],
    };
    const [icon, description, harmful, effect, chip] = badges[event.kind];
    this.show(event.player, icon, `${name}: ${description}`, {
      harmful,
      effect,
      chip,
      key: event.kind,
    });
  }

  render(forest, game, dt) {
    const paused = game.phase === 'paused' || game.phase === 'paused-countdown';
    for (const id of [0, 1]) {
      const point = forest.projectPlayer(id);
      const halfWidth = this.slots[id].offsetWidth / 2;
      const x = Math.max(
        halfWidth + 5,
        Math.min(this.root.clientWidth - halfWidth - 5, point.x),
      );
      this.slots[id].style.left = `${x}px`;
      this.slots[id].style.top = `${point.y}px`;
      const entries = this.entries[id];
      for (let i = entries.length - 1; i >= 0; i--) {
        const badge = entries[i];
        if (!paused) badge.age += dt;
        const left = badge.effect
          ? game.players[id].effectUntil - game.matchElapsed
          : 3 - badge.age;
        if (
          left <= 0 ||
          (badge.effect && game.players[id].effect !== badge.effect)
        ) {
          badge.node.remove();
          entries.splice(i, 1);
          continue;
        }
        badge.node.classList.toggle('fading', left < 0.35);
        if (badge.effect)
          badge.node.style.setProperty(
            '--progress',
            `${Math.max(0, Math.min(1, left / 6)) * 360}deg`,
          );
      }
    }
  }
}
