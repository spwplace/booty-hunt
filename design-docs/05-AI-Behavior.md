# Enemy AI Behavior Design

## Enemy Types Overview

| Type | Behavior | Armed | Speed | HP | Value |
|------|----------|-------|-------|-----|-------|
| Merchant Sloop | Flee | No | 3-5 | 40 | 50g |
| Merchant Galleon | Flee | No | 0.8-1.5 | 120 | 250g |
| Escort Frigate | Circle-Strafe | Yes | 2-3 | 80 | 150g |
| Fire Ship | Beeline | No | 4-6 | 30 | 100g |
| Ghost Ship | Phase | Yes | 2 | 60 | 1000g |
| Navy Warship | Formation | Yes | 1.5-2 | 150 | 300g |

## Behavior State Machines

### 1. Flee Behavior (Merchants)

```typescript
if (distToPlayer > FLEE_URGENCY_RANGE * 2.5) {
  // Cruising - gentle wander
  state = 'sailing';
  speed = baseSpeed;
} else {
  // Active flee
  state = 'fleeing';
  targetHeading = awayFromPlayer;
  speed = baseSpeed * 1.5;
  
  // Zigzag evasion
  if (zigzagTimer <= 0) {
    zigzagDir *= -1;
    zigzagTimer = random(0.6, 1.2);
  }
  heading += zigzagDir * 0.9 * urgency;
}
```

**Design Intent**: Creates chase scenarios where player must intercept. Zigzag prevents simple pursuit.

### 2. Circle-Strafe (Escorts)

```typescript
if (distToPlayer > CHASE_DIST) {
  // Too far - close distance
  targetHeading = towardPlayer;
  speed = baseSpeed * 1.8;
} else if (distError > 3) {
  // Adjust to preferred orbit
  targetHeading = towardPlayer ± Math.PI/5;
} else {
  // Perfect orbit
  targetHeading = perpendicularToPlayer;
  speed = baseSpeed * 1.8;
}
```

**Preferred Distance**: 20 units
**Fire Arc**: ±45° from broadside

**Design Intent**: Creates "jousting" encounters where player must time shots as enemy passes.

### 3. Beeline (Fire Ships)

```typescript
// Always head directly at player
targetHeading = towardPlayer;
speed = baseSpeed * 1.2;

// Self-destruct if close enough
if (distToPlayer < 3) {
  explode();
  damagePlayer(falloffByDistance);
}
```

**Design Intent**: Area denial and panic moments. Forces player to maneuver or focus fire.

### 4. Phase Behavior (Ghost Ships)

```typescript
// Toggle phase every 3 seconds
phaseTimer -= dt;
if (phaseTimer <= 0) {
  isPhased = !isPhased;
  phaseTimer = 3.0;
  opacity = isPhased ? 0.35 : 1.0;
}

// Combat while visible
if (!isPhased) {
  // Circle-strafe at medium range
  orbitAtDistance(20-40);
  if (inFireArc) fire();
}

// After specialTimer expires, flee
if (fleeTimer <= 0) {
  fleeAtSpeed(baseSpeed * 1.4);
}
```

**Design Intent**: Unpredictable threat - can't be damaged while phased. Creates urgency to kill while visible.

### 5. Formation (Navy Warships)

**Formation Setup**:
- Groups of 2-3 ships spawn together
- Leader (index 0) determines movement
- Followers maintain line-abreast formation

```typescript
// Leader behavior (same as circle-strafe)
if (isLeader) {
  approachToDistance(45);
  circleAtDistance(15-30);
}

// Follower behavior
else {
  targetPos = leaderPos + perpendicularOffset * formationIndex * 8;
  steerToward(targetPos);
  matchLeaderSpeed();
}
```

**Design Intent**: Tactical challenge - focus leader to break formation, or deal with coordinated fire.

## Boss AI

### Boss Properties
- **Scale**: 1.8x normal
- **Colors**: Dark red/black
- **HP**: Wave-based (300-500)
- **Name**: Random pirate name

### Enrage Mechanic
```typescript
if (hp < maxHp * 0.5 && !enraged) {
  enraged = true;
  fireCooldown *= 0.5;  // Double fire rate
  speed *= 1.4;
}
```

### Boss Fire Pattern
- Same as escort (circle-strafe)
- Faster cooldown when enraged
- Continues firing until dead

## Spawn System

### Wave Composition Logic
```typescript
// Determine armed vs unarmed split
const armedCount = Math.floor(totalShips * armedPercent);

// Fill slots from available enemy types
for each ship slot:
  if (armedSlotsRemaining > 0)
    pick from armedTypes (escort, ghost, navy, fire)
  else
    pick from unarmedTypes (sloop, galleon)

// Ensure navy warships come in groups
if (navyCount === 1 && totalShips > 2)
  convert another slot to navy

// Add boss if wave specifies
if (bossName)
  add escort_frigate as boss
```

### Spawn Positioning
- Random angle around player: 0-360°
- Distance: 30-70 units from player
- Heading: Random

## AI Utilities

### Angle Normalization
```typescript
function normalizeAngle(a: number): number {
  a = a % TWO_PI;
  if (a > Math.PI) a -= TWO_PI;
  if (a < -Math.PI) a += TWO_PI;
  return a;
}
```

### Smooth Turning
```typescript
const angleDiff = normalizeAngle(targetHeading - currentHeading);
currentHeading += sign(angleDiff) * min(abs(angleDiff), turnRate * dt);
```

### Fire Decision
```typescript
shouldFire = 
  armed && 
  fireTimer <= 0 && 
  distToPlayer < fireRange &&
  (behavior !== 'circle_strafe' || inBroadsideArc);
```

## Balance Levers

| Parameter | Default | Effect if Increased |
|-----------|---------|---------------------|
| FLEE_ZIGZAG_INTERVAL | 0.6-1.2s | Harder to hit fleeing ships |
| CIRCLE_PREFERRED_DIST | 20 | Enemy keeps more distance |
| CIRCLE_TURN_RATE | 2.8 | Faster orbit = harder to hit |
| BEELINE_TURN_RATE | 4.0 | Fire ships track better |
| FORMATION_SPACING | 8 | Wider formations |

## Special Behaviors

### Surrender
When HP < 20% and not boss:
```typescript
if (!surrendering && !isBoss && hp < maxHp * 0.2) {
  surrendering = true;
  addWhiteFlag();
  state = 'surrendering';
  // Stop moving, award gold on approach
}
```

### Despawn
```typescript
if (distToPlayer > 120 && !isBoss && state !== 'sinking') {
  despawn();
}
```
Prevents accumulation of stragglers.
