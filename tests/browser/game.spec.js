import { test, expect } from '@playwright/test';

test.use({ deviceScaleFactor: 0.5 });

async function advance(page, milliseconds) {
  // Each RAF sees <= 200ms, keeping the app's normal long-frame guard in effect.
  for (let remaining = milliseconds; remaining > 0; remaining -= 200) {
    await page.clock.fastForward(Math.min(200, remaining));
  }
}

test('a real browser can render, collect, bury, pause, finish, and rematch', async ({
  page,
}) => {
  test.setTimeout(300000);
  await page.setViewportSize({ width: 1000, height: 850 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Math.random = () => 0.25;
  });
  await page.clock.install({ time: new Date('2026-10-24T00:00:00Z') });
  await page.goto('/');
  await page.clock.pauseAt(new Date('2026-10-24T00:10:00Z'));
  await expect(
    page.getByRole('heading', { name: 'Small paws. Big plans.' }),
  ).toBeVisible();
  await expect(page.locator('#renderer-error')).toBeHidden();
  await expect(page.locator('#clock')).toHaveText('01:00');

  await page.getByRole('button', { name: 'How to play' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Make yourself at hoard.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Got it. Let’s go.' }).click();
  await page.getByRole('button', { name: 'Let’s forage' }).click();
  await expect(page.locator('#countdown-overlay')).toBeVisible();
  await advance(page, 3200);
  await expect(page.locator('#countdown-overlay')).toBeHidden();
  await expect(page.locator('#clock-caption')).toHaveText('1 of 36 drops');

  // The deterministic first drop is (10.5, 4.15), near Red's (8.5, 7.5).
  await page.keyboard.down('w');
  await advance(page, 430);
  await page.keyboard.up('w');
  await page.keyboard.down('d');
  await advance(page, 320);
  await page.keyboard.up('d');
  await advance(page, 250);
  await expect(page.locator('#red-carry')).toHaveText('Acorn in paws');
  await page.keyboard.press('Space');
  await advance(page, 100);
  await expect(page.locator('#red-carry')).toHaveText('Digging…');
  await advance(page, 600);
  await expect(page.locator('#red-score')).toHaveText('1');
  await expect(page.locator('#red-carry')).toHaveText('Paws empty');
  await page.keyboard.press('Space');
  await advance(page, 700);
  await expect(page.locator('#red-score')).toHaveText('0');
  await expect(page.locator('#red-carry')).toHaveText('Acorn in paws');
  await expect(
    page.locator('.squirrel-badges[data-player="0"] [data-icon="acorn"]'),
  ).toHaveAccessibleName('Red dug up an acorn.');
  await page.keyboard.press('Space');
  await advance(page, 700);
  await expect(page.locator('#red-score')).toHaveText('1');
  // Move Red away so the next acorn is available for Ash to collect.
  await page.keyboard.down('a');
  await advance(page, 500);
  await page.keyboard.up('a');
  await advance(page, 250);

  // Ash crosses the board. The second drop reuses the first cell in this fixture.
  await page.keyboard.down('ArrowLeft');
  await advance(page, 3000);
  await page.keyboard.up('ArrowLeft');
  await advance(page, 250);
  await page.keyboard.down('ArrowUp');
  await advance(page, 480);
  await page.keyboard.up('ArrowUp');
  await advance(page, 250);
  await expect(page.locator('#grey-carry')).toHaveText('Acorn in paws');
  await page.keyboard.press('Enter');
  await advance(page, 700);
  await expect(page.locator('#grey-carry')).toHaveText('Acorn in paws');
  await expect(
    page.locator('.squirrel-badges[data-player="1"] [data-icon="blocked"]'),
  ).toBeVisible();
  await page.keyboard.down('ArrowRight');
  await advance(page, 240);
  await page.keyboard.up('ArrowRight');
  await advance(page, 250);
  await page.keyboard.press('Enter');
  await advance(page, 700);
  await expect(page.locator('#red-score')).toHaveText('2');
  await expect(page.locator('#grey-score')).toHaveText('0');

  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('dialog', { name: 'Taking a breather.' }),
  ).toBeVisible();
  const pausedTime = await page.locator('#clock').textContent();
  await advance(page, 5000);
  await expect(page.locator('#clock')).toHaveText(pausedTime);
  await page.getByRole('button', { name: 'Back to the clearing' }).click();
  await page.getByRole('button', { name: 'How to play' }).click();
  const helpTime = await page.locator('#clock').textContent();
  await advance(page, 2000);
  await expect(page.locator('#clock')).toHaveText(helpTime);
  await page.keyboard.press('Escape');
  await expect(page.locator('#help-dialog')).toBeHidden();

  // All three rounds share the same board; only the third opens match results.
  await advance(page, 60000);
  await expect(page.locator('#round-label')).toHaveText('ROUND 2 OF 3');
  await expect(page.locator('#red-score')).toHaveText('2');
  await expect(page.locator('#results-dialog')).toBeHidden();
  await advance(page, 63000);
  await expect(page.locator('#round-label')).toHaveText('ROUND 3 OF 3');
  await expect(page.locator('#red-score')).toHaveText('2');
  await expect(page.locator('#results-dialog')).toBeHidden();
  await advance(page, 63000);
  await expect(page.locator('#clock')).toHaveText('00:00');
  await expect(page.locator('#results-dialog')).toBeVisible();
  await expect(page.locator('#results-title')).toContainText('Red takes');
  await expect(page.locator('#results-detail')).toContainText('36 dropped');
  await expect(page.locator('#results-rounds > div')).toHaveCount(3);
  await page.getByRole('button', { name: 'One more match' }).click();
  await advance(page, 3200);
  await expect(page.locator('#red-score')).toHaveText('0');
  await expect(page.locator('#grey-score')).toHaveText('0');
  await expect(page.locator('#red-carry')).toHaveText('Paws empty');
  expect(errors).toEqual([]);
});

test('the layout fits a narrow screen and sound and help controls work', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#renderer-error')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.getByRole('button', { name: 'Turn sound on' }).click();
  await expect(
    page.getByRole('button', { name: 'Turn sound off' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Turn sound off' }).click();
  await expect(
    page.getByRole('button', { name: 'Turn sound on' }),
  ).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'How to play' }).click();
  await expect(page.locator('#help-dialog')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Close instructions' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close instructions' }).click();
  await expect(page.locator('#help-dialog')).toBeHidden();
});
