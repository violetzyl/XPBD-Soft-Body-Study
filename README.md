# Bilayer Jelly Marine Biomechanics Study

An interactive 3D soft-body biomechanics and optical study of marine organisms—**Octopus (`OCT-JL-01`)**, **Tiger Shark (`SHK-JL-02`)**, and **Blue Marlin (`MRL-JL-03`)**—combining **Extended Position-Based Dynamics (XPBD)** tetrahedral and axial rod physics, **Signed-Distance-Field (SDF)** anatomical cross-sections, dual-layer translucent jelly rendering with **Beer–Lambert optical absorption**, physical refraction, subsurface scattering (SSS), normal-mapped dermal micro-anatomy, and interactive bioluminescence.

---

## Key Features & Specimen Collection

### 1. Blue Marlin (`Makaira nigricans` · `MRL-JL-03`)
- **SDF Pelagic Anatomy & Falcate Hydrofoils**:
  - Tall, narrow laterally compressed body with a steep high nape (`u ≈ 0.28–0.42`) tapering into a slender, elevated caudal peduncle equipped with dual horizontal keels.
  - Long, tapered, rounded rostral bill paired with an articulated shorter lower jaw (mandible) and flush-mounted lateral pelagic eyes.
  - **Consistent Falcate Fin Profiles** (convex leading edges and concave/falcate trailing edges):
    - **Primary Dorsal Sail**: Tall swept-back anterior lobe transitioning smoothly into a low posterior dorsal crest, skinned directly to the deforming XPBD spine.
    - **Secondary Dorsal & Anal Finlets**, **Primary Falcate Anal Fin**, **Long Sickle-Shaped Pectoral Fins** (with dynamic hydroplane flare during braking/slashing and streamlined sprint tuck during caudal bursts), **Thin Ventral Pelvic Spines**, and a **Unified High Crescent Lunate Caudal Tail** with double-hinged hydrodynamic feathering.
- **Dual-Layer Jelly Optics & Normal-Mapped Micro-Anatomy**:
  - Clear cobalt-hued outer jelly layer with **Beer–Lambert volumetric absorption** (`attenuationColor` / `attenuationDistance`) and physical transmission over a milky-silver inner underbelly core exhibiting angle-dependent guanine iridescence and grazing sheen.
  - Dark dorsal countershading and **15 organic lateral stripes** composed of elongated dorsal dashes transitioning into ventral ovoid spots.
  - Procedural tangent-space **normal mapping** encoding radial bony lepidotrichia fin rays, multi-plate operculum (gill cover), mandibular mouth gape, paired olfactory nostrils (nares), and the lateral line sensory canal with neuromast pores.
  - **Colourways**: *Cobalt*, *Lilac*, *Midnight*, and *Sunrise*.
- **Muscle-Strain Kinematics & Optimized `Light-Up Stripes` Effect**:
  - **Tail Swish & Swish Burst**: Carangiform/thunniform propulsive wave concentrated in the posterior caudal peduncle and crescent tail.
  - **Bill Slash**: Rapid side-to-side figure-eight predatory slashing motion of the bill through clusters of bait beads, coordinated with pectoral hydrofoil braking flare and lower jaw gape.
  - **Volume-Preserving Dorsal Fin Fold / Raise**: Vertically compresses or raises the internal dorsal fin tetrahedral truss (`scaleXZ = 1 / sqrt(scaleY)`) while strictly conserving total specimen volume (`1685.0 cm³`).
  - **Interactive `Light-Up Stripes` Bioluminescence**:
    - Toggles electric-blue neural iridophore luminescence across the 15 lateral spot-and-dash bars, lateral line neuromasts, and fin rays.
    - **Rostral-to-Caudal Traveling Excitation Wave**: Neural excitation waves propagate sequentially from behind the operculum (`u = 0.305`) to the caudal peduncle (`u = 0.835`), accelerating during *Bill Slash* and *Swish Burst* maneuvers.
    - **Dorso-Ventral Iridophore Scintillation & White-Cyan Core Bloom**: Individual spots and dashes shimmer vertically along each bar and flare with hot white-cyan cores on wave crests and bait-bead impacts.
    - **Localized Touch & Drag Shockwave**: Grabbing or dragging the bill, dorsal sail, trunk, or fins excites a concentric electric-cyan ripple radiating outward from the grabbed station across neighboring stripes, accompanied by a dynamic internal bioluminescent point light.
  - **Real-Time Physical Telemetry**: Live readouts for **Mass (`g`)**, **Volume (`cm³`)**, **Bill-to-Fork Length (`cm`)**, and **Dorsal Fin Height (`cm`)**.

---

### 2. Octopus (`Octopus vulgaris` · `OCT-JL-01`)
- **Cohesive XPBD Tetrahedral Soft-Body & Hydrostatic Mantle**:
  - 8 muscular hydrostat arms integrated with biological curvature (sweeping across the tabletop and rolling the outer third into a protective curl with progressively firmer tips).
  - Raised orbital eyes with horizontal bar pupils, supraocular horns, leaning hydrostatic mantle sac, lateral siphon funnel, and two staggered rows of ventral suction cups.
- **Regional Drag & Suction Adhesion**:
  - Differentiated biomechanics when dragging an arm tip (smooth uncoiling and elastic whip-recoil while the other 7 arms remain anchored by suction grip) versus dragging the head or mantle sac (cohesive whole-body stretch and suction release on strong upward lift, followed by multi-bounce jelly squash-and-stretch on release).
