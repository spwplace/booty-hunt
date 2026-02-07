import * as THREE from 'three';
import { Ocean } from './Ocean';
import { createShipMesh } from './Ship';
import { GoldBurst, ScreenShake, WakeTrail } from './Effects';
import { UI } from './UI';

// ===================================================================
//  Renderer & scene
// ===================================================================

const scene = new THREE.Scene();
const fogColor = new THREE.Color(0x14283c);
const fogDensity = 0.007;
scene.fog = new THREE.FogExp2(fogColor, fogDensity);

const camera = new THREE.PerspectiveCamera(
  60,
  innerWidth / innerHeight,
  0.1,
  500,
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
document.getElementById('game')!.appendChild(renderer.domElement);

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ===================================================================
//  Sky dome
// ===================================================================

const skyGeo = new THREE.SphereGeometry(420, 32, 32);
const skyMat = new THREE.ShaderMaterial({
  vertexShader: /* glsl */ `
    varying vec3 vDir;
    void main() {
      vDir = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec3 vDir;
    void main() {
      float y = normalize(vDir).y;
      vec3 top     = vec3(0.03, 0.03, 0.12);
      vec3 mid     = vec3(0.12, 0.08, 0.22);
      vec3 horizon = vec3(0.72, 0.35, 0.18);
      vec3 color = mix(horizon, mid, smoothstep(-0.02, 0.25, y));
      color = mix(color, top, smoothstep(0.25, 0.7, y));

      // Sun glow near horizon
      float sunDot = max(dot(normalize(vDir), normalize(vec3(0.4, 0.12, 0.3))), 0.0);
      color += vec3(1.0, 0.6, 0.2) * pow(sunDot, 32.0) * 0.7;
      color += vec3(1.0, 0.85, 0.5) * pow(sunDot, 256.0) * 1.2;

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

scene.add(new THREE.AmbientLight(0x334466, 0.55));
scene.add(new THREE.HemisphereLight(0x7788bb, 0x443322, 0.45));

// ===================================================================
//  Ocean
// ===================================================================

const ocean = new Ocean(fogColor, fogDensity);
scene.add(ocean.mesh);

// ===================================================================
//  Player ship
// ===================================================================

const playerGroup = createShipMesh(0x6b3a2a, 0xf5f0e6);
scene.add(playerGroup);

let playerAngle = 0;       // heading in radians (0 = +Z)
let playerSpeed = 0;
const playerPos = new THREE.Vector3(0, 0, 0);
let juiceScale = 1;
let juiceVel = 0;

// ===================================================================
//  Merchant ships
// ===================================================================

interface Merchant {
  mesh: THREE.Group;
  vel: THREE.Vector3;
  heading: number;
  alive: boolean;
}

const merchants: Merchant[] = [];
const MERCHANT_COUNT = 5;
const CAPTURE_DIST = 5;
const SAIL_COLORS = [0xcc2222, 0xccaa22, 0x2266cc, 0x22bb55, 0xcc6622, 0x9933aa];

function spawnMerchant(fromPlayer = true) {
  const angle = Math.random() * Math.PI * 2;
  const dist = fromPlayer ? 50 + Math.random() * 70 : 30 + Math.random() * 50;
  const origin = fromPlayer ? playerPos : new THREE.Vector3();
  const px = origin.x + Math.cos(angle) * dist;
  const pz = origin.z + Math.sin(angle) * dist;

  const sailCol = SAIL_COLORS[Math.floor(Math.random() * SAIL_COLORS.length)];
  const mesh = createShipMesh(0x8b6b4a, sailCol, 0.75);
  mesh.position.set(px, 0, pz);

  const heading = Math.random() * Math.PI * 2;
  const spd = 1.2 + Math.random() * 2.5;

  scene.add(mesh);
  merchants.push({
    mesh,
    vel: new THREE.Vector3(Math.sin(heading) * spd, 0, Math.cos(heading) * spd),
    heading,
    alive: true,
  });
}

for (let i = 0; i < MERCHANT_COUNT; i++) spawnMerchant(false);

// ===================================================================
//  Effects
// ===================================================================

const goldBurst = new GoldBurst(scene);
const screenShake = new ScreenShake();
const wake = new WakeTrail(scene);

// ===================================================================
//  UI
// ===================================================================

const ui = new UI();
let score = 0;

// ===================================================================
//  Input
// ===================================================================

const keys: Record<string, boolean> = {};

window.addEventListener('keydown', (e) => {
  keys[e.key.toLowerCase()] = true;
  if (!gameStarted && e.key !== 'F5' && e.key !== 'F12') {
    startGame();
  }
});
window.addEventListener('keyup', (e) => {
  keys[e.key.toLowerCase()] = false;
});

let gameStarted = false;

function startGame() {
  gameStarted = true;
  ui.hideTitle();
}

// ===================================================================
//  Camera
// ===================================================================

const camOffset = new THREE.Vector3();
const camLookAt = new THREE.Vector3();

function updateCamera(dt: number) {
  // Follow behind and above the player
  const behind = new THREE.Vector3(
    -Math.sin(playerAngle) * 22,
    16,
    -Math.cos(playerAngle) * 22,
  );
  const target = playerPos.clone().add(behind);
  camOffset.lerp(target, 1 - Math.exp(-3 * dt));
  camera.position.copy(camOffset).add(screenShake.offset);

  camLookAt.lerp(playerPos, 1 - Math.exp(-5 * dt));
  camera.lookAt(camLookAt);

  // Spyglass zoom
  const spyglass = keys[' '] ?? false;
  const targetFov = spyglass ? 22 : 60;
  camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 1 - Math.exp(-6 * dt));
  camera.updateProjectionMatrix();
  ui.setSpyglass(spyglass);
}

// ===================================================================
//  Update helpers
// ===================================================================

function updatePlayer(dt: number) {
  const fwd = (keys['w'] || keys['arrowup'] ? 1 : 0) - (keys['s'] || keys['arrowdown'] ? 1 : 0);
  const turn = (keys['a'] || keys['arrowleft'] ? 1 : 0) - (keys['d'] || keys['arrowright'] ? 1 : 0);

  // Speed with acceleration & drag
  const maxSpd = 14;
  const accel = fwd > 0 ? 8 : (fwd < 0 ? 5 : 0);
  const targetSpd = fwd > 0 ? maxSpd : (fwd < 0 ? -maxSpd * 0.3 : 0);

  if (fwd !== 0) {
    playerSpeed = THREE.MathUtils.lerp(
      playerSpeed,
      targetSpd,
      1 - Math.exp(-accel * dt * 0.3),
    );
  } else {
    playerSpeed *= Math.exp(-1.8 * dt); // water drag
  }

  // Turn
  const turnRate = 2.2;
  const speedRatio = Math.min(1, Math.abs(playerSpeed) / (maxSpd * 0.25));
  playerAngle += turn * turnRate * dt * speedRatio;

  // Move
  playerPos.x += Math.sin(playerAngle) * playerSpeed * dt;
  playerPos.z += Math.cos(playerAngle) * playerSpeed * dt;

  // Match wave height
  const waveY = ocean.getWaveHeight(playerPos.x, playerPos.z, time);
  playerPos.y = THREE.MathUtils.lerp(playerPos.y, waveY + 0.35, 1 - Math.exp(-8 * dt));

  // Juice scale (spring)
  juiceVel += (1 - juiceScale) * 35 * dt;
  juiceVel *= Math.exp(-6 * dt);
  juiceScale += juiceVel * dt;

  playerGroup.position.copy(playerPos);
  playerGroup.rotation.y = playerAngle;
  playerGroup.rotation.z = -turn * 0.12 * speedRatio; // lean into turns
  playerGroup.scale.setScalar(juiceScale);

  // Wake
  const sternWorld = new THREE.Vector3(0, 0, -2.2)
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), playerAngle)
    .add(playerPos);
  wake.spawn(sternWorld, Math.abs(playerSpeed), dt);
}

function updateMerchants(dt: number) {
  let nearestDist = Infinity;
  let nearestPos: THREE.Vector3 | null = null;

  for (let i = merchants.length - 1; i >= 0; i--) {
    const m = merchants[i];
    if (!m.alive) continue;

    // Drift
    m.mesh.position.addScaledVector(m.vel, dt);
    m.mesh.rotation.y = m.heading;

    // Wave height
    const wy = ocean.getWaveHeight(m.mesh.position.x, m.mesh.position.z, time);
    m.mesh.position.y = THREE.MathUtils.lerp(m.mesh.position.y, wy + 0.25, 1 - Math.exp(-6 * dt));

    // Distance check
    const dx = playerPos.x - m.mesh.position.x;
    const dz = playerPos.z - m.mesh.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < nearestDist) {
      nearestDist = dist;
      nearestPos = m.mesh.position;
    }

    // Capture!
    if (dist < CAPTURE_DIST) {
      m.alive = false;
      scene.remove(m.mesh);
      merchants.splice(i, 1);

      const reward = 50 + Math.floor(Math.random() * 100);
      score += reward;
      ui.updateScore(score);
      ui.showCapture(`+${reward} Gold!`);
      goldBurst.emit(m.mesh.position, 40);
      screenShake.trigger(0.7);
      juiceScale = 1.15;
      juiceVel = -3;

      // Respawn after a beat
      setTimeout(() => spawnMerchant(true), 1500);
    }

    // Despawn if too far from player (and respawn closer)
    if (dist > 180) {
      scene.remove(m.mesh);
      merchants.splice(i, 1);
      spawnMerchant(true);
    }
  }

  // Update compass
  if (nearestPos) {
    const dx = nearestPos.x - playerPos.x;
    const dz = nearestPos.z - playerPos.z;
    // Bearing from player to target, relative to camera facing
    const worldAngle = Math.atan2(dx, dz);
    const relAngle = worldAngle - playerAngle;
    ui.updateCompass(relAngle);
    ui.updateDistance(nearestDist);
  }
}

// ===================================================================
//  Main loop
// ===================================================================

let time = 0;
let lastNow = 0;

camOffset.set(0, 20, 30);

function animate(now: number) {
  requestAnimationFrame(animate);
  const dt = Math.min((now - lastNow) / 1000, 0.05);
  lastNow = now;
  time += dt;

  // Ocean always updates (title screen shows it)
  ocean.update(time, gameStarted ? playerPos : new THREE.Vector3());

  if (gameStarted) {
    updatePlayer(dt);
    updateMerchants(dt);
    updateCamera(dt);
  } else {
    // Title-screen orbit camera
    camera.position.set(
      Math.cos(time * 0.15) * 35,
      18 + Math.sin(time * 0.3) * 2,
      Math.sin(time * 0.15) * 35,
    );
    camera.lookAt(0, 0, 0);
    // Bob player ship on waves at origin for title screen
    playerGroup.position.y = ocean.getWaveHeight(0, 0, time) + 0.35;
  }

  // Effects
  goldBurst.update(dt);
  screenShake.update(dt);
  wake.update(dt);

  // Keep sky centered on camera
  sky.position.copy(camera.position);

  renderer.render(scene, camera);
}

requestAnimationFrame(animate);
