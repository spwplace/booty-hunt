# Technical Architecture

## Project Structure

```
src/
├── main.ts          # Entry point, game loop, state management
├── Types.ts         # Shared interfaces, configs, constants
├── Ship.ts          # Ship mesh generation, sail animation
├── Ocean.ts         # Water shader, Gerstner waves
├── Sky.ts           # Stars, sun/moon, lightning, bioluminescence
├── World.ts         # Island generation, LOD, collision
├── Combat.ts        # Cannonballs, hit detection, damage
├── EnemyAI.ts       # AI behaviors, spawning
├── Progression.ts   # Upgrades, stats, save/load
├── Weather.ts       # Weather states, transitions
├── Events.ts        # Special event logic
├── Crew.ts          # Crew hiring, bonuses
├── Port.ts          # Port scene, shop UI
├── Effects.ts       # Particle systems (explosions, foam, etc)
├── UI.ts            # DOM-based UI management
├── Audio.ts         # Procedural audio engine
├── Juice.ts         # Screen effects (shake, flashes, vignette)
├── Tutorial.ts      # Tutorial system
└── DevPanel.ts      # Debug/developer tools
```

## Main Game Loop

```typescript
// In main.ts
function gameLoop() {
  requestAnimationFrame(gameLoop);
  
  // Time delta
  const dt = clock.getDelta();
  const time = clock.getElapsedTime();
  
  // Update systems
  updatePlayerMovement(dt);
  updateCamera(dt);
  
  weather.update(dt);
  ocean.update(time, playerPos);
  world.updateLOD(playerPos);
  
  combat.update(dt);
  updateEnemies(dt);
  
  effects.update(dt);
  ui.updateScoreDisplay(dt);
  
  renderer.render(scene, camera);
}
```

## State Management

### Game State Enum
```typescript
type GameState = 
  | 'pre_wave'      // Between waves
  | 'active'        // Wave in progress
  | 'wave_complete' // All enemies defeated
  | 'upgrading'     // Choosing upgrade
  | 'port'          // In port
  | 'game_over';    // Player destroyed
```

### Key Variables
```typescript
// Player
const playerPos = new THREE.Vector3();
let playerAngle = 0;
let playerSpeed = 0;

// Game
let gameStarted = false;
let gamePaused = false;
let combo = 0;
let currentWave = 1;

// Collections
const merchants: MerchantV1[] = [];
const islands: Island[] = [];
```

## Rendering Strategy

### InstancedMesh Usage
For performance-critical particle systems:

| System | Max Instances | Notes |
|--------|--------------|-------|
| Cannonballs | 100 | Active projectiles |
| Gold coins | 400 | Capture rewards |
| Water splash | 200 | Hit effects |
| Wake foam | 300 | Ship trails |
| Smoke | 150 | Cannon smoke |
| Explosions | 200 | Hit impacts |
| Rain | 500 | Storm weather |
| Fire | 80 | Burning ships |
| Debris | 100 | Floating wreckage |

### LOD Strategy
- **Islands**: Create/destroy meshes at 200/250 unit distance
- **Ship sails**: Update shader uniforms only when visible
- **Particles**: Pool-based, spawn only when needed
- **Ocean**: Single large plane, follows player discretely

### Mobile Optimizations
```typescript
const isMobile = navigator.maxTouchPoints > 0;

// Reduced quality
const segments = isMobile ? 100 : 180; // Ocean mesh
const maxDrops = isMobile ? 200 : 500; // Rain particles
const pixelRatio = Math.min(devicePixelRatio, isMobile ? 1.5 : 2);

// Disable expensive effects
if (isMobile) {
  // Simpler shaders
  // Fewer particles
  // Reduced shadow quality
}
```

## Memory Management

### Object Pooling
```typescript
class CombatSystem {
  private balls: Cannonball[] = [];
  private shotQueue: QueuedShot[] = [];
  
  // Pre-allocate
  constructor() {
    for (let i = 0; i < MAX_CANNONBALLS; i++) {
      this.balls.push({
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        active: false,
        // ...
      });
    }
  }
}
```

### Cleanup
```typescript
// When removing islands
island.meshGroup.traverse((child) => {
  if (child instanceof THREE.Mesh) {
    child.geometry.dispose();
    child.material.dispose();
  }
});
scene.remove(island.meshGroup);
```

