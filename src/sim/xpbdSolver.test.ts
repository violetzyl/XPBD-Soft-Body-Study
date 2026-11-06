import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOctopusAnatomyBlueprint,
  integrateArmCurvature,
} from './octopusAnatomy';
import {
  beginRegionGrab,
  computeOctopusTelemetry,
  createDeformedArmBuffers,
  createXPBDOctopusState,
  endRegionGrab,
  evaluateEdgeMuscleStrain,
  spawnBaitBead,
  stepXPBDOctopus,
  updateDeformedArmStations,
} from './xpbdSolver';
import {
  computeBlueMarlinTelemetry,
  createBlueMarlinSimState,
  evaluateMarlinDorsalSpan,
  evaluateMarlinDorsalSweep,
  evaluateMarlinSDFProfile,
  getEffectiveMarlinSwish,
  stepBlueMarlinSim,
  triggerMarlinBillSlash,
  triggerMarlinTailSwish,
} from './blueMarlinSim';
import { createSpineSkinnedSailDorsal } from './blueMarlinSkinMesh';
import { COLOURWAYS, COLOURWAY_LIST, MARLIN_COLOURWAY_LIST } from './colourways';
import { LIGHTING_PRESETS, LIGHTING_PRESET_LIST } from './lightingPresets';
import { SPECIMEN_LIST, getSpecimenDefinition } from '../specimens/registry';

test('colourways define coral, plum, and mint bilayer palettes plus Cobalt, Lilac, Midnight, and Sunrise for Blue Marlin', () => {
  assert.equal(COLOURWAY_LIST.length, 3);
  assert.ok(COLOURWAYS.coral.outerJellyHex);
  assert.ok(COLOURWAYS.plum.outerJellyHex);
  assert.ok(COLOURWAYS.mint.outerJellyHex);

  assert.equal(MARLIN_COLOURWAY_LIST.length, 4);
  assert.ok(COLOURWAYS.cobalt.outerJellyHex);
  assert.ok(COLOURWAYS.lilac.outerJellyHex);
  assert.ok(COLOURWAYS.midnight.outerJellyHex);
  assert.ok(COLOURWAYS.sunrise.outerJellyHex);
});

test('lighting presets define Soft Studio, Dramatic Rim, and Subtle Underwater setups with SSS parameters', () => {
  assert.equal(LIGHTING_PRESET_LIST.length, 3);
  assert.ok(LIGHTING_PRESETS.studio.sssStrength > 0.4);
  assert.ok(LIGHTING_PRESETS.rim.sssStrength > LIGHTING_PRESETS.studio.sssStrength);
  assert.ok(LIGHTING_PRESETS.rim.rimIntensity > LIGHTING_PRESETS.studio.rimIntensity);
  assert.equal(LIGHTING_PRESETS.underwater.causticShimmer, 1.0);
});

test('integrateArmCurvature sweeps across the table then rolls the outer third up into a curl with firmer tips', () => {
  for (let armIdx = 0; armIdx < 8; armIdx++) {
    const chain = integrateArmCurvature(armIdx, 16);
    assert.equal(chain.length, 16);

    assert.ok(chain[0].radius > chain[7].radius);
    assert.ok(chain[7].radius > chain[15].radius);

    const midY = chain[6].position.y;
    const outerCurlMaxY = Math.max(
      chain[12].position.y,
      chain[13].position.y,
      chain[14].position.y,
      chain[15].position.y
    );
    assert.ok(
      outerCurlMaxY > midY + 0.08,
      `Arm ${armIdx} outer third should curl up off the table (midY=${midY}, maxOuterY=${outerCurlMaxY})`
    );

    assert.equal(chain[0].stiffnessMultiplier, 1.0);
    assert.ok(chain[15].stiffnessMultiplier > 3.5);
  }
});

test('anatomy blueprint includes raised eyes with horizontal bar pupil, horns, leaning mantle, flank funnel, and two staggered rows of suckers', () => {
  const bp = buildOctopusAnatomyBlueprint(16);
  assert.equal(bp.arms.length, 8);
  assert.equal(bp.eyes.length, 2);

  for (const eye of bp.eyes) {
    assert.ok(eye.hornTip.y > eye.hornBase.y);
    assert.ok(eye.hornBase.y > eye.socketCenter.y);
    assert.ok(Math.abs(eye.pupilBarAxis.y) < 0.15);
  }

  assert.ok(bp.mantleCenter.z < bp.headCenter.z - 0.4);
  assert.ok(Math.abs(bp.funnelTip.x) > 0.35);

  const row0 = bp.suckers.filter((s) => s.row === 0);
  const row1 = bp.suckers.filter((s) => s.row === 1);
  assert.ok(row0.length > 40);
  assert.equal(row0.length, row1.length);
});

