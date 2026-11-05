export interface MarlinSpineStation {
  u: number;
  restZ: number;
  restY: number;
  /** Half-width of cross-section (narrow laterally compressed body, wider at caudal keels) */
  rx: number;
  /** Half-height of cross-section (tall body with steep high nape, slender caudal peduncle) */
  ry: number;
  /** Dorsal crest offset above spine center (steep high nape at u ~ 0.28..0.42) */
  dorsalArch: number;
  /** Ventral belly offset below spine center */
  ventralDepth: number;
  /** Caudal peduncle lateral keel flare (dual horizontal keels at u ~ 0.84..0.95) */
  keelFlare: number;
  /** Tall swept-back anterior dorsal lobe transitioning into a low posterior crest (u ~ 0.27..0.70) */
  dorsalFinRestSpan: number;
  pos: { x: number; y: number; z: number };
  prevPos: { x: number; y: number; z: number };
  vel: { x: number; y: number; z: number };
  yaw: number;
  pitch: number;
}

export interface MarlinDorsalTetra {
  stationIdx: number;
  restHeight: number;
  restWidth: number;
  restChord: number;
  restVolume: number;
  currentHeight: number;
  currentWidth: number;
  currentChord: number;
}

export interface MarlinBaitBead {
  id: number;
  pos: { x: number; y: number; z: number };
  vel: { x: number; y: number; z: number };
  r: number;
}

export interface BlueMarlinSpecificParams {
  tailSwishIntensity: number; // 0.0 to 1.5 (default 1.0)
  dorsalRaised: boolean;      // true = Raised tall anterior lobe, false = Folded (vertically compressed tetrahedral mesh)
  lightUpMode: boolean;       // true = Electric-blue glowing lateral stripes (pulses/flashes on slash or swish)
  slashTriggerSeq: number;    // Increment to trigger rapid side-to-side bill slash through bait cluster
  swishTriggerSeq: number;    // Increment to trigger vigorous tail swish burst
}

export interface BlueMarlinSimState {
  numSpine: number;
  totalLength: number;
  segRestLen: number;
  stations: MarlinSpineStation[];
  dorsalTetras: MarlinDorsalTetra[];
  restTotalVolumeCm3: number;
  currentTotalVolumeCm3: number;
  baseMassGrams: number;
  simTime: number;
  swimPhase: number;
  tailSwishIntensity: number;
  dorsalRaised: boolean;
  /** Smoothly interpolated dorsal fin elevation factor: 1.0 = fully raised, 0.22 = folded into dorsal groove */
  dorsalElevationBlend: number;
  /** Backward sweep factor (0 = erect, 1 = folded back into dorsal groove) */
  dorsalSweepFold: number;
  /** Pectoral fin hydrodynamic articulation: 0.0 = tucked sprint, 0.5 = cruising glide, 1.0 = flared braking/slash */
  pecFlareBlend: number;
  /** Articulated lower jaw (mandible) gape angle in radians */
  jawGapeAngle: number;
  /** Double-hinged caudal fin hydrofoil feathering angle in radians */
  caudalFeatherAngle: number;
  lightUpMode: boolean;
  /** Active timer for rapid side-to-side bill slashing through bait cluster */
  billSlashTimer: number;
  /** Active timer for vigorous tail swish burst */
  tailSwishBurstTimer: number;
  /** Real-time electric-blue lateral stripe luminescence intensity (pulses/flashes during slash or swish) */
  stripeGlowIntensity: number;
  beads: MarlinBaitBead[];
  nextBeadId: number;
  lastSlashSeq: number;
  lastSwishSeq: number;
}

export interface MarlinDragConstraint {
  active: boolean;
  part: 'none' | 'bill' | 'spine' | 'fin';
  stationIdx: number;
  deltaX: number;
  deltaY: number;
  deltaZ: number;
  liftArchFactor?: number;
}

/**
 * Evaluates the biological height (span) of the Blue Marlin's primary dorsal fin
 * along normalized dorsal chord `uChord in [0, 1]` (corresponding to body `u in [0.265, 0.685]`):
 * - Tall swept-back anterior lobe (`uChord in [0, 0.14]` rising to peak, `[0.14, 0.46]` falcate scallop)
 * - Low posterior crest (`uChord in [0.46, 1.0]`)
 */
