// The four toy materials: plush, play-dough, jelly and gummy.
// Each is a standard PBR material patched with a little shader code for fur shells,
// fingerprint bumps, glitter, sugar coating and thickness-based translucency.
import * as THREE from 'three';

const COMMON_FRAG = /* glsl */ `
uniform mat3 uNM;
uniform float uHue, uCandy, uTime;
uniform float uGrainAmt, uGrainScale, uBumpAmt, uBumpScale;
uniform float uSparkle, uSparkleScale, uSugar;
uniform float uAlphaMin, uAlphaMax, uDensity;
uniform float uLayer, uFurScale, uShellLen, uBackAlpha;
varying vec3 vRest;
varying float vThick;
float hash13(vec3 p3){ p3 = fract(p3*.1031); p3 += dot(p3, p3.zyx+31.32); return fract((p3.x+p3.y)*p3.z); }
vec3 hash33(vec3 p3){ p3 = fract(p3*vec3(.1031,.1030,.0973)); p3 += dot(p3, p3.yxz+33.33); return fract((p3.xxy+p3.yxx)*p3.zyx); }
vec4 noised(vec3 x){
  vec3 p=floor(x); vec3 w=fract(x);
  vec3 u=w*w*w*(w*(w*6.0-15.0)+10.0);
  vec3 du=30.0*w*w*(w*(w-2.0)+1.0);
  float a=hash13(p), b=hash13(p+vec3(1,0,0)), c=hash13(p+vec3(0,1,0)), d=hash13(p+vec3(1,1,0));
  float e=hash13(p+vec3(0,0,1)), f=hash13(p+vec3(1,0,1)), g=hash13(p+vec3(0,1,1)), h=hash13(p+vec3(1,1,1));
  float k0=a, k1=b-a, k2=c-a, k3=e-a, k4=a-b-c+d, k5=a-c-e+g, k6=a-b-e+f, k7=-a+b+c-d+e-f-g+h;
  return vec4(k0+k1*u.x+k2*u.y+k3*u.z+k4*u.x*u.y+k5*u.y*u.z+k6*u.z*u.x+k7*u.x*u.y*u.z,
    du*vec3(k1+k4*u.y+k6*u.z+k7*u.y*u.z, k2+k5*u.z+k4*u.x+k7*u.z*u.x, k3+k6*u.x+k5*u.y+k7*u.x*u.y));
}
vec3 hsv2rgb(vec3 c){ vec4 K=vec4(1.,2./3.,1./3.,3.); vec3 p=abs(fract(c.xxx+K.xyz)*6.-K.www); return c.z*mix(K.xxx, clamp(p-K.xxx,0.,1.), c.y); }
vec3 applyColor(vec3 c){
  float lum = dot(c, vec3(0.2126,0.7152,0.0722));
  if (uCandy > 0.5) {
    vec3 tint = pow(hsv2rgb(vec3(uHue, 0.86, 0.98)), vec3(2.2));
    return min(tint * (0.5 + 1.25*sqrt(max(lum,0.0))), vec3(1.6));
  }
  if (uHue >= 0.0) {
    vec3 base = pow(hsv2rgb(vec3(uHue, 0.62, 1.0)), vec3(2.2));
    float bl = max(dot(base, vec3(0.2126,0.7152,0.0722)), 0.05);
    return min(base * (lum / bl) * 1.05, vec3(1.5));
  }
  return c;
}
float sparkleMask(){
  if (uSparkle <= 0.0001) return 0.0;
  return step(1.0 - uSparkle, hash13(floor(vRest*uSparkleScale)));
}
vec3 perturbNormal(vec3 n){
  vec3 o = n;
  if (uBumpAmt > 0.0001) {
    vec4 nz = noised(vRest*uBumpScale);
    vec4 nz2 = noised(vRest*uBumpScale*3.7+11.0);
    vec3 g = (nz.yzw + 0.5*nz2.yzw);
    vec3 gv = uNM * g;
    o = normalize(o - uBumpAmt * (gv - dot(gv, o)*o));
  }
  if (uGrainAmt > 0.0001) {
    vec3 r = hash33(floor(vRest*uGrainScale)) - 0.5;
    o = normalize(o + (uNM * r) * uGrainAmt);
  }
  if (uSparkle > 0.0001) {
    vec3 cell = floor(vRest*uSparkleScale);
    float m = step(1.0 - uSparkle, hash13(cell));
    vec3 rs = normalize(uNM * (hash33(cell + 7.0) - 0.5) * 2.0 + o*0.6);
    o = normalize(mix(o, rs, m));
  }
  return o;
}
`;

