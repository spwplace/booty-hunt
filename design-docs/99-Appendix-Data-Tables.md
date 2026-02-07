# Appendix: Data Tables

## Upgrade Reference

### Common (60% drop rate)
| Name | Effect | Visual Tier |
|------|--------|-------------|
| Faster Sails | +15% speed | Speed Tier +1 |
| Reinforced Shot | +25% damage | Weapon Tier +1 |
| Repair Hull | +40 HP | - |
| Grappling Hooks | +20% capture range | - |
| Iron Hull | +20 max HP | Armor Tier +1 |
| Rapid Reload | -15% cooldown | Weapon Tier +1 |
| Sea Dog's Grit | -15% damage taken | Armor Tier +1 |
| Treasure Magnet | +40% capture range | - |
| Lookout's Eye | +15% vision | - |
| Steady Hands | -20% spread | Weapon Tier +1 |
| Hardtack Rations | +2 HP regen/wave | - |
| Tar & Pitch | +25 max HP | Armor Tier +1 |

### Rare (30% drop rate)
| Name | Effect |
|------|--------|
| Kraken's Blessing | +10% all stats |
| Plunderer's Fortune | 2x gold |
| Full Broadside | 5 balls per side |
| Chain Shot | Slow enemies 50% |
| Grapeshot | Split on near-miss |
| War Drums | Enemies flee sooner |
| Boarding Party | +25% capture gold |

### Legendary (10% drop rate)
| Name | Effect |
|------|--------|
| Ghost Sails | 30% dodge |
| Davy's Pact | -40% HP, +80% dmg, +25% spd |
| Phoenix Sails | One revive per wave |
| Cursed Compass | Full minimap reveal |
| Neptune's Wrath | Every 5th shot AoE |

## Enemy Stats

| Type | HP | Speed | Armed | Behavior | Value |
|------|-----|-------|-------|----------|-------|
| Merchant Sloop | 40 | 3-5 | No | Flee | 50g |
| Merchant Galleon | 120 | 0.8-1.5 | No | Flee | 250g |
| Escort Frigate | 80 | 2-3 | Yes | Circle-Strafe | 150g |
| Fire Ship | 30 | 4-6 | No | Beeline | 100g |
| Ghost Ship | 60 | 2 | Yes | Phase | 1000g |
| Navy Warship | 150 | 1.5-2 | Yes | Formation | 300g |

## Ship Class Stats

| Class | Speed | HP | Cannons | Dodge | Special |
|-------|-------|-----|---------|-------|---------|
| Sloop | 18 | 70 | 2 | 15% | - |
| Brigantine | 14 | 100 | 3 | 0% | +10% upgrades |
| Galleon | 10 | 150 | 5 | 0% | +30% damage |

## Weather Configurations

| State | Fog Density | Wave Scale | Rain | Lightning |
|-------|-------------|------------|------|-----------|
| Clear | 0.008 | 1.0 | No | No |
| Foggy | 0.028 | 0.75 | No | No |
| Stormy | 0.016 | 1.9 | Yes | 8%/sec |
| Night | 0.010 | 0.9 | No | No |

## Wave Configuration

| Wave | Ships | Armed% | Weather | Special |
|------|-------|--------|---------|---------|
| 1 | 4 | 0% | Clear | - |
| 2 | 5 | 20% | Foggy | - |
| 3 | 6 | 35% | Stormy | Boss + Ghost Event |
| 4 | 7 | 50% | Night | Serpent Event |
| 5 | 8 | 60% | Stormy | Boss + Kraken |

## Crew Bonuses (per level)

| Role | Bonus/Level | Max | Cost |
|------|-------------|-----|------|
| Navigator | +3% speed | 5 | 200g |
| Gunner | +5% damage | 5 | 300g |
| Surgeon | +1 HP regen | 5 | 250g |
| Lookout | +8% vision | 5 | 200g |
| Bosun | +5 max HP | 5 | 250g |
| Quartermaster | +8% gold | 5 | 300g |

## Event Parameters

| Event | Min Wave | Chance | Duration | Damage | Reward |
|-------|----------|--------|----------|--------|--------|
| Whirlpool | 3 | 20% | 15s | 20 (center) | - |
| Ghost Ship | 4 | 10% | 15s | - | Enemy kill |
| Kraken | 5 | 15% | 10s | 30 (timeout) | 500g |
| Sea Serpent | 7 | 10% | 20s | 10 DPS | 300g |
| Storm Surge | - | 25%* | 5s warn | 15 (slow) | - |
| Treasure Map | - | 10%** | ∞ | - | 200-800g |

\* Stormy only  \*\* Per kill

## Island Generation

| Type | Radius | Reef Mult | Treasure | Color |
|------|--------|-----------|----------|-------|
| Rocky | 5-9 | 1.8x | 5% | Gray |
| Sandy | 6-10 | 1.5x | 35% | Tan |
| Jungle | 8-14 | 1.6x | 40% | Green |
| Fortress | 7-12 | 1.4x | 60% | Stone |

## Audio Parameters

### Music Modes
| Mode | BPM | Scale | Mood |
|------|-----|-------|------|
| Normal | 140 | D major | Cheerful |
| Boss | 182 | A minor | Intense |
| Port | 100 | D major | Relaxed |
| Kraken | 120 | A minor | Heavy |
| Ghost | 80 | Whole tone | Ethereal |
| Serpent | 160 | Chromatic | Tense |

### SFX Layers (Cannon)
| Layer | Frequency | Duration | Purpose |
|-------|-----------|----------|---------|
| Crack | White noise | 0.05s | Initial transient |
| Boom | 80→40Hz | 0.35s | Body |
| Snap | 400→200Hz | 0.10s | Character |
| Sub | 30Hz | 0.20s | Punch |

## Performance Budgets

| System | Instances | Update Frequency |
|--------|-----------|------------------|
| Cannonballs | 100 | Every frame |
| Gold particles | 400 | Every frame |
| Rain drops | 500 | Every frame (storm only) |
| Islands (meshes) | 8-15 | LOD check every frame |
| Enemy ships | 4-20 | Every frame |

## File Size Budget

| Asset Type | Strategy | Size |
|------------|----------|------|
| 3D Models | Procedural generation | 0 KB |
| Textures | Procedural/canvas | 0 KB |
| Audio | Web Audio synthesis | 0 KB |
| Code | TypeScript + Vite | ~50 KB gzipped |
