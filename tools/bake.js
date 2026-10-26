// Bakes the SDF sculpts into compact meshes + rigging data the app loads at runtime.
// Run: node tools/bake.js [fox|raccoon|cat]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeModel } from './sdf.js';
import { MODELS } from './models.js';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'baked');
fs.mkdirSync(OUT, { recursive: true });

const H = 0.043; // voxel size
const MIN = [-1.45, -1.12, -1.05];
const MAX = [1.45, 1.5, 1.05];

const b64 = (ta) => Buffer.from(ta.buffer, ta.byteOffset, ta.byteLength).toString('base64');

function surfaceNets(model) {
  const nx = Math.ceil((MAX[0] - MIN[0]) / H) + 1;
  const ny = Math.ceil((MAX[1] - MIN[1]) / H) + 1;
  const nz = Math.ceil((MAX[2] - MIN[2]) / H) + 1;
  const field = new Float32Array(nx * ny * nz);
  const idx = (i, j, k) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    field[idx(i, j, k)] = model.dist(MIN[0] + i * H, MIN[1] + j * H, MIN[2] + k * H);
  }
  const cellV = new Int32Array(nx * ny * nz).fill(-1);
  const pos = [];
  const corner = [[0,0,0],[1,0,0],[0,1,0],[1,1,0],[0,0,1],[1,0,1],[0,1,1],[1,1,1]];
  const edges = [[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]];
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const v = corner.map((c) => field[idx(i + c[0], j + c[1], k + c[2])]);
    let mask = 0;
    for (let n = 0; n < 8; n++) if (v[n] < 0) mask |= 1 << n;
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, cnt = 0;
    for (const [a, b] of edges) {
      if ((v[a] < 0) === (v[b] < 0)) continue;
      const t = v[a] / (v[a] - v[b]);
      sx += corner[a][0] + (corner[b][0] - corner[a][0]) * t;
      sy += corner[a][1] + (corner[b][1] - corner[a][1]) * t;
      sz += corner[a][2] + (corner[b][2] - corner[a][2]) * t;
      cnt++;
    }
    cellV[idx(i, j, k)] = pos.length / 3;
    pos.push(MIN[0] + (i + sx / cnt) * H, MIN[1] + (j + sy / cnt) * H, MIN[2] + (k + sz / cnt) * H);
  }
  const tris = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) [b, d] = [d, b];
    const dd = (p, q) => Math.hypot(pos[p*3]-pos[q*3], pos[p*3+1]-pos[q*3+1], pos[p*3+2]-pos[q*3+2]);
    if (dd(a, c) < dd(b, d)) tris.push(a, b, c, a, c, d); else tris.push(a, b, d, b, c, d);
  };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const f0 = field[idx(i, j, k)];
    // x-edge
    let f1 = field[idx(i + 1, j, k)];
    if ((f0 < 0) !== (f1 < 0)) quad(cellV[idx(i, j - 1, k - 1)], cellV[idx(i, j, k - 1)], cellV[idx(i, j, k)], cellV[idx(i, j - 1, k)], f0 < 0);
    f1 = field[idx(i, j + 1, k)];
    if ((f0 < 0) !== (f1 < 0)) quad(cellV[idx(i - 1, j, k - 1)], cellV[idx(i - 1, j, k)], cellV[idx(i, j, k)], cellV[idx(i, j, k - 1)], f0 < 0);
    f1 = field[idx(i, j, k + 1)];
    if ((f0 < 0) !== (f1 < 0)) quad(cellV[idx(i - 1, j - 1, k)], cellV[idx(i, j - 1, k)], cellV[idx(i, j, k)], cellV[idx(i - 1, j, k)], f0 < 0);
  }
  return { pos: Float32Array.from(pos), tris: Uint32Array.from(tris) };
}

