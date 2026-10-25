import { chooseGame } from './helpers.js';
import { test, expect } from '@playwright/test';

test.use({ deviceScaleFactor: 0.5 });

async function advance(page, ms) {
  for (let left = ms; left > 0; left -= 200)
    await page.clock.fastForward(Math.min(left, 200));
}

test('all powerups use the requested octagonal icons above their player, without text popups', async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1000, height: 850 });
  await page.addInitScript(() => {
    Math.random = () =>
      window.badgeRolls?.length ? window.badgeRolls.shift() : 0.5;
  });
  await page.clock.install({ time: new Date('2026-10-24T00:00:00Z') });
  await page.goto('/');
  await chooseGame(page);
  await page.clock.pauseAt(new Date('2026-10-24T00:10:00Z'));
  await page.getByRole('button', { name: 'Let’s forage' }).click();
  await advance(page, 3200);
  await page.keyboard.press('Space');
  await advance(page, 700);
  await expect(page.locator('[data-icon="miss"]')).toHaveCount(0);
  await expect(page.locator('.octagon-badge')).toHaveCount(0);
  for (const [selection, icon, harmful] of [
    [0.1, 'acorn-rain', false],
    [0.3, 'winged-feet', false],
    [0.5, 'crow', false],
    [0.7, 'turtle', true],
    [0.9, 'crow', true],
  ]) {
    await page.evaluate((selection) => {
      window.badgeRolls = [0.05, selection];
    }, selection);
    await page.keyboard.press('Space');
    await advance(page, 700);
    const badge = page.locator(
      `.squirrel-badges[data-player="0"] [data-icon="${icon}"]${harmful ? '.harmful' : ':not(.harmful)'}`,
    );
    await expect(badge).toBeVisible();
    expect(
      await badge.evaluate((el) => getComputedStyle(el).clipPath),
    ).toContain('polygon');
    const box = await badge.boundingBox();
    const board = await page.locator('#game-canvas').boundingBox();
    expect(box.x).toBeGreaterThan(board.x);
    expect(box.y).toBeGreaterThan(board.y);
    expect(box.y + box.height).toBeLessThan(board.y + board.height * 0.75);
  }
  const turtle = page.locator('[data-player="0"] [data-icon="turtle"]');
  const anchor = page.locator('.squirrel-badges[data-player="0"]');
  const before = await anchor.evaluate((el) => parseFloat(el.style.left));
  await page.keyboard.down('d');
  await advance(page, 500);
  await page.keyboard.up('d');
  const after = await anchor.evaluate((el) => parseFloat(el.style.left));
  expect(after).toBeGreaterThan(before + 5);
  await expect(page.locator('#arena-message, #powerup-notice')).toHaveCount(0);
  await advance(page, 6000);
  await expect(turtle).toHaveCount(0);
});
