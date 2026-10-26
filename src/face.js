// Face and whiskers: small meshes glued to the (deforming) skin so they ride along
// with every squish. Each is bound to the 3 nearest vertices plus a "tangent" probe so
// we can rebuild a full orientation every frame.
import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const _p = new THREE.Vector3(), _q = new THREE.Vector3();

function nearest3(model, p) {
  const best = [[1e9, 0], [1e9, 0], [1e9, 0]];
  const pos = model.pos;
  for (let i = 0; i < model.N; i++) {
    const d = (pos[i * 3] - p[0]) ** 2 + (pos[i * 3 + 1] - p[1]) ** 2 + (pos[i * 3 + 2] - p[2]) ** 2;
    if (d < best[2][0]) {
      best[2] = [d, i];
      best.sort((a, b) => a[0] - b[0]);
    }
  }
  const w = best.map((b) => 1 / (Math.sqrt(b[0]) + 0.02));
  const s = w[0] + w[1] + w[2];
  return { idx: best.map((b) => b[1]), w: w.map((v) => v / s) };
}

const eyeMat = (color) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.1, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05 });
const white = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });

export class Face {
  constructor(model, group) {
    this.group = new THREE.Group();
    group.add(this.group);
    this.items = [];
    this.state = { eyeOpen: 1, happy: 0, lookX: 0, lookY: 0, browTilt: 0, browRaise: 0, smile: 0.6, open: 0, cheek: 0.2, dip: 1, noseTwitch: 0 };
    this.mouth = null;
    for (const a of model.acc) {
      const n = new THREE.Vector3(...a.n);
      const t0 = new THREE.Vector3(1, 0, 0).addScaledVector(n, -n.x).normalize();
      const probe = [a.p[0] + t0.x * 0.08, a.p[1] + t0.y * 0.08, a.p[2] + t0.z * 0.08];
      const item = { a, bind: nearest3(model, a.p), bindT: nearest3(model, probe), obj: new THREE.Group(), lift: 0 };
      this.build(item);
      this.group.add(item.obj);
      this.items.push(item);
    }
  }

