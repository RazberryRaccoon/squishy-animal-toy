export default async (page, shot) => {
  await page.evaluate(() => { const a = window.__app; a.switchTo(2, 1); });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { const a = window.__app; a.showScreen('play'); a.cur().setMaterial('gummy'); a.setSheet('style'); a.app.focusY = 0.325; a.app.scaleT = 0.84; });
  await page.waitForTimeout(3500);
  await shot('e_style');
  await page.evaluate(() => { const a = window.__app; a.cur().setMaterial('plush'); a.setSheet('style'); a.setSheet('tray'); a.app.focusY=0.41; a.pets.cat.stats.hunger = 20; });
  await page.waitForTimeout(3500);
  await shot('e_tray');
  await page.evaluate(() => { const a = window.__app; a.setSheet('tray'); a.pets.cat.sleep(); });
  await page.waitForTimeout(4000);
  await shot('e_sleep');
};
