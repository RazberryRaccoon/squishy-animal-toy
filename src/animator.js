// Procedural animation: breathing, tail swishes, ear twitches, species idle behaviours,
// emotional reactions, and the face expression targets that go with them.

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const env = (p) => Math.sin(Math.PI * clamp(p, 0, 1));
const sm = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const rnd = (a, b) => a + Math.random() * (b - a);

// each behaviour: dur seconds, fn(p 0..1, e envelope 0..1..0, A animator, ctx)
const B = {
  earTwitch: { dur: 0.9, fn(p, e, A) { const w = Math.sin(p * Math.PI * 6) * 0.32 * e; A.pose('earL').rz += w; A.pose('earR').rz -= w * 0.5; } },
  earFlick: { dur: 0.6, fn(p, e, A) { A.pose(Math.random() < 0.5 ? 'earL' : 'earL').rz += Math.sin(p * Math.PI * 4) * 0.4 * e; A.pose('earL').rx -= 0.2 * e; } },
  headTilt: { dur: 2.2, fn(p, e, A) { const h = A.pose('head'); h.rz += 0.3 * e * A.side; h.ry += 0.12 * e * A.side; A.f.browRaise += 0.4 * e; } },
  lookAround: { dur: 3.2, fn(p, e, A) { const h = A.pose('head'); h.ry += Math.sin(p * Math.PI * 2) * 0.5 * e; A.f.lookX += Math.sin(p * Math.PI * 2) * 0.9 * e; } },
  sniff: { dur: 1.6, fn(p, e, A) { const h = A.pose('head'); h.rx -= 0.14 * e + Math.sin(p * Math.PI * 12) * 0.03 * e; A.f.noseTwitch = Math.max(A.f.noseTwitch, (0.5 + 0.5 * Math.sin(p * 60)) * e); A.f.lookY += 0.6 * e; } },
  tailCurl: { dur: 2.6, fn(p, e, A) { A.pose('tail1').rz += 0.5 * e; A.pose('tail2').rz += 0.7 * e; A.pose('tail3').rz += 0.9 * e; } },
  shiver: { dur: 1.2, fn(p, e, A) { A.pose('body').tx += Math.sin(A.t * 70) * 0.008 * e; A.f.browTilt += 0.25 * e; } },
  hop: {
    dur: 1.1,
    fn(p, e, A) {
      let air = 0, crouch = 0;
      if (p < 0.22) crouch = Math.sin((p / 0.22) * Math.PI * 0.5);
      else if (p < 0.62) { const a = (p - 0.22) / 0.4; air = Math.sin(a * Math.PI); crouch = Math.max(0, 1 - a * 3); }
      else if (p < 0.88) crouch = Math.sin(((p - 0.62) / 0.26) * Math.PI) * 0.8;
      const b = A.pose('body');
      b.ty += air * 0.42; b.sy *= 1 - crouch * 0.14 + air * 0.08; b.sx *= 1 + crouch * 0.08 - air * 0.03; b.sz = b.sx;
      A.pose('earL').rz -= air * 0.3; A.pose('earR').rz += air * 0.3;
      A.pose('tail1').rz += air * 0.45; A.pose('armL').rx -= air * 0.5; A.pose('armR').rx -= air * 0.5;
      A.f.happy = Math.max(A.f.happy, air > 0.2 ? 1 : 0); A.f.open += air * 0.5;
    },
  },
  pounce: {
    dur: 1.9,
    fn(p, e, A) {
      const b = A.pose('body');
      if (p < 0.55) {
        const w = env(p / 0.55);
        b.rx += 0.14 * w; b.sy *= 1 - 0.1 * w; b.sx *= 1 + 0.05 * w; b.sz = b.sx;
        A.pose('tail1').rz += Math.sin(A.t * 22) * 0.25 * w; A.pose('tail2').rz += Math.sin(A.t * 22 - 0.8) * 0.3 * w;
        A.pose('head').rx += 0.1 * w; A.f.browTilt -= 0.3 * w;
      } else if (p < 0.8) {
        const a = (p - 0.55) / 0.25; const s = Math.sin(a * Math.PI);
        b.tz += 0.3 * s; b.ty += 0.22 * s; b.rx += 0.2 * s; b.sy *= 1 + 0.08 * s;
        A.pose('armL').rx -= 1.0 * s; A.pose('armR').rx -= 1.0 * s; A.f.open += 0.4 * s;
      }
    },
  },
  washHands: {
    dur: 3.2,
    fn(p, e, A) {
      const up = clamp(Math.min(p / 0.15, (1 - p) / 0.15), 0, 1);
      const rub = Math.sin(A.t * 15) * 0.14 * up;
      const l = A.pose('armL'), r = A.pose('armR');
      l.rx += -1.2 * up + rub; r.rx += -1.2 * up - rub;
      l.rz += -0.55 * up; r.rz += 0.55 * up;
      A.pose('head').rx += 0.1 * up; A.f.happy = Math.max(A.f.happy, up > 0.6 ? 0.6 : 0); A.f.lookY -= 0.5 * up;
    },
  },
  stretch: {
    dur: 3.0,
    fn(p, e, A) {
      const w = clamp(Math.min(p / 0.25, (1 - p) / 0.25), 0, 1);
      const b = A.pose('body');
      b.rx += 0.3 * w; b.sy *= 1 + 0.07 * w; b.ty -= 0.02 * w;
      A.pose('armL').rx -= 1.5 * w; A.pose('armR').rx -= 1.5 * w;
      A.pose('head').rx -= 0.45 * w; A.pose('tail1').rz += 0.7 * w; A.pose('tail2').rz += 0.4 * w;
      A.f.happy = Math.max(A.f.happy, w > 0.4 ? 1 : 0); A.f.open += 0.3 * w;
    },
  },
  knead: {
    dur: 4.0,
    fn(p, e, A) {
      const w = clamp(Math.min(p / 0.12, (1 - p) / 0.12), 0, 1);
      const s = Math.sin(A.t * 7) * 0.4 * w;
      A.pose('armL').rx += -0.7 * w + s; A.pose('armR').rx += -0.7 * w - s;
      A.pose('head').rx += 0.12 * w; A.f.happy = Math.max(A.f.happy, w * 0.9);
      A.pose('body').tx += Math.sin(A.t * 50) * 0.004 * w; A.f.cheek += 0.4 * w;
    },
  },
  yawn: {
    dur: 2.6,
    fn(p, e, A) {
      const w = env(p);
      A.f.open += w * 1.0; A.pose('head').rx -= 0.3 * w; A.f.eyeMul *= 1 - 0.95 * w; A.pose('body').sy *= 1 + 0.03 * w;
      A.pose('armL').rx -= 0.25 * w; A.pose('armR').rx -= 0.25 * w;
    },
  },
  growl: {
    dur: 2.0,
    fn(p, e, A) {
      const w = env(p);
      A.pose('armL').rx -= 0.5 * w; A.pose('armR').rx -= 0.5 * w; A.pose('armL').rz -= 0.5 * w; A.pose('armR').rz += 0.5 * w;
      A.pose('body').tx += Math.sin(A.t * 45) * 0.006 * w; A.pose('head').rx += 0.2 * w; A.f.smile -= 0.5 * w; A.f.browTilt += 0.35 * w;
    },
  },
  // ---- reactions
  happy: {
    dur: 1.3,
    fn(p, e, A) { B.hop.fn(p * 0.9, e, A); A.f.happy = 1; A.f.cheek += 0.6; A.pose('tail1').rz += Math.sin(A.t * 20) * 0.35 * e; },
  },
  yum: {
    dur: 1.2,
    fn(p, e, A) { A.pose('body').rz += Math.sin(p * Math.PI * 6) * 0.07 * e; A.f.happy = 1; A.f.cheek += 0.7; A.pose('tail1').rz += Math.sin(A.t * 18) * 0.4 * e; },
  },
  refuse: {
    dur: 0.9,
    fn(p, e, A) { A.pose('head').ry += Math.sin(p * Math.PI * 6) * 0.45 * e; A.f.smile -= 0.3 * e; A.f.eyeMul *= 1 - 0.5 * e; },
  },
  startle: {
    dur: 0.8,
    fn(p, e, A) {
      const b = A.pose('body'); b.sy *= 1 + 0.1 * e; b.sx *= 1 - 0.04 * e; b.sz = b.sx; b.ty += 0.12 * e;
      A.pose('earL').rx -= 0.4 * e; A.pose('earR').rx -= 0.4 * e; A.f.open += 0.5 * e; A.f.browRaise += 0.7 * e;
    },
  },
  dizzy: {
    dur: 2.2,
    fn(p, e, A) {
      const h = A.pose('head'); h.rz += Math.sin(A.t * 9) * 0.25 * e; h.ry += Math.cos(A.t * 9) * 0.2 * e;
      A.pose('body').rz += Math.sin(A.t * 9 + 1) * 0.05 * e; A.f.open += 0.3 * e; A.f.lookX += Math.sin(A.t * 9) * e; A.f.lookY += Math.cos(A.t * 9) * e;
    },
  },
  stretchWake: {
    dur: 1.8,
    fn(p, e, A) { const w = env(p); A.pose('armL').rx -= 1.4 * w; A.pose('armR').rx -= 1.4 * w; A.pose('head').rx -= 0.3 * w; A.f.open += 0.6 * w; A.pose('body').sy *= 1 + 0.06 * w; },
  },
};