function relax(pos, tris, model, iters) {
  const n = pos.length / 3;
  const nb = Array.from({ length: n }, () => new Set());
  for (let t = 0; t < tris.length; t += 3) {
    for (let e = 0; e < 3; e++) { const a = tris[t + e], b = tris[t + (e + 1) % 3]; nb[a].add(b); nb[b].add(a); }
  }
  const tmp = new Float32Array(pos.length);
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < n; i++) {
      let x = 0, y = 0, z = 0; const s = nb[i];
      for (const j of s) { x += pos[j*3]; y += pos[j*3+1]; z += pos[j*3+2]; }
      const c = s.size || 1;
      tmp[i*3] = pos[i*3] * 0.4 + (x / c) * 0.6; tmp[i*3+1] = pos[i*3+1] * 0.4 + (y / c) * 0.6; tmp[i*3+2] = pos[i*3+2] * 0.4 + (z / c) * 0.6;
    }
    pos.set(tmp);
    // project back onto the true surface so the shape does not shrink
    for (let i = 0; i < n; i++) {
      for (let s = 0; s < 2; s++) {
        const x = pos[i*3], y = pos[i*3+1], z = pos[i*3+2];
        const d = model.dist(x, y, z);
        const g = model.gradient(x, y, z);
        pos[i*3] -= g[0] * d; pos[i*3+1] -= g[1] * d; pos[i*3+2] -= g[2] * d;
      }
    }
  }
  return nb;
}

