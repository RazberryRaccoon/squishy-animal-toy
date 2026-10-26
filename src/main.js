import * as THREE from 'three';
import baked from './baked/index.js';
import { createStage } from './scene.js';
import { Toy } from './toy.js';
import { Pet, SPECIES, STATS, FOODS } from './pet.js';
import { MATERIAL_INFO } from './materials.js';
import { bridge, settings } from './bridge.js';
import { sfx } from './audio.js';

const IDS = ['fox', 'raccoon', 'cat'];
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ------------------------------------------------------------------ boot
const saved = bridge.load() || {};
settings.sound = saved.sound !== false;
settings.haptics = saved.haptics !== false;

const stage = createStage($('gl'));
const pets = {}, toys = {};
for (const id of IDS) {
  pets[id] = new Pet(id, saved.pets && saved.pets[id]);
  toys[id] = new Toy(id, baked[id], pets[id]);
}

const app = {
  screen: 'select', sel: Math.max(0, IDS.indexOf(saved.last)), sheet: null, eatTimer: 0, anticipate: 0,
  night: 0, pointers: new Map(), look: { x: 0, y: 0 }, lookTarget: { x: 0, y: 0 }, lastSave: 0, leaving: [],
  focusY: 0.42, scaleT: 1,
};
const cur = () => toys[IDS[app.sel]];
const curPet = () => pets[IDS[app.sel]];

function persist() {
  const out = { v: 1, sound: settings.sound, haptics: settings.haptics, last: IDS[app.sel], pets: {} };
  for (const id of IDS) { pets[id].mat = toys[id].materialState(); out.pets[id] = pets[id].toJSON(); }
  bridge.save(out);
}

// ------------------------------------------------------------------ helpers
const _v = new THREE.Vector3();
const raycaster = new THREE.Raycaster();
function rayFor(x, y) {
  raycaster.setFromCamera(new THREE.Vector2((x / stage.width) * 2 - 1, -(y / stage.height) * 2 + 1), stage.camera);
  return raycaster.ray;
}
function toScreen(v) {
  _v.copy(v).project(stage.camera);
  return { x: (_v.x * 0.5 + 0.5) * stage.width, y: (-_v.y * 0.5 + 0.5) * stage.height };
}
function toast(msg, ms = 1800) {
  const el = $('toast'); el.textContent = msg; el.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), ms);
}
function floatFx(emoji, x, y, dx = (Math.random() - 0.5) * 80) {
  const el = document.createElement('div');
  el.className = 'float'; el.textContent = emoji;
  el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.setProperty('--dx', dx + 'px');
  $('fx').appendChild(el);
  setTimeout(() => el.remove(), 1900);
}
function burst(emoji, n = 5, spread = 70) {
  const toy = cur();
  const s = toScreen(toy.headWorld(_v.clone()));
  for (let i = 0; i < n; i++) setTimeout(() => floatFx(emoji, s.x + (Math.random() - 0.5) * spread * 2, s.y - 20 + Math.random() * 30), i * 90);
}
function fly(emoji, x0, y0, x1, y1, ms, cb) {
  const el = document.createElement('div');
  el.className = 'fly'; el.textContent = emoji;
  el.style.left = '0px'; el.style.top = '0px';
  el.style.transform = `translate(${x0}px, ${y0}px) translate(-50%, -50%) scale(1.3)`;
  $('fx').appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    el.style.transition = `transform ${ms}ms cubic-bezier(.3,.1,.3,1), opacity ${ms}ms ease-in`;
    el.style.transform = `translate(${x1}px, ${y1}px) translate(-50%, -50%) scale(0.45)`;
    el.style.opacity = '0.2';
  }));
  setTimeout(() => { el.remove(); cb && cb(); }, ms);
}

