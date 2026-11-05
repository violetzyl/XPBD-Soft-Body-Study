import * as THREE from 'three';
import { MarlinSpineStation } from './blueMarlinSim';

export interface DeformableFalcateFin {
  geometry: THREE.BufferGeometry;
  span: number;
  applyLocalBendAndScale: (
    bendX: number,
    bendY: number,
    bendZ: number,
    scaleY?: number,
    scaleXZ?: number
  ) => void;
  dispose: () => void;
}

export interface SpineSkinnedSailDorsal {
  geometry: THREE.BufferGeometry;
  span: number;
  updateFromSpine: (
    stations: MarlinSpineStation[],
    stationRenderY: Float32Array,
    squashY: number,
    scaleY: number,
    scaleXZ: number,
    sweepFold: number,
    worldDeflect: THREE.Vector3,
    grabChordU: number,
    swimPhase: number,
    effectiveSwish: number,
    outRootWorld: THREE.Vector3,
    outTipWorld: THREE.Vector3
  ) => void;
  dispose: () => void;
}

/**
 * Builds a watertight, single-layer falcate (sickle-shaped) hydrofoil fin geometry
 * characterized by a convex leading edge and a concave/falcate trailing edge:
 * - Root chord lies along Z (`[-rootChord * 0.5, +rootChord * 0.5]`) at `y = 0`
 * - Span extends along `+Y` (`[0, span]`)
 * - UVs map strictly into the dedicated fin-ray normal & pigment band (`u in 0.89..0.99`)
 * - Uses dirty-check caching in `applyLocalBendAndScale` to skip redundant vertex buffer uploads when at rest.
 */
