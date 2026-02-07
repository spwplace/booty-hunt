# Booty Hunt - Game Design Overview

## Game Summary

**Booty Hunt** is a browser-based 3D pirate ship combat game built with Three.js and TypeScript. Players captain a customizable pirate vessel through a 5-wave campaign, hunting merchant ships, battling enemy vessels, and facing legendary sea monsters.

## Core Pillars

1. **Arcade-Style Naval Combat** - Fast, satisfying broadside cannon combat with weighty projectiles and impactful feedback
2. **Roguelike Progression** - Choose from randomized upgrades between waves, build synergies, adapt your strategy
3. **Dynamic World** - Procedural islands, changing weather, and emergent events create unique runs
4. **Accessibility** - Simple controls (WASD + QE) with depth through positioning and timing

## Game Loop

```
Start Run → Select Ship Class → Begin Wave → Hunt Merchants → 
Complete Wave → Choose Upgrade → (Optional: Visit Port) → Next Wave
```

### Wave Structure (5 Wave Campaign)

| Wave | Weather | Ships | Armed % | Special |
|------|---------|-------|---------|---------|
| 1 | Clear | 4 | 0% | Tutorial |
| 2 | Foggy | 5 | 20% | Introduce escorts |
| 3 | Stormy | 6 | 35% | Boss: Captain Blackbeard + Ghost Event |
| 4 | Night | 7 | 50% | Sea Serpent Event |
| 5 | Stormy | 8 | 60% | Final Boss: Admiral Drake + Kraken |

## Ship Classes

| Class | Speed | HP | Cannons | Special |
|-------|-------|-----|---------|---------|
| **Sloop** | 18 | 70 | 2 | +15% Dodge chance |
| **Brigantine** | 14 | 100 | 3 | +10% Upgrade effectiveness |
| **Galleon** | 10 | 150 | 5 | +30% Cannon damage |

## Control Scheme

- **WASD / Arrows** - Steering and throttle
- **Q** - Fire port (left) broadside
- **E** - Fire starboard (right) broadside
- **Right Mouse / Touch Right** - Spyglass (zoom)
- **M** - Toggle mute

## Core Metrics

- **Gold** - Score/currency from captures and events
- **Health** - Ship integrity (0 = game over)
- **Combo** - Chain captures for bonus gold
- **Wave Progress** - Ships remaining in current wave

## Meta Progression

- Unlock Galleon ship class by winning with any ship
- Unlock Bosun/Quartermaster crew roles by winning with 2 ship classes
- Unlock Endless Mode after campaign victory
- Persistent high scores and statistics
