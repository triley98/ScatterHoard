import { test, expect } from '@playwright/test';

test('forest obstacles, wind, sunlight, and squirrels follow the full round transition', async ({ page }, testInfo) => {
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
  expect(later.sunset.intensity).toBeCloseTo(2.5);
  expect(later.sunset.x).toBeGreaterThan(daytime.position[0]);
  expect(later.drifting).toBe(true);
  expect(later.paused).toBe(true);
  await page.screenshot({path:testInfo.outputPath('sunset.png')});
  const transition = await page.evaluate(() => {
    const {game, forest} = window.fixture;
    game.resume();
    game.players[0].x = 36; game.players[1].x = 4;
    game.update(60-game.elapsed); forest.render(60, 1/60);
    const breakStart = game.intermissionRemaining;
    const exitStarts = forest.squirrels.map(s => s.root.position.x);
    game.update(2.4); forest.render(62.4, 1/60);
    const climbing = forest.squirrels.map(s => ({y:s.root.position.y, pitch:s.body.rotation.x}));
    game.pause();
    const frozen = forest.squirrels.map(s => s.root.position.toArray());
    game.update(10); forest.render(72.4, 1/60);
    const climbPaused = JSON.stringify(frozen) === JSON.stringify(forest.squirrels.map(s => s.root.position.toArray()));
    game.resume(); game.update(0.6); forest.render(63, 1/60);
    const treetops = forest.squirrels.map(s => s.root.position.toArray());
    game.update(3); forest.render(66, 1/60);
    const resetAtBlack = forest.sun.intensity;
    game.update(5.99);
    const waiting = game.phase === 'intermission';
    game.update(0.01); forest.render(72, 1/60);
    forest.reducedMotion = true; forest.render(72, 1/60);
    return {breakStart, exitStarts, climbing, climbPaused, treetops, resetAtBlack,
      waiting, phase:game.phase, round:game.round, intensity:forest.sun.intensity, leavesHidden:!forest.windLeaves.mesh.visible};
  });
  expect(transition.breakStart).toBe(12);
  expect(transition.exitStarts).toEqual([16,-16]);
  expect(transition.climbing.every(s => s.y > 1 && s.pitch < -1.5)).toBe(true);
  expect(transition.climbPaused).toBe(true);
  expect(transition.treetops[0][0]).toBeCloseTo(-22);
  expect(transition.treetops[1][0]).toBeCloseTo(22);
  expect(transition.treetops.every(p => p[1] > 7)).toBe(true);
  expect(transition.resetAtBlack).toBe(3.2);
  expect(transition.waiting).toBe(true);
  expect(transition.phase).toBe('playing');
  expect(transition.round).toBe(2);
  expect(transition.intensity).toBe(3.2);
  expect(transition.leavesHidden).toBe(true);
  const canopy = await page.evaluate(() => {
    const {game, forest} = window.fixture;
    forest.reducedMotion = false;
    const hiddenByLeaves = () => {
      forest.render(0, 0);
      const visible = forest.canvas.toDataURL();
      forest.squirrels.forEach(s => { s.root.visible = false; });
      forest.render(0, 0);
      const hidden = forest.canvas.toDataURL();
      forest.squirrels.forEach(s => { s.root.visible = true; });
      return visible === hidden;
    };
    game.phase = 'countdown'; game.countdown = 3;
    const entrance = hiddenByLeaves();
    game.countdown = 2;
    forest.render(0, 0);
    const emerged = forest.squirrels.every(s => s.root.position.y < 7);
    game.phase = 'intermission'; game.intermissionRemaining = 9;
    const exit = hiddenByLeaves();
    return {entrance, emerged, exit};
  });
  expect(canopy).toEqual({entrance:true, emerged:true, exit:true});
  expect(errors).toEqual([]);
});