export function createFalcateFinGeometry(
  rootChord: number,
  tipChord: number,
  span: number,
  sweep: number,
  maxThickness: number,
  falcateHook = 0.14,
  spanSegs = 16,
  chordSegs = 14
): DeformableFalcateFin {
  const vertsPerRing = chordSegs * 2 + 1;
  const numRings = spanSegs + 1;
  const totalVerts = numRings * vertsPerRing;

  const restPositions = new Float32Array(totalVerts * 3);
  const restNormals = new Float32Array(totalVerts * 3);
  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const spanFactors = new Float32Array(numRings);
  const uvs = new Float32Array(totalVerts * 2);
  const indices: number[] = [];

  for (let r = 0; r < numRings; r++) {
    const vSpan = r / spanSegs;
    spanFactors[r] = Math.pow(vSpan, 1.35);

    const tipCap =
      vSpan > 0.88 ? Math.sqrt(Math.max(0.001, (1 - vSpan) / 0.12)) : 1.0;

    // Convex leading edge + falcate (scalloped concave) trailing edge chord profile
    const falcatePinch = 1.0 - 0.38 * Math.sin(Math.pow(vSpan, 0.72) * Math.PI);
    const chord =
      (rootChord * (1 - vSpan) + tipChord * vSpan) * falcatePinch * tipCap;
    const halfThick =
      maxThickness * (1 - 0.76 * Math.pow(vSpan, 1.08)) * tipCap;

    // Convex leading edge curve sweeping backward toward the tip
    const leadZ =
      0.46 * rootChord * Math.cos(vSpan * Math.PI * 0.46) -
      sweep * Math.pow(vSpan, 1.32) -
      falcateHook * Math.sin(vSpan * Math.PI);
    const y = span * vSpan;

    for (let j = 0; j < vertsPerRing; j++) {
      const angle = (j / (vertsPerRing - 1)) * Math.PI * 2;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      const c = 0.5 * (1 - cosA); // 0 at leading edge, 1 at trailing edge
      const foilEnv =
        Math.sin(Math.pow(c, 0.58) * Math.PI) * (1 - 0.30 * c);

      const x = sinA * halfThick * foilEnv;
      const z = leadZ - c * chord;

      const vIdx = (r * vertsPerRing + j) * 3;
      restPositions[vIdx] = x;
      restPositions[vIdx + 1] = y;
      restPositions[vIdx + 2] = z;
      positions[vIdx] = x;
      positions[vIdx + 1] = y;
      positions[vIdx + 2] = z;

      const nx = sinA * 0.92;
      const ny = vSpan > 0.92 ? 0.52 : 0.10 * vSpan;
      const nz = cosA * 0.38;
      const nLen = Math.hypot(nx, ny, nz) || 1;
      restNormals[vIdx] = nx / nLen;
      restNormals[vIdx + 1] = ny / nLen;
      restNormals[vIdx + 2] = nz / nLen;
      normals[vIdx] = restNormals[vIdx];
      normals[vIdx + 1] = restNormals[vIdx + 1];
      normals[vIdx + 2] = restNormals[vIdx + 2];

      const uvIdx = (r * vertsPerRing + j) * 2;
      uvs[uvIdx] = 0.89 + vSpan * 0.095;
      uvs[uvIdx + 1] = c * 0.88;
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
    geo.boundingSphere.radius *= 2.5;
  }

  let lastBx = 0;
  let lastBy = 0;
  let lastBz = 0;
  let lastSy = 1.0;
  let lastSxz = 1.0;

  return {
    geometry: geo,
    span,
    applyLocalBendAndScale(
      bendX: number,
      bendY: number,
      bendZ: number,
      scaleY = 1.0,
      scaleXZ = 1.0
    ) {
      if (
        Math.abs(bendX - lastBx) < 1e-4 &&
        Math.abs(bendY - lastBy) < 1e-4 &&
        Math.abs(bendZ - lastBz) < 1e-4 &&
        Math.abs(scaleY - lastSy) < 1e-4 &&
        Math.abs(scaleXZ - lastSxz) < 1e-4
      ) {
        return;
      }
      lastBx = bendX;
      lastBy = bendY;
      lastBz = bendZ;
      lastSy = scaleY;
      lastSxz = scaleXZ;

      // Rotate normals slightly with lateral bend so bent fin faces never shade flat/dark
      const maxBendAngle = Math.atan2(bendX, Math.max(0.15, span * scaleY)) * 0.65;

      for (let r = 0; r < numRings; r++) {
        const w = spanFactors[r];
        const dx = bendX * w;
        const dy = bendY * w;
        const dz = bendZ * w;
        const ang = maxBendAngle * w;
        const cosB = Math.cos(ang);
        const sinB = Math.sin(ang);

        const rowBase = r * vertsPerRing;
        for (let j = 0; j < vertsPerRing; j++) {
          const vIdx = (rowBase + j) * 3;
          positions[vIdx] = restPositions[vIdx] * scaleXZ + dx;
          positions[vIdx + 1] = restPositions[vIdx + 1] * scaleY + dy;
          positions[vIdx + 2] = restPositions[vIdx + 2] * scaleXZ + dz;

          const rnx = restNormals[vIdx];
          const rny = restNormals[vIdx + 1];
          normals[vIdx] = rnx * cosB - rny * sinB;
          normals[vIdx + 1] = rnx * sinB + rny * cosB;
          normals[vIdx + 2] = restNormals[vIdx + 2];
        }
      }
      posAttr.needsUpdate = true;
      normAttr.needsUpdate = true;
    },
    dispose() {
      geo.dispose();
    },
  };
}

/**
 * Builds a unified, continuous High Crescent-Shaped Lunate Caudal Tail geometry
 * spanning from the lower falcate lobe tip (`s = -1`) through the central caudal fork (`s = 0`)
 * to the upper falcate lobe tip (`s = +1`) with zero overlapping/interpenetrating sub-meshes.
 */
export function createMarlinLunateCaudalGeometry(
  upperSpan = 1.04,
  lowerSpan = 0.96,
  rootChord = 0.34,
  tipChord = 0.042,
  sweep = 0.64,
  maxThickness = 0.032,
  spanSegsPerLobe = 16,
  chordSegs = 14
): DeformableFalcateFin {
  const numRings = spanSegsPerLobe * 2 + 1;
  const vertsPerRing = chordSegs * 2 + 1;
  const totalVerts = numRings * vertsPerRing;

  const restPositions = new Float32Array(totalVerts * 3);
  const restNormals = new Float32Array(totalVerts * 3);
  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const spanFactors = new Float32Array(numRings);
  const uvs = new Float32Array(totalVerts * 2);
  const indices: number[] = [];

  for (let r = 0; r < numRings; r++) {
    const signedSpan = (r - spanSegsPerLobe) / spanSegsPerLobe;
    const absSpan = Math.abs(signedSpan);
    const lobeSpan = signedSpan >= 0 ? upperSpan : lowerSpan;
    spanFactors[r] = Math.pow(absSpan, 1.38);

    const tipCap =
      absSpan > 0.88 ? Math.sqrt(Math.max(0.001, (1 - absSpan) / 0.12)) : 1.0;

    const forkNotch =
      0.42 + 0.58 * Math.sin(Math.pow(absSpan, 0.55) * (Math.PI * 0.5));
    const falcateScallop =
      1.0 - 0.34 * Math.sin(Math.pow(absSpan, 0.78) * Math.PI);
    const chord =
      (rootChord * (1 - absSpan) + tipChord * absSpan) *
      forkNotch *
      falcateScallop *
      tipCap;

    const halfThick =
      maxThickness * (1 - 0.74 * Math.pow(absSpan, 1.1)) * tipCap;

    const leadZ =
      0.12 * rootChord * Math.cos(absSpan * Math.PI * 0.48) -
      sweep * Math.pow(absSpan, 1.28);
    const y = signedSpan * lobeSpan;

    for (let j = 0; j < vertsPerRing; j++) {
      const angle = (j / (vertsPerRing - 1)) * Math.PI * 2;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      const c = 0.5 * (1 - cosA);
      const foilEnv =
        Math.sin(Math.pow(c, 0.56) * Math.PI) * (1 - 0.32 * c);

      const x = sinA * halfThick * foilEnv;
      const z = leadZ - c * chord;

      const vIdx = (r * vertsPerRing + j) * 3;
      restPositions[vIdx] = x;
      restPositions[vIdx + 1] = y;
      restPositions[vIdx + 2] = z;
      positions[vIdx] = x;
      positions[vIdx + 1] = y;
      positions[vIdx + 2] = z;

      const nx = sinA * 0.92;
      const ny = signedSpan * 0.16;
      const nz = cosA * 0.36;
      const nLen = Math.hypot(nx, ny, nz) || 1;
      restNormals[vIdx] = nx / nLen;
      restNormals[vIdx + 1] = ny / nLen;
      restNormals[vIdx + 2] = nz / nLen;
      normals[vIdx] = restNormals[vIdx];
      normals[vIdx + 1] = restNormals[vIdx + 1];
      normals[vIdx + 2] = restNormals[vIdx + 2];

      const uvIdx = (r * vertsPerRing + j) * 2;
      uvs[uvIdx] = 0.89 + absSpan * 0.095;
      uvs[uvIdx + 1] = 0.06 + c * 0.86;
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
    geo.boundingSphere.radius *= 2.5;
  }

  let lastBx = 0;
  let lastBy = 0;
  let lastBz = 0;
  let lastSy = 1.0;
  let lastSxz = 1.0;

  return {
    geometry: geo,
    span: upperSpan,
    applyLocalBendAndScale(
      bendX: number,
      bendY: number,
      bendZ: number,
      scaleY = 1.0,
      scaleXZ = 1.0
    ) {
      if (
        Math.abs(bendX - lastBx) < 1e-4 &&
        Math.abs(bendY - lastBy) < 1e-4 &&
        Math.abs(bendZ - lastBz) < 1e-4 &&
        Math.abs(scaleY - lastSy) < 1e-4 &&
        Math.abs(scaleXZ - lastSxz) < 1e-4
      ) {
        return;
      }
      lastBx = bendX;
      lastBy = bendY;
      lastBz = bendZ;
      lastSy = scaleY;
      lastSxz = scaleXZ;

      const maxBendAngle =
        Math.atan2(bendX, Math.max(0.2, upperSpan * scaleY)) * 0.65;

      for (let r = 0; r < numRings; r++) {
        const w = spanFactors[r];
        const dx = bendX * w;
        const dy = bendY * w;
        const dz = bendZ * w;
        const ang = maxBendAngle * w;
        const cosB = Math.cos(ang);
        const sinB = Math.sin(ang);

        const rowBase = r * vertsPerRing;
        for (let j = 0; j < vertsPerRing; j++) {
          const vIdx = (rowBase + j) * 3;
          positions[vIdx] = restPositions[vIdx] * scaleXZ + dx;
          positions[vIdx + 1] = restPositions[vIdx + 1] * scaleY + dy;
          positions[vIdx + 2] = restPositions[vIdx + 2] * scaleXZ + dz;

          const rnx = restNormals[vIdx];
          const rny = restNormals[vIdx + 1];
          normals[vIdx] = rnx * cosB - rny * sinB;
          normals[vIdx + 1] = rnx * sinB + rny * cosB;
          normals[vIdx + 2] = restNormals[vIdx + 2];
        }
      }
      posAttr.needsUpdate = true;
      normAttr.needsUpdate = true;
    },
    dispose() {
      geo.dispose();
    },
  };
}

/**
 * Builds an anatomically contoured Shorter Lower Jaw (Mandible) geometry that hinges cleanly
 * at the ventral mandibular joint (`z = 0`, `u = 0.235`) and tapers forward (`+Z`) to a rounded
 * spear point without protruding into the upper head or inner belly core.
 */
export function createMarlinMandibleGeometry(
  length = 0.44,
  baseHalfWidth = 0.052,
  baseDepth = 0.036,
  axialSegs = 12,
  radialSegs = 14
): THREE.BufferGeometry {
  const vertsPerRing = radialSegs + 1;
  const totalVerts = (axialSegs + 1) * vertsPerRing;
  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const indices: number[] = [];

  for (let i = 0; i <= axialSegs; i++) {
    const t = i / axialSegs;
    const taper = Math.pow(1 - t, 0.82);
    const rootSeal = i === 0 ? 0.02 : 1.0;
    const rx = (0.006 + baseHalfWidth * taper) * rootSeal;
    const ry = (0.005 + baseDepth * taper) * rootSeal;
    const z = t * length;

    for (let j = 0; j < vertsPerRing; j++) {
      const theta = (j / radialSegs) * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      const x = sinT * rx;
      const y = cosT > 0 ? cosT * ry * 0.35 : cosT * ry;

      const vIdx = (i * vertsPerRing + j) * 3;
      positions[vIdx] = x;
      positions[vIdx + 1] = y;
      positions[vIdx + 2] = z;

      const nLen = Math.hypot(sinT, cosT, 0.15) || 1;
      normals[vIdx] = sinT / nLen;
      normals[vIdx + 1] = cosT / nLen;
      normals[vIdx + 2] = 0.15 / nLen;

      const uvIdx = (i * vertsPerRing + j) * 2;
      uvs[uvIdx] = 0.235 - t * 0.115;
      uvs[uvIdx + 1] = 0.38 + (j / radialSegs) * 0.24;
    }

    if (i < axialSegs) {
      for (let j = 0; j < radialSegs; j++) {
        const a = i * vertsPerRing + j;
        const b = a + 1;
        const c = (i + 1) * vertsPerRing + j;
        const d = c + 1;
        indices.push(a, b, c);
        indices.push(b, d, c);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

/**
 * Builds the Spine-Skinned Primary Dorsal Fin geometry (`u in [0.265, 0.685]`):
 * - Column `c = 0` forms the full-height convex leading edge sweeping up and back to the apex,
 *   while `c = 1..chordSegs` forms the falcate trailing scallop and low dorsal crest.
 * - Bending and backward sweep are parameterized by normalized physical height `hNorm = (colSpan * vSpan) / tallAnteriorSpan`
 *   so adjacent chord columns NEVER cross, overtake, or invert into gray triangles when dragged laterally!
 * - Surface normals and thickness offsets rotate with the lateral bend slope so both faces shade accurately.
 */
export function createSpineSkinnedSailDorsal(
  tallAnteriorSpan = 0.82,
  lowCrestSpan = 0.175,
  chordSegs = 28,
  spanSegs = 12
): SpineSkinnedSailDorsal {
  const vertsPerRing = spanSegs * 2 + 1; // Watertight closed hydrofoil loop around each chord column
  const numCols = chordSegs + 1;
  const totalVerts = numCols * vertsPerRing;

  const colRestSpans = new Float32Array(numCols);
  const colU = new Float32Array(numCols);
  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const indices: number[] = [];

  for (let c = 0; c <= chordSegs; c++) {
    const uChord = c / chordSegs; // 0 at anterior nape leading edge (u=0.265), 1 at posterior crest end (u=0.685)
    colU[c] = 0.265 + uChord * 0.42;

    // Column c = 0..2 forms the rounded high apex of the anterior lobe (tallAnteriorSpan),
    // then scallops smoothly along a concave falcate curve (uChord = 0.06..0.44) into the low crest (0.44..1.0)
    let colSpan: number;
    if (uChord <= 0.06) {
      const tApex = uChord / 0.06;
      colSpan = tallAnteriorSpan * (0.94 + 0.06 * Math.sin(tApex * (Math.PI * 0.5)));
    } else if (uChord <= 0.44) {
      const tScallop = (uChord - 0.06) / 0.38;
      const falcateDecay = Math.pow(1 - tScallop, 1.85);
      colSpan = lowCrestSpan + (tallAnteriorSpan - lowCrestSpan) * falcateDecay;
    } else {
      const tTail = (uChord - 0.44) / 0.56;
      colSpan =
        lowCrestSpan *
        (1 - 0.46 * tTail) *
        Math.sin(Math.pow(1 - tTail * 0.88, 0.55) * (Math.PI * 0.5));
    }
    colRestSpans[c] = Math.max(0.032, colSpan);

    for (let j = 0; j < vertsPerRing; j++) {
      // j goes from 0 (root +X) -> spanSegs (top ridge tip) -> 2*spanSegs (root -X)
      const signedR = (j - spanSegs) / spanSegs; // -1 at +X root, 0 at top tip, +1 at -X root
      const vSpan = 1.0 - Math.abs(signedR); // 0 at root, 1 at top margin

      const uvIdx = (c * vertsPerRing + j) * 2;
      uvs[uvIdx] = 0.89 + vSpan * 0.095;
      uvs[uvIdx + 1] = 0.04 + uChord * 0.86;
    }

    if (c < chordSegs) {
      for (let j = 0; j < vertsPerRing - 1; j++) {
        const a = c * vertsPerRing + j;
        const b = a + 1;
        const d0 = (c + 1) * vertsPerRing + j;
        const d1 = d0 + 1;
        indices.push(a, d0, b);
        indices.push(d0, d1, b);
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
    geo.boundingSphere.radius = 3.5;
  }

  return {
    geometry: geo,
    span: tallAnteriorSpan,
    updateFromSpine(
      stations: MarlinSpineStation[],
      stationRenderY: Float32Array,
      squashY: number,
      scaleY: number,
      scaleXZ: number,
      sweepFold: number,
      worldDeflect: THREE.Vector3,
      grabChordU: number,
      swimPhase: number,
      effectiveSwish: number,
      outRootWorld: THREE.Vector3,
      outTipWorld: THREE.Vector3
    ) {
      const maxIdx = stations.length - 1;
      for (let c = 0; c <= chordSegs; c++) {
        const uChord = c / chordSegs;
        const uAxial = colU[c];
        const fIdx = uAxial * maxIdx;
        const idx0 = Math.min(maxIdx, Math.max(0, Math.floor(fIdx)));
        const idx1 = Math.min(maxIdx, idx0 + 1);
        const frac = fIdx - idx0;

        const st0 = stations[idx0];
        const st1 = stations[idx1];

        const sx = st0.pos.x + (st1.pos.x - st0.pos.x) * frac;
        const syRender =
          stationRenderY[idx0] + (stationRenderY[idx1] - stationRenderY[idx0]) * frac;
        const sz = st0.pos.z + (st1.pos.z - st0.pos.z) * frac;
        const ry = st0.ry + (st1.ry - st0.ry) * frac;
        const dArch = st0.dorsalArch + (st1.dorsalArch - st0.dorsalArch) * frac;
        const yaw = st0.yaw + (st1.yaw - st0.yaw) * frac;

        const cosYaw = Math.cos(yaw);
        const sinYaw = Math.sin(yaw);

        // Embed root inside the dorsal ridge of outerMesh so the fin emerges seamlessly
        const ridgeY = Math.max(
          0.04,
          syRender + (ry + dArch) * squashY - 0.022
        );

        const colSpan = colRestSpans[c];
        // Smooth hydrofoil thickness envelope along the chord (tapered at leading & trailing edges)
        const chordFoilEnv =
          0.25 + 0.75 * Math.sin(Math.pow(uChord, 0.52) * Math.PI);

        // Regional chord compliance around grabbed dorsal region so dragging bends smoothly
        const chordDist = Math.abs(uChord - grabChordU);
        const chordBendMask =
          0.35 + 0.65 * Math.exp(-Math.pow(chordDist / 0.42, 2));

        if (c === 2) {
          outRootWorld.set(sx, ridgeY, sz);
        }

        // Compute lateral bend angle at the top of this column so normals and thickness rotate cleanly
        const maxColH = Math.max(0.08, (colSpan + 0.022) * scaleY);
        const colTopHNorm = colSpan / tallAnteriorSpan;
        const colTopBendW = Math.pow(colTopHNorm, 1.28) * chordBendMask;
        const colLatSlope =
          (worldDeflect.x * colTopBendW) / Math.max(0.14, maxColH);
        const maxBendAngle = Math.max(
          -0.85,
          Math.min(0.85, Math.atan(colLatSlope))
        );

        for (let j = 0; j < vertsPerRing; j++) {
          const signedR = (j - spanSegs) / spanSegs; // -1 at +X root, 0 at top ridge, +1 at -X root
          const sSign = signedR <= 0 ? 1 : -1;
          const vSpan = 1.0 - Math.abs(signedR);

          // True normalized height above the dorsal ridge (prevents short columns from overtaking tall columns!)
          const hNorm = (colSpan * vSpan) / tallAnteriorSpan;
          const bendW = Math.pow(hNorm, 1.28) * chordBendMask;

          // Convex leading-edge sweep + uniform backward groove folding parameterized by hNorm
          const baseSweep =
            (0.24 * (1.0 - 0.35 * uChord) + 0.04) * Math.pow(hNorm, 1.22);
          const foldSweep = sweepFold * 0.22 * Math.pow(hNorm, 1.15);
          const totalSweepZ = baseSweep + foldSweep;

          // Subtle secondary hydrodynamic fin-ray ripple along the membrane
          const rayFlutter =
            Math.sin(swimPhase * 1.2 - uChord * 5.2 - hNorm * 2.2) *
            0.014 *
            effectiveSwish *
            hNorm *
            scaleY;

          const localHeight = (colSpan + 0.022) * vSpan * scaleY;
          const rootPinch = vSpan < 0.08 ? 0.45 + 0.55 * (vSpan / 0.08) : 1.0;
          const tipArchive = Math.sqrt(Math.max(0.0, 1.0 - vSpan * 0.96));
          const halfThick =
            0.017 *
            rootPinch *
            tipArchive *
            chordFoilEnv *
            scaleXZ *
            (j === spanSegs ? 0.0 : 1.0);

          // Rotate thickness offset and surface normal by the spanwise bend angle
          const localBendAngle = maxBendAngle * Math.pow(vSpan, 0.85);
          const cosB = Math.cos(localBendAngle);
          const sinB = Math.sin(localBendAngle);

          const rawOffsetX = sSign * halfThick;
          const rotOffsetX = rawOffsetX * cosB + rayFlutter;
          const rotOffsetY = -rawOffsetX * sinB;

          const deflectX = worldDeflect.x * bendW;
          const deflectY =
            worldDeflect.y * bendW -
            Math.abs(deflectX) * 0.18 * vSpan; // Natural arc foreshortening when bent sideways
          const deflectZ = worldDeflect.z * bendW;

          const wx =
            sx + cosYaw * rotOffsetX - sinYaw * totalSweepZ + deflectX;
          const wy = Math.max(
            ridgeY - 0.01,
            ridgeY + localHeight + rotOffsetY + deflectY
          );
          const wz =
            sz + sinYaw * rotOffsetX - cosYaw * totalSweepZ + deflectZ;

          const vIdx = (c * vertsPerRing + j) * 3;
          positions[vIdx] = wx;
          positions[vIdx + 1] = wy;
          positions[vIdx + 2] = wz;

          // Outward normal rotated smoothly by both spine yaw and lateral fin bend angle
          const baseNx = j === spanSegs ? 0.0 : sSign * 0.94;
          const baseNy = j === spanSegs ? 1.0 : 0.25 * vSpan;
          const rotNx = baseNx * cosB - baseNy * sinB;
          const rotNy = baseNx * sinB + baseNy * cosB;
          const leadNz = c === 0 ? 0.35 : c === chordSegs ? -0.35 : 0.12 * (0.3 - uChord);

          const nx = cosYaw * rotNx - sinYaw * leadNz;
          const ny = rotNy;
          const nz = sinYaw * rotNx + cosYaw * leadNz;
          const nLen = Math.hypot(nx, ny, nz) || 1;
          normals[vIdx] = nx / nLen;
          normals[vIdx + 1] = ny / nLen;
          normals[vIdx + 2] = nz / nLen;

          if (c === 2 && j === spanSegs) {
            outTipWorld.set(wx, wy, wz);
          }
        }
      }
      posAttr.needsUpdate = true;
      normAttr.needsUpdate = true;
    },
    dispose() {
      geo.dispose();
    },
  };
}
