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
} from './Effects';
import { UI } from './UI';
import { audio } from './Audio';
import { CombatSystem } from './Combat';
import { WeatherSystem } from './Weather';
import { ProgressionSystem } from './Progression';
import type { PlayerStats, Synergy } from './Progression';
import { screenJuice } from './Juice';
import { SkySystem } from './Sky';
import { PortScene } from './Port';
import { WorldSystem } from './World';
import { EnemyAISystem } from './EnemyAI';
import { CrewSystem } from './Crew';
import { EventSystem } from './Events';
import { TutorialSystem } from './Tutorial';
import type { MerchantV1, WaveConfigV1, EnemyType, RunStats } from './Types';
import { ENEMY_TYPE_CONFIGS, CREW_ROLE_CONFIGS } from './Types';

// ===================================================================
//  Mobile detection
// ===================================================================

const isMobile = navigator.maxTouchPoints > 0 || 'ontouchstart' in globalThis;

// ===================================================================
//  Renderer & scene
// ===================================================================

const scene = new THREE.Scene();
const fogColor = new THREE.Color(0x1e1828);
const fogDensity = 0.008;
scene.fog = new THREE.FogExp2(fogColor, fogDensity);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 500);

const renderer = new THREE.WebGLRenderer({ antialias: !isMobile });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.5 : 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
document.getElementById('game')!.appendChild(renderer.domElement);

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
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
    varying vec3 vDir;
    void main() {
      float y = normalize(vDir).y;
      vec3 color = mix(uSkyHorizon, uSkyMid, smoothstep(-0.02, 0.25, y));
      color = mix(color, uSkyTop, smoothstep(0.25, 0.7, y));
      float sunDot = max(dot(normalize(vDir), normalize(uSunDir)), 0.0);
      color += vec3(1.0, 0.6, 0.2) * pow(sunDot, 32.0) * 0.6;
      color += vec3(1.0, 0.85, 0.5) * pow(sunDot, 256.0) * 1.0;
      gl_FragColor = vec4(color, 1.0);
    }
  `,
  side: THREE.BackSide,
  depthWrite: false,
});

const sky = new THREE.Mesh(skyGeo, skyMat);
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
const tutorial = new TutorialSystem();

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

type Merchant = MerchantV1;

const merchants: Merchant[] = [];
let nextMerchantId = 0;
const FLEE_RANGE = 22;
const ESCAPE_RANGE = 120; // ships beyond this auto-escape (wave progress, no gold)
const SAIL_COLORS = [0xcc2222, 0xccaa22, 0x2266cc, 0x22bb55, 0xcc6622, 0x9933aa];
const SINK_DURATION = 4.0; // expanded for multi-stage sinking

// Boss names
const PIRATE_NAMES = [
  'Blackbeard', 'Red Bess', 'Iron Jack', 'The Kraken',
  'Bloody Mary', 'Captain Bones', 'Dead-Eye Pete', 'Sea Witch',
  'The Reaper', 'Barnacle Bill', 'Storm Fang', 'Dread Morgan',
];

// Track active wave config (V1 with enemy types + boss info)
let activeWaveConfigV1: WaveConfigV1 | null = null;
let currentBoss: Merchant | null = null;

function spawnEnemy(enemyType: EnemyType, isBoss: boolean) {
  const waveConfig = activeWaveConfigV1 ?? progression.getWaveConfigV1();
  const props = EnemyAISystem.getSpawnProps(enemyType, isBoss, waveConfig);

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

  const m: Merchant = {
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

  if (isBoss) {
    currentBoss = m;
    const bossName = waveConfig.bossName ?? `Captain ${PIRATE_NAMES[Math.floor(Math.random() * PIRATE_NAMES.length)]}`;
    ui.showBossHealthBar(bossName);
    ui.updateBossHealth(m.hp, m.maxHp);
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

// Tutorial condition tracking
let tutorialMoved = false;
let tutorialFired = false;
let tutorialCaptured = false;
let tutorialUpgraded = false;

// ===================================================================
//  Input: keyboard
// ===================================================================

const keys: Record<string, boolean> = {};

window.addEventListener('keydown', (e) => {
  if (e.key === ' ' || e.key.startsWith('Arrow') || 'wasdqem'.includes(e.key.toLowerCase())) {
    e.preventDefault();
  }
  keys[e.key.toLowerCase()] = true;
  if (!gameStarted && e.key !== 'F5' && e.key !== 'F12') startGame();

  // Mute toggle
  if (e.key.toLowerCase() === 'm' && gameStarted) {
    const muted = audio.toggleMute();
    ui.setMuted(muted);
  }

  // Cannon firing
  if (gameStarted && !gamePaused) {
    if (e.key.toLowerCase() === 'q') { firePort(); tutorialFired = true; }
    if (e.key.toLowerCase() === 'e') { fireStarboard(); tutorialFired = true; }
  }
});
window.addEventListener('keyup', (e) => {
  keys[e.key.toLowerCase()] = false;
});

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

  // Muzzle flash + smoke from port side
  const sideDir = new THREE.Vector3(-Math.cos(playerAngle), 0.3, Math.sin(playerAngle));
  const smokeOrigin = playerPos.clone().add(sideDir.clone().multiplyScalar(1.5));
  smokeOrigin.y = playerPos.y + 0.8;
  cannonSmoke.emit(smokeOrigin, sideDir, 15);
  muzzleFlash.emit(smokeOrigin, sideDir);

  // Screen shake on fire
  screenShake.trigger(0.15);

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

  // Muzzle flash + smoke from starboard side
  const sideDir = new THREE.Vector3(Math.cos(playerAngle), 0.3, -Math.sin(playerAngle));
  const smokeOrigin = playerPos.clone().add(sideDir.clone().multiplyScalar(1.5));
  smokeOrigin.y = playerPos.y + 0.8;
  cannonSmoke.emit(smokeOrigin, sideDir, 15);
  muzzleFlash.emit(smokeOrigin, sideDir);

  // Screen shake on fire
  screenShake.trigger(0.15);

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
  e.preventDefault();
  if (!gameStarted) startGame();

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

// ===================================================================
//  Mobile UI tweaks
// ===================================================================

if (isMobile) {
  const hint = document.getElementById('title-hint');
  if (hint) hint.textContent = 'Touch to set sail';
  const ctrl = document.getElementById('controls');
  if (ctrl) ctrl.innerHTML = 'Left: Steer &bull; Right: Spyglass &bull; Buttons: Cannons';

  ui.showMobileCannonButtons(firePort, fireStarboard);
}

// ===================================================================
//  Game start & wave flow
// ===================================================================

function startGame() {
  gameStarted = true;
  gamePaused = false;
  camPos.copy(camera.position);
  camLookAt.set(0, 0, 0);

  audio.init();

  // Generate world islands and feed reef data to ocean shader
  world.generateIslands();
  const reefData = world.getReefData();
  ocean.setReefPositions(reefData);

  // Start tutorial for new players
  tutorial.start();

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
  }, 1200);

  beginWave();
}

function beginWave() {
  // Start wave (progression state transition) and get V1 config
  progression.startWave();
  const config = progression.getWaveConfigV1();
  activeWaveConfigV1 = config;
  progression.onWaveStart();
  scoreAtWaveStart = progression.getScore();

  // Apply crew bonuses to stats for this wave
  progression.applyCrewBonuses(crew.getCrewBonuses());
  syncUpgradesToCombat();

  // Wave preview
  ui.showWavePreview(
    config.wave,
    config.weather,
    config.totalShips,
    config.armedPercent,
  );

  // Wave announcement
  ui.showWaveAnnouncement(config.wave);
  waveAnnouncePending = true;
  waveAnnounceTimer = 2.5;

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

  for (const entry of spawnList) {
    spawnEnemy(entry.type, entry.isBoss);
  }

  // Organize navy_warship formations
  EnemyAISystem.updateFormation(merchants);

  ui.updateWaveCounter(config.wave, config.totalShips, config.totalShips);
}

async function onWaveComplete() {
  gamePaused = true;
  ui.hideBossHealthBar();

  await new Promise(resolve => setTimeout(resolve, 1500));

  // Show upgrade selection
  const choices = progression.getUpgradeChoices();
  const choiceIndex = await ui.showUpgradeScreen(
    choices.map(c => ({
      ...c,
      tier: c.tier,
    })),
    progression.getAcquiredUpgrades(),
  );
  const synergy = progression.selectUpgrade(choiceIndex);
  tutorialUpgraded = true;

  // Show synergy popup if triggered
  if (synergy) {
    ui.showSynergyPopup(synergy.name);
  }

  // Rebuild player ship visual if tiers changed
  rebuildPlayerShip();

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

  gamePaused = false;

  // Victory check — after final wave, show run summary
  if (progression.checkVictory()) {
    gamePaused = true;
    victoryConfetti.start();
    audio.playWaveComplete();
    const runStats = progression.getRunStats();
    ui.showRunSummary(runStats, []);
    return;
  }

  // Port visit on port waves or every 3 waves
  const currentWave = progression.getCurrentWave();
  const waveConfig = activeWaveConfigV1 ?? progression.getWaveConfigV1();
  if (waveConfig.isPortWave || ((currentWave - 1) % 3 === 0 && currentWave > 1)) {
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
  audio.setPortMode(true);
  audio.playPortAmbience();

  // Create port scene
  portScene = new PortScene();
  scene.add(portScene.group);
  portScene.group.position.set(playerPos.x + 50, 0, playerPos.z);

  const stats = progression.getPlayerStats();
  const shopUpgrades = progression.getAvailableUpgradesForShop();
  const costMap: Record<string, number> = {};
  for (const u of shopUpgrades) {
    costMap[u.id] = u.tier === 'legendary' ? 1500 : u.tier === 'rare' ? 500 : 200;
  }

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
        ui.updatePortGold(progression.getScore());
        const newStats = progression.getPlayerStats();
        ui.updatePortHealth(newStats.health, newStats.maxHealth);
        rebuildPlayerShip();
        syncUpgradesToCombat();
      }
    },
    (amount: number) => {
      // Repair
      const costPer10 = 100;
      if (amount === -1) {
        // Full repair
        const needed = stats.maxHealth - stats.health;
        const cost = Math.ceil(needed / 10) * costPer10;
        if (progression.repairHealth(needed, cost)) {
          audio.playPurchase();
          ui.updatePortGold(progression.getScore());
          const newStats = progression.getPlayerStats();
          ui.updatePortHealth(newStats.health, newStats.maxHealth);
        }
      } else {
        if (progression.repairHealth(amount, costPer10)) {
          audio.playPurchase();
          ui.updatePortGold(progression.getScore());
          const newStats = progression.getPlayerStats();
          ui.updatePortHealth(newStats.health, newStats.maxHealth);
        }
      }
    },
    () => {
      // Set sail
      leavePort();
    },
  );

  // Show crew hiring UI in tavern
  const availableRoles = crew.getAvailableRoles(progression.getMetaStatsV1());
  const gold = progression.getScore();
  ui.showPortCrewHire(
    availableRoles.map(r => ({
      role: r.role,
      name: CREW_ROLE_CONFIGS[r.role].name,
      icon: CREW_ROLE_CONFIGS[r.role].icon,
      cost: CREW_ROLE_CONFIGS[r.role].cost,
      bonusPerLevel: CREW_ROLE_CONFIGS[r.role].bonusPerLevel,
    })),
    gold,
    (role: string) => {
      const crewRole = role as keyof typeof CREW_ROLE_CONFIGS;
      const cost = CREW_ROLE_CONFIGS[crewRole].cost;
      const check = crew.canHire(crewRole, progression.getScore(), progression.getMetaStatsV1());
      if (check.canHire) {
        progression.addScore(-cost);
        crew.hire(crewRole);
        progression.applyCrewBonuses(crew.getCrewBonuses());
        audio.playPurchase();
        ui.updatePortGold(progression.getScore());
        ui.updateCrewHUD(crew.getCrew().map(c => ({
          role: c.role,
          level: c.level,
          icon: CREW_ROLE_CONFIGS[c.role].icon,
        })));
        // Refresh crew hire UI
        const refreshRoles = crew.getAvailableRoles(progression.getMetaStatsV1());
        ui.showPortCrewHire(
          refreshRoles.map(r => ({
            role: r.role,
            name: CREW_ROLE_CONFIGS[r.role].name,
            icon: CREW_ROLE_CONFIGS[r.role].icon,
            cost: CREW_ROLE_CONFIGS[r.role].cost,
            bonusPerLevel: CREW_ROLE_CONFIGS[r.role].bonusPerLevel,
          })),
          progression.getScore(),
          () => {}, // placeholder, won't be used since we're already in port
        );
      }
    },
  );
}

function leavePort() {
  ui.hidePortUI();
  ui.hidePortCrewHire();
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
  gamePaused = true;
  progression.saveHighScore();
  progression.saveMetaStats();
  ui.hideBossHealthBar();

  await ui.showGameOver(
    progression.getScore(),
    progression.getCurrentWave(),
    progression.getHighScore(),
    progression.getHighWave(),
  );

  restartGame();
}

function restartGame() {
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
  gameOverFired = false;
  waveCompleteTimer = 0;
  waveAnnouncePending = false;
  waveAnnounceTimer = 0;
  activeWaveConfigV1 = null;

  // Reset new systems
  world.dispose();
  world.generateIslands();
  ocean.setReefPositions(world.getReefData());
  crew.reset();
  events.reset();
  tutorial.reset();
  tutorial.start();
  tutorialMoved = false;
  tutorialFired = false;
  tutorialCaptured = false;
  tutorialUpgraded = false;

  // Clean up event effects
  krakenTentacle.dispose();
  whirlpoolEffect.dispose();
  seaSerpentEffect.dispose();

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

const camPos = new THREE.Vector3(0, 20, 30);
const camLookAt = new THREE.Vector3();
let spyglassAmount = 0;

function updateCamera(dt: number) {
  const stats = progression.getPlayerStats();
  const speedRatio = Math.abs(playerSpeed) / stats.maxSpeed;
  const spyglass = (keys[' '] ?? false) || touchSpyglass;

  spyglassAmount = THREE.MathUtils.lerp(
    spyglassAmount, spyglass ? 1 : 0, 1 - Math.exp(-5 * dt),
  );

  const distBehind = THREE.MathUtils.lerp(18, 26, speedRatio);
  const camHeight = THREE.MathUtils.lerp(14, 19, speedRatio);
  const spyFwd = spyglassAmount * 14;
  const spyUp = spyglassAmount * 4;

  const behind = new THREE.Vector3(
    -Math.sin(playerAngle) * (distBehind - spyFwd),
    camHeight + spyUp,
    -Math.cos(playerAngle) * (distBehind - spyFwd),
  );
  const target = playerPos.clone().add(behind);
  camPos.lerp(target, 1 - Math.exp(-3.5 * dt));
  camera.position.copy(camPos).add(screenShake.offset);

  const lookAheadDist = spyglassAmount * 60;
  const lookTarget = playerPos.clone().add(new THREE.Vector3(
    Math.sin(playerAngle) * lookAheadDist, 0,
    Math.cos(playerAngle) * lookAheadDist,
  ));
  camLookAt.lerp(lookTarget, 1 - Math.exp(-5 * dt));
  camera.lookAt(camLookAt);

  const baseFov = THREE.MathUtils.lerp(56, 68, speedRatio);
  const targetFov = THREE.MathUtils.lerp(baseFov, 22, spyglassAmount);
  camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 1 - Math.exp(-6 * dt));
  camera.updateProjectionMatrix();
  ui.setSpyglass(spyglass);
}

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

  const fwd = Math.max(-1, Math.min(1,
    (keys['w'] || keys['arrowup'] ? 1 : 0)
    - (keys['s'] || keys['arrowdown'] ? 1 : 0)
    + touchFwd,
  ));
  const turn = Math.max(-1, Math.min(1,
    (keys['a'] || keys['arrowleft'] ? 1 : 0)
    - (keys['d'] || keys['arrowright'] ? 1 : 0)
    + touchTurn,
  ));

  // Wind direction affects speed
  const weatherCfg = weather.getCurrentConfig();
  const windDir = weatherCfg.sunDirection;
  const shipForward = new THREE.Vector3(Math.sin(playerAngle), 0, Math.cos(playerAngle));
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

  const sternWorld = new THREE.Vector3(0, 0, -2.2)
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), playerAngle)
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
  const minimapEntities: Array<{x: number, z: number, type: 'merchant' | 'escort' | 'boss'}> = [];

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
        fireEffect.emit(m.pos.clone().add(new THREE.Vector3(0, 1, 0)), 3);
      } else if (m.sinkTimer < 2.5) {
        if (m.sinkPhase < 3) {
          m.sinkPhase = 3;
          shipBreakup.emit(m.pos);
        }
        m.mesh.position.y -= dt * 2.5;
        m.mesh.rotation.x -= dt * 0.8;
        m.mesh.rotation.z += dt * 0.5;
        fireEffect.emit(m.pos.clone().add(new THREE.Vector3(0, 0.5, 0)), 2);
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

    // Chain shot slow timer
    if (m.chainSlowTimer > 0) {
      m.chainSlowTimer -= dt;
      m.speed = m.baseSpeed * 0.5;
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
        screenShake.trigger(0.8);
        audio.playExplosion(m.pos, playerPos);

        // Damage player if in range
        if (explResult.playerDamage > 0) {
          const dead = progression.takeDamage(explResult.playerDamage);
          ui.updateHealth(stats.health, stats.maxHealth);
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
        progression.onShipDestroyed();
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

      const fireDir = new THREE.Vector3(
        playerPos.x - m.pos.x, 0.3, playerPos.z - m.pos.z,
      ).normalize();
      cannonSmoke.emit(m.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), fireDir, 8);
      muzzleFlash.emit(m.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), fireDir);
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
      progression.onShipDestroyed();
      ui.updateWaveCounter(
        progression.getCurrentWave(),
        progression.getShipsRemaining(),
        progression.getShipsTotal(),
      );
    }
  }

  // Add islands to minimap
  for (const island of world.getIslands()) {
    minimapEntities.push({
      x: island.pos.x, z: island.pos.z,
      type: 'merchant' as const, // reuse merchant color for islands
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

function triggerCapture(m: Merchant, _index: number) {
  if (m.state === 'sinking') return; // prevent double-capture

  const now = performance.now() / 1000;
  combo = (now - lastCaptureTime < 5) ? combo + 1 : 1;
  lastCaptureTime = now;

  const reward = m.value * combo;
  progression.addScore(reward);
  ui.updateScoreAnimated(progression.getScore());
  ui.showCapture(`+${reward} Gold!`, combo);
  goldBurst.emit(m.pos, 30 + combo * 8);
  waterSplash.emit(m.pos, 20);
  screenShake.trigger(0.4 + combo * 0.12);
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
  }

  // Roll for treasure map drop
  if (events.rollForTreasureMap()) {
    const islands = world.getIslands();
    if (islands.length > 0) {
      events.startEvent('treasure_map', playerPos, islands.length);
      ui.showTreasureMapIndicator();
    }
  }

  // Tutorial: captured
  tutorialCaptured = true;

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
  const targets = merchants
    .filter(m => m.state !== 'sinking')
    .map(m => ({ pos: m.pos, hitRadius: m.hitRadius, id: m.id }));

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
      const destroyed = events.hitTentacle(tentIndex, hit.damage);
      explosionEffect.emit(hit.hitPos, 25);
      audio.playExplosion(hit.hitPos, playerPos);
      screenShake.trigger(0.3);
      if (destroyed) {
        goldBurst.emit(hit.hitPos, 15);
      }
      continue;
    }

    const m = merchants.find(m => m.id === hit.targetId);
    if (!m || m.state === 'sinking') continue;

    m.hp -= hit.damage;

    // Chain shot effect
    if (progression.getPlayerStats().chainShotActive) {
      m.chainSlowTimer = 3;
    }

    // Effects at hit point
    explosionEffect.emit(hit.hitPos, 20);
    audio.playExplosion(hit.hitPos, playerPos);
    screenShake.trigger(0.25);

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
    const stats = progression.getPlayerStats();

    const dead = progression.takeDamage(playerHit.damage);
    explosionEffect.emit(playerHit.hitPos, 15);
    audio.playExplosion(playerHit.hitPos, playerPos);
    screenShake.trigger(0.6);

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

    if (dead && !gameOverFired) {
      gameOverFired = true;
      onGameOver();
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
    screenShake.trigger(0.3);
    skySystem.triggerLightning(playerPos);
    audio.playLightningCrack();
    if (result.thunderDelay > 0) {
      setTimeout(() => {
        audio.playThunder();
      }, result.thunderDelay * 1000);
    }
  }

  // Update lanterns on all ships
  setShipLanterns(playerGroup, isNight);
  for (const m of merchants) {
    if (m.state !== 'sinking') {
      setShipLanterns(m.mesh, isNight);
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

  // Check island collision and reef damage
  const collision = world.checkCollision(playerPos, dt);
  if (collision.bounceDir) {
    playerPos.add(collision.bounceDir.multiplyScalar(dt));
    playerSpeed *= 0.5;
  }
  if (collision.reefDamage > 0) {
    const dead = progression.takeDamage(collision.reefDamage);
    const stats = progression.getPlayerStats();
    ui.updateHealth(stats.health, stats.maxHealth);
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
    ui.showCapture(`+${treasureGold} Treasure!`, 1);
    goldBurst.emit(playerPos, 50);
    audio.playCoinJingle(3);
    world.collectTreasure(digIsland);
    events.clearTreasureMap();
    ui.hideTreasureMapIndicator();
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
    const eventType = events.rollForEvent(waveNum, weatherState);
    if (eventType) {
      events.startEvent(eventType, playerPos, world.getIslands().length);

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
  if (result.damageToPlayer > 0) {
    const dead = progression.takeDamage(result.damageToPlayer);
    const stats = progression.getPlayerStats();
    ui.updateHealth(stats.health, stats.maxHealth);
    screenShake.trigger(0.3);
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
      if (serpentDmg > 0) {
        const dead = progression.takeDamage(serpentDmg * dt);
        const stats = progression.getPlayerStats();
        ui.updateHealth(stats.health, stats.maxHealth);
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
    ui.hideEventWarning();
    ui.hideEventTimer();
    krakenTentacle.dispose();
    whirlpoolEffect.dispose();
    seaSerpentEffect.dispose();
    audio.setEventMode(null);
    weather.setEventOverlay(null);
  }
}

// ===================================================================
//  Update: tutorial
// ===================================================================

function updateTutorial(dt: number) {
  if (!tutorial.isActive()) return;

  // Track movement condition
  if (Math.abs(playerSpeed) > 1) tutorialMoved = true;

  tutorial.advanceIfConditionMet({
    moved: tutorialMoved,
    fired: tutorialFired,
    captured: tutorialCaptured,
    upgraded: tutorialUpgraded,
  });
  tutorial.update(dt);
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
  const timeScale = screenJuice.update(rawDt, healthPct);

  const dt = rawDt * timeScale;
  time += dt;

  ocean.update(time, gameStarted ? playerPos : new THREE.Vector3());

  if (gameStarted && !gamePaused) {
    updatePlayer(dt);
    updateMerchants(dt);
    updateCombat(dt);
    updateWeather(dt);
    updateWorld(dt);
    updateEvents(dt);
    updateTutorial(dt);
    updateWaveLifecycle(dt);
    updateCamera(dt);
  } else if (gameStarted && gamePaused) {
    updateWeather(dt);
    updateCamera(dt);
    // Update port scene if active
    if (portScene) {
      portScene.update(dt, time);
    }
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

  // Speed lines
  if (gameStarted && !gamePaused) {
    speedLines.update(dt, playerPos, playerAngle, Math.abs(playerSpeed));
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
