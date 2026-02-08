import * as THREE from 'three';
import { Ocean } from './Ocean';
import { createShipMesh, setShipLanterns, updateShipSails, addSurrenderFlag } from './Ship';
import {
  GoldBurst, WaterSplash, ScreenShake, WakeTrail,
  CannonSmoke, ExplosionEffect, RainSystem,
  MuzzleFlash, CannonballTrail, ShipBreakup, SpeedLines,
  FireEffect, FloatingDebris,
  KrakenTentacle, WhirlpoolEffect, SeaSerpentEffect,
  GhostShipEffect, FireShipExplosion, TreasureSparkle, VictoryConfetti,
  PhoenixBurst, ChainShotTint, DavysPactAura,
} from './Effects';
import { UI } from './UI';
import type { CodexViewModel, CodexSectionView, DoctrineSetupOption, ChoicePromptOption } from './UI';
import { audio } from './Audio';
import { CombatSystem } from './Combat';
import { WeatherSystem } from './Weather';
import type { WeatherState } from './Weather';
import { ProgressionSystem, saveRunToHistory, loadRunHistory } from './Progression';
import type { PlayerStats, Synergy, RuntimeSettings } from './Progression';
import { screenJuice } from './Juice';
import { SkySystem } from './Sky';
import { PortScene } from './Port';
import { WorldSystem } from './World';
import { EnemyAISystem } from './EnemyAI';
import type { EnemyAIPressureProfile } from './EnemyAI';
import { CrewSystem } from './Crew';
import { EventSystem } from './Events';

import type { MerchantV1, WaveConfigV1, EnemyType, RunStats, EventType, IslandType } from './Types';
import type { ShipClass, ShipClassConfig, ColorblindMode } from './Types';
import { ENEMY_TYPE_CONFIGS, CREW_ROLE_CONFIGS, SHIP_CLASS_CONFIGS } from './Types';
import type { Scenario, ScenarioWave } from './Scenario';
import { V2ContentRegistry } from './V2Content';
import type { V2Doctrine, V2EventCard } from './V2Content';
import { NarrativeSystem } from './NarrativeSystem';
import { MapNodeSystem } from './MapNodeSystem';
import type { MapNodeType, MapNode } from './MapNodeSystem';
import { FactionSystem } from './FactionSystem';
import { EconomySystem } from './EconomySystem';
import { TelemetrySystem } from './TelemetrySystem';
import {
  saveRunCheckpoint,
  loadRunCheckpoint,
  clearRunCheckpoint,
  type RunCheckpointV1,
  type RunCheckpointContractSnapshot,
} from './RunCheckpoint';

// ===================================================================
//  Mobile detection
// ===================================================================

const isMobile = (navigator.maxTouchPoints > 0 || 'ontouchstart' in globalThis)
  && (/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
      || matchMedia('(pointer: coarse)').matches);

const buildEnv = ((import.meta as unknown as { env?: Record<string, unknown> }).env ?? {}) as Record<string, unknown>;

function envFlag(name: string): boolean {
  const raw = buildEnv[name];
  return raw === true || raw === '1' || raw === 'true';
}

const FORCE_DEV_BUILD = envFlag('VITE_DEV');
const ENABLE_DEV_PANEL = FORCE_DEV_BUILD || envFlag('DEV') || envFlag('VITE_ENABLE_DEV_PANEL');
const ENABLE_SCENARIO_EDITOR = FORCE_DEV_BUILD || envFlag('DEV') || envFlag('VITE_ENABLE_SCENARIO_EDITOR');
const ENABLE_TELEMETRY_EXPORT = FORCE_DEV_BUILD || envFlag('DEV') || envFlag('VITE_ENABLE_TELEMETRY_EXPORT');

type EditorRuntimeModules = {
  EditorCamera: typeof import('./EditorCamera').EditorCamera;
  ScenarioEditor: typeof import('./ScenarioEditor').ScenarioEditor;
  EditorUI: typeof import('./EditorUI').EditorUI;
  createEmptyScenario: typeof import('./Scenario').createEmptyScenario;
  createDefaultWave: typeof import('./Scenario').createDefaultWave;
  scenarioWavesToWaveTable: typeof import('./Scenario').scenarioWavesToWaveTable;
  scenarioFromURLHash: typeof import('./Scenario').scenarioFromURLHash;
};

let editorRuntimePromise: Promise<EditorRuntimeModules> | null = null;

function loadEditorRuntime(): Promise<EditorRuntimeModules> {
  if (!editorRuntimePromise) {
    editorRuntimePromise = Promise.all([
      import('./EditorCamera'),
      import('./ScenarioEditor'),
      import('./EditorUI'),
      import('./Scenario'),
    ]).then(([editorCameraMod, scenarioEditorMod, editorUIMod, scenarioMod]) => ({
      EditorCamera: editorCameraMod.EditorCamera,
      ScenarioEditor: scenarioEditorMod.ScenarioEditor,
      EditorUI: editorUIMod.EditorUI,
      createEmptyScenario: scenarioMod.createEmptyScenario,
      createDefaultWave: scenarioMod.createDefaultWave,
      scenarioWavesToWaveTable: scenarioMod.scenarioWavesToWaveTable,
      scenarioFromURLHash: scenarioMod.scenarioFromURLHash,
    }));
  }
  return editorRuntimePromise;
}

// ===================================================================
//  Renderer & scene
// ===================================================================

const scene = new THREE.Scene();
const fogColor = new THREE.Color(0x1e1828);
const fogDensity = 0.008;
scene.fog = new THREE.FogExp2(fogColor, fogDensity);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 500);

const renderer = new THREE.WebGLRenderer({ antialias: !isMobile });
let currentGraphicsQuality: 'low' | 'medium' | 'high' = 'high';
let accessibilityUiScale = 1;

const PANEL_SCALE_TARGET_IDS = [
  'title',
  'ship-select',
  'port-overlay',
  'pause-menu',
  'settings-panel',
  'choice-panel',
  'run-summary',
  'game-over',
  'run-history-panel',
  'codex-panel',
];

function getPixelRatioCap(quality: 'low' | 'medium' | 'high'): number {
  if (isMobile) {
    if (quality === 'low') return 1.0;
    if (quality === 'medium') return 1.25;
    return 1.5;
  }
  if (quality === 'low') return 1.0;
  if (quality === 'medium') return 1.5;
  return 2.0;
}

function applyGraphicsQuality(quality: 'low' | 'medium' | 'high'): void {
  currentGraphicsQuality = quality;
  renderer.setPixelRatio(Math.min(devicePixelRatio, getPixelRatioCap(quality)));
}

renderer.setSize(innerWidth, innerHeight);
applyGraphicsQuality(currentGraphicsQuality);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
document.getElementById('game')!.appendChild(renderer.domElement);

function isElementShown(el: HTMLElement | null): boolean {
  if (!el) return false;
  const style = getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  return Number(style.opacity) > 0.01;
}

function shouldUsePanelScale(): boolean {
  for (const id of PANEL_SCALE_TARGET_IDS) {
    if (isElementShown(document.getElementById(id) as HTMLElement | null)) {
      return true;
    }
  }
  return false;
}

function applyAdaptiveUIScale() {
  const uiRoot = document.getElementById('ui');
  if (!uiRoot) return;
  if (isMobile) {
    if (uiRoot.style.getPropertyValue('--ui-scale') !== '1') {
      uiRoot.style.setProperty('--ui-scale', '1');
    }
    return;
  }

  const shortestEdge = Math.min(innerWidth, innerHeight);
  const gameplayScale = THREE.MathUtils.clamp(shortestEdge / 730, 1.15, 1.95);
  const panelScale = THREE.MathUtils.clamp(shortestEdge / 930, 1.0, 1.4);
  const contextualScale = shouldUsePanelScale() ? panelScale : gameplayScale;
  const scale = THREE.MathUtils.clamp(contextualScale * accessibilityUiScale, 0.9, 2.3);
  const scaleString = scale.toFixed(2);
  if (uiRoot.style.getPropertyValue('--ui-scale') !== scaleString) {
    uiRoot.style.setProperty('--ui-scale', scaleString);
  }
}

let uiScaleRefreshQueued = false;

function scheduleAdaptiveUIScale() {
  if (uiScaleRefreshQueued) return;
  uiScaleRefreshQueued = true;
  requestAnimationFrame(() => {
    uiScaleRefreshQueued = false;
    applyAdaptiveUIScale();
  });
}

applyAdaptiveUIScale();

const uiRootForScaleObserver = document.getElementById('ui');
if (uiRootForScaleObserver) {
  const uiScaleObserver = new MutationObserver(() => {
    scheduleAdaptiveUIScale();
  });
  for (const id of PANEL_SCALE_TARGET_IDS) {
    const el = document.getElementById(id);
    if (!el) continue;
    uiScaleObserver.observe(el, {
      attributes: true,
      attributeFilter: ['style', 'class'],
    });
  }
}

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  applyGraphicsQuality(currentGraphicsQuality);
  scheduleAdaptiveUIScale();
});

// ===================================================================
//  Sky dome — uniform-driven colors for weather
// ===================================================================

