// Soft body: a few hundred "control nodes" under the skin are simulated as a damped
// spring network around the animated pose; the visible mesh is skinned onto them.
// Cheap, smooth, and it reacts to pulls, pokes, shakes and spins.

const SUB_DT = 1 / 240;

export class SoftBody {
  constructor(model, rig) {
    this.model = model;
    this.rig = rig;
    const N = (this.N = model.N);
    const M = (this.M = model.M);
    this.rest = model.pos;
    this.idx = model.idx;
    this.skI = model.skI;
    this.skW = model.skW;
    this.pa = model.pa;
    this.pb = model.pb;
    this.wB = new Float32Array(N);
    for (let i = 0; i < N; i++) this.wB[i] = model.pw[i] / 255;
    this.cpos = model.cpos;
    this.cnorm = model.cnorm;
    this.cwB = new Float32Array(M);
    for (let i = 0; i < M; i++) this.cwB[i] = model.cpw[i] / 255;

    // control node dynamic state
    this.x = Float32Array.from(this.cpos);
    this.v = new Float32Array(M * 3);
    this.s = new Float32Array(M * 3); // plastic (sculpted) offset
    this.pose = Float32Array.from(this.cpos);
    this.u = new Float32Array(M * 3);
    this.mu = new Float32Array(M * 3);
    this.mv = new Float32Array(M * 3);

    // neighbour graph (CSR)
    const deg = new Uint16Array(M);
    for (let i = 0; i < model.pairs.length; i++) deg[model.pairs[i]]++;
    this.nStart = new Uint32Array(M + 1);
    for (let i = 0; i < M; i++) this.nStart[i + 1] = this.nStart[i] + deg[i];
    this.nList = new Uint16Array(this.nStart[M]);
    const fill = new Uint32Array(M);
    for (let i = 0; i < model.pairs.length; i += 2) {
      const a = model.pairs[i], b = model.pairs[i + 1];
      this.nList[this.nStart[a] + fill[a]++] = b;
      this.nList[this.nStart[b] + fill[b]++] = a;
    }
    this.area = model.carea;
    this.totalArea = 0;
    for (let i = 0; i < M; i++) this.totalArea += this.area[i];
    this.meanArea = this.totalArea / M;

    // output
    this.pos = new Float32Array(N * 3);
    this.nrm = new Float32Array(N * 3);

    this.grabs = new Map();
    this.reaction = [0, 0, 0];
    this.reactionTorque = [0, 0, 0];

    // tunable material parameters (set by the material system)
    this.params = {
      k: 120, couple: 10, zeta: 0.4, zetaN: 0.5, pressure: 0.3,
      plastic: 0, plasticDecay: 6, maxStretch: 1.0, gravity: 0.4, inertia: 1.0,
    };
    this.accum = 0;
    this.strain = 0;
    this.skin(true);
  }

