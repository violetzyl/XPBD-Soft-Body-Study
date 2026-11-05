import * as THREE from 'three';
import {
  OctopusControlsModule,
  OctopusSpecificParams,
} from '../components/controls/OctopusControlsModule';
import { createWeldedArmMeshes } from '../sim/octopusSkinMesh';
import {
  beginRegionGrab,
  computeOctopusTelemetry,
  createDeformedArmBuffers,
  createXPBDOctopusState,
  endRegionGrab,
  spawnBaitBead,
  stepXPBDOctopus,
  updateDeformedArmStations,
} from '../sim/xpbdSolver';
import {
  JellySpecimenDefinition,
  SpecimenRuntimeController,
  SpecimenSharedResources,
  SpecimenTelemetry,
} from './types';

// Pre-allocated scratch math objects (Zero-GC rule)
const _v0 = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();

function createSuckerCupGeometry(): THREE.LatheGeometry {
  const points = [
    new THREE.Vector2(0.0, 0.15),
    new THREE.Vector2(0.42, 0.18),
    new THREE.Vector2(0.68, 0.58),
    new THREE.Vector2(0.95, 0.88),
    new THREE.Vector2(1.0, 0.62),
    new THREE.Vector2(0.86, 0.0),
    new THREE.Vector2(0.0, 0.0),
  ];
  const geo = new THREE.LatheGeometry(points, 12);
  geo.computeVertexNormals();
  return geo;
}

