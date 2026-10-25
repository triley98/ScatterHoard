export async function chooseGame(page, mode = 'arcade', match = 'local') {
  await page.getByRole('button', {name:mode === 'survival' ? 'Survival' : 'Arcade',exact:true}).click();
  await page.getByRole('button', {name:match === 'ai' ? 'Human vs AI' : match === 'online'
    ? 'Online human vs human' : 'Local human vs human',exact:true}).click();
}
