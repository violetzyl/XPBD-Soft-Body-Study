export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface ArmCapsuleNode {
  armIndex: number;
  segmentIndex: number;
  /** Normalized arc length u in [0, 1] from skirt base (0) to arm tip (1) */
  u: number;
  /** Arc length s in scene units (meters/decimeters) */
  s: number;
  /** Center position of capsule joint */
  position: Vec3;
  /** Unit tangent along arm from base to tip */
  tangent: Vec3;
  /** Unit dorsal normal (points up on table, inward on curl) */
  dorsalNormal: Vec3;
  /** Unit ventral normal (points down on table, outward on curl where suckers sit) */
  ventralNormal: Vec3;
  /** Unit lateral binormal */
  binormal: Vec3;
  /** Tapering radius at this joint */
  radius: number;
  /** Relative stiffness multiplier (1.0 in soft proximal arm, up to 4.5 in firmer outer third tip) */
  stiffnessMultiplier: number;
  /** Whether this node belongs to the outer third curl */
  isOuterThird: boolean;
}

export interface SuckerSpec {
  armIndex: number;
  segmentIndex: number;
  row: 0 | 1; // Two staggered rows (0 = left row, 1 = right row)
  u: number;
  position: Vec3;
  normal: Vec3;
  tangent: Vec3;
  outerRadius: number;
  cupDepth: number;
}

export interface PapillaSpec {
  id: number;
  region: 'mantle' | 'head' | 'arm';
  armIndex: number;
  u: number;
  position: Vec3;
  normal: Vec3;
  radius: number;
  height: number;
}

export interface EyeSocketSpec {
  side: 'left' | 'right';
  socketCenter: Vec3;
  socketRadius: number;
  eyeCenter: Vec3;
  eyeRadius: number;
  gazeDir: Vec3;
  pupilBarAxis: Vec3;
  hornBase: Vec3;
  hornTip: Vec3;
  hornRadius: number;
}

export interface OctopusAnatomyBlueprint {
  headCenter: Vec3;
  headRadius: Vec3;
  mantleCenter: Vec3;
  mantleAxis: Vec3;
  mantleLength: number;
  mantleRadii: Vec3;
  funnelBase: Vec3;
  funnelTip: Vec3;
  funnelRadii: [number, number];
  eyes: [EyeSocketSpec, EyeSocketSpec];
  arms: ArmCapsuleNode[][];
  suckers: SuckerSpec[];
  papillae: PapillaSpec[];
}

