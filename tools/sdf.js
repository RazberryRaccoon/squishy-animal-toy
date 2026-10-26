// Tiny signed-distance-field modelling kit used at build time to sculpt the toys.
// Everything is scalar math (no allocations) so baking stays fast.

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const hex = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
export { hex };

function rotMatrix(rx, ry, rz) {
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);
  // R = Rz * Ry * Rx
  return [
    cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx,
    sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx,
    -sy, cy * sx, cy * cx,
  ];
}

// Ellipsoid (optionally rotated). Uses the usual first-order distance approximation.
export function ell(c, r, color, rot = [0, 0, 0]) {
  const m = rotMatrix(rot[0], rot[1], rot[2]);
  const col = Array.isArray(color) ? color : hex(color);
  const [cx, cy, cz] = c;
  const [rx, ry, rz] = r;
  return {
    col,
    d(x, y, z) {
      const px = x - cx, py = y - cy, pz = z - cz;
      // inverse rotation = transpose
      const lx = m[0] * px + m[3] * py + m[6] * pz;
      const ly = m[1] * px + m[4] * py + m[7] * pz;
      const lz = m[2] * px + m[5] * py + m[8] * pz;
      const k0 = Math.hypot(lx / rx, ly / ry, lz / rz);
      const k1 = Math.hypot(lx / (rx * rx), ly / (ry * ry), lz / (rz * rz));
      if (k1 < 1e-9) return -Math.min(rx, ry, rz);
      return (k0 * (k0 - 1)) / k1;
    },
  };
}

export function sph(c, r, color) {
  return ell(c, [r, r, r], color);
}

// Round cone: a capsule whose two end spheres have different radii.
export function cone(a, b, r1, r2, color) {
  const col = Array.isArray(color) ? color : hex(color);
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  return {
    col,
    d(x, y, z) {
      const pax = x - a[0], pay = y - a[1], paz = z - a[2];
      const yy = pax * bax + pay * bay + paz * baz;
      const zz = yy - l2;
      const qx = pax * l2 - bax * yy, qy = pay * l2 - bay * yy, qz = paz * l2 - baz * yy;
      const x2 = qx * qx + qy * qy + qz * qz;
      const y2 = yy * yy * l2;
      const z2 = zz * zz * l2;
      const k = Math.sign(rr) * rr * rr * x2;
      if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
      if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
      return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
    },
  };
}

export function cap(a, b, r, color) {
  return cone(a, b, r, r, color);
}

// Polynomial smooth minimum. Returns [distance, weightOfA].
function smin(a, b, k) {
  if (k <= 1e-6) return a < b ? [a, 1] : [b, 0];
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  const d = Math.min(a, b) - h * h * k * 0.25;
  const t = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return [d, t];
}

// A part is a smooth union of primitives; the model is a smooth union of parts.
export function makeModel(def) {
  const parts = def.parts.map((p) => ({ ...p, k: p.k ?? 0.06, join: p.join ?? 0.08 }));
  const tmpCol = [0, 0, 0];
  const nameIdx = {};
  parts.forEach((p, i) => { nameIdx[p.name] = i; });

  function partEval(part, x, y, z, outCol) {
    let d = part.prims[0].d(x, y, z);
    let c0 = part.prims[0].col[0], c1 = part.prims[0].col[1], c2 = part.prims[0].col[2];
    for (let i = 1; i < part.prims.length; i++) {
      const pr = part.prims[i];
      const pd = pr.d(x, y, z);
      const [nd, t] = smin(d, pd, pr.k ?? part.k);
      c0 = c0 * t + pr.col[0] * (1 - t);
      c1 = c1 * t + pr.col[1] * (1 - t);
      c2 = c2 * t + pr.col[2] * (1 - t);
      d = nd;
    }
    if (outCol) { outCol[0] = c0; outCol[1] = c1; outCol[2] = c2; }
    return d;
  }

  function dist(x, y, z, outCol) {
    let d = 1e9;
    let c = tmpCol;
    c[0] = c[1] = c[2] = 0.5;
    const pc = [0, 0, 0];
    for (let i = 0; i < parts.length; i++) {
      const pd = partEval(parts[i], x, y, z, pc);
      if (i === 0) { d = pd; c[0] = pc[0]; c[1] = pc[1]; c[2] = pc[2]; continue; }
      const [nd, t] = smin(d, pd, parts[i].join);
      c[0] = c[0] * t + pc[0] * (1 - t);
      c[1] = c[1] * t + pc[1] * (1 - t);
      c[2] = c[2] * t + pc[2] * (1 - t);
      d = nd;
    }
    if (outCol) {
      outCol[0] = c[0]; outCol[1] = c[1]; outCol[2] = c[2];
      if (def.paint) def.paint(x, y, z, outCol, (name) => partEval(parts[nameIdx[name]], x, y, z));
    }
    return d;
  }

  function gradient(x, y, z, e = 0.01) {
    const gx = dist(x + e, y, z) - dist(x - e, y, z);
    const gy = dist(x, y + e, z) - dist(x, y - e, z);
    const gz = dist(x, y, z + e) - dist(x, y, z - e);
    const l = Math.hypot(gx, gy, gz) || 1;
    return [gx / l, gy / l, gz / l];
  }

  return { def, parts, dist, partDist: (i, x, y, z) => partEval(parts[i], x, y, z), gradient };
}