export function evaluateMarlinDorsalSpan(
  uChord: number,
  tallAnteriorSpan = 0.82,
  lowCrestSpan = 0.175
): number {
  const uc = Math.max(0, Math.min(1, uChord));
  let colSpan: number;
  if (uc <= 0.14) {
    const tRise = uc / 0.14;
    colSpan =
      tallAnteriorSpan * (0.28 + 0.72 * Math.sin(tRise * (Math.PI * 0.5)));
  } else if (uc <= 0.46) {
    const tScallop = (uc - 0.14) / 0.32;
    const falcateDecay = Math.pow(1 - tScallop, 1.85);
    colSpan = lowCrestSpan + (tallAnteriorSpan - lowCrestSpan) * falcateDecay;
  } else {
    const tTail = (uc - 0.46) / 0.54;
    colSpan =
      lowCrestSpan *
      (1 - 0.45 * tTail) *
      Math.sin(Math.pow(1 - tTail * 0.86, 0.55) * (Math.PI * 0.5))
  }
  return Math.max(0.028, colSpan);
}

/**
 * Evaluates the rearward (`-Z`) sweep offset of a dorsal fin ray at normalized chord `uChord in [0, 1]`,
 * normalized span `vSpan in [0, 1]`, and groove fold factor `sweepFold in [0, 1]`.
 */
export function evaluateMarlinDorsalSweep(
  uChord: number,
  vSpan: number,
  sweepFold: number
): number {
  const baseSweep =
    (0.24 * Math.exp(-uChord * 2.5) + 0.05) * Math.pow(vSpan, 1.24);
  const foldSweep = sweepFold * 0.22 * Math.pow(vSpan, 1.15);
  return baseSweep + foldSweep;
}

/**
 * Computes the effective caudal propulsive intensity, combining the continuous
 * `tailSwishIntensity` slider with an additive `Swish Burst` impulse so `Swish Burst`
 * remains active even when the continuous slider is set to 0%.
 */
export function getEffectiveMarlinSwish(state: BlueMarlinSimState): {
  burstEnv: number;
  effectiveSwish: number;
} {
  const burstEnv =
    state.tailSwishBurstTimer > 0
      ? Math.sin((state.tailSwishBurstTimer / 1.05) * Math.PI)
      : 0;
  const effectiveSwish =
    state.tailSwishIntensity * (1.0 + 0.55 * burstEnv) + 1.15 * burstEnv;
  return { burstEnv, effectiveSwish };
}

/**
 * Evaluates the C1-continuous Signed-Distance-Field (SDF) anatomical cross-section profile
 * of Makaira nigricans along normalized axial coordinate `u in [0, 1]` from bill tip (`u = 0`)
 * to caudal fork (`u = 1`).
 */
export function evaluateMarlinSDFProfile(u: number): {
  rx: number;
  ry: number;
  dorsalArch: number;
  ventralDepth: number;
  keelFlare: number;
  dorsalFinRestSpan: number;
  restY: number;
} {
  let rx = 0.015;
  let ry = 0.015;
  let dorsalArch = 0;
  let ventralDepth = 0;
  let keelFlare = 0;

  if (u < 0.24) {
    const t = u / 0.24;
    const billCurve = Math.pow(t, 1.45);
    rx = 0.011 + 0.147 * billCurve;
    ry = 0.011 + 0.194 * Math.pow(t, 1.62);
    dorsalArch = u > 0.16 ? Math.pow((u - 0.16) / 0.08, 1.8) * 0.095 : 0;
    ventralDepth = u > 0.12 ? Math.pow((u - 0.12) / 0.12, 1.4) * 0.058 : 0;
  } else {
    const t = (u - 0.24) / 0.76;
    const shoulderRise = Math.sin(
      Math.pow(Math.min(1, t / 0.16), 0.78) * (Math.PI * 0.5)
    );
    const fusiformTaper = Math.pow(
      Math.max(0.0, 1.0 - Math.max(0, t - 0.1) / 0.9),
      1.22
    );
    const bodyEnv = shoulderRise * fusiformTaper;

    rx = 0.022 + 0.136 * Math.pow(1 - t, 0.85) + 0.068 * bodyEnv;
    ry = 0.028 + 0.177 * Math.pow(1 - t, 0.92) + 0.238 * bodyEnv;

    const napeBell = Math.exp(-Math.pow((u - 0.335) / 0.115, 2));
    dorsalArch =
      (0.095 * Math.pow(1 - t, 1.3) + 0.155 * napeBell) *
      Math.max(0, 1 - t * 1.15);

    ventralDepth =
      0.058 *
      Math.sin(Math.pow(Math.min(1, t * 1.22), 0.75) * Math.PI) *
      (1 - 0.55 * t);

    if (u >= 0.83 && u <= 0.96) {
      const kt = (u - 0.83) / 0.13;
      keelFlare = Math.sin(kt * Math.PI) * 0.054;
    }
  }

  let dorsalFinRestSpan = 0;
  if (u >= 0.265 && u <= 0.685) {
    const uChord = (u - 0.265) / 0.42;
    dorsalFinRestSpan = evaluateMarlinDorsalSpan(uChord, 0.82, 0.175);
  }

  const peduncleRise = u > 0.7 ? Math.pow((u - 0.7) / 0.3, 1.25) * 0.14 : 0;
  const billSightLine = u < 0.24 ? (0.24 - u) * 0.11 : 0;
  const restY = 0.49 + peduncleRise + billSightLine;

  return {
    rx,
    ry,
    dorsalArch,
    ventralDepth,
    keelFlare,
    dorsalFinRestSpan,
    restY,
  };
}