function bake(name) {
  const def = MODELS[name];
  const model = makeModel(def);
  const t0 = Date.now();
  let { pos, tris } = surfaceNets(model);

  // drop vertices that ended up unused
  const used = new Int32Array(pos.length / 3).fill(-1);
  let m = 0;
  for (const t of tris) if (used[t] < 0) used[t] = m++;
  const p2 = new Float32Array(m * 3);
  for (let i = 0; i < used.length; i++) if (used[i] >= 0) { p2[used[i]*3] = pos[i*3]; p2[used[i]*3+1] = pos[i*3+1]; p2[used[i]*3+2] = pos[i*3+2]; }
  pos = p2; tris = tris.map((t) => used[t]);
  relax(pos, tris, model, 3);
  const N = pos.length / 3;

  // orient triangles outward
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t], b = tris[t+1], c = tris[t+2];
    const ux = pos[b*3]-pos[a*3], uy = pos[b*3+1]-pos[a*3+1], uz = pos[b*3+2]-pos[a*3+2];
    const vx = pos[c*3]-pos[a*3], vy = pos[c*3+1]-pos[a*3+1], vz = pos[c*3+2]-pos[a*3+2];
    const nx = uy*vz-uz*vy, ny = uz*vx-ux*vz, nz = ux*vy-uy*vx;
    const g = model.gradient((pos[a*3]+pos[b*3]+pos[c*3])/3, (pos[a*3+1]+pos[b*3+1]+pos[c*3+1])/3, (pos[a*3+2]+pos[b*3+2]+pos[c*3+2])/3);
    if (nx*g[0] + ny*g[1] + nz*g[2] < 0) { tris[t+1] = c; tris[t+2] = b; }
  }

  // re-centre on the centroid (rigid-body pivot)
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < N; i++) { cx += pos[i*3]; cy += pos[i*3+1]; cz += pos[i*3+2]; }
  cx /= N; cy /= N; cz /= N;
  const C = [cx, cy, cz];

  // colours
  const colors = new Uint8Array(N * 3);
  const col = [0, 0, 0];
  for (let i = 0; i < N; i++) {
    model.dist(pos[i*3], pos[i*3+1], pos[i*3+2], col);
    for (let k = 0; k < 3; k++) colors[i*3+k] = Math.round(Math.min(1, Math.max(0, col[k])) * 255);
  }

  // local thickness (distance to the far side along the inward normal) for translucent shading
  const thick = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const g = model.gradient(pos[i*3], pos[i*3+1], pos[i*3+2]);
    let tt = 0.03;
    for (; tt < 1.4; tt += 0.03) if (model.dist(pos[i*3] - g[0]*tt, pos[i*3+1] - g[1]*tt, pos[i*3+2] - g[2]*tt) > 0) break;
    thick[i] = Math.round(Math.min(1, tt / 1.0) * 255);
  }

  // skeleton weights (two strongest parts per point)
  const P = model.parts.length;
  const tau = 0.045;
  const weigh = (x, y, z) => {
    const w = new Float32Array(P);
    let best = -1e9;
    const d = [];
    for (let p = 0; p < P; p++) { d.push(model.partDist(p, x, y, z)); best = Math.max(best, -d[p]); }
    for (let p = 0; p < P; p++) w[p] = Math.exp((-d[p] - best) / tau);
    let a = 0, b = -1;
    for (let p = 1; p < P; p++) if (w[p] > w[a]) a = p;
    for (let p = 0; p < P; p++) if (p !== a && (b < 0 || w[p] > w[b])) b = p;
    const tot = w[a] + w[b];
    return [a, b, w[b] / tot];
  };
  const pa = new Uint8Array(N), pb = new Uint8Array(N), pw = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const [a, b, t] = weigh(pos[i*3], pos[i*3+1], pos[i*3+2]);
    pa[i] = a; pb[i] = b; pw[i] = Math.round(t * 255);
  }

  // control nodes: farthest point sampling on the surface
  const sp = def.spacing;
  const ctrl = [];
  const md = new Float32Array(N).fill(1e9);
  let pick = 0;
  for (let i = 1; i < N; i++) if (pos[i*3+1] > pos[pick*3+1]) pick = i;
  for (;;) {
    ctrl.push(pick);
    let far = 0, fd = -1;
    for (let i = 0; i < N; i++) {
      const d = Math.hypot(pos[i*3]-pos[pick*3], pos[i*3+1]-pos[pick*3+1], pos[i*3+2]-pos[pick*3+2]);
      if (d < md[i]) md[i] = d;
      if (md[i] > fd) { fd = md[i]; far = i; }
    }
    if (fd < sp) break;
    pick = far;
  }
  const M = ctrl.length;
  const cpos = new Float32Array(M * 3);
  ctrl.forEach((v, i) => { cpos.set(pos.subarray(v*3, v*3+3), i*3); });
  // nudge control nodes slightly inside the surface so they act like an inner skeleton
  const cnorm = new Float32Array(M * 3);
  for (let i = 0; i < M; i++) {
    const g = model.gradient(cpos[i*3], cpos[i*3+1], cpos[i*3+2]);
    cnorm.set(g, i*3);
    for (let k = 0; k < 3; k++) cpos[i*3+k] -= g[k] * 0.03;
  }
  const cpa = new Uint8Array(M), cpb = new Uint8Array(M), cpw = new Uint8Array(M);
  for (let i = 0; i < M; i++) {
    const [a, b, t] = weigh(cpos[i*3], cpos[i*3+1], cpos[i*3+2]);
    cpa[i] = a; cpb[i] = b; cpw[i] = Math.round(t * 255);
  }
  // control graph
  const pairSet = new Set();
  for (let i = 0; i < M; i++) {
    const ds = [];
    for (let j = 0; j < M; j++) if (j !== i) ds.push([Math.hypot(cpos[i*3]-cpos[j*3], cpos[i*3+1]-cpos[j*3+1], cpos[i*3+2]-cpos[j*3+2]), j]);
    ds.sort((a, b) => a[0] - b[0]);
    for (let n = 0; n < Math.min(8, ds.length); n++) {
      if (n >= 4 && ds[n][0] > sp * 1.9) break;
      const a = Math.min(i, ds[n][1]), b = Math.max(i, ds[n][1]);
      pairSet.add(a * 65536 + b);
    }
  }
  const pairs = new Uint16Array(pairSet.size * 2);
  let q = 0;
  for (const key of pairSet) { pairs[q++] = Math.floor(key / 65536); pairs[q++] = key % 65536; }

  // skin weights: 4 nearest control nodes, gaussian falloff
  const skI = new Uint16Array(N * 4), skW = new Float32Array(N * 4);
  const sigma = sp * 0.85;
  const areaC = new Float32Array(M);
  for (let i = 0; i < N; i++) {
    const ds = [];
    for (let j = 0; j < M; j++) ds.push([Math.hypot(pos[i*3]-cpos[j*3], pos[i*3+1]-cpos[j*3+1], pos[i*3+2]-cpos[j*3+2]), j]);
    ds.sort((a, b) => a[0] - b[0]);
    let tot = 0;
    const d0 = ds[0][0];
    for (let n = 0; n < 4; n++) {
      const w = Math.exp(-(((ds[n][0] - d0) / sigma) ** 2) * 1.2) + 1e-4;
      skI[i*4+n] = ds[n][1]; skW[i*4+n] = w; tot += w;
    }
    for (let n = 0; n < 4; n++) skW[i*4+n] /= tot;
    areaC[ds[0][1]] += 1;
  }
  let surfaceArea = 0;
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t], b = tris[t+1], c = tris[t+2];
    const ux = pos[b*3]-pos[a*3], uy = pos[b*3+1]-pos[a*3+1], uz = pos[b*3+2]-pos[a*3+2];
    const vx = pos[c*3]-pos[a*3], vy = pos[c*3+1]-pos[a*3+1], vz = pos[c*3+2]-pos[a*3+2];
    surfaceArea += 0.5 * Math.hypot(uy*vz-uz*vy, uz*vx-ux*vz, ux*vy-uy*vx);
  }
  for (let j = 0; j < M; j++) areaC[j] = (areaC[j] / N) * surfaceArea;

  // accessories (face bits), snapped to the surface
  const snap = (p) => {
    let [x, y, z] = p;
    for (let s = 0; s < 8; s++) {
      const d = model.dist(x, y, z); const g = model.gradient(x, y, z);
      x -= g[0] * d; y -= g[1] * d; z -= g[2] * d;
    }
    return [x, y, z, ...model.gradient(x, y, z)];
  };
  const f = def.face;
  const acc = [];
  const sub = (a) => [a[0]-C[0], a[1]-C[1], a[2]-C[2]];
  const add = (kind, p, extra = {}) => {
    const s = snap(p);
    acc.push({ kind, p: sub(s), n: [s[3], s[4], s[5]], ...extra });
  };
  for (const s of [1, -1]) {
    add('eye', [f.eye.p[0]*s, f.eye.p[1], f.eye.p[2]], { side: s, r: f.eye.r, color: f.eye.color, glow: !!f.eye.glow });
    add('brow', [f.brow.p[0]*s, f.brow.p[1], f.brow.p[2]], { side: s, len: f.brow.len });
    add('cheek', [f.cheek.p[0]*s, f.cheek.p[1], f.cheek.p[2]], { side: s, r: f.cheek.r });
    if (f.whisker) for (let w = 0; w < 3; w++) {
      add('whisker', [f.whisker.p[0]*s, f.whisker.p[1] + (w - 1) * 0.05, f.whisker.p[2]], { side: s, len: f.whisker.len, idx: w });
    }
  }
  add('nose', f.nose.p, { r: f.nose.r, color: f.nose.color });
  add('mouth', f.mouth.p, { w: f.mouth.w, cat: !!f.mouth.cat });

  const parts = model.parts.map((p) => ({ name: p.name, parent: p.parent, pivot: sub(p.pivot) }));
  const out = {
    name, N, M, centroid: C,
    pos: b64(new Float32Array(Array.from(pos).map((v, i) => v - C[i % 3]))),
    idx: b64(Uint16Array.from(tris)),
    col: b64(colors), thick: b64(thick),
    pa: b64(pa), pb: b64(pb), pw: b64(pw),
    skI: b64(skI), skW: b64(skW),
    cpos: b64(new Float32Array(Array.from(cpos).map((v, i) => v - C[i % 3]))),
    cnorm: b64(cnorm), carea: b64(areaC),
    cpa: b64(cpa), cpb: b64(cpb), cpw: b64(cpw),
    pairs: b64(pairs),
    parts, acc,
    spacing: sp,
  };
  fs.writeFileSync(path.join(OUT, `${name}.js`), `// generated by tools/bake.js - do not edit\nexport default ${JSON.stringify(out)};\n`);
  const kb = (fs.statSync(path.join(OUT, `${name}.js`)).size / 1024).toFixed(0);
  console.log(`${name}: ${N} verts, ${tris.length / 3} tris, ${M} control nodes, ${pairs.length / 2} links, ${kb} KB, ${Date.now() - t0} ms`);
}

const which = process.argv[2] ? [process.argv[2]] : Object.keys(MODELS);
for (const n of which) bake(n);
fs.writeFileSync(path.join(OUT, 'index.js'), `import fox from './fox.js';\nimport raccoon from './raccoon.js';\nimport cat from './cat.js';\nexport default { fox, raccoon, cat };\n`);
