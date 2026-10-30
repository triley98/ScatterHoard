import { test, expect } from '@playwright/test';
import { chooseGame } from './helpers.js';

test.use({ deviceScaleFactor: 0.25 });

async function advance(page, milliseconds) {
  for (let left = milliseconds; left > 0; left -= 200)
    await page.clock.fastForward(Math.min(left, 200));
}

async function openGame(page, mode, match) {
  // Keep the real scene/controller while avoiding software WebGL draw cost.
  await page.route('**/src/scene.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace(
      'this.renderer.render(this.scene, this.camera);', 'void 0;',
    ) });
  });
  await page.route('**/src/main.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\nwindow.fixture={game,forest,opponent};` });
  });
  await page.clock.install({ time: new Date('2026-10-30T00:00:00Z') });
  await page.goto('/');
  await chooseGame(page, mode, match);
  await page.clock.pauseAt(new Date('2026-10-30T00:10:00Z'));
  await page.getByRole('button', { name: 'Let’s forage' }).click();
  await advance(page, 3100);
  await page.evaluate(() => {
    const { game, opponent } = window.fixture;
    game.rocks = []; game.stumps = []; game.acorns = []; game.nextDrop = Infinity;
    // Ash's real foraging is covered by modes.spec.js. Holding its AI still
    // here makes accidental human control of Ash observable.
    opponent.update = () => ({ x: 0, z: 0, dig: false });
    for (const player of game.players) Object.assign(player, {
      x: player.id ? 31.5 : 8.5, z: 7.5, vx: 0, vz: 0, carrying: false, dig: null,
    });
  });
}

for (const mode of ['arcade', 'survival']) test(`either keyboard set moves and digs as Red against the AI in ${mode}`, async ({ page }) => {
  test.setTimeout(60000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await openGame(page, mode, 'ai');

  for (const key of ['d', 'ArrowRight']) {
    await page.evaluate(() => Object.assign(window.fixture.game.players[0], { x: 8.5, z: 7.5, vx: 0, vz: 0 }));
    await page.keyboard.down(key);
    await advance(page, 500);
    const positions = await page.evaluate(() => window.fixture.game.players.map(p => ({ x: p.x, z: p.z })));
    expect(positions[0].x).toBeGreaterThan(10.5);
    expect(positions[1]).toEqual({ x: 31.5, z: 7.5 });
    await page.keyboard.up(key);
    await advance(page, 300);
  }

  for (const [key, x] of [['Space', 6.5], ['Enter', 9.5]]) {
    const before = await page.evaluate(x => {
      const player = window.fixture.game.players[0];
      Object.assign(player, { x, z: 4.5, vx: 0, vz: 0, carrying: true, dig: null });
      return player.buried;
    }, x);
    await page.keyboard.press(key);
    expect(await page.evaluate(() => window.fixture.game.players[0].dig?.mode)).toBe('bury');
    expect(await page.evaluate(() => window.fixture.game.players[1].dig)).toBeNull();
    await advance(page, 700);
    expect(await page.evaluate(() => window.fixture.game.players[0].buried)).toBe(before + 1);
    expect(await page.evaluate(() => window.fixture.game.players[0].carrying)).toBe(false);
  }

  await page.evaluate(() => Object.assign(window.fixture.game.players[0], { x: 8.5, z: 7.5, vx: 0, vz: 0 }));
  await page.keyboard.down('d');
  await page.keyboard.down('ArrowLeft');
  await advance(page, 500);
  expect(await page.evaluate(() => window.fixture.game.players[0].x)).toBe(8.5);
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.down('ArrowRight');
  await advance(page, 500);
  const speed = await page.evaluate(() => window.fixture.game.players[0].vx);
  expect(speed).toBeGreaterThan(6);
  expect(speed).toBeLessThanOrEqual(7);
  await page.keyboard.up('d'); await page.keyboard.up('ArrowRight');

  await page.getByRole('button', { name: 'How to Play' }).click();
  const guide = await page.locator('#help-dialog').innerText();
  expect(guide).toMatch(/(?:against|versus)\s+(?:the\s+)?AI[\s\S]*?either[\s\S]*?Red/i);
  expect(errors).toEqual([]);
});

test('local human vs human keeps arrows and Enter assigned to Ash', async ({ page }) => {
  test.setTimeout(60000);
  await openGame(page, 'arcade', 'local');
  await page.keyboard.down('ArrowRight');
  await advance(page, 500);
  expect(await page.evaluate(() => window.fixture.game.players[0].x)).toBe(8.5);
  expect(await page.evaluate(() => window.fixture.game.players[1].x)).toBeGreaterThan(33.5);
  await page.keyboard.up('ArrowRight');
  await advance(page, 300);
  const before = await page.evaluate(() => {
    const player = window.fixture.game.players[1];
    Object.assign(player, { x: 31.5, z: 4.5, vx: 0, vz: 0, carrying: true, dig: null });
    return player.buried;
  });
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => window.fixture.game.players[1].dig?.mode)).toBe('bury');
  expect(await page.evaluate(() => window.fixture.game.players[0].dig)).toBeNull();
  await advance(page, 700);
  expect(await page.evaluate(() => window.fixture.game.players[1].buried)).toBe(before + 1);
});
