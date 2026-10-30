import {test,expect} from '@playwright/test';
import {chooseGame} from './helpers.js';

test.use({deviceScaleFactor:0.5});
test('the menu uses the requested branding and Survival copy without the extra banners',async({page},info)=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('.brand-name')).toHaveText('Scatter Hoard');
  await expect(page.locator('.survival-card .eyebrow')).toHaveText('02 · THE LONG WINTER');
  await expect(page.locator('.survival-card')).toContainText('Bring five acorns home each round. Bury the rest for future rounds when acorn drops grow scarce.');
  await expect(page.locator('#menu-atmosphere')).toHaveCount(0);
  await expect(page.locator('footer')).not.toContainText('MADE FOR TWO');
  await page.screenshot({path:info.outputPath('clean-menu-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({path:info.outputPath('clean-menu-mobile.png'),fullPage:true});
  expect(errors).toEqual([]);
});

test('field captions and guide copy stay correct while switching between Survival and Arcade',async({page},info)=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  for(const mode of ['survival','arcade']){
    await chooseGame(page,mode);
    await expect(page.locator('.round-facts')).toHaveCount(0);
    await expect(page.locator('.arena-label')).toHaveCount(0);
    await expect(page.locator('.arena-bottomline')).toHaveCount(0);
    await expect(page.locator('#connection-status')).toBeHidden();
    await expect(page.locator('.intro')).not.toContainText('THE WOODS ARE BIG ENOUGH');
    await expect(page.locator('.intro')).not.toContainText('Collect a little.');
    for(const label of ['.territory-red','.territory-grey']){
      if(mode==='survival')await expect(page.locator(label)).toBeHidden();
      else await expect(page.locator(label)).toBeVisible();
    }
    if(mode==='survival')await page.locator('#arena').screenshot({path:info.outputPath('survival-field-without-labels.png')});
    await page.getByRole('button',{name:'How to Play'}).click();
    const guide=page.locator('#help-dialog');
    await expect(guide).toContainText('The acorn stays where it was buried');
    await expect(page.locator('#stash-instructions')).toContainText('Arcade:');
    await expect(page.locator('#stash-instructions')).toContainText('Survival:');
    await expect(page.locator('#stash-instructions')).toContainText('reserves, not points');
    await expect(page.locator('#stash-instructions')).toContainText('Falling short of five deliveries eliminates you');
    await expect(guide).not.toContainText('invisible 30');
    await expect(guide).not.toContainText('10%');
    await expect(guide).not.toContainText('Two mirrored');
    await expect(guide).not.toContainText('fade to black');
    await expect(guide).toContainText('Loose acorns and acorns in paws clear between rounds; buried stashes remain.');
    await page.getByRole('button',{name:'Close instructions'}).click();
    await page.locator('#menu-button').click();
  }
  expect(errors).toEqual([]);
});
