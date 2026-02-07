# Booty Hunt V2 - Comprehensive Design Plan

## 1. Product Vision

Booty Hunt V2 upgrades the game from a strong arcade prototype into a replayable pirate action roguelite with memorable world identity.

V2 target statement:

"Every run should feel like a chapter from a larger pirate saga: recognizable seas, rival factions, evolving crew stories, and high-skill naval combat with meaningful build choices."

---

## 2. Design Goals

### Primary Goals
1. Build a distinct world with place identity, faction conflict, and run-to-run narrative texture.
2. Increase strategic depth without sacrificing immediate arcade readability.
3. Improve long-term retention via stronger meta progression and mode variety.
4. Raise quality bar in UX, balancing, onboarding, and feedback polish.
5. Keep implementation realistic for a small team and browser platform limits.

### Non-Goals
1. Full open-world RPG scope.
2. Voice-acted narrative campaign.
3. Multiplayer in V2 launch scope.
4. Heavy authored 3D asset pipeline that breaks procedural/art-direction consistency.

---

## 3. Target Player and Session Model

### Audience Segments
1. Arcade action players who want quick, satisfying combat loops.
2. Roguelite players who want builds, synergies, and repeated mastery.
3. Style/atmosphere players who value world flavor and immersion.

### Session Targets
1. Normal run: 20-35 minutes.
2. Daily contract: 10-20 minutes.
3. Endless session: 15-60+ minutes.
4. First meaningful unlock: <30 minutes.

---

## 4. V2 Pillars

1. **Weaponized Seamanship**
   Wind, angle, range, and momentum remain the skill core.
2. **Legend of the Seas**
   Named waters, rival powers, and dynamic lore events contextualize every fight.
3. **Build a Living Crew**
   Crew choices become narrative and mechanical, not just passive stat boosts.
4. **High-Readability Chaos**
   Intense battles stay legible through disciplined UI/FX/audio signaling.

---

## 5. High-Level Experience Architecture

### Run Layer
1. Choose captain + ship frame + starting doctrine.
2. Sail through a node-based sea chart (combat, event, port, contract, boss).
3. Resolve each node with tactical combat and event choices.
4. Build run power through upgrades, relics, crew development, and ship modules.
5. End run at extraction, final boss, or sinking.

### Meta Layer
1. Persistent progression through faction reputation and account-level unlock trees.
2. New ships, doctrines, crew backgrounds, relic pools, and challenge modifiers.
3. Codex unlocks for lore, enemies, regions, and events.

---

## 6. Worldbuilding Framework (V2 Core Upgrade)

### 6.1 Sea Regions

Use 5 major regions per campaign seed. Each region has:
1. Distinct weather profile.
2. Primary hazards.
3. Dominant faction pressure.
4. Event deck bias.
5. Visual tone and music motif.

| Region | Theme | Hazards | Faction Pressure | Signature Event |
|--------|-------|---------|------------------|-----------------|
| Ember Shoals | Volcanic trade routes | Fire reefs, ash fog | Redwake Corsairs | Burning Armada |
| Mourning Expanse | Ghost-haunted open sea | Dense fog, phantom currents | Wraith Fleet | Toll of the Dead |
| Crownwater Reach | Militarized imperial lanes | Naval mine chains, patrol grids | Imperial Navy | Flagship Interdiction |
| Verdant Mael | Jungle archipelago | Serpent nests, storm walls | Free Captains | Idol of the Deep |
| Leviathan Deep | Abyssal frontier | Mega swells, abyss vents | Neutral/Monstrous | Leviathan Hunt |

### 6.2 Factions

Each faction should have:
1. Combat profile.
2. Economic profile.
3. Narrative voice.
4. Relationship rules with player actions.

Initial V2 factions:
1. Free Captains (pirate alliances, opportunistic contracts).
2. Imperial Navy (formation warfare, high armor, lawful patrols).
3. Redwake Corsairs (aggressive fire and boarding pressure).
4. Wraith Fleet (phase mechanics, morale attacks, curse interactions).
5. Merchant Consortium (non-combat but contract and economy leverage).

### 6.3 World Lore Delivery

Lore should be delivered through play, not walls of text:
1. Captain's Log feed (short diegetic lines during gameplay).
2. Port rumors (choice prompts, contract hooks).
3. Salvage relic descriptions (micro-lore).
4. Enemy intro cards (first encounter).
5. Codex entries unlocked by discoveries and victories.

### 6.4 Discovery Systems

1. Named islands and landmarks (already started in V1.5).
2. Region-first-entry reveal card.
3. "Charted" tracking for map completion and rewards.
4. Hidden landmarks with optional high-risk payouts.

---

## 7. Combat 2.0 Plan

### 7.1 Core Combat Additions

1. **Ammo Families**
   Round Shot (default), Chain Shot (mobility control), Grapeshot (crew/morale), Incendiary (DoT).
2. **Armor Zones**
   Bow, broadside, stern damage multipliers for positional play.
3. **Morale**
   A secondary combat axis affecting surrender, flee, and boarding outcomes.
4. **Ship Stress**
   Temporary handling penalties from storms, fire, and heavy damage.

