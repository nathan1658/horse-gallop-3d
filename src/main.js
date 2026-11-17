import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { getHorseGLBBuffer } from './horseData.js';
import {
  buildSubdividedHorse,
  applyCatmullRomGallop,
  GALLOP_GROUND_SPEED,
} from './subdivide.js';
import {
  COAT_PRESETS,
  createHorseMaterial,
  applyCoatPreset,
} from './horseMaterial.js';
import { createEquineHairSystem } from './hairSystem.js';
import {
  LIGHTING_PRESETS,
  createEpicEnvironment,
} from './environment.js';
import { createGallopAudio } from './audio.js';

const CAMERA_PRESETS = {
  hero: {
    label: 'Hero Low-Angle',
    pos: new THREE.Vector3(2.45, 0.96, 2.28),
    target: new THREE.Vector3(0.0, 1.05, 0.14),
    fov: 37,
  },
  anatomy: {
    label: 'Close-Up Anatomy',
    pos: new THREE.Vector3(2.02, 1.38, 1.58),
    target: new THREE.Vector3(0.04, 1.35, 0.54),
    fov: 35,
  },
  profile: {
    label: 'Muybridge Profile',
    pos: new THREE.Vector3(3.65, 1.18, -0.06),
    target: new THREE.Vector3(0.0, 1.06, -0.05),
    fov: 34,
  },
  charge: {
    label: 'Front Charge',
    pos: new THREE.Vector3(1.18, 0.76, 3.45),
    target: new THREE.Vector3(0.0, 1.08, 0.18),
    fov: 35,
  },
  silhouette: {
    label: 'Backlit Crest',
    pos: new THREE.Vector3(2.25, 1.08, -2.28),
    target: new THREE.Vector3(-0.05, 1.12, 0.05),
    fov: 39,
  },
};

