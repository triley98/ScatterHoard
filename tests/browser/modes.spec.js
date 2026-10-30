import { test, expect } from '@playwright/test';
import { chooseGame } from './helpers.js';

test.use({deviceScaleFactor:0.25});
async function advance(page, ms) {
  for (let left=ms; left>0; left-=200) await page.clock.fastForward(Math.min(200,left));
}
async function fixture(page) {
  await page.route('**/src/main.js*',async route => {
    const response=await route.fetch();
    await route.fulfill({response,body:`${await response.text()}\nwindow.fixture={game,forest,opponent};`});
  });
  await page.clock.install({time:new Date('2026-10-24T00:00:00Z')});
  await page.goto('/');
  await page.clock.pauseAt(new Date('2026-10-24T00:10:00Z'));
}

test('the main menu offers both game modes, then all three match formats, and fits mobile', async ({page},testInfo) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await expect(page.locator('#main-menu')).toBeVisible();
  await expect(page.locator('#match-view')).toBeHidden();
  await page.screenshot({path:testInfo.outputPath('main-menu-mobile.png'),fullPage:true});
  for (const mode of ['Arcade','Survival']) {
    await page.getByRole('button',{name:mode,exact:true}).click();
    for (const name of ['Local human vs human','Human vs AI','Online human vs human'])
      await expect(page.getByRole('button',{name,exact:true})).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await page.getByRole('button',{name:'Back to game modes',exact:false}).click();
  }
});

test('Survival HUD tracks deliveries, reserves, elimination, solo continuation, black results and rematch', async ({page},testInfo) => {
  test.setTimeout(60000);
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await fixture(page); await chooseGame(page,'survival');
  await expect(page.locator('#red-score')).toHaveText('0/5');
  await expect(page.locator('#round-label')).toHaveText('SURVIVAL · ROUND 1');
  await expect(page.locator('#drop-label')).toContainText('EVERY 3 SECONDS');
  await page.getByRole('button',{name:'Let’s forage'}).click(); await advance(page,3100);
  await page.evaluate(() => {
    const {game}=window.fixture;
    for(let i=0;i<5;i++) {
      Object.assign(game.players[0],{x:0.5,z:7.5,carrying:true,vx:0,vz:0}); game.update(0.01);
    }
    Object.assign(game.players[0],{x:6.5,z:7.5,carrying:true});
    game.requestDig(0); game.update(0.55);
  });
  await advance(page,100);
  await expect(page.locator('#red-score')).toHaveText('5/5');
  await expect(page.locator('#red-score-label')).toHaveText('DELIVERED');
  await expect(page.locator('[data-player="0"] [data-icon="acorn"]')).toHaveAccessibleName('Red delivered 5 of 5 acorns home.');
  await page.screenshot({path:testInfo.outputPath('survival-delivery-goals.png')});
  await page.evaluate(() => {const {game}=window.fixture;game.update(60-game.elapsed);});
  await advance(page,100);
  await expect(page.locator('#grey-score')).toHaveText('OUT');
  await expect(page.locator('#elimination-notice')).toBeVisible();
  await expect(page.locator('#elimination-title')).toHaveText('Ash is out');
  await expect(page.locator('#elimination-detail')).toContainText('Ash: 0 of 5 delivered');
  await expect(page.locator('#elimination-detail')).toContainText('Red continues next round');
  await page.screenshot({path:testInfo.outputPath('survival-elimination.png')});
  await expect(page.locator('#results-dialog')).toBeHidden();
  await page.evaluate(() => {const {game}=window.fixture;game.update(game.intermissionRemaining);});
  await advance(page,100);
  await expect(page.locator('#round-label')).toHaveText('SURVIVAL · ROUND 2');
  await expect(page.locator('#clock-caption')).toContainText('every 5s');
  await expect(page.locator('#elimination-notice')).toBeHidden();
  expect(await page.evaluate(() => window.fixture.forest.squirrels[1].root.visible)).toBe(false);
  await page.evaluate(() => {
    const {game}=window.fixture;
    Object.assign(game.players[0],{x:6.5,z:7.5}); game.requestDig(0); game.update(0.55);
    Object.assign(game.players[0],{x:0.5,z:7.5}); game.update(0.01);
  });
  await advance(page,100);
  await expect(page.locator('#red-score')).toHaveText('1/5');
  await page.evaluate(() => {const {game}=window.fixture;game.update(60-game.elapsed);});
  await advance(page,100);
  await expect(page.locator('#elimination-title')).toHaveText('Red is out');
  await expect(page.locator('#elimination-detail')).toContainText('The Survival run is over');
  await page.evaluate(() => {const {game}=window.fixture;game.update(game.intermissionRemaining);});
  await advance(page,100);
  await expect(page.locator('#results-dialog')).toBeVisible();
  await expect(page.locator('#elimination-notice')).toBeHidden();
  await expect(page.locator('#round-fade')).toHaveCSS('opacity','1');
  await expect(page.locator('#results-title')).toContainText('Red lasted');
  await expect(page.locator('#result-red')).toHaveText('1');
  await expect(page.locator('#result-grey')).toHaveText('0');
  await page.getByRole('button',{name:'One more match'}).click(); await advance(page,100);
  await expect(page.locator('#red-score')).toHaveText('0/5');
  expect(await page.evaluate(() => window.fixture.game.players.every(p=>!p.eliminated))).toBe(true);
  expect(errors).toEqual([]);
});