### 7.2 Enemy Design Expansion

Add 4 archetypes:
1. Boarding Cutter (close-range disruption).
2. Mortar Barge (long-range arc artillery).
3. Support Brig (buff/debuff role).
4. Hunter Frigate (fast pursuit specialist).

### 7.3 Boss Design Rules

Every boss must include:
1. One clear signature mechanic.
2. One phase shift at ~50% HP.
3. One environment interaction (weather, hazards, summons).
4. One counterplay window communicated through UI/audio cues.

---

## 8. Run Structure and Mode Expansion

### 8.1 Main Campaign (V2)
1. Expand from 5 waves to 3 acts with 4-6 nodes per act.
2. Act bosses at end of Acts 1 and 2.
3. Final boss gauntlet at Act 3.
4. Mid-act port choice nodes with meaningful tradeoffs.

### 8.2 Endless Mode 2.0
1. Scaling mutator system every 3 rounds.
2. Rotating global rules after round 10.
3. Leaderboard-ready score breakdown.

### 8.3 Daily Contracts
1. Fixed seed + curated mutators.
2. One featured contract per day.
3. Ranked by score, time, and damage efficiency.
4. Anti-cheat-lite validation rules for suspicious runs.

### 8.4 Custom Voyage
1. Player-selected modifiers.
2. Sandbox mode for testing builds and accessibility.
3. No leaderboard submission.

---

## 9. Progression 2.0

### 9.1 Run-Bound Progression
1. Upgrade drafts remain, but grouped by category (Hull, Guns, Crew, Arcane).
2. Add relic slots with unique, run-defining effects.
3. Add "Doctrine" system (pick 1 early, shapes build direction).

### 9.2 Crew System Rework

Crew members gain:
1. Role.
2. Personality trait (mechanical modifier).
3. Loyalty level.
4. Event hooks (some events branch differently by crew composition).

Crew choices should impact:
1. Combat bonuses.
2. Economy outcomes.
3. Narrative outcomes.
4. Event options.

### 9.3 Meta Progression

Track three persistent paths:
1. Infamy (combat/performance unlocks).
2. Cartography (world/discovery unlocks).
3. Influence (faction/port/economy unlocks).

Unlock examples:
1. New ship hull families.
2. New starting doctrines.
3. Expanded relic pool.
4. New daily-contract modifier bands.

---

## 10. Event and Narrative Systems 2.0

### 10.1 Event Deck Architecture

Each run pulls from layered decks:
1. Global events.
2. Region events.
3. Faction events.
4. Crew-triggered events.

Event card fields:
1. Trigger conditions.
2. Gameplay payload.
3. Choice options.
4. Consequences.
5. Rarity and cooldown.

### 10.2 Event Types

1. Combat ambush events.
2. Environmental hazard events.
3. Port/political choice events.
4. Crew dilemma events.
5. Treasure/expedition events.

### 10.3 Consequence Design

Choices should affect at least one of:
1. Immediate resources.
2. Future node difficulty.
3. Faction reputation.
4. Crew loyalty or injury.
5. Event deck composition.

---

## 11. Economy and Resource Model

### Core Resources
1. Gold (primary transactional currency).
2. Supplies (run sustainment; repairs, emergency actions).
3. Intel (used for map reveals and contract targeting).
4. Reputation tokens (faction-specific long-tail value).

### Economy Principles
1. Gold is abundant but rapidly spent.
2. Supplies create meaningful pre-port tension.
3. Intel rewards planning and risk-taking.
4. Reputation creates medium/long-term strategic identity.

---

## 12. UX and Higher-Order Polish Plan

### 12.1 Readability
1. Clear color language for friendly/enemy/hazard/status effects.
2. Consistent iconography for ammo, morale, stress, and faction status.
3. Stronger depth cues for collisions and projectile trajectories.

### 12.2 Information Hierarchy
1. Combat-critical info always top priority.
2. Narrative/lore info secondary and time-bounded.
3. Minimap clarity: separate icon sets for islands, hazards, fleets, objectives.

### 12.3 Onboarding
1. Adaptive tutorial (only teach what player has not demonstrated).
2. Quick-reference controls panel in pause menu.
3. Tooltips for new mechanics on first acquisition only.

### 12.4 Quality-of-Life
1. Rebindable controls.
2. Accessibility sliders (shake intensity, flash intensity, text scale).
3. Colorblind-friendly palette variants.
4. Save-and-resume for campaign run state.

---

## 13. Audio and Presentation Direction

### Audio
1. Region-based leitmotifs.
2. Faction encounter stingers.
3. Better spatial differentiation for critical threats.
4. Dynamic mix layering for boss phase shifts.

### Visual Presentation
1. Region color scripts for atmosphere.
2. Distinct silhouette language per faction ship family.
3. Event signature FX that are readable and low-noise.
4. Refined camera/cut-in moments for major discoveries and boss intros.

---

## 14. Technical and Content Architecture Plan

### 14.1 Data-Driven Content

