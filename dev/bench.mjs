import baked from '../src/baked/index.js';
import { decodeModel } from '../src/decode.js';
import { Rig } from '../src/rig.js';
import { SoftBody } from '../src/softbody.js';
for (const id of ['fox', 'raccoon', 'cat']) {
  const m = decodeModel(baked[id]);
  const rig = new Rig(m.parts); rig.update();
  const sb = new SoftBody(m, rig);
  sb.beginGrab(1, 100);
  const env = { fict: [0, 0, 0], gravity: [0, -1, 0], omega: [0, 0, 0], alpha: [0, 0, 0] };
  for (let i = 0; i < 100; i++) { rig.update(); sb.step(1 / 60, env); sb.skin(); }
  const t0 = performance.now();
  const n = 600;
  let tStep = 0, tSkin = 0;
  for (let i = 0; i < n; i++) {
    const a = performance.now(); rig.update(); sb.step(1 / 60, env); const b = performance.now(); sb.skin(); const c = performance.now();
    tStep += b - a; tSkin += c - b;
  }
  console.log(id, 'N', m.N, 'M', m.M, 'step ms', (tStep / n).toFixed(3), 'skin ms', (tSkin / n).toFixed(3));
}