// ------------------------------------------------------------------ select screen
function buildChips() {
  const c = $('chips'); c.innerHTML = '';
  IDS.forEach((id, i) => {
    const b = document.createElement('button');
    b.className = 'chip'; b.dataset.i = i;
    b.innerHTML = `${SPECIES[id].emoji}<span class="dot"></span>`;
    b.onclick = () => { sfx.unlock(); sfx.tap(); switchTo(i); };
    c.appendChild(b);
  });
}
const NEED_TEXT = { hunger: '🍓 Hungry', fun: '🎈 Wants to play', love: '💗 Wants pets', energy: '💤 Sleepy' };
function refreshSelect() {
  const id = IDS[app.sel], pet = pets[id];
  $('pickName').textContent = pet.name;
  $('pickLv').textContent = '♥ Lv ' + pet.level();
  $('pickBlurb').textContent = SPECIES[id].blurb;
  $('playBtn').textContent = 'Play with ' + pet.name;
  const needs = pet.sleeping ? ['💤 Sleeping'] : pet.needs().map((n) => NEED_TEXT[n]);
  $('pickMood').innerHTML = needs.length ? needs.map((t) => `<span class="pill warn">${t}</span>`).join('') : '<span class="pill">😊 Happy</span>';
  [...$('chips').children].forEach((el, i) => {
    el.classList.toggle('on', i === app.sel);
    const m = pets[IDS[i]].mood();
    el.querySelector('.dot').className = 'dot ' + (m > 0.6 ? '' : m > 0.35 ? 'mid' : 'low');
  });
}

function placeToy(toy, x) {
  if (!toy.group.parent) stage.scene.add(toy.group);
  toy.p.set(x, toy.home.y, 0);
  toy.vel.set(0, 0, 0);
}
function switchTo(i, dir) {
  if (i === app.sel) return;
  if (dir === undefined) dir = i > app.sel ? 1 : -1;
  const old = cur();
  old.home.x = -dir * 5.2;
  app.leaving.push({ toy: old, t: 1.6 });
  app.sel = i;
  const nt = cur();
  app.leaving = app.leaving.filter((l) => l.toy !== nt);
  nt.home.x = 0;
  placeToy(nt, dir * 5.2);
  nt.q.identity(); nt.w.set(0, 0, 0);
  nt.anim.trigger('happy');
  refreshSelect();
  sfx.chirp(SPECIES[IDS[i]].voice);
}
$('prev').onclick = () => { sfx.unlock(); switchTo((app.sel + 2) % 3, -1); };
$('next').onclick = () => { sfx.unlock(); switchTo((app.sel + 1) % 3, 1); };

// ------------------------------------------------------------------ screens
function showScreen(name) {
  app.screen = name;
  $('select').classList.toggle('hidden', name !== 'select');
  $('play').classList.toggle('hidden', name !== 'play');
  if (name === 'select') { setSheet(null); refreshSelect(); }
  else { buildPlayUi(); refreshPlay(true); }
}
$('playBtn').onclick = () => {
  sfx.unlock(); sfx.happy(); showScreen('play'); cur().anim.trigger('happy');
  if (!app.hinted) { app.hinted = true; toast('Squish, stretch, shake & tilt me! 💕', 3200); }
};
$('backBtn').onclick = () => { sfx.tap(); showScreen('select'); persist(); };

// ------------------------------------------------------------------ play UI
function buildPlayUi() {
  const pet = curPet(), toy = cur(), sp = pet.species;
  $('nameBtn').firstChild.textContent = pet.name + ' ';
  $('lvTag').textContent = '♥ Lv ' + pet.level();
  // meters
  $('meters').innerHTML = STATS.map((s) => `<div class="meter" data-k="${s.key}"><span class="ic">${s.icon}</span><div class="bar"><i></i></div>${s.label}</div>`).join('');
  // foods
  const fl = $('foods'); fl.innerHTML = '';
  for (const key of sp.menu) {
    const f = FOODS[key];
    const b = document.createElement('div');
    b.className = 'food' + (key === sp.favorite ? ' fav' : ''); b.dataset.k = key;
    b.innerHTML = `<span class="e">${f.emoji}</span>${f.name}`;
    attachFoodDrag(b, key);
    fl.appendChild(b);
  }
  buildStyleUi();
  $('soundBtn').textContent = settings.sound ? '🔊' : '🔇';
  $('hapticBtn').textContent = settings.haptics ? '📳' : '📴';
}