function normalize3(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function addScaled3(a: Vec3, b: Vec3, scale: number): Vec3 {
  return {
    x: a.x + b.x * scale,
    y: a.y + b.y * scale,
    z: a.z + b.z * scale,
  };
}

/**
 * Rotate vector `v` around unit axis `k` by `angle` radians (Rodrigues' formula)
 */
export function rotateAroundAxis(v: Vec3, k: Vec3, angle: number): Vec3 {
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const dotKV = k.x * v.x + k.y * v.y + k.z * v.z;
  const crossKV = cross3(k, v);
  return {
    x: v.x * cosA + crossKV.x * sinA + k.x * dotKV * (1 - cosA),
    y: v.y * cosA + crossKV.y * sinA + k.y * dotKV * (1 - cosA),
    z: v.z * cosA + crossKV.z * sinA + k.z * dotKV * (1 - cosA),
  };
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Integrates curvature along a single octopus arm (`armIndex` 0..7) to produce
 * a chain of tapering capsule nodes:
 * - Proximal & middle 2/3 (u in [0, 0.65]): gentle sweep across the studio table
 * - Outer 1/3 (u in [0.65, 1.0]): rolls up off the table into a spiral curl and twists
 *   so the ventral surface (with its two staggered rows of pale suckers) faces outward.
 */
export function integrateArmCurvature(
  armIndex: number,
  numNodes = 16,
  totalLength = 2.05
): ArmCapsuleNode[] {
  // Arrange 8 arms symmetrically around the head skirt:
  // Front-left / front-right pair at ±22.5°, etc.
  // Head faces +Z, Mantle leans back toward -Z.
  const armAngles = [
    -0.38, // 0: Front-Right I
    0.38,  // 1: Front-Left I
    -1.12, // 2: Mid-Right II
    1.12,  // 3: Mid-Left II
    -1.92, // 4: Hind-Right III
    1.92,  // 5: Hind-Left III
    -2.68, // 6: Rear-Right IV
    2.68,  // 7: Rear-Left IV
  ];

  const baseAngle = armAngles[armIndex % 8];
  const sideSign = baseAngle >= 0 ? 1 : -1;
  const pairIndex = Math.floor((armIndex % 8) / 2); // 0=front, 1=mid-front, 2=mid-back, 3=rear

  const baseRadius = 0.245;
  const tipRadius = 0.032;
  const skirtRadialOffset = 0.44;

  // Initial position at the base of the skirt around the head
  let pos: Vec3 = {
    x: Math.sin(baseAngle) * skirtRadialOffset,
    y: baseRadius + 0.04,
    z: Math.cos(baseAngle) * skirtRadialOffset + 0.08,
  };

  // Initial Bishop frame at arm base:
  // Tangent points outward and slightly downward toward the studio table
  let tangent = normalize3({
    x: Math.sin(baseAngle),
    y: -0.14,
    z: Math.cos(baseAngle),
  });
  let worldUp: Vec3 = { x: 0, y: 1, z: 0 };
  let binormal = normalize3(cross3(tangent, worldUp));
  let dorsalNormal = normalize3(cross3(binormal, tangent));

  const nodes: ArmCapsuleNode[] = [];
  const ds = totalLength / (numNodes - 1);

  for (let i = 0; i < numNodes; i++) {
    const u = i / (numNodes - 1);
    const s = u * totalLength;

    // Tapering radius profile (plump muscular base -> slender whip-like tip)
    const taper = Math.pow(1 - u, 1.28);
    const radius = tipRadius + (baseRadius - tipRadius) * taper;

    // Outer third flag & firmer tip stiffness profile
    const outerCurlBlend = smoothstep(0.58, 0.72, u);
    const isOuterThird = u >= 0.64;
    // Firmer arm tips: compliance drops -> stiffness multiplier increases up to 4.5x in the outer third
    const stiffnessMultiplier = 1.0 + 3.5 * smoothstep(0.55, 0.95, u);

    // Ventral normal points opposite to dorsal normal initially,
    // and in the outer third curl we roll the frame around the tangent so the ventral suckers face outward!
    const suckerOutwardRoll = sideSign * smoothstep(0.42, 0.88, u) * 1.55;
    const rolledDorsal = rotateAroundAxis(dorsalNormal, tangent, suckerOutwardRoll);
    const rolledBinormal = rotateAroundAxis(binormal, tangent, suckerOutwardRoll);
    const ventralNormal: Vec3 = {
      x: -rolledDorsal.x,
      y: -rolledDorsal.y,
      z: -rolledDorsal.z,
    };

    nodes.push({
      armIndex,
      segmentIndex: i,
      u,
      s,
      position: { ...pos },
      tangent: { ...tangent },
      dorsalNormal: rolledDorsal,
      ventralNormal,
      binormal: rolledBinormal,
      radius,
      stiffnessMultiplier,
      isOuterThird,
    });

    if (i < numNodes - 1) {
      // 1. Table sweep curvature (yaw across the slab in first 2/3):
      // Sweeps gracefully in an S-curve across the table
      const sweepPhase = u * Math.PI * 1.35 + pairIndex * 0.42;
      const kappaYaw =
        sideSign *
        (0.65 * Math.sin(sweepPhase) * (1 - outerCurlBlend * 0.5) +
          0.35 * outerCurlBlend);

      // 2. Pitch curvature:
      // First 2/3 settles onto the table; outer 1/3 curls strongly upward off the table into a spiral hook!
      const tableSettlePitch = u < 0.22 ? 0.45 : 0.0;
      const curlUpKappa = smoothstep(0.55, 0.95, u) * 3.55;
      const kappaPitch = tableSettlePitch + curlUpKappa;

      // Integrate frame rotation over step ds
      // Yaw around world Y / dorsalNormal
      const dYaw = kappaYaw * ds;
      tangent = normalize3(rotateAroundAxis(tangent, dorsalNormal, dYaw));
      binormal = normalize3(cross3(tangent, dorsalNormal));

      // Pitch around binormal (curling upward in the outer third)
      const dPitch = kappaPitch * ds;
      tangent = normalize3(rotateAroundAxis(tangent, binormal, dPitch));
      dorsalNormal = normalize3(cross3(binormal, tangent));

      // Advance position along integrated tangent
      const nextPos = addScaled3(pos, tangent, ds);

      // Keep proximal and middle sweep resting flush on the studio table (y = radius),
      // while allowing the outer third (u > 0.60) to lift freely into its curl off the table!
      const tableFloorY = radius + 0.008;
      if (u < 0.58) {
        nextPos.y = tableFloorY + smoothstep(0.0, 0.2, 0.2 - u) * 0.04;
        // Adjust tangent y smoothly when gliding along the table
        tangent = normalize3({
          x: nextPos.x - pos.x,
          y: nextPos.y - pos.y,
          z: nextPos.z - pos.z,
        });
        binormal = normalize3(cross3(tangent, worldUp));
        dorsalNormal = normalize3(cross3(binormal, tangent));
      } else {
        // Ensure curl never dips below table floor
        nextPos.y = Math.max(tableFloorY, nextPos.y);
      }

      pos = nextPos;
    }
  }

  return nodes;
}

/**
 * Generates the two staggered rows of pale suckers along the ventral/outward-facing
 * underside of all 8 arms.
 */
export function generateSuckerPlacements(arms: ArmCapsuleNode[][]): SuckerSpec[] {
  const suckers: SuckerSpec[] = [];

  for (const arm of arms) {
    // Interpolate finely along each arm for realistic double alternating sucker rows
    const numSuckerPairs = 14;
    for (let p = 0; p < numSuckerPairs; p++) {
      // Staggered rows 0 (left) and 1 (right)
      for (const row of [0, 1] as const) {
        const u = 0.08 + ((p + (row === 1 ? 0.48 : 0.0)) / numSuckerPairs) * 0.87;
        if (u >= 0.97) continue;

        // Find surrounding capsule nodes
        const exactIdx = u * (arm.length - 1);
        const idx0 = Math.min(arm.length - 2, Math.floor(exactIdx));
        const idx1 = idx0 + 1;
        const frac = exactIdx - idx0;

        const n0 = arm[idx0];
        const n1 = arm[idx1];

        const pos: Vec3 = {
          x: n0.position.x + (n1.position.x - n0.position.x) * frac,
          y: n0.position.y + (n1.position.y - n0.position.y) * frac,
          z: n0.position.z + (n1.position.z - n0.position.z) * frac,
        };
        const ventral: Vec3 = normalize3({
          x: n0.ventralNormal.x + (n1.ventralNormal.x - n0.ventralNormal.x) * frac,
          y: n0.ventralNormal.y + (n1.ventralNormal.y - n0.ventralNormal.y) * frac,
          z: n0.ventralNormal.z + (n1.ventralNormal.z - n0.ventralNormal.z) * frac,
        });
        const binormal: Vec3 = normalize3({
          x: n0.binormal.x + (n1.binormal.x - n0.binormal.x) * frac,
          y: n0.binormal.y + (n1.binormal.y - n0.binormal.y) * frac,
          z: n0.binormal.z + (n1.binormal.z - n0.binormal.z) * frac,
        });
        const tangent: Vec3 = normalize3({
          x: n0.tangent.x + (n1.tangent.x - n0.tangent.x) * frac,
          y: n0.tangent.y + (n1.tangent.y - n0.tangent.y) * frac,
          z: n0.tangent.z + (n1.tangent.z - n0.tangent.z) * frac,
        });
        const armRadius = n0.radius + (n1.radius - n0.radius) * frac;

        // Angle offset for the two staggered rows on the ventral side (±28 degrees)
        const rowSign = row === 0 ? -1 : 1;
        const suckerNormal = normalize3({
          x: ventral.x * 0.85 + binormal.x * (0.52 * rowSign),
          y: ventral.y * 0.85 + binormal.y * (0.52 * rowSign),
          z: ventral.z * 0.85 + binormal.z * (0.52 * rowSign),
        });

        const suckerPos = addScaled3(pos, suckerNormal, armRadius * 1.08);
        const outerRadius = Math.max(0.026, armRadius * 0.42);

        suckers.push({
          armIndex: n0.armIndex,
          segmentIndex: idx0,
          row,
          u,
          position: suckerPos,
          normal: suckerNormal,
          tangent,
          outerRadius,
          cupDepth: outerRadius * 0.72,
        });
      }
    }
  }

  return suckers;
}

/**
 * Generates the complete anatomical blueprint of the bilayer jelly octopus:
 * - Domed head with raised eye sockets (golden iris, horizontal bar pupil) and supraocular horn over each
 * - Big soft mantle leaning back
 * - Funnel (siphon) on the flank
 * - 8 curvature-integrated tapering arm chains
 * - Two staggered rows of pale suckers per arm
 * - Dorsal papillae across mantle, head, and dorsal arm backs
 */
export function buildOctopusAnatomyBlueprint(numArmNodes = 16): OctopusAnatomyBlueprint {
  const headCenter: Vec3 = { x: 0, y: 0.48, z: 0.08 };
  const headRadius: Vec3 = { x: 0.44, y: 0.38, z: 0.42 };

  // Big soft mantle leaning back (-Z and upward)
  const mantleCenter: Vec3 = { x: 0, y: 0.68, z: -0.58 };
  const mantleAxis: Vec3 = normalize3({ x: 0, y: 0.38, z: -0.92 });
  const mantleLength = 1.08;
  const mantleRadii: Vec3 = { x: 0.54, y: 0.50, z: 0.68 };

  // Funnel (siphon) tucked on the right flank between mantle and head, angled forward-sideways
  const funnelBase: Vec3 = { x: 0.38, y: 0.44, z: -0.26 };
  const funnelTip: Vec3 = { x: 0.58, y: 0.54, z: 0.08 };
  const funnelRadii: [number, number] = [0.145, 0.082];

  // Raised eye sockets on the domed head with golden iris, horizontal bar pupil, and a small horn over each
  const eyes: [EyeSocketSpec, EyeSocketSpec] = (['left', 'right'] as const).map((side) => {
    const s = side === 'left' ? 1 : -1;
    const socketCenter: Vec3 = {
      x: s * 0.31,
      y: 0.69,
      z: 0.21,
    };
    const gazeDir = normalize3({ x: s * 0.68, y: 0.28, z: 0.67 });
    const eyeCenter = addScaled3(socketCenter, gazeDir, 0.055);
    // Horizontal bar pupil stays aligned horizontally across the studio horizon
    const pupilBarAxis = normalize3({ x: -s * 0.45, y: 0.04, z: 0.89 });
    // Small supraocular horn (cirrus) perched directly over each raised eye socket
    const hornBase: Vec3 = {
      x: socketCenter.x * 0.96,
      y: socketCenter.y + 0.115,
      z: socketCenter.z - 0.015,
    };
    const hornTip: Vec3 = {
      x: hornBase.x + s * 0.045,
      y: hornBase.y + 0.11,
      z: hornBase.z - 0.02,
    };
    return {
      side,
      socketCenter,
      socketRadius: 0.135,
      eyeCenter,
      eyeRadius: 0.088,
      gazeDir,
      pupilBarAxis,
      hornBase,
      hornTip,
      hornRadius: 0.034,
    };
  }) as [EyeSocketSpec, EyeSocketSpec];

  // 8 curvature-integrated arms
  const arms: ArmCapsuleNode[][] = [];
  for (let k = 0; k < 8; k++) {
    arms.push(integrateArmCurvature(k, numArmNodes));
  }

  const suckers = generateSuckerPlacements(arms);

  // Dorsal papillae (small tactile skin bumps on mantle, head, and dorsal arm backs)
  const papillae: PapillaSpec[] = [];
  let papId = 0;

  // Mantle papillae
  const mantleAngles = [
    { theta: 0.0, phi: 0.25 },
    { theta: -0.45, phi: 0.35 },
    { theta: 0.45, phi: 0.35 },
    { theta: -0.28, phi: 0.62 },
    { theta: 0.28, phi: 0.62 },
    { theta: 0.0, phi: 0.82 },
    { theta: -0.62, phi: 0.55 },
    { theta: 0.62, phi: 0.55 },
    { theta: -0.35, phi: 0.12 },
    { theta: 0.35, phi: 0.12 },
  ];
  for (const ma of mantleAngles) {
    const localX = Math.sin(ma.theta) * mantleRadii.x * 0.88;
    const localY = Math.cos(ma.theta) * mantleRadii.y * 0.92;
    const localZ = (0.5 - ma.phi) * mantleRadii.z * 1.45;
    const pos: Vec3 = {
      x: mantleCenter.x + localX,
      y: mantleCenter.y + localY * 0.92 - localZ * 0.22,
      z: mantleCenter.z + localZ * 0.95,
    };
    const normal = normalize3({
      x: pos.x - mantleCenter.x,
      y: pos.y - mantleCenter.y + 0.2,
      z: pos.z - mantleCenter.z,
    });
    papillae.push({
      id: papId++,
      region: 'mantle',
      armIndex: -1,
      u: ma.phi,
      position: pos,
      normal,
      radius: 0.032 + (papId % 3) * 0.008,
      height: 0.042 + (papId % 2) * 0.014,
    });
  }

  // Dorsal arm papillae along the proximal/mid back of each arm
  for (let k = 0; k < 8; k++) {
    const arm = arms[k];
    for (const segIdx of [2, 4, 6, 8, 10]) {
      const node = arm[segIdx];
      if (!node) continue;
      const lateralJitter = ((segIdx % 2 === 0 ? 1 : -1) * 0.18) * node.radius;
      const pos: Vec3 = {
        x: node.position.x + node.dorsalNormal.x * (node.radius * 0.95) + node.binormal.x * lateralJitter,
        y: node.position.y + node.dorsalNormal.y * (node.radius * 0.95) + node.binormal.y * lateralJitter,
        z: node.position.z + node.dorsalNormal.z * (node.radius * 0.95) + node.binormal.z * lateralJitter,
      };
      papillae.push({
        id: papId++,
        region: 'arm',
        armIndex: k,
        u: node.u,
        position: pos,
        normal: { ...node.dorsalNormal },
        radius: Math.max(0.015, node.radius * 0.14),
        height: Math.max(0.02, node.radius * 0.19),
      });
    }
  }

  return {
    headCenter,
    headRadius,
    mantleCenter,
    mantleAxis,
    mantleLength,
    mantleRadii,
    funnelBase,
    funnelTip,
    funnelRadii,
    eyes,
    arms,
    suckers,
    papillae,
  };
}
