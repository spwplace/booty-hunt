// ============================================================================
//  BOOTY HUNT — Procedural Shanty Engine
//  Clock-driven, multi-layer sequencer. Receives AudioContext + buses from
//  Audio.ts. Uses Web Audio lookahead scheduler (setInterval 25ms, 150ms
//  lookahead) — immune to tab throttling unlike requestAnimationFrame.
// ============================================================================

import type { CrewPersonality } from './Types';

// ---------------------------------------------------------------------------
//  Public game-state interface (main.ts builds this each tick)
// ---------------------------------------------------------------------------

export type ShantyPhase = 'title' | 'port' | 'sailing' | 'combat' | 'boss';
export type ShantyEventOverride = 'kraken' | 'ghost_ship_event' | 'sea_serpent' | null;
export type ShantyCulture = 'aggressive' | 'thoughtful' | 'cunning' | 'noble';

export interface ShantyGameState {
  phase: ShantyPhase;
  morale: number;          // 0–100 average crew morale
  loyalty: number;         // 0–100 average crew loyalty
  heat: number;            // 0–100
  mutinyRisk: boolean;     // any crew member near mutiny
  eventOverride: ShantyEventOverride;
  weatherIntensity: number; // 0–1
  culture: ShantyCulture;  // dominant crew culture
}

// ---------------------------------------------------------------------------
//  Constants
// ---------------------------------------------------------------------------

const SCHEDULE_INTERVAL = 25;   // ms between scheduler ticks
const LOOKAHEAD = 0.15;         // seconds ahead to schedule
const SUBDIVISIONS = 8;         // 8th notes per bar

// MIDI-style note → frequency
const NOTE_FREQ: Record<string, number> = {};
(function buildNoteTable() {
  const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  for (let oct = 1; oct <= 7; oct++) {
    for (let i = 0; i < 12; i++) {
      const midi = (oct + 1) * 12 + i;
      NOTE_FREQ[`${names[i]}${oct}`] = 440 * Math.pow(2, (midi - 69) / 12);
    }
  }
})();

