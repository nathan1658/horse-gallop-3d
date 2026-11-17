import * as THREE from 'three';

export const HORSE_SCALE = 0.01; // 155 units at withers -> 1.55m life-size thoroughbred
export const GALLOP_GROUND_SPEED = 3.82; // Exact stance-locked ground speed (m/s at 1.0 cycle/sec)

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function gauss(x, mu, sigma) {
  const d = (x - mu) / sigma;
  return Math.exp(-0.5 * d * d);
}

function gauss2(x, y, mx, my, sx, sy) {
  const dx = (x - mx) / sx;
  const dy = (y - my) / sy;
  return Math.exp(-0.5 * (dx * dx + dy * dy));
}

function gauss3(x, y, z, mx, my, mz, sx, sy, sz) {
  const dx = (x - mx) / sx;
  const dy = (y - my) / sy;
  const dz = (z - mz) / sz;
  return Math.exp(-0.5 * (dx * dx + dy * dy + dz * dz));
}

/**
 * High-definition 3D Equine Écorché / Myology Sculpting Function (1 model unit = 1 cm).
 * Carves realistic 8mm–18mm thoroughbred anatomical structures onto the 62,976-triangle mesh:
 *   - Masseter cheek jowl, zygomatic facial crest, supraorbital arch, temporal fossa, eyelids, flared nostrils, ear concha
 *   - Deep jugular groove (sulcus jugularis), brachiocephalicus, sternocephalicus & splenius crest
 *   - Median pectoral cleavage, twin pectoralis descendens, scapular spine, deltoid, lateral & long heads of triceps brachii
 *   - Serratus ventralis digitations, 11 curved costal rib arches, external oblique line, paralumbar flank hollow & tuber coxae
 *   - Sacral croup groove, tensor fasciae latae, gluteus medius, deep biceps femoris / semitendinosus poverty-line groove, stifle & gaskin
 *   - Cannon bone vs digital flexor tendon grooves, fetlock sesamoid contour & hoof coronet band
 */
