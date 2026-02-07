# Combat Design Document

## Philosophy

Combat should feel **weighty, impactful, and skill-based**:
- Cannonballs have realistic arcs requiring lead time
- Positioning matters (broadsides vs. bow/stern)
- Visual/audio feedback is immediate and satisfying
- Risk/reward: close range = more damage but exposed

## Damage System

### Base Values
```typescript
const BASE_CANNON_DAMAGE = 25;
const PLAYER_START_HP = 100;
const ENEMY_HP_RANGE = 30-150;
```

### Damage Modifiers
- **Player damage** - Multiplied by upgrade levels (up to ~3x with synergies)
- **Armor** - Damage reduction percentage (0-50%)
- **Dodge** - Chance to completely avoid hit (Ghost Sails upgrade)
- **Critical** - No formal crit system, but "Davy's Pact" trades HP for damage

### Hit Detection
Sphere-based collision:
```typescript
// Cannonball vs target
distSq = (ball.x - target.x)² + (ball.y - target.y)² + (ball.z - target.z)²
hit = distSq < hitRadius²
```

## Cannon Mechanics

### Firing Arcs
- **Broadside arc** - 90° cone to each side
- **Forward blind spot** - Can't fire directly forward
- **Aft blind spot** - Can't fire directly backward

### Reload System
- Independent port/starboard cooldowns
- Visual indicators on HUD
- Audio cue when ready

### Projectile Properties
| Property | Value | Notes |
|----------|-------|-------|
| Speed | 28 u/s | Fast but dodgeable |
| Gravity | 12 m/s² | Arcing trajectory |
| Max Age | 4s | Disappears if no hit |
| Spawn Offset | 1.5u | From ship center |

## Enemy Combat Behaviors

### Armed vs. Unarmed
- **Unarmed** - Flee when approached, cannot fight back
- **Armed** - Circle-strafe, maintain optimal firing distance

### AI Fire Logic
```typescript
// Enemies fire when:
1. Within range (45-55 units)
2. Broadside faces player (±45° for strafers)
3. Fire timer expired
4. Not in fleeing state
```

### Fire Ship Explosion
- **Trigger radius** - 3 units from player
- **Base damage** - 40 (falloff by distance)
- **Effect** - AoE explosion particle effect

## Player Defensive Options

### Evasion
- **Speed** - Outrun slower enemies
- **Dodging** - Ghost Sails upgrade = % miss chance
- **Weather** - Fog reduces enemy accuracy

### Damage Mitigation
- **Armor** - Flat damage reduction (Iron Hull upgrade)
- **Regeneration** - HP regen between waves (Surgeon crew)
- **Phoenix Sails** - One "extra life" per wave

## Visual Feedback

### Hit Effects
1. **Explosion** - Particle burst at impact
2. **Screen Shake** - Camera jitter on player hit
3. **Damage Flash** - Red vignette on damage
4. **Hit Indicator** - Directional red flash showing damage source

### Kill Effects
1. **Ship Breakup** - Debris explosion
2. **Gold Burst** - Coin particles
3. **Water Splash** - Splash effect at waterline
4. **Combo Display** - Multiplier popup

### Muzzle Effects
1. **Muzzle Flash** - Bright particle burst
2. **Cannon Smoke** - Gray smoke puff
3. **Ship Recoil** - Brief backward offset
4. **Wake Trail** - Foam particles behind ship

## Balance Considerations

### Damage Per Shot Breakdown
| Source | Base | With Upgrades | Notes |
|--------|------|---------------|-------|
| Player | 25 | 75+ | Reinforced Shot x2, synergies |
| Escort Frigate | 25 | - | Standard enemy |
| Ghost Ship | 25 | - | Phased = miss chance |
| Navy Warship | 30 | - | Higher damage |
| Boss | 35 | 50+ enraged | Faster fire rate |

### Time-to-Kill (TTK)
- **Merchant Sloop** - 1-2 hits
- **Merchant Galleon** - 4-6 hits
- **Escort Frigate** - 3-4 hits
- **Fire Ship** - 1-2 hits (explodes)
- **Ghost Ship** - 2-4 hits (phase mitigation)
- **Navy Warship** - 6-8 hits
- **Boss** - 20-40 hits depending on wave

## Advanced Mechanics

### Chain Shot Slow
- Applies 50% speed reduction for 3 seconds
- Visual: Debris trailing from rigging
- Strategic: Prevents fleeing ships from escaping

### Grapeshot Split
- Detects near-misses (within 5u of target)
- Splits into 3 projectiles (50% damage each)
- Visual: Trail effect on split balls

### Neptune's Wrath AoE
- Every 5th player shot glows blue-green
- 8-unit radius splash on impact
- 50% damage to secondary targets
