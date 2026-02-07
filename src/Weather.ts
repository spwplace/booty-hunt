import * as THREE from 'three';

// ===================================================================
//  Types
// ===================================================================

export type WeatherState = 'clear' | 'foggy' | 'stormy' | 'night';

export interface WeatherConfig {
  fogDensity: number;
  fogColor: THREE.Color;
  skyTop: THREE.Color;
  skyMid: THREE.Color;
  skyHorizon: THREE.Color;
  sunDirection: THREE.Vector3;
  sunIntensity: number;
  sunColor: THREE.Color;
  ambientIntensity: number;
  ambientColor: THREE.Color;
  waveScale: number;
  rainIntensity: number;
  lightningChance: number;
  windIntensity: number;
}

export interface WeatherUpdateResult {
  lightning: boolean;
  thunderDelay: number;
  config: WeatherConfig;
}

interface WeatherTargets {
  fog: THREE.FogExp2;
  sunLight: THREE.DirectionalLight;
  ambientLight: THREE.AmbientLight;
  skyMaterial: THREE.ShaderMaterial;
  oceanMaterial: THREE.ShaderMaterial;
}

// ===================================================================
//  State presets -- each one a distinct world
// ===================================================================

function cloneConfig(c: WeatherConfig): WeatherConfig {
  return {
    fogDensity: c.fogDensity,
    fogColor: c.fogColor.clone(),
    skyTop: c.skyTop.clone(),
    skyMid: c.skyMid.clone(),
    skyHorizon: c.skyHorizon.clone(),
    sunDirection: c.sunDirection.clone(),
    sunIntensity: c.sunIntensity,
    sunColor: c.sunColor.clone(),
    ambientIntensity: c.ambientIntensity,
    ambientColor: c.ambientColor.clone(),
    waveScale: c.waveScale,
    rainIntensity: c.rainIntensity,
    lightningChance: c.lightningChance,
    windIntensity: c.windIntensity,
  };
}

const WEATHER_CONFIGS: Record<WeatherState, WeatherConfig> = {
  // ------------------------------------------------------------------
  //  CLEAR -- golden sunset, warm and inviting
  // ------------------------------------------------------------------
  clear: {
    fogDensity: 0.008,
    fogColor: new THREE.Color(0x1e1828),
    skyTop: new THREE.Color(0x03030a),
    skyMid: new THREE.Color(0x100618),
    skyHorizon: new THREE.Color(0x552615),
    sunDirection: new THREE.Vector3(0.4, 0.12, 0.3).normalize(),
    sunIntensity: 2.8,
    sunColor: new THREE.Color(0xffeecc),
    ambientIntensity: 0.55,
    ambientColor: new THREE.Color(0x334466),
    waveScale: 1.0,
    rainIntensity: 0,
    lightningChance: 0,
    windIntensity: 0.3,
  },

  // ------------------------------------------------------------------
  //  FOGGY -- thick, ghostly, swallowed by the sea
  // ------------------------------------------------------------------
  foggy: {
    fogDensity: 0.028,
    fogColor: new THREE.Color(0x556666),
    skyTop: new THREE.Color(0x334444),
    skyMid: new THREE.Color(0x445555),
    skyHorizon: new THREE.Color(0x667777),
    sunDirection: new THREE.Vector3(0.2, 0.4, 0.1).normalize(),
    sunIntensity: 1.0,
    sunColor: new THREE.Color(0xccccbb),
    ambientIntensity: 0.7,
    ambientColor: new THREE.Color(0x556666),
    waveScale: 0.75,
    rainIntensity: 0,
    lightningChance: 0,
    windIntensity: 0.15,
  },

  // ------------------------------------------------------------------
  //  STORMY -- violent darkness, the ocean wants you dead
  // ------------------------------------------------------------------
  stormy: {
    fogDensity: 0.016,
    fogColor: new THREE.Color(0x0a0c14),
    skyTop: new THREE.Color(0x020208),
    skyMid: new THREE.Color(0x0a0a18),
    skyHorizon: new THREE.Color(0x1a1522),
    sunDirection: new THREE.Vector3(0.1, 0.3, 0.2).normalize(),
    sunIntensity: 0.6,
    sunColor: new THREE.Color(0x889099),
    ambientIntensity: 0.3,
    ambientColor: new THREE.Color(0x223344),
    waveScale: 1.9,
    rainIntensity: 1.0,
    lightningChance: 0.08,
    windIntensity: 1.0,
  },

  // ------------------------------------------------------------------
  //  NIGHT -- moonlit silence, beautiful and haunting
  // ------------------------------------------------------------------
  night: {
    fogDensity: 0.010,
    fogColor: new THREE.Color(0x050510),
    skyTop: new THREE.Color(0x000008),
    skyMid: new THREE.Color(0x020218),
    skyHorizon: new THREE.Color(0x0a0820),
    sunDirection: new THREE.Vector3(-0.3, 0.5, -0.4).normalize(),
    sunIntensity: 0.4,
    sunColor: new THREE.Color(0x8899cc),
    ambientIntensity: 0.2,
    ambientColor: new THREE.Color(0x112244),
    waveScale: 0.9,
    rainIntensity: 0,
    lightningChance: 0,
    windIntensity: 0.2,
  },
};