  // ------------------------------------------------------------ interaction
  pickVertex(ro, rd, radius = 0.075) {
    const pos = this.pos;
    let best = -1, bestT = 1e9;
    for (let pass = 0; pass < 2 && best < 0; pass++) {
      const r2 = pass === 0 ? radius * radius : radius * radius * 5;
      for (let i = 0; i < this.N; i++) {
        const px = pos[i * 3] - ro[0], py = pos[i * 3 + 1] - ro[1], pz = pos[i * 3 + 2] - ro[2];
        const t = px * rd[0] + py * rd[1] + pz * rd[2];
        if (t <= 0) continue;
        const dx = px - rd[0] * t, dy = py - rd[1] * t, dz = pz - rd[2] * t;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > r2) continue;
        const score = t + d2 * 4;
        if (score < bestT) { bestT = score; best = i; }
      }
    }
    return best;
  }

  beginGrab(id, vertex, sigma = 0.27) {
    const gx = this.rest[vertex * 3], gy = this.rest[vertex * 3 + 1], gz = this.rest[vertex * 3 + 2];
    const nodes = [], w = [];
    for (let c = 0; c < this.M; c++) {
      const dx = this.cpos[c * 3] - gx, dy = this.cpos[c * 3 + 1] - gy, dz = this.cpos[c * 3 + 2] - gz;
      const ww = Math.exp(-(dx * dx + dy * dy + dz * dz) / (sigma * sigma));
      if (ww > 0.04) { nodes.push(c); w.push(ww); }
    }
    const g = { vertex, nodes: Int16Array.from(nodes), w: Float32Array.from(w), delta: [0, 0, 0], press: [0, 0, 0], strength: 1, f: [0, 0, 0] };
    this.grabs.set(id, g);
    return g;
  }

  endGrab(id) {
    const g = this.grabs.get(id);
    this.grabs.delete(id);
    return g;
  }

  // Short impulse (tap/poke) around a vertex, direction in local space.
  poke(vertex, dir, strength = 1, sigma = 0.25) {
    const gx = this.rest[vertex * 3], gy = this.rest[vertex * 3 + 1], gz = this.rest[vertex * 3 + 2];
    for (let c = 0; c < this.M; c++) {
      const dx = this.cpos[c * 3] - gx, dy = this.cpos[c * 3 + 1] - gy, dz = this.cpos[c * 3 + 2] - gz;
      const w = Math.exp(-(dx * dx + dy * dy + dz * dz) / (sigma * sigma)) * strength;
      this.v[c * 3] += dir[0] * w; this.v[c * 3 + 1] += dir[1] * w; this.v[c * 3 + 2] += dir[2] * w;
    }
  }

  kick(vx, vy, vz) {
    for (let c = 0; c < this.M; c++) { this.v[c * 3] += vx; this.v[c * 3 + 1] += vy; this.v[c * 3 + 2] += vz; }
  }

  resetSculpt() { this.s.fill(0); }

  // ------------------------------------------------------------ simulation
  // env: { fict:[x,y,z] local-frame fictitious accel, omega:[...], alpha:[...], gravity:[...] }
  step(dt, env) {
    this.computePose();
    this.accum += Math.min(dt, 1 / 20);
    let guard = 0;
    this.reaction[0] = this.reaction[1] = this.reaction[2] = 0;
    this.reactionTorque[0] = this.reactionTorque[1] = this.reactionTorque[2] = 0;
    let steps = 0;
    while (this.accum >= SUB_DT && guard++ < 10) {
      this.substep(SUB_DT, env);
      this.accum -= SUB_DT;
      steps++;
    }
    if (steps) {
      const inv = 1 / steps;
      for (let k = 0; k < 3; k++) { this.reaction[k] *= inv; this.reactionTorque[k] *= inv; }
    }
  }

  computePose() {
    const m = this.rig.mats, M = this.M;
    const cp = this.cpos, pose = this.pose, s = this.s;
    for (let c = 0; c < M; c++) {
      const x = cp[c * 3], y = cp[c * 3 + 1], z = cp[c * 3 + 2];
      const a = this.model.cpa[c] * 12, b = this.model.cpb[c] * 12, wb = this.cwB[c], wa = 1 - wb;
      pose[c * 3] = wa * (m[a] * x + m[a + 1] * y + m[a + 2] * z + m[a + 3]) + wb * (m[b] * x + m[b + 1] * y + m[b + 2] * z + m[b + 3]) + s[c * 3];
      pose[c * 3 + 1] = wa * (m[a + 4] * x + m[a + 5] * y + m[a + 6] * z + m[a + 7]) + wb * (m[b + 4] * x + m[b + 5] * y + m[b + 6] * z + m[b + 7]) + s[c * 3 + 1];
      pose[c * 3 + 2] = wa * (m[a + 8] * x + m[a + 9] * y + m[a + 10] * z + m[a + 11]) + wb * (m[b + 8] * x + m[b + 9] * y + m[b + 10] * z + m[b + 11]) + s[c * 3 + 2];
    }
  }

  substep(dt, env) {
    const P = this.params, M = this.M;
    const x = this.x, v = this.v, pose = this.pose, u = this.u, mu = this.mu, mv = this.mv, s = this.s;
    const k = P.k;
    const kap = k * P.couple;
    const c = 2 * P.zeta * Math.sqrt(k);
    const cn = 2 * P.zetaN * Math.sqrt(kap);
    const fx = env.fict[0] * P.inertia, fy = env.fict[1] * P.inertia, fz = env.fict[2] * P.inertia;
    const gx = env.gravity[0] * P.gravity, gy = env.gravity[1] * P.gravity, gz = env.gravity[2] * P.gravity;
    const [wx, wy, wz] = env.omega, [ax, ay, az] = env.alpha;
    let dV = 0;
    for (let i = 0; i < M * 3; i++) u[i] = x[i] - pose[i];
    for (let i = 0; i < M; i++) dV += this.area[i] * (u[i * 3] * this.cnorm[i * 3] + u[i * 3 + 1] * this.cnorm[i * 3 + 1] + u[i * 3 + 2] * this.cnorm[i * 3 + 2]);
    const pAvg = dV / this.totalArea;
    const kv = P.pressure * k;
    // neighbour means
    for (let i = 0; i < M; i++) {
      const a = this.nStart[i], b = this.nStart[i + 1];
      let sx = 0, sy = 0, sz = 0, tx = 0, ty = 0, tz = 0;
      for (let n = a; n < b; n++) {
        const j = this.nList[n] * 3;
        sx += u[j]; sy += u[j + 1]; sz += u[j + 2];
        tx += v[j]; ty += v[j + 1]; tz += v[j + 2];
      }
      const inv = b > a ? 1 / (b - a) : 0;
      mu[i * 3] = sx * inv; mu[i * 3 + 1] = sy * inv; mu[i * 3 + 2] = sz * inv;
      mv[i * 3] = tx * inv; mv[i * 3 + 1] = ty * inv; mv[i * 3 + 2] = tz * inv;
    }
    // grabs
    const gfx = this._gf || (this._gf = new Float32Array(M * 3));
    gfx.fill(0);
    const kg = 700, cg = 38;
    for (const g of this.grabs.values()) {
      const dx = g.delta[0] + g.press[0], dy = g.delta[1] + g.press[1], dz = g.delta[2] + g.press[2];
      let rx = 0, ry = 0, rz = 0;
      for (let n = 0; n < g.nodes.length; n++) {
        const i = g.nodes[n], w = g.w[n] * g.strength;
        const i3 = i * 3;
        const fxx = w * (kg * (pose[i3] + dx - x[i3]) - cg * v[i3]);
        const fyy = w * (kg * (pose[i3 + 1] + dy - x[i3 + 1]) - cg * v[i3 + 1]);
        const fzz = w * (kg * (pose[i3 + 2] + dz - x[i3 + 2]) - cg * v[i3 + 2]);
        gfx[i3] += fxx; gfx[i3 + 1] += fyy; gfx[i3 + 2] += fzz;
        rx += fxx; ry += fyy; rz += fzz;
        // torque about the body centre (local origin)
        this.reactionTorque[0] += x[i3 + 1] * fzz - x[i3 + 2] * fyy;
        this.reactionTorque[1] += x[i3 + 2] * fxx - x[i3] * fzz;
        this.reactionTorque[2] += x[i3] * fyy - x[i3 + 1] * fxx;
      }
      g.f[0] = rx; g.f[1] = ry; g.f[2] = rz;
      this.reaction[0] += rx; this.reaction[1] += ry; this.reaction[2] += rz;
    }
    const maxU = 2.2;
    for (let i = 0; i < M; i++) {
      const i3 = i * 3;
      const px = x[i3], py = x[i3 + 1], pz = x[i3 + 2];
      let fxx = -k * u[i3] - c * v[i3] + kap * (mu[i3] - u[i3]) + cn * (mv[i3] - v[i3]) + gfx[i3] + fx + gx;
      let fyy = -k * u[i3 + 1] - c * v[i3 + 1] + kap * (mu[i3 + 1] - u[i3 + 1]) + cn * (mv[i3 + 1] - v[i3 + 1]) + gfx[i3 + 1] + fy + gy;
      let fzz = -k * u[i3 + 2] - c * v[i3 + 2] + kap * (mu[i3 + 2] - u[i3 + 2]) + cn * (mv[i3 + 2] - v[i3 + 2]) + gfx[i3 + 2] + fz + gz;
      // volume pressure
      const pr = -kv * pAvg * (this.area[i] / this.meanArea);
      fxx += pr * this.cnorm[i3]; fyy += pr * this.cnorm[i3 + 1]; fzz += pr * this.cnorm[i3 + 2];
      // rotation: Euler + centrifugal
      fxx += -(ay * pz - az * py) + (wy * wy + wz * wz) * px * 0.35 - (wx * (wy * py + wz * pz)) * 0.35;
      fyy += -(az * px - ax * pz) + (wx * wx + wz * wz) * py * 0.35 - (wy * (wx * px + wz * pz)) * 0.35;
      fzz += -(ax * py - ay * px) + (wx * wx + wy * wy) * pz * 0.35 - (wz * (wx * px + wy * py)) * 0.35;
      v[i3] += fxx * dt; v[i3 + 1] += fyy * dt; v[i3 + 2] += fzz * dt;
      x[i3] += v[i3] * dt; x[i3 + 1] += v[i3 + 1] * dt; x[i3 + 2] += v[i3 + 2] * dt;
      // plastic memory: the rest shape slowly follows the deformed shape
      if (P.plastic > 0 || P.plasticDecay > 0) {
        const ux = x[i3] - pose[i3], uy = x[i3 + 1] - pose[i3 + 1], uz = x[i3 + 2] - pose[i3 + 2];
        const sx = s[i3] + dt * (P.plastic * ux - P.plasticDecay * s[i3]);
        const sy = s[i3 + 1] + dt * (P.plastic * uy - P.plasticDecay * s[i3 + 1]);
        const sz = s[i3 + 2] + dt * (P.plastic * uz - P.plasticDecay * s[i3 + 2]);
        const l = Math.hypot(sx, sy, sz);
        const lim = 1.3;
        const f = l > lim ? lim / l : 1;
        s[i3] = sx * f; s[i3 + 1] = sy * f; s[i3 + 2] = sz * f;
      }
      if (!(Math.abs(x[i3] - pose[i3]) < maxU && Math.abs(x[i3 + 1] - pose[i3 + 1]) < maxU && Math.abs(x[i3 + 2] - pose[i3 + 2]) < maxU)) {
        // blown up: recover gracefully
        x[i3] = pose[i3]; x[i3 + 1] = pose[i3 + 1]; x[i3 + 2] = pose[i3 + 2];
        v[i3] = v[i3 + 1] = v[i3 + 2] = 0;
      }
    }
  }

  // ------------------------------------------------------------ skinning
  skin(initial = false) {
    const N = this.N, M = this.M;
    const m = this.rig.mats, rest = this.rest, out = this.pos;
    const x = this.x, pose = this.pose;
    if (initial) this.computePose();
    // current control displacement from pose
    const u = this.u;
    for (let i = 0; i < M * 3; i++) u[i] = x[i] - pose[i];
    const skI = this.skI, skW = this.skW, pa = this.pa, wB = this.wB;
    let maxU = 0;
    for (let i = 0; i < N; i++) {
      const i3 = i * 3;
      const px = rest[i3], py = rest[i3 + 1], pz = rest[i3 + 2];
      const a = pa[i] * 12, b = this.pb[i] * 12, wb = wB[i], wa = 1 - wb;
      let ox = wa * (m[a] * px + m[a + 1] * py + m[a + 2] * pz + m[a + 3]) + wb * (m[b] * px + m[b + 1] * py + m[b + 2] * pz + m[b + 3]);
      let oy = wa * (m[a + 4] * px + m[a + 5] * py + m[a + 6] * pz + m[a + 7]) + wb * (m[b + 4] * px + m[b + 5] * py + m[b + 6] * pz + m[b + 7]);
      let oz = wa * (m[a + 8] * px + m[a + 9] * py + m[a + 10] * pz + m[a + 11]) + wb * (m[b + 8] * px + m[b + 9] * py + m[b + 10] * pz + m[b + 11]);
      const i4 = i * 4;
      for (let n = 0; n < 4; n++) {
        const w = skW[i4 + n], c3 = skI[i4 + n] * 3;
        ox += w * u[c3]; oy += w * u[c3 + 1]; oz += w * u[c3 + 2];
      }
      // sculpted offset is part of the pose for the nodes but must also show on the surface
      out[i3] = ox; out[i3 + 1] = oy; out[i3 + 2] = oz;
    }
    // sculpt offset (plasticity) rides along via the control nodes
    const s = this.s, sk = skW;
    for (let i = 0; i < N; i++) {
      const i4 = i * 4, i3 = i * 3;
      let ox = 0, oy = 0, oz = 0;
      for (let n = 0; n < 4; n++) { const w = sk[i4 + n], c3 = skI[i4 + n] * 3; ox += w * s[c3]; oy += w * s[c3 + 1]; oz += w * s[c3 + 2]; }
      out[i3] += ox; out[i3 + 1] += oy; out[i3 + 2] += oz;
    }
    this.computeNormals();
  }

  computeNormals() {
    const pos = this.pos, nrm = this.nrm, idx = this.idx;
    nrm.fill(0);
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
      const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
      const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      nrm[a] += nx; nrm[a + 1] += ny; nrm[a + 2] += nz;
      nrm[b] += nx; nrm[b + 1] += ny; nrm[b + 2] += nz;
      nrm[c] += nx; nrm[c + 1] += ny; nrm[c + 2] += nz;
    }
    for (let i = 0; i < nrm.length; i += 3) {
      const l = Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2]) || 1;
      nrm[i] /= l; nrm[i + 1] /= l; nrm[i + 2] /= l;
    }
  }

  // largest displacement from pose, a handy "how stretched is it" measure
  stretchAmount() {
    let m = 0;
    for (let i = 0; i < this.M; i++) {
      const l = Math.abs(this.u[i * 3]) + Math.abs(this.u[i * 3 + 1]) + Math.abs(this.u[i * 3 + 2]);
      if (l > m) m = l;
    }
    return m;
  }
}
