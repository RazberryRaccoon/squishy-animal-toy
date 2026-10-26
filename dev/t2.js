export default async (page, shot) => {
  await page.waitForTimeout(1500);
  await shot('a_select');
  await page.evaluate(() => window.__app.showScreen('play'));
  await page.waitForTimeout(1500);
  await shot('b_play_plush');
  for (const t of ['dough', 'jelly', 'gummy']) {
    await page.evaluate((t) => { const a = window.__app; a.cur().setMaterial(t); a.cur().soft.resetSculpt(); }, t);
    await page.waitForTimeout(1800);
    await shot('c_' + t);
  }
};
