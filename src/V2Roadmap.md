# V2 Implementation Track

## Product Objective
Ship a V2 that adds durable world identity, stronger run variety, and cleaner meta feedback while keeping the existing combat loop readable and fast.

## What Is Already Landed
1. Data-driven V2 content packs:
   `src/data/regions.v2.json`, `src/data/factions.v2.json`, `src/data/events.v2.json`, `src/data/doctrines.v2.json`.
2. Runtime V2 systems:
   `V2ContentRegistry`, `NarrativeSystem`, `MapNodeSystem`, `FactionSystem`, `EconomySystem`, `TelemetrySystem`.
3. Node-driven run flow:
   map nodes drive wave context, region transitions, and faction pressure.
4. Faction combat shaping:
   pressure profiles modify AI tendencies and faction-biased enemy pools alter composition.
5. V2 economy HUD:
   Supplies, Intel, and Tokens now render live in gameplay UI.
6. Codex + meta persistence:
   codex unlocks and faction reputation snapshots are now stored in save data.
7. Victory polish:
   run summary includes V2 meta fields and the restart button is now wired.

## Remaining Milestones
1. Milestone A: Worldbuilding UX (complete)
   Codex now supports search + section/status filters and first-discovery spotlight toasts.
2. Milestone B: Faction Consequence Loop (complete)
   Contract event cards and negotiation choice prompts now react to regional faction context and route into reputation/economy outcomes.
3. Milestone C: Doctrine Gameplay (complete)
   Pre-run ship + doctrine setup is live and doctrine starter modifiers apply at run start.
4. Milestone D: Event Depth (in progress)
   Event deck expanded to 18 authored cards with interactive branch prompts, region bias weighting, and follow-up trigger chains (`followup:<card>:<choice>`).
5. Milestone E: Telemetry Surfaces (complete)
   Dev panel and hotkey telemetry export now dump event logs + counters + run context, plus `npm run analyze:telemetry -- <files...>` for choice-rate and win-delta summaries.
6. Milestone F: Content Scale (in progress)
   Runtime assertions now validate V2 content cross-references and data ranges; next step is scaling authored tables.

## Exit Criteria For V2
1. Every run surfaces at least one region identity beat, one faction beat, and one codex unlock.
2. Run summary stats match observed gameplay events (damage/events/treasure/crew/combo).
3. Faction reputation creates measurable divergence across two runs with different play styles.
4. New player can understand V2 resources and captain log context without external docs.
5. Build remains stable with `npm run build` and no TypeScript errors.