const skyGeo = new THREE.SphereGeometry(420, 32, 32);
const skyMat = new THREE.ShaderMaterial({
  uniforms: {
    uSkyTop:     { value: new THREE.Color(0x03030a) },
    uSkyMid:     { value: new THREE.Color(0x100618) },
    uSkyHorizon: { value: new THREE.Color(0x552615) },
    uSunDir:     { value: new THREE.Vector3(0.4, 0.12, 0.3).normalize() },
    uTime:       { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec3 vDir;
    void main() {
      vDir = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uSkyTop;
    uniform vec3 uSkyMid;
    uniform vec3 uSkyHorizon;
    uniform vec3 uSunDir;
    uniform float uTime;
    varying vec3 vDir;
    void main() {
      float y = normalize(vDir).y;
      vec3 color = mix(uSkyHorizon, uSkyMid, smoothstep(-0.08, 0.25, y));
      color = mix(color, uSkyTop, smoothstep(0.25, 0.7, y));
      float sunDot = max(dot(normalize(vDir), normalize(uSunDir)), 0.0);
      color += vec3(1.0, 0.6, 0.2) * pow(sunDot, 32.0) * 0.6;
      color += vec3(1.0, 0.85, 0.5) * pow(sunDot, 256.0) * 1.0;
      // Aurora glow in night mode (when sky is dark)
      float nightness = 1.0 - smoothstep(0.0, 0.15, (uSkyTop.r + uSkyTop.g + uSkyTop.b) / 3.0);
      float auroraBand = smoothstep(0.3, 0.45, y) * smoothstep(0.65, 0.5, y);
      float xDir = normalize(vDir).x;
      float auroraWave = sin(xDir * 4.0 + uTime * 0.2) * 0.5 + 0.5;
      auroraWave *= sin(xDir * 7.0 - uTime * 0.15) * 0.3 + 0.7;
      vec3 auroraColor = mix(vec3(0.1, 0.8, 0.4), vec3(0.2, 0.3, 0.9), auroraWave);
      color += auroraColor * auroraBand * auroraWave * nightness * 0.15;
      gl_FragColor = vec4(color, 1.0);
    }
  `,
  side: THREE.BackSide,
  depthWrite: false,
});

const sky = new THREE.Mesh(skyGeo, skyMat);
sky.renderOrder = -1;
scene.add(sky);

// ===================================================================
//  Lighting
// ===================================================================

const sunDir = new THREE.Vector3(0.4, 0.6, 0.3).normalize();
const sun = new THREE.DirectionalLight(0xffeecc, 2.8);
sun.position.copy(sunDir.clone().multiplyScalar(100));
scene.add(sun);

const ambient = new THREE.AmbientLight(0x334466, 0.55);
scene.add(ambient);
scene.add(new THREE.HemisphereLight(0x7788bb, 0x443322, 0.45));

// ===================================================================
//  Ocean
// ===================================================================

const ocean = new Ocean(fogColor, fogDensity);
scene.add(ocean.mesh);

// ===================================================================
//  Player ship
// ===================================================================

let playerShipConfig = { speedTier: 0, armorTier: 0, weaponTier: 0 };
let playerGroup = createShipMesh(0x6b3a2a, 0xf5f0e6, 1, playerShipConfig);
scene.add(playerGroup);

let playerAngle = 0;
let playerSpeed = 0;
const playerPos = new THREE.Vector3(0, 0, 0);
const playerVel = new THREE.Vector3(0, 0, 0);
let juiceScale = 1;
let juiceVel = 0;
let recoilOffset = 0; // backward offset on cannon fire

// ===================================================================
//  Core systems
// ===================================================================

const progression = new ProgressionSystem();
const combat = new CombatSystem(scene);
const weather = new WeatherSystem(scene);
const ui = new UI();
const skySystem = new SkySystem(scene);
const world = new WorldSystem(scene);
const crew = new CrewSystem();
const events = new EventSystem();

const v2Content = V2ContentRegistry.createDefault();
const narrative = new NarrativeSystem((line) => {
  ui.addJournalEntry(line.text, line.tone);
});
const mapNodes = new MapNodeSystem(v2Content);
const factions = new FactionSystem(v2Content);
const economy = new EconomySystem();
const telemetry = new TelemetrySystem();
let accessibilityMotionIntensity = 1;

function motionScale(value: number): number {
  return Math.max(0, value * accessibilityMotionIntensity);
}

function applyAccessibilitySettings(settings: RuntimeSettings['accessibility']): void {
  const root = document.documentElement;
  root.style.setProperty('--bh-text-scale', settings.textScale.toFixed(2));
  root.style.setProperty('--bh-flash-intensity', settings.flashIntensity.toFixed(2));
  document.body.dataset.colorblind = settings.colorblindMode;
  accessibilityUiScale = settings.uiScale;
  accessibilityMotionIntensity = settings.motionIntensity;
  screenJuice.setFlashIntensity(settings.flashIntensity);
  scheduleAdaptiveUIScale();
  if (accessibilityMotionIntensity <= 0.001) {
    screenShake.reset();
  }
}

function applyRuntimeSettings(settings: RuntimeSettings): void {
  audio.setMasterVolume(settings.masterVolume);
  audio.setMusicVolume(settings.musicVolume);
  audio.setSfxVolume(settings.sfxVolume);
  applyGraphicsQuality(settings.graphicsQuality);
  applyAccessibilitySettings(settings.accessibility);
}

function updateRuntimeSetting(
  key: 'master' | 'music' | 'sfx' | 'quality' | 'uiScale' | 'textScale' | 'motionIntensity' | 'flashIntensity' | 'colorblindMode' | 'keyBinding',
  value: any,
): void {
  if (key === 'keyBinding') {
    const { action, key: newKey } = value as { action: string; key: string };
    const current = progression.getRuntimeSettings();
    const keyBindings = { ...current.keyBindings, [action]: newKey };
    applyRuntimeSettings(progression.updateRuntimeSettings({ keyBindings }));
    
    // Re-render settings to show the updated key
    const settings = progression.getRuntimeSettings();
    ui.showSettings(
      {
        master: Math.round(settings.masterVolume * 100),
        music: Math.round(settings.musicVolume * 100),
        sfx: Math.round(settings.sfxVolume * 100),
        quality: settings.graphicsQuality,
        uiScale: settings.accessibility.uiScale,
        textScale: settings.accessibility.textScale,
        motionIntensity: settings.accessibility.motionIntensity,
        flashIntensity: settings.accessibility.flashIntensity,
        colorblindMode: settings.accessibility.colorblindMode,
        keyBindings: settings.keyBindings as any,
      },
      (k, v) => updateRuntimeSetting(k as any, v),
    );
    return;
  }
  switch (key) {
    case 'master':
      applyRuntimeSettings(progression.updateRuntimeSettings({ masterVolume: Number(value) / 100 }));
      break;
    case 'music':
      applyRuntimeSettings(progression.updateRuntimeSettings({ musicVolume: Number(value) / 100 }));
      break;
    case 'sfx':
      applyRuntimeSettings(progression.updateRuntimeSettings({ sfxVolume: Number(value) / 100 }));
      break;
    case 'quality':
      applyRuntimeSettings(progression.updateRuntimeSettings({
        graphicsQuality: value === 'low' || value === 'medium' || value === 'high' ? value : 'high',
      }));
      break;
    case 'uiScale':
      applyRuntimeSettings(progression.updateRuntimeSettings({
        accessibility: { uiScale: Number(value) },
      }));
      break;
    case 'textScale':
      applyRuntimeSettings(progression.updateRuntimeSettings({
        accessibility: { textScale: Number(value) },
      }));
      break;
    case 'motionIntensity':
      applyRuntimeSettings(progression.updateRuntimeSettings({
        accessibility: { motionIntensity: Number(value) },
      }));
      break;
    case 'flashIntensity':
      applyRuntimeSettings(progression.updateRuntimeSettings({
        accessibility: { flashIntensity: Number(value) },
      }));
      break;
    case 'colorblindMode':
      applyRuntimeSettings(progression.updateRuntimeSettings({
        accessibility: { colorblindMode: value as ColorblindMode },
      }));
      break;
  }
}

// Wire weather system to scene targets
weather.setTargets({
  fog: scene.fog as THREE.FogExp2,
  sunLight: sun,
  ambientLight: ambient,
  skyMaterial: skyMat,
  oceanMaterial: ocean.material,
});

// ===================================================================
//  Effects
// ===================================================================

const goldBurst = new GoldBurst(scene);
const waterSplash = new WaterSplash(scene);
const screenShake = new ScreenShake();
const wake = new WakeTrail(scene);
const cannonSmoke = new CannonSmoke(scene);
const explosionEffect = new ExplosionEffect(scene);
const rain = new RainSystem(scene, playerPos);
const muzzleFlash = new MuzzleFlash(scene);
const cannonballTrail = new CannonballTrail(scene);
const shipBreakup = new ShipBreakup(scene);
const speedLines = new SpeedLines(scene);
const fireEffect = new FireEffect(scene);
const floatingDebris = new FloatingDebris(scene);
const krakenTentacle = new KrakenTentacle(scene);
const whirlpoolEffect = new WhirlpoolEffect(scene);
const seaSerpentEffect = new SeaSerpentEffect(scene);
const fireShipExplosion = new FireShipExplosion(scene);
const treasureSparkle = new TreasureSparkle(scene);
const victoryConfetti = new VictoryConfetti(scene);
const phoenixBurst = new PhoenixBurst(scene);

// War drums timer (beats every ~2s during combat when upgrade active)
let warDrumsTimer = 0;

function triggerScreenShake(strength: number): void {
  screenShake.trigger(motionScale(strength));
}

applyRuntimeSettings(progression.getRuntimeSettings());

// ===================================================================
//  Port scene (lazy-created)
// ===================================================================

let portScene: PortScene | null = null;
let inPort = false;
let portTransitionTimer = 0;
let portTransitionPhase: 'entering' | 'active' | 'leaving' | 'none' = 'none';

// ===================================================================
//  Merchant ships
// ===================================================================

const merchants: MerchantV1[] = [];
let nextMerchantId = 0;
const SINK_DURATION = 4.0; // expanded for multi-stage sinking

// Boss names
const PIRATE_NAMES = [
  'Blackbeard', 'Red Bess', 'Iron Jack', 'The Kraken',
  'Bloody Mary', 'Captain Bones', 'Dead-Eye Pete', 'Sea Witch',
  'The Reaper', 'Barnacle Bill', 'Storm Fang', 'Dread Morgan',
];

const WEATHER_LOG_LINES: Record<WeatherState, string> = {
  clear: 'clear water and wide horizons',
  foggy: 'fogbanks thick enough to hide a broadside',
  stormy: 'black swells and thunder off the bow',
  night: 'moonlit currents and lantern-lit wakes',
};

const FACTION_ENEMY_BIAS: Record<string, EnemyType[]> = {
  free_captains: ['merchant_sloop', 'escort_frigate', 'fire_ship'],
  imperial_navy: ['escort_frigate', 'navy_warship'],
  redwake_corsairs: ['fire_ship', 'escort_frigate', 'merchant_sloop'],
  wraith_fleet: ['ghost_ship', 'escort_frigate'],
  merchant_consortium: ['merchant_sloop', 'merchant_galleon', 'escort_frigate'],
};

const FACTION_PRESSURE_PROFILES: Record<string, EnemyAIPressureProfile> = {
  free_captains: {
    speedMult: 1.06,
    turnRateMult: 1.08,
    fireCooldownMult: 0.95,
    fireRangeMult: 1.0,
    broadsideArcMult: 1.0,
    engageRangeMult: 1.05,
  },
  imperial_navy: {
    speedMult: 0.96,
    turnRateMult: 1.02,
    fireCooldownMult: 1.08,
    fireRangeMult: 1.14,
    broadsideArcMult: 1.18,
    engageRangeMult: 1.18,
  },
  redwake_corsairs: {
    speedMult: 1.12,
    turnRateMult: 1.12,
    fireCooldownMult: 0.9,
    fireRangeMult: 0.95,
    beelineExplodeRangeMult: 1.25,
    engageRangeMult: 1.08,
  },
  wraith_fleet: {
    speedMult: 1.02,
    turnRateMult: 1.1,
    fireCooldownMult: 0.92,
    fireRangeMult: 1.08,
    ghostPhaseIntervalMult: 0.82,
    engageRangeMult: 1.12,
  },
  merchant_consortium: {
    speedMult: 0.98,
    turnRateMult: 0.95,
    fireCooldownMult: 1.12,
    fireRangeMult: 0.94,
    fleeUrgencyMult: 1.2,
  },
};

const EVENT_START_LOG: Record<EventType, { message: string; tone: 'warning' | 'mystic' | 'neutral' | 'reward' }> = {
  kraken: { message: 'The sea is boiling. Kraken limbs off both beams!', tone: 'warning' },
  whirlpool: { message: 'A spinning maw forms ahead. Helm hard over.', tone: 'warning' },
  ghost_ship_event: { message: 'A phantom silhouette rises from the fog.', tone: 'mystic' },
  sea_serpent: { message: 'The serpent circles. Keep distance and survive.', tone: 'warning' },
  storm_surge: { message: 'Storm surge incoming. Build speed now.', tone: 'warning' },
  treasure_map: { message: 'A blood-stained chart points toward buried coin.', tone: 'reward' },
};

const EVENT_END_LOG: Record<EventType, { success: string; failure?: string; successTone: 'reward' | 'neutral'; failureTone?: 'warning' | 'neutral' }> = {
  kraken: {
    success: 'Kraken driven off. The crew cheers over shattered tentacles.',
    failure: 'The kraken vanished below and left the hull groaning.',
    successTone: 'reward',
    failureTone: 'warning',
  },
  whirlpool: {
    success: 'The vortex fades and the current settles.',
    successTone: 'neutral',
  },
  ghost_ship_event: {
    success: 'The ghostly wake thins into mist.',
    successTone: 'neutral',
  },
  sea_serpent: {
    success: 'The serpent dives deep. These waters are ours for now.',
    failure: 'The serpent left splintered planks in its wake.',
    successTone: 'reward',
    failureTone: 'warning',
  },
  storm_surge: {
    success: 'You rode the surge clean and kept command.',
    failure: 'The surge slammed the hull broadside.',
    successTone: 'reward',
    failureTone: 'warning',
  },
  treasure_map: {
    success: 'Treasure secured and stowed below deck.',
    successTone: 'reward',
  },
};

const CODEX_EVENT_TYPES: EventType[] = [
  'kraken',
  'whirlpool',
  'ghost_ship_event',
  'sea_serpent',
  'storm_surge',
  'treasure_map',
];

const CODEX_EVENT_NAMES: Record<EventType, string> = {
  kraken: 'Kraken',
  whirlpool: 'Whirlpool',
  ghost_ship_event: 'Ghost Ship',
  sea_serpent: 'Sea Serpent',
  storm_surge: 'Storm Surge',
  treasure_map: 'Treasure Map',
};

const CODEX_LANDMARK_TYPES: IslandType[] = ['rocky', 'sandy', 'jungle', 'fortress'];

const CODEX_LANDMARK_DETAILS: Record<IslandType, string> = {
  rocky: 'Jagged stone outcrops with narrow channels and hidden shoals.',
  sandy: 'Low-lying cays and bright shoals favored by smugglers.',
  jungle: 'Dense canopy islands with buried relic sites and serpent nests.',
  fortress: 'Fortified strongholds with batteries guarding key sea lanes.',
};

function getWaveLogLine(config: WaveConfigV1): string {
  const weatherLine = WEATHER_LOG_LINES[config.weather];
  if (config.bossName) {
    return `Wave ${config.wave}: ${weatherLine}. ${config.bossName} commands the enemy line.`;
  }
  return `Wave ${config.wave}: ${weatherLine}. ${config.totalShips} ships on the horizon.`;
}

function toWeatherState(value: string): WeatherState | null {
  if (value === 'clear' || value === 'foggy' || value === 'stormy' || value === 'night') return value;
  return null;
}

function getDominantFactionId(regionFactionIds: string[]): string | null {
  const spawnWeights = factions.getSpawnWeightMap(regionFactionIds);
  let dominantFactionId: string | null = null;
  let dominantWeight = -Infinity;
  for (const [id, weight] of spawnWeights) {
    if (weight > dominantWeight) {
      dominantWeight = weight;
      dominantFactionId = id;
    }
  }
  return dominantFactionId;
}

function applyFactionPressureProfileForRegion(regionFactionIds: string[]): string | null {
  const dominantFactionId = getDominantFactionId(regionFactionIds);
  if (!dominantFactionId) {
    EnemyAISystem.resetPressureProfile();
    return null;
  }
  const profile = FACTION_PRESSURE_PROFILES[dominantFactionId];
  if (profile) EnemyAISystem.setPressureProfile(profile);
  else EnemyAISystem.resetPressureProfile();
  return dominantFactionId;
}

function formatCodexLabel(raw: string): string {
  return raw
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatDoctrineBonusLabel(doctrine: V2Doctrine): string {
  const speedPct = Math.round((doctrine.startingBonuses.speedMult - 1) * 100);
  const damagePct = Math.round((doctrine.startingBonuses.cannonDamageMult - 1) * 100);
  const healthPct = Math.round((doctrine.startingBonuses.maxHealthMult - 1) * 100);
  const sign = (n: number) => (n >= 0 ? `+${n}%` : `${n}%`);
  return `Speed ${sign(speedPct)} · Damage ${sign(damagePct)} · Hull ${sign(healthPct)}`;
}

function getDoctrineById(doctrineId: string): V2Doctrine | null {
  const found = v2Content.data.doctrines.find((doctrine) => doctrine.id === doctrineId);
  if (found) return found;
  return v2Content.data.doctrines[0] ?? null;
}

function getRunSetupDoctrineOptions(): DoctrineSetupOption[] {
  return v2Content.data.doctrines.map((doctrine) => ({
    id: doctrine.id,
    name: doctrine.name,
    summary: doctrine.summary,
    bonusLabel: formatDoctrineBonusLabel(doctrine),
  }));
}

function getRunSetupShipConfigs(): ShipClassConfig[] {
  const meta = progression.getMetaStatsV1();
  return (Object.values(SHIP_CLASS_CONFIGS) as ShipClassConfig[]).map((config) => {
    if (config.id !== 'galleon') {
      return { ...config, locked: false };
    }
    return { ...config, locked: !meta.galleonUnlocked };
  });
}

function buildCodexSection(
  title: string,
  defs: Array<{ id: string; name: string; detail: string }>,
  unlocked: Set<string>,
): CodexSectionView {
  const entries = defs.map((def) => ({
    id: def.id,
    name: def.name,
    detail: def.detail,
    unlocked: unlocked.has(def.id),
  }));
  const discovered = entries.filter(entry => entry.unlocked).length;
  return {
    title,
    discovered,
    total: entries.length,
    entries,
  };
}

function buildCodexViewModel(): CodexViewModel {
  const unlocked = new Set(progression.getCodexEntries());

  const regionDefs = v2Content.data.regions.map(region => ({
    id: `region:${region.id}`,
    name: region.name,
    detail: region.theme,
  }));

  const factionDefs = v2Content.data.factions.map(faction => ({
    id: `faction:${faction.id}`,
    name: faction.name,
    detail: faction.combatProfile,
  }));

  const enemyDefs = (Object.keys(ENEMY_TYPE_CONFIGS) as EnemyType[]).map((enemyType) => {
    const cfg = ENEMY_TYPE_CONFIGS[enemyType];
    const behaviorLabel = formatCodexLabel(cfg.behavior);
    const arms = cfg.armed ? 'Armed broadside threat.' : 'Primarily capture target.';
    return {
      id: `enemy:${enemyType}`,
      name: formatCodexLabel(enemyType),
      detail: `${behaviorLabel} pattern. Hull integrity ${cfg.hp}. ${arms}`,
    };
  });

  const eventDefs = CODEX_EVENT_TYPES.map(eventType => ({
    id: `event:${eventType}`,
    name: CODEX_EVENT_NAMES[eventType],
    detail: EVENT_START_LOG[eventType].message,
  }));

  const landmarkDefs = CODEX_LANDMARK_TYPES.map((landmarkType) => ({
    id: `landmark:${landmarkType}`,
    name: `${formatCodexLabel(landmarkType)} Isles`,
    detail: CODEX_LANDMARK_DETAILS[landmarkType],
  }));

  const sections = [
    buildCodexSection('Regions', regionDefs, unlocked),
    buildCodexSection('Factions', factionDefs, unlocked),
    buildCodexSection('Enemies', enemyDefs, unlocked),
    buildCodexSection('Events', eventDefs, unlocked),
    buildCodexSection('Landmarks', landmarkDefs, unlocked),
  ];

  const discovered = sections.reduce((sum, section) => sum + section.discovered, 0);
  const total = sections.reduce((sum, section) => sum + section.total, 0);
  const completionPct = total > 0 ? Math.round((discovered / total) * 100) : 0;

  return {
    completionPct,
    discovered,
    total,
    sections,
  };
}

function unlockCodexEntry(entryId: string, label: string): void {
  const unlocked = progression.unlockCodexEntry(entryId);
  if (!unlocked) return;
  narrative.queue(`Codex updated: ${label}.`, 'mystic');
  ui.showCodexDiscoverySpotlight(label);
  telemetry.track('codex_unlock', { entryId });
}

function unlockRegionCodex(regionId: string): void {
  const region = v2Content.getRegion(regionId);
  if (!region) return;
  unlockCodexEntry(`region:${regionId}`, `Region: ${region.name}`);
}

function unlockFactionCodex(factionId: string): void {
  const faction = v2Content.getFaction(factionId);
  if (!faction) return;
  unlockCodexEntry(`faction:${factionId}`, `Faction: ${faction.name}`);
}

function unlockEnemyCodex(enemyType: EnemyType): void {
  unlockCodexEntry(`enemy:${enemyType}`, `Enemy: ${formatCodexLabel(enemyType)}`);
}

function unlockEventCodex(eventType: EventType): void {
  unlockCodexEntry(`event:${eventType}`, `Event: ${formatCodexLabel(eventType)}`);
}

function applyRegionalFactionReputationDelta(delta: number, reason: string): void {
  const region = mapNodes.getCurrentRegion();
  if (!region) return;
  const factionId = getDominantFactionId(region.factionPressure);
  if (!factionId) return;
  const score = factions.applyReputationDelta(factionId, delta);
  queueFactionReputationFeedback(factionId, delta);
  telemetry.track('faction_reputation', {
    faction: factionId,
    delta,
    score,
    reason,
  });
}

interface RegionalFactionContext {
  factionId: string | null;
  factionName: string | null;
  reputation: number;
}

interface PortMarketProfile {
  context: RegionalFactionContext;
  shopMultiplier: number;
  repairMultiplier: number;
  crewMultiplier: number;
  tierMultiplier: { common: number; rare: number; legendary: number };
  marketTitle: string;
  marketNotes: string[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toPctLabel(multiplier: number): string {
  const delta = Math.round((multiplier - 1) * 100);
  return `${delta >= 0 ? '+' : ''}${delta}%`;
}

function getRegionalFactionContext(): RegionalFactionContext {
  const region = mapNodes.getCurrentRegion();
  if (!region) return { factionId: null, factionName: null, reputation: 0 };
  const factionId = getDominantFactionId(region.factionPressure);
  if (!factionId) return { factionId: null, factionName: null, reputation: 0 };
  return {
    factionId,
    factionName: v2Content.getFaction(factionId)?.name ?? null,
    reputation: factions.getReputation(factionId),
  };
}

function getPortMarketProfile(): PortMarketProfile {
  const context = getRegionalFactionContext();
  const rep = clamp(context.reputation, -100, 100);

  let shopMultiplier = 1 - rep * 0.002;
  let repairMultiplier = 1 - rep * 0.0016;
  let crewMultiplier = 1 - rep * 0.0013;
  const tierMultiplier = { common: 1, rare: 1, legendary: 1 };
  const marketNotes: string[] = [];

  switch (context.factionId) {
    case 'merchant_consortium':
      shopMultiplier *= 0.94;
      repairMultiplier *= 0.9;
      crewMultiplier *= 0.92;
      tierMultiplier.rare *= 0.95;
      marketNotes.push('Consortium quartermasters favor consistent trade ledgers.');
      break;
    case 'imperial_navy':
      shopMultiplier *= 1.08;
      repairMultiplier *= 1.12;
      crewMultiplier *= 1.08;
      tierMultiplier.rare *= 1.05;
      tierMultiplier.legendary *= 1.05;
      marketNotes.push('Imperial harbor taxes are active in this district.');
      break;
    case 'redwake_corsairs':
      shopMultiplier *= 0.98;
      repairMultiplier *= 1.06;
      crewMultiplier *= 0.94;
      tierMultiplier.common *= 0.92;
      tierMultiplier.legendary *= 1.12;
      marketNotes.push('Corsair brokers discount raiding tools, but premium guns cost extra.');
      break;
    case 'wraith_fleet':
      shopMultiplier *= 1.02;
      repairMultiplier *= 1.14;
      crewMultiplier *= 1.04;
      tierMultiplier.common *= 1.08;
      tierMultiplier.legendary *= 0.9;
      marketNotes.push('Wraith tariffs are volatile. Forbidden cargo trades cheaper.');
      break;
    case 'free_captains':
      shopMultiplier *= 0.96;
      repairMultiplier *= 0.97;
      crewMultiplier *= 0.88;
      marketNotes.push('Free captain enclaves reduce recruitment fees for known allies.');
      break;
  }

  shopMultiplier = clamp(shopMultiplier, 0.72, 1.42);
  repairMultiplier = clamp(repairMultiplier, 0.72, 1.42);
  crewMultiplier = clamp(crewMultiplier, 0.72, 1.42);
  tierMultiplier.common = clamp(tierMultiplier.common, 0.8, 1.25);
  tierMultiplier.rare = clamp(tierMultiplier.rare, 0.8, 1.25);
  tierMultiplier.legendary = clamp(tierMultiplier.legendary, 0.8, 1.25);

  if (context.factionName) {
    marketNotes.push(
      `${context.factionName} influence: shop ${toPctLabel(shopMultiplier)}, repair ${toPctLabel(repairMultiplier)}, crew ${toPctLabel(crewMultiplier)}.`,
    );
  } else {
    marketNotes.push('Neutral port authority keeps prices stable.');
  }

  return {
    context,
    shopMultiplier,
    repairMultiplier,
    crewMultiplier,
    tierMultiplier,
    marketTitle: context.factionName ? `${context.factionName} Exchange` : 'Neutral Harbor Exchange',
    marketNotes,
  };
}

function getRegionalEventPressureMultiplier(): number {
  const context = getRegionalFactionContext();
  const rep = clamp(context.reputation, -120, 120);
  let multiplier = 1 + (-rep / 240);

  switch (context.factionId) {
    case 'wraith_fleet':
    case 'redwake_corsairs':
      multiplier += 0.06;
      break;
    case 'merchant_consortium':
      multiplier -= 0.05;
      break;
    case 'imperial_navy':
      multiplier += 0.03;
      break;
  }

  return clamp(multiplier, 0.65, 1.55);
}

function applyFactionReputationDelta(factionId: string | null, delta: number, reason: string): void {
  if (!factionId) {
    applyRegionalFactionReputationDelta(delta, reason);
    return;
  }
  const score = factions.applyReputationDelta(factionId, delta);
  queueFactionReputationFeedback(factionId, delta);
  telemetry.track('faction_reputation', {
    faction: factionId,
    delta,
    score,
    reason,
  });
}

function getContractObjectiveProgress(objective: ActiveContractObjective): number {
  switch (objective.contractType) {
    case 'captures':
      return capturesThisWave;
    case 'armed_captures':
      return armedCapturesThisWave;
    case 'plunder_gold':
      return waveCaptureGold;
  }
}

function formatContractRewardLine(objective: ActiveContractObjective): string {
  const parts: string[] = [];
  if (objective.rewardSupplies > 0) parts.push(`+${objective.rewardSupplies} Supplies`);
  if (objective.rewardIntel > 0) parts.push(`+${objective.rewardIntel} Intel`);
  if (objective.rewardTokens > 0) parts.push(`+${objective.rewardTokens} Token${objective.rewardTokens > 1 ? 's' : ''}`);
  if (objective.rewardGold > 0) parts.push(`+${objective.rewardGold} Gold`);
  return parts.join(', ');
}

function formatContractPenaltyLine(objective: ActiveContractObjective): string {
  const parts: string[] = [];
  if (objective.penaltySupplies > 0) parts.push(`-${objective.penaltySupplies} Supplies`);
  if (objective.penaltyIntel > 0) parts.push(`-${objective.penaltyIntel} Intel`);
  return parts.join(', ');
}

function formatContractProgress(objective: ActiveContractObjective, progress: number): string {
  if (objective.contractType === 'plunder_gold') {
    return `${Math.round(progress).toLocaleString()} / ${objective.target.toLocaleString()} gold`;
  }
  return `${Math.round(progress)} / ${objective.target} ${objective.progressLabel}`;
}

function setupContractObjectiveForWave(
  wave: number,
  nodeType: MapNodeType | undefined,
  dominantFactionId: string | null,
): void {
  if (nodeType !== 'contract') {
    activeContractObjective = null;
    return;
  }

  const factionName = dominantFactionId
    ? (v2Content.getFaction(dominantFactionId)?.name ?? formatCodexLabel(dominantFactionId))
    : 'Local Brokers';
  const rep = dominantFactionId ? factions.getReputation(dominantFactionId) : 0;
  let contractType: ActiveContractObjective['contractType'] = 'captures';
  switch (dominantFactionId) {
    case 'merchant_consortium':
      contractType = 'plunder_gold';
      break;
    case 'imperial_navy':
      contractType = 'armed_captures';
      break;
    case 'redwake_corsairs':
      contractType = Math.random() < 0.5 ? 'captures' : 'plunder_gold';
      break;
    case 'wraith_fleet':
      contractType = 'armed_captures';
      break;
    case 'free_captains':
      contractType = Math.random() < 0.6 ? 'captures' : 'armed_captures';
      break;
    default:
      contractType = 'captures';
  }

  let target = 0;
  let progressLabel = '';
  let targetLabel = '';

  if (contractType === 'captures') {
    target = 2 + (wave >= 3 ? 1 : 0) + (rep <= -25 ? 1 : 0) - (rep >= 35 ? 1 : 0);
    target = clamp(target, 1, 5);
    progressLabel = 'captures';
    targetLabel = `${target} captures`;
  } else if (contractType === 'armed_captures') {
    target = 1 + (wave >= 2 ? 1 : 0) + (rep <= -20 ? 1 : 0) - (rep >= 40 ? 1 : 0);
    target = clamp(target, 1, 4);
    progressLabel = 'armed captures';
    targetLabel = `${target} armed captures`;
  } else {
    target = 450 + wave * 160 + (rep <= -20 ? 220 : 0) - (rep >= 40 ? 120 : 0);
    target = clamp(target, 350, 2200);
    target = Math.round(target / 50) * 50;
    progressLabel = 'plundered gold';
    targetLabel = `${target} gold`;
  }

  let rewardSupplies = 0;
  let rewardIntel = 1;
  let rewardTokens = 0;
  let rewardGold = 0;
  let penaltySupplies = 1;
  let penaltyIntel = 0;

  switch (dominantFactionId) {
    case 'merchant_consortium':
      rewardSupplies = 2;
      rewardIntel = 2;
      break;
    case 'imperial_navy':
      rewardIntel = 2;
      rewardTokens = 1;
      penaltyIntel = 1;
      break;
    case 'redwake_corsairs':
      rewardSupplies = 1;
      rewardTokens = 1;
      rewardGold = 120;
      break;
    case 'wraith_fleet':
      rewardIntel = 1;
      rewardTokens = 2;
      rewardGold = 80;
      penaltyIntel = 1;
      break;
    case 'free_captains':
      rewardSupplies = 2;
      rewardIntel = 1;
      break;
    default:
      rewardSupplies = 1;
      rewardIntel = 1;
  }

  if (contractType === 'plunder_gold') {
    rewardGold += 120;
  }
  if (contractType === 'armed_captures') {
    rewardTokens += 1;
  }

  activeContractObjective = {
    wave,
    factionId: dominantFactionId,
    factionName,
    contractType,
    target,
    rewardSupplies,
    rewardIntel,
    rewardTokens,
    rewardGold,
    penaltySupplies,
    penaltyIntel,
    progressLabel,
    targetLabel,
    announcedMidpoint: false,
    announcedComplete: false,
  };

  const rewardLine = formatContractRewardLine(activeContractObjective);
  ui.addJournalEntry(
    `Contract terms from ${factionName}: ${targetLabel}. Reward: ${rewardLine}.`,
    'neutral',
  );
  telemetry.track('contract_offer', {
    wave,
    faction: dominantFactionId ?? 'neutral',
    rep: Math.round(rep),
    type: contractType,
    target,
    rewardSupplies,
    rewardIntel,
    rewardTokens,
    rewardGold,
  });
}

function updateContractObjectiveTargetLabel(objective: ActiveContractObjective): void {
  if (objective.contractType === 'plunder_gold') {
    objective.target = Math.round(objective.target / 50) * 50;
    objective.targetLabel = `${objective.target} gold`;
    return;
  }
  objective.target = Math.round(objective.target);
  objective.targetLabel = `${objective.target} ${objective.progressLabel}`;
}

function showRunChoicePrompt(title: string, detail: string, options: ChoicePromptOption[]): Promise<string> {
  const econ = economy.getState();
  return ui.showChoicePrompt(title, detail, options, {
    supplies: econ.supplies,
    intel: econ.intel,
    reputationTokens: econ.reputationTokens,
  });
}

async function resolveContractNegotiationChoice(objective: ActiveContractObjective | null): Promise<void> {
  if (!objective || screensaverActive) return;

  const options: ChoicePromptOption[] = [
    {
      id: 'aggressive',
      label: 'Aggressive Terms',
      detail: 'The quartermaster sets down a blood-red contract and waits for your seal.',
      benefitHint: 'High reward',
      riskHint: 'High quota & penalties',
    },
    {
      id: 'balanced',
      label: 'Balanced Terms',
      detail: 'A plain ledger copy offers predictable terms and no surprises.',
      benefitHint: 'Baseline terms',
    },
    {
      id: 'cautious',
      label: 'Cautious Terms',
      detail: 'The clerk slides over conservative clauses fit for storm season.',
      benefitHint: 'Low quota & penalties',
      riskHint: 'Low reward',
    },
  ];

  const choice = await showRunChoicePrompt(
    `${objective.factionName} Contract`,
    `Objective: ${objective.targetLabel}. Reward: ${formatContractRewardLine(objective)}. Penalty: ${formatContractPenaltyLine(objective) || 'None'}.`,
    options,
  );

  switch (choice) {
    case 'aggressive':
      objective.target *= objective.contractType === 'plunder_gold' ? 1.25 : 1.35;
      objective.rewardSupplies += 1;
      objective.rewardIntel += 1;
      objective.rewardTokens += 1;
      if (objective.contractType === 'plunder_gold') objective.rewardGold += 120;
      objective.penaltySupplies += 1;
      if (objective.contractType !== 'captures') objective.penaltyIntel += 1;
      break;
    case 'cautious':
      objective.target *= objective.contractType === 'plunder_gold' ? 0.74 : 0.7;
      objective.rewardSupplies = Math.max(0, objective.rewardSupplies - 1);
      objective.rewardIntel = Math.max(1, objective.rewardIntel - 1);
      objective.rewardTokens = Math.max(0, objective.rewardTokens - 1);
      objective.rewardGold = Math.max(0, Math.round(objective.rewardGold * 0.55));
      objective.penaltySupplies = Math.max(0, objective.penaltySupplies - 1);
      objective.penaltyIntel = Math.max(0, objective.penaltyIntel - 1);
      break;
    default:
      break;
  }

  if (objective.contractType !== 'plunder_gold') {
    objective.target = clamp(objective.target, 1, objective.contractType === 'armed_captures' ? 5 : 6);
  } else {
    objective.target = clamp(objective.target, 300, 2600);
  }
  updateContractObjectiveTargetLabel(objective);

  ui.addJournalEntry(
    `Contract terms confirmed (${choice || 'balanced'}): ${objective.targetLabel}. Reward ${formatContractRewardLine(objective)}.`,
    'neutral',
  );
  telemetry.track('contract_negotiation', {
    wave: objective.wave,
    faction: objective.factionId ?? 'neutral',
    choice: choice || 'balanced',
    target: objective.target,
    rewardSupplies: objective.rewardSupplies,
    rewardIntel: objective.rewardIntel,
    rewardTokens: objective.rewardTokens,
    rewardGold: objective.rewardGold,
    penaltySupplies: objective.penaltySupplies,
    penaltyIntel: objective.penaltyIntel,
  });
}

function resolveContractObjectiveOnWaveComplete(wave: number): void {
  const objective = activeContractObjective;
  if (!objective || objective.wave !== wave) return;

  const progress = getContractObjectiveProgress(objective);
  const success = progress >= objective.target;
  if (success) {
    if (objective.rewardSupplies > 0) economy.addSupplies(objective.rewardSupplies);
    economy.addIntel(objective.rewardIntel);
    if (objective.rewardTokens > 0) economy.addReputationTokens(objective.rewardTokens);
    if (objective.rewardGold > 0) progression.addScore(objective.rewardGold);
    applyFactionReputationDelta(objective.factionId, 0.9, 'contract_success');
    ui.addJournalEntry(
      `Contract fulfilled for ${objective.factionName}: ${formatContractRewardLine(objective)}.`,
      'reward',
    );
  } else {
    if (objective.penaltySupplies > 0) economy.addSupplies(-objective.penaltySupplies);
    if (objective.penaltyIntel > 0) economy.addIntel(-objective.penaltyIntel);
    applyFactionReputationDelta(objective.factionId, -1.1, 'contract_failure');
    ui.addJournalEntry(
      `Contract failed in ${objective.factionName} waters: ${formatContractPenaltyLine(objective)}.`,
      'warning',
    );
  }

  telemetry.track('contract_resolved', {
    wave,
    faction: objective.factionId ?? 'neutral',
    type: objective.contractType,
    success,
    progress,
    target: objective.target,
  });
  activeContractObjective = null;
}

function queueFactionReputationFeedback(factionId: string, delta: number): void {
  if (Math.abs(delta) < 0.01) return;
  const current = pendingFactionReputation.get(factionId) ?? 0;
  pendingFactionReputation.set(factionId, current + delta);
}

function updateFactionFeedback(dt: number): void {
  if (pendingFactionReputation.size === 0) return;
  factionFeedbackTimer -= dt;
  if (factionFeedbackTimer > 0) return;

  let selectedFactionId: string | null = null;
  let selectedDelta = 0;
  for (const [factionId, delta] of pendingFactionReputation) {
    if (!selectedFactionId || Math.abs(delta) > Math.abs(selectedDelta)) {
      selectedFactionId = factionId;
      selectedDelta = delta;
    }
  }
  if (!selectedFactionId) return;

  pendingFactionReputation.delete(selectedFactionId);
  const factionName = v2Content.getFaction(selectedFactionId)?.name ?? formatCodexLabel(selectedFactionId);
  const score = factions.getReputation(selectedFactionId);
  const deltaLabel = `${selectedDelta >= 0 ? '+' : ''}${selectedDelta.toFixed(1)}`;
  ui.addJournalEntry(
    `Standing with ${factionName}: ${deltaLabel} (${Math.round(score)}).`,
    selectedDelta >= 0 ? 'reward' : 'warning',
  );
  factionFeedbackTimer = 2.3;
}

function applyMapNodeToWaveConfig(base: WaveConfigV1): WaveConfigV1 {
  const node = mapNodes.getCurrentNode();
  if (!node) return base;

  const config: WaveConfigV1 = {
    ...base,
    enemyTypes: [...base.enemyTypes],
  };

  const nodeRegion = v2Content.getRegion(node.regionId);
  if (nodeRegion && nodeRegion.weatherBias.length > 0) {
    const weather = toWeatherState(nodeRegion.weatherBias[config.wave % nodeRegion.weatherBias.length]);
    if (weather) config.weather = weather;
  }

  switch (node.type) {
    case 'event':
      config.armedPercent = Math.min(0.9, config.armedPercent + 0.1);
      break;
    case 'contract':
      config.speedMultiplier *= 1.08;
      config.healthMultiplier *= 1.08;
      break;
    case 'port':
      config.isPortWave = true;
      break;
    case 'boss':
      if (!config.bossName) {
        // Per-act boss names and HP — WAVE_TABLE already defines bosses for waves 5, 10, 15
        // but if the table entry lacks one (shouldn't happen), fall back per act
        const actBossNames = ['Captain Blackbeard', 'Dread Commodore', 'Admiral Drake'];
        const actBossHp = [300, 550, 800];
        const bossAct = Math.max(0, Math.min(2, node.act - 1));
        config.bossName = actBossNames[bossAct];
        config.bossHp = Math.max(config.bossHp, Math.round(actBossHp[bossAct] * config.healthMultiplier));
      }
      if (node.act >= 3 && !config.enemyTypes.includes('navy_warship')) {
        config.enemyTypes.push('navy_warship');
      }
      break;
  }

  // Apply region hazards as wave modifiers
  if (nodeRegion) {
    for (const hazard of nodeRegion.hazards) {
      switch (hazard) {
        case 'fire_reef':
          // Volcanic reefs: fire ships more common, slightly faster enemies
          if (!config.enemyTypes.includes('fire_ship') && node.act >= 2) {
            config.enemyTypes.push('fire_ship');
          }
          config.speedMultiplier *= 1.05;
          break;
        case 'ash_fog':
          // Ashfall reduces visibility — force foggy weather
          config.weather = 'foggy';
          break;
        case 'phantom_current':
          // Ghostly currents: enemies move faster, ghost ships more likely
          config.speedMultiplier *= 1.08;
          if (!config.enemyTypes.includes('ghost_ship') && node.act >= 2) {
            config.enemyTypes.push('ghost_ship');
          }
          break;
        case 'grave_fog':
          // Thick fog of the dead — always night, reduced ship count but tougher
          config.weather = 'night';
          config.healthMultiplier *= 1.1;
          break;
        case 'mine_chain':
          // Imperial minefields: more armed ships
          config.armedPercent = Math.min(0.95, config.armedPercent + 0.15);
          break;
        case 'patrol_net':
          // Navy patrols: extra escorts, more ships
          config.totalShips = Math.min(20, config.totalShips + 2);
          config.armedPercent = Math.min(0.95, config.armedPercent + 0.1);
          break;
        case 'serpent_nest':
          // Serpent-infested waters: tougher enemies, faster
          config.healthMultiplier *= 1.08;
          config.speedMultiplier *= 1.06;
          break;
        case 'storm_wall':
          // Perpetual storm barrier
          config.weather = 'stormy';
          config.speedMultiplier *= 1.1;
          break;
        case 'abyss_vent':
          // Deep ocean vents: extra ships, night conditions
          config.totalShips = Math.min(20, config.totalShips + 1);
          config.weather = 'night';
          break;
        case 'mega_swell':
          // Colossal waves: everything moves faster, more chaotic
          config.speedMultiplier *= 1.12;
          config.weather = 'stormy';
          break;
      }
    }
  }

  return config;
}

function announceEventStart(type: EventType): void {
  const entry = EVENT_START_LOG[type];
  if (!entry) return;
  unlockEventCodex(type);
  telemetry.track('event_start', { type });
  narrative.queue(entry.message, entry.tone);
  ui.addJournalEntry(entry.message, entry.tone);
}

function announceEventEnd(type: EventType, success: boolean): void {
  const entry = EVENT_END_LOG[type];
  if (!entry) return;
  telemetry.track('event_end', { type, success });
  if (type !== 'treasure_map') {
    applyRegionalFactionReputationDelta(success ? 0.3 : -0.25, success ? 'event_success' : 'event_failure');
  }
  if (success) {
    narrative.queue(entry.success, entry.successTone);
    ui.addJournalEntry(entry.success, entry.successTone);
    return;
  }
  if (entry.failure) {
    narrative.queue(entry.failure, entry.failureTone ?? 'warning');
    ui.addJournalEntry(entry.failure, entry.failureTone ?? 'warning');
  }
}

function parseFollowupTrigger(trigger: string): { cardId: string; choice: string } | null {
  if (!trigger.startsWith('followup:')) return null;
  const parts = trigger.split(':');
  if (parts.length < 3) return null;
  const cardId = parts[1]?.trim();
  const choice = parts.slice(2).join(':').trim();
  if (!cardId || !choice) return null;
  return { cardId, choice };
}

function makeFollowupChoiceKey(cardId: string, choice: string): string {
  return `${cardId}:${choice}`;
}

function pruneFollowupChoices(currentWave: number): void {
  for (const [key, expiresWave] of pendingFollowupChoices) {
    if (expiresWave < currentWave) {
      pendingFollowupChoices.delete(key);
    }
  }
}

function queueFollowupChoice(cardId: string, choice: string): void {
  if (!choice || choice === 'none') return;
  const currentWave = progression.getCurrentWave();
  const key = makeFollowupChoiceKey(cardId, choice);
  pendingFollowupChoices.set(key, currentWave + 2);
}

function hasFollowupTrigger(trigger: string, currentWave: number): boolean {
  const parsed = parseFollowupTrigger(trigger);
  if (!parsed) return false;
  const key = makeFollowupChoiceKey(parsed.cardId, parsed.choice);
  const expiresWave = pendingFollowupChoices.get(key);
  return typeof expiresWave === 'number' && expiresWave >= currentWave;
}

function consumeFollowupTrigger(trigger: string): void {
  const parsed = parseFollowupTrigger(trigger);
  if (!parsed) return;
  const key = makeFollowupChoiceKey(parsed.cardId, parsed.choice);
  pendingFollowupChoices.delete(key);
}

function matchesV2EventCardTrigger(
  card: V2EventCard,
  nodeType: MapNodeType | undefined,
  currentWave: number,
): boolean {
  const trigger = card.trigger;
  if (trigger.startsWith('followup:')) {
    return hasFollowupTrigger(trigger, currentWave);
  }
  if (trigger === 'enter_event_node') return nodeType === 'event';
  if (trigger === 'enter_combat_node') return nodeType === 'combat' || nodeType === 'contract';
  if (trigger === 'act_finale') return nodeType === 'boss';
  if (trigger === 'high_infamy') return progression.getScore() >= 1200;
  if (trigger === 'low_health') {
    const s = progression.getPlayerStats();
    return s.health <= s.maxHealth * 0.35;
  }
  if (trigger === 'low_supplies') return economy.getState().supplies <= 8;
  if (trigger === 'low_morale') return economy.getState().supplies <= 5 && crew.getCrew().length <= 1;
  return false;
}

function pickV2EventCard(
  nodeType: MapNodeType | undefined,
  regionId: string | undefined,
  dominantFactionId: string | null,
): V2EventCard | null {
  if (!regionId) return null;
  const currentWave = progression.getCurrentWave();
  pruneFollowupChoices(currentWave);
  const nowSec = time;
  const regionCfg = v2Content.getRegion(regionId);
  const eventBias = new Set(regionCfg?.eventDeckBias ?? []);
  const candidates = v2Content.data.events.filter((card) => {
    if (card.region !== regionId) return false;
    if (!matchesV2EventCardTrigger(card, nodeType, currentWave)) return false;
    if (card.factions.length > 0 && dominantFactionId && !card.factions.includes(dominantFactionId)) return false;
    const cooldownUntil = v2EventCardCooldowns.get(card.id) ?? 0;
    if (cooldownUntil > nowSec) return false;
    return true;
  });
  if (candidates.length === 0) return null;

  const rolled = candidates.filter((card) => Math.random() < card.rarity);
  const pool = rolled.length > 0 ? rolled : candidates;
  const cardWeight = (card: V2EventCard) => card.rarity * (eventBias.has(card.id) ? 1.45 : 1);
  const weightTotal = pool.reduce((sum, card) => sum + cardWeight(card), 0);
  if (weightTotal <= 0) return null;
  let roll = Math.random() * weightTotal;
  for (const card of pool) {
    roll -= cardWeight(card);
    if (roll <= 0) {
      consumeFollowupTrigger(card.trigger);
      return card;
    }
  }
  const fallback = pool[pool.length - 1] ?? null;
  if (fallback) consumeFollowupTrigger(fallback.trigger);
  return fallback;
}

async function applyV2EventCard(
  card: V2EventCard,
  config: WaveConfigV1,
  dominantFactionId: string | null,
): Promise<void> {
  v2EventCardCooldowns.set(card.id, time + card.cooldownSec);
  const crewRoles = new Set(crew.getCrew().map((member) => member.role));
  const stats = progression.getPlayerStats();
  const econState = () => economy.getState();
  let logLine = '';
  let tone: 'warning' | 'neutral' | 'reward' | 'mystic' = 'neutral';
  let branch: 'success' | 'failure' | 'neutral' = 'neutral';
  let choice = 'none';

  switch (card.payload) {
    case 'spawn_fire_wave':
      config.armedPercent = clamp(config.armedPercent + 0.12, 0, 0.95);
      if (!config.enemyTypes.includes('fire_ship')) config.enemyTypes.push('fire_ship');
      logLine = 'Fire hulks sighted ahead. Corsair raiders primed the lane.';
      tone = 'warning';
      break;
    case 'contraband_manifest_choice': {
      choice = await showRunChoicePrompt(
        card.name,
        'Smuggler ledgers are aboard. Decide whether to forge papers or burn the books.',
        [
          {
            id: 'forge_manifest',
            label: 'Forge Manifest',
            detail: 'Ink-stained hands draft fresh paperwork beneath a shuttered lamp.',
            costs: [{ key: 'intel', amount: 1 }],
            costHint: '1 Intel',
            benefitHint: 'Success: +2 Supplies, standing up',
            riskHint: 'No Intel: cargo seized',
          },
          {
            id: 'burn_ledgers',
            label: 'Burn The Ledgers',
            detail: 'You torch the ledgers and let the smoke hide your wake.',
            costHint: 'No cost',
            benefitHint: '+1 Intel now',
            riskHint: 'Patrol pressure up, standing down',
          },
        ],
      );
      if (choice === 'forge_manifest') {
        if (econState().intel >= 1) {
          economy.addIntel(-1);
          economy.addSupplies(2);
          applyFactionReputationDelta(dominantFactionId, 0.25, 'v2_event_card_success');
          logLine = 'False manifests accepted. +2 Supplies, -1 Intel.';
          tone = 'reward';
          branch = 'success';
        } else {
          economy.addSupplies(-1);
          applyFactionReputationDelta(dominantFactionId, -0.2, 'v2_event_card_failure');
          logLine = 'No intel cache to forge from. Inspectors confiscated a crate.';
          tone = 'warning';
          branch = 'failure';
        }
      } else {
        economy.addIntel(1);
        config.armedPercent = clamp(config.armedPercent + 0.05, 0, 0.95);
        applyFactionReputationDelta(dominantFactionId, -0.35, 'v2_event_card_failure');
        logLine = 'Ledgers burned. +1 Intel but patrol guns are now on alert.';
        tone = 'neutral';
        branch = 'neutral';
      }
      break;
    }
    case 'corsair_blood_oath_choice': {
      choice = await showRunChoicePrompt(
        card.name,
        'Redwake captains offer a blood oath before battle.',
        [
          {
            id: 'take_oath',
            label: 'Take The Oath',
            detail: 'Corsair captains carve your name into the oath board before dawn.',
            benefitHint: '+1 Token, faster tempo',
            riskHint: 'Armed resistance up',
          },
          {
            id: 'decline_oath',
            label: 'Keep Distance',
            detail: 'You salute from range and keep your banner clear of the rite.',
            costHint: 'No cost',
            benefitHint: '+1 Supplies',
            riskHint: 'Corsair standing down',
          },
        ],
      );
      if (choice === 'take_oath') {
        config.speedMultiplier *= 1.08;
        config.armedPercent = clamp(config.armedPercent + 0.1, 0, 0.95);
        economy.addReputationTokens(1);
        applyFactionReputationDelta(dominantFactionId, 0.5, 'v2_event_card_success');
        logLine = 'Oath accepted. Battle tempo rises and raiders fight harder. +1 Token.';
        tone = 'mystic';
        branch = 'success';
      } else {
        economy.addSupplies(1);
        applyFactionReputationDelta(dominantFactionId, -0.35, 'v2_event_card_failure');
        logLine = 'Oath declined. +1 Supplies, but corsair trust is reduced.';
        tone = 'neutral';
        branch = 'neutral';
      }
      break;
    }
    case 'morale_tax_choice': {
      const hasQuartermaster = crewRoles.has('quartermaster');
      choice = await showRunChoicePrompt(
        card.name,
        'Harbormasters demand passage toll for this lane.',
        [
          {
            id: 'pay_toll',
            label: 'Pay The Toll',
            detail: 'Coin chests change hands at the buoy while watchfires stay low.',
            costs: [{ key: 'supplies', amount: 2 }],
            costHint: '2 Supplies',
            benefitHint: 'Calm route, standing up',
            riskHint: 'If short: cargo seized',
          },
          {
            id: 'run_blockade',
            label: 'Run The Blockade',
            detail: 'You dim every lantern and gamble on current and fog.',
            costHint: 'No cost',
            benefitHint: 'Skilled crew: +2 Intel',
            riskHint: 'Fail: -2 Supplies, patrols up',
          },
        ],
      );

      if (choice === 'pay_toll') {
        if (economy.spendSupplies(2)) {
          economy.addIntel(1);
          applyFactionReputationDelta(dominantFactionId, 0.45, 'v2_event_card_success');
          logLine = 'Toll paid and route secured. -2 Supplies, +1 Intel.';
          tone = 'reward';
          branch = 'success';
        } else {
          economy.addSupplies(-1);
          applyFactionReputationDelta(dominantFactionId, -0.35, 'v2_event_card_failure');
          logLine = 'Insufficient stores to pay full toll. Patrols seized a crate.';
          tone = 'warning';
          branch = 'failure';
        }
      } else {
        const evasionStrength = (hasQuartermaster ? 1 : 0)
          + (crewRoles.has('navigator') ? 1 : 0)
          + (crewRoles.has('lookout') ? 1 : 0)
          + (stats.maxSpeed >= 15 ? 1 : 0);
        if (evasionStrength >= 2) {
          economy.addIntel(2);
          applyFactionReputationDelta(dominantFactionId, -0.1, 'v2_event_card_neutral');
          logLine = 'Blockade slipped at nightfall. +2 Intel, only minor diplomatic heat.';
          tone = 'neutral';
          branch = 'neutral';
        } else {
          config.armedPercent = clamp(config.armedPercent + 0.08, 0, 0.95);
          economy.addSupplies(-2);
          applyFactionReputationDelta(dominantFactionId, -0.55, 'v2_event_card_failure');
          logLine = 'Blockade run failed. -2 Supplies and heavier armed patrols.';
          tone = 'warning';
          branch = 'failure';
        }
      }
      break;
    }
    case 'ghost_lantern_choice': {
      choice = await showRunChoicePrompt(
        card.name,
        'Lantern lights flicker through the fog. Choose stealth or challenge.',
        [
          {
            id: 'douse_lanterns',
            label: 'Douse Lanterns',
            detail: 'Deck lights vanish and the ship glides by starlight alone.',
            costHint: 'No cost',
            benefitHint: 'Scouts: +Intel, patrols down',
            riskHint: 'No scouts: supplies loss',
          },
          {
            id: 'challenge_phantoms',
            label: 'Challenge The Phantoms',
            detail: 'You raise signal flares and hail the dead in open water.',
            costHint: 'No cost',
            benefitHint: '+1 Token',
            riskHint: 'Ghost threats, tougher hulls',
          },
        ],
      );
      if (choice === 'douse_lanterns') {
        if (crewRoles.has('lookout') || crewRoles.has('navigator')) {
          config.armedPercent = clamp(config.armedPercent - 0.08, 0, 0.95);
          economy.addIntel(1);
          applyFactionReputationDelta(dominantFactionId, 0.2, 'v2_event_card_success');
          logLine = 'Lanterns out. We slipped the phantom line. +1 Intel.';
          tone = 'reward';
          branch = 'success';
        } else {
          economy.addSupplies(-1);
          applyFactionReputationDelta(dominantFactionId, -0.25, 'v2_event_card_failure');
          logLine = 'Course drifted in darkness. -1 Supplies.';
          tone = 'warning';
          branch = 'failure';
        }
      } else {
        if (!config.enemyTypes.includes('ghost_ship')) config.enemyTypes.push('ghost_ship');
        config.healthMultiplier *= 1.05;
        economy.addReputationTokens(1);
        applyFactionReputationDelta(dominantFactionId, 0.1, 'v2_event_card_neutral');
        logLine = 'Phantoms challenged. Enemy hulls harden, but omens grant +1 Token.';
        tone = 'mystic';
        branch = 'neutral';
      }
      break;
    }
    case 'boss_hunter_spawn':
      if (!config.enemyTypes.includes('navy_warship')) config.enemyTypes.push('navy_warship');
      config.totalShips = Math.min(config.totalShips + 1, 14);
      logLine = 'Imperial hunter squadron joins the patrol roster.';
      tone = 'warning';
      break;
    case 'imperial_tax_choice': {
      choice = await showRunChoicePrompt(
        card.name,
        'Imperial clerks board for an immediate tax audit.',
        [
          {
            id: 'submit_audit',
            label: 'Submit To Audit',
            detail: 'Stamped manifests are stacked high as clerks pace your deck.',
            costs: [{ key: 'supplies', amount: 1 }],
            costHint: '1 Supplies',
            benefitHint: '+1 Intel, standing up',
            riskHint: 'If short: inspections tighten',
          },
          {
            id: 'bribe_clerks',
            label: 'Bribe The Clerks',
            detail: 'A quiet purse passes from sleeve to sleeve below the registry lamp.',
            costs: [{ key: 'intel', amount: 2 }],
            costHint: '2 Intel',
            benefitHint: 'If paid: +2 Supplies',
            riskHint: 'If short: -2 Supplies, patrols up',
          },
        ],
      );
      if (choice === 'submit_audit') {
        if (economy.spendSupplies(1)) {
          economy.addIntel(1);
          applyFactionReputationDelta(dominantFactionId, 0.3, 'v2_event_card_success');
          logLine = 'Audit cleared. -1 Supplies, +1 Intel.';
          tone = 'neutral';
          branch = 'success';
        } else {
          config.armedPercent = clamp(config.armedPercent + 0.05, 0, 0.95);
          applyFactionReputationDelta(dominantFactionId, -0.2, 'v2_event_card_failure');
          logLine = 'Manifest was short. Escorts now enforce tighter inspection.';
          tone = 'warning';
          branch = 'failure';
        }
      } else {
        if (econState().intel >= 2) {
          economy.addIntel(-2);
          economy.addSupplies(2);
          applyFactionReputationDelta(dominantFactionId, 0.1, 'v2_event_card_neutral');
          logLine = 'Bribes accepted quietly. -2 Intel, +2 Supplies.';
          tone = 'reward';
          branch = 'neutral';
        } else {
          economy.addSupplies(-2);
          config.armedPercent = clamp(config.armedPercent + 0.08, 0, 0.95);
          applyFactionReputationDelta(dominantFactionId, -0.45, 'v2_event_card_failure');
          logLine = 'Failed bribe attempt. -2 Supplies and heavier patrol response.';
          tone = 'warning';
          branch = 'failure';
        }
      }
      break;
    }
    case 'blockade_grid_choice': {
      choice = await showRunChoicePrompt(
        card.name,
        'A mine-linked blockade closes the shortest route.',
        [
          {
            id: 'cut_lane',
            label: 'Cut Through Mine Lane',
            detail: 'Your helm points straight through the glittering mine corridor.',
            costHint: 'No cost',
            benefitHint: 'Speed/scout: -1 ship, +1 Intel',
            riskHint: 'Else: -2 Supplies, reinforcements',
          },
          {
            id: 'detour_route',
            label: 'Take The Detour',
            detail: 'You hug the outer shoals where the current runs broad and cold.',
            costHint: 'No cost',
            benefitHint: '+1 Supplies',
            riskHint: 'Slower approach',
          },
        ],
      );
      if (choice === 'cut_lane') {
        if (crewRoles.has('navigator') || stats.maxSpeed >= 15) {
          config.totalShips = Math.max(3, config.totalShips - 1);
          economy.addIntel(1);
          applyFactionReputationDelta(dominantFactionId, 0.15, 'v2_event_card_success');
          logLine = 'Mine lane pierced cleanly. -1 ship in enemy roster, +1 Intel.';
          tone = 'reward';
          branch = 'success';
        } else {
          economy.addSupplies(-2);
          config.totalShips = Math.min(14, config.totalShips + 1);
          config.armedPercent = clamp(config.armedPercent + 0.05, 0, 0.95);
          applyFactionReputationDelta(dominantFactionId, -0.3, 'v2_event_card_failure');
          logLine = 'Lane breach failed. -2 Supplies and reinforcements arrive.';
          tone = 'warning';
          branch = 'failure';
        }
      } else {
        config.healthMultiplier *= 0.98;
        config.speedMultiplier *= 0.97;
        economy.addSupplies(1);
        applyFactionReputationDelta(dominantFactionId, -0.05, 'v2_event_card_neutral');
        logLine = 'Detour taken. +1 Supplies, but slower approach and longer exchanges.';
        tone = 'neutral';
        branch = 'neutral';
      }
      break;
    }
    case 'relic_or_risk_choice': {
      const hasScoutCrew = crewRoles.has('lookout') || crewRoles.has('navigator');
      choice = await showRunChoicePrompt(
        card.name,
        'A relic cache lies inland. Decide whether to commit a landing party.',
        [
          {
            id: 'land_party',
            label: 'Commit Landing Party',
            detail: 'Boats drop into surf as drums echo from the tree line.',
            costHint: 'No cost',
            benefitHint: 'Success: +2 Supplies, +2 Intel',
            riskHint: 'Fail: supply loss, patrols up',
          },
          {
            id: 'shadow_market',
            label: 'Sell Coordinates',
            detail: 'A broker takes your chart copy and vanishes before sunrise.',
            costHint: 'No cost',
            benefitHint: '+2 Intel, +1 Token',
            riskHint: 'No relic haul',
          },
        ],
      );

      if (choice === 'shadow_market') {
        economy.addIntel(2);
        economy.addReputationTokens(1);
        applyFactionReputationDelta(dominantFactionId, 0.15, 'v2_event_card_neutral');
        logLine = 'Coordinates sold through smugglers. +2 Intel, +1 Token.';
        tone = 'neutral';
        branch = 'neutral';
      } else {
        if (hasScoutCrew || stats.maxSpeed >= 15 || crewRoles.has('bosun')) {
          economy.addSupplies(2);
          economy.addIntel(2);
          applyFactionReputationDelta(dominantFactionId, 0.35, 'v2_event_card_success');
          logLine = 'Landing party returned with relic crates. +2 Supplies, +2 Intel.';
          tone = 'reward';
          branch = 'success';
        } else {
          economy.addSupplies(-1);
          config.armedPercent = clamp(config.armedPercent + 0.08, 0, 0.95);
          applyFactionReputationDelta(dominantFactionId, -0.35, 'v2_event_card_failure');
          logLine = 'Rivals raided the beachhead first; escorts tighten patrol lines.';
          tone = 'warning';
          branch = 'failure';
        }
      }
      break;
    }
    case 'jungle_relic_choice': {
      choice = await showRunChoicePrompt(
        card.name,
        'A jungle shrine is exposed by tidebreak.',
        [
          {
            id: 'inland_raid',
            label: 'Launch Inland Raid',
            detail: 'Raid boats push upriver toward the shrine before the tide turns.',
            costHint: 'No cost',
            benefitHint: 'Success: +1 Token, +1 Intel',
            riskHint: 'Fail: -2 Supplies, patrols up',
          },
          {
            id: 'hire_guides',
            label: 'Hire Local Guides',
            detail: 'Village pilots arrive with reed maps and quiet warnings.',
            costs: [{ key: 'supplies', amount: 1 }],
            costHint: '1 Supplies',
            benefitHint: '+2 Intel, standing up',
            riskHint: 'If short: deal fails',
          },
        ],
      );
      if (choice === 'hire_guides') {
        if (economy.spendSupplies(1)) {
          economy.addIntel(2);
          applyFactionReputationDelta(dominantFactionId, 0.22, 'v2_event_card_success');
          logLine = 'Guides hired. -1 Supplies, +2 Intel.';
          tone = 'neutral';
          branch = 'success';
        } else {
          economy.addSupplies(-1);
          applyFactionReputationDelta(dominantFactionId, -0.2, 'v2_event_card_failure');
          logLine = 'Guide deal collapsed over payment. -1 Supplies in the scramble.';
          tone = 'warning';
          branch = 'failure';
        }
      } else {
        if (crewRoles.has('bosun') || crewRoles.has('lookout') || stats.maxHealth >= 130) {
          economy.addReputationTokens(1);
          economy.addIntel(1);
          applyFactionReputationDelta(dominantFactionId, 0.3, 'v2_event_card_success');
          logLine = 'Shrine seized. +1 Token, +1 Intel.';
          tone = 'reward';
          branch = 'success';
        } else {
          economy.addSupplies(-2);
          config.armedPercent = clamp(config.armedPercent + 0.07, 0, 0.95);
          applyFactionReputationDelta(dominantFactionId, -0.32, 'v2_event_card_failure');
          logLine = 'Beachhead overrun. -2 Supplies and patrol lines harden.';
          tone = 'warning';
          branch = 'failure';
        }
      }
      break;
    }
    case 'elite_monster_encounter':
      config.specialEvent = config.specialEvent ?? 'sea_serpent';
      config.healthMultiplier *= 1.08;
      logLine = 'Leviathan signs churn below. The next clash will be brutal.';
      tone = 'mystic';
      break;
    case 'abyss_pressure_choice': {
      choice = await showRunChoicePrompt(
        card.name,
        'Depth gauges spike. Choose a route through abyssal pressure fronts.',
        [
          {
            id: 'skim_surface',
            label: 'Skim Surface Currents',
            detail: 'You ride pale surface streams where pressure markers stay quiet.',
            costHint: 'No cost',
            benefitHint: '+1 Supplies',
            riskHint: 'Speed down slightly',
          },
          {
            id: 'dive_signal',
            label: 'Dive For Signal Echo',
            detail: 'Ballast chains groan as the prow noses into the dark.',
            costHint: 'No cost',
            benefitHint: 'Success: +2 Intel, +2 Tokens',
            riskHint: 'Fail: -2 Supplies, hazards up',
          },
        ],
      );
      if (choice === 'skim_surface') {
        economy.addSupplies(1);
        config.speedMultiplier *= 0.99;
        applyFactionReputationDelta(dominantFactionId, -0.04, 'v2_event_card_neutral');
        logLine = 'Surface route held. +1 Supplies with slight speed drag.';
        tone = 'neutral';
        branch = 'neutral';
      } else {
        if (crewRoles.has('surgeon') || crewRoles.has('bosun') || stats.maxHealth >= 130) {
          economy.addIntel(2);
          economy.addReputationTokens(2);
          applyFactionReputationDelta(dominantFactionId, 0.25, 'v2_event_card_success');
          logLine = 'Pressure dive survived. +2 Intel, +2 Tokens.';
          tone = 'reward';
          branch = 'success';
        } else {
          economy.addSupplies(-2);
          config.healthMultiplier *= 1.1;
          config.specialEvent = config.specialEvent ?? 'whirlpool';
          applyFactionReputationDelta(dominantFactionId, -0.35, 'v2_event_card_failure');
          logLine = 'Dive failed. Hull strain rises and whirlpool signatures form.';
          tone = 'warning';
          branch = 'failure';
        }
      }
      break;
    }
    case 'mutiny_whispers_choice': {
      choice = await showRunChoicePrompt(
        card.name,
        'Whispers spread through the lower deck after recent infamy spikes.',
        [
          {
            id: 'share_spoils',
            label: 'Share Extra Spoils',
            detail: 'You open the hold and let the crew claim an extra cut.',
            costs: [{ key: 'supplies', amount: 1 }],
            costHint: '1 Supplies',
            benefitHint: '+1 Token, morale up',
            riskHint: 'If short: trust down',
          },
          {
            id: 'crack_down',
            label: 'Crack Down Hard',
            detail: 'The bosun reads the articles aloud and posts double watches.',
            costHint: 'No cost',
            benefitHint: 'Veterans: +1 Intel',
            riskHint: 'Unsteady crew: supplies loss',
          },
        ],
      );
      if (choice === 'share_spoils') {
        if (economy.spendSupplies(1)) {
          economy.addReputationTokens(1);
          applyFactionReputationDelta(dominantFactionId, 0.2, 'v2_event_card_success');
          logLine = 'Spoils distributed. -1 Supplies, +1 Token.';
          tone = 'reward';
          branch = 'success';
        } else {
          economy.addIntel(-1);
          applyFactionReputationDelta(dominantFactionId, -0.15, 'v2_event_card_failure');
          logLine = 'No supplies to distribute. Crew trust eroded.';
          tone = 'warning';
          branch = 'failure';
        }
      } else {
        if (crew.getCrew().length >= 3 || crewRoles.has('bosun')) {
          economy.addIntel(1);
          applyFactionReputationDelta(dominantFactionId, 0.05, 'v2_event_card_neutral');
          logLine = 'Discipline restored by veteran officers. +1 Intel.';
          tone = 'neutral';
          branch = 'neutral';
        } else {
          economy.addSupplies(-1);
          config.totalShips = Math.min(14, config.totalShips + 1);
          applyFactionReputationDelta(dominantFactionId, -0.25, 'v2_event_card_failure');
          logLine = 'Harsh discipline backfired. -1 Supplies and enemy scouts close in.';
          tone = 'warning';
          branch = 'failure';
        }
      }
      break;
    }
    case 'manifest_inspection_followup': {
      choice = await showRunChoicePrompt(
        card.name,
        'Consortium auditors demand proof for those forged manifests.',
        [
          {
            id: 'submit_docs',
            label: 'Submit Clean Documents',
            detail: 'Sealed dockets are handed over with practiced calm.',
            costs: [{ key: 'intel', amount: 1 }],
            costHint: '1 Intel',
            benefitHint: 'Routes open, +1 Supplies, patrols down',
            riskHint: 'If short: cargo seized',
          },
          {
            id: 'scuttle_evidence',
            label: 'Scuttle Evidence',
            detail: 'Weighted satchels slip overboard before the skiffs arrive.',
            costHint: 'No cost',
            benefitHint: '+1 Intel now',
            riskHint: 'Patrol pressure up, standing down',
          },
        ],
      );
      if (choice === 'submit_docs') {
        if (econState().intel >= 1) {
          economy.addIntel(-1);
          economy.addSupplies(1);
          config.armedPercent = clamp(config.armedPercent - 0.04, 0, 0.95);
          applyFactionReputationDelta(dominantFactionId, 0.25, 'v2_event_card_success');
          logLine = 'Audit passed. -1 Intel, +1 Supplies and reduced patrol pressure.';
          tone = 'reward';
          branch = 'success';
        } else {
          economy.addSupplies(-1);
          applyFactionReputationDelta(dominantFactionId, -0.3, 'v2_event_card_failure');
          logLine = 'No supporting intel cache. Auditors seized cargo manifests.';
          tone = 'warning';
          branch = 'failure';
        }
      } else {
        economy.addIntel(1);
        config.armedPercent = clamp(config.armedPercent + 0.06, 0, 0.95);
        applyFactionReputationDelta(dominantFactionId, -0.28, 'v2_event_card_failure');
        logLine = 'Evidence burned. +1 Intel, but escorts now run hot inspections.';
        tone = 'neutral';
        branch = 'neutral';
      }
      break;
    }
    case 'corsair_retribution_followup': {
      choice = await showRunChoicePrompt(
        card.name,
        'Redwake captains answer the burned-ledger insult with a tribute demand.',
        [
          {
            id: 'pay_blood_price',
            label: 'Pay Blood Price',
            detail: 'Tribute casks are rolled across planks under Redwake eyes.',
            costs: [{ key: 'supplies', amount: 2 }],
            costHint: '2 Supplies',
            benefitHint: 'Escalation avoided, +1 Token',
            riskHint: 'If unpaid: retaliation',
          },
          {
            id: 'stand_and_fight',
            label: 'Stand And Fight',
            detail: 'Guns are run out and flags are nailed to the mast.',
            costHint: 'No cost',
            benefitHint: 'Disciplined crew: respect',
            riskHint: 'Combat pressure up',
          },
        ],
      );
      if (choice === 'pay_blood_price') {
        if (economy.spendSupplies(2)) {
          economy.addReputationTokens(1);
          applyFactionReputationDelta(dominantFactionId, 0.18, 'v2_event_card_neutral');
          logLine = 'Tribute paid. -2 Supplies, +1 Token and open passage.';
          tone = 'neutral';
          branch = 'neutral';
        } else {
          config.armedPercent = clamp(config.armedPercent + 0.1, 0, 0.95);
          applyFactionReputationDelta(dominantFactionId, -0.35, 'v2_event_card_failure');
          logLine = 'Could not pay tribute. Corsair retaliation escalates immediately.';
          tone = 'warning';
          branch = 'failure';
        }
      } else {
        if (!config.enemyTypes.includes('fire_ship')) config.enemyTypes.push('fire_ship');
        config.speedMultiplier *= 1.04;
        config.armedPercent = clamp(config.armedPercent + 0.08, 0, 0.95);
        const disciplinedCrew = crewRoles.has('bosun') || crewRoles.has('gunner');
        applyFactionReputationDelta(dominantFactionId, disciplinedCrew ? 0.12 : -0.2, disciplinedCrew ? 'v2_event_card_success' : 'v2_event_card_failure');
        logLine = disciplinedCrew
          ? 'Battle stations held. Corsairs respect the stand, but combat heats up.'
          : 'Stand was chaotic. Retaliation hardens corsair aggression this wave.';
        tone = disciplinedCrew ? 'mystic' : 'warning';
        branch = disciplinedCrew ? 'success' : 'failure';
      }
      break;
    }
    case 'phantom_tithe_followup': {
      choice = await showRunChoicePrompt(
        card.name,
        'The dead return for unpaid passage. They demand a spectral tithe.',
        [
          {
            id: 'offer_tokens',
            label: 'Offer Reputation Tokens',
            detail: 'You cast marked coins into the wake and wait for silence.',
            costs: [{ key: 'reputationTokens', amount: 1 }],
            costHint: '1 Token',
            benefitHint: 'Avoid haunting, +1 Intel',
            riskHint: 'If short: ghost mark',
          },
          {
            id: 'deny_tithe',
            label: 'Deny The Tithe',
            detail: 'The helm holds steady while ghost voices fade into the mist.',
            costHint: 'No cost',
            benefitHint: 'Keep tokens',
            riskHint: 'Ghost pressure high',
          },
        ],
      );
      if (choice === 'offer_tokens') {
        if (econState().reputationTokens >= 1) {
          economy.addReputationTokens(-1);
          economy.addIntel(1);
          applyFactionReputationDelta(dominantFactionId, 0.08, 'v2_event_card_neutral');
          logLine = 'Tithe accepted by the dead. -1 Token, +1 Intel.';
          tone = 'neutral';
          branch = 'neutral';
        } else {
          config.specialEvent = config.specialEvent ?? 'ghost_ship_event';
          config.healthMultiplier *= 1.06;
          applyFactionReputationDelta(dominantFactionId, -0.28, 'v2_event_card_failure');
          logLine = 'No token tribute available. The dead mark our wake.';
          tone = 'warning';
          branch = 'failure';
        }
      } else {
        config.specialEvent = config.specialEvent ?? 'ghost_ship_event';
        config.armedPercent = clamp(config.armedPercent + 0.06, 0, 0.95);
        applyFactionReputationDelta(dominantFactionId, -0.35, 'v2_event_card_failure');
        logLine = 'Tithe denied. A ghost escort is now hunting this route.';
        tone = 'mystic';
        branch = 'failure';
      }
      break;
    }
    case 'mutiny_trial_followup': {
      choice = await showRunChoicePrompt(
        card.name,
        'After the crackdown, the crew demands a final judgment at sea.',
        [
          {
            id: 'pardon_ringleader',
            label: 'Pardon Ringleader',
            detail: 'You break the irons and call for a full-deck amnesty.',
            costs: [{ key: 'supplies', amount: 1 }],
            costHint: '1 Supplies',
            benefitHint: 'Morale stable, +2 Intel',
            riskHint: 'If short: unrest',
          },
          {
            id: 'make_example',
            label: 'Make An Example',
            detail: 'The sentence is carried out at dawn before the entire watch.',
            costHint: 'No cost',
            benefitHint: 'Veterans: +1 Token',
            riskHint: 'Unsteady crew: losses',
          },
        ],
      );
      if (choice === 'pardon_ringleader') {
        if (economy.spendSupplies(1)) {
          economy.addIntel(2);
          applyFactionReputationDelta(dominantFactionId, 0.12, 'v2_event_card_success');
          logLine = 'Pardon granted. -1 Supplies, +2 Intel from restored cooperation.';
          tone = 'reward';
          branch = 'success';
        } else {
          economy.addSupplies(-1);
          applyFactionReputationDelta(dominantFactionId, -0.2, 'v2_event_card_failure');
          logLine = 'No stores to back the pardon. Grumbling persists below deck.';
          tone = 'warning';
          branch = 'failure';
        }
      } else {
        if (crewRoles.has('bosun') || crew.getCrew().length >= 4) {
          economy.addReputationTokens(1);
          applyFactionReputationDelta(dominantFactionId, 0.05, 'v2_event_card_neutral');
          logLine = 'Order enforced cleanly. +1 Token from hardened discipline.';
          tone = 'neutral';
          branch = 'neutral';
        } else {
          economy.addSupplies(-1);
          config.totalShips = Math.min(14, config.totalShips + 1);
          applyFactionReputationDelta(dominantFactionId, -0.3, 'v2_event_card_failure');
          logLine = 'Execution sparked panic. -1 Supplies and enemy scouts exploit the chaos.';
          tone = 'warning';
          branch = 'failure';
        }
      }
      break;
    }
    case 'relic_hunters_followup': {
      choice = await showRunChoicePrompt(
        card.name,
        'Competing hunter ships close in on your recovered relic routes.',
        [
          {
            id: 'ambush_hunters',
            label: 'Ambush Hunter Fleet',
            detail: 'You vanish behind reef-shadow and wait for pursuit sails.',
            costHint: 'No cost',
            benefitHint: 'Scouts: +Intel, +Token, -1 ship',
            riskHint: 'Fail: -2 Supplies, patrols up',
          },
          {
            id: 'split_haul',
            label: 'Split The Haul',
            detail: 'You cut the relic share and send rivals away with a truce toast.',
            costHint: 'No cost',
            benefitHint: '+2 Supplies, +1 Intel',
            riskHint: 'Lower prestige',
          },
        ],
      );
      if (choice === 'ambush_hunters') {
        if (crewRoles.has('lookout') || crewRoles.has('navigator') || stats.maxSpeed >= 15) {
          economy.addIntel(2);
          economy.addReputationTokens(1);
          config.totalShips = Math.max(3, config.totalShips - 1);
          applyFactionReputationDelta(dominantFactionId, 0.25, 'v2_event_card_success');
          logLine = 'Hunter fleet ambushed successfully. +2 Intel, +1 Token, fewer enemy hulls.';
          tone = 'reward';
          branch = 'success';
        } else {
          economy.addSupplies(-2);
          config.armedPercent = clamp(config.armedPercent + 0.08, 0, 0.95);
          applyFactionReputationDelta(dominantFactionId, -0.28, 'v2_event_card_failure');
          logLine = 'Ambush failed. -2 Supplies and armed escorts now shadow us.';
          tone = 'warning';
          branch = 'failure';
        }
      } else {
        economy.addSupplies(2);
        economy.addIntel(1);
        applyFactionReputationDelta(dominantFactionId, 0.12, 'v2_event_card_neutral');
        logLine = 'Haul split quietly. +2 Supplies, +1 Intel and reduced pursuit.';
        tone = 'neutral';
        branch = 'neutral';
      }
      break;
    }
    // ── Simple modifiers (no choice prompt) ──
    case 'fire_vfx_modifier':
      if (!config.enemyTypes.includes('fire_ship')) config.enemyTypes.push('fire_ship');
      config.speedMultiplier *= 1.05;
      logLine = 'Cinder gale sweeps the lane. Fire hulks ride the hot wind.';
      tone = 'warning';
      break;
    case 'eldritch_fear_vfx':
      config.healthMultiplier *= 1.06;
      config.weather = 'night';
      logLine = 'The abyss whispers. Enemy hulls harden under eldritch pressure.';
      tone = 'mystic';
      break;
    case 'morale_damage_vfx':
      config.armedPercent = clamp(config.armedPercent + 0.06, 0, 0.95);
      if (!config.enemyTypes.includes('ghost_ship')) config.enemyTypes.push('ghost_ship');
      logLine = 'Hollow hull breach detected. Spectral escorts join the patrol.';
      tone = 'warning';
      break;
    case 'hunter_spawn_modifier':
      if (!config.enemyTypes.includes('navy_warship')) config.enemyTypes.push('navy_warship');
      config.totalShips = Math.min(14, config.totalShips + 1);
      config.armedPercent = clamp(config.armedPercent + 0.08, 0, 0.95);
      logLine = 'Bounty posted. A navy hunter squadron joins the pursuit.';
      tone = 'warning';
      break;
    case 'supply_loss_event': {
      const hasSurgeon = crewRoles.has('surgeon');
      const loss = hasSurgeon ? 1 : 3;
      economy.addSupplies(-loss);
      logLine = hasSurgeon
        ? 'Rats in the hold! Surgeon contained the damage. -1 Supplies.'
        : 'Rats devoured the stores. -3 Supplies.';
      tone = 'warning';
      break;
    }

    // ── Choice events ──
    case 'big_loot_choice': {
      choice = await showRunChoicePrompt(
        card.name,
        'An imperial convoy sails heavy with treasure. Strike now or let it pass.',
        [
          {
            id: 'raid_convoy',
            label: 'Raid Convoy',
            detail: 'Guns run out as you cut across the convoy bow under full sail.',
            costHint: 'No cost',
            benefitHint: 'Gunner/Bosun: +4 Supplies, +2 Intel, +1 Token',
            riskHint: 'Fail: -2 Supplies, +2 ships, armed up',
          },
          {
            id: 'let_pass',
            label: 'Let It Pass',
            detail: 'You hold station and watch gold-laden hulls drift by unmolested.',
            costHint: 'No cost',
            benefitHint: '+1 Supplies, standing up',
            riskHint: 'No loot',
          },
        ],
      );
      if (choice === 'raid_convoy') {
        if (crewRoles.has('gunner') || crewRoles.has('bosun')) {
          economy.addSupplies(4);
          economy.addIntel(2);
          economy.addReputationTokens(1);
          applyFactionReputationDelta(dominantFactionId, 0.3, 'v2_event_card_success');
          logLine = 'Convoy raided! +4 Supplies, +2 Intel, +1 Token.';
          tone = 'reward';
          branch = 'success';
        } else {
          economy.addSupplies(-2);
          config.totalShips = Math.min(14, config.totalShips + 2);
          config.armedPercent = clamp(config.armedPercent + 0.1, 0, 0.95);
          applyFactionReputationDelta(dominantFactionId, -0.4, 'v2_event_card_failure');
          logLine = 'Raid botched. -2 Supplies, reinforcements scramble.';
          tone = 'warning';
          branch = 'failure';
        }
      } else {
        economy.addSupplies(1);
        applyFactionReputationDelta(dominantFactionId, 0.15, 'v2_event_card_neutral');
        logLine = 'Convoy passed unmolested. +1 Supplies, reputation intact.';
        tone = 'neutral';
        branch = 'neutral';
      }
      break;
    }
    case 'curse_or_boon_choice': {
      choice = await showRunChoicePrompt(
        card.name,
        'A spectral beacon pulses from the fog. Its light promises power at a price.',
        [
          {
            id: 'accept_curse',
            label: 'Accept Curse',
            detail: 'You sail into the beacon light and feel the hull shudder.',
            costHint: 'No cost',
            benefitHint: '+2 Tokens, +1 Intel',
            riskHint: 'Tougher enemies, ghost ships appear',
          },
          {
            id: 'reject_beacon',
            label: 'Reject Beacon',
            detail: 'You bear away and let the light fade astern.',
            costHint: 'No cost',
            benefitHint: '+1 Supplies, armed% down',
            riskHint: 'No tokens',
          },
        ],
      );
      if (choice === 'accept_curse') {
        config.healthMultiplier *= 1.08;
        if (!config.enemyTypes.includes('ghost_ship')) config.enemyTypes.push('ghost_ship');
        economy.addReputationTokens(2);
        economy.addIntel(1);
        applyFactionReputationDelta(dominantFactionId, 0.2, 'v2_event_card_success');
        logLine = 'Curse accepted. Enemies harden, but +2 Tokens, +1 Intel.';
        tone = 'mystic';
        branch = 'success';
      } else {
        economy.addSupplies(1);
        config.armedPercent = clamp(config.armedPercent - 0.04, 0, 0.95);
        applyFactionReputationDelta(dominantFactionId, -0.1, 'v2_event_card_neutral');
        logLine = 'Beacon rejected. +1 Supplies, patrol pressure eases.';
        tone = 'neutral';
        branch = 'neutral';
      }
      break;
    }
    case 'deep_salvage_choice': {
      choice = await showRunChoicePrompt(
        card.name,
        'Sonar echoes reveal an ancient wreck far below. Risk the dive or skim the surface.',
        [
          {
            id: 'dive_deep',
            label: 'Dive Deep',
            detail: 'Chains rattle as diving bells descend into black water.',
            costHint: 'No cost',
            benefitHint: 'Surgeon/Bosun: +3 Intel, +1 Token',
            riskHint: 'Fail: -2 Supplies, whirlpool',
          },
          {
            id: 'surface_salvage',
            label: 'Surface Salvage',
            detail: 'Hooks drag flotsam from the debris field above the wreck.',
            costHint: 'No cost',
            benefitHint: '+1 Supplies, +1 Intel',
            riskHint: 'No deep haul',
          },
        ],
      );
      if (choice === 'dive_deep') {
        if (crewRoles.has('surgeon') || crewRoles.has('bosun')) {
          economy.addIntel(3);
          economy.addReputationTokens(1);
          applyFactionReputationDelta(dominantFactionId, 0.25, 'v2_event_card_success');
          logLine = 'Deep dive successful! +3 Intel, +1 Token.';
          tone = 'reward';
          branch = 'success';
        } else {
          economy.addSupplies(-2);
          config.specialEvent = config.specialEvent ?? 'whirlpool';
          applyFactionReputationDelta(dominantFactionId, -0.3, 'v2_event_card_failure');
          logLine = 'Dive failed. -2 Supplies, whirlpool forming.';
          tone = 'warning';
          branch = 'failure';
        }
      } else {
        economy.addSupplies(1);
        economy.addIntel(1);
        applyFactionReputationDelta(dominantFactionId, 0.05, 'v2_event_card_neutral');
        logLine = 'Surface salvage yielded +1 Supplies, +1 Intel.';
        tone = 'neutral';
        branch = 'neutral';
      }
      break;
    }
    case 'engine_damage_choice': {
      choice = await showRunChoicePrompt(
        card.name,
        'Volcanic ash clogs the rigging. Repair now or push through the haze.',
        [
          {
            id: 'repair_now',
            label: 'Repair Now',
            detail: 'Crew scramble aloft to clear fouled lines and patch sails.',
            costs: [{ key: 'supplies', amount: 2 }],
            costHint: '2 Supplies',
            benefitHint: 'Success: speed x1.03',
            riskHint: 'If short: speed x0.94',
          },
          {
            id: 'push_through',
            label: 'Push Through',
            detail: 'You accept the drag and press on through choking haze.',
            costHint: 'No cost',
            benefitHint: '+1 Intel',
            riskHint: 'Speed x0.96',
          },
        ],
      );
      if (choice === 'repair_now') {
        if (economy.spendSupplies(2)) {
          config.speedMultiplier *= 1.03;
          applyFactionReputationDelta(dominantFactionId, 0.1, 'v2_event_card_success');
          logLine = 'Rigging cleared. -2 Supplies, speed restored.';
          tone = 'reward';
          branch = 'success';
        } else {
          config.speedMultiplier *= 0.94;
          applyFactionReputationDelta(dominantFactionId, -0.15, 'v2_event_card_failure');
          logLine = 'Not enough supplies for repair. Speed drops sharply.';
          tone = 'warning';
          branch = 'failure';
        }
      } else {
        config.speedMultiplier *= 0.96;
        economy.addIntel(1);
        applyFactionReputationDelta(dominantFactionId, -0.05, 'v2_event_card_neutral');
        logLine = 'Pushed through ash choke. +1 Intel, but sluggish sails.';
        tone = 'neutral';
        branch = 'neutral';
      }
      break;
    }
    case 'exclusive_shop_unlock': {
      choice = await showRunChoicePrompt(
        card.name,
        'A black market broker offers rare goods from a hidden cove.',
        [
          {
            id: 'enter_market',
            label: 'Enter Market',
            detail: 'You follow signal lanterns into a narrow reef passage.',
            costs: [{ key: 'reputationTokens', amount: 1 }],
            costHint: '1 Token',
            benefitHint: 'If paid: +3 Supplies, +2 Intel',
            riskHint: 'If short: -1 Supply',
          },
          {
            id: 'decline_invite',
            label: 'Decline Invite',
            detail: 'You dip your flag and continue on the charted route.',
            costHint: 'No cost',
            benefitHint: '+1 Supply, standing down',
            riskHint: 'No market access',
          },
        ],
      );
      if (choice === 'enter_market') {
        if (econState().reputationTokens >= 1) {
          economy.addReputationTokens(-1);
          economy.addSupplies(3);
          economy.addIntel(2);
          applyFactionReputationDelta(dominantFactionId, 0.2, 'v2_event_card_success');
          logLine = 'Market deal sealed. -1 Token, +3 Supplies, +2 Intel.';
          tone = 'reward';
          branch = 'success';
        } else {
          economy.addSupplies(-1);
          applyFactionReputationDelta(dominantFactionId, -0.15, 'v2_event_card_failure');
          logLine = 'No token to pay entry. Brokers took a supply crate as "toll."';
          tone = 'warning';
          branch = 'failure';
        }
      } else {
        economy.addSupplies(1);
        applyFactionReputationDelta(dominantFactionId, -0.1, 'v2_event_card_neutral');
        logLine = 'Market invite declined. +1 Supply on the safe route.';
        tone = 'neutral';
        branch = 'neutral';
      }
      break;
    }
    case 'fine_or_flee_choice': {
      choice = await showRunChoicePrompt(
        card.name,
        'Imperial inspectors hail your ship for a sanction check.',
        [
          {
            id: 'pay_fine',
            label: 'Pay Fine',
            detail: 'You present cargo and coin for a swift clearance stamp.',
            costs: [{ key: 'supplies', amount: 2 }],
            costHint: '2 Supplies',
            benefitHint: 'If paid: armed% -0.06, +1 Intel',
            riskHint: 'If short: armed% +0.08',
          },
          {
            id: 'flee_inspection',
            label: 'Flee Inspection',
            detail: 'Canvas snaps taut as you break away before the boarding party launches.',
            costHint: 'No cost',
            benefitHint: 'Navigator/Lookout: +1 Intel',
            riskHint: 'Fail: armed% +0.1, +1 ship',
          },
        ],
      );
      if (choice === 'pay_fine') {
        if (economy.spendSupplies(2)) {
          config.armedPercent = clamp(config.armedPercent - 0.06, 0, 0.95);
          economy.addIntel(1);
          applyFactionReputationDelta(dominantFactionId, 0.2, 'v2_event_card_success');
          logLine = 'Fine paid. -2 Supplies, patrols ease, +1 Intel.';
          tone = 'reward';
          branch = 'success';
        } else {
          config.armedPercent = clamp(config.armedPercent + 0.08, 0, 0.95);
          applyFactionReputationDelta(dominantFactionId, -0.25, 'v2_event_card_failure');
          logLine = 'Insufficient funds for fine. Inspections tighten.';
          tone = 'warning';
          branch = 'failure';
        }
      } else {
        if (crewRoles.has('navigator') || crewRoles.has('lookout')) {
          economy.addIntel(1);
          applyFactionReputationDelta(dominantFactionId, -0.1, 'v2_event_card_neutral');
          logLine = 'Evasion successful. +1 Intel from the escape route.';
          tone = 'neutral';
          branch = 'success';
        } else {
          config.armedPercent = clamp(config.armedPercent + 0.1, 0, 0.95);
          config.totalShips = Math.min(14, config.totalShips + 1);
          applyFactionReputationDelta(dominantFactionId, -0.35, 'v2_event_card_failure');
          logLine = 'Escape failed. Armed% spikes and a hunter joins the wave.';
          tone = 'warning';
          branch = 'failure';
        }
      }
      break;
    }
    case 'hidden_supplies_choice': {
      choice = await showRunChoicePrompt(
        card.name,
        'Overgrown ruins hide a cache beneath the canopy. Search or mark for later.',
        [
          {
            id: 'search_ruins',
            label: 'Search Ruins',
            detail: 'Machetes hack through vines as the landing party pushes inland.',
            costHint: 'No cost',
            benefitHint: 'Lookout/Navigator: +3 Supplies, +1 Intel',
            riskHint: 'Fail: -1 Supply, armed up',
          },
          {
            id: 'mark_location',
            label: 'Mark Location',
            detail: 'You plot coordinates and tuck the chart into the captain\'s log.',
            costHint: 'No cost',
            benefitHint: '+1 Intel, +1 Token',
            riskHint: 'No supplies',
          },
        ],
      );
      if (choice === 'search_ruins') {
        if (crewRoles.has('lookout') || crewRoles.has('navigator')) {
          economy.addSupplies(3);
          economy.addIntel(1);
          applyFactionReputationDelta(dominantFactionId, 0.2, 'v2_event_card_success');
          logLine = 'Cache found! +3 Supplies, +1 Intel.';
          tone = 'reward';
          branch = 'success';
        } else {
          economy.addSupplies(-1);
          config.armedPercent = clamp(config.armedPercent + 0.06, 0, 0.95);
          applyFactionReputationDelta(dominantFactionId, -0.2, 'v2_event_card_failure');
          logLine = 'Search turned up rivals. -1 Supply, patrols up.';
          tone = 'warning';
          branch = 'failure';
        }
      } else {
        economy.addIntel(1);
        economy.addReputationTokens(1);
        applyFactionReputationDelta(dominantFactionId, 0.1, 'v2_event_card_neutral');
        logLine = 'Location charted. +1 Intel, +1 Token.';
        tone = 'neutral';
        branch = 'neutral';
      }
      break;
    }
    case 'interrogation_choice': {
      choice = await showRunChoicePrompt(
        card.name,
        'A navy patrol hails you. Cooperate or resist the boarding.',
        [
          {
            id: 'cooperate',
            label: 'Cooperate',
            detail: 'You heave to and present manifests as marines cross the rail.',
            costs: [{ key: 'intel', amount: 1 }],
            costHint: '1 Intel',
            benefitHint: 'If paid: armed% -0.05, +1 Supply',
            riskHint: 'If short: -1 Supply',
          },
          {
            id: 'resist_boarding',
            label: 'Resist Boarding',
            detail: 'Pike and pistol line the bulwark as you wave off the launch.',
            costHint: 'No cost',
            benefitHint: 'Gunner/Bosun: +1 Token',
            riskHint: 'Fail: -2 Supplies, +1 ship',
          },
        ],
      );
      if (choice === 'cooperate') {
        if (econState().intel >= 1) {
          economy.addIntel(-1);
          config.armedPercent = clamp(config.armedPercent - 0.05, 0, 0.95);
          economy.addSupplies(1);
          applyFactionReputationDelta(dominantFactionId, 0.15, 'v2_event_card_success');
          logLine = 'Cooperation accepted. -1 Intel, patrols ease, +1 Supply.';
          tone = 'reward';
          branch = 'success';
        } else {
          economy.addSupplies(-1);
          applyFactionReputationDelta(dominantFactionId, -0.2, 'v2_event_card_failure');
          logLine = 'No intel to share. Inspectors confiscated stores.';
          tone = 'warning';
          branch = 'failure';
        }
      } else {
        if (crewRoles.has('gunner') || crewRoles.has('bosun')) {
          economy.addReputationTokens(1);
          config.armedPercent = clamp(config.armedPercent + 0.04, 0, 0.95);
          applyFactionReputationDelta(dominantFactionId, -0.15, 'v2_event_card_neutral');
          logLine = 'Boarding resisted. +1 Token, slight patrol increase.';
          tone = 'neutral';
          branch = 'success';
        } else {
          economy.addSupplies(-2);
          config.totalShips = Math.min(14, config.totalShips + 1);
          applyFactionReputationDelta(dominantFactionId, -0.35, 'v2_event_card_failure');
          logLine = 'Resistance failed. -2 Supplies, a hunter joins pursuit.';
          tone = 'warning';
          branch = 'failure';
        }
      }
      break;
    }
    case 'new_crew_choice': {
      choice = await showRunChoicePrompt(
        card.name,
        'A stowaway is found below deck. Recruit them or turn them over at the next port.',
        [
          {
            id: 'recruit',
            label: 'Recruit Stowaway',
            detail: 'The stowaway kneels and swears the articles before the mast.',
            costHint: 'No cost',
            benefitHint: '+1 crew level-up, +1 Token',
            riskHint: 'None',
          },
          {
            id: 'turn_over',
            label: 'Turn Over To Port',
            detail: 'You hand the stowaway to harbor authorities for the bounty.',
            costHint: 'No cost',
            benefitHint: '+2 Supplies, standing up',
            riskHint: 'No crew benefit',
          },
        ],
      );
      if (choice === 'recruit') {
        crew.levelUpAll();
        economy.addReputationTokens(1);
        applyFactionReputationDelta(dominantFactionId, 0.1, 'v2_event_card_success');
        logLine = 'Stowaway recruited. Crew leveled up, +1 Token.';
        tone = 'reward';
        branch = 'success';
      } else {
        economy.addSupplies(2);
        applyFactionReputationDelta(dominantFactionId, 0.2, 'v2_event_card_neutral');
        logLine = 'Stowaway turned over. +2 Supplies, standing improved.';
        tone = 'neutral';
        branch = 'neutral';
      }
      break;
    }
    case 'poison_hazard_spawn': {
      choice = await showRunChoicePrompt(
        card.name,
        'A serpent nest blocks the passage. Clear it or navigate around.',
        [
          {
            id: 'clear_nest',
            label: 'Clear Nest',
            detail: 'Harpoons and fire pots are readied for a close-quarters fight.',
            costHint: 'No cost',
            benefitHint: 'Surgeon/Bosun: -1 ship, +1 Token',
            riskHint: 'Fail: health up, speed up for enemies',
          },
          {
            id: 'navigate_around',
            label: 'Navigate Around',
            detail: 'You give the nest a wide berth through shallower waters.',
            costHint: 'No cost',
            benefitHint: '+1 Supplies',
            riskHint: 'Speed x0.97',
          },
        ],
      );
      if (choice === 'clear_nest') {
        if (crewRoles.has('surgeon') || crewRoles.has('bosun')) {
          config.totalShips = Math.max(3, config.totalShips - 1);
          economy.addReputationTokens(1);
          applyFactionReputationDelta(dominantFactionId, 0.2, 'v2_event_card_success');
          logLine = 'Nest cleared. -1 enemy ship, +1 Token.';
          tone = 'reward';
          branch = 'success';
        } else {
          config.healthMultiplier *= 1.1;
          config.speedMultiplier *= 1.05;
          applyFactionReputationDelta(dominantFactionId, -0.2, 'v2_event_card_failure');
          logLine = 'Nest fight went badly. Enemy hulls harden and quicken.';
          tone = 'warning';
          branch = 'failure';
        }
      } else {
        config.speedMultiplier *= 0.97;
        economy.addSupplies(1);
        applyFactionReputationDelta(dominantFactionId, -0.05, 'v2_event_card_neutral');
        logLine = 'Navigated around the nest. +1 Supplies, slight speed drag.';
        tone = 'neutral';
        branch = 'neutral';
      }
      break;
    }
    case 'ration_cut_choice': {
      choice = await showRunChoicePrompt(
        card.name,
        'Crew exhaustion sets in. Decide how to manage dwindling rations.',
        [
          {
            id: 'full_rations',
            label: 'Full Rations',
            detail: 'You break open reserve casks and serve a proper meal.',
            costs: [{ key: 'supplies', amount: 3 }],
            costHint: '3 Supplies',
            benefitHint: '+1 Token, morale stable',
            riskHint: 'Heavy supply cost',
          },
          {
            id: 'half_rations',
            label: 'Half Rations',
            detail: 'Thin gruel and hardtack. The crew grumbles but endures.',
            costHint: 'No cost',
            benefitHint: '-1 Supply only',
            riskHint: 'Speed x0.96, armed% +0.04',
          },
        ],
      );
      if (choice === 'full_rations') {
        if (economy.spendSupplies(3)) {
          economy.addReputationTokens(1);
          applyFactionReputationDelta(dominantFactionId, 0.15, 'v2_event_card_success');
          logLine = 'Full rations served. -3 Supplies, +1 Token, morale holds.';
          tone = 'reward';
          branch = 'success';
        } else {
          economy.addSupplies(-1);
          config.speedMultiplier *= 0.96;
          applyFactionReputationDelta(dominantFactionId, -0.15, 'v2_event_card_failure');
          logLine = 'Not enough supplies for full rations. Crew grumbles.';
          tone = 'warning';
          branch = 'failure';
        }
      } else {
        economy.addSupplies(-1);
        config.speedMultiplier *= 0.96;
        config.armedPercent = clamp(config.armedPercent + 0.04, 0, 0.95);
        applyFactionReputationDelta(dominantFactionId, -0.1, 'v2_event_card_neutral');
        logLine = 'Half rations. -1 Supply, crew slows and tensions rise.';
        tone = 'neutral';
        branch = 'neutral';
      }
      break;
    }
    case 'reputation_payment_choice': {
      choice = await showRunChoicePrompt(
        card.name,
        'Corsair captains demand tribute for passage through their waters.',
        [
          {
            id: 'pay_tribute',
            label: 'Pay Tribute',
            detail: 'Tribute chests are lowered over the side under corsair watch.',
            costs: [{ key: 'reputationTokens', amount: 1 }],
            costHint: '1 Token',
            benefitHint: 'If paid: armed% -0.08, +2 Supplies, standing up',
            riskHint: 'Token cost',
          },
          {
            id: 'refuse_payment',
            label: 'Refuse Payment',
            detail: 'You raise battle flags and dare the corsairs to collect.',
            costHint: 'No cost',
            benefitHint: 'Keep token',
            riskHint: 'Armed% +0.1, fire ships appear, standing down',
          },
        ],
      );
      if (choice === 'pay_tribute') {
        if (econState().reputationTokens >= 1) {
          economy.addReputationTokens(-1);
          config.armedPercent = clamp(config.armedPercent - 0.08, 0, 0.95);
          economy.addSupplies(2);
          applyFactionReputationDelta(dominantFactionId, 0.3, 'v2_event_card_success');
          logLine = 'Tribute paid. -1 Token, +2 Supplies, patrols ease.';
          tone = 'reward';
          branch = 'success';
        } else {
          config.armedPercent = clamp(config.armedPercent + 0.06, 0, 0.95);
          applyFactionReputationDelta(dominantFactionId, -0.2, 'v2_event_card_failure');
          logLine = 'No token for tribute. Corsair displeasure increases.';
          tone = 'warning';
          branch = 'failure';
        }
      } else {
        config.armedPercent = clamp(config.armedPercent + 0.1, 0, 0.95);
        if (!config.enemyTypes.includes('fire_ship')) config.enemyTypes.push('fire_ship');
        applyFactionReputationDelta(dominantFactionId, -0.4, 'v2_event_card_failure');
        logLine = 'Tribute refused. Fire ships and corsair rage follow.';
        tone = 'warning';
        branch = 'failure';
      }
      break;
    }
    case 'shaman_healing_choice': {
      choice = await showRunChoicePrompt(
        card.name,
        'A tribal shaman offers healing arts in exchange for trade goods.',
        [
          {
            id: 'accept_healing',
            label: 'Accept Healing',
            detail: 'Poultices and bitter draughts are brought aboard by canoe.',
            costs: [{ key: 'supplies', amount: 2 }],
            costHint: '2 Supplies',
            benefitHint: 'Heal 25% HP, +1 Intel',
            riskHint: 'Supply cost',
          },
          {
            id: 'trade_knowledge',
            label: 'Trade Knowledge',
            detail: 'You exchange chart copies for medicinal herbs and local lore.',
            costs: [{ key: 'intel', amount: 1 }],
            costHint: '1 Intel',
            benefitHint: 'If paid: +2 Supplies, +1 Token',
            riskHint: 'If short: deal fails',
          },
        ],
      );
      if (choice === 'accept_healing') {
        if (economy.spendSupplies(2)) {
          stats.health = Math.min(stats.health + Math.round(stats.maxHealth * 0.25), stats.maxHealth);
          economy.addIntel(1);
          applyFactionReputationDelta(dominantFactionId, 0.15, 'v2_event_card_success');
          logLine = 'Shaman healed the crew. -2 Supplies, +25% HP, +1 Intel.';
          tone = 'reward';
          branch = 'success';
        } else {
          applyFactionReputationDelta(dominantFactionId, -0.1, 'v2_event_card_failure');
          logLine = 'Not enough supplies for the shaman. Healing declined.';
          tone = 'warning';
          branch = 'failure';
        }
      } else {
        if (econState().intel >= 1) {
          economy.addIntel(-1);
          economy.addSupplies(2);
          economy.addReputationTokens(1);
          applyFactionReputationDelta(dominantFactionId, 0.2, 'v2_event_card_success');
          logLine = 'Knowledge traded. -1 Intel, +2 Supplies, +1 Token.';
          tone = 'reward';
          branch = 'success';
        } else {
          applyFactionReputationDelta(dominantFactionId, -0.1, 'v2_event_card_failure');
          logLine = 'No intel to trade. The shaman paddles away.';
          tone = 'warning';
          branch = 'failure';
        }
      }
      break;
    }
    case 'soul_for_health_choice': {
      choice = await showRunChoicePrompt(
        card.name,
        'A wraith offers to mend your ship in exchange for a fragment of your soul.',
        [
          {
            id: 'trade_soul',
            label: 'Trade Soul Fragment',
            detail: 'Cold light flows from your chest into the wraith\'s lantern.',
            costHint: 'No cost',
            benefitHint: 'Heal 40% HP',
            riskHint: 'Speed x0.97, ghost ship event',
          },
          {
            id: 'refuse_bargain',
            label: 'Refuse Bargain',
            detail: 'You ward the wraith off with iron and salt.',
            costHint: 'No cost',
            benefitHint: '+1 Token, +1 Intel',
            riskHint: 'No healing',
          },
        ],
      );
      if (choice === 'trade_soul') {
        stats.health = Math.min(stats.health + Math.round(stats.maxHealth * 0.4), stats.maxHealth);
        config.speedMultiplier *= 0.97;
        config.specialEvent = config.specialEvent ?? 'ghost_ship_event';
        applyFactionReputationDelta(dominantFactionId, 0.1, 'v2_event_card_neutral');
        logLine = 'Soul fragment traded. +40% HP, but speed drops and ghosts stir.';
        tone = 'mystic';
        branch = 'neutral';
      } else {
        economy.addReputationTokens(1);
        economy.addIntel(1);
        applyFactionReputationDelta(dominantFactionId, -0.05, 'v2_event_card_neutral');
        logLine = 'Bargain refused. +1 Token, +1 Intel.';
        tone = 'neutral';
        branch = 'neutral';
      }
      break;
    }
    case 'trap_combat_spawn':
      config.totalShips = Math.min(14, config.totalShips + 2);
      if (!config.enemyTypes.includes('fire_ship')) config.enemyTypes.push('fire_ship');
      config.armedPercent = clamp(config.armedPercent + 0.12, 0, 0.95);
      config.speedMultiplier *= 1.06;
      logLine = 'Jungle ambush! Raiders spring from hidden coves with fire ships.';
      tone = 'warning';
      break;
    case 'vortex_hazard_spawn': {
      choice = await showRunChoicePrompt(
        card.name,
        'A maelstrom churns ahead. Ride the vortex or circumvent it.',
        [
          {
            id: 'ride_vortex',
            label: 'Ride The Vortex',
            detail: 'You angle the helm into the spinning current and hold on.',
            costHint: 'No cost',
            benefitHint: 'Navigator/Lookout: +2 Intel, -1 ship',
            riskHint: 'Fail: whirlpool event, -1 Supply',
          },
          {
            id: 'circumvent',
            label: 'Circumvent Maelstrom',
            detail: 'You take the long way around the spinning water.',
            costHint: 'No cost',
            benefitHint: '+1 Supply',
            riskHint: 'Speed x0.95',
          },
        ],
      );
      if (choice === 'ride_vortex') {
        if (crewRoles.has('navigator') || crewRoles.has('lookout')) {
          economy.addIntel(2);
          config.totalShips = Math.max(3, config.totalShips - 1);
          applyFactionReputationDelta(dominantFactionId, 0.2, 'v2_event_card_success');
          logLine = 'Vortex navigated! +2 Intel, -1 enemy ship.';
          tone = 'reward';
          branch = 'success';
        } else {
          config.specialEvent = config.specialEvent ?? 'whirlpool';
          economy.addSupplies(-1);
          applyFactionReputationDelta(dominantFactionId, -0.25, 'v2_event_card_failure');
          logLine = 'Vortex ride failed. Whirlpool forms, -1 Supply.';
          tone = 'warning';
          branch = 'failure';
        }
      } else {
        config.speedMultiplier *= 0.95;
        economy.addSupplies(1);
        applyFactionReputationDelta(dominantFactionId, -0.05, 'v2_event_card_neutral');
        logLine = 'Maelstrom circumvented. +1 Supply, slower approach.';
        tone = 'neutral';
        branch = 'neutral';
      }
      break;
    }
    case 'wreck_salvage_choice': {
      choice = await showRunChoicePrompt(
        card.name,
        'A ghost ship drifts nearby. Board the wreck or scuttle it from range.',
        [
          {
            id: 'board_wreck',
            label: 'Board Wreck',
            detail: 'Grappling hooks bite into ghostly timbers as your crew crosses over.',
            costHint: 'No cost',
            benefitHint: 'Lookout/Surgeon: +2 Supplies, +2 Intel',
            riskHint: 'Fail: -1 Supply, ghost ship appears',
          },
          {
            id: 'scuttle',
            label: 'Scuttle And Move On',
            detail: 'A broadside sends the derelict to the deep.',
            costHint: 'No cost',
            benefitHint: '+1 Supply, armed% -0.03',
            riskHint: 'No deep haul',
          },
        ],
      );
      if (choice === 'board_wreck') {
        if (crewRoles.has('lookout') || crewRoles.has('surgeon')) {
          economy.addSupplies(2);
          economy.addIntel(2);
          applyFactionReputationDelta(dominantFactionId, 0.2, 'v2_event_card_success');
          logLine = 'Wreck boarded! +2 Supplies, +2 Intel.';
          tone = 'reward';
          branch = 'success';
        } else {
          economy.addSupplies(-1);
          if (!config.enemyTypes.includes('ghost_ship')) config.enemyTypes.push('ghost_ship');
          applyFactionReputationDelta(dominantFactionId, -0.2, 'v2_event_card_failure');
          logLine = 'Boarding disturbed the dead. -1 Supply, ghost ship appears.';
          tone = 'warning';
          branch = 'failure';
        }
      } else {
        economy.addSupplies(1);
        config.armedPercent = clamp(config.armedPercent - 0.03, 0, 0.95);
        applyFactionReputationDelta(dominantFactionId, 0.05, 'v2_event_card_neutral');
        logLine = 'Wreck scuttled. +1 Supply, patrols ease slightly.';
        tone = 'neutral';
        branch = 'neutral';
      }
      break;
    }
    default:
      logLine = 'Rumors shift the tide, but details remain uncertain.';
      tone = 'neutral';
      break;
  }

  if (choice !== 'none') {
    queueFollowupChoice(card.id, choice);
  }

  narrative.queue(`${card.name}: ${logLine}`, tone);
  ui.addJournalEntry(`${card.name}: ${logLine}`, tone);
  telemetry.track('v2_event_card', {
    id: card.id,
    payload: card.payload,
    trigger: card.trigger,
    region: card.region,
    faction: dominantFactionId ?? 'neutral',
    choice,
    branch,
  });
}

// Track active wave config (V1 with enemy types + boss info)
let activeWaveConfigV1: WaveConfigV1 | null = null;
let currentBoss: MerchantV1 | null = null;

interface ActiveContractObjective {
  wave: number;
  factionId: string | null;
  factionName: string;
  contractType: 'captures' | 'armed_captures' | 'plunder_gold';
  target: number;
  rewardSupplies: number;
  rewardIntel: number;
  rewardTokens: number;
  rewardGold: number;
  penaltySupplies: number;
  penaltyIntel: number;
  progressLabel: string;
  targetLabel: string;
  announcedMidpoint: boolean;
  announcedComplete: boolean;
}

function cloneWaveConfig(config: WaveConfigV1): WaveConfigV1 {
  return {
    ...config,
    enemyTypes: [...config.enemyTypes],
  };
}

function toContractSnapshot(objective: ActiveContractObjective): RunCheckpointContractSnapshot {
  return { ...objective };
}

function fromContractSnapshot(snapshot: RunCheckpointContractSnapshot): ActiveContractObjective {
  return { ...snapshot };
}

function spawnEnemy(enemyType: EnemyType, isBoss: boolean) {
  const waveConfig = activeWaveConfigV1 ?? progression.getWaveConfigV1();
  const props = EnemyAISystem.getSpawnProps(enemyType, isBoss, waveConfig);
  if (gameStarted && !screensaverActive) {
    unlockEnemyCodex(enemyType);
  }

  const angle = Math.random() * Math.PI * 2;
  const dist = 30 + Math.random() * 40;
  const px = playerPos.x + Math.cos(angle) * dist;
  const pz = playerPos.z + Math.sin(angle) * dist;

  const mesh = createShipMesh(props.hullColor, props.sailColor, props.scale);

  // Ghost ships get spectral effect
  if (enemyType === 'ghost_ship') {
    GhostShipEffect.applyGhostEffect(mesh, false);
  }

  if (weather.getCurrentState() === 'night') {
    setShipLanterns(mesh, true);
  }

  const heading = Math.random() * Math.PI * 2;
  mesh.position.set(px, 0, pz);
  scene.add(mesh);

  const m: MerchantV1 = {
    mesh,
    pos: new THREE.Vector3(px, 0, pz),
    heading,
    speed: props.speed,
    baseSpeed: props.baseSpeed,
    state: 'sailing',
    sinkTimer: 0,
    sinkPhase: 0,
    value: props.value,
    id: nextMerchantId++,
    hp: props.hp,
    maxHp: props.maxHp,
    armed: props.armed,
    fireTimer: props.fireTimer,
    hitRadius: props.hitRadius,
    scale: props.scale,
    zigzagTimer: 0,
    zigzagDir: Math.random() > 0.5 ? 1 : -1,
    convoyLeaderId: -1,
    convoyOffset: new THREE.Vector3(),
    chainSlowTimer: 0,
    isBoss: props.isBoss,
    bossEnraged: false,
    surrendering: false,
    enemyType: props.enemyType,
    phaseTimer: props.phaseTimer,
    isPhased: props.isPhased,
    explosionRadius: props.explosionRadius,
    hasTreasureMap: false,
    fleeTimer: props.fleeTimer,
    formationIndex: props.formationIndex,
    formationLeaderId: props.formationLeaderId,
  };

  merchants.push(m);
  if (lastIsNight) setShipLanterns(mesh, true);

  if (isBoss) {
    currentBoss = m;
    const bossName = waveConfig.bossName ?? `Captain ${PIRATE_NAMES[Math.floor(Math.random() * PIRATE_NAMES.length)]}`;
    ui.showBossHealthBar(bossName);
    ui.updateBossHealth(m.hp, m.maxHp);
    ui.addJournalEntry(`Enemy flagship sighted: ${bossName}.`, 'warning');
    audio.playBossWarning();
    audio.setBossMode(true);
  }
}

// ===================================================================
//  Game state
// ===================================================================

let gameStarted = false;
let gamePaused = false;
let combo = 0;
let lastCaptureTime = -Infinity;
let waveAnnouncePending = false;
let waveAnnounceTimer = 0;
let waveCompleteTimer = 0;
let creakTimer = 0;
let scoreAtWaveStart = 0;
let gameOverFired = false;
let currentRunSeed = 0;


let islandDiscoveryScanTimer = 0;
const discoveredIslandSeeds = new Set<number>();
let v2HudRefreshTimer = 0;
let factionFeedbackTimer = 0;
const pendingFactionReputation = new Map<string, number>();
let capturesThisWave = 0;
let armedCapturesThisWave = 0;
let waveCaptureGold = 0;
let activeContractObjective: ActiveContractObjective | null = null;
const v2EventCardCooldowns = new Map<string, number>();
const pendingFollowupChoices = new Map<string, number>();
let codexOpen = false;
let codexResumePausedState = false;
let runSetupOpen = false;
let selectedRunShipClass: ShipClass = 'brigantine';
let selectedDoctrineId = v2Content.data.doctrines[0]?.id ?? '';
let beginWaveInProgress = false;
let pauseMenuOpen = false;

function refreshResumeButton(): void {
  const resumeBtn = document.getElementById('resume-btn');
  if (!resumeBtn) return;
  resumeBtn.style.display = loadRunCheckpoint() ? 'block' : 'none';
}

function clearRunCheckpointAndRefresh(): void {
  clearRunCheckpoint();
  refreshResumeButton();
}

function buildRunCheckpoint(): RunCheckpointV1 | null {
  if (!gameStarted || screensaverActive || editorMode || editorPlayTestMode) return null;
  const waveConfig = activeWaveConfigV1 ? cloneWaveConfig(activeWaveConfigV1) : cloneWaveConfig(progression.getWaveConfigV1());
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    shipClass: selectedRunShipClass,
    doctrineId: selectedDoctrineId,
    seed: currentRunSeed,
    progression: progression.getRunSnapshot(),
    map: mapNodes.getSnapshot(),
    economy: economy.getState(),
    factionReputation: factions.getReputationSnapshot(),
    crew: crew.getSnapshot(),
    activeWaveConfig: waveConfig,
    activeContractObjective: activeContractObjective ? toContractSnapshot(activeContractObjective) : null,
    capturesThisWave,
    armedCapturesThisWave,
    waveCaptureGold,
  };
}

function saveRunCheckpointNow(): void {
  const checkpoint = buildRunCheckpoint();
  if (!checkpoint) return;
  if (saveRunCheckpoint(checkpoint)) {
    refreshResumeButton();
  }
}

function resumeSavedRunIfAvailable(): void {
  const checkpoint = loadRunCheckpoint();
  if (!checkpoint) {
    refreshResumeButton();
    return;
  }
  resumeRunFromCheckpoint(checkpoint);
}

// Screensaver mode
let lastIsNight = false;
let screensaverActive = false;
let screensaverWeatherTimer = 0;
let screensaverWeatherIndex = 0;
const screensaverWeathers: Array<'clear' | 'foggy' | 'stormy' | 'night'> = ['clear', 'foggy', 'night', 'stormy'];
const screensaverShips: THREE.Group[] = [];

// Screensaver wave config — base stats for demo enemies
const screensaverWaveConfig: WaveConfigV1 = {
  wave: 1,
  totalShips: 4,
  armedPercent: 0.4,
  speedMultiplier: 1.0,
  healthMultiplier: 1.0,
  weather: 'clear',
  enemyTypes: ['merchant_sloop', 'merchant_galleon', 'escort_frigate'],
  bossName: null,
  bossHp: 0,
  isPortWave: false,
  specialEvent: null,
};

// Autopilot state machine
type AutopilotState = 'idle' | 'seek_island' | 'seek_merchant' | 'engage';
let autopilotState: AutopilotState = 'idle';
let autopilotTimer = 0;
let autopilotTarget: THREE.Vector3 | null = null;
let autopilotTargetId = -1;
let screensaverSpawnTimer = 0;

// Dev/God mode flags
let devGodMode = false;
let devInstakill = false;

// Scenario editor state
let editorMode = false;
let editorPlayTestMode = false;
let scenarioEditor: import('./ScenarioEditor').ScenarioEditor | null = null;
let editorUI: import('./EditorUI').EditorUI | null = null;
let editorCamera: import('./EditorCamera').EditorCamera | null = null;
let playTestScenario: Scenario | null = null;

type DevPanelInstance = {
  toggle: () => void;
};

let devPanel: DevPanelInstance | null = null;
let devPanelInitPromise: Promise<void> | null = null;

async function ensureDevPanel(): Promise<void> {
  if (!ENABLE_DEV_PANEL || devPanel) return;
  if (devPanelInitPromise) return devPanelInitPromise;
  devPanelInitPromise = import('./DevPanel').then(({ DevPanel }) => {
    devPanel = new DevPanel({
      onSetGold: (v) => { progression.devSetScore(v); ui.updateScore(v); },
      onSetHealth: (v) => {
        progression.devSetHealth(v);
        const s = progression.getPlayerStats();
        ui.updateHealth(s.health, s.maxHealth);
      },
      onSetMaxSpeed: (v) => progression.devSetMaxSpeed(v),
      onSetDamage: (v) => { progression.devSetCannonDamage(v); syncUpgradesToCombat(); },
      onSetWave: (v) => progression.devSetWave(v),
      onToggleGodMode: (v) => { devGodMode = v; },
      onToggleInstakill: (v) => { devInstakill = v; },
      onSpawnEnemy: (type, isBoss) => spawnEnemy(type, isBoss),
      onSetWeather: (state) => weather.transitionTo(state, 2),
      onExportTelemetry: () => exportTelemetrySnapshot('dev_panel'),
      getState: () => ({
        gold: progression.getScore(),
        health: progression.getPlayerStats().health,
        maxHealth: progression.getPlayerStats().maxHealth,
        maxSpeed: progression.getPlayerStats().maxSpeed,
        damage: progression.getPlayerStats().cannonDamage,
        wave: progression.getCurrentWave(),
        weather: weather.getCurrentState(),
        godMode: devGodMode,
        instakill: devInstakill,
      }),
    });
  }).finally(() => {
    devPanelInitPromise = null;
  });
  return devPanelInitPromise;
}

function toggleDevPanel(): void {
  if (!ENABLE_DEV_PANEL) return;
  void ensureDevPanel().then(() => {
    devPanel?.toggle();
  });
}

if (ENABLE_DEV_PANEL) {
  void ensureDevPanel();
}

function exportTelemetrySnapshot(reason: string): string {
  if (!ENABLE_TELEMETRY_EXPORT) {
    return 'Telemetry export is disabled in this build.';
  }
  const doctrine = progression.getActiveDoctrine();
  const snapshot = telemetry.buildExport({
    reason,
    wave: progression.getCurrentWave(),
    score: progression.getScore(),
    shipClass: progression.getShipClass(),
    doctrineId: doctrine?.id ?? 'none',
    doctrineName: doctrine?.name ?? 'None',
  });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `booty-hunt-telemetry-${stamp}.json`;
  try {
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    telemetry.track('telemetry_export', {
      reason,
      totalEvents: snapshot.totalEvents,
      filename,
    });
    return `Telemetry exported: ${filename} (${snapshot.totalEvents} events)`;
  } catch {
    return 'Telemetry export failed.';
  }
}

function canOpenCodex(): boolean {
  if (!gameStarted || screensaverActive) return false;
  if (beginWaveInProgress) return false;
  if (inPort || waveCompleteInProgress) return false;
  const runSummary = document.getElementById('run-summary');
  if (runSummary && runSummary.style.display !== 'none') return false;
  return true;
}

function closeCodex(): void {
  if (!codexOpen) return;
  codexOpen = false;
  ui.hideCodex();
  gamePaused = codexResumePausedState;
  codexResumePausedState = false;
}

function openCodex(): void {
  if (!canOpenCodex()) return;
  if (codexOpen) return;
  codexResumePausedState = gamePaused;
  gamePaused = true;
  codexOpen = true;
  ui.showCodex(buildCodexViewModel());
  ui.onCodexClose(() => closeCodex());
}

function toggleCodex(): void {
  if (codexOpen) {
    closeCodex();
    return;
  }
  openCodex();
}

function isSettingsPanelVisible(): boolean {
  const panel = document.getElementById('settings-panel');
  return !!panel && panel.style.display !== 'none';
}

function hidePauseAndSettings(): void {
  pauseMenuOpen = false;
  ui.hideSettings();
  ui.hidePauseMenu();
}

function quitToTitleFromPause(): void {
  hidePauseAndSettings();
  clearRunCheckpointAndRefresh();

  gameStarted = false;
  gamePaused = false;
  inPort = false;
  waveCompleteInProgress = false;
  waveCompleteTimer = 0;
  waveAnnouncePending = false;
  waveAnnounceTimer = 0;
  beginWaveInProgress = false;
  activeWaveConfigV1 = null;
  activeContractObjective = null;
  capturesThisWave = 0;
  armedCapturesThisWave = 0;
  waveCaptureGold = 0;

  for (const m of merchants) {
    scene.remove(m.mesh);
  }
  merchants.length = 0;
  currentBoss = null;

  if (portScene) {
    portScene.dispose(scene);
    portScene = null;
  }
  world.dispose();
  closeCodex();
  ui.hidePortUI();
  ui.hidePortCrewHire();
  ui.hideBossHealthBar();
  ui.hideMapChoice();
  ui.hideChoicePrompt();
  ui.clearCaptainLog();
  audio.stopPortAmbience();
  audio.setPortMode(false);
  audio.setBossMode(false);

  const titleEl = document.getElementById('title');
  if (titleEl) {
    titleEl.style.display = '';
    titleEl.style.opacity = '1';
    titleEl.style.pointerEvents = '';
  }

  // Hide HUD elements
  const codexToggle = document.getElementById('codex-toggle');
  if (codexToggle) codexToggle.classList.remove('show');
  const crewHud = document.getElementById('crew-hud');
  if (crewHud) crewHud.classList.remove('show');
}

function openSettingsPanelFromPause(): void {
  const settings = progression.getRuntimeSettings();
  ui.showSettings(
    {
      master: Math.round(settings.masterVolume * 100),
      music: Math.round(settings.musicVolume * 100),
      sfx: Math.round(settings.sfxVolume * 100),
      quality: settings.graphicsQuality,
      uiScale: settings.accessibility.uiScale,
      textScale: settings.accessibility.textScale,
      motionIntensity: settings.accessibility.motionIntensity,
      flashIntensity: settings.accessibility.flashIntensity,
      colorblindMode: settings.accessibility.colorblindMode,
      keyBindings: settings.keyBindings as any,
    },
    (key, value) => {
      updateRuntimeSetting(
        key as any,
        value,
      );
    },
  );
}

function openPauseMenu(): void {
  if (!gameStarted || screensaverActive || editorMode || editorPlayTestMode || runSetupOpen || inPort || waveCompleteInProgress) {
    return;
  }
  gamePaused = true;
  pauseMenuOpen = true;
  closeCodex();
  ui.showPauseMenu(
    () => {
      hidePauseAndSettings();
      gamePaused = false;
    },
    () => {
      openSettingsPanelFromPause();
    },
    () => {
      quitToTitleFromPause();
    },
  );
}

function openRunSetup(): void {
  if (gameStarted || screensaverActive || runSetupOpen) return;
  const shipConfigs = getRunSetupShipConfigs();
  const unlockedShip = shipConfigs.find((cfg) => !cfg.locked)?.id ?? 'brigantine';
  if (!shipConfigs.some((cfg) => cfg.id === selectedRunShipClass && !cfg.locked)) {
    selectedRunShipClass = unlockedShip;
  }
  const doctrines = getRunSetupDoctrineOptions();
  if (doctrines.length === 0) {
    startGame(selectedRunShipClass, selectedDoctrineId);
    return;
  }

  runSetupOpen = true;
  ui.showRunSetup(
    shipConfigs,
    doctrines,
    {
      shipClass: selectedRunShipClass,
      doctrineId: selectedDoctrineId,
    },
    (shipClass, doctrineId, seed) => {
      runSetupOpen = false;
      selectedRunShipClass = shipClass;
      selectedDoctrineId = doctrineId;
      ui.hideShipSelect();
      startGame(shipClass, doctrineId, seed);
    },
  );
}

// ===================================================================
//  Input: keyboard
// ===================================================================

const keys: Record<string, boolean> = {};

window.addEventListener('keydown', (e) => {
  const settings = progression.getRuntimeSettings();
  const b = settings.keyBindings;
  const boundKeys = [b.forward, b.backward, b.left, b.right, b.port, b.starboard, b.spyglass, b.codex];
  
  if (e.key === ' ' || e.key === 'Escape' || e.key === '/' || e.key === '[' || e.key === ']' || e.key.startsWith('Arrow') || boundKeys.includes(e.key.toLowerCase())) {
    e.preventDefault();
  }

  // Editor mode input handling
  if (editorMode && !editorPlayTestMode) {
    if (ENABLE_DEV_PANEL && e.key === '`') { toggleDevPanel(); return; }
    if (e.key === 'Escape') { exitEditorMode(); return; }
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); scenarioEditor?.redo(); return; }
    if (e.ctrlKey && e.key.toLowerCase() === 'z') { e.preventDefault(); scenarioEditor?.undo(); return; }
    if (e.ctrlKey && e.key.toLowerCase() === 'y') { e.preventDefault(); scenarioEditor?.redo(); return; }
    if (e.key === 'Delete' && scenarioEditor && scenarioEditor.getSelectedIndex() >= 0) {
      scenarioEditor.removeIsland(scenarioEditor.getSelectedIndex());
      editorUI?.refresh();
      return;
    }
    // Let EditorCamera handle WASD
    return;
  }
  if (editorPlayTestMode) {
    keys[e.key.toLowerCase()] = true;
    if (e.key === 'Escape') { exitPlayTestMode(); return; }
    if (ENABLE_DEV_PANEL && e.key === '`') { toggleDevPanel(); return; }
    // Fall through to normal game input handling for Q/E/WASD
  }

  if (runSetupOpen) {
    if (e.key.toLowerCase() === 'escape') {
      runSetupOpen = false;
      ui.hideShipSelect();
    }
    return;
  }

  if (e.key === 'Escape') {
    if (codexOpen) {
      closeCodex();
      return;
    }
    if (isSettingsPanelVisible()) {
      ui.hideSettings();
      return;
    }
    if (pauseMenuOpen) {
      hidePauseAndSettings();
      gamePaused = false;
      return;
    }
    if (gameStarted && !screensaverActive) {
      openPauseMenu();
      return;
    }
  }

  if (!editorPlayTestMode) keys[e.key.toLowerCase()] = true;
  if (ENABLE_DEV_PANEL && e.key === '`') { toggleDevPanel(); return; }
  if (screensaverActive && e.key !== 'F5' && e.key !== 'F12') { stopScreensaver(); return; }
  if (!gameStarted && !screensaverActive && !editorMode && e.key !== 'F5' && e.key !== 'F12' && e.key.toLowerCase() !== 'c') {
    openRunSetup();
    return;
  }

  if (e.key.toLowerCase() === b.codex && gameStarted && !screensaverActive) {
    toggleCodex();
    return;
  }

  // Mute toggle
  if (e.key.toLowerCase() === 'm' && gameStarted) {
    const muted = audio.toggleMute();
    ui.setMuted(muted);
  }

  // Camera zoom controls
  if (gameStarted && !gamePaused) {
    if (e.key === '[') {
      cameraZoom = THREE.MathUtils.clamp(cameraZoom - 0.1, 0.5, 2.0);
    }
    if (e.key === ']') {
      cameraZoom = THREE.MathUtils.clamp(cameraZoom + 0.1, 0.5, 2.0);
    }
    if (e.key === '/') {
      cameraZoom = 1.0;
    }
  }

  if (ENABLE_TELEMETRY_EXPORT && e.key.toLowerCase() === 'x' && gameStarted && !screensaverActive) {
    const message = exportTelemetrySnapshot('hotkey');
    ui.addJournalEntry(message, 'neutral');
  }

  // Cannon firing
  if (gameStarted && !gamePaused) {
    if (e.key.toLowerCase() === b.port) { firePort(); }
    if (e.key.toLowerCase() === b.starboard) { fireStarboard(); }
  }
});
window.addEventListener('keyup', (e) => {
  keys[e.key.toLowerCase()] = false;
});