const IDLE = {
  fox: [['earTwitch', 2], ['headTilt', 2], ['sniff', 2], ['hop', 2], ['lookAround', 1], ['tailCurl', 1], ['pounce', 1]],
  raccoon: [['washHands', 3], ['sniff', 2], ['headTilt', 2], ['earTwitch', 1], ['lookAround', 2], ['tailCurl', 1], ['shiver', 0.4]],
  cat: [['stretch', 1.5], ['knead', 2], ['earFlick', 2], ['yawn', 1.5], ['lookAround', 2], ['tailCurl', 2], ['headTilt', 1], ['sniff', 0.5]],
};

const TAIL = {
  fox: { amp: 0.42, freq: 2.8, base: 0.45 },
  raccoon: { amp: 0.28, freq: 1.7, base: 0.3 },
  cat: { amp: 0.3, freq: 1.2, base: 0.55 },
};

export class Animator {
  constructor(speciesId, rig) {
    this.id = speciesId;
    this.rig = rig;
    this.t = Math.random() * 10;
    this.next = rnd(1.5, 3);
    this.cur = null;
    this.shots = [];
    this.last = '';
    this.side = 1;
    this.blink = rnd(2, 4);
    this.blinkP = -1;
    this.face = { eyeOpen: 1, happy: 0, lookX: 0, lookY: 0, browTilt: 0, browRaise: 0, smile: 0.6, open: 0, cheek: 0.2, dip: 1, noseTwitch: 0 };
    this.f = null;
    this.look = { x: 0, y: 0 };
    this.sleepAmt = 0;
    this.sadAmt = 0;
    this.pet = 0; this.eat = 0; this.pull = 0; this.shake = 0;
    this.activeName = '';
  }