function evaluateEquineMyology(rx, ry, rz, nx, ny, nz, eyeW) {
  let disp = 0.0;
  const ax = Math.abs(rx);
  const lat = Math.pow(Math.abs(nx), 0.65);

  const headCenterX = rz > 102 ? 0.21 * (rz - 102.0) : 0.0;
  const hrx = rx - headCenterX;
  const ahx = Math.abs(hrx);

  // --- 1. CRANIAL, FACIAL & MASSETER JOWL SCULPT ---
  if (ry > 116 && rz > 100) {
    // Round powerful Masseter cheek jowl (z: 102..111, y: 136..147)
    const jowl = gauss2(rz, ry, 106.2, 141.5, 3.8, 4.8) * smoothstep(5.0, 8.2, ahx);
    disp += jowl * 0.72 * lat;
      // Sub-jowl mandibular rim shadow groove
      disp -= gauss2(rz, ry, 109.5, 135.5, 3.8, 2.4) * smoothstep(4.5, 7.8, ahx) * 0.22 * lat;

    // Eyeball dome + crisp upper & lower palpebral eyelid folds + supraorbital arch + temporal fossa hollow
    if (ry > 142 && rz > 104) {
      if (eyeW > 0.30) {
        disp += smoothstep(0.30, 0.78, eyeW) * 0.42;
      } else if (eyeW > 0.05) {
        const lidCrease = Math.sin(((eyeW - 0.05) / 0.25) * Math.PI);
        disp -= lidCrease * 0.32;
      }
      // Supraorbital brow bone above eyes
      disp += gauss3(rx, ry, rz, 10.4, 158.6, 111.2, 2.3, 1.4, 2.8) * 0.48;
      disp += gauss3(rx, ry, rz, -8.6, 157.9, 113.0, 2.3, 1.4, 2.8) * 0.48;
      // Temporal fossa depression just behind/above brow arch
      disp -= gauss3(rx, ry, rz, 8.8, 162.5, 108.5, 2.2, 1.8, 2.2) * 0.34;
      disp -= gauss3(rx, ry, rz, -7.4, 162.0, 109.8, 2.2, 1.8, 2.2) * 0.34;

      // Sharp Zygomatic / Facial Crest running forward below eye toward nasal notch
      const crestY = 149.2 - (rz - 110.0) * 0.86;
      const facialCrest = gauss(ry, crestY, 1.9) * smoothstep(107, 110.5, rz) * (1 - smoothstep(118, 121.5, rz)) * smoothstep(4.2, 7.6, ahx);
      disp += facialCrest * 0.42 * lat;
      // Sub-zygomatic hollow right under the cheekbone
      disp -= gauss(ry, crestY - 2.8, 2.1) * smoothstep(109, 112, rz) * (1 - smoothstep(118, 121.5, rz)) * smoothstep(4.2, 7.6, ahx) * 0.18 * lat;
    }

    // Flared Nostril Alar Cartilage Wings + Deep Nasal Cavity + Muzzle Lip Split & Chin Groove
    if (ry < 137 && rz > 119.5) {
      const dNL = Math.hypot((rx - 5.9) * 1.05, (ry - 128.2) * 0.92, (rz - 125.0) * 1.12);
      const dNR = Math.hypot((rx + 1.5) * 1.05, (ry - 128.0) * 0.92, (rz - 124.1) * 1.12);
      const dN = Math.min(dNL, dNR);
      if (dN < 4.5) {
        const pit = Math.exp(-dN * dN * 0.58);
        const rim = Math.exp(-Math.pow(dN - 2.2, 2) * 1.45);
        disp += -0.82 * pit + 0.56 * rim;
      }
      // Philtrum / upper lip medial groove + chin mentum cleft
      disp -= gauss3(hrx, ry, rz, 0.4, 124.5, 126.2, 1.1, 2.4, 1.8) * 0.26;
      disp -= gauss3(hrx, ry, rz, 0.2, 121.2, 122.8, 2.8, 1.3, 2.0) * 0.36;
    }

    // Hollowed inner ear concha channel
    if (ry > 169.5 && rz > 103.5) {
      const earInner = Math.max(0, nz * 0.78 - Math.abs(nx) * 0.22);
      const leftEar = gauss3(rx, ry, rz, 7.6, 175.5, 114.5, 2.2, 3.8, 3.0);
      const rightEar = gauss3(rx, ry, rz, -7.2, 176.2, 114.2, 2.2, 3.8, 3.0);
      disp -= (leftEar + rightEar) * earInner * 0.52;
    }
  }

  // --- 2. NECK MYOLOGY (Deep Jugular Groove, Brachiocephalicus, Sternocephalicus, Splenius) ---
  if (rz > 42 && rz < 104 && ry > 102 && ry < 172) {
    const neckT = (rz - 48.0) / 50.0;
    const jugY = 110.5 + neckT * 34.8;
    const neckMask = smoothstep(43, 53, rz) * (1 - smoothstep(96, 103, rz)) * smoothstep(4.2, 9.0, ax);

    // Organic Sulcus Jugularis (broad, smooth anatomical neck groove)
    disp -= gauss(ry, jugY, 3.6) * neckMask * 0.58 * lat;
    // Brachiocephalicus strap muscle dorsal to jugular groove
    disp += gauss(ry, jugY + 5.8, 4.4) * neckMask * 0.48 * lat;
    // Sternocephalicus cord ventral to jugular groove
    disp += gauss(ry, jugY - 4.2, 3.2) * neckMask * 0.32 * lat;
    // Powerful arched Splenius muscle belly along upper-mid neck
    const spleniusY = 134.5 + neckT * 25.5;
    disp += gauss(ry, spleniusY, 7.2) * neckMask * 0.52 * lat;
    // Subtle cervical muscle separation below crest
    disp -= gauss(ry, spleniusY + 8.5, 3.2) * neckMask * 0.18 * lat;
  }

  // --- 3. CHEST & SHOULDER MYOLOGY (Pectorals, Scapular Spine, Supraspinatus/Infraspinatus, Deltoid, Triceps) ---
  if (rz > 14 && rz < 72 && ry > 76 && ry < 148) {
    // Median Sternal Cleavage + Twin Pectoralis Descendens Globes
    const chestFront = smoothstep(47, 56, rz) * smoothstep(81, 89, ry) * (1 - smoothstep(113, 123, ry)) * Math.max(0, nz * 0.85 + 0.25);
    disp -= gauss(ax, 0.0, 2.8) * chestFront * 0.68;
    disp += gauss2(ax, ry, 9.4, 99.5, 5.2, 7.2) * chestFront * 0.68;
    disp -= gauss2(ax, ry, 9.0, 90.5, 5.8, 2.4) * chestFront * 0.22;

    // Spine of Scapula (withers z=27,y=139 -> point of shoulder z=53,y=101)
    const scapZ = 53.0 - (ry - 101.0) * 0.68;
    const scapMask = smoothstep(97, 105, ry) * (1 - smoothstep(135, 144, ry)) * smoothstep(11, 17.5, ax);
    disp += gauss(rz, scapZ, 3.6) * scapMask * 0.56 * lat;
    disp += gauss(rz, scapZ + 5.2, 3.8) * scapMask * 0.34 * lat;
    disp -= gauss(rz, scapZ - 5.0, 3.2) * scapMask * 0.36 * lat;

    // Deltoideus muscle ridge + Massive Triceps Brachii Lateral & Long Heads
    const deltoid = gauss2(rz, ry, 43.5, 108.5, 4.2, 6.0) * smoothstep(15, 21, ax);
    const tricepsLong = gauss2(rz, ry, 34.0, 101.5, 6.8, 8.0) * smoothstep(15, 21, ax);
    const tricepsLat = gauss2(rz, ry, 37.5, 92.5, 5.5, 4.8) * smoothstep(15, 21, ax);
    disp += (deltoid * 0.46 + tricepsLong * 0.82 + tricepsLat * 0.52) * lat;

    // Smooth post-triceps boundary sulcus where forequarter meets barrel
    const postTricepsZ = 24.5 + (ry - 95.0) * 0.18;
    disp -= gauss(rz, postTricepsZ, 3.4) * smoothstep(83, 90, ry) * (1 - smoothstep(115, 124, ry)) * smoothstep(16, 22, ax) * 0.48 * lat;
  }

  // --- 4. BARREL, SERRATUS VENTRALIS, 11 COSTAL RIBS & PARALUMBAR FLANK HOLLOW ---
  if (rz > -54 && rz < 28 && ry > 78 && ry < 145) {
    // Serratus Ventralis Thoracis subtle digitations right behind shoulder
    const serratusEnv = smoothstep(4, 10, rz) * (1 - smoothstep(19, 25, rz)) * smoothstep(100, 106, ry) * (1 - smoothstep(119, 125, ry)) * smoothstep(17, 23, ax);
    const serratusFingers = Math.sin((rz * 0.95 + ry * 0.42) * 1.25);
    disp += serratusFingers * serratusEnv * 0.18 * lat;

    // Subtle Curved Anatomical Costal Rib Arches
    const ribEnvelope =
      smoothstep(-35, -21, rz) *
      (1 - smoothstep(12, 23, rz)) *
      smoothstep(84, 93, ry) *
      (1 - smoothstep(115, 126, ry)) *
      smoothstep(17, 23, ax);
    const costalArch = rz * 0.88 + (ry - 103.0) * 0.34;
    const ribSignal = Math.sin(costalArch * 1.15);
    disp += ribSignal * ribEnvelope * 0.19 * lat;

    // External Abdominal Oblique line sweeping up toward point of hip
    const obliqueY = 88.5 + (-rz + 10.0) * 0.28;
    disp -= gauss(ry, obliqueY, 3.6) * smoothstep(-42, -14, rz) * (1 - smoothstep(6, 18, rz)) * smoothstep(14, 21, ax) * 0.34 * lat;

    // Paralumbar Fossa (athletic flank hollow in front of hip)
    const flankHollow = gauss2(rz, ry, -35.5, 118.5, 7.5, 8.0) * smoothstep(16, 22, ax);
    disp -= flankHollow * 0.58 * lat;

    // Prominent bony Tuber Coxae (point of hip) + Tensor Fasciae Latae ridge
    const hipPoint = gauss2(rz, ry, -47.5, 129.5, 4.4, 4.2) * smoothstep(18, 23, ax);
    const tflRidge = gauss(rz, -47.5 - (129.5 - ry) * 0.22, 3.8) * smoothstep(95, 104, ry) * (1 - smoothstep(126, 131, ry)) * smoothstep(16, 22, ax);
    disp += (hipPoint * 0.56 + tflRidge * 0.36) * lat;
  }

  // --- 5. HINDQUARTERS / CROUP / BICEPS FEMORIS / SEMITENDINOSUS / GASKIN ---
  if (rz > -95 && rz < -44 && ry > 72 && ry < 146) {
    // Dorsal sacral croup groove between twin Gluteus Medius crowns
    const dorsalMask = smoothstep(-82, -70, rz) * (1 - smoothstep(-50, -44, rz)) * smoothstep(130, 137, ry) * Math.max(0, ny);
    disp -= gauss(ax, 0.0, 3.0) * dorsalMask * 0.45;
    disp += gauss(ax, 10.8, 6.2) * dorsalMask * 0.54;

    // Smooth Thoroughbred Haunch Intermuscular Groove (Biceps Femoris vs Semitendinosus)
    const grooveZ = -75.5 - (126.0 - ry) * 0.19;
    const haunchMask = smoothstep(84, 92, ry) * (1 - smoothstep(126, 134, ry)) * smoothstep(13.0, 19.0, ax);
    disp -= gauss(rz, grooveZ, 3.2) * haunchMask * 0.58 * lat;

    disp += gauss(rz, grooveZ + 6.8, 5.4) * haunchMask * 0.64 * lat;
    disp -= gauss(rz, grooveZ + 12.8, 2.8) * haunchMask * 0.22 * lat;
    disp += gauss(rz, grooveZ + 17.2, 4.8) * haunchMask * 0.46 * lat;
    disp += gauss(rz, grooveZ - 5.2, 4.2) * haunchMask * 0.50 * lat;

    // Stifle patellar shelf & Vastus Lateralis quad swell
    disp += gauss2(rz, ry, -57.5, 91.5, 5.4, 6.0) * smoothstep(14, 21, ax) * 0.54 * lat;
  }

  // --- 6. FOREARM, GASKIN, FLEXOR TENDONS, FETLOCK & HOOF CORONET ---
  if (ry < 84) {
    const upperLimb = smoothstep(52, 60, ry) * (1 - smoothstep(75, 83, ry)) * lat;
    disp += Math.sin(rz * 0.42) * upperLimb * 0.22;

    const cannonMask = smoothstep(14, 20, ry) * (1 - smoothstep(47, 54, ry)) * lat;
    const tendonGroove = Math.pow(Math.abs(Math.sin(rz * 0.58)), 1.6);
    disp -= tendonGroove * cannonMask * 0.26;

    disp += gauss(ry, 15.8, 2.2) * 0.18;
    disp += gauss(ry, 11.2, 1.3) * 0.30;
  }

  return disp;
}

