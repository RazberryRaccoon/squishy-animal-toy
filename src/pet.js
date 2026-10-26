// Tamagotchi-style needs. Values run 0..100 where 100 = completely satisfied.
// Nothing ever "dies": low needs just make a friend sad and droopy until looked after.

export const STATS = [
  { key: 'hunger', label: 'Belly', icon: '🍓' },
  { key: 'fun', label: 'Fun', icon: '🎈' },
  { key: 'love', label: 'Love', icon: '💗' },
  { key: 'energy', label: 'Energy', icon: '⚡' },
];

// per-minute change while awake / asleep
const AWAKE = { hunger: -0.8, fun: -0.9, love: -0.6, energy: -0.35 };
const ASLEEP = { hunger: -0.25, fun: -0.25, love: -0.18, energy: 7 };

export const FOODS = {
  berries: { emoji: '🍓', name: 'Berries', hunger: 18, fun: 8, love: 0, energy: 0 },
  chicken: { emoji: '🍗', name: 'Chicken', hunger: 34, fun: 0, love: 0, energy: 0 },
  carrot: { emoji: '🥕', name: 'Carrot', hunger: 20, fun: 0, love: 0, energy: 5 },
  cookie: { emoji: '🍪', name: 'Cookie', hunger: 8, fun: 22, love: 0, energy: 6 },
  pizza: { emoji: '🍕', name: 'Pizza', hunger: 30, fun: 10, love: 0, energy: 0 },
  fish: { emoji: '🐟', name: 'Fish', hunger: 30, fun: 0, love: 4, energy: 0 },
  apple: { emoji: '🍎', name: 'Apple', hunger: 22, fun: 0, love: 0, energy: 3 },
  milk: { emoji: '🥛', name: 'Milk', hunger: 14, fun: 0, love: 6, energy: 9 },
  cheese: { emoji: '🧀', name: 'Cheese', hunger: 20, fun: 5, love: 0, energy: 0 },
};

