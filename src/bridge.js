// Thin wrapper around the Android shell (window.SquishyNative) with browser fallbacks,
// so the same bundle runs on the phone and in a desktop browser for testing.
const N = typeof window !== 'undefined' ? window.SquishyNative : null;

const motion = { lin: [0, 0, 0], gyro: [0, 0, 0], grav: [0, -9.8, 0] };

export const bridge = {
  native: !!N,

  vibrate(ms, amp = 120) {
    if (!settings.haptics) return;
    try {
      if (N) N.vibrate(Math.max(1, Math.round(ms)), Math.max(1, Math.min(255, Math.round(amp))));
      else if (navigator.vibrate) navigator.vibrate(ms);
    } catch (e) { /* ignore */ }
  },

  load() {
    try {
      const s = N ? N.load() : localStorage.getItem('squishy-save');
      return s ? JSON.parse(s) : null;
    } catch (e) { return null; }
  },

  save(obj) {
    const s = JSON.stringify(obj);
    try { if (N) N.save(s); } catch (e) { /* ignore */ }
    try { localStorage.setItem('squishy-save', s); } catch (e) { /* ignore */ }
  },

  // Sample the phone sensors. lin = linear acceleration (m/s^2, gravity removed),
  // gyro = rad/s, grav = gravity vector as measured (points UP out of the phone's frame, 9.8 long).
  readMotion() {
    if (N) {
      try {
        const p = N.motion().split(',');
        if (p.length >= 9) {
          const m = motion;
          for (let i = 0; i < 3; i++) { m.lin[i] = +p[i]; m.gyro[i] = +p[3 + i]; m.grav[i] = +p[6 + i]; }
        }
      } catch (e) { /* ignore */ }
    }
    return motion;
  },
};

export const settings = { sound: true, haptics: true };

// desktop testing hook + browser devicemotion fallback
if (typeof window !== 'undefined') {
  window.__setMotion = (lin, gyro, grav) => {
    if (lin) motion.lin = lin;
    if (gyro) motion.gyro = gyro;
    if (grav) motion.grav = grav;
  };
  if (!N && 'DeviceMotionEvent' in window) {
    window.addEventListener('devicemotion', (e) => {
      const a = e.acceleration, g = e.accelerationIncludingGravity, r = e.rotationRate;
      if (a && a.x != null) { motion.lin = [a.x, a.y, a.z]; }
      if (g && g.x != null) { motion.grav = [g.x, g.y, g.z]; }
      if (r && r.alpha != null) { const d = Math.PI / 180; motion.gyro = [r.beta * d, r.gamma * d, r.alpha * d]; }
    });
  }
}