// Mouse wheel for camera zoom
window.addEventListener('wheel', (e) => {
  // Only zoom if game is active and not in menus
  if (!gameStarted || gamePaused || editorMode || runSetupOpen || codexOpen) return;

  e.preventDefault();
  const delta = e.deltaY > 0 ? 0.1 : -0.1;
  cameraZoom = THREE.MathUtils.clamp(cameraZoom + delta, 0.5, 2.0);
}, { passive: false });

// ===================================================================
//  Cannon firing helpers
// ===================================================================

function firePort() {
  if (!combat.canFirePort) return;
  const stats = progression.getPlayerStats();
  const count = stats.fullBroadside ? 5 : 3;
  combat.fireBroadside(playerPos, playerAngle, 'port', stats.cannonDamage, playerSpeed, count);
  audio.playCannon();
  audio.playMuzzleBlast();

  // Neptune's Wrath charge indicator
  if (combat.neptunesWrathActive) {
    audio.playNeptuneCharge(combat.neptunesShotCounter);
  }

  // Muzzle flash + smoke from port side
  const sideDir = new THREE.Vector3(-Math.cos(playerAngle), 0.3, Math.sin(playerAngle));
  const smokeOrigin = playerPos.clone().add(sideDir.clone().multiplyScalar(1.5));
  smokeOrigin.y = playerPos.y + 0.8;
  cannonSmoke.emit(smokeOrigin, sideDir, 15);
  muzzleFlash.emit(smokeOrigin, sideDir);

  // Screen shake on fire
  triggerScreenShake(0.15);

  // Ship recoil
  recoilOffset = 0.3;
}