export function buildSubdividedHorse(rawGeometry, levels = 3) {
  const posAttr = rawGeometry.attributes.position;
  const colAttr = rawGeometry.attributes.color;
  const rawIndex = rawGeometry.index ? rawGeometry.index.array : null;
  const rawMorphs = rawGeometry.morphAttributes.position || [];
  const numMorphs = rawMorphs.length;

  const keyToWelded = new Map();
  const rawToWelded = new Int32Array(posAttr.count);
  const basePos = [];
  const morphDeltas = Array.from({ length: numMorphs }, () => []);
  const anatAccum = [];

  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);
    const key = `${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)}`;

    let wIdx = keyToWelded.get(key);
    if (wIdx === undefined) {
      wIdx = basePos.length / 3;
      keyToWelded.set(key, wIdx);
      basePos.push(x, y, z);
      for (let m = 0; m < numMorphs; m++) {
        morphDeltas[m].push(
          rawMorphs[m].getX(i),
          rawMorphs[m].getY(i),
          rawMorphs[m].getZ(i)
        );
      }
      anatAccum.push([0, 0, 0, 0, 0]);
    }
    rawToWelded[i] = wIdx;

    const r = colAttr ? colAttr.getX(i) : 0.38;
    const acc = anatAccum[wIdx];
    if (r < 0.043 && y > 145 && z > 105) acc[2] += 1;
    else if (r < 0.065) acc[1] += 1;
    else if (r < 0.16) acc[0] += 1;
    else if (r > 0.45) acc[3] += 1;
    acc[4] += 1;
  }

  const vCount0 = basePos.length / 3;
  let pos = new Float32Array(basePos);
  let restPos = new Float32Array(basePos);
  let morphs = morphDeltas.map((arr) => new Float32Array(arr));
  let anatomy = new Float32Array(vCount0 * 4);
  let crease = new Float32Array(vCount0);

  for (let v = 0; v < vCount0; v++) {
    const [dp, mt, eye, blz, cnt] = anatAccum[v];
    const inv = 1 / Math.max(1, cnt);
    anatomy[v * 4 + 0] = dp * inv;
    anatomy[v * 4 + 1] = mt * inv;
    anatomy[v * 4 + 2] = eye * inv;
    anatomy[v * 4 + 3] = blz * inv;

    const ry = restPos[v * 3 + 1];
    const rz = restPos[v * 3 + 2];
    if (ry < 5.2) crease[v] = 0.74;
    else if (ry > 173.0 && rz > 96.0) crease[v] = 0.64;
    else crease[v] = 0.0;
  }

  const triList = [];
  const rawTriCount = rawIndex ? rawIndex.length : posAttr.count;
  for (let i = 0; i < rawTriCount; i += 3) {
    const a = rawToWelded[rawIndex ? rawIndex[i] : i];
    const b = rawToWelded[rawIndex ? rawIndex[i + 1] : i + 1];
    const c = rawToWelded[rawIndex ? rawIndex[i + 2] : i + 2];
    if (a !== b && b !== c && c !== a) {
      triList.push(a, b, c);
    }
  }
  let indices = new Uint32Array(triList);

  const tracker = createLandmarkTracker(pos, morphs, rawToWelded, vCount0);

  const foreDrive = new Float32Array(numMorphs);
  const hindDrive = new Float32Array(numMorphs);
  const breathFlare = new Float32Array(numMorphs);
  const flW = rawToWelded[273] * 3 + 1;
  const frW = rawToWelded[620] * 3 + 1;
  const hlW = rawToWelded[313] * 3 + 1;
  const hrW = rawToWelded[643] * 3 + 1;
  for (let m = 0; m < numMorphs; m++) {
    const flY = pos[flW] + morphs[m][flW];
    const frY = pos[frW] + morphs[m][frW];
    const hlY = pos[hlW] + morphs[m][hlW];
    const hrY = pos[hrW] + morphs[m][hrW];
    foreDrive[m] = Math.max(1 - smoothstep(0, 14, flY), 1 - smoothstep(0, 14, frY));
    hindDrive[m] = Math.max(1 - smoothstep(0, 14, hlY), 1 - smoothstep(0, 14, hrY));
    breathFlare[m] = m >= 5 && m <= 9 ? Math.sin(((m - 4.5) / 5.0) * Math.PI) : 0.15;
  }

  // 3-Level Charles Loop C2 Subdivision -> 31,490 vertices, 62,976 triangles
  for (let lv = 0; lv < levels; lv++) {
    const vCount = pos.length / 3;
    const neighbors = Array.from({ length: vCount }, () => []);
    const edgeMap = new Map();
    const triEdges = new Int32Array(indices.length);

    const addNeighbor = (u, w) => {
      const list = neighbors[u];
      if (!list.includes(w)) list.push(w);
    };

    const edges = [];
    for (let t = 0; t < indices.length; t += 3) {
      const a = indices[t], b = indices[t + 1], c = indices[t + 2];
      const tri = [a, b, c];
      for (let e = 0; e < 3; e++) {
        const u = tri[e];
        const w = tri[(e + 1) % 3];
        const opp = tri[(e + 2) % 3];
        addNeighbor(u, w);
        addNeighbor(w, u);

        const lo = u < w ? u : w;
        const hi = u < w ? w : u;
        const eKey = lo * 65536 + hi;
        let eIdx = edgeMap.get(eKey);
        if (eIdx === undefined) {
          eIdx = edges.length;
          edgeMap.set(eKey, eIdx);
          edges.push({ u: lo, w: hi, o0: opp, o1: opp });
        } else {
          edges[eIdx].o1 = opp;
        }
        triEdges[t + e] = eIdx;
      }
    }

    const newVCount = vCount + edges.length;
    const nextPos = new Float32Array(newVCount * 3);
    const nextRest = new Float32Array(newVCount * 3);
    const nextAnatomy = new Float32Array(newVCount * 4);
    const nextCrease = new Float32Array(newVCount);
    const nextMorphs = morphs.map(() => new Float32Array(newVCount * 3));

    for (let v = 0; v < vCount; v++) {
      const nbs = neighbors[v];
      const n = nbs.length;
      const cFactor = crease[v];
      const c = 0.375 + 0.25 * Math.cos((2 * Math.PI) / Math.max(3, n));
      const loopBeta = (1 / Math.max(3, n)) * (0.625 - c * c);
      const beta = loopBeta * (1 - cFactor);
      const selfW = 1 - n * beta;

      const v3 = v * 3;
      let px = pos[v3] * selfW, py = pos[v3 + 1] * selfW, pz = pos[v3 + 2] * selfW;
      let rx = restPos[v3] * selfW, ry = restPos[v3 + 1] * selfW, rz = restPos[v3 + 2] * selfW;

      for (let k = 0; k < n; k++) {
        const nb3 = nbs[k] * 3;
        px += pos[nb3] * beta; py += pos[nb3 + 1] * beta; pz += pos[nb3 + 2] * beta;
        rx += restPos[nb3] * beta; ry += restPos[nb3 + 1] * beta; rz += restPos[nb3 + 2] * beta;
      }
      nextPos[v3] = px; nextPos[v3 + 1] = py; nextPos[v3 + 2] = pz;
      nextRest[v3] = rx; nextRest[v3 + 1] = ry; nextRest[v3 + 2] = rz;

      for (let m = 0; m < numMorphs; m++) {
        const src = morphs[m], dst = nextMorphs[m];
        let mx = src[v3] * selfW, my = src[v3 + 1] * selfW, mz = src[v3 + 2] * selfW;
        for (let k = 0; k < n; k++) {
          const nb3 = nbs[k] * 3;
          mx += src[nb3] * beta; my += src[nb3 + 1] * beta; mz += src[nb3 + 2] * beta;
        }
        dst[v3] = mx; dst[v3 + 1] = my; dst[v3 + 2] = mz;
      }

      const v4 = v * 4;
      const eyeVal = anatomy[v4 + 2];
      for (let ch = 0; ch < 4; ch++) {
        if (ch === 2 && eyeVal > 0.5) {
          nextAnatomy[v4 + ch] = eyeVal;
        } else {
          let av = anatomy[v4 + ch] * selfW;
          for (let k = 0; k < n; k++) av += anatomy[nbs[k] * 4 + ch] * beta;
          nextAnatomy[v4 + ch] = av;
        }
      }
      nextCrease[v] = cFactor * 0.68;
    }

    for (let e = 0; e < edges.length; e++) {
      const { u, w, o0, o1 } = edges[e];
      const outIdx = vCount + e;
      const out3 = outIdx * 3;
      const u3 = u * 3, w3 = w * 3, o03 = o0 * 3, o13 = o1 * 3;

      const sharp = Math.max(crease[u], crease[w]);
      const wEnd = 0.375 * (1 - sharp) + 0.5 * sharp;
      const wOpp = 0.125 * (1 - sharp);

      for (let axis = 0; axis < 3; axis++) {
        nextPos[out3 + axis] = wEnd * (pos[u3 + axis] + pos[w3 + axis]) + wOpp * (pos[o03 + axis] + pos[o13 + axis]);
        nextRest[out3 + axis] = 0.5 * (restPos[u3 + axis] + restPos[w3 + axis]);
      }

      for (let m = 0; m < numMorphs; m++) {
        const src = morphs[m], dst = nextMorphs[m];
        for (let axis = 0; axis < 3; axis++) {
          dst[out3 + axis] = wEnd * (src[u3 + axis] + src[w3 + axis]) + wOpp * (src[o03 + axis] + src[o13 + axis]);
        }
      }

      const out4 = outIdx * 4;
      for (let ch = 0; ch < 4; ch++) {
        nextAnatomy[out4 + ch] = 0.5 * (anatomy[u * 4 + ch] + anatomy[w * 4 + ch]);
      }
      nextCrease[outIdx] = Math.min(crease[u], crease[w]) * 0.68;
    }

    const nextIndices = new Uint32Array(indices.length * 4);
    let ptr = 0;
    for (let t = 0; t < indices.length; t += 3) {
      const v0 = indices[t], v1 = indices[t + 1], v2 = indices[t + 2];
      const e0 = vCount + triEdges[t];
      const e1 = vCount + triEdges[t + 1];
      const e2 = vCount + triEdges[t + 2];

      nextIndices[ptr++] = v0; nextIndices[ptr++] = e0; nextIndices[ptr++] = e2;
      nextIndices[ptr++] = v1; nextIndices[ptr++] = e1; nextIndices[ptr++] = e0;
      nextIndices[ptr++] = v2; nextIndices[ptr++] = e2; nextIndices[ptr++] = e1;
      nextIndices[ptr++] = e0; nextIndices[ptr++] = e1; nextIndices[ptr++] = e2;
    }

    pos = nextPos;
    restPos = nextRest;
    anatomy = nextAnatomy;
    crease = nextCrease;
    morphs = nextMorphs;
    indices = nextIndices;
  }

  // Sculpt high-definition equine musculature + dynamic stance contraction
  const preSculptNormals = computeSmoothNormals(pos, null, indices);
  const vTotal = pos.length / 3;

  for (let v = 0; v < vTotal; v++) {
    const v3 = v * 3;
    const rx = restPos[v3], ry = restPos[v3 + 1], rz = restPos[v3 + 2];
    const nx = preSculptNormals[v3], ny = preSculptNormals[v3 + 1], nz = preSculptNormals[v3 + 2];
    const maneW = anatomy[v * 4 + 1];
    const eyeW = anatomy[v * 4 + 2];

    const bodyMask = 1 - smoothstep(0.35, 0.85, maneW);
    const disp = evaluateEquineMyology(rx, ry, rz, nx, ny, nz, eyeW) * bodyMask;

    pos[v3] += nx * disp;
    pos[v3 + 1] += ny * disp;
    pos[v3 + 2] += nz * disp;

    const isShoulder = gauss2(rz, ry, 35.5, 100.5, 10.5, 10.5) * smoothstep(14, 21, Math.abs(rx)) * bodyMask;
    const isHaunch = gauss2(rz, ry, -68.0, 111.0, 13.5, 13.5) * smoothstep(13, 20, Math.abs(rx)) * bodyMask;
    const dNostril = Math.min(
      Math.hypot(rx - 5.9, ry - 128.2, rz - 125.0),
      Math.hypot(rx + 1.5, ry - 128.0, rz - 124.1)
    );
    const isNostrilRim = dNostril < 3.8 ? Math.exp(-Math.pow(dNostril - 2.1, 2) * 1.1) : 0;

    if (isShoulder > 0.01 || isHaunch > 0.01 || isNostrilRim > 0.01) {
      for (let m = 0; m < numMorphs; m++) {
        const flexAmp =
          isShoulder * foreDrive[m] * 0.65 +
          isHaunch * hindDrive[m] * 0.78 +
          isNostrilRim * breathFlare[m] * 0.36;
        const dst = morphs[m];
        dst[v3] += nx * flexAmp;
        dst[v3 + 1] += ny * flexAmp;
        dst[v3 + 2] += nz * flexAmp;
      }
    }
  }

  for (let i = 0; i < pos.length; i++) pos[i] *= HORSE_SCALE;
  for (let m = 0; m < numMorphs; m++) {
    const arr = morphs[m];
    for (let i = 0; i < arr.length; i++) arr[i] *= HORSE_SCALE;
  }

  const baseNormals = computeSmoothNormals(pos, null, indices);
  const cavityAO = computeTopologicalCavityAO(pos, baseNormals, indices, vTotal);

  const morphPosAttrs = [];
  const morphNormAttrs = [];

  for (let m = 0; m < numMorphs; m++) {
    morphPosAttrs.push(new THREE.Float32BufferAttribute(morphs[m], 3));
    const targetNormals = computeSmoothNormals(pos, morphs[m], indices);
    for (let i = 0; i < targetNormals.length; i++) {
      targetNormals[i] -= baseNormals[i];
    }
    morphNormAttrs.push(new THREE.Float32BufferAttribute(targetNormals, 3));
  }

  const geo = new THREE.BufferGeometry();
  geo.morphTargetsRelative = true;
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(baseNormals, 3));
  geo.setAttribute('aRestPos', new THREE.Float32BufferAttribute(restPos, 3));
  geo.setAttribute('aAnatomy', new THREE.Float32BufferAttribute(anatomy, 4));
  geo.setAttribute('aCavity', new THREE.Float32BufferAttribute(cavityAO, 1));
  geo.morphAttributes.position = morphPosAttrs;
  geo.morphAttributes.normal = morphNormAttrs;
  geo.computeBoundingSphere();
  if (geo.boundingSphere) geo.boundingSphere.radius *= 1.5;

  return {
    geometry: geo,
    tracker,
    numMorphs,
    subdivData: { pos, normals: baseNormals, restPos, anatomy, morphs },
  };
}

