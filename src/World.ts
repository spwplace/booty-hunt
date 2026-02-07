import * as THREE from 'three';
import type { Island, IslandType } from './Types';
import { createFlagMaterial } from './Ship';

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
//  Constants
// ===================================================================

const ISLAND_BASE_Y = 0.8; // raised above typical wave peak (~0.5)

// ===================================================================
//  Geometry builders
// ===================================================================

/** Add a shoreline beach ring that extends below waterline to hide clipping. */
function addBeachRing(group: THREE.Group, radius: number, rng: () => number): void {
  const beachGeo = new THREE.CylinderGeometry(radius * 1.3, radius * 1.4, 0.4, 16);
  const beachMat = new THREE.MeshToonMaterial({ color: COLORS.sandDark });
  const beach = new THREE.Mesh(beachGeo, beachMat);
  beach.position.y = -ISLAND_BASE_Y + 0.3; // sits at waterline
  group.add(beach);
}

/** Apply vertex color variation to a cylinder/cone geometry for natural look. */
function applyVertexColors(geo: THREE.BufferGeometry, baseColor: THREE.Color, rng: () => number, variation: number = 0.08): void {
  const posAttr = geo.getAttribute('position');
  const count = posAttr.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = baseColor.r + (rng() - 0.5) * variation * 2;
    const g = baseColor.g + (rng() - 0.5) * variation * 2;
    const b = baseColor.b + (rng() - 0.5) * variation * 2;
    colors[i * 3] = Math.max(0, Math.min(1, r));
    colors[i * 3 + 1] = Math.max(0, Math.min(1, g));
    colors[i * 3 + 2] = Math.max(0, Math.min(1, b));
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

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

/** Build rocky island geometry. 3-5 cone stacks + rock scatter + tide pool. */
function buildRockyIsland(rng: () => number, radius: number): THREE.Group {
  const group = new THREE.Group();

  // Beach ring
  addBeachRing(group, radius, rng);

  const coneCount = 3 + Math.floor(rng() * 3); // 3-5
  for (let i = 0; i < coneCount; i++) {
    const coneRadius = radius * (0.3 + rng() * 0.35);
    const coneHeight = radius * (0.5 + rng() * 0.8);
    const segments = 6 + Math.floor(rng() * 3);
    const geo = new THREE.ConeGeometry(coneRadius, coneHeight, segments);

    const colorChoice = rng();
    const baseColor = colorChoice < 0.4 ? new THREE.Color(COLORS.stoneGray)
      : colorChoice < 0.7 ? new THREE.Color(COLORS.stoneDark)
      : new THREE.Color(COLORS.stoneMid);

    applyVertexColors(geo, baseColor, rng, 0.06);
    const mat = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true });
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

  // Rock scatter: 5-8 small irregular boxes at base
  const rockCount = 5 + Math.floor(rng() * 4);
  for (let i = 0; i < rockCount; i++) {
    const rw = 0.3 + rng() * 0.5;
    const rh = 0.2 + rng() * 0.4;
    const rd = 0.3 + rng() * 0.5;
    const rockGeo = new THREE.BoxGeometry(rw, rh, rd);
    const rockColor = rng() > 0.5 ? COLORS.stoneDark : COLORS.stoneMid;
    const rockMat = new THREE.MeshToonMaterial({ color: rockColor });
    const rock = new THREE.Mesh(rockGeo, rockMat);
    const angle = rng() * Math.PI * 2;
    const dist = radius * (0.4 + rng() * 0.5);
    rock.position.set(
      Math.cos(angle) * dist,
      rh * 0.3 + rng() * 0.3,
      Math.sin(angle) * dist,
    );
    rock.rotation.set(rng() * 0.4, rng() * Math.PI, rng() * 0.4);
    group.add(rock);
  }

  // Tide pool: small shallow-water cylinder on one side
  const tideGeo = new THREE.CylinderGeometry(radius * 0.15, radius * 0.18, 0.15, 8);
  const tideMat = new THREE.MeshToonMaterial({ color: COLORS.waterShallow });
  const tide = new THREE.Mesh(tideGeo, tideMat);
  const tideAngle = rng() * Math.PI * 2;
  tide.position.set(
    Math.cos(tideAngle) * radius * 0.5,
    0.1,
    Math.sin(tideAngle) * radius * 0.5,
  );
  group.add(tide);

  // Optional moss patches on top of largest cone
  if (rng() > 0.4) {
    const mossGeo = new THREE.SphereGeometry(radius * 0.15, 5, 4);
    const mossMat = new THREE.MeshToonMaterial({ color: COLORS.mossGreen });
    const moss = new THREE.Mesh(mossGeo, mossMat);
    moss.position.y = radius * 0.6;
    moss.scale.y = 0.4;
    group.add(moss);
  }

  // Seagull perches: tiny white dots on peak cones
  const gullCount = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < gullCount; i++) {
    const gullGeo = new THREE.SphereGeometry(0.08, 4, 3);
    const gullMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const gull = new THREE.Mesh(gullGeo, gullMat);
    const angle = rng() * Math.PI * 2;
    const dist = rng() * radius * 0.3;
    gull.position.set(
      Math.cos(angle) * dist,
      radius * (0.5 + rng() * 0.5),
      Math.sin(angle) * dist,
    );
    group.add(gull);
  }

  return group;
}

