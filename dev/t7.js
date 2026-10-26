export default async (page, shot) => {
  await page.evaluate(() => { const a = window.__app; a.showScreen('play'); a.cur().setMaterial('jelly'); a.app.focusY = 0.5; });
  await page.waitForTimeout(3000);
  const cdp = await page.context().newCDPSession(page);
  // grab both cheeks
  const A = { x: 70, y: 330 }, Bp = { x: 290, y: 330 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: A.x, y: A.y, id: 1 }, { x: Bp.x, y: Bp.y, id: 2 }] });
  for (let i = 1; i <= 14; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: A.x - i * 4, y: A.y - i * 2, id: 1 }, { x: Bp.x + i * 4, y: Bp.y - i * 2, id: 2 }] });
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(800);
  await shot('h_twofinger');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(300);
  await shot('h_release');
  console.log(await page.evaluate(() => JSON.stringify(window.__app.cur().metrics)));
};
