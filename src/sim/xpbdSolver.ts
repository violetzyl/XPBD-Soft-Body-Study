import {
  buildOctopusAnatomyBlueprint,
  OctopusAnatomyBlueprint,
  Vec3,
} from './octopusAnatomy';

export type GrabRegionType =
  | 'none'
  | 'mantle'
  | 'head'
  | 'arm_proximal'
  | 'arm_tip';

export interface BaitBead {
  id: number;
  position: Vec3;
  velocity: Vec3;
  radius: number;
  hueShift: number;
  settled: boolean;
}

export interface OctopusTelemetry {
  massGrams: number;
  volumeCm3: number;
  armSpanCm: number;
  mantleHeightCm: number;
  meanMuscleStrainPct: number;
  activeBeadCount: number;
  isDragging: boolean;
  grabRegion: GrabRegionType;
  grabRegionLabel: string;
  suctionGripPct: number;
  jellyRippleIntensity: number;
  computeBackend: 'WebGPU Compute' | 'WebGL2 XPBD';
}

export interface XPBDMuscleEdge {
  i0: number;
  i1: number;
  restLength: number;
  compliance: number;
  armIndex: number; // -1 for head/mantle/web structural core
  u: number;        // [0, 1] along arm
  flankSide: number; // -1 left flank, +1 right flank, 0 neutral
  curlBias: number;  // +1 dorsal/curl edge, -1 ventral edge, 0 neutral
}

export interface XPBDCageTetra {
  i0: number;
  i1: number;
  i2: number;
  i3: number;
  restVolume: number;
  compliance: number;
}

export interface XPBDOctopusState {
  blueprint: OctopusAnatomyBlueprint;
  numParticles: number;
  positions: Float32Array;
  prevPositions: Float32Array;
  restPositions: Float32Array;
  velocities: Float32Array;
  invMasses: Float32Array;
  /** Per-particle anatomical region classification for differentiated force response */
  particleRegions: GrabRegionType[];
  /** Per-particle arm index (-1 for head/mantle/funnel) */
  particleArmIndex: Int8Array;
  /** Per-particle station index along its arm (-1 for head/mantle/funnel, 0..15 for arm nodes) */
  particleStationIndex: Int8Array;
  /** Maps (armIndex, segmentIndex) -> 4 cross-section particle indices [dorsal, ventral, left, right] */
  armNodeParticles: number[][][];
  headCoreParticle: number;
  headTopParticle: number;
  headLeftParticle: number;
  headRightParticle: number;
  mantleTipParticle: number;
  mantleMidParticle: number;
  mantleTopParticle: number;
  mantleLeftParticle: number;
  mantleRightParticle: number;
  funnelTipParticle: number;
  edges: XPBDMuscleEdge[];
  tetras: XPBDCageTetra[];
  restTotalVolume: number;
  baseMassGrams: number;
  simTime: number;
  muscleActivity: number; // 0.0 to 1.5 (default 1.0)
  curlOverride: number;   // -1 (relax), 0 (auto cycle), +1 (tight curl)
  grabParticle: number;   // -1 when not grabbing
  grabRegion: GrabRegionType;
  grabbedArmIndex: number;
  grabbedStationIndex: number;
  grabTarget: Vec3;
  grabRadius: number;
  /** Moving cohesive body translation offset (x, y, z) */
  bodyOffset: Vec3;
  bodyVelocity: Vec3;
  /** Per-arm suction-cup adhesion state (true = gripping the base, false = popped free / airborne) */
  armSuctionGripping: boolean[];
  /** Anchor XZ coordinates on the studio slab where each arm's suckers are gripping */
  suctionAnchorXZ: Float32Array;
  /** Active jelly squash-and-stretch bounce amplitude when dropped onto the base */
  jellySquash: number;
  jellySquashVel: number;
  /** Smoothly interpolated pose blend weights for Curl Up [0..1] and Let Go [0..1] */
  curlPoseBlend: number;
  relaxPoseBlend: number;
  /** Travelling viscoelastic jelly surface ripple amplitude (excited on release, bounce, or poke) */
  jellyRippleAmp: number;
  /** Per-arm elastic recoil velocity when a stretched arm tip is released */
  armRecoilVel: Float32Array;
  /** Transient event counters for tactile audio & visual feedback */
  justPoppedSuctionCount: number;
  justBouncedImpactSpeed: number;
  /** Simulation-time driven lift-and-drop sequence timer */
  autoLiftTimer: number;
  beads: BaitBead[];
  nextBeadId: number;
  computeBackend: 'WebGPU Compute' | 'WebGL2 XPBD';
}

export interface DeformedArmStation {
  position: Vec3;
  dorsalNormal: Vec3;
  ventralNormal: Vec3;
  binormal: Vec3;
  tangent: Vec3;
  radius: number;
}

function tetSignedVolume(
  pos: Float32Array,
  i0: number,
  i1: number,
  i2: number,
  i3: number
): number {
  const x0 = pos[i0 * 3], y0 = pos[i0 * 3 + 1], z0 = pos[i0 * 3 + 2];
  const x1 = pos[i1 * 3] - x0, y1 = pos[i1 * 3 + 1] - y0, z1 = pos[i1 * 3 + 2] - z0;
  const x2 = pos[i2 * 3] - x0, y2 = pos[i2 * 3 + 1] - y0, z2 = pos[i2 * 3 + 2] - z0;
  const x3 = pos[i3 * 3] - x0, y3 = pos[i3 * 3 + 1] - y0, z3 = pos[i3 * 3 + 2] - z0;

  const cx = y1 * z2 - z1 * y2;
  const cy = z1 * x2 - x1 * z2;
  const cz = x1 * y2 - y1 * x2;
  return (cx * x3 + cy * y3 + cz * z3) / 6.0;
}

/**
 * Human-readable biomechanical label for the currently grabbed region
 */
export function getGrabRegionLabel(
  region: GrabRegionType,
  armIndex: number,
  suctionGripPct: number
): string {
  if (region === 'none') {
    return 'Drag mantle, head, or arm tips · Feel regional jelly & suction response';
  }
  const roman = ['I-R', 'I-L', 'II-R', 'II-L', 'III-R', 'III-L', 'IV-R', 'IV-L'][armIndex] || '';
  switch (region) {
    case 'mantle':
      return suctionGripPct > 0
        ? 'Mantle Sac · Plush Hydrostatic Stretch against Tentacle Suction'
        : 'Mantle Sac · Full Cohesive Lift (Release for Heavy Jelly Bounce)';
    case 'head':
      return suctionGripPct > 0
        ? 'Cranial Dome · Symmetric Skirt Tension & Progressive Suction Peel'
        : 'Cranial Dome · Airborne Canopy Lift (Release to Bounce)';
    case 'arm_proximal':
      return `Arm ${roman} Web/Base · Muscular Hydrostat Bowing & Local Suction Peel`;
    case 'arm_tip':
      return `Arm ${roman} Curled Tip · Elastic Spiral Unwind (Release for Whip Recoil)`;
  }
}

/**
 * Builds the volumetric XPBD tetrahedral and muscular edge cage for the bilayer jelly octopus
 * with differentiated regional viscoelasticity and suction-cup mechanics.
 */
