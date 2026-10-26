// Sculpt definitions for the three toys. Units are arbitrary "toy units"; the
// toy faces +Z, up is +Y. Parts form a skeleton (parent chain) used for idle
// animation; the baker turns the whole thing into one smooth watertight mesh.
import { ell, cone, cap, hex } from './sdf.js';

const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Flatten a primitive along Z around a centre (for thin ears etc).
function squash(prim, c, sx, sy, sz) {
  const m = Math.min(sx, sy, sz);
  return {
    col: prim.col,
    d: (x, y, z) => prim.d(c[0] + (x - c[0]) / sx, c[1] + (y - c[1]) / sy, c[2] + (z - c[2]) / sz) * m,
  };
}

// ---------------------------------------------------------------- FOX
const F = { orange: hex(0xe9782c), cream: hex(0xfff0d9), brown: hex(0x3b2318), deep: hex(0xd9631b) };
export const fox = {
  name: 'fox',
  spacing: 0.2,
  parts: [
    { name: 'body', parent: -1, pivot: [0, -0.7, 0], join: 0.1, prims: [
      ell([0, -0.4, 0], [0.5, 0.54, 0.46], F.orange),
      { ...ell([0, -0.36, 0.2], [0.33, 0.44, 0.3], F.cream), k: 0.05 },
      ell([0.28, -0.66, 0.1], [0.2, 0.26, 0.26], F.orange),
      ell([-0.28, -0.66, 0.1], [0.2, 0.26, 0.26], F.orange),
      { ...ell([0.27, -0.88, 0.22], [0.2, 0.13, 0.3], F.brown), k: 0.04 },
      { ...ell([-0.27, -0.88, 0.22], [0.2, 0.13, 0.3], F.brown), k: 0.04 },
    ] },
    { name: 'head', parent: 0, pivot: [0, 0.0, 0.0], join: 0.14, prims: [
      ell([0, 0.46, 0.02], [0.72, 0.56, 0.6], F.orange),
      { ...ell([0.5, 0.3, 0.14], [0.34, 0.24, 0.34], F.cream, [0, 0, -0.3]), k: 0.1 },
      { ...ell([-0.5, 0.3, 0.14], [0.34, 0.24, 0.34], F.cream, [0, 0, 0.3]), k: 0.1 },
      { ...ell([0, 0.27, 0.56], [0.2, 0.15, 0.2], F.cream), k: 0.08 },
    ] },
    ...[1, -1].map((s) => ({
      name: s > 0 ? 'earL' : 'earR', parent: 1, pivot: [s * 0.42, 0.85, 0], join: 0.07,
      prims: [
        squash(cone([s * 0.38, 0.84, -0.02], [s * 0.6, 1.36, -0.07], 0.23, 0.03, F.orange), [s * 0.45, 1.0, -0.03], 1, 1, 0.5),
        { ...squash(cone([s * 0.4, 0.86, 0.03], [s * 0.57, 1.26, 0.0], 0.14, 0.02, F.brown), [s * 0.45, 1.0, 0.02], 1, 1, 0.48), k: 0.01 },
      ],
    })),
    ...[1, -1].map((s) => ({
      name: s > 0 ? 'armL' : 'armR', parent: 0, pivot: [s * 0.4, -0.12, 0.1], join: 0.06,
      prims: [
        cap([s * 0.38, -0.16, 0.12], [s * 0.46, -0.52, 0.36], 0.13, F.orange),
        { ...ell([s * 0.46, -0.56, 0.4], [0.14, 0.12, 0.15], F.brown), k: 0.05 },
      ],
    })),
    { name: 'tail1', parent: 0, pivot: [0.3, -0.72, -0.3], join: 0.1, prims: [
      cone([0.3, -0.72, -0.3], [0.72, -0.62, -0.48], 0.16, 0.24, F.orange)] },
    { name: 'tail2', parent: 6, pivot: [0.72, -0.62, -0.48], join: 0.1, prims: [
      cone([0.72, -0.62, -0.48], [0.98, -0.15, -0.5], 0.24, 0.3, F.orange)] },
    { name: 'tail3', parent: 7, pivot: [0.98, -0.15, -0.5], join: 0.1, prims: [
      cone([0.98, -0.15, -0.5], [0.86, 0.4, -0.4], 0.3, 0.12, F.orange)] },
  ],
  paint(x, y, z, c, pd) {
    // dark ear tips
    if (y > 1.1 && Math.abs(x) > 0.3) { const t = sstep(1.1, 1.2, y); const m = mix(c, F.brown, t); c[0] = m[0]; c[1] = m[1]; c[2] = m[2]; }
    // white tail tip
    if (pd('tail3') < 0.02 && y > 0.12) { const t = sstep(0.1, 0.2, y); const m = mix(c, F.cream, t); c[0] = m[0]; c[1] = m[1]; c[2] = m[2]; }
    // soft chest-to-chin blend is done by primitives
  },
  face: {
    eye: { p: [0.27, 0.52, 0.56], r: 0.082, color: 0x1a0f0c },
    brow: { p: [0.27, 0.66, 0.5], len: 0.1 },
    nose: { p: [0, 0.31, 0.78], r: 0.055, color: 0x1a0f0c },
    mouth: { p: [0, 0.2, 0.72], w: 0.16 },
    cheek: { p: [0.46, 0.35, 0.5], r: 0.09 },
    whisker: null,
  },
};

