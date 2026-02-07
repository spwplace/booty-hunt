# Booty Hunt - Design Documentation

This directory contains recovered design documentation for the Booty Hunt pirate ship combat game. These documents were reverse-engineered from the source code to capture the design intent, systems, and mechanics.

## Document Index

| Document | Description |
|----------|-------------|
| [01-Overview.md](01-Overview.md) | High-level game concept, pillars, and loop |
| [02-Core-Systems.md](02-Core-Systems.md) | Ship generation, combat, input, weather |
| [03-Combat-Design.md](03-Combat-Design.md) | Damage system, cannon mechanics, balance |
| [04-Progression-Design.md](04-Progression-Design.md) | Upgrades, synergies, crew, meta |
| [05-AI-Behavior.md](05-AI-Behavior.md) | Enemy types, behaviors, state machines |
| [06-World-Generation.md](06-World-Generation.md) | Islands, ocean, LOD system |
| [07-Event-System.md](07-Event-System.md) | Special events (Kraken, Whirlpool, etc) |
| [08-Audio-Design.md](08-Audio-Design.md) | Procedural audio, music system |
| [09-Technical-Architecture.md](09-Technical-Architecture.md) | Code structure, performance |
| [10-V2-Design-Plan.md](10-V2-Design-Plan.md) | Comprehensive V2 product, systems, and production roadmap |

## Quick Reference

### Game Stats
- **5-wave campaign** with endless mode unlock
- **3 ship classes** (Sloop, Brigantine, Galleon)
- **6 enemy types** with distinct AI
- **24 upgrades** across 3 tiers
- **4 synergies** from upgrade combinations
- **6 crew roles** with unique bonuses
- **6 special events**
- **4 weather states**
- **4 island types**

### Tech Stack
- TypeScript
- Three.js (r170)
- Vite (build)
- Web Audio API (procedural audio)
- No external assets (procedural generation)

### Key Numbers
| Metric | Value |
|--------|-------|
| Max cannonballs | 100 |
| Max particles (various) | 50-500 |
| Wave count | 5 + endless |
| Island count per world | 8-15 |
| Upgrade pool | 24 |
| FPS target | 60 |

## Design Pillars

1. **Arcade-Style Naval Combat** - Fast, satisfying broadside combat
2. **Roguelike Progression** - Randomized upgrades, build diversity
3. **Dynamic World** - Procedural islands, changing weather
4. **Accessibility** - Simple controls, depth through mastery

## Contributing

When modifying systems, update the relevant design doc to keep this documentation in sync with the codebase.
