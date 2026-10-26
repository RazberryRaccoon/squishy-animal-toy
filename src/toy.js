// One toy: sculpted mesh + skeleton + soft body + face + a floating rigid body.
import * as THREE from 'three';
import { decodeModel } from './decode.js';
import { Rig } from './rig.js';
import { SoftBody } from './softbody.js';
import { Animator } from './animator.js';
import { Face } from './face.js';
import { makeSharedUniforms, createMaterials, applyLook, physicsFor, defaultParams, MATERIAL_INFO, SHELL_COUNT } from './materials.js';
import { SPECIES } from './pet.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _inv = new THREE.Matrix4();
const _axis = new THREE.Vector3();

function srgbToLinear(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }

export class Toy {
  constructor(id, baked, pet) {
    this.id = id;
    this.species = SPECIES[id];
    this.pet = pet;
    this.model = decodeModel(baked);
    const m = this.model;
    this.rig = new Rig(m.parts);
    this.soft = new SoftBody(m, this.rig);
    this.anim = new Animator(id, this.rig);
    this.group = new THREE.Group();
    this.group.name = id;

    const geo = (this.geo = new THREE.BufferGeometry());
    const pos = new THREE.BufferAttribute(this.soft.pos, 3); pos.setUsage(THREE.DynamicDrawUsage);
    const nrm = new THREE.BufferAttribute(this.soft.nrm, 3); nrm.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', pos);
    geo.setAttribute('normal', nrm);
    const col = new Float32Array(m.N * 3);
    for (let i = 0; i < m.N * 3; i++) col[i] = srgbToLinear(m.col[i] / 255);
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aRest', new THREE.BufferAttribute(Float32Array.from(m.pos), 3));
    const th = new Float32Array(m.N);
    for (let i = 0; i < m.N; i++) th[i] = m.thick[i] / 255;
    geo.setAttribute('aThick', new THREE.BufferAttribute(th, 1));
    geo.setIndex(new THREE.BufferAttribute(m.idx, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4);

    this.shared = makeSharedUniforms();
    this.mats = createMaterials(this.shared);
    this.body = new THREE.Mesh(geo, this.mats.plush);
    this.back = new THREE.Mesh(geo, this.mats.jellyBack);
    this.shells = this.mats.shells.map((mat) => new THREE.Mesh(geo, mat));
    for (const mesh of [this.body, this.back, ...this.shells]) { mesh.frustumCulled = false; this.group.add(mesh); }
    this.back.renderOrder = 1; this.body.renderOrder = 2;
    this.face = new Face(m, this.group);
    this.shellCount = SHELL_COUNT;

    // material state
    this.matType = 'plush';
    this.params = {};
    for (const t of Object.keys(MATERIAL_INFO)) this.params[t] = defaultParams(t, t === 'jelly' ? this.species.jellyHue : this.species.gummyHue);
    if (pet.mat) this.restoreMaterial(pet.mat);
    this.setMaterial(this.matType);

    // rigid body
    this.home = new THREE.Vector3();
    this.p = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.q = new THREE.Quaternion();
    this.w = new THREE.Vector3();
    this.userSpin = false;
    this.scale = 1;
    this.grabInfo = new Map();
    this.camDir = new THREE.Vector3(0, 0, -1);
    this.t = 0;
    this.metrics = { petting: 0, pulled: 0, shaken: 0, squish: 0 };
    this._shakeSm = 0;
    this._lastReact = [0, 0, 0];
  }

  // ---------------------------------------------------------------- materials
  restoreMaterial(saved) {
    if (saved.type && MATERIAL_INFO[saved.type]) this.matType = saved.type;
    for (const t of Object.keys(MATERIAL_INFO)) if (saved.params && saved.params[t]) Object.assign(this.params[t], saved.params[t]);
  }

  materialState() { return { type: this.matType, params: this.params }; }

  setMaterial(type) {
    this.matType = type;
    const M = this.mats;
    const map = { plush: M.plush, dough: M.dough, jelly: M.jelly, gummy: M.gummy };
    this.body.material = map[type];
    this.back.material = type === 'jelly' ? M.jellyBack : M.gummyBack;
    this.back.visible = type === 'jelly' || type === 'gummy';
    this.refreshMaterial();
  }

  refreshMaterial() {
    const type = this.matType, p = this.params[type];
    applyLook(type, p, this.mats, this.shared);
    Object.assign(this.soft.params, physicsFor(type, p));
    const showShells = type === 'plush' && p.fluff > 0.04;
    const n = showShells ? Math.max(2, Math.round(this.shellCount * (0.4 + 0.6 * p.fluff))) : 0;
    this.shells.forEach((s, i) => { s.visible = i < n; });
    // spread the visible shells across the full fur length
    if (showShells) this.shells.forEach((s, i) => { if (i < n) s.material.userData.layerU.value = (i + 1) / n; });
    // play-dough should not remember a shape from another material
    this.soft.params.plasticDecay = this.soft.params.plasticDecay ?? 6;
  }

  setParam(key, value) {
    this.params[this.matType][key] = value;
    this.refreshMaterial();
  }

  reform() { this.soft.resetSculpt(); }

  // ---------------------------------------------------------------- touch
  beginGrab(id, ray, now) {
    this.group.updateMatrixWorld(true);
    _inv.copy(this.group.matrixWorld).invert();
    const ro = _v.copy(ray.origin).applyMatrix4(_inv);
    const rd = _v2.copy(ray.direction).transformDirection(_inv);
    const v = this.soft.pickVertex([ro.x, ro.y, ro.z], [rd.x, rd.y, rd.z], 0.07 / this.scale);
    if (v < 0) return null;
    const P0 = new THREE.Vector3(this.soft.pos[v * 3], this.soft.pos[v * 3 + 1], this.soft.pos[v * 3 + 2]).applyMatrix4(this.group.matrixWorld);
    const part = this.model.parts[this.soft.wB[v] > 0.5 ? this.soft.pb[v] : this.soft.pa[v]].name;
    const g = this.soft.beginGrab(id, v);
    const info = { id, v, g, P0, part, start: now, moved: 0, speed: 0, last: P0.clone(), lastT: now, D: new THREE.Vector3() };
    this.grabInfo.set(id, info);
    return info;
  }

  moveGrab(id, ray, now) {
    const info = this.grabInfo.get(id);
    if (!info) return;
    const n = this.camDir;
    const denom = ray.direction.dot(n);
    if (Math.abs(denom) < 1e-4) return;
    const t = _v.copy(info.P0).sub(ray.origin).dot(n) / denom;
    const W = _v2.copy(ray.origin).addScaledVector(ray.direction, t);
    const D = info.D.copy(W).sub(info.P0);
    const maxS = this.soft.params.maxStretch * 1.0;
    // soft limit so the toy can be stretched a long way but not infinitely
    const len = D.length();
    if (len > maxS) D.multiplyScalar((maxS + (len - maxS) * 0.12) / len);
    info.moved = Math.max(info.moved, D.length());
    const dtm = Math.max(0.001, now - info.lastT);
    const sp = W.distanceTo(info.last) / dtm;
    info.speed += (sp - info.speed) * 0.25;
    info.last.copy(W); info.lastT = now;
  }

  endGrab(id, now) {
    const info = this.grabInfo.get(id);
    if (!info) return null;
    this.soft.endGrab(id);
    this.grabInfo.delete(id);
    const age = now - info.start;
    const tap = age < 0.28 && info.moved < 0.05;
    const dirL = _v.set(0, 0, -1).applyQuaternion(_q.copy(this.q).invert());
    if (tap) {
      this.soft.poke(info.v, [dirL.x * 16, dirL.y * 16, dirL.z * 16], 1, 0.28);
      this.vel.z -= 0.5;
    } else if (info.moved > 0.2) {
      this._popStrength = info.moved;
    }
    return { tap, moved: info.moved, age, part: info.part, info };
  }

  // background drag: spin the toy
  spinBy(dx, dy) {
    _q2.setFromEuler(new THREE.Euler(dy, dx, 0, 'XYZ'));
    this.q.premultiply(_q2).normalize();
  }

  // ---------------------------------------------------------------- update
  update(dt, world) {
    dt = Math.min(dt, 1 / 24);
    this.t += dt;
    const pet = this.pet;
    // metrics from active grabs
    let petting = 0, pulled = 0, squish = 0;
    const qInv = _q.copy(this.q).invert();
    for (const info of this.grabInfo.values()) {
      const age = world.now - info.start;
      const D = info.D.length();
      const k = Math.max(this.soft.params.k, 1);
      const pm = clamp(12 / k, 0.03, 0.22);
      const press = pm * (1 - Math.exp(-age / 0.1)) * Math.exp(-D * 5);
      const local = _v.set(info.D.x, info.D.y, info.D.z).applyQuaternion(qInv);
      info.g.delta[0] = local.x; info.g.delta[1] = local.y; info.g.delta[2] = local.z;
      const dir = _v2.set(0, 0, -1).applyQuaternion(qInv);
      info.g.press[0] = dir.x * press; info.g.press[1] = dir.y * press; info.g.press[2] = dir.z * press;
      if ((info.part === 'head' || info.part === 'earL' || info.part === 'earR') && D < 0.3 && info.speed > 0.25 && info.speed < 4) petting = Math.max(petting, clamp(info.speed / 1.5, 0.3, 1));
      if (D > 0.18) pulled = Math.max(pulled, clamp(D / 0.9, 0, 1));
      squish += clamp(D * 2 + info.speed * 0.1, 0, 1.2) + 0.25;
    }
    this.metrics.petting = petting; this.metrics.pulled = pulled; this.metrics.squish = squish;
    const lin = world.lin;
    const linMag = Math.hypot(lin[0], lin[1], lin[2]);
    this._shakeSm += (clamp(linMag / 16, 0, 1) - this._shakeSm) * Math.min(1, dt * 8);
    this.metrics.shaken = this._shakeSm;

    // animation
    const st = pet.stats;
    this.anim.update({
      dt, mood: pet.mood(), hunger: st.hunger, fun: st.fun, love: st.love, energy: st.energy,
      sleeping: pet.sleeping, eating: world.eating || 0, petting, pulled, shaken: this._shakeSm, look: world.look, busy: world.busy,
    });
    this.face.setState(this.anim.face);

    // rigid body: floating spring + shake + sag + reaction from pulls
    const steps = 2, h = dt / steps;
    const accW = _v2.set(0, 0, 0);
    for (let s = 0; s < steps; s++) {
      const a = new THREE.Vector3().copy(this.p).sub(this.home).multiplyScalar(-7.5).addScaledVector(this.vel, -3.2);
      a.x -= lin[0] * 0.34; a.y -= lin[1] * 0.34; a.z -= lin[2] * 0.34;
      a.x += world.grav[0] * 1.1; a.y += world.grav[1] * 1.1; a.z += world.grav[2] * 1.1;
      // reaction of the fingers on the body
      const r = this.soft.reaction;
      const R = _v.set(r[0], r[1], r[2]).applyQuaternion(this.q);
      const rl = R.length();
      if (rl > 0) R.multiplyScalar(Math.min(rl * 0.010, 5) / rl);
      a.add(R);
      this.vel.addScaledVector(a, h);
      this.p.addScaledVector(this.vel, h);
      accW.copy(a);
      // rotation
      const tq = this.soft.reactionTorque;
      const T = new THREE.Vector3(tq[0], tq[1], tq[2]).applyQuaternion(this.q);
      const tl = T.length();
      if (tl > 0) T.multiplyScalar(Math.min(tl * 0.02, 9) / tl);
      const alpha = T;
      if (!this.userSpin) {
        // spring back toward facing front
        const qq = _q2.copy(this.q);
        if (qq.w < 0) { qq.x = -qq.x; qq.y = -qq.y; qq.z = -qq.z; qq.w = -qq.w; }
        const ang = 2 * Math.acos(clamp(qq.w, -1, 1));
        const sinHalf = Math.sqrt(Math.max(1 - qq.w * qq.w, 1e-9));
        _axis.set(qq.x / sinHalf, qq.y / sinHalf, qq.z / sinHalf);
        if (ang > 1e-4) alpha.addScaledVector(_axis, -(this.pet.sleeping ? 14 : 8) * ang);
        alpha.addScaledVector(this.w, -2.2);
      } else {
        this.w.multiplyScalar(0.0);
      }
      // phone rotation: the toy tries to stay put in space
      this.w.addScaledVector(alpha, h);
      const wl = this.w.length();
      if (wl > 12) this.w.multiplyScalar(12 / wl);
      if (wl > 1e-5) { _q2.setFromAxisAngle(_axis.copy(this.w).normalize(), wl * h); this.q.premultiply(_q2).normalize(); }
      const g = world.gyro;
      const gl = Math.hypot(g[0], g[1], g[2]);
      if (gl > 1e-4) { _q2.setFromAxisAngle(_axis.set(-g[0], -g[1], -g[2]).normalize(), gl * h * 0.55); this.q.premultiply(_q2).normalize(); }
    }
    const lim = 1.0;
    const off = this.p.clone().sub(this.home);
    if (off.length() > lim) this.p.copy(this.home).addScaledVector(off.normalize(), lim);

    this.group.position.copy(this.p);
    this.group.quaternion.copy(this.q);
    this.group.scale.setScalar(this.scale);

    // soft body
    const qi = _q.copy(this.q).invert();
    const fict = _v.copy(accW).multiplyScalar(-2.4).applyQuaternion(qi);
    const grav = _v2.set(world.gravDir[0], world.gravDir[1], world.gravDir[2]).multiplyScalar(8).applyQuaternion(qi);
    const omega = new THREE.Vector3().copy(this.w).applyQuaternion(qi);
    const alpha = new THREE.Vector3(0, 0, 0);
    this.soft.step(dt, { fict: [fict.x, fict.y, fict.z], gravity: [grav.x, grav.y, grav.z], omega: [omega.x, omega.y, omega.z], alpha: [alpha.x, alpha.y, alpha.z] });
    this.soft.skin();
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.normal.needsUpdate = true;
    this.face.update(this.soft.pos, this.soft.nrm);
    this.group.updateMatrixWorld(true);
  }

  mouthWorld(out) {
    const m = this.face.mouth;
    return m ? m.obj.getWorldPosition(out) : out.copy(this.group.position);
  }

  headWorld(out) {
    return out.set(0, 0.5, 0.2).applyMatrix4(this.group.matrixWorld);
  }
}