// ---------------------------------------------------------------- RACCOON
const R = { grey: hex(0x7a7d88), light: hex(0xc4c5cc), white: hex(0xf4f2ee), dark: hex(0x2c2c35), ring: hex(0x3a3a44) };
export const raccoon = {
  name: 'raccoon',
  spacing: 0.2,
  parts: [
    { name: 'body', parent: -1, pivot: [0, -0.7, 0], join: 0.1, prims: [
      ell([0, -0.4, 0], [0.54, 0.55, 0.5], R.grey),
      { ...ell([0, -0.35, 0.22], [0.34, 0.44, 0.3], R.light), k: 0.05 },
      ell([0.3, -0.68, 0.1], [0.21, 0.26, 0.27], R.grey),
      ell([-0.3, -0.68, 0.1], [0.21, 0.26, 0.27], R.grey),
      { ...ell([0.29, -0.9, 0.22], [0.21, 0.13, 0.3], R.dark), k: 0.04 },
      { ...ell([-0.29, -0.9, 0.22], [0.21, 0.13, 0.3], R.dark), k: 0.04 },
    ] },
    { name: 'head', parent: 0, pivot: [0, 0.0, 0.0], join: 0.14, prims: [
      ell([0, 0.45, 0.02], [0.78, 0.57, 0.62], R.grey),
      { ...ell([0.56, 0.3, 0.1], [0.3, 0.24, 0.32], R.light, [0, 0, -0.3]), k: 0.1 },
      { ...ell([-0.56, 0.3, 0.1], [0.3, 0.24, 0.32], R.light, [0, 0, 0.3]), k: 0.1 },
      { ...ell([0, 0.27, 0.56], [0.27, 0.2, 0.22], R.white), k: 0.09 },
    ] },
    ...[1, -1].map((s) => ({
      name: s > 0 ? 'earL' : 'earR', parent: 1, pivot: [s * 0.5, 0.9, 0], join: 0.07,
      prims: [
        squash(ell([s * 0.52, 0.96, -0.04], [0.21, 0.22, 0.13], R.grey, [0, 0, -s * 0.25]), [s * 0.52, 0.96, -0.04], 1, 1, 0.8),
        { ...ell([s * 0.52, 0.95, 0.04], [0.13, 0.14, 0.07], R.dark, [0, 0, -s * 0.25]), k: 0.01 },
      ],
    })),
    ...[1, -1].map((s) => ({
      name: s > 0 ? 'armL' : 'armR', parent: 0, pivot: [s * 0.42, -0.12, 0.1], join: 0.06,
      prims: [
        cap([s * 0.4, -0.16, 0.12], [s * 0.47, -0.5, 0.37], 0.135, R.grey),
        { ...ell([s * 0.47, -0.55, 0.41], [0.14, 0.12, 0.15], R.dark), k: 0.05 },
      ],
    })),
    { name: 'tail1', parent: 0, pivot: [0.3, -0.72, -0.34], join: 0.1, prims: [
      cone([0.3, -0.72, -0.34], [0.74, -0.68, -0.52], 0.17, 0.23, R.grey)] },
    { name: 'tail2', parent: 6, pivot: [0.74, -0.68, -0.52], join: 0.1, prims: [
      cone([0.74, -0.68, -0.52], [1.0, -0.22, -0.54], 0.23, 0.26, R.grey)] },
    { name: 'tail3', parent: 7, pivot: [1.0, -0.22, -0.54], join: 0.1, prims: [
      cone([1.0, -0.22, -0.54], [0.9, 0.3, -0.44], 0.26, 0.15, R.grey)] },
  ],
  paint(x, y, z, c, pd) {
    const ax = Math.abs(x);
    // bandit mask
    const mx = (ax - 0.3) / 0.27, my = (y - 0.45 + 0.04 * (ax - 0.3)) / 0.13;
    const bridge = ax < 0.2 ? (y - 0.47) / 0.1 : 9;
    if (z > 0.15 && (mx * mx + my * my < 1 || bridge * bridge + (ax / 0.22) ** 2 < 1)) {
      const edge = Math.max(0, 1 - Math.min(mx * mx + my * my, bridge * bridge + (ax / 0.22) ** 2));
      const m = mix(c, R.dark, sstep(0.0, 0.55, edge)); c[0] = m[0]; c[1] = m[1]; c[2] = m[2];
    }
    // pale brows + forehead stripe
    if (z > 0.2 && y > 0.58 && y < 0.72 && ax > 0.15 && ax < 0.42) { const m = mix(c, R.light, 0.8); c[0] = m[0]; c[1] = m[1]; c[2] = m[2]; }
    if (z > 0.1 && y > 0.6 && ax < 0.07) { const m = mix(c, R.white, 0.6); c[0] = m[0]; c[1] = m[1]; c[2] = m[2]; }
    // ringed tail
    const dt = Math.min(pd('tail1'), pd('tail2'), pd('tail3'));
    if (dt < 0.02) {
      const s = Math.hypot(x - 0.3, y + 0.72, z + 0.34) + (y > -0.3 ? 0.35 : 0);
      const ring = Math.sin(s * 11);
      const t = sstep(-0.45, 0.45, ring);
      const m = mix(c, R.ring, t * 0.95); c[0] = m[0]; c[1] = m[1]; c[2] = m[2];
      if (y > 0.2) { const mm = mix(c, R.dark, 0.9); c[0] = mm[0]; c[1] = mm[1]; c[2] = mm[2]; }
    }
  },
  face: {
    eye: { p: [0.3, 0.46, 0.6], r: 0.078, color: 0x0d0d12, glow: true },
    brow: { p: [0.3, 0.64, 0.54], len: 0.1 },
    nose: { p: [0, 0.31, 0.79], r: 0.06, color: 0x0d0d12 },
    mouth: { p: [0, 0.2, 0.73], w: 0.18 },
    cheek: { p: [0.5, 0.3, 0.5], r: 0.085 },
    whisker: null,
  },
};