/**
 * Creates the initial XPBD axial & dorsal-tetrahedral soft-body state for the Blue Marlin.
 */
export function createBlueMarlinSimState(numSpine = 40): BlueMarlinSimState {
  const totalLength = 3.68;
  const segRestLen = totalLength / (numSpine - 1);

  const stations: MarlinSpineStation[] = [];
  const dorsalTetras: MarlinDorsalTetra[] = [];

  for (let i = 0; i < numSpine; i++) {
    const u = i / (numSpine - 1);
    const restZ = 2.08 - u * totalLength;
    const prof = evaluateMarlinSDFProfile(u);

    stations.push({
      u,
      restZ,
      restY: prof.restY,
      rx: prof.rx,
      ry: prof.ry,
      dorsalArch: prof.dorsalArch,
      ventralDepth: prof.ventralDepth,
      keelFlare: prof.keelFlare,
      dorsalFinRestSpan: prof.dorsalFinRestSpan,
      pos: { x: 0, y: prof.restY, z: restZ },
      prevPos: { x: 0, y: prof.restY, z: restZ },
      vel: { x: 0, y: 0, z: 0 },
      yaw: 0,
      pitch: 0,
    });

    if (prof.dorsalFinRestSpan > 0.01) {
      const h = prof.dorsalFinRestSpan;
      const w = 0.042;
      const c = segRestLen;
      const restVolume = (h * w * c) / 6.0;
      dorsalTetras.push({
        stationIdx: i,
        restHeight: h,
        restWidth: w,
        restChord: c,
        restVolume,
        currentHeight: h,
        currentWidth: w,
        currentChord: c,
      });
    }
  }

  const restTotalVolumeCm3 = 1685.0;

  return {
    numSpine,
    totalLength,
    segRestLen,
    stations,
    dorsalTetras,
    restTotalVolumeCm3,
    currentTotalVolumeCm3: restTotalVolumeCm3,
    baseMassGrams: 1790.0,
    simTime: 0,
    swimPhase: 0,
    tailSwishIntensity: 1.0,
    dorsalRaised: true,
    dorsalElevationBlend: 1.0,
    dorsalSweepFold: 0.0,
    pecFlareBlend: 0.5,
    jawGapeAngle: 0.04,
    caudalFeatherAngle: 0.0,
    lightUpMode: true,
    billSlashTimer: 0,
    tailSwishBurstTimer: 0,
    stripeGlowIntensity: 0.65,
    beads: [
      { id: 1, pos: { x: 0.22, y: 0.085, z: 1.75 }, vel: { x: 0, y: 0, z: 0 }, r: 0.085 },
      { id: 2, pos: { x: -0.24, y: 0.085, z: 1.62 }, vel: { x: 0, y: 0, z: 0 }, r: 0.085 },
      { id: 3, pos: { x: 0.05, y: 0.085, z: 1.92 }, vel: { x: 0, y: 0, z: 0 }, r: 0.085 },
      { id: 4, pos: { x: -0.12, y: 0.085, z: 1.48 }, vel: { x: 0, y: 0, z: 0 }, r: 0.085 },
    ],
    nextBeadId: 5,
    lastSlashSeq: 0,
    lastSwishSeq: 0,
  };
}

/**
 * Triggers a rapid side-to-side predatory slashing motion of the bill through the cluster of bait beads,
 * spawning a bait school ahead of the bill if fewer than 3 beads are near the rostrum.
 */
