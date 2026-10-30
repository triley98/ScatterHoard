import {test,expect} from '@playwright/test';
import {chooseGame} from './helpers.js';

test.use({deviceScaleFactor:0.5});
test('Into the Woods settings work from the menu and pause and resume a local match',async({page},info)=>{
  test.setTimeout(60000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/main.js*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:`${await response.text()}\nwindow.fixture={game,forest};`});
  });
  await page.clock.install({time:new Date('2026-10-25T00:00:00Z')});
  await page.goto('/');
  await page.clock.pauseAt(new Date('2026-10-25T00:10:00Z'));
  await expect(page.locator('#menu-title')).toContainText('The woods are calling.');
  await page.screenshot({path:info.outputPath('woods-desktop.png'),fullPage:true});
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.locator('#settings-sound').check();
  await expect(page.locator('#sound-button')).toHaveAccessibleName('Turn sound off');
  await page.locator('#settings-motion').check();
  expect(await page.evaluate(()=>window.fixture.forest.reducedMotion)).toBe(true);
  await page.getByRole('button',{name:'Close settings',exact:true}).click();
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:info.outputPath('woods-mobile.png'),fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await chooseGame(page,'survival');
  await page.getByRole('button',{name:'Let’s forage'}).click();
  for(let i=0;i<16;i++)await page.clock.fastForward(200);
  await expect.poll(()=>page.evaluate(()=>window.fixture.game.phase)).toBe('playing');
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  expect(await page.evaluate(()=>window.fixture.game.phase)).toBe('paused');
  const elapsed=await page.evaluate(()=>window.fixture.game.elapsed);
  await page.clock.fastForward(500);
  expect(await page.evaluate(()=>window.fixture.game.elapsed)).toBe(elapsed);
  await page.getByRole('button',{name:'Close settings',exact:true}).click();
  await page.clock.fastForward(50);
  await expect.poll(()=>page.evaluate(()=>window.fixture.game.phase)).toBe('playing');
  expect(errors).toEqual([]);
});
