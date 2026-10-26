// Dev helper: bundle a page + take headless screenshots. usage: node tools/shot.js <entry> <out.png> [query]
import { build } from 'esbuild';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'node:fs';
import path from 'node:path';
const [entry, out, query = ''] = process.argv.slice(2);
const dir = fs.mkdtempSync('/tmp/shot-');
await build({ entryPoints: [entry], bundle: true, outfile: path.join(dir, 'b.js'), format: 'iife', logLevel: 'error' });
fs.writeFileSync(path.join(dir, 'i.html'), '<body style="margin:0;background:#000"><script src="b.js"></script>');
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 600, height: 700 } });
p.on('console', (m) => console.log('[page]', m.text()));
p.on('pageerror', (e) => console.log('[err]', e.message));
await p.goto('file://' + path.join(dir, 'i.html') + (query ? '?' + query : ''));
await p.waitForFunction('window.__done', null, { timeout: 60000 });
await p.screenshot({ path: out });
await b.close();