test('cohesive XPBD solver maintains structural unity, breaks suction grip on strong lift, and bounces like jelly on release', () => {
  const state = createXPBDOctopusState(16);
  assert.ok(state.tetras.length > 100);
  assert.ok(state.edges.length > 400);

  const arm0Edge = state.edges.find((e) => e.armIndex === 0 && e.flankSide === 1 && e.u > 0.4)!;
  const arm2Edge = state.edges.find((e) => e.armIndex === 2 && e.flankSide === 1 && e.u > 0.4)!;
  const strain0 = evaluateEdgeMuscleStrain(arm0Edge, 1.0, 1.0, 0);
  const strain2 = evaluateEdgeMuscleStrain(arm2Edge, 1.0, 1.0, 0);
  assert.notEqual(strain0, strain2);

  const initialTelemetry = computeOctopusTelemetry(state);
  assert.equal(initialTelemetry.suctionGripPct, 100);

  // 1. Gentle drag: suction cups remain gripping while body deforms cohesively
  beginRegionGrab(state, state.headTopParticle, {
    x: 0.12,
    y: state.restPositions[state.headTopParticle * 3 + 1] + 0.18,
    z: 0.08,
  });
  for (let i = 0; i < 5; i++) {
    stepXPBDOctopus(state, 1 / 60);
  }
  assert.equal(computeOctopusTelemetry(state).suctionGripPct, 100);

  // 2. Strong upward drag: suction cups pop free and the ENTIRE cohesive octopus lifts off the surface
  state.grabTarget = { x: 0, y: 1.85, z: 0.05 };
  for (let i = 0; i < 12; i++) {
    stepXPBDOctopus(state, 1 / 60);
  }
  const liftedTelemetry = computeOctopusTelemetry(state);
  assert.equal(liftedTelemetry.suctionGripPct, 0);
  assert.ok(
    liftedTelemetry.mantleHeightCm > initialTelemetry.mantleHeightCm + 4.0,
    `Expected full lift mantle height (${liftedTelemetry.mantleHeightCm}) > initial (${initialTelemetry.mantleHeightCm})`
  );

  // Verify head and arm roots lifted together cohesively (did not detach)
  const headY = state.positions[state.headCoreParticle * 3 + 1];
  const arm0RootY = state.positions[state.armNodeParticles[0][0][0] * 3 + 1];
  assert.ok(
    Math.abs(headY - arm0RootY) < 0.55,
    `Expected arm root (${arm0RootY}) to stay attached to lifted head (${headY})`
  );

  // 3. Release lifted octopus -> falls and exhibits elastic jelly bounce on the base
  endRegionGrab(state);
  let maxSquashMagnitude = 0;
  let upwardReboundObserved = false;
  for (let i = 0; i < 45; i++) {
    stepXPBDOctopus(state, 1 / 60);
    maxSquashMagnitude = Math.max(maxSquashMagnitude, Math.abs(state.jellySquash));
    if (i > 5 && state.bodyVelocity.y > 0.25) {
      upwardReboundObserved = true;
    }
  }
  assert.ok(upwardReboundObserved, 'Expected elastic upward rebound velocity after impacting the base');
  assert.ok(maxSquashMagnitude > 0.05, 'Expected jelly squash-and-stretch oscillation on bounce');

  // Drop bait bead and verify settlement
  spawnBaitBead(state, 0.8, 0.8);
  for (let i = 0; i < 45; i++) {
    stepXPBDOctopus(state, 1 / 60);
  }
  assert.ok(state.beads[0].position.y <= state.beads[0].radius + 0.05);
});