export function createXPBDOctopusState(numArmNodes = 16): XPBDOctopusState {
  const blueprint = buildOctopusAnatomyBlueprint(numArmNodes);

  const pts: Vec3[] = [];
  const invMassList: number[] = [];
  const particleRegions: GrabRegionType[] = [];
  const particleArmList: number[] = [];
  const particleStationList: number[] = [];

  const addParticle = (
    p: Vec3,
    invMass: number,
    region: GrabRegionType,
    armIndex = -1,
    stationIndex = -1
  ): number => {
    const idx = pts.length;
    pts.push({ x: p.x, y: p.y, z: p.z });
    invMassList.push(invMass);
    particleRegions.push(region);
    particleArmList.push(armIndex);
    particleStationList.push(stationIndex);
    return idx;
  };

  // 1. Core body tetrahedral nodes:
  // Head nodes ('head' region: firmer cartilaginous hub uniting all 8 arms)
  const headCoreParticle = addParticle(blueprint.headCenter, 0.45, 'head');
  const headTopParticle = addParticle(
    { x: blueprint.headCenter.x, y: blueprint.headCenter.y + 0.36, z: blueprint.headCenter.z + 0.04 },
    0.58,
    'head'
  );
  const headLeftParticle = addParticle(
    { x: blueprint.headCenter.x + 0.34, y: blueprint.headCenter.y + 0.14, z: blueprint.headCenter.z + 0.14 },
    0.58,
    'head'
  );
  const headRightParticle = addParticle(
    { x: blueprint.headCenter.x - 0.34, y: blueprint.headCenter.y + 0.14, z: blueprint.headCenter.z + 0.14 },
    0.58,
    'head'
  );

  // Big soft mantle leaning back ('mantle' region: plush, fluid-filled gelatinous sac)
  const mantleMidParticle = addParticle(blueprint.mantleCenter, 0.52, 'mantle');
  const mantleTopParticle = addParticle(
    { x: blueprint.mantleCenter.x, y: blueprint.mantleCenter.y + 0.46, z: blueprint.mantleCenter.z - 0.08 },
    0.72,
    'mantle'
  );
  const mantleLeftParticle = addParticle(
    { x: blueprint.mantleCenter.x + 0.46, y: blueprint.mantleCenter.y + 0.05, z: blueprint.mantleCenter.z },
    0.78,
    'mantle'
  );
  const mantleRightParticle = addParticle(
    { x: blueprint.mantleCenter.x - 0.46, y: blueprint.mantleCenter.y + 0.05, z: blueprint.mantleCenter.z },
    0.78,
    'mantle'
  );
  const mantleTipParticle = addParticle(
    { x: blueprint.mantleCenter.x, y: blueprint.mantleCenter.y + 0.18, z: blueprint.mantleCenter.z - 0.62 },
    0.92,
    'mantle'
  );

  // Funnel on the flank (grouped with head/mantle junction)
  const funnelTipParticle = addParticle(blueprint.funnelTip, 0.75, 'head');

  // 2. Arm tetrahedral nodes: 4 particles per capsule station (Dorsal, Ventral, Left, Right)
  // Proximal/mid stations (u < 0.58) -> 'arm_proximal' (suction-gripping muscular hydrostat)
  // Outer third stations (u >= 0.58) -> 'arm_tip' (firmer elastic spiral curl)
  const armNodeParticles: number[][][] = [];

  for (let k = 0; k < 8; k++) {
    const arm = blueprint.arms[k];
    const armIndices: number[][] = [];
    for (let i = 0; i < arm.length; i++) {
      const node = arm[i];
      const r = Math.max(0.03, node.radius * 0.78);
      const invM = 0.55 + node.u * 0.75;
      const region: GrabRegionType = node.u >= 0.58 ? 'arm_tip' : 'arm_proximal';

      const pDorsal = addParticle(
        {
          x: node.position.x + node.dorsalNormal.x * r,
          y: node.position.y + node.dorsalNormal.y * r,
          z: node.position.z + node.dorsalNormal.z * r,
        },
        invM,
        region,
        k,
        i
      );
      const pVentral = addParticle(
        {
          x: node.position.x + node.ventralNormal.x * r,
          y: Math.max(0.012, node.position.y + node.ventralNormal.y * r),
          z: node.position.z + node.ventralNormal.z * r,
        },
        invM,
        region,
        k,
        i
      );
      const pLeft = addParticle(
        {
          x: node.position.x + node.binormal.x * r,
          y: Math.max(0.012, node.position.y + node.binormal.y * r),
          z: node.position.z + node.binormal.z * r,
        },
        invM,
        region,
        k,
        i
      );
      const pRight = addParticle(
        {
          x: node.position.x - node.binormal.x * r,
          y: Math.max(0.012, node.position.y - node.binormal.y * r),
          z: node.position.z - node.binormal.y * 0 - node.binormal.z * r,
        },
        invM,
        region,
        k,
        i
      );

      armIndices.push([pDorsal, pVentral, pLeft, pRight]);
    }
    armNodeParticles.push(armIndices);
  }

  const numParticles = pts.length;
  const positions = new Float32Array(numParticles * 3);
  const prevPositions = new Float32Array(numParticles * 3);
  const restPositions = new Float32Array(numParticles * 3);
  const velocities = new Float32Array(numParticles * 3);
  const invMasses = new Float32Array(invMassList);
  const particleArmIndex = new Int8Array(particleArmList);
  const particleStationIndex = new Int8Array(particleStationList);
  const suctionAnchorXZ = new Float32Array(numParticles * 2);

  for (let i = 0; i < numParticles; i++) {
    positions[i * 3] = pts[i].x;
    positions[i * 3 + 1] = pts[i].y;
    positions[i * 3 + 2] = pts[i].z;
    prevPositions[i * 3] = pts[i].x;
    prevPositions[i * 3 + 1] = pts[i].y;
    prevPositions[i * 3 + 2] = pts[i].z;
    restPositions[i * 3] = pts[i].x;
    restPositions[i * 3 + 1] = pts[i].y;
    restPositions[i * 3 + 2] = pts[i].z;
    suctionAnchorXZ[i * 2] = pts[i].x;
    suctionAnchorXZ[i * 2 + 1] = pts[i].z;
  }

  const edges: XPBDMuscleEdge[] = [];
  const tetras: XPBDCageTetra[] = [];

  const addEdge = (
    i0: number,
    i1: number,
    compliance: number,
    armIndex = -1,
    u = 0,
    flankSide = 0,
    curlBias = 0
  ) => {
    const dx = positions[i1 * 3] - positions[i0 * 3];
    const dy = positions[i1 * 3 + 1] - positions[i0 * 3 + 1];
    const dz = positions[i1 * 3 + 2] - positions[i0 * 3 + 2];
    const restLength = Math.hypot(dx, dy, dz);
    if (restLength > 1e-5) {
      edges.push({
        i0,
        i1,
        restLength,
        compliance,
        armIndex,
        u,
        flankSide,
        curlBias,
      });
    }
  };

  const addTetra = (
    a: number,
    b: number,
    c: number,
    d: number,
    compliance: number
  ) => {
    const v = tetSignedVolume(positions, a, b, c, d);
    if (Math.abs(v) < 1e-6) return;
    if (v < 0) {
      tetras.push({
        i0: a,
        i1: c,
        i2: b,
        i3: d,
        restVolume: -v,
        compliance,
      });
    } else {
      tetras.push({
        i0: a,
        i1: b,
        i2: c,
        i3: d,
        restVolume: v,
        compliance,
      });
    }
  };

  // Connect head & mantle with regionally tuned compliance:
  // Head is a firmer cartilaginous ring (0.00003); Mantle has plush gelatinous shear compliance (0.00018)
  const headNodes = [headCoreParticle, headTopParticle, headLeftParticle, headRightParticle, funnelTipParticle];
  for (let i = 0; i < headNodes.length; i++) {
    for (let j = i + 1; j < headNodes.length; j++) {
      addEdge(headNodes[i], headNodes[j], 0.00003, -1, 0, 0, 0);
    }
  }

  const mantleNodes = [
    mantleMidParticle,
    mantleTopParticle,
    mantleLeftParticle,
    mantleRightParticle,
    mantleTipParticle,
  ];
  for (let i = 0; i < mantleNodes.length; i++) {
    for (let j = i + 1; j < mantleNodes.length; j++) {
      // Plush viscoelastic mantle compliance so the mantle sac squishes and wobbles richly
      addEdge(mantleNodes[i], mantleNodes[j], 0.00018, -1, 0, 0, 0);
    }
  }

  // Cohesive collar edges uniting Head and Mantle
  for (const hNode of headNodes) {
    for (const mNode of mantleNodes) {
      addEdge(hNode, mNode, 0.00008, -1, 0, 0, 0);
    }
  }

  addTetra(headCoreParticle, headTopParticle, headLeftParticle, headRightParticle, 0.00008);
  addTetra(headCoreParticle, mantleMidParticle, headLeftParticle, headTopParticle, 0.00012);
  addTetra(headCoreParticle, headRightParticle, mantleMidParticle, headTopParticle, 0.00012);
  addTetra(mantleMidParticle, mantleTopParticle, mantleLeftParticle, mantleRightParticle, 0.00024);
  addTetra(mantleMidParticle, mantleLeftParticle, mantleTipParticle, mantleTopParticle, 0.00028);
  addTetra(mantleMidParticle, mantleTipParticle, mantleRightParticle, mantleTopParticle, 0.00028);
  addTetra(headCoreParticle, mantleMidParticle, headRightParticle, funnelTipParticle, 0.00014);

  // Connect each arm's tetrahedral prism segments seamlessly into the head/skirt core
  for (let k = 0; k < 8; k++) {
    const arm = blueprint.arms[k];
    const armP = armNodeParticles[k];

    for (const rootStation of [0, 1]) {
      const [rD, rV, rL, rR] = armP[rootStation];
      const junctionComp = rootStation === 0 ? 0.00002 : 0.00006;
      addEdge(headCoreParticle, rD, junctionComp, k, 0, 0, 0);
      addEdge(headCoreParticle, rV, junctionComp, k, 0, 0, 0);
      addEdge(headCoreParticle, rL, junctionComp, k, 0, 0, 0);
      addEdge(headCoreParticle, rR, junctionComp, k, 0, 0, 0);
      addEdge(headTopParticle, rD, junctionComp * 1.5, k, 0, 0, 0);
      addEdge(headLeftParticle, rL, junctionComp * 1.5, k, 0, 0, 0);
      addEdge(headRightParticle, rR, junctionComp * 1.5, k, 0, 0, 0);
      addEdge(mantleMidParticle, rD, junctionComp * 2.0, k, 0, 0, 0);
    }

    for (let i = 0; i < arm.length; i++) {
      const node = arm[i];
      const crossCompliance = 0.00024 / node.stiffnessMultiplier;
      const [d0, v0, l0, r0] = armP[i];

      addEdge(d0, v0, crossCompliance, k, node.u, 0, 0);
      addEdge(l0, r0, crossCompliance, k, node.u, 0, 0);
      addEdge(d0, l0, crossCompliance, k, node.u, -0.5, 0.5);
      addEdge(d0, r0, crossCompliance, k, node.u, 0.5, 0.5);
      addEdge(v0, l0, crossCompliance, k, node.u, -0.5, -0.5);
      addEdge(v0, r0, crossCompliance, k, node.u, 0.5, -0.5);

      if (i < arm.length - 1) {
        const nextNode = arm[i + 1];
        const uMid = 0.5 * (node.u + nextNode.u);
        const stiffMid = 0.5 * (node.stiffnessMultiplier + nextNode.stiffnessMultiplier);
        const longCompliance = 0.00026 / stiffMid;
        const tetCompliance = 0.00020 / stiffMid;

        const [d1, v1, l1, r1] = armP[i + 1];

        addEdge(d0, d1, longCompliance, k, uMid, 0, 1);
        addEdge(v0, v1, longCompliance, k, uMid, 0, -1);
        addEdge(l0, l1, longCompliance, k, uMid, -1, 0);
        addEdge(r0, r1, longCompliance, k, uMid, 1, 0);

        addEdge(d0, l1, longCompliance * 1.1, k, uMid, -0.7, 0.7);
        addEdge(d0, r1, longCompliance * 1.1, k, uMid, 0.7, 0.7);
        addEdge(v0, l1, longCompliance * 1.1, k, uMid, -0.7, -0.7);
        addEdge(v0, r1, longCompliance * 1.1, k, uMid, 0.7, -0.7);
        addEdge(l0, d1, longCompliance * 1.1, k, uMid, -0.7, 0.7);
        addEdge(r0, d1, longCompliance * 1.1, k, uMid, 0.7, 0.7);

        addTetra(d0, v0, l0, d1, tetCompliance);
        addTetra(d0, v0, r0, d1, tetCompliance);
        addTetra(v0, l0, l1, d1, tetCompliance);
        addTetra(v0, r0, r1, d1, tetCompliance);
        addTetra(v0, v1, l1, d1, tetCompliance);
        addTetra(v0, v1, r1, d1, tetCompliance);
      }

      if (i < arm.length - 2) {
        const next2 = arm[i + 2];
        const stiffBend = 0.5 * (node.stiffnessMultiplier + next2.stiffnessMultiplier);
        const bendCompliance = 0.00052 / stiffBend;
        const [d2, v2, l2, r2] = armP[i + 2];
        addEdge(d0, d2, bendCompliance, k, node.u, 0, 1);
        addEdge(v0, v2, bendCompliance, k, node.u, 0, -1);
        addEdge(l0, l2, bendCompliance, k, node.u, -1, 0);
        addEdge(r0, r2, bendCompliance, k, node.u, 1, 0);
      }
    }
  }

  // 3. Interbrachial Web edges joining adjacent arms (stations 0, 1, 2, 3)
  const ringOrder = [0, 1, 3, 5, 7, 6, 4, 2];
  for (let idx = 0; idx < 8; idx++) {
    const kA = ringOrder[idx];
    const kB = ringOrder[(idx + 1) % 8];
    for (const seg of [0, 1, 2, 3]) {
      const pAd = armNodeParticles[kA][seg][0];
      const pBd = armNodeParticles[kB][seg][0];
      const pAv = armNodeParticles[kA][seg][1];
      const pBv = armNodeParticles[kB][seg][1];
      const webComp = seg <= 1 ? 0.00008 : 0.00042;
      addEdge(pAd, pBd, webComp, -1, seg / numArmNodes, 0, 0);
      addEdge(pAv, pBv, webComp, -1, seg / numArmNodes, 0, 0);
    }
  }

  let restTotalVolume = 0;
  for (const t of tetras) {
    restTotalVolume += t.restVolume;
  }

  const baseMassGrams = 1420;

  return {
    blueprint,
    numParticles,
    positions,
    prevPositions,
    restPositions,
    velocities,
    invMasses,
    particleRegions,
    particleArmIndex,
    particleStationIndex,
    armNodeParticles,
    headCoreParticle,
    headTopParticle,
    headLeftParticle,
    headRightParticle,
    mantleTipParticle,
    mantleMidParticle,
    mantleTopParticle,
    mantleLeftParticle,
    mantleRightParticle,
    funnelTipParticle,
    edges,
    tetras,
    restTotalVolume: Math.max(restTotalVolume, 0.01),
    baseMassGrams,
    simTime: 0,
    muscleActivity: 1.0,
    curlOverride: 0,
    grabParticle: -1,
    grabRegion: 'none',
    grabbedArmIndex: -1,
    grabbedStationIndex: -1,
    grabTarget: { x: 0, y: 0, z: 0 },
    grabRadius: 1.15,
    bodyOffset: { x: 0, y: 0, z: 0 },
    bodyVelocity: { x: 0, y: 0, z: 0 },
    armSuctionGripping: [true, true, true, true, true, true, true, true],
    suctionAnchorXZ,
    jellySquash: 0,
    jellySquashVel: 0,
    curlPoseBlend: 0,
    relaxPoseBlend: 0,
    jellyRippleAmp: 0,
    armRecoilVel: new Float32Array(8),
    justPoppedSuctionCount: 0,
    justBouncedImpactSpeed: 0,
    autoLiftTimer: 0,
    beads: [],
    nextBeadId: 1,
    computeBackend: 'WebGL2 XPBD',
  };
}

/**
 * Initiates a grab on particle `particleIdx` and configures region-specific biomechanical parameters.
 */