const HUES = [0.0, 0.06, 0.13, 0.25, 0.36, 0.46, 0.55, 0.63, 0.75, 0.88];
function buildStyleUi() {
  const toy = cur();
  const type = toy.matType;
  $('tabs').innerHTML = Object.keys(MATERIAL_INFO).map((t) =>
    `<button class="tab${t === type ? ' on' : ''}" data-t="${t}"><span class="e">${MATERIAL_INFO[t].icon}</span>${MATERIAL_INFO[t].label}</button>`).join('');
  [...$('tabs').children].forEach((b) => { b.onclick = () => { sfx.unlock(); sfx.pop(0.3); toy.setMaterial(b.dataset.t); toy.soft.resetSculpt(); toy.anim.trigger('startle'); bridge.vibrate(18, 120); buildStyleUi(); persist(); }; });
  const p = toy.params[type];
  $('sliders').innerHTML = MATERIAL_INFO[type].sliders.map((s) =>
    `<div class="row"><span>${s.label}</span><input type="range" min="0" max="1" step="0.01" value="${p[s.key]}" data-k="${s.key}"></div>`).join('');
  [...$('sliders').querySelectorAll('input')].forEach((inp) => {
    inp.oninput = () => { toy.setParam(inp.dataset.k, parseFloat(inp.value)); };
    inp.onchange = () => persist();
  });
  const natural = type === 'jelly' || type === 'gummy' ? toy.species[type === 'jelly' ? 'jellyHue' : 'gummyHue'] : -1;
  const sw = $('swatches'); sw.innerHTML = '';
  const mk = (cls, style, hue, title) => {
    const b = document.createElement('button');
    b.className = 'sw ' + cls + (Math.abs(p.hue - hue) < 0.005 ? ' on' : ''); b.style.cssText = style; b.title = title;
    b.onclick = () => { sfx.tap(); toy.setParam('hue', hue); bridge.vibrate(8, 80); buildStyleUi(); persist(); };
    sw.appendChild(b);
  };
  mk('nat', '', natural, 'Natural');
  HUES.forEach((h) => mk('', `background:hsl(${h * 360},85%,62%)`, h, ''));
  $('reformBtn').style.display = type === 'dough' ? '' : 'none';
}
$('reformBtn').onclick = () => { cur().reform(); sfx.pop(0.2); bridge.vibrate(20, 120); };

function setSheet(name) {
  app.sheet = app.sheet === name ? null : name;
  $('trayS').classList.toggle('open', app.sheet === 'tray');
  $('styleS').classList.toggle('open', app.sheet === 'style');
  $('feedBtn').classList.toggle('on', app.sheet === 'tray');
  $('styleBtn').classList.toggle('on', app.sheet === 'style');
}
$('feedBtn').onclick = () => { sfx.unlock(); sfx.tap(); setSheet('tray'); };
$('styleBtn').onclick = () => { sfx.unlock(); sfx.tap(); setSheet('style'); };
$('sleepBtn').onclick = () => {
  sfx.unlock();
  const pet = curPet();
  if (pet.sleeping) pet.wake('button'); else { pet.sleep(); setSheet(null); }
  refreshPlay(true);
};
$('soundBtn').onclick = () => { settings.sound = !settings.sound; $('soundBtn').textContent = settings.sound ? '🔊' : '🔇'; sfx.unlock(); sfx.tap(); persist(); };
$('hapticBtn').onclick = () => { settings.haptics = !settings.haptics; $('hapticBtn').textContent = settings.haptics ? '📳' : '📴'; bridge.vibrate(30, 150); persist(); };
$('nameBtn').onclick = () => { $('renameIn').value = curPet().name; $('renameM').classList.add('on'); setTimeout(() => $('renameIn').focus(), 50); };
$('renameCancel').onclick = () => $('renameM').classList.remove('on');
$('renameOk').onclick = () => {
  const v = $('renameIn').value.trim().slice(0, 14);
  if (v) { curPet().name = v; buildPlayUi(); persist(); }
  $('renameM').classList.remove('on');
};

