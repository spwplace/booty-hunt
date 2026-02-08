# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run dev              # Vite dev server with HMR
npm run build            # typecheck + production build (Terser minification)
npm run typecheck        # tsc --noEmit
npm run lint             # ESLint (src/**/*.ts)
npm run test             # vitest run (all src/**/*.test.ts)
npx vitest run src/Crew.test.ts   # run a single test file
npm run preview          # preview production build
```

**Environment flags** (prefix with `VITE_`): `DEV` enables DevPanel, `ENABLE_SCENARIO_EDITOR` enables the level editor, `ENABLE_TELEMETRY_EXPORT` enables telemetry. All disabled in main branch CI builds.

## Architecture

3D pirate ship roguelike. Three.js + TypeScript + Vite. Zero external assets — all geometry, audio, and shaders are procedural.

### Orchestrator Pattern

`main.ts` (~6800 lines) is the central orchestrator. It owns the Three.js scene, camera, renderer, game loop (`requestAnimationFrame`), input handling, and game state machine. All other systems are imported and coordinated through main.ts — systems don't talk to each other directly.

### Key Systems

| System | File(s) | Role |
|--------|---------|------|
| Ocean | `Ocean.ts` | Gerstner wave GLSL shader (8 layers), `uWaveScale` uniform driven by weather |
| Sky | `Sky.ts` | ShaderMaterial dome with `uSkyTop/uSkyMid/uSkyHorizon/uSunDir` uniforms |
| Weather | `Weather.ts` | State machine (clear/foggy/stormy/night), smoothstep transitions. `setTargets()` wires fog, sun, ambient, skyMaterial, oceanMaterial |
| Combat | `Combat.ts` | InstancedMesh cannonball pool (100), port/starboard broadsides, hit detection |
| EnemyAI | `EnemyAI.ts` | 6 AI types: flee, circle_strafe, beeline, phase, formation |
| Audio | `Audio.ts` | Singleton `audio`, Web Audio API procedural synthesis, lazy-init on first user interaction |
| Progression | `Progression.ts` | 15-wave 3-act run, 24 upgrades (Fisher-Yates shuffle), wave lifecycle, localStorage persistence |
| UI | `UI.ts` | All HUD, menus, dialogs, codex — DOM-based overlay |
| Effects | `Effects.ts` | 12+ particle/FX systems (GoldBurst, Explosions, WakeTrail, Rain, Kraken tentacles, etc.) |
| MapNodes | `MapNodeSystem.ts` | Roguelike branching DAG map: 3 acts × 5 layers, seeded generation |
| V2Content | `V2Content.ts` + `src/data/*.json` | Data-driven content registry for regions, factions, events, doctrines |
| Editor | `ScenarioEditor.ts`, `EditorCamera.ts`, `EditorUI.ts`, `Scenario.ts` | Runtime level editor (env-flag gated) |

### Game State Flow

```
Title → Run Setup (seed input) → [pre_wave → active → wave_complete → map choice/upgrade → ...] × 15 waves
                                   ↕ port visits between acts
                                   → Victory/Death → Run Summary → Title
```

`gamePaused` freezes gameplay but weather/camera/effects still update.

### Integration Patterns

- Merchants (enemy ships) have combat props: `hp`, `maxHp`, `armed`, `fireTimer`, `hitRadius` — all managed in main.ts
- `Weather.setTargets()` is the bridge between weather state and rendering materials
- Region hazards in `V2Content` modify wave configs via `applyMapNodeToWaveConfig()`
- Economy resources (supplies, intel, rep tokens) affect gameplay: port discounts, wave preview intel, armed% reduction
- Run seeds stored as hex, shown on death/victory, accepted in run setup for reproducibility

### Shaders

All GLSL is written inline as template strings (no external .glsl files). Ocean and Sky are the two main shader systems.

### CSS & HTML

All CSS is inline in `index.html` (~87KB). Skeuomorphic naval palette. Uses Pirata One font. Colorblind mode support via CSS filters.

## CI/CD

GitHub Actions CI (`ci.yml`): lint → test → build on push to dev/main and PRs. Deploy (`deploy.yml`) publishes to GitHub Pages with versioned structure (tagged versions at `/v*`, dev at `/dev`, main at `/`).