function fireStarboard() {
  if (!combat.canFireStarboard) return;
  const stats = progression.getPlayerStats();
  const count = stats.fullBroadside ? 5 : 3;
  combat.fireBroadside(playerPos, playerAngle, 'starboard', stats.cannonDamage, playerSpeed, count);
  audio.playCannon();
  audio.playMuzzleBlast();

  // Neptune's Wrath charge indicator
  if (combat.neptunesWrathActive) {
    audio.playNeptuneCharge(combat.neptunesShotCounter);
  }

  // Muzzle flash + smoke from starboard side
  const sideDir = new THREE.Vector3(Math.cos(playerAngle), 0.3, -Math.sin(playerAngle));
  const smokeOrigin = playerPos.clone().add(sideDir.clone().multiplyScalar(1.5));
  smokeOrigin.y = playerPos.y + 0.8;
  cannonSmoke.emit(smokeOrigin, sideDir, 15);
  muzzleFlash.emit(smokeOrigin, sideDir);

  // Screen shake on fire
  triggerScreenShake(0.15);

  // Ship recoil
  recoilOffset = 0.3;
}

// ===================================================================
//  Input: touch (virtual joystick + spyglass)
// ===================================================================

let touchFwd = 0;
let touchTurn = 0;
let touchSpyglass = false;
let joystickTouchId: number | null = null;
let spyglassTouchId: number | null = null;
let joystickCenterX = 0;
let joystickCenterY = 0;