test('differentiated regional dragging captures biological arm-tip uncoiling/recoil vs mantle hydrostatic stretch', () => {
  const state = createXPBDOctopusState(16);

  // Grab an outer curled arm tip (arm 0, station 15)
  const arm0TipParticle = state.armNodeParticles[0][15][0];
  beginRegionGrab(state, arm0TipParticle, {
    x: state.restPositions[arm0TipParticle * 3] + 0.65,
    y: state.restPositions[arm0TipParticle * 3 + 1] + 0.35,
    z: state.restPositions[arm0TipParticle * 3 + 2] + 0.45,
  });
  assert.equal(state.grabRegion, 'arm_tip');
  assert.equal(state.grabbedArmIndex, 0);

  for (let i = 0; i < 8; i++) {
    stepXPBDOctopus(state, 1 / 60);
  }

  // While pulling a single arm tip moderately, the other 7 arms remain anchored by their suction cups
  const grippingOtherArms = state.armSuctionGripping.slice(1).filter(Boolean).length;
  assert.equal(grippingOtherArms, 7, 'Other 7 arms should stay anchored by suction cups while uncoiling one arm tip');

  // Release the stretched arm tip -> triggers elastic whip-recoil velocity and jelly surface ripple
  endRegionGrab(state);
  assert.ok(
    Math.abs(state.armRecoilVel[0]) > 0.5,
    `Expected non-zero elastic whip-recoil velocity on arm 0 upon release (got ${state.armRecoilVel[0]})`
  );
  assert.ok(
    state.jellyRippleAmp > 0.1,
    `Expected jelly surface ripple excitation on release (got ${state.jellyRippleAmp})`
  );

  // Grab the soft mantle tip and verify region classification & hydrostatic pouch label
  beginRegionGrab(state, state.mantleTipParticle, {
    x: 0,
    y: 1.15,
    z: -0.95,
  });
  assert.equal(state.grabRegion, 'mantle');
  const mantleTelemetry = computeOctopusTelemetry(state);
  assert.ok(mantleTelemetry.grabRegionLabel.includes('Mantle Sac'));
});

test('updateDeformedArmStations produces strictly orthonormal, twist-bounded frames without tip kinking under extreme strain and drag', () => {
  const state = createXPBDOctopusState(16);
  state.muscleActivity = 1.5; // Maximum strain intensity
  const armBuffers = createDeformedArmBuffers(8, 16);

  // Drag an arm tip sharply while running high muscle strain
  const tipP = state.armNodeParticles[2][15][0];
  beginRegionGrab(state, tipP, { x: -1.8, y: 1.2, z: 1.4 });
  for (let i = 0; i < 15; i++) {
    stepXPBDOctopus(state, 1 / 60);
  }
  updateDeformedArmStations(state, armBuffers);

  for (let k = 0; k < 8; k++) {
    const stations = armBuffers[k];
    for (let s = 0; s < stations.length; s++) {
      const st = stations[s];
      // Verify tangent, dorsalNormal, and binormal are unit vectors and mutually orthogonal
      const tLen = Math.hypot(st.tangent.x, st.tangent.y, st.tangent.z);
      const dLen = Math.hypot(st.dorsalNormal.x, st.dorsalNormal.y, st.dorsalNormal.z);
      const bLen = Math.hypot(st.binormal.x, st.binormal.y, st.binormal.z);
      assert.ok(Math.abs(tLen - 1.0) < 1e-3);
      assert.ok(Math.abs(dLen - 1.0) < 1e-3);
      assert.ok(Math.abs(bLen - 1.0) < 1e-3);

      const dotTD =
        st.tangent.x * st.dorsalNormal.x +
        st.tangent.y * st.dorsalNormal.y +
        st.tangent.z * st.dorsalNormal.z;
      assert.ok(Math.abs(dotTD) < 1e-3, `Expected orthogonal tangent and dorsalNormal at arm ${k} station ${s}`);

      // Verify station centerline never clips below floor clearance
      assert.ok(
        st.position.y >= st.radius * 0.85,
        `Arm ${k} station ${s} clipped into table (y=${st.position.y}, r=${st.radius})`
      );
    }
  }
});