function computeTopologicalCavityAO(pos, normals, indices, vCount) {
  const sumNb = new Float32Array(vCount * 3);
  const deg = new Uint16Array(vCount);

  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t], b = indices[t + 1], c = indices[t + 2];
    const pairs = [[a, b], [b, c], [c, a]];
    for (let p = 0; p < 3; p++) {
      const u = pairs[p][0], w = pairs[p][1];
      sumNb[u * 3] += pos[w * 3];
      sumNb[u * 3 + 1] += pos[w * 3 + 1];
      sumNb[u * 3 + 2] += pos[w * 3 + 2];
      deg[u]++;

      sumNb[w * 3] += pos[u * 3];
      sumNb[w * 3 + 1] += pos[u * 3 + 1];
      sumNb[w * 3 + 2] += pos[u * 3 + 2];
      deg[w]++;
    }
  }

  const rawCav = new Float32Array(vCount);
  for (let v = 0; v < vCount; v++) {
    const cnt = Math.max(1, deg[v]);
    const v3 = v * 3;
    const lx = pos[v3] - sumNb[v3] / cnt;
    const ly = pos[v3 + 1] - sumNb[v3 + 1] / cnt;
    const lz = pos[v3 + 2] - sumNb[v3 + 2] / cnt;
    const signedCurv = lx * normals[v3] + ly * normals[v3 + 1] + lz * normals[v3 + 2];

    const innerLegShadow = pos[v3 + 1] < 0.98 && Math.abs(normals[v3]) < 0.45 && normals[v3 + 1] < -0.25 ? 0.16 : 0.0;
    const grooveOcc = Math.max(0, -signedCurv * 58.0);
    const crownBoost = Math.max(0, signedCurv * 35.0);
    rawCav[v] = Math.max(0.76, Math.min(1.06, 1.0 - grooveOcc + crownBoost - innerLegShadow));
  }

  const smoothCav = new Float32Array(vCount);
  const acc = new Float32Array(vCount);
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t], b = indices[t + 1], c = indices[t + 2];
    acc[a] += rawCav[b] + rawCav[c];
    acc[b] += rawCav[c] + rawCav[a];
    acc[c] += rawCav[a] + rawCav[b];
  }
  for (let v = 0; v < vCount; v++) {
    const cnt = Math.max(1, deg[v]);
    smoothCav[v] = 0.52 * rawCav[v] + 0.48 * (acc[v] / cnt);
  }
  return smoothCav;
}