const JOYSTICK_RADIUS = 55;
const joystickBase = document.getElementById('joystick-base')!;
const joystickThumb = document.getElementById('joystick-thumb')!;

function handleTouchStart(e: TouchEvent) {
  if (screensaverActive) {
    e.preventDefault();
    stopScreensaver();
    return;
  }
  if (runSetupOpen) return;
  if (!gameStarted) {
    const target = e.target as HTMLElement;
    if (target.closest('#screensaver-btn, #resume-btn, #editor-btn, #history-btn')) return;
    if (!editorMode) {
      e.preventDefault();
      openRunSetup();
    }
    return;
  }

  // If the game is paused or in a UI state, don't preventDefault
  // so that 'click' events can be generated for UI interaction.
  if (gamePaused) return;

  // Also don't preventDefault if we're touching a button or interactive UI element
  const target = e.target as HTMLElement;
  if (target && (
    target.tagName === 'BUTTON' ||
    target.closest('button') ||
    target.classList.contains('upgrade-card') ||
    target.closest('#btn-port, #btn-starboard, #codex-toggle, #tutorial-skip')
  )) {
    return;
  }

  e.preventDefault();

  // Recover from stuck joystick/spyglass if the tracked touch disappeared (iOS swipe-up, alert, etc.)
  if (joystickTouchId !== null) {
    let found = false;
    for (let j = 0; j < e.touches.length; j++) {
      if (e.touches[j].identifier === joystickTouchId) { found = true; break; }
    }
    if (!found) {
      joystickTouchId = null;
      joystickBase.style.opacity = '0';
      joystickThumb.style.transform = 'translate(-50%, -50%)';
      touchFwd = 0;
      touchTurn = 0;
    }
  }
  if (spyglassTouchId !== null) {
    let found = false;
    for (let j = 0; j < e.touches.length; j++) {
      if (e.touches[j].identifier === spyglassTouchId) { found = true; break; }
    }
    if (!found) {
      spyglassTouchId = null;
      touchSpyglass = false;
    }
  }

  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i];
    if (t.clientX < innerWidth * 0.5) {
      if (joystickTouchId === null) {
        joystickTouchId = t.identifier;
        joystickCenterX = t.clientX;
        joystickCenterY = t.clientY;
        joystickBase.style.left = `${t.clientX}px`;
        joystickBase.style.top = `${t.clientY}px`;
        joystickBase.style.opacity = '1';
      }
    } else {
      spyglassTouchId = t.identifier;
      touchSpyglass = true;
    }
  }
}

function handleTouchMove(e: TouchEvent) {
  if (gamePaused || runSetupOpen || !gameStarted) return;

  let tracking = false;
  for (let i = 0; i < e.changedTouches.length; i++) {
    const id = e.changedTouches[i].identifier;
    if (id === joystickTouchId || id === spyglassTouchId) {
      tracking = true;
      break;
    }
  }
  if (!tracking) return;

  e.preventDefault();
  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i];
    if (t.identifier === joystickTouchId) {
      const dx = t.clientX - joystickCenterX;
      const dy = t.clientY - joystickCenterY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const clamped = Math.min(dist, JOYSTICK_RADIUS);
      const angle = Math.atan2(dy, dx);
      const cx = Math.cos(angle) * clamped;
      const cy = Math.sin(angle) * clamped;

      joystickThumb.style.transform = `translate(calc(-50% + ${cx}px), calc(-50% + ${cy}px))`;
      touchTurn = -(cx / JOYSTICK_RADIUS);
      touchFwd = -(cy / JOYSTICK_RADIUS);
    }
  }
}

function handleTouchEnd(e: TouchEvent) {
  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i];
    if (t.identifier === joystickTouchId) {
      joystickTouchId = null;
      joystickBase.style.opacity = '0';
      joystickThumb.style.transform = 'translate(-50%, -50%)';
      touchFwd = 0;
      touchTurn = 0;
    }
    if (t.identifier === spyglassTouchId) {
      spyglassTouchId = null;
      touchSpyglass = false;
    }
  }
}

window.addEventListener('touchstart', handleTouchStart, { passive: false });
window.addEventListener('touchmove', handleTouchMove, { passive: false });
window.addEventListener('touchend', handleTouchEnd);
window.addEventListener('touchcancel', handleTouchEnd);
window.addEventListener('mousedown', (e) => {
  if (screensaverActive) {
    stopScreensaver();
    return;
  }
  const target = e.target as HTMLElement;
  if (target.closest('#screensaver-btn, #resume-btn, #editor-btn, #history-btn')) return;
  if (!gameStarted && !runSetupOpen && !editorMode && target.closest('#title')) {
    openRunSetup();
  }
});

const controlsEl = document.getElementById('controls');
if (controlsEl) {
  const controlLines = [
    'WASD - Sail',
    'Q / E - Cannons',
    'SPACE - Spyglass',
    'ESC - Pause',
    'C - Codex',
    'M - Mute',
  ];
  if (ENABLE_TELEMETRY_EXPORT) {
    controlLines.push('X - Export Telemetry');
  }
  controlsEl.innerHTML = controlLines.join('<br/>');
}

// ===================================================================
//  Mobile UI tweaks
// ===================================================================

if (isMobile) {
  const hint = document.getElementById('title-hint');
  if (hint) hint.textContent = 'Touch to set sail';
  const ctrl = document.getElementById('controls');
  if (ctrl) ctrl.innerHTML = 'Left: Steer &bull; Right: Spyglass &bull; Buttons: Cannons &bull; Codex button';

  ui.showMobileCannonButtons(firePort, fireStarboard);
}

// ===================================================================
//  Game start & wave flow
// ===================================================================

// ===================================================================
//  Screensaver mode
// ===================================================================

function startScreensaver() {
  runSetupOpen = false;
  ui.hideShipSelect();
  ui.hideChoicePrompt();
  closeCodex();
  v2EventCardCooldowns.clear();
  pendingFollowupChoices.clear();
  beginWaveInProgress = false;
  pendingFactionReputation.clear();
  factionFeedbackTimer = 0;
  capturesThisWave = 0;
  armedCapturesThisWave = 0;
  waveCaptureGold = 0;
  activeContractObjective = null;
  screensaverActive = true;
  screensaverWeatherTimer = 0;
  screensaverWeatherIndex = 0;
  screensaverSpawnTimer = 0;
  ui.screensaverMode = true;
  ui.clearCaptainLog();
  // Force-hide journal DOM in case clearCaptainLog missed it
  const journalEl = document.getElementById('captains-journal');
  if (journalEl) journalEl.classList.remove('show');

  audio.init();

  // Hide title
  const title = document.getElementById('title');
  if (title) {
    title.style.opacity = '0';
    title.style.pointerEvents = 'none';
  }

  // Set screensaver wave config for enemy spawning
  activeWaveConfigV1 = screensaverWaveConfig;

  // Generate world islands and feed reef data to ocean shader
  world.generateIslands();
  ocean.setReefPositions(world.getReefData());

  // Init player at origin, sailing forward
  playerPos.set(0, 0, 0);
  playerAngle = 0;
  playerSpeed = 8;

  // Init camera behind player
  camPos.set(-Math.sin(playerAngle) * 11, 9, -Math.cos(playerAngle) * 11);
  camPos.add(playerPos);
  camLookAt.copy(playerPos);

  // Init autopilot
  autopilotState = 'idle';
  autopilotTimer = 3 + Math.random() * 3;
  autopilotTarget = null;
  autopilotTargetId = -1;

  // Start with clear weather
  weather.transitionTo('clear', 2);
}

function stopScreensaver() {
  runSetupOpen = false;
  ui.hideShipSelect();
  ui.hideChoicePrompt();
  closeCodex();
  v2EventCardCooldowns.clear();
  pendingFollowupChoices.clear();
  beginWaveInProgress = false;
  pendingFactionReputation.clear();
  factionFeedbackTimer = 0;
  capturesThisWave = 0;
  armedCapturesThisWave = 0;
  waveCaptureGold = 0;
  activeContractObjective = null;
  screensaverActive = false;
  ui.screensaverMode = false;

  // Remove all merchants from scene
  for (const m of merchants) {
    scene.remove(m.mesh);
  }
  merchants.length = 0;

  // Remove old screensaverShips (backward compat)
  for (const ship of screensaverShips) {
    scene.remove(ship);
  }
  screensaverShips.length = 0;

  // Reset player
  playerPos.set(0, 0, 0);
  playerAngle = 0;
  playerSpeed = 0;

  // Dispose world islands
  world.dispose();

  // Reset combat (clear cannonballs)
  combat.portCooldown = 0;
  combat.starboardCooldown = 0;

  // Reset ocean position
  ocean.update(time, new THREE.Vector3());

  // Reset weather to clear
  weather.transitionTo('clear', 2);

  // Reset wave config
  activeWaveConfigV1 = null;

  // Show title again
  const title = document.getElementById('title');
  if (title) {
    title.style.opacity = '1';
    title.style.pointerEvents = '';
  }
}