const NEED_BUBBLE = { hunger: 'Hungry! 🍓', fun: 'Play with me! 🎈', love: 'Pet me? 💗', energy: 'So sleepy… 💤' };
let meterClock = 0;
function refreshPlay(force) {
  const pet = curPet();
  for (const m of document.querySelectorAll('.meter')) {
    const v = pet.stats[m.dataset.k];
    const bar = m.querySelector('i');
    bar.style.width = v.toFixed(0) + '%';
    bar.style.background = v > 60 ? 'var(--good)' : v > 35 ? 'var(--accent2)' : 'var(--bad)';
    m.classList.toggle('low', v < 30);
  }
  $('sleepBtn').innerHTML = pet.sleeping ? '<span class="e">☀️</span>Wake up' : '<span class="e">🌙</span>Sleep';
  $('lvTag').textContent = '♥ Lv ' + pet.level();
  const need = !pet.sleeping && pet.mostNeeded();
  const b = $('bubble');
  if (need && app.eatTimer <= 0) { b.textContent = NEED_BUBBLE[need]; b.classList.add('on'); } else b.classList.remove('on');
}

// ------------------------------------------------------------------ feeding
function mouthScreen() { return toScreen(cur().mouthWorld(_v.clone())); }

function feedFood(key, fromX, fromY) {
  const pet = curPet(), toy = cur();
  const r = pet.feed(key);
  const f = FOODS[key];
  if (!r.accepted) {
    if (r.reason === 'full') { toy.anim.trigger('refuse'); sfx.no(); toast(`${pet.name} is full!`); bridge.vibrate(20, 100); }
    else { toast(`Shh… ${pet.name} is sleeping 💤`); }
    return;
  }
  const m = mouthScreen();
  sfx.tap();
  fly(f.emoji, fromX, fromY, m.x, m.y, 380, () => {
    app.eatTimer = 1.7;
    sfx.chomp(); setTimeout(sfx.chomp, 520); setTimeout(sfx.chomp, 1040);
    [0, 500, 1000].forEach((t) => setTimeout(() => bridge.vibrate(14, 110), t));
    setTimeout(() => {
      toy.anim.trigger('yum');
      sfx.yum();
      burst(r.favorite ? '💗' : '✨', r.favorite ? 7 : 3);
      if (r.favorite) { sfx.happy(); toast(`${pet.name} LOVES ${f.name.toLowerCase()}! 💗`); }
      else toast(`Yum! ${f.emoji}`, 1200);
      refreshPlay(true);
    }, 1500);
  });
  refreshPlay(true);
}

function attachFoodDrag(el, key) {
  let drag = null;
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault(); sfx.unlock();
    el.setPointerCapture(e.pointerId);
    const ghost = document.createElement('div');
    ghost.className = 'dragfood'; ghost.textContent = FOODS[key].emoji;
    ghost.style.left = e.clientX + 'px'; ghost.style.top = e.clientY + 'px';
    document.body.appendChild(ghost);
    drag = { ghost, x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: 0 };
    sfx.tap();
  });
  el.addEventListener('pointermove', (e) => {
    if (!drag) return;
    drag.ghost.style.left = e.clientX + 'px'; drag.ghost.style.top = e.clientY + 'px';
    drag.moved = Math.max(drag.moved, Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0));
    const m = mouthScreen();
    const near = Math.hypot(e.clientX - m.x, e.clientY - m.y) < stage.width * 0.3;
    app.anticipate = near && !curPet().sleeping ? 1 : 0;
    app.lookTarget.x = clamp((e.clientX - m.x) / (stage.width * 0.4), -1, 1);
    app.lookTarget.y = clamp(-(e.clientY - m.y) / (stage.height * 0.25), -1, 1);
  });
  const end = (e) => {
    if (!drag) return;
    const d = drag; drag = null;
    d.ghost.remove(); app.anticipate = 0;
    const tap = d.moved < 12 && performance.now() - d.t0 < 400;
    const m = mouthScreen();
    const near = Math.hypot(e.clientX - m.x, e.clientY - m.y) < stage.width * 0.3;
    if (tap) { const r = el.getBoundingClientRect(); feedFood(key, r.left + r.width / 2, r.top + r.height / 2); }
    else if (near) feedFood(key, e.clientX, e.clientY);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', (e) => { if (drag) { drag.ghost.remove(); drag = null; app.anticipate = 0; } });
}

