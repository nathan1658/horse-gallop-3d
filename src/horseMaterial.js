import * as THREE from 'three';

export const COAT_PRESETS = {
  bay: {
    name: 'Blood Bay',
    undercoat: '#3d1408',    // Deep umber-mahogany hair base & muscle sulci
    primary: '#782c12',      // Rich sunlit thoroughbred bay coat
    guardTip: '#b55324',     // Warm golden-chestnut guard-hair tips
    belly: '#8c3c19',        // Warm mealy-bay underline
    darkPoint: '#16100e',    // Charcoal-black stockings, ear rims & muzzle
    mane: '#0f0b0a',         // Raven horsehair mane & tail
    sheen: '#eba368',        // Marschner TRT internal keratin-melanin glow
    dapple: 0.28,
    socks: 1.0,
    star: 1.0,
    roughness: 0.68,         // Matte-velvet mammal pelt (ZERO plastic clearcoat!)
  },
  obsidian: {
    name: 'Obsidian Friesian',
    undercoat: '#09080b',
    primary: '#16151a',
    guardTip: '#2b2933',
    belly: '#19181f',
    darkPoint: '#0a090c',
    mane: '#0a090c',
    sheen: '#cbbba6',
    dapple: 0.10,
    socks: 0.0,
    star: 0.0,
    roughness: 0.62,
  },
  dappleGrey: {
    name: 'Andalusian Grey',
    undercoat: '#595856',
    primary: '#8f8d89',
    guardTip: '#d4cfc6',
    belly: '#a6a29c',
    darkPoint: '#2e2d30',
    mane: '#dfd9ce',
    sheen: '#f7efe2',
    dapple: 0.78,
    socks: 0.35,
    star: 0.0,
    roughness: 0.70,
  },
  palomino: {
    name: 'Golden Palomino',
    undercoat: '#784614',
    primary: '#b37229',
    guardTip: '#e3ae62',
    belly: '#c4863b',
    darkPoint: '#452c17',
    mane: '#f4e6c8',
    sheen: '#fce9be',
    dapple: 0.36,
    socks: 1.0,
    star: 1.0,
    roughness: 0.65,
  },
};