test('three specific octopus poses (Writhe, Curl Up, Let Go) produce distinct arm span and tip elevation profiles, and specimen registry decouples objects', () => {
  const state = createXPBDOctopusState(16);

  // 1. Curl Up (+1): pulls arm tips inward & upward into a tight defensive spiral coil
  state.curlOverride = 1;
  for (let i = 0; i < 25; i++) {
    stepXPBDOctopus(state, 1 / 60);
  }
  const curlSpan = computeOctopusTelemetry(state).armSpanCm;

  // 2. Let Go (-1): uncurls outer third into a wide relaxed tabletop drape
  state.curlOverride = -1;
  for (let i = 0; i < 30; i++) {
    stepXPBDOctopus(state, 1 / 60);
  }
  const relaxSpan = computeOctopusTelemetry(state).armSpanCm;

  assert.ok(
    relaxSpan > curlSpan + 3.0,
    `Expected Let Go relaxed span (${relaxSpan} cm) > Curl Up defensive coil span (${curlSpan} cm)`
  );

  // Verify decoupled specimen registry includes Octopus and Tiger Shark with distinct specific controls
  assert.ok(SPECIMEN_LIST.length >= 2);
  const octDef = getSpecimenDefinition('octopus');
  const sharkDef = getSpecimenDefinition('tiger_shark');
  assert.equal(octDef.id, 'octopus');
  assert.equal(sharkDef.id, 'tiger_shark');
  assert.notEqual(octDef.SpecificControlsComponent, sharkDef.SpecificControlsComponent);
});

test('dragging a curled tentacle tip or sub-tip station uncoils the outer third smoothly without folding back or kinking', () => {
  const state = createXPBDOctopusState(16);
  const armBuffers = createDeformedArmBuffers(8, 16);

  // Grab station 13 (inside the curled outer third of arm 0) and drag it far outward and upward
  const subTipParticle = state.armNodeParticles[0][13][0];
  beginRegionGrab(state, subTipParticle, { x: 1.95, y: 0.95, z: 1.65 });
  assert.equal(state.grabbedArmIndex, 0);
  assert.equal(state.grabbedStationIndex, 13);

  for (let i = 0; i < 18; i++) {
    stepXPBDOctopus(state, 1 / 60);
  }
  updateDeformedArmStations(state, armBuffers);

  const arm0 = armBuffers[0];
  // Verify consecutive tangents along the outer half (s = 8..15) never fold back or kink sharply
  for (let s = 9; s < 16; s++) {
    const tPrev = arm0[s - 1].tangent;
    const tCur = arm0[s].tangent;
    const cosAngle = tPrev.x * tCur.x + tPrev.y * tCur.y + tPrev.z * tCur.z;
    assert.ok(
      cosAngle > 0.78,
      `Expected smooth non-kinked tangent transition at dragged arm tip station ${s - 1}->${s} (cosAngle=${cosAngle})`
    );
  }
});

test('dragging a tentacle inward toward the center arches mid-arm stations smoothly upward without chaotic folding or velocity spikes', () => {
  const state = createXPBDOctopusState(16);
  const armBuffers = createDeformedArmBuffers(8, 16);

  const initialMidY = state.positions[state.armNodeParticles[0][7][0] * 3 + 1];

  // Grab outer tentacle station 14 on arm 0 and drag it inward toward the head center
  const tipParticle = state.armNodeParticles[0][14][0];
  beginRegionGrab(state, tipParticle, { x: 0.08, y: 0.42, z: 0.06 });

  for (let i = 0; i < 20; i++) {
    stepXPBDOctopus(state, 1 / 60);
  }
  updateDeformedArmStations(state, armBuffers);

  const arm0 = armBuffers[0];
  // Mid-arm stations should arch upward into a biological loop rather than collapsing into the head
  const archedMidY = Math.max(arm0[6].position.y, arm0[7].position.y, arm0[8].position.y);
  assert.ok(
    archedMidY > initialMidY + 0.06,
    `Expected mid-arm stations to arch upward when dragged inward (initial=${initialMidY}, arched=${archedMidY})`
  );

  // Verify consecutive tangents along the entire arm remain smooth without sharp chaotic folds
  for (let s = 1; s < 16; s++) {
    const tPrev = arm0[s - 1].tangent;
    const tCur = arm0[s].tangent;
    const cosAngle = tPrev.x * tCur.x + tPrev.y * tCur.y + tPrev.z * tCur.z;
    assert.ok(
      cosAngle > 0.45,
      `Expected smooth biological arch without sharp fold at station ${s - 1}->${s} during inward drag (cosAngle=${cosAngle})`
    );
  }
});

