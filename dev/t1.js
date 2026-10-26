export default async (page, shot) => {
  await page.waitForTimeout(2500);
  await shot('select_fox');
  const fps = await page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 > 2000) res(n / 2); else requestAnimationFrame(f); }; f(); }));
  console.log('fps (software GL)', fps);
};
