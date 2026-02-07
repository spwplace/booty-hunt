import * as THREE from 'three';
import type { Island, IslandType } from './Types';

// ===================================================================
//  Seeded RNG (mulberry32)
// ===================================================================

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ===================================================================
//  Island color palettes
// ===================================================================

const COLORS = {
  // Rocky
  stoneGray:     0x6b6b6b,
  stoneDark:     0x4a4a4a,
  stoneMid:      0x585858,
  mossGreen:     0x3a5a3a,

  // Sandy
  sand:          0xdec68b,
  sandDark:      0xc4a95a,
  sandLight:     0xf0dca0,

  // Jungle
  jungleGreen:   0x2d6b1e,
  jungleDark:    0x1a4a10,
  jungleLight:   0x4a8a2a,
  jungleTrunk:   0x5a3a1a,

  // Fortress
  fortStone:     0x5a5a5a,
  fortDark:      0x3a3a3a,
  fortBrick:     0x6a4a3a,

  // Shared
  palmTrunk:     0x5a3a1a,
  palmCanopy:    0x2a7a1a,
  palmCanopyAlt: 0x3a8a2a,
  waterShallow:  0x2a8a8a,
  reefBrown:     0x6a4a2a,
};

// ===================================================================
//  Island type configuration
// ===================================================================

interface IslandTypeConfig {
  minRadius: number;
  maxRadius: number;
  reefMultiplier: number;
  treasureChance: number;
}

const ISLAND_TYPE_CONFIGS: Record<IslandType, IslandTypeConfig> = {
  rocky: {
    minRadius: 5,
    maxRadius: 9,
    reefMultiplier: 1.8,
    treasureChance: 0.05,
  },
  sandy: {
    minRadius: 6,
    maxRadius: 10,
    reefMultiplier: 1.5,
    treasureChance: 0.35,
  },
  jungle: {
    minRadius: 8,
    maxRadius: 14,
    reefMultiplier: 1.6,
    treasureChance: 0.40,
  },
  fortress: {
    minRadius: 7,
    maxRadius: 12,
    reefMultiplier: 1.4,
    treasureChance: 0.60,
  },
};

// ===================================================================
//  Geometry builders
// ===================================================================

/** Create a palm tree group at origin. */
function createPalmTree(rng: () => number, scale: number = 1): THREE.Group {
  const tree = new THREE.Group();

  // Trunk: slightly bent box
  const trunkH = (1.8 + rng() * 0.8) * scale;
  const trunkGeo = new THREE.BoxGeometry(0.12 * scale, trunkH, 0.12 * scale);
  const trunkMat = new THREE.MeshToonMaterial({ color: COLORS.palmTrunk });
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = trunkH * 0.5;
  // Slight random lean
  trunk.rotation.x = (rng() - 0.5) * 0.25;
  trunk.rotation.z = (rng() - 0.5) * 0.25;
  tree.add(trunk);

  // Canopy: sphere on top
  const canopyRadius = (0.6 + rng() * 0.4) * scale;
  const canopyGeo = new THREE.SphereGeometry(canopyRadius, 6, 5);
  const canopyColor = rng() > 0.5 ? COLORS.palmCanopy : COLORS.palmCanopyAlt;
  const canopyMat = new THREE.MeshToonMaterial({ color: canopyColor });
  const canopy = new THREE.Mesh(canopyGeo, canopyMat);
  // Position at top of trunk, offset by lean
  canopy.position.y = trunkH + canopyRadius * 0.5;
  canopy.position.x = trunk.rotation.z * trunkH * -0.3;
  canopy.position.z = trunk.rotation.x * trunkH * 0.3;
  // Squash a little vertically
  canopy.scale.y = 0.6 + rng() * 0.2;
  tree.add(canopy);

  return tree;
}

