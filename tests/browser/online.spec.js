import { test, expect } from '@playwright/test';

test('two separate browsers host, join, synchronize movement, reconnect, and keep burials private', async ({
  browser,
}) => {
  test.setTimeout(90000);
  const hostContext = await browser.newContext({
    baseURL: 'http://127.0.0.1:5173',
    viewport: { width: 1100, height: 850 },
  });
  const guestContext = await browser.newContext({
    baseURL: 'http://127.0.0.1:5173',
    viewport: { width: 1100, height: 850 },
  });
  const host = await hostContext.newPage(),
    guest = await guestContext.newPage();
  const errors = [],
    hostStates = [],
    guestStates = [];
  for (const [page, states] of [
    [host, hostStates],
    [guest, guestStates],
  ]) {
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('websocket', (socket) =>
      socket.on('framereceived', ({ payload }) => {
        try {
          const data = JSON.parse(String(payload));
          if (data.type === 'state') states.push(data.state);
        } catch {
          /* Vite's keepalive is not a game message. */
        }
      }),
    );
  }
  try {
    await host.goto('/');
    await host.getByRole('button', { name: 'Online with a friend' }).click();
    await host.getByRole('button', { name: 'Host a clearing' }).click();
    await expect(host.locator('#room-description')).toContainText('You’re Red');
    const code = (await host.locator('#room-description').textContent()).match(
      /Room ([A-Z2-9]{6})/,
    )[1];
    await guest.goto(`/?room=${code}`);
    await expect(guest.locator('#lobby-dialog')).toBeVisible();
    await guest.getByRole('button', { name: 'Join clearing' }).click();
    await expect(guest.locator('#room-description')).toContainText(
      'You’re Ash',
    );
    await host.getByRole('button', { name: 'Ready to forage' }).click();
    await expect(host.locator('#start-button')).toHaveText(
      'Waiting for your friend…',
    );
    await guest.getByRole('button', { name: 'Ready to forage' }).click();
    await expect
      .poll(() => hostStates.at(-1)?.phase, { timeout: 10000 })
      .toBe('playing');
    await expect
      .poll(() => guestStates.at(-1)?.phase, { timeout: 10000 })
      .toBe('playing');
    const x = hostStates.at(-1).players[0].x;
    await host.keyboard.down('d');
    await expect
      .poll(() => guestStates.at(-1)?.players[0].x, { timeout: 6000 })
      .toBeGreaterThan(x + 1);
    await host.keyboard.up('d');
    await expect
      .poll(() => hostStates.at(-1)?.players[0].x)
      .toBeGreaterThan(x + 1);
    await expect
      .poll(() => {
        const h = hostStates.at(-1)?.players[0],
          g = guestStates.at(-1)?.players[0];
        return h?.vx === 0 && g?.vx === 0 && Math.abs(h.x - g.x) < 1e-6;
      })
      .toBe(true);
    expect(hostStates.at(-1).players[1].x).toBe(31.5);

    // Arrow controls operate the assigned grey squirrel on the second device.
    const greyX = guestStates.at(-1).players[1].x;
    await guest.keyboard.down('ArrowLeft');
    await expect
      .poll(() => hostStates.at(-1)?.players[1].x)
      .toBeLessThan(greyX - 1);
    await guest.keyboard.up('ArrowLeft');
    await expect.poll(() => hostStates.at(-1)?.players[1].vx).toBe(0);

    // Reload retains only this browser's private session ticket and rejoins its seat.
    await guest.reload();
    await guest.getByRole('button', { name: 'Join clearing' }).click();
    await expect(guest.locator('#room-description')).toContainText(
      'You’re Ash',
    );
    await expect
      .poll(() => hostStates.at(-1)?.phase, { timeout: 10000 })
      .toBe('playing');
    expect(guestStates.at(-1).scores).toEqual(hostStates.at(-1).scores);
    await host.reload();
    await host.getByRole('button', { name: 'Join clearing' }).click();
    await expect(host.locator('#room-description')).toContainText('You’re Red');
    await expect
      .poll(() => guestStates.at(-1)?.phase, { timeout: 10000 })
      .toBe('playing');
    for (const state of [...hostStates, ...guestStates]) {
      expect(state).not.toHaveProperty('buried');
      expect(JSON.stringify(state)).not.toMatch(
        /"(?:col|row|key|token|hostToken)":/,
      );
    }
    await guest.getByRole('button', { name: 'Leave room' }).click();
    await expect(guest.locator('#connection-status')).toHaveText(
      'Two squirrels. One screen.',
    );
    await expect.poll(() => hostStates.at(-1)?.phase).toBe('paused');
    expect(errors).toEqual([]);
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});

test('searching empty-handed shows an octagonal acorn rain badge above the finder', async ({
  page,
}) => {
  test.setTimeout(30000);
  await page.addInitScript(() => {
    Math.random = () => 0.05;
  });
  await page.clock.install({ time: new Date('2026-10-24T00:00:00Z') });
  await page.goto('/');
  await page.clock.pauseAt(new Date('2026-10-24T00:10:00Z'));
  await page.getByRole('button', { name: 'Let’s forage' }).click();
  for (let i = 0; i < 16; i++) await page.clock.fastForward(200);
  await page.keyboard.press('Space');
  await page.clock.fastForward(100);
  await expect(page.locator('#red-carry')).toHaveText('Searching…');
  for (let i = 0; i < 4; i++) await page.clock.fastForward(200);
  const badge = page.locator(
    '.squirrel-badges[data-player="0"] [data-icon="acorn-rain"]',
  );
  await expect(badge).toBeVisible();
  await expect(badge).toHaveAccessibleName(/Three extra acorns/);
  expect(await badge.evaluate((el) => getComputedStyle(el).clipPath)).toContain(
    'polygon',
  );
  await expect(page.locator('#powerup-notice')).toHaveCount(0);
  await expect(page.locator('#arena-message')).toHaveCount(0);
  await expect(page.locator('#clock-caption')).toContainText('+ 3 bonus');
});
