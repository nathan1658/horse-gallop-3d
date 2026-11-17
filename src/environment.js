import * as THREE from 'three';

export const LIGHTING_PRESETS = {
  ember: {
    name: 'Solar Ember',
    sunDir: new THREE.Vector3(-0.45, 0.23, -0.862).normalize(),
    sunColor: '#ffa252',
    sunIntensity: 3.5,
    horizonColor: '#b54d1b',
    zenithColor: '#121d33',
    fogColor: '#382016',
    fillColor: '#9ebce3',
    fillIntensity: 1.95,
    rimColor: '#ffc482',
    rimIntensity: 1.55,
    groundBase: '#1f1814',
    groundWarm: '#33241b',
    sparkColorA: '#ffe494',
    sparkColorB: '#ff6420',
    dustColor: '#c9976e',
    bloomStrength: 0.16,
    breathOpacity: 0.24,
  },
  forge: {
    name: 'Crimson Eclipse',
    sunDir: new THREE.Vector3(-0.52, 0.18, -0.835).normalize(),
    sunColor: '#ff5226',
    sunIntensity: 3.7,
    horizonColor: '#75180c',
    zenithColor: '#0b0912',
    fogColor: '#240e0b',
    fillColor: '#667aa8',
    fillIntensity: 1.35,
    rimColor: '#ff7d47',
    rimIntensity: 1.85,
    groundBase: '#181110',
    groundWarm: '#291815',
    sparkColorA: '#ffe596',
    sparkColorB: '#ff2f0d',
    dustColor: '#9e5542',
    bloomStrength: 0.22,
    breathOpacity: 0.20,
  },
  moonlit: {
    name: 'Nocturne Mist',
    sunDir: new THREE.Vector3(-0.48, 0.26, -0.837).normalize(),
    sunColor: '#bddbff',
    sunIntensity: 3.0,
    horizonColor: '#1f3554',
    zenithColor: '#070b14',
    fogColor: '#101a2b',
    fillColor: '#cfa06b',
    fillIntensity: 1.25,
    rimColor: '#d4e9ff',
    rimIntensity: 1.60,
    groundBase: '#11151c',
    groundWarm: '#1b222e',
    sparkColorA: '#e3f2ff',
    sparkColorB: '#6eb5ff',
    dustColor: '#7a93b0',
    bloomStrength: 0.18,
    breathOpacity: 0.44,
  },
};

const MAX_RIPPLES = 16;