/** Build rocky island geometry. 3-5 cone stacks at random offsets. */
function buildRockyIsland(rng: () => number, radius: number): THREE.Group {
  const group = new THREE.Group();

  const coneCount = 3 + Math.floor(rng() * 3); // 3-5
  for (let i = 0; i < coneCount; i++) {
    const coneRadius = radius * (0.3 + rng() * 0.35);
    const coneHeight = radius * (0.5 + rng() * 0.8);
    const geo = new THREE.ConeGeometry(coneRadius, coneHeight, 6 + Math.floor(rng() * 3));

    const colorChoice = rng();
    let color: number;
    if (colorChoice < 0.4) color = COLORS.stoneGray;
    else if (colorChoice < 0.7) color = COLORS.stoneDark;
    else color = COLORS.stoneMid;

    const mat = new THREE.MeshToonMaterial({ color });
    const mesh = new THREE.Mesh(geo, mat);

    // Scatter within island radius
    const angle = rng() * Math.PI * 2;
    const dist = rng() * radius * 0.45;
    mesh.position.set(
      Math.cos(angle) * dist,
      coneHeight * 0.5 - 0.5 + rng() * 0.5,
      Math.sin(angle) * dist,
    );
    // Slight tilt
    mesh.rotation.x = (rng() - 0.5) * 0.3;
    mesh.rotation.z = (rng() - 0.5) * 0.3;

    group.add(mesh);
  }

  // Optional moss patches on top of largest cone
  if (rng() > 0.4) {
    const mossGeo = new THREE.SphereGeometry(radius * 0.15, 5, 4);
    const mossMat = new THREE.MeshToonMaterial({ color: COLORS.mossGreen });
    const moss = new THREE.Mesh(mossGeo, mossMat);
    moss.position.y = radius * 0.6;
    moss.scale.y = 0.4;
    group.add(moss);
  }

  return group;
}

/** Build sandy island: flat cylinder base + 1-2 palms. */
function buildSandyIsland(rng: () => number, radius: number): THREE.Group {
  const group = new THREE.Group();

  // Sand base: flat cylinder
  const baseHeight = 0.5 + rng() * 0.3;
  const baseGeo = new THREE.CylinderGeometry(radius, radius * 1.1, baseHeight, 12);
  const baseMat = new THREE.MeshToonMaterial({ color: COLORS.sand });
  const base = new THREE.Mesh(baseGeo, baseMat);
  base.position.y = baseHeight * 0.5 - 0.2;
  group.add(base);

  // Slight sand rim
  const rimGeo = new THREE.CylinderGeometry(radius * 1.05, radius * 1.15, 0.15, 12);
  const rimMat = new THREE.MeshToonMaterial({ color: COLORS.sandLight });
  const rim = new THREE.Mesh(rimGeo, rimMat);
  rim.position.y = -0.1;
  group.add(rim);

  // 1-2 palm trees
  const palmCount = 1 + Math.floor(rng() * 2);
  for (let i = 0; i < palmCount; i++) {
    const palm = createPalmTree(rng, 1.0);
    const angle = rng() * Math.PI * 2;
    const dist = rng() * radius * 0.5;
    palm.position.set(
      Math.cos(angle) * dist,
      baseHeight - 0.2,
      Math.sin(angle) * dist,
    );
    group.add(palm);
  }

  return group;
}

/** Build jungle island: larger base, 3-5 palms, foliage spheres. */
function buildJungleIsland(rng: () => number, radius: number): THREE.Group {
  const group = new THREE.Group();

  // Large terrain base
  const baseHeight = 0.8 + rng() * 0.5;
  const baseGeo = new THREE.CylinderGeometry(radius * 0.95, radius * 1.1, baseHeight, 14);
  const baseMat = new THREE.MeshToonMaterial({ color: COLORS.jungleGreen });
  const base = new THREE.Mesh(baseGeo, baseMat);
  base.position.y = baseHeight * 0.5 - 0.3;
  group.add(base);

  // Sandy beach rim
  const beachGeo = new THREE.CylinderGeometry(radius * 1.05, radius * 1.2, 0.2, 14);
  const beachMat = new THREE.MeshToonMaterial({ color: COLORS.sandDark });
  const beach = new THREE.Mesh(beachGeo, beachMat);
  beach.position.y = -0.2;
  group.add(beach);

  // 3-5 palm trees
  const palmCount = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < palmCount; i++) {
    const palm = createPalmTree(rng, 0.9 + rng() * 0.4);
    const angle = rng() * Math.PI * 2;
    const dist = radius * (0.15 + rng() * 0.55);
    palm.position.set(
      Math.cos(angle) * dist,
      baseHeight - 0.3,
      Math.sin(angle) * dist,
    );
    group.add(palm);
  }

  // Dense foliage spheres (2-4)
  const foliageCount = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < foliageCount; i++) {
    const fRadius = radius * (0.2 + rng() * 0.2);
    const fGeo = new THREE.SphereGeometry(fRadius, 6, 5);
    const fColor = rng() > 0.5 ? COLORS.jungleGreen : COLORS.jungleDark;
    const fMat = new THREE.MeshToonMaterial({ color: fColor });
    const foliage = new THREE.Mesh(fGeo, fMat);
    const angle = rng() * Math.PI * 2;
    const dist = radius * (0.1 + rng() * 0.45);
    foliage.position.set(
      Math.cos(angle) * dist,
      baseHeight + fRadius * 0.3,
      Math.sin(angle) * dist,
    );
    foliage.scale.y = 0.6 + rng() * 0.3;
    group.add(foliage);
  }

  // Hidden cove indent on one side
  const coveGeo = new THREE.CylinderGeometry(radius * 0.25, radius * 0.3, 0.4, 8);
  const coveMat = new THREE.MeshToonMaterial({ color: COLORS.waterShallow });
  const cove = new THREE.Mesh(coveGeo, coveMat);
  const coveAngle = rng() * Math.PI * 2;
  cove.position.set(
    Math.cos(coveAngle) * radius * 0.75,
    -0.1,
    Math.sin(coveAngle) * radius * 0.75,
  );
  group.add(cove);

  return group;
}

