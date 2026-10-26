// Headless playtest: node tools/play.js <steps.js>  (steps file default-exports async (page, shot) => {})
import { createRequire } from 'node:module';
import path from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const steps = (await import(path.resolve(process.argv[2]))).default;
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: { width: +(process.env.VW || 412), height: +(process.env.VH || 915) }, deviceScaleFactor: +(process.env.DPR || 1), hasTouch: true });
const page = await ctx.newPage();
page.on('console', (m) => { const t = m.text(); if (!t.includes('GPU stall')) console.log('[page]', t.slice(0, 600)); });
page.on('pageerror', (e) => console.log('[ERR]', e.message.slice(0, 800)));
await page.goto('file://' + path.resolve('dist/index.html'));
await page.waitForFunction('window.__ready', null, { timeout: 120000 }).catch((e) => console.log('not ready', e.message.slice(0, 200)));
const shot = async (name) => { await page.screenshot({ path: `/tmp/shots/${name}.png` }); };
await steps(page, shot);
await b.close();