/** Build sandy island: flat cylinder base + palms + beach rocks + driftwood + lagoon. */
function buildSandyIsland(rng: () => number, radius: number): THREE.Group {
  const group = new THREE.Group();

  // Beach ring
  addBeachRing(group, radius, rng);

  // Sand base: flat cylinder with vertex color variation
  const baseHeight = 0.5 + rng() * 0.3;
  const baseGeo = new THREE.CylinderGeometry(radius, radius * 1.1, baseHeight, 12);
  const sandBase = new THREE.Color(COLORS.sand);
  applyVertexColors(baseGeo, sandBase, rng, 0.05);
  const baseMat = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true });
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

  // Beach rocks: 2-4 small dark boxes
  const rockCount = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < rockCount; i++) {
    const rSize = 0.15 + rng() * 0.25;
    const rockGeo = new THREE.BoxGeometry(rSize, rSize * 0.6, rSize);
    const rockMat = new THREE.MeshToonMaterial({ color: COLORS.stoneDark });
    const rock = new THREE.Mesh(rockGeo, rockMat);
    const angle = rng() * Math.PI * 2;
    const dist = radius * (0.3 + rng() * 0.5);
    rock.position.set(
      Math.cos(angle) * dist,
      baseHeight * 0.3 + rng() * 0.1,
      Math.sin(angle) * dist,
    );
    rock.rotation.y = rng() * Math.PI;
    group.add(rock);
  }

  // Driftwood: 1-2 elongated thin boxes
  const driftCount = 1 + Math.floor(rng() * 2);
  for (let i = 0; i < driftCount; i++) {
    const driftGeo = new THREE.BoxGeometry(0.08, 0.06, 0.8 + rng() * 0.5);
    const driftMat = new THREE.MeshToonMaterial({ color: 0x8b7355 });
    const drift = new THREE.Mesh(driftGeo, driftMat);
    const angle = rng() * Math.PI * 2;
    const dist = radius * (0.5 + rng() * 0.4);
    drift.position.set(
      Math.cos(angle) * dist,
      baseHeight * 0.2,
      Math.sin(angle) * dist,
    );
    drift.rotation.y = rng() * Math.PI;
    drift.rotation.z = (rng() - 0.5) * 0.2;
    group.add(drift);
  }

  // Shallow water lagoon at island edge
  const lagoonGeo = new THREE.CylinderGeometry(radius * 0.2, radius * 0.25, 0.15, 8);
  const lagoonMat = new THREE.MeshToonMaterial({ color: 0x40b8b8, transparent: true, opacity: 0.7 });
  const lagoon = new THREE.Mesh(lagoonGeo, lagoonMat);
  const lagAngle = rng() * Math.PI * 2;
  lagoon.position.set(
    Math.cos(lagAngle) * radius * 0.8,
    -0.05,
    Math.sin(lagAngle) * radius * 0.8,
  );
  group.add(lagoon);

  return group;
}