// ------------------------------------------------------------------ touch on the toy
const canvas = $('gl');
let hapticClock = 0, squishClock = 0;
canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault(); sfx.unlock();
  canvas.setPointerCapture(e.pointerId);
  const toy = cur(), now = performance.now() / 1000;
  const info = toy.beginGrab(e.pointerId, rayFor(e.clientX, e.clientY), now);
  if (info) {
    app.pointers.set(e.pointerId, { mode: 'grab', x: e.clientX, y: e.clientY });
    sfx.squish(0.4); bridge.vibrate(10, 90);
    if (curPet().sleeping) curPet().sleeping && toy.anim.trigger('startle');
  } else {
    app.pointers.set(e.pointerId, { mode: 'spin', x: e.clientX, y: e.clientY, vx: 0, vy: 0, t: now });
    toy.userSpin = true;
  }
  if (app.sheet && app.screen === 'play') { /* keep sheets open while playing */ }
});
canvas.addEventListener('pointermove', (e) => {
  const p = app.pointers.get(e.pointerId);
  const toy = cur(), now = performance.now() / 1000;
  const head = toScreen(toy.headWorld(_v.clone()));
  app.lookTarget.x = clamp((e.clientX - head.x) / (stage.width * 0.45), -1, 1);
  app.lookTarget.y = clamp(-(e.clientY - head.y) / (stage.height * 0.22), -1, 1);
  if (!p) return;
  if (p.mode === 'grab') toy.moveGrab(e.pointerId, rayFor(e.clientX, e.clientY), now);
  else if (p.mode === 'spin') {
    const dx = (e.clientX - p.x) * 0.012, dy = (e.clientY - p.y) * 0.012;
    toy.spinBy(dx, dy);
    const dt = Math.max(0.008, now - p.t);
    p.vx += (dx / dt - p.vx) * 0.4; p.vy += (dy / dt - p.vy) * 0.4;
    p.x = e.clientX; p.y = e.clientY; p.t = now;
  }
});
function release(e) {
  const p = app.pointers.get(e.pointerId);
  if (!p) return;
  app.pointers.delete(e.pointerId);
  const toy = cur(), now = performance.now() / 1000;
  if (p.mode === 'grab') {
    const r = toy.endGrab(e.pointerId, now);
    if (r) {
      if (r.tap) {
        sfx.pop(0.3); bridge.vibrate(14, 120);
        curPet().tapPlay();
        if (Math.random() < 0.3) { toy.anim.trigger('happy'); sfx.chirp(toy.species.voice); }
      } else if (r.moved > 0.25) {
        sfx.pop(clamp(r.moved, 0, 1)); bridge.vibrate(22, 180);
        if (toy.matType === 'jelly' || toy.matType === 'gummy') setTimeout(sfx.boing, 60);
      }
    }
  } else if (p.mode === 'spin') {
    toy.userSpin = false;
    if (![...app.pointers.values()].some((q) => q.mode === 'spin')) {
      toy.w.set(clamp(p.vy, -9, 9), clamp(p.vx, -9, 9), 0);
    }
  }
  if (app.pointers.size === 0) { app.lookTarget.x = 0; app.lookTarget.y = 0; }
}
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);

// ------------------------------------------------------------------ main loop
let last = performance.now();
let frames = 0, accum = 0, bad = 0;
const homeFor = () => {
  // vertical focus: where on the screen the toy should sit
  let cy = app.screen === 'select' ? 0.4 : 0.5;
  let sc = 1;
  if (app.screen === 'play') {
    if (app.sheet === 'style') { cy = 0.325; sc = 0.84; }
    else if (app.sheet === 'tray') { cy = 0.41; sc = 0.94; }
  }
  app.focusY += (cy - app.focusY) * 0.12;
  app.scaleT += (sc - app.scaleT) * 0.12;
  return stage.visibleHeight * (0.5 - app.focusY) + 0.1;
};