test('high octopus strain setting produces vigorous multi-arm biological writhing excursion compared to zero strain', () => {
  const calmState = createXPBDOctopusState(16);
  calmState.muscleActivity = 0.0;
  calmState.curlOverride = 0;

  const highStrainState = createXPBDOctopusState(16);
  highStrainState.muscleActivity = 1.5;
  highStrainState.curlOverride = 0;

  let calmExcursion = 0;
  let highStrainExcursion = 0;

  for (let step = 0; step < 36; step++) {
    stepXPBDOctopus(calmState, 1 / 60);
    stepXPBDOctopus(highStrainState, 1 / 60);

    for (let k = 0; k < 8; k++) {
      const tipIdx = calmState.armNodeParticles[k][12][0] * 3;
      const dxCalm = calmState.positions[tipIdx] - calmState.restPositions[tipIdx];
      const dyCalm = calmState.positions[tipIdx + 1] - calmState.restPositions[tipIdx + 1];
      const dzCalm = calmState.positions[tipIdx + 2] - calmState.restPositions[tipIdx + 2];
      calmExcursion = Math.max(calmExcursion, Math.hypot(dxCalm, dyCalm, dzCalm));

      const dxHigh = highStrainState.positions[tipIdx] - highStrainState.restPositions[tipIdx];
      const dyHigh = highStrainState.positions[tipIdx + 1] - highStrainState.restPositions[tipIdx + 1];
      const dzHigh = highStrainState.positions[tipIdx + 2] - highStrainState.restPositions[tipIdx + 2];
      highStrainExcursion = Math.max(highStrainExcursion, Math.hypot(dxHigh, dyHigh, dzHigh));
    }
  }

  assert.ok(
    highStrainExcursion > calmExcursion + 0.25,
    `Expected vigorous writhing excursion at max strain (${highStrainExcursion}) >> zero strain (${calmExcursion})`
  );
  assert.ok(
    computeOctopusTelemetry(highStrainState).meanMuscleStrainPct > 10.0,
    'Expected mean muscle strain readout > 10% at maximum strain'
  );
});

