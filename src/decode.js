// Decode the baked (base64) model data into typed arrays.
function bytes(b64) {
  const s = atob(b64);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}
const f32 = (b) => { const u = bytes(b); return new Float32Array(u.buffer, 0, u.length >> 2); };
const u16 = (b) => { const u = bytes(b); return new Uint16Array(u.buffer, 0, u.length >> 1); };

export function decodeModel(m) {
  return {
    name: m.name, N: m.N, M: m.M, parts: m.parts, acc: m.acc, spacing: m.spacing,
    pos: f32(m.pos), idx: u16(m.idx), col: bytes(m.col), thick: bytes(m.thick),
    pa: bytes(m.pa), pb: bytes(m.pb), pw: bytes(m.pw),
    skI: u16(m.skI), skW: f32(m.skW),
    cpos: f32(m.cpos), cnorm: f32(m.cnorm), carea: f32(m.carea),
    cpa: bytes(m.cpa), cpb: bytes(m.cpb), cpw: bytes(m.cpw),
    pairs: u16(m.pairs),
  };
}
