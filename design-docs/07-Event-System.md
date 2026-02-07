# Special Event System Design

## Event Overview

Events are special encounters that trigger during waves, adding variety and challenge. Each event has unique mechanics, visuals, and rewards.

| Event | Min Wave | Chance | Duration | Reward |
|-------|----------|--------|----------|--------|
| Whirlpool | 3 | 20% | 15s | Survival |
| Ghost Ship | 4 | 10% | 15s | Ghost enemy spawn |
| Kraken | 5 | 15% | 10s | 500g |
| Sea Serpent | 7 | 10% | 20s | 300g (survival) |
| Storm Surge | - | 25%* | 5s warning | Avoid damage |
| Treasure Map | - | 10%** | Persistent | 200-800g |

\* Only during stormy weather
\* Per enemy kill, not time-based

## Event Triggering

```typescript
// Roll once per second when no event active
if (!currentEvent && cooldown <= 0) {
  candidates = filter(events, e => wave >= e.minWave && weatherMatch(e));
  for each candidate (shuffled):
    if (random() < candidate.chance)
      startEvent(candidate);
}
```

Cooldown: 30 seconds between events

## Individual Event Designs

### 1. Kraken Event

**Concept**: Giant tentacles rise around the player. Destroy enough to drive it off.

**Mechanics**:
- 4 tentacles spawn in ring around player (radius ~12)
- Each tentacle has 40 HP
- Must destroy 3 to succeed
- Tentacles slowly drift toward player
- Timer: 10 seconds

**Failure**: Take 30 damage if timer expires without 3 kills

**Visual**: Dark green weather overlay, tentacle mesh rising from water

**Audio**: A minor music shift (120 BPM, heavy bass)

```typescript
interface KrakenData {
  tentaclePositions: Vector3[];
  tentacleHp: number[];
  tentaclesDestroyed: number;
}
```

### 2. Whirlpool Event

**Concept**: Giant vortex pulls player toward center. Fight current or take damage.

**Mechanics**:
- Spawns 30-50 units from player
- 25-unit pull radius
- Pull strength increases closer to center
- Swirl component (tangential force)
- Center damage: 20 HP + push outward

**Force Calculation**:
```typescript
if (dist < pullRadius) {
  strength = PULL_STRENGTH * (1 - dist/pullRadius);
  radialForce = normalize(center - player) * strength * 0.6;
  tangentialForce = perpendicular(radialForce) * strength * 0.4;
  totalForce = radialForce + tangentialForce;
}
```

**Visual**: Rotating particle spiral, foam ring

**Duration**: 15 seconds

### 3. Ghost Ship Event

**Concept**: The Flying Dutchman appears - ethereal ship that phases in and out.

**Mechanics**:
- Spawns a ghost_ship enemy type
- Ghost has phase ability (invisible/intangible periodically)
- Event ends after 15 seconds or ghost destroyed
- Ghost flees after timer if not killed

**Visual**: Spectral shader with transparency, blue-tinted fog overlay

**Audio**: Whole-tone scale music (80 BPM, ethereal)

### 4. Sea Serpent Event

**Concept**: Giant snake-like creature circles the player in figure-8 pattern.

**Mechanics**:
- 8-segment serpent (head + 7 body)
- Figure-8 orbit around player (lemniscate curve)
- Touching any segment deals 10 DPS
- Survive 20 seconds for reward

**Movement**:
```typescript
// Head follows figure-8
phase = (time / 8) * 2π;
headPos = playerPos + figure8(phase) * radius;

// Body segments follow with delay
for i = 1 to 7:
  segment[i] = lerp(segment[i], segment[i-1], dt * 8);
```

**Visual**: Segmented mesh, slithering animation

**Reward**: 300g if survived, nothing if damaged

### 5. Storm Surge Event

**Concept**: Massive wave approaches - must be moving fast to ride it out.

**Mechanics**:
- 5-second warning countdown
- If speed < 8 when surge hits: 15 damage
- If speed >= 8: "Rode the wave!" (no damage)

**Visual**: Wave spike in ocean shader

**UI Warning**: "STORM SURGE IN Xs!"

### 6. Treasure Map Event

**Concept**: Enemy drops map to buried treasure on an island.

**Mechanics**:
- 10% chance per enemy kill
- Targets random island in world
- Player must sail to island and approach within 5 units
- No time limit

**Visual**: Map indicator on UI, X marks on minimap

**Reward**: 200-800g (random)

## Event Data Structure

```typescript
interface GameEvent {
  type: EventType;
  active: boolean;
  timer: number;
  duration: number;
  pos: Vector3;
  data: Record<string, any>; // Type-specific data
}

type EventType = 
  | 'kraken'
  | 'whirlpool' 
  | 'ghost_ship_event'
  | 'sea_serpent'
  | 'storm_surge'
  | 'treasure_map';
```

## Event Return Values

```typescript
interface EventUpdateResult {
  damageToPlayer: number;      // Immediate damage
  goldReward: number;          // Reward on completion
  eventComplete: boolean;      // Event ended this frame
  eventStarted: EventType;     // Event began this frame
  warning: string;             // UI warning message
  pullForce: Vector3;          // External force (whirlpool)
}
```

## Event Visual Effects

### Weather Overlays
Events can temporarily tint the weather:

```typescript
applyEventOverlay(type, blendFactor) {
  switch(type) {
    case 'kraken':
      // Dark green fog
      fogColor.lerp(darkGreen, blend * 0.5);
      fogDensity *= 1.5;
      break;
    case 'ghost_ship_event':
      // Very foggy, blue tint
      fogColor.lerp(blueGray, blend * 0.6);
      fogDensity = 0.025;
      break;
  }
}
```

### Effect Classes

#### KrakenTentacle (Effects.ts)
- Rising tentacle mesh
- Sway animation
- Hit flash when damaged
- Death animation

#### WhirlpoolEffect (Effects.ts)
- Rotating particle ring
- Foam spiral
- Center vortex distortion

#### SeaSerpentEffect (Effects.ts)
- Segmented mesh chain
- Slithering motion
- Splash particles

## Event Balancing

### Difficulty Factors
| Factor | Adjustment |
|--------|------------|
| Wave number | Higher = more frequent events |
| Weather | Stormy = storm surge possible |
| Current HP | No adjustment currently |
| Ship class | No adjustment currently |

### Risk/Reward
- **Kraken**: High risk (30 damage), high reward (500g)
- **Whirlpool**: Medium risk (20 damage), no direct reward
- **Sea Serpent**: Low-medium risk (variable damage), medium reward
- **Storm Surge**: Skill-based (speed check)
- **Treasure Map**: No risk, variable reward
