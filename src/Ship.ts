import * as THREE from 'three';
import type { ShipClass } from './Types';

// ---------------------------------------------------------------------------
//  Sail animation shader material
// ---------------------------------------------------------------------------

const sailVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uWindStrength;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 pos = position;
    // Billow effect: displace x based on y position (higher = more billow)
    float billow = sin(pos.y * 2.5 + uTime * 3.0) * 0.12 * uWindStrength;
    // Add secondary ripple for organic feel
    billow += sin(pos.y * 5.0 + uTime * 5.0) * 0.04 * uWindStrength;
    pos.x += billow;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const sailFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    // Simple toon-like shading
    float shade = 0.7 + 0.3 * vUv.y;
    gl_FragColor = vec4(uColor * shade, 1.0);
  }
`;

const flagVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uWindStrength;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 pos = position;
    // More aggressive wave for flag
    float wave = sin(pos.x * 8.0 + uTime * 6.0) * 0.06 * uWindStrength;
    wave += sin(pos.x * 12.0 + uTime * 8.0) * 0.03 * uWindStrength;
    pos.z += wave;
    pos.y += sin(pos.x * 6.0 + uTime * 4.0) * 0.02 * uWindStrength;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

/**
 * Create an animated sail ShaderMaterial with wind billowing.
 */
function createSailMaterial(color: number): THREE.ShaderMaterial {
  const c = new THREE.Color(color);
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uWindStrength: { value: 0.8 },
      uColor: { value: c },
    },
    vertexShader: sailVertexShader,
    fragmentShader: sailFragmentShader,
    side: THREE.DoubleSide,
  });
}

export function createFlagMaterial(color: number): THREE.ShaderMaterial {
  const c = new THREE.Color(color);
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uWindStrength: { value: 1.0 },
      uColor: { value: c },
    },
    vertexShader: flagVertexShader,
    fragmentShader: sailFragmentShader,
    side: THREE.DoubleSide,
  });
}

// ---------------------------------------------------------------------------
//  Visual progression tiers
// ---------------------------------------------------------------------------

export interface ShipVisualConfig {
  speedTier?: number;   // 0-3: sails get gold trim
  armorTier?: number;   // 0-3: metal bands on hull
  weaponTier?: number;  // 0-3: cannons become emissive
  isBoss?: boolean;     // dark red/black, scale 1.8
  surrenderFlag?: boolean; // white flag at mast top
}

// ---------------------------------------------------------------------------
//  Ship class dimension configs
// ---------------------------------------------------------------------------

interface ShipClassDimensions {
  hull: [number, number, number];       // width, height, length
  keel: [number, number, number];
  bowRadius: number;
  bowLength: number;
  bowZ: number;
  sternRadius: number;
  sternLength: number;
  sternZ: number;
  deck: [number, number, number];
  mainMastHeight: number;
  mainMastY: number;
  mainSailSize: [number, number];
  mainSailY: number;
  hasForeMast: boolean;
  foreMastHeight: number;
  foreMastY: number;
  foreMastZ: number;
  foreSailSize: [number, number];
  foreSailY: number;
  hasAftMast: boolean;                  // galleon 3rd mast
  aftMastHeight: number;
  aftMastY: number;
  aftMastZ: number;
  aftSailSize: [number, number];
  aftSailY: number;
  jibTop: [number, number, number];     // top vertex
  jibMid: [number, number, number];     // mid vertex
  jibBow: [number, number, number];     // bow vertex
  jibScale: number;                     // scale multiplier for jib
  hasCabin: boolean;
  cabinWidth: number;
  cabinZ: number;
  roofWidth: number;
  railWidth: number;
  railZ: number;
  railLength: number;
  cannonZPositions: number[];
  cannonSideOffset: number;
  flagY: number;
  bowLanternZ: number;
  sternLanternZ: number;
  hasForecastle: boolean;               // galleon raised bow deck
}

const SLOOP_DIMS: ShipClassDimensions = {
  hull: [1.0, 0.45, 3.0],
  keel: [0.65, 0.22, 3.2],
  bowRadius: 0.50, bowLength: 1.0, bowZ: 1.95,
  sternRadius: 0.45, sternLength: 0.6, sternZ: -1.7,
  deck: [0.85, 0.07, 2.7],
  mainMastHeight: 3.5, mainMastY: 2.1, mainSailSize: [1.6, 1.8], mainSailY: 1.9,
  hasForeMast: false,
  foreMastHeight: 0, foreMastY: 0, foreMastZ: 0,
  foreSailSize: [0, 0], foreSailY: 0,
  hasAftMast: false,
  aftMastHeight: 0, aftMastY: 0, aftMastZ: 0,
  aftSailSize: [0, 0], aftSailY: 0,
  jibTop: [0, 2.7, 1.05], jibMid: [0, 0.7, 1.05], jibBow: [0, 0.5, 2.3],
  jibScale: 0.85,
  hasCabin: false,
  cabinWidth: 0, cabinZ: 0,
  roofWidth: 0,
  railWidth: 0.45, railZ: 0, railLength: 2.5,
  cannonZPositions: [-0.3, 0.5],
  cannonSideOffset: 0.55,
  flagY: 3.7,
  bowLanternZ: 1.6, sternLanternZ: -1.3,
  hasForecastle: false,
};

const BRIGANTINE_DIMS: ShipClassDimensions = {
  hull: [1.3, 0.55, 3.6],
  keel: [0.85, 0.28, 3.9],
  bowRadius: 0.65, bowLength: 1.3, bowZ: 2.35,
  sternRadius: 0.6, sternLength: 0.7, sternZ: -2.05,
  deck: [1.1, 0.07, 3.3],
  mainMastHeight: 4.0, mainMastY: 2.4, mainSailSize: [2.0, 2.2], mainSailY: 2.2,
  hasForeMast: true,
  foreMastHeight: 2.8, foreMastY: 1.8, foreMastZ: 1.3,
  foreSailSize: [1.4, 1.4], foreSailY: 1.6,
  hasAftMast: false,
  aftMastHeight: 0, aftMastY: 0, aftMastZ: 0,
  aftSailSize: [0, 0], aftSailY: 0,
  jibTop: [0, 3.2, 1.3], jibMid: [0, 0.8, 1.3], jibBow: [0, 0.6, 2.9],
  jibScale: 1.0,
  hasCabin: true,
  cabinWidth: 1.0, cabinZ: -1.35,
  roofWidth: 1.1,
  railWidth: 0.6, railZ: 0, railLength: 3.0,
  cannonZPositions: [-0.6, 0.2, 1.0],
  cannonSideOffset: 0.7,
  flagY: 4.3,
  bowLanternZ: 2.0, sternLanternZ: -1.6,
  hasForecastle: false,
};

const GALLEON_DIMS: ShipClassDimensions = {
  hull: [1.8, 0.7, 4.5],
  keel: [1.15, 0.35, 4.8],
  bowRadius: 0.85, bowLength: 1.6, bowZ: 3.0,
  sternRadius: 0.8, sternLength: 0.9, sternZ: -2.6,
  deck: [1.55, 0.07, 4.2],
  mainMastHeight: 5.0, mainMastY: 2.9, mainSailSize: [2.6, 2.8], mainSailY: 2.7,
  hasForeMast: true,
  foreMastHeight: 3.5, foreMastY: 2.1, foreMastZ: 1.6,
  foreSailSize: [1.8, 1.8], foreSailY: 2.0,
  hasAftMast: true,
  aftMastHeight: 2.8, aftMastY: 1.8, aftMastZ: -1.2,
  aftSailSize: [1.3, 1.3], aftSailY: 1.6,
  jibTop: [0, 3.8, 1.6], jibMid: [0, 0.9, 1.6], jibBow: [0, 0.7, 3.6],
  jibScale: 1.15,
  hasCabin: true,
  cabinWidth: 1.4, cabinZ: -1.7,
  roofWidth: 1.5,
  railWidth: 0.85, railZ: 0, railLength: 4.0,
  cannonZPositions: [-1.2, -0.4, 0.4, 1.2, 1.8],
  cannonSideOffset: 0.95,
  flagY: 5.3,
  bowLanternZ: 2.6, sternLanternZ: -2.1,
  hasForecastle: true,
};

function getDimensions(shipClass: ShipClass): ShipClassDimensions {
  switch (shipClass) {
    case 'sloop': return SLOOP_DIMS;
    case 'galleon': return GALLEON_DIMS;
    case 'brigantine':
    default: return BRIGANTINE_DIMS;
  }
}

// ---------------------------------------------------------------------------
//  Geometry cache — shared across all ships of same class
// ---------------------------------------------------------------------------

interface ShipGeoCache {
  hull: THREE.BoxGeometry;
  keel: THREE.BoxGeometry;
  bow: THREE.ConeGeometry;
  stern: THREE.ConeGeometry;
  deck: THREE.BoxGeometry;
  mainMast: THREE.CylinderGeometry;
  mainSail: THREE.PlaneGeometry;
  foreMast: THREE.CylinderGeometry | null;
  foreSail: THREE.PlaneGeometry | null;
  aftMast: THREE.CylinderGeometry | null;
  aftSail: THREE.PlaneGeometry | null;
  jib: THREE.BufferGeometry;
  cabin: THREE.BoxGeometry | null;
  roof: THREE.BoxGeometry | null;
  forecastle: THREE.BoxGeometry | null;
  fcRail: THREE.BoxGeometry | null;
  rail: THREE.BoxGeometry;
  flag: THREE.PlaneGeometry;
  lantern: THREE.SphereGeometry;
  cannon: THREE.CylinderGeometry;
}

const geoCacheMap = new Map<ShipClass, ShipGeoCache>();

function getGeoCache(cls: ShipClass): ShipGeoCache {
  let c = geoCacheMap.get(cls);
  if (c) return c;

  const d = getDimensions(cls);

  const bow = new THREE.ConeGeometry(d.bowRadius, d.bowLength, 4);
  bow.rotateX(Math.PI / 2);
  const stern = new THREE.ConeGeometry(d.sternRadius, d.sternLength, 4);
  stern.rotateX(-Math.PI / 2);

  const jib = new THREE.BufferGeometry();
  const jibVerts = new Float32Array([
    d.jibTop[0], d.jibTop[1], d.jibTop[2],
    d.jibMid[0], d.jibMid[1], d.jibMid[2],
    d.jibBow[0], d.jibBow[1], d.jibBow[2],
  ]);
  jib.setAttribute('position', new THREE.BufferAttribute(jibVerts, 3));
  jib.computeVertexNormals();

  c = {
    hull: new THREE.BoxGeometry(d.hull[0], d.hull[1], d.hull[2]),
    keel: new THREE.BoxGeometry(d.keel[0], d.keel[1], d.keel[2]),
    bow,
    stern,
    deck: new THREE.BoxGeometry(d.deck[0], d.deck[1], d.deck[2]),
    mainMast: new THREE.CylinderGeometry(0.04, 0.06, d.mainMastHeight, 6),
    mainSail: new THREE.PlaneGeometry(d.mainSailSize[0], d.mainSailSize[1], 8, 8),
    foreMast: d.hasForeMast ? new THREE.CylinderGeometry(0.03, 0.05, d.foreMastHeight, 6) : null,
    foreSail: d.hasForeMast ? new THREE.PlaneGeometry(d.foreSailSize[0], d.foreSailSize[1], 6, 6) : null,
    aftMast: d.hasAftMast ? new THREE.CylinderGeometry(0.03, 0.05, d.aftMastHeight, 6) : null,
    aftSail: d.hasAftMast ? new THREE.PlaneGeometry(d.aftSailSize[0], d.aftSailSize[1], 6, 6) : null,
    jib,
    cabin: d.hasCabin ? new THREE.BoxGeometry(d.cabinWidth, 0.55, 0.9) : null,
    roof: d.hasCabin ? new THREE.BoxGeometry(d.roofWidth, 0.07, 1.0) : null,
    forecastle: d.hasForecastle ? new THREE.BoxGeometry(d.hull[0] * 0.85, 0.35, 1.2) : null,
    fcRail: d.hasForecastle ? new THREE.BoxGeometry(0.04, 0.25, 1.2) : null,
    rail: new THREE.BoxGeometry(0.04, 0.22, d.railLength),
    flag: new THREE.PlaneGeometry(0.5, 0.3, 6, 4),
    lantern: new THREE.SphereGeometry(0.12, 4, 4),
    cannon: new THREE.CylinderGeometry(0.04, 0.06, 0.4, 4),
  };
  geoCacheMap.set(cls, c);
  return c;
}

// Shared materials (never modified after creation)
const matDark = new THREE.MeshToonMaterial({ color: 0x1e120a });
const matDeck = new THREE.MeshToonMaterial({ color: 0xc4a060 });
const matLantern = new THREE.MeshBasicMaterial({ color: 0xffaa44 });
const matCannon = new THREE.MeshToonMaterial({ color: 0x222222 });
const matCannonFire = new THREE.MeshBasicMaterial({ color: 0xff6600 });
const matTrimGold = new THREE.MeshBasicMaterial({ color: 0xffd700 });
const matArmorBand = new THREE.MeshToonMaterial({ color: 0x666666 });

// Hull material cache by color
const hullMatCache = new Map<number, THREE.MeshToonMaterial>();
function getHullMat(color: number): THREE.MeshToonMaterial {
  let m = hullMatCache.get(color);
  if (!m) { m = new THREE.MeshToonMaterial({ color }); hullMatCache.set(color, m); }
  return m;
}

// Jib toon sail cache by color
const jibMatCache = new Map<number, THREE.MeshToonMaterial>();
function getJibMat(color: number): THREE.MeshToonMaterial {
  let m = jibMatCache.get(color);
  if (!m) { m = new THREE.MeshToonMaterial({ color, side: THREE.DoubleSide }); jibMatCache.set(color, m); }
  return m;
}

/**
 * Build a low-poly pirate / merchant ship out of simple primitives.
 * Returns a Group so it can be positioned / rotated as one unit.
 * Uses cached geometries and shared materials for fast instantiation.
 */
export function createShipMesh(
  hullColor: number,
  sailColor: number,
  scale = 1,
  visualConfig?: ShipVisualConfig,
  shipClass?: ShipClass,
): THREE.Group {
  const g = new THREE.Group();
  g.rotation.order = 'YXZ';

  const cfg = visualConfig ?? {};
  const cls = shipClass ?? 'brigantine';
  const d = getDimensions(cls);
  const geo = getGeoCache(cls);

  const wood = getHullMat(hullColor);
  const sailMat = createSailMaterial(sailColor);

  // ---- Hull body ----
  const hull = new THREE.Mesh(geo.hull, wood);
  hull.position.y = 0.1;
  g.add(hull);

  // ---- Keel ----
  const keel = new THREE.Mesh(geo.keel, matDark);
  keel.position.y = -0.18;
  g.add(keel);

  // ---- Bow ----
  const bow = new THREE.Mesh(geo.bow, wood);
  bow.position.set(0, 0.08, d.bowZ);
  g.add(bow);

  // ---- Stern ----
  const stern = new THREE.Mesh(geo.stern, wood);
  stern.position.set(0, 0.08, d.sternZ);
  g.add(stern);

  // ---- Deck ----
  const deckMesh = new THREE.Mesh(geo.deck, matDeck);
  deckMesh.position.y = 0.41;
  g.add(deckMesh);

  // ---- Main mast ----
  const mast = new THREE.Mesh(geo.mainMast, matDark);
  mast.position.set(0, d.mainMastY, 0.1);
  g.add(mast);

  // ---- Main sail ----
  const mainSail = new THREE.Mesh(geo.mainSail, sailMat);
  mainSail.position.set(0, d.mainSailY, 0.1);
  mainSail.name = 'sail';
  g.add(mainSail);

  // ---- Fore mast ----
  if (d.hasForeMast && geo.foreMast && geo.foreSail) {
    const mast2 = new THREE.Mesh(geo.foreMast, matDark);
    mast2.position.set(0, d.foreMastY, d.foreMastZ);
    g.add(mast2);

    const foreSailMat = createSailMaterial(sailColor);
    const foreSail = new THREE.Mesh(geo.foreSail, foreSailMat);
    foreSail.position.set(0, d.foreSailY, d.foreMastZ);
    foreSail.name = 'sail';
    g.add(foreSail);
  }

  // ---- Aft mast ----
  if (d.hasAftMast && geo.aftMast && geo.aftSail) {
    const aftMast = new THREE.Mesh(geo.aftMast, matDark);
    aftMast.position.set(0, d.aftMastY, d.aftMastZ);
    g.add(aftMast);

    const aftSailMat = createSailMaterial(sailColor);
    const aftSail = new THREE.Mesh(geo.aftSail, aftSailMat);
    aftSail.position.set(0, d.aftSailY, d.aftMastZ);
    aftSail.name = 'sail';
    g.add(aftSail);
  }

  // ---- Jib ----
  g.add(new THREE.Mesh(geo.jib, getJibMat(sailColor)));

  // ---- Stern cabin ----
  if (d.hasCabin && geo.cabin && geo.roof) {
    const cabin = new THREE.Mesh(geo.cabin, wood);
    cabin.position.set(0, 0.72, d.cabinZ);
    g.add(cabin);

    const roof = new THREE.Mesh(geo.roof, matDark);
    roof.position.set(0, 1.02, d.cabinZ);
    g.add(roof);
  }

  // ---- Forecastle ----
  if (d.hasForecastle && geo.forecastle && geo.fcRail) {
    const fcWidth = d.hull[0] * 0.85;
    const forecastle = new THREE.Mesh(geo.forecastle, wood);
    forecastle.position.set(0, 0.6, d.bowZ - 0.9);
    forecastle.name = 'forecastle';
    g.add(forecastle);

    for (const side of [-1, 1]) {
      const fcRail = new THREE.Mesh(geo.fcRail, matDark);
      fcRail.position.set(side * fcWidth * 0.5, 0.9, d.bowZ - 0.9);
      g.add(fcRail);
    }
  }

  // ---- Railing ----
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(geo.rail, matDark);
    rail.position.set(side * d.railWidth, 0.56, d.railZ);
    g.add(rail);
  }

  // ---- Flag ----
  const flagColor = sailColor === 0xf5f0e6 ? 0x222222 : sailColor;
  const flagMat = createFlagMaterial(flagColor);
  const flag = new THREE.Mesh(geo.flag, flagMat);
  flag.position.set(0.28, d.flagY, 0.1);
  flag.name = 'flag';
  g.add(flag);

  // ---- Lanterns ----
  const bowLantern = new THREE.Mesh(geo.lantern, matLantern);
  bowLantern.position.set(0, 1.2, d.bowLanternZ);
  bowLantern.name = 'lantern';
  bowLantern.visible = false;
  g.add(bowLantern);

  const bowLight = new THREE.PointLight(0xffaa44, 0.8, 8);
  bowLight.position.set(0, 1.2, d.bowLanternZ);
  bowLight.name = 'lantern-light';
  bowLight.visible = false;
  g.add(bowLight);

  const sternLantern = new THREE.Mesh(geo.lantern, matLantern);
  sternLantern.position.set(0, 1.3, d.sternLanternZ);
  sternLantern.name = 'lantern';
  sternLantern.visible = false;
  g.add(sternLantern);

  const sternLight = new THREE.PointLight(0xffaa44, 0.8, 8);
  sternLight.position.set(0, 1.3, d.sternLanternZ);
  sternLight.name = 'lantern-light';
  sternLight.visible = false;
  g.add(sternLight);

  // ---- Cannons ----
  const cMat = (cfg.weaponTier ?? 0) >= 1 ? matCannonFire : matCannon;
  for (const side of [-1, 1]) {
    for (const z of d.cannonZPositions) {
      const cannon = new THREE.Mesh(geo.cannon, cMat);
      cannon.rotation.z = Math.PI / 2;
      cannon.position.set(side * d.cannonSideOffset, 0.35, z);
      cannon.name = 'cannon';
      g.add(cannon);
    }
  }

  // ---- Visual progression: speed tier ----
  if ((cfg.speedTier ?? 0) >= 1) {
    const trimGeo = new THREE.BoxGeometry(d.mainSailSize[0] + 0.05, 0.04, 0.02);
    const trim1 = new THREE.Mesh(trimGeo, matTrimGold);
    trim1.position.set(0, d.mainSailY - d.mainSailSize[1] * 0.5 + 0.05, 0.1);
    trim1.name = 'speed-trim';
    g.add(trim1);
    const trim2 = new THREE.Mesh(trimGeo, matTrimGold);
    trim2.position.set(0, d.mainSailY + d.mainSailSize[1] * 0.5 - 0.05, 0.1);
    trim2.name = 'speed-trim';
    g.add(trim2);
  }

  // ---- Visual progression: armor tier ----
  if ((cfg.armorTier ?? 0) >= 1) {
    const bandGeo = new THREE.BoxGeometry(d.hull[0] + 0.1, 0.06, 0.15);
    for (let i = 0; i < Math.min(cfg.armorTier!, 3); i++) {
      const zPos = -1.0 + i * 1.2;
      const band = new THREE.Mesh(bandGeo, matArmorBand);
      band.position.set(0, -0.02, zPos);
      band.name = 'armor-band';
      g.add(band);
    }
  }

  // ---- Surrender white flag ----
  if (cfg.surrenderFlag) {
    const whiteFlagGeo = new THREE.PlaneGeometry(0.45, 0.35, 4, 3);
    const whiteFlagMat = createFlagMaterial(0xffffff);
    const whiteFlag = new THREE.Mesh(whiteFlagGeo, whiteFlagMat);
    whiteFlag.position.set(0.25, d.flagY + 0.3, 0.1);
    whiteFlag.name = 'surrender-flag';
    g.add(whiteFlag);
  }

  g.scale.setScalar(scale);
  return g;
}

/**
 * Toggle lantern visibility for night mode.
 * Traverses the ship group and sets all lantern meshes and lights on or off.
 */
const lanternCache = new WeakMap<THREE.Group, THREE.Object3D[]>();

export function setShipLanterns(ship: THREE.Group, on: boolean): void {
  let lanterns = lanternCache.get(ship);
  if (!lanterns) {
    lanterns = [];
    ship.traverse((child) => {
      if (child.name === 'lantern' || child.name === 'lantern-light') {
        lanterns!.push(child);
      }
    });
    lanternCache.set(ship, lanterns);
  }
  for (let i = 0; i < lanterns.length; i++) {
    lanterns[i].visible = on;
  }
}

/**
 * Update sail and flag shader uniforms for wind animation.
 * Call once per frame for each visible ship.
 */
const sailCache = new WeakMap<THREE.Group, THREE.ShaderMaterial[]>();

export function updateShipSails(ship: THREE.Group, time: number, windStrength = 0.8): void {
  let mats = sailCache.get(ship);
  if (!mats) {
    mats = [];
    ship.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.ShaderMaterial) {
        const u = child.material.uniforms;
        if (u.uTime !== undefined) mats!.push(child.material);
      }
    });
    sailCache.set(ship, mats);
  }
  for (let i = 0; i < mats.length; i++) {
    const u = mats[i].uniforms;
    u.uTime.value = time;
    u.uWindStrength.value = windStrength;
  }
}

/**
 * Add a surrender white flag to an existing ship mesh.
 */
export function addSurrenderFlag(ship: THREE.Group): void {
  // Check if already has one
  let hasSurrenderFlag = false;
  ship.traverse((child) => {
    if (child.name === 'surrender-flag') hasSurrenderFlag = true;
  });
  if (hasSurrenderFlag) return;

  const whiteFlagGeo = new THREE.PlaneGeometry(0.45, 0.35, 4, 3);
  const whiteFlagMat = createFlagMaterial(0xffffff);
  const whiteFlag = new THREE.Mesh(whiteFlagGeo, whiteFlagMat);
  whiteFlag.position.set(0.25, 4.6, 0.1);
  whiteFlag.name = 'surrender-flag';
  ship.add(whiteFlag);
}

/**
 * Remove the surrender flag from a ship.
 */
export function removeSurrenderFlag(ship: THREE.Group): void {
  const toRemove: THREE.Object3D[] = [];
  ship.traverse((child) => {
    if (child.name === 'surrender-flag') toRemove.push(child);
  });
  for (const obj of toRemove) {
    ship.remove(obj);
  }
}