test('Blue Marlin SDF anatomy, volume-preserving dorsal fin tetrahedral compression, bill slash through bait, and light-up stripes', () => {
  assert.equal(SPECIMEN_LIST.length, 3);
  const marlinDef = getSpecimenDefinition('blue_marlin');
  assert.equal(marlinDef.id, 'blue_marlin');
  assert.deepEqual(marlinDef.supportedColourways, [
    'cobalt',
    'lilac',
    'midnight',
    'sunrise',
  ]);

  // 1. Verify SDF anatomical profile features: rounded bill, tall narrow high nape, keeled peduncle, and anterior dorsal lobe -> low crest
  const billProf = evaluateMarlinSDFProfile(0.05);
  const napeProf = evaluateMarlinSDFProfile(0.33);
  const crestProf = evaluateMarlinSDFProfile(0.55);
  const peduncleProf = evaluateMarlinSDFProfile(0.89);

  assert.ok(billProf.rx < 0.04 && billProf.ry < 0.04, 'Bill should be slender and rounded');
  assert.ok(
    napeProf.ry > napeProf.rx * 1.65,
    `Body at high nape should be tall and narrow (ry=${napeProf.ry}, rx=${napeProf.rx})`
  );
  assert.ok(
    napeProf.dorsalFinRestSpan > crestProf.dorsalFinRestSpan * 3.0,
    'Anterior dorsal lobe should be tall and transition into a low posterior crest'
  );
  assert.ok(peduncleProf.keelFlare > 0.03, 'Caudal peduncle should feature lateral keels');

  // 2. Verify XPBD Dorsal Fin Fold / Raise vertically compresses dorsal tetrahedral mesh while conserving total volume
  const sim = createBlueMarlinSimState(34);
  for (let i = 0; i < 15; i++) {
    stepBlueMarlinSim(sim, 1 / 60);
  }
  const raisedTel = computeBlueMarlinTelemetry(sim);

  sim.dorsalRaised = false;
  for (let i = 0; i < 35; i++) {
    stepBlueMarlinSim(sim, 1 / 60);
  }
  const foldedTel = computeBlueMarlinTelemetry(sim);

  assert.ok(
    foldedTel.dorsalFinHeightCm < raisedTel.dorsalFinHeightCm * 0.4,
    `Folding dorsal fin should reduce Dorsal Fin Height readout (raised=${raisedTel.dorsalFinHeightCm} cm, folded=${foldedTel.dorsalFinHeightCm} cm)`
  );
  assert.equal(
    foldedTel.volumeCm3,
    raisedTel.volumeCm3,
    `Total tetrahedral volume must be conserved when folding dorsal fin (raised=${raisedTel.volumeCm3}, folded=${foldedTel.volumeCm3})`
  );

  // 3. Verify Bill Slash scatters bait beads, flares pectoral hydrofoils, opens jaw gape, and flashes electric-blue lateral stripes
  triggerMarlinBillSlash(sim);
  assert.ok(sim.stripeGlowIntensity > 2.0, 'Expected electric-blue stripe flash on bill slash');
  for (let i = 0; i < 15; i++) {
    stepBlueMarlinSim(sim, 1 / 60);
  }
  const slashPecFlare = sim.pecFlareBlend;
  const slashJawGape = sim.jawGapeAngle;
  assert.ok(
    slashPecFlare > 0.85,
    `Expected pectoral fins to flare outward for braking/stabilization during Bill Slash (pecFlareBlend=${slashPecFlare})`
  );
  assert.ok(
    slashJawGape > 0.14,
    `Expected lower jaw gape to open during predatory Bill Slash (jawGapeAngle=${slashJawGape})`
  );
  assert.ok(
    sim.dorsalSweepFold > 0.7,
    `Expected dorsalSweepFold to sweep fin rays backward when dorsal fin is folded (dorsalSweepFold=${sim.dorsalSweepFold})`
  );

  // 4. Verify Swish Burst streamlines pectoral fins and produces true thunniform propulsion (peduncle excursion >> thoracic nape excursion)
  sim.billSlashTimer = 0;
  triggerMarlinTailSwish(sim);
  assert.ok(sim.tailSwishBurstTimer > 0.5);

  let maxThoracicExcursion = 0;
  let maxPeduncleExcursion = 0;
  const thoraxIdx = Math.floor(sim.numSpine * 0.35);
  const peduncleIdx = sim.numSpine - 2;

  for (let i = 0; i < 24; i++) {
    stepBlueMarlinSim(sim, 1 / 60);
    maxThoracicExcursion = Math.max(
      maxThoracicExcursion,
      Math.abs(sim.stations[thoraxIdx].pos.x)
    );
    maxPeduncleExcursion = Math.max(
      maxPeduncleExcursion,
      Math.abs(sim.stations[peduncleIdx].pos.x)
    );
  }

  assert.ok(
    sim.pecFlareBlend < 0.35,
    `Expected pectoral fins to tuck back for hydrodynamic streamlining during Swish Burst (pecFlareBlend=${sim.pecFlareBlend})`
  );
  assert.ok(
    maxPeduncleExcursion > maxThoracicExcursion * 4.5,
    `Expected thunniform propulsion concentrated in caudal peduncle (${maxPeduncleExcursion}) >> thoracic nape (${maxThoracicExcursion})`
  );
});

