# Audio Design Document

## Philosophy

All audio is **procedurally generated** using Web Audio API - no external samples. This ensures:
- Fast loading (no asset downloads)
- Small bundle size
- Dynamic variation
- Real-time parameter modulation

## Architecture

```
AudioContext
├── Master Gain
│   ├── SFX Bus (GainNode)
│   │   ├── Cannon shots
│   │   ├── Explosions
│   │   ├── UI sounds
│   │   └── Ambient (wind gusts, creaks)
│   └── Music Bus (GainNode)
│       └── Sea shanty melody
└── Ambient Layers (connect to Master)
    ├── Ocean (Brown noise + LFO)
    └── Wind (White noise + Bandpass)
```

## Ambient Layers

### Ocean Rumble
```typescript
// Brown noise → Lowpass (200Hz) → AM by slow LFO
source: BrownNoiseBuffer(4s), looped
filter: BiquadFilterNode, lowpass, 200Hz
lfo: OscillatorNode, sine, 0.12Hz (8s cycle)
gain: 0.18 base, ±0.06 modulation
```
**Purpose**: Constant low-frequency bed suggesting vast ocean

### Wind Layer
```typescript
// White noise → Bandpass (800-2400Hz)
source: WhiteNoiseBuffer(3s), looped
filter: BiquadFilterNode, bandpass, 1600Hz center
Q: 0.8
gain: 0.15 * weatherIntensity
```
**Purpose**: Whistling wind that intensifies with weather

### Storm Rumble
```typescript
// Sine wave at 35Hz, silent until storm
osc: Sine, 35Hz
gain: 0 → ramps up during storms
```
**Purpose**: Sub-bass physical presence during storms

## SFX Design

### Cannon Fire
**Layers**:
1. **Crack** (0.05s) - White noise burst, full spectrum, fast decay
2. **Boom** (0.35s) - Sine sweep 80→40Hz, exponential decay
3. **Snap** (0.1s) - Sawtooth sweep 400→200Hz, bandpassed
4. **Sub** (0.2s) - 30Hz sine, chest-punch feel

**Processing**: All through DynamicsCompressor (threshold: -20, ratio: 8)

**Variations**: Random pitch ±20%, random timing ±10ms

### Explosion
Similar to cannon but:
- Longer decay (0.55s vs 0.35s)
- Added debris crackle (square wave)
- Secondary delayed rumble for "double-boom"
- Distance attenuation: gain = 1/dist

### Coin Jingle
**Arpeggio**: C5 → E5 → G5 → C6 (and extended at high combo)

```typescript
notes = [523.25, 659.25, 783.99, 1046.50]; // C major
spacing = max(0.03, 0.09 - combo * 0.006); // Faster at high combo

for i, freq in notes:
  playSine(freq, time + i * spacing, duration * 2.5);
  // Dual oscillator for shimmer (detuned 0.3%)
```

**Combo scaling**:
- Combo 1-4: Base 4 notes
- Combo 5-7: Add E6, G6
- Combo 8-10: Add C7, sparkle overlay

### Splash
```typescript
// Highpassed white noise
filter: highpass, 800Hz
env: fast attack, exponential decay to 0.001 in 0.08s
gain: 0.5
```

### Thunder
**Layers**:
1. **Main rumble** - Sine 80→20Hz, 1.2-2.8s duration
2. **Harmonic** - Sine at 2.3x frequency, quieter
3. **Texture** - Brown noise, lowpass 150Hz

**Envelope**: Chaotic gain modulation with multiple LFOs for rolling effect

```typescript
// Chaotic envelope
segments = 6-10;
for each segment:
  gain = random(0.08, 0.5);
  time += segmentDuration;
```

### Ship Creak
```typescript
// Bandpassed noise with wobbling center
filter: bandpass, 250-450Hz, Q=8
frequency: 250 → 400 → 170 → 300 (modulated over duration)
duration: 0.15-0.35s random
```

### Wind Gust
```typescript
// Bandpass sweep
filter: bandpass
frequency: 300 → 3500 → 1800 (sweep up then down)
duration: 0.5-1.0s
```

## Music System

### Sea Shanty Structure
- **Scale**: D major pentatonic (D4, E4, F#4, A4, B4, D5)
- **BPM**: 140 (normal), varies by mode
- **Waveform**: Triangle (soft, nautical)
- **Rhythm**: 8 eighth-notes per bar, rolling feel

### Melody Bars
```
Bar 1: D D E F# A A F# E  (establishing)
Bar 2: F# A B A F# E D E  (rising)
Bar 3: A B D5 B A F# E F# (climax)
Bar 4: E5 D5 B A F# E D D (resolution)
```

### Mode Variations

| Mode | BPM | Scale | Character |
|------|-----|-------|-----------|
| Normal | 140 | D major | Cheerful, adventurous |
| Boss | 182 | A minor | Intense, driving |
| Port | 100 | D major | Relaxed, peaceful |
| Kraken | 120 | A minor | Heavy, ominous |
| Ghost Ship | 80 | Whole tone | Ethereal, unsettling |
| Sea Serpent | 160 | Chromatic | Tense, urgent |

### Implementation
```typescript
scheduleShantyBar(barIndex) {
  melody = selectMelody(currentMode);
  for i, note in melody:
    playTriangle(note, startTime + i * eighthNote, duration);
  
  // Schedule next bar
  setTimeout(() => scheduleShantyBar(barIndex + 1), barDurationMs);
}
```

### Note Articulation
- Slight random detune (±0.8%) for organic feel
- ADSR: Fast attack (15ms), sustain 50%, exponential release
- Occasional overlap for legato feel

## Dynamic Mixing

### Weather Intensity
```typescript
setWeatherIntensity(0-1) {
  windGain = baseWind * intensity;
  stormRumbleGain = intensity > 0.7 ? (intensity - 0.7) * 3 : 0;
}
```

### Speed Factor
- Ocean LFO rate increases slightly with player speed
- Wind gust probability increases with speed

### Port Mode
- Music switches to port melody
- Ocean/wind reduced by 30%
- Added tavern ambience (future)

### Boss Mode
- Music switches to boss melody immediately
- Added low drone layer
- Slight tempo ramp (2-3 second transition)

## Volume Controls

Separate gain nodes for:
- Master (all audio)
- SFX (sound effects)
- Music (shanty)

Default levels:
- Master: 1.0
- SFX: 1.0
- Music: 0.7

Mute toggles master to 0 (preserves other settings).

## Performance

- AudioContext created lazily on first interaction
- Noise buffers pre-generated and looped (not real-time noise)
- Oscillators stopped and garbage collected after use
- Maximum 3-4 simultaneous voices for music
- SFX limited by cooldowns (natural throttling)

## Future Enhancements

- [ ] Positional audio (panner nodes for 3D positioning)
- [ ] Reverb for distance/cave effects
- [ ] More variety in shanty melodies
- [ ] Tavern ambience in port
- [ ] Bird sounds for islands
- [ ] Creak variations based on wave intensity