/** Build jungle island: larger base, 5-8 palms, foliage, undergrowth, flowers, waterfall. */
function buildJungleIsland(rng: () => number, radius: number): THREE.Group {
  const group = new THREE.Group();

  // Beach ring
  addBeachRing(group, radius, rng);

  // Large terrain base with vertex color variation
  const baseHeight = 0.8 + rng() * 0.5;
  const baseGeo = new THREE.CylinderGeometry(radius * 0.95, radius * 1.1, baseHeight, 14);
  const jungleBase = new THREE.Color(COLORS.jungleGreen);
  applyVertexColors(baseGeo, jungleBase, rng, 0.07);
  const baseMat = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true });
  const base = new THREE.Mesh(baseGeo, baseMat);
  base.position.y = baseHeight * 0.5 - 0.3;
  group.add(base);

  // Sandy beach rim (inner, above the beach ring)
  const beachGeo = new THREE.CylinderGeometry(radius * 1.05, radius * 1.2, 0.2, 14);
  const beachMat = new THREE.MeshToonMaterial({ color: COLORS.sandDark });
  const beach = new THREE.Mesh(beachGeo, beachMat);
  beach.position.y = -0.2;
  group.add(beach);

  // 5-8 palm trees (increased from 3-5)
  const palmCount = 5 + Math.floor(rng() * 4);
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

  // Dense canopy foliage spheres (2-4)
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

  // Undergrowth: 3-5 small green spheres at ground level
  const undergrowthCount = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < undergrowthCount; i++) {
    const uRadius = 0.25 + rng() * 0.3;
    const uGeo = new THREE.SphereGeometry(uRadius, 5, 4);
    const uColor = rng() > 0.5 ? COLORS.jungleLight : COLORS.jungleDark;
    const uMat = new THREE.MeshToonMaterial({ color: uColor });
    const bush = new THREE.Mesh(uGeo, uMat);
    const angle = rng() * Math.PI * 2;
    const dist = radius * (0.2 + rng() * 0.5);
    bush.position.set(
      Math.cos(angle) * dist,
      baseHeight * 0.3 + uRadius * 0.3,
      Math.sin(angle) * dist,
    );
    bush.scale.y = 0.5 + rng() * 0.3;
    group.add(bush);
  }

  // Flowers: 2-3 tiny colored spheres in foliage
  const FLOWER_COLORS = [0xff6688, 0xffdd44, 0xff4444];
  const flowerCount = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < flowerCount; i++) {
    const fGeo = new THREE.SphereGeometry(0.12, 4, 3);
    const fMat = new THREE.MeshBasicMaterial({ color: FLOWER_COLORS[i % FLOWER_COLORS.length] });
    const flower = new THREE.Mesh(fGeo, fMat);
    const angle = rng() * Math.PI * 2;
    const dist = radius * (0.15 + rng() * 0.4);
    flower.position.set(
      Math.cos(angle) * dist,
      baseHeight * 0.4 + rng() * 0.5,
      Math.sin(angle) * dist,
    );
    group.add(flower);
  }

  // Waterfall hint: narrow blue-tinted box on one side
  const waterfallGeo = new THREE.BoxGeometry(0.15, baseHeight * 0.8, 0.3);
  const waterfallMat = new THREE.MeshToonMaterial({ color: 0x5599cc, transparent: true, opacity: 0.6 });
  const waterfall = new THREE.Mesh(waterfallGeo, waterfallMat);
  const wfAngle = rng() * Math.PI * 2;
  waterfall.position.set(
    Math.cos(wfAngle) * radius * 0.7,
    baseHeight * 0.4,
    Math.sin(wfAngle) * radius * 0.7,
  );
  group.add(waterfall);

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

