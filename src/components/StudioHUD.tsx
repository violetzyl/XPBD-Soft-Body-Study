import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Info, Layers, Sliders } from 'lucide-react';
import { COLOURWAYS, ColourwayId } from '../sim/colourways';
import { LIGHTING_PRESETS, LightingPresetId } from '../sim/lightingPresets';
import { getSpecimenDefinition, SPECIMEN_LIST } from '../specimens/registry';
import { SpecimenId, SpecimenTelemetry } from '../specimens/types';
import { GeneralControlsModule } from './controls/GeneralControlsModule';

export interface StudioHUDProps {
  specimenId: SpecimenId;
  onSelectSpecimen: (id: SpecimenId) => void;
  specimenParams: any;
  onChangeSpecimenParams: (next: any) => void;
  colourway: ColourwayId;
  onSelectColourway: (id: ColourwayId) => void;
  lightingPreset: LightingPresetId;
  onSelectLightingPreset: (id: LightingPresetId) => void;
  showTetCage: boolean;
  onToggleTetCage: () => void;
  onDropBaitBead: () => void;
  onClearBeads: () => void;
  onLiftAndDrop: () => void;
  onResetPose: () => void;
  onSelectCameraPreset: (presetId: string) => void;
  activeCameraPreset: string;
  telemetry: SpecimenTelemetry;
}