export function beginRegionGrab(
  state: XPBDOctopusState,
  particleIdx: number,
  target: Vec3
): void {
  if (particleIdx < 0 || particleIdx >= state.numParticles) return;
  state.grabParticle = particleIdx;
  state.grabRegion = state.particleRegions[particleIdx] || 'head';
  state.grabbedArmIndex = state.particleArmIndex[particleIdx];
  state.grabbedStationIndex = state.particleStationIndex[particleIdx];
  state.grabTarget = { ...target };

  // Tune influence radius by anatomical region:
  // - Head: broad canopy influence (1.35)
  // - Mantle: plush visceral sac influence (1.15)
  // - Arm Proximal: mid-range muscular hydrostat influence (0.95)
  // - Arm Tip: focused whip/curl uncoiling influence (0.85)
  switch (state.grabRegion) {
    case 'head':
      state.grabRadius = 1.35;
      break;
    case 'mantle':
      state.grabRadius = 1.15;
      break;
    case 'arm_proximal':
      state.grabRadius = 0.95;
      break;
    case 'arm_tip':
      state.grabRadius = 0.85;
      break;
    default:
      state.grabRadius = 1.15;
  }
}

/**
 * Releases an active grab and triggers region-appropriate elastic recoil & jelly ripple waves.
 */
export function endRegionGrab(state: XPBDOctopusState): void {
  if (state.grabParticle < 0) return;

  // If the user was stretching an arm tip or proximal arm, excite an elastic whip-recoil wave along that arm!
  if (
    (state.grabRegion === 'arm_tip' || state.grabRegion === 'arm_proximal') &&
    state.grabbedArmIndex >= 0
  ) {
    const gp = state.grabParticle;
    const stretchDist = Math.hypot(
      state.positions[gp * 3] - (state.restPositions[gp * 3] + state.bodyOffset.x),
      state.positions[gp * 3 + 1] - (state.restPositions[gp * 3 + 1] + state.bodyOffset.y),
      state.positions[gp * 3 + 2] - (state.restPositions[gp * 3 + 2] + state.bodyOffset.z)
    );
    state.armRecoilVel[state.grabbedArmIndex] = Math.min(2.8, stretchDist * 3.5);
    state.jellyRippleAmp = Math.max(state.jellyRippleAmp, Math.min(0.35, stretchDist * 0.45));
  } else if (state.grabRegion === 'mantle' || state.grabRegion === 'head') {
    // Releasing the mantle or head excites a plush hydrostatic belly ripple
    state.jellyRippleAmp = Math.max(state.jellyRippleAmp, 0.24);
    if (state.bodyOffset.y < 0.08) {
      // If stretched horizontally without full lift-off, snap-jiggle the jelly sac
      state.jellySquashVel += 1.65;
    }
  }

  state.grabParticle = -1;
  state.grabRegion = 'none';
  state.grabbedArmIndex = -1;
  state.grabbedStationIndex = -1;
}

/**
 * Evaluates the instantaneous muscular rest-length strain factor for a given edge:
 * - Pose 0 (Writhe): Phased metachronal sideways bending waves propagating outward along each arm,
 *   with smooth tip attenuation so slender tips never kink.
 * - Pose +1 (Curl Up): Shortens dorsal/curl edges and firms lateral edges to form a tight protective spiral coil.
 * - Pose -1 (Let Go): Releases dorsal curl tension so the outer third unrolls into a wide tabletop drape.
 */
export function evaluateEdgeMuscleStrain(
  edge: XPBDMuscleEdge,
  simTime: number,
  muscleActivity: number,
  curlOverride: number
): number {
  if (edge.armIndex < 0 || muscleActivity <= 0.001) {
    return 1.0;
  }

  const armPhase =
    edge.armIndex * ((Math.PI * 2) / 8) + 0.38 * Math.sin(edge.armIndex * 1.9);

  // Smooth tip window (peaks in mid-arm u ~ 0.48, tapers cleanly to 0 at u=1 so tips never kink)
  const tipSafeEnvelope = Math.sin(Math.pow(edge.u, 0.82) * Math.PI);
  const poseWritheScale = curlOverride > 0.1 ? 0.48 : curlOverride < -0.1 ? 0.58 : 1.0;
  const writheFreq =
    (curlOverride < -0.1 ? 2.05 : 3.25) * (0.85 + 0.25 * Math.min(1.5, muscleActivity));

  // Non-linear muscular recruitment so high strain settings deliver vigorous cephalopod hydrostat contraction
  const actBoost = muscleActivity * (1.0 + 0.36 * muscleActivity);

  const primaryWave = Math.sin(simTime * writheFreq - edge.u * 6.4 + armPhase);
  const secondaryWave = Math.cos(
    simTime * (writheFreq * 1.45) - edge.u * 9.2 - armPhase * 0.6
  );
  const writheWave = primaryWave * 0.76 + secondaryWave * 0.24;
  const lateralEnvelope = tipSafeEnvelope * 0.21 * actBoost * poseWritheScale;
  const lateralStrain = edge.flankSide * writheWave * lateralEnvelope;

  let curlCycle =
    0.35 +
    0.65 * Math.sin(simTime * 1.65 - edge.u * 2.8 + armPhase * 0.7);
  if (curlOverride > 0.1) {
    curlCycle = 1.25;
  } else if (curlOverride < -0.1) {
    curlCycle = -0.92;
  }
  const outerWeight =
    Math.max(0, (edge.u - 0.26) / 0.74) * (1 - 0.32 * Math.pow(edge.u, 3));
  const archWave = Math.sin(simTime * (writheFreq * 0.92) - edge.u * 5.4 + armPhase + 0.85);
  const archStrain = edge.curlBias * archWave * tipSafeEnvelope * 0.14 * actBoost * poseWritheScale;
  const curlStrain = -edge.curlBias * curlCycle * outerWeight * 0.20 * actBoost + archStrain;

  return Math.max(0.68, Math.min(1.32, 1.0 + lateralStrain + curlStrain));
}

/**
 * Advances the cohesive XPBD tetrahedral soft-body simulation by `dt` seconds:
 * - Region-specific biomechanical & viscoelastic jelly force response ('mantle', 'head', 'arm_proximal', 'arm_tip')
 * - Optimized 3-pose kinematics ('Writhe', 'Curl Up', 'Let Go') with smooth blend transitions
 * - Cross-section & anti-clipping regularization so tentacle tips never deform irregularly or clip
 */