export function triggerMarlinBillSlash(state: BlueMarlinSimState): void {
  state.billSlashTimer = 1.25;
  if (state.lightUpMode) {
    state.stripeGlowIntensity = 2.35;
  }

  const nearBillCount = state.beads.filter(
    (b) => b.pos.z > 1.15 && Math.abs(b.pos.x) < 0.85
  ).length;

  if (nearBillCount < 3) {
    const clusterOffsets: [number, number][] = [
      [0.16, 1.78],
      [-0.18, 1.66],
      [0.04, 1.92],
      [-0.08, 1.52],
    ];
    for (const [bx, bz] of clusterOffsets) {
      if (state.beads.length >= 12) state.beads.shift();
      state.beads.push({
        id: state.nextBeadId++,
        pos: { x: bx, y: 0.24, z: bz },
        vel: { x: 0, y: -0.6, z: 0 },
        r: 0.085,
      });
    }
  }
}

/**
 * Triggers a high-velocity pelagic caudal peduncle & crescent tail swish burst.
 */
export function triggerMarlinTailSwish(state: BlueMarlinSimState): void {
  state.tailSwishBurstTimer = 1.05;
  if (state.lightUpMode) {
    state.stripeGlowIntensity = Math.max(state.stripeGlowIntensity, 2.05);
  }
}

/**
 * Advances the Blue Marlin XPBD soft-body simulation:
 * 1. Solves volume-preserving vertical tetrahedral compression for folding/raising the tall dorsal fin.
 * 2. Integrates true thunniform/carangiform propulsion concentrated in the posterior peduncle & double-hinged caudal tail.
 * 3. Integrates multi-sweep predatory figure-eight bill slashing through the bait cluster with pectoral braking flare and jaw gape.
 * 4. Solves smooth Gaussian & cantilever XPBD axial rod deformation during interactive dragging of the bill, trunk, or fins.
 * 5. Pulses and flashes the electric-blue lateral stripes in "Light-Up" mode during each slash or swish.
 */
