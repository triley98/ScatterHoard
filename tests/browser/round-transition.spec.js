import { chooseGame } from './helpers.js';
import { test, expect } from '@playwright/test';

test.use({ deviceScaleFactor: 0.5 });

async function advance(page, milliseconds) {
  for (let left = milliseconds; left > 0; left -= 200)
    await page.clock.fastForward(Math.min(left, 200));
}

async function openGame(page) {
  // Observe the real app without adding development globals to production.
  await page.route('**/src/main.js*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: `${await response.text()}\nwindow.fixture = { game, forest };` });
  });
  await page.clock.install({ time: new Date('2026-10-24T00:00:00Z') });
  await page.goto('/');
  await chooseGame(page);
  await page.waitForFunction(() => window.fixture);
  await page.clock.pauseAt(new Date('2026-10-24T00:10:00Z'));
  await page.getByRole('button', { name: 'Let’s forage' }).click();
  await advance(page, 3100);
}

test('held dig keys never scroll or activate results, and fades finish before the countdown', async ({ page }, testInfo) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1000, height: 700 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await openGame(page);
  await page.evaluate(() => {
    const { game } = window.fixture;
    game.update(59.8 - game.elapsed);
    game.applyPowerup(game.players[0], 'speed-boost');
  });
  const scroll = await page.evaluate(() => scrollY);
  await page.keyboard.down('Space');
  await page.keyboard.down('Enter');
  expect(await page.evaluate(() => window.fixture.game.players.every(p => p.dig))).toBe(true);
  await advance(page, 250);
  await expect(page.locator('#round-fade')).toHaveAttribute('data-stage', 'returning');
  await expect(page.locator('#countdown-overlay')).toBeHidden();
  await page.keyboard.down('Space');
  await page.keyboard.down('Enter');
  await advance(page, 500);
  expect(await page.evaluate(() => scrollY)).toBe(scroll);
  await page.keyboard.up('Space');
  await page.keyboard.up('Enter');
  // Fresh presses during the break must also stay on the board.
  await page.keyboard.press('Space');
  await page.keyboard.press('Enter');
  await advance(page, 250);
  expect(await page.evaluate(() => scrollY)).toBe(scroll);

  await page.evaluate(() => window.fixture.game.update(window.fixture.game.intermissionRemaining - 7.5));
  await advance(page, 20);
  await expect(page.locator('#round-fade')).toHaveAttribute('data-stage', 'fade-out');
  expect(Number(await page.locator('#round-fade').evaluate(el => el.style.opacity))).toBeCloseTo(0.5, 1);
  await page.keyboard.press('Escape');
  const opacity = await page.locator('#round-fade').evaluate(el => el.style.opacity);
  await advance(page, 1000);
  expect(await page.locator('#round-fade').evaluate(el => el.style.opacity)).toBe(opacity);
  await page.getByRole('button', { name: 'Back to the clearing' }).click();

  await page.evaluate(() => window.fixture.game.update(window.fixture.game.intermissionRemaining - 6));
  await advance(page, 20);
  await expect(page.locator('#round-fade')).toHaveAttribute('data-stage', 'fade-in');
  expect(Number(await page.locator('#round-fade').evaluate(el => el.style.opacity))).toBeGreaterThan(0.99);
  await page.screenshot({ path: testInfo.outputPath('black-between-rounds.png') });
  await expect(page.locator('#countdown-overlay')).toBeHidden();
  await advance(page, 1500);
  expect(Number(await page.locator('#round-fade').evaluate(el => el.style.opacity))).toBeCloseTo(0.5, 1);
  await expect(page.locator('#countdown-overlay')).toBeHidden();
  await advance(page, 1500);
  await expect(page.locator('#round-fade')).toHaveCSS('opacity', '0');
  await expect(page.locator('#countdown-overlay')).toBeVisible();
  await expect(page.locator('#countdown-number')).toHaveText('3');
  await page.screenshot({ path: testInfo.outputPath('daylight-before-round-two.png') });
  await advance(page, 3000);
  await expect(page.locator('#round-label')).toHaveText('ROUND 2 OF 3');
  await expect(page.locator('#countdown-overlay')).toBeHidden();
  await expect(page.locator('[data-player="0"] [data-icon="winged-feet"]')).toBeVisible();

  // A held dig must not click the rematch button when results take focus.
  await page.evaluate(() => {
    const { game } = window.fixture;
    game.update(60 - game.elapsed + 14 + 59.8);
  });
  await page.keyboard.down('Space');
  await page.keyboard.down('Enter');
  await advance(page, 8400);
  await expect(page.locator('#results-dialog')).toBeVisible();
  await expect(page.locator('#round-fade')).toHaveCSS('opacity', '1');
  await expect(page.locator('#round-fade')).toHaveAttribute('data-stage', 'black');
  const finalSun = await page.evaluate(() => window.fixture.forest.sun.intensity);
  expect(finalSun).toBeCloseTo(1.8);
  await page.keyboard.down('Space');
  await page.keyboard.down('Enter');
  await page.keyboard.up('Space');
  await page.keyboard.up('Enter');
  await advance(page, 100);
  await expect(page.locator('#results-dialog')).toBeVisible();
  await advance(page, 3500);
  await expect(page.locator('#round-fade')).toHaveCSS('opacity', '1');
  await page.getByRole('button', { name: 'One more match' }).click();
  await advance(page, 100);
  await expect(page.locator('#round-fade')).toHaveCSS('opacity', '0');
  expect(await page.evaluate(() => window.fixture.forest.sun.intensity)).toBe(3.2);
  expect(await page.evaluate(() => window.fixture.game.phase)).toBe('countdown');
  expect(errors).toEqual([]);
});

test('keyboard activation and typing still work in menus', async ({ page }) => {
  await page.goto('/');
  await chooseGame(page);
  await page.getByRole('button', { name: 'How to Play' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#help-dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Got it. Let’s go.' }).focus();
  await page.keyboard.press('Space');
  await expect(page.locator('#help-dialog')).toBeHidden();
  await page.getByRole('button', { name: 'Online with a friend' }).click();
  await page.locator('#room-code').fill('ABC234');
  await expect(page.locator('#room-code')).toHaveValue('ABC234');
});