export const OCTOPUS_SPECIMEN: JellySpecimenDefinition<OctopusSpecificParams> = {
  id: 'octopus',
  name: 'Octopus Bilayer Jelly Study',
  shortName: 'Octopus',
  specimenPrefix: 'OCT-JL-01',
  specificControlsTitle: 'Octopus Biomechanics',
  defaultParams: {
    muscleActivity: 1.0,
    curlOverride: 0,
  },
  cameraPresets: [
    {
      id: 'studio',
      label: 'Studio 3/4',
      position: [2.35, 2.15, 3.15],
      target: [0, 0.38, 0.05],
    },
    {
      id: 'top',
      label: 'Top Span',
      position: [0.01, 4.35, 0.45],
      target: [0, 0.2, 0.0],
    },
    {
      id: 'eye',
      label: 'Eye & Horn',
      position: [0.95, 1.08, 1.38],
      target: [0.15, 0.65, 0.12],
    },
    {
      id: 'curl',
      label: 'Sucker Curl',
      position: [-2.15, 0.95, 2.25],
      target: [-0.75, 0.32, 0.65],
    },
  ],
  studyNotes: {
    title: 'Regional Biomechanics & Bilayer Jelly Physics',
    paragraphs: [
      'Regional Force & Deformation Response: Pulling an Arm Curled Tip uncoils its elastic spiral while ventral suckers anchor the base, snapping back with a whip-recoil wave on release. Pulling an Arm Base/Web peels that arm’s suction cups first; pulling the plush Mantle Sac or Cranial Dome stretches the hydrostatic pouch and peels all eight arms for a full-body lift and multi-bounce jelly landing.',
      'Three Optimized Poses: Switch between Writhe (phased metachronal bending waves), Curl Up (tight protective helical coil with outward-facing sucker rows), and Let Go (relaxed radial tabletop drape).',
    ],
  },
  SpecificControlsComponent: OctopusControlsModule,

  createController(
    shared: SpecimenSharedResources
  ): SpecimenRuntimeController<OctopusSpecificParams> {
    const {
      scene,
      outerJellyMat,
      milkyCoreMat,
      suckerMat,
      papillaMat,
      irisMat,
      pupilMat,
      socketMat,
      hornMat,
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

    const xpbdState = createXPBDOctopusState(16);
    spawnBaitBead(xpbdState, 1.25, 1.05);
    spawnBaitBead(xpbdState, -1.35, 0.92);

    // Pre-allocated deformed arm station buffer (Zero-GC per frame)
    const deformedArms = createDeformedArmBuffers(8, xpbdState.blueprint.arms[0].length);

    const group = new THREE.Group();
    scene.add(group);

    // 1. Domed Head (Outer Jelly + Milky Inner Core)
    const unitSphereGeo = new THREE.SphereGeometry(1, 24, 18);
    const headOuterMesh = new THREE.Mesh(unitSphereGeo, outerJellyMat);
    headOuterMesh.castShadow = !isSoftwareGl;
    headOuterMesh.renderOrder = 2;
    group.add(headOuterMesh);

    const headInnerMesh = new THREE.Mesh(unitSphereGeo, milkyCoreMat);
    headInnerMesh.renderOrder = 1;
    group.add(headInnerMesh);

    // 2. Big Soft Mantle Leaning Back (Outer Jelly + Milky Inner Visceral Mass)
    const mantleOuterMesh = new THREE.Mesh(unitSphereGeo, outerJellyMat);
    mantleOuterMesh.castShadow = !isSoftwareGl;
    mantleOuterMesh.renderOrder = 2;
    group.add(mantleOuterMesh);

    const mantleInnerMesh = new THREE.Mesh(unitSphereGeo, milkyCoreMat);
    mantleInnerMesh.renderOrder = 1;
    group.add(mantleInnerMesh);

    // 3. Funnel (Siphon) on the Flank
    const funnelGeo = new THREE.CylinderGeometry(0.082, 0.148, 0.44, 18, 1, false);
    const funnelOuterMesh = new THREE.Mesh(funnelGeo, outerJellyMat);
    funnelOuterMesh.renderOrder = 2;
    group.add(funnelOuterMesh);

    const funnelLipGeo = new THREE.TorusGeometry(0.082, 0.018, 8, 18);
    funnelLipGeo.rotateX(Math.PI / 2);
    const funnelLipMesh = new THREE.Mesh(funnelLipGeo, milkyCoreMat);
    funnelLipMesh.position.y = 0.22;
    funnelOuterMesh.add(funnelLipMesh);

    // 4. Raised Eye Sockets, Golden Iris, Horizontal Bar Pupil & Small Horn over Each Eye
    const eyeGroups: THREE.Group[] = [];
    const socketGeo = new THREE.SphereGeometry(0.135, 18, 14);
    const irisGeo = new THREE.SphereGeometry(0.086, 18, 14);
    const pupilBarGeo = new THREE.CapsuleGeometry(0.017, 0.086, 6, 10);
    pupilBarGeo.rotateZ(Math.PI / 2);
    const hornGeo = new THREE.CapsuleGeometry(0.022, 0.065, 6, 10);

    for (let eIdx = 0; eIdx < 2; eIdx++) {
      const eyeSpec = xpbdState.blueprint.eyes[eIdx];
      const eGroup = new THREE.Group();

      const socketMesh = new THREE.Mesh(socketGeo, socketMat);
      socketMesh.scale.set(1.05, 0.95, 1.05);
      eGroup.add(socketMesh);

      const eyeBallGroup = new THREE.Group();
      eyeBallGroup.position.set(
        eyeSpec.gazeDir.x * 0.115,
        eyeSpec.gazeDir.y * 0.115,
        eyeSpec.gazeDir.z * 0.115
      );
      eyeBallGroup.lookAt(
        eyeSpec.gazeDir.x * 2,
        eyeSpec.gazeDir.y * 0.8,
        eyeSpec.gazeDir.z * 2
      );

      const irisMesh = new THREE.Mesh(irisGeo, irisMat);
      irisMesh.scale.set(1.0, 0.92, 0.85);
      eyeBallGroup.add(irisMesh);

      const pupilMesh = new THREE.Mesh(pupilBarGeo, pupilMat);
      pupilMesh.position.set(0, 0, 0.074);
      pupilMesh.scale.set(1.05, 1.05, 0.65);
      eyeBallGroup.add(pupilMesh);

      eGroup.add(eyeBallGroup);

      const sideSign = eyeSpec.side === 'left' ? 1 : -1;
      const hornMesh = new THREE.Mesh(hornGeo, hornMat);
      hornMesh.position.set(sideSign * 0.018, 0.138, -0.01);
      hornMesh.rotation.z = -sideSign * 0.28;
      hornMesh.rotation.x = -0.12;
      eGroup.add(hornMesh);

      group.add(eGroup);
      eyeGroups.push(eGroup);
    }

    // 5. Eight Continuous Welded Tubular Arms (Bilayer: Dorsal Outer Jelly + Ventral Milky Layer)
    const weldedArms = createWeldedArmMeshes(8, xpbdState.blueprint.arms[0].length, 14);
    const dorsalArmsMesh = new THREE.Mesh(weldedArms.dorsalGeometry, outerJellyMat);
    dorsalArmsMesh.castShadow = !isSoftwareGl;
    dorsalArmsMesh.frustumCulled = false;
    dorsalArmsMesh.renderOrder = 2;
    group.add(dorsalArmsMesh);

    const ventralArmsMesh = new THREE.Mesh(weldedArms.ventralGeometry, milkyCoreMat);
    ventralArmsMesh.frustumCulled = false;
    ventralArmsMesh.renderOrder = 1;
    group.add(ventralArmsMesh);

    // 6. Two Staggered Rows of Pale Suckers on the Milky Underside
    const totalSuckers = xpbdState.blueprint.suckers.length;
    const suckerCupGeo = createSuckerCupGeometry();
    const suckerInstanced = new THREE.InstancedMesh(suckerCupGeo, suckerMat, totalSuckers);
    suckerInstanced.frustumCulled = false;
    suckerInstanced.renderOrder = 3;
    group.add(suckerInstanced);

    // 7. Small Dorsal Papillae across Mantle and Arm Backs
    const totalPapillae = xpbdState.blueprint.papillae.length;
    const papillaDomeGeo = new THREE.SphereGeometry(1, 10, 8);
    papillaDomeGeo.translate(0, 0.35, 0);
    const papillaInstanced = new THREE.InstancedMesh(
      papillaDomeGeo,
      papillaMat,
      totalPapillae
    );
    papillaInstanced.frustumCulled = false;
    papillaInstanced.renderOrder = 3;
    group.add(papillaInstanced);

    // 8. Smooth Scalloped Interbrachial Web Joining the Eight Arms
    const webCols = 16;
    const webRows = 4;
    const webPositions = new Float32Array(webCols * webRows * 3);
    const webNormals = new Float32Array(webCols * webRows * 3);
    for (let i = 0; i < webCols * webRows; i++) {
      webNormals[i * 3 + 1] = 1;
    }
    const webIndices: number[] = [];
    const ringOrder = [0, 1, 3, 5, 7, 6, 4, 2];
    for (let c = 0; c < webCols; c++) {
      const nextC = (c + 1) % webCols;
      for (let r = 0; r < webRows - 1; r++) {
        const a0 = c * webRows + r;
        const a1 = c * webRows + (r + 1);
        const b0 = nextC * webRows + r;
        const b1 = nextC * webRows + (r + 1);
        webIndices.push(a0, a1, b1);
        webIndices.push(a0, b1, b0);
      }
    }
    const webGeo = new THREE.BufferGeometry();
    const webPosAttr = new THREE.BufferAttribute(webPositions, 3);
    webPosAttr.setUsage(THREE.DynamicDrawUsage);
    webGeo.setAttribute('position', webPosAttr);
    webGeo.setAttribute('normal', new THREE.BufferAttribute(webNormals, 3));
    webGeo.setIndex(webIndices);
    const webMesh = new THREE.Mesh(webGeo, outerJellyMat);
    webMesh.renderOrder = 2;
    group.add(webMesh);

    // 9. Optional XPBD Tetrahedral Cage Wireframe Overlay
    const tetLinePositions = new Float32Array(xpbdState.edges.length * 2 * 3);
    const tetLineGeo = new THREE.BufferGeometry();
    const tetLineAttr = new THREE.BufferAttribute(tetLinePositions, 3);
    tetLineAttr.setUsage(THREE.DynamicDrawUsage);
    tetLineGeo.setAttribute('position', tetLineAttr);
    const tetLineMat = new THREE.LineBasicMaterial({
      color: '#38bdf8',
      transparent: true,
      opacity: 0.42,
    });
    const tetLines = new THREE.LineSegments(tetLineGeo, tetLineMat);
    tetLines.visible = false;
    tetLines.renderOrder = 4;
    scene.add(tetLines);

    const syncVisuals = (cameraPosition: THREE.Vector3) => {
      const pos = xpbdState.positions;
      const bp = xpbdState.blueprint;

      // Cohesive squash-and-stretch factor during jelly bounce + subtle relax-pose cushion
      const relaxSquash = xpbdState.relaxPoseBlend * 0.06;
      const squashY = Math.max(0.68, 1.0 - (xpbdState.jellySquash + relaxSquash) * 0.48);
      const squashXZ = 1.0 / Math.sqrt(squashY);

      const hc = xpbdState.headCoreParticle * 3;
      const hx = pos[hc];
      const hy = pos[hc + 1];
      const hz = pos[hc + 2];

      headOuterMesh.position.set(hx, hy, hz);
      headOuterMesh.scale.set(
        bp.headRadius.x * squashXZ,
        bp.headRadius.y * squashY,
        bp.headRadius.z * squashXZ
      );

      headInnerMesh.position.set(hx, hy - 0.04 * squashY, hz);
      headInnerMesh.scale.set(
        bp.headRadius.x * 0.75 * squashXZ,
        bp.headRadius.y * 0.71 * squashY,
        bp.headRadius.z * 0.75 * squashXZ
      );

      // Leaning Mantle welded cohesively to Head
      const mc = xpbdState.mantleMidParticle * 3;
      const mt = xpbdState.mantleTipParticle * 3;
      const restMantleOffset = {
        x: bp.mantleCenter.x - bp.headCenter.x,
        y: bp.mantleCenter.y - bp.headCenter.y,
        z: bp.mantleCenter.z - bp.headCenter.z,
      };
      const mx = hx + (pos[mc] - hx) * 0.65 + restMantleOffset.x * 0.35;
      const my = hy + ((pos[mc + 1] - hy) * 0.65 + restMantleOffset.y * 0.35) * squashY;
      const mz = hz + (pos[mc + 2] - hz) * 0.65 + restMantleOffset.z * 0.35;

      mantleOuterMesh.position.set(mx, my, mz);
      _v0.set(pos[mt] - hx, pos[mt + 1] - hy, pos[mt + 2] - hz).normalize();
      _quat.setFromUnitVectors(_up, _v0);
      mantleOuterMesh.quaternion.copy(_quat);
      const breathScale =
        1 + Math.sin(xpbdState.simTime * 2.1) * 0.032 * xpbdState.muscleActivity;
      mantleOuterMesh.scale.set(
        bp.mantleRadii.x * breathScale * squashXZ,
        bp.mantleRadii.z * squashY,
        bp.mantleRadii.y * breathScale * squashXZ
      );

      mantleInnerMesh.position.set(mx, my - 0.03 * squashY, mz);
      mantleInnerMesh.quaternion.copy(_quat);
      mantleInnerMesh.scale.set(
        bp.mantleRadii.x * 0.73 * breathScale * squashXZ,
        bp.mantleRadii.z * 0.75 * squashY,
        bp.mantleRadii.y * 0.71 * breathScale * squashXZ
      );

      // Flank Funnel
      const ft = xpbdState.funnelTipParticle * 3;
      funnelOuterMesh.position.set(
        hx + 0.44 * squashXZ,
        hy + 0.01 * squashY,
        hz - 0.16 * squashXZ
      );
      _v0
        .set(
          pos[ft] - (hx + 0.32),
          pos[ft + 1] - (hy - 0.06),
          pos[ft + 2] - (hz - 0.28)
        )
        .normalize();
      funnelOuterMesh.quaternion.setFromUnitVectors(_up, _v0);

      // Dynamic contact shadow
      contactShadowMesh.position.x = hx;
      contactShadowMesh.position.z = hz;
      const liftHeight = Math.max(0, hy - bp.headCenter.y);
      contactShadowMat.opacity = Math.max(0.22, 0.85 * Math.exp(-liftHeight * 0.75));
      const shadowScale = 1.0 + liftHeight * 0.18;
      contactShadowMesh.scale.set(shadowScale, shadowScale, 1);

      // Raised Eye Sockets
      for (let eIdx = 0; eIdx < 2; eIdx++) {
        const eyeSpec = bp.eyes[eIdx];
        const eGroup = eyeGroups[eIdx];
        eGroup.position.set(
          hx + (eyeSpec.socketCenter.x - bp.headCenter.x) * squashXZ,
          hy + (eyeSpec.socketCenter.y - bp.headCenter.y) * squashY,
          hz + (eyeSpec.socketCenter.z - bp.headCenter.z) * squashXZ
        );
      }

      // Zero-GC Orthonormal Arm Frame Update + Welded Tubular Skin Update
      updateDeformedArmStations(xpbdState, deformedArms);
      weldedArms.updateFromXPBD(xpbdState, deformedArms);

      // Update Two Staggered Rows of Pale Suckers along Ventral Arm Undersides
      for (let i = 0; i < totalSuckers; i++) {
        const sk = bp.suckers[i];
        const stations = deformedArms[sk.armIndex];
        const exactIdx = sk.u * (stations.length - 1);
        const idx0 = Math.min(stations.length - 2, Math.floor(exactIdx));
        const idx1 = idx0 + 1;
        const frac = exactIdx - idx0;

        const st0 = stations[idx0];
        const st1 = stations[idx1];

        const px = st0.position.x + (st1.position.x - st0.position.x) * frac;
        const py = st0.position.y + (st1.position.y - st0.position.y) * frac;
        const pz = st0.position.z + (st1.position.z - st0.position.z) * frac;

        const vx = st0.ventralNormal.x + (st1.ventralNormal.x - st0.ventralNormal.x) * frac;
        const vy = st0.ventralNormal.y + (st1.ventralNormal.y - st0.ventralNormal.y) * frac;
        const vz = st0.ventralNormal.z + (st1.ventralNormal.z - st0.ventralNormal.z) * frac;

        const bx = st0.binormal.x + (st1.binormal.x - st0.binormal.x) * frac;
        const by = st0.binormal.y + (st1.binormal.y - st0.binormal.y) * frac;
        const bz = st0.binormal.z + (st1.binormal.z - st0.binormal.z) * frac;

        const rowSign = sk.row === 0 ? -1 : 1;
        _v0
          .set(
            vx * 0.85 + bx * (0.52 * rowSign),
            vy * 0.85 + by * (0.52 * rowSign),
            vz * 0.85 + bz * (0.52 * rowSign)
          )
          .normalize();

        const armR = st0.radius + (st1.radius - st0.radius) * frac;
        _v1.set(
          px + _v0.x * (armR * 1.04),
          Math.max(0.014, py + _v0.y * (armR * 1.04)),
          pz + _v0.z * (armR * 1.04)
        );

        _quat.setFromUnitVectors(_up, _v0);
        _scale.set(sk.outerRadius, sk.cupDepth, sk.outerRadius);
        _mat4.compose(_v1, _quat, _scale);
        suckerInstanced.setMatrixAt(i, _mat4);
      }
      suckerInstanced.instanceMatrix.needsUpdate = true;

      // Update Dorsal Papillae
      for (let i = 0; i < totalPapillae; i++) {
        const pap = bp.papillae[i];
        if (pap.region === 'mantle') {
          _v0.set(
            mx + (pap.position.x - bp.mantleCenter.x) * breathScale * squashXZ,
            my + (pap.position.y - bp.mantleCenter.y) * breathScale * squashY,
            mz + (pap.position.z - bp.mantleCenter.z) * squashXZ
          );
          _v1.set(pap.normal.x, pap.normal.y, pap.normal.z).normalize();
        } else {
          const st = deformedArms[pap.armIndex][Math.min(12, Math.round(pap.u * 15))];
          const sideJitter = (i % 2 === 0 ? 1 : -1) * 0.18 * st.radius;
          _v0.set(
            st.position.x + st.dorsalNormal.x * (st.radius * 1.02) + st.binormal.x * sideJitter,
            st.position.y + st.dorsalNormal.y * (st.radius * 1.02) + st.binormal.y * sideJitter,
            st.position.z + st.dorsalNormal.z * (st.radius * 1.02) + st.binormal.z * sideJitter
          );
          _v1.set(st.dorsalNormal.x, st.dorsalNormal.y, st.dorsalNormal.z).normalize();
        }
        _quat.setFromUnitVectors(_up, _v1);
        _scale.set(pap.radius, pap.height * 0.85, pap.radius);
        _mat4.compose(_v0, _quat, _scale);
        papillaInstanced.setMatrixAt(i, _mat4);
      }
      papillaInstanced.instanceMatrix.needsUpdate = true;

      // Update Scalloped Interbrachial Web
      for (let rIdx = 0; rIdx < 8; rIdx++) {
        const armIdxA = ringOrder[rIdx];
        const armIdxB = ringOrder[(rIdx + 1) % 8];
        const stationsA = deformedArms[armIdxA];
        const stationsB = deformedArms[armIdxB];

        const colEven = rIdx * 2;
        const colOdd = rIdx * 2 + 1;

        for (let s = 0; s < webRows; s++) {
          const stA = stationsA[s];
          const stB = stationsB[s];
          const headBlend = s === 0 ? 0.42 : s === 1 ? 0.14 : 0.0;

          const ax =
            stA.position.x * (1 - headBlend) +
            hx * headBlend +
            stA.dorsalNormal.x * (stA.radius * 0.18);
          const ay =
            stA.position.y * (1 - headBlend) +
            (hy - 0.12) * headBlend +
            stA.dorsalNormal.y * (stA.radius * 0.18);
          const az =
            stA.position.z * (1 - headBlend) +
            hz * headBlend +
            stA.dorsalNormal.z * (stA.radius * 0.18);

          const bx =
            stB.position.x * (1 - headBlend) +
            hx * headBlend +
            stB.dorsalNormal.x * (stB.radius * 0.18);
          const by =
            stB.position.y * (1 - headBlend) +
            (hy - 0.12) * headBlend +
            stB.dorsalNormal.y * (stB.radius * 0.18);
          const bz =
            stB.position.z * (1 - headBlend) +
            hz * headBlend +
            stB.dorsalNormal.z * (stB.radius * 0.18);

          const vEven = (colEven * webRows + s) * 3;
          webPositions[vEven] = ax;
          webPositions[vEven + 1] = ay;
          webPositions[vEven + 2] = az;

          const inwardPull = 0.22 * (s / (webRows - 1));
          const midX = 0.5 * (ax + bx) * (1 - inwardPull) + hx * inwardPull;
          const midY = Math.max(0.02, 0.5 * (ay + by) - 0.035 * (s / (webRows - 1)));
          const midZ = 0.5 * (az + bz) * (1 - inwardPull) + hz * inwardPull;

          const vOdd = (colOdd * webRows + s) * 3;
          webPositions[vOdd] = midX;
          webPositions[vOdd + 1] = midY;
          webPositions[vOdd + 2] = midZ;
        }
      }
      webPosAttr.needsUpdate = true;

      // Update Bait Beads InstancedMesh
      for (let b = 0; b < maxBeads; b++) {
        const bead = xpbdState.beads[b];
        if (bead) {
          _v0.set(bead.position.x, bead.position.y, bead.position.z);
          _quat.identity();
          _scale.setScalar(bead.radius);
          _mat4.compose(_v0, _quat, _scale);
        } else {
          _mat4.makeScale(0, 0, 0);
        }
        beadInstanced.setMatrixAt(b, _mat4);
      }
      beadInstanced.instanceMatrix.needsUpdate = true;

      // Update Optional XPBD Tetrahedral Wireframe Overlay
      if (tetLines.visible) {
        for (let eIdx = 0; eIdx < xpbdState.edges.length; eIdx++) {
          const e = xpbdState.edges[eIdx];
          const base = eIdx * 6;
          tetLinePositions[base] = pos[e.i0 * 3];
          tetLinePositions[base + 1] = pos[e.i0 * 3 + 1];
          tetLinePositions[base + 2] = pos[e.i0 * 3 + 2];
          tetLinePositions[base + 3] = pos[e.i1 * 3];
          tetLinePositions[base + 4] = pos[e.i1 * 3 + 1];
          tetLinePositions[base + 5] = pos[e.i1 * 3 + 2];
        }
        tetLineAttr.needsUpdate = true;
      }

      // Update Grab Ring, Elastic Tension Tether & Stress-Birefringence Uniforms
      if (xpbdState.grabParticle >= 0) {
        const gp = xpbdState.grabParticle * 3;
        const gx = pos[gp];
        const gy = pos[gp + 1];
        const gz = pos[gp + 2];
        grabRingMesh.visible = true;
        grabRingMesh.position.set(gx, gy, gz);
        grabRingMesh.lookAt(cameraPosition);

        grabTetherLine.visible = true;
        grabTetherPositions[0] = gx;
        grabTetherPositions[1] = gy;
        grabTetherPositions[2] = gz;
        grabTetherPositions[3] = xpbdState.grabTarget.x;
        grabTetherPositions[4] = xpbdState.grabTarget.y;
        grabTetherPositions[5] = xpbdState.grabTarget.z;
        (grabTetherGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;

        const stretchDist = Math.hypot(
          xpbdState.grabTarget.x - gx,
          xpbdState.grabTarget.y - gy,
          xpbdState.grabTarget.z - gz
        );
        sssUniforms.uGrabWorldPos.value.set(gx, gy, gz);
        sssUniforms.uStressGlow.value = Math.min(
          1.35,
          stretchDist * 1.45 + xpbdState.jellyRippleAmp * 0.8
        );
      } else {
        grabRingMesh.visible = false;
        grabTetherLine.visible = false;
        sssUniforms.uStressGlow.value = xpbdState.jellyRippleAmp * 0.85;
      }
    };

    syncVisuals(new THREE.Vector3(2.35, 2.15, 3.15));

    return {
      group,
      tetLines,

      applyParams(params: OctopusSpecificParams) {
        xpbdState.muscleActivity = params.muscleActivity;
        xpbdState.curlOverride = params.curlOverride;
      },

      setShowTetCage(visible: boolean) {
        tetLines.visible = visible;
      },

      dropBaitBead(x?: number, z?: number) {
        spawnBaitBead(xpbdState, x, z);
      },

      clearBeads() {
        xpbdState.beads.length = 0;
      },

      liftAndBounce() {
        xpbdState.autoLiftTimer = 0.28;
        beginRegionGrab(xpbdState, xpbdState.headTopParticle, {
          x: 0,
          y: 1.95,
          z: 0.02,
        });
      },

      resetPose() {
        xpbdState.positions.set(xpbdState.restPositions);
        xpbdState.prevPositions.set(xpbdState.restPositions);
        xpbdState.velocities.fill(0);
        endRegionGrab(xpbdState);
        xpbdState.bodyOffset = { x: 0, y: 0, z: 0 };
        xpbdState.bodyVelocity = { x: 0, y: 0, z: 0 };
        xpbdState.jellySquash = 0;
        xpbdState.jellySquashVel = 0;
        xpbdState.jellyRippleAmp = 0;
        xpbdState.armRecoilVel.fill(0);
        xpbdState.armSuctionGripping.fill(true);
      },

      tryGrabAtRay(ray: THREE.Ray) {
        const pos = xpbdState.positions;
        let bestParticle = -1;
        let bestDistSq = 0.38 * 0.38;

        for (let i = 0; i < xpbdState.numParticles; i++) {
          _v0.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
          const dSq = ray.distanceSqToPoint(_v0);
          if (dSq < bestDistSq) {
            bestDistSq = dSq;
            bestParticle = i;
          }
        }

        if (bestParticle >= 0) {
          const px = pos[bestParticle * 3];
          const py = pos[bestParticle * 3 + 1];
          const pz = pos[bestParticle * 3 + 2];
          beginRegionGrab(xpbdState, bestParticle, { x: px, y: py, z: pz });
          return { grabbed: true, hitPoint: new THREE.Vector3(px, py, pz) };
        }
        return { grabbed: false, hitPoint: _v0 };
      },

      updateGrabTarget(target: THREE.Vector3) {
        if (xpbdState.grabParticle >= 0) {
          xpbdState.grabTarget = {
            x: Math.max(-2.6, Math.min(2.6, target.x)),
            y: Math.max(0.05, Math.min(2.6, target.y)),
            z: Math.max(-2.6, Math.min(2.6, target.z)),
          };
        }
      },

      releaseGrab() {
        if (xpbdState.grabParticle >= 0) {
          endRegionGrab(xpbdState);
        }
      },

      stepAndSync(dt: number, cameraPosition: THREE.Vector3) {
        stepXPBDOctopus(xpbdState, dt);
        sssUniforms.uTime.value = xpbdState.simTime;
        syncVisuals(cameraPosition);
      },

      getTelemetry(): SpecimenTelemetry {
        const t = computeOctopusTelemetry(xpbdState);
        return {
          specimenPrefix: 'OCT-JL-01',
          adhesionLabel: 'Suction Grip',
          adhesionPct: t.suctionGripPct,
          grabRegionLabel: t.grabRegionLabel,
          activeBeadCount: t.activeBeadCount,
          isDragging: t.isDragging,
          meanStrainPct: t.meanMuscleStrainPct,
          metrics: [
            {
              id: 'mass',
              label: 'Mass',
              value: t.massGrams.toFixed(1),
              unit: 'g',
              testId: 'readout-mass',
            },
            {
              id: 'volume',
              label: 'Volume',
              value: t.volumeCm3.toFixed(1),
              unit: 'cm³',
              testId: 'readout-volume',
            },
            {
              id: 'armSpan',
              label: 'Arm Span',
              value: t.armSpanCm.toFixed(1),
              unit: 'cm',
              testId: 'readout-arm-span',
            },
            {
              id: 'mantleHeight',
              label: 'Mantle Height',
              value: t.mantleHeightCm.toFixed(1),
              unit: 'cm',
              testId: 'readout-mantle-height',
            },
          ],
        };
      },

      dispose() {
        scene.remove(group);
        scene.remove(tetLines);
        unitSphereGeo.dispose();
        funnelGeo.dispose();
        funnelLipGeo.dispose();
        socketGeo.dispose();
        irisGeo.dispose();
        pupilBarGeo.dispose();
        hornGeo.dispose();
        weldedArms.dorsalGeometry.dispose();
        weldedArms.ventralGeometry.dispose();
        suckerCupGeo.dispose();
        papillaDomeGeo.dispose();
        webGeo.dispose();
        tetLineGeo.dispose();
        tetLineMat.dispose();
      },
    };
  },
};