export const SPECIES = {
  fox: {
    id: 'fox', defaultName: 'Ember', emoji: '🦊', menu: ['berries', 'chicken', 'carrot', 'cookie'], favorite: 'berries',
    likes: { shake: 1.6, squish: 1.0, pet: 1.0 }, jellyHue: 0.06, gummyHue: 0.02, voice: 'fox',
    blurb: 'Bouncy and curious. Loves a good shake!',
  },
  raccoon: {
    id: 'raccoon', defaultName: 'Bandit', emoji: '🦝', menu: ['pizza', 'fish', 'apple', 'cookie'], favorite: 'pizza',
    likes: { shake: 0.9, squish: 1.5, pet: 1.0 }, jellyHue: 0.76, gummyHue: 0.58, voice: 'raccoon',
    blurb: 'A snacky little trash panda. Loves being squished.',
  },
  cat: {
    id: 'cat', defaultName: 'Mochi', emoji: '🐱', menu: ['fish', 'milk', 'chicken', 'cheese'], favorite: 'fish',
    likes: { shake: 0.7, squish: 1.0, pet: 1.7 }, jellyHue: 0.9, gummyHue: 0.33, voice: 'cat',
    blurb: 'Sleepy and sweet. Adores gentle pets.',
  },
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export class Pet {
  constructor(species, saved) {
    this.species = SPECIES[species];
    const s = saved || {};
    this.name = s.name || this.species.defaultName;
    this.stats = { hunger: 80, fun: 80, love: 80, energy: 90, ...(s.stats || {}) };
    this.sleeping = !!s.sleeping;
    this.bond = s.bond || 0;
    this.mat = s.mat || null;
    this.events = []; // things the UI/toy should react to ({type, ...})
    this.hungerGrowl = 0;
    this._playAcc = 0;
    this._petAcc = 0;
    if (s.ts) this.catchUp((Date.now() - s.ts) / 1000);
  }

  // time spent with the app closed counts, but gently and never below a comfortable floor
  catchUp(seconds) {
    const sec = clamp(seconds, 0, 10 * 3600);
    const min = sec / 60;
    const rates = this.sleeping ? ASLEEP : AWAKE;
    for (const k of Object.keys(rates)) {
      const delta = rates[k] * min * 0.45;
      const floor = k === 'energy' ? 15 : 14;
      if (delta < 0) this.stats[k] = Math.max(Math.min(this.stats[k], floor), this.stats[k] + delta);
      else this.stats[k] = clamp(this.stats[k] + delta, 0, 100);
    }
    if (this.sleeping && this.stats.energy >= 99) this.sleeping = false;
  }

  tick(dt) {
    const rates = this.sleeping ? ASLEEP : AWAKE;
    const m = dt / 60;
    for (const k of Object.keys(rates)) this.stats[k] = clamp(this.stats[k] + rates[k] * m, 0, 100);
    if (this.sleeping && this.stats.energy >= 100) this.wake('rested');
    if (this.mood() > 0.7) this.bond += dt / 60;
  }

  mood() {
    const s = this.stats;
    const avg = (s.hunger * 1.2 + s.fun + s.love + s.energy * 0.8) / 4;
    const worst = Math.min(s.hunger, s.fun, s.love, s.energy);
    return clamp((avg * 0.75 + worst * 0.25) / 100, 0, 1);
  }

  level() { return 1 + Math.floor(Math.sqrt(this.bond / 4)); }

  needs() {
    const out = [];
    for (const st of STATS) if (this.stats[st.key] < 35) out.push(st.key);
    return out;
  }

  mostNeeded() {
    let best = null, v = 101;
    for (const st of STATS) if (this.stats[st.key] < v) { v = this.stats[st.key]; best = st.key; }
    return v < 45 ? best : null;
  }

  add(key, amount) { this.stats[key] = clamp(this.stats[key] + amount, 0, 100); }

  // returns {accepted, favorite}
  feed(foodKey) {
    const f = FOODS[foodKey];
    if (this.sleeping) return { accepted: false, reason: 'asleep' };
    if (this.stats.hunger > 94) return { accepted: false, reason: 'full' };
    const fav = foodKey === this.species.favorite;
    const mult = fav ? 1.6 : 1;
    this.add('hunger', f.hunger * mult);
    this.add('fun', f.fun * mult + (fav ? 8 : 0));
    this.add('love', f.love * mult + (fav ? 8 : 2));
    this.add('energy', f.energy * mult);
    return { accepted: true, favorite: fav };
  }

  // continuous play: kind = 'shake' | 'squish'
  play(kind, amount, dt) {
    if (this.sleeping) return;
    const like = this.species.likes[kind] || 1;
    const room = 1 - this.stats.fun / 118;
    this.add('fun', amount * like * room * dt * 6);
    this.add('energy', -amount * dt * 0.25);
    this._playAcc += amount * dt;
  }

  // gentle strokes
  pet(amount, dt) {
    if (this.sleeping) return;
    const like = this.species.likes.pet;
    const room = 1 - this.stats.love / 115;
    this.add('love', amount * like * room * dt * 9);
    this.add('fun', amount * dt * 1.2);
    this._petAcc += amount * dt;
  }

  tapPlay() { this.add('fun', 0.6); }

  sleep() { if (!this.sleeping) { this.sleeping = true; this.events.push({ type: 'sleep' }); } }

  wake(reason) {
    if (!this.sleeping) return;
    this.sleeping = false;
    if (reason !== 'rested' && this.stats.energy < 40) { this.add('love', -4); this.events.push({ type: 'grumpy' }); }
    this.events.push({ type: 'wake', reason });
  }

  toJSON() {
    return { name: this.name, stats: this.stats, sleeping: this.sleeping, bond: this.bond, mat: this.mat, ts: Date.now() };
  }
}