- **Poses & Strain Controls**:
  - Adjustable muscle **Strain** intensity (`0%–150%`) driving multi-arm asynchronous writhing waves, plus three poses: **Writhe**, **Curl Up**, and **Let Go**.
  - **Colourways**: *Coral*, *Plum*, and *Mint*.

---

### 3. Tiger Shark (`Galeocerdo cuvier` · `SHK-JL-02`)
- **Pelagic Hydrodynamics & Interactive Fin/Body Compliance**:
  - Broad, blunt rectangular snout, muscular fusiform trunk, tall falcate first dorsal fin, wide swept pectoral hydrofoils, pelvic/anal fins, caudal keels, and a high heterocercal upper caudal lobe with sub-terminal notch.
  - Interactive 3D dragging across the snout, trunk, dorsal/pectoral fins, and caudal tail with viscoelastic spring recoil, plus **Cruising**, **Agile Turn**, and **Chomp Snap** modes.

---

## Project Architecture & Decoupled Structure

The project is architected so that display specimens, physics solvers, procedural skinning/textures, and UI control modules are cleanly decoupled:

```text
├── index.html
├── metadata.json
├── package.json
└── src/
    ├── App.tsx                                 # Root application state, specimen switching & HUD layout
    ├── main.tsx                                # React entry point
    ├── index.css                               # Tailwind CSS & typography rules
    ├── components/
    │   ├── OctopusJellyCanvas.tsx              # Shared Three.js viewport, lighting presets, SSS & raycast drag loop
    │   ├── DisplayObjectsDropdown.tsx          # Smooth sliding specimen selector dropdown (OCT-JL-01 / SHK-JL-02 / MRL-JL-03)
    │   └── controls/
    │       ├── GeneralControlsBar.tsx          # Shared controls (Colourways, Lighting, Bait Beads, Camera Presets, Cage, Reset)
    │       ├── OctopusControlsModule.tsx       # Octopus-specific controls (Strain slider, Writhe / Curl Up / Let Go)
    │       ├── SharkControlsModule.tsx         # Tiger Shark-specific controls (Swim Speed, Cruising / Agile Turn / Chomp Snap)
    │       └── BlueMarlinControlsModule.tsx    # Blue Marlin-specific controls (Tail Swish, Swish Burst, Bill Slash, Dorsal Fold/Raise, Light-Up Stripes)
    ├── specimens/
    │   ├── types.ts                            # Specimen interfaces (JellySpecimenDefinition, SpecimenRuntimeController, SpecimenTelemetry)
    │   ├── registry.ts                         # Central decoupled specimen registry (SPECIMEN_LIST & getSpecimenDefinition)
    │   ├── octopusSpecimen.tsx                 # Octopus runtime controller & telemetry adapter
    │   ├── sharkSpecimen.tsx                   # Tiger Shark runtime controller & telemetry adapter
    │   └── blueMarlinSpecimen.tsx              # Blue Marlin runtime controller, custom bioluminescent shader & telemetry adapter
    └── sim/
        ├── xpbdSolver.ts                       # XPBD tetrahedral soft-body solver & WGSL compute shader reference for Octopus
        ├── octopusAnatomy.ts                   # Octopus curvature integration, eyes, horns, siphon & staggered suckers
        ├── octopusSkinMesh.ts                  # Continuous Dual-Layer skinning for the 8-arm Octopus mesh
        ├── sharkSkinMesh.ts                    # SDF axial & fin skinning for the Tiger Shark
        ├── blueMarlinSim.ts                    # Blue Marlin SDF profile, XPBD axial rod & volume-preserving dorsal tetrahedral solver
        ├── blueMarlinSkinMesh.ts               # Blue Marlin spine-skinned dorsal sail, falcate hydrofoil fins & mandible geometry
        ├── proceduralTextures.ts               # Memoized procedural CanvasTextures (chromatophore mottle, normal maps, marlin stripes)
        ├── colourways.ts                       # Bilayer optical colourway definitions (Coral, Plum, Mint, Cobalt, Lilac, Midnight, Sunrise)
        ├── lightingPresets.ts                  # Studio 3/4, Dramatic Rim & Subtle Underwater lighting + SSS parameters
        └── xpbdSolver.test.ts                  # Node unit test suite covering XPBD physics, dorsal volume conservation & 3D drag
```

### Adding a New Specimen
Because the viewport and control panel are decoupled into **General** (`GeneralControlsBar`) and **Specimen-Specific** (`SpecificControlsComponent`) modules:
1. Create a simulation/geometry module in `src/sim/` and a specific controls component in `src/components/controls/`.
2. Implement `JellySpecimenDefinition<TParams>` in `src/specimens/<newSpecimen>.tsx` with `createController(shared)` and `SpecificControlsComponent`.
3. Register the new definition in `src/specimens/registry.ts`—the `DisplayObjects` dropdown, camera framing presets, colourway bar, and telemetry readouts adapt automatically.

---

## Getting Started

### Prerequisites
- **Node.js** `>= 20.x` (or **Bun** `>= 1.x`)

### Installation
```bash
npm install
```

### Running the Development Server
```bash
npm run dev
```
The application starts at `http://localhost:3000`.

### Running Unit Tests
The pure physics, SDF anatomy, volume-conservation, 3D drag compliance, and bioluminescent wave logic are tested via Node's native test runner:
```bash
npx tsx --test src/sim/xpbdSolver.test.ts
```

### Typechecking & Production Build
```bash
npm run lint
npm run build
```