export function stepXPBDOctopus(state: XPBDOctopusState, dt: number): void {
  const clampedDt = Math.min(dt, 0.033);
  if (clampedDt <= 1e-5) return;

  state.simTime += clampedDt;
  state.justPoppedSuctionCount = 0;
  state.justBouncedImpactSpeed = 0;

  // Smoothly interpolate pose blend weights for Curl Up (+1) and Let Go (-1)
  const targetCurlBlend = state.curlOverride > 0.1 ? 1.0 : 0.0;
  const targetRelaxBlend = state.curlOverride < -0.1 ? 1.0 : 0.0;
  const poseRate = 1 - Math.exp(-5.5 * clampedDt);
  state.curlPoseBlend += (targetCurlBlend - state.curlPoseBlend) * poseRate;
  state.relaxPoseBlend += (targetRelaxBlend - state.relaxPoseBlend) * poseRate;

  // Decay travelling jelly surface ripple & per-arm elastic recoil waves
  state.jellyRippleAmp *= Math.exp(-3.4 * clampedDt);
  for (let k = 0; k < 8; k++) {
    state.armRecoilVel[k] *= Math.exp(-4.2 * clampedDt);
  }

  // Handle simulation-time driven Lift & Jelly Bounce sequence
  if (state.autoLiftTimer > 0) {
    state.autoLiftTimer -= clampedDt;
    if (state.grabParticle < 0) {
      beginRegionGrab(state, state.headTopParticle, { x: 0, y: 1.95, z: 0.02 });
    } else {
      state.grabTarget = { x: 0, y: 1.95, z: 0.02 };
    }
    if (state.autoLiftTimer <= 0) {
      state.autoLiftTimer = 0;
      endRegionGrab(state);
    }
  }

  const substeps = 5;
  const h = clampedDt / substeps;
  const h2 = h * h;
  const gravityY = -16.5;

  const pos = state.positions;
  const prev = state.prevPositions;
  const rest = state.restPositions;
  const vel = state.velocities;
  const invM = state.invMasses;
  const n = state.numParticles;

  // 1. Update bait beads on the studio table
  for (const bead of state.beads) {
    bead.velocity.y += gravityY * clampedDt;
    bead.position.x += bead.velocity.x * clampedDt;
    bead.position.y += bead.velocity.y * clampedDt;
    bead.position.z += bead.velocity.z * clampedDt;

    if (bead.position.y < bead.radius) {
      bead.position.y = bead.radius;
      if (bead.velocity.y < -0.25) {
        bead.velocity.y = -bead.velocity.y * 0.24;
      } else {
        bead.velocity.y = 0;
        bead.settled = true;
      }
      bead.velocity.x *= Math.exp(-5.5 * clampedDt);
      bead.velocity.z *= Math.exp(-5.5 * clampedDt);
    }
  }

  // 2. Differentiated Regional Force Response & Progressive Suction-Cup Peeling
  if (state.grabParticle >= 0 && state.grabParticle < n) {
    const gp = state.grabParticle;
    const region = state.grabRegion;
    const grabbedArm = state.grabbedArmIndex;

    const desiredOffsetX = state.grabTarget.x - rest[gp * 3];
    const desiredOffsetY = Math.max(0, state.grabTarget.y - rest[gp * 3 + 1]);
    const desiredOffsetZ = state.grabTarget.z - rest[gp * 3 + 2];

    const pullForceDist = Math.hypot(
      desiredOffsetX - state.bodyOffset.x,
      desiredOffsetY - state.bodyOffset.y,
      desiredOffsetZ - state.bodyOffset.z
    );

    // Region-specific suction breakaway & whole-body coupling:
    // - Grabbing an ARM TIP ('arm_tip') uncoils and stretches that arm first without immediately lifting the whole body,
    //   unless pulled very high/far (> 0.72)!
    // - Grabbing a PROXIMAL ARM ('arm_proximal') peels that specific arm's suction cups first, then adjacent arms!
    // - Grabbing the MANTLE ('mantle') or HEAD ('head') peels suction cups progressively across all 8 arms
    //   as upward/lateral tension builds, then lifts the entire octopus off the slab!
    for (let k = 0; k < 8; k++) {
      if (state.armSuctionGripping[k]) {
        const armRoot = state.armNodeParticles[k][2][1];
        const stretchFromAnchor = Math.hypot(
          pos[armRoot * 3] - state.suctionAnchorXZ[armRoot * 2],
          pos[armRoot * 3 + 1] - 0.02,
          pos[armRoot * 3 + 2] - state.suctionAnchorXZ[armRoot * 2 + 1]
        );

        // Progressive peel threshold per arm:
        // When pulling a single arm ('arm_tip' or 'arm_proximal'), the grabbed arm peels first while the other 7 arms
        // anchor the body firmly against the tabletop unless pulled very high/far.
        let liftBreakThreshold = 0.32;
        let pullBreakThreshold = 0.42;
        if (region === 'arm_tip') {
          liftBreakThreshold = k === grabbedArm ? 0.42 : 1.15;
          pullBreakThreshold = k === grabbedArm ? 0.58 : 1.35;
        } else if (region === 'arm_proximal') {
          liftBreakThreshold = k === grabbedArm ? 0.24 : 0.72;
          pullBreakThreshold = k === grabbedArm ? 0.34 : 0.92;
        } else if (region === 'mantle') {
          const rearBias = -(Math.floor(k / 2) * 0.025);
          liftBreakThreshold = 0.30 + rearBias;
          pullBreakThreshold = 0.40 + rearBias;
        }

        if (
          desiredOffsetY > liftBreakThreshold ||
          pullForceDist > pullBreakThreshold ||
          (k === grabbedArm && stretchFromAnchor > 0.30)
        ) {
          state.armSuctionGripping[k] = false;
          state.justPoppedSuctionCount++;
        }
      }
    }

    const grippingCount = state.armSuctionGripping.filter(Boolean).length;
    const gripResistance = grippingCount / 8;

    // Region-specific whole-body translation coupling:
    // Pulling an arm tip mostly deforms that arm while the body stays anchored by the remaining 7 arms;
    // pulling the head or mantle moves the whole body strongly once suction cups peel free.
    const regionBodyCoupling =
      region === 'arm_tip'
        ? 0.28
        : region === 'arm_proximal'
        ? 0.62
        : 1.0;

    const followRate =
      1 - Math.exp(-(26.0 - gripResistance * 18.0) * regionBodyCoupling * clampedDt);
    const prevOffsetY = state.bodyOffset.y;
    state.bodyOffset.x +=
      (desiredOffsetX * regionBodyCoupling * (1 - gripResistance * 0.55) - state.bodyOffset.x) *
      followRate;
    state.bodyOffset.y +=
      (desiredOffsetY * regionBodyCoupling * (1 - gripResistance * 0.65) - state.bodyOffset.y) *
      followRate;
    state.bodyOffset.z +=
      (desiredOffsetZ * regionBodyCoupling * (1 - gripResistance * 0.55) - state.bodyOffset.z) *
      followRate;
    state.bodyVelocity.y = (state.bodyOffset.y - prevOffsetY) / clampedDt;

    state.jellySquash = Math.max(-0.26, -state.bodyOffset.y * 0.16);
    state.jellySquashVel = 0;
  } else {
    // Released! Whole octopus falls under gravity and bounces elastically on the studio base!
    if (state.bodyOffset.y > 0.001 || Math.abs(state.bodyVelocity.y) > 0.02) {
      state.bodyVelocity.y += gravityY * clampedDt;
      state.bodyOffset.y += state.bodyVelocity.y * clampedDt;
      state.bodyOffset.x *= Math.exp(-1.8 * clampedDt);
      state.bodyOffset.z *= Math.exp(-1.8 * clampedDt);

      // Impact with studio base -> trigger multi-bounce jelly restitution & squash-and-stretch!
      if (state.bodyOffset.y <= 0) {
        state.bodyOffset.y = 0;
        if (state.bodyVelocity.y < -0.28) {
          const impactSpeed = -state.bodyVelocity.y;
          state.justBouncedImpactSpeed = impactSpeed;
          state.jellySquashVel += impactSpeed * 2.8;
          state.jellyRippleAmp = Math.min(0.45, state.jellyRippleAmp + impactSpeed * 0.08);
          // Elastic bounce restitution (~0.62) so it visibly bounces 3-4 times on the base!
          state.bodyVelocity.y = impactSpeed * 0.62;
        } else {
          state.bodyVelocity.y = 0;
        }
      }
    } else {
      state.bodyOffset.y = 0;
      state.bodyVelocity.y = 0;
      state.bodyOffset.x *= Math.exp(-1.5 * clampedDt);
      state.bodyOffset.z *= Math.exp(-1.5 * clampedDt);

      // Re-engage suction-cup grip once settled back on the base
      if (Math.abs(state.jellySquash) < 0.06) {
        for (let k = 0; k < 8; k++) {
          if (!state.armSuctionGripping[k]) {
            state.armSuctionGripping[k] = true;
            const armP = state.armNodeParticles[k];
            for (let s = 1; s <= 9; s++) {
              const vIdx = armP[s][1];
              state.suctionAnchorXZ[vIdx * 2] = pos[vIdx * 3];
              state.suctionAnchorXZ[vIdx * 2 + 1] = pos[vIdx * 3 + 2];
            }
          }
        }
      }
    }

    // Underdamped harmonic jelly squash-and-stretch oscillation
    const squashOmega = 25.0;
    const squashDamping = 3.6;
    const squashAccel =
      -squashOmega * squashOmega * state.jellySquash - squashDamping * state.jellySquashVel;
    state.jellySquashVel += squashAccel * clampedDt;
    state.jellySquash = Math.max(
      -0.36,
      Math.min(0.44, state.jellySquash + state.jellySquashVel * clampedDt)
    );
  }

  const isAirborneOrBouncing =
    state.bodyOffset.y > 0.02 || Math.abs(state.jellySquash) > 0.025 || Math.abs(state.bodyVelocity.y) > 0.1;
  const velocityDamping = Math.exp((isAirborneOrBouncing ? -1.4 : -2.6) * h);

  // Volume-preserving jelly squash scaling around the moving body frame
  const squashY = Math.max(0.62, 1.0 - state.jellySquash * 0.62);
  const squashXZ = 1.0 / Math.sqrt(squashY);

  const curlB = state.curlPoseBlend;
  const relaxB = state.relaxPoseBlend;
  const writheB = Math.max(0, 1.0 - curlB * 0.62 - relaxB * 0.48);
  const strainDrive = state.muscleActivity * (0.88 + 0.42 * state.muscleActivity);

  for (let step = 0; step < substeps; step++) {
    const breathFreq = 2.15 + 0.55 * Math.min(1.5, state.muscleActivity);
    const breathWave = Math.sin(state.simTime * breathFreq) * 0.065 * strainDrive;
    const headSwayX =
      Math.sin(state.simTime * 1.95) * 0.028 * strainDrive * writheB;
    const headSwayZ =
      Math.cos(state.simTime * 1.55) * 0.026 * strainDrive * writheB;
    const headBobY =
      Math.sin(state.simTime * 3.1 + 0.6) * 0.018 * strainDrive * writheB;

    // 1. Predict particle positions relative to the cohesive moving body frame with supple graded tentacle compliance
    for (let i = 0; i < n; i++) {
      const idx = i * 3;
      prev[idx] = pos[idx];
      prev[idx + 1] = pos[idx + 1];
      prev[idx + 2] = pos[idx + 2];

      if (invM[i] <= 0) continue;

      const pRegion = state.particleRegions[i];
      const pArm = state.particleArmIndex[i];
      const pStation = state.particleStationIndex[i];

      // Propagating jelly surface ripple wave (adds lush stress-relieving secondary motion across mantle & arms)
      const radialDist = Math.hypot(rest[idx], rest[idx + 2]);
      const rippleWave =
        state.jellyRippleAmp > 0.002
          ? Math.sin(state.simTime * 20.0 - radialDist * 6.0) * state.jellyRippleAmp * 0.055
          : 0;

      const targetRestX =
        rest[idx] * squashXZ + state.bodyOffset.x + (pArm < 0 ? headSwayX : 0);
      const targetRestY =
        rest[idx + 1] * squashY + state.bodyOffset.y + rippleWave + (pArm < 0 ? headBobY : 0);
      const targetRestZ =
        rest[idx + 2] * squashXZ + state.bodyOffset.z + (pArm < 0 ? headSwayZ : 0);

      // Biologically graded posture stiffness:
      // - Head is a firmer cartilaginous collar (1.15x)
      // - Mantle is a plush, fluid-filled gelatinous sac (0.72x)
      // - Tentacles relax their static world-space tether as `muscleActivity` increases so Step 2's
      //   active biological writhing wave drives the arms without fighting static rest springs!
      let regionStiffMult = 1.0;
      if (pRegion === 'mantle') {
        regionStiffMult = 0.72;
      } else if (pRegion === 'head') {
        regionStiffMult = 1.15;
      } else if (pArm >= 0 && pStation >= 0) {
        const uSt = pStation / 15;
        if (pArm === state.grabbedArmIndex) {
          regionStiffMult = pStation === 0 ? 0.65 : Math.max(0.02, 0.32 * Math.pow(1 - uSt, 2.4));
        } else {
          const activeWritheRelease =
            pStation === 0
              ? 1.0
              : 1.0 / (1.0 + 1.85 * state.muscleActivity * (0.45 + 0.55 * writheB));
          regionStiffMult =
            (0.68 * Math.pow(1 - uSt * 0.72, 1.35) + 0.06) * activeWritheRelease;
        }
      }

      const basePostureStiff =
        (isAirborneOrBouncing ? 30.0 : state.grabParticle >= 0 ? 26.0 : 16.5) * regionStiffMult;

      const fx = (targetRestX - pos[idx]) * basePostureStiff;
      const fy = (targetRestY - pos[idx + 1]) * (basePostureStiff * 1.25);
      const fz = (targetRestZ - pos[idx + 2]) * basePostureStiff;

      vel[idx] = (vel[idx] + fx * h) * velocityDamping;
      vel[idx + 1] = (vel[idx + 1] + fy * h) * velocityDamping;
      vel[idx + 2] = (vel[idx + 2] + fz * h) * velocityDamping;

      pos[idx] += vel[idx] * h;
      pos[idx + 1] += vel[idx + 1] * h;
      pos[idx + 2] += vel[idx + 2] * h;
    }

    // Organic mantle hydrostat ventilation & siphon jet pulse coupled to strain
    pos[state.mantleMidParticle * 3 + 1] += breathWave * h * 4.2;
    pos[state.mantleTopParticle * 3 + 1] += breathWave * h * 3.8;
    pos[state.mantleTipParticle * 3 + 2] -= breathWave * h * 4.5;
    pos[state.funnelTipParticle * 3] += breathWave * h * 4.8;

    // 2. Three Optimized Poses ("Writhe", "Curl Up", "Let Go") + Rich Biological Writhing + Suction Stepping + Bait Reach
    const waveFreqScale = 0.85 + 0.32 * Math.min(1.5, state.muscleActivity);

    for (let k = 0; k < 8; k++) {
      const arm = state.blueprint.arms[k];
      const armP = state.armNodeParticles[k];
      // Asynchronous metachronal phase offset so adjacent arms weave and undulate organically
      const armPhase = k * ((Math.PI * 2) / 8) + 0.42 * Math.sin(k * 2.1);
      const isGripping = state.armSuctionGripping[k];
      const recoilAmp = state.armRecoilVel[k];
      const isGrabbedArm = k === state.grabbedArmIndex;

      const tipNode = arm[arm.length - 1];
      let nearestBead: BaitBead | null = null;
      let minBeadDist = 1.65;
      for (const bead of state.beads) {
        const d = Math.hypot(
          bead.position.x - (tipNode.position.x + state.bodyOffset.x),
          bead.position.z - (tipNode.position.z + state.bodyOffset.z)
        );
        if (d < minBeadDist) {
          minBeadDist = d;
          nearestBead = bead;
        }
      }

      for (let s = 1; s < arm.length; s++) {
        const node = arm[s];
        const u = node.u;
        // Tip-safe bell envelope: zero at root (u=0), strong across mid and outer arm, and smooth at the tip (u=1)
        const tipSafeBell = Math.sin(Math.pow(u, 0.76) * Math.PI) * (1.0 - 0.14 * u * u);

        // Pose 1 ("Writhe"): Multi-harmonic metachronal serpentine sweep + traveling peristaltic arch + radial reach
        const waveSpeed = (3.15 - relaxB * 1.05) * waveFreqScale;
        const primaryWave = Math.sin(state.simTime * waveSpeed - u * 6.0 + armPhase);
        const harmonicWave = Math.cos(
          state.simTime * (waveSpeed * 1.55) - u * 8.8 - armPhase * 0.65
        );
        const exploratorySweep = Math.sin(
          state.simTime * (waveSpeed * 0.42) - u * 2.4 + armPhase * 1.35
        );
        const writheLateral =
          (primaryWave * 0.64 + harmonicWave * 0.22 + exploratorySweep * 0.34) *
          tipSafeBell *
          0.44 *
          writheB *
          strainDrive;

        // Traveling peristaltic muscular arch ("stepping wave") lifting sections of the arm off the table
        const archWave = Math.sin(state.simTime * (waveSpeed * 0.92) - u * 5.4 + armPhase + 0.85);
        const writheLift =
          Math.pow(Math.max(0, 0.52 + 0.48 * archWave), 1.35) *
          Math.sin(Math.pow(u, 0.78) * Math.PI) *
          0.21 *
          writheB *
          strainDrive;

        // Rhythmic radial reaching & coiling pulse along the arm's azimuth axis during writhing
        const writheRadial =
          Math.sin(state.simTime * (waveSpeed * 0.68) - u * 4.1 + armPhase * 0.85) *
          Math.pow(u, 0.82) *
          0.22 *
          writheB *
          strainDrive;

        // Elastic whip-recoil oscillation when a stretched arm tip is released
        const recoilWave =
          recoilAmp > 0.01
            ? Math.sin(state.simTime * 16.0 - u * 6.8) * recoilAmp * tipSafeBell * 0.08
            : 0;

        // Pose 2 ("Curl Up") + Dynamic Helical Tip Coiling/Uncoiling during Writhe
        const grabUncoilDamp = isGrabbedArm ? 0.04 : 1.0;
        const curlEnvelope = Math.max(0, (u - 0.26) / 0.74) * grabUncoilDamp;
        const autoCurlPulse =
          (0.18 + 0.56 * Math.sin(state.simTime * 1.85 - u * 2.6 + armPhase * 0.75)) * writheB;
        const activeCurlStrength = curlB * 1.15 * Math.max(0.65, state.muscleActivity) + autoCurlPulse * strainDrive;
        const curlUpLift = curlEnvelope * (1.0 - 0.22 * u) * 0.26 * activeCurlStrength;
        const curlInwardPull = curlEnvelope * Math.sin(u * Math.PI * 0.85) * 0.24 * activeCurlStrength;

        // Pose 3 ("Let Go"): Relaxed radial drape — uncurls the elevated outer third down toward the platter & spreads outward
        const relaxEnvelope = Math.max(0, (u - 0.45) / 0.55);
        const relaxDrop =
          -relaxEnvelope * Math.max(0, node.position.y - (node.radius + 0.025)) * 0.72 * relaxB;
        const relaxOutwardSpread = relaxEnvelope * 0.28 * relaxB;

        // When airborne, tentacles trail downward smoothly under gravity
        const airborneDroop =
          state.bodyOffset.y > 0.12 ? -Math.min(0.24, state.bodyOffset.y * 0.20) * u : 0;

        let reachX = 0;
        let reachY = 0;
        let reachZ = 0;
        if (nearestBead && u > 0.35 && state.bodyOffset.y < 0.25 && curlB < 0.5 && !isGrabbedArm) {
          const reachWeight = ((u - 0.35) / 0.65) * 0.38 * (1 - u * 0.25);
          reachX = (nearestBead.position.x - (node.position.x + state.bodyOffset.x)) * reachWeight;
          reachY =
            (nearestBead.position.y + 0.06 - (node.position.y + state.bodyOffset.y)) *
            reachWeight *
            0.55;
          reachZ = (nearestBead.position.z - (node.position.z + state.bodyOffset.z)) * reachWeight;
        }

        const totalLateral = (writheLateral + recoilWave) * grabUncoilDamp;
        const radialShift = relaxOutwardSpread + writheRadial - curlInwardPull;
        const radialDirX = node.position.x / (Math.hypot(node.position.x, node.position.z) || 1);
        const radialDirZ = node.position.z / (Math.hypot(node.position.x, node.position.z) || 1);

        const targetOffsetX =
          node.binormal.x * totalLateral + radialDirX * radialShift + reachX;
        const targetOffsetY =
          Math.max(
            -(node.position.y - node.radius - 0.015),
            writheLift + curlUpLift + relaxDrop + airborneDroop
          ) + reachY;
        const targetOffsetZ =
          node.binormal.z * totalLateral + radialDirZ * radialShift + reachZ;

        // Responsive muscular hydrostat pose drive (scales with muscleActivity so high strain writhing is vivid)
        const driveGain =
          Math.min(0.58, (18.5 + 8.5 * state.muscleActivity - 4.5 * u) * h) * grabUncoilDamp;
        for (const pIdx of armP[s]) {
          const baseX = rest[pIdx * 3] * squashXZ + state.bodyOffset.x + targetOffsetX;
          const baseY = rest[pIdx * 3 + 1] * squashY + state.bodyOffset.y + targetOffsetY;
          const baseZ = rest[pIdx * 3 + 2] * squashXZ + state.bodyOffset.z + targetOffsetZ;
          const dx = (baseX - pos[pIdx * 3]) * driveGain;
          const dy = (baseY - pos[pIdx * 3 + 1]) * driveGain;
          const dz = (baseZ - pos[pIdx * 3 + 2]) * driveGain;
          pos[pIdx * 3] += dx;
          pos[pIdx * 3 + 1] += dy;
          pos[pIdx * 3 + 2] += dz;
          prev[pIdx * 3] += dx * 0.45;
          prev[pIdx * 3 + 1] += dy * 0.45;
          prev[pIdx * 3 + 2] += dz * 0.45;
        }

        // Travelling Suction-Cup Grip against the studio base for proximal/mid ventral suckers (s = 2..8):
        // When a peristaltic arch wave (`writheLift`) lifts a section of the arm during high-strain writhing,
        // the ventral suckers at that station temporarily release and step laterally with the wave!
        if (isGripping && !isGrabbedArm && s >= 2 && s <= 8) {
          const vIdx = armP[s][1];
          const archRelease = Math.max(0.16, 1.0 - writheLift * 3.4);
          const suctionRate =
            (1 - (s - 2) / 8) * (10.5 - relaxB * 4.0) * archRelease * h;
          const waveGlide = Math.min(0.92, 0.52 + 0.34 * state.muscleActivity);
          const anchorX = state.suctionAnchorXZ[vIdx * 2] + targetOffsetX * waveGlide;
          const anchorZ = state.suctionAnchorXZ[vIdx * 2 + 1] + targetOffsetZ * waveGlide;
          const targetSuckerY = 0.016 + writheLift * 0.72;
          const sdx = (anchorX - pos[vIdx * 3]) * suctionRate;
          const sdy = (targetSuckerY - pos[vIdx * 3 + 1]) * (suctionRate * 1.25);
          const sdz = (anchorZ - pos[vIdx * 3 + 2]) * suctionRate;
          pos[vIdx * 3] += sdx;
          pos[vIdx * 3 + 1] += sdy;
          pos[vIdx * 3 + 2] += sdz;
          prev[vIdx * 3] += sdx * 0.65;
          prev[vIdx * 3 + 1] += sdy * 0.65;
          prev[vIdx * 3 + 2] += sdz * 0.65;
        }
      }
    }

    // 3. Time-Continuous Regional Dragging & Smooth Quadratic Bezier Biological Arching
    if (state.grabParticle >= 0 && state.grabParticle < n) {
      const gp = state.grabParticle;
      const gx = rest[gp * 3];
      const gy = rest[gp * 3 + 1];
      const gz = rest[gp * 3 + 2];

      const rawDispX = state.grabTarget.x - pos[gp * 3];
      const rawDispY = state.grabTarget.y - pos[gp * 3 + 1];
      const rawDispZ = state.grabTarget.z - pos[gp * 3 + 2];
      const rawLen = Math.hypot(rawDispX, rawDispY, rawDispZ);

      const maxLocalStretch =
        state.grabRegion === 'arm_tip'
          ? 0.95
          : state.grabRegion === 'arm_proximal'
          ? 0.75
          : 0.55;
      const clampScale = rawLen > maxLocalStretch ? maxLocalStretch / rawLen : 1.0;

      // Time-continuous substep convergence rate (prevents per-substep position teleportation & XPBD velocity spikes)
      const substepFollow = 1.0 - Math.exp(-22.0 * h);
      const dispX = rawDispX * clampScale * substepFollow;
      const dispY = rawDispY * clampScale * substepFollow;
      const dispZ = rawDispZ * clampScale * substepFollow;

      const baseCoupling =
        state.grabRegion === 'arm_tip'
          ? 0.08
          : state.grabRegion === 'arm_proximal'
          ? 0.16
          : 0.24;

      const grabArm = state.grabbedArmIndex;
      const grabS = Math.max(1, state.grabbedStationIndex);

      // If dragging a tentacle (arm_tip or arm_proximal), construct a quadrature-phase 3D elliptical biological arch
      // from the arm's live collar root (s=0) to the dragged target!
      // By pairing sin(2*pi*t) outward reach with sin(pi*t) upward/lateral arch, the tangent speed never vanishes at the apex (s=6..8),
      // eliminating mid-arm folding when dragging inward toward the center while uncoiling tautly when dragging outward.
      if (grabArm >= 0) {
        const bpArm = state.blueprint.arms[grabArm];
        const armP = state.armNodeParticles[grabArm];
        const [rD, rV, rL, rR] = armP[0];
        const rootX = 0.25 * (pos[rD * 3] + pos[rV * 3] + pos[rL * 3] + pos[rR * 3]);
        const rootY = 0.25 * (pos[rD * 3 + 1] + pos[rV * 3 + 1] + pos[rL * 3 + 1] + pos[rR * 3 + 1]);
        const rootZ = 0.25 * (pos[rD * 3 + 2] + pos[rV * 3 + 2] + pos[rL * 3 + 2] + pos[rR * 3 + 2]);

        // Compute rest arc length from s=0 to s=grabS
        let arcLenToGrab = 0;
        for (let s = 1; s <= grabS; s++) {
          arcLenToGrab += Math.hypot(
            bpArm[s].position.x - bpArm[s - 1].position.x,
            bpArm[s].position.y - bpArm[s - 1].position.y,
            bpArm[s].position.z - bpArm[s - 1].position.z
          );
        }

        // Clamp target within maximum physiological reach from root
        let endX = state.grabTarget.x;
        let endY = Math.max(0.08, state.grabTarget.y);
        let endZ = state.grabTarget.z;
        const chordDx = endX - rootX;
        const chordDy = endY - rootY;
        const chordDz = endZ - rootZ;
        const chordDist = Math.hypot(chordDx, chordDy, chordDz) || 1e-4;
        const maxReach = arcLenToGrab * 1.18;
        if (chordDist > maxReach) {
          const sReach = maxReach / chordDist;
          endX = rootX + chordDx * sReach;
          endY = rootY + chordDy * sReach;
          endZ = rootZ + chordDz * sReach;
        }

        const clampedChordDist = Math.min(chordDist, maxReach);
        // Excess slack when the tentacle is brought inward toward the center or coiled closer than its arc length
        const excessSlack = Math.max(0, arcLenToGrab - clampedChordDist);
        const slackRatio = Math.min(1.0, excessSlack / Math.max(0.4, arcLenToGrab));

        // Quadrature-phase elliptical loop amplitudes:
        // - sin(2*pi*t) carries the proximal half smoothly outward along rootTan before sweeping back inward at the apex
        // - sin(pi*t) lifts the mid-arm upward (+Y) and laterally (+rootBin) so velocity at t=0.5 is horizontal & non-zero!
        const rootTan = bpArm[0].tangent;
        const rootBin = bpArm[0].binormal;
        const outSweepAmp = 0.08 * arcLenToGrab + excessSlack * 0.24;
        const upArchAmp = 0.05 + excessSlack * 0.36;
        const latArchAmp = excessSlack * 0.22;

        const evalArchPos = (t: number) => {
          const sBlend = 0.5 * (1 - Math.cos(Math.PI * t));
          const sinPi = Math.sin(Math.PI * t);
          const sin2Pi = Math.sin(2 * Math.PI * t);

          const x =
            rootX +
            (endX - rootX) * sBlend +
            rootTan.x * outSweepAmp * sin2Pi +
            rootBin.x * latArchAmp * sinPi;
          const y =
            rootY +
            (endY - rootY) * sBlend +
            upArchAmp * sinPi +
            0.04 * slackRatio * sin2Pi;
          const z =
            rootZ +
            (endZ - rootZ) * sBlend +
            rootTan.z * outSweepAmp * sin2Pi +
            rootBin.z * latArchAmp * sinPi;
          return { x, y, z };
        };

        const pBeforeEnd = evalArchPos(Math.max(0, (grabS - 1) / grabS));
        const pAtEnd = evalArchPos(1.0);
        let arrTx = pAtEnd.x - pBeforeEnd.x;
        let arrTy = pAtEnd.y - pBeforeEnd.y;
        let arrTz = pAtEnd.z - pBeforeEnd.z;
        const arrLen = Math.hypot(arrTx, arrTy, arrTz) || 1;
        arrTx /= arrLen;
        arrTy /= arrLen;
        arrTz /= arrLen;

        const armFollow = 1.0 - Math.exp(-22.0 * h);
        let distAccum = 0;

        for (let s = 1; s < bpArm.length; s++) {
          let targetCx = 0;
          let targetCy = 0;
          let targetCz = 0;

          if (s <= grabS) {
            const pt = evalArchPos(s / grabS);
            targetCx = pt.x;
            targetCy = Math.max(bpArm[s].radius + 0.02, pt.y);
            targetCz = pt.z;
          } else {
            const segLen = Math.hypot(
              bpArm[s].position.x - bpArm[s - 1].position.x,
              bpArm[s].position.y - bpArm[s - 1].position.y,
              bpArm[s].position.z - bpArm[s - 1].position.z
            );
            distAccum += segLen;
            targetCx = endX + arrTx * distAccum;
            targetCy = Math.max(bpArm[s].radius + 0.02, endY + arrTy * distAccum);
            targetCz = endZ + arrTz * distAccum;
          }

          const [pD, pV, pL, pR] = armP[s];
          const curCx = 0.25 * (pos[pD * 3] + pos[pV * 3] + pos[pL * 3] + pos[pR * 3]);
          const curCy = 0.25 * (pos[pD * 3 + 1] + pos[pV * 3 + 1] + pos[pL * 3 + 1] + pos[pR * 3 + 1]);
          const curCz = 0.25 * (pos[pD * 3 + 2] + pos[pV * 3 + 2] + pos[pL * 3 + 2] + pos[pR * 3 + 2]);

          const stationWeight = s <= grabS ? 0.65 + 0.35 * (s / grabS) : Math.exp(-0.10 * (s - grabS));
          const sx = (targetCx - curCx) * armFollow * stationWeight;
          const sy = (targetCy - curCy) * armFollow * stationWeight;
          const sz = (targetCz - curCz) * armFollow * stationWeight;

          for (const pIdx of armP[s]) {
            pos[pIdx * 3] += sx;
            pos[pIdx * 3 + 1] += sy;
            pos[pIdx * 3 + 2] += sz;
            prev[pIdx * 3] += sx * 0.80;
            prev[pIdx * 3 + 1] += sy * 0.80;
            prev[pIdx * 3 + 2] += sz * 0.80;
          }
        }
      }

      // Apply cohesive body/web coupling to particles not on the grabbed arm (or all particles when grabbing head/mantle)
      for (let i = 0; i < n; i++) {
        if (grabArm >= 0 && state.particleArmIndex[i] === grabArm) continue;

        const dRest = Math.hypot(
          rest[i * 3] - gx,
          rest[i * 3 + 1] - gy,
          rest[i * 3 + 2] - gz
        );
        const localFalloff =
          dRest < state.grabRadius
            ? Math.pow(1 - dRest / state.grabRadius, 1.35)
            : 0;
        const pull = Math.min(0.85, baseCoupling + 0.58 * localFalloff);

        const shiftX = dispX * pull;
        const shiftY = dispY * pull;
        const shiftZ = dispZ * pull;

        pos[i * 3] += shiftX;
        pos[i * 3 + 1] += shiftY;
        pos[i * 3 + 2] += shiftZ;
        prev[i * 3] += shiftX * 0.75;
        prev[i * 3 + 1] += shiftY * 0.75;
        prev[i * 3 + 2] += shiftZ * 0.75;
      }
    }

    // 4. Solve XPBD Muscular & Structural Edge Distance Constraints (2 iterations for rock-solid cohesion)
    for (let iter = 0; iter < 2; iter++) {
      for (let eIdx = 0; eIdx < state.edges.length; eIdx++) {
        const e = state.edges[eIdx];
        const i0 = e.i0;
        const i1 = e.i1;
        const w0 = invM[i0];
        const w1 = invM[i1];
        const wSum = w0 + w1;
        if (wSum <= 0) continue;

        const dx = pos[i1 * 3] - pos[i0 * 3];
        const dy = pos[i1 * 3 + 1] - pos[i0 * 3 + 1];
        const dz = pos[i1 * 3 + 2] - pos[i0 * 3 + 2];
        const len = Math.hypot(dx, dy, dz);
        if (len < 1e-6) continue;

        // Reduce muscular curl strain on the actively dragged arm so its outer third uncoils smoothly
        const edgeAct =
          e.armIndex >= 0 && e.armIndex === state.grabbedArmIndex
            ? state.muscleActivity * 0.08
            : state.muscleActivity;

        const strain = evaluateEdgeMuscleStrain(
          e,
          state.simTime,
          edgeAct,
          state.curlOverride
        );
        const targetLen = e.restLength * strain;
        const C = len - targetLen;
        const alphaTilde = e.compliance / h2;
        const lambda = -C / (wSum + alphaTilde);

        const gx = (dx / len) * lambda;
        const gy = (dy / len) * lambda;
        const gz = (dz / len) * lambda;

        pos[i0 * 3] -= gx * w0;
        pos[i0 * 3 + 1] -= gy * w0;
        pos[i0 * 3 + 2] -= gz * w0;

        pos[i1 * 3] += gx * w1;
        pos[i1 * 3 + 1] += gy * w1;
        pos[i1 * 3 + 2] += gz * w1;
      }
    }

    // 5. Solve XPBD Tetrahedral Volume Conservation Constraints
    for (let tIdx = 0; tIdx < state.tetras.length; tIdx++) {
      const tet = state.tetras[tIdx];
      const { i0, i1, i2, i3, restVolume, compliance } = tet;

      const x0 = pos[i0 * 3], y0 = pos[i0 * 3 + 1], z0 = pos[i0 * 3 + 2];
      const x1 = pos[i1 * 3], y1 = pos[i1 * 3 + 1], z1 = pos[i1 * 3 + 2];
      const x2 = pos[i2 * 3], y2 = pos[i2 * 3 + 1], z2 = pos[i2 * 3 + 2];
      const x3 = pos[i3 * 3], y3 = pos[i3 * 3 + 1], z3 = pos[i3 * 3 + 2];

      const g1x = ((y2 - y0) * (z3 - z0) - (z2 - z0) * (y3 - y0)) / 6.0;
      const g1y = ((z2 - z0) * (x3 - x0) - (x2 - x0) * (z3 - z0)) / 6.0;
      const g1z = ((x2 - x0) * (y3 - y0) - (y2 - y0) * (x3 - x0)) / 6.0;

      const g2x = ((y3 - y0) * (z1 - z0) - (z3 - z0) * (y1 - y0)) / 6.0;
      const g2y = ((z3 - z0) * (x1 - x0) - (x3 - x0) * (z1 - z0)) / 6.0;
      const g2z = ((x3 - x0) * (y1 - y0) - (y3 - y0) * (x1 - x0)) / 6.0;

      const g3x = ((y1 - y0) * (z2 - z0) - (z1 - z0) * (y2 - y0)) / 6.0;
      const g3y = ((z1 - z0) * (x2 - x0) - (x1 - x0) * (z2 - z0)) / 6.0;
      const g3z = ((x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0)) / 6.0;

      const g0x = -(g1x + g2x + g3x);
      const g0y = -(g1y + g2y + g3y);
      const g0z = -(g1z + g2z + g3z);

      const vol = (x1 - x0) * g1x + (y1 - y0) * g1y + (z1 - z0) * g1z;
      const C = vol - restVolume;

      const w0 = invM[i0];
      const w1 = invM[i1];
      const w2 = invM[i2];
      const w3 = invM[i3];

      const gradNormSum =
        w0 * (g0x * g0x + g0y * g0y + g0z * g0z) +
        w1 * (g1x * g1x + g1y * g1y + g1z * g1z) +
        w2 * (g2x * g2x + g2y * g2y + g2z * g2z) +
        w3 * (g3x * g3x + g3y * g3y + g3z * g3z);

      if (gradNormSum > 1e-9) {
        const alphaTilde = compliance / h2;
        const lambda = -C / (gradNormSum + alphaTilde);

        pos[i0 * 3] += g0x * lambda * w0;
        pos[i0 * 3 + 1] += g0y * lambda * w0;
        pos[i0 * 3 + 2] += g0z * lambda * w0;

        pos[i1 * 3] += g1x * lambda * w1;
        pos[i1 * 3 + 1] += g1y * lambda * w1;
        pos[i1 * 3 + 2] += g1z * lambda * w1;

        pos[i2 * 3] += g2x * lambda * w2;
        pos[i2 * 3 + 1] += g2y * lambda * w2;
        pos[i2 * 3 + 2] += g2z * lambda * w2;

        pos[i3 * 3] += g3x * lambda * w3;
        pos[i3 * 3 + 1] += g3y * lambda * w3;
        pos[i3 * 3 + 2] += g3z * lambda * w3;
      }
    }

    // 6. Velocity-Consistent Centerline Fairing, Upward Head-Dome Sliding & Live Bishop Frame Regularization
    const hcIdx = state.headCoreParticle * 3;
    const hCx = pos[hcIdx];
    const hCy = pos[hcIdx + 1];
    const hCz = pos[hcIdx + 2];

    for (let k = 0; k < 8; k++) {
      const arm = state.blueprint.arms[k];
      const armP = state.armNodeParticles[k];
      const numSt = arm.length;

      // 6a. Extract live station centroids along arm k and slide smoothly over head dome & table floor
      for (let s = 0; s < numSt; s++) {
        const [pD, pV, pL, pR] = armP[s];
        let cx = 0.25 * (pos[pD * 3] + pos[pV * 3] + pos[pL * 3] + pos[pR * 3]);
        let cy = 0.25 * (pos[pD * 3 + 1] + pos[pV * 3 + 1] + pos[pL * 3 + 1] + pos[pR * 3 + 1]);
        let cz = 0.25 * (pos[pD * 3 + 2] + pos[pV * 3 + 2] + pos[pL * 3 + 2] + pos[pR * 3 + 2]);

        const node = arm[s];
        // Smooth upward-biased ellipsoid sliding around the head dome so inward-dragged arms arch cleanly over the head
        if (s >= 3) {
          const dxH = cx - hCx;
          const dyH = cy - (hCy - 0.08);
          const dzH = cz - hCz;
          const distH = Math.hypot(dxH, dyH, dzH);
          const minHeadDist = 0.46 + node.radius;
          if (distH > 1e-4 && distH < minHeadDist) {
            const push = ((minHeadDist - distH) / distH) * 0.65;
            cx += dxH * push;
            cy += Math.max(0.02, dyH) * push;
            cz += dzH * push;
          }
        }

        const minCenterY = node.radius * 0.88 + 0.012;
        if (cy < minCenterY) {
          cy = minCenterY;
        }

        _rawCenterX[s] = cx;
        _rawCenterY[s] = cy;
        _rawCenterZ[s] = cz;
      }

      // 6b. Bidirectional segment-length relaxation + curvature-preserving anti-kink fairing
      const isDraggedArm = k === state.grabbedArmIndex;
      const numFairPasses = isDraggedArm ? 4 : 2;
      for (let pass = 0; pass < numFairPasses; pass++) {
        for (let s = 1; s < numSt; s++) {
          const restLen = Math.hypot(
            arm[s].position.x - arm[s - 1].position.x,
            arm[s].position.y - arm[s - 1].position.y,
            arm[s].position.z - arm[s - 1].position.z
          );
          const dx = _rawCenterX[s] - _rawCenterX[s - 1];
          const dy = _rawCenterY[s] - _rawCenterY[s - 1];
          const dz = _rawCenterZ[s] - _rawCenterZ[s - 1];
          const dLen = Math.hypot(dx, dy, dz) || 1e-5;
          const minLen = restLen * 0.82;
          const maxLen = restLen * 1.18;
          if (dLen < minLen || dLen > maxLen) {
            const targetLen = dLen < minLen ? minLen : maxLen;
            const corr = ((targetLen - dLen) / dLen) * 0.48;
            _rawCenterX[s] += dx * corr;
            _rawCenterY[s] += dy * corr;
            _rawCenterZ[s] += dz * corr;
            if (s > 1) {
              _rawCenterX[s - 1] -= dx * corr * 0.48;
              _rawCenterY[s - 1] -= dy * corr * 0.48;
              _rawCenterZ[s - 1] -= dz * corr * 0.48;
            }
          }
        }

        // Smooth C2 Laplacian + curvature equalization across interior stations
        for (let s = 1; s < numSt - 1; s++) {
          const v1x = _rawCenterX[s] - _rawCenterX[s - 1];
          const v1y = _rawCenterY[s] - _rawCenterY[s - 1];
          const v1z = _rawCenterZ[s] - _rawCenterZ[s - 1];
          const v2x = _rawCenterX[s + 1] - _rawCenterX[s];
          const v2y = _rawCenterY[s + 1] - _rawCenterY[s];
          const v2z = _rawCenterZ[s + 1] - _rawCenterZ[s];
          const l1 = Math.hypot(v1x, v1y, v1z) || 1e-5;
          const l2 = Math.hypot(v2x, v2y, v2z) || 1e-5;
          const cosAng = (v1x * v2x + v1y * v2y + v1z * v2z) / (l1 * l2);

          // Increase fairing weight automatically at any joint that bends sharply (cosAng < 0.78),
          // while keeping gentle fairing (0.08) on smooth writhing waves so S-bends aren't flattened
          const w =
            cosAng < 0.78
              ? 0.38
              : isDraggedArm
              ? s >= 6
                ? 0.25
                : 0.18
              : 0.08;
          _rawCenterX[s] = _rawCenterX[s] * (1 - 2 * w) + (_rawCenterX[s - 1] + _rawCenterX[s + 1]) * w;
          _rawCenterY[s] = Math.max(
            arm[s].radius * 0.88 + 0.012,
            _rawCenterY[s] * (1 - 2 * w) + (_rawCenterY[s - 1] + _rawCenterY[s + 1]) * w
          );
          _rawCenterZ[s] = _rawCenterZ[s] * (1 - 2 * w) + (_rawCenterZ[s - 1] + _rawCenterZ[s + 1]) * w;
        }
      }

      // Smoothly extrapolate terminal tip station (s = numSt - 1) along preceding tangent so the tip never hooks
      if (numSt >= 4) {
        const sLast = numSt - 1;
        const restTipLen = Math.hypot(
          arm[sLast].position.x - arm[sLast - 1].position.x,
          arm[sLast].position.y - arm[sLast - 1].position.y,
          arm[sLast].position.z - arm[sLast - 1].position.z
        );
        const prevDx = _rawCenterX[sLast - 1] - _rawCenterX[sLast - 2];
        const prevDy = _rawCenterY[sLast - 1] - _rawCenterY[sLast - 2];
        const prevDz = _rawCenterZ[sLast - 1] - _rawCenterZ[sLast - 2];
        const prevLen = Math.hypot(prevDx, prevDy, prevDz) || restTipLen;

        const curDx = _rawCenterX[sLast] - _rawCenterX[sLast - 1];
        const curDy = _rawCenterY[sLast] - _rawCenterY[sLast - 1];
        const curDz = _rawCenterZ[sLast] - _rawCenterZ[sLast - 1];
        const curLen = Math.hypot(curDx, curDy, curDz) || restTipLen;

        const blendTx = (curDx / curLen) * 0.55 + (prevDx / prevLen) * 0.45;
        const blendTy = (curDy / curLen) * 0.55 + (prevDy / prevLen) * 0.45;
        const blendTz = (curDz / curLen) * 0.55 + (prevDz / prevLen) * 0.45;
        const bNorm = Math.hypot(blendTx, blendTy, blendTz) || 1;

        _rawCenterX[sLast] = _rawCenterX[sLast - 1] + (blendTx / bNorm) * restTipLen;
        _rawCenterY[sLast] = Math.max(
          arm[sLast].radius * 0.88 + 0.012,
          _rawCenterY[sLast - 1] + (blendTy / bNorm) * restTipLen
        );
        _rawCenterZ[sLast] = _rawCenterZ[sLast - 1] + (blendTz / bNorm) * restTipLen;
      }

      // 6c. Live parallel-transported frame regularization (updating both pos and prev to prevent velocity jitter)
      let liveDx = arm[0].dorsalNormal.x;
      let liveDy = arm[0].dorsalNormal.y;
      let liveDz = arm[0].dorsalNormal.z;

      for (let s = 1; s < numSt; s++) {
        const [pD, pV, pL, pR] = armP[s];
        const node = arm[s];
        const rCross = Math.max(0.03, node.radius * 0.78);

        const cx = _rawCenterX[s];
        const cy = _rawCenterY[s];
        const cz = _rawCenterZ[s];

        const sNext = Math.min(numSt - 1, s + 1);
        let tx = _rawCenterX[sNext] - _rawCenterX[s - 1];
        let ty = _rawCenterY[sNext] - _rawCenterY[s - 1];
        let tz = _rawCenterZ[sNext] - _rawCenterZ[s - 1];
        const tLen = Math.hypot(tx, ty, tz) || 1;
        tx /= tLen;
        ty /= tLen;
        tz /= tLen;

        const restBias = k === state.grabbedArmIndex ? 0.04 : 0.14;
        liveDx = liveDx * (1 - restBias) + node.dorsalNormal.x * restBias;
        liveDy = liveDy * (1 - restBias) + node.dorsalNormal.y * restBias;
        liveDz = liveDz * (1 - restBias) + node.dorsalNormal.z * restBias;

        const dotDT = liveDx * tx + liveDy * ty + liveDz * tz;
        liveDx -= tx * dotDT;
        liveDy -= ty * dotDT;
        liveDz -= tz * dotDT;
        const dNorm = Math.hypot(liveDx, liveDy, liveDz) || 1;
        liveDx /= dNorm;
        liveDy /= dNorm;
        liveDz /= dNorm;

        let bx = ty * liveDz - tz * liveDy;
        let by = tz * liveDx - tx * liveDz;
        let bz = tx * liveDy - ty * liveDx;
        const bNorm = Math.hypot(bx, by, bz) || 1;
        bx /= bNorm;
        by /= bNorm;
        bz /= bNorm;

        if (s >= 1) {
          const regWeight = k === state.grabbedArmIndex ? 0.65 : 0.25 + 0.35 * node.u;
          const targetDx = liveDx * rCross;
          const targetDy = liveDy * rCross;
          const targetDz = liveDz * rCross;
          const targetBx = bx * rCross;
          const targetBy = by * rCross;
          const targetBz = bz * rCross;

          const applyReg = (pIdx: number, txPos: number, tyPos: number, tzPos: number) => {
            const rx = (txPos - pos[pIdx * 3]) * regWeight;
            const ry = (tyPos - pos[pIdx * 3 + 1]) * regWeight;
            const rz = (tzPos - pos[pIdx * 3 + 2]) * regWeight;
            pos[pIdx * 3] += rx;
            pos[pIdx * 3 + 1] += ry;
            pos[pIdx * 3 + 2] += rz;
            // Shift prev by 85% of the geometric fairing delta so fairing never injects artificial velocity!
            prev[pIdx * 3] += rx * 0.85;
            prev[pIdx * 3 + 1] += ry * 0.85;
            prev[pIdx * 3 + 2] += rz * 0.85;
          };

          applyReg(pD, cx + targetDx, cy + targetDy, cz + targetDz);
          applyReg(pV, cx - targetDx, Math.max(0.014, cy - targetDy), cz - targetDz);
          applyReg(pL, cx + targetBx, Math.max(0.014, cy + targetBy), cz + targetBz);
          applyReg(pR, cx - targetBx, Math.max(0.014, cy - targetBy), cz - targetBz);
        }
      }
    }

    // 7. Studio Table Collision (y >= 0.014) with Jelly Bounce Restitution & Suction Friction
    const invH = 1.0 / h;
    for (let i = 0; i < n; i++) {
      const idx = i * 3;
      const vyBefore = (pos[idx + 1] - prev[idx + 1]) * invH;
      if (pos[idx + 1] < 0.014) {
        pos[idx + 1] = 0.014;
        pos[idx] = prev[idx] + (pos[idx] - prev[idx]) * 0.72;
        pos[idx + 2] = prev[idx + 2] + (pos[idx + 2] - prev[idx + 2]) * 0.72;

        vel[idx] = (pos[idx] - prev[idx]) * invH;
        vel[idx + 1] = vyBefore < -0.35 ? -vyBefore * 0.56 : 0;
        vel[idx + 2] = (pos[idx + 2] - prev[idx + 2]) * invH;
      } else {
        vel[idx] = (pos[idx] - prev[idx]) * invH;
        vel[idx + 1] = vyBefore;
        vel[idx + 2] = (pos[idx + 2] - prev[idx + 2]) * invH;
      }
    }
  }
}

