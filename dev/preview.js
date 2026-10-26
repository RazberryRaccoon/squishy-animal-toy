import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import baked from '../src/baked/index.js';
import { decodeModel } from '../src/decode.js';

const name = new URLSearchParams(location.search).get('m') || 'fox';
const yaw = parseFloat(new URLSearchParams(location.search).get('yaw') || '0');
const m = decodeModel(baked[name]);
const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
r.setSize(600, 700); document.body.appendChild(r.domElement);
r.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x2a2540);
scene.environment = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture;
const cam = new THREE.PerspectiveCamera(32, 600 / 700, 0.1, 50); cam.position.set(0, 0.1, 6.2);
const g = new THREE.BufferGeometry();
g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3));
const col = new Float32Array(m.N * 3);
const c = new THREE.Color();
for (let i = 0; i < m.N; i++) { c.setRGB(m.col[i*3]/255, m.col[i*3+1]/255, m.col[i*3+2]/255, THREE.SRGBColorSpace); col.set([c.r, c.g, c.b], i*3); }
g.setAttribute('color', new THREE.BufferAttribute(col, 3));
g.setIndex(new THREE.BufferAttribute(m.idx, 1));
g.computeVertexNormals();
const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }));
mesh.rotation.y = yaw; scene.add(mesh);
for (const a of m.acc) {
  const s = new THREE.Mesh(new THREE.SphereGeometry(a.r || 0.05, 12, 8), new THREE.MeshStandardMaterial({ color: a.kind === 'eye' ? 0x111111 : 0xff5599 }));
  s.position.set(...a.p); mesh.add(s);
}
// show control nodes optionally
if (new URLSearchParams(location.search).get('nodes')) {
  for (let i = 0; i < m.M; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.02), new THREE.MeshBasicMaterial({ color: 0xffff00 })); s.position.set(m.cpos[i*3], m.cpos[i*3+1], m.cpos[i*3+2]); mesh.add(s); }
}
const d = new THREE.DirectionalLight(0xffffff, 2.5); d.position.set(2, 3, 4); scene.add(d);
r.render(scene, cam); window.__done = true;