function frame(tms) {
  requestAnimationFrame(frame);
  const dt = Math.min((tms - last) / 1000, 0.05); last = tms;
  const now = tms / 1000;
  const mot = bridge.readMotion();
  const g = mot.grav, gl = Math.hypot(g[0], g[1], g[2]);
  let down = [0, -1, 0];
  if (gl > 3) down = [-g[0] / gl, -g[1] / gl, -g[2] / gl];
  const sag = [clamp(down[0], -1, 1) * 0.5, clamp(down[1] + 1, -1.5, 1.5) * 0.5, clamp(down[2], -1, 1) * 0.5];
  app.look.x += (app.lookTarget.x - app.look.x) * Math.min(1, dt * 8);
  app.look.y += (app.lookTarget.y - app.look.y) * Math.min(1, dt * 8);

  const homeY = homeFor();
  const active = cur(), pet = curPet();
  const eating = clamp(Math.max(app.eatTimer > 0 ? 1 : 0, app.anticipate * 0.55), 0, 1);
  app.eatTimer = Math.max(0, app.eatTimer - dt);

  for (const id of IDS) pets[id].tick(dt);

  const world = {
    now, lin: mot.lin, gyro: mot.gyro, grav: sag, gravDir: down, look: app.look,
    eating, busy: app.screen === 'select' && false,
  };
  const list = [active, ...app.leaving.map((l) => l.toy)];
  for (const toy of list) {
    toy.home.y = homeY;
    toy.scale += (app.scaleT - toy.scale) * 0.12;
    toy.camDir.set(0, 0, -1);
    toy.update(dt, toy === active ? world : { ...world, look: { x: 0, y: 0 }, eating: 0 });
  }
  app.leaving = app.leaving.filter((l) => {
    l.t -= dt;
    if (l.t <= 0) { stage.scene.remove(l.toy.group); return false; }
    return true;
  });

  // reactions to what the toy is going through
  const m = active.metrics;
  if (app.screen === 'play' || app.screen === 'select') {
    if (m.squish > 0) pet.play('squish', clamp(m.squish, 0, 2), dt);
    if (m.shaken > 0.25) pet.play('shake', m.shaken * 1.6, dt);
    if (m.petting > 0) pet.pet(m.petting, dt);
    if (pet.sleeping && (m.shaken > 0.8 || m.pulled > 0.7)) pet.wake('shaken');
    if (m.shaken > 0.9 && !active.anim.shots.length && Math.random() < 0.02) { active.anim.trigger('dizzy'); sfx.chirp(active.species.voice); }
  }
  for (const ev of pet.events.splice(0)) {
    if (ev.type === 'sleep') { sfx.sleep(); toast(`${pet.name} is going to sleep… 💤`); }
    else if (ev.type === 'wake') { sfx.wake(); active.anim.trigger('stretchWake'); refreshPlay(true); }
    else if (ev.type === 'grumpy') toast(`${pet.name} is a bit grumpy…`);
  }
  // haptics while stretching / shaking
  if (now - hapticClock > 0.05) {
    let strain = 0;
    for (const info of active.grabInfo.values()) strain = Math.max(strain, info.D.length() / Math.max(0.3, active.soft.params.maxStretch));
    if (strain > 0.08) { bridge.vibrate(12, 25 + strain * 150); hapticClock = now; if (now - squishClock > 0.18 && strain > 0.15) { sfx.squish(strain); squishClock = now; } }
    else if (m.petting > 0.3 && active.id === 'cat') { bridge.vibrate(14, 40); hapticClock = now; }
    else if (m.shaken > 0.5) { bridge.vibrate(14, 60 + m.shaken * 100); hapticClock = now; }
  }

  // sleeping: dim the room
  const targetNight = app.screen === 'play' && pet.sleeping ? 1 : 0;
  app.night += (targetNight - app.night) * Math.min(1, dt * 2.5);
  stage.theme(IDS[app.sel], app.night);
  stage.key.intensity = 2.4 * (1 - 0.6 * app.night);
  stage.fill.intensity = 0.8 * (1 - 0.5 * app.night);
  stage.hemi.intensity = 0.55 * (1 - 0.5 * app.night);
  stage.scene.environmentIntensity = 0.75 * (1 - 0.55 * app.night);
  stage.bgMat.uniforms.uTime.value = now;
  stage.bgMat.uniforms.uTilt.value.set(-down[0], -down[1] - 1);

  // normal matrix for shaders (view-space normals from object-space noise)
  stage.camera.updateMatrixWorld();
  for (const toy of list) {
    const mv = new THREE.Matrix4().multiplyMatrices(stage.camera.matrixWorldInverse, toy.group.matrixWorld);
    toy.shared.uNM.value.getNormalMatrix(mv);
    toy.shared.uTime.value = now;
  }

  // floating Zzz and the speech bubble
  if (app.screen === 'play') {
    if (pet.sleeping && now - (frame.zz || 0) > 1.7) { frame.zz = now; const s = toScreen(active.headWorld(_v.clone())); floatFx('💤', s.x + 50, s.y - 40, 20); }
    const bs = toScreen(active.headWorld(_v.clone()).add(new THREE.Vector3(0.45, 0.95 * active.scale, 0.2)));
    const b = $('bubble'); b.style.left = bs.x + 'px'; b.style.top = bs.y + 'px';
    meterClock += dt;
    if (meterClock > 0.4) { meterClock = 0; refreshPlay(); }
  } else {
    meterClock += dt;
    if (meterClock > 1.5) { meterClock = 0; refreshSelect(); }
  }

  stage.renderer.render(stage.scene, stage.camera);

  // adaptive quality
  accum += dt; frames++;
  if (frames >= 45) {
    const avg = accum / frames; frames = 0; accum = 0;
    if (avg > 0.026) { bad++; } else bad = Math.max(0, bad - 1);
    if (bad >= 2) {
      bad = 0;
      if (stage.dpr > 1.05) stage.setDpr(Math.max(1, stage.dpr - 0.25));
      else for (const id of IDS) { toys[id].shellCount = Math.max(3, toys[id].shellCount - 2); toys[id].refreshMaterial(); }
    }
  }
  if (now - app.lastSave > 5) { app.lastSave = now; persist(); }
}