function noteFreq(note: string): number {
  return NOTE_FREQ[note] ?? 440;
}

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Scale intervals (semitones from root)
const SCALES: Record<string, number[]> = {
  major_penta:  [0, 2, 4, 7, 9],
  minor_penta:  [0, 3, 5, 7, 10],
  mixolydian:   [0, 2, 4, 5, 7, 9, 10],
  minor:        [0, 2, 3, 5, 7, 8, 10],
  whole_tone:   [0, 2, 4, 6, 8, 10],
  chromatic:    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

// Personality → culture mapping
const PERSONALITY_TO_CULTURE: Record<CrewPersonality, ShantyCulture> = {
  bloodthirsty: 'aggressive',
  reckless:     'aggressive',
  ambitious:    'aggressive',
  cautious:     'thoughtful',
  scholarly:    'thoughtful',
  stoic:        'thoughtful',
  greedy:       'cunning',
  cunning:      'cunning',
  paranoid:     'cunning',
  loyal:        'noble',
  merciful:     'noble',
  superstitious:'noble',
};

export { PERSONALITY_TO_CULTURE };

// ---------------------------------------------------------------------------
//  Key context
// ---------------------------------------------------------------------------

interface KeyContext {
  root: number;       // MIDI note number (e.g. 62 = D4)
  scale: number[];    // semitone intervals
  tempo: number;      // BPM
}

function resolveKey(state: ShantyGameState): KeyContext {
  // Event overrides take priority
  if (state.eventOverride === 'ghost_ship_event') {
    return { root: 60, scale: SCALES.whole_tone, tempo: 80 };
  }
  if (state.eventOverride === 'sea_serpent') {
    return { root: 64, scale: SCALES.chromatic, tempo: 160 };
  }
  if (state.eventOverride === 'kraken') {
    return { root: 57, scale: SCALES.minor, tempo: 120 };
  }

  // Boss phase
  if (state.phase === 'boss') {
    return { root: 57, scale: SCALES.minor_penta, tempo: 180 };
  }

  // Port
  if (state.phase === 'port' || state.phase === 'title') {
    return { root: 62, scale: SCALES.major_penta, tempo: 100 };
  }

  // Morale-driven key for sailing/combat
  let scale = SCALES.mixolydian;
  let root = 62; // D4
  let tempo = state.phase === 'combat' ? 140 : 120;

  if (state.morale > 70) {
    scale = SCALES.major_penta;
  } else if (state.morale < 30) {
    scale = SCALES.minor;
  }

  // Heat adds tempo
  if (state.heat > 50) {
    tempo += Math.floor((state.heat - 50) * 0.4);
  }

  // Low morale slows slightly
  if (state.morale < 30) {
    tempo -= 10;
  }

  return { root, scale, tempo };
}

// Get scale frequencies spanning 2 octaves
function getScaleFreqs(root: number, scale: number[]): number[] {
  const freqs: number[] = [];
  for (let oct = 0; oct < 2; oct++) {
    for (const interval of scale) {
      freqs.push(midiToFreq(root + interval + oct * 12));
    }
  }
  return freqs;
}

// ---------------------------------------------------------------------------
//  Percussion patterns (boolean arrays, 8 subdivisions per bar)
// ---------------------------------------------------------------------------

interface DrumPattern {
  kick:   boolean[];
  snare:  boolean[];
  hihat:  boolean[];
}

const PATTERNS: Record<string, DrumPattern> = {
  silent: {
    kick:  [false,false,false,false,false,false,false,false],
    snare: [false,false,false,false,false,false,false,false],
    hihat: [false,false,false,false,false,false,false,false],
  },
  port_soft: {
    kick:  [false,false,false,false,false,false,false,false],
    snare: [false,false,false,false,false,false,false,false],
    hihat: [false,false,true, false,false,true, false,false],
  },
  shanty_6_8: {
    kick:  [true, false,false,true, false,false,false,false],
    snare: [false,false,false,false,false,false,true, false],
    hihat: [true, false,true, true, false,true, true, false],
  },
  combat_4_4: {
    kick:  [true, false,false,false,true, false,false,false],
    snare: [false,false,true, false,false,false,true, false],
    hihat: [true, true, true, true, true, true, true, true],
  },
  boss_intense: {
    kick:  [true, false,true, false,true, false,true, false],
    snare: [false,true, false,true, false,true, false,true],
    hihat: [true, true, true, true, true, true, true, true],
  },
  high_heat: {
    kick:  [true, true, false,true, true, false,true, false],
    snare: [false,false,true, false,false,true, false,true],
    hihat: [true, true, true, true, true, true, true, true],
  },
};

function selectPattern(state: ShantyGameState): DrumPattern {
  if (state.phase === 'title') return PATTERNS.silent;
  if (state.phase === 'port') return PATTERNS.port_soft;
  if (state.phase === 'boss') return PATTERNS.boss_intense;
  if (state.heat > 50 && state.phase === 'combat') return PATTERNS.high_heat;
  if (state.phase === 'combat') return PATTERNS.combat_4_4;
  return PATTERNS.shanty_6_8; // sailing
}

// ---------------------------------------------------------------------------
//  Melody generation
// ---------------------------------------------------------------------------

interface MelodyNote {
  freq: number;
  duration: number; // fraction of subdivision
  rest: boolean;
}

function generateMelodyPhrase(
  scaleFreqs: number[],
  culture: ShantyCulture,
  barCount: number,
): MelodyNote[] {
  const notes: MelodyNote[] = [];
  const len = barCount * SUBDIVISIONS;
  let idx = Math.floor(scaleFreqs.length / 3); // start mid-range

  for (let i = 0; i < len; i++) {
    // Culture-shaped movement
    let step: number;
    const r = Math.random();

    switch (culture) {
      case 'aggressive':
        // Wide leaps, ascending bias
        step = r < 0.3 ? 2 : r < 0.6 ? 3 : r < 0.8 ? -1 : -2;
        break;
      case 'thoughtful':
        // Stepwise, gentle arcs
        step = r < 0.5 ? 1 : r < 0.8 ? -1 : 0;
        break;
      case 'cunning':
        // Syncopated feel — more rests, chromatic neighbor tones
        if (r < 0.2) {
          notes.push({ freq: 0, duration: 0.85, rest: true });
          continue;
        }
        step = r < 0.5 ? 1 : r < 0.7 ? -1 : r < 0.85 ? 2 : -2;
        break;
      case 'noble':
        // Legato, call-and-response shapes
        step = r < 0.4 ? 1 : r < 0.7 ? -1 : r < 0.9 ? 2 : 0;
        break;
      default:
        step = r < 0.5 ? 1 : -1;
    }

    idx = Math.max(0, Math.min(scaleFreqs.length - 1, idx + step));

    // Occasional rest for breathing
    if (Math.random() < 0.08 && culture !== 'aggressive') {
      notes.push({ freq: 0, duration: 0.85, rest: true });
    } else {
      notes.push({ freq: scaleFreqs[idx], duration: 0.85, rest: false });
    }
  }
  return notes;
}

// ---------------------------------------------------------------------------
//  Bass phrase generation
// ---------------------------------------------------------------------------

function generateBassPhrase(
  root: number,
  scale: number[],
  phase: ShantyPhase,
): number[] {
  const rootFreq = midiToFreq(root);
  const bass: number[] = []; // 8 entries, one per subdivision

  if (phase === 'port' || phase === 'title') {
    // Walking quarter notes: I - IV - V - I (each held 2 subdivisions)
    const fourth = midiToFreq(root + (scale[3] ?? 5));
    const fifth = midiToFreq(root + (scale[4] ?? 7));
    bass.push(rootFreq, rootFreq, fourth, fourth, fifth, fifth, rootFreq, rootFreq);
  } else if (phase === 'boss') {
    // Pedal root with chromatic walk-down on beats 3-4
    const r = midiToFreq(root);
    const m1 = midiToFreq(root - 1);
    const m2 = midiToFreq(root - 2);
    const m3 = midiToFreq(root - 3);
    bass.push(r, r, r, r, r, m1, m2, m3);
  } else if (phase === 'combat') {
    // Pedal tone with octave jump on strong beats
    const low = midiToFreq(root - 12);
    bass.push(rootFreq, low, low, low, rootFreq, low, low, low);
  } else {
    // Sailing: root following with some movement
    const third = midiToFreq(root + (scale[2] ?? 4));
    const fifth = midiToFreq(root + (scale[4] ?? 7));
    bass.push(rootFreq, rootFreq, third, third, fifth, fifth, rootFreq, rootFreq);
  }

  return bass;
}

// ---------------------------------------------------------------------------
//  Chant vowel formants
// ---------------------------------------------------------------------------

interface FormantSet {
  f1: number; f2: number; f3: number;
}

const VOWELS: Record<string, FormantSet> = {
  ah: { f1: 700, f2: 1200, f3: 2500 },
  oh: { f1: 400, f2: 800,  f3: 2500 },
  ey: { f1: 500, f2: 1800, f3: 2500 },
};

const VOWEL_SEQUENCE = ['ah', 'oh', 'ey', 'ah', 'oh', 'ah', 'ey', 'oh'];

// ============================================================================
//  ShantyEngine
// ============================================================================

export class ShantyEngine {
  private ctx: AudioContext;

  // Sub-buses (all route to musicBus)
  private melodyGain: GainNode;
  private chantGain: GainNode;
  private bassGain: GainNode;
  private percGain: GainNode;
  private windHarmGain: GainNode;
  private tensionGain: GainNode;

  // Pre-allocated noise buffers
  private whiteNoiseBuf: AudioBuffer;
  private noiseShort: AudioBuffer;

  // Clock state
  private schedulerTimer: number | null = null;
  private nextNoteTime = 0;
  private currentSubdiv = 0;
  private currentBar = 0;
  private running = false;

  // Musical state
  private key: KeyContext;
  private targetTempo = 120;
  private scaleFreqs: number[] = [];
  private pattern: DrumPattern = PATTERNS.shanty_6_8;
  private melodyPhrase: MelodyNote[] = [];
  private bassPhrase: number[] = [];
  private state: ShantyGameState;

  // Persistent nodes
  private tensionOsc1: OscillatorNode | null = null;
  private tensionOsc2: OscillatorNode | null = null;
  private tensionOscGain: GainNode | null = null;
  private windHarmFilters: BiquadFilterNode[] = [];
  private windHarmSource: AudioBufferSourceNode | null = null;

  // Cannon sync
  private pendingCannonAccent = false;
  private bossApproaching = false;
  private bossDescentStep = 0;
  private bossDescentBar = -1;

  // Crossfade tracking
  private lastPhase: ShantyPhase = 'title';

  constructor(ctx: AudioContext, musicBus: GainNode) {
    this.ctx = ctx;

    // Create sub-buses
    this.melodyGain = ctx.createGain();
    this.melodyGain.gain.value = 0.07;
    this.melodyGain.connect(musicBus);

    this.chantGain = ctx.createGain();
    this.chantGain.gain.value = 0.05;
    this.chantGain.connect(musicBus);

    this.bassGain = ctx.createGain();
    this.bassGain.gain.value = 0.06;
    this.bassGain.connect(musicBus);

    this.percGain = ctx.createGain();
    this.percGain.gain.value = 0.10;
    this.percGain.connect(musicBus);

    this.windHarmGain = ctx.createGain();
    this.windHarmGain.gain.value = 0;
    this.windHarmGain.connect(musicBus);

    this.tensionGain = ctx.createGain();
    this.tensionGain.gain.value = 0;
    this.tensionGain.connect(musicBus);

    // Pre-allocate noise buffers
    this.whiteNoiseBuf = this.createNoiseBuffer(2);
    this.noiseShort = this.createNoiseBuffer(0.1);

    // Default state
    this.state = {
      phase: 'title',
      morale: 50,
      loyalty: 60,
      heat: 0,
      mutinyRisk: false,
      eventOverride: null,
      weatherIntensity: 0,
      culture: 'noble',
    };

    this.key = resolveKey(this.state);
    this.targetTempo = this.key.tempo;
    this.scaleFreqs = getScaleFreqs(this.key.root, this.key.scale);
  }

  // -------------------------------------------------------------------------
  //  Noise buffer utility
  // -------------------------------------------------------------------------

  private createNoiseBuffer(durationSec: number): AudioBuffer {
    const length = Math.floor(this.ctx.sampleRate * durationSec);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  // -------------------------------------------------------------------------
  //  Start / Stop
  // -------------------------------------------------------------------------

  start(): void {
    if (this.running) return;
    this.running = true;
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this.currentSubdiv = 0;
    this.currentBar = 0;

    this.initPersistentNodes();
    this.regenerateBar();

    this.schedulerTimer = window.setInterval(() => this.schedulerTick(), SCHEDULE_INTERVAL);
  }

  stop(): void {
    this.running = false;
    if (this.schedulerTimer !== null) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
    this.disposePersistentNodes();
  }

  // -------------------------------------------------------------------------
  //  State update (called from main.ts ~5× / sec)
  // -------------------------------------------------------------------------

  updateState(newState: ShantyGameState): void {
    this.state = newState;
  }

  // -------------------------------------------------------------------------
  //  Event hooks
  // -------------------------------------------------------------------------

  onCannonFired(): void {
    this.pendingCannonAccent = true;
  }

  onBossApproaching(): void {
    this.bossApproaching = true;
    this.bossDescentStep = 0;
    this.bossDescentBar = this.currentBar;
  }

  onDamageTaken(): void {
    // Schedule a dissonant stab immediately
    if (!this.running) return;
    const now = this.ctx.currentTime;
    this.scheduleDissonantStab(now);
  }

  onWaveComplete(): void {
    // Could trigger a brief celebratory riff — for now, let the state
    // transition handle it via phase change to 'sailing' / 'port'
  }

  // -------------------------------------------------------------------------
  //  Persistent nodes (tension drone, wind harmonics)
  // -------------------------------------------------------------------------

  private initPersistentNodes(): void {
    const ctx = this.ctx;

    // Tension drone: 2 sine oscillators at tritone interval
    this.tensionOscGain = ctx.createGain();
    this.tensionOscGain.gain.value = 0;
    this.tensionOscGain.connect(this.tensionGain);

    this.tensionOsc1 = ctx.createOscillator();
    this.tensionOsc1.type = 'sine';
    this.tensionOsc1.frequency.value = midiToFreq(this.key.root);
    this.tensionOsc1.connect(this.tensionOscGain);
    this.tensionOsc1.start();

    this.tensionOsc2 = ctx.createOscillator();
    this.tensionOsc2.type = 'sine';
    this.tensionOsc2.frequency.value = midiToFreq(this.key.root + 6); // tritone
    this.tensionOsc2.connect(this.tensionOscGain);
    this.tensionOsc2.start();

    // Wind harmonics: 4 bandpass filters on a looping white noise source
    this.windHarmSource = ctx.createBufferSource();
    this.windHarmSource.buffer = this.whiteNoiseBuf;
    this.windHarmSource.loop = true;

    const rootHz = midiToFreq(this.key.root);
    const harmonicMults = [2, 3, 5, 7];
    this.windHarmFilters = [];

    for (const mult of harmonicMults) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = rootHz * mult;
      bp.Q.value = 12;

      this.windHarmSource.connect(bp);
      bp.connect(this.windHarmGain);
      this.windHarmFilters.push(bp);
    }

    this.windHarmSource.start();
  }

  private disposePersistentNodes(): void {
    try { this.tensionOsc1?.stop(); } catch { /* ok */ }
    try { this.tensionOsc2?.stop(); } catch { /* ok */ }
    try { this.windHarmSource?.stop(); } catch { /* ok */ }

    this.tensionOsc1 = null;
    this.tensionOsc2 = null;
    this.tensionOscGain = null;
    this.windHarmSource = null;
    this.windHarmFilters = [];
  }

  // -------------------------------------------------------------------------
  //  Lookahead scheduler
  // -------------------------------------------------------------------------

  private schedulerTick(): void {
    if (!this.running) return;

    const subdivDuration = 60 / this.key.tempo / 2; // duration of 1 eighth note

    while (this.nextNoteTime < this.ctx.currentTime + LOOKAHEAD) {
      this.scheduleSubdivision(this.nextNoteTime, this.currentSubdiv);

      this.currentSubdiv++;
      if (this.currentSubdiv >= SUBDIVISIONS) {
        this.currentSubdiv = 0;
        this.currentBar++;
        this.onBarBoundary();
      }

      this.nextNoteTime += subdivDuration;
    }
  }

  // -------------------------------------------------------------------------
  //  Bar boundary — regenerate phrases, update key, handle transitions
  // -------------------------------------------------------------------------

  private onBarBoundary(): void {
    const prevKey = this.key;
    this.key = resolveKey(this.state);

    // Smooth tempo ramp (max 10 BPM per bar)
    const tempoDelta = this.key.tempo - this.targetTempo;
    this.targetTempo += Math.max(-10, Math.min(10, tempoDelta));
    this.key = { ...this.key, tempo: this.targetTempo };

    // Detect key/scale change
    const keyChanged = prevKey.root !== this.key.root ||
      prevKey.scale.length !== this.key.scale.length;

    if (keyChanged) {
      this.scaleFreqs = getScaleFreqs(this.key.root, this.key.scale);
      this.retunePersistentNodes();
    }

    // Phase transition crossfades
    if (this.state.phase !== this.lastPhase) {
      this.handlePhaseTransition(this.lastPhase, this.state.phase);
      this.lastPhase = this.state.phase;
    }

    this.regenerateBar();

    // Update tension/wind gains
    this.updatePersistentGains();

    // Boss approaching: chromatic descent
    if (this.bossApproaching && this.currentBar - this.bossDescentBar < 8) {
      this.bossDescentStep++;
      if (this.tensionOsc1 && this.tensionOsc2) {
        const now = this.ctx.currentTime;
        const descRoot = this.key.root - this.bossDescentStep;
        this.tensionOsc1.frequency.linearRampToValueAtTime(
          midiToFreq(descRoot), now + 0.1
        );
        this.tensionOsc2.frequency.linearRampToValueAtTime(
          midiToFreq(descRoot + 6), now + 0.1
        );
      }
    } else {
      this.bossApproaching = false;
    }

    // Mutiny risk: inject random b5 into scale freqs
    if (this.state.mutinyRisk && Math.random() < 0.3) {
      const tritone = midiToFreq(this.key.root + 6);
      this.scaleFreqs.push(tritone);
      this.scaleFreqs.push(tritone * 2);
    }
  }

  private regenerateBar(): void {
    this.pattern = selectPattern(this.state);
    this.melodyPhrase = generateMelodyPhrase(this.scaleFreqs, this.state.culture, 1);
    this.bassPhrase = generateBassPhrase(this.key.root, this.key.scale, this.state.phase);
  }

  private handlePhaseTransition(from: ShantyPhase, to: ShantyPhase): void {
    const now = this.ctx.currentTime;
    const fadeTime = 1.5; // bars ≈ 1.5s crossfade

    // Fade layers up/down based on new phase
    if (to === 'port' || to === 'title') {
      this.percGain.gain.linearRampToValueAtTime(0.03, now + fadeTime);
      this.melodyGain.gain.linearRampToValueAtTime(0.05, now + fadeTime);
      this.chantGain.gain.linearRampToValueAtTime(0.02, now + fadeTime);
      this.bassGain.gain.linearRampToValueAtTime(0.03, now + fadeTime);
    } else if (to === 'combat') {
      this.percGain.gain.linearRampToValueAtTime(0.12, now + fadeTime);
      this.melodyGain.gain.linearRampToValueAtTime(0.08, now + fadeTime);
      this.chantGain.gain.linearRampToValueAtTime(0.06, now + fadeTime);
      this.bassGain.gain.linearRampToValueAtTime(0.07, now + fadeTime);
    } else if (to === 'boss') {
      this.percGain.gain.linearRampToValueAtTime(0.14, now + fadeTime);
      this.melodyGain.gain.linearRampToValueAtTime(0.09, now + fadeTime);
      this.chantGain.gain.linearRampToValueAtTime(0.07, now + fadeTime);
      this.bassGain.gain.linearRampToValueAtTime(0.08, now + fadeTime);
    } else {
      // sailing
      this.percGain.gain.linearRampToValueAtTime(0.08, now + fadeTime);
      this.melodyGain.gain.linearRampToValueAtTime(0.07, now + fadeTime);
      this.chantGain.gain.linearRampToValueAtTime(0.05, now + fadeTime);
      this.bassGain.gain.linearRampToValueAtTime(0.06, now + fadeTime);
    }
  }

  private retunePersistentNodes(): void {
    const now = this.ctx.currentTime;
    const rootHz = midiToFreq(this.key.root);

    // Retune tension drone
    if (this.tensionOsc1) {
      this.tensionOsc1.frequency.linearRampToValueAtTime(rootHz, now + 0.3);
    }
    if (this.tensionOsc2) {
      this.tensionOsc2.frequency.linearRampToValueAtTime(
        midiToFreq(this.key.root + 6), now + 0.3
      );
    }

    // Retune wind harmonic filters
    const harmonicMults = [2, 3, 5, 7];
    for (let i = 0; i < this.windHarmFilters.length; i++) {
      this.windHarmFilters[i].frequency.linearRampToValueAtTime(
        rootHz * harmonicMults[i], now + 0.3
      );
    }
  }

  private updatePersistentGains(): void {
    const now = this.ctx.currentTime;
    const ramp = 0.5;

    // Tension drone gain
    let tensionTarget = 0;
    if (this.state.mutinyRisk) {
      tensionTarget = 0.12;
    } else if (this.state.heat > 50) {
      tensionTarget = (this.state.heat / 100) * 0.15;
    }
    if (this.state.phase === 'boss') {
      tensionTarget = Math.max(tensionTarget, 0.08);
    }
    this.tensionGain.gain.linearRampToValueAtTime(tensionTarget, now + ramp);

    // Wind harmonics gain — driven by weather intensity
    let windTarget = this.state.weatherIntensity * 0.04;
    if (this.state.eventOverride === 'ghost_ship_event') {
      windTarget = 0.06; // eerie wind for ghost ships
    }
    if (this.state.phase === 'port' || this.state.phase === 'title') {
      windTarget *= 0.3;
    }
    this.windHarmGain.gain.linearRampToValueAtTime(windTarget, now + ramp);
  }

  // -------------------------------------------------------------------------
  //  Per-subdivision scheduling
  // -------------------------------------------------------------------------

  private scheduleSubdivision(time: number, subdiv: number): void {
    this.schedulePercussion(time, subdiv);
    this.scheduleMelody(time, subdiv);
    this.scheduleBass(time, subdiv);
    this.scheduleChant(time, subdiv);

    // Cannon accent: quantize to nearest subdivision
    if (this.pendingCannonAccent) {
      this.pendingCannonAccent = false;
      this.scheduleCannonAccent(time);
    }
  }

  // -------------------------------------------------------------------------
  //  Layer 1: Percussion
  // -------------------------------------------------------------------------

  private schedulePercussion(time: number, subdiv: number): void {
    const pat = this.pattern;

    // Mutiny risk: randomly skip beats
    if (this.state.mutinyRisk && Math.random() < 0.15) return;

    if (pat.kick[subdiv]) this.scheduleKick(time);
    if (pat.snare[subdiv]) this.scheduleSnare(time);
    if (pat.hihat[subdiv]) this.scheduleHihat(time);
  }

  private scheduleKick(time: number): void {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(60, time);
    osc.frequency.exponentialRampToValueAtTime(30, time + 0.15);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.7, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);

    osc.connect(gain);
    gain.connect(this.percGain);
    osc.start(time);
    osc.stop(time + 0.25);
  }

  private scheduleSnare(time: number): void {
    const ctx = this.ctx;

    // Noise burst
    const src = ctx.createBufferSource();
    src.buffer = this.noiseShort;

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 400;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.5, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);

    src.connect(hp);
    hp.connect(gain);
    gain.connect(this.percGain);
    src.start(time);
    src.stop(time + 0.1);

    // Culture modifier: aggressive adds pitch transient
    if (this.state.culture === 'aggressive') {
      const click = ctx.createOscillator();
      click.type = 'square';
      click.frequency.setValueAtTime(300, time);
      click.frequency.exponentialRampToValueAtTime(100, time + 0.02);

      const cGain = ctx.createGain();
      cGain.gain.setValueAtTime(0.2, time);
      cGain.gain.exponentialRampToValueAtTime(0.001, time + 0.03);

      click.connect(cGain);
      cGain.connect(this.percGain);
      click.start(time);
      click.stop(time + 0.04);
    }

    // Culture modifier: cunning adds metallic ring
    if (this.state.culture === 'cunning') {
      const ring = ctx.createOscillator();
      ring.type = 'sine';
      ring.frequency.value = 800 + Math.random() * 400;

      const rGain = ctx.createGain();
      rGain.gain.setValueAtTime(0.1, time);
      rGain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);

      ring.connect(rGain);
      rGain.connect(this.percGain);
      ring.start(time);
      ring.stop(time + 0.12);
    }
  }

  private scheduleHihat(time: number): void {
    const ctx = this.ctx;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseShort;

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 8000;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.15, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);

    src.connect(hp);
    hp.connect(gain);
    gain.connect(this.percGain);
    src.start(time);
    src.stop(time + 0.06);
  }

  // -------------------------------------------------------------------------
  //  Layer 2: Melody
  // -------------------------------------------------------------------------

  private scheduleMelody(time: number, subdiv: number): void {
    const note = this.melodyPhrase[subdiv];
    if (!note || note.rest) return;

    if (this.state.phase === 'title') return; // no melody on title

    const ctx = this.ctx;
    const subdivDur = 60 / this.key.tempo / 2;
    const noteDur = subdivDur * note.duration;

    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();

    // Culture-driven waveform and filter
    switch (this.state.culture) {
      case 'aggressive':
        osc.type = 'sawtooth';
        filter.type = 'lowpass';
        filter.frequency.value = 2000;
        filter.Q.value = 1;
        break;
      case 'thoughtful':
        osc.type = 'sine';
        filter.type = 'lowpass';
        filter.frequency.value = 800;
        filter.Q.value = 0.5;
        break;
      case 'cunning':
        osc.type = 'square';
        filter.type = 'bandpass';
        filter.frequency.value = 3500;
        filter.Q.value = 2;
        break;
      case 'noble':
      default:
        osc.type = 'triangle';
        filter.type = 'lowpass';
        filter.frequency.value = 1200;
        filter.Q.value = 0.7;
        break;
    }

    // Slight random detuning for organic feel
    osc.frequency.value = note.freq * (1 + (Math.random() - 0.5) * 0.008);
    osc.detune.value = (Math.random() - 0.5) * 6;

    const noteGain = ctx.createGain();
    noteGain.gain.setValueAtTime(0, time);
    noteGain.gain.linearRampToValueAtTime(0.5, time + 0.015);
    noteGain.gain.setValueAtTime(0.5, time + noteDur * 0.5);
    noteGain.gain.exponentialRampToValueAtTime(0.001, time + noteDur);

    // Thoughtful culture: add 2nd harmonic for flute-like quality
    if (this.state.culture === 'thoughtful') {
      const harm = ctx.createOscillator();
      harm.type = 'sine';
      harm.frequency.value = note.freq * 2;
      const hGain = ctx.createGain();
      hGain.gain.setValueAtTime(0, time);
      hGain.gain.linearRampToValueAtTime(0.15, time + 0.015);
      hGain.gain.exponentialRampToValueAtTime(0.001, time + noteDur);
      harm.connect(hGain);
      hGain.connect(filter);
      harm.start(time);
      harm.stop(time + noteDur + 0.01);
    }

    osc.connect(filter);
    filter.connect(noteGain);
    noteGain.connect(this.melodyGain);

    osc.start(time);
    osc.stop(time + noteDur + 0.01);
  }

  // -------------------------------------------------------------------------
  //  Layer 3: Chant (formant synthesis)
  // -------------------------------------------------------------------------

  private scheduleChant(time: number, subdiv: number): void {
    // Chant on every other subdivision (quarter-note rhythm)
    if (subdiv % 2 !== 0) return;
    if (this.state.phase === 'title') return;
    if (this.state.phase === 'port' && this.state.morale < 40) return;

    const morale = this.state.morale;
    const subdivDur = 60 / this.key.tempo / 2;
    const chantDur = subdivDur * 1.8; // sustain across 2 subdivisions

    // Morale drives voice count and expression
    let voiceCount: number;
    let jitterMs: number;
    let vibratoRate: number;
    let vibratoDepth: number;
    let volume: number;

    if (morale > 70) {
      voiceCount = 3;
      jitterMs = 5;
      vibratoRate = 5;
      vibratoDepth = 3;
      volume = 0.4;
    } else if (morale > 30) {
      voiceCount = 2;
      jitterMs = 15;
      vibratoRate = 3;
      vibratoDepth = 2;
      volume = 0.3;
    } else {
      voiceCount = 1;
      jitterMs = 30;
      vibratoRate = 0;
      vibratoDepth = 0;
      volume = 0.15;
    }

    // Mutiny risk: off-key singing, missed beats
    if (this.state.mutinyRisk) {
      if (Math.random() < 0.3) return; // missed beat
      volume *= 0.6;
    }

    // Call-response: first half of bar = 1 voice (call), second half = full (response)
    const isCall = subdiv < 4;
    const activeVoices = isCall ? 1 : voiceCount;

    // Select vowel
    const vowelKey = VOWEL_SEQUENCE[subdiv % VOWEL_SEQUENCE.length];
    const formants = VOWELS[vowelKey];

    // Pick a pitch from the current scale (lower range for chant)
    const rootFreq = midiToFreq(this.key.root - 12); // one octave below melody
    const scaleIdx = subdiv % this.key.scale.length;
    const chantFreq = midiToFreq(this.key.root - 12 + this.key.scale[scaleIdx]);

    for (let v = 0; v < activeVoices; v++) {
      const jitter = (Math.random() - 0.5) * jitterMs * 0.002;
      const voiceTime = time + jitter;

      this.scheduleChantVoice(
        voiceTime, chantDur, chantFreq, formants,
        volume / activeVoices,
        vibratoRate, vibratoDepth,
        v > 0 ? (Math.random() - 0.5) * 4 : 0, // detune for chorus
      );
    }
  }

  private scheduleChantVoice(
    time: number, duration: number, freq: number,
    formants: FormantSet, volume: number,
    vibratoRate: number, vibratoDepth: number,
    detuneCents: number,
  ): void {
    const ctx = this.ctx;

    // Sawtooth source (vocal cord simulation)
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    osc.detune.value = detuneCents;

    // Vibrato LFO
    if (vibratoRate > 0) {
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = vibratoRate;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = vibratoDepth;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start(time);
      lfo.stop(time + duration + 0.01);
    }

    // Mutiny: random tritone shift
    if (this.state.mutinyRisk && Math.random() < 0.2) {
      osc.frequency.value = freq * Math.pow(2, 6 / 12); // tritone shift
    }

    // 3 parallel bandpass filters for formants
    const merger = ctx.createGain();
    merger.gain.value = volume;

    const formantFreqs = [formants.f1, formants.f2, formants.f3];
    const formantQs = [6, 7, 5];

    for (let i = 0; i < 3; i++) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = formantFreqs[i];
      bp.Q.value = formantQs[i];
      osc.connect(bp);
      bp.connect(merger);
    }

    // Envelope
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(1, time + 0.03);
    env.gain.setValueAtTime(1, time + duration * 0.6);
    env.gain.linearRampToValueAtTime(0, time + duration);

    merger.connect(env);
    env.connect(this.chantGain);

    osc.start(time);
    osc.stop(time + duration + 0.02);
  }

  // -------------------------------------------------------------------------
  //  Layer 4: Bass
  // -------------------------------------------------------------------------

  private scheduleBass(time: number, subdiv: number): void {
    if (this.state.phase === 'title') return;

    const freq = this.bassPhrase[subdiv];
    if (!freq) return;

    // Only play on certain subdivisions depending on phase
    if (this.state.phase === 'port' && subdiv % 2 !== 0) return;

    const ctx = this.ctx;
    const subdivDur = 60 / this.key.tempo / 2;
    const noteDur = subdivDur * 0.9;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 200;
    lp.Q.value = 1;

    const noteGain = ctx.createGain();
    noteGain.gain.setValueAtTime(0, time);
    noteGain.gain.linearRampToValueAtTime(0.6, time + 0.01);
    noteGain.gain.setValueAtTime(0.6, time + noteDur * 0.7);
    noteGain.gain.exponentialRampToValueAtTime(0.001, time + noteDur);

    osc.connect(lp);
    lp.connect(noteGain);
    noteGain.connect(this.bassGain);

    osc.start(time);
    osc.stop(time + noteDur + 0.01);
  }

  // -------------------------------------------------------------------------
  //  Cannon accent (quantized to current subdivision)
  // -------------------------------------------------------------------------

  private scheduleCannonAccent(time: number): void {
    const ctx = this.ctx;

    // Extra snare/crash
    const src = ctx.createBufferSource();
    src.buffer = this.noiseShort;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3000;
    bp.Q.value = 0.5;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.4, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

    src.connect(bp);
    bp.connect(gain);
    gain.connect(this.percGain);
    src.start(time);
    src.stop(time + 0.15);

    // Extra kick for punch
    this.scheduleKick(time);
  }

  // -------------------------------------------------------------------------
  //  Dissonant stab (damage taken)
  // -------------------------------------------------------------------------

  private scheduleDissonantStab(time: number): void {
    const ctx = this.ctx;

    // Short cluster of dissonant notes
    const rootHz = midiToFreq(this.key.root);
    const tritone = rootHz * Math.pow(2, 6 / 12);
    const minor2nd = rootHz * Math.pow(2, 1 / 12);

    const freqs = [rootHz, tritone, minor2nd];

    for (const freq of freqs) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.15, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);

      osc.connect(gain);
      gain.connect(this.melodyGain);
      osc.start(time);
      osc.stop(time + 0.2);
    }
  }

  // -------------------------------------------------------------------------
  //  Disposal
  // -------------------------------------------------------------------------

  dispose(): void {
    this.stop();
  }
}
