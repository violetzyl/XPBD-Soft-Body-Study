import { useCallback, useEffect, useState } from 'react';
import { OctopusJellyCanvas } from './components/OctopusJellyCanvas';
import { StudioHUD } from './components/StudioHUD';
import { ColourwayId } from './sim/colourways';
import { LightingPresetId } from './sim/lightingPresets';
import { getSpecimenDefinition, SPECIMEN_REGISTRY } from './specimens/registry';
import { SpecimenId, SpecimenTelemetry } from './specimens/types';

export default function App() {
  const [specimenId, setSpecimenId] = useState<SpecimenId>('octopus');
  const [specimenParamsById, setSpecimenParamsById] = useState<
    Record<SpecimenId, any>
  >(() => ({
    octopus: { ...SPECIMEN_REGISTRY.octopus.defaultParams },
    tiger_shark: { ...SPECIMEN_REGISTRY.tiger_shark.defaultParams },
    blue_marlin: { ...SPECIMEN_REGISTRY.blue_marlin.defaultParams },
  }));

  const [colourway, setColourway] = useState<ColourwayId>('coral');
  const [lightingPreset, setLightingPreset] = useState<LightingPresetId>('studio');
  const [showTetCage, setShowTetCage] = useState<boolean>(false);
  const [dropBeadTrigger, setDropBeadTrigger] = useState<number>(0);
  const [clearBeadsTrigger, setClearBeadsTrigger] = useState<number>(0);
  const [liftAndDropTrigger, setLiftAndDropTrigger] = useState<number>(0);
  const [resetPoseTrigger, setResetPoseTrigger] = useState<number>(0);
  const [cameraPresetTrigger, setCameraPresetTrigger] = useState<{
    preset: string;
    seq: number;
  }>({ preset: 'studio', seq: 0 });

  const [telemetry, setTelemetry] = useState<SpecimenTelemetry>({
    specimenPrefix: 'OCT-JL-01',
    adhesionLabel: 'Suction Grip',
    adhesionPct: 100,
    grabRegionLabel:
      'Drag mantle, head, or arm tips · Feel regional jelly & suction response',
    activeBeadCount: 2,
    isDragging: false,
    meanStrainPct: 6.4,
    metrics: [
      {
        id: 'mass',
        label: 'Mass',
        value: '1428.4',
        unit: 'g',
        testId: 'readout-mass',
      },
      {
        id: 'volume',
        label: 'Volume',
        value: '1342.0',
        unit: 'cm³',
        testId: 'readout-volume',
      },
      {
        id: 'armSpan',
        label: 'Arm Span',
        value: '43.2',
        unit: 'cm',
        testId: 'readout-arm-span',
      },
      {
        id: 'mantleHeight',
        label: 'Mantle Height',
        value: '11.6',
        unit: 'cm',
        testId: 'readout-mantle-height',
      },
    ],
  });

  const activeParams =
    specimenParamsById[specimenId] ?? getSpecimenDefinition(specimenId).defaultParams;

  const handleChangeSpecimenParams = useCallback(
    (next: any) => {
      setSpecimenParamsById((prev) => ({
        ...prev,
        [specimenId]: next,
      }));
    },
    [specimenId]
  );

  const handleSelectSpecimen = useCallback((id: SpecimenId) => {
    setSpecimenId(id);
    const def = getSpecimenDefinition(id);
    const allowed: ColourwayId[] =
      def.supportedColourways && def.supportedColourways.length > 0
        ? def.supportedColourways
        : ['coral', 'plum', 'mint'];
    setColourway((prev) =>
      allowed.includes(prev) ? prev : def.defaultColourway ?? allowed[0]
    );
    setCameraPresetTrigger((prev) => ({ preset: 'studio', seq: prev.seq + 1 }));
  }, []);

  const handleDropBaitBead = useCallback(() => {
    setDropBeadTrigger((n) => n + 1);
  }, []);

  const handleClearBeads = useCallback(() => {
    setClearBeadsTrigger((n) => n + 1);
  }, []);

  const handleLiftAndDrop = useCallback(() => {
    setLiftAndDropTrigger((n) => n + 1);
  }, []);

  const handleResetPose = useCallback(() => {
    setResetPoseTrigger((n) => n + 1);
  }, []);

  const handleSelectCameraPreset = useCallback((preset: string) => {
    setCameraPresetTrigger((prev) => ({ preset, seq: prev.seq + 1 }));
  }, []);

  // Keyboard shortcuts for studio workflow
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.key === 'b' || e.key === 'B') {
        handleDropBaitBead();
      } else if (e.key === 'l' || e.key === 'L') {
        handleLiftAndDrop();
      } else if (e.key === '1') {
        setColourway('coral');
      } else if (e.key === '2') {
        setColourway('plum');
      } else if (e.key === '3') {
        setColourway('mint');
      } else if (e.key === 'r' || e.key === 'R') {
        handleResetPose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleDropBaitBead, handleLiftAndDrop, handleResetPose]);

  return (
    <main
      data-specimen={specimenId}
      data-colourway={colourway}
      data-lighting={lightingPreset}
      className="relative w-screen h-screen overflow-hidden bg-[#eae4dc] select-none"
    >
      <OctopusJellyCanvas
        specimenId={specimenId}
        specimenParams={activeParams}
        colourway={colourway}
        lightingPreset={lightingPreset}
        showTetCage={showTetCage}
        dropBeadTrigger={dropBeadTrigger}
        clearBeadsTrigger={clearBeadsTrigger}
        liftAndDropTrigger={liftAndDropTrigger}
        resetPoseTrigger={resetPoseTrigger}
        cameraPresetTrigger={cameraPresetTrigger}
        onTelemetryUpdate={setTelemetry}
      />

      <StudioHUD
        specimenId={specimenId}
        onSelectSpecimen={handleSelectSpecimen}
        specimenParams={activeParams}
        onChangeSpecimenParams={handleChangeSpecimenParams}
        colourway={colourway}
        onSelectColourway={setColourway}
        lightingPreset={lightingPreset}
        onSelectLightingPreset={setLightingPreset}
        showTetCage={showTetCage}
        onToggleTetCage={() => setShowTetCage((v) => !v)}
        onDropBaitBead={handleDropBaitBead}
        onClearBeads={handleClearBeads}
        onLiftAndDrop={handleLiftAndDrop}
        onResetPose={handleResetPose}
        onSelectCameraPreset={handleSelectCameraPreset}
        activeCameraPreset={cameraPresetTrigger.preset}
        telemetry={telemetry}
      />
    </main>
  );
}