function computeSmoothNormals(basePos, deltaPos, indices) {
  const normals = new Float32Array(basePos.length);
  for (let t = 0; t < indices.length; t += 3) {
    const i0 = indices[t] * 3;
    const i1 = indices[t + 1] * 3;
    const i2 = indices[t + 2] * 3;

    const ax = basePos[i0] + (deltaPos ? deltaPos[i0] : 0);
    const ay = basePos[i0 + 1] + (deltaPos ? deltaPos[i0 + 1] : 0);
    const az = basePos[i0 + 2] + (deltaPos ? deltaPos[i0 + 2] : 0);

    const bx = basePos[i1] + (deltaPos ? deltaPos[i1] : 0);
    const by = basePos[i1 + 1] + (deltaPos ? deltaPos[i1 + 1] : 0);
    const bz = basePos[i1 + 2] + (deltaPos ? deltaPos[i1 + 2] : 0);

    const cx = basePos[i2] + (deltaPos ? deltaPos[i2] : 0);
    const cy = basePos[i2 + 1] + (deltaPos ? deltaPos[i2 + 1] : 0);
    const cz = basePos[i2 + 2] + (deltaPos ? deltaPos[i2 + 2] : 0);

    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;

    normals[i0] += nx; normals[i0 + 1] += ny; normals[i0 + 2] += nz;
    normals[i1] += nx; normals[i1 + 1] += ny; normals[i1 + 2] += nz;
    normals[i2] += nx; normals[i2 + 1] += ny; normals[i2 + 2] += nz;
  }

  for (let i = 0; i < normals.length; i += 3) {
    const len = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
    normals[i] /= len;
    normals[i + 1] /= len;
    normals[i + 2] /= len;
  }
  return normals;
}