export function createHorseMaterial(initialPreset = COAT_PRESETS.bay) {
  const uniforms = {
    uCoatUnder: { value: new THREE.Color(initialPreset.undercoat) },
    uCoatPrimary: { value: new THREE.Color(initialPreset.primary) },
    uCoatGuardTip: { value: new THREE.Color(initialPreset.guardTip) },
    uCoatBelly: { value: new THREE.Color(initialPreset.belly) },
    uCoatDarkPoint: { value: new THREE.Color(initialPreset.darkPoint) },
    uCoatMane: { value: new THREE.Color(initialPreset.mane) },
    uCoatSheenColor: { value: new THREE.Color(initialPreset.sheen) },
    uDappleAmount: { value: initialPreset.dapple },
    uSockAmount: { value: initialPreset.socks },
    uStarAmount: { value: initialPreset.star },
    uSunDirWorld: { value: new THREE.Vector3(-0.45, 0.23, -0.862).normalize() },
    uSunColor: { value: new THREE.Color('#ffa458') },
  };

  // CRITICAL ANTI-PLASTIC PBR SETUP:
  //   clearcoat = 0.0 (no shrink-wrap plastic glaze over fur!)
  //   specularIntensity = 0.24 (suppresses isotropic dielectric billiard-ball hot-spots; sheen comes from anisotropic hair fibers!)
  //   roughness = 0.68 (natural fibrous mammal pelt base)
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: initialPreset.roughness,
    metalness: 0.0,
    specularIntensity: 0.24,
    sheen: 0.92,
    sheenRoughness: 0.48,
    sheenColor: new THREE.Color(initialPreset.sheen),
    clearcoat: 0.0,
    envMapIntensity: 0.72,
  });

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec3 aRestPos;
        attribute vec4 aAnatomy;
        attribute float aCavity;
        varying vec3 vRestPos;
        varying vec4 vAnatomy;
        varying float vCavity;
        varying vec3 vFurTangentView;
        varying mat3 vObjToView;
        varying float vMuscleFlex;`
      )
      .replace(
        '#include <morphtarget_vertex>',
        `#include <morphtarget_vertex>
        vMuscleFlex = clamp(length(transformed - position) * 2.4, 0.0, 1.0);`
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vRestPos = aRestPos;
        vAnatomy = aAnatomy;
        vCavity = aCavity;
        vObjToView = normalMatrix;
        // Anatomical equine hair-stream flow vector:
        //   - Head: radiates down nasal bridge
        //   - Neck & Barrel: sweeps caudo-ventrally (-Z, -Y) with natural flank whorl curve
        //   - Limbs: streams distally (-Y)
        vec3 flowDir = aRestPos.y < 72.0
          ? normalize(vec3(0.0, -0.95, -0.31))
          : (aRestPos.z > 103.0
              ? normalize(vec3(0.0, -0.78, 0.62))
              : normalize(vec3(0.0, -0.28 + 0.14 * sin(aRestPos.z * 0.045), -0.95)));
        vec3 tangentObj = normalize(flowDir - objectNormal * dot(objectNormal, flowDir));
        vFurTangentView = normalize(normalMatrix * tangentObj);`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uCoatUnder;
        uniform vec3 uCoatPrimary;
        uniform vec3 uCoatGuardTip;
        uniform vec3 uCoatBelly;
        uniform vec3 uCoatDarkPoint;
        uniform vec3 uCoatMane;
        uniform vec3 uCoatSheenColor;
        uniform float uDappleAmount;
        uniform float uSockAmount;
        uniform float uStarAmount;
        uniform vec3 uSunDirWorld;
        uniform vec3 uSunColor;

        varying vec3 vRestPos;
        varying vec4 vAnatomy;
        varying float vCavity;
        varying vec3 vFurTangentView;
        varying mat3 vObjToView;
        varying float vMuscleFlex;

        float hash31(vec3 p) {
          p = fract(p * 0.1031);
          p += dot(p, p.zyx + 31.32);
          return fract((p.x + p.y) * p.z);
        }

        float noise3(vec3 p) {
          vec3 i = floor(p);
          vec3 f = fract(p);
          vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
          float n000 = hash31(i + vec3(0,0,0));
          float n100 = hash31(i + vec3(1,0,0));
          float n010 = hash31(i + vec3(0,1,0));
          float n110 = hash31(i + vec3(1,1,0));
          float n001 = hash31(i + vec3(0,0,1));
          float n101 = hash31(i + vec3(1,0,1));
          float n011 = hash31(i + vec3(0,1,1));
          float n111 = hash31(i + vec3(1,1,1));
          vec4 nx = mix(vec4(n000, n010, n001, n011), vec4(n100, n110, n101, n111), u.x);
          vec2 ny = mix(nx.xz, nx.yw, u.y);
          return mix(ny.x, ny.y, u.z);
        }

        float fbm3(vec3 p) {
          float v = 0.0, a = 0.5;
          for (int i = 0; i < 3; i++) {
            v += a * noise3(p);
            p = p * 2.05 + vec3(13.1, 7.7, 5.3);
            a *= 0.5;
          }
          return v;
        }

        float worley3(vec3 p) {
          vec3 id = floor(p);
          vec3 f = fract(p);
          float minDist = 1.0;
          for (int z = -1; z <= 1; z++) {
            for (int y = -1; y <= 1; y++) {
              for (int x = -1; x <= 1; x++) {
                vec3 nb = vec3(float(x), float(y), float(z));
                vec3 seedPt = vec3(
                  hash31(id + nb),
                  hash31(id + nb + vec3(17.3, 3.1, 9.7)),
                  hash31(id + nb + vec3(5.9, 29.1, 13.3))
                );
                vec3 diff = nb + seedPt * 0.82 - f;
                minDist = min(minDist, dot(diff, diff));
              }
            }
          }
          return sqrt(minDist);
        }

        // Anisotropic directional hair-fiber coordinates stretched 9x along anatomical hair growth direction
        vec3 getHairDomain(vec3 rp) {
          if (rp.y < 72.0) {
            // Limbs: vertical distal hair stream
            return vec3(rp.x * 3.8, rp.y * 0.42, rp.z * 3.8);
          } else if (rp.z > 103.0) {
            // Head & face: downward-anterior facial hair stream
            return vec3(rp.x * 3.8, rp.y * 0.75 + rp.z * 0.55, (rp.z - rp.y * 0.65) * 3.2);
          }
          // Neck, shoulder, barrel & haunches: posterior-ventral coat stream with slight flank swirl
          float swirl = sin(rp.z * 0.05) * 2.2;
          return vec3(rp.x * 3.2, (rp.y + rp.z * 0.28 + swirl) * 2.85, (rp.z - rp.y * 0.25) * 0.34);
        }

        // Arborizing subcutaneous veins (facial angularis oculi, jugular tributaries, superficial thoracic & saphenous)
        float evaluateVeinNetwork(vec3 rp) {
          float barrelMask = smoothstep(-40.0, -14.0, rp.z) * (1.0 - smoothstep(34.0, 50.0, rp.z))
                           * smoothstep(83.0, 93.0, rp.y) * (1.0 - smoothstep(118.0, 130.0, rp.y))
                           * smoothstep(15.0, 21.0, abs(rp.x));
          float cheekMask = smoothstep(106.5, 110.5, rp.z) * (1.0 - smoothstep(118.5, 122.0, rp.z))
                          * smoothstep(136.0, 140.5, rp.y) * (1.0 - smoothstep(149.0, 153.0, rp.y))
                          * smoothstep(4.5, 7.5, abs(rp.x));
          float neckMask = smoothstep(54.0, 66.0, rp.z) * (1.0 - smoothstep(88.0, 98.0, rp.z))
                         * smoothstep(114.0, 124.0, rp.y) * (1.0 - smoothstep(140.0, 150.0, rp.y))
                         * smoothstep(7.0, 12.5, abs(rp.x));
          float mask = max(barrelMask, max(cheekMask * 1.15, neckMask * 0.75));
          if (mask < 0.005) return 0.0;

          float w1 = fbm3(rp * 0.11);
          float w2 = noise3(rp * 0.22 + vec3(4.1));
          float p1 = rp.z * 0.13 - rp.y * 0.065 + w1 * 2.4;
          float p2 = rp.z * 0.22 + rp.y * 0.11 + w2 * 1.9;

          float v1 = pow(max(0.0, 1.0 - abs(fract(p1) - 0.5) * 18.0), 3.0);
          float v2 = pow(max(0.0, 1.0 - abs(fract(p2) - 0.5) * 22.0), 3.0) * 0.45;
          return (v1 + v2) * mask;
        }

        // Two-band intrinsic skin & coat relief (Meso: hair clumps, skin folds, veins; Fine: individual guard hairs & muzzle pores)
        float sampleEquineSkin(vec3 rp, float flex, float mesoW, float fineW) {
          vec3 hd = getHairDomain(rp);
          float muzzleZone = smoothstep(115.0, 123.0, rp.z) * (1.0 - smoothstep(121.0, 138.0, rp.y));
          float hoofZone = 1.0 - smoothstep(9.0, 11.6, rp.y);

          float h = 0.0;

          if (mesoW > 0.005) {
            // Coarse overlapping hair-lock tufts
            float locks = (noise3(hd * 0.62) * 0.65 + noise3(hd * 1.28 + vec3(5.2)) * 0.35) * (1.0 - muzzleZone) * (1.0 - hoofZone);
            // Natural skin-compression wrinkles at throatlatch (z~96), behind elbow (z~25,y~90), and stifle
            float throatFold = smoothstep(90.0, 97.0, rp.z) * (1.0 - smoothstep(101.0, 106.0, rp.z)) * smoothstep(132.0, 144.0, rp.y) * (1.0 - smoothstep(150.0, 158.0, rp.y));
            float elbowFold = smoothstep(20.0, 26.0, rp.z) * (1.0 - smoothstep(30.0, 36.0, rp.z)) * smoothstep(82.0, 90.0, rp.y) * (1.0 - smoothstep(96.0, 104.0, rp.y));
            float wrinkles = sin(rp.z * 2.8 + noise3(rp * 0.5) * 2.5) * (throatFold + elbowFold) * 0.35;

            // Subtle subcutaneous veins swelling with athletic exertion
            float veins = evaluateVeinNetwork(rp) * (0.55 + 0.45 * flex);

            // Hoof growth rings & vertical keratin tubules
            float hoofGroove = (sin(rp.y * 3.6) * 0.32 + sin(atan(rp.x, rp.z) * 58.0) * 0.28) * hoofZone;

            h += (locks * 0.42 + wrinkles * 0.65 + veins * 0.38 + hoofGroove * 0.45) * mesoW;
          }

          if (fineW > 0.005) {
            // Individual brushed guard-hair micro-strands
            float strands = (noise3(hd * 2.65) * 0.62 + noise3(hd * 5.2) * 0.38) * (1.0 - muzzleZone * 0.85) * (1.0 - hoofZone);
            // Leathery micro-pores on velvety muzzle & nostril skin
            float pores = (1.0 - smoothstep(0.0, 0.55, worley3(rp * 3.2))) * muzzleZone;
            h += (strands * 0.34 - pores * 0.22) * fineW;
          }

          return h;
        }`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec3 rp = vRestPos;
          float darkPointW = clamp(vAnatomy.x, 0.0, 1.0);
          float maneW = clamp(vAnatomy.y, 0.0, 1.0);
          float eyeW = smoothstep(0.28, 0.50, vAnatomy.z) * step(135.0, rp.y);

          // 1. Multi-layer fibrous coat pigmentation (undercoat in hair valleys + primary coat + sunlit guard-hair tips!)
          vec3 hd = getHairDomain(rp);
          float clumpTex = fbm3(hd * 0.58);
          float fineHairTex = noise3(hd * 2.4) * 0.65 + noise3(hd * 4.8) * 0.35;

          // Round Worley dapple medallions across barrel, shoulder & haunches
          float dappleZone = smoothstep(68.0, 104.0, rp.y) * (1.0 - smoothstep(55.0, 96.0, rp.z));
          float wDist = worley3(rp * 0.24 + vec3(fbm3(rp * 0.12) * 1.1));
          float dappleMedallion = (1.0 - smoothstep(0.18, 0.58, wDist)) * smoothstep(0.26, 0.62, fbm3(rp * 0.07));

          float cav = clamp(vCavity, 0.76, 1.06);
          float flankSunWarmth = smoothstep(75.0, 128.0, rp.y) * (1.0 - smoothstep(145.0, 176.0, rp.y));

          // Blend deep undercoat in individual hair-bundle bases -> rich mid-coat -> golden-russet guard tips (NEVER black paint in muscle grooves!)
          vec3 coatCol = mix(uCoatUnder, uCoatPrimary, smoothstep(0.14, 0.58, clumpTex * 0.65 + 0.28));
          float tipFactor = clamp(flankSunWarmth * 0.42 + dappleMedallion * dappleZone * uDappleAmount + (fineHairTex - 0.42) * 0.48, 0.0, 1.0);
          coatCol = mix(coatCol, uCoatGuardTip, tipFactor);

          // Subtle vascular shadow tint directly over superficial veins
          float veinTrace = evaluateVeinNetwork(rp);
          coatCol *= 1.0 - veinTrace * 0.05;

          // Warm mealy underline along lower barrel, axilla & gaskin
          float bellyMask = (1.0 - smoothstep(80.0, 98.0, rp.y)) * smoothstep(65.0, 82.0, rp.y);
          coatCol = mix(coatCol, uCoatBelly, bellyMask * 0.52);

          // 2. Dark Points: lower leg stockings, ear tips & velvety bare muzzle leather
          float legStocking = smoothstep(56.0, 20.0, rp.y) * 0.92;
          float earTipDark = smoothstep(173.0, 180.5, rp.y) * step(102.0, rp.z) * 0.85;
          float muzzleVelvet = smoothstep(111.5, 124.5, rp.z) * (1.0 - smoothstep(121.0, 144.0, rp.y));
          float pointFactor = clamp(max(darkPointW * 0.86, max(legStocking, max(earTipDark, muzzleVelvet * 0.90))), 0.0, 1.0);
          vec3 pointAlbedo = uCoatDarkPoint * (0.86 + 0.28 * fineHairTex);
          // Bare slate-charcoal nose leather around nostrils & lips
          vec3 noseLeather = vec3(0.055, 0.046, 0.045) * (0.88 + 0.22 * noise3(rp * 2.8));
          coatCol = mix(coatCol, pointAlbedo, pointFactor);
          coatCol = mix(coatCol, noseLeather, muzzleVelvet * 0.72);

          // Soft buff inner-ear hair inside sculpted concha
          float innerEarMask = smoothstep(170.5, 176.0, rp.y) * step(108.0, rp.z) * (1.0 - smoothstep(0.75, 0.96, cav));
          coatCol = mix(coatCol, mix(uCoatGuardTip, vec3(0.78, 0.68, 0.58), 0.45), innerEarMask * 0.58);

          // 3. Feathered White Hind Socks, Left-Fore Pastern & Forehead Star
          float sockEdgeNoise = (clumpTex - 0.5) * 4.2 + (fineHairTex - 0.5) * 1.8;
          float isHindLeg = step(-20.0, -rp.z);
          float isLeftFore = step(15.0, rp.z) * step(0.0, rp.x);
          float hindSock = isHindLeg * smoothstep(26.5 + sockEdgeNoise, 22.0 + sockEdgeNoise, rp.y) * step(10.8, rp.y);
          float forePastern = isLeftFore * smoothstep(18.5 + sockEdgeNoise, 14.8 + sockEdgeNoise, rp.y) * step(10.8, rp.y);
          float whiteSockMask = clamp(max(hindSock, forePastern), 0.0, 1.0) * uSockAmount;
          vec3 whiteFur = vec3(0.84, 0.81, 0.76) * (0.84 + 0.28 * fineHairTex);
          // Subtle rosy skin showing faintly through white pastern fur near coronet
          whiteFur = mix(whiteFur, vec3(0.76, 0.62, 0.58), smoothstep(14.5, 11.0, rp.y) * 0.35);
          coatCol = mix(coatCol, whiteFur, whiteSockMask);

          float headCenterX = 0.21 * max(0.0, rp.z - 102.0);
          float starDist = length(vec2((rp.x - headCenterX) * 1.15, (rp.y - 157.5) * 0.82)) + (clumpTex - 0.5) * 2.2;
          float foreheadStar = (1.0 - smoothstep(1.7, 3.5, starDist)) * smoothstep(112.0, 115.5, rp.z) * uStarAmount;
          coatCol = mix(coatCol, whiteFur, foreheadStar * 0.92);

          // 4. Deep Crimson-Warm Nostril Cavity Mucosa
          float dNostril = min(
            length(vec3(rp.x - 5.9, rp.y - 128.2, rp.z - 125.0)),
            length(vec3(rp.x + 1.5, rp.y - 128.0, rp.z - 124.1))
          );
          float nostrilPit = 1.0 - smoothstep(0.95, 2.35, dNostril);
          coatCol = mix(coatCol, vec3(0.12, 0.024, 0.020), nostrilPit * 0.94);

          // 5. Sculpted Mane & Full-Length Tail Core
          float tailSpineOnly = smoothstep(-86.0, -95.0, rp.z) * (1.0 - smoothstep(4.8, 7.6, abs(rp.x))) * smoothstep(100.0, 112.0, rp.y);
          float fullManeTail = clamp(max(maneW, tailSpineOnly), 0.0, 1.0);
          coatCol = mix(coatCol, uCoatMane, fullManeTail * 0.98);

          // 6. Striated Keratin Hoof Capsule (striped pale horn below white socks, dark slate horn below dark legs)
          float hoofMask = 1.0 - smoothstep(9.2, 11.4, rp.y);
          float hornStripe = 0.80 + 0.36 * noise3(vec3(atan(rp.x, rp.z) * 10.5, rp.y * 0.22, 1.0));
          float aboveHasSock = clamp(max(isHindLeg, isLeftFore), 0.0, 1.0) * uSockAmount;
          vec3 darkHorn = vec3(0.052, 0.046, 0.042) * hornStripe;
          vec3 paleHorn = vec3(0.38, 0.32, 0.25) * hornStripe;
          vec3 hoofCol = mix(darkHorn, paleHorn, aboveHasSock * 0.86);
          hoofCol = mix(vec3(0.09, 0.068, 0.052), hoofCol, smoothstep(1.5, 5.2, rp.y));
          coatCol = mix(coatCol, hoofCol, hoofMask);

          // 7. Deep Mahogany Equine Eye + Horizontal Rectangular Pupil + Crisp Sky Catchlight
          if (eyeW > 0.01) {
            vec3 eyeCenter = rp.x > 0.0 ? vec3(10.5, 155.6, 111.1) : vec3(-8.8, 155.0, 112.9);
            vec3 ed = rp - eyeCenter;
            float pupilDist = max(abs(ed.y) * 1.95, abs(ed.z) * 0.68);
            float pupilMask = 1.0 - smoothstep(0.48, 0.85, pupilDist);
            float irisRadial = sin(atan(ed.y, ed.z) * 26.0) * 0.5 + 0.5;
            vec3 irisRich = mix(vec3(0.025, 0.010, 0.004), vec3(0.088, 0.036, 0.011), irisRadial * 0.65 + 0.35);
            irisRich *= smoothstep(0.28, 0.58, vAnatomy.z);
            vec3 finalEye = mix(irisRich, vec3(0.003, 0.003, 0.003), pupilMask);
            float catchDist = length(vec2(ed.y - 0.55, ed.z - 0.45));
            finalEye += vec3(0.92, 0.94, 1.0) * (1.0 - smoothstep(0.16, 0.40, catchDist)) * 0.85;
            coatCol = mix(coatCol, finalEye, eyeW);
          }

          diffuseColor.rgb = coatCol;
        }`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        {
          vec3 rp = vRestPos;
          float eyeW = smoothstep(0.28, 0.50, vAnatomy.z) * step(135.0, rp.y);
          float eyelidRim = smoothstep(0.12, 0.28, vAnatomy.z) * (1.0 - eyeW) * step(135.0, rp.y);
          float hoofW = 1.0 - smoothstep(9.2, 11.4, rp.y);
          float muzzleNose = smoothstep(120.0, 126.5, rp.z) * (1.0 - smoothstep(121.0, 135.0, rp.y));

          // Per-hair roughness micro-variation breaks up any residual uniform specular!
          vec3 hd = getHairDomain(rp);
          float fiberRough = (noise3(hd * 2.4) - 0.5) * 0.18;

          // Keep fur matte-fibrous (>= 0.56) everywhere so skin NEVER looks like molded plastic!
          roughnessFactor = clamp(roughnessFactor + fiberRough - vMuscleFlex * 0.08, 0.56, 0.88);
          roughnessFactor = mix(roughnessFactor, 0.44, muzzleNose * 0.7);
          roughnessFactor = mix(roughnessFactor, 0.34, hoofW);
          roughnessFactor = mix(roughnessFactor, 0.22, eyelidRim);
          roughnessFactor = mix(roughnessFactor, 0.015, eyeW);
        }`
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          // True 2-band analytical 3D skin/fur/pore/vein gradient normals at realistic tactile amplitude (~16 deg)!
          float eyeW = smoothstep(0.22, 0.45, vAnatomy.z) * step(135.0, vRestPos.y);
          float pxSize = min(length(dFdx(vRestPos)), length(dFdy(vRestPos)));
          float mesoW = (1.0 - smoothstep(1.8, 5.2, pxSize)) * (1.0 - eyeW);
          float fineW = (1.0 - smoothstep(0.55, 2.2, pxSize)) * (1.0 - eyeW);

          if (mesoW > 0.01) {
            float eps = 0.22;
            float inv2Eps = 1.0 / (2.0 * eps);
            float hX = (sampleEquineSkin(vRestPos + vec3(eps, 0.0, 0.0), vMuscleFlex, mesoW, fineW)
                      - sampleEquineSkin(vRestPos - vec3(eps, 0.0, 0.0), vMuscleFlex, mesoW, fineW)) * inv2Eps;
            float hY = (sampleEquineSkin(vRestPos + vec3(0.0, eps, 0.0), vMuscleFlex, mesoW, fineW)
                      - sampleEquineSkin(vRestPos - vec3(0.0, eps, 0.0), vMuscleFlex, mesoW, fineW)) * inv2Eps;
            float hZ = (sampleEquineSkin(vRestPos + vec3(0.0, 0.0, eps), vMuscleFlex, mesoW, fineW)
                      - sampleEquineSkin(vRestPos - vec3(0.0, 0.0, eps), vMuscleFlex, mesoW, fineW)) * inv2Eps;

            vec3 gradView = vObjToView * vec3(hX, hY, hZ);
            vec3 tangentGrad = gradView - normal * dot(normal, gradView);
            normal = normalize(normal - tangentGrad * 0.34);
          }
        }`
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        {
          // Subtle physical indirect-only Cavity AO (0.80..1.04) so muscle grooves shade via true geometry normals, never black stripes!
          float cavAO = clamp((vCavity - 0.76) / 0.30, 0.0, 1.0);
          reflectedLight.indirectDiffuse *= mix(0.80, 1.04, cavAO);
          reflectedLight.indirectSpecular *= mix(0.72, 1.02, cavAO);

          // Fiber-modulated Marschner Dual-Lobe Mammal Fur Sheen (replaces round plastic GGX blobs with fibrous hair bands!)
          vec3 sunView = normalize((viewMatrix * vec4(uSunDirWorld, 0.0)).xyz);
          vec3 V = normalize(vViewPosition);
          vec3 H = normalize(sunView + V);
          vec3 T = normalize(vFurTangentView - normal * dot(normal, vFurTangentView));

          float eyeW = smoothstep(0.28, 0.50, vAnatomy.z) * step(135.0, vRestPos.y);
          float muzzleBare = smoothstep(118.0, 125.0, vRestPos.z) * (1.0 - smoothstep(121.0, 136.0, vRestPos.y));
          float furMask = (1.0 - eyeW) * (1.0 - muzzleBare * 0.75) * step(11.2, vRestPos.y);

          // Individual hair-strand glint modulation so sheen visibly breaks into brushed fibers!
          vec3 hd = getHairDomain(vRestPos);
          float strandGlint = 0.55 + 0.90 * noise3(hd * 2.8);

          float NdotL = clamp(dot(normal, sunView), 0.0, 1.0);
          vec3 T_R = normalize(T - normal * 0.08);
          vec3 T_TRT = normalize(T + normal * 0.14);
          float sinTH_R = sqrt(max(0.0, 1.0 - pow(clamp(dot(T_R, H), -1.0, 1.0), 2.0)));
          float sinTH_TRT = sqrt(max(0.0, 1.0 - pow(clamp(dot(T_TRT, H), -1.0, 1.0), 2.0)));

          // Broad fibrous Marschner sheen ribbons along muscle contours (never tiny plastic dots)
          float lobeR = pow(sinTH_R, 16.0) * 0.11 * strandGlint;
          float lobeTRT = pow(sinTH_TRT, 9.0) * (0.30 + 0.10 * vMuscleFlex) * strandGlint;

          reflectedLight.directSpecular += uSunColor * (vec3(lobeR) + uCoatSheenColor * lobeTRT) * NdotL * furMask * mix(0.65, 1.08, cavAO);

          // Fibrous sky-sheen across lateral muscle crowns (deltoid, triceps, jugular ridge, croup) so 3D form pops without plastic spots
          vec3 skyFillDir = normalize((viewMatrix * vec4(0.42, 0.84, 0.34, 0.0)).xyz);
          vec3 H_sky = normalize(skyFillDir + V);
          float sinTH_sky = sqrt(max(0.0, 1.0 - pow(clamp(dot(T_TRT, H_sky), -1.0, 1.0), 2.0)));
          float skyFiberSheen = pow(sinTH_sky, 8.0) * clamp(dot(normal, skyFillDir), 0.0, 1.0) * strandGlint * furMask;
          reflectedLight.directSpecular += mix(uCoatSheenColor, vec3(0.75, 0.82, 0.95), 0.35) * skyFiberSheen * 0.18 * mix(0.65, 1.12, cavAO);

          // Glossy wet corneal glint ONLY on the eyeball
          if (eyeW > 0.05) {
            float eyeSpec = pow(clamp(dot(normal, H), 0.0, 1.0), 240.0) * 1.8;
            reflectedLight.directSpecular += uSunColor * eyeSpec * eyeW;
          }

          // Charlie grazing microfiber velvet coat scatter + warm subsurface ear/nostril glow
          float NdotV = clamp(dot(normal, V), 0.0, 1.0);
          float grazingVelvet = pow(1.0 - NdotV, 3.0) * smoothstep(-0.25, 0.50, dot(normal, sunView)) * strandGlint;
          float thinTissue = smoothstep(166.0, 180.0, vRestPos.y) * smoothstep(100.0, 114.0, vRestPos.z)
                           + smoothstep(122.0, 127.0, vRestPos.z) * (1.0 - smoothstep(125.0, 134.0, vRestPos.y)) * 0.65;
          float backSun = pow(clamp(dot(-V, sunView), 0.0, 1.0), 2.4);

          vec3 bloodTint = mix(diffuseColor.rgb, vec3(0.65, 0.14, 0.06), 0.55);
          reflectedLight.directDiffuse += min(
            vec3(0.48),
            uSunColor * (diffuseColor.rgb * grazingVelvet * 0.46 * furMask + bloodTint * thinTissue * backSun * 0.85)
          );
        }`
      );
  };

  material.userData.uniforms = uniforms;
  material.customProgramCacheKey = () => 'equus-helios-physical-v4-antiplastic';

  return material;
}

export function applyCoatPreset(material, preset, hairMaterial) {
  const u = material.userData.uniforms;
  if (u) {
    u.uCoatUnder.value.set(preset.undercoat);
    u.uCoatPrimary.value.set(preset.primary);
    u.uCoatGuardTip.value.set(preset.guardTip);
    u.uCoatBelly.value.set(preset.belly);
    u.uCoatDarkPoint.value.set(preset.darkPoint);
    u.uCoatMane.value.set(preset.mane);
    u.uCoatSheenColor.value.set(preset.sheen);
    u.uDappleAmount.value = preset.dapple;
    u.uSockAmount.value = preset.socks;
    u.uStarAmount.value = preset.star;
  }
  material.roughness = preset.roughness;
  material.sheenColor.set(preset.sheen);

  if (hairMaterial && hairMaterial.uniforms) {
    hairMaterial.uniforms.uHairBaseColor.value.set(preset.mane);
    hairMaterial.uniforms.uHairTipColor.value.set(preset.sheen).lerp(new THREE.Color(preset.mane), 0.56);
  }
}