/**
 * Drops a pearlescent bait bead onto the studio table at or near `(x, z)`
 */
export function spawnBaitBead(
  state: XPBDOctopusState,
  x?: number,
  z?: number
): BaitBead {
  const angle = (state.nextBeadId * 1.15) % (Math.PI * 2);
  const dist = 1.45 + (state.nextBeadId % 3) * 0.28;
  const spawnX = x !== undefined ? x : Math.sin(angle) * dist;
  const spawnZ = z !== undefined ? z : Math.cos(angle) * dist + 0.15;

  const bead: BaitBead = {
    id: state.nextBeadId++,
    position: { x: spawnX, y: 0.78, z: spawnZ },
    velocity: {
      x: -spawnX * 0.25,
      y: -1.1,
      z: -spawnZ * 0.25,
    },
    radius: 0.085,
    hueShift: (state.nextBeadId * 47) % 360,
    settled: false,
  };

  state.beads.push(bead);
  if (state.beads.length > 12) {
    state.beads.shift();
  }
  return bead;
}

/**
 * Pre-allocates a reusable 2D array of `DeformedArmStation` structs (`[8][numStations]`)
 * for zero-GC per-frame updates.
 */
export function createDeformedArmBuffers(
  numArms = 8,
  numStations = 16
): DeformedArmStation[][] {
  const buffers: DeformedArmStation[][] = [];
  for (let k = 0; k < numArms; k++) {
    const armArr: DeformedArmStation[] = [];
    for (let s = 0; s < numStations; s++) {
      armArr.push({
        position: { x: 0, y: 0, z: 0 },
        dorsalNormal: { x: 0, y: 1, z: 0 },
        ventralNormal: { x: 0, y: -1, z: 0 },
        binormal: { x: 1, y: 0, z: 0 },
        tangent: { x: 0, y: 0, z: 1 },
        radius: 0.1,
      });
    }
    buffers.push(armArr);
  }
  return buffers;
}