export const StudioHUD: React.FC<StudioHUDProps> = ({
  specimenId,
  onSelectSpecimen,
  specimenParams,
  onChangeSpecimenParams,
  colourway,
  onSelectColourway,
  lightingPreset,
  onSelectLightingPreset,
  showTetCage,
  onToggleTetCage,
  onDropBaitBead,
  onClearBeads,
  onLiftAndDrop,
  onResetPose,
  onSelectCameraPreset,
  activeCameraPreset,
  telemetry,
}) => {
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [showStudyNotes, setShowStudyNotes] = useState(false);
  const [displayObjectsOpen, setDisplayObjectsOpen] = useState(true);

  const specimenDef = getSpecimenDefinition(specimenId);
  const SpecificControls = specimenDef.SpecificControlsComponent;
  const activePal = COLOURWAYS[colourway];
  const activeLight = LIGHTING_PRESETS[lightingPreset];

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-4 md:p-6">
      {/* Top Row: Left Rail (Specimen Identity + Separate Display Objects Area) & Right Rail (Live Physical Readouts) */}
      <header className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        {/* Left Rail: Specimen Identity Card + Dedicated Display Objects Sliding Drop-Down Area */}
        <div className="flex flex-col items-start gap-2.5 max-w-lg">
          {/* Specimen Identity & Studio Subtitle */}
          <div className="pointer-events-auto bg-[#f7f4ee]/95 border border-stone-300/80 rounded-xl px-4 py-3 shadow-sm w-full">
            <div className="flex items-center justify-between gap-4">
              <h1 className="text-base md:text-lg font-bold tracking-tight text-stone-900 whitespace-nowrap">
                {specimenDef.name}
              </h1>
              <button
                type="button"
                onClick={() => setShowStudyNotes((prev) => !prev)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-stone-700 hover:text-stone-950 bg-stone-200/75 hover:bg-stone-300/80 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                aria-expanded={showStudyNotes}
              >
                <Info className="w-3.5 h-3.5" />
                <span>Specimen Notes</span>
              </button>
            </div>

            {/* Unboxed metadata with middle-dot separators (Zero-Pill Discipline) */}
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-stone-600">
              <span className="font-mono-tabular font-medium text-stone-800">
                {telemetry.specimenPrefix} · {activePal.name.toUpperCase()}
              </span>
              <span aria-hidden="true">·</span>
              <span>{activeLight.name}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-tabular">
                {telemetry.adhesionLabel}: {telemetry.adhesionPct}%
              </span>
              <span aria-hidden="true">·</span>
              <span data-testid="grab-region-status" className="text-stone-700 font-medium">
                {telemetry.grabRegionLabel}
              </span>
            </div>
          </div>

          {/* Dedicated Display Objects Area with Smooth Sliding Drop-Down Expansion */}
          <nav
            aria-label="Display Objects Collection"
            data-testid="specimen-selector-area"
            className="pointer-events-auto bg-[#f7f4ee]/95 border border-stone-300/80 rounded-xl px-3.5 py-2.5 shadow-sm w-full sm:w-[340px] max-w-full overflow-hidden transition-all duration-300"
          >
            <button
              type="button"
              data-testid="display-objects-toggle"
              onClick={() => setDisplayObjectsOpen((prev) => !prev)}
              aria-expanded={displayObjectsOpen}
              aria-controls="display-objects-dropdown-list"
              className="w-full min-w-0 flex items-center justify-between gap-2 text-left cursor-pointer group overflow-hidden"
            >
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-800 shrink-0">
                <Layers className="w-3.5 h-3.5 text-stone-600 group-hover:text-stone-900 transition-colors shrink-0" />
                <span className="whitespace-nowrap">Display Objects</span>
              </div>
              <div className="inline-flex items-center justify-end gap-1.5 min-w-0 flex-1 overflow-hidden">
                <span
                  data-testid="display-objects-active-label"
                  className="text-[11px] font-medium text-stone-600 font-mono-tabular truncate"
                >
                  {specimenDef.shortName} · {specimenDef.specimenPrefix}
                </span>
                <span className="w-5 h-5 rounded-md bg-stone-200/75 group-hover:bg-stone-300/80 inline-flex items-center justify-center shrink-0 transition-colors">
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-stone-600 transition-transform duration-300 ease-out shrink-0 ${
                      displayObjectsOpen ? 'rotate-180 text-stone-900' : 'rotate-0'
                    }`}
                  />
                </span>
              </div>
            </button>

            {/* Smooth Sliding Drop-Down Drawer */}
            <div
              id="display-objects-dropdown-list"
              className={`grid transition-all duration-300 ease-out ${
                displayObjectsOpen
                  ? 'grid-rows-[1fr] opacity-100 mt-2.5 pt-2 border-t border-stone-200/90'
                  : 'grid-rows-[0fr] opacity-0 mt-0 pt-0 border-t border-transparent pointer-events-none'
              }`}
            >
              <div className="overflow-hidden min-w-0">
                <div
                  role="group"
                  aria-label="Jelly Specimen Selector"
                  className="flex flex-col gap-1.5 min-w-0"
                >
                  {SPECIMEN_LIST.map((spec) => {
                    const active = spec.id === specimenId;
                    return (
                      <button
                        key={spec.id}
                        type="button"
                        data-testid={`select-specimen-${spec.id}`}
                        onClick={() => onSelectSpecimen(spec.id)}
                        aria-pressed={active}
                        className={`w-full min-w-0 flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 cursor-pointer overflow-hidden ${
                          active
                            ? 'bg-stone-900 text-white shadow-xs'
                            : 'bg-stone-200/60 text-stone-700 hover:text-stone-950 hover:bg-stone-300/60'
                        }`}
                      >
                        <div className="flex flex-col items-start min-w-0 flex-1 overflow-hidden text-left">
                          <span className="font-semibold truncate w-full">
                            {spec.shortName}
                          </span>
                          <span
                            className={`text-[10px] truncate w-full ${
                              active ? 'text-stone-300' : 'text-stone-500'
                            }`}
                          >
                            {spec.specificControlsTitle}
                          </span>
                        </div>
                        <span
                          className={`text-[10px] font-mono-tabular px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap ${
                            active
                              ? 'bg-stone-800 text-stone-200'
                              : 'bg-stone-300/70 text-stone-600'
                          }`}
                        >
                          {spec.specimenPrefix}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </nav>
        </div>

        {/* Right: Live Specimen Physical Readouts */}
        <section
          aria-label="Live Specimen Physical Readouts"
          className="pointer-events-auto bg-[#f7f4ee]/95 border border-stone-300/80 rounded-xl px-4 py-2.5 shadow-sm grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6"
        >
          {telemetry.metrics.map((m, idx) => (
            <div
              key={m.id}
              className={`flex flex-col ${
                idx > 0 ? 'border-l border-stone-200/90 pl-4' : ''
              }`}
            >
              <span className="text-[11px] font-medium text-stone-500">
                {m.label}
              </span>
              <span
                data-testid={m.testId}
                className="text-base md:text-lg font-semibold text-stone-900 font-mono-tabular"
              >
                {m.value}{' '}
                <span className="text-xs font-normal text-stone-500">{m.unit}</span>
              </span>
            </div>
          ))}
        </section>
      </header>

      {/* Expandable Specimen Notes Popover */}
      {showStudyNotes && (
        <aside
          aria-label="Specimen Anatomy and Simulation Details"
          className="pointer-events-auto self-start mt-2 bg-[#f7f4ee]/95 border border-stone-300/90 rounded-xl p-4 shadow-md max-w-md text-xs text-stone-700 space-y-2"
        >
          <div className="flex items-center justify-between border-b border-stone-200 pb-2">
            <span className="font-semibold text-stone-900">
              {specimenDef.studyNotes.title}
            </span>
            <button
              type="button"
              onClick={() => setShowStudyNotes(false)}
              className="text-stone-500 hover:text-stone-900 font-medium px-1.5 py-0.5 rounded"
            >
              Close
            </button>
          </div>
          {specimenDef.studyNotes.paragraphs.map((p, i) => (
            <p key={i} className="leading-relaxed">
              {p}
            </p>
          ))}
          <div className="pt-1 flex items-center justify-between text-[11px] text-stone-500 border-t border-stone-200/80 font-mono-tabular">
            <span>Mean Strain: {telemetry.meanStrainPct.toFixed(1)}%</span>
            <span>
              {telemetry.adhesionLabel}: {telemetry.adhesionPct}%
            </span>
          </div>
        </aside>
      )}

      {/* Split Control Dock: Module 1 (General Studio Controls) + Module 2 (Object-Specific Controls) */}
      <div className="pointer-events-auto self-center w-full max-w-[980px] flex flex-col items-center">
        <button
          type="button"
          onClick={() => setDockCollapsed((c) => !c)}
          className="mb-1.5 inline-flex items-center gap-1.5 px-3.5 py-1 text-xs font-medium text-stone-700 hover:text-stone-950 bg-[#f7f4ee]/95 border border-stone-300/80 rounded-lg shadow-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          aria-expanded={!dockCollapsed}
        >
          {dockCollapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              <span>Show Controls</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              <span>Hide Controls</span>
            </>
          )}
        </button>

        {!dockCollapsed && (
          <div className="w-full bg-[#f7f4ee]/95 border border-stone-300/90 rounded-2xl p-3.5 md:p-4 shadow-md flex flex-col gap-3">
            {/* Module A: General Studio Controls (Shared across all jelly specimens) */}
            <GeneralControlsModule
              colourway={colourway}
              supportedColourways={specimenDef.supportedColourways}
              onSelectColourway={onSelectColourway}
              lightingPreset={lightingPreset}
              onSelectLightingPreset={onSelectLightingPreset}
              showTetCage={showTetCage}
              onToggleTetCage={onToggleTetCage}
              activeBeadCount={telemetry.activeBeadCount}
              onDropBaitBead={onDropBaitBead}
              onClearBeads={onClearBeads}
              onLiftAndDrop={onLiftAndDrop}
              onResetPose={onResetPose}
              cameraPresets={specimenDef.cameraPresets}
              activeCameraPreset={activeCameraPreset}
              onSelectCameraPreset={onSelectCameraPreset}
            />

            {/* Module B: Object-Specific Controls (Swapped dynamically per specimen) */}
            <div
              data-testid="object-specific-controls-panel"
              className="pt-2.5 border-t border-stone-300/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
            >
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-800 whitespace-nowrap shrink-0">
                <Sliders className="w-3.5 h-3.5 text-stone-600" />
                <span>{specimenDef.specificControlsTitle}</span>
              </div>
              <div className="flex-1">
                <SpecificControls
                  params={specimenParams}
                  onChangeParams={onChangeSpecimenParams}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