export function stepBlueMarlinSim(
  state: BlueMarlinSimState,
  dt: number,
  dragConstraint?: MarlinDragConstraint
): void {
  const clampedDt = Math.min(0.033, Math.max(0.001, dt));
  state.simTime += clampedDt;

  if (state.billSlashTimer > 0) {
    state.billSlashTimer = Math.max(0, state.billSlashTimer - clampedDt);
  }
  if (state.tailSwishBurstTimer > 0) {
    state.tailSwishBurstTimer = Math.max(0, state.tailSwishBurstTimer - clampedDt);
  }

  const isSlashing = state.billSlashTimer > 0;
  const isBursting = state.tailSwishBurstTimer > 0;
  const isDraggingBill =
    dragConstraint?.active && dragConstraint.part === 'bill';

  // 1. Volume-Preserving Vertical Compression of the Dorsal Fin Tetrahedral Mesh
  const targetElevation = state.dorsalRaised ? 1.0 : 0.22;
  const foldRate = 1.0 - Math.exp(-15.0 * clampedDt);
  state.dorsalElevationBlend +=
    (targetElevation - state.dorsalElevationBlend) * foldRate;
  state.dorsalSweepFold = Math.max(
    0,
    Math.min(1, (1.0 - state.dorsalElevationBlend) / 0.78)
  );

  let dorsalTetVolSum = 0;
  let dorsalRestVolSum = 0;
  for (const tet of state.dorsalTetras) {
    const scaleY = Math.max(0.2, state.dorsalElevationBlend);
    const invSqrtY = 1.0 / Math.sqrt(scaleY);
    tet.currentHeight = tet.restHeight * scaleY;
    tet.currentWidth = tet.restWidth * invSqrtY;
    tet.currentChord = tet.restChord * invSqrtY;

    const currentV =
      (tet.currentHeight * tet.currentWidth * tet.currentChord) / 6.0;
    dorsalTetVolSum += currentV;
    dorsalRestVolSum += tet.restVolume;
  }

  const volRatio =
    dorsalRestVolSum > 0 ? dorsalTetVolSum / dorsalRestVolSum : 1.0;
  state.currentTotalVolumeCm3 =
    Math.round(state.restTotalVolumeCm3 * volRatio * 10) / 10;

  // 2. Biological Fin & Jaw Coordination (Pectoral Hydrofoil Flare / Tuck + Mandibular Gape)
  const targetPecFlare =
    isSlashing || isDraggingBill ? 1.0 : isBursting ? 0.14 : 0.52;
  state.pecFlareBlend +=
    (targetPecFlare - state.pecFlareBlend) * (1 - Math.exp(-12.0 * clampedDt));

  const targetJawGape = isSlashing
    ? 0.18 + 0.06 * Math.abs(Math.sin(state.simTime * 28.0))
    : isDraggingBill
    ? 0.13
    : 0.035 + 0.015 * Math.sin(state.swimPhase * 0.5);
  state.jawGapeAngle +=
    (targetJawGape - state.jawGapeAngle) * (1 - Math.exp(-14.0 * clampedDt));

  // 3. Thunniform / Carangiform Tail Swish & Predatory Figure-Eight Bill Slash Kinematics
  const { burstEnv, effectiveSwish } = getEffectiveMarlinSwish(state);
  const swimFreq =
    3.6 + 2.4 * state.tailSwishIntensity + 4.2 * burstEnv;
  state.swimPhase += swimFreq * clampedDt;

  const slashProgress = isSlashing ? 1.0 - state.billSlashTimer / 1.25 : 0;
  const slashEnv = isSlashing ? Math.sin(slashProgress * Math.PI) : 0;
  const slashPhase = slashProgress * Math.PI * 7.5;
  const slashWaveX = isSlashing ? Math.sin(slashPhase) * slashEnv : 0;
  const slashWaveY = isSlashing
    ? Math.sin(slashPhase * 2.0) * 0.045 * slashEnv
    : 0;

  const hasActiveDrag =
    Boolean(dragConstraint?.active) &&
    dragConstraint !== undefined &&
    dragConstraint.stationIdx >= 0 &&
    dragConstraint.stationIdx < state.numSpine;
  const uGrab = hasActiveDrag
    ? state.stations[dragConstraint!.stationIdx].u
    : 0.32;

  // 4. Update Spine Stations & Integrate Smooth Regional Drag Compliance
  for (let i = 0; i < state.numSpine; i++) {
    const st = state.stations[i];
    const u = st.u;
    st.prevPos.x = st.pos.x;
    st.prevPos.y = st.pos.y;
    st.prevPos.z = st.pos.z;

    let tailEnv = 0;
    if (u >= 0.36) {
      const p = (u - 0.36) / 0.64;
      tailEnv = (0.03 * p + 0.28 * Math.pow(p, 2.15)) * effectiveSwish;
    } else {
      tailEnv = Math.pow((0.36 - u) / 0.36, 1.3) * 0.026 * effectiveSwish;
    }

    const tailWaveX = Math.sin(state.swimPhase - (u - 0.36) * 6.8) * tailEnv;

    let billSlashX = 0;
    let billSlashY = 0;
    if (isSlashing) {
      if (u < 0.45) {
        const lever = Math.pow((0.45 - u) / 0.45, 1.28);
        billSlashX = lever * 0.68 * slashWaveX;
        billSlashY = lever * slashWaveY;
      } else {
        const brace = Math.sin(((u - 0.45) / 0.55) * Math.PI);
        billSlashX = -brace * 0.085 * slashWaveX;
      }
    }

    let targetX = tailWaveX + billSlashX;
    let targetY =
      st.restY +
      Math.sin(state.swimPhase * 0.5 - u * 3.0) * 0.011 * effectiveSwish +
      billSlashY;
    let targetZ = st.restZ;

    if (hasActiveDrag && dragConstraint) {
      const uDist = Math.abs(u - uGrab);
      let w = 0;
      if (dragConstraint.part === 'bill') {
        const uPivot = 0.48;
        const gauss = Math.exp(-Math.pow(uDist / 0.26, 2));
        if (u <= uPivot) {
          const denom = Math.max(0.14, uPivot - Math.min(0.24, uGrab));
          const cantilever = Math.pow(
            Math.max(0, Math.min(1.2, (uPivot - u) / denom)),
            1.18
          );
          w = Math.min(1.05, gauss * 0.68 + cantilever * 0.36);
        } else {
          w = gauss * 0.42;
        }
      } else if (dragConstraint.part === 'spine') {
        w = Math.exp(-Math.pow(uDist / 0.32, 2));
      } else if (dragConstraint.part === 'fin') {
        w = Math.exp(-Math.pow(uDist / 0.30, 2)) * 0.68;
      }

      // Coupled longitudinal (forward/backward deltaZ) jelly deformation:
      // Pulling forward (+Z) or backward (-Z) induces both axial stretch/compression
      // AND a natural dorso-ventral arch + hydrodynamic S-curve flex along the body
      const clampedDZ = Math.max(-1.35, Math.min(1.35, dragConstraint.deltaZ));
      const archEnvelope = Math.cos(
        Math.min(1.0, uDist * 1.65) * Math.PI * 0.5
      );
      const axialArchY = Math.max(-0.06, -clampedDZ * 0.16) * archEnvelope;
      const axialFlexX =
        clampedDZ *
        Math.sin((u - 0.35) * Math.PI * 2.1) *
        0.18 *
        (0.4 + 0.6 * w);

      targetX += dragConstraint.deltaX * w + axialFlexX;
      targetY += dragConstraint.deltaY * w + axialArchY;
      targetZ += clampedDZ * (0.55 + 0.45 * w);

      if (dragConstraint.liftArchFactor && dragConstraint.liftArchFactor > 0) {
        targetY -=
          dragConstraint.liftArchFactor *
          Math.pow(Math.abs(u - uGrab), 1.35) *
          0.34;
      }
    }

    const minStationY = 0.02 + st.ry + st.ventralDepth;
    const kFollow = 1.0 - Math.exp(-24.0 * clampedDt);
    st.pos.x += (targetX - st.pos.x) * kFollow;
    st.pos.y = Math.max(minStationY, st.pos.y + (targetY - st.pos.y) * kFollow);
    st.pos.z += (targetZ - st.pos.z) * kFollow;
  }

  // 5. Multi-Pass XPBD Axial Rod Distance (with Elastic Longitudinal Stretch/Compression) & C2 Bending Regularization
  const hubIdx = Math.floor(state.numSpine * 0.32);
  const clampedDeltaZ =
    hasActiveDrag && dragConstraint
      ? Math.max(-1.35, Math.min(1.35, dragConstraint.deltaZ))
      : 0;
  const hubZShift =
    hasActiveDrag && dragConstraint
      ? Math.max(-0.92, Math.min(0.92, clampedDeltaZ * 0.72))
      : 0;
  const kFollowHub = 1.0 - Math.exp(-24.0 * clampedDt);
  const smoothedHubZ =
    state.stations[hubIdx].pos.z +
    (state.stations[hubIdx].restZ + hubZShift - state.stations[hubIdx].pos.z) *
      kFollowHub;

  for (let iter = 0; iter < 3; iter++) {
    const wSmooth = hasActiveDrag ? 0.24 : 0.12;
    for (let i = 1; i < state.numSpine - 1; i++) {
      const prev = state.stations[i - 1];
      const cur = state.stations[i];
      const next = state.stations[i + 1];
      cur.pos.x =
        cur.pos.x * (1 - 2 * wSmooth) + (prev.pos.x + next.pos.x) * wSmooth;
      cur.pos.y = Math.max(
        0.02 + cur.ry + cur.ventralDepth,
        cur.pos.y * (1 - 2 * wSmooth) + (prev.pos.y + next.pos.y) * wSmooth
      );
    }

    state.stations[hubIdx].pos.z = smoothedHubZ;

    // Forward pass toward bill tip (i = hubIdx - 1 down to 0) with elastic axial strain
    for (let i = hubIdx - 1; i >= 0; i--) {
      const cur = state.stations[i];
      const next = state.stations[i + 1];

      // Elastic longitudinal stretch/compression when dragged forward (+Z) or backward (-Z)
      let axialScale = 1.0;
      if (hasActiveDrag && Math.abs(clampedDeltaZ) > 0.22) {
        const segU = cur.u;
        const distFromGrab = Math.abs(segU - uGrab);
        const localCompliance = Math.exp(-Math.pow(distFromGrab / 0.42, 2));
        axialScale = Math.max(
          0.88,
          Math.min(
            1.16,
            1.0 + clampedDeltaZ * 0.11 * (0.45 + 0.55 * localCompliance)
          )
        );
      }

      const targetSegLen = state.segRestLen * axialScale;
      const dx = cur.pos.x - next.pos.x;
      const dy = cur.pos.y - next.pos.y;
      // Guarantee strictly positive forward Z progression so stations never fold or amplify lateral dx/dy
      const dz = Math.max(targetSegLen * 0.78, cur.pos.z - next.pos.z);
      const d = Math.hypot(dx, dy, dz) || 1e-5;
      const scale = targetSegLen / d;
      cur.pos.x = next.pos.x + dx * scale;
      cur.pos.y = Math.max(
        0.02 + cur.ry + cur.ventralDepth,
        next.pos.y + dy * scale
      );
      cur.pos.z = next.pos.z + dz * scale;
    }

    // Backward pass toward caudal fork (i = hubIdx + 1 up to numSpine - 1) with elastic axial strain
    for (let i = hubIdx + 1; i < state.numSpine; i++) {
      const prev = state.stations[i - 1];
      const cur = state.stations[i];

      let axialScale = 1.0;
      if (hasActiveDrag && Math.abs(clampedDeltaZ) > 0.22) {
        const segU = cur.u;
        const distFromGrab = Math.abs(segU - uGrab);
        const localCompliance = Math.exp(-Math.pow(distFromGrab / 0.42, 2));
        axialScale = Math.max(
          0.88,
          Math.min(
            1.16,
            1.0 + clampedDeltaZ * 0.11 * (0.45 + 0.55 * localCompliance)
          )
        );
      }

      const targetSegLen = state.segRestLen * axialScale;
      const dx = cur.pos.x - prev.pos.x;
      const dy = cur.pos.y - prev.pos.y;
      // Guarantee strictly negative backward Z progression so stations never fold or amplify lateral dx/dy
      const dz = Math.min(-targetSegLen * 0.78, cur.pos.z - prev.pos.z);
      const d = Math.hypot(dx, dy, dz) || 1e-5;
      const scale = targetSegLen / d;
      cur.pos.x = prev.pos.x + dx * scale;
      cur.pos.y = Math.max(
        0.02 + cur.ry + cur.ventralDepth,
        prev.pos.y + dy * scale
      );
      cur.pos.z = prev.pos.z + dz * scale;
    }

    // Post-rod C2 smoothing pass so the hubIdx pivot (station 12) never forms a V-hinge crease
    const wPost = hasActiveDrag ? 0.25 : 0.14;
    for (let i = 1; i < state.numSpine - 1; i++) {
      const prev = state.stations[i - 1];
      const cur = state.stations[i];
      const next = state.stations[i + 1];
      cur.pos.x =
        cur.pos.x * (1 - 2 * wPost) + (prev.pos.x + next.pos.x) * wPost;
      cur.pos.y = Math.max(
        0.02 + cur.ry + cur.ventralDepth,
        cur.pos.y * (1 - 2 * wPost) + (prev.pos.y + next.pos.y) * wPost
      );
      cur.pos.z =
        cur.pos.z * (1 - 2 * wPost * 0.5) +
        (prev.pos.z + next.pos.z) * (wPost * 0.5);
    }
  }

  // Update station velocities, yaw, and pitch with C2-continuous tangent filtering
  for (let i = 0; i < state.numSpine; i++) {
    const st = state.stations[i];
    st.vel.x = (st.pos.x - st.prevPos.x) / clampedDt;
    st.vel.y = (st.pos.y - st.prevPos.y) / clampedDt;
    st.vel.z = (st.pos.z - st.prevPos.z) / clampedDt;

    const sPrev = state.stations[Math.max(0, i - 2)];
    const sNext = state.stations[Math.min(state.numSpine - 1, i + 2)];
    const dx = sNext.pos.x - sPrev.pos.x;
    const dy = sNext.pos.y - sPrev.pos.y;
    const dz = sNext.pos.z - sPrev.pos.z;
    const horiz = Math.hypot(dx, dz) || 1e-5;
    st.yaw = Math.atan2(dx, -dz);
    st.pitch = Math.atan2(dy, horiz);
  }

  // Compute double-hinged caudal hydrofoil feathering angle (phase-lagged 90 deg behind lateral heave)
  const peduncleSt = state.stations[state.numSpine - 2];
  state.caudalFeatherAngle =
    -peduncleSt.yaw +
    Math.cos(state.swimPhase - (0.96 - 0.36) * 6.8) * 0.28 * effectiveSwish;

  // 6. Bait Bead Physics & Hydrodynamic Bill-Slash / Tail-Swish Scattering
  const rostrumIndices = [0, 1, 2, 3, 4, 5, 6, 7];
  const tailFork = state.stations[state.numSpine - 1];

  for (const bead of state.beads) {
    bead.vel.y -= 14.5 * clampedDt;

    for (const rIdx of rostrumIndices) {
      const billSt = state.stations[rIdx];
      const dx = bead.pos.x - billSt.pos.x;
      const dz = bead.pos.z - billSt.pos.z;
      const distXZ = Math.hypot(dx, dz);
      const hitRadius = isSlashing ? 0.50 : 0.24;
      if (distXZ < hitRadius) {
        const push = (1.0 - distXZ / hitRadius) * (isSlashing ? 19.5 : 6.0);
        const nx = distXZ > 1e-4 ? dx / distXZ : (Math.random() - 0.5) * 2;
        const nz = distXZ > 1e-4 ? dz / distXZ : 1;
        bead.vel.x += (nx * push + billSt.vel.x * 0.72) * clampedDt * 8.0;
        bead.vel.y = Math.max(bead.vel.y, isSlashing ? 2.5 : 0.85);
        bead.vel.z += (nz * push + 1.5) * clampedDt * 6.0;
      }
    }

    const tdx = bead.pos.x - tailFork.pos.x;
    const tdz = bead.pos.z - tailFork.pos.z;
    const tailDist = Math.hypot(tdx, tdz);
    if (tailDist < 0.42) {
      bead.vel.x += tailFork.vel.x * 0.52;
      bead.vel.y = Math.max(bead.vel.y, 1.25);
    }

    bead.pos.x += bead.vel.x * clampedDt;
    bead.pos.y += bead.vel.y * clampedDt;
    bead.pos.z += bead.vel.z * clampedDt;

    if (bead.pos.y < bead.r) {
      bead.pos.y = bead.r;
      if (bead.vel.y < -0.25) {
        bead.vel.y = -bead.vel.y * 0.35;
      } else {
        bead.vel.y = 0;
      }
      bead.vel.x *= Math.exp(-3.8 * clampedDt);
      bead.vel.z *= Math.exp(-3.8 * clampedDt);
    }

    const rPlatter = Math.hypot(bead.pos.x, bead.pos.z);
    if (rPlatter > 3.2) {
      bead.pos.x *= 3.2 / rPlatter;
      bead.pos.z *= 3.2 / rPlatter;
      bead.vel.x *= -0.5;
      bead.vel.z *= -0.5;
    }
  }

  // 7. Electric-Blue Lateral Stripe Luminescence ("Light-Up" mode pulses/flashes on each slash or swish)
  const swishPulse =
    Math.abs(Math.sin(state.swimPhase)) * 0.55 * Math.min(1.5, effectiveSwish);
  const slashFlash = isSlashing
    ? (0.95 + 0.95 * Math.abs(Math.sin(slashPhase))) * slashEnv
    : 0;
  const burstFlash = isBursting
    ? (0.85 + 0.78 * Math.abs(Math.sin(state.swimPhase * 1.5))) * burstEnv
    : 0;
  const dragFlash = hasActiveDrag ? 0.42 : 0;

  const targetGlow = state.lightUpMode
    ? Math.min(
        2.6,
        0.52 + swishPulse + slashFlash * 1.5 + burstFlash * 1.2 + dragFlash
      )
    : 0.0;

  state.stripeGlowIntensity +=
    (targetGlow - state.stripeGlowIntensity) *
    (1 - Math.exp(-14.0 * clampedDt));
}