/** Build fortress island: stone ruins with box walls & cylinder tower. */
function buildFortressIsland(rng: () => number, radius: number): THREE.Group {
  const group = new THREE.Group();

  // Stone foundation platform
  const baseHeight = 0.6 + rng() * 0.3;
  const baseGeo = new THREE.CylinderGeometry(radius * 0.9, radius * 1.05, baseHeight, 10);
  const baseMat = new THREE.MeshToonMaterial({ color: COLORS.fortStone });
  const base = new THREE.Mesh(baseGeo, baseMat);
  base.position.y = baseHeight * 0.5 - 0.2;
  group.add(base);

  // Walls (2-3 box segments)
  const wallCount = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < wallCount; i++) {
    const wallW = radius * (0.15 + rng() * 0.1);
    const wallH = 1.2 + rng() * 1.0;
    const wallD = radius * (0.5 + rng() * 0.4);
    const wallGeo = new THREE.BoxGeometry(wallW, wallH, wallD);
    const wallColor = rng() > 0.5 ? COLORS.fortDark : COLORS.fortBrick;
    const wallMat = new THREE.MeshToonMaterial({ color: wallColor });
    const wall = new THREE.Mesh(wallGeo, wallMat);

    const angle = (i / wallCount) * Math.PI * 2 + rng() * 0.5;
    const dist = radius * (0.3 + rng() * 0.25);
    wall.position.set(
      Math.cos(angle) * dist,
      baseHeight + wallH * 0.5 - 0.3,
      Math.sin(angle) * dist,
    );
    wall.rotation.y = angle + Math.PI * 0.5;

    // Ruined look: slight tilt
    wall.rotation.x = (rng() - 0.5) * 0.15;
    wall.rotation.z = (rng() - 0.5) * 0.1;

    group.add(wall);
  }

  // Central tower
  const towerRadius = radius * (0.15 + rng() * 0.1);
  const towerHeight = 2.0 + rng() * 1.5;
  const towerGeo = new THREE.CylinderGeometry(
    towerRadius * 0.85, towerRadius, towerHeight, 8,
  );
  const towerMat = new THREE.MeshToonMaterial({ color: COLORS.fortStone });
  const tower = new THREE.Mesh(towerGeo, towerMat);
  tower.position.set(
    (rng() - 0.5) * radius * 0.3,
    baseHeight + towerHeight * 0.5 - 0.2,
    (rng() - 0.5) * radius * 0.3,
  );
  // Slight ruined lean
  tower.rotation.x = (rng() - 0.5) * 0.08;
  tower.rotation.z = (rng() - 0.5) * 0.08;
  group.add(tower);

  // Tower battlements (small boxes on top)
  const bCount = 4 + Math.floor(rng() * 3);
  for (let i = 0; i < bCount; i++) {
    const bGeo = new THREE.BoxGeometry(
      towerRadius * 0.4, 0.3 + rng() * 0.2, towerRadius * 0.3,
    );
    const bMat = new THREE.MeshToonMaterial({ color: COLORS.fortDark });
    const battlement = new THREE.Mesh(bGeo, bMat);
    const bAngle = (i / bCount) * Math.PI * 2;
    battlement.position.set(
      tower.position.x + Math.cos(bAngle) * towerRadius * 0.9,
      tower.position.y + towerHeight * 0.5,
      tower.position.z + Math.sin(bAngle) * towerRadius * 0.9,
    );
    battlement.rotation.y = bAngle;
    group.add(battlement);
  }

  // Rubble: scattered small boxes
  const rubbleCount = 3 + Math.floor(rng() * 4);
  for (let i = 0; i < rubbleCount; i++) {
    const rSize = 0.2 + rng() * 0.3;
    const rGeo = new THREE.BoxGeometry(rSize, rSize * 0.6, rSize);
    const rMat = new THREE.MeshToonMaterial({
      color: rng() > 0.5 ? COLORS.fortStone : COLORS.fortDark,
    });
    const rubble = new THREE.Mesh(rGeo, rMat);
    const angle = rng() * Math.PI * 2;
    const dist = radius * (0.3 + rng() * 0.5);
    rubble.position.set(
      Math.cos(angle) * dist,
      baseHeight * 0.3 + rng() * 0.2,
      Math.sin(angle) * dist,
    );
    rubble.rotation.set(rng() * 0.5, rng() * Math.PI, rng() * 0.5);
    group.add(rubble);
  }

  return group;
}