test('the centered Survival notice handles simultaneous eliminations without requiring events', async ({page},testInfo) => {
  test.setTimeout(45000);
  await page.setViewportSize({width:390,height:844});
  await fixture(page); await chooseGame(page,'survival');
  await page.getByRole('button',{name:'Let’s forage'}).click(); await advance(page,3100);
  await page.evaluate(() => {
    const {game}=window.fixture;
    game.update(60-game.elapsed);
    game.drainEvents(); // A reconnect receives this state without the original events.
  });
  await advance(page,100);
  await expect(page.locator('#elimination-notice')).toBeVisible();
  await expect(page.locator('#elimination-title')).toHaveText('Red and Ash are out');
  await expect(page.locator('#elimination-detail')).toContainText('Red: 0 of 5 delivered · Ash: 0 of 5 delivered');
  const card=await page.locator('.elimination-card').boundingBox();
  const arena=await page.locator('#arena').boundingBox();
  expect(card.x+card.width/2).toBeCloseTo(arena.x+arena.width/2,0);
  expect(card.y+card.height/2).toBeCloseTo(arena.y+arena.height/2,0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({path:testInfo.outputPath('survival-both-out-mobile.png')});
  await advance(page,5200);
  await expect(page.locator('#elimination-notice')).toBeVisible();
  await expect(page.locator('#round-fade')).toHaveAttribute('data-stage','fade-out');
  await advance(page,3000);
  await expect(page.locator('#elimination-notice')).toBeHidden();
  await expect(page.locator('#results-dialog')).toBeVisible();
  await expect(page.locator('#round-fade')).toHaveCSS('opacity','1');
});

for (const mode of ['arcade','survival']) test(`a real local AI ${mode} opponent forages and completes its objective`, async ({page}) => {
  test.setTimeout(60000);
  // Rendering is tested above; preserve the actual scene and controller while
  // avoiding hundreds of software draw calls in this AI clock simulation.
  await page.route('**/src/scene.js*',async route => {
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace('this.renderer.render(this.scene, this.camera);','void 0;')});
  });
  await fixture(page); await chooseGame(page,mode,'ai');
  await expect(page.locator('#ash-seat-label')).toHaveText('AI OPPONENT');
  await expect(page.locator('#ai-controls-note')).toBeVisible();
  await expect(page.locator('.grey-controls .control-inputs')).toBeHidden();
  await page.getByRole('button',{name:'Let’s forage'}).click(); await advance(page,3100);
  await page.evaluate(() => {
    const {game,opponent}=window.fixture;
    Object.assign(game.players[1],{x:31.5,z:7.5,vx:0,vz:0,carrying:false}); opponent.reset();
    game.acorns=Array.from({length:7},(_,id)=>({id:100+id,x:31.5+id*0.15,z:7.5,born:game.matchElapsed}));
  });
  await advance(page,1000);
  await advance(page,19000);
  if(mode === 'survival') await expect(page.locator('#grey-score')).toHaveText('5/5');
  else expect(await page.evaluate(() => window.fixture.game.scores[1])).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.fixture.game.players[0].x)).toBe(8.5);
});

test('canceling a pending online host request keeps the user on the main menu', async ({page}) => {
  let release;
  const gate=new Promise(resolve=>{release=resolve;});
  await page.route('**/api/rooms',async route=>{
    await gate;
    await route.fulfill({contentType:'application/json',body:JSON.stringify({code:'ABC234',token:'test-ticket'})});
  });
  await page.goto('/'); await chooseGame(page,'survival','online');
  await page.getByRole('button',{name:'Host a clearing'}).click();
  await expect(page.locator('#host-room')).toBeDisabled();
  await page.getByRole('button',{name:'Close online lobby'}).click();
  release();
  await expect.poll(()=>page.evaluate(()=>sessionStorage.getItem('scatterhoard:http://127.0.0.1:5173:ABC234'))).toBe('test-ticket');
  await expect(page.locator('#main-menu')).toBeVisible();
  await expect(page.locator('#match-view')).toBeHidden();
});
