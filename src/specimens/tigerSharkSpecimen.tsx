import * as THREE from 'three';
import {
  TigerSharkControlsModule,
  TigerSharkSpecificParams,
} from '../components/controls/TigerSharkControlsModule';
import {
  JellySpecimenDefinition,
  SpecimenRuntimeController,
  SpecimenSharedResources,
  SpecimenTelemetry,
} from './types';

const _v0 = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _invQuat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _raycaster = new THREE.Raycaster();

export type SharkGrabPart =
  | 'none'
  | 'spine'
  | 'dorsal1'
  | 'dorsal2'
  | 'pec_left'
  | 'pec_right'
  | 'pelvic_left'
  | 'pelvic_right'
  | 'caudal';

interface SharkSpineStation {
  u: number;
  restZ: number;
  restY: number;
  rx: number;
  ry: number;
  pos: THREE.Vector3;
  prevPos: THREE.Vector3;
  vel: THREE.Vector3;
  yaw: number;
  pitch: number;
}

interface DeformableFinGeometry {
  geometry: THREE.BufferGeometry;
  span: number;
  applyLocalBend: (bendX: number, bendY: number, bendZ: number) => void;
  dispose: () => void;
}

interface SharkFinDynamicState {
  id: Exclude<SharkGrabPart, 'none' | 'spine'>;
  stationIdx: number;
  span: number;
  rootWorld: THREE.Vector3;
  tipWorld: THREE.Vector3;
  grabOriginWorld: THREE.Vector3;
  worldDeflect: THREE.Vector3;
  worldVel: THREE.Vector3;
}

/**
 * Shortest distance squared from a Ray to a 3D line segment [pA, pB], writing the closest point on [pA, pB] to `outClosest`.
 */
function rayToSegmentDistSq(
  ray: THREE.Ray,
  pA: THREE.Vector3,
  pB: THREE.Vector3,
  outClosest: THREE.Vector3
): number {
  let bestDistSq = Infinity;
  const steps = 6;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    _v1.lerpVectors(pA, pB, t);
    const dSq = ray.distanceSqToPoint(_v1);
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      outClosest.copy(_v1);
    }
  }
  return bestDistSq;
}

/**
 * Builds a procedural swept NACA-0016 hydrofoil fin geometry in local space with
 * real-time spanwise cantilever bending support (`applyLocalBend`):
 * - Root chord lies along Z (`[-rootChord * 0.5, +rootChord * 0.5]`) at `y = 0`
 * - Span extends along `+Y` (`[0, span]`)
 * - Sweeps backward along `-Z` by `sweep` at the tip
 * - Smoothly tapers chord and thickness toward a falcate raked tip
 */