function updateAutopilot(dt: number) {
  const turnRate = 2.2;
  const islands = world.getIslands();

  autopilotTimer -= dt;

  switch (autopilotState) {
    case 'idle': {
      // Sail forward with gentle wander
      playerSpeed = THREE.MathUtils.lerp(playerSpeed, 10, 1 - Math.exp(-2 * dt));
      playerAngle += (Math.sin(time * 0.3) * 0.3) * dt;

      // After timer expires, pick a target
      if (autopilotTimer <= 0) {
        // Try to find a merchant first
        let nearestMerchant: MerchantV1 | null = null;
        let nearestMDist = Infinity;
        for (const m of merchants) {
          if (m.state === 'sinking') continue;
          const d = _tmpVec3A.copy(m.pos).sub(playerPos).length();
          if (d < nearestMDist) {
            nearestMDist = d;
            nearestMerchant = m;
          }
        }

        if (nearestMerchant && nearestMDist < 80) {
          autopilotState = 'seek_merchant';
          autopilotTarget = nearestMerchant.pos;
          autopilotTargetId = nearestMerchant.id;
          autopilotTimer = 30;
        } else if (islands.length > 0) {
          // Pick a random island to visit
          const island = islands[Math.floor(Math.random() * islands.length)];
          autopilotState = 'seek_island';
          autopilotTarget = island.pos;
          autopilotTimer = 20;
        } else {
          autopilotTimer = 3 + Math.random() * 3;
        }
      }
      break;
    }

    case 'seek_island': {
      if (!autopilotTarget) { autopilotState = 'idle'; autopilotTimer = 2; break; }

      playerSpeed = THREE.MathUtils.lerp(playerSpeed, 10, 1 - Math.exp(-2 * dt));

      const toIsland = Math.atan2(
        autopilotTarget.x - playerPos.x,
        autopilotTarget.z - playerPos.z,
      );
      const diff = normalizeAngle(toIsland - playerAngle);
      playerAngle += Math.sign(diff) * Math.min(Math.abs(diff), turnRate * dt);

      const dist = _tmpVec3A.copy(autopilotTarget).sub(playerPos).length();
      if (dist < 35 || autopilotTimer <= 0) {
        autopilotState = 'idle';
        autopilotTimer = 5 + Math.random() * 3;
      }
      break;
    }

    case 'seek_merchant': {
      // Check if target still exists
      const target = merchants.find(m => m.id === autopilotTargetId && m.state !== 'sinking');
      if (!target || autopilotTimer <= 0) {
        autopilotState = 'idle';
        autopilotTimer = 3 + Math.random() * 3;
        break;
      }

      autopilotTarget = target.pos;
      playerSpeed = THREE.MathUtils.lerp(playerSpeed, 12, 1 - Math.exp(-2 * dt));

      const toTarget = Math.atan2(
        autopilotTarget.x - playerPos.x,
        autopilotTarget.z - playerPos.z,
      );
      const diff = normalizeAngle(toTarget - playerAngle);
      playerAngle += Math.sign(diff) * Math.min(Math.abs(diff), turnRate * dt);

      const dist = _tmpVec3A.copy(autopilotTarget).sub(playerPos).length();
      if (dist < 25) {
        autopilotState = 'engage';
        autopilotTimer = 15;
      }
      break;
    }

    case 'engage': {
      const target = merchants.find(m => m.id === autopilotTargetId && m.state !== 'sinking');
      if (!target || autopilotTimer <= 0) {
        autopilotState = 'idle';
        autopilotTimer = 5 + Math.random() * 3;
        break;
      }

      autopilotTarget = target.pos;
      playerSpeed = THREE.MathUtils.lerp(playerSpeed, 8, 1 - Math.exp(-2 * dt));

      // Circle the target
      const toTarget = Math.atan2(
        autopilotTarget.x - playerPos.x,
        autopilotTarget.z - playerPos.z,
      );
      const dist = _tmpVec3A.copy(autopilotTarget).sub(playerPos).length();

      // Orbit: steer perpendicular + slightly toward target
      const orbitAngle = toTarget + Math.PI / 2;
      const approachBlend = Math.max(0, (dist - 15) / 20);
      const desiredAngle = normalizeAngle(orbitAngle) * (1 - approachBlend) + normalizeAngle(toTarget) * approachBlend;
      const diff = normalizeAngle(desiredAngle - playerAngle);
      playerAngle += Math.sign(diff) * Math.min(Math.abs(diff), turnRate * dt);

      // Fire broadsides when target is abeam (perpendicular)
      const relAngle = Math.abs(normalizeAngle(toTarget - playerAngle));
      if (relAngle > Math.PI / 4 && relAngle < Math.PI * 3 / 4 && dist < 30) {
        // Port side (target is to the left)
        if (normalizeAngle(toTarget - playerAngle) > 0 && combat.canFirePort) {
          firePort();
        }
        // Starboard side (target is to the right)
        if (normalizeAngle(toTarget - playerAngle) < 0 && combat.canFireStarboard) {
          fireStarboard();
        }
      }
      break;
    }
  }
}

// Wire up screensaver button
const screensaverBtn = document.getElementById('screensaver-btn');
if (screensaverBtn) {
  screensaverBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    startScreensaver();
  });
}
const historyBtn = document.getElementById('history-btn');
if (historyBtn) {
  historyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    ui.showRunHistory(loadRunHistory());
  });
}
const resumeBtn = document.getElementById('resume-btn');
if (resumeBtn) {
  resumeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    resumeSavedRunIfAvailable();
  });
}
const codexToggleBtn = document.getElementById('codex-toggle');
if (codexToggleBtn) {
  codexToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleCodex();
  });
}

let lastCodexToggleVisible: boolean | null = null;

function syncCodexToggleVisibility(): void {
  if (!codexToggleBtn) return;
  const shouldShow = gameStarted && !screensaverActive && !editorMode && !editorPlayTestMode;
  if (lastCodexToggleVisible === shouldShow) return;
  lastCodexToggleVisible = shouldShow;
  codexToggleBtn.style.display = shouldShow ? '' : 'none';
}

syncCodexToggleVisibility();

const editorBtn = document.getElementById('editor-btn');
if (editorBtn) {
  if (!ENABLE_SCENARIO_EDITOR) {
    editorBtn.style.display = 'none';
  } else {
    editorBtn.style.display = '';
    editorBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      void enterEditorMode();
    });
  }
}
refreshResumeButton();

// ===================================================================
//  Scenario Editor Functions
// ===================================================================

async function enterEditorMode(scenario?: Scenario): Promise<void> {
  if (!ENABLE_SCENARIO_EDITOR) return;
  if (editorMode) return;
  if (screensaverActive) stopScreensaver();
  if (gameStarted) return; // don't enter from mid-game

  const runtime = await loadEditorRuntime();

  // Close run setup if it raced open from the window mousedown
  if (runSetupOpen) {
    runSetupOpen = false;
    ui.hideShipSelect();
  }

  editorMode = true;
  editorPlayTestMode = false;

  // Hide title screen and game HUD
  const titleEl = document.getElementById('title');
  if (titleEl) titleEl.style.display = 'none';
  ui.hideAll();

  const sc = scenario ?? runtime.createEmptyScenario();

  // Lazy init editor systems
  if (!editorCamera) editorCamera = new runtime.EditorCamera();
  if (!scenarioEditor) scenarioEditor = new runtime.ScenarioEditor();
  if (!editorUI) {
    editorUI = new runtime.EditorUI({
      onToolChange: (tool) => scenarioEditor?.setTool(tool),
      onIslandTypeSelect: (type) => scenarioEditor?.setPlaceType(type),
      onIslandPropertyChange: (index, key, value) => {
        scenarioEditor?.updateIslandProperty(index, key as keyof import('./Scenario').ScenarioIsland, value as never);
      },
      onWaveAdd: () => {
        const s = editorUI?.getScenario();
        if (s) { s.waves.push(runtime.createDefaultWave()); editorUI?.refresh(); }
      },
      onWaveEdit: (index, wave) => {
        const s = editorUI?.getScenario();
        if (s && index >= 0 && index < s.waves.length) { s.waves[index] = wave; editorUI?.refresh(); }
      },
      onWaveDelete: (index) => {
        const s = editorUI?.getScenario();
        if (s && s.waves.length > 1) { s.waves.splice(index, 1); editorUI?.refresh(); }
      },
      onWaveReorder: (from, to) => {
        const s = editorUI?.getScenario();
        if (s && from >= 0 && from < s.waves.length && to >= 0 && to < s.waves.length) {
          const [moved] = s.waves.splice(from, 1);
          s.waves.splice(to, 0, moved);
          editorUI?.refresh();
        }
      },
      onWinConditionChange: (conditions) => {
        const s = editorUI?.getScenario();
        if (s) s.winConditions = conditions;
      },
      onSave: () => {},
      onLoad: (loadedScenario) => {
        exitEditorMode();
        void enterEditorMode(loadedScenario);
      },
      onPlayTest: () => { void enterPlayTestMode(); },
      onExitEditor: () => exitEditorMode(),
      onUndo: () => scenarioEditor?.undo(),
      onRedo: () => scenarioEditor?.redo(),
      onStartWeatherChange: (w) => {
        const s = editorUI?.getScenario();
        if (s) { s.startWeather = w; weather.transitionTo(w, 2); }
      },
    });
  }

  // Wire up editor ↔ UI callbacks
  scenarioEditor.onSelectionChanged = (index) => {
    const island = scenarioEditor?.getSelectedIsland() ?? null;
    editorUI?.refreshProperties(index, island);
  };
  scenarioEditor.onIslandsChanged = () => {
    editorUI?.refresh();
  };

  editorCamera.enable();
  scenarioEditor.enter(sc, scene, camera, world, ocean);
  editorUI.show(sc);

  // Set starting weather
  weather.transitionTo(sc.startWeather, 1);
}

function exitEditorMode(): void {
  if (!editorMode) return;
  editorMode = false;
  editorPlayTestMode = false;

  editorCamera?.disable();
  scenarioEditor?.exit();
  editorUI?.hide();

  // Dispose world and restore title
  world.dispose();

  ui.showAll();
  const titleEl = document.getElementById('title');
  if (titleEl) {
    titleEl.style.display = '';
    titleEl.style.opacity = '1';
  }
}

async function enterPlayTestMode(): Promise<void> {
  if (!editorMode || !editorUI || !scenarioEditor) return;
  const runtime = await loadEditorRuntime();
  clearRunCheckpointAndRefresh();

  const sc = editorUI.getScenario();
  if (!sc || sc.waves.length === 0) return;

  playTestScenario = sc;
  editorPlayTestMode = true;

  // Disable editor systems but keep editor mode flag
  editorCamera?.disable();
  scenarioEditor.exit();
  editorUI.hide();

  // Show game HUD
  ui.showAll();
  const titleEl = document.getElementById('title');
  if (titleEl) titleEl.style.display = 'none';

  // Reload islands into world from scenario
  const islands = sc.islands.map((si, i) => {
    const config = (window as any).__ISLAND_TYPE_CONFIGS ?? {};
    // Build Island objects from ScenarioIsland
    return {
      type: si.type as IslandType,
      name: `Island ${i + 1}`,
      pos: new THREE.Vector3(si.x, 0.8, si.z),
      radius: si.radius,
      reefRadius: si.radius * 1.6,
      hasTreasure: si.hasTreasure,
      treasureCollected: false,
      meshCreated: false,
      meshGroup: null as THREE.Group | null,
      seed: si.seed,
    };
  });
  world.loadIslands(islands);
  world.forceCreateAllMeshes();
  ocean.setReefPositions(world.getReefData());

  // Set custom wave table
  const waveTable = runtime.scenarioWavesToWaveTable(sc.waves);
  progression.reset();
  progression.initializeStats('brigantine');
  progression.setCustomWaveTable(waveTable);

  // Start game
  gameStarted = true;
  gamePaused = false;

  // Reset player position
  playerPos.set(0, 0, 0);
  playerAngle = 0;
  playerSpeed = 0;

  // Sync player stats
  syncUpgradesToCombat();
  const stats = progression.getPlayerStats();
  ui.updateHealth(stats.health, stats.maxHealth);
  ui.updateScore(0);

  // Begin first wave (simplified — no V2 overlays)
  beginPlayTestWave();
}

function beginPlayTestWave(): void {
  progression.startWave();
  const config = progression.getWaveConfigV1();
  activeWaveConfigV1 = config;
  progression.onWaveStart();
  scoreAtWaveStart = progression.getScore();

  // Hardtack Rations: green heal flash at wave start
  if ((progression.getPlayerStats().hpRegenPerWave ?? 0) > 0) {
    screenJuice.triggerHeal();
    const s = progression.getPlayerStats();
    ui.updateHealth(s.health, s.maxHealth);
  }

  // Apply crew bonuses
  progression.applyCrewBonuses(crew.getCrewBonuses());
  syncUpgradesToCombat();

  // Announce wave
  ui.showWaveAnnouncement(config.wave, config.bossName !== null);
  waveAnnouncePending = true;
  waveAnnounceTimer = 1.5;
  warDrumsTimer = 0; // Reset war drums timer at wave start

  // Weather transition
  weather.transitionTo(config.weather, config.wave === 1 ? 1 : 10);
  audio.setWeatherIntensity(weather.getCurrentConfig().windIntensity);

  if (config.wave > 1) audio.playWaveComplete();

  // Trigger special event if wave specifies one
  if (config.specialEvent) {
    events.startEvent(config.specialEvent, playerPos, world.getIslands().length);
  }
}

function exitPlayTestMode(): void {
  if (!editorPlayTestMode || !playTestScenario) return;
  editorPlayTestMode = false;
  gameStarted = false;
  gamePaused = false;
  gameOverFired = false;

  // Clean up merchants
  for (let i = merchants.length - 1; i >= 0; i--) {
    scene.remove(merchants[i].mesh);
  }
  merchants.length = 0;
  currentBoss = null;

  // Reset progression
  progression.clearCustomWaveTable();
  progression.reset();

  // Hide game HUD
  ui.hideAll();
  ui.hideBossHealthBar();

  // Re-enter editor with the same scenario
  editorMode = false; // reset so enterEditorMode works
  void enterEditorMode(playTestScenario);
  playTestScenario = null;
}



function showGameplayHudImmediate(): void {
  const titleEl = document.getElementById('title');
  if (titleEl) {
    titleEl.style.display = 'none';
    titleEl.style.opacity = '0';
    titleEl.style.pointerEvents = 'none';
  }
  const healthBar = document.getElementById('health-bar');
  if (healthBar) healthBar.style.opacity = '1';
  const waveCounter = document.getElementById('wave-counter');
  if (waveCounter) waveCounter.style.opacity = '1';
  const cdPort = document.getElementById('cooldown-port');
  if (cdPort) cdPort.style.opacity = '1';
  const cdStarboard = document.getElementById('cooldown-starboard');
  if (cdStarboard) cdStarboard.style.opacity = '1';
  const minimap = document.getElementById('minimap-container');
  if (minimap) minimap.classList.add('show');
}

function resumeRunFromCheckpoint(checkpoint: RunCheckpointV1): void {
  runSetupOpen = false;
  pauseMenuOpen = false;
  ui.hidePauseMenu();
  ui.hideSettings();
  ui.hideShipSelect();
  ui.hideChoicePrompt();
  ui.hideMapChoice();
  ui.hideRunSummary();
  closeCodex();

  if (screensaverActive) stopScreensaver();
  if (editorMode) exitEditorMode();

  gameStarted = true;
  gamePaused = false;
  gameOverFired = false;
  waveCompleteInProgress = false;
  waveCompleteTimer = 0;
  waveAnnouncePending = false;
  waveAnnounceTimer = 0;
  beginWaveInProgress = false;

  pendingFactionReputation.clear();
  factionFeedbackTimer = 0;
  capturesThisWave = Math.max(0, checkpoint.capturesThisWave);
  armedCapturesThisWave = Math.max(0, checkpoint.armedCapturesThisWave);
  waveCaptureGold = Math.max(0, checkpoint.waveCaptureGold);
  activeContractObjective = checkpoint.activeContractObjective
    ? fromContractSnapshot(checkpoint.activeContractObjective)
    : null;

  for (const m of merchants) {
    scene.remove(m.mesh);
  }
  merchants.length = 0;
  nextMerchantId = 0;
  currentBoss = null;
  audio.setBossMode(false);

  if (portScene) {
    portScene.dispose(scene);
    portScene = null;
  }
  inPort = false;
  ui.hidePortUI();
  ui.hidePortCrewHire();
  audio.stopPortAmbience();
  audio.setPortMode(false);

  selectedRunShipClass = checkpoint.shipClass;
  selectedDoctrineId = checkpoint.doctrineId;
  currentRunSeed = checkpoint.seed;

  progression.reset();
  const doctrine = getDoctrineById(checkpoint.doctrineId);
  progression.initializeStats(checkpoint.shipClass, doctrine);
  progression.restoreRunSnapshot(checkpoint.progression);
  mapNodes.restoreSnapshot(checkpoint.map);
  factions.applyReputationSnapshot(checkpoint.factionReputation);
  economy.applyState(checkpoint.economy);
  crew.restoreSnapshot(checkpoint.crew ?? []);

  world.dispose();
  world.generateIslands();
  ocean.setReefPositions(world.getReefData());
  activeWaveConfigV1 = checkpoint.activeWaveConfig ? cloneWaveConfig(checkpoint.activeWaveConfig) : progression.getWaveConfigV1();

  playerPos.set(0, 0, 0);
  playerAngle = 0;
  playerSpeed = 0;
  playerVel.set(0, 0, 0);
  combo = 0;
  lastCaptureTime = -Infinity;

  syncUpgradesToCombat();
  const stats = progression.getPlayerStats();
  ui.updateHealth(stats.health, stats.maxHealth);
  ui.updateScore(progression.getScore());
  ui.updateWaveCounter(
    progression.getCurrentWave(),
    progression.getShipsRemaining(),
    progression.getShipsTotal(),
  );
  ui.updateCrewHUD(crew.getCrew().map(member => ({
    role: member.role,
    level: member.level,
    icon: CREW_ROLE_CONFIGS[member.role].icon,
  })));

  discoveredIslandSeeds.clear();
  islandDiscoveryScanTimer = 0;
  v2HudRefreshTimer = 0;
  narrative.reset();
  ui.clearCaptainLog();
  ui.addJournalEntry('Run resumed from checkpoint.', 'neutral');


  showGameplayHudImmediate();
  weather.transitionTo(activeWaveConfigV1.weather, 1);
  audio.init();
  audio.setWeatherIntensity(weather.getCurrentConfig().windIntensity);
  spawnWaveFleet();
  saveRunCheckpointNow();
}

function startGame(shipClass: ShipClass = selectedRunShipClass, doctrineId: string = selectedDoctrineId, customSeed?: number) {
  const availableShips = getRunSetupShipConfigs();
  const fallbackShip = availableShips.find((cfg) => !cfg.locked)?.id ?? 'brigantine';
  if (!availableShips.some((cfg) => cfg.id === shipClass && !cfg.locked)) {
    shipClass = fallbackShip;
  }
  runSetupOpen = false;
  clearRunCheckpointAndRefresh();
  ui.hideShipSelect();
  ui.hideChoicePrompt();
  closeCodex();
  v2EventCardCooldowns.clear();
  pendingFollowupChoices.clear();
  beginWaveInProgress = false;
  pendingFactionReputation.clear();
  factionFeedbackTimer = 0;
  capturesThisWave = 0;
  armedCapturesThisWave = 0;
  waveCaptureGold = 0;
  activeContractObjective = null;
  selectedRunShipClass = shipClass;
  if (screensaverActive) stopScreensaver();
  gameStarted = true;
  gamePaused = false;
  for (const key of Object.keys(keys)) {
    keys[key] = false;
  }

  progression.reset();
  const doctrine = getDoctrineById(doctrineId);
  selectedDoctrineId = doctrine?.id ?? doctrineId;
  progression.initializeStats(shipClass, doctrine);
  syncUpgradesToCombat();

  camPos.copy(camera.position);
  camLookAt.set(0, 0, 0);

  audio.init();

  // Generate world islands and feed reef data to ocean shader
  world.generateIslands();
  const reefData = world.getReefData();
  ocean.setReefPositions(reefData);
  currentRunSeed = customSeed ?? Math.floor(Math.random() * 0x7fffffff);
  mapNodes.startRun(currentRunSeed);
  factions.reset();
  economy.resetRun();
  telemetry.resetRun();
  telemetry.track('run_start', {
    seed: currentRunSeed,
    shipClass,
    doctrine: doctrine?.id ?? 'none',
  });
  discoveredIslandSeeds.clear();
  islandDiscoveryScanTimer = 0;
  v2HudRefreshTimer = 0;
  narrative.reset();
  ui.clearCaptainLog();
  ui.addJournalEntry(`We set course for ${world.getRegionName()}.`, 'neutral');
  if (doctrine) {
    ui.addJournalEntry(`Doctrine set: ${doctrine.name}. ${doctrine.summary}`, 'mystic');
  }
  narrative.onRunStart(world.getRegionName());
  const currentRegion = mapNodes.getCurrentRegion();
  if (currentRegion) {
    unlockRegionCodex(currentRegion.id);
    narrative.onRegionEntered(currentRegion.name, currentRegion.theme);
    const dominantFactionId = applyFactionPressureProfileForRegion(currentRegion.factionPressure);
    if (dominantFactionId) {
      unlockFactionCodex(dominantFactionId);
      const dominantFaction = v2Content.getFaction(dominantFactionId);
      if (dominantFaction) narrative.onFactionPressure(dominantFaction.name);
    }
  } else {
    EnemyAISystem.resetPressureProfile();
  }
  const currentNode = mapNodes.getCurrentNode();
  if (currentNode) narrative.onNodeStart(currentNode.label);



  setTimeout(() => {
    ui.hideTitle();
    const healthBar = document.getElementById('health-bar');
    if (healthBar) healthBar.style.opacity = '1';
    const waveCounter = document.getElementById('wave-counter');
    if (waveCounter) waveCounter.style.opacity = '1';
    const cdPort = document.getElementById('cooldown-port');
    if (cdPort) cdPort.style.opacity = '1';
    const cdStarboard = document.getElementById('cooldown-starboard');
    if (cdStarboard) cdStarboard.style.opacity = '1';
    const minimap = document.getElementById('minimap-container');
    if (minimap) minimap.classList.add('show');
    const codexToggle = document.getElementById('codex-toggle');
    if (codexToggle) codexToggle.classList.add('show');
    const crewHud = document.getElementById('crew-hud');
    if (crewHud) crewHud.classList.add('show');
  }, 1200);

  beginWave();
}

async function beginWave() {
  if (beginWaveInProgress) return;
  beginWaveInProgress = true;
  gamePaused = true;
  try {
    // Start wave (progression state transition) and get V1 config
    progression.startWave();
    capturesThisWave = 0;
    armedCapturesThisWave = 0;
    waveCaptureGold = 0;
    const baseConfig = progression.getWaveConfigV1();
    const config = applyMapNodeToWaveConfig(baseConfig);
    activeWaveConfigV1 = config;
    progression.onWaveStart();
    scoreAtWaveStart = progression.getScore();

    // Hardtack Rations: green heal flash at wave start
    if ((progression.getPlayerStats().hpRegenPerWave ?? 0) > 0) {
      screenJuice.triggerHeal();
      const s = progression.getPlayerStats();
      ui.updateHealth(s.health, s.maxHealth);
    }

    // Apply crew bonuses to stats for this wave
    progression.applyCrewBonuses(crew.getCrewBonuses());
    syncUpgradesToCombat();
    warDrumsTimer = 0; // Reset war drums timer at wave start
    const currentNode = mapNodes.getCurrentNode();
    const nodeRegion = currentNode ? v2Content.getRegion(currentNode.regionId) : null;
    if (nodeRegion) unlockRegionCodex(nodeRegion.id);
    const dominantFactionId = nodeRegion
      ? applyFactionPressureProfileForRegion(nodeRegion.factionPressure)
      : null;
    if (dominantFactionId) unlockFactionCodex(dominantFactionId);
    const dominantFactionName = dominantFactionId
      ? (v2Content.getFaction(dominantFactionId)?.name ?? null)
      : null;
    const eventCard = pickV2EventCard(currentNode?.type, nodeRegion?.id, dominantFactionId);
    if (eventCard) {
      await applyV2EventCard(eventCard, config, dominantFactionId);
    }
    setupContractObjectiveForWave(config.wave, currentNode?.type, dominantFactionId);
    if (activeContractObjective) {
      await resolveContractNegotiationChoice(activeContractObjective);
    }
    if (activeContractObjective?.contractType === 'armed_captures') {
      config.armedPercent = Math.max(config.armedPercent, 0.5);
      if (!config.enemyTypes.includes('escort_frigate')) config.enemyTypes.push('escort_frigate');
    } else if (activeContractObjective?.contractType === 'plunder_gold') {
      if (!config.enemyTypes.includes('merchant_galleon')) config.enemyTypes.push('merchant_galleon');
    }

    // Reputation tokens reduce hostility — spend 2 to lower armed% by 10%
    const econState = economy.getState();
    if (econState.reputationTokens >= 2 && config.armedPercent > 0) {
      economy.addReputationTokens(-2);
      config.armedPercent = Math.max(0, config.armedPercent - 0.10);
      ui.addJournalEntry('Our reputation precedes us — fewer escorts on the horizon.', 'reward');
    }

    // Wave preview — Intel >= 3 reveals enemy types
    const intelLevel = economy.getState().intel;
    ui.showWavePreview(
      config.wave,
      config.weather,
      config.totalShips,
      config.armedPercent,
      nodeRegion?.hazards,
      intelLevel >= 3 ? config.enemyTypes : undefined,
    );

    // Wave announcement
    ui.showWaveAnnouncement(config.wave, config.bossName !== null);
    waveAnnouncePending = true;
    waveAnnounceTimer = 1.5;
    ui.addJournalEntry(getWaveLogLine(config), config.bossName ? 'warning' : 'neutral');
    telemetry.track('wave_start', {
      wave: config.wave,
      weather: config.weather,
      ships: config.totalShips,
      boss: config.bossName ?? '',
    });
    if (currentNode) {
      narrative.onNodeStart(currentNode.label);
      telemetry.track('map_node_start', {
        nodeId: currentNode.id,
        nodeType: currentNode.type,
        regionId: currentNode.regionId,
      });
    }

    // Weather transition
    weather.transitionTo(config.weather, config.wave === 1 ? 1 : 10);

    // Audio weather
    const weatherCfg = weather.getCurrentConfig();
    audio.setWeatherIntensity(weatherCfg.windIntensity);

    // Wave complete audio
    if (config.wave > 1) {
      audio.playWaveComplete();
    }

    // Trigger special event if wave specifies one
    if (config.specialEvent) {
      events.startEvent(config.specialEvent, playerPos, world.getIslands().length);
      announceEventStart(config.specialEvent);
    }

    saveRunCheckpointNow();
  } finally {
    beginWaveInProgress = false;
    ui.hideChoicePrompt();
    if (gameStarted) {
      gamePaused = false;
    }
  }
}

function spawnWaveFleet() {
  // Clear any remaining merchants from previous wave
  for (let i = merchants.length - 1; i >= 0; i--) {
    if (merchants[i].state !== 'sinking') {
      scene.remove(merchants[i].mesh);
      merchants.splice(i, 1);
    }
  }

  currentBoss = null;
  audio.setBossMode(false);

  const config = activeWaveConfigV1 ?? progression.getWaveConfigV1();

  // Use EnemyAI to build the spawn list from the V1 wave config
  const spawnList = EnemyAISystem.getSpawnList(config, config.wave);
  const nodeRegion = mapNodes.getCurrentRegion();
  const dominantFactionId = nodeRegion ? getDominantFactionId(nodeRegion.factionPressure) : null;
  if (dominantFactionId) {
    telemetry.track('faction_pressure', {
      faction: dominantFactionId,
      region: nodeRegion?.id ?? '',
    });
  }

  const factionBiasPool = dominantFactionId ? FACTION_ENEMY_BIAS[dominantFactionId] : null;
  const earlyWave = config.wave <= 2;
  let biasChance = earlyWave ? 0.2 : 0.45;
  if (dominantFactionId) {
    const rep = factions.getReputation(dominantFactionId);
    const hostility = clamp(-rep / 120, 0, 1);
    const trust = clamp(rep / 160, 0, 1);
    biasChance += hostility * 0.24;
    biasChance -= trust * 0.08;
  }
  biasChance = clamp(biasChance, 0.12, 0.8);

  for (const entry of spawnList) {
    let enemyType = entry.type;
    if (!entry.isBoss && factionBiasPool && factionBiasPool.length > 0 && Math.random() < biasChance) {
      enemyType = factionBiasPool[Math.floor(Math.random() * factionBiasPool.length)];
    }
    spawnEnemy(enemyType, entry.isBoss);
  }

  // Organize navy_warship formations
  EnemyAISystem.updateFormation(merchants);

  ui.updateWaveCounter(config.wave, config.totalShips, config.totalShips);
}