const VERT_DECL = /* glsl */ `
attribute vec3 aRest;
attribute float aThick;
varying vec3 vRest;
varying float vThick;
uniform float uLayer, uShellLen;
`;

// shared uniform value holders so every material of the toy sees the same numbers
export function makeSharedUniforms() {
  return {
    uNM: { value: new THREE.Matrix3() },
    uHue: { value: -1 }, uCandy: { value: 0 }, uTime: { value: 0 },
    uGrainAmt: { value: 0 }, uGrainScale: { value: 120 },
    uBumpAmt: { value: 0 }, uBumpScale: { value: 14 },
    uSparkle: { value: 0 }, uSparkleScale: { value: 70 }, uSugar: { value: 0 },
    uAlphaMin: { value: 1 }, uAlphaMax: { value: 1 }, uDensity: { value: 2 },
    uFurScale: { value: 70 }, uShellLen: { value: 0.04 }, uBackAlpha: { value: 0.8 },
  };
}

function patch(material, shared, { shell = false, back = false, layer = 0, translucent = false } = {}) {
  const layerU = { value: layer };
  material.userData.layerU = layerU;
  if (shell) material.defines = { ...(material.defines || {}), SHELL: '' };
  if (back) material.defines = { ...(material.defines || {}), BACK: '' };
  if (translucent) material.defines = { ...(material.defines || {}), TRANSLUCENT: '' };
  material.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, shared, { uLayer: layerU });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_DECL)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vRest = aRest; vThick = aThick;
        #ifdef SHELL
          transformed += normalize(objectNormal) * (uShellLen * uLayer);
        #endif`);
    let f = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + COMMON_FRAG);
    f = f.replace('#include <color_fragment>', `#include <color_fragment>
      diffuseColor.rgb = applyColor(diffuseColor.rgb);
      #ifdef BACK
        diffuseColor.rgb *= 0.62;
      #endif
      #ifdef SHELL
      {
        vec3 fc = (mat3(0.8,0.36,-0.48, -0.6,0.48,-0.64, 0.0,0.8,0.6) * vRest) * uFurScale; vec3 cell = floor(fc); vec3 fr = fract(fc) - 0.5 - (hash33(cell + 5.0) - 0.5) * 0.7;
        float len = 0.3 + 0.7 * hash13(cell);
        float rr = length(fr) * 2.0;
        float rad = 0.42 + 0.85 * max(0.0, 1.0 - uLayer / len);
        if (uLayer > len || rr > rad) discard;
        diffuseColor.rgb *= mix(0.74, 1.1, uLayer);
      }
      #endif`);
    f = f.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, 0.1, sparkleMask());`);
    f = f.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      #ifndef SHELL
        normal = perturbNormal(normal);
      #endif`);
    f = f.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      if (uSparkle > 0.0001) {
        vec3 cell = floor(vRest*uSparkleScale);
        float m = step(1.0 - uSparkle, hash13(cell));
        float fl = pow(max(dot(normal, normalize(vViewPosition)), 0.0), 6.0);
        totalEmissiveRadiance += m * fl * 0.55 * hsv2rgb(vec3(hash13(cell + 3.0), 0.35, 1.0));
      }`);
    f = f.replace('#include <opaque_fragment>', `
      #ifdef TRANSLUCENT
        float dens = 1.0 - exp(-uDensity * vThick);
        float ndv = clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0);
        float fres = pow(1.0 - ndv, 2.5);
        #ifdef BACK
          diffuseColor.a = uBackAlpha * (0.55 + 0.45 * dens);
        #else
          diffuseColor.a = clamp(mix(uAlphaMin, uAlphaMax, dens) + fres * 0.3, 0.04, 1.0);
          diffuseColor.a = clamp(diffuseColor.a + dot(totalSpecular, vec3(0.3333)) * 0.9, 0.0, 1.0);
        #endif
        outgoingLight += (1.0 - dens) * 0.22 * diffuseColor.rgb;
      #endif
      #include <opaque_fragment>`);
    sh.fragmentShader = f;
  };
  material.customProgramCacheKey = () => `toy-${shell ? 's' : ''}${back ? 'b' : ''}${translucent ? 't' : ''}`;
  return material;
}