test('Blue Marlin XPBD regional drag produces C2 smooth non-kinked bending while conserving Bill-to-Fork length, and dedicated controls work across edge cases', () => {
  const sim = createBlueMarlinSimState(40);
  const restTel = computeBlueMarlinTelemetry(sim);

  // 1. Drag the bill tip (station 1) strongly laterally and upward -> verify smooth C2 curve without single-station kink
  for (let i = 0; i < 18; i++) {
    stepBlueMarlinSim(sim, 1 / 60, {
      active: true,
      part: 'bill',
      stationIdx: 1,
      deltaX: 0.95,
      deltaY: 0.35,
      deltaZ: -0.15,
    });
  }

  // Verify the bill tip actually deflected laterally toward the drag target
  assert.ok(
    sim.stations[1].pos.x > 0.45,
    `Expected bill tip to deflect laterally under drag (pos.x=${sim.stations[1].pos.x})`
  );

  // Neighboring stations 0..12 must form a smooth curve (no sharp V-spike at station 1)
  for (let s = 1; s < 12; s++) {
    const prev = sim.stations[s - 1];
    const cur = sim.stations[s];
    const next = sim.stations[s + 1];
    const v1x = cur.pos.x - prev.pos.x;
    const v1y = cur.pos.y - prev.pos.y;
    const v1z = cur.pos.z - prev.pos.z;
    const v2x = next.pos.x - cur.pos.x;
    const v2y = next.pos.y - cur.pos.y;
    const v2z = next.pos.z - cur.pos.z;
    const l1 = Math.hypot(v1x, v1y, v1z) || 1;
    const l2 = Math.hypot(v2x, v2y, v2z) || 1;
    const cosBend = (v1x * v2x + v1y * v2y + v1z * v2z) / (l1 * l2);
    assert.ok(
      cosBend > 0.92,
      `Expected smooth non-kinked bill/head curve at station ${s} during drag (cosBend=${cosBend})`
    );
  }

  // Verify Bill-to-Fork length is conserved by the inextensible XPBD axial rod solver
  const draggedTel = computeBlueMarlinTelemetry(sim);
  assert.ok(
    Math.abs(draggedTel.billToForkLengthCm - restTel.billToForkLengthCm) <= 1.2,
    `Expected Bill-to-Fork length (${draggedTel.billToForkLengthCm} cm) to remain conserved near rest (${restTel.billToForkLengthCm} cm)`
  );

  // 2. Verify Swish Burst works even when Tail Swish slider is set to 0%
  const zeroSliderSim = createBlueMarlinSimState(40);
  zeroSliderSim.tailSwishIntensity = 0;
  triggerMarlinTailSwish(zeroSliderSim);
  for (let i = 0; i < 15; i++) {
    stepBlueMarlinSim(zeroSliderSim, 1 / 60);
  }
  assert.ok(
    getEffectiveMarlinSwish(zeroSliderSim).effectiveSwish > 0.6,
    'Expected Swish Burst to produce strong positive effective swish even when slider is at 0%'
  );

  // 3. Verify Light-Up Stripes toggle OFF zeroes stripe glow & per-stripe excitation, and toggle ON triggers a traveling wave across the 15 bars
  zeroSliderSim.lightUpMode = false;
  zeroSliderSim.billSlashTimer = 0;
  zeroSliderSim.tailSwishBurstTimer = 0;
  zeroSliderSim.stripePulseTimer = 0;
  for (let i = 0; i < 45; i++) {
    stepBlueMarlinSim(zeroSliderSim, 1 / 60);
  }
  assert.equal(
    computeBlueMarlinTelemetry(zeroSliderSim).stripeGlowPct,
    0,
    'Expected Stripe Glow to decay to 0% when Light-Up Stripes is toggled OFF'
  );
  assert.ok(
    zeroSliderSim.perStripeExcitation.every((v) => v < 0.05),
    'Expected all 15 lateral bars to decay near zero when Light-Up Stripes is OFF'
  );

  zeroSliderSim.lightUpMode = true;
  const phaseBefore = zeroSliderSim.stripeWavePhase;
  for (let i = 0; i < 12; i++) {
    stepBlueMarlinSim(zeroSliderSim, 1 / 60);
  }
  assert.ok(
    zeroSliderSim.stripeWavePhase > phaseBefore + 0.5,
    'Expected rostral-to-caudal stripeWavePhase to advance when Light-Up Stripes is active'
  );
  assert.notEqual(
    zeroSliderSim.perStripeExcitation[0],
    zeroSliderSim.perStripeExcitation[7],
    'Expected traveling wave to produce spatial phase variation across the 15 lateral stripes'
  );

  // 4. Verify shared dorsal span & sweep helpers
  assert.ok(
    evaluateMarlinDorsalSpan(0.12) > evaluateMarlinDorsalSpan(0.75) * 3.0
  );
  assert.ok(
    evaluateMarlinDorsalSweep(0.2, 1.0, 1.0) >
      evaluateMarlinDorsalSweep(0.2, 1.0, 0.0)
  );
});

