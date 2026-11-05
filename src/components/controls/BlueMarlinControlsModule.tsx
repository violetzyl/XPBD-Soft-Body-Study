import React from 'react';
import { Sparkles, Swords, Waves, ArrowUpDown } from 'lucide-react';
import { BlueMarlinSpecificParams } from '../../sim/blueMarlinSim';
import { SpecificControlsProps } from '../../specimens/types';

export const BlueMarlinControlsModule: React.FC<
  SpecificControlsProps<BlueMarlinSpecificParams>
> = ({ params, onChangeParams }) => {
  const {
    tailSwishIntensity,
    dorsalRaised,
    lightUpMode,
    slashTriggerSeq,
    swishTriggerSeq,
  } = params;

  return (
    <div
      data-testid="specific-controls-blue-marlin"
      className="flex flex-wrap items-center justify-between gap-2.5"
    >
      {/* 1. Tail Swish / Muscle Strain Intensity Slider */}
      <div className="flex items-center gap-2 min-w-[165px] max-w-[220px] flex-1">
        <label
          htmlFor="marlin-swish-slider"
          className="text-xs font-medium text-stone-700 whitespace-nowrap shrink-0"
        >
          Tail Swish
        </label>
        <input
          id="marlin-swish-slider"
          type="range"
          min={0}
          max={1.5}
          step={0.05}
          value={tailSwishIntensity}
          onChange={(e) =>
            onChangeParams({
              ...params,
              tailSwishIntensity: parseFloat(e.target.value),
            })
          }
          className="w-full accent-stone-800 cursor-pointer"
        />
        <span className="text-xs font-mono-tabular text-stone-700 w-9 text-right shrink-0">
          {Math.round(tailSwishIntensity * 100)}%
        </span>
      </div>

      {/* 2. Muscle-Strain Action Bursts: Tail Swish & Rapid Bill Slash through Bait */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          data-testid="marlin-tail-swish-btn"
          onClick={() =>
            onChangeParams({
              ...params,
              swishTriggerSeq: (swishTriggerSeq || 0) + 1,
            })
          }
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-stone-800 bg-stone-200/85 hover:bg-stone-300/90 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Waves className="w-3.5 h-3.5 text-sky-600" />
          <span>Swish Burst</span>
        </button>

        <button
          type="button"
          data-testid="marlin-bill-slash-btn"
          onClick={() =>
            onChangeParams({
              ...params,
              slashTriggerSeq: (slashTriggerSeq || 0) + 1,
            })
          }
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-white bg-sky-700 hover:bg-sky-600 transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
        >
          <Swords className="w-3.5 h-3.5 text-cyan-200" />
          <span>Bill Slash</span>
        </button>
      </div>

      {/* 3. Volume-Preserving Dorsal Fin Fold / Raise Toggle */}
      <div
        role="group"
        aria-label="Dorsal Fin Fold or Raise"
        className="inline-flex items-center gap-1 bg-stone-200/75 p-1 rounded-lg"
      >
        <ArrowUpDown className="w-3.5 h-3.5 text-stone-500 ml-1 mr-0.5 shrink-0" />
        <button
          type="button"
          data-testid="marlin-dorsal-raise-btn"
          onClick={() => onChangeParams({ ...params, dorsalRaised: true })}
          aria-pressed={dorsalRaised}
          className={`px-2 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            dorsalRaised
              ? 'bg-white text-stone-950 shadow-xs'
              : 'text-stone-700 hover:text-stone-950'
          }`}
        >
          Raise Dorsal
        </button>
        <button
          type="button"
          data-testid="marlin-dorsal-fold-btn"
          onClick={() => onChangeParams({ ...params, dorsalRaised: false })}
          aria-pressed={!dorsalRaised}
          className={`px-2 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            !dorsalRaised
              ? 'bg-white text-stone-950 shadow-xs'
              : 'text-stone-700 hover:text-stone-950'
          }`}
        >
          Fold Dorsal
        </button>
      </div>

      {/* 4. Electric-Blue "Light-Up" Lateral Stripes Mode Toggle */}
      <button
        type="button"
        data-testid="marlin-light-up-btn"
        onClick={() =>
          onChangeParams({ ...params, lightUpMode: !lightUpMode })
        }
        aria-pressed={lightUpMode}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
          lightUpMode
            ? 'bg-sky-950 text-cyan-300 border border-cyan-400/50 shadow-xs'
            : 'bg-stone-200/75 text-stone-700 hover:text-stone-950'
        }`}
      >
        <Sparkles
          className={`w-3.5 h-3.5 ${
            lightUpMode ? 'text-cyan-300' : 'text-stone-500'
          }`}
        />
        <span>Light-Up Stripes</span>
      </button>
    </div>
  );
};