// ---------------------------------------------------------------- CAT
const C = { grey: hex(0xa7a4b4), stripe: hex(0x6f6c80), white: hex(0xf6f3f4), pink: hex(0xf3a2b4) };
export const cat = {
  name: 'cat',
  spacing: 0.2,
  parts: [
    { name: 'body', parent: -1, pivot: [0, -0.7, 0], join: 0.1, prims: [
      ell([0, -0.42, 0], [0.47, 0.53, 0.45], C.grey),
      { ...ell([0, -0.34, 0.22], [0.27, 0.4, 0.26], C.white), k: 0.05 },
      ell([0.26, -0.68, 0.1], [0.19, 0.25, 0.25], C.grey),
      ell([-0.26, -0.68, 0.1], [0.19, 0.25, 0.25], C.grey),
      { ...ell([0.25, -0.89, 0.2], [0.18, 0.12, 0.28], C.white), k: 0.04 },
      { ...ell([-0.25, -0.89, 0.2], [0.18, 0.12, 0.28], C.white), k: 0.04 },
    ] },
    { name: 'head', parent: 0, pivot: [0, 0.0, 0.0], join: 0.14, prims: [
      ell([0, 0.43, 0.02], [0.7, 0.55, 0.57], C.grey),
      { ...ell([0.46, 0.26, 0.14], [0.26, 0.2, 0.28], C.grey, [0, 0, -0.3]), k: 0.1 },
      { ...ell([-0.46, 0.26, 0.14], [0.26, 0.2, 0.28], C.grey, [0, 0, 0.3]), k: 0.1 },
      { ...ell([0, 0.26, 0.5], [0.21, 0.15, 0.18], C.white), k: 0.08 },
    ] },
    ...[1, -1].map((s) => ({
      name: s > 0 ? 'earL' : 'earR', parent: 1, pivot: [s * 0.4, 0.82, 0], join: 0.07,
      prims: [
        squash(cone([s * 0.38, 0.8, -0.02], [s * 0.5, 1.3, -0.04], 0.25, 0.035, C.grey), [s * 0.44, 1.0, -0.03], 1, 1, 0.5),
        { ...squash(cone([s * 0.38, 0.83, 0.03], [s * 0.48, 1.2, 0.0], 0.15, 0.02, C.pink), [s * 0.43, 1.0, 0.02], 1, 1, 0.48), k: 0.01 },
      ],
    })),
    ...[1, -1].map((s) => ({
      name: s > 0 ? 'armL' : 'armR', parent: 0, pivot: [s * 0.38, -0.12, 0.1], join: 0.06,
      prims: [
        cap([s * 0.36, -0.16, 0.12], [s * 0.42, -0.5, 0.36], 0.12, C.grey),
        { ...ell([s * 0.42, -0.55, 0.4], [0.13, 0.115, 0.14], C.white), k: 0.05 },
      ],
    })),
    { name: 'tail1', parent: 0, pivot: [0.2, -0.8, -0.34], join: 0.1, prims: [
      cone([0.2, -0.8, -0.34], [0.68, -0.82, -0.5], 0.13, 0.11, C.grey)] },
    { name: 'tail2', parent: 6, pivot: [0.68, -0.82, -0.5], join: 0.1, prims: [
      cone([0.68, -0.82, -0.5], [0.98, -0.42, -0.5], 0.11, 0.11, C.grey)] },
    { name: 'tail3', parent: 7, pivot: [0.98, -0.42, -0.5], join: 0.1, prims: [
      cone([0.98, -0.42, -0.5], [0.9, 0.2, -0.42], 0.11, 0.13, C.grey)] },
  ],
  paint(x, y, z, c, pd) {
    const ax = Math.abs(x);
    const put = (col, t) => { const m = mix(c, col, t); c[0] = m[0]; c[1] = m[1]; c[2] = m[2]; };
    // forehead "M" stripes
    if (z > 0.1 && y > 0.7 && ax < 0.3) put(C.stripe, sstep(0.1, 0.7, Math.sin(x * 19)) * sstep(0.68, 0.84, y) * 0.8);
    // cheek stripes
    if (z > 0.0 && ax > 0.5 && y > 0.2 && y < 0.5) put(C.stripe, sstep(0.2, 0.8, Math.sin((y - 0.2) * 27)) * 0.7);
    // back stripes
    if (z < -0.1 && y < 0.1 && y > -0.85) put(C.stripe, sstep(0.2, 0.8, Math.sin(y * 15)) * 0.75);
    // tail rings + dark tip
    const dt = Math.min(pd('tail1'), pd('tail2'), pd('tail3'));
    if (dt < 0.02) {
      const s = Math.hypot(x - 0.2, y + 0.8, z + 0.34);
      put(C.stripe, sstep(0.0, 0.8, Math.sin(s * 11)) * 0.85);
      if (y > 0.05) put(C.stripe, sstep(0.05, 0.15, y));
    }
  },
  face: {
    eye: { p: [0.26, 0.48, 0.54], r: 0.085, color: 0x14101a },
    brow: { p: [0.26, 0.64, 0.5], len: 0.09 },
    nose: { p: [0, 0.3, 0.67], r: 0.04, color: 0xe8788f, pinkNose: true },
    mouth: { p: [0, 0.22, 0.64], w: 0.15, cat: true },
    cheek: { p: [0.44, 0.3, 0.46], r: 0.085 },
    whisker: { p: [0.3, 0.27, 0.5], len: 0.34 },
  },
};

export const MODELS = { fox, raccoon, cat };