// Dispatch to the correct builder
function buildIslandMesh(island: Island): THREE.Group {
  const rng = mulberry32(island.seed);
  let meshGroup: THREE.Group;

  switch (island.type) {
    case 'rocky':
      meshGroup = buildRockyIsland(rng, island.radius);
      break;
    case 'sandy':
      meshGroup = buildSandyIsland(rng, island.radius);
      break;
    case 'jungle':
      meshGroup = buildJungleIsland(rng, island.radius);
      break;
    case 'fortress':
      meshGroup = buildFortressIsland(rng, island.radius);
      break;
  }

  meshGroup.position.copy(island.pos);
  return meshGroup;
}

// ===================================================================
//  Collision result
// ===================================================================

export interface CollisionResult {
  bounceDir: THREE.Vector3 | null;
  reefDamage: number;
}

// ===================================================================
//  WorldSystem
// ===================================================================

const LOD_CREATE_DIST = 200;
const LOD_REMOVE_DIST = 250;
const MIN_ISLAND_SPACING = 40;
const MIN_RING_RADIUS = 80;
const MAX_RING_RADIUS = 200;
const DIG_SITE_RANGE = 5;
const REEF_DPS = 5; // damage per second in reef zone
const BOUNCE_STRENGTH = 8;

const ISLAND_TYPES: IslandType[] = ['rocky', 'sandy', 'jungle', 'fortress'];

export class WorldSystem {
  islands: Island[] = [];
  private scene: THREE.Scene;
  private rng: () => number;
  private worldSeed: number;

  constructor(scene: THREE.Scene, seed?: number) {
    this.scene = scene;
    this.worldSeed = seed ?? Math.floor(Math.random() * 0xFFFFFFFF);
    this.rng = mulberry32(this.worldSeed);
    this.generateIslands();
  }

  // ---------------------------------------------------------------
  //  Island placement
  // ---------------------------------------------------------------