// Clean single-sample filmic vignette & blue-noise dither (zero multi-tap ghosting or stepped halo streaks)
const FilmicFinishShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    varying vec2 vUv;

    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      vec3 color = base.rgb;

      vec2 centered = vUv - 0.5;
      float vig = 1.0 - dot(centered * vec2(1.04, 1.16), centered * vec2(1.04, 1.16)) * 0.48;
      color *= clamp(vig, 0.45, 1.0);

      float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy + fract(uTime) * 19.0, vec2(0.06711056, 0.00583715))));
      color += (ign - 0.5) * 0.004;

      gl_FragColor = vec4(max(color, vec3(0.0)), base.a);
    }
  `,
};

async function init() {
  const canvas = document.getElementById('stage');
  const loaderOverlay = document.getElementById('loader');

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    CAMERA_PRESETS.hero.fov,
    window.innerWidth / window.innerHeight,
    0.08,
    180
  );
  camera.position.copy(CAMERA_PRESETS.hero.pos);

  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(CAMERA_PRESETS.hero.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.055;
  controls.enablePan = false;
  controls.minDistance = 1.45;
  controls.maxDistance = 8.5;
  controls.minPolarAngle = 0.22;
  controls.maxPolarAngle = Math.PI * 0.488;
  controls.update();

  const environment = createEpicEnvironment(scene, renderer, LIGHTING_PRESETS.ember);
  const audio = createGallopAudio();

  const renderTarget = new THREE.WebGLRenderTarget(
    window.innerWidth * renderer.getPixelRatio(),
    window.innerHeight * renderer.getPixelRatio(),
    { type: THREE.HalfFloatType, samples: 4 }
  );
  const composer = new EffectComposer(renderer, renderTarget);
  composer.addPass(new RenderPass(scene, camera));

  // High threshold (1.35) + gentle strength (0.18) ensures only solar core & incandescent sparks bloom—never horse rim or ground!
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    LIGHTING_PRESETS.ember.bloomStrength,
    0.42,
    1.35
  );
  composer.addPass(bloomPass);

  const gradePass = new ShaderPass(FilmicFinishShader);
  composer.addPass(gradePass);
  composer.addPass(new OutputPass());

  const gltfLoader = new GLTFLoader();
  const gltf = await new Promise((resolve, reject) => {
    gltfLoader.parse(getHorseGLBBuffer(), '', resolve, reject);
  });

  let rawMesh = null;
  gltf.scene.traverse((child) => {
    if (child.isMesh && !rawMesh) rawMesh = child;
  });

  const { geometry: horseGeo, tracker, subdivData } = buildSubdividedHorse(rawMesh.geometry, 3);
  const horseMaterial = createHorseMaterial(COAT_PRESETS.bay);

  const horseRootOffsetY = 0.022;
  const horseMesh = new THREE.Mesh(horseGeo, horseMaterial);
  horseMesh.position.y = horseRootOffsetY;
  horseMesh.castShadow = true;
  horseMesh.receiveShadow = true;
  horseMesh.morphTargetInfluences = new Array(15).fill(0);
  scene.add(horseMesh);

  const hairSystem = createEquineHairSystem(subdivData, COAT_PRESETS.bay);
  scene.add(hairSystem.mesh);

  environment.applyLightingPreset(
    'ember',
    LIGHTING_PRESETS.ember,
    horseMaterial,
    hairSystem.material,
    bloomPass
  );

  const state = {
    paused: prefersReducedMotion,
    cadence: 1.58,
    slowMoActive: false,
    savedCadence: 1.58,
    phase: 0.72,
    cameraMode: 'hero',
    userOrbiting: false,
    camTransition: 0,
    camGoalPos: CAMERA_PRESETS.hero.pos.clone(),
    camGoalTarget: CAMERA_PRESETS.hero.target.clone(),
    camGoalFov: CAMERA_PRESETS.hero.fov,
    shakeImpulse: 0,
  };

  controls.addEventListener('start', () => {
    state.userOrbiting = true;
    document.querySelectorAll('[data-camera]').forEach((b) => b.classList.remove('active'));
  });

  const hoofContactState = { FL: false, FR: false, HL: false, HR: false };
  const hoofDots = {
    HL: document.querySelector('[data-hoof="HL"]'),
    HR: document.querySelector('[data-hoof="HR"]'),
    FR: document.querySelector('[data-hoof="FR"]'),
    FL: document.querySelector('[data-hoof="FL"]'),
    AIR: document.querySelector('[data-hoof="AIR"]'),
  };
  const phaseReadout = document.getElementById('gait-phase-label');
  const speedReadout = document.getElementById('speed-readout');
  const cadenceSlider = document.getElementById('cadence-slider');
  const btnPlay = document.getElementById('btn-play');
  const btnSlowMo = document.getElementById('btn-slowmo');
  const btnSound = document.getElementById('btn-sound');

  const updatePlayUI = () => {
    btnPlay.textContent = state.paused ? 'Resume' : 'Pause';
    btnPlay.setAttribute('aria-pressed', String(!state.paused));
  };
  updatePlayUI();

  btnPlay.addEventListener('click', () => {
    state.paused = !state.paused;
    updatePlayUI();
  });

  btnSlowMo.addEventListener('click', () => {
    state.slowMoActive = !state.slowMoActive;
    if (state.slowMoActive) {
      state.savedCadence = state.cadence;
      state.cadence = 0.22;
    } else {
      state.cadence = state.savedCadence || 1.58;
    }
    cadenceSlider.value = String(state.cadence);
    speedReadout.textContent = `${state.cadence.toFixed(2)}×`;
    btnSlowMo.classList.toggle('active', state.slowMoActive);
    if (state.paused) {
      state.paused = false;
      updatePlayUI();
    }
  });

  cadenceSlider.addEventListener('input', (e) => {
    state.cadence = parseFloat(e.target.value);
    state.slowMoActive = state.cadence <= 0.35;
    btnSlowMo.classList.toggle('active', state.slowMoActive);
    speedReadout.textContent = `${state.cadence.toFixed(2)}×`;
  });

  btnSound.addEventListener('click', () => {
    const active = audio.setEnabled(!audio.isEnabled());
    btnSound.textContent = active ? 'Sound On' : 'Sound Off';
    btnSound.classList.toggle('active', active);
  });

  document.querySelectorAll('[data-lighting]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.lighting;
      const preset = LIGHTING_PRESETS[key];
      if (!preset) return;
      document.querySelectorAll('[data-lighting]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      environment.applyLightingPreset(
        key,
        preset,
        horseMaterial,
        hairSystem.material,
        bloomPass
      );
    });
  });

  document.querySelectorAll('[data-coat]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.coat;
      const preset = COAT_PRESETS[key];
      if (!preset) return;
      document.querySelectorAll('[data-coat]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      applyCoatPreset(horseMaterial, preset, hairSystem.material);
    });
  });

  document.querySelectorAll('[data-camera]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.camera;
      const preset = CAMERA_PRESETS[key];
      if (!preset) return;
      document.querySelectorAll('[data-camera]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.cameraMode = key;
      state.userOrbiting = false;
      state.camGoalPos.copy(preset.pos);
      state.camGoalTarget.copy(preset.target);
      state.camGoalFov = preset.fov;
      state.camTransition = 1.0;
    });
  });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT') {
      e.preventDefault();
      state.paused = !state.paused;
      updatePlayUI();
    } else if (e.key === 's' || e.key === 'S') {
      btnSlowMo.click();
    }
  });

  window.addEventListener('resize', () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
    bloomPass.setSize(w, h);
  });

  requestAnimationFrame(() => {
    loaderOverlay.classList.add('hidden');
  });

  const clock = new THREE.Clock();
  const tmpVec = new THREE.Vector3();
  let breathCooldown = 0;
  let elapsed = 0;

  function tick() {
    requestAnimationFrame(tick);

    const rawDt = Math.min(0.05, clock.getDelta());
    const effectiveSpeed = state.paused ? 0 : state.cadence;
    const simDt = state.paused ? 0 : rawDt;
    elapsed += rawDt;

    state.phase = (state.phase + effectiveSpeed * simDt) % 1.0;
    const influences = horseMesh.morphTargetInfluences;
    applyCatmullRomGallop(influences, state.phase);

    const groundSpeedZ = GALLOP_GROUND_SPEED * effectiveSpeed;

    let plantedCount = 0;
    for (let i = 0; i < tracker.hooves.length; i++) {
      const h = tracker.hooves[i];
      tracker.sampleWelded(h.wIdx, influences, tmpVec, horseRootOffsetY);
      const wasDown = hoofContactState[h.id];
      const isDown = tmpVec.y < 0.052;
      const isClear = tmpVec.y > 0.088;

      if (!wasDown && isDown) {
        hoofContactState[h.id] = true;
        if (!state.paused) {
          const impactPower = Math.min(1.35, 0.55 + 0.5 * effectiveSpeed);
          environment.spawnHoofImpact(tmpVec, impactPower, Math.max(2.2, groundSpeedZ));
          audio.triggerHoofStrike(impactPower, tmpVec.x);
          if (!prefersReducedMotion) {
            state.shakeImpulse = Math.min(0.015, state.shakeImpulse + 0.0055 * impactPower);
          }
        }
      } else if (wasDown && isClear) {
        hoofContactState[h.id] = false;
      }

      if (hoofContactState[h.id]) plantedCount++;
      if (hoofDots[h.id]) {
        hoofDots[h.id].classList.toggle('planted', hoofContactState[h.id]);
      }
    }

    const isAirborne = plantedCount === 0;
    if (hoofDots.AIR) hoofDots.AIR.classList.toggle('planted', isAirborne);
    if (phaseReadout) {
      phaseReadout.textContent = isAirborne
        ? 'Airborne Suspension'
        : `${plantedCount}-Point Drive Stance`;
    }

    breathCooldown -= simDt;
    if (!state.paused && breathCooldown <= 0 && state.phase > 0.34 && state.phase < 0.62) {
      for (let n = 0; n < tracker.nostrils.length; n++) {
        const nos = tracker.nostrils[n];
        tracker.sampleWelded(nos.wIdx, influences, tmpVec, horseRootOffsetY);
        environment.spawnNostrilBreath(tmpVec, nos.side, groundSpeedZ);
      }
      breathCooldown = 0.085 / Math.max(0.35, effectiveSpeed);
    }

    hairSystem.update(
      influences,
      elapsed,
      Math.max(0.18, effectiveSpeed),
      horseRootOffsetY
    );

    environment.update(rawDt, elapsed, groundSpeedZ);
    audio.updateWind(effectiveSpeed);

    if (!state.userOrbiting && state.camTransition > 0.001) {
      const lerpAlpha = 1 - Math.exp(-5.5 * rawDt);
      camera.position.lerp(state.camGoalPos, lerpAlpha);
      controls.target.lerp(state.camGoalTarget, lerpAlpha);
      camera.fov = THREE.MathUtils.lerp(camera.fov, state.camGoalFov, lerpAlpha);
      camera.updateProjectionMatrix();
      if (camera.position.distanceTo(state.camGoalPos) < 0.01) {
        state.camTransition = 0;
      }
    }

    controls.update();

    state.shakeImpulse *= Math.exp(-14.0 * rawDt);
    const shakeY = !prefersReducedMotion
      ? Math.sin(elapsed * 46.0) * state.shakeImpulse
      : 0;
    camera.position.y += shakeY;

    gradePass.uniforms.uTime.value = elapsed;
    composer.render();

    camera.position.y -= shakeY;
  }

  tick();
}

init().catch((err) => {
  console.error('Failed to initialize Equus // Helios:', err);
  const loader = document.getElementById('loader');
  if (loader) loader.textContent = `Initialization error: ${err.message}`;
});
