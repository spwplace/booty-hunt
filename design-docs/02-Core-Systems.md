# Core Systems Design

## 1. Ship System (Ship.ts)

### Ship Mesh Generation
Procedurally generated low-poly ships using Three.js primitives:
- **Hull** - Box geometry with keel, bow (cone), stern (cone)
- **Masts** - Cylinders with animated sails (custom shader)
- **Sails** - Plane geometry with wind billowing vertex shader
- **Details** - Cabin, railings, lanterns, cannons, flags

### Ship Classes
Three distinct ship classes with different dimension configs:

```typescript
interface ShipClassDimensions {
  hull: [width, height, length];
  mainMastHeight: number;
  hasForeMast: boolean;
  hasAftMast: boolean;  // Galleon only
  cannonZPositions: number[];
  // ... 20+ parameters
}
```

### Visual Progression
Ship appearance changes based on upgrade tiers:
- **Speed Tier (0-3)** - Gold trim on sails
- **Armor Tier (0-3)** - Metal bands on hull
- **Weapon Tier (0-3)** - Emissive glow on cannons
- **Boss Variant** - Dark red/black coloring, 1.8x scale
- **Surrender Flag** - White flag for near-death enemies

## 2. Combat System (Combat.ts)

### Cannonball Physics
- **Pool-based** - 100 max cannonballs with object pooling
- **Ballistic arc** - Gravity = 12 m/s², initial upward velocity
- **Speed** - 28 units/second base
- **Instanced rendering** - Single InstancedMesh for all balls

### Broadside Mechanics
- **Staggered fire** - 0.08s interval between shots for visual variety
- **Spread** - Random velocity variance (reduced by "Steady Hands" upgrade)
- **Weather impact** - Stormy weather adds spread penalty
- **Cooldown** - 2.5s base (modifiable by upgrades)

### Special Ammunition Types
| Type | Effect | Source |
|------|--------|--------|
| **Chain Shot** | Slows hit enemies 50% for 3s | Upgrade |
| **Grapeshot** | Splits into 3 on near-miss | Upgrade |
| **Neptune's Wrath** | AoE splash every 5th shot | Upgrade |

## 3. Input System (main.ts)

### Keyboard Controls
```typescript
const keys: Record<string, boolean> = {};
// WASD - Movement
// Q/E - Fire broadsides
// M - Toggle mute
// ` - Toggle dev panel
```

### Mobile Touch Controls
- **Left half** - Virtual joystick (steering + throttle)
- **Right half** - Spyglass toggle
- **UI buttons** - Port/Starboard fire buttons

### Autopilot (Screensaver Mode)
State machine for demo/attract mode:
- `idle` - Gentle wandering
- `seek_island` - Navigate to islands
- `seek_merchant` - Approach targets
- `engage` - Orbit and fire broadsides

## 4. Physics & Movement

### Player Ship Physics
```typescript
// Turn rate based on speed (faster = slower turning)
const turnRate = 2.2 * dt * Math.max(0.3, playerSpeed / maxSpeed);

// Acceleration/deceleration
playerSpeed = lerp(playerSpeed, targetSpeed, 1 - exp(-2 * dt));
```

### Wave Integration
Ships bob and pitch based on ocean wave height at their position using Gerstner wave math.

## 5. Camera System

### Follow Camera
- **Offset** - Behind and above player
- **Smooth follow** - Lerp toward ideal position
- **Screen shake** - Triggered by cannon fire and impacts
- **Spyglass mode** - Zoomed view with vignette overlay

### Camera Shake
```typescript
class ScreenShake {
  trigger(strength: number) {
    this.intensity = Math.max(this.intensity, strength);
  }
  // Exponential decay: intensity *= exp(-8 * dt)
}
```

## 6. UI System (UI.ts)

### HUD Elements
- **Score** - Animated gold counter
- **Compass** - Rotating arrow pointing to nearest target
- **Distance** - Leagues to target
- **Health Bar** - Color-coded (green/yellow/red)
- **Wave Counter** - Wave # and ships remaining
- **Cooldown Indicators** - Port/Starboard reload status
- **Minimap** - Radar-style enemy positions

### Menus
- **Title Screen** - "Press any key to start"
- **Upgrade Screen** - 3-choice upgrade selection (Common/Rare/Legendary)
- **Port UI** - Shop and repair interface
- **Game Over** - Stats and restart
- **Run Summary** - Victory statistics

## 7. Weather System (Weather.ts)

### Weather States
| State | Fog | Waves | Rain | Lightning |
|-------|-----|-------|------|-----------|
| Clear | 0.008 | 1.0 | No | No |
| Foggy | 0.028 | 0.75 | No | No |
| Stormy | 0.016 | 1.9 | Yes | 8% chance |
| Night | 0.010 | 0.9 | No | No |

### Visual Effects
- **Fog** - Exp2 fog density and color
- **Sky** - Shader-based gradient with sun/moon
- **Ocean** - Wave scale affects Gerstner amplitudes
- **Lighting** - Sun intensity, ambient color changes

### Transitions
Smooth 10-second interpolation between states using smoothstep easing.