/**
 * Computes real-time physical readouts for the Blue Marlin:
 * - Mass (g)
 * - Volume (cm³) — conserved during dorsal fin tetrahedral vertical compression
 * - Bill-to-Fork Length (cm)
 * - Dorsal Fin Height (cm)
 */
export function computeBlueMarlinTelemetry(state: BlueMarlinSimState): {
  massGrams: number;
  volumeCm3: number;
  billToForkLengthCm: number;
  dorsalFinHeightCm: number;
  meanStrainPct: number;
  stripeGlowPct: number;
} {
  const sceneToCm = 18.0;

  let arcLen = 0;
  for (let i = 1; i < state.numSpine; i++) {
    const a = state.stations[i - 1].pos;
    const b = state.stations[i].pos;
    arcLen += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  }
  const billToForkLengthCm = Math.round(arcLen * sceneToCm * 10) / 10;

  let maxDorsalSpan = 0;
  for (const tet of state.dorsalTetras) {
    if (tet.currentHeight > maxDorsalSpan) {
      maxDorsalSpan = tet.currentHeight;
    }
  }
  const dorsalFinHeightCm = Math.round(maxDorsalSpan * sceneToCm * 10) / 10;

  const massGrams =
    Math.round((state.baseMassGrams + state.beads.length * 4.2) * 10) / 10;
  const volumeCm3 = state.currentTotalVolumeCm3;

  const { effectiveSwish } = getEffectiveMarlinSwish(state);
  const slashActivity = state.billSlashTimer > 0 ? 38.0 : 0;
  const swishActivity = effectiveSwish * 18.5;
  const foldStrain = (1.0 - state.dorsalElevationBlend) * 14.0;
  const meanStrainPct =
    Math.round(
      Math.min(99.9, swishActivity + slashActivity + foldStrain) * 10
    ) / 10;

  const stripeGlowPct = state.lightUpMode
    ? Math.min(100, Math.round((state.stripeGlowIntensity / 1.8) * 100))
    : 0;

  return {
    massGrams,
    volumeCm3,
    billToForkLengthCm,
    dorsalFinHeightCm,
    meanStrainPct,
    stripeGlowPct,
  };
}