Move gameplay content definitions from code constants to data files:
1. `data/regions/*.json`
2. `data/factions/*.json`
3. `data/events/*.json`
4. `data/upgrades/*.json`
5. `data/relics/*.json`

Benefits:
1. Faster balancing iteration.
2. Cleaner separation of systems vs content.
3. Safer modding/expansion path.

### 14.2 System Boundaries

Recommended module additions:
1. `NarrativeSystem` (captain log, codex unlock hooks).
2. `MapNodeSystem` (campaign pathing and node resolution).
3. `FactionSystem` (reputation and spawn biases).
4. `EconomySystem` (supplies/intel integration).
5. `TelemetrySystem` (opt-in analytics events for balancing).

### 14.3 Save Migration

Implement save schema versioning:
1. `saveVersion` field mandatory.
2. V1 -> V2 migration adapter for legacy progress.
3. Fallback behavior for unknown fields.

### 14.4 Performance Budget (Browser)

Hard budgets:
1. Frame time target: <=16.7ms on mid-tier desktop.
2. Frame time cap: <=25ms on target mobile profile.
3. Active particle cap by platform tier.
4. Draw call and memory tracking in dev overlay.

---

## 15. Telemetry and Balancing Metrics

Track at minimum:
1. Run completion rate by mode and difficulty.
2. Death causes and wave/node distribution.
3. Upgrade pick rates and win-rate correlation.
4. Ship class pick and success rates.
5. Event failure/success rates.
6. Session length and replay frequency.

Balancing guardrails:
1. No single upgrade should exceed 70% pick rate in high-skill cohorts.
2. No ship class should sit >10% win-rate above/below median for long.
3. First-run fail point should cluster after the player has seen at least one upgrade choice.

---

## 16. Production Roadmap

### Phase 0 - Preproduction (2 weeks)
1. Lock V2 scope and pillar tests.
2. Finalize content schema and technical architecture.
3. Build milestone acceptance criteria.

### Phase 1 - Vertical Slice (4 weeks)
1. One full region with faction flavor and event deck.
2. One act loop with node map flow.
3. Crew trait system baseline.
4. Updated UI readability layer.

Exit Criteria:
1. Slice playable end-to-end.
2. Worldbuilding signals are visible and understood in user test.

### Phase 2 - Core Systems Buildout (6 weeks)
1. Remaining regions and faction scaffolding.
2. Ammo, morale, stress systems.
3. Narrative/codex systems.
4. Daily contract framework.

### Phase 3 - Content and Balance Alpha (5 weeks)
1. Populate event decks, relic pool, and doctrine sets.
2. Boss pass and encounter tuning.
3. Economy tuning.
4. Meta progression pass.

### Phase 4 - Beta Polish and Optimization (4 weeks)
1. Accessibility and onboarding refinements.
2. Performance optimizations and memory pass.
3. UX consistency and readability polish.
4. Regression and balance sweeps.

### Phase 5 - Launch Prep (2 weeks)
1. Final QA and bug triage.
2. Save migration validation.
3. Telemetry dashboards and post-launch patch plan.

Total target schedule: ~23 weeks.

---

## 17. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Scope growth from narrative ambitions | High | High | Strict mode-gated content budget and phase gates |
| Balance complexity from new combat axes | High | High | Telemetry-driven tuning and feature flags |
| Browser performance regression | Medium | High | Platform budgets, LOD policy, dev perf overlay |
| Content authoring bottleneck | Medium | Medium | Data-driven tools and template-first event writing |
| Save migration bugs | Medium | Medium | Automated migration tests and backup strategy |

---

## 18. V2 Launch Scope vs Post-Launch Scope

### Launch Scope (Must Have)
1. 5 regions, 5 factions, 3-act campaign node flow.
2. Crew trait + loyalty system (baseline).
3. Event deck architecture with at least 40 event cards.
4. Ammo + morale systems.
5. Daily contracts (single daily rotation).
6. Codex + discovery tracking.
7. Accessibility options and tutorial overhaul.

### Post-Launch Scope (Should Have)
1. Additional faction quest chains.
2. Expanded relic/doctrine sets.
3. Seasonal contract packs.
4. Optional challenge modifiers and cosmetic progression.
5. Leaderboard layers by ship class/doctrine.

---

## 19. Milestone Acceptance Checklist

V2 is considered ready when:
1. New players can complete onboarding and understand objective flow without external guidance.
2. A full campaign run has clear world identity and narrative continuity.
3. Build diversity is evident in telemetry and internal playtests.
4. Performance budgets pass on defined desktop/mobile targets.
5. Save migration is stable across representative legacy accounts.
6. Critical bugs and progression blockers are cleared.

---

## 20. Immediate Next Steps (Next 2 Weeks)

1. Lock V2 feature contract:
   Create `V2-MVP` tag list with Must/Should/Could and owner per system.
2. Create data schema prototypes:
   Region, faction, event, and doctrine JSON definitions.
3. Implement `NarrativeSystem` scaffold:
   Event hooks only, no full content yet.
4. Build campaign node map prototype:
   One-act test with combat/event/port branching.
5. Run first internal playtest:
   Validate whether worldbuilding signals are noticed without prompting.