  build(item) {
    const a = item.a, o = item.obj;
    switch (a.kind) {
      case 'eye': {
        const r = a.r;
        const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), eyeMat(a.color));
        ball.scale.set(1, 1.12, 0.7);
        ball.position.z = r * 0.1;
        const hl1 = new THREE.Mesh(new THREE.SphereGeometry(r * 0.3, 8, 6), white);
        const hl2 = new THREE.Mesh(new THREE.SphereGeometry(r * 0.15, 8, 6), white);
        const arc = new THREE.Mesh(new THREE.TorusGeometry(r * 0.8, r * 0.2, 8, 16, Math.PI), eyeMat(a.color));
        arc.position.z = r * 0.2;
        o.add(ball, hl1, hl2, arc);
        item.parts = { ball, hl1, hl2, arc, r };
        item.lift = r * 0.1;
        break;
      }
      case 'brow': {
        const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, a.len, 4, 8), new THREE.MeshStandardMaterial({ color: 0x2e1c15, roughness: 0.7 }));
        m.rotation.z = Math.PI / 2;
        o.add(m);
        item.lift = 0.012;
        break;
      }
      case 'cheek': {
        const m = new THREE.Mesh(new THREE.CircleGeometry(a.r, 20), new THREE.MeshBasicMaterial({ color: 0xff6b8e, transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, toneMapped: false }));
        m.scale.set(1.2, 0.8, 1);
        o.add(m);
        item.parts = { m };
        item.lift = 0.012;
        break;
      }
      case 'nose': {
        const m = new THREE.Mesh(new THREE.SphereGeometry(a.r, 16, 12), eyeMat(a.color));
        m.scale.set(1.25, 0.85, 0.85);
        const hl = new THREE.Mesh(new THREE.SphereGeometry(a.r * 0.22, 8, 6), white);
        hl.position.set(-a.r * 0.3, a.r * 0.3, a.r * 0.62);
        o.add(m, hl);
        item.parts = { m };
        item.lift = a.r * 0.15;
        break;
      }
      case 'whisker': {
        const len = a.len;
        const g = new THREE.CylinderGeometry(0.0022, 0.0042, len, 4);
        g.translate(0, len / 2, 0);
        const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xf6f3f6, roughness: 0.5 }));
        const ang = (a.idx - 1) * 0.3;
        const dir = new THREE.Vector3(a.side * Math.cos(ang), Math.sin(ang) + 0.05, 0.12).normalize();
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        o.add(m);
        item.lift = 0.0;
        break;
      }
      case 'mouth': {
        const SEG = 18;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((SEG + 1) * 2 * 3), 3));
        const index = [];
        for (let i = 0; i < SEG; i++) { const k = i * 2; index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
        geo.setIndex(index);
        const mat = new THREE.MeshBasicMaterial({ color: 0x2a1713, side: THREE.DoubleSide, toneMapped: false });
        const line = new THREE.Mesh(geo, mat);
        const inside = new THREE.Mesh(new THREE.CircleGeometry(1, 20), new THREE.MeshBasicMaterial({ color: 0x5a1f2a, toneMapped: false }));
        const tongue = new THREE.Mesh(new THREE.CircleGeometry(1, 14), new THREE.MeshBasicMaterial({ color: 0xff8da1, toneMapped: false }));
        const stem = new THREE.Mesh(new THREE.PlaneGeometry(0.012, 0.05), mat);
        o.add(inside, tongue, line, stem);
        item.parts = { line, inside, tongue, stem, SEG, last: '' };
        item.lift = 0.006;
        this.mouth = item;
        break;
      }
    }
  }

  setState(s) { Object.assign(this.state, s); }

  updateMouth(item) {
    const st = this.state, P = item.parts, a = item.a;
    const key = `${st.smile.toFixed(2)}|${st.open.toFixed(2)}|${st.dip.toFixed(2)}`;
    if (key === P.last) return;
    P.last = key;
    const pos = P.line.geometry.attributes.position;
    const w = a.w, th = 0.0075;
    for (let i = 0; i <= P.SEG; i++) {
      const u = (i / P.SEG) * 2 - 1;
      const au = Math.abs(u);
      const x = u * w;
      const y = st.smile * 0.075 * u * u - st.dip * 0.032 * Math.sin(Math.PI * au) - st.open * 0.02 - 0.04 * (a.cat ? 0 : 0);
      pos.setXYZ(i * 2, x, y + th, 0);
      pos.setXYZ(i * 2 + 1, x, y - th, 0);
    }
    pos.needsUpdate = true;
    P.line.geometry.computeBoundingSphere();
    P.stem.position.set(0, 0.02, 0);
    const o = st.open;
    P.inside.visible = P.tongue.visible = o > 0.06;
    if (P.inside.visible) {
      P.inside.scale.set(w * 0.52, 0.01 + 0.07 * o, 1);
      P.inside.position.set(0, -0.03 - 0.045 * o, -0.001);
      P.tongue.scale.set(w * 0.28, 0.006 + 0.03 * o, 1);
      P.tongue.position.set(0, -0.03 - 0.075 * o, 0.0005);
    }
  }

  // positions/normals: the skinned vertex arrays
  update(pos, nrm) {
    const st = this.state;
    for (const it of this.items) {
      const b = it.bind, bt = it.bindT;
      _p.set(0, 0, 0); _z.set(0, 0, 0); _q.set(0, 0, 0);
      for (let k = 0; k < 3; k++) {
        const i = b.idx[k] * 3, w = b.w[k];
        _p.x += pos[i] * w; _p.y += pos[i + 1] * w; _p.z += pos[i + 2] * w;
        _z.x += nrm[i] * w; _z.y += nrm[i + 1] * w; _z.z += nrm[i + 2] * w;
        const j = bt.idx[k] * 3, wt = bt.w[k];
        _q.x += pos[j] * wt; _q.y += pos[j + 1] * wt; _q.z += pos[j + 2] * wt;
      }
      _z.normalize();
      _x.copy(_q).sub(_p);
      _x.addScaledVector(_z, -_x.dot(_z)).normalize();
      _y.crossVectors(_z, _x);
      _m.makeBasis(_x, _y, _z);
      it.obj.quaternion.setFromRotationMatrix(_m);
      it.obj.position.copy(_p).addScaledVector(_z, it.lift);
      this.animate(it, st);
    }
  }

  animate(it, st) {
    const a = it.a;
    switch (a.kind) {
      case 'eye': {
        const P = it.parts, r = P.r;
        const happy = st.happy > 0.5;
        P.ball.visible = !happy; P.hl1.visible = P.hl2.visible = !happy && st.eyeOpen > 0.25; P.arc.visible = happy;
        P.ball.scale.y = 1.12 * Math.max(0.06, st.eyeOpen);
        const lx = st.lookX * r * 0.28, ly = st.lookY * r * 0.28;
        P.hl1.position.set(-r * 0.28 + lx, r * 0.36 * st.eyeOpen + ly, r * 0.66);
        P.hl2.position.set(r * 0.32 + lx * 0.6, -r * 0.3 * st.eyeOpen + ly * 0.6, r * 0.62);
        break;
      }
      case 'brow': {
        it.obj.translateY(st.browRaise * 0.035);
        it.obj.rotateZ(-a.side * st.browTilt);
        break;
      }
      case 'cheek': it.parts.m.material.opacity = 0.55 * st.cheek; break;
      case 'nose': it.parts.m.scale.set(1.25 + st.noseTwitch * 0.15, 0.85 - st.noseTwitch * 0.1, 0.85); break;
      case 'mouth': this.updateMouth(it); break;
    }
  }
}