export const SHELL_COUNT = 7;

export function createMaterials(shared) {
  const common = { vertexColors: true };
  const plush = patch(new THREE.MeshPhysicalMaterial({
    ...common, roughness: 0.95, metalness: 0, sheen: 0.8, sheenRoughness: 0.6, sheenColor: new THREE.Color(0.5, 0.5, 0.55),
  }), shared);
  const shells = [];
  for (let i = 0; i < SHELL_COUNT; i++) {
    shells.push(patch(new THREE.MeshStandardMaterial({ ...common, roughness: 0.95, metalness: 0 }), shared, { shell: true, layer: (i + 1) / SHELL_COUNT }));
  }
  const dough = patch(new THREE.MeshPhysicalMaterial({
    ...common, roughness: 0.6, metalness: 0, sheen: 0.25, sheenRoughness: 0.8, sheenColor: new THREE.Color(1, 1, 1),
  }), shared);
  const jelly = patch(new THREE.MeshPhysicalMaterial({
    ...common, roughness: 0.05, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04, ior: 1.45, specularIntensity: 1,
    envMapIntensity: 1.5, transparent: true, depthWrite: false,
  }), shared, { translucent: true });
  const jellyBack = patch(new THREE.MeshStandardMaterial({
    ...common, roughness: 0.2, metalness: 0, envMapIntensity: 0.9, transparent: true, depthWrite: false, side: THREE.BackSide,
  }), shared, { translucent: true, back: true });
  const gummy = patch(new THREE.MeshPhysicalMaterial({
    ...common, roughness: 0.22, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.12, ior: 1.5, specularIntensity: 1,
    envMapIntensity: 1.3, transparent: true, depthWrite: false,
  }), shared, { translucent: true });
  const gummyBack = patch(new THREE.MeshStandardMaterial({
    ...common, roughness: 0.35, metalness: 0, envMapIntensity: 0.9, transparent: true, depthWrite: false, side: THREE.BackSide,
  }), shared, { translucent: true, back: true });
  return { plush, shells, dough, jelly, jellyBack, gummy, gummyBack };
}

// ------------------------------------------------------------------ parameters
export const lerp = (a, b, t) => a + (b - a) * t;

// Slider definitions shown in the UI; values are always 0..1.
export const MATERIAL_INFO = {
  plush: {
    label: 'Plush', icon: '🧸',
    sliders: [
      { key: 'fluff', label: 'Fluffiness', def: 0.6 },
      { key: 'soft', label: 'Softness', def: 0.55 },
      { key: 'bounce', label: 'Bounciness', def: 0.45 },
    ],
  },
  dough: {
    label: 'Play-dough', icon: '🎨',
    sliders: [
      { key: 'firm', label: 'Firmness', def: 0.45 },
      { key: 'memory', label: 'Sculpt memory', def: 0.65 },
      { key: 'sparkle', label: 'Glitter', def: 0.0 },
    ],
  },
  jelly: {
    label: 'Jelly', icon: '🍮',
    sliders: [
      { key: 'wobble', label: 'Wobble', def: 0.7 },
      { key: 'firm', label: 'Firmness', def: 0.35 },
      { key: 'clarity', label: 'Clarity', def: 0.6 },
    ],
  },
  gummy: {
    label: 'Gummy', icon: '🧸',
    sliders: [
      { key: 'stretch', label: 'Stretchiness', def: 0.6 },
      { key: 'clarity', label: 'Clarity', def: 0.35 },
      { key: 'sugar', label: 'Sugar coat', def: 0.0 },
    ],
  },
};
MATERIAL_INFO.gummy.icon = '🍬';

