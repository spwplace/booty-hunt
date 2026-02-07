import * as THREE from 'three';

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

function createFlagMaterial(color: number): THREE.ShaderMaterial {
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

/**
 * Build a low-poly pirate / merchant ship out of simple primitives.
 * Returns a Group so it can be positioned / rotated as one unit.
 */
export function createShipMesh(
  hullColor: number,
  sailColor: number,
  scale = 1,
  visualConfig?: ShipVisualConfig,
): THREE.Group {
  const g = new THREE.Group();
  // YXZ order so heading (Y) applies first, then pitch (X), then roll (Z)
  g.rotation.order = 'YXZ';

  const cfg = visualConfig ?? {};

  const wood = new THREE.MeshToonMaterial({ color: hullColor });
  const sailMat = createSailMaterial(sailColor);
  const dark = new THREE.MeshToonMaterial({ color: 0x1e120a });
  const deck = new THREE.MeshToonMaterial({ color: 0xc4a060 });

  // ---- Hull body ----
  const hull = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.55, 3.6), wood);
  hull.position.y = 0.1;
  g.add(hull);

  // ---- Keel (darker, narrower) ----
  const keel = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.28, 3.9), dark);
  keel.position.y = -0.18;
  g.add(keel);

  // ---- Bow (front wedge) ----
  const bowGeo = new THREE.ConeGeometry(0.65, 1.3, 4);
  bowGeo.rotateX(Math.PI / 2);
  const bow = new THREE.Mesh(bowGeo, wood);
  bow.position.set(0, 0.08, 2.35);
  g.add(bow);

  // ---- Stern (back wedge, flatter) ----
  const sternGeo = new THREE.ConeGeometry(0.6, 0.7, 4);
  sternGeo.rotateX(-Math.PI / 2);
  const stern = new THREE.Mesh(sternGeo, wood);
  stern.position.set(0, 0.08, -2.05);
  g.add(stern);

  // ---- Deck ----
  const deckMesh = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.07, 3.3), deck);
  deckMesh.position.y = 0.41;
  g.add(deckMesh);

  // ---- Main mast ----
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 4.0, 6), dark);
  mast.position.set(0, 2.4, 0.1);
  g.add(mast);

  // ---- Main sail (animated shader) ----
  // Use segmented PlaneGeometry for vertex displacement
  const mainSailGeo = new THREE.PlaneGeometry(2.0, 2.2, 8, 8);
  const mainSail = new THREE.Mesh(mainSailGeo, sailMat);
  mainSail.position.set(0, 2.2, 0.1);
  mainSail.name = 'sail';
  g.add(mainSail);

  // ---- Secondary mast (smaller, forward) ----
  const mast2 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 2.8, 6), dark);
  mast2.position.set(0, 1.8, 1.3);
  g.add(mast2);

  // ---- Fore sail (animated shader) ----
  const foreSailGeo = new THREE.PlaneGeometry(1.4, 1.4, 6, 6);
  const foreSailMat = createSailMaterial(sailColor);
  const foreSail = new THREE.Mesh(foreSailGeo, foreSailMat);
  foreSail.position.set(0, 1.6, 1.3);
  foreSail.name = 'sail';
  g.add(foreSail);

  // ---- Jib (triangular front sail) ----
  const jibGeo = new THREE.BufferGeometry();
  const jibVerts = new Float32Array([
    0, 3.2, 1.3,
    0, 0.8, 1.3,
    0, 0.6, 2.9,
  ]);
  jibGeo.setAttribute('position', new THREE.BufferAttribute(jibVerts, 3));
  jibGeo.computeVertexNormals();
  const toonSail = new THREE.MeshToonMaterial({ color: sailColor, side: THREE.DoubleSide });
  g.add(new THREE.Mesh(jibGeo, toonSail));

  // ---- Stern cabin ----
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.55, 0.9), wood);
  cabin.position.set(0, 0.72, -1.35);
  g.add(cabin);

  // ---- Cabin roof ----
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.07, 1.0), dark);
  roof.position.set(0, 1.02, -1.35);
  g.add(roof);

  // ---- Railing ----
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 3.0), dark);
    rail.position.set(side * 0.6, 0.56, 0);
    g.add(rail);
  }

  // ---- Flag at top of main mast (animated shader) ----
  const flagGeo = new THREE.PlaneGeometry(0.5, 0.3, 6, 4);
  const flagColor = sailColor === 0xf5f0e6 ? 0x222222 : sailColor;
  const flagMat = createFlagMaterial(flagColor);
  const flag = new THREE.Mesh(flagGeo, flagMat);
  flag.position.set(0.28, 4.3, 0.1);
  flag.name = 'flag';
  g.add(flag);

  // ---- Lanterns (for night mode) ----
  const lanternMat = new THREE.MeshBasicMaterial({ color: 0xffaa44 });

  // Bow lantern
  const bowLantern = new THREE.Mesh(new THREE.SphereGeometry(0.12, 4, 4), lanternMat);
  bowLantern.position.set(0, 1.2, 2.0);
  bowLantern.name = 'lantern';
  bowLantern.visible = false;
  g.add(bowLantern);

  // Bow lantern light
  const bowLight = new THREE.PointLight(0xffaa44, 0.8, 8);
  bowLight.position.set(0, 1.2, 2.0);
  bowLight.name = 'lantern-light';
  bowLight.visible = false;
  g.add(bowLight);

  // Stern lantern
  const sternLantern = new THREE.Mesh(new THREE.SphereGeometry(0.12, 4, 4), lanternMat);
  sternLantern.position.set(0, 1.3, -1.6);
  sternLantern.name = 'lantern';
  sternLantern.visible = false;
  g.add(sternLantern);

  // Stern lantern light
  const sternLight = new THREE.PointLight(0xffaa44, 0.8, 8);
  sternLight.position.set(0, 1.3, -1.6);
  sternLight.name = 'lantern-light';
  sternLight.visible = false;
  g.add(sternLight);

  // ---- Cannons (visual only, 3 per side) ----
  const cannonColor = (cfg.weaponTier ?? 0) >= 1 ? 0x663300 : 0x222222;
  const cannonMat = (cfg.weaponTier ?? 0) >= 1
    ? new THREE.MeshBasicMaterial({ color: 0xff6600 })
    : new THREE.MeshToonMaterial({ color: cannonColor });
  const cannonZPositions = [-0.6, 0.2, 1.0]; // evenly spaced along hull length

  for (const side of [-1, 1]) {
    for (const z of cannonZPositions) {
      const cannon = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.06, 0.4, 4),
        cannonMat,
      );
      // Rotate 90 degrees on Z axis so the cylinder points outward (along X)
      cannon.rotation.z = Math.PI / 2;
      // Position at hull level, on the side of the ship
      cannon.position.set(side * 0.7, 0.35, z);
      cannon.name = 'cannon';
      g.add(cannon);
    }
  }

  // ---- Visual progression: speed tier (gold sail trim) ----
  if ((cfg.speedTier ?? 0) >= 1) {
    // Gold trim lines on sails
    const trimMat = new THREE.MeshBasicMaterial({ color: 0xffd700 });
    const trimGeo = new THREE.BoxGeometry(2.05, 0.04, 0.02);
    const trim1 = new THREE.Mesh(trimGeo, trimMat);
    trim1.position.set(0, 1.15, 0.1);
    trim1.name = 'speed-trim';
    g.add(trim1);
    const trim2 = new THREE.Mesh(trimGeo, trimMat);
    trim2.position.set(0, 3.25, 0.1);
    trim2.name = 'speed-trim';
    g.add(trim2);
  }

  // ---- Visual progression: armor tier (metal bands) ----
  if ((cfg.armorTier ?? 0) >= 1) {
    const bandMat = new THREE.MeshToonMaterial({ color: 0x666666 });
    for (let i = 0; i < Math.min(cfg.armorTier!, 3); i++) {
      const zPos = -1.0 + i * 1.2;
      const band = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.15), bandMat);
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
    whiteFlag.position.set(0.25, 4.6, 0.1);
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
export function setShipLanterns(ship: THREE.Group, on: boolean): void {
  ship.traverse((child) => {
    if (child.name === 'lantern' || child.name === 'lantern-light') {
      child.visible = on;
    }
  });
}

/**
 * Update sail and flag shader uniforms for wind animation.
 * Call once per frame for each visible ship.
 */
export function updateShipSails(ship: THREE.Group, time: number, windStrength = 0.8): void {
  ship.traverse((child) => {
    if (child instanceof THREE.Mesh && child.material instanceof THREE.ShaderMaterial) {
      const uniforms = child.material.uniforms;
      if (uniforms.uTime !== undefined) {
        uniforms.uTime.value = time;
      }
      if (uniforms.uWindStrength !== undefined) {
        uniforms.uWindStrength.value = windStrength;
      }
    }
  });
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