window.addEventListener('resize', () => stage.resize());
document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });

// ------------------------------------------------------------------ start
buildChips();
refreshSelect();
placeToy(cur(), 0);
cur().q.identity();
// warm up shader programs for every material so switching never hitches
(async () => {
  for (const id of IDS) { stage.scene.remove(toys[id].group); }
  const t = cur();
  stage.scene.add(t.group);
  const orig = t.matType;
  for (const type of Object.keys(MATERIAL_INFO)) {
    t.setMaterial(type);
    t.update(1 / 60, { now: 0, lin: [0, 0, 0], gyro: [0, 0, 0], grav: [0, 0, 0], gravDir: [0, -1, 0], look: { x: 0, y: 0 }, eating: 0 });
    stage.renderer.render(stage.scene, stage.camera);
    await new Promise((r) => requestAnimationFrame(r));
  }
  t.setMaterial(orig);
  window.__ready = true;
  requestAnimationFrame(frame);
})();

// debug hooks for headless testing
window.__app = { app, toys, pets, stage, switchTo, showScreen, setSheet, feedFood, cur };

// Android "back" button: close things from the top down, then return to the menu.
window.__onBack = () => {
  if ($('renameM').classList.contains('on')) { $('renameM').classList.remove('on'); return true; }
  if (app.screen === 'play') {
    if (app.sheet) { setSheet(app.sheet); return true; }
    showScreen('select'); persist(); return true;
  }
  return false;
};
