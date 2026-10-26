// Bundles the app (three.js + game code + baked meshes) into one self-contained HTML file
// that the Android WebView loads from its assets folder.
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const minify = !process.argv.includes('--dev');
const res = await build({
  entryPoints: [path.join(root, 'src/main.js')],
  bundle: true, write: false, format: 'iife', minify, target: ['chrome90'], legalComments: 'none', logLevel: 'warning',
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8').replace('/*__JS__*/', () => js);
for (const out of ['dist/index.html', 'android/app/src/main/assets/www/index.html']) {
  const p = path.join(root, out);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, html);
}
console.log(`built ${(html.length / 1024).toFixed(0)} KB`);
