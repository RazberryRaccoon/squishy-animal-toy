// Skeleton used for idle animation. Each part is a rigid joint (rotate / scale about a
// pivot) in a parent chain; mesh vertices blend two parts (linear blend skinning).
import * as THREE from 'three';

const tmpT = new THREE.Matrix4();
const tmpR = new THREE.Matrix4();
const tmpS = new THREE.Matrix4();
const tmpP = new THREE.Matrix4();
const tmpE = new THREE.Euler();
const tmpV = new THREE.Vector3();

export class Rig {
  constructor(parts) {
    this.parts = parts;
    this.P = parts.length;
    this.index = {};
    parts.forEach((p, i) => { this.index[p.name] = i; });
    this.pose = parts.map(() => ({ rx: 0, ry: 0, rz: 0, tx: 0, ty: 0, tz: 0, sx: 1, sy: 1, sz: 1 }));
    this.world = parts.map(() => new THREE.Matrix4());
    this.mats = new Float32Array(this.P * 12);
  }

  reset() {
    for (const p of this.pose) { p.rx = p.ry = p.rz = p.tx = p.ty = p.tz = 0; p.sx = p.sy = p.sz = 1; }
  }

  p(name) { return this.pose[this.index[name]]; }

  update() {
    for (let i = 0; i < this.P; i++) {
      const part = this.parts[i];
      const q = this.pose[i];
      tmpV.set(part.pivot[0] + q.tx, part.pivot[1] + q.ty, part.pivot[2] + q.tz);
      tmpT.makeTranslation(tmpV.x, tmpV.y, tmpV.z);
      tmpE.set(q.rx, q.ry, q.rz, 'YXZ');
      tmpR.makeRotationFromEuler(tmpE);
      tmpS.makeScale(q.sx, q.sy, q.sz);
      tmpP.makeTranslation(-part.pivot[0], -part.pivot[1], -part.pivot[2]);
      const w = this.world[i];
      w.copy(tmpT).multiply(tmpR).multiply(tmpS).multiply(tmpP);
      if (part.parent >= 0) w.premultiply(this.world[part.parent]);
      const e = w.elements;
      const o = i * 12;
      this.mats[o] = e[0]; this.mats[o + 1] = e[4]; this.mats[o + 2] = e[8]; this.mats[o + 3] = e[12];
      this.mats[o + 4] = e[1]; this.mats[o + 5] = e[5]; this.mats[o + 6] = e[9]; this.mats[o + 7] = e[13];
      this.mats[o + 8] = e[2]; this.mats[o + 9] = e[6]; this.mats[o + 10] = e[10]; this.mats[o + 11] = e[14];
    }
  }
}