let waveCompleteInProgress = false;
async function onWaveComplete() {
  if (waveCompleteInProgress) return;
  waveCompleteInProgress = true;
  gamePaused = true;
  ui.hideBossHealthBar();
  resolveContractObjectiveOnWaveComplete(activeWaveConfigV1?.wave ?? progression.getCurrentWave());

  await new Promise(resolve => setTimeout(resolve, 1000));

  // Show upgrade selection (skip if pool exhausted)
  const choices = progression.getUpgradeChoices();
  let synergy: Synergy | null = null;
  if (choices.length > 0) {
    const choiceIndex = await ui.showUpgradeScreen(
      choices.map(c => ({
        ...c,
        tier: c.tier,
      })),
      progression.getAcquiredUpgrades(),
    );
    synergy = progression.selectUpgrade(choiceIndex);
  } else {
    // No upgrades left — still advance the wave counter
    progression.skipUpgrade();
  }

  // Show synergy popup if triggered
  if (synergy) {
    ui.showSynergyPopup(synergy.name);
  }

  // Rebuild player ship visual if tiers changed
  rebuildPlayerShip();

  // Apply Davy's Pact aura if active
  if (progression.getPlayerStats().davyJonesPact) {
    DavysPactAura.apply(playerGroup, true);
  }

  // Sync upgrade stats to combat system
  syncUpgradesToCombat();

  // Level up crew after each wave
  crew.levelUpAll();
  ui.updateCrewHUD(crew.getCrew().map(c => ({
    role: c.role,
    level: c.level,
    icon: CREW_ROLE_CONFIGS[c.role].icon,
  })));

  // Add meta gold (only wave earnings, not cumulative total)
  progression.addMetaGold(progression.getScore() - scoreAtWaveStart);
  economy.addReputationTokens(1);

  // Victory check — after final wave, show run summary
  if (progression.checkVictory() && editorPlayTestMode) {
    // Play-test victory: return to editor
    waveCompleteInProgress = false;
    exitPlayTestMode();
    return;
  }
  if (progression.checkVictory()) {
    closeCodex();
    pendingFactionReputation.clear();
    factionFeedbackTimer = 0;
    capturesThisWave = 0;
    armedCapturesThisWave = 0;
    waveCaptureGold = 0;
    activeContractObjective = null;
    telemetry.track('run_victory', { wave: progression.getCurrentWave() });
    gamePaused = true;
    waveCompleteInProgress = false;
    victoryConfetti.start();
    audio.playWaveComplete();
    progression.setFactionReputationSnapshot(factions.getReputationSnapshot());
    const runStats = progression.getRunStats();
    const unlocks = progression.checkUnlocks(runStats);
    const hostile = progression.getMostHostileFaction();
    const allied = progression.getMostAlliedFaction();
    const doctrine = progression.getActiveDoctrine();
    progression.saveHighScore();
    progression.saveMetaStats();
    clearRunCheckpointAndRefresh();
    saveRunToHistory({
      date: new Date().toISOString(),
      shipClass: runStats.shipClass,
      doctrine: doctrine?.name ?? 'None',
      seed: currentRunSeed,
      victory: true,
      wavesCompleted: runStats.wavesCompleted,
      gold: runStats.gold,
      shipsDestroyed: runStats.shipsDestroyed,
      maxCombo: runStats.maxCombo,
      damageDealt: runStats.damageDealt,
      timePlayed: runStats.timePlayed,
    });
    ui.showRunSummary(runStats, unlocks, {
      codexCount: progression.getCodexEntryCount(),
      doctrineName: doctrine?.name ?? null,
      hostileFactionId: hostile?.id ?? null,
      hostileFactionScore: hostile?.score ?? null,
      alliedFactionId: allied?.id ?? null,
      alliedFactionScore: allied?.score ?? null,
      seed: currentRunSeed,
    });
    ui.onRunSummaryRestart(() => {
      ui.hideRunSummary();
      restartGame();
    });
    ui.onRunSummaryEndless(() => {
      ui.hideRunSummary();
      victoryConfetti.stop();
      progression.setEndlessMode(true);
      gamePaused = false;
      waveCompleteInProgress = false;
      beginWave();
    });
    return;
  }

  // Port visit on port waves
  const waveConfig = activeWaveConfigV1 ?? progression.getWaveConfigV1();

  // Editor play-test: skip map choice, advance linearly
  if (editorPlayTestMode) {
    mapNodes.advanceNode();
    waveCompleteInProgress = false;
    beginPlayTestWave();
    return;
  }

  // Map choice: let player pick next node if branching is available
  const available = mapNodes.getAvailableNextNodes();
  let nextNode: MapNode | null = null;

  if (available.length > 1) {
    const currentNode = mapNodes.getCurrentNode();
    const act = currentNode?.act ?? 1;
    const graph = mapNodes.getGraph();
    const chosenId = await ui.showMapChoice(
      available,
      progression.getCurrentWave(),
      act,
      graph,
      (regionId) => {
        const r = v2Content.getRegion(regionId);
        return r ? { name: r.name, weatherBias: r.weatherBias, factionPressure: r.factionPressure } : null;
      },
      (factionId) => v2Content.getFaction(factionId)?.name ?? factionId,
    );
    nextNode = mapNodes.selectNode(chosenId);
    saveRunCheckpointNow();
  } else if (available.length === 1) {
    nextNode = mapNodes.selectNode(available[0].id);
    saveRunCheckpointNow();
  } else {
    // Endless mode — no map nodes left
    nextNode = null;
  }

  if (nextNode) {
    telemetry.track('map_node_advance', {
      nextNodeId: nextNode.id,
      nextNodeType: nextNode.type,
      nextRegion: nextNode.regionId,
    });
    const nextRegionCfg = v2Content.getRegion(nextNode.regionId);
    if (nextRegionCfg) {
      unlockRegionCodex(nextRegionCfg.id);
      narrative.onRegionEntered(nextRegionCfg.name, nextRegionCfg.theme);
      const dominantFactionId = applyFactionPressureProfileForRegion(nextRegionCfg.factionPressure);
      if (dominantFactionId) {
        unlockFactionCodex(dominantFactionId);
        const faction = v2Content.getFaction(dominantFactionId);
        if (faction) narrative.onFactionPressure(faction.name);
      }
    } else {
      EnemyAISystem.resetPressureProfile();
    }
  }

  waveCompleteInProgress = false;
  gamePaused = false;
  const shouldPort = waveConfig.isPortWave || nextNode?.type === 'port';
  if (shouldPort) {
    enterPort();
  } else {
    beginWave();
  }
}

function rebuildPlayerShip() {
  const newConfig = {
    speedTier: progression.getSpeedTier(),
    armorTier: progression.getArmorTier(),
    weaponTier: progression.getWeaponTier(),
  };

  if (newConfig.speedTier !== playerShipConfig.speedTier ||
      newConfig.armorTier !== playerShipConfig.armorTier ||
      newConfig.weaponTier !== playerShipConfig.weaponTier) {
    scene.remove(playerGroup);
    playerShipConfig = newConfig;
    playerGroup = createShipMesh(0x6b3a2a, 0xf5f0e6, 1, playerShipConfig);
    playerGroup.position.copy(playerPos);
    playerGroup.rotation.y = playerAngle;
    scene.add(playerGroup);

    if (weather.getCurrentState() === 'night') {
      setShipLanterns(playerGroup, true);
    }
  }
}

// ===================================================================
//  Port mode
// ===================================================================

function enterPort() {
  gamePaused = true;
  inPort = true;
  const marketProfile = getPortMarketProfile();
  const harborLabel = marketProfile.context.factionName
    ? `${marketProfile.context.factionName} harbor`
    : 'Port Royal';
  ui.addJournalEntry(`Dropping anchor at ${harborLabel} for repairs and rumors.`, 'neutral');
  audio.setPortMode(true);
  audio.playPortAmbience();

  // Create port scene
  portScene = new PortScene();
  scene.add(portScene.group);
  portScene.group.position.set(playerPos.x + 50, 0, playerPos.z);

  const stats = progression.getPlayerStats();
  const shopUpgrades = progression.getAvailableUpgradesForShop();
  const costMap: Record<string, number> = {};
  const tierMult = marketProfile.tierMultiplier;
  for (const u of shopUpgrades) {
    const baseCost = u.tier === 'legendary' ? 1500 : u.tier === 'rare' ? 500 : 200;
    const tierFactor = u.tier === 'legendary' ? tierMult.legendary : u.tier === 'rare' ? tierMult.rare : tierMult.common;
    costMap[u.id] = Math.max(75, Math.round(baseCost * marketProfile.shopMultiplier * tierFactor));
  }
  // Supplies reduce repair costs (2% per supply, max 40% discount)
  const currentSupplies = economy.getState().supplies;
  const supplyDiscountPct = Math.min(40, currentSupplies * 2);
  const supplyDiscount = 1 - supplyDiscountPct / 100;
  const repairCostPer10 = Math.max(20, Math.round(100 * marketProfile.repairMultiplier * supplyDiscount));
  if (supplyDiscountPct > 0) {
    marketProfile.marketNotes.push(`Supplies stockpile: ${supplyDiscountPct}% repair discount.`);
  }
  const getCrewHireCost = (role: keyof typeof CREW_ROLE_CONFIGS): number => {
    return Math.max(90, Math.round(CREW_ROLE_CONFIGS[role].cost * marketProfile.crewMultiplier));
  };
  const mapCrewHireRows = (roles: Array<{ role: keyof typeof CREW_ROLE_CONFIGS } & { name: string; icon: string; bonusPerLevel: string }>) => {
    return roles.map(r => ({
      role: r.role,
      name: CREW_ROLE_CONFIGS[r.role].name,
      icon: CREW_ROLE_CONFIGS[r.role].icon,
      cost: getCrewHireCost(r.role),
      bonusPerLevel: CREW_ROLE_CONFIGS[r.role].bonusPerLevel,
    }));
  };
  telemetry.track('port_market', {
    faction: marketProfile.context.factionId ?? 'neutral',
    rep: Math.round(marketProfile.context.reputation),
    shopMult: Number(marketProfile.shopMultiplier.toFixed(3)),
    repairMult: Number(marketProfile.repairMultiplier.toFixed(3)),
    crewMult: Number(marketProfile.crewMultiplier.toFixed(3)),
  });

  ui.showPortUI(
    progression.getScore(),
    stats.health,
    stats.maxHealth,
    shopUpgrades.map(u => ({
      id: u.id,
      name: u.name,
      description: u.description,
      icon: u.icon,
      tier: u.tier,
      cost: costMap[u.id],
    })),
    (upgradeId: string) => {
      // Buy upgrade
      const cost = costMap[upgradeId];
      if (progression.purchaseUpgrade(upgradeId, cost)) {
        audio.playPurchase();
        applyRegionalFactionReputationDelta(0.35, 'port_upgrade_purchase');
        ui.updatePortGold(progression.getScore());
        const newStats = progression.getPlayerStats();
        ui.updatePortHealth(newStats.health, newStats.maxHealth);
        rebuildPlayerShip();
        syncUpgradesToCombat();
        saveRunCheckpointNow();
      }
    },
    (amount: number) => {
      // Repair
      const currentStats = progression.getPlayerStats();
      if (amount === -1) {
        // Full repair
        const needed = currentStats.maxHealth - currentStats.health;
        const cost = Math.ceil(needed / 10) * repairCostPer10;
        if (progression.repairHealth(needed, cost)) {
          audio.playPurchase();
          applyRegionalFactionReputationDelta(0.2, 'port_repair');
          ui.updatePortGold(progression.getScore());
          const newStats = progression.getPlayerStats();
          ui.updatePortHealth(newStats.health, newStats.maxHealth);
          saveRunCheckpointNow();
        }
      } else {
        const chunkCost = Math.ceil(amount / 10) * repairCostPer10;
        if (progression.repairHealth(amount, chunkCost)) {
          audio.playPurchase();
          applyRegionalFactionReputationDelta(0.12, 'port_repair');
          ui.updatePortGold(progression.getScore());
          const newStats = progression.getPlayerStats();
          ui.updatePortHealth(newStats.health, newStats.maxHealth);
          saveRunCheckpointNow();
        }
      }
    },
    () => {
      // Set sail
      leavePort();
    },
    {
      repairCostPer10,
      marketTitle: marketProfile.marketTitle,
      marketNotes: marketProfile.marketNotes,
    },
  );

  // Show crew hiring UI in tavern
  const availableRoles = crew.getAvailableRoles(progression.getMetaStatsV1());
  const gold = progression.getScore();
  const handleCrewHire = (role: string) => {
    const crewRole = role as keyof typeof CREW_ROLE_CONFIGS;
    const cost = getCrewHireCost(crewRole);
    const check = crew.canHire(crewRole, progression.getScore(), progression.getMetaStatsV1(), cost);
    if (check.canHire) {
      progression.addScore(-cost);
      crew.hire(crewRole);
      progression.addCrewHired();
      applyRegionalFactionReputationDelta(0.45, 'port_crew_hire');
      progression.applyCrewBonuses(crew.getCrewBonuses());
      audio.playPurchase();
      ui.updatePortGold(progression.getScore());
      ui.updateCrewHUD(crew.getCrew().map(c => ({
        role: c.role,
        level: c.level,
        icon: CREW_ROLE_CONFIGS[c.role].icon,
      })));
      // Refresh crew hire UI with the same handler
      const refreshRoles = crew.getAvailableRoles(progression.getMetaStatsV1());
      ui.showPortCrewHire(
        mapCrewHireRows(refreshRoles),
        progression.getScore(),
        handleCrewHire,
      );
      saveRunCheckpointNow();
    } else if (check.reason) {
      ui.addJournalEntry(check.reason, 'warning');
    }
  };
  ui.showPortCrewHire(
    mapCrewHireRows(availableRoles),
    gold,
    handleCrewHire,
  );
  saveRunCheckpointNow();
}

function leavePort() {
  ui.hidePortUI();
  ui.hidePortCrewHire();
  ui.addJournalEntry('Anchor up. Crew aboard. Back to open water.', 'neutral');
  audio.stopPortAmbience();
  audio.setPortMode(false);

  if (portScene) {
    portScene.dispose(scene);
    portScene = null;
  }

  inPort = false;
  gamePaused = false;
  beginWave();
}

async function onGameOver() {
  if (editorPlayTestMode) {
    exitPlayTestMode();
    return;
  }
  beginWaveInProgress = false;
  ui.hideChoicePrompt();
  closeCodex();
  pendingFactionReputation.clear();
  factionFeedbackTimer = 0;
  capturesThisWave = 0;
  armedCapturesThisWave = 0;
  waveCaptureGold = 0;
  activeContractObjective = null;
  gamePaused = true;
  telemetry.track('run_game_over', {
    wave: progression.getCurrentWave(),
    score: progression.getScore(),
  });
  progression.saveHighScore();
  progression.setFactionReputationSnapshot(factions.getReputationSnapshot());
  progression.saveMetaStats();
  clearRunCheckpointAndRefresh();
  ui.hideBossHealthBar();
  ui.clearCaptainLog();

  const runStats = progression.getRunStats();
  const doctrine = getDoctrineById(selectedDoctrineId);
  saveRunToHistory({
    date: new Date().toISOString(),
    shipClass: runStats.shipClass,
    doctrine: doctrine?.name ?? 'None',
    seed: currentRunSeed,
    victory: false,
    wavesCompleted: runStats.wavesCompleted,
    gold: runStats.gold,
    shipsDestroyed: runStats.shipsDestroyed,
    maxCombo: runStats.maxCombo,
    damageDealt: runStats.damageDealt,
    timePlayed: runStats.timePlayed,
  });
  await ui.showGameOver(
    runStats,
    progression.getHighScore(),
    progression.getHighWave(),
    currentRunSeed,
  );

  restartGame();
}

function restartGame() {
  clearRunCheckpointAndRefresh();
  runSetupOpen = false;
  ui.hideShipSelect();
  ui.hideChoicePrompt();
  ui.hideMapChoice();
  closeCodex();
  v2EventCardCooldowns.clear();
  pendingFollowupChoices.clear();
  beginWaveInProgress = false;
  pendingFactionReputation.clear();
  factionFeedbackTimer = 0;
  capturesThisWave = 0;
  armedCapturesThisWave = 0;
  waveCaptureGold = 0;
  activeContractObjective = null;
  // Clear all merchants
  for (const m of merchants) {
    scene.remove(m.mesh);
  }
  merchants.length = 0;
  nextMerchantId = 0;
  currentBoss = null;

  // Reset player
  playerPos.set(0, 0, 0);
  playerAngle = 0;
  playerSpeed = 0;
  playerVel.set(0, 0, 0);
  juiceScale = 1;
  juiceVel = 0;
  recoilOffset = 0;
  combo = 0;
  lastCaptureTime = -Infinity;

  // Reset progression
  progression.reset();
  const doctrine = getDoctrineById(selectedDoctrineId);
  if (doctrine) {
    selectedDoctrineId = doctrine.id;
  }
  progression.initializeStats(selectedRunShipClass, doctrine);
  syncUpgradesToCombat();
  currentRunSeed = Math.floor(Math.random() * 0x7fffffff);
  mapNodes.startRun(currentRunSeed);
  factions.reset();
  economy.resetRun();
  telemetry.resetRun();
  telemetry.track('run_restart', {
    reason: 'game_restart',
    shipClass: selectedRunShipClass,
    doctrine: doctrine?.id ?? 'none',
  });
  gameOverFired = false;
  waveCompleteInProgress = false;
  waveCompleteTimer = 0;
  waveAnnouncePending = false;
  waveAnnounceTimer = 0;
  activeWaveConfigV1 = null;
  ui.hideRunSummary();

  // Reset new systems
  world.dispose();
  world.generateIslands();
  ocean.setReefPositions(world.getReefData());
  crew.reset();
  events.reset();

  islandDiscoveryScanTimer = 0;
  discoveredIslandSeeds.clear();
  v2HudRefreshTimer = 0;
  narrative.reset();
  ui.clearCaptainLog();
  ui.addJournalEntry(`Back through ${world.getRegionName()} we sail.`, 'neutral');
  if (doctrine) {
    ui.addJournalEntry(`Doctrine set: ${doctrine.name}. ${doctrine.summary}`, 'mystic');
  }
  narrative.onRunStart(world.getRegionName());
  const currentRegion = mapNodes.getCurrentRegion();
  if (currentRegion) {
    unlockRegionCodex(currentRegion.id);
    const dominantFactionId = applyFactionPressureProfileForRegion(currentRegion.factionPressure);
    if (dominantFactionId) {
      unlockFactionCodex(dominantFactionId);
      const dominantFaction = v2Content.getFaction(dominantFactionId);
      if (dominantFaction) narrative.onFactionPressure(dominantFaction.name);
    }
  } else {
    EnemyAISystem.resetPressureProfile();
  }

  // Clean up effects
  krakenTentacle.dispose();
  whirlpoolEffect.dispose();
  seaSerpentEffect.dispose();
  treasureSparkle.clear();
  victoryConfetti.stop();

  // Reset weather to clear
  weather.transitionTo('clear', 2);

  // Rebuild player ship
  scene.remove(playerGroup);
  playerShipConfig = { speedTier: 0, armorTier: 0, weaponTier: 0 };
  playerGroup = createShipMesh(0x6b3a2a, 0xf5f0e6, 1, playerShipConfig);
  scene.add(playerGroup);

  // Reset UI
  const stats = progression.getPlayerStats();
  ui.updateScore(0);
  ui.updateHealth(stats.health, stats.maxHealth);
  ui.hideCombo();
  ui.hideBossHealthBar();
  ui.hideEventWarning();
  ui.hideEventTimer();
  ui.hideTreasureMapIndicator();

  audio.setBossMode(false);

  gamePaused = false;
  beginWave();
}

// ===================================================================
//  Camera
// ===================================================================

const camPos = new THREE.Vector3(0, 13, 20);
const camLookAt = new THREE.Vector3();
let spyglassAmount = 0;
let cameraZoom = 1.0; // 0.5 = zoomed in, 2.0 = zoomed out

function updateCamera(dt: number) {
  const stats = progression.getPlayerStats();
  const speedRatio = Math.abs(playerSpeed) / stats.maxSpeed;
  const settings = progression.getRuntimeSettings();
  const b = settings.keyBindings;
  const spyglass = (keys[b.spyglass] ?? false) || touchSpyglass;

  spyglassAmount = THREE.MathUtils.lerp(
    spyglassAmount, spyglass ? 1 : 0, 1 - Math.exp(-5 * dt),
  );

  const distBehind = THREE.MathUtils.lerp(11, 17, speedRatio) * cameraZoom;
  const camHeight = THREE.MathUtils.lerp(9, 13, speedRatio) * cameraZoom;
  const spyFwd = spyglassAmount * 14;
  const spyUp = spyglassAmount * 4;

  // Reuse module-level temp vectors to avoid per-frame allocations
  const behindDist = distBehind - spyFwd;
  _camTmpA.set(
    playerPos.x - Math.sin(playerAngle) * behindDist,
    playerPos.y + camHeight + spyUp,
    playerPos.z - Math.cos(playerAngle) * behindDist,
  );
  camPos.lerp(_camTmpA, 1 - Math.exp(-3.5 * dt));
  camera.position.copy(camPos).add(screenShake.offset);

  const lookAheadDist = spyglassAmount * 60;
  _camTmpA.set(
    playerPos.x + Math.sin(playerAngle) * lookAheadDist,
    playerPos.y,
    playerPos.z + Math.cos(playerAngle) * lookAheadDist,
  );
  camLookAt.lerp(_camTmpA, 1 - Math.exp(-5 * dt));
  camera.lookAt(camLookAt);

  const baseFov = THREE.MathUtils.lerp(46, 56, speedRatio);
  const targetFov = THREE.MathUtils.lerp(baseFov, 22, spyglassAmount);
  camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 1 - Math.exp(-6 * dt));
  camera.updateProjectionMatrix();
  ui.setSpyglass(spyglass);
}

// ===================================================================
//  Reusable temp vectors (avoid per-frame allocations)
// ===================================================================

const _tmpVec3A = new THREE.Vector3();
const _tmpVec3B = new THREE.Vector3();
const _tmpVec3C = new THREE.Vector3();
const _camTmpA = new THREE.Vector3();

// ===================================================================
//  Ship wave-tilt helper
// ===================================================================

function applyWaveTilt(
  mesh: THREE.Group, x: number, z: number,
  heading: number, t: number, dt: number, extraRoll = 0,
) {
  const waveScale = weather.getCurrentConfig().waveScale;
  const wave = ocean.getWaveInfo(x, z, t, waveScale);
  mesh.position.y = THREE.MathUtils.lerp(
    mesh.position.y, wave.height + 0.35, 1 - Math.exp(-8 * dt),
  );
  const cosH = Math.cos(heading);
  const sinH = Math.sin(heading);
  const fwdSlope = wave.slopeX * sinH + wave.slopeZ * cosH;
  const sideSlope = wave.slopeX * cosH - wave.slopeZ * sinH;
  mesh.rotation.y = heading;
  mesh.rotation.x = THREE.MathUtils.lerp(
    mesh.rotation.x, -Math.atan(fwdSlope) * 0.35, 1 - Math.exp(-6 * dt),
  );
  mesh.rotation.z = THREE.MathUtils.lerp(
    mesh.rotation.z, -Math.atan(sideSlope) * 0.35 + extraRoll, 1 - Math.exp(-6 * dt),
  );
}

// ===================================================================
//  Update: player
// ===================================================================

function updatePlayer(dt: number) {
  const stats = progression.getPlayerStats();
  const maxSpeed = stats.maxSpeed;
  const settings = progression.getRuntimeSettings();
  const b = settings.keyBindings;

  // Update cooldown UI labels
  const portLabel = document.getElementById('cooldown-port');
  const stbdLabel = document.getElementById('cooldown-starboard');
  if (portLabel) portLabel.textContent = b.port === ' ' ? 'SPC' : b.port.toUpperCase();
  if (stbdLabel) stbdLabel.textContent = b.starboard === ' ' ? 'SPC' : b.starboard.toUpperCase();

  const fwd = Math.max(-1, Math.min(1,
    (keys[b.forward] || keys['arrowup'] ? 1 : 0)
    - (keys[b.backward] || keys['arrowdown'] ? 1 : 0)
    + touchFwd,
  ));
  const turn = Math.max(-1, Math.min(1,
    (keys[b.left] || keys['arrowleft'] ? 1 : 0)
    - (keys[b.right] || keys['arrowright'] ? 1 : 0)
    + touchTurn,
  ));

  // Wind direction affects speed
  const weatherCfg = weather.getCurrentConfig();
  const windDir = weatherCfg.sunDirection;
  const shipForward = _tmpVec3A.set(Math.sin(playerAngle), 0, Math.cos(playerAngle));
  const windDot = shipForward.x * windDir.x + shipForward.z * windDir.z;
  const windSpeedMod = stats.stormImmunity ? 1.0 : 1.0 + windDot * 0.15;

  const effectiveMaxSpeed = maxSpeed * windSpeedMod;

  const targetSpd = fwd > 0 ? effectiveMaxSpeed * fwd : (fwd < 0 ? effectiveMaxSpeed * 0.3 * fwd : 0);
  if (Math.abs(fwd) > 0.05) {
    const accel = fwd > 0 ? 8 : 5;
    playerSpeed = THREE.MathUtils.lerp(playerSpeed, targetSpd, 1 - Math.exp(-accel * dt * 0.3));
  } else {
    playerSpeed *= Math.exp(-1.8 * dt);
  }

  const turnRate = 2.2;
  const speedFactor = Math.min(1, Math.abs(playerSpeed) / (effectiveMaxSpeed * 0.25));
  playerAngle += turn * turnRate * dt * speedFactor;

  // Apply recoil
  recoilOffset *= Math.exp(-12 * dt);

  const prevX = playerPos.x;
  const prevZ = playerPos.z;
  const recoilX = -Math.sin(playerAngle) * recoilOffset;
  const recoilZ = -Math.cos(playerAngle) * recoilOffset;
  playerPos.x += Math.sin(playerAngle) * playerSpeed * dt + recoilX * dt;
  playerPos.z += Math.cos(playerAngle) * playerSpeed * dt + recoilZ * dt;

  playerVel.set(
    (playerPos.x - prevX) / dt,
    0,
    (playerPos.z - prevZ) / dt,
  );

  juiceVel += (1 - juiceScale) * 35 * dt;
  juiceVel *= Math.exp(-6 * dt);
  juiceScale += juiceVel * dt;

  const turnLean = -turn * 0.14 * speedFactor;
  applyWaveTilt(playerGroup, playerPos.x, playerPos.z, playerAngle, time, dt, turnLean);
  playerGroup.position.x = playerPos.x;
  playerGroup.position.z = playerPos.z;
  playerGroup.scale.setScalar(juiceScale);

  // Update sail animation
  updateShipSails(playerGroup, time, weatherCfg.windIntensity);

  const sternWorld = _tmpVec3B.set(0, 0, -2.2)
    .applyAxisAngle(_tmpVec3C.set(0, 1, 0), playerAngle)
    .add(playerPos);
  wake.spawn(sternWorld, Math.abs(playerSpeed), dt);

  // Bioluminescent wake at night
  if (weather.getCurrentState() === 'night') {
    skySystem.spawnBioWake(sternWorld, Math.abs(playerSpeed), dt);
  }

  audio.setSpeedFactor(Math.abs(playerSpeed) / maxSpeed);

  creakTimer -= dt;
  if (creakTimer <= 0 && Math.abs(playerSpeed) > 2) {
    audio.playCreak();
    creakTimer = 4 + Math.random() * 6;
  }

  ui.updateHealth(stats.health, stats.maxHealth);
  ui.updateCooldowns(combat.canFirePort, combat.canFireStarboard);

  // Score count-up animation
  ui.updateScoreAnimated(progression.getScore());
  ui.updateScoreDisplay(dt);
}

// ===================================================================
//  Angle normalisation helper
// ===================================================================

