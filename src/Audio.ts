import * as THREE from 'three';

// ============================================================================
//  BOOTY HUNT — Procedural Audio Engine
//  All sounds synthesized in real-time via Web Audio API. No samples needed.
//  Lazy-initializes on first user interaction. Export: `audio` singleton.
// ============================================================================

export type EventType = 'kraken' | 'ghost_ship_event' | 'sea_serpent';

class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private initialized = false;
  private muted = false;
  private previousVolume = 1.0;

  // --- Separate volume control nodes ---
  private sfxGain: GainNode | null = null;
  private musicGainNode: GainNode | null = null;
  private sfxVolume = 1.0;
  private musicVolume = 1.0;

  // --- Ambient layer nodes ---
  private oceanSource: AudioBufferSourceNode | null = null;
  private oceanGain: GainNode | null = null;
  private oceanFilter: BiquadFilterNode | null = null;
  private oceanLfo: OscillatorNode | null = null;
  private oceanLfoGain: GainNode | null = null;

  private windSource: AudioBufferSourceNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windBaseIntensity = 0.3;

  // --- Storm layer ---
  private stormRumbleOsc: OscillatorNode | null = null;
  private stormRumbleGain: GainNode | null = null;
  private weatherIntensity = 0;

  // --- Music ---
  private musicGain: GainNode | null = null;
  private musicPlaying = false;
  private musicTimeoutId: number | null = null;

  // --- Speed factor ---
  private speedFactor = 0;

  // --- Boss / Port / Event mode ---
  private bossMode = false;
  private portMode = false;
  private eventMode: EventType | null = null;

  // --- Port ambience nodes ---
  private portAmbiencePlaying = false;
  private portAmbienceSources: AudioBufferSourceNode[] = [];
  private portAmbienceGains: GainNode[] = [];
  private portAmbienceOscillators: OscillatorNode[] = [];
  private portSeagullTimeoutId: number | null = null;

  // =========================================================================
  //  INITIALIZATION
  // =========================================================================

  /**
   * Lazily create the AudioContext and spin up ambient layers + music.
   * Safe to call multiple times; only initializes once.
   */
  init(): void {
    if (this.initialized) return;

    try {
      this.ctx = new AudioContext();
    } catch {
      console.warn('[Audio] Web Audio API not available.');
      return;
    }

    this.master = this.ctx.createGain();
    this.master.gain.value = 1.0;
    this.master.connect(this.ctx.destination);

    // SFX bus: all sound effects route through here
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.sfxVolume;
    this.sfxGain.connect(this.master);

    // Music bus: the musicGainNode controls music volume separately
    this.musicGainNode = this.ctx.createGain();
    this.musicGainNode.gain.value = this.musicVolume;
    this.musicGainNode.connect(this.master);

    // Resume context if suspended (autoplay policy)
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    this.initialized = true;

    this.startOceanAmbience();
    this.startWindAmbience();
    this.startStormRumble();
    this.startShantyLoop();

    console.log('[Audio] Procedural audio engine initialized. Arr!');
  }

  // =========================================================================
  //  UTILITY: noise buffer generation
  // =========================================================================

  /** Generate a buffer of white noise at the current sample rate. */
  private createNoiseBuffer(durationSec: number): AudioBuffer {
    const ctx = this.ctx!;
    const length = Math.floor(ctx.sampleRate * durationSec);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  /** Generate a buffer of brown (red) noise — heavier low-end. */
  private createBrownNoiseBuffer(durationSec: number): AudioBuffer {
    const ctx = this.ctx!;
    const length = Math.floor(ctx.sampleRate * durationSec);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5; // amplify
    }
    return buffer;
  }

  // =========================================================================
  //  AMBIENT: Ocean
  // =========================================================================

  /**
   * Deep, vast ocean ambience:
   * Brown noise → low-pass filter (200 Hz) → amplitude-modulated by slow LFO
   * to simulate rolling swells.
   */
  private startOceanAmbience(): void {
    const ctx = this.ctx!;

    // Brown noise source (loops a 4-second buffer)
    const buffer = this.createBrownNoiseBuffer(4);
    this.oceanSource = ctx.createBufferSource();
    this.oceanSource.buffer = buffer;
    this.oceanSource.loop = true;

    // Low-pass filter — only the deep rumble survives
    this.oceanFilter = ctx.createBiquadFilter();
    this.oceanFilter.type = 'lowpass';
    this.oceanFilter.frequency.value = 200;
    this.oceanFilter.Q.value = 0.7;

    // Gain node for the ocean layer
    this.oceanGain = ctx.createGain();
    this.oceanGain.gain.value = 0.18;

    // Slow LFO to amplitude-modulate the ocean (swell feeling)
    this.oceanLfo = ctx.createOscillator();
    this.oceanLfo.type = 'sine';
    this.oceanLfo.frequency.value = 0.12; // ~8 seconds per swell cycle
    this.oceanLfoGain = ctx.createGain();
    this.oceanLfoGain.gain.value = 0.06; // modulation depth

    // Route: source → filter → gain → master
    this.oceanSource.connect(this.oceanFilter);
    this.oceanFilter.connect(this.oceanGain);

    // LFO modulates the ocean gain
    this.oceanLfo.connect(this.oceanLfoGain);
    this.oceanLfoGain.connect(this.oceanGain.gain);

    this.oceanGain.connect(this.master!);

    this.oceanSource.start();
    this.oceanLfo.start();
  }

  // =========================================================================
  //  AMBIENT: Wind
  // =========================================================================

  /**
   * Wind layer: white noise → bandpass (800–2400 Hz).
   * Intensity adjustable for weather integration.
   */
  private startWindAmbience(): void {
    const ctx = this.ctx!;

    const buffer = this.createNoiseBuffer(3);
    this.windSource = ctx.createBufferSource();
    this.windSource.buffer = buffer;
    this.windSource.loop = true;

    // Bandpass filter — whistling wind band
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 1600; // center
    this.windFilter.Q.value = 0.8;

    this.windGain = ctx.createGain();
    this.windGain.gain.value = this.windBaseIntensity * 0.15;

    this.windSource.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.master!);

    this.windSource.start();
  }

  // =========================================================================
  //  AMBIENT: Storm Rumble (silent at calm, grows with weather)
  // =========================================================================

  private startStormRumble(): void {
    const ctx = this.ctx!;

    this.stormRumbleOsc = ctx.createOscillator();
    this.stormRumbleOsc.type = 'sine';
    this.stormRumbleOsc.frequency.value = 35;

    this.stormRumbleGain = ctx.createGain();
    this.stormRumbleGain.gain.value = 0; // silent until storm

    this.stormRumbleOsc.connect(this.stormRumbleGain);
    this.stormRumbleGain.connect(this.master!);
    this.stormRumbleOsc.start();
  }

  // =========================================================================
  //  MUSIC: Shanty melody loop
  // =========================================================================

  /**
   * A simple procedural sea-shanty melody using a pentatonic / mixolydian scale.
   * Triangle wave, very quiet, loops seamlessly. Slight detuning for character.
   *
   * Scale roughly: D4 E4 F#4 A4 B4 D5  (D major pentatonic)
   * Gives that classic folk / nautical vibe.
   */
  private startShantyLoop(): void {
    const ctx = this.ctx!;
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0.08;
    this.musicGain.connect(this.musicGainNode!);
    this.musicPlaying = true;
    this.scheduleShantyBar(0);
  }

  private scheduleShantyBar(barIndex: number): void {
    if (!this.ctx || !this.musicPlaying) return;

    // --- Event mode: Kraken (A minor, 120 BPM, heavy bass) ---
    if (this.eventMode === 'kraken') {
      const A3 = 220, C4 = 261.63, D4 = 293.66, E4 = 329.63;
      const G4 = 392, A4 = 440;

      const krakenMelody: number[][] = [
        [A3, A3, C4, D4, E4, E4, D4, C4],
        [D4, E4, G4, E4, D4, C4, A3, C4],
        [E4, G4, A4, G4, E4, D4, C4, D4],
        [A4, G4, E4, D4, C4, A3, A3, A3],
      ];

      const bpm = 120;
      const eighthNoteSec = 60 / bpm / 2;
      const barDuration = 8 * eighthNoteSec;
      const bar = krakenMelody[barIndex % krakenMelody.length];
      const now = this.ctx.currentTime;

      for (let i = 0; i < bar.length; i++) {
        const freq = bar[i];
        const startTime = now + i * eighthNoteSec;
        const noteDur = eighthNoteSec * 0.85;
        this.playMelodyNote(freq, startTime, noteDur);
      }

      const nextBarTime = barDuration * 1000;
      this.musicTimeoutId = window.setTimeout(() => {
        this.scheduleShantyBar(barIndex + 1);
      }, nextBarTime);
      return;
    }

    // --- Event mode: Ghost Ship (whole-tone scale, 80 BPM, ethereal) ---
    if (this.eventMode === 'ghost_ship_event') {
      // Whole-tone scale: C4, D4, E4, F#4, G#4, A#4
      const C4 = 261.63, D4 = 293.66, E4 = 329.63;
      const Fs4 = 369.99, Gs4 = 415.30, As4 = 466.16;

      const ghostMelody: number[][] = [
        [C4, E4, Gs4, E4, C4, D4, Fs4, D4],
        [E4, Gs4, As4, Gs4, Fs4, D4, C4, E4],
        [Fs4, As4, Gs4, Fs4, E4, D4, C4, D4],
        [As4, Gs4, Fs4, E4, D4, C4, D4, C4],
      ];

      const bpm = 80;
      const eighthNoteSec = 60 / bpm / 2;
      const barDuration = 8 * eighthNoteSec;
      const bar = ghostMelody[barIndex % ghostMelody.length];
      const now = this.ctx.currentTime;

      for (let i = 0; i < bar.length; i++) {
        const freq = bar[i];
        const startTime = now + i * eighthNoteSec;
        const noteDur = eighthNoteSec * 0.85;
        this.playMelodyNote(freq, startTime, noteDur);
      }

      const nextBarTime = barDuration * 1000;
      this.musicTimeoutId = window.setTimeout(() => {
        this.scheduleShantyBar(barIndex + 1);
      }, nextBarTime);
      return;
    }

    // --- Event mode: Sea Serpent (chromatic tension, 160 BPM) ---
    if (this.eventMode === 'sea_serpent') {
      // Chromatic tension: E4, F4, G4, Ab4, Bb4, B4, C5, Db5
      const E4 = 329.63, F4 = 349.23, G4 = 392;
      const Ab4 = 415.30, Bb4 = 466.16, B4 = 493.88;
      const C5 = 523.25, Db5 = 554.37;

      const serpentMelody: number[][] = [
        [E4, F4, G4, Ab4, Bb4, Ab4, G4, F4],
        [G4, Ab4, Bb4, B4, C5, B4, Bb4, Ab4],
        [Bb4, B4, C5, Db5, C5, B4, Bb4, Ab4],
        [C5, Db5, C5, B4, Bb4, Ab4, G4, F4],
      ];

      const bpm = 160;
      const eighthNoteSec = 60 / bpm / 2;
      const barDuration = 8 * eighthNoteSec;
      const bar = serpentMelody[barIndex % serpentMelody.length];
      const now = this.ctx.currentTime;

      for (let i = 0; i < bar.length; i++) {
        const freq = bar[i];
        const startTime = now + i * eighthNoteSec;
        const noteDur = eighthNoteSec * 0.85;
        this.playMelodyNote(freq, startTime, noteDur);
      }

      const nextBarTime = barDuration * 1000;
      this.musicTimeoutId = window.setTimeout(() => {
        this.scheduleShantyBar(barIndex + 1);
      }, nextBarTime);
      return;
    }

    // --- Boss mode: A minor pentatonic at 182 BPM ---
    if (this.bossMode) {
      const A3 = 220, C4 = 261.63, D4b = 293.66, E4b = 329.63;
      const G4b = 392, A4b = 440, C5b = 523.25, D5b = 587.33;

      const bossMelody: number[][] = [
        [A3, A3, C4, D4b, E4b, E4b, D4b, C4],
        [D4b, E4b, G4b, E4b, D4b, C4, A3, C4],
        [E4b, G4b, A4b, G4b, E4b, D4b, C4, D4b],
        [C5b, A4b, G4b, E4b, D4b, C4, A3, A3],
      ];

      const bpm = 182;
      const eighthNoteSec = 60 / bpm / 2;
      const barDuration = 8 * eighthNoteSec;
      const bar = bossMelody[barIndex % bossMelody.length];
      const now = this.ctx.currentTime;

      for (let i = 0; i < bar.length; i++) {
        const freq = bar[i];
        const startTime = now + i * eighthNoteSec;
        const noteDur = eighthNoteSec * 0.85;
        this.playMelodyNote(freq, startTime, noteDur);
      }

      const nextBarTime = barDuration * 1000;
      this.musicTimeoutId = window.setTimeout(() => {
        this.scheduleShantyBar(barIndex + 1);
      }, nextBarTime);
      return;
    }

    // --- Port mode: D major at 100 BPM, quieter ---
    if (this.portMode) {
      const D4p = 293.66, E4p = 329.63, Fs4p = 369.99, A4p = 440.0, B4p = 493.88;
      const D5p = 587.33, E5p = 659.25;

      const portMelody: number[][] = [
        [D4p, D4p, E4p, Fs4p, A4p, A4p, Fs4p, E4p],
        [Fs4p, A4p, B4p, A4p, Fs4p, E4p, D4p, E4p],
        [A4p, B4p, D5p, B4p, A4p, Fs4p, E4p, Fs4p],
        [E5p, D5p, B4p, A4p, Fs4p, E4p, D4p, D4p],
      ];

      const bpm = 100;
      const eighthNoteSec = 60 / bpm / 2;
      const barDuration = 8 * eighthNoteSec;
      const bar = portMelody[barIndex % portMelody.length];
      const now = this.ctx.currentTime;

      for (let i = 0; i < bar.length; i++) {
        const freq = bar[i];
        const startTime = now + i * eighthNoteSec;
        const noteDur = eighthNoteSec * 0.85;
        this.playMelodyNote(freq, startTime, noteDur);
      }

      const nextBarTime = barDuration * 1000;
      this.musicTimeoutId = window.setTimeout(() => {
        this.scheduleShantyBar(barIndex + 1);
      }, nextBarTime);
      return;
    }

    // --- Normal mode: D major pentatonic at 140 BPM ---
    // D major pentatonic frequencies
    const D4 = 293.66, E4 = 329.63, Fs4 = 369.99, A4 = 440.0, B4 = 493.88;
    const D5 = 587.33, E5 = 659.25;

    // 4-bar melody — each bar has 4 beats at 140 BPM
    // 16 eighth-notes per cycle for a rolling, sea-shanty rhythm
    const melodyBars: number[][] = [
      // Bar 1: Establishing motif — bold ascending
      [D4, D4, E4, Fs4, A4, A4, Fs4, E4],
      // Bar 2: Rising phrase
      [Fs4, A4, B4, A4, Fs4, E4, D4, E4],
      // Bar 3: Climactic — reach the high D
      [A4, B4, D5, B4, A4, Fs4, E4, Fs4],
      // Bar 4: Resolution — descend home
      [E5, D5, B4, A4, Fs4, E4, D4, D4],
    ];

    const bpm = 140;
    const eighthNoteSec = 60 / bpm / 2;
    const barDuration = 8 * eighthNoteSec;
    const bar = melodyBars[barIndex % melodyBars.length];

    const now = this.ctx.currentTime;

    for (let i = 0; i < bar.length; i++) {
      const freq = bar[i];
      const startTime = now + i * eighthNoteSec;
      const noteDur = eighthNoteSec * 0.85; // slight gap between notes

      this.playMelodyNote(freq, startTime, noteDur);
    }

    // Schedule next bar
    const nextBarTime = barDuration * 1000;
    this.musicTimeoutId = window.setTimeout(() => {
      this.scheduleShantyBar(barIndex + 1);
    }, nextBarTime);
  }

  private playMelodyNote(freq: number, startTime: number, duration: number): void {
    const ctx = this.ctx!;

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    // Slight random detuning for organic character
    osc.frequency.value = freq * (1 + (Math.random() - 0.5) * 0.008);
    osc.detune.value = (Math.random() - 0.5) * 6;

    const noteGain = ctx.createGain();
    noteGain.gain.setValueAtTime(0, startTime);
    noteGain.gain.linearRampToValueAtTime(0.6, startTime + 0.015);
    noteGain.gain.setValueAtTime(0.6, startTime + duration * 0.5);
    noteGain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(noteGain);
    noteGain.connect(this.musicGain!);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.01);
  }

  // =========================================================================
  //  SFX: Cannon fire
  // =========================================================================

  /**
   * PUNCHY cannon blast:
   *  Layer 1 — Impulse white noise burst (0.05s, full band)
   *  Layer 2 — Low rumble (40-80Hz sine, fast exponential decay, 0.3s)
   *  Layer 3 — Mid crack (200-400Hz, 0.1s sharp transient)
   *  All summed through a compressor for maximum impact.
   */
  playCannon(): void {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Per-shot gain for layering
    const shotGain = ctx.createGain();
    shotGain.gain.value = 0.7;

    // Compressor to glue the layers and add punch
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value = 10;
    comp.ratio.value = 8;
    comp.attack.value = 0.001;
    comp.release.value = 0.1;

    shotGain.connect(comp);
    comp.connect(this.sfxGain);

    // Layer 1: Noise burst (the initial "crack")
    const noiseBuf = this.createNoiseBuffer(0.08);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(1.0, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    // High-shelf to brighten the crack
    const crackShelf = ctx.createBiquadFilter();
    crackShelf.type = 'highshelf';
    crackShelf.frequency.value = 3000;
    crackShelf.gain.value = 6;
    noise.connect(crackShelf);
    crackShelf.connect(noiseGain);
    noiseGain.connect(shotGain);
    noise.start(now);
    noise.stop(now + 0.08);

    // Layer 2: Low rumble (the boom)
    const rumble = ctx.createOscillator();
    rumble.type = 'sine';
    rumble.frequency.setValueAtTime(80, now);
    rumble.frequency.exponentialRampToValueAtTime(40, now + 0.3);
    const rumbleGain = ctx.createGain();
    rumbleGain.gain.setValueAtTime(0.9, now);
    rumbleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    rumble.connect(rumbleGain);
    rumbleGain.connect(shotGain);
    rumble.start(now);
    rumble.stop(now + 0.4);

    // Layer 3: Mid-frequency crack (sharp snap)
    const midCrack = ctx.createOscillator();
    midCrack.type = 'sawtooth';
    midCrack.frequency.setValueAtTime(400, now);
    midCrack.frequency.exponentialRampToValueAtTime(200, now + 0.1);
    const midGain = ctx.createGain();
    midGain.gain.setValueAtTime(0.5, now);
    midGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    const midFilter = ctx.createBiquadFilter();
    midFilter.type = 'bandpass';
    midFilter.frequency.value = 300;
    midFilter.Q.value = 2;
    midCrack.connect(midFilter);
    midFilter.connect(midGain);
    midGain.connect(shotGain);
    midCrack.start(now);
    midCrack.stop(now + 0.15);

    // Layer 4: Sub-bass thump for chest-punch feel
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = 30;
    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.6, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    sub.connect(subGain);
    subGain.connect(shotGain);
    sub.start(now);
    sub.stop(now + 0.2);
  }

  // =========================================================================
  //  SFX: Explosion / Impact (positional)
  // =========================================================================

  /**
   * Similar to cannon but longer decay, with distance-based attenuation.
   * Pitch varies randomly for variety.
   */
  playExplosion(position: THREE.Vector3, listenerPos: THREE.Vector3): void {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Distance attenuation: 1/distance, clamped
    const dist = position.distanceTo(listenerPos);
    const volume = Math.min(1.0, Math.max(0.05, 1.0 / Math.max(dist * 0.02, 0.5)));

    // Random pitch variation
    const pitchScale = 0.8 + Math.random() * 0.4;

    const expGain = ctx.createGain();
    expGain.gain.value = volume * 0.8;
    expGain.connect(this.sfxGain);

    // Layer 1: Noise burst — longer than cannon
    const noiseBuf = this.createNoiseBuffer(0.15);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(1.0, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    noise.connect(noiseGain);
    noiseGain.connect(expGain);
    noise.start(now);
    noise.stop(now + 0.18);

    // Layer 2: Low rumble — slow decay
    const rumble = ctx.createOscillator();
    rumble.type = 'sine';
    rumble.frequency.setValueAtTime(70 * pitchScale, now);
    rumble.frequency.exponentialRampToValueAtTime(25 * pitchScale, now + 0.5);
    const rumbleGain = ctx.createGain();
    rumbleGain.gain.setValueAtTime(0.8, now);
    rumbleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    rumble.connect(rumbleGain);
    rumbleGain.connect(expGain);
    rumble.start(now);
    rumble.stop(now + 0.6);

    // Layer 3: Mid-range debris crackle
    const crackle = ctx.createOscillator();
    crackle.type = 'square';
    crackle.frequency.setValueAtTime(350 * pitchScale, now);
    crackle.frequency.exponentialRampToValueAtTime(100 * pitchScale, now + 0.3);
    const crackleGain = ctx.createGain();
    crackleGain.gain.setValueAtTime(0.3, now);
    crackleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    crackle.connect(crackleGain);
    crackleGain.connect(expGain);
    crackle.start(now);
    crackle.stop(now + 0.35);

    // Layer 4: Secondary delayed rumble for "double-boom" realism
    const delay = 0.06 + Math.random() * 0.04;
    const rumble2 = ctx.createOscillator();
    rumble2.type = 'sine';
    rumble2.frequency.setValueAtTime(50 * pitchScale, now + delay);
    rumble2.frequency.exponentialRampToValueAtTime(20 * pitchScale, now + delay + 0.4);
    const r2Gain = ctx.createGain();
    r2Gain.gain.setValueAtTime(0, now);
    r2Gain.gain.linearRampToValueAtTime(0.5, now + delay);
    r2Gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.45);
    rumble2.connect(r2Gain);
    r2Gain.connect(expGain);
    rumble2.start(now);
    rumble2.stop(now + delay + 0.5);
  }

  // =========================================================================
  //  SFX: Coin Jingle
  // =========================================================================

  /**
   * Rapid ascending sine arpeggio: C5 → E5 → G5 → C6.
   * Combo level scales the number of notes and playback speed.
   * Higher combos = more notes, faster, more sparkly.
   */
  playCoinJingle(combo: number): void {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const baseNotes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    const extendedNotes = [
      ...baseNotes,
      1318.51, // E6
      1567.98, // G6
      2093.00, // C7
    ];

    // Clamp combo 1–10
    const level = Math.min(Math.max(combo, 1), 10);

    // More notes at higher combos (4 base + up to 3 extra)
    const noteCount = Math.min(4 + Math.floor((level - 1) / 2), extendedNotes.length);
    const notes = extendedNotes.slice(0, noteCount);

    // Faster at higher combos
    const noteSpacing = Math.max(0.03, 0.09 - level * 0.006);

    const jingleGain = ctx.createGain();
    jingleGain.gain.value = 0.25;
    jingleGain.connect(this.sfxGain);

    for (let i = 0; i < notes.length; i++) {
      const t = now + i * noteSpacing;
      const freq = notes[i];

      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;

      // Second oscillator slightly detuned for shimmer
      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.value = freq * 1.003;

      const noteGain = ctx.createGain();
      const noteDur = noteSpacing * 2.5;
      noteGain.gain.setValueAtTime(0, t);
      noteGain.gain.linearRampToValueAtTime(0.5, t + 0.005);
      noteGain.gain.exponentialRampToValueAtTime(0.001, t + noteDur);

      osc.connect(noteGain);
      osc2.connect(noteGain);
      noteGain.connect(jingleGain);

      osc.start(t);
      osc.stop(t + noteDur + 0.01);
      osc2.start(t);
      osc2.stop(t + noteDur + 0.01);
    }

    // Sparkle overlay at high combos
    if (level >= 5) {
      const sparkle = ctx.createOscillator();
      sparkle.type = 'sine';
      sparkle.frequency.setValueAtTime(3000 + level * 200, now);
      sparkle.frequency.exponentialRampToValueAtTime(5000, now + 0.1);
      const sGain = ctx.createGain();
      sGain.gain.setValueAtTime(0.08, now);
      sGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      sparkle.connect(sGain);
      sGain.connect(jingleGain);
      sparkle.start(now);
      sparkle.stop(now + 0.2);
    }
  }

  // =========================================================================
  //  SFX: Splash
  // =========================================================================

  /** Short high-passed noise burst — water splash. */
  playSplash(): void {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const noiseBuf = this.createNoiseBuffer(0.12);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;

    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = 800;
    hpf.Q.value = 0.5;

    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.setValueAtTime(6000, now);
    lpf.frequency.exponentialRampToValueAtTime(1500, now + 0.1);

    const splashGain = ctx.createGain();
    splashGain.gain.setValueAtTime(0.5, now);
    splashGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    noise.connect(hpf);
    hpf.connect(lpf);
    lpf.connect(splashGain);
    splashGain.connect(this.sfxGain);

    noise.start(now);
    noise.stop(now + 0.12);
  }

  // =========================================================================
  //  SFX: Combo Tone
  // =========================================================================

  /** Ascending triangle-wave "ding" — pitch rises with combo level. */
  playComboTone(level: number): void {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Base pitch 600Hz, rises ~80Hz per level, capped at level 12
    const clampedLevel = Math.min(Math.max(level, 1), 12);
    const freq = 600 + (clampedLevel - 1) * 80;

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.linearRampToValueAtTime(freq * 1.02, now + 0.08);

    const toneGain = ctx.createGain();
    toneGain.gain.setValueAtTime(0, now);
    toneGain.gain.linearRampToValueAtTime(0.35, now + 0.008);
    toneGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(toneGain);
    toneGain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.3);
  }

  // =========================================================================
  //  SFX: Thunder
  // =========================================================================

  /**
   * Dramatic, ominous thunder:
   * Long low-frequency rumble (20–120Hz) with chaotic amplitude envelope
   * built from multiple slow LFOs. Duration 1.2–2.8s.
   */
  playThunder(): void {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const duration = 1.2 + Math.random() * 1.6;
    const baseFreq = 20 + Math.random() * 30;

    // Main rumble oscillator
    const rumble = ctx.createOscillator();
    rumble.type = 'sine';
    rumble.frequency.setValueAtTime(baseFreq + 80, now);
    rumble.frequency.exponentialRampToValueAtTime(baseFreq, now + duration);

    // Secondary harmonic for thickness
    const harm = ctx.createOscillator();
    harm.type = 'sine';
    harm.frequency.setValueAtTime(baseFreq * 2.3, now);
    harm.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, now + duration);
    const harmGain = ctx.createGain();
    harmGain.gain.value = 0.3;

    // Noise layer for texture
    const noiseBuf = this.createBrownNoiseBuffer(duration + 0.2);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.value = 150;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.35;

    // Master thunder envelope with chaotic shape
    const thunderGain = ctx.createGain();
    thunderGain.gain.setValueAtTime(0.001, now);
    // Initial crack
    thunderGain.gain.linearRampToValueAtTime(0.7, now + 0.02);
    thunderGain.gain.exponentialRampToValueAtTime(0.25, now + 0.15);
    // Chaotic middle — simulate rolling thunder with gain points
    const segments = 6 + Math.floor(Math.random() * 4);
    let t = 0.15;
    for (let i = 0; i < segments; i++) {
      const segLen = (duration - 0.15 - 0.3) / segments;
      t += segLen;
      const randomGain = 0.08 + Math.random() * 0.45;
      thunderGain.gain.linearRampToValueAtTime(randomGain, now + t);
    }
    // Tail off
    thunderGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    // LFO 1: Slow amplitude wobble
    const lfo1 = ctx.createOscillator();
    lfo1.type = 'sine';
    lfo1.frequency.value = 2 + Math.random() * 3;
    const lfo1Gain = ctx.createGain();
    lfo1Gain.gain.value = 0.15;
    lfo1.connect(lfo1Gain);
    lfo1Gain.connect(thunderGain.gain);

    // LFO 2: Faster chaotic modulation
    const lfo2 = ctx.createOscillator();
    lfo2.type = 'triangle';
    lfo2.frequency.value = 5 + Math.random() * 8;
    const lfo2Gain = ctx.createGain();
    lfo2Gain.gain.value = 0.08;
    lfo2.connect(lfo2Gain);
    lfo2Gain.connect(thunderGain.gain);

    // Routing
    rumble.connect(thunderGain);
    harm.connect(harmGain);
    harmGain.connect(thunderGain);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(thunderGain);
    thunderGain.connect(this.sfxGain);

    rumble.start(now);
    rumble.stop(now + duration + 0.1);
    harm.start(now);
    harm.stop(now + duration + 0.1);
    noise.start(now);
    noise.stop(now + duration + 0.1);
    lfo1.start(now);
    lfo1.stop(now + duration + 0.1);
    lfo2.start(now);
    lfo2.stop(now + duration + 0.1);
  }

  // =========================================================================
  //  SFX: Ship Creak
  // =========================================================================

  /**
   * Wooden ship creak: bandpass-filtered noise (200–600Hz)
   * with a wobbling center frequency. Short, nautical, characterful.
   */
  playCreak(): void {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const duration = 0.15 + Math.random() * 0.2;

    const noiseBuf = this.createNoiseBuffer(duration + 0.05);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;

    // Bandpass with wobbling frequency — the "creak" character
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 8; // narrow = more tonal, creaky
    const centerFreq = 250 + Math.random() * 200;
    bp.frequency.setValueAtTime(centerFreq, now);
    bp.frequency.linearRampToValueAtTime(centerFreq + 150, now + duration * 0.3);
    bp.frequency.linearRampToValueAtTime(centerFreq - 80, now + duration * 0.7);
    bp.frequency.linearRampToValueAtTime(centerFreq + 50, now + duration);

    const creakGain = ctx.createGain();
    creakGain.gain.setValueAtTime(0, now);
    creakGain.gain.linearRampToValueAtTime(0.25, now + 0.01);
    creakGain.gain.setValueAtTime(0.25, now + duration * 0.4);
    creakGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(bp);
    bp.connect(creakGain);
    creakGain.connect(this.sfxGain);

    noise.start(now);
    noise.stop(now + duration + 0.05);
  }

  // =========================================================================
  //  SFX: Wind Gust
  // =========================================================================

  /**
   * Whooshing bandpass noise sweep — low frequency to high over 0.5–1s.
   * Perfect for sudden gusts or dramatic weather moments.
   */
  playWindGust(): void {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const duration = 0.5 + Math.random() * 0.5;

    const noiseBuf = this.createNoiseBuffer(duration + 0.1);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;

    // Bandpass sweeps upward for the "whoosh"
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.5;
    bp.frequency.setValueAtTime(300, now);
    bp.frequency.exponentialRampToValueAtTime(3500, now + duration * 0.7);
    bp.frequency.exponentialRampToValueAtTime(1800, now + duration);

    const gustGain = ctx.createGain();
    gustGain.gain.setValueAtTime(0.001, now);
    gustGain.gain.linearRampToValueAtTime(0.35, now + duration * 0.3);
    gustGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(bp);
    bp.connect(gustGain);
    gustGain.connect(this.sfxGain);

    noise.start(now);
    noise.stop(now + duration + 0.1);
  }

  // =========================================================================
  //  SFX: Muzzle Blast
  // =========================================================================

  /**
   * Ultra-short crack: 0.03s white noise burst through a highpass filter
   * at 2000Hz. Fast decay, snappy transient.
   */
  playMuzzleBlast(): void {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const noiseBuf = this.createNoiseBuffer(0.03);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;

    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = 2000;
    hpf.Q.value = 0.7;

    const blastGain = ctx.createGain();
    blastGain.gain.setValueAtTime(0.5, now);
    blastGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

    noise.connect(hpf);
    hpf.connect(blastGain);
    blastGain.connect(this.sfxGain);

    noise.start(now);
    noise.stop(now + 0.03);
  }

  // =========================================================================
  //  SFX: Surrender
  // =========================================================================

  /**
   * Melancholy bell tone: 800Hz triangle wave with 1.2s exponential decay.
   * Slight detune for character.
   */
  playSurrender(): void {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 800;
    osc.detune.value = (Math.random() - 0.5) * 12; // slight detune for character

    const bellGain = ctx.createGain();
    bellGain.gain.setValueAtTime(0.3, now);
    bellGain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

    osc.connect(bellGain);
    bellGain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 1.25);
  }

  // =========================================================================
  //  SFX: Boss Warning
  // =========================================================================

  /**
   * 2s ominous crescendo: 40Hz sawtooth rising to 60Hz + brown noise swell.
   * Gain ramps from 0.05 to 0.5 over 2s. Lowpass filter at 200Hz.
   */
  playBossWarning(): void {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const duration = 2.0;

    // Sawtooth oscillator rising from 40Hz to 60Hz
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(40, now);
    osc.frequency.linearRampToValueAtTime(60, now + duration);

    // Brown noise swell
    const noiseBuf = this.createBrownNoiseBuffer(duration + 0.1);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.05, now);
    noiseGain.gain.linearRampToValueAtTime(0.5, now + duration);

    // Lowpass filter at 200Hz for both layers
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 200;
    lpf.Q.value = 0.7;

    // Master gain for the warning
    const warnGain = ctx.createGain();
    warnGain.gain.setValueAtTime(0.05, now);
    warnGain.gain.linearRampToValueAtTime(0.5, now + duration);

    // Routing: both sources → lowpass → gain → master
    osc.connect(lpf);
    noise.connect(noiseGain);
    noiseGain.connect(lpf);
    lpf.connect(warnGain);
    warnGain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + duration + 0.1);
    noise.start(now);
    noise.stop(now + duration + 0.1);
  }

  // =========================================================================
  //  SFX: Boss Defeat
  // =========================================================================

  /**
   * Triumphant chord: C4+E4+G4+C5 sine cluster, all hit simultaneously.
   * 1.2s with pseudo-reverb (2 delayed copies at 0.15s and 0.3s, reduced gain).
   * Master gain 0.35.
   */
  playBossDefeat(): void {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const frequencies = [261.63, 329.63, 392, 523.25]; // C4, E4, G4, C5
    const duration = 1.2;

    // Play the chord at 3 time offsets for pseudo-reverb
    const offsets = [0, 0.15, 0.3];
    const gains = [0.35, 0.2, 0.12];

    for (let o = 0; o < offsets.length; o++) {
      const offset = offsets[o];
      const layerGainVal = gains[o];

      const layerGain = ctx.createGain();
      layerGain.gain.value = layerGainVal;
      layerGain.connect(this.sfxGain);

      for (let f = 0; f < frequencies.length; f++) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = frequencies[f];

        const noteGain = ctx.createGain();
        noteGain.gain.setValueAtTime(1.0, now + offset);
        noteGain.gain.exponentialRampToValueAtTime(0.001, now + offset + duration);

        osc.connect(noteGain);
        noteGain.connect(layerGain);

        osc.start(now + offset);
        osc.stop(now + offset + duration + 0.01);
      }
    }
  }

  // =========================================================================
  //  SFX: Port Ambience
  // =========================================================================

  /**
   * Looping port ambience layer:
   * - Gentle wave lapping: brown noise, very low-pass (100Hz), gain 0.08, looping
   * - Seagull cries: random bandpass chirps (1200-2400Hz triangle, 0.15s, Q=5) every 2-5s
   * - Distant crowd murmur: very low brown noise through bandpass 200-600Hz, gain 0.03, looping
   */
  playPortAmbience(): void {
    if (!this.ctx || !this.sfxGain) return;
    if (this.portAmbiencePlaying) return;

    const ctx = this.ctx;
    this.portAmbiencePlaying = true;

    // --- Layer 1: Gentle wave lapping ---
    const waveBuf = this.createBrownNoiseBuffer(4);
    const waveSource = ctx.createBufferSource();
    waveSource.buffer = waveBuf;
    waveSource.loop = true;

    const waveLpf = ctx.createBiquadFilter();
    waveLpf.type = 'lowpass';
    waveLpf.frequency.value = 100;
    waveLpf.Q.value = 0.5;

    const waveGain = ctx.createGain();
    waveGain.gain.value = 0.08;

    waveSource.connect(waveLpf);
    waveLpf.connect(waveGain);
    waveGain.connect(this.sfxGain);
    waveSource.start();

    this.portAmbienceSources.push(waveSource);
    this.portAmbienceGains.push(waveGain);

    // --- Layer 2: Distant crowd murmur ---
    const crowdBuf = this.createBrownNoiseBuffer(4);
    const crowdSource = ctx.createBufferSource();
    crowdSource.buffer = crowdBuf;
    crowdSource.loop = true;

    const crowdBpf = ctx.createBiquadFilter();
    crowdBpf.type = 'bandpass';
    crowdBpf.frequency.value = 400; // center between 200-600Hz
    crowdBpf.Q.value = 0.5;

    const crowdGain = ctx.createGain();
    crowdGain.gain.value = 0.03;

    crowdSource.connect(crowdBpf);
    crowdBpf.connect(crowdGain);
    crowdGain.connect(this.sfxGain);
    crowdSource.start();

    this.portAmbienceSources.push(crowdSource);
    this.portAmbienceGains.push(crowdGain);

    // --- Layer 3: Seagull cries (scheduled randomly) ---
    const scheduleSeagull = () => {
      if (!this.portAmbiencePlaying || !this.ctx || !this.sfxGain) return;

      const now2 = this.ctx.currentTime;
      const freq = 1200 + Math.random() * 1200; // 1200-2400Hz

      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now2);
      osc.frequency.linearRampToValueAtTime(freq * 0.7, now2 + 0.15);

      const bpf = this.ctx.createBiquadFilter();
      bpf.type = 'bandpass';
      bpf.frequency.value = freq;
      bpf.Q.value = 5;

      const gullGain = this.ctx.createGain();
      gullGain.gain.setValueAtTime(0, now2);
      gullGain.gain.linearRampToValueAtTime(0.12, now2 + 0.02);
      gullGain.gain.exponentialRampToValueAtTime(0.001, now2 + 0.15);

      osc.connect(bpf);
      bpf.connect(gullGain);
      gullGain.connect(this.sfxGain!);

      osc.start(now2);
      osc.stop(now2 + 0.18);

      // Schedule next seagull in 2-5 seconds
      const nextDelay = 2000 + Math.random() * 3000;
      this.portSeagullTimeoutId = window.setTimeout(scheduleSeagull, nextDelay);
    };

    // Start first seagull after a short delay
    const firstDelay = 1000 + Math.random() * 2000;
    this.portSeagullTimeoutId = window.setTimeout(scheduleSeagull, firstDelay);
  }

  /** Stop all port ambience nodes and clear the seagull timeout. */
  stopPortAmbience(): void {
    this.portAmbiencePlaying = false;

    // Stop all buffer sources
    for (const source of this.portAmbienceSources) {
      try { source.stop(); } catch { /* already stopped */ }
    }
    this.portAmbienceSources = [];
    this.portAmbienceGains = [];

    // Stop any oscillators
    for (const osc of this.portAmbienceOscillators) {
      try { osc.stop(); } catch { /* already stopped */ }
    }
    this.portAmbienceOscillators = [];

    // Clear seagull timeout
    if (this.portSeagullTimeoutId !== null) {
      clearTimeout(this.portSeagullTimeoutId);
      this.portSeagullTimeoutId = null;
    }
  }

  // =========================================================================
  //  SFX: Purchase (Cha-ching)
  // =========================================================================

  /**
   * Metallic cha-ching: high triangle wave burst at 2400Hz (0.05s)
   * + delayed echo at 0.08s (same but quieter). Gain 0.4.
   */
  playPurchase(): void {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const purchaseGain = ctx.createGain();
    purchaseGain.gain.value = 0.4;
    purchaseGain.connect(this.sfxGain);

    // First ching
    const osc1 = ctx.createOscillator();
    osc1.type = 'triangle';
    osc1.frequency.value = 2400;
    const g1 = ctx.createGain();
    g1.gain.setValueAtTime(1.0, now);
    g1.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc1.connect(g1);
    g1.connect(purchaseGain);
    osc1.start(now);
    osc1.stop(now + 0.06);

    // Delayed echo (quieter)
    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.value = 2400;
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.5, now + 0.08);
    g2.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc2.connect(g2);
    g2.connect(purchaseGain);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.14);
  }

  // =========================================================================
  //  SFX: Lightning Crack
  // =========================================================================

  /**
   * Sharp 0.02s white noise transient through a highshelf (+8dB at 4000Hz).
   * Gain 0.8. Very different from thunder (which is long and rumbly).
   */
  playLightningCrack(): void {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const noiseBuf = this.createNoiseBuffer(0.02);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;

    const shelf = ctx.createBiquadFilter();
    shelf.type = 'highshelf';
    shelf.frequency.value = 4000;
    shelf.gain.value = 8;

    const crackGain = ctx.createGain();
    crackGain.gain.setValueAtTime(0.8, now);
    crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);

    noise.connect(shelf);
    shelf.connect(crackGain);
    crackGain.connect(this.sfxGain);

    noise.start(now);
    noise.stop(now + 0.02);
  }

  // =========================================================================
  //  SFX: Wave Complete
  // =========================================================================

  /**
   * Ascending 3-note major arpeggio: D5(587.33), F#5(739.99), A5(880).
   * Each note 0.12s apart, 0.2s duration. Gain 0.3. Quick and celebratory.
   */
  playWaveComplete(): void {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const notes = [587.33, 739.99, 880]; // D5, F#5, A5
    const noteSpacing = 0.12;
    const noteDuration = 0.2;

    const arpGain = ctx.createGain();
    arpGain.gain.value = 0.3;
    arpGain.connect(this.sfxGain);

    for (let i = 0; i < notes.length; i++) {
      const t = now + i * noteSpacing;
      const freq = notes[i];

      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;

      const noteGain = ctx.createGain();
      noteGain.gain.setValueAtTime(0, t);
      noteGain.gain.linearRampToValueAtTime(0.8, t + 0.01);
      noteGain.gain.exponentialRampToValueAtTime(0.001, t + noteDuration);

      osc.connect(noteGain);
      noteGain.connect(arpGain);

      osc.start(t);
      osc.stop(t + noteDuration + 0.01);
    }
  }

  // =========================================================================
  //  SFX: Kraken Rumble
  // =========================================================================

  /**
   * Deep 40Hz modulated growl, 2s duration.
   * Base: sine at 40Hz, gain 0.6
   * Modulator: sine at 3Hz modulating the gain for growl effect
   * Brown noise layer through 80Hz lowpass, gain 0.3
   * Envelope: attack 0.1s, sustain 1.5s, decay 0.4s
   */
  playKrakenRumble(): void {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const duration = 2.0;

    // Master envelope for the whole effect
    const envGain = ctx.createGain();
    envGain.gain.setValueAtTime(0.001, now);
    // Attack 0.1s
    envGain.gain.linearRampToValueAtTime(1.0, now + 0.1);
    // Sustain until 1.6s
    envGain.gain.setValueAtTime(1.0, now + 1.6);
    // Decay 0.4s
    envGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    envGain.connect(this.sfxGain);

    // --- Layer 1: Base sine at 40Hz with gain modulation ---
    const baseOsc = ctx.createOscillator();
    baseOsc.type = 'sine';
    baseOsc.frequency.value = 40;

    const baseGain = ctx.createGain();
    baseGain.gain.value = 0.6;

    // Modulator: 3Hz sine modulates the baseGain for growl
    const modOsc = ctx.createOscillator();
    modOsc.type = 'sine';
    modOsc.frequency.value = 3;

    const modGain = ctx.createGain();
    modGain.gain.value = 0.3; // modulation depth

    modOsc.connect(modGain);
    modGain.connect(baseGain.gain);

    baseOsc.connect(baseGain);
    baseGain.connect(envGain);

    // --- Layer 2: Brown noise through 80Hz lowpass ---
    const noiseBuf = this.createBrownNoiseBuffer(duration + 0.1);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;

    const noiseLpf = ctx.createBiquadFilter();
    noiseLpf.type = 'lowpass';
    noiseLpf.frequency.value = 80;
    noiseLpf.Q.value = 0.7;

    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.3;

    noise.connect(noiseLpf);
    noiseLpf.connect(noiseGain);
    noiseGain.connect(envGain);

    // Start and stop all nodes
    baseOsc.start(now);
    baseOsc.stop(now + duration + 0.1);
    modOsc.start(now);
    modOsc.stop(now + duration + 0.1);
    noise.start(now);
    noise.stop(now + duration + 0.1);
  }

  // =========================================================================
  //  SFX: Ghost Ship Eerie
  // =========================================================================

  /**
   * Theremin-like high whistle, 3s duration.
   * Triangle wave sweeping 800Hz -> 1200Hz -> 600Hz over 3s.
   * Second triangle at +7Hz detune for beat frequency.
   * Gain 0.15, slow attack 0.5s, exponential decay.
   */
  playGhostShipEerie(): void {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const duration = 3.0;

    // Main oscillator: triangle wave with frequency sweep
    const osc1 = ctx.createOscillator();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(800, now);
    osc1.frequency.linearRampToValueAtTime(1200, now + 1.5);
    osc1.frequency.linearRampToValueAtTime(600, now + duration);

    // Second oscillator: +7Hz detune for eerie beat frequency
    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(807, now);
    osc2.frequency.linearRampToValueAtTime(1207, now + 1.5);
    osc2.frequency.linearRampToValueAtTime(607, now + duration);

    // Envelope: slow attack 0.5s, then exponential decay
    const eerieGain = ctx.createGain();
    eerieGain.gain.setValueAtTime(0.001, now);
    eerieGain.gain.linearRampToValueAtTime(0.15, now + 0.5);
    eerieGain.gain.setValueAtTime(0.15, now + 1.0);
    eerieGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc1.connect(eerieGain);
    osc2.connect(eerieGain);
    eerieGain.connect(this.sfxGain);

    osc1.start(now);
    osc1.stop(now + duration + 0.1);
    osc2.start(now);
    osc2.stop(now + duration + 0.1);
  }

  // =========================================================================
  //  SFX: Serpent Hiss
  // =========================================================================

  /**
   * Bandpass noise sweep 400->1200Hz, 0.5s.
   * White noise through bandpass filter.
   * Center frequency sweeps 400 -> 1200Hz over 0.5s.
   * Q = 3 for narrow hiss character.
   * Gain 0.4, fast attack, 0.5s duration.
   */
  playSerpentHiss(): void {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const duration = 0.5;

    const noiseBuf = this.createNoiseBuffer(duration + 0.05);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;

    // Bandpass filter with sweeping center frequency
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 3;
    bp.frequency.setValueAtTime(400, now);
    bp.frequency.exponentialRampToValueAtTime(1200, now + duration);

    // Envelope: fast attack, full duration
    const hissGain = ctx.createGain();
    hissGain.gain.setValueAtTime(0.001, now);
    hissGain.gain.linearRampToValueAtTime(0.4, now + 0.02);
    hissGain.gain.setValueAtTime(0.4, now + duration * 0.6);
    hissGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(bp);
    bp.connect(hissGain);
    hissGain.connect(this.sfxGain);

    noise.start(now);
    noise.stop(now + duration + 0.05);
  }

  // =========================================================================
  //  SFX: Whirlpool Swirl (continuous, stoppable)
  // =========================================================================

  /**
   * Low-freq rotation, continuous loop.
   * Returns { stop: () => void } so caller can stop it.
   * Oscillator at 60Hz, amplitude modulated by 0.5Hz LFO.
   * Creates a "whooshing rotation" feel. Gain 0.15.
   */
  playWhirlpoolSwirl(): { stop: () => void } {
    const noop = { stop: () => {} };
    if (!this.ctx || !this.sfxGain) return noop;
    const ctx = this.ctx;

    // Main oscillator at 60Hz
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 60;

    // LFO at 0.5Hz for amplitude modulation (rotation feel)
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.5;

    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.08; // modulation depth

    // Base gain for the swirl
    const swirlGain = ctx.createGain();
    swirlGain.gain.value = 0.15;

    // LFO modulates the swirl gain
    lfo.connect(lfoGain);
    lfoGain.connect(swirlGain.gain);

    osc.connect(swirlGain);
    swirlGain.connect(this.sfxGain);

    osc.start();
    lfo.start();

    return {
      stop: () => {
        try { osc.stop(); } catch { /* already stopped */ }
        try { lfo.stop(); } catch { /* already stopped */ }
      }
    };
  }

  // =========================================================================
  //  SFX: Treasure Dig
  // =========================================================================

  /**
   * 3 thuds + metallic ring, 1s total.
   * 3 low thuds (80Hz sine, 0.05s each) at 0.0s, 0.25s, 0.5s
   * Metallic ring at 0.7s: 1200Hz triangle + 1800Hz sine, 0.3s decay
   * Gain 0.5.
   */
  playTreasureDig(): void {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const digGain = ctx.createGain();
    digGain.gain.value = 0.5;
    digGain.connect(this.sfxGain);

    // --- 3 low thuds at 0.0s, 0.25s, 0.5s ---
    const thudTimes = [0, 0.25, 0.5];
    for (const offset of thudTimes) {
      const t = now + offset;

      const thudOsc = ctx.createOscillator();
      thudOsc.type = 'sine';
      thudOsc.frequency.value = 80;

      const thudGain = ctx.createGain();
      thudGain.gain.setValueAtTime(0.8, t);
      thudGain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);

      thudOsc.connect(thudGain);
      thudGain.connect(digGain);

      thudOsc.start(t);
      thudOsc.stop(t + 0.06);
    }

    // --- Metallic ring at 0.7s ---
    const ringTime = now + 0.7;

    // Triangle at 1200Hz
    const ringOsc1 = ctx.createOscillator();
    ringOsc1.type = 'triangle';
    ringOsc1.frequency.value = 1200;

    const ringGain1 = ctx.createGain();
    ringGain1.gain.setValueAtTime(0.6, ringTime);
    ringGain1.gain.exponentialRampToValueAtTime(0.001, ringTime + 0.3);

    ringOsc1.connect(ringGain1);
    ringGain1.connect(digGain);

    ringOsc1.start(ringTime);
    ringOsc1.stop(ringTime + 0.31);

    // Sine at 1800Hz
    const ringOsc2 = ctx.createOscillator();
    ringOsc2.type = 'sine';
    ringOsc2.frequency.value = 1800;

    const ringGain2 = ctx.createGain();
    ringGain2.gain.setValueAtTime(0.4, ringTime);
    ringGain2.gain.exponentialRampToValueAtTime(0.001, ringTime + 0.3);

    ringOsc2.connect(ringGain2);
    ringGain2.connect(digGain);

    ringOsc2.start(ringTime);
    ringOsc2.stop(ringTime + 0.31);
  }

  // =========================================================================
  //  SFX: Victory Fanfare
  // =========================================================================

  /**
   * C-F-G-C major chord progression, 3s total.
   * 4 chords: C major, F major, G major, C major high.
   * Triangle waves with pseudo-reverb (delayed copies at 0.1s, 0.2s).
   * Gain 0.35, final chord held longer (1.2s).
   */
  playVictoryFanfare(): void {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const chords: number[][] = [
      [261.63, 329.63, 392],       // C major: C4, E4, G4
      [349.23, 440, 523.25],       // F major: F4, A4, C5
      [392, 493.88, 587.33],       // G major: G4, B4, D5
      [523.25, 659.25, 783.99],    // C major high: C5, E5, G5
    ];

    const chordDurations = [0.7, 0.7, 0.7, 1.2]; // last chord held longer
    const chordStarts = [0, 0.7, 1.4, 2.1];

    // Pseudo-reverb: play each chord at 3 time offsets
    const reverbOffsets = [0, 0.1, 0.2];
    const reverbGains = [0.35, 0.18, 0.10];

    for (let c = 0; c < chords.length; c++) {
      const chord = chords[c];
      const chordStart = now + chordStarts[c];
      const chordDur = chordDurations[c];

      for (let r = 0; r < reverbOffsets.length; r++) {
        const offset = reverbOffsets[r];
        const layerGainVal = reverbGains[r];

        const layerGain = ctx.createGain();
        layerGain.gain.value = layerGainVal;
        layerGain.connect(this.sfxGain);

        for (const freq of chord) {
          const osc = ctx.createOscillator();
          osc.type = 'triangle';
          osc.frequency.value = freq;

          const noteGain = ctx.createGain();
          noteGain.gain.setValueAtTime(0.8, chordStart + offset);
          noteGain.gain.exponentialRampToValueAtTime(0.001, chordStart + offset + chordDur);

          osc.connect(noteGain);
          noteGain.connect(layerGain);

          osc.start(chordStart + offset);
          osc.stop(chordStart + offset + chordDur + 0.01);
        }
      }
    }
  }

  // =========================================================================
  //  SFX: Event Warning
  // =========================================================================

  /**
   * Rising alarm tone, 1s total.
   * Sawtooth wave sweeping 200Hz -> 800Hz over 0.5s, repeated 2x.
   * Through bandpass at 500Hz, Q=2. Gain 0.3.
   */
  playEventWarning(): void {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const alarmGain = ctx.createGain();
    alarmGain.gain.value = 0.3;
    alarmGain.connect(this.sfxGain);

    // Two sweeps, each 0.5s
    for (let s = 0; s < 2; s++) {
      const sweepStart = now + s * 0.5;

      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(200, sweepStart);
      osc.frequency.exponentialRampToValueAtTime(800, sweepStart + 0.5);

      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 500;
      bp.Q.value = 2;

      const sweepGain = ctx.createGain();
      sweepGain.gain.setValueAtTime(0.001, sweepStart);
      sweepGain.gain.linearRampToValueAtTime(0.8, sweepStart + 0.05);
      sweepGain.gain.setValueAtTime(0.8, sweepStart + 0.4);
      sweepGain.gain.exponentialRampToValueAtTime(0.001, sweepStart + 0.5);

      osc.connect(bp);
      bp.connect(sweepGain);
      sweepGain.connect(alarmGain);

      osc.start(sweepStart);
      osc.stop(sweepStart + 0.51);
    }
  }

  // =========================================================================
  //  SFX: Ship Select Hover
  // =========================================================================

  /**
   * Click sound, 0.03s duration.
   * White noise burst through highpass 3000Hz. Gain 0.2.
   */
  playShipSelectHover(): void {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const noiseBuf = this.createNoiseBuffer(0.03);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;

    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = 3000;
    hpf.Q.value = 0.7;

    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(0.2, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

    noise.connect(hpf);
    hpf.connect(clickGain);
    clickGain.connect(this.sfxGain);

    noise.start(now);
    noise.stop(now + 0.03);
  }

  // =========================================================================
  //  SFX: Ship Select Confirm
  // =========================================================================

  /**
   * Bell tone, 0.5s duration.
   * Triangle at 1000Hz + sine at 1500Hz.
   * Sharp attack, 0.5s exponential decay. Gain 0.3.
   */
  playShipSelectConfirm(): void {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const confirmGain = ctx.createGain();
    confirmGain.gain.value = 0.3;
    confirmGain.connect(this.sfxGain);

    // Triangle at 1000Hz
    const osc1 = ctx.createOscillator();
    osc1.type = 'triangle';
    osc1.frequency.value = 1000;

    const g1 = ctx.createGain();
    g1.gain.setValueAtTime(0.8, now);
    g1.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    osc1.connect(g1);
    g1.connect(confirmGain);

    // Sine at 1500Hz
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 1500;

    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.6, now);
    g2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    osc2.connect(g2);
    g2.connect(confirmGain);

    osc1.start(now);
    osc1.stop(now + 0.51);
    osc2.start(now);
    osc2.stop(now + 0.51);
  }

  // =========================================================================
  //  SFX: Crew Hire
  // =========================================================================

  /**
   * Cheerful chord sting, 0.5s duration.
   * G4(392) + B4(493.88) + D5(587.33) simultaneous.
   * Triangle waves, 0.5s with fast attack. Gain 0.3.
   */
  playCrewHire(): void {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const hireGain = ctx.createGain();
    hireGain.gain.value = 0.3;
    hireGain.connect(this.sfxGain);

    const frequencies = [392, 493.88, 587.33]; // G4, B4, D5

    for (const freq of frequencies) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;

      const noteGain = ctx.createGain();
      noteGain.gain.setValueAtTime(0.001, now);
      noteGain.gain.linearRampToValueAtTime(0.7, now + 0.01);
      noteGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

      osc.connect(noteGain);
      noteGain.connect(hireGain);

      osc.start(now);
      osc.stop(now + 0.51);
    }
  }

  // =========================================================================
  //  SFX: Chain Shot Hit (metallic clang)
  // =========================================================================

  /**
   * Metallic clang: triangle wave 600→200Hz pitch drop + short noise burst
   * through bandpass. ~0.15s.
   */
  playChainHit(): void {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const chainGain = ctx.createGain();
    chainGain.gain.value = 0.4;
    chainGain.connect(this.sfxGain);

    // Triangle wave pitch drop 600→200Hz
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.12);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.7, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(oscGain);
    oscGain.connect(chainGain);
    osc.start(now);
    osc.stop(now + 0.16);

    // Short noise burst through bandpass for metallic texture
    const noiseBuf = this.createNoiseBuffer(0.06);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2500;
    bp.Q.value = 3;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.5, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    noise.connect(bp);
    bp.connect(noiseGain);
    noiseGain.connect(chainGain);
    noise.start(now);
    noise.stop(now + 0.07);
  }

  // =========================================================================
  //  SFX: Dodge (ethereal whoosh)
  // =========================================================================

  /**
   * Quick ethereal whoosh: filtered white noise sweep (high→low)
   * + sine 1200Hz blip. ~0.12s.
   */
  playDodge(): void {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const dodgeGain = ctx.createGain();
    dodgeGain.gain.value = 0.35;
    dodgeGain.connect(this.sfxGain);

    // Noise sweep high→low
    const noiseBuf = this.createNoiseBuffer(0.12);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.5;
    bp.frequency.setValueAtTime(4000, now);
    bp.frequency.exponentialRampToValueAtTime(800, now + 0.1);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.6, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    noise.connect(bp);
    bp.connect(noiseGain);
    noiseGain.connect(dodgeGain);
    noise.start(now);
    noise.stop(now + 0.13);

    // High sine blip
    const blip = ctx.createOscillator();
    blip.type = 'sine';
    blip.frequency.value = 1200;

    const blipGain = ctx.createGain();
    blipGain.gain.setValueAtTime(0.4, now);
    blipGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    blip.connect(blipGain);
    blipGain.connect(dodgeGain);
    blip.start(now);
    blip.stop(now + 0.09);
  }

  // =========================================================================
  //  SFX: Phoenix Revive (rising triumphant chord)
  // =========================================================================

  /**
   * Rising triumphant chord: C6→E6→G6 triangle arpeggio + shimmer noise. ~0.5s.
   */
  playPhoenixRevive(): void {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const phoenixGain = ctx.createGain();
    phoenixGain.gain.value = 0.4;
    phoenixGain.connect(this.sfxGain);

    // Rising arpeggio: C6, E6, G6
    const notes = [1046.50, 1318.51, 1567.98];
    const spacing = 0.12;
    for (let i = 0; i < notes.length; i++) {
      const t = now + i * spacing;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = notes[i];

      const noteGain = ctx.createGain();
      noteGain.gain.setValueAtTime(0, t);
      noteGain.gain.linearRampToValueAtTime(0.7, t + 0.01);
      noteGain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

      osc.connect(noteGain);
      noteGain.connect(phoenixGain);
      osc.start(t);
      osc.stop(t + 0.36);
    }

    // Shimmer noise layer
    const noiseBuf = this.createNoiseBuffer(0.5);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;

    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = 3000;

    const shimmerGain = ctx.createGain();
    shimmerGain.gain.setValueAtTime(0.001, now);
    shimmerGain.gain.linearRampToValueAtTime(0.15, now + 0.15);
    shimmerGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    noise.connect(hpf);
    hpf.connect(shimmerGain);
    shimmerGain.connect(phoenixGain);
    noise.start(now);
    noise.stop(now + 0.51);
  }

  // =========================================================================
  //  SFX: War Drums Beat
  // =========================================================================

  /**
   * Deep drum: sine 60Hz + noise transient, short decay. ~0.3s.
   */
  playWarDrumsBeat(): void {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const drumGain = ctx.createGain();
    drumGain.gain.value = 0.3;
    drumGain.connect(this.sfxGain);

    // Deep sine body
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(60, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.25);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.8, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    osc.connect(oscGain);
    oscGain.connect(drumGain);
    osc.start(now);
    osc.stop(now + 0.31);

    // Noise transient for attack
    const noiseBuf = this.createNoiseBuffer(0.04);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;

    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 300;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.6, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    noise.connect(lpf);
    lpf.connect(noiseGain);
    noiseGain.connect(drumGain);
    noise.start(now);
    noise.stop(now + 0.05);
  }

  // =========================================================================
  //  SFX: Grapeshot Split (ricochet scatter)
  // =========================================================================

  /**
   * Ricochet scatter: 3 rapid noise bursts at 0.04s intervals,
   * descending pitch. ~0.15s.
   */
  playGrapeshotSplit(): void {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const splitGain = ctx.createGain();
    splitGain.gain.value = 0.3;
    splitGain.connect(this.sfxGain);

    const freqs = [3500, 2500, 1500];
    for (let i = 0; i < 3; i++) {
      const t = now + i * 0.04;

      const noiseBuf = this.createNoiseBuffer(0.035);
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuf;

      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = freqs[i];
      bp.Q.value = 4;

      const burstGain = ctx.createGain();
      burstGain.gain.setValueAtTime(0.7 - i * 0.15, t);
      burstGain.gain.exponentialRampToValueAtTime(0.001, t + 0.035);

      noise.connect(bp);
      bp.connect(burstGain);
      burstGain.connect(splitGain);
      noise.start(t);
      noise.stop(t + 0.04);
    }
  }

  // =========================================================================
  //  SFX: Neptune's Charge (progressive hum)
  // =========================================================================

  /**
   * Progressive hum: sine wave at 200+(level×150)Hz, gain scales with level.
   * level 0-4 (0=first shot, 4=about to AoE). ~0.08s.
   */
  playNeptuneCharge(level: number): void {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const clampedLevel = Math.max(0, Math.min(4, level));
    const freq = 200 + clampedLevel * 150;
    const vol = 0.1 + clampedLevel * 0.08;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;

    const chargeGain = ctx.createGain();
    chargeGain.gain.setValueAtTime(vol, now);
    chargeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(chargeGain);
    chargeGain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  // =========================================================================
  //  MUSIC MODE: Boss Mode
  // =========================================================================

  /**
   * Toggle boss mode for music. When active, shanty plays at 182 BPM
   * using A minor pentatonic scale. When deactivated, reverts to normal.
   */
  setBossMode(active: boolean): void {
    if (this.bossMode === active) return;
    this.bossMode = active;

    // Restart the shanty loop to pick up the new mode immediately
    if (this.musicPlaying && this.ctx) {
      if (this.musicTimeoutId !== null) {
        clearTimeout(this.musicTimeoutId);
        this.musicTimeoutId = null;
      }
      this.scheduleShantyBar(0);
    }
  }

  // =========================================================================
  //  MUSIC MODE: Port Mode
  // =========================================================================

  /**
   * Toggle port mode for music. When active, music gain drops to 0.06,
   * tempo slows to 100 BPM, D major with triangle wave. When deactivated,
   * reverts to normal gain and tempo.
   */
  setPortMode(active: boolean): void {
    if (this.portMode === active) return;
    this.portMode = active;

    if (!this.ctx || !this.musicGain) return;
    const now = this.ctx.currentTime;

    if (active) {
      this.musicGain.gain.linearRampToValueAtTime(0.06, now + 0.3);
    } else {
      this.musicGain.gain.linearRampToValueAtTime(0.08, now + 0.3);
    }

    // Restart the shanty loop to pick up the new mode immediately
    if (this.musicPlaying) {
      if (this.musicTimeoutId !== null) {
        clearTimeout(this.musicTimeoutId);
        this.musicTimeoutId = null;
      }
      this.scheduleShantyBar(0);
    }
  }

  // =========================================================================
  //  MUSIC MODE: Event Mode
  // =========================================================================

  /**
   * Switch music to tense/eerie variant for special events.
   * - 'kraken': Lower tempo (120 BPM), A minor, heavy bass
   * - 'ghost_ship_event': Very slow (80 BPM), whole-tone scale, ethereal
   * - 'sea_serpent': Fast (160 BPM), chromatic tension
   * - null: Return to normal mode
   * Restarts shanty loop like bossMode does.
   */
  setEventMode(type: EventType | null): void {
    if (this.eventMode === type) return;
    this.eventMode = type;

    // Restart the shanty loop to pick up the new mode immediately
    if (this.musicPlaying && this.ctx) {
      if (this.musicTimeoutId !== null) {
        clearTimeout(this.musicTimeoutId);
        this.musicTimeoutId = null;
      }
      this.scheduleShantyBar(0);
    }
  }

  // =========================================================================
  //  DYNAMIC: Weather Intensity
  // =========================================================================

  /**
   * 0 = calm seas, 1 = full storm.
   * Adjusts wind volume, ocean volume, and storm rumble.
   */
  setWeatherIntensity(intensity: number): void {
    this.weatherIntensity = Math.min(Math.max(intensity, 0), 1);

    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const ramp = 0.5; // smooth transition

    // Wind gets louder and wider in storms
    if (this.windGain) {
      const windVol = 0.05 + this.weatherIntensity * 0.3;
      this.windGain.gain.linearRampToValueAtTime(windVol, now + ramp);
    }
    if (this.windFilter) {
      // Widen the bandpass in storms
      const q = 0.8 - this.weatherIntensity * 0.4;
      this.windFilter.Q.linearRampToValueAtTime(Math.max(q, 0.2), now + ramp);
    }

    // Ocean swells grow larger and louder
    if (this.oceanGain) {
      const oceanVol = 0.12 + this.weatherIntensity * 0.2;
      this.oceanGain.gain.linearRampToValueAtTime(oceanVol, now + ramp);
    }
    if (this.oceanLfoGain) {
      // Deeper modulation in storms
      const depth = 0.04 + this.weatherIntensity * 0.12;
      this.oceanLfoGain.gain.linearRampToValueAtTime(depth, now + ramp);
    }
    if (this.oceanLfo) {
      // Faster swells in storms
      const rate = 0.1 + this.weatherIntensity * 0.15;
      this.oceanLfo.frequency.linearRampToValueAtTime(rate, now + ramp);
    }

    // Storm rumble fades in above 0.3 intensity
    if (this.stormRumbleGain) {
      const rumbleVol = Math.max(0, (this.weatherIntensity - 0.3) / 0.7) * 0.12;
      this.stormRumbleGain.gain.linearRampToValueAtTime(rumbleVol, now + ramp);
    }
    if (this.stormRumbleOsc) {
      // Pitch drops as storm intensifies
      const freq = 45 - this.weatherIntensity * 15;
      this.stormRumbleOsc.frequency.linearRampToValueAtTime(freq, now + ramp);
    }
  }

  // =========================================================================
  //  DYNAMIC: Ship Speed
  // =========================================================================

  /**
   * 0 = stationary, 1 = full speed.
   * Adjusts wind pitch and volume to reflect movement.
   */
  setSpeedFactor(speed: number): void {
    this.speedFactor = Math.min(Math.max(speed, 0), 1);

    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const ramp = 0.3;

    if (this.windFilter) {
      // Higher speed → higher wind pitch center
      const center = 1200 + this.speedFactor * 1400;
      this.windFilter.frequency.linearRampToValueAtTime(center, now + ramp);
    }
    if (this.windGain) {
      // Speed adds volume on top of weather intensity
      const weatherBase = 0.05 + this.weatherIntensity * 0.3;
      const speedBoost = this.speedFactor * 0.1;
      this.windGain.gain.linearRampToValueAtTime(weatherBase + speedBoost, now + ramp);
    }
  }

  // =========================================================================
  //  DYNAMIC: Wind Intensity (direct control)
  // =========================================================================

  /** Set wind layer intensity directly (0–1). */
  setWindIntensity(intensity: number): void {
    this.windBaseIntensity = Math.min(Math.max(intensity, 0), 1);
    if (this.windGain && this.ctx) {
      const vol = 0.03 + this.windBaseIntensity * 0.25;
      this.windGain.gain.linearRampToValueAtTime(vol, this.ctx.currentTime + 0.3);
    }
  }

  // =========================================================================
  //  VOLUME / MUTE
  // =========================================================================

  /** Toggle mute state. Returns the new muted state. */
  toggleMute(): boolean {
    if (!this.master || !this.ctx) return this.muted;

    this.muted = !this.muted;
    const now = this.ctx.currentTime;

    if (this.muted) {
      this.previousVolume = this.master.gain.value;
      this.master.gain.linearRampToValueAtTime(0, now + 0.05);
    } else {
      this.master.gain.linearRampToValueAtTime(this.previousVolume, now + 0.05);
    }

    return this.muted;
  }

  /** Get current mute state. */
  isMuted(): boolean {
    return this.muted;
  }

  /** Set master volume (0–1). */
  setVolume(vol: number): void {
    if (!this.master || !this.ctx) return;
    const v = Math.min(Math.max(vol, 0), 1);
    this.master.gain.linearRampToValueAtTime(v, this.ctx.currentTime + 0.05);
    if (!this.muted) {
      this.previousVolume = v;
    }
  }

  // =========================================================================
  //  VOLUME CONTROL: Separate buses
  // =========================================================================

  /** Set master volume (0–1). Alias with getter support. */
  setMasterVolume(vol: number): void {
    this.setVolume(vol);
  }

  /** Set music volume (0–1). Controls the music bus gain. */
  setMusicVolume(vol: number): void {
    this.musicVolume = Math.min(Math.max(vol, 0), 1);
    if (this.musicGainNode && this.ctx) {
      this.musicGainNode.gain.linearRampToValueAtTime(this.musicVolume, this.ctx.currentTime + 0.05);
    }
  }

  /** Set SFX volume (0–1). Controls the SFX bus gain. */
  setSfxVolume(vol: number): void {
    this.sfxVolume = Math.min(Math.max(vol, 0), 1);
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.linearRampToValueAtTime(this.sfxVolume, this.ctx.currentTime + 0.05);
    }
  }

  /** Get current master volume (0–1). */
  getMasterVolume(): number {
    if (this.master) {
      return this.master.gain.value;
    }
    return this.previousVolume;
  }

  /** Get current music volume (0–1). */
  getMusicVolume(): number {
    return this.musicVolume;
  }

  /** Get current SFX volume (0–1). */
  getSfxVolume(): number {
    return this.sfxVolume;
  }

  // =========================================================================
  //  CLEANUP
  // =========================================================================

  /** Stop all audio and release resources. */
  dispose(): void {
    this.musicPlaying = false;
    if (this.musicTimeoutId !== null) {
      clearTimeout(this.musicTimeoutId);
      this.musicTimeoutId = null;
    }

    // Stop port ambience if playing
    this.stopPortAmbience();

    // Stop ambient sources
    try { this.oceanSource?.stop(); } catch { /* already stopped */ }
    try { this.oceanLfo?.stop(); } catch { /* already stopped */ }
    try { this.windSource?.stop(); } catch { /* already stopped */ }
    try { this.stormRumbleOsc?.stop(); } catch { /* already stopped */ }

    if (this.ctx && this.ctx.state !== 'closed') {
      this.ctx.close();
    }

    this.initialized = false;
    console.log('[Audio] Disposed. Silence falls upon the seas.');
  }
}

// ============================================================================
//  Singleton export — import { audio } from './Audio';
// ============================================================================
export const audio = new Audio();
export type { Audio };
