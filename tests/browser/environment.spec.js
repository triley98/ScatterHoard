import { test, expect } from '@playwright/test';

test('forest obstacles, wind, and sunlight follow the round and five-second break', async ({ page }, testInfo) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1400, height: 700 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/forest-fixture', route => route.fulfill({
    contentType: 'text/html',
    body: `<body style="margin:0"><div style="width:100vw;height:100vh"><canvas id="forest"></canvas></div>
    <script type="module">
      import { Game } from '/src/game.js';
      import { ForestScene } from '/src/scene.js';
      const game = new Game({random: () => 0.25});
      game.start();
      const forest = new ForestScene(document.querySelector('canvas'), game);
      forest.render(0, 1/60);
      window.fixture = {game, forest};
    </script></body>`,
  }));
  await page.goto('/forest-fixture');
  await page.waitForFunction(() => window.fixture);
  const daytime = await page.evaluate(() => {
    const {game, forest} = window.fixture;
    return {
      rocks: forest.rockGroup.children.filter(c => c.name === 'natural-boulder').length,
      stumps: forest.rockGroup.children.filter(c => c.name === 'tree-stump').length,
      intensity: forest.sun.intensity,
      position: forest.sun.position.toArray(),
      stumpsInSnapshot: game.snapshot().stumps.length,
    };
  });
  expect(daytime).toEqual({rocks:4, stumps:4, intensity:3.2, position:[-14,25,14], stumpsInSnapshot:4});
  await page.screenshot({path:testInfo.outputPath('daylight.png')});
  const later = await page.evaluate(() => {
    const {game, forest} = window.fixture;
    game.update(45); forest.render(45, 1/60);
    const beforeFade = forest.sun.intensity;
    const leafX = forest.windLeaves.leaves[0].x;
    game.update(7.5); forest.render(52.5, 1);
    const sunset = {intensity: forest.sun.intensity, x: forest.sun.position.x};
    const drifting = forest.windLeaves.leaves[0].x !== leafX;
    game.pause();
    const frozen = forest.windLeaves.leaves[0].x;
    const lightX = forest.sun.position.x;
    game.update(10); forest.render(62.5, 1);
    return {beforeFade, sunset, drifting, paused: forest.windLeaves.leaves[0].x === frozen && forest.sun.position.x === lightX};
  });
  expect(later.beforeFade).toBe(3.2);
  expect(later.sunset.intensity).toBeCloseTo(1.95);
  expect(later.sunset.x).toBeGreaterThan(daytime.position[0]);
  expect(later.drifting).toBe(true);
  expect(later.paused).toBe(true);
  await page.screenshot({path:testInfo.outputPath('sunset.png')});
  const transition = await page.evaluate(() => {
    const {game, forest} = window.fixture;
    game.resume(); game.update(60-game.elapsed); forest.render(60, 1/60);
    const breakStart = game.intermissionRemaining;
    game.update(4.99);
    const waiting = game.phase === 'intermission';
    game.update(0.01); forest.render(65, 1/60);
    forest.reducedMotion = true; forest.render(65, 1/60);
    return {breakStart, waiting, phase:game.phase, round:game.round, intensity:forest.sun.intensity, leavesHidden:!forest.windLeaves.mesh.visible};
  });
  expect(transition).toEqual({breakStart:5, waiting:true, phase:'playing', round:2, intensity:3.2, leavesHidden:true});
  expect(errors).toEqual([]);
});