function createSweptFinGeometry(
  rootChord: number,
  tipChord: number,
  span: number,
  sweep: number,
  maxThickness: number,
  spanCurveBend = 0.08,
  spanSegs = 12,
  chordSegs = 14
): DeformableFinGeometry {
  const vertsPerRing = chordSegs * 2 + 1;
  const numRings = spanSegs + 1;
  const totalVerts = numRings * vertsPerRing;

  const restPositions = new Float32Array(totalVerts * 3);
  const positions = new Float32Array(totalVerts * 3);
  const restNormals = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const spanFactors = new Float32Array(numRings);
  const uvs = new Float32Array(totalVerts * 2);
  const indices: number[] = [];

  for (let r = 0; r < numRings; r++) {
    const vSpan = r / spanSegs;
    spanFactors[r] = Math.pow(vSpan, 1.38);
    const tipCapTaper =
      vSpan > 0.88 ? Math.sqrt(Math.max(0.001, (1 - vSpan) / 0.12)) : 1.0;
    const chord = (rootChord * (1 - vSpan) + tipChord * vSpan) * tipCapTaper;
    const halfThick =
      maxThickness * (1 - 0.72 * Math.pow(vSpan, 1.15)) * tipCapTaper;

    const centerZ =
      -sweep * Math.pow(vSpan, 1.18) -
      spanCurveBend * Math.sin(vSpan * Math.PI);
    const y = span * vSpan;

    for (let j = 0; j < vertsPerRing; j++) {
      const angle = (j / (vertsPerRing - 1)) * Math.PI * 2;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      const c = 0.5 * (1 - cosA);
      const foilEnv =
        Math.sin(Math.pow(c, 0.62) * Math.PI) * (1 - 0.25 * c);

      const x = sinA * halfThick * foilEnv;
      const z = centerZ + (0.45 - c) * chord;

      const vIdx = (r * vertsPerRing + j) * 3;
      restPositions[vIdx] = x;
      restPositions[vIdx + 1] = y;
      restPositions[vIdx + 2] = z;
      positions[vIdx] = x;
      positions[vIdx + 1] = y;
      positions[vIdx + 2] = z;

      const nx = sinA * 0.92;
      const ny = vSpan > 0.92 ? 0.55 : 0.12 * vSpan;
      const nz = cosA * 0.38;
      const nLen = Math.hypot(nx, ny, nz) || 1;
      restNormals[vIdx] = nx / nLen;
      restNormals[vIdx + 1] = ny / nLen;
      restNormals[vIdx + 2] = nz / nLen;
      normals[vIdx] = restNormals[vIdx];
      normals[vIdx + 1] = restNormals[vIdx + 1];
      normals[vIdx + 2] = restNormals[vIdx + 2];

      const uvIdx = (r * vertsPerRing + j) * 2;
      uvs[uvIdx] = c;
      uvs[uvIdx + 1] = vSpan;
    }

    if (r < numRings - 1) {
      for (let j = 0; j < vertsPerRing - 1; j++) {
        const a = r * vertsPerRing + j;
        const b = a + 1;
        const c = (r + 1) * vertsPerRing + j;
        const d = c + 1;
        indices.push(a, b, c);
        indices.push(b, d, c);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3);
  posAttr.setUsage(THREE.DynamicDrawUsage);
  const normAttr = new THREE.BufferAttribute(normals, 3);
  normAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', posAttr);
  geo.setAttribute('normal', normAttr);
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  if (geo.boundingSphere) {
    geo.boundingSphere.radius *= 2.4;
  }

  let isBent = false;

  return {
    geometry: geo,
    span,
    applyLocalBend(bendX: number, bendY: number, bendZ: number) {
      const magSq = bendX * bendX + bendY * bendY + bendZ * bendZ;
      if (magSq < 1e-6 && !isBent) return;
      isBent = magSq >= 1e-6;

      for (let r = 0; r < numRings; r++) {
        const w = spanFactors[r];
        const dx = bendX * w;
        const dy = bendY * w;
        const dz = bendZ * w;
        const rowBase = r * vertsPerRing;
        for (let j = 0; j < vertsPerRing; j++) {
          const vIdx = (rowBase + j) * 3;
          positions[vIdx] = restPositions[vIdx] + dx;
          positions[vIdx + 1] = restPositions[vIdx + 1] + dy;
          positions[vIdx + 2] = restPositions[vIdx + 2] + dz;
        }
      }
      posAttr.needsUpdate = true;
    },
    dispose() {
      geo.dispose();
    },
  };
}

export const TIGER_SHARK_SPECIMEN: JellySpecimenDefinition<TigerSharkSpecificParams> = {
  id: 'tiger_shark',
  name: 'Tiger Shark Bilayer Jelly Study',
  shortName: 'Tiger Shark',
  specimenPrefix: 'SHK-JL-02',
  specificControlsTitle: 'Shark Hydrodynamics',
  defaultParams: {
    tailBeatIntensity: 1.0,
    swimPose: 'cruise',
  },
  cameraPresets: [
    {
      id: 'studio',
      label: 'Studio 3/4',
      position: [2.55, 1.85, 2.85],
      target: [0, 0.38, 0.05],
    },
    {
      id: 'top',
      label: 'Top Profile',
      position: [0.01, 4.35, 0.25],
      target: [0, 0.3, 0.0],
    },
    {
      id: 'eye',
      label: 'Snout & Gills',
      position: [1.25, 0.82, 1.75],
      target: [0.0, 0.38, 0.78],
    },
    {
      id: 'curl',
      label: 'Caudal Fluke',
      position: [-1.85, 1.05, -2.15],
      target: [0.0, 0.48, -1.15],
    },
  ],
  studyNotes: {
    title: 'Galeocerdo cuvier · Carangiform Bilayer Jelly & Hydrofoil Fin Physics',
    paragraphs: [
      'Interactive Hydrofoil Fins: Grab and drag the tall First Dorsal Fin (top), Left or Right Pectoral Fins, Second Dorsal Fin, Pelvic Fins, or Heterocercal Caudal Fluke to bend their NACA-0016 bilayer jelly hydrofoils, transmit banking torque to the trunk, and trigger viscoelastic fin recoil on release.',
      'Lighthill Carangiform Locomotion: Propulsion follows an inextensible axial travelling wave whose amplitude envelope grows quadratically toward the caudal peduncle, with phase-lagged tail-fluke feathering and chemotactic bait orientation.',
    ],
  },
  SpecificControlsComponent: TigerSharkControlsModule,

  createController(
    shared: SpecimenSharedResources
  ): SpecimenRuntimeController<TigerSharkSpecificParams> {
    const {
      scene,
      outerJellyMat,
      milkyCoreMat,
      irisMat,
      pupilMat,
      socketMat,
      beadInstanced,
      maxBeads,
      contactShadowMesh,
      contactShadowMat,
      grabRingMesh,
      grabTetherLine,
      grabTetherGeo,
      grabTetherPositions,
      sssUniforms,
      isSoftwareGl,
    } = shared;

    const numSpine = 28;
    const radialSegs = 20;
    const totalLength = 3.24;
    const segRestLen = totalLength / (numSpine - 1);

    const stations: SharkSpineStation[] = [];
    for (let i = 0; i < numSpine; i++) {
      const u = i / (numSpine - 1);
      const restZ = 1.48 - u * totalLength;

      let rx: number;
      let ry: number;
      if (u < 0.14) {
        const t = u / 0.14;
        const snoutRound = Math.pow(
          Math.max(0.02, Math.sin(t * Math.PI * 0.5)),
          0.48
        );
        rx = 0.04 + 0.37 * snoutRound;
        ry = 0.03 + 0.25 * Math.pow(t, 0.65);
      } else if (u < 0.84) {
        const t = (u - 0.14) / 0.7;
        const trunkEnv = Math.sin((0.28 + t * 0.72) * Math.PI * 0.88);
        const keelFlare =
          u > 0.7 ? Math.sin(((u - 0.7) / 0.14) * Math.PI) * 0.032 : 0;
        rx = Math.max(0.052, 0.42 * trunkEnv * (1 - 0.32 * t) + keelFlare);
        ry = Math.max(0.058, 0.38 * trunkEnv * (1 - 0.26 * t));
      } else {
        const t = (u - 0.84) / 0.16;
        rx = Math.max(0.018, 0.068 * (1 - 0.72 * t));
        ry = Math.max(0.024, 0.082 * (1 - 0.65 * t));
      }

      const tailRise =
        u > 0.82 ? Math.pow((u - 0.82) / 0.18, 1.35) * 0.44 : 0;
      const restY = 0.36 + tailRise;

      stations.push({
        u,
        restZ,
        restY,
        rx,
        ry,
        pos: new THREE.Vector3(0, restY, restZ),
        prevPos: new THREE.Vector3(0, restY, restZ),
        vel: new THREE.Vector3(0, 0, 0),
        yaw: 0,
        pitch: 0,
      });
    }

    const group = new THREE.Group();
    scene.add(group);

    const vertsPerRing = radialSegs + 1;
    const totalVerts = numSpine * vertsPerRing;
    const cosTable = new Float32Array(vertsPerRing);
    const sinTable = new Float32Array(vertsPerRing);
    for (let j = 0; j < vertsPerRing; j++) {
      const theta = (j / radialSegs) * Math.PI * 2;
      cosTable[j] = Math.cos(theta);
      sinTable[j] = Math.sin(theta);
    }

    const outerPos = new Float32Array(totalVerts * 3);
    const outerNorm = new Float32Array(totalVerts * 3);
    const outerUV = new Float32Array(totalVerts * 2);

    const innerPos = new Float32Array(totalVerts * 3);
    const innerNorm = new Float32Array(totalVerts * 3);
    const innerUV = new Float32Array(totalVerts * 2);

    const indices: number[] = [];
    for (let s = 0; s < numSpine; s++) {
      const u = s / (numSpine - 1);
      for (let j = 0; j < vertsPerRing; j++) {
        const vIdx = s * vertsPerRing + j;
        outerUV[vIdx * 2] = u * 2.8;
        outerUV[vIdx * 2 + 1] = j / radialSegs;
        innerUV[vIdx * 2] = u * 2.8;
        innerUV[vIdx * 2 + 1] = j / radialSegs;
      }
      if (s < numSpine - 1) {
        for (let j = 0; j < radialSegs; j++) {
          const a = s * vertsPerRing + j;
          const b = a + 1;
          const c = (s + 1) * vertsPerRing + j;
          const d = c + 1;
          indices.push(a, b, c);
          indices.push(b, d, c);
        }
      }
    }

    const outerGeo = new THREE.BufferGeometry();
    const outerPosAttr = new THREE.BufferAttribute(outerPos, 3);
    outerPosAttr.setUsage(THREE.DynamicDrawUsage);
    const outerNormAttr = new THREE.BufferAttribute(outerNorm, 3);
    outerNormAttr.setUsage(THREE.DynamicDrawUsage);
    outerGeo.setAttribute('position', outerPosAttr);
    outerGeo.setAttribute('normal', outerNormAttr);
    outerGeo.setAttribute('uv', new THREE.BufferAttribute(outerUV, 2));
    outerGeo.setIndex(indices);

    const innerGeo = new THREE.BufferGeometry();
    const innerPosAttr = new THREE.BufferAttribute(innerPos, 3);
    innerPosAttr.setUsage(THREE.DynamicDrawUsage);
    const innerNormAttr = new THREE.BufferAttribute(innerNorm, 3);
    innerNormAttr.setUsage(THREE.DynamicDrawUsage);
    innerGeo.setAttribute('position', innerPosAttr);
    innerGeo.setAttribute('normal', innerNormAttr);
    innerGeo.setAttribute('uv', new THREE.BufferAttribute(innerUV, 2));
    innerGeo.setIndex(indices);

    const outerMesh = new THREE.Mesh(outerGeo, outerJellyMat);
    outerMesh.castShadow = !isSoftwareGl;
    outerMesh.frustumCulled = false;
    outerMesh.renderOrder = 2;
    group.add(outerMesh);

    const innerMesh = new THREE.Mesh(innerGeo, milkyCoreMat);
    innerMesh.frustumCulled = false;
    innerMesh.renderOrder = 1;
    group.add(innerMesh);

    // 1. First Dorsal Fin (Top Fin at station 9, u ~ 0.33) — Deformable Bilayer Hydrofoil
    const firstDorsalDef = createSweptFinGeometry(0.54, 0.08, 0.66, 0.36, 0.068, 0.09);
    const firstDorsalCoreDef = createSweptFinGeometry(0.38, 0.05, 0.48, 0.26, 0.042, 0.06);
    const firstDorsalGroup = new THREE.Group();
    const firstDorsalOuter = new THREE.Mesh(firstDorsalDef.geometry, outerJellyMat);
    firstDorsalOuter.frustumCulled = false;
    firstDorsalOuter.renderOrder = 2;
    const firstDorsalInner = new THREE.Mesh(firstDorsalCoreDef.geometry, milkyCoreMat);
    firstDorsalInner.position.set(0, -0.02, -0.02);
    firstDorsalInner.frustumCulled = false;
    firstDorsalInner.renderOrder = 1;
    firstDorsalGroup.add(firstDorsalOuter, firstDorsalInner);
    group.add(firstDorsalGroup);

    // 2. Second Dorsal Fin (station 19) + Ventral Anal Fin
    const secondDorsalDef = createSweptFinGeometry(0.24, 0.04, 0.24, 0.16, 0.032, 0.04);
    const secondDorsalMesh = new THREE.Mesh(secondDorsalDef.geometry, outerJellyMat);
    secondDorsalMesh.frustumCulled = false;
    secondDorsalMesh.renderOrder = 2;
    group.add(secondDorsalMesh);

    const analFinDef = createSweptFinGeometry(0.20, 0.035, 0.21, 0.15, 0.028, 0.03);
    const analFinMesh = new THREE.Mesh(analFinDef.geometry, outerJellyMat);
    analFinMesh.frustumCulled = false;
    analFinMesh.renderOrder = 2;
    group.add(analFinMesh);

    // 3. Dedicated Deformable Left & Right Swept Pectoral Fins (station 6, u ~ 0.22)
    const leftPecDef = createSweptFinGeometry(0.48, 0.07, 0.88, 0.42, 0.052, 0.10);
    const leftPecCoreDef = createSweptFinGeometry(0.34, 0.04, 0.68, 0.30, 0.032, 0.07);
    const leftPecGroup = new THREE.Group();
    const leftPecOuter = new THREE.Mesh(leftPecDef.geometry, outerJellyMat);
    leftPecOuter.frustumCulled = false;
    leftPecOuter.renderOrder = 2;
    const leftPecInner = new THREE.Mesh(leftPecCoreDef.geometry, milkyCoreMat);
    leftPecInner.position.set(-0.012, 0.02, -0.01);
    leftPecInner.frustumCulled = false;
    leftPecInner.renderOrder = 1;
    leftPecGroup.add(leftPecOuter, leftPecInner);

    const rightPecDef = createSweptFinGeometry(0.48, 0.07, 0.88, 0.42, 0.052, 0.10);
    const rightPecCoreDef = createSweptFinGeometry(0.34, 0.04, 0.68, 0.30, 0.032, 0.07);
    const rightPecGroup = new THREE.Group();
    const rightPecOuter = new THREE.Mesh(rightPecDef.geometry, outerJellyMat);
    rightPecOuter.frustumCulled = false;
    rightPecOuter.renderOrder = 2;
    const rightPecInner = new THREE.Mesh(rightPecCoreDef.geometry, milkyCoreMat);
    rightPecInner.position.set(0.012, 0.02, -0.01);
    rightPecInner.frustumCulled = false;
    rightPecInner.renderOrder = 1;
    rightPecGroup.add(rightPecOuter, rightPecInner);
    group.add(leftPecGroup, rightPecGroup);

    // 4. Paired Deformable Pelvic Fins (station 15, u ~ 0.55)
    const leftPelvicDef = createSweptFinGeometry(0.24, 0.04, 0.30, 0.16, 0.030, 0.04);
    const rightPelvicDef = createSweptFinGeometry(0.24, 0.04, 0.30, 0.16, 0.030, 0.04);
    const leftPelvicMesh = new THREE.Mesh(leftPelvicDef.geometry, outerJellyMat);
    const rightPelvicMesh = new THREE.Mesh(rightPelvicDef.geometry, outerJellyMat);
    leftPelvicMesh.frustumCulled = false;
    rightPelvicMesh.frustumCulled = false;
    leftPelvicMesh.renderOrder = 2;
    rightPelvicMesh.renderOrder = 2;
    group.add(leftPelvicMesh, rightPelvicMesh);

    // 5. Heterocercal Bilobed Caudal Fin (station 23, u ~ 0.85)
    const caudalUpperDef = createSweptFinGeometry(0.46, 0.07, 0.86, 0.56, 0.048, 0.12);
    const caudalLowerDef = createSweptFinGeometry(0.34, 0.05, 0.44, 0.24, 0.040, 0.05);
    const caudalCoreDef = createSweptFinGeometry(0.30, 0.04, 0.64, 0.42, 0.028, 0.08);
    const caudalGroup = new THREE.Group();

    const caudalUpperMesh = new THREE.Mesh(caudalUpperDef.geometry, outerJellyMat);
    caudalUpperMesh.rotation.x = -0.36;
    caudalUpperMesh.frustumCulled = false;
    caudalUpperMesh.renderOrder = 2;

    const caudalCoreMesh = new THREE.Mesh(caudalCoreDef.geometry, milkyCoreMat);
    caudalCoreMesh.rotation.x = -0.36;
    caudalCoreMesh.position.set(0, 0.02, 0.02);
    caudalCoreMesh.frustumCulled = false;
    caudalCoreMesh.renderOrder = 1;

    const caudalLowerMesh = new THREE.Mesh(caudalLowerDef.geometry, outerJellyMat);
    caudalLowerMesh.rotation.z = Math.PI;
    caudalLowerMesh.rotation.x = 0.42;
    caudalLowerMesh.position.set(0, 0.04, 0.06);
    caudalLowerMesh.frustumCulled = false;
    caudalLowerMesh.renderOrder = 2;

    caudalGroup.add(caudalUpperMesh, caudalCoreMesh, caudalLowerMesh);
    group.add(caudalGroup);

    // Dynamic state for each interactive fin hydrofoil
    const finStates: Record<Exclude<SharkGrabPart, 'none' | 'spine'>, SharkFinDynamicState> = {
      dorsal1: {
        id: 'dorsal1',
        stationIdx: 9,
        span: 0.66,
        rootWorld: new THREE.Vector3(),
        tipWorld: new THREE.Vector3(),
        grabOriginWorld: new THREE.Vector3(),
        worldDeflect: new THREE.Vector3(),
        worldVel: new THREE.Vector3(),
      },
      dorsal2: {
        id: 'dorsal2',
        stationIdx: 19,
        span: 0.24,
        rootWorld: new THREE.Vector3(),
        tipWorld: new THREE.Vector3(),
        grabOriginWorld: new THREE.Vector3(),
        worldDeflect: new THREE.Vector3(),
        worldVel: new THREE.Vector3(),
      },
      pec_left: {
        id: 'pec_left',
        stationIdx: 6,
        span: 0.88,
        rootWorld: new THREE.Vector3(),
        tipWorld: new THREE.Vector3(),
        grabOriginWorld: new THREE.Vector3(),
        worldDeflect: new THREE.Vector3(),
        worldVel: new THREE.Vector3(),
      },
      pec_right: {
        id: 'pec_right',
        stationIdx: 6,
        span: 0.88,
        rootWorld: new THREE.Vector3(),
        tipWorld: new THREE.Vector3(),
        grabOriginWorld: new THREE.Vector3(),
        worldDeflect: new THREE.Vector3(),
        worldVel: new THREE.Vector3(),
      },
      pelvic_left: {
        id: 'pelvic_left',
        stationIdx: 15,
        span: 0.30,
        rootWorld: new THREE.Vector3(),
        tipWorld: new THREE.Vector3(),
        grabOriginWorld: new THREE.Vector3(),
        worldDeflect: new THREE.Vector3(),
        worldVel: new THREE.Vector3(),
      },
      pelvic_right: {
        id: 'pelvic_right',
        stationIdx: 15,
        span: 0.30,
        rootWorld: new THREE.Vector3(),
        tipWorld: new THREE.Vector3(),
        grabOriginWorld: new THREE.Vector3(),
        worldDeflect: new THREE.Vector3(),
        worldVel: new THREE.Vector3(),
      },
      caudal: {
        id: 'caudal',
        stationIdx: 23,
        span: 0.86,
        rootWorld: new THREE.Vector3(),
        tipWorld: new THREE.Vector3(),
        grabOriginWorld: new THREE.Vector3(),
        worldDeflect: new THREE.Vector3(),
        worldVel: new THREE.Vector3(),
      },
    };

    // Map fin meshes to their SharkGrabPart identifier for mesh-accurate raycasting
    const finMeshTargets: { mesh: THREE.Object3D; part: Exclude<SharkGrabPart, 'none' | 'spine'> }[] = [
      { mesh: firstDorsalOuter, part: 'dorsal1' },
      { mesh: leftPecOuter, part: 'pec_left' },
      { mesh: rightPecOuter, part: 'pec_right' },
      { mesh: secondDorsalMesh, part: 'dorsal2' },
      { mesh: leftPelvicMesh, part: 'pelvic_left' },
      { mesh: rightPelvicMesh, part: 'pelvic_right' },
      { mesh: caudalUpperMesh, part: 'caudal' },
      { mesh: caudalLowerMesh, part: 'caudal' },
    ];

    // 6. Sculpted Eyes with Nictitating Socket Rim (station 2..3)
    const eyeSocketGeo = new THREE.SphereGeometry(0.042, 14, 12);
    const eyeIrisGeo = new THREE.SphereGeometry(0.030, 14, 12);
    const eyePupilGeo = new THREE.SphereGeometry(0.020, 12, 10);
    const sharkEyes: THREE.Group[] = [];
    for (const side of [-1, 1]) {
      const eg = new THREE.Group();
      const sMesh = new THREE.Mesh(eyeSocketGeo, socketMat);
      sMesh.scale.set(0.72, 0.88, 1.15);
      const iMesh = new THREE.Mesh(eyeIrisGeo, irisMat);
      iMesh.position.set(side * 0.020, 0.003, 0.008);
      const pMesh = new THREE.Mesh(eyePupilGeo, pupilMat);
      pMesh.scale.set(0.75, 1.15, 0.75);
      pMesh.position.set(side * 0.032, 0.003, 0.012);
      eg.add(sMesh, iMesh, pMesh);
      group.add(eg);
      sharkEyes.push(eg);
    }

    // 7. Five Branchial Gill Slits per flank (10 total)
    const gillSlitGeo = new THREE.CylinderGeometry(0.0055, 0.0055, 0.11, 8);
    const gillSlits: { mesh: THREE.Mesh; side: number; index: number }[] = [];
    for (const side of [-1, 1]) {
      for (let g = 0; g < 5; g++) {
        const gMesh = new THREE.Mesh(gillSlitGeo, pupilMat);
        gMesh.renderOrder = 3;
        group.add(gMesh);
        gillSlits.push({ mesh: gMesh, side, index: g });
      }
    }

    // XPBD Wireframe Cage for Tiger Shark Spine & Lateral Rib Cross-Sections
    const numCageLines = (numSpine - 1) * 5;
    const tetLinePositions = new Float32Array(numCageLines * 2 * 3);
    const tetLineGeo = new THREE.BufferGeometry();
    const tetLineAttr = new THREE.BufferAttribute(tetLinePositions, 3);
    tetLineAttr.setUsage(THREE.DynamicDrawUsage);
    tetLineGeo.setAttribute('position', tetLineAttr);
    const tetLineMat = new THREE.LineBasicMaterial({
      color: '#38bdf8',
      transparent: true,
      opacity: 0.48,
    });
    const tetLines = new THREE.LineSegments(tetLineGeo, tetLineMat);
    tetLines.visible = false;
    tetLines.renderOrder = 4;
    scene.add(tetLines);

    let simTime = 0;
    let swimPhase = 0;
    let paramsState: TigerSharkSpecificParams = {
      ...TIGER_SHARK_SPECIMEN.defaultParams,
    };
    let grabPart: SharkGrabPart = 'none';
    let grabStationIdx = -1;
    const grabTarget = new THREE.Vector3();
    const activeGrabPointWorld = new THREE.Vector3();
    let bodyOffsetY = 0;
    let bodyVelY = 0;
    let jellySquash = 0;
    let jellySquashVel = 0;
    let tailRecoilVel = 0;
    let autoLiftTimer = 0;
    let bellyGripping = true;
    const beads: { pos: THREE.Vector3; vel: THREE.Vector3; r: number }[] = [
      {
        pos: new THREE.Vector3(1.15, 0.085, 0.95),
        vel: new THREE.Vector3(),
        r: 0.085,
      },
      {
        pos: new THREE.Vector3(-1.25, 0.085, -0.45),
        vel: new THREE.Vector3(),
        r: 0.085,
      },
    ];

    const applyFinLocalDeformation = (
      finObj: THREE.Object3D,
      finState: SharkFinDynamicState,
      outerDef: DeformableFinGeometry,
      innerDef?: DeformableFinGeometry
    ) => {
      // Compute root and rest tip in world space
      finState.rootWorld.copy(finObj.position);
      _v0.set(0, finState.span * 0.85, -finState.span * 0.35);
      _v0.applyQuaternion(finObj.quaternion).add(finObj.position);
      finState.tipWorld.copy(_v0);

      // Transform worldDeflect into the fin's local space so spanwise bending matches the drag direction
      _invQuat.copy(finObj.quaternion).invert();
      _v1.copy(finState.worldDeflect).applyQuaternion(_invQuat);
      outerDef.applyLocalBend(_v1.x, _v1.y, _v1.z);
      if (innerDef) {
        innerDef.applyLocalBend(_v1.x * 0.82, _v1.y * 0.82, _v1.z * 0.82);
      }
    };

    const syncVisuals = (cameraPosition: THREE.Vector3) => {
      const squashY = Math.max(0.68, 1.0 - jellySquash * 0.48);
      const squashXZ = 1.0 / Math.sqrt(squashY);
      const gillPulse = 1.0 + 0.045 * Math.sin(simTime * 3.2);

      // 1. Compute spine tangent yaw & pitch at every station
      for (let s = 0; s < numSpine; s++) {
        const prevSt = stations[Math.max(0, s - 1)];
        const nextSt = stations[Math.min(numSpine - 1, s + 1)];
        const dx = nextSt.pos.x - prevSt.pos.x;
        const dy = nextSt.pos.y - prevSt.pos.y;
        const dz = nextSt.pos.z - prevSt.pos.z;
        const horizLen = Math.hypot(dx, dz) || 1e-5;
        stations[s].yaw = Math.atan2(dx, -dz);
        stations[s].pitch = Math.atan2(dy, horizLen);
      }

      // Compute coupled trunk roll induced by dragging the top dorsal fin or left/right pectoral fins
      const dorsalTorqueRoll = -finStates.dorsal1.worldDeflect.x * 0.55;
      const pecTorqueRoll =
        (finStates.pec_left.worldDeflect.y - finStates.pec_right.worldDeflect.y) * 0.42;
      const totalFinRoll = Math.max(-0.42, Math.min(0.42, dorsalTorqueRoll + pecTorqueRoll));

      // 2. Update welded bilayer trunk & snout/mouth/gill micro-relief
      for (let s = 0; s < numSpine; s++) {
        const st = stations[s];
        const u = st.u;
        const cosYaw = Math.cos(st.yaw);
        const sinYaw = Math.sin(st.yaw);

        const bx = cosYaw;
        const bz = sinYaw;

        const isBranchial = u >= 0.15 && u <= 0.26;
        const branchialScale = isBranchial ? gillPulse : 1.0;

        const rx = st.rx * squashXZ * branchialScale;
        const ry = st.ry * squashY;

        // Local axial roll from fin dragging peaks around the pectoral/dorsal girdle (u ~ 0.28)
        const rollEnv = Math.exp(-Math.pow((u - 0.28) / 0.26, 2)) * totalFinRoll;
        const cosRoll = Math.cos(rollEnv);
        const sinRoll = Math.sin(rollEnv);

        for (let j = 0; j < vertsPerRing; j++) {
          const cosT = cosTable[j];
          const sinT = sinTable[j];

          let radialScaleX = 1.0;
          let radialScaleY = cosT < 0 ? 0.82 : 1.04;

          if (u < 0.14) {
            radialScaleY *= 0.78 + 0.22 * (u / 0.14);
            if (u >= 0.05 && u <= 0.13 && cosT < -0.55) {
              const mouthIndent =
                Math.sin(((u - 0.05) / 0.08) * Math.PI) * (-cosT - 0.55);
              radialScaleY -= mouthIndent * 0.42;
            }
          } else if (u >= 0.36 && u <= 0.66 && cosT > 0.85) {
            radialScaleY += (cosT - 0.85) * 0.35;
          } else if (u >= 0.72 && u <= 0.84 && Math.abs(sinT) > 0.82) {
            radialScaleX += (Math.abs(sinT) - 0.82) * 0.65;
          }

          const rawX = sinT * rx * radialScaleX;
          const rawY = cosT * ry * radialScaleY;
          const localX = rawX * cosRoll - rawY * sinRoll;
          const localY = rawX * sinRoll + rawY * cosRoll;

          const wx = st.pos.x + bx * localX;
          const wy = Math.max(0.010, st.pos.y + localY);
          const wz = st.pos.z + bz * localX;

          const nx = bx * sinT;
          const ny = cosT;
          const nz = bz * sinT;
          const nLen = Math.hypot(nx, ny, nz) || 1;

          const vIdx = (s * vertsPerRing + j) * 3;
          outerPos[vIdx] = wx;
          outerPos[vIdx + 1] = wy;
          outerPos[vIdx + 2] = wz;
          outerNorm[vIdx] = nx / nLen;
          outerNorm[vIdx + 1] = ny / nLen;
          outerNorm[vIdx + 2] = nz / nLen;

          const vScaleY = cosT > 0 ? 0.22 : 0.70;
          const innerRawX = sinT * rx * radialScaleX * 0.74;
          const innerRawY = -ry * 0.16 + cosT * ry * vScaleY;
          const innerLocalX = innerRawX * cosRoll - innerRawY * sinRoll;
          const innerLocalY = innerRawX * sinRoll + innerRawY * cosRoll;

          innerPos[vIdx] = st.pos.x + bx * innerLocalX;
          innerPos[vIdx + 1] = Math.max(0.018, st.pos.y + innerLocalY);
          innerPos[vIdx + 2] = st.pos.z + bz * innerLocalX;
          innerNorm[vIdx] = nx / nLen;
          innerNorm[vIdx + 1] = ny / nLen;
          innerNorm[vIdx + 2] = nz / nLen;
        }
      }

      outerPosAttr.needsUpdate = true;
      outerNormAttr.needsUpdate = true;
      innerPosAttr.needsUpdate = true;
      innerNormAttr.needsUpdate = true;

      // 3. Position, Orient & Deform First Dorsal Fin (Top Fin, station 9)
      const stD1 = stations[9];
      const dorsalRoll =
        -Math.sin(swimPhase - stD1.u * 5.8) * 0.12 * paramsState.tailBeatIntensity +
        totalFinRoll;
      firstDorsalGroup.position.set(
        stD1.pos.x,
        stD1.pos.y + stD1.ry * squashY * 0.86,
        stD1.pos.z
      );
      firstDorsalGroup.rotation.set(stD1.pitch * 0.5, -stD1.yaw, dorsalRoll);
      applyFinLocalDeformation(
        firstDorsalGroup,
        finStates.dorsal1,
        firstDorsalDef,
        firstDorsalCoreDef
      );

      // 4. Position, Orient & Deform Second Dorsal Fin & Ventral Anal Fin (station 19)
      const stD2 = stations[19];
      secondDorsalMesh.position.set(
        stD2.pos.x,
        stD2.pos.y + stD2.ry * squashY * 0.85,
        stD2.pos.z
      );
      secondDorsalMesh.rotation.set(stD2.pitch * 0.5, -stD2.yaw, dorsalRoll * 1.3);
      applyFinLocalDeformation(secondDorsalMesh, finStates.dorsal2, secondDorsalDef);

      analFinMesh.position.set(
        stD2.pos.x,
        Math.max(0.16, stD2.pos.y - stD2.ry * squashY * 0.78),
        stD2.pos.z - 0.06
      );
      analFinMesh.rotation.set(-stD2.pitch * 0.5, -stD2.yaw, Math.PI + dorsalRoll);

      // 5. Position, Orient & Deform Swept Left & Right Pectoral Fins (station 6)
      const stPec = stations[6];
      const cosPec = Math.cos(stPec.yaw);
      const sinPec = Math.sin(stPec.yaw);
      const pecDihedral =
        paramsState.swimPose === 'arch'
          ? 1.42
          : paramsState.swimPose === 'rest'
          ? 1.52
          : 1.32 + Math.sin(swimPhase * 0.5) * 0.06;

      leftPecGroup.position.set(
        stPec.pos.x + cosPec * (stPec.rx * squashXZ * 0.82),
        Math.max(0.04, stPec.pos.y - stPec.ry * squashY * 0.35),
        stPec.pos.z + sinPec * (stPec.rx * squashXZ * 0.82)
      );
      leftPecGroup.rotation.set(0.12, -stPec.yaw - 0.14, -pecDihedral);
      applyFinLocalDeformation(
        leftPecGroup,
        finStates.pec_left,
        leftPecDef,
        leftPecCoreDef
      );

      rightPecGroup.position.set(
        stPec.pos.x - cosPec * (stPec.rx * squashXZ * 0.82),
        Math.max(0.04, stPec.pos.y - stPec.ry * squashY * 0.35),
        stPec.pos.z - sinPec * (stPec.rx * squashXZ * 0.82)
      );
      rightPecGroup.rotation.set(0.12, -stPec.yaw + 0.14, pecDihedral);
      applyFinLocalDeformation(
        rightPecGroup,
        finStates.pec_right,
        rightPecDef,
        rightPecCoreDef
      );

      // 6. Position, Orient & Deform Pelvic Fins (station 15)
      const stPelv = stations[15];
      const cosPelv = Math.cos(stPelv.yaw);
      const sinPelv = Math.sin(stPelv.yaw);
      leftPelvicMesh.position.set(
        stPelv.pos.x + cosPelv * (stPelv.rx * 0.72),
        Math.max(0.03, stPelv.pos.y - stPelv.ry * 0.55),
        stPelv.pos.z + sinPelv * (stPelv.rx * 0.72)
      );
      leftPelvicMesh.rotation.set(0.10, -stPelv.yaw - 0.1, -1.22);
      applyFinLocalDeformation(leftPelvicMesh, finStates.pelvic_left, leftPelvicDef);

      rightPelvicMesh.position.set(
        stPelv.pos.x - cosPelv * (stPelv.rx * 0.72),
        Math.max(0.03, stPelv.pos.y - stPelv.ry * 0.55),
        stPelv.pos.z - sinPelv * (stPelv.rx * 0.72)
      );
      rightPelvicMesh.rotation.set(0.10, -stPelv.yaw + 0.1, 1.22);
      applyFinLocalDeformation(rightPelvicMesh, finStates.pelvic_right, rightPelvicDef);

      // 7. Position, Orient & Deform Heterocercal Bilobed Caudal Fin (station 23)
      const stTail = stations[23];
      const tailFeatherYaw =
        -stTail.yaw +
        Math.cos(swimPhase - 0.92 * 6.2) * 0.24 * paramsState.tailBeatIntensity;
      caudalGroup.position.set(stTail.pos.x, stTail.pos.y - 0.04, stTail.pos.z);
      caudalGroup.rotation.set(0, tailFeatherYaw, 0);
      applyFinLocalDeformation(
        caudalGroup,
        finStates.caudal,
        caudalUpperDef,
        caudalCoreDef
      );

      // 8. Position & Orient Shark Eyes (station 2)
      const stEye = stations[2];
      const cosEye = Math.cos(stEye.yaw);
      const sinEye = Math.sin(stEye.yaw);
      sharkEyes[0].position.set(
        stEye.pos.x - cosEye * (stEye.rx * squashXZ * 0.78),
        stEye.pos.y + stEye.ry * squashY * 0.12,
        stEye.pos.z - sinEye * (stEye.rx * squashXZ * 0.78)
      );
      sharkEyes[0].rotation.y = -stEye.yaw;

      sharkEyes[1].position.set(
        stEye.pos.x + cosEye * (stEye.rx * squashXZ * 0.78),
        stEye.pos.y + stEye.ry * squashY * 0.12,
        stEye.pos.z + sinEye * (stEye.rx * squashXZ * 0.78)
      );
      sharkEyes[1].rotation.y = -stEye.yaw;

      // 9. Position & Ventilate Five Branchial Gill Slits per side (stations 4..6)
      for (const gill of gillSlits) {
        const uGill = 0.165 + gill.index * 0.018;
        const fIdx = uGill * (numSpine - 1);
        const s0 = Math.floor(fIdx);
        const s1 = Math.min(numSpine - 1, s0 + 1);
        const frac = fIdx - s0;
        const stA = stations[s0];
        const stB = stations[s1];

        const gx = stA.pos.x * (1 - frac) + stB.pos.x * frac;
        const gy = stA.pos.y * (1 - frac) + stB.pos.y * frac;
        const gz = stA.pos.z * (1 - frac) + stB.pos.z * frac;
        const grx =
          (stA.rx * (1 - frac) + stB.rx * frac) * squashXZ * gillPulse;
        const gry = (stA.ry * (1 - frac) + stB.ry * frac) * squashY;
        const gyaw = stA.yaw * (1 - frac) + stB.yaw * frac;

        const cY = Math.cos(gyaw);
        const sY = Math.sin(gyaw);
        const gillFlare =
          0.005 * Math.max(0, Math.sin(simTime * 3.2 - gill.index * 0.35));

        gill.mesh.position.set(
          gx + gill.side * cY * (grx * 0.94 + gillFlare),
          gy - gry * 0.03,
          gz + gill.side * sY * (grx * 0.94 + gillFlare)
        );
        gill.mesh.scale.set(1, 0.85 - gill.index * 0.05, 1);
        gill.mesh.rotation.set(0.08, -gyaw, gill.side * 0.08);
      }

      // 10. Update Contact Shadow
      contactShadowMesh.position.x = stations[9].pos.x * 0.5;
      contactShadowMesh.position.z = stations[9].pos.z;
      contactShadowMat.opacity = Math.max(
        0.22,
        0.85 * Math.exp(-bodyOffsetY * 0.75)
      );

      // 11. Update Bait Beads
      for (let b = 0; b < maxBeads; b++) {
        const bead = beads[b];
        if (bead) {
          _v0.copy(bead.pos);
          _quat.identity();
          _scale.setScalar(bead.r);
          _mat4.compose(_v0, _quat, _scale);
        } else {
          _mat4.makeScale(0, 0, 0);
        }
        beadInstanced.setMatrixAt(b, _mat4);
      }
      beadInstanced.instanceMatrix.needsUpdate = true;

      // 12. Update XPBD Axial & Rib Cage Wireframe
      if (tetLines.visible) {
        let ptr = 0;
        for (let s = 0; s < numSpine - 1; s++) {
          const stA = stations[s];
          const stB = stations[s + 1];
          const cA = Math.cos(stA.yaw);
          const sA = Math.sin(stA.yaw);
          const cB = Math.cos(stB.yaw);
          const sB = Math.sin(stB.yaw);

          tetLinePositions[ptr++] = stA.pos.x;
          tetLinePositions[ptr++] = stA.pos.y;
          tetLinePositions[ptr++] = stA.pos.z;
          tetLinePositions[ptr++] = stB.pos.x;
          tetLinePositions[ptr++] = stB.pos.y;
          tetLinePositions[ptr++] = stB.pos.z;

          const offsets: [number, number][] = [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ];
          for (const [ox, oy] of offsets) {
            tetLinePositions[ptr++] = stA.pos.x + cA * ox * stA.rx * 0.85;
            tetLinePositions[ptr++] = stA.pos.y + oy * stA.ry * 0.85;
            tetLinePositions[ptr++] = stA.pos.z + sA * ox * stA.rx * 0.85;
            tetLinePositions[ptr++] = stB.pos.x + cB * ox * stB.rx * 0.85;
            tetLinePositions[ptr++] = stB.pos.y + oy * stB.ry * 0.85;
            tetLinePositions[ptr++] = stB.pos.z + sB * ox * stB.rx * 0.85;
          }
        }
        tetLineAttr.needsUpdate = true;
      }

      // 13. Update Grab Ring & Stress Subsurface Glow for both Fin Grabs and Spine Grabs
      if (grabPart !== 'none' && grabStationIdx >= 0) {
        if (grabPart === 'spine') {
          activeGrabPointWorld.copy(stations[grabStationIdx].pos);
        } else {
          const finSt = finStates[grabPart];
          activeGrabPointWorld
            .copy(finSt.grabOriginWorld)
            .add(finSt.worldDeflect);
        }

        grabRingMesh.visible = true;
        grabRingMesh.position.copy(activeGrabPointWorld);
        grabRingMesh.lookAt(cameraPosition);

        grabTetherLine.visible = true;
        grabTetherPositions[0] = activeGrabPointWorld.x;
        grabTetherPositions[1] = activeGrabPointWorld.y;
        grabTetherPositions[2] = activeGrabPointWorld.z;
        grabTetherPositions[3] = grabTarget.x;
        grabTetherPositions[4] = grabTarget.y;
        grabTetherPositions[5] = grabTarget.z;
        (
          grabTetherGeo.getAttribute('position') as THREE.BufferAttribute
        ).needsUpdate = true;
        sssUniforms.uGrabWorldPos.value.copy(activeGrabPointWorld);
        sssUniforms.uStressGlow.value = 0.95;
      } else {
        grabRingMesh.visible = false;
        grabTetherLine.visible = false;
        sssUniforms.uStressGlow.value = Math.max(
          Math.abs(jellySquash) * 1.2,
          tailRecoilVel * 0.35
        );
      }
    };

    syncVisuals(new THREE.Vector3(2.55, 1.85, 2.85));

    return {
      group,
      tetLines,

      applyParams(next: TigerSharkSpecificParams) {
        paramsState = { ...next };
      },

      setShowTetCage(visible: boolean) {
        tetLines.visible = visible;
      },

      dropBaitBead(x?: number, z?: number) {
        const angle = (beads.length * 1.35) % (Math.PI * 2);
        beads.push({
          pos: new THREE.Vector3(
            x ?? Math.sin(angle) * 1.45,
            0.78,
            z ?? Math.cos(angle) * 1.45
          ),
          vel: new THREE.Vector3(0, -1.1, 0),
          r: 0.085,
        });
        if (beads.length > maxBeads) beads.shift();
      },

      clearBeads() {
        beads.length = 0;
      },

      liftAndBounce() {
        autoLiftTimer = 0.28;
        grabPart = 'dorsal1';
        grabStationIdx = 9;
        finStates.dorsal1.grabOriginWorld.copy(finStates.dorsal1.tipWorld);
        grabTarget.set(0, 1.95, 0);
      },

      resetPose() {
        grabPart = 'none';
        grabStationIdx = -1;
        bodyOffsetY = 0;
        bodyVelY = 0;
        jellySquash = 0;
        jellySquashVel = 0;
        tailRecoilVel = 0;
        bellyGripping = true;
        for (const st of stations) {
          st.pos.set(0, st.restY, st.restZ);
          st.prevPos.set(0, st.restY, st.restZ);
          st.vel.set(0, 0, 0);
        }
        for (const fin of Object.values(finStates)) {
          fin.worldDeflect.set(0, 0, 0);
          fin.worldVel.set(0, 0, 0);
        }
      },

      tryGrabAtRay(ray: THREE.Ray) {
        group.updateMatrixWorld(true);
        _raycaster.ray.copy(ray);

        // 1. Direct mesh raycast against all shark fins (Top Dorsal, Left/Right Pectoral, 2nd Dorsal, Pelvic, Caudal)
        let bestFinPart: Exclude<SharkGrabPart, 'none' | 'spine'> | null = null;
        let bestHitDist = Infinity;
        const bestHitPt = new THREE.Vector3();

        for (const target of finMeshTargets) {
          const hits = _raycaster.intersectObject(target.mesh, false);
          if (hits.length > 0 && hits[0].distance < bestHitDist) {
            bestHitDist = hits[0].distance;
            bestFinPart = target.part;
            bestHitPt.copy(hits[0].point);
          }
        }

        // 2. Also check outer fin span segments (30%..100% span) so thin fin leading/trailing edges and tips are easy to grab
        // without stealing clicks meant for the central torso
        if (!bestFinPart) {
          let bestFinScore = Infinity;
          for (const fin of Object.values(finStates)) {
            const isPrimaryFin =
              fin.id === 'dorsal1' ||
              fin.id === 'pec_left' ||
              fin.id === 'pec_right' ||
              fin.id === 'caudal';
            const pickRadius = isPrimaryFin ? 0.28 : 0.16;
            _v1.lerpVectors(fin.rootWorld, fin.tipWorld, 0.28);
            const dSq = rayToSegmentDistSq(ray, _v1, fin.tipWorld, _v2);
            if (dSq < pickRadius * pickRadius && dSq < bestFinScore) {
              bestFinScore = dSq;
              bestFinPart = fin.id;
              bestHitPt.copy(_v2);
            }
          }
        }

        if (bestFinPart) {
          const fin = finStates[bestFinPart];
          grabPart = bestFinPart;
          grabStationIdx = fin.stationIdx;
          fin.grabOriginWorld.copy(bestHitPt).sub(fin.worldDeflect);
          grabTarget.copy(bestHitPt);
          return { grabbed: true, hitPoint: bestHitPt.clone() };
        }

        // 3. Otherwise check body mesh / axial spine stations (snout, branchial trunk, tailstock)
        let bestIdx = -1;
        let bestDistSq = 0.48 * 0.48;
        for (let s = 0; s < numSpine; s++) {
          const dSq = ray.distanceSqToPoint(stations[s].pos);
          if (dSq < bestDistSq) {
            bestDistSq = dSq;
            bestIdx = s;
          }
        }
        if (bestIdx >= 0) {
          grabPart = 'spine';
          grabStationIdx = bestIdx;
          grabTarget.copy(stations[bestIdx].pos);
          return { grabbed: true, hitPoint: stations[bestIdx].pos.clone() };
        }
        return { grabbed: false, hitPoint: _v0 };
      },

      updateGrabTarget(target: THREE.Vector3) {
        if (grabPart !== 'none' && grabStationIdx >= 0) {
          grabTarget.set(
            Math.max(-2.6, Math.min(2.6, target.x)),
            Math.max(0.04, Math.min(2.6, target.y)),
            Math.max(-2.6, Math.min(2.6, target.z))
          );
        }
      },

      releaseGrab() {
        if (grabPart !== 'none' && grabStationIdx >= 0) {
          if (grabPart !== 'spine') {
            const fin = finStates[grabPart];
            const finDisp = fin.worldDeflect.length();
            tailRecoilVel = Math.max(tailRecoilVel, Math.min(2.4, finDisp * 3.0));
          } else {
            const disp = Math.hypot(
              stations[grabStationIdx].pos.x,
              stations[grabStationIdx].pos.y -
                (stations[grabStationIdx].restY + bodyOffsetY)
            );
            tailRecoilVel = Math.min(2.6, disp * 3.2);
          }
          if (bodyOffsetY < 0.08) {
            jellySquashVel += 1.45;
          }
        }
        grabPart = 'none';
        grabStationIdx = -1;
      },

      stepAndSync(dt: number, cameraPosition: THREE.Vector3) {
        const clampedDt = Math.min(0.033, dt);
        if (clampedDt <= 1e-5) return;

        const drive = paramsState.tailBeatIntensity;
        const pose = paramsState.swimPose;
        const freq = pose === 'rest' ? 1.55 : pose === 'arch' ? 4.2 : 3.45;

        simTime += clampedDt;
        swimPhase += clampedDt * freq * (0.35 + 0.65 * drive);
        tailRecoilVel *= Math.exp(-3.8 * clampedDt);
        sssUniforms.uTime.value = simTime;

        if (autoLiftTimer > 0) {
          autoLiftTimer -= clampedDt;
          grabPart = 'dorsal1';
          grabStationIdx = 9;
          grabTarget.set(0, 1.95, 0);
          if (autoLiftTimer <= 0) {
            autoLiftTimer = 0;
            grabPart = 'none';
            grabStationIdx = -1;
          }
        }

        // 0. Update viscoelastic fin hydrofoil bending & spring-damper recoil
        for (const fin of Object.values(finStates)) {
          if (grabPart === fin.id) {
            _v0.copy(grabTarget).sub(fin.grabOriginWorld);
            const maxFinStretch = fin.span * 1.15;
            if (_v0.length() > maxFinStretch) {
              _v0.setLength(maxFinStretch);
            }
            const follow = 1 - Math.exp(-24.0 * clampedDt);
            fin.worldDeflect.lerp(_v0, follow);
            fin.worldVel.set(0, 0, 0);
          } else {
            // Underdamped harmonic jelly hydrofoil snap-back
            const omegaSq = 380.0;
            const damp = 5.2;
            fin.worldVel.x +=
              (-omegaSq * fin.worldDeflect.x - damp * fin.worldVel.x) * clampedDt;
            fin.worldVel.y +=
              (-omegaSq * fin.worldDeflect.y - damp * fin.worldVel.y) * clampedDt;
            fin.worldVel.z +=
              (-omegaSq * fin.worldDeflect.z - damp * fin.worldVel.z) * clampedDt;
            fin.worldDeflect.addScaledVector(fin.worldVel, clampedDt);
          }
        }

        // 1. Update bait beads on the studio platter
        for (const b of beads) {
          b.vel.y -= 16.5 * clampedDt;
          b.pos.addScaledVector(b.vel, clampedDt);
          if (b.pos.y < b.r) {
            b.pos.y = b.r;
            b.vel.y = b.vel.y < -0.25 ? -b.vel.y * 0.24 : 0;
          }
        }

        // 2. Whole-body vertical lift & multi-bounce jelly landing
        if (grabPart !== 'none' && grabStationIdx >= 0) {
          const baseRestY =
            grabPart === 'dorsal1'
              ? stations[9].restY + 0.55
              : stations[grabStationIdx].restY;
          const desiredLift = Math.max(0, grabTarget.y - baseRestY);
          if (desiredLift > 0.34) bellyGripping = false;
          const prevY = bodyOffsetY;
          const regionLiftCoupling =
            grabPart === 'pec_left' || grabPart === 'pec_right'
              ? 0.55
              : grabStationIdx >= 18 || grabStationIdx <= 3
              ? 0.45
              : 0.92;
          bodyOffsetY +=
            (desiredLift * (bellyGripping ? 0.32 : regionLiftCoupling) -
              bodyOffsetY) *
            0.22;
          bodyVelY = (bodyOffsetY - prevY) / clampedDt;
        } else {
          if (bodyOffsetY > 0.001 || Math.abs(bodyVelY) > 0.02) {
            bodyVelY -= 16.5 * clampedDt;
            bodyOffsetY += bodyVelY * clampedDt;
            if (bodyOffsetY <= 0) {
              bodyOffsetY = 0;
              if (bodyVelY < -0.28) {
                jellySquashVel += -bodyVelY * 2.7;
                tailRecoilVel = Math.max(tailRecoilVel, -bodyVelY * 0.45);
                bodyVelY = -bodyVelY * 0.62;
              } else {
                bodyVelY = 0;
                bellyGripping = true;
              }
            }
          }
          const accel = -625.0 * jellySquash - 3.6 * jellySquashVel;
          jellySquashVel += accel * clampedDt;
          jellySquash = Math.max(
            -0.35,
            Math.min(0.42, jellySquash + jellySquashVel * clampedDt)
          );
        }

        // 3. Chemotactic snout orientation toward nearest front bait bead
        let baitSteerX = 0;
        for (const b of beads) {
          if (b.pos.z > 0.1) {
            const dist = Math.hypot(b.pos.x, b.pos.z - 1.25);
            if (dist < 2.2) {
              baitSteerX = Math.max(-0.26, Math.min(0.26, b.pos.x * 0.22));
              break;
            }
          }
        }

        // 4. Lighthill Carangiform Axial Wave + Pose Kinematics + Fin/Body Drag Coupling
        const poseAmp = pose === 'rest' ? 0.2 : pose === 'arch' ? 0.65 : 1.0;

        for (let s = 0; s < numSpine; s++) {
          const st = stations[s];
          const u = st.u;

          const carangiformEnv =
            0.032 * (1 - u * 2.2) +
            0.44 * Math.pow(Math.max(0, u - 0.1) / 0.9, 2.05);

          const primaryWave = Math.sin(swimPhase - u * 6.1);
          const recoilWave =
            tailRecoilVel > 0.01
              ? Math.sin(simTime * 19.0 - u * 7.2) *
                tailRecoilVel *
                Math.pow(u, 1.3) *
                0.12
              : 0;

          const snoutSteer = (1 - Math.min(1, u * 2.2)) * baitSteerX;
          const lateralWave =
            primaryWave * carangiformEnv * drive * poseAmp +
            recoilWave +
            snoutSteer;

          let verticalPosture = 0;
          if (pose === 'arch') {
            verticalPosture =
              (Math.pow(Math.abs(u - 0.36), 1.55) * 0.52 - 0.04) *
              Math.max(0.4, drive);
          } else if (pose === 'rest') {
            verticalPosture =
              -0.07 + 0.015 * Math.sin(simTime * 2.4 - u * 3.0);
          } else {
            verticalPosture =
              Math.cos(swimPhase * 2.0 - u * 6.1) * 0.022 * u * drive;
          }

          let targetX = lateralWave;
          let targetY = st.restY + bodyOffsetY + verticalPosture;
          let targetZ = st.restZ - 0.08 * lateralWave * lateralWave;

          if (grabPart !== 'none' && grabStationIdx >= 0) {
            const uGrab = stations[grabStationIdx].u;
            const uDist = Math.abs(u - uGrab);
            const falloff = Math.exp(-uDist * uDist * 8.5);
            if (grabPart === 'spine') {
              targetX += (grabTarget.x - targetX) * falloff * 0.85;
              targetY += (grabTarget.y - targetY) * falloff * 0.85;
              targetZ += (grabTarget.z - targetZ) * falloff * 0.55;
            } else {
              // Coupled fin-to-trunk force transmission when dragging dorsal, pectoral, pelvic, or caudal fins
              const finDef = finStates[grabPart].worldDeflect;
              const finTrunkCoupling = grabPart === 'dorsal1' ? 0.52 : 0.44;
              targetX += finDef.x * falloff * finTrunkCoupling;
              targetY += finDef.y * falloff * finTrunkCoupling;
              targetZ += finDef.z * falloff * (finTrunkCoupling * 0.65);
            }
          }

          const follow = 1 - Math.exp(-18.0 * clampedDt);
          st.pos.x += (targetX - st.pos.x) * follow;
          st.pos.y +=
            (Math.max(st.ry * 0.82 + 0.014, targetY) - st.pos.y) * follow;
          st.pos.z += (targetZ - st.pos.z) * follow;
        }

        // 5. Two-pass XPBD Axial Spine Distance & Bending Regularization
        for (let iter = 0; iter < 2; iter++) {
          for (let s = 1; s < numSpine; s++) {
            const st0 = stations[s - 1];
            const st1 = stations[s];
            const dx = st1.pos.x - st0.pos.x;
            const dy = st1.pos.y - st0.pos.y;
            const dz = st1.pos.z - st0.pos.z;
            const dLen = Math.hypot(dx, dy, dz) || 1e-5;
            const corr = ((segRestLen - dLen) / dLen) * 0.45;
            st1.pos.x += dx * corr;
            st1.pos.y += dy * corr * 0.35;
            st1.pos.z += dz * corr;
            st0.pos.x -= dx * corr * 0.35;
            st0.pos.z -= dz * corr * 0.35;
          }

          for (let s = 1; s < numSpine - 1; s++) {
            const w = 0.18;
            stations[s].pos.x =
              stations[s].pos.x * (1 - 2 * w) +
              (stations[s - 1].pos.x + stations[s + 1].pos.x) * w;
            stations[s].pos.y =
              stations[s].pos.y * (1 - 2 * w) +
              (stations[s - 1].pos.y + stations[s + 1].pos.y) * w;
          }
        }

        syncVisuals(cameraPosition);
      },

      getTelemetry(): SpecimenTelemetry {
        const snoutPos = stations[0].pos;
        const tailPos = stations[numSpine - 1].pos;
        const liveLengthCm =
          Math.round(snoutPos.distanceTo(tailPos) * 11.2 * 10) / 10;
        const dorsalHeightCm =
          Math.round(
            (stations[9].pos.y + 0.56 + finStates.dorsal1.worldDeflect.y * 0.5) *
              12.0 *
              10
          ) / 10;

        let regionLabel =
          'Drag top dorsal fin, left/right pectoral fins, snout, or fluke · Feel hydrofoil flex';
        if (grabPart === 'dorsal1') {
          regionLabel =
            'First Dorsal Fin (Top) · Elastic Hydrofoil Flex & Dorsal Trunk Torque';
        } else if (grabPart === 'pec_left') {
          regionLabel =
            'Left Pectoral Fin · Swept Bilayer Hydrofoil Bend & Banking Roll';
        } else if (grabPart === 'pec_right') {
          regionLabel =
            'Right Pectoral Fin · Swept Bilayer Hydrofoil Bend & Banking Roll';
        } else if (grabPart === 'dorsal2') {
          regionLabel = 'Second Dorsal Fin · Posterior Stabilizer Flex';
        } else if (grabPart === 'pelvic_left' || grabPart === 'pelvic_right') {
          regionLabel = 'Pelvic Hydrofoil Fin · Ventral Trim Flex';
        } else if (grabPart === 'caudal') {
          regionLabel =
            'Heterocercal Caudal Fin · Bilobed Propulsive Fluke Whip';
        } else if (grabPart === 'spine' && grabStationIdx >= 0) {
          regionLabel =
            grabStationIdx < 5
              ? 'Blunt Wedge Snout · Countershaded Rostral Hydrostat'
              : grabStationIdx < 12
              ? 'Branchial Trunk · Cohesive Bilayer Lift'
              : grabStationIdx < 20
              ? 'Precaudal Trunk · Muscular Lateral Wave'
              : 'Caudal Peduncle · Elastic Propulsive Whip';
        }

        return {
          specimenPrefix: 'SHK-JL-02',
          adhesionLabel: 'Belly Adhesion',
          adhesionPct: bellyGripping ? 100 : 0,
          grabRegionLabel: regionLabel,
          activeBeadCount: beads.length,
          isDragging: grabPart !== 'none' && grabStationIdx >= 0,
          meanStrainPct:
            Math.round(paramsState.tailBeatIntensity * 8.4 * 10) / 10,
          metrics: [
            {
              id: 'mass',
              label: 'Mass',
              value: (1740.0 + beads.length * 4.2).toFixed(1),
              unit: 'g',
              testId: 'readout-mass',
            },
            {
              id: 'volume',
              label: 'Volume',
              value: (1648.6 * (1 - jellySquash * 0.04)).toFixed(1),
              unit: 'cm³',
              testId: 'readout-volume',
            },
            {
              id: 'armSpan',
              label: 'Body Length',
              value: liveLengthCm.toFixed(1),
              unit: 'cm',
              testId: 'readout-arm-span',
            },
            {
              id: 'mantleHeight',
              label: 'Dorsal Height',
              value: dorsalHeightCm.toFixed(1),
              unit: 'cm',
              testId: 'readout-mantle-height',
            },
          ],
        };
      },

      dispose() {
        scene.remove(group);
        scene.remove(tetLines);
        outerGeo.dispose();
        innerGeo.dispose();
        firstDorsalDef.dispose();
        firstDorsalCoreDef.dispose();
        secondDorsalDef.dispose();
        analFinDef.dispose();
        leftPecDef.dispose();
        leftPecCoreDef.dispose();
        rightPecDef.dispose();
        rightPecCoreDef.dispose();
        leftPelvicDef.dispose();
        rightPelvicDef.dispose();
        caudalUpperDef.dispose();
        caudalLowerDef.dispose();
        caudalCoreDef.dispose();
        eyeSocketGeo.dispose();
        eyeIrisGeo.dispose();
        eyePupilGeo.dispose();
        gillSlitGeo.dispose();
        tetLineGeo.dispose();
        tetLineMat.dispose();
      },
    };
  },
};