test('Blue Marlin 3D horizontal (forward/backward) drag produces longitudinal glide, elastic stretch/compression, and dorsal sail lateral bend never inverts leading-edge triangles', async () => {
  const THREE = await import('three');
  // 1. Verify forward (+Z) and backward (-Z) horizontal drag deforms body longitudinally and vertically, not only left-right
  const forwardSim = createBlueMarlinSimState(40);
  const backwardSim = createBlueMarlinSimState(40);
  const restHubZ = forwardSim.stations[15].pos.z;
  const restLen = computeBlueMarlinTelemetry(forwardSim).billToForkLengthCm;

  for (let i = 0; i < 18; i++) {
    stepBlueMarlinSim(forwardSim, 1 / 60, {
      active: true,
      part: 'spine',
      stationIdx: 13,
      deltaX: 0.0,
      deltaY: 0.0,
      deltaZ: 0.85,
    });
    stepBlueMarlinSim(backwardSim, 1 / 60, {
      active: true,
      part: 'spine',
      stationIdx: 13,
      deltaX: 0.0,
      deltaY: 0.0,
      deltaZ: -0.85,
    });
  }

  // Forward drag shifts stations forward (+Z) and stretches axial segments
  assert.ok(
    forwardSim.stations[13].pos.z > restHubZ + 0.35,
    `Expected forward drag (+Z) to shift body longitudinally forward (got z=${forwardSim.stations[13].pos.z} vs rest=${restHubZ})`
  );
  // Backward drag shifts stations backward (-Z) and arches the dorsal spine upward compared to forward stretch
  assert.ok(
    backwardSim.stations[13].pos.z < restHubZ - 0.35,
    `Expected backward drag (-Z) to shift body longitudinally backward (got z=${backwardSim.stations[13].pos.z} vs rest=${restHubZ})`
  );
  assert.ok(
    backwardSim.stations[13].pos.y > forwardSim.stations[13].pos.y + 0.04,
    `Expected backward axial compression (-Z) to arch dorsal nape upward in 3D (got backward y=${backwardSim.stations[13].pos.y} vs forward y=${forwardSim.stations[13].pos.y})`
  );
  const forwardLen = computeBlueMarlinTelemetry(forwardSim).billToForkLengthCm;
  const backwardLen = computeBlueMarlinTelemetry(backwardSim).billToForkLengthCm;
  assert.ok(
    forwardLen > restLen + 1.0 && backwardLen < restLen - 0.8,
    `Expected forward drag to elastically stretch (${forwardLen} cm) and backward drag to compress (${backwardLen} cm) relative to rest (${restLen} cm)`
  );

  // 2. Verify dorsal sail lateral drag (worldDeflect.x = ±0.46) preserves monotonic Z ordering across leading-edge columns (zero triangle inversion / gray side)
  const chordSegs = 28;
  const spanSegs = 12;
  const dorsalSail = createSpineSkinnedSailDorsal(0.82, 0.175, chordSegs, spanSegs);
  const stationRenderY = new Float32Array(
    forwardSim.stations.map((st) => st.pos.y)
  );
  const outRoot = new THREE.Vector3();
  const outTip = new THREE.Vector3();

  for (const lateralX of [0.46, -0.46]) {
    dorsalSail.updateFromSpine(
      forwardSim.stations,
      stationRenderY,
      1.0,
      1.0,
      1.0,
      0.0,
      new THREE.Vector3(lateralX, 0.08, -0.05),
      0.22,
      1.25,
      0.15,
      outRoot,
      outTip
    );

    const posAttr = dorsalSail.geometry.getAttribute('position');
    const normAttr = dorsalSail.geometry.getAttribute('normal');
    const vertsPerRing = spanSegs * 2 + 1;

    // At every spanwise ring position j = 1..(vertsPerRing - 2), column c=0 must remain strictly ahead (+Z) of c=2 and c=4 (never overtaking or flipping winding)
    for (let j = 1; j < vertsPerRing - 1; j++) {
      const idxC0 = 0 * vertsPerRing + j;
      const idxC2 = 2 * vertsPerRing + j;
      const idxC4 = 4 * vertsPerRing + j;
      const z0 = posAttr.getZ(idxC0);
      const z2 = posAttr.getZ(idxC2);
      const z4 = posAttr.getZ(idxC4);
      assert.ok(
        z0 > z2 && z2 > z4,
        `Dorsal sail leading-edge columns must remain strictly ordered in Z at ring ${j} under lateralX=${lateralX} (z0=${z0}, z2=${z2}, z4=${z4})`
      );

      // Verify normals remain normalized and valid
      const nx = normAttr.getX(idxC2);
      const ny = normAttr.getY(idxC2);
      const nz = normAttr.getZ(idxC2);
      const nLen = Math.hypot(nx, ny, nz);
      assert.ok(Math.abs(nLen - 1.0) < 0.05, `Expected unit normal on dorsal sail (len=${nLen})`);
    }
  }
});