// Scratch buffers for zero-GC centerline smoothing in stepXPBDOctopus and updateDeformedArmStations
const _rawCenterX = new Float32Array(32);
const _rawCenterY = new Float32Array(32);
const _rawCenterZ = new Float32Array(32);

/**
 * Updates `outArms` in-place with strictly orthonormal, twist-bounded parallel-transported Bishop frames
 * along the smoothed centerline of each arm so tentacle tips never kink, twist, or clip.
 */
export function updateDeformedArmStations(
  state: XPBDOctopusState,
  outArms: DeformedArmStation[][]
): void {
  const pos = state.positions;
  const numArms = outArms.length;

  for (let k = 0; k < numArms; k++) {
    const stations = outArms[k];
    const numStations = stations.length;
    const armP = state.armNodeParticles[k];
    const bpArm = state.blueprint.arms[k];
    const isGrabbedArm = k === state.grabbedArmIndex;

    // 1. Compute raw station centroids
    for (let s = 0; s < numStations; s++) {
      const [pD, pV, pL, pR] = armP[s];
      _rawCenterX[s] = 0.25 * (pos[pD * 3] + pos[pV * 3] + pos[pL * 3] + pos[pR * 3]);
      _rawCenterY[s] = 0.25 * (pos[pD * 3 + 1] + pos[pV * 3 + 1] + pos[pL * 3 + 1] + pos[pR * 3 + 1]);
      _rawCenterZ[s] = 0.25 * (pos[pD * 3 + 2] + pos[pV * 3 + 2] + pos[pL * 3 + 2] + pos[pR * 3 + 2]);
    }

    // 2. Multi-pass C2 Laplacian + joint-curvature fairing across all interior stations (s = 1..numStations-2)
    for (let pass = 0; pass < 3; pass++) {
      for (let s = 1; s < numStations - 1; s++) {
        const v1x = _rawCenterX[s] - _rawCenterX[s - 1];
        const v1y = _rawCenterY[s] - _rawCenterY[s - 1];
        const v1z = _rawCenterZ[s] - _rawCenterZ[s - 1];
        const v2x = _rawCenterX[s + 1] - _rawCenterX[s];
        const v2y = _rawCenterY[s + 1] - _rawCenterY[s];
        const v2z = _rawCenterZ[s + 1] - _rawCenterZ[s];
        const l1 = Math.hypot(v1x, v1y, v1z) || 1e-5;
        const l2 = Math.hypot(v2x, v2y, v2z) || 1e-5;
        const cosAng = (v1x * v2x + v1y * v2y + v1z * v2z) / (l1 * l2);

        const w = cosAng < 0.80 ? 0.36 : s >= 5 ? 0.24 : 0.16;
        _rawCenterX[s] = _rawCenterX[s] * (1 - 2 * w) + (_rawCenterX[s - 1] + _rawCenterX[s + 1]) * w;
        _rawCenterY[s] = Math.max(
          bpArm[s].radius * 0.92 + 0.012,
          _rawCenterY[s] * (1 - 2 * w) + (_rawCenterY[s - 1] + _rawCenterY[s + 1]) * w
        );
        _rawCenterZ[s] = _rawCenterZ[s] * (1 - 2 * w) + (_rawCenterZ[s - 1] + _rawCenterZ[s + 1]) * w;
      }
    }

    for (let s = 0; s < numStations; s++) {
      const st = stations[s];
      const restNode = bpArm[s];
      st.radius = restNode.radius;
      st.position.x = _rawCenterX[s];
      st.position.y = Math.max(restNode.radius * 0.92 + 0.012, _rawCenterY[s]);
      st.position.z = _rawCenterZ[s];
    }

    // Ensure the terminal station (s = numStations - 1) continues smoothly along the preceding curve
    if (numStations >= 4) {
      const sLast = numStations - 1;
      const p1 = stations[sLast - 2].position;
      const p2 = stations[sLast - 1].position;
      const p3 = stations[sLast].position;
      const seg12x = p2.x - p1.x;
      const seg12y = p2.y - p1.y;
      const seg12z = p2.z - p1.z;
      const len12 = Math.hypot(seg12x, seg12y, seg12z) || 1;
      const seg23x = p3.x - p2.x;
      const seg23y = p3.y - p2.y;
      const seg23z = p3.z - p2.z;
      const len23 = Math.hypot(seg23x, seg23y, seg23z) || len12;

      const bx = (seg23x / len23) * 0.55 + (seg12x / len12) * 0.45;
      const by = (seg23y / len23) * 0.55 + (seg12y / len12) * 0.45;
      const bz = (seg23z / len23) * 0.55 + (seg12z / len12) * 0.45;
      const bNorm = Math.hypot(bx, by, bz) || 1;
      p3.x = p2.x + (bx / bNorm) * len23;
      p3.y = Math.max(stations[sLast].radius * 0.92 + 0.012, p2.y + (by / bNorm) * len23);
      p3.z = p2.z + (bz / bNorm) * len23;
    }

    // 3. Compute true geometric centerline tangent via central finite differences
    for (let s = 0; s < numStations; s++) {
      const st = stations[s];
      const sPrev = Math.max(0, s - 1);
      const sNext = Math.min(numStations - 1, s + 1);
      let tx = stations[sNext].position.x - stations[sPrev].position.x;
      let ty = stations[sNext].position.y - stations[sPrev].position.y;
      let tz = stations[sNext].position.z - stations[sPrev].position.z;
      const tLen = Math.hypot(tx, ty, tz);
      if (tLen > 1e-5) {
        st.tangent.x = tx / tLen;
        st.tangent.y = ty / tLen;
        st.tangent.z = tz / tLen;
      } else {
        st.tangent.x = bpArm[s].tangent.x;
        st.tangent.y = bpArm[s].tangent.y;
        st.tangent.z = bpArm[s].tangent.z;
      }
    }

    // 4. Construct twist-free parallel-transported Bishop/Gram-Schmidt frame (dorsalNormal, binormal, ventralNormal)
    for (let s = 0; s < numStations; s++) {
      const st = stations[s];
      const [pD, pV] = armP[s];
      const restNode = bpArm[s];

      const pDx = pos[pD * 3] - pos[pV * 3];
      const pDy = pos[pD * 3 + 1] - pos[pV * 3 + 1];
      const pDz = pos[pD * 3 + 2] - pos[pV * 3 + 2];
      const pLen = Math.hypot(pDx, pDy, pDz) || 1;

      // When an arm is being dragged/uncoiled, rely on parallel transport + live particle dorsal axis
      // rather than the static curled rest-pose normal
      const restWeight = isGrabbedArm ? 0.08 : 0.22;
      let dx = (pDx / pLen) * (1 - restWeight) + restNode.dorsalNormal.x * restWeight;
      let dy = (pDy / pLen) * (1 - restWeight) + restNode.dorsalNormal.y * restWeight;
      let dz = (pDz / pLen) * (1 - restWeight) + restNode.dorsalNormal.z * restWeight;

      // Parallel-transport dominance in the slender outer third (s >= 8) prevents any inter-ring twist
      if (s > 0) {
        const prevD = stations[s - 1].dorsalNormal;
        const transportWeight = s >= 8 ? 0.68 : 0.48;
        dx = dx * (1 - transportWeight) + prevD.x * transportWeight;
        dy = dy * (1 - transportWeight) + prevD.y * transportWeight;
        dz = dz * (1 - transportWeight) + prevD.z * transportWeight;
      }

      // Gram-Schmidt orthogonalization against centerline tangent: d_orth = d - tangent * (d · tangent)
      const dotDT = dx * st.tangent.x + dy * st.tangent.y + dz * st.tangent.z;
      dx -= st.tangent.x * dotDT;
      dy -= st.tangent.y * dotDT;
      dz -= st.tangent.z * dotDT;
      const dLen = Math.hypot(dx, dy, dz) || 1;
      dx /= dLen;
      dy /= dLen;
      dz /= dLen;

      // Right-handed binormal = cross(tangent, dorsalNormal)
      let bx = st.tangent.y * dz - st.tangent.z * dy;
      let by = st.tangent.z * dx - st.tangent.x * dz;
      let bz = st.tangent.x * dy - st.tangent.y * dx;
      const bLen = Math.hypot(bx, by, bz) || 1;
      bx /= bLen;
      by /= bLen;
      bz /= bLen;

      st.dorsalNormal.x = dx;
      st.dorsalNormal.y = dy;
      st.dorsalNormal.z = dz;
      st.ventralNormal.x = -dx;
      st.ventralNormal.y = -dy;
      st.ventralNormal.z = -dz;
      st.binormal.x = bx;
      st.binormal.y = by;
      st.binormal.z = bz;
    }
  }
}

