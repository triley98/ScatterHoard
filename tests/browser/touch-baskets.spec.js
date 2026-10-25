import { test, expect } from '@playwright/test';
import { chooseGame } from './helpers.js';

test.use({ deviceScaleFactor: 0.5 });

async function advance(page, ms) {
  for (let left = ms; left > 0; left -= 200) await page.clock.fastForward(Math.min(200, left));
}

async function fixture(page, mode = 'arcade', match = 'local') {
  await page.route('**/src/main.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\nwindow.fixture={game,forest,touchControls};` });
  });
  await page.clock.install({ time: new Date('2026-10-24T00:00:00Z') });
  await page.goto('/');
  await chooseGame(page, mode, match);
  await page.clock.pauseAt(new Date('2026-10-24T00:10:00Z'));
  await page.getByRole('button', { name: 'Let’s forage' }).click();
  await advance(page, 3100);
}

test.describe('mobile joystick', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test('real touch steers diagonally, supports a second finger digging, and releases safely', async ({ page }, testInfo) => {
    test.setTimeout(60000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await fixture(page);
    await page.evaluate(() => { window.fixture.game.rocks = []; window.fixture.game.stumps = []; });
    await page.locator('#arena').scrollIntoViewIfNeeded();
    await expect(page.locator('[data-joystick="0"]')).toBeVisible();
    await expect(page.locator('[data-joystick="1"]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    const stick = await page.locator('[data-joystick="0"]').boundingBox();
    const dig = await page.locator('[data-bury="0"]').boundingBox();
    const center = { id: 1, x: stick.x + stick.width / 2, y: stick.y + stick.height / 2 };
    const digPoint = { id: 2, x: dig.x + dig.width / 2, y: dig.y + dig.height / 2 };
    const client = await page.context().newCDPSession(page);
    const touch = (type, points) => client.send('Input.dispatchTouchEvent', { type, touchPoints: points });
    const initial = await page.evaluate(() => ({ x: window.fixture.game.players[0].x, z: window.fixture.game.players[0].z, scroll: scrollY }));
    await touch('touchStart', [center]);
    await touch('touchMove', [{ ...center, x: center.x + 35, y: center.y - 35 }]);
    await advance(page, 400);
    const moved = await page.evaluate(() => ({ x: window.fixture.game.players[0].x, z: window.fixture.game.players[0].z, input: window.fixture.touchControls.vectors[0] }));
    expect(moved.x).toBeGreaterThan(initial.x + 0.5);
    expect(moved.z).toBeLessThan(initial.z - 0.5);
    expect(Math.hypot(moved.input.x, moved.input.z)).toBeCloseTo(1);
    await touch('touchMove', [center]);
    await advance(page, 300);
    await page.evaluate(() => { Object.assign(window.fixture.game.players[0], { x: 6.5, z: 7.5, carrying: true, vx: 0, vz: 0 }); });
    await touch('touchStart', [center, digPoint]);
    await advance(page, 100);
    expect(await page.evaluate(() => Boolean(window.fixture.game.players[0].dig))).toBe(true);
    await touch('touchEnd', [center]);
    await touch('touchMove', [{ ...center, x: center.x + 40 }]);
    await advance(page, 100);
    expect(await page.evaluate(() => window.fixture.game.players[0].dig)).toBeNull();
    expect(await page.evaluate(() => window.fixture.game.players[0].carrying)).toBe(true);
    await touch('touchCancel', []);
    expect(await page.evaluate(() => window.fixture.touchControls.vectors)).toEqual([{ x: 0, z: 0 }, { x: 0, z: 0 }]);
    await expect(page.locator('[data-joystick="0"]')).not.toHaveClass(/engaged/);
    await advance(page, 300);
    await page.touchscreen.tap(digPoint.x, digPoint.y);
    await advance(page, 700);
    expect(await page.evaluate(() => window.fixture.game.scores[0])).toBe(1);
    expect(await page.evaluate(() => scrollY)).toBe(initial.scroll);
    await page.screenshot({ path: testInfo.outputPath('mobile-joystick.png') });
    // Both humans can steer independently with simultaneous touches.
    const ash = await page.locator('[data-joystick="1"]').boundingBox();
    const ashPoint = { id: 3, x: ash.x + ash.width / 2 - 35, y: ash.y + ash.height / 2 };
    await touch('touchStart', [{ ...center, x: center.x + 35 }, ashPoint]);
    const vectors = await page.evaluate(() => window.fixture.touchControls.vectors);
    expect(vectors[0].x).toBe(1); expect(vectors[1].x).toBe(-1);
    await page.locator('#pause-button').click();
    expect(await page.evaluate(() => window.fixture.touchControls.vectors)).toEqual([{ x: 0, z: 0 }, { x: 0, z: 0 }]);
    await touch('touchEnd', []);
    expect(errors).toEqual([]);
  });

  test('human vs AI shows one joystick and one dig button, including narrow landscape layouts', async ({ page }) => {
    await fixture(page, 'survival', 'ai');
    await expect(page.locator('[data-joystick="0"]')).toBeVisible();
    await expect(page.locator('[data-joystick="1"]')).toBeHidden();
    await expect(page.locator('[data-bury="0"]')).toBeVisible();
    await page.setViewportSize({ width: 320, height: 568 });
    await advance(page, 100);
    const overflow = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(el => {
      const box = el.getBoundingClientRect(); return box.width > 0 && box.right > innerWidth + 1;
    }).map(el => `${el.tagName}.${el.className}`));
    expect(overflow).toEqual([]);
    await page.setViewportSize({ width: 844, height: 390 });
    const dock = await page.locator('.touch-controls').boundingBox();
    expect(dock.y + dock.height).toBeCloseTo(390);
    expect(dock.height).toBeLessThan(145);
  });
});

test('baskets fill, wait for the squirrels, hoist on a pausable clock, disappear in leaves, and lower for dawn', async ({ page }, testInfo) => {
  test.setTimeout(60000);
  await fixture(page, 'survival');
  const initial = await page.evaluate(() => {
    const { game, forest } = window.fixture;
    for (const player of game.players) for (let i = 0; i < 5; i++) {
      Object.assign(player, { x: player.id ? 39.5 : 0.5, z: 7.5, carrying: true, vx: 0, vz: 0 });
      game.update(0.01);
    }
    forest.render(0, 0);
    return forest.baskets.map(b => ({ y: b.basket.position.y, full: b.contents.filter(a => a.visible).length, rope: b.rope.scale.y }));
  });
  expect(initial.every(b => b.y < 0.1 && b.full === 5 && b.rope > 10)).toBe(true);
  await page.locator('#arena').screenshot({ path: testInfo.outputPath('baskets-at-tree-bases.png') });
  const halfway = await page.evaluate(() => {
    const { game, forest } = window.fixture;
    game.update(60 - game.elapsed); forest.render(0, 0);
    game.update(3); forest.render(0, 0);
    const waited = forest.baskets.every(b => b.basket.position.y < 0.1) && forest.squirrels.every(s => s.root.position.y > 11);
    game.update(1); forest.render(0, 0);
    const positions = forest.baskets.map(b => b.basket.position.toArray());
    const ropeLengths = forest.baskets.map(b => b.rope.scale.y);
    game.pause(); game.update(10); forest.render(10, 0);
    return { waited, positions, ropeLengths, frozen: JSON.stringify(positions) === JSON.stringify(forest.baskets.map(b => b.basket.position.toArray())) };
  });
  expect(halfway.waited).toBe(true);
  expect(halfway.frozen).toBe(true);
  expect(halfway.positions.every(p => p[1] > 4 && p[1] < 7)).toBe(true);
  expect(halfway.ropeLengths.every(n => n > 4 && n < 7)).toBe(true);
  await page.locator('#arena').screenshot({ path: testInfo.outputPath('baskets-being-reeled-up.png') });
  const hidden = await page.evaluate(() => {
    const { game, forest } = window.fixture;
    game.resume(); game.update(1); forest.render(0, 0);
    const heights = forest.baskets.map(b => b.basket.position.y);
    // Compare actual rendered pixels with and without the baskets. Freeze
    // shadow maps so the comparison tests canopy occlusion, not their shadows.
    forest.renderer.shadowMap.autoUpdate = false;
    forest.renderer.render(forest.scene, forest.camera);
    const withBaskets = forest.canvas.toDataURL();
    forest.baskets.forEach(b => { b.root.visible = false; });
    forest.renderer.render(forest.scene, forest.camera);
    const withoutBaskets = forest.canvas.toDataURL();
    forest.baskets.forEach(b => { b.root.visible = true; });
    forest.renderer.shadowMap.autoUpdate = true;
    return { heights, occluded: withBaskets === withoutBaskets };
  });
  expect(hidden.heights.every(y => y > 10)).toBe(true);
  expect(hidden.occluded).toBe(true);
  const dawn = await page.evaluate(() => {
    const { game, forest } = window.fixture;
    game.update(3 + 1.5); forest.render(0, 0);
    const lowering = forest.baskets.map(b => b.basket.position.y);
    game.update(1.5); forest.render(0, 0);
    return { lowering, grounded: forest.baskets.every(b => b.basket.position.y < 0.1), empty: forest.baskets.every(b => b.contents.every(a => !a.visible)) };
  });
  expect(dawn.lowering.every(y => y > 4 && y < 7)).toBe(true);
  expect(dawn.grounded).toBe(true); expect(dawn.empty).toBe(true);
  await page.evaluate(() => { const { game, forest } = window.fixture; game.nextRound(); game.players[1].eliminated = true; game.players[1].eliminatedRound = 1; forest.render(0, 0); });
  expect(await page.evaluate(() => window.fixture.forest.baskets[1].basket.position.y)).toBeGreaterThan(10);
});

test('Survival baskets stay clear of the descent and disappear when switching to Arcade', async ({ page }, testInfo) => {
  await fixture(page, 'survival');
  const descend = await page.evaluate(() => {
    const {game,forest} = window.fixture;
    game.phase = 'countdown'; game.countdown = 1.5;
    forest.render(0, 1/60);
    return forest.baskets.map((b,id) => ({
      visible:b.root.visible, basketZ:b.root.position.z,
      squirrelZ:forest.squirrels[id].root.position.z,
      xGap:Math.abs(b.root.position.x - forest.squirrels[id].root.position.x),
    }));
  });
  expect(descend.every(b => b.visible && b.basketZ - b.squirrelZ > 1.5 && b.xGap > 0.5)).toBe(true);
  await page.locator('#arena').screenshot({path:testInfo.outputPath('basket-clear-of-descent.png')});
  await page.evaluate(() => {
    const {game,forest} = window.fixture;
    game.countdown = 1.2; forest.render(0, 1/60);
  });
  await page.locator('#arena').screenshot({path:testInfo.outputPath('basket-clear-of-first-steps.png')});
  const visibility = await page.evaluate(() => {
    const {game,forest} = window.fixture;
    const states = [];
    game.reset('arcade'); forest.render(0, 0);
    states.push(forest.baskets.every(b => !b.root.visible));
    game.phase = 'countdown'; game.countdown = 2; forest.render(0, 0);
    states.push(forest.baskets.every(b => !b.root.visible));
    game.start(); game.update(60); forest.render(0, 0);
    states.push(forest.baskets.every(b => !b.root.visible));
    game.update(4); forest.render(0, 0);
    states.push(forest.baskets.every(b => !b.root.visible));
    game.reset('survival'); forest.render(0, 0);
    states.push(forest.baskets.every(b => b.root.visible));
    return states;
  });
  expect(visibility).toEqual([true,true,true,true,true]);
});