export function applyCatmullRomGallop(influences, phase01) {
  const N = influences.length;
  influences.fill(0);

  const u = ((phase01 % 1) + 1) % 1;
  const f = u * N;
  const k = Math.floor(f) % N;
  const s = f - Math.floor(f);
  const s2 = s * s;
  const s3 = s2 * s;

  const i0 = (k - 1 + N) % N;
  const i1 = k;
  const i2 = (k + 1) % N;
  const i3 = (k + 2) % N;

  influences[i0] = 0.5 * (-s + 2 * s2 - s3);
  influences[i1] = 0.5 * (2 - 5 * s2 + 3 * s3);
  influences[i2] = 0.5 * (s + 4 * s2 - 3 * s3);
  influences[i3] = 0.5 * (-s2 + s3);

  return { i0, i1, i2, i3 };
}

function createLandmarkTracker(weldedPos, weldedMorphs, rawToWelded, vCount0) {
  const findNearestWelded = (tx, ty, tz) => {
    let best = 0;
    let bestD = Infinity;
    for (let v = 0; v < vCount0; v++) {
      const dx = weldedPos[v * 3] - tx;
      const dy = weldedPos[v * 3 + 1] - ty;
      const dz = weldedPos[v * 3 + 2] - tz;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bestD) { bestD = d; best = v; }
    }
    return best;
  };

  const hooves = [
    { id: 'FL', label: 'LF', wIdx: rawToWelded[273] },
    { id: 'FR', label: 'RF', wIdx: rawToWelded[620] },
    { id: 'HL', label: 'LH', wIdx: rawToWelded[313] },
    { id: 'HR', label: 'RH', wIdx: rawToWelded[643] },
  ];

  const nostrils = [
    { id: 'NL', wIdx: findNearestWelded(5.9, 128.2, 125.0), side: 1 },
    { id: 'NR', wIdx: findNearestWelded(-1.5, 128.0, 124.1), side: -1 },
  ];

  const sampleWelded = (wIdx, influences, outVec3, rootOffsetY = 0) => {
    const i3 = wIdx * 3;
    let x = weldedPos[i3];
    let y = weldedPos[i3 + 1];
    let z = weldedPos[i3 + 2];
    for (let m = 0; m < weldedMorphs.length; m++) {
      const w = influences[m];
      if (w !== 0) {
        const md = weldedMorphs[m];
        x += md[i3] * w;
        y += md[i3 + 1] * w;
        z += md[i3 + 2] * w;
      }
    }
    outVec3.set(x * HORSE_SCALE, y * HORSE_SCALE + rootOffsetY, z * HORSE_SCALE);
    return outVec3;
  };

  return {
    hooves,
    nostrils,
    sampleWelded,
  };
}