  pose(name) { return this.rig.p(name); }

  trigger(name) {
    if (!B[name]) return;
    this.shots.push({ name, t0: this.t, dur: B[name].dur });
    this.cur = null;
  }

  pickIdle(c) {
    const list = IDLE[this.id].filter(([n]) => {
      if (n === this.last) return false;
      if (c.energy < 30 && (n === 'hop' || n === 'pounce')) return false;
      return true;
    });
    if (c.hunger < 28 && Math.random() < 0.45) return 'growl';
    let tot = 0; for (const [, w] of list) tot += w;
    let r = Math.random() * tot;
    for (const [n, w] of list) { r -= w; if (r <= 0) return n; }
    return list[0][0];
  }

  // c: { dt, mood, hunger, fun, love, energy, sleeping, eating, petting, pulled, shaken, look:{x,y}, busy }
  update(c) {
    const dt = c.dt;
    this.t += dt;
    const t = this.t;
    const rig = this.rig;
    rig.reset();
    this.f = { happy: 0, open: 0, smile: 0, browTilt: 0, browRaise: 0, eyeMul: 1, lookX: 0, lookY: 0, cheek: 0, noseTwitch: 0 };
    const f = this.f;

    const mood = c.mood;
    const sadT = clamp((0.55 - mood) / 0.4, 0, 1);
    const sleepyT = clamp((38 - c.energy) / 30, 0, 1);
    this.sadAmt = sm(this.sadAmt, sadT, 2, dt);
    this.sleepAmt = sm(this.sleepAmt, c.sleeping ? 1 : 0, 1.6, dt);
    this.pet = sm(this.pet, c.petting, 6, dt);
    this.eat = sm(this.eat, c.eating, 8, dt);
    this.pull = sm(this.pull, c.pulled, 10, dt);
    this.shake = sm(this.shake, c.shaken, 6, dt);
    const sad = this.sadAmt, asleep = this.sleepAmt, sleepy = Math.max(sleepyT, asleep);
    const lively = (1 - sad * 0.7) * (1 - asleep);

    // breathing
    const breathRate = lerp(2.2, 1.1, asleep) * lerp(1.0, 0.8, sad);
    const br = Math.sin(t * breathRate * 1.9);
    const body = rig.p('body');
    body.sy *= 1 + 0.016 * br - 0.04 * sad - 0.05 * asleep;
    body.sx *= 1 - 0.008 * br + 0.02 * asleep; body.sz = body.sx;
    body.ty += 0.006 * br;

    // head
    const head = rig.p('head');
    this.look.x = sm(this.look.x, c.look.x, 7, dt);
    this.look.y = sm(this.look.y, c.look.y, 7, dt);
    head.ry += this.look.x * 0.5 * (1 - asleep) + 0.05 * Math.sin(t * 0.7) * lively;
    head.rx += -this.look.y * 0.3 * (1 - asleep) + 0.02 * br + sad * 0.2 + sleepy * 0.18 + asleep * 0.4 + 0.02 * Math.sin(t * 0.9) * lively;
    head.rz += 0.03 * Math.sin(t * 0.5 + 1) * lively + asleep * 0.12;

    // ears
    for (const [n, s] of [['earL', -1], ['earR', 1]]) {
      const e = rig.p(n);
      e.rz += s * (0.5 * sad + 0.35 * asleep) + s * -0.0;
      e.rx -= 0.32 * sad + 0.2 * asleep;
    }

    // tail
    const tl = TAIL[this.id];
    const happy = clamp(mood * 1.2, 0, 1) * (1 - asleep);
    const amp = tl.amp * (0.2 + 0.8 * happy) * (1 + this.pet * 0.7 + this.shake * 0.8);
    const freq = tl.freq * (0.5 + 0.8 * happy) * (1 + this.pet * 0.6);
    const ph = t * freq * 2;
    const curl = tl.base * (1 - sad * 1.3 - asleep * 0.7);
    rig.p('tail1').rz += curl * 0.5 + amp * 0.7 * Math.sin(ph);
    rig.p('tail2').rz += curl * 0.6 + amp * 0.8 * Math.sin(ph - 0.8);
    rig.p('tail3').rz += curl * 0.7 + amp * 0.9 * Math.sin(ph - 1.6);
    rig.p('tail1').ry += amp * 0.35 * Math.sin(ph * 0.5);
    rig.p('tail2').ry += amp * 0.4 * Math.sin(ph * 0.5 - 0.7);

    // arms swing a little / hang
    rig.p('armL').rx += 0.05 * Math.sin(t * 1.1) * lively + asleep * 0.15;
    rig.p('armR').rx += 0.05 * Math.sin(t * 1.1 + 1.7) * lively + asleep * 0.15;

    // idle behaviours
    const busy = c.busy || c.sleeping || this.eat > 0.1 || this.pet > 0.2 || this.pull > 0.1;
    if (!busy && !this.cur && this.shots.length === 0) {
      this.next -= dt;
      if (this.next <= 0) {
        const name = this.pickIdle(c);
        this.cur = { name, t0: t, dur: B[name].dur };
        this.last = name;
        this.side = Math.random() < 0.5 ? 1 : -1;
        this.next = rnd(2.5, 6.5) * lerp(0.7, 1.8, sleepy);
      }
    }
    if (busy && this.cur && this.cur.name !== 'yawn') this.cur = null;
    this.activeName = '';
    if (this.cur) {
      const p = (t - this.cur.t0) / this.cur.dur;
      if (p >= 1) this.cur = null;
      else { B[this.cur.name].fn(p, env(p), this, c); this.activeName = this.cur.name; }
    }
    this.shots = this.shots.filter((s) => {
      const p = (t - s.t0) / s.dur;
      if (p >= 1) return false;
      B[s.name].fn(p, env(p), this, c);
      this.activeName = s.name;
      return true;
    });

    // continuous states
    if (this.pet > 0.02) {
      const pt = this.pet;
      body.tx += Math.sin(t * 52) * 0.004 * pt * (this.id === 'cat' ? 1.6 : 0.5);
      f.happy = Math.max(f.happy, pt > 0.35 ? 1 : 0); f.cheek += 0.7 * pt; head.rz += 0.1 * pt * Math.sin(t * 2.2);
      head.rx += 0.05 * pt;
    }
    if (this.eat > 0.05) {
      const chew = 0.5 + 0.5 * Math.sin(t * 10);
      f.open += (0.15 + 0.5 * chew) * this.eat; f.happy = Math.max(f.happy, 0.0); f.cheek += 0.5 * this.eat;
      head.rx += 0.05 * chew * this.eat; body.sx *= 1 + 0.012 * chew * this.eat; body.sz = body.sx;
    }
    if (this.pull > 0.05) {
      const p = this.pull;
      if (p < 0.65) { f.happy = Math.max(f.happy, p > 0.15 ? 1 : 0); f.open += 0.5 * p; } else { f.open += 0.6; f.browRaise += 0.5; }
    }
    if (this.shake > 0.25) { f.open += 0.4 * this.shake; f.browRaise += 0.4; f.lookX += Math.sin(t * 14) * this.shake * 0.8; }

    // blink
    this.blink -= dt;
    if (this.blink <= 0 && this.blinkP < 0) this.blinkP = 0;
    let blinkMul = 1;
    if (this.blinkP >= 0) {
      this.blinkP += dt / 0.17;
      blinkMul = 1 - Math.sin(Math.min(1, this.blinkP) * Math.PI);
      if (this.blinkP >= 1) { this.blinkP = -1; this.blink = rnd(2.2, 5) * (c.sleeping ? 1 : 1); }
    }

    // face targets
    const F = this.face;
    const smile = lerp(-0.75, 0.95, clamp(mood * 1.15, 0, 1));
    const targets = {
      smile: clamp((c.sleeping ? 0.35 : smile) + f.smile, -1, 1.2),
      open: clamp(f.open, 0, 1),
      cheek: clamp(Math.max(0, (mood - 0.55) * 2.0) * (1 - asleep * 0.4) + f.cheek, 0, 1),
      browTilt: clamp(sad * 0.55 + f.browTilt, -0.5, 0.7),
      browRaise: clamp((mood > 0.82 ? 0.25 : 0) - sad * 0.3 + f.browRaise, -0.5, 1),
      eyeOpen: clamp((1 - sleepy * 0.5 * (c.sleeping ? 2 : 1)) * f.eyeMul, 0, 1) * blinkMul * (c.sleeping ? 0.05 : 1),
      happy: f.happy,
      lookX: clamp(this.look.x + f.lookX, -1, 1),
      lookY: clamp(this.look.y + f.lookY, -1, 1),
      noseTwitch: f.noseTwitch,
    };
    for (const k of Object.keys(targets)) {
      const rate = k === 'happy' ? 18 : k === 'open' ? 14 : k === 'eyeOpen' ? 25 : 8;
      F[k] = sm(F[k], targets[k], rate, dt);
    }
    F.dip = 1;
    rig.update();
  }
}
