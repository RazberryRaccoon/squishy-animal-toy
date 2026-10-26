export default async (page, shot) => {
  await page.evaluate(() => { const a = window.__app; a.showScreen('play'); a.cur().setMaterial('dough'); a.app.focusY = 0.5; });
  await page.waitForTimeout(2500);
  await shot('d_rest');
  // grab the fox's left ear tip (screen coords found by projecting a vertex)
  const pt = await page.evaluate(() => {
    const a = window.__app, t = a.cur();
    // find highest-y vertex on the +x side (ear tip)
    let best = -1, by = -1e9;
    for (let i = 0; i < t.soft.N; i++) { const x = t.soft.pos[i*3], y = t.soft.pos[i*3+1]; if (x > 0 && y > by) { by = y; best = i; } }
    const v = new (t.group.position.constructor)(t.soft.pos[best*3], t.soft.pos[best*3+1], t.soft.pos[best*3+2]).applyMatrix4(t.group.matrixWorld);
    v.project(a.stage.camera);
    return { x: (v.x * 0.5 + 0.5) * a.stage.width, y: (-v.y * 0.5 + 0.5) * a.stage.height - 6 };
  });
  console.log('ear tip at', pt);
  await page.mouse.move(pt.x, pt.y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) { await page.mouse.move(pt.x + i * 10, pt.y - i * 14); await page.waitForTimeout(120); }
  await page.waitForTimeout(1500);
  await shot('d_stretched');
  await page.mouse.up();
  await page.waitForTimeout(2500);
  await shot('d_released');
  // belly squish: press in the middle for a while
  await page.mouse.move(206, 520); await page.mouse.down(); await page.waitForTimeout(1800);
  await shot('d_press');
  await page.mouse.up();
  // shake
  await page.evaluate(() => window.__setMotion([14, 0, 0], [0, 0, 0], [0, 9.8, 0]));
  await page.waitForTimeout(700);
  await shot('d_shake');
};