/** Build fortress island: stone ruins with walls, tower, dock, flag, torch, vines. */
function buildFortressIsland(rng: () => number, radius: number): THREE.Group {
  const group = new THREE.Group();

  // Beach ring
  addBeachRing(group, radius, rng);

  // Stone foundation platform with vertex color variation
  const baseHeight = 0.6 + rng() * 0.3;
  const baseGeo = new THREE.CylinderGeometry(radius * 0.9, radius * 1.05, baseHeight, 10);
  const fortBase = new THREE.Color(COLORS.fortStone);
  applyVertexColors(baseGeo, fortBase, rng, 0.06);
  const baseMat = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true });
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

    // Vine/moss on walls: green-tinted boxes
    if (rng() > 0.4) {
      const vineGeo = new THREE.BoxGeometry(wallW * 0.3, wallH * 0.4, wallD * 0.15);
      const vineMat = new THREE.MeshToonMaterial({ color: COLORS.mossGreen });
      const vine = new THREE.Mesh(vineGeo, vineMat);
      vine.position.copy(wall.position);
      vine.position.y -= wallH * 0.15;
      vine.position.x += (rng() - 0.5) * wallW * 0.3;
      vine.rotation.y = wall.rotation.y;
      group.add(vine);
    }
  }

  // Central tower
  const towerRadius = radius * (0.15 + rng() * 0.1);
  const towerHeight = 2.0 + rng() * 1.5;
  const towerGeo = new THREE.CylinderGeometry(
    towerRadius * 0.85, towerRadius, towerHeight, 8,
  );
  const towerMat = new THREE.MeshToonMaterial({ color: COLORS.fortStone });
  const tower = new THREE.Mesh(towerGeo, towerMat);
  const towerX = (rng() - 0.5) * radius * 0.3;
  const towerZ = (rng() - 0.5) * radius * 0.3;
  tower.position.set(
    towerX,
    baseHeight + towerHeight * 0.5 - 0.2,
    towerZ,
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

  // Torch on tower top: orange emissive sphere + PointLight
  const torchGeo = new THREE.SphereGeometry(0.12, 5, 4);
  const torchMat = new THREE.MeshBasicMaterial({ color: 0xff8833 });
  const torch = new THREE.Mesh(torchGeo, torchMat);
  const torchY = tower.position.y + towerHeight * 0.5 + 0.3;
  torch.position.set(towerX, torchY, towerZ);
  group.add(torch);

  const torchLight = new THREE.PointLight(0xff6622, 0.6, 10);
  torchLight.position.set(towerX, torchY, towerZ);
  group.add(torchLight);

  // Tattered flag on tower using animated flag material
  const flagGeo = new THREE.PlaneGeometry(0.6, 0.35, 6, 4);
  const flagMat = createFlagMaterial(COLORS.fortBrick);
  const flag = new THREE.Mesh(flagGeo, flagMat);
  flag.position.set(
    towerX + 0.35,
    tower.position.y + towerHeight * 0.5 + 0.15,
    towerZ,
  );
  flag.name = 'flag';
  group.add(flag);

  // Dock: elongated box extending from island edge over water
  const dockAngle = rng() * Math.PI * 2;
  const dockGeo = new THREE.BoxGeometry(0.6, 0.12, 2.5);
  const dockMat = new THREE.MeshToonMaterial({ color: COLORS.palmTrunk });
  const dock = new THREE.Mesh(dockGeo, dockMat);
  dock.position.set(
    Math.cos(dockAngle) * (radius * 0.9 + 1.0),
    baseHeight * 0.3,
    Math.sin(dockAngle) * (radius * 0.9 + 1.0),
  );
  dock.rotation.y = dockAngle;
  group.add(dock);

  // Dock posts
  for (const side of [-0.25, 0.25]) {
    for (const along of [-0.8, 0.8]) {
      const postGeo = new THREE.CylinderGeometry(0.04, 0.05, 0.6, 4);
      const postMat = new THREE.MeshToonMaterial({ color: COLORS.palmTrunk });
      const post = new THREE.Mesh(postGeo, postMat);
      const postX = Math.cos(dockAngle) * (radius * 0.9 + 1.0 + along) - Math.sin(dockAngle) * side;
      const postZ = Math.sin(dockAngle) * (radius * 0.9 + 1.0 + along) + Math.cos(dockAngle) * side;
      post.position.set(postX, baseHeight * 0.1, postZ);
      group.add(post);
    }
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
        pos: new THREE.Vector3(px, ISLAND_BASE_Y, pz),
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
  //  Update animated elements (fortress flags)
  // ---------------------------------------------------------------

  updateAnimations(time: number, windStrength: number): void {
    for (const island of this.islands) {
      if (!island.meshGroup || island.type !== 'fortress') continue;
      island.meshGroup.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.ShaderMaterial) {
          const u = child.material.uniforms;
          if (u.uTime !== undefined) {
            u.uTime.value = time;
            if (u.uWindStrength !== undefined) u.uWindStrength.value = windStrength;
          }
        }
      });
    }
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