  generateIslands(): void {
    // Clear existing
    this.dispose();
    this.islands = [];
    this.rng = mulberry32(this.worldSeed);

    const count = 8 + Math.floor(this.rng() * 8); // 8-15

    for (let attempt = 0; attempt < count * 20; attempt++) {
      if (this.islands.length >= count) break;

      // Place in ring around origin
      const angle = this.rng() * Math.PI * 2;
      const ringRadius = MIN_RING_RADIUS + this.rng() * (MAX_RING_RADIUS - MIN_RING_RADIUS);
      const px = Math.cos(angle) * ringRadius;
      const pz = Math.sin(angle) * ringRadius;

      // Check minimum spacing against existing islands
      let tooClose = false;
      for (const existing of this.islands) {
        const dx = px - existing.pos.x;
        const dz = pz - existing.pos.z;
        if (Math.sqrt(dx * dx + dz * dz) < MIN_ISLAND_SPACING) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;

      // Pick type with weighted distribution
      const typeRoll = this.rng();
      let type: IslandType;
      if (typeRoll < 0.25) type = 'rocky';
      else if (typeRoll < 0.50) type = 'sandy';
      else if (typeRoll < 0.75) type = 'jungle';
      else type = 'fortress';

      const config = ISLAND_TYPE_CONFIGS[type];
      const radius = config.minRadius + this.rng() * (config.maxRadius - config.minRadius);
      const reefRadius = radius * config.reefMultiplier;
      const hasTreasure = this.rng() < config.treasureChance;
      const seed = Math.floor(this.rng() * 0xFFFFFFFF);

      const island: Island = {
        type,
        pos: new THREE.Vector3(px, 0, pz),
        radius,
        reefRadius,
        hasTreasure,
        treasureCollected: false,
        meshCreated: false,
        meshGroup: null,
        seed,
      };

      this.islands.push(island);
    }
  }

  // ---------------------------------------------------------------
  //  LOD: create/remove meshes based on player distance
  // ---------------------------------------------------------------

  updateLOD(playerPos: THREE.Vector3): void {
    for (const island of this.islands) {
      const dx = playerPos.x - island.pos.x;
      const dz = playerPos.z - island.pos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (!island.meshCreated && dist < LOD_CREATE_DIST) {
        // Create mesh
        const meshGroup = buildIslandMesh(island);
        this.scene.add(meshGroup);
        island.meshGroup = meshGroup;
        island.meshCreated = true;
      } else if (island.meshCreated && dist > LOD_REMOVE_DIST) {
        // Remove mesh
        if (island.meshGroup) {
          this.scene.remove(island.meshGroup);
          // Dispose geometries and materials
          island.meshGroup.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.geometry.dispose();
              if (Array.isArray(child.material)) {
                child.material.forEach(m => m.dispose());
              } else {
                child.material.dispose();
              }
            }
          });
          island.meshGroup = null;
        }
        island.meshCreated = false;
      }
    }
  }

  // ---------------------------------------------------------------
  //  Collision detection
  // ---------------------------------------------------------------

  checkCollision(
    playerPos: THREE.Vector3,
    dt: number,
  ): CollisionResult {
    let bounceDir: THREE.Vector3 | null = null;
    let reefDamage = 0;

    for (const island of this.islands) {
      const dx = playerPos.x - island.pos.x;
      const dz = playerPos.z - island.pos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      // Hard collision with island body
      if (dist < island.radius) {
        // Push player outward
        const nx = dx / dist;
        const nz = dz / dist;
        bounceDir = new THREE.Vector3(nx, 0, nz).multiplyScalar(BOUNCE_STRENGTH);

        // Snap player outside
        playerPos.x = island.pos.x + nx * (island.radius + 0.5);
        playerPos.z = island.pos.z + nz * (island.radius + 0.5);
      }
      // Reef zone: between island.radius and island.reefRadius
      else if (dist < island.reefRadius) {
        reefDamage += REEF_DPS * dt;
      }
    }

    return { bounceDir, reefDamage };
  }

  // ---------------------------------------------------------------
  //  Treasure / dig sites
  // ---------------------------------------------------------------

  checkDigSite(playerPos: THREE.Vector3, hasTreasureMap: boolean): Island | null {
    if (!hasTreasureMap) return null;

    for (const island of this.islands) {
      if (!island.hasTreasure || island.treasureCollected) continue;

      const dx = playerPos.x - island.pos.x;
      const dz = playerPos.z - island.pos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < DIG_SITE_RANGE) {
        return island;
      }
    }
    return null;
  }

  collectTreasure(island: Island): void {
    island.treasureCollected = true;
  }

  // ---------------------------------------------------------------
  //  Accessors
  // ---------------------------------------------------------------

  getIslands(): Island[] {
    return this.islands;
  }

  /** Return reef position data suitable for the Ocean shader uniforms. */
  getReefData(): { x: number; z: number; radius: number }[] {
    return this.islands.map(island => ({
      x: island.pos.x,
      z: island.pos.z,
      radius: island.reefRadius,
    }));
  }

  // ---------------------------------------------------------------
  //  Cleanup
  // ---------------------------------------------------------------

  dispose(): void {
    for (const island of this.islands) {
      if (island.meshGroup) {
        this.scene.remove(island.meshGroup);
        island.meshGroup.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            if (Array.isArray(child.material)) {
              child.material.forEach(m => m.dispose());
            } else {
              child.material.dispose();
            }
          }
        });
        island.meshGroup = null;
      }
      island.meshCreated = false;
    }
    this.islands = [];
  }
}