/**
 * Computes the deformed arm frame for a single arm station (backwards-compatible helper).
 */
export function getDeformedArmStation(
  state: XPBDOctopusState,
  armIndex: number,
  segmentIndex: number
): DeformedArmStation {
  const tmp = createDeformedArmBuffers(8, state.blueprint.arms[0].length);
  updateDeformedArmStations(state, tmp);
  return tmp[armIndex][segmentIndex];
}

/**
 * Computes live physical readouts from the current XPBD tetrahedral state
 */
export function computeOctopusTelemetry(state: XPBDOctopusState): OctopusTelemetry {
  const pos = state.positions;

  let currentCageVol = 0;
  for (let i = 0; i < state.tetras.length; i++) {
    const t = state.tetras[i];
    currentCageVol += Math.max(0, tetSignedVolume(pos, t.i0, t.i1, t.i2, t.i3));
  }
  const volRatio = Math.max(0.88, Math.min(1.14, currentCageVol / state.restTotalVolume));
  const volumeCm3 = Math.round(1342 * volRatio * 10) / 10;
  const massGrams = Math.round((state.baseMassGrams + state.beads.length * 4.2) * 10) / 10;

  const sceneToCm = 12.0;
  let maxSpanSq = 0;
  const tipPositions: Vec3[] = [];
  for (let k = 0; k < 8; k++) {
    const armP = state.armNodeParticles[k];
    for (let s = Math.floor(armP.length * 0.55); s < armP.length; s++) {
      const pIdx = armP[s][0];
      tipPositions.push({
        x: pos[pIdx * 3],
        y: pos[pIdx * 3 + 1],
        z: pos[pIdx * 3 + 2],
      });
    }
  }
  for (let i = 0; i < tipPositions.length; i++) {
    for (let j = i + 1; j < tipPositions.length; j++) {
      const dx = tipPositions[i].x - tipPositions[j].x;
      const dz = tipPositions[i].z - tipPositions[j].z;
      const dSq = dx * dx + dz * dz;
      if (dSq > maxSpanSq) {
        maxSpanSq = dSq;
      }
    }
  }
  const armSpanCm = Math.round(Math.sqrt(maxSpanSq) * sceneToCm * 10) / 10;

  let maxBodyY = 0;
  for (let i = 0; i < 10; i++) {
    const y = pos[i * 3 + 1];
    if (y > maxBodyY) maxBodyY = y;
  }
  const mantleHeightCm = Math.round((maxBodyY + 0.28) * sceneToCm * 10) / 10;

  let strainAccum = 0;
  let strainCount = 0;
  for (let i = 0; i < state.edges.length; i += 2) {
    const e = state.edges[i];
    if (e.armIndex >= 0 && (Math.abs(e.flankSide) >= 0.7 || Math.abs(e.curlBias) >= 0.7)) {
      const s = evaluateEdgeMuscleStrain(
        e,
        state.simTime,
        state.muscleActivity,
        state.curlOverride
      );
      const ax = pos[e.i0 * 3] - pos[e.i1 * 3];
      const ay = pos[e.i0 * 3 + 1] - pos[e.i1 * 3 + 1];
      const az = pos[e.i0 * 3 + 2] - pos[e.i1 * 3 + 2];
      const physRatio = Math.hypot(ax, ay, az) / (e.restLength || 1);
      strainAccum += Math.max(Math.abs(s - 1.0) * 1.42, Math.abs(physRatio - 1.0));
      strainCount++;
    }
  }
  const meanMuscleStrainPct =
    strainCount > 0 ? Math.round((strainAccum / strainCount) * 1000) / 10 : 0;

  const grippingArms = state.armSuctionGripping.filter(Boolean).length;
  const suctionGripPct = Math.round((grippingArms / 8) * 100);

  return {
    massGrams,
    volumeCm3,
    armSpanCm,
    mantleHeightCm,
    meanMuscleStrainPct,
    activeBeadCount: state.beads.length,
    isDragging: state.grabParticle >= 0,
    grabRegion: state.grabRegion,
    grabRegionLabel: getGrabRegionLabel(
      state.grabRegion,
      state.grabbedArmIndex,
      suctionGripPct
    ),
    suctionGripPct,
    jellyRippleIntensity: Math.round(state.jellyRippleAmp * 100),
    computeBackend: state.computeBackend,
  };
}

/**
 * WGSL Compute Shader source for WebGPU XPBD particle integration & elastic jelly table bounce
 */
export const WGSL_XPBD_INTEGRATE_SHADER = /* wgsl */ `
struct SimParams {
  dt: f32,
  simTime: f32,
  numParticles: u32,
  restitution: f32,
};

@group(0) @binding(0) var<uniform> params: SimParams;
@group(0) @binding(1) var<storage, read_write> positions: array<f32>;
@group(0) @binding(2) var<storage, read_write> velocities: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= params.numParticles) {
    return;
  }
  let base = idx * 3u;
  let py = positions[base + 1u];
  let vy = velocities[base + 1u];
  if (py < 0.012) {
    positions[base + 1u] = 0.012;
    velocities[base + 1u] = select(0.0, -vy * params.restitution, vy < -0.35);
  }
}
`;
