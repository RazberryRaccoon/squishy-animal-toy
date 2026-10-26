// Tiny synthesized sound effects (no audio files): squishes, pops, chomps and chirps.
import { settings } from './bridge.js';

let ctx = null;
let master = null;
let noiseBuf = null;
let lastSquish = 0;

function ensure() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.32;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  } catch (e) { return false; }
}

function noise(dur, f0, f1, q, gain, type = 'bandpass') {
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = type; bp.Q.value = q;
  bp.frequency.setValueAtTime(f0, t);
  bp.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.15);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bp); bp.connect(g); g.connect(master);
  src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
}

function tone(freq, dur, gain = 0.3, type = 'sine', slideTo = null, delay = 0) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

export const sfx = {
  unlock() { ensure(); },
  squish(amount = 0.5) {
    if (!settings.sound || !ensure()) return;
    const now = performance.now();
    if (now - lastSquish < 110) return;
    lastSquish = now;
    noise(0.14 + amount * 0.1, 260 + amount * 260, 110, 2.5, 0.22 + amount * 0.2);
  },
  pop(amount = 0.5) {
    if (!settings.sound || !ensure()) return;
    tone(380 + amount * 200, 0.09, 0.3, 'sine', 120);
    noise(0.05, 900, 300, 1.2, 0.12);
  },
  boing() {
    if (!settings.sound || !ensure()) return;
    tone(220, 0.35, 0.22, 'sine', 460);
    tone(330, 0.3, 0.1, 'triangle', 560, 0.02);
  },
  chomp() {
    if (!settings.sound || !ensure()) return;
    noise(0.09, 500, 160, 1.5, 0.3, 'lowpass');
    setTimeout(() => ctx && noise(0.09, 450, 150, 1.5, 0.3, 'lowpass'), 190);
  },
  yum() {
    if (!settings.sound || !ensure()) return;
    tone(520, 0.1, 0.22, 'triangle');
    tone(780, 0.16, 0.22, 'triangle', null, 0.1);
  },
  happy() {
    if (!settings.sound || !ensure()) return;
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.14, 0.16, 'sine', null, i * 0.07));
  },
  no() {
    if (!settings.sound || !ensure()) return;
    tone(260, 0.12, 0.2, 'triangle', 200); tone(240, 0.14, 0.2, 'triangle', 180, 0.14);
  },
  tap() {
    if (!settings.sound || !ensure()) return;
    tone(700, 0.05, 0.12, 'sine', 450);
  },
  chirp(kind = 'fox') {
    if (!settings.sound || !ensure()) return;
    if (kind === 'cat') { tone(620, 0.22, 0.16, 'triangle', 900); tone(900, 0.2, 0.12, 'triangle', 560, 0.12); }
    else if (kind === 'raccoon') { for (let i = 0; i < 4; i++) tone(900 + (i % 2) * 140, 0.05, 0.1, 'square', null, i * 0.06); }
    else { tone(700, 0.08, 0.16, 'triangle', 1000); tone(1000, 0.1, 0.14, 'triangle', 760, 0.09); }
  },
  sleep() {
    if (!settings.sound || !ensure()) return;
    [392, 330, 262].forEach((f, i) => tone(f, 0.4, 0.12, 'sine', null, i * 0.22));
  },
  wake() {
    if (!settings.sound || !ensure()) return;
    [262, 330, 392].forEach((f, i) => tone(f, 0.2, 0.12, 'sine', null, i * 0.1));
  },
};