// ===================================================================
//  Interpolation helpers
// ===================================================================

function lerpNumber(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpConfig(from: WeatherConfig, to: WeatherConfig, t: number): WeatherConfig {
  return {
    fogDensity: lerpNumber(from.fogDensity, to.fogDensity, t),
    fogColor: from.fogColor.clone().lerp(to.fogColor, t),
    skyTop: from.skyTop.clone().lerp(to.skyTop, t),
    skyMid: from.skyMid.clone().lerp(to.skyMid, t),
    skyHorizon: from.skyHorizon.clone().lerp(to.skyHorizon, t),
    sunDirection: from.sunDirection.clone().lerp(to.sunDirection, t).normalize(),
    sunIntensity: lerpNumber(from.sunIntensity, to.sunIntensity, t),
    sunColor: from.sunColor.clone().lerp(to.sunColor, t),
    ambientIntensity: lerpNumber(from.ambientIntensity, to.ambientIntensity, t),
    ambientColor: from.ambientColor.clone().lerp(to.ambientColor, t),
    waveScale: lerpNumber(from.waveScale, to.waveScale, t),
    rainIntensity: lerpNumber(from.rainIntensity, to.rainIntensity, t),
    lightningChance: lerpNumber(from.lightningChance, to.lightningChance, t),
    windIntensity: lerpNumber(from.windIntensity, to.windIntensity, t),
  };
}

// ===================================================================
//  WeatherSystem
// ===================================================================

export class WeatherSystem {
  private scene: THREE.Scene;
  private targets: WeatherTargets | null = null;

  // Current state tracking
  private currentState: WeatherState = 'clear';
  private currentConfig: WeatherConfig;

  // Transition state
  private txFrom: WeatherConfig;
  private txTarget: WeatherConfig;
  private txDuration = 0;
  private txElapsed = 0;
  private transitioning = false;

  // Lightning state
  private lightningTimer = 0;
  private lightningFlashTime = 0;       // time since flash started
  private lightningActive = false;
  private preFlashAmbientIntensity = 0;
  private preFlashAmbientColor = new THREE.Color();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.currentConfig = cloneConfig(WEATHER_CONFIGS.clear);
    this.txFrom = cloneConfig(this.currentConfig);
    this.txTarget = cloneConfig(this.currentConfig);
  }

  // ---------------------------------------------------------------
  //  setTargets -- wire up the objects we control
  // ---------------------------------------------------------------

  setTargets(opts: {
    fog: THREE.FogExp2;
    sunLight: THREE.DirectionalLight;
    ambientLight: THREE.AmbientLight;
    skyMaterial: THREE.ShaderMaterial;
    oceanMaterial: THREE.ShaderMaterial;
  }): void {
    this.targets = opts;
  }

  // ---------------------------------------------------------------
  //  transitionTo -- begin a cinematic shift to a new weather state
  // ---------------------------------------------------------------

  transitionTo(state: WeatherState, duration = 10): void {
    if (state === this.currentState && !this.transitioning) return;

    this.txFrom = cloneConfig(this.currentConfig);
    this.txTarget = cloneConfig(WEATHER_CONFIGS[state]);
    this.txDuration = Math.max(0.1, duration);
    this.txElapsed = 0;
    this.transitioning = true;
    this.currentState = state;
  }

  // ---------------------------------------------------------------
  //  update -- call every frame with delta time
  // ---------------------------------------------------------------

  update(dt: number): WeatherUpdateResult {
    const result: WeatherUpdateResult = {
      lightning: false,
      thunderDelay: 0,
      config: this.currentConfig,
    };

    // --- Advance transition ---
    if (this.transitioning) {
      this.txElapsed += dt;

      // Use a smoothstep-style easing for cinematic feel:
      // slow start, smooth middle, gentle landing
      const rawT = Math.min(this.txElapsed / this.txDuration, 1);
      const t = rawT * rawT * (3 - 2 * rawT); // smoothstep

      this.currentConfig = lerpConfig(this.txFrom, this.txTarget, t);

      if (rawT >= 1) {
        this.transitioning = false;
        this.currentConfig = cloneConfig(this.txTarget);
      }
    }

    // --- Lightning logic ---
    if (this.currentConfig.lightningChance > 0) {
      this.lightningTimer += dt;
      // Roll dice every second
      if (this.lightningTimer >= 1) {
        this.lightningTimer -= 1;
        if (Math.random() < this.currentConfig.lightningChance) {
          // Trigger a lightning strike
          this.lightningActive = true;
          this.lightningFlashTime = 0;
          this.preFlashAmbientIntensity = this.currentConfig.ambientIntensity;
          this.preFlashAmbientColor.copy(this.currentConfig.ambientColor);

          result.lightning = true;
          result.thunderDelay = 0.3 + Math.random() * 0.5;
        }
      }
    } else {
      this.lightningTimer = 0;
    }

    // --- Apply lightning flash overlay ---
    let ambientIntensityOverride: number | null = null;
    let ambientColorOverride: THREE.Color | null = null;

    if (this.lightningActive) {
      this.lightningFlashTime += dt;

      if (this.lightningFlashTime < 0.05) {
        // Phase 1: blinding white flash (0 - 50ms)
        ambientIntensityOverride = 3.0;
        ambientColorOverride = new THREE.Color(0xffffff);
      } else if (this.lightningFlashTime < 0.20) {
        // Phase 2: rapid decay back to normal (50ms - 200ms)
        const decayT = (this.lightningFlashTime - 0.05) / 0.15;
        const eased = decayT * decayT; // quadratic ease-in for sharp falloff
        ambientIntensityOverride = lerpNumber(3.0, this.preFlashAmbientIntensity, eased);
        ambientColorOverride = new THREE.Color(0xffffff).lerp(this.preFlashAmbientColor, eased);
      } else {
        // Flash complete
        this.lightningActive = false;
      }
    }

    // --- Apply everything to scene targets ---
    if (this.targets) {
      const cfg = this.currentConfig;
      const t = this.targets;

      // Fog
      t.fog.density = cfg.fogDensity;
      t.fog.color.copy(cfg.fogColor);

      // Sun / directional light
      t.sunLight.intensity = cfg.sunIntensity;
      t.sunLight.color.copy(cfg.sunColor);
      t.sunLight.position.copy(cfg.sunDirection).multiplyScalar(100);

      // Ambient light (with lightning override)
      t.ambientLight.intensity = ambientIntensityOverride ?? cfg.ambientIntensity;
      t.ambientLight.color.copy(ambientColorOverride ?? cfg.ambientColor);

      // Sky shader uniforms
      const su = t.skyMaterial.uniforms;
      if (su.uSkyTop) su.uSkyTop.value.copy(cfg.skyTop);
      if (su.uSkyMid) su.uSkyMid.value.copy(cfg.skyMid);
      if (su.uSkyHorizon) su.uSkyHorizon.value.copy(cfg.skyHorizon);
      if (su.uSunDir) su.uSunDir.value.copy(cfg.sunDirection);

      // Ocean shader uniforms
      const ou = t.oceanMaterial.uniforms;
      if (ou.uFogColor) ou.uFogColor.value.copy(cfg.fogColor);
      if (ou.uFogDensity) ou.uFogDensity.value = cfg.fogDensity;
      if (ou.uSunDir) ou.uSunDir.value.copy(cfg.sunDirection);
      if (ou.uWaveScale) ou.uWaveScale.value = cfg.waveScale;
    }

    result.config = this.currentConfig;
    return result;
  }

  // ---------------------------------------------------------------
  //  Accessors
  // ---------------------------------------------------------------

  getCurrentConfig(): WeatherConfig {
    return this.currentConfig;
  }

  getCurrentState(): WeatherState {
    return this.currentState;
  }

  isTransitioning(): boolean {
    return this.transitioning;
  }
}
