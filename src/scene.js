// Renderer, camera, lights and the dreamy backdrop the toys float in front of.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const BG_VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.9999, 1.0); }
`;
const BG_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uTime, uAspect, uNight;
uniform vec3 uTop, uBottom, uGlow;
uniform vec2 uTilt;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  vec2 uv = vUv;
  vec3 col = mix(uBottom, uTop, smoothstep(0.0, 1.0, uv.y));
  // soft glow behind the toy
  vec2 c = (uv - vec2(0.5, 0.52)) * vec2(uAspect, 1.0);
  float g = exp(-dot(c, c) * 5.0);
  col += uGlow * g * 0.55;
  // floating bokeh
  vec3 bok = vec3(0.0);
  for (int i = 0; i < 14; i++) {
    float fi = float(i);
    vec2 seed = vec2(fi * 1.37, fi * 7.13);
    vec2 p = vec2(hash(seed), hash(seed + 3.1));
    p.x += sin(uTime * (0.05 + 0.04 * hash(seed + 5.0)) + fi) * 0.06 + uTilt.x * (0.02 + 0.03 * hash(seed + 1.0));
    p.y = fract(p.y + uTime * (0.006 + 0.01 * hash(seed + 9.0)) + uTilt.y * 0.01);
    float r = 0.025 + 0.05 * hash(seed + 2.0);
    vec2 d = (uv - p) * vec2(uAspect, 1.0);
    float a = smoothstep(r, r * 0.55, length(d)) * (0.05 + 0.08 * hash(seed + 4.0));
    bok += mix(uGlow, vec3(1.0), 0.45) * a;
  }
  col += bok * (1.0 - uNight * 0.6);
  // night sky: stars
  if (uNight > 0.01) {
    vec2 sp = uv * vec2(uAspect, 1.0) * 38.0;
    vec2 id = floor(sp);
    float h = hash(id);
    float tw = 0.6 + 0.4 * sin(uTime * 2.0 + h * 40.0);
    float star = step(0.965, h) * smoothstep(0.35, 0.0, length(fract(sp) - 0.5)) * tw;
    col += vec3(0.9, 0.95, 1.0) * star * uNight * 0.9;
  }
  // vignette
  float v = smoothstep(1.15, 0.35, length((uv - 0.5) * vec2(1.0, 1.25)));
  col *= mix(0.55, 1.0, v);
  gl_FragColor = vec4(col, 1.0);
}
`;

export const THEMES = {
  fox: { top: [0.22, 0.14, 0.3], bottom: [0.72, 0.38, 0.28], glow: [1.0, 0.55, 0.28] },
  raccoon: { top: [0.12, 0.14, 0.28], bottom: [0.34, 0.3, 0.56], glow: [0.6, 0.55, 1.0] },
  cat: { top: [0.1, 0.2, 0.3], bottom: [0.3, 0.55, 0.62], glow: [0.5, 0.9, 0.9] },
};

export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.sortObjects = true;
  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.03).texture;
  scene.environmentIntensity = 0.75;
  pm.dispose();

  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 60);
  camera.position.set(0, 0, 10);

  const key = new THREE.DirectionalLight(0xfff2e0, 2.4); key.position.set(2.5, 3.5, 5);
  const fill = new THREE.DirectionalLight(0xa9c4ff, 0.8); fill.position.set(-4, -1, 3);
  const rim = new THREE.DirectionalLight(0xffc6e8, 1.5); rim.position.set(-1, 3, -5);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x5a4a7a, 0.55);
  scene.add(key, fill, rim, hemi);

  const bgMat = new THREE.ShaderMaterial({
    vertexShader: BG_VERT, fragmentShader: BG_FRAG, depthWrite: false, depthTest: false,
    uniforms: {
      uTime: { value: 0 }, uAspect: { value: 0.5 }, uNight: { value: 0 },
      uTop: { value: new THREE.Color() }, uBottom: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() },
      uTilt: { value: new THREE.Vector2() },
    },
  });
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMat);
  bg.frustumCulled = false; bg.renderOrder = -100;
  scene.add(bg);

  const stage = {
    renderer, scene, camera, key, fill, rim, hemi, bgMat, width: 1, height: 1, dpr: Math.min(window.devicePixelRatio || 1, 2),
    maxDpr: Math.min(window.devicePixelRatio || 1, 2),
    visibleHeight: 4, visibleWidth: 2,
    resize() {
      const w = window.innerWidth, h = window.innerHeight;
      stage.width = w; stage.height = h;
      renderer.setPixelRatio(stage.dpr);
      renderer.setSize(w, h, false);
      const aspect = w / h;
      camera.aspect = aspect;
      const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const D = Math.max(2.5 / (2 * tan * aspect), 3.1 / (2 * tan));
      camera.position.set(0, 0, D);
      camera.updateProjectionMatrix();
      stage.visibleHeight = 2 * D * tan;
      stage.visibleWidth = stage.visibleHeight * aspect;
      bgMat.uniforms.uAspect.value = aspect;
    },
    setDpr(d) { stage.dpr = d; stage.resize(); },
    theme(id, night, mix) {
      const t = THEMES[id];
      const u = bgMat.uniforms;
      const nightTop = [0.03, 0.04, 0.12], nightBot = [0.08, 0.1, 0.25], nightGlow = [0.35, 0.4, 0.9];
      const f = night;
      u.uTop.value.setRGB(...t.top.map((v, i) => v * (1 - f) + nightTop[i] * f));
      u.uBottom.value.setRGB(...t.bottom.map((v, i) => v * (1 - f) + nightBot[i] * f));
      u.uGlow.value.setRGB(...t.glow.map((v, i) => v * (1 - f) + nightGlow[i] * f));
      u.uNight.value = night;
    },
  };
  stage.resize();
  return stage;
}
