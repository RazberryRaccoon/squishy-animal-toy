export default async (page, shot) => {
  await page.evaluate(() => { const a = window.__app; a.switchTo(1, 1); a.showScreen('play'); a.app.focusY = 0.5; });
  await page.waitForTimeout(3500);
  await shot('f_raccoon_plush');
  await page.evaluate(() => { const a = window.__app; a.cur().setMaterial('jelly'); });
  await page.waitForTimeout(2500);
  await shot('f_raccoon_jelly');
};