export function defaultParams(type, animalHue) {
  const p = {};
  for (const s of MATERIAL_INFO[type].sliders) p[s.key] = s.def;
  p.hue = type === 'jelly' || type === 'gummy' ? animalHue : -1; // -1 = natural colours
  return p;
}

// Soft-body physics for each material (see SoftBody.params).
export function physicsFor(type, p) {
  switch (type) {
    case 'plush': {
      const soft = p.soft, bounce = p.bounce;
      return { k: lerp(280, 55, soft), couple: 12, zeta: lerp(1.0, 0.2, bounce), zetaN: 0.55, pressure: 0.12,
        plastic: 0, plasticDecay: 8, maxStretch: lerp(0.45, 0.8, soft), gravity: 0.5, inertia: 1.0 };
    }
    case 'dough': {
      const firm = p.firm, mem = p.memory;
      return { k: lerp(70, 420, firm), couple: 14, zeta: 1.15, zetaN: 0.8, pressure: 0.9,
        plastic: mem * 4.5, plasticDecay: lerp(2.6, 0.0, mem), maxStretch: 1.9, gravity: 0.7, inertia: 0.7 };
    }
    case 'jelly': {
      const w = p.wobble, f = p.firm;
      return { k: lerp(38, 200, f), couple: 7, zeta: lerp(0.4, 0.025, w), zetaN: lerp(0.5, 0.12, w), pressure: 0.55,
        plastic: 0, plasticDecay: 8, maxStretch: lerp(1.5, 1.0, f), gravity: 0.8, inertia: 1.7 };
    }
    case 'gummy': {
      const st = p.stretch;
      return { k: lerp(520, 110, st), couple: 9, zeta: 0.3, zetaN: 0.45, pressure: 0.75,
        plastic: 0, plasticDecay: 8, maxStretch: lerp(0.5, 1.9, st), gravity: 0.5, inertia: 1.0 };
    }
  }
}

// Push a material choice into the shared uniforms / material properties.
export function applyLook(type, p, mats, shared) {
  const u = shared;
  u.uCandy.value = type === 'jelly' || type === 'gummy' ? 1 : 0;
  u.uHue.value = p.hue;
  u.uGrainAmt.value = 0; u.uBumpAmt.value = 0; u.uSparkle.value = 0; u.uSugar.value = 0;
  switch (type) {
    case 'plush':
      u.uGrainAmt.value = 0.3; u.uGrainScale.value = 55;
      u.uShellLen.value = 0.004 + 0.07 * p.fluff;
      u.uFurScale.value = lerp(26, 36, p.fluff);
      mats.plush.sheen = lerp(0.5, 1, p.fluff);
      break;
    case 'dough':
      u.uBumpAmt.value = 0.22; u.uBumpScale.value = 15;
      u.uSparkle.value = p.sparkle * 0.09; u.uSparkleScale.value = 85;
      mats.dough.roughness = lerp(0.62, 0.45, p.sparkle);
      break;
    case 'jelly':
      u.uAlphaMax.value = lerp(0.95, 0.55, p.clarity);
      u.uAlphaMin.value = lerp(0.55, 0.1, p.clarity);
      u.uDensity.value = 2.4; u.uBackAlpha.value = lerp(0.95, 0.6, p.clarity);
      break;
    case 'gummy':
      u.uAlphaMax.value = lerp(1.0, 0.72, p.clarity);
      u.uAlphaMin.value = lerp(0.9, 0.35, p.clarity);
      u.uDensity.value = 1.8; u.uBackAlpha.value = lerp(1.0, 0.7, p.clarity);
      u.uGrainAmt.value = p.sugar * 0.7; u.uGrainScale.value = 150;
      u.uSugar.value = p.sugar;
      mats.gummy.roughness = lerp(0.2, 0.6, p.sugar);
      mats.gummy.clearcoat = lerp(1, 0.15, p.sugar);
      break;
  }
}