function normalizeAngle(a: number): number {
  a = a % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// ===================================================================
//  Update: merchants
// ===================================================================

function updateMerchants(dt: number) {
  const stats = progression.getPlayerStats();
  const captureDist = stats.captureRange;
  let nearestDist = Infinity;
  let nearestPos: THREE.Vector3 | null = null;

  const weatherCfg = weather.getCurrentConfig();
  const weatherIntensity = weatherCfg.windIntensity;

  // Minimap entity list
  const minimapEntities: Array<{x: number, z: number, type: 'merchant' | 'escort' | 'boss' | 'island'}> = [];

  // Update formations for navy warships
  EnemyAISystem.updateFormation(merchants);

  for (let i = merchants.length - 1; i >= 0; i--) {
    const m = merchants[i];

    // Multi-stage sinking
    if (m.state === 'sinking') {
      m.sinkTimer += dt;

      if (m.sinkTimer < 0.8) {
        m.mesh.rotation.z += dt * 0.8;
      } else if (m.sinkTimer < 1.5) {
        m.mesh.position.y -= dt * 0.8;
        m.mesh.rotation.z += dt * 0.3;
        fireEffect.emit(_tmpVec3A.copy(m.pos).add(_tmpVec3B.set(0, 1, 0)), 3);
      } else if (m.sinkTimer < 2.5) {
        if (m.sinkPhase < 3) {
          m.sinkPhase = 3;
          shipBreakup.emit(m.pos);
        }
        m.mesh.position.y -= dt * 2.5;
        m.mesh.rotation.x -= dt * 0.8;
        m.mesh.rotation.z += dt * 0.5;
        fireEffect.emit(_tmpVec3A.copy(m.pos).add(_tmpVec3B.set(0, 0.5, 0)), 2);
      } else {
        m.mesh.position.y -= dt * 3.0;
        m.mesh.rotation.z += dt * 0.2;
      }

      if (m.sinkTimer > SINK_DURATION) {
        scene.remove(m.mesh);
        merchants.splice(i, 1);
      }
      continue;
    }

    const dx = playerPos.x - m.pos.x;
    const dz = playerPos.z - m.pos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    // Chain shot slow timer + blue tint
    if (m.chainSlowTimer > 0) {
      m.chainSlowTimer -= dt;
      m.speed = m.baseSpeed * 0.5;
      ChainShotTint.apply(m.mesh, true);
      if (m.chainSlowTimer <= 0) {
        ChainShotTint.apply(m.mesh, false);
      }
    }

    // Update sail animation
    updateShipSails(m.mesh, time, weatherCfg.windIntensity);

    // Boss enrage check
    if (m.isBoss && !m.bossEnraged && m.hp <= m.maxHp * 0.5) {
      m.bossEnraged = true;
      m.baseSpeed *= 1.5;
      m.fireTimer = Math.min(m.fireTimer, 1.0);
    }

    if (m.isBoss) {
      ui.updateBossHealth(m.hp, m.maxHp);
    }

    // Surrender check for unarmed ships
    if (!m.armed && !m.isBoss && m.hp > 0 && m.hp < m.maxHp * 0.2 && !m.surrendering) {
      m.surrendering = true;
      m.state = 'surrendering';
      m.speed = 0;
      addSurrenderFlag(m.mesh);
      audio.playSurrender();
    }

    // Ghost ship phase update
    if (m.enemyType === 'ghost_ship') {
      EnemyAISystem.updateGhostPhase(m, dt);
      GhostShipEffect.applyGhostEffect(m.mesh, m.isPhased);
    }

    // Fire ship explosion check
    if (m.enemyType === 'fire_ship') {
      const explResult = EnemyAISystem.checkFireShipExplosion(m, playerPos);
      if (explResult && explResult.exploded) {
        fireShipExplosion.emit(m.pos, explResult.aoeRadius);
        explosionEffect.emit(m.pos, 40);
        triggerScreenShake(0.8);
        audio.playExplosion(m.pos, playerPos);

        // Damage player if in range (skip in screensaver or god mode — invincible)
        if (explResult.playerDamage > 0 && !screensaverActive && !devGodMode) {
          progression.addDamageTaken(explResult.playerDamage);
          const result = progression.takeDamage(explResult.playerDamage);
          const dead = handleDamageResult(result);
          if (result === 'damaged') ui.updateHealth(stats.health, stats.maxHealth);
          if (dead && !gameOverFired) {
            gameOverFired = true;
            onGameOver();
          }
        }

        // Sink the fire ship
        m.state = 'sinking';
        m.sinkTimer = 0;
        m.sinkPhase = 0;
        m.speed = 0;
        if (!screensaverActive) progression.onShipDestroyed();
        continue;
      }
    }

    // Delegate AI movement to EnemyAISystem
    EnemyAISystem.updateAI(m, playerPos, playerAngle, dt, merchants);

    // Armed enemy firing (using EnemyAI's shouldFire check)
    m.fireTimer -= dt;
    if (EnemyAISystem.shouldFire(m, playerPos)) {
      const accuracy = Math.max(0.3, 0.7 - weatherIntensity * 0.3);
      combat.fireEscortShot(m.pos, m.heading, playerPos, playerVel, accuracy);
      audio.playExplosion(m.pos, playerPos);
      m.fireTimer = EnemyAISystem.getFireCooldown(m);

      const fireDir = _tmpVec3A.set(
        playerPos.x - m.pos.x, 0.3, playerPos.z - m.pos.z,
      ).normalize();
      const muzzlePos = _tmpVec3B.copy(m.pos).setY(m.pos.y + 0.8);
      cannonSmoke.emit(muzzlePos, fireDir, 8);
      muzzleFlash.emit(muzzlePos, fireDir);
    }

    // Apply position and wave tilt
    m.mesh.position.x = m.pos.x;
    m.mesh.position.z = m.pos.z;
    applyWaveTilt(m.mesh, m.pos.x, m.pos.z, m.heading, time, dt);
    m.pos.y = m.mesh.position.y;

    if (dist < nearestDist) {
      nearestDist = dist;
      nearestPos = m.pos;
    }

    // Minimap data
    minimapEntities.push({
      x: m.pos.x, z: m.pos.z,
      type: m.isBoss ? 'boss' : m.armed ? 'escort' : 'merchant',
    });

    // Surrender capture
    if (m.surrendering && dist < captureDist) {
      const bonusMultiplier = 1.5 + (stats.boardingPartyBonus ?? 0);
      m.value = Math.round(m.value * bonusMultiplier);
      triggerCapture(m, i);
      continue;
    }

    // Capture (boarding)
    if (dist < captureDist && m.hp <= 0) {
      triggerCapture(m, i);
      continue;
    }

    if (dist < captureDist && !m.armed && !m.surrendering) {
      triggerCapture(m, i);
      continue;
    }

    // Despawn check (using EnemyAI)
    if (EnemyAISystem.shouldDespawn(m, playerPos)) {
      scene.remove(m.mesh);
      merchants.splice(i, 1);
      if (!screensaverActive) {
        progression.onShipDestroyed();
        ui.updateWaveCounter(
          progression.getCurrentWave(),
          progression.getShipsRemaining(),
          progression.getShipsTotal(),
        );
      }
    }
  }

  // Add islands to minimap
  for (const island of world.getIslands()) {
    minimapEntities.push({
      x: island.pos.x, z: island.pos.z,
      type: 'island' as const,
    });
  }

  // Update minimap
  ui.updateMinimap(
    { x: playerPos.x, z: playerPos.z },
    playerAngle,
    minimapEntities,
    stats.cursedCompass,
  );

  // Compass: point to treasure island if map active, else nearest ship
  const treasureIdx = events.getTreasureMapTarget();
  const islands = world.getIslands();
  if (treasureIdx >= 0 && treasureIdx < islands.length) {
    const tIsland = islands[treasureIdx];
    const tdx = tIsland.pos.x - playerPos.x;
    const tdz = tIsland.pos.z - playerPos.z;
    const tDist = Math.sqrt(tdx * tdx + tdz * tdz);
    const tAngle = Math.atan2(tdx, tdz);
    ui.updateCompass(tAngle - playerAngle);
    ui.updateDistance(tDist);
  } else if (nearestPos) {
    const dx = nearestPos.x - playerPos.x;
    const dz = nearestPos.z - playerPos.z;
    const worldAngle = Math.atan2(dx, dz);
    ui.updateCompass(worldAngle - playerAngle);
    ui.updateDistance(nearestDist);
  }

  // Combo timeout
  if (combo > 0 && performance.now() / 1000 - lastCaptureTime > 5) {
    combo = 0;
    ui.hideCombo();
  }
}

function triggerCapture(m: MerchantV1, _index: number) {
  if (m.state === 'sinking') return; // prevent double-capture

  // In screensaver mode, just sink the ship with visual effects — skip progression/UI
  if (screensaverActive) {
    goldBurst.emit(m.pos, 20);
    waterSplash.emit(m.pos, 20);
    triggerScreenShake(0.3);
    audio.playSplash();
    floatingDebris.emit(m.pos);
    m.state = 'sinking';
    m.sinkTimer = 0;
    m.sinkPhase = 0;
    m.speed = 0;
    return;
  }

  const now = performance.now() / 1000;
  combo = (now - lastCaptureTime < 5) ? combo + 1 : 1;
  lastCaptureTime = now;
  progression.updateBestCombo(combo);

  const reward = m.value * combo;
  capturesThisWave++;
  if (m.armed) armedCapturesThisWave++;
  waveCaptureGold += reward;
  if (activeContractObjective) {
    const progress = getContractObjectiveProgress(activeContractObjective);
    const halfwayTarget = activeContractObjective.contractType === 'plunder_gold'
      ? Math.round(activeContractObjective.target * 0.5)
      : Math.ceil(activeContractObjective.target * 0.5);

    if (!activeContractObjective.announcedMidpoint && progress >= halfwayTarget) {
      activeContractObjective.announcedMidpoint = true;
      ui.addJournalEntry(
        `Contract progress: ${formatContractProgress(activeContractObjective, progress)}.`,
        'neutral',
      );
    }
    if (!activeContractObjective.announcedComplete && progress >= activeContractObjective.target) {
      activeContractObjective.announcedComplete = true;
      ui.addJournalEntry(
        `Contract objective met: ${formatContractProgress(activeContractObjective, progress)}.`,
        'reward',
      );
    }
  }
  progression.addScore(reward);
  economy.addSupplies(1);
  if (m.armed) economy.addIntel(1);
  telemetry.track('ship_captured', {
    enemyType: m.enemyType,
    reward,
    combo,
    armed: m.armed,
  });
  applyRegionalFactionReputationDelta(m.isBoss ? -1.25 : -0.4, m.isBoss ? 'boss_capture' : 'ship_capture');
  ui.updateScoreAnimated(progression.getScore());
  ui.showCapture(`+${reward} Gold!`, combo);
  goldBurst.emit(m.pos, 30 + combo * 8);
  // Boarding Party: extra gold burst proportional to bonus
  const boardingBonus = progression.getPlayerStats().boardingPartyBonus ?? 0;
  if (boardingBonus > 0) {
    goldBurst.emit(m.pos, Math.round(15 * boardingBonus));
  }
  waterSplash.emit(m.pos, 20);
  triggerScreenShake(0.4 + combo * 0.12);
  juiceScale = 1.18;
  juiceVel = -4;

  // Audio
  audio.playCoinJingle(combo);
  audio.playSplash();
  if (combo > 1) audio.playComboTone(combo);

  // Combo juice effects
  if (combo >= 3) {
    screenJuice.triggerDramaticKill();
    screenJuice.triggerCombo();
  }

  // Boss defeat
  if (m.isBoss) {
    audio.playBossDefeat();
    audio.setBossMode(false);
    currentBoss = null;
    ui.hideBossHealthBar();
    progression.addScore(m.value * 4);
    economy.addReputationTokens(2);
  }

  // Roll for treasure map drop
  if (events.rollForTreasureMap()) {
    const islands = world.getIslands();
    if (islands.length > 0) {
      events.startEvent('treasure_map', playerPos, islands.length);
      ui.showTreasureMapIndicator();
      announceEventStart('treasure_map');
    }
  }

  // Tutorial: captured


  // Float debris from sinking
  floatingDebris.emit(m.pos);

  // Sink the ship
  m.state = 'sinking';
  m.sinkTimer = 0;
  m.sinkPhase = 0;
  m.speed = 0;

  // Notify progression
  progression.onShipDestroyed();

  const wc = activeWaveConfigV1 ?? progression.getWaveConfigV1();
  ui.updateWaveCounter(
    wc.wave,
    progression.getShipsRemaining(),
    progression.getShipsTotal(),
  );
}

// ===================================================================
//  Damage result VFX/SFX helper
// ===================================================================

import type { DamageResult } from './Types';

function handleDamageResult(result: DamageResult): boolean {
  if (result === 'dodged') {
    audio.playDodge();
    screenJuice.triggerDodge();
    return false;
  }
  if (result === 'phoenix') {
    phoenixBurst.emit(playerPos, 40);
    audio.playPhoenixRevive();
    screenJuice.triggerPhoenix();
    triggerScreenShake(0.5);
    const stats = progression.getPlayerStats();
    ui.updateHealth(stats.health, stats.maxHealth);
    return false;
  }
  return result === 'dead';
}

// ===================================================================
//  Combat: check cannonball hits
// ===================================================================

function syncUpgradesToCombat() {
  const stats = progression.getPlayerStats();
  combat.spreadReduction = stats.steadyHandsSpread ?? 1.0;
  combat.neptunesWrathActive = stats.neptunesWrath ?? false;
  combat.chainShotActive = stats.chainShotActive ?? false;
  combat.grapeshotActive = stats.grapeshotActive ?? false;
  combat.cooldownMultiplier = stats.cannonCooldown;
}

function updateCombat(dt: number) {
  // Build ghost miss map for phased ghost ships
  const ghostMissMap = EnemyAISystem.buildGhostMissMap(merchants);

  combat.update(dt);

  // Build target list for player cannonballs hitting merchants
  const targets: Array<{pos: THREE.Vector3, hitRadius: number, id: number}> = [];
  for (let i = 0; i < merchants.length; i++) {
    const m = merchants[i];
    if (m.state !== 'sinking') targets.push({ pos: m.pos, hitRadius: m.hitRadius, id: m.id });
  }

  // Add kraken tentacles as targets if event is active
  const currentEvent = events.getCurrentEvent();
  if (currentEvent && currentEvent.type === 'kraken' && currentEvent.active) {
    const tentData = currentEvent.data as Record<string, unknown>;
    const tentPositions = tentData['tentaclePositions'] as THREE.Vector3[] | undefined;
    const tentHp = tentData['tentacleHp'] as number[] | undefined;
    if (tentPositions && tentHp) {
      for (let t = 0; t < tentPositions.length; t++) {
        if (tentHp[t] > 0) {
          targets.push({ pos: tentPositions[t], hitRadius: 3, id: 10000 + t });
        }
      }
    }
  }

  const hits = combat.checkHits(targets, ghostMissMap);

  for (const hit of hits) {
    // Check if this is a kraken tentacle hit (id >= 10000)
    if (hit.targetId >= 10000) {
      const tentIndex = hit.targetId - 10000;
      progression.addDamageDealt(hit.damage);
      const destroyed = events.hitTentacle(tentIndex, hit.damage);
      explosionEffect.emit(hit.hitPos, 25);
      audio.playExplosion(hit.hitPos, playerPos);
      triggerScreenShake(0.3);
      if (destroyed) {
        goldBurst.emit(hit.hitPos, 15);
      }
      continue;
    }

    const m = merchants.find(m => m.id === hit.targetId);
    if (!m || m.state === 'sinking') continue;

    const dealt = devInstakill ? m.hp : Math.min(hit.damage, m.hp);
    if (dealt > 0) progression.addDamageDealt(dealt);
    if (devInstakill) m.hp = 0; else m.hp -= hit.damage;

    // Chain shot effect
    if (progression.getPlayerStats().chainShotActive) {
      m.chainSlowTimer = 3;
      audio.playChainHit();
    }

    // Effects at hit point
    explosionEffect.emit(hit.hitPos, 20);
    audio.playExplosion(hit.hitPos, playerPos);
    triggerScreenShake(0.25);

    if (m.hp <= 0) {
      const idx = merchants.indexOf(m);
      if (idx >= 0) {
        triggerCapture(m, idx);
      }
    }
  }

  // Check enemy cannonballs hitting player
  const playerHit = combat.checkPlayerHit(playerPos, 2.8);
  if (playerHit) {
    // In screensaver, player is invincible — just show effects
    if (screensaverActive) {
      explosionEffect.emit(playerHit.hitPos, 15);
      triggerScreenShake(0.3);
    } else {
      explosionEffect.emit(playerHit.hitPos, 15);
      audio.playExplosion(playerHit.hitPos, playerPos);
      triggerScreenShake(0.6);

      if (!devGodMode) {
        const stats = progression.getPlayerStats();
        progression.addDamageTaken(playerHit.damage);
        const result = progression.takeDamage(playerHit.damage);
        const dead = handleDamageResult(result);

        if (result === 'damaged') {
          // Screen juice: damage flash + direction indicator
          const hitDx = playerHit.hitPos.x - playerPos.x;
          const hitDz = playerHit.hitPos.z - playerPos.z;
          const hitAngle = Math.atan2(hitDx, hitDz) - playerAngle;
          const normHitAngle = normalizeAngle(hitAngle);
          let dir: 'front' | 'back' | 'left' | 'right' = 'front';
          if (Math.abs(normHitAngle) < Math.PI / 4) dir = 'front';
          else if (Math.abs(normHitAngle) > Math.PI * 3 / 4) dir = 'back';
          else if (normHitAngle > 0) dir = 'left';
          else dir = 'right';
          screenJuice.triggerDamage(dir);
          ui.updateHealth(stats.health, stats.maxHealth);
        }

        if (dead && !gameOverFired) {
          gameOverFired = true;
          onGameOver();
        }
      }
    }
  }
}

// ===================================================================
//  Weather update
// ===================================================================

function updateWeather(dt: number) {
  const result = weather.update(dt);

  rain.active = result.config.rainIntensity > 0.3;

  // Sky system updates
  const isNight = weather.getCurrentState() === 'night';
  skySystem.setStarVisibility(isNight ? 1 : 0);
  skySystem.setBioWakeActive(isNight);
  skySystem.update(dt, time, result.config.sunDirection, weather.getCurrentState());

  // Lightning
  if (result.lightning) {
    triggerScreenShake(0.3);
    skySystem.triggerLightning(playerPos);
    audio.playLightningCrack();
    if (result.thunderDelay > 0) {
      setTimeout(() => {
        audio.playThunder();
      }, result.thunderDelay * 1000);
    }
  }

  // Update lanterns only when night state changes
  if (isNight !== lastIsNight) {
    lastIsNight = isNight;
    setShipLanterns(playerGroup, isNight);
    for (const m of merchants) {
      if (m.state !== 'sinking') {
        setShipLanterns(m.mesh, isNight);
      }
    }
  }

  audio.setWeatherIntensity(result.config.windIntensity);

  // Weather affects cannon spread (stormy = more inaccurate)
  combat.weatherSpreadBonus = result.config.windIntensity * 2.5;
}

// ===================================================================
//  Update: world (islands, collisions, treasure)
// ===================================================================

let lodTimer = 0;

function updateWorld(dt: number) {
  // LOD: throttle to ~2 checks/sec instead of every frame
  lodTimer += dt;
  if (lodTimer >= 0.5) {
    lodTimer = 0;
    world.updateLOD(playerPos);
  }

  // Update animated island elements (fortress flags)
  world.updateAnimations(time, weather.getCurrentConfig().windIntensity);

  // Log newly discovered landmarks near the player
  islandDiscoveryScanTimer -= dt;
  if (islandDiscoveryScanTimer <= 0) {
    islandDiscoveryScanTimer = 0.6;
    let discoveredThisTick = false;
    for (const island of world.getIslands()) {
      if (discoveredIslandSeeds.has(island.seed)) continue;
      const dx = playerPos.x - island.pos.x;
      const dz = playerPos.z - island.pos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist <= 55) {
        discoveredIslandSeeds.add(island.seed);
        const typeLabel = island.type.charAt(0).toUpperCase() + island.type.slice(1);
        ui.addJournalEntry(`Landmark charted: ${island.name} (${typeLabel} isle).`, 'neutral');
        unlockCodexEntry(`landmark:${island.type}`, `Landmark: ${typeLabel} Isles`);
        discoveredThisTick = true;
      }
      if (discoveredThisTick) break;
    }
  }

  // Check island collision and reef damage
  const collision = world.checkCollision(playerPos, dt);
  if (collision.bounceDir) {
    playerPos.add(collision.bounceDir.multiplyScalar(dt));
    playerSpeed *= 0.5;
  }
  if (collision.reefDamage > 0 && !devGodMode) {
    progression.addDamageTaken(collision.reefDamage);
    const result = progression.takeDamage(collision.reefDamage);
    const dead = handleDamageResult(result);
    if (result === 'damaged') {
      const stats = progression.getPlayerStats();
      ui.updateHealth(stats.health, stats.maxHealth);
    }
    if (dead && !gameOverFired) {
      gameOverFired = true;
      onGameOver();
    }
  }

  // Check treasure dig site
  const hasTreasureMap = events.getTreasureMapTarget() >= 0;
  const digIsland = world.checkDigSite(playerPos, hasTreasureMap);
  if (digIsland) {
    const treasureGold = 200 + Math.floor(Math.random() * 600);
    progression.addScore(treasureGold);
    progression.addTreasureFound();
    economy.addSupplies(3);
    economy.addIntel(2);
    telemetry.track('treasure_found', {
      island: digIsland.name,
      gold: treasureGold,
    });
    ui.showCapture(`+${treasureGold} Treasure!`, 1);
    ui.addJournalEntry(`We dug up ${treasureGold} gold at ${digIsland.name}.`, 'reward');
    goldBurst.emit(playerPos, 50);
    audio.playCoinJingle(3);
    world.collectTreasure(digIsland);
    events.clearTreasureMap();
    ui.hideTreasureMapIndicator();
    announceEventEnd('treasure_map', true);
  }

  // Sparkle effect on nearby treasure islands
  if (hasTreasureMap) {
    const islands = world.getIslands();
    const targetIdx = events.getTreasureMapTarget();
    if (targetIdx >= 0 && targetIdx < islands.length) {
      const island = islands[targetIdx];
      if (island.hasTreasure && !island.treasureCollected) {
        treasureSparkle.spawn(island.pos);
      }
    }
  }
}

// ===================================================================
//  Update: events (kraken, whirlpool, serpent, storm surge)
// ===================================================================

function updateEvents(dt: number) {
  const waveNum = progression.getCurrentWave();
  const weatherState = weather.getCurrentState();

  // Roll for random events once per second
  if (events.shouldRoll()) {
    const rollMultiplier = getRegionalEventPressureMultiplier();
    let eventType: EventType | null = null;

    if (rollMultiplier < 1) {
      if (Math.random() < rollMultiplier) {
        eventType = events.rollForEvent(waveNum, weatherState);
      }
    } else {
      eventType = events.rollForEvent(waveNum, weatherState);
      const extraRolls = Math.floor(rollMultiplier - 1);
      for (let i = 0; i < extraRolls && !eventType; i++) {
        eventType = events.rollForEvent(waveNum, weatherState);
      }
      const fractionalRoll = (rollMultiplier - 1) - extraRolls;
      if (!eventType && Math.random() < fractionalRoll) {
        eventType = events.rollForEvent(waveNum, weatherState);
      }
    }

    if (eventType) {
      events.startEvent(eventType, playerPos, world.getIslands().length);
      announceEventStart(eventType);

      // Spawn event-specific effects
      const evt = events.getCurrentEvent();
      if (evt) {
        switch (evt.type) {
          case 'kraken': {
            const tentPositions = evt.data['tentaclePositions'] as THREE.Vector3[] | undefined;
            if (tentPositions) krakenTentacle.spawn(tentPositions);
            audio.setEventMode('kraken');
            break;
          }
          case 'whirlpool':
            whirlpoolEffect.spawn(evt.pos);
            break;
          case 'sea_serpent':
            seaSerpentEffect.spawn(evt.pos);
            audio.setEventMode('sea_serpent');
            break;
          case 'ghost_ship_event':
            audio.setEventMode('ghost_ship_event');
            break;
          case 'storm_surge':
            weather.triggerStormSurge();
            break;
        }
      }
    }
  }

  // Per-frame event update
  const result = events.update(dt, playerPos, Math.abs(playerSpeed));

  // Apply event damage to player
  if (result.damageToPlayer > 0 && !devGodMode) {
    progression.addDamageTaken(result.damageToPlayer);
    const dmgResult = progression.takeDamage(result.damageToPlayer);
    const dead = handleDamageResult(dmgResult);
    if (dmgResult === 'damaged') {
      const stats = progression.getPlayerStats();
      ui.updateHealth(stats.health, stats.maxHealth);
      triggerScreenShake(0.3);
    }
    if (dead && !gameOverFired) {
      gameOverFired = true;
      onGameOver();
    }
  }

  // Apply event gold reward
  if (result.goldReward > 0) {
    progression.addScore(result.goldReward);
    ui.showCapture(`+${result.goldReward} Gold!`, 1);
    goldBurst.emit(playerPos, 30);
    audio.playCoinJingle(2);
  }

  // Apply whirlpool pull force
  if (result.pullForce) {
    playerPos.add(result.pullForce.multiplyScalar(dt));
  }

  // Event UI: warning and timer
  if (result.warning) {
    ui.showEventWarning(result.warning);
  }

  const currentEvt = events.getCurrentEvent();
  const activeEventType = currentEvt?.type ?? null;
  if (currentEvt && currentEvt.active) {
    ui.showEventTimer(
      currentEvt.type,
      currentEvt.duration - currentEvt.timer,
      currentEvt.duration,
    );

    // Update event-specific effects
    if (currentEvt.type === 'kraken') {
      krakenTentacle.update(dt, time);
    } else if (currentEvt.type === 'whirlpool') {
      whirlpoolEffect.update(dt, time);
    } else if (currentEvt.type === 'sea_serpent') {
      const serpentDmg = seaSerpentEffect.update(dt, time, playerPos);
      if (serpentDmg > 0 && !devGodMode) {
        progression.addDamageTaken(serpentDmg * dt);
        const serpResult = progression.takeDamage(serpentDmg * dt);
        const dead = handleDamageResult(serpResult);
        if (serpResult === 'damaged') {
          const stats = progression.getPlayerStats();
          ui.updateHealth(stats.health, stats.maxHealth);
        }
        if (dead && !gameOverFired) {
          gameOverFired = true;
          onGameOver();
        }
      }
    }

    // Event weather overlay
    weather.setEventOverlay(currentEvt.type);
  }

  // Event completed
  if (result.eventComplete) {
    progression.addEventCompleted();
    if (activeEventType) {
      const success = result.goldReward > 0 || result.damageToPlayer <= 0;
      announceEventEnd(activeEventType, success);
    }
    ui.hideEventWarning();
    ui.hideEventTimer();
    krakenTentacle.dispose();
    whirlpoolEffect.dispose();
    seaSerpentEffect.dispose();
    audio.setEventMode(null);
    weather.setEventOverlay(null);
  }
}

function updateV2Hud(dt: number) {
  v2HudRefreshTimer -= dt;
  if (v2HudRefreshTimer > 0) return;
  v2HudRefreshTimer = 0.2;
  const econ = economy.getState();
  ui.updateV2Resources(econ.supplies, econ.intel, econ.reputationTokens);
  const context = getRegionalFactionContext();
  ui.updateV2FactionStatus(context.factionName, context.reputation);
}

// ===================================================================
//  Wave lifecycle management
// ===================================================================

function updateWaveLifecycle(dt: number) {
  if (waveAnnouncePending) {
    waveAnnounceTimer -= dt;
    if (waveAnnounceTimer <= 0) {
      waveAnnouncePending = false;
      spawnWaveFleet();
    }
    return;
  }

  if (progression.getState() === 'wave_complete') {
    waveCompleteTimer += dt;
    if (waveCompleteTimer > 1.5) {
      waveCompleteTimer = -999;
      onWaveComplete();
    }
    return;
  }

  if (progression.getState() === 'active') {
    waveCompleteTimer = 0;

    // War Drums: periodic drum beat during combat
    if (progression.getPlayerStats().warDrums) {
      warDrumsTimer += dt;
      if (warDrumsTimer >= 2) {
        warDrumsTimer -= 2;
        audio.playWarDrumsBeat();
      }
    }

    // Grapeshot Split SFX: play ricochet scatter when cannonballs split
    if (combat.grapeshotSplitCount > 0) {
      audio.playGrapeshotSplit();
      combat.grapeshotSplitCount = 0;
    }
  }
}

// ===================================================================
//  Main loop
// ===================================================================

let time = 0;
let lastNow = -1;

function animate(now: number) {
  requestAnimationFrame(animate);
  if (lastNow < 0) { lastNow = now; return; }
  const rawDt = Math.min((now - lastNow) / 1000, 0.05);
  lastNow = now;

  // Get time scale from slow-motion juice
  const stats = progression.getPlayerStats();
  const healthPct = stats.health / stats.maxHealth * 100;
  const rawJuiceTimeScale = screenJuice.update(rawDt, healthPct);
  const timeScale = THREE.MathUtils.clamp(
    1 - (1 - rawJuiceTimeScale) * accessibilityMotionIntensity,
    0.05,
    1,
  );

  const dt = rawDt * timeScale;
  time += dt;
  syncCodexToggleVisibility();

  ocean.update(time, (gameStarted || screensaverActive) ? playerPos : new THREE.Vector3());
  skyMat.uniforms.uTime.value = time;

  if (gameStarted && !gamePaused) {
    updatePlayer(dt);
    updateMerchants(dt);
    updateCombat(dt);
    updateWeather(dt);
    updateWorld(dt);
    updateEvents(dt);

    updateV2Hud(dt);
    updateFactionFeedback(dt);
    updateWaveLifecycle(dt);
    updateCamera(dt);
    narrative.update(dt);
  } else if (gameStarted && gamePaused) {
    updateWeather(dt);
    updateV2Hud(dt);
    updateFactionFeedback(dt);
    updateCamera(dt);
    narrative.update(dt);
    // Update port scene if active
    if (portScene) {
      portScene.update(dt, time);
    }
  } else if (screensaverActive) {
    // Autopilot drives playerSpeed/playerAngle
    updateAutopilot(dt);

    // Move player based on autopilot output
    playerPos.x += Math.sin(playerAngle) * playerSpeed * dt;
    playerPos.z += Math.cos(playerAngle) * playerSpeed * dt;

    // Apply wave tilt & sails
    applyWaveTilt(playerGroup, playerPos.x, playerPos.z, playerAngle, time, dt);
    playerGroup.position.x = playerPos.x;
    playerGroup.position.z = playerPos.z;
    const weatherCfg = weather.getCurrentConfig();
    updateShipSails(playerGroup, time, weatherCfg.windIntensity);

    // Wake trail
    const sternWorld = _tmpVec3B.set(0, 0, -2.2)
      .applyAxisAngle(_tmpVec3C.set(0, 1, 0), playerAngle)
      .add(playerPos);
    wake.spawn(sternWorld, Math.abs(playerSpeed), dt);

    // Reuse real game systems
    updateMerchants(dt);
    updateCombat(dt);
    updateWeather(dt);

    // Island LOD & animations
    lodTimer += dt;
    if (lodTimer >= 0.5) {
      lodTimer = 0;
      world.updateLOD(playerPos);
    }
    world.updateAnimations(time, weatherCfg.windIntensity);

    // Follow camera
    updateCamera(dt);
    narrative.update(dt);

    // Periodic merchant spawning
    screensaverSpawnTimer += dt;
    if (screensaverSpawnTimer >= 12 + Math.random() * 8) {
      screensaverSpawnTimer = 0;
      if (merchants.length < 4) {
        const types: EnemyType[] = ['merchant_sloop', 'merchant_galleon', 'escort_frigate'];
        const count = 2 + Math.floor(Math.random() * 2);
        for (let i = 0; i < count; i++) {
          spawnEnemy(types[Math.floor(Math.random() * types.length)], false);
        }
      }
    }

    // Weather cycling every 30s
    screensaverWeatherTimer += dt;
    if (screensaverWeatherTimer >= 30) {
      screensaverWeatherTimer = 0;
      screensaverWeatherIndex = (screensaverWeatherIndex + 1) % screensaverWeathers.length;
      weather.transitionTo(screensaverWeathers[screensaverWeatherIndex], 8);
    }
  } else if (editorMode && !editorPlayTestMode) {
    // Editor mode: fly-cam + ocean + weather visuals
    editorCamera?.update(dt, camera);
    scenarioEditor?.update(dt);
    const weatherCfg = weather.getCurrentConfig();
    weather.update(dt);
    world.updateAnimations(time, weatherCfg.windIntensity);
  } else {
    // Title screen camera orbit
    camera.position.set(
      Math.cos(time * 0.15) * 35,
      18 + Math.sin(time * 0.3) * 2,
      Math.sin(time * 0.15) * 35,
    );
    camera.lookAt(0, 0, 0);
    const waveScale = weather.getCurrentConfig().waveScale;
    const w = ocean.getWaveInfo(0, 0, time, waveScale);
    playerGroup.position.y = w.height + 0.35;
    playerGroup.rotation.x = -Math.atan(w.slopeZ) * 0.3;
    playerGroup.rotation.z = -Math.atan(w.slopeX) * 0.3;
    updateShipSails(playerGroup, time, 0.8);
    narrative.update(dt);
  }

  // Effects always update (even paused, for decay)
  goldBurst.update(dt);
  waterSplash.update(dt);
  screenShake.update(dt);
  wake.update(dt);
  cannonSmoke.update(dt);
  explosionEffect.update(dt);
  rain.update(dt, playerPos);
  muzzleFlash.update(dt);
  cannonballTrail.update(dt);
  shipBreakup.update(dt);
  fireEffect.update(dt);
  fireShipExplosion.update(dt);
  treasureSparkle.update(dt, time);
  victoryConfetti.update(dt);
  phoenixBurst.update(dt);

  // Speed lines
  if (gameStarted && !gamePaused) {
    speedLines.update(dt, playerPos, playerAngle, Math.abs(playerSpeed) * accessibilityMotionIntensity);
  }

  // Floating debris
  const waveScale = weather.getCurrentConfig().waveScale;
  floatingDebris.update(dt, (x, z) => {
    return ocean.getWaveInfo(x, z, time, waveScale).height;
  }, playerPos);

  // Position sky dome at camera
  sky.position.copy(camera.position);
  skySystem.stars.position.copy(camera.position);

  renderer.render(scene, camera);
}

requestAnimationFrame(animate);

// URL hash check: load shared scenario on startup
if (ENABLE_SCENARIO_EDITOR && location.hash.startsWith('#scenario=')) {
  void loadEditorRuntime().then((runtime) => runtime.scenarioFromURLHash(location.hash)).then((s) => {
    if (s) {
      void enterEditorMode(s);
    }
  });
}
