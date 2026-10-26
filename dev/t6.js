export default async (page, shot) => {
  await page.evaluate(() => { const a = window.__app; a.showScreen('play'); a.app.focusY = 0.5; a.stage.setDpr(2); });
  await page.waitForTimeout(4000);
  await shot('g_fox_plush2x');
  await page.evaluate(() => { const a = window.__app; a.switchTo(1, 1); });
  await page.waitForTimeout(4500);
  await shot('g_rac_plush2x');
};
