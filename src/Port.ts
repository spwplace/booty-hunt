import * as THREE from 'three';

export class PortScene {
  group: THREE.Group;
  private lighthouse: THREE.PointLight;
  private lighthouseAngle = 0;
  private lighthouseCone: THREE.Mesh;
  private chimneySmoke: { pos: THREE.Vector3; vel: THREE.Vector3; life: number }[] = [];
  private smokeMesh: THREE.InstancedMesh;
  private smokeDummy = new THREE.Object3D();
  private chimneyTop = new THREE.Vector3();
  private smokeTimer = 0;

  constructor() {
    this.group = new THREE.Group();

    // --- Materials ---
    const woodDark = new THREE.MeshToonMaterial({ color: 0x3a2a1a });
    const woodLight = new THREE.MeshToonMaterial({ color: 0x6b5a3a });
    const stone = new THREE.MeshToonMaterial({ color: 0x555555 });
    const roofMat = new THREE.MeshToonMaterial({ color: 0x8b4513 });
    const windowMat = new THREE.MeshBasicMaterial({ color: 0xffaa44 });

    // --- Dock ---
    const dockGeo = new THREE.BoxGeometry(20, 1, 25);
    const dock = new THREE.Mesh(dockGeo, woodDark);
    dock.position.set(0, -0.5, 0);
    this.group.add(dock);

    // Pilings along dock edges
    const pilingGeo = new THREE.CylinderGeometry(0.15, 0.15, 3, 6);
    const pilingPositions = [
      [-9.5, -1.5, -12], [-9.5, -1.5, -4], [-9.5, -1.5, 4], [-9.5, -1.5, 12],
      [9.5, -1.5, -12], [9.5, -1.5, -4], [9.5, -1.5, 4], [9.5, -1.5, 12],
    ];
    for (const [px, py, pz] of pilingPositions) {
      const piling = new THREE.Mesh(pilingGeo, woodDark);
      piling.position.set(px, py, pz);
      this.group.add(piling);
    }

    // Plank lines on dock surface
    const plankDarkMat = new THREE.MeshToonMaterial({ color: 0x2e2218 });
    const plankGeo = new THREE.BoxGeometry(20, 0.02, 0.03);
    for (let i = 0; i < 12; i++) {
      const plank = new THREE.Mesh(plankGeo, plankDarkMat);
      plank.position.set(0, 0.01, -11 + i * 2);
      this.group.add(plank);
    }

    // --- Tavern (building 1) ---
    const tavernGeo = new THREE.BoxGeometry(6, 4, 5);
    const tavern = new THREE.Mesh(tavernGeo, woodLight);
    tavern.position.set(-4, 2, -14);
    this.group.add(tavern);

    // Tavern roof - two sloped planes approximated with a rotated box
    const roofLeftGeo = new THREE.BoxGeometry(3.8, 0.15, 5.5);
    const roofLeft = new THREE.Mesh(roofLeftGeo, roofMat);
    roofLeft.position.set(-5.5, 4.8, -14);
    roofLeft.rotation.z = -0.55;
    this.group.add(roofLeft);

    const roofRight = new THREE.Mesh(roofLeftGeo, roofMat);
    roofRight.position.set(-2.5, 4.8, -14);
    roofRight.rotation.z = 0.55;
    this.group.add(roofRight);

    // Tavern windows (front face, z = -11.5)
    const windowGeo = new THREE.PlaneGeometry(0.8, 1.0);
    for (let i = 0; i < 3; i++) {
      const win = new THREE.Mesh(windowGeo, windowMat);
      win.position.set(-6 + i * 2, 2.5, -11.49);
      this.group.add(win);
    }

    // Chimney on tavern roof
    const chimneyGeo = new THREE.CylinderGeometry(0.2, 0.25, 2, 6);
    const chimney = new THREE.Mesh(chimneyGeo, stone);
    chimney.position.set(-5.5, 5.8, -14);
    this.group.add(chimney);
    this.chimneyTop.set(-5.5, 6.8, -14);

    // --- Warehouse (building 2) ---
    const warehouseGeo = new THREE.BoxGeometry(5, 5, 8);
    const warehouse = new THREE.Mesh(warehouseGeo, woodLight);
    warehouse.position.set(5, 2.5, -16);
    this.group.add(warehouse);

    // Warehouse door
    const doorMat = new THREE.MeshToonMaterial({ color: 0x1a1208 });
    const doorGeo = new THREE.PlaneGeometry(2, 3);
    const door = new THREE.Mesh(doorGeo, doorMat);
    door.position.set(5, 1.5, -11.99);
    this.group.add(door);

    // --- Blacksmith (building 3) ---
    const blacksmithGeo = new THREE.BoxGeometry(4, 3, 4);
    const blacksmith = new THREE.Mesh(blacksmithGeo, woodLight);
    blacksmith.position.set(-10, 1.5, -14);
    this.group.add(blacksmith);

    // Anvil pedestal + anvil
    const anvilMat = new THREE.MeshToonMaterial({ color: 0x333333 });
    const pedestalGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const pedestal = new THREE.Mesh(pedestalGeo, anvilMat);
    pedestal.position.set(-9, 0.25, -11.5);
    this.group.add(pedestal);

    const anvilGeo = new THREE.BoxGeometry(0.4, 0.3, 0.6);
    const anvil = new THREE.Mesh(anvilGeo, anvilMat);
    anvil.position.set(-9, 0.65, -11.5);
    this.group.add(anvil);

    // Orange glow from blacksmith door
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xff6622,
      transparent: true,
      opacity: 0.6,
    });
    const glowGeo = new THREE.PlaneGeometry(1.5, 2);
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.set(-10, 1.0, -11.99);
    this.group.add(glow);

    // --- Lighthouse ---
    const lighthouseGeo = new THREE.CylinderGeometry(0.8, 1.5, 12, 8);
    const lighthouseMesh = new THREE.Mesh(lighthouseGeo, stone);
    lighthouseMesh.position.set(12, 6, -10);
    this.group.add(lighthouseMesh);

    // Red stripe bands
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xcc2222 });
    const stripeHeights = [3, 6, 9];
    for (const sy of stripeHeights) {
      // Interpolate radius at this height (linearly from 1.5 at bottom to 0.8 at top over 12 units)
      const t = sy / 12;
      const radius = 1.5 + (0.8 - 1.5) * t;
      const stripeGeo = new THREE.CylinderGeometry(
        radius - 0.02,
        radius + 0.02,
        0.3,
        8
      );
      const stripe = new THREE.Mesh(stripeGeo, stripeMat);
      stripe.position.set(12, sy, -10);
      this.group.add(stripe);
    }

    // Lighthouse point light at top
    this.lighthouse = new THREE.PointLight(0xffeeaa, 2, 30);
    this.lighthouse.position.set(12, 12.5, -10);
    this.group.add(this.lighthouse);

    // Spotlight cone
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xffeeaa,
      transparent: true,
      opacity: 0.15,
    });
    const coneGeo = new THREE.ConeGeometry(2, 8, 8);
    this.lighthouseCone = new THREE.Mesh(coneGeo, coneMat);
    this.lighthouseCone.position.set(12, 12.5, -10);
    // Rotate so cone points sideways (along +x initially)
    this.lighthouseCone.rotation.z = -Math.PI / 2;
    this.group.add(this.lighthouseCone);

    // --- Scatter objects: Crates ---
    const crateGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const cratePositions = [
      [-3, 0.25, 2], [1, 0.25, 5], [-6, 0.25, -3],
      [4, 0.25, 1], [7, 0.25, 6], [-2, 0.25, 8],
      [0, 0.25, -5], [6, 0.25, -2],
    ];
    for (const [cx, cy, cz] of cratePositions) {
      const crate = new THREE.Mesh(crateGeo, woodDark);
      crate.position.set(cx, cy, cz);
      crate.rotation.y = Math.random() * Math.PI;
      this.group.add(crate);
    }

    // --- Scatter objects: Barrels ---
    const barrelGeo = new THREE.CylinderGeometry(0.25, 0.3, 0.6, 8);
    const barrelMat = new THREE.MeshToonMaterial({ color: 0x5a3a1a });
    const barrelPositions = [
      [-7, 0.3, 3], [2, 0.3, -1], [8, 0.3, 4], [-1, 0.3, 10],
    ];
    for (const [bx, by, bz] of barrelPositions) {
      const barrel = new THREE.Mesh(barrelGeo, barrelMat);
      barrel.position.set(bx, by, bz);
      this.group.add(barrel);
    }

    // --- Chimney smoke InstancedMesh ---
    const smokeSphereGeo = new THREE.SphereGeometry(0.2, 6, 6);
    const smokeMatInst = new THREE.MeshBasicMaterial({
      color: 0x888888,
      transparent: true,
      opacity: 0.4,
    });
    this.smokeMesh = new THREE.InstancedMesh(smokeSphereGeo, smokeMatInst, 30);
    this.smokeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.smokeMesh.count = 0;
    this.group.add(this.smokeMesh);
  }

  update(dt: number, time: number): void {
    // --- Lighthouse spotlight rotation ---
    this.lighthouseAngle += dt * 1.5;
    // Rotate the cone around Y at the lighthouse top
    this.lighthouseCone.rotation.set(0, 0, -Math.PI / 2);
    this.lighthouseCone.position.set(12, 12.5, -10);
    // Apply Y rotation by rotating the cone's parent-local axes
    const coneOffset = 4; // half the cone length, so it extends outward
    this.lighthouseCone.position.x = 12 + Math.cos(this.lighthouseAngle) * coneOffset;
    this.lighthouseCone.position.z = -10 + Math.sin(this.lighthouseAngle) * coneOffset;
    this.lighthouseCone.rotation.y = -this.lighthouseAngle;

    // --- Chimney smoke particles ---
    this.smokeTimer += dt;
    if (this.smokeTimer >= 0.3 && this.chimneySmoke.length < 30) {
      this.smokeTimer = 0;
      this.chimneySmoke.push({
        pos: this.chimneyTop.clone(),
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 0.2,
          0.5 + Math.random() * 0.3,
          (Math.random() - 0.5) * 0.1
        ),
        life: 2.0,
      });
    }

    // Update particles
    for (let i = this.chimneySmoke.length - 1; i >= 0; i--) {
      const p = this.chimneySmoke[i];
      p.pos.addScaledVector(p.vel, dt);
      p.life -= dt;
      if (p.life <= 0) {
        this.chimneySmoke.splice(i, 1);
      }
    }

    // Write to instanced mesh
    this.smokeMesh.count = this.chimneySmoke.length;
    for (let i = 0; i < this.chimneySmoke.length; i++) {
      const p = this.chimneySmoke[i];
      const t = 1.0 - p.life / 2.0; // 0 at birth, 1 at death
      const scale = 0.3 + t * 1.2; // grows from 0.3 to 1.5
      this.smokeDummy.position.copy(p.pos);
      this.smokeDummy.scale.setScalar(scale);
      this.smokeDummy.updateMatrix();
      this.smokeMesh.setMatrixAt(i, this.smokeDummy.matrix);
    }
    this.smokeMesh.instanceMatrix.needsUpdate = true;
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.group);
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.InstancedMesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
  }
}
