import {test,expect} from '@playwright/test';

test.use({deviceScaleFactor:0.5});

test('patch rails and posts are hidden throughout Survival and restored for Arcade',async({page},info)=>{
  await page.route('**/fence-fixture',route=>route.fulfill({
    contentType:'text/html',
    body:`<body style="margin:0"><div style="height:100vh"><canvas></canvas></div>
      <script type="module">
        import {Game,RULES} from '/src/game.js';
        import {ForestScene} from '/src/scene.js';
        const game=new Game({mode:'survival',random:()=>0.25});
        const forest=new ForestScene(document.querySelector('canvas'),game);
        forest.render(0,0);
        window.fixture={game,forest,RULES};
      </script></body>`,
  }));
  await page.goto('/fence-fixture');
  await page.waitForFunction(()=>window.fixture);
  const initial=await page.evaluate(()=>{
    const {forest}=window.fixture;
    return {visible:forest.patchFences.visible,parts:forest.patchFences.children.length};
  });
  expect(initial).toEqual({visible:false,parts:14});
  await page.screenshot({path:info.outputPath('survival-without-fences.png')});
  const states=await page.evaluate(()=>{
    const {game,forest,RULES}=window.fixture;
    const results=[];
    for(const phase of ['ready','countdown','playing','paused','intermission','finished']){
      game.phase=phase;game.countdown=RULES.countdown;
      game.intermissionRemaining=RULES.intermission;game.resumePhase='playing';
      forest.render(0,0);
      results.push(forest.patchFences.visible);
    }
    // The same renderer also responds when an online snapshot changes the mode.
    Object.assign(game,{mode:'arcade',phase:'ready'});forest.render(0,0);
    results.push(forest.patchFences.visible);
    return results;
  });
  expect(states).toEqual([false,false,false,false,false,false,true]);
  await page.screenshot({path:info.outputPath('arcade-with-fences.png')});
  expect(await page.evaluate(()=>{
    const {game,forest}=window.fixture;
    game.reset('survival');forest.render(0,0);
    return forest.patchFences.visible;
  })).toBe(false);
});
