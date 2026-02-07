# World Generation Design

## Island System (World.ts)

### Island Types

| Type | Radius | Reef Multiplier | Treasure Chance | Visual Theme |
|------|--------|-----------------|-----------------|--------------|
| Rocky | 5-9 | 1.8x | 5% | Gray stones, moss, tide pools |
| Sandy | 6-10 | 1.5x | 35% | Beaches, palm trees, driftwood |
| Jungle | 8-14 | 1.6x | 40% | Dense vegetation, waterfalls, flowers |
| Fortress | 7-12 | 1.4x | 60% | Stone ruins, walls, lighthouse |

### Generation Parameters
```typescript
const MIN_ISLAND_SPACING = 40;    // Minimum distance between islands
const MIN_RING_RADIUS = 80;       // Closest islands to origin
const MAX_RING_RADIUS = 200;      // Farthest islands
const ISLAND_COUNT = 8-15;        // Per world generation
```

### Placement Algorithm
```typescript
// Seeded RNG for reproducibility
const rng = mulberry32(worldSeed);

for (attempts = 0; attempts < maxAttempts; attempts++) {
  // Random position in ring
  angle = rng() * 2π;
  radius = lerp(MIN_RING_RADIUS, MAX_RING_RADIUS, rng());
  pos = (cos(angle) * radius, 0, sin(angle) * radius);
  
  // Check spacing against existing islands
  valid = true;
  for each existingIsland:
    if (distance(pos, existingIsland) < MIN_ISLAND_SPACING) {
      valid = false;
      break;
    }
  
  if (valid) createIslandAt(pos);
}
```

### Island Mesh Generation

Each island type has a dedicated builder function:

#### Rocky Island
- 3-5 cone stacks (rock formations)
- 5-8 scattered rocks at base
- 1 tide pool (blue cylinder)
- Optional moss patches
- Seagull perches (white spheres)

#### Sandy Island
- Flat cylinder base with sand texture
- Beach ring (underwater cylinder)
- 1-2 palm trees
- 2-4 beach rocks
- 1-2 driftwood pieces
- Shallow lagoon

#### Jungle Island
- Large terrain base
- 5-8 palm trees
- 2-4 dense canopy spheres
- 3-5 undergrowth bushes
- 2-3 flower patches
- Waterfall hint
- Hidden cove

#### Fortress Island
- Stone foundation platform
- 2-3 wall segments (ruined look)
- Central tower with battlements
- Torch with point light
- Animated flag (shader material)
- Dock extending over water
- Scattered rubble

### LOD System
```typescript
const LOD_CREATE_DIST = 200;   // Create mesh when player within
const LOD_REMOVE_DIST = 250;   // Remove mesh when player beyond

updateLOD(playerPos) {
  for each island:
    dist = distance(playerPos, island.pos);
    if (!island.meshCreated && dist < LOD_CREATE_DIST)
      createMesh(island);
    else if (island.meshCreated && dist > LOD_REMOVE_DIST)
      destroyMesh(island);
}
```

### Reef System
Each island has a reef zone (1.4-1.8x island radius):
- Visual: Foam effect in ocean shader
- Gameplay: 5 DPS when in reef zone
- Collision: Bounce player away from island body

## Ocean System (Ocean.ts)

### Gerstner Wave Implementation
```glsl
// 8 stacked waves with varying properties
Wave 1: steepness=0.06, wavelength=38, direction=(1, 0.2)
Wave 2: steepness=0.07, wavelength=24, direction=(-0.3, 0.9)
Wave 3: steepness=0.20, wavelength=12.5, direction=(0.6, 0.8)
Wave 4: steepness=0.16, wavelength=8.5, direction=(-0.8, -0.4)
Wave 5: steepness=0.13, wavelength=5.2, direction=(0.2, -1.0)
Wave 6: steepness=0.11, wavelength=3.8, direction=(-0.9, 0.3)
Wave 7: steepness=0.09, wavelength=2.3, direction=(0.7, 0.7)
Wave 8: steepness=0.07, wavelength=1.6, direction=(-0.5, -0.8)
```

### Wave Scale by Weather
- Clear: 1.0
- Foggy: 0.75
- Stormy: 1.9
- Night: 0.9

### Ocean Visual Features
1. **Base color** - Gradient from deep to shallow
2. **Subsurface scattering** - Light through wave peaks
3. **Foam** - Whitecaps on high waves
4. **Reef foam** - Breaking waves around islands
5. **Specular** - Sun reflection with iridescence
6. **Glitter** - Random sparkle cells
7. **Fresnel** - Sky reflection at shallow angles

### Ship Wave Interaction
Ships query wave height at their position:
```typescript
getWaveInfo(x, z, time): { height, slopeX, slopeZ }

// Apply to ship
shipY = waveHeight + offset;
shipRotationX = waveSlopeZ * 0.3;
shipRotationZ = -waveSlopeX * 0.3;
```

## Port Scene (Port.ts)

### Layout
- **Dock** - 20x25 wooden platform with pilings
- **Tavern** - Crew hiring location with sign
- **Warehouse** - Visual building
- **Blacksmith** - Visual building with forge glow
- **Lighthouse** - Rotating beacon with point light

### Animated Elements
1. **Lighthouse** - Rotating spotlight cone
2. **Chimney smoke** - Particle system from tavern
3. **Warm lights** - Point lights from windows

## Sky System (Sky.ts)

### Celestial Objects
- **Sun** - Sprite with glow, position based on sunDirection
- **Moon** - Replaces sun during night weather
- **Stars** - 400 point sprites with twinkle shader

### Star Shader
```glsl
// Twinkle based on per-star phase
float rate = 1.5 + vPhase * 2.5;
float twinkle = 0.5 + 0.5 * sin(uTime * rate + vPhase * 6.2831);
```

### Lightning System
- Random 3D line segments during storms
- 8 segments per bolt
- 0.05s lifetime
- White LineSegments geometry

### Bioluminescent Wake
- Spawned when moving at night
- Cyan particles that fade over 1.2s
- Spawn rate scales with speed

## Weather Visual Effects

### Transition System
```typescript
// 10-second smooth interpolation
const t = elapsed / duration;
const smoothT = t * t * (3 - 2 * t); // smoothstep

fogDensity = lerp(from.density, to.density, smoothT);
fogColor = from.color.lerp(to.color, smoothT);
// etc for all properties
```

### Storm Surge Event
Temporary wave spike during events:
- Duration: 2 seconds
- Peak wave scale: 3.0 (vs 1.9 normal storm)
- Quick ramp up (20% of duration)
- Smooth decay (80% of duration)

### Event Weather Overlays
Special events tint the weather:
- **Kraken** - Greenish fog, darker ambient
- **Ghost Ship** - Bluish fog, very foggy
- **Sea Serpent** - Darker, windier feel