export function createEpicEnvironment(scene, renderer, initialPreset = LIGHTING_PRESETS.ember) {
  scene.fog = new THREE.FogExp2(initialPreset.fogColor, 0.028);

  // 1. Physical Rayleigh + Cornette-Shanks Mie Scattering Sky Dome (smooth limb-darkened sun, zero ring banding)
  const skyUniforms = {
    uSunDir: { value: initialPreset.sunDir.clone() },
    uSunColor: { value: new THREE.Color(initialPreset.sunColor) },
    uHorizonColor: { value: new THREE.Color(initialPreset.horizonColor) },
    uZenithColor: { value: new THREE.Color(initialPreset.zenithColor) },
    uFogColor: { value: new THREE.Color(initialPreset.fogColor) },
    uTime: { value: 0 },
    uLightning: { value: 0 },
  };

  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: skyUniforms,
    vertexShader: /* glsl */ `
      varying vec3 vWorldDir;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldDir = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uHorizonColor;
      uniform vec3 uZenithColor;
      uniform vec3 uFogColor;
      uniform float uTime;
      uniform float uLightning;
      varying vec3 vWorldDir;

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      float noise2(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
        return mix(
          mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
          mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      float fbmCloud(vec2 p) {
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * noise2(p);
          p = p * 2.03 + vec2(7.1, 3.4);
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec3 dir = normalize(vWorldDir);
        float elev = max(0.0, dir.y);

        // Smooth atmospheric gradient dissolving into exact uFogColor at the horizon (zero hard horizon line)
        vec3 sky = mix(uZenithColor, uHorizonColor, pow(1.0 - elev, 2.5));
        float horizonMist = exp(-abs(dir.y) * 11.0);

        // Smooth physical Cornette-Shanks Mie aureole + Gaussian limb-darkened solar core (zero sharp step ring)
        vec3 sunD = normalize(uSunDir);
        float cosTheta = clamp(dot(dir, sunD), -1.0, 1.0);
        float angleSq = max(0.0, 2.0 - 2.0 * cosTheta);

        float g = 0.82;
        float g2 = g * g;
        float miePhase = (1.0 - g2) / pow(max(0.02, 1.0 + g2 - 2.0 * g * cosTheta), 1.5);
        float wideGlow = miePhase * 0.020;
        float innerCorona = exp(-angleSq * 140.0) * 0.68;
        float sunCore = exp(-angleSq * 2200.0) * 2.25;

        // Soft high-altitude cloud wisps
        if (dir.y > 0.015) {
          vec2 cloudUv = dir.xz / (dir.y + 0.20) * 0.48 + vec2(uTime * 0.006, uTime * 0.011);
          float cl = fbmCloud(cloudUv);
          float cloudDensity = smoothstep(0.45, 0.80, cl) * smoothstep(0.015, 0.24, dir.y);
          vec3 cloudLit = mix(uZenithColor * 0.65, uSunColor * 1.15, pow(max(0.0, cosTheta), 3.0) * 0.8 + 0.15);
          sky = mix(sky, cloudLit, cloudDensity * 0.50);
        }

        float aboveHorizon = smoothstep(0.005, 0.06, dir.y);
        sky += uSunColor * (wideGlow + innerCorona + sunCore) * aboveHorizon;
        sky += vec3(0.75, 0.82, 1.0) * uLightning * horizonMist;

        // Exact horizon fog match so distant ground melts seamlessly into the sky
        sky = mix(sky, uFogColor, horizonMist * 0.96);
        if (dir.y <= 0.0) {
          sky = mix(uFogColor, vec3(0.03, 0.024, 0.02), smoothstep(0.0, -0.25, dir.y));
        }

        // Interleaved gradient noise dither eliminates any subtle sky/halo quantization bands
        float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
        sky += (ign - 0.5) * (1.5 / 255.0);

        gl_FragColor = vec4(max(sky, vec3(0.0)), 1.0);
      }
    `,
  });

  const skyDome = new THREE.Mesh(new THREE.SphereGeometry(120, 48, 32), skyMat);
  scene.add(skyDome);

  // Bake soft HDR PMREM Environment Map (with clamped solar intensity so IBL never creates harsh hot spots)
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();
  const envScene = new THREE.Scene();
  const envSkyClone = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 20), skyMat);
  envScene.add(envSkyClone);
  let pmremTarget = pmremGenerator.fromScene(envScene, 0.045);
  scene.environment = pmremTarget.texture;

  function rebuildIBL() {
    const nextTarget = pmremGenerator.fromScene(envScene, 0.045);
    scene.environment = nextTarget.texture;
    pmremTarget.dispose();
    pmremTarget = nextTarget;
  }

  // 2. Photographic 4-Light Cinema Rig (Key Sun + Rim + Sky Fill + Warm Sand Ground-Bounce)
  const sunLight = new THREE.DirectionalLight(initialPreset.sunColor, initialPreset.sunIntensity);
  sunLight.position.copy(initialPreset.sunDir).multiplyScalar(20);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(4096, 4096);
  sunLight.shadow.camera.near = 4;
  sunLight.shadow.camera.far = 38;
  const d = 2.6;
  sunLight.shadow.camera.left = -d;
  sunLight.shadow.camera.right = d;
  sunLight.shadow.camera.top = d;
  sunLight.shadow.camera.bottom = -d;
  sunLight.shadow.bias = -0.00025;
  sunLight.shadow.normalBias = 0.012;
  sunLight.shadow.radius = 1.8;
  scene.add(sunLight);

  const rimLight = new THREE.DirectionalLight(initialPreset.rimColor, initialPreset.rimIntensity);
  rimLight.position.set(-4.2, 2.4, -5.8);
  scene.add(rimLight);

  // Raking high-zenith sky key-fill grazes downward across ribs, veins, jugular groove & fur fibers!
  const fillLight = new THREE.DirectionalLight(initialPreset.fillColor, initialPreset.fillIntensity * 1.25);
  fillLight.position.set(2.8, 6.4, 1.8);
  scene.add(fillLight);

  // Warm upward-grazing sand bounce light reveals chest cleavage, jawline & lower-limb flexor tendons
  const groundBounceLight = new THREE.DirectionalLight(initialPreset.sunColor, 0.85);
  groundBounceLight.position.set(3.2, -1.8, 3.8);
  scene.add(groundBounceLight);

  const hemiLight = new THREE.HemisphereLight(initialPreset.fillColor, '#3b2518', 1.05);
  scene.add(hemiLight);

  const hoofBounceLight = new THREE.PointLight(initialPreset.sparkColorB, 0.0, 3.2, 1.8);
  hoofBounceLight.position.set(0, 0.22, 0.0);
  scene.add(hoofBounceLight);

  // 3. Seamless Opaque PBR Volcanic Alluvial Floor (zero glare blowout, zero flat orange cutouts, zero stripe aliasing)
  const rippleArray = Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, 99, 0));
  let rippleCursor = 0;

  const groundUniforms = {
    uScrollZ: { value: 0 },
    uTime: { value: 0 },
    uRipples: { value: rippleArray },
    uGroundBase: { value: new THREE.Color(initialPreset.groundBase) },
    uGroundWarm: { value: new THREE.Color(initialPreset.groundWarm) },
    uSunColor: { value: new THREE.Color(initialPreset.sunColor) },
  };

  const sandMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.68,
    metalness: 0.02,
    envMapIntensity: 0.35,
  });

  sandMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, groundUniforms);

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vGroundWorld;`
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vGroundWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uScrollZ;
        uniform float uTime;
        uniform vec4 uRipples[${MAX_RIPPLES}];
        uniform vec3 uGroundBase;
        uniform vec3 uGroundWarm;
        uniform vec3 uSunColor;
        varying vec3 vGroundWorld;

        float gHash(vec2 p) {
          p = fract(p * vec2(234.34, 435.345));
          p += dot(p, p + 34.23);
          return fract(p.x * p.y);
        }

        float gNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
          return mix(
            mix(gHash(i), gHash(i + vec2(1.0, 0.0)), u.x),
            mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }

        float gFbm(vec2 p) {
          float v = 0.0, a = 0.5;
          mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);
          for (int i = 0; i < 4; i++) {
            v += a * gNoise(p);
            p = rot * p * 2.07 + vec2(11.3, 7.9);
            a *= 0.5;
          }
          return v;
        }

        // Analytical gradient of soil micro-relief (avoids screen-space dFdx pixel shimmer)
        vec3 evaluateTerrain(vec2 wp, out float dampness, out float hoofTrack, out float shockRing) {
          vec2 sc = vec2(wp.x, wp.y + uScrollZ);

          // Domain-warped alluvial silt & wind-swept volcanic sand (no periodic sine stripes!)
          vec2 warp = vec2(gFbm(sc * 0.22), gFbm(sc * 0.22 + vec2(5.2, 1.3)));
          float macro = gFbm(sc * 0.35 + warp * 0.85);
          float detail = gFbm(sc * 2.6 + warp * 0.4);
          float fineGrit = gNoise(sc * 14.0);

          dampness = smoothstep(0.48, 0.76, macro);

          // Subtle physical hoofprint depressions + soft dust-ripple rings scrolling with the ground
          hoofTrack = 0.0;
          shockRing = 0.0;
          for (int i = 0; i < ${MAX_RIPPLES}; i++) {
            vec4 rp = uRipples[i];
            if (rp.z < 3.0 && rp.w > 0.01) {
              float dist = length(wp - rp.xy);
              // Persistent hoof divot in damp sand
              float divot = exp(-dist * dist * 140.0) * exp(-rp.z * 0.65) * rp.w;
              hoofTrack = max(hoofTrack, divot);

              // Subtle expanding impact shockwave in damp silt
              float radius = 0.10 + rp.z * 1.15;
              float ring = exp(-abs(dist - radius) * 16.0) * exp(-rp.z * 1.85) * rp.w;
              shockRing += ring;
            }
          }

          float h = macro * 0.55 + detail * 0.32 + fineGrit * 0.13 - hoofTrack * 0.35 + shockRing * 0.12;
          return vec3(h, detail, fineGrit);
        }`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float dampness = 0.0;
        float hoofTrack = 0.0;
        float shockRing = 0.0;
        vec3 terr = evaluateTerrain(vGroundWorld.xz, dampness, hoofTrack, shockRing);

        vec3 soilCol = mix(uGroundBase, uGroundWarm, terr.y * 0.75 + 0.15 * terr.z);
        // Damp alluvial patches & compressed hoofprints are naturally darker & richer, never neon orange
        soilCol *= mix(1.0, 0.58, dampness * 0.75);
        soilCol *= mix(1.0, 0.45, hoofTrack * 0.85);
        soilCol += uSunColor * shockRing * 0.08;

        diffuseColor.rgb = soilCol;`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        // Keep roughness >= 0.46 everywhere so direct sun never creates a blinding white glare blob on the floor
        float distSmooth = smoothstep(4.0, 38.0, length(vGroundWorld.xz));
        roughnessFactor = mix(0.84, 0.48, dampness * 0.85 + shockRing * 0.25);
        roughnessFactor = mix(roughnessFactor, 0.78, distSmooth);`
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          // Distance-attenuated soil normal relief so horizon never shimmers
          float distAtten = 1.0 - smoothstep(3.0, 22.0, length(vGroundWorld.xz));
          vec3 dPdx = dFdx(-vViewPosition);
          vec3 dPdy = dFdy(-vViewPosition);
          float dHdx = dFdx(terr.x);
          float dHdy = dFdy(terr.x);
          vec3 r1 = cross(dPdy, normal);
          vec3 r2 = cross(normal, dPdx);
          float det = dot(dPdx, r1);
          if (abs(det) > 1e-7) {
            vec3 grad = sign(det) * (dHdx * r1 + dHdy * r2);
            normal = normalize(abs(det) * normal - (0.014 * distAtten) * grad);
          }
        }`
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        // Soft-compress ground specular highlights so low-angle sun produces warm bronze sheen, never white blowout
        reflectedLight.directSpecular = reflectedLight.directSpecular / (1.0 + reflectedLight.directSpecular * 1.65);`
      );
  };
  sandMat.customProgramCacheKey = () => 'equus-volcanic-alluvial-v2';

  const sandPlane = new THREE.Mesh(new THREE.PlaneGeometry(180, 180, 1, 1), sandMat);
  sandPlane.rotation.x = -Math.PI / 2;
  sandPlane.receiveShadow = true;
  scene.add(sandPlane);

  // 4. Sculpted Smooth-Weathered Volcanic Basalt Ridges on Distant Horizon
  const monolithGroup = new THREE.Group();
  const ridgeMat = new THREE.MeshStandardMaterial({
    color: '#16110f',
    roughness: 0.94,
    metalness: 0.02,
  });

  function buildVolcanicRidge(width, depth, maxHeight, seedOffset) {
    const geo = new THREE.PlaneGeometry(width, depth, 44, 20);
    geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const nx = x / (width * 0.5);
      const nz = z / (depth * 0.5);
      const envelope = Math.max(0, 1 - nx * nx * 0.92) * Math.max(0, 1 - nz * nz);
      const r1 = 1 - Math.abs(Math.sin(x * 0.22 + seedOffset));
      const r2 = 1 - Math.abs(Math.sin(x * 0.57 - z * 0.38 + seedOffset * 2.1));
      const r3 = 0.5 + 0.5 * Math.cos(x * 1.15 + z * 0.85 + seedOffset * 3.4);
      const h = Math.pow(envelope, 1.45) * maxHeight * (r1 * 0.58 + r2 * 0.28 + r3 * 0.14);
      p.setY(i, h - 0.12);
    }
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, ridgeMat);
  }

  const ridgeConfigs = [
    { x: -26, z: -32, w: 34, d: 15, h: 5.8, s: 1.1, ry: 0.32 },
    { x: -34, z: 8, w: 36, d: 16, h: 6.8, s: 2.7, ry: 1.38 },
    { x: 28, z: -34, w: 34, d: 15, h: 5.2, s: 4.3, ry: -0.38 },
    { x: 34, z: 14, w: 30, d: 14, h: 5.6, s: 5.9, ry: -1.32 },
  ];
  const monoliths = ridgeConfigs.map((cfg) => {
    const m = buildVolcanicRidge(cfg.w, cfg.d, cfg.h, cfg.s);
    m.position.set(cfg.x, 0, cfg.z);
    m.rotation.y = cfg.ry;
    monolithGroup.add(m);
    return m;
  });
  scene.add(monolithGroup);

  // 5. GPU Particle Systems: Hoof Sparks, Kicked-Up Dust Plumes, Nostril Breath & Soft Bokeh Motes
  const SPARK_MAX = 360;
  const sparkPos = new Float32Array(SPARK_MAX * 3);
  const sparkVel = new Float32Array(SPARK_MAX * 3);
  const sparkLife = new Float32Array(SPARK_MAX * 2);
  const sparkSeed = new Float32Array(SPARK_MAX);
  for (let i = 0; i < SPARK_MAX; i++) {
    sparkLife[i * 2] = 99;
    sparkLife[i * 2 + 1] = 1;
    sparkSeed[i] = Math.random();
  }
  let sparkCursor = 0;

  const sparkGeo = new THREE.BufferGeometry();
  const sparkPosAttr = new THREE.BufferAttribute(sparkPos, 3).setUsage(THREE.DynamicDrawUsage);
  const sparkLifeAttr = new THREE.BufferAttribute(sparkLife, 2).setUsage(THREE.DynamicDrawUsage);
  sparkGeo.setAttribute('position', sparkPosAttr);
  sparkGeo.setAttribute('aLife', sparkLifeAttr);
  sparkGeo.setAttribute('aSeed', new THREE.BufferAttribute(sparkSeed, 1));
  sparkGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 30);

  const sparkMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uColorHot: { value: new THREE.Color(initialPreset.sparkColorA) },
      uColorCool: { value: new THREE.Color(initialPreset.sparkColorB) },
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
    },
    vertexShader: /* glsl */ `
      attribute vec2 aLife;
      attribute float aSeed;
      uniform float uPixelRatio;
      varying float vNormAge;
      void main() {
        vNormAge = clamp(aLife.x / max(0.001, aLife.y), 0.0, 1.0);
        if (aLife.x >= aLife.y) {
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          gl_PointSize = 0.0;
          return;
        }
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float size = mix(11.0, 2.5, vNormAge) * (0.55 + 0.65 * aSeed) * uPixelRatio;
        gl_PointSize = clamp(size / max(0.35, -mv.z), 1.2, 18.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColorHot;
      uniform vec3 uColorCool;
      varying float vNormAge;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float r = length(c) * 2.0;
        if (r > 1.0) discard;
        float core = exp(-r * r * 5.5);
        vec3 col = mix(uColorHot * 1.65, uColorCool, pow(vNormAge, 0.65));
        float alpha = core * (1.0 - pow(vNormAge, 1.5));
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });
  const sparkPoints = new THREE.Points(sparkGeo, sparkMat);
  sparkPoints.frustumCulled = false;
  scene.add(sparkPoints);

  const PLUME_MAX = 260;
  const plumePos = new Float32Array(PLUME_MAX * 3);
  const plumeVel = new Float32Array(PLUME_MAX * 3);
  const plumeMeta = new Float32Array(PLUME_MAX * 4);
  for (let i = 0; i < PLUME_MAX; i++) {
    plumeMeta[i * 4] = 99;
    plumeMeta[i * 4 + 1] = 1;
  }
  let plumeCursor = 0;

  const plumeGeo = new THREE.BufferGeometry();
  const plumePosAttr = new THREE.BufferAttribute(plumePos, 3).setUsage(THREE.DynamicDrawUsage);
  const plumeMetaAttr = new THREE.BufferAttribute(plumeMeta, 4).setUsage(THREE.DynamicDrawUsage);
  plumeGeo.setAttribute('position', plumePosAttr);
  plumeGeo.setAttribute('aMeta', plumeMetaAttr);
  plumeGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 30);

  const plumeMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uDustColor: { value: new THREE.Color(initialPreset.dustColor) },
      uSunColor: { value: new THREE.Color(initialPreset.sunColor) },
      uBreathOpacity: { value: initialPreset.breathOpacity },
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aMeta;
      uniform float uPixelRatio;
      varying float vAge;
      varying float vKind;
      varying float vRot;
      void main() {
        vAge = clamp(aMeta.x / max(0.001, aMeta.y), 0.0, 1.0);
        vKind = aMeta.w;
        vRot = aMeta.z * 17.3;
        if (aMeta.x >= aMeta.y) {
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          gl_PointSize = 0.0;
          return;
        }
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float growth = aMeta.z * mix(0.65, 2.65, pow(vAge, 0.72));
        gl_PointSize = clamp((growth * 200.0 * uPixelRatio) / max(0.4, -mv.z), 4.0, 150.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uDustColor;
      uniform vec3 uSunColor;
      uniform float uBreathOpacity;
      varying float vAge;
      varying float vKind;
      varying float vRot;

      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float r = length(uv) * 2.0;
        if (r > 1.0) discard;

        float lobe = sin(atan(uv.y, uv.x) * 3.0 + vRot + vAge * 2.2) * 0.10;
        float soft = pow(clamp(1.0 - (r + lobe * r), 0.0, 1.0), 2.4);
        float envFade = sin(min(1.0, vAge * 4.5) * 1.5707) * pow(1.0 - vAge, 1.4);

        vec3 dustLit = mix(uDustColor * 0.48, uSunColor * 0.88, (1.0 - r * 0.65) * 0.65);
        vec3 breathLit = mix(vec3(0.78, 0.84, 0.92), uSunColor * 0.85 + vec3(0.25), 0.42);
        vec3 col = mix(dustLit, breathLit, vKind);
        float baseOp = mix(0.22, uBreathOpacity, vKind);

        gl_FragColor = vec4(col, soft * envFade * baseOp);
      }
    `,
  });
  const plumePoints = new THREE.Points(plumeGeo, plumeMat);
  plumePoints.frustumCulled = false;
  scene.add(plumePoints);

  // Circular soft-bokeh atmospheric motes
  const MOTE_COUNT = 140;
  const motePos = new Float32Array(MOTE_COUNT * 3);
  for (let i = 0; i < MOTE_COUNT; i++) {
    motePos[i * 3] = (Math.random() - 0.5) * 14;
    motePos[i * 3 + 1] = 0.12 + Math.random() * 3.4;
    motePos[i * 3 + 2] = (Math.random() - 0.5) * 16;
  }
  const moteGeo = new THREE.BufferGeometry();
  const moteAttr = new THREE.BufferAttribute(motePos, 3).setUsage(THREE.DynamicDrawUsage);
  moteGeo.setAttribute('position', moteAttr);
  const moteMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uColor: { value: new THREE.Color(initialPreset.sunColor) },
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
    },
    vertexShader: /* glsl */ `
      uniform float uPixelRatio;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp((12.0 * uPixelRatio) / max(0.5, -mv.z), 1.5, 7.5);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        if (r > 1.0) discard;
        float glow = pow(1.0 - r, 2.4) * 0.36;
        gl_FragColor = vec4(uColor, glow);
      }
    `,
  });
  const motePoints = new THREE.Points(moteGeo, moteMat);
  scene.add(motePoints);

  function spawnHoofImpact(pos, intensity = 1.0, groundSpeedZ = 5.5) {
    rippleArray[rippleCursor].set(pos.x, pos.z, 0.001, intensity);
    rippleCursor = (rippleCursor + 1) % MAX_RIPPLES;

    hoofBounceLight.position.set(pos.x, 0.18, pos.z);
    hoofBounceLight.intensity = Math.min(2.0, hoofBounceLight.intensity + 1.15 * intensity);

    const sparkBurst = Math.round(14 * intensity);
    for (let i = 0; i < sparkBurst; i++) {
      const idx = sparkCursor;
      sparkCursor = (sparkCursor + 1) % SPARK_MAX;
      const i3 = idx * 3;
      const angle = Math.random() * Math.PI * 2;
      const spread = 0.32 + Math.random() * 1.35;

      sparkPos[i3] = pos.x + (Math.random() - 0.5) * 0.05;
      sparkPos[i3 + 1] = 0.02 + Math.random() * 0.03;
      sparkPos[i3 + 2] = pos.z + (Math.random() - 0.5) * 0.05;

      sparkVel[i3] = Math.cos(angle) * spread;
      sparkVel[i3 + 1] = 1.05 + Math.random() * 2.45 * intensity;
      sparkVel[i3 + 2] = -groundSpeedZ * (0.45 + Math.random() * 0.42) + Math.sin(angle) * spread * 0.55;

      sparkLife[idx * 2] = 0;
      sparkLife[idx * 2 + 1] = 0.28 + Math.random() * 0.48;
    }

    const dustBurst = Math.round(8 * intensity);
    for (let i = 0; i < dustBurst; i++) {
      const idx = plumeCursor;
      plumeCursor = (plumeCursor + 1) % PLUME_MAX;
      const i3 = idx * 3;
      const i4 = idx * 4;
      plumePos[i3] = pos.x + (Math.random() - 0.5) * 0.10;
      plumePos[i3 + 1] = 0.04 + Math.random() * 0.06;
      plumePos[i3 + 2] = pos.z - Math.random() * 0.08;

      plumeVel[i3] = (Math.random() - 0.5) * 0.78;
      plumeVel[i3 + 1] = 0.34 + Math.random() * 0.65;
      plumeVel[i3 + 2] = -groundSpeedZ * (0.60 + Math.random() * 0.30);

      plumeMeta[i4] = 0;
      plumeMeta[i4 + 1] = 0.65 + Math.random() * 0.70;
      plumeMeta[i4 + 2] = 0.22 + Math.random() * 0.22;
      plumeMeta[i4 + 3] = 0;
    }
  }

  function spawnNostrilBreath(pos, sideSign, groundSpeedZ) {
    for (let i = 0; i < 2; i++) {
      const idx = plumeCursor;
      plumeCursor = (plumeCursor + 1) % PLUME_MAX;
      const i3 = idx * 3;
      const i4 = idx * 4;

      plumePos[i3] = pos.x + sideSign * 0.015;
      plumePos[i3 + 1] = pos.y - 0.01;
      plumePos[i3 + 2] = pos.z + 0.025;

      plumeVel[i3] = sideSign * (0.32 + Math.random() * 0.32);
      plumeVel[i3 + 1] = -0.20 + Math.random() * 0.22;
      plumeVel[i3 + 2] = 1.10 - groundSpeedZ * 0.52;

      plumeMeta[i4] = 0;
      plumeMeta[i4 + 1] = 0.40 + Math.random() * 0.32;
      plumeMeta[i4 + 2] = 0.10 + Math.random() * 0.07;
      plumeMeta[i4 + 3] = 1;
    }
  }

  let activePresetKey = 'ember';

  function applyLightingPreset(key, preset, horseMaterial, hairMaterial, bloomPass) {
    activePresetKey = key;
    skyUniforms.uSunDir.value.copy(preset.sunDir);
    skyUniforms.uSunColor.value.set(preset.sunColor);
    skyUniforms.uHorizonColor.value.set(preset.horizonColor);
    skyUniforms.uZenithColor.value.set(preset.zenithColor);
    skyUniforms.uFogColor.value.set(preset.fogColor);

    scene.fog.color.set(preset.fogColor);

    sunLight.color.set(preset.sunColor);
    sunLight.intensity = preset.sunIntensity;
    sunLight.position.copy(preset.sunDir).multiplyScalar(20);

    rimLight.color.set(preset.rimColor);
    rimLight.intensity = preset.rimIntensity;

    fillLight.color.set(preset.fillColor);
    fillLight.intensity = preset.fillIntensity * 1.25;
    groundBounceLight.color.set(preset.sunColor);
    hemiLight.color.set(preset.fillColor);

    hoofBounceLight.color.set(preset.sparkColorB);

    groundUniforms.uGroundBase.value.set(preset.groundBase);
    groundUniforms.uGroundWarm.value.set(preset.groundWarm);
    groundUniforms.uSunColor.value.set(preset.sunColor);

    sparkMat.uniforms.uColorHot.value.set(preset.sparkColorA);
    sparkMat.uniforms.uColorCool.value.set(preset.sparkColorB);

    plumeMat.uniforms.uDustColor.value.set(preset.dustColor);
    plumeMat.uniforms.uSunColor.value.set(preset.sunColor);
    plumeMat.uniforms.uBreathOpacity.value = preset.breathOpacity;
    moteMat.uniforms.uColor.value.set(preset.sunColor);

    if (horseMaterial?.userData?.uniforms) {
      horseMaterial.userData.uniforms.uSunDirWorld.value.copy(preset.sunDir);
      horseMaterial.userData.uniforms.uSunColor.value.set(preset.sunColor);
    }
    if (hairMaterial?.uniforms) {
      hairMaterial.uniforms.uSunDir.value.copy(preset.sunDir);
      hairMaterial.uniforms.uSunColor.value.set(preset.sunColor);
      hairMaterial.uniforms.uSkyColor.value.set(preset.fillColor);
    }
    if (bloomPass) {
      bloomPass.strength = preset.bloomStrength;
    }

    rebuildIBL();
  }

  function update(dt, elapsed, groundSpeedZ) {
    const clampedDt = Math.min(0.05, dt);
    skyUniforms.uTime.value = elapsed;
    groundUniforms.uTime.value = elapsed;
    groundUniforms.uScrollZ.value += groundSpeedZ * clampedDt;

    if (activePresetKey === 'forge') {
      const flash = Math.pow(Math.max(0, Math.sin(elapsed * 1.9) * Math.sin(elapsed * 7.3)), 18.0);
      skyUniforms.uLightning.value = flash * 0.7;
    } else {
      skyUniforms.uLightning.value = 0;
    }

    hoofBounceLight.intensity *= Math.exp(-9.0 * clampedDt);

    for (let i = 0; i < MAX_RIPPLES; i++) {
      const r = rippleArray[i];
      if (r.z < 4.0) {
        r.y -= groundSpeedZ * clampedDt;
        r.z += clampedDt;
      }
    }

    for (let i = 0; i < monoliths.length; i++) {
      const m = monoliths[i];
      m.position.z -= groundSpeedZ * 0.32 * clampedDt;
      if (m.position.z < -46) m.position.z += 92;
    }

    for (let i = 0; i < SPARK_MAX; i++) {
      const age = sparkLife[i * 2];
      const maxL = sparkLife[i * 2 + 1];
      if (age < maxL) {
        const i3 = i * 3;
        sparkLife[i * 2] = age + clampedDt;
        sparkVel[i3 + 1] -= 7.8 * clampedDt;
        sparkVel[i3] *= 1 - 1.2 * clampedDt;
        sparkPos[i3] += sparkVel[i3] * clampedDt;
        sparkPos[i3 + 1] += sparkVel[i3 + 1] * clampedDt;
        sparkPos[i3 + 2] += sparkVel[i3 + 2] * clampedDt;
        if (sparkPos[i3 + 1] < 0.01 && sparkVel[i3 + 1] < 0) {
          sparkPos[i3 + 1] = 0.01;
          sparkVel[i3 + 1] *= -0.38;
        }
      }
    }
    sparkPosAttr.needsUpdate = true;
    sparkLifeAttr.needsUpdate = true;

    for (let i = 0; i < PLUME_MAX; i++) {
      const i4 = i * 4;
      const age = plumeMeta[i4];
      const maxL = plumeMeta[i4 + 1];
      if (age < maxL) {
        const i3 = i * 3;
        plumeMeta[i4] = age + clampedDt;
        const drag = Math.exp(-2.6 * clampedDt);
        plumeVel[i3] *= drag;
        plumeVel[i3 + 1] = plumeVel[i3 + 1] * drag + 0.30 * clampedDt;
        plumeVel[i3 + 2] = plumeVel[i3 + 2] * drag - groundSpeedZ * 0.25 * clampedDt;

        plumePos[i3] += plumeVel[i3] * clampedDt;
        plumePos[i3 + 1] += plumeVel[i3 + 1] * clampedDt;
        plumePos[i3 + 2] += plumeVel[i3 + 2] * clampedDt;
      }
    }
    plumePosAttr.needsUpdate = true;
    plumeMetaAttr.needsUpdate = true;

    for (let i = 0; i < MOTE_COUNT; i++) {
      const i3 = i * 3;
      motePos[i3 + 1] += Math.sin(elapsed * 0.9 + i) * 0.08 * clampedDt;
      motePos[i3 + 2] -= groundSpeedZ * 0.28 * clampedDt;
      if (motePos[i3 + 2] < -8) motePos[i3 + 2] += 16;
    }
    moteAttr.needsUpdate = true;
  }

  return {
    sunDir: skyUniforms.uSunDir.value,
    spawnHoofImpact,
    spawnNostrilBreath,
    applyLightingPreset,
    update,
  };
}