## Shader Architecture

### Custom Shaders
1. **Ocean** (Ocean.ts)
   - Vertex: Gerstner wave displacement
   - Fragment: Subsurface scattering, foam, specular

2. **Sky** (main.ts)
   - Gradient based on height
   - Sun direction for halo
   - Aurora effect in night mode

3. **Sails** (Ship.ts)
   - Vertex: Wind billowing displacement
   - Fragment: Simple toon shading

4. **Stars** (Sky.ts)
   - Vertex: Size attenuation
   - Fragment: Twinkle based on phase

### Uniform Updates
```typescript
// Per-frame updates
oceanMaterial.uniforms.uTime.value = time;
oceanMaterial.uniforms.uWaveScale.value = weather.waveScale;

// Only when changed
skyMaterial.uniforms.uSkyTop.value.copy(weather.skyTop);
```

## Input Handling

### Keyboard
```typescript
window.addEventListener('keydown', (e) => {
  keys[e.key.toLowerCase()] = true;
  // Special handling
  if (e.key === ' ') e.preventDefault();
});
```

### Touch
```typescript
// Virtual joystick
touchStart: Record joystick center, show UI
touchMove: Calculate offset, map to -1..1
touchEnd: Hide UI, reset values

// Spyglass (right side)
touchStart (right): touchSpyglass = true
touchEnd: touchSpyglass = false
```

## Save System

### SaveDataV1 Structure
```typescript
interface SaveDataV1 {
  // Stats
  highScore: number;
  highWave: number;
  totalGold: number;
  totalShips: number;
  totalWaves: number;
  bestCombo: number;
  
  // Unlocks
  victories: number;
  victoryClasses: ShipClass[];
  galleonUnlocked: boolean;
  bosunUnlocked: boolean;
  quartermasterUnlocked: boolean;
  endlessModeUnlocked: boolean;
  
  // Settings
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  graphicsQuality: 'low' | 'medium' | 'high';
}
```

### Persistence
```typescript
const SAVE_KEY = 'booty-hunt-save';

function save() {
  localStorage.setItem(SAVE_KEY, JSON.stringify(data));
}

function load(): SaveDataV1 {
  const raw = localStorage.getItem(SAVE_KEY);
  if (raw) return { ...defaults, ...JSON.parse(raw) };
  return createDefaultSave();
}
```

## Performance Budget

### Target: 60 FPS on mid-tier devices

| System | Budget | Actual |
|--------|--------|--------|
| Physics update | 2ms | ~1ms |
| AI update | 3ms | ~1.5ms |
| Render | 10ms | ~6ms |
| Particle updates | 2ms | ~1ms |
| UI updates | 1ms | ~0.5ms |

### Throttling
```typescript
// Minimap updates every 3rd frame
if (frameCount % 3 === 0) ui.updateMinimap(...);

// Compass updates only when angle changes significantly
if (Math.abs(newAngle - lastAngle) > 0.01) updateCompass();
```

## Debug Tools

### Dev Panel (`)
- Set gold, health, speed, damage
- Toggle god mode, instakill
- Spawn any enemy type
- Set weather state
- Jump to any wave

### Console Logging
```typescript
// Performance
console.log('[Perf] Frame time:', dt);
console.log('[Perf] Active particles:', particleCount);

// Game state
console.log('[Game] Wave complete, spawning', count, 'enemies');
```

## Build System

### Vite Configuration
```typescript
// vite.config.ts
export default {
  build: {
    target: 'esnext',
    minify: 'terser',
  }
};
```

### Dependencies
- **three** (^0.170.0) - 3D rendering
- **@types/three** - TypeScript definitions

### Output
- Single bundled JS file
- No external assets (procedural generation)
- Can be deployed to static hosting

## Future Technical Considerations

### Potential Optimizations
- [ ] Web Workers for AI updates
- [ ] GPU particle systems (compute shaders)
- [ ] Texture atlasing for UI
- [ ] Occlusion culling for islands

### Platform Expansion
- [ ] Touch control refinement
- [ ] Gamepad support
- [ ] Steam/Electron wrapper
- [ ] Mobile app (Capacitor/Cordova)
