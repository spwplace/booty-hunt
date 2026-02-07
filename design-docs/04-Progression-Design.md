# Progression & Upgrade Design

## Upgrade System Overview

Between waves, players choose 1 of 3 randomly-selected upgrades. Upgrades have 3 tiers with different rarities and power levels.

### Tier Distribution
| Tier | Chance | Color | Glow |
|------|--------|-------|------|
| Common | 60% | White | None |
| Rare | 30% | Blue | Blue aura |
| Legendary | 10% | Gold | Gold aura |

## Upgrade Pool (24 Total)

### Common Upgrades (12)

| ID | Name | Effect | Icon |
|----|------|--------|------|
| faster_sails | Faster Sails | +15% max speed | ⛵ |
| reinforced_shot | Reinforced Shot | +25% cannon damage | 💥 |
| repair_hull | Repair Hull | +40 HP (immediate) | 🔨 |
| grappling_hooks | Grappling Hooks | +20% capture range | 🪝 |
| iron_hull | Iron Hull | +20 max HP | 🛡️ |
| rapid_reload | Rapid Reload | -15% cannon cooldown | 🧵 |
| sea_dogs_grit | Sea Dog's Grit | -15% damage taken | 🦴 |
| treasure_magnet | Treasure Magnet | +40% capture range | 🧲 |
| lookouts_eye | Lookout's Eye | +15% vision range | 🔭 |
| steady_hands | Steady Hands | -20% cannon spread | 🎯 |
| hardtack_rations | Hardtack Rations | +2 HP regen/wave | 🍞 |
| tar_and_pitch | Tar & Pitch | +25 max HP | 🛢️ |

### Rare Upgrades (6)

| ID | Name | Effect | Icon |
|----|------|--------|------|
| krakens_blessing | Kraken's Blessing | +10% all stats | 🐙 |
| plunderers_fortune | Plunderer's Fortune | 2x gold from captures | 💰 |
| full_broadside | Full Broadside | 5 cannonballs per broadside | 🔥 |
| chain_shot | Chain Shot | Slow enemies on hit | ⛓️ |
| grapeshot | Grapeshot | Split on near-miss | 🍇 |
| war_drums | War Drums | Enemies flee sooner | 🥁 |
| boarding_party | Boarding Party | +25% gold on capture | ⚔️ |

### Legendary Upgrades (6)

| ID | Name | Effect | Icon |
|----|------|--------|------|
| ghost_sails | Ghost Sails | 30% dodge chance | 👻 |
| davys_pact | Davy's Pact | -40% HP, +80% dmg, +25% speed | 💀 |
| phoenix_sails | Phoenix Sails | Revive once per wave | 🔥 |
| cursed_compass | Cursed Compass | See all enemies on minimap | 🧭 |
| neptunes_wrath | Neptune's Wrath | Every 5th shot is AoE | 🔱 |

## Synergy System

Combinations of specific upgrades trigger bonus synergies:

| Synergy | Required Upgrades | Bonus Effect |
|---------|-------------------|--------------|
| Broadside Mastery | Full Broadside + Rapid Reload | +25% cannon damage |
| Iron Fortress | Iron Hull + Sea Dog's Grit | +3 HP regen per wave |
| Treasure Fleet | Plunderer's Fortune + Boarding Party | 3x gold on captures |
| Ghost Captain | Ghost Sails + Faster Sails | Immunity to storm speed penalty |

## Crew System (Crew.ts)

### Crew Roles

| Role | Bonus/Level | Max | Cost | Unlock |
|------|-------------|-----|------|--------|
| Navigator | +3% speed | 5 | 200g | Start |
| Gunner | +5% damage | 5 | 300g | Start |
| Surgeon | +1 HP regen/wave | 5 | 250g | Start |
| Lookout | +8% vision range | 5 | 200g | Start |
| Bosun | +5 max HP | 5 | 250g | Win with 2 classes |
| Quartermaster | +8% gold | 5 | 300g | Win with 2 classes |

### Crew Mechanics
- Maximum 4 crew members per run
- No duplicate roles
- Auto-level up at end of each wave
- Hired at Port for gold

## Ship Class Selection

### Sloop (Unlocked)
- **Speed**: 18 (fastest)
- **HP**: 70 (lowest)
- **Cannons**: 2 per side
- **Bonus**: +15% dodge chance
- **Playstyle**: Hit-and-run, evasion-based

### Brigantine (Unlocked)
- **Speed**: 14 (medium)
- **HP**: 100
- **Cannons**: 3 per side
- **Bonus**: +10% upgrade effectiveness
- **Playstyle**: Balanced, flexible

### Galleon (Locked)
- **Speed**: 10 (slowest)
- **HP**: 150 (highest)
- **Cannons**: 5 per side
- **Bonus**: +30% cannon damage
- **Unlock**: Win once with any ship class
- **Playstyle**: Tanky, high damage output

## Meta Progression

### Persistent Unlocks
- **Galleon Ship** - Win with any ship class
- **Bosun Role** - Win with 2 ship classes
- **Quartermaster Role** - Win with 2 ship classes
- **Endless Mode** - Complete 5-wave campaign

### Statistics Tracked
- High score (gold)
- Best wave reached
- Total gold earned (lifetime)
- Total ships destroyed
- Total waves completed
- Best combo achieved
- Victories per ship class

### Meta-Upgrades (Future)
- Starting speed bonus (+5%)
- Start with random upgrade
- Early legendary availability
- Cosmetic golden hull

## Economy

### Gold Sources
| Source | Base | With Modifiers |
|--------|------|----------------|
| Sloop capture | 50g | Up to 150g+ |
| Galleon capture | 250g | Up to 750g+ |
| Boss kill | 500-1000g | Up to 3000g+ |
| Kraken event | 500g | - |
| Sea Serpent survive | 300g | - |
| Treasure map | 200-800g | - |

### Port Prices
- **Repair 10 HP** - 100g
- **Full Repair** - 10g per HP needed
- **Crew Hire** - 200-300g depending on role
- **Shop Upgrades** - 150-400g depending on tier

## Progression Curve

### Player Power Growth
Assuming average upgrade selection:
- **Wave 1** - 100% base power
- **Wave 3** - ~150% power (2-3 upgrades + crew)
- **Wave 5** - ~250% power (4-5 upgrades + synergies)

### Difficulty Scaling
- Enemy HP: 100% → 170% by wave 5
- Enemy speed: 100% → 150% by wave 5
- Armed ratio: 0% → 60% by wave 5
- Boss appears waves 3 and 5

The goal is that player power growth outpaces difficulty slightly, making later waves feel powerful while maintaining challenge.
