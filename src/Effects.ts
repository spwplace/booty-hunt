import * as THREE from 'three';

// ---------------------------------------------------------------------------
//  Gold coin burst on ship capture
// ---------------------------------------------------------------------------

interface CoinParticle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rotSpeed: THREE.Vector3;
  life: number;
}

export class GoldBurst {
  private mesh: THREE.InstancedMesh;
  private particles: CoinParticle[] = [];
  private dummy = new THREE.Object3D();
  private static MAX = 400;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BoxGeometry(0.18, 0.06, 0.18);
    const mat = new THREE.MeshToonMaterial({ color: 0xffd700 });
    this.mesh = new THREE.InstancedMesh(geo, mat, GoldBurst.MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  emit(origin: THREE.Vector3, count = 35) {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        pos: origin.clone().add(new THREE.Vector3(
          (Math.random() - 0.5) * 2,
          Math.random() * 1 + 1,
          (Math.random() - 0.5) * 2,
        )),
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 12,
          Math.random() * 12 + 6,
          (Math.random() - 0.5) * 12,
        ),
        rotSpeed: new THREE.Vector3(
          Math.random() * 12,
          Math.random() * 12,
          Math.random() * 12,
        ),
        life: 0.8 + Math.random() * 0.5,
      });
    }
  }

  update(dt: number) {
    let alive = 0;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.vel.y -= 20 * dt;
      p.pos.addScaledVector(p.vel, dt);
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      const t = Math.max(0, p.life);
      const elapsed = (1.3 - t); // approximate elapsed time
      this.dummy.position.copy(p.pos);
      this.dummy.rotation.set(
        p.rotSpeed.x * elapsed,
        p.rotSpeed.y * elapsed,
        p.rotSpeed.z * elapsed,
      );
      this.dummy.scale.setScalar(Math.min(1, t * 2.5));
      this.dummy.updateMatrix();
      if (alive < GoldBurst.MAX) {
        this.mesh.setMatrixAt(alive, this.dummy.matrix);
        alive++;
      }
    }
    this.mesh.count = alive;
    if (alive > 0) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
//  Water splash on capture
// ---------------------------------------------------------------------------

interface SplashDrop {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
}

export class WaterSplash {
  private mesh: THREE.InstancedMesh;
  private drops: SplashDrop[] = [];
  private dummy = new THREE.Object3D();
  private static MAX = 200;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.SphereGeometry(0.12, 4, 3);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x88bbdd,
      transparent: true,
      opacity: 0.6,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, WaterSplash.MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  emit(origin: THREE.Vector3, count = 25) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const outSpeed = 3 + Math.random() * 6;
      this.drops.push({
        pos: origin.clone().add(new THREE.Vector3(0, 0.2, 0)),
        vel: new THREE.Vector3(
          Math.cos(angle) * outSpeed,
          Math.random() * 8 + 3,
          Math.sin(angle) * outSpeed,
        ),
        life: 0.6 + Math.random() * 0.4,
      });
    }
  }

  update(dt: number) {
    let alive = 0;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.vel.y -= 15 * dt;
      d.pos.addScaledVector(d.vel, dt);
      d.life -= dt;
      if (d.life <= 0) {
        this.drops.splice(i, 1);
        continue;
      }
      this.dummy.position.copy(d.pos);
      this.dummy.scale.setScalar(d.life * 1.8);
      this.dummy.updateMatrix();
      if (alive < WaterSplash.MAX) {
        this.mesh.setMatrixAt(alive, this.dummy.matrix);
        alive++;
      }
    }
    this.mesh.count = alive;
    if (alive > 0) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
//  Screen Shake
// ---------------------------------------------------------------------------

export class ScreenShake {
  private intensity = 0;
  offset = new THREE.Vector3();

  trigger(strength = 1) {
    this.intensity = Math.max(this.intensity, strength);
  }

  update(dt: number) {
    if (this.intensity > 0.002) {
      this.offset.set(
        (Math.random() - 0.5) * this.intensity * 1.5,
        (Math.random() - 0.5) * this.intensity * 0.8,
        (Math.random() - 0.5) * this.intensity * 1.5,
      );
      this.intensity *= Math.exp(-8 * dt);
    } else {
      this.offset.set(0, 0, 0);
      this.intensity = 0;
    }
  }
}

// ---------------------------------------------------------------------------
//  Wake / foam trail behind a ship
// ---------------------------------------------------------------------------

interface FoamDot {
  pos: THREE.Vector3;
  life: number;
}

export class WakeTrail {
  private mesh: THREE.InstancedMesh;
  private dots: FoamDot[] = [];
  private dummy = new THREE.Object3D();
  private static MAX = 300;
  private spawnTimer = 0;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.SphereGeometry(0.25, 4, 3);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xddeeff,
      transparent: true,
      opacity: 0.45,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, WakeTrail.MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  spawn(pos: THREE.Vector3, speed: number, dt: number) {
    this.spawnTimer += dt;
    const interval = Math.max(0.015, 0.1 - speed * 0.006);
    if (this.spawnTimer < interval || speed < 0.8) return;
    this.spawnTimer = 0;

    const count = speed > 8 ? 3 : 2;
    for (let i = 0; i < count; i++) {
      this.dots.push({
        pos: pos.clone().add(new THREE.Vector3(
          (Math.random() - 0.5) * 1.0,
          0,
          (Math.random() - 0.5) * 1.0,
        )),
        life: 1.0,
      });
    }
  }

  update(dt: number) {
    let alive = 0;
    for (let i = this.dots.length - 1; i >= 0; i--) {
      const d = this.dots[i];
      d.life -= dt * 0.55;
      if (d.life <= 0) {
        this.dots.splice(i, 1);
        continue;
      }
      this.dummy.position.copy(d.pos);
      const s = d.life * 1.8;
      this.dummy.scale.set(s, 0.12, s);
      this.dummy.updateMatrix();
      if (alive < WakeTrail.MAX) {
        this.mesh.setMatrixAt(alive, this.dummy.matrix);
        alive++;
      }
    }
    this.mesh.count = alive;
    if (alive > 0) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
//  Cannon smoke puffs
// ---------------------------------------------------------------------------

interface SmokePuff {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  scale: number;
}

export class CannonSmoke {
  private mesh: THREE.InstancedMesh;
  private particles: SmokePuff[] = [];
  private dummy = new THREE.Object3D();
  private static MAX = 150;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.SphereGeometry(0.4, 5, 4);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x888888,
      transparent: true,
      opacity: 0.5,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, CannonSmoke.MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  emit(origin: THREE.Vector3, direction: THREE.Vector3, count = 12) {
    for (let i = 0; i < count; i++) {
      const speed = 3 + Math.random() * 3;
      const vel = direction.clone().multiplyScalar(speed).add(
        new THREE.Vector3(
          (Math.random() - 0.5) * 2,
          Math.random() * 0.8 + 0.3,
          (Math.random() - 0.5) * 2,
        ),
      );
      const maxLife = 0.8 + Math.random() * 0.7;
      this.particles.push({
        pos: origin.clone(),
        vel,
        life: maxLife,
        maxLife,
        scale: 0.5,
      });
    }
  }

  update(dt: number) {
    let alive = 0;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.vel.y += 0.5 * dt; // slight upward drift
      p.pos.addScaledVector(p.vel, dt);
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      const t = 1 - p.life / p.maxLife; // 0 -> 1 over lifetime
      p.scale = 0.5 + t * 2.0; // grows from 0.5 to 2.5
      this.dummy.position.copy(p.pos);
      this.dummy.scale.setScalar(p.scale);
      this.dummy.updateMatrix();
      if (alive < CannonSmoke.MAX) {
        this.mesh.setMatrixAt(alive, this.dummy.matrix);
        alive++;
      }
    }
    this.mesh.count = alive;
    if (alive > 0) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
//  Explosion debris burst on cannon hit
// ---------------------------------------------------------------------------

interface Debris {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rotSpeed: THREE.Vector3;
  life: number;
  maxLife: number;
}

export class ExplosionEffect {
  private mesh: THREE.InstancedMesh;
  private particles: Debris[] = [];
  private dummy = new THREE.Object3D();
  private static MAX = 200;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff6622,
      transparent: true,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, ExplosionEffect.MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  emit(origin: THREE.Vector3, count = 25) {
    // Main burst debris
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const speed = 8 + Math.random() * 12;
      const maxLife = 0.3 + Math.random() * 0.5;
      this.particles.push({
        pos: origin.clone(),
        vel: new THREE.Vector3(
          Math.sin(phi) * Math.cos(theta) * speed,
          Math.cos(phi) * speed * 0.8 + 2,
          Math.sin(phi) * Math.sin(theta) * speed,
        ),
        rotSpeed: new THREE.Vector3(
          Math.random() * 15,
          Math.random() * 15,
          Math.random() * 15,
        ),
        life: maxLife,
        maxLife,
      });
    }

    // Burning embers (slower, longer life)
    const emberCount = Math.floor(count * 0.4);
    for (let i = 0; i < emberCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const speed = 2 + Math.random() * 5;
      const maxLife = 0.6 + Math.random() * 0.5;
      this.particles.push({
        pos: origin.clone(),
        vel: new THREE.Vector3(
          Math.sin(phi) * Math.cos(theta) * speed,
          Math.random() * 4 + 1,
          Math.sin(phi) * Math.sin(theta) * speed,
        ),
        rotSpeed: new THREE.Vector3(
          Math.random() * 8,
          Math.random() * 8,
          Math.random() * 8,
        ),
        life: maxLife,
        maxLife,
      });
    }
  }

  update(dt: number) {
    let alive = 0;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.vel.y -= 15 * dt; // gravity
      p.pos.addScaledVector(p.vel, dt);
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      const t = 1 - p.life / p.maxLife; // 0 -> 1 over lifetime
      const s = Math.max(0.1, 1 - t); // scale down over life
      this.dummy.position.copy(p.pos);
      this.dummy.rotation.set(
        p.rotSpeed.x * t * p.maxLife,
        p.rotSpeed.y * t * p.maxLife,
        p.rotSpeed.z * t * p.maxLife,
      );
      this.dummy.scale.setScalar(s);
      this.dummy.updateMatrix();
      if (alive < ExplosionEffect.MAX) {
        this.mesh.setMatrixAt(alive, this.dummy.matrix);
        alive++;
      }
    }
    this.mesh.count = alive;
    if (alive > 0) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
//  Rain system for stormy weather
// ---------------------------------------------------------------------------

interface RainDrop {
  pos: THREE.Vector3;
  speed: number;
  windDrift: number;
}

export class RainSystem {
  private mesh: THREE.InstancedMesh;
  private drops: RainDrop[] = [];
  private dummy = new THREE.Object3D();
  private maxDrops: number;
  active = false;

  private static AREA_SIZE = 50;
  private static HALF_AREA = 25;

  constructor(scene: THREE.Scene, playerPos: THREE.Vector3) {
    const isMobile = navigator.maxTouchPoints > 0;
    this.maxDrops = isMobile ? 200 : 500;

    const geo = new THREE.CylinderGeometry(0.015, 0.015, 0.6, 3);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xaabbcc,
      transparent: true,
      opacity: 0.3,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, this.maxDrops);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    // Pre-populate drops
    for (let i = 0; i < this.maxDrops; i++) {
      this.drops.push({
        pos: new THREE.Vector3(
          playerPos.x + (Math.random() - 0.5) * RainSystem.AREA_SIZE,
          Math.random() * 15 + 25,
          playerPos.z + (Math.random() - 0.5) * RainSystem.AREA_SIZE,
        ),
        speed: 25 + Math.random() * 10,
        windDrift: (Math.random() - 0.5) * 3,
      });
    }
  }

  update(dt: number, playerPos: THREE.Vector3) {
    if (!this.active) {
      this.mesh.count = 0;
      return;
    }

    for (let i = 0; i < this.drops.length; i++) {
      const d = this.drops[i];

      // Fall and drift
      d.pos.y -= d.speed * dt;
      d.pos.x += d.windDrift * dt;

      // Check if drop needs respawning
      const dx = d.pos.x - playerPos.x;
      const dz = d.pos.z - playerPos.z;
      const outOfArea =
        Math.abs(dx) > RainSystem.HALF_AREA ||
        Math.abs(dz) > RainSystem.HALF_AREA;

      if (d.pos.y < -2 || outOfArea) {
        d.pos.set(
          playerPos.x + (Math.random() - 0.5) * RainSystem.AREA_SIZE,
          25 + Math.random() * 15,
          playerPos.z + (Math.random() - 0.5) * RainSystem.AREA_SIZE,
        );
        d.speed = 25 + Math.random() * 10;
        d.windDrift = (Math.random() - 0.5) * 3;
      }

      // Align drop to fall direction
      this.dummy.position.copy(d.pos);
      // Tilt slightly in wind direction
      const windAngle = Math.atan2(d.windDrift, d.speed);
      this.dummy.rotation.set(0, 0, windAngle);
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }

    this.mesh.count = this.drops.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
//  Muzzle flash on cannon fire
// ---------------------------------------------------------------------------

interface FlashParticle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
}

export class MuzzleFlash {
  private mesh: THREE.InstancedMesh;
  private particles: FlashParticle[] = [];
  private dummy = new THREE.Object3D();
  private static MAX = 30;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.SphereGeometry(0.15, 5, 4);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(geo, mat, MuzzleFlash.MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  emit(origin: THREE.Vector3, direction: THREE.Vector3) {
    const count = 6 + Math.floor(Math.random() * 3); // 6-8 particles
    for (let i = 0; i < count; i++) {
      const spread = new THREE.Vector3(
        (Math.random() - 0.5) * 4,
        Math.random() * 2 + 1,
        (Math.random() - 0.5) * 4,
      );
      const vel = direction.clone().multiplyScalar(6 + Math.random() * 4).add(spread);
      this.particles.push({
        pos: origin.clone(),
        vel,
        life: 0.08,
      });
    }
  }

  update(dt: number) {
    let alive = 0;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.pos.addScaledVector(p.vel, dt);
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      const t = p.life / 0.08; // 1 -> 0 over lifetime
      this.dummy.position.copy(p.pos);
      this.dummy.scale.setScalar(t * 1.5);
      this.dummy.updateMatrix();
      if (alive < MuzzleFlash.MAX) {
        this.mesh.setMatrixAt(alive, this.dummy.matrix);
        alive++;
      }
    }
    this.mesh.count = alive;
    if (alive > 0) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
//  Cannonball smoke trail
// ---------------------------------------------------------------------------

interface TrailParticle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
}

export class CannonballTrail {
  private mesh: THREE.InstancedMesh;
  private particles: TrailParticle[] = [];
  private dummy = new THREE.Object3D();
  private static MAX = 200;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.SphereGeometry(0.06, 4, 3);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff8833,
      transparent: true,
      opacity: 0.6,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, CannonballTrail.MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  emit(pos: THREE.Vector3) {
    for (let i = 0; i < 2; i++) {
      this.particles.push({
        pos: pos.clone(),
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 0.5,
          Math.random() * 0.3 + 0.1,
          (Math.random() - 0.5) * 0.5,
        ),
        life: 0.3,
      });
    }
  }

  update(dt: number) {
    let alive = 0;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.pos.addScaledVector(p.vel, dt);
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      const t = p.life / 0.3; // 1 -> 0 over lifetime
      this.dummy.position.copy(p.pos);
      this.dummy.scale.setScalar(t * 0.8);
      this.dummy.updateMatrix();
      if (alive < CannonballTrail.MAX) {
        this.mesh.setMatrixAt(alive, this.dummy.matrix);
        alive++;
      }
    }
    this.mesh.count = alive;
    if (alive > 0) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
//  Ship breakup debris on destruction
// ---------------------------------------------------------------------------

interface BreakupPiece {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rotSpeed: THREE.Vector3;
  life: number;
  maxLife: number;
}

export class ShipBreakup {
  private mesh: THREE.InstancedMesh;
  private particles: BreakupPiece[] = [];
  private dummy = new THREE.Object3D();
  private static MAX = 100;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BoxGeometry(
      0.3 + Math.random() * 0.3,
      0.15 + Math.random() * 0.1,
      0.5 + Math.random() * 0.4,
    );
    const mat = new THREE.MeshToonMaterial({ color: 0x6b3a2a });
    this.mesh = new THREE.InstancedMesh(geo, mat, ShipBreakup.MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  emit(origin: THREE.Vector3) {
    const count = 8 + Math.floor(Math.random() * 5); // 8-12 pieces
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 6;
      const maxLife = 3.0;
      this.particles.push({
        pos: origin.clone().add(new THREE.Vector3(
          (Math.random() - 0.5) * 2,
          Math.random() * 0.5,
          (Math.random() - 0.5) * 2,
        )),
        vel: new THREE.Vector3(
          Math.cos(theta) * speed,
          Math.random() * 4 + 2,
          Math.sin(theta) * speed,
        ),
        rotSpeed: new THREE.Vector3(
          Math.random() * 5,
          Math.random() * 5,
          Math.random() * 5,
        ),
        life: maxLife,
        maxLife,
      });
    }
  }

  update(dt: number) {
    let alive = 0;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.vel.y -= 8 * dt; // gravity
      p.pos.addScaledVector(p.vel, dt);
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      const elapsed = p.maxLife - p.life;

      // Float briefly: clamp above -0.5 for first 1.5s
      if (elapsed < 1.5) {
        if (p.pos.y < -0.5) {
          p.pos.y = -0.5;
          p.vel.y = Math.max(p.vel.y, 0);
        }
      } else {
        // Gradually submerge over remaining 1.5s
        const sinkT = (elapsed - 1.5) / 1.5;
        if (p.pos.y > -0.5) {
          p.vel.y -= 2 * dt;
        }
        // Allow sinking below -0.5
        const maxSink = -0.5 - sinkT * 3;
        if (p.pos.y < maxSink) p.pos.y = maxSink;
      }

      const t = 1 - p.life / p.maxLife; // 0 -> 1 over lifetime
      this.dummy.position.copy(p.pos);
      this.dummy.rotation.set(
        p.rotSpeed.x * t * p.maxLife,
        p.rotSpeed.y * t * p.maxLife,
        p.rotSpeed.z * t * p.maxLife,
      );
      // Scale down in last 0.5s
      const fadeScale = p.life < 0.5 ? p.life / 0.5 : 1;
      this.dummy.scale.setScalar(fadeScale);
      this.dummy.updateMatrix();
      if (alive < ShipBreakup.MAX) {
        this.mesh.setMatrixAt(alive, this.dummy.matrix);
        alive++;
      }
    }
    this.mesh.count = alive;
    if (alive > 0) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
//  Speed lines when moving fast
// ---------------------------------------------------------------------------

interface SpeedLine {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
}

export class SpeedLines {
  private mesh: THREE.InstancedMesh;
  private particles: SpeedLine[] = [];
  private dummy = new THREE.Object3D();
  private static MAX = 60;
  private spawnTimer = 0;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BoxGeometry(0.03, 0.03, 1.5);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.3,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, SpeedLines.MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  update(dt: number, playerPos: THREE.Vector3, playerAngle: number, playerSpeed: number) {
    // Only active above speed 8
    if (playerSpeed <= 8) {
      // Drain existing particles
      let alive = 0;
      for (let i = this.particles.length - 1; i >= 0; i--) {
        this.particles[i].life -= dt;
        if (this.particles[i].life <= 0) {
          this.particles.splice(i, 1);
          continue;
        }
        const p = this.particles[i];
        p.pos.addScaledVector(p.vel, dt);
        const t = p.life / 0.4;
        this.dummy.position.copy(p.pos);
        this.dummy.rotation.set(0, playerAngle, 0);
        this.dummy.scale.set(1, 1, t);
        this.dummy.updateMatrix();
        if (alive < SpeedLines.MAX) {
          this.mesh.setMatrixAt(alive, this.dummy.matrix);
          alive++;
        }
      }
      this.mesh.count = alive;
      if (alive > 0) this.mesh.instanceMatrix.needsUpdate = true;
      return;
    } else {
      // Spawn density scales with speed
      const spawnRate = 0.02 + (1.0 / (playerSpeed - 6)); // more lines at higher speed
      this.spawnTimer += dt;
      while (this.spawnTimer >= spawnRate && this.particles.length < SpeedLines.MAX) {
        this.spawnTimer -= spawnRate;

        // Spawn in cone ahead of player
        const forwardX = -Math.sin(playerAngle);
        const forwardZ = -Math.cos(playerAngle);
        const coneSpread = 0.4;
        const lateralAngle = (Math.random() - 0.5) * coneSpread;
        const cosA = Math.cos(lateralAngle);
        const sinA = Math.sin(lateralAngle);
        const dirX = forwardX * cosA - forwardZ * sinA;
        const dirZ = forwardX * sinA + forwardZ * cosA;

        const dist = 8 + Math.random() * 15;
        const spawnPos = new THREE.Vector3(
          playerPos.x + dirX * dist + (Math.random() - 0.5) * 4,
          playerPos.y + 1 + (Math.random() - 0.5) * 3,
          playerPos.z + dirZ * dist + (Math.random() - 0.5) * 4,
        );

        // Streak backward relative to player
        const streakSpeed = playerSpeed * 1.5;
        this.particles.push({
          pos: spawnPos,
          vel: new THREE.Vector3(
            -forwardX * streakSpeed,
            0,
            -forwardZ * streakSpeed,
          ),
          life: 0.4,
        });
      }
    }

    // Update all particles
    let alive = 0;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.pos.addScaledVector(p.vel, dt);
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      const t = p.life / 0.4; // 1 -> 0 over lifetime
      this.dummy.position.copy(p.pos);
      // Align line with velocity direction
      this.dummy.rotation.set(0, playerAngle, 0);
      this.dummy.scale.set(1, 1, t);
      this.dummy.updateMatrix();
      if (alive < SpeedLines.MAX) {
        this.mesh.setMatrixAt(alive, this.dummy.matrix);
        alive++;
      }
    }
    this.mesh.count = alive;
    if (alive > 0) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
//  Fire effect for burning ships
// ---------------------------------------------------------------------------

interface FireParticle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
}

export class FireEffect {
  private mesh: THREE.InstancedMesh;
  private particles: FireParticle[] = [];
  private dummy = new THREE.Object3D();
  private static MAX = 80;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.SphereGeometry(0.2, 5, 4);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff6600,
      transparent: true,
      opacity: 0.8,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, FireEffect.MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  emit(origin: THREE.Vector3, count = 8) {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        pos: origin.clone().add(new THREE.Vector3(
          (Math.random() - 0.5) * 1.5,
          Math.random() * 0.5,
          (Math.random() - 0.5) * 1.5,
        )),
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 2,
          2 + Math.random() * 3,
          (Math.random() - 0.5) * 2,
        ),
        life: 0.6,
      });
    }
  }

  update(dt: number) {
    let alive = 0;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.pos.addScaledVector(p.vel, dt);
      // Add random flicker spread
      p.vel.x += (Math.random() - 0.5) * 8 * dt;
      p.vel.z += (Math.random() - 0.5) * 8 * dt;
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      const t = p.life / 0.6; // 1 -> 0 over lifetime
      this.dummy.position.copy(p.pos);
      this.dummy.scale.setScalar(t * 1.2);
      this.dummy.updateMatrix();
      if (alive < FireEffect.MAX) {
        this.mesh.setMatrixAt(alive, this.dummy.matrix);
        alive++;
      }
    }
    this.mesh.count = alive;
    if (alive > 0) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
//  Floating debris after ship destruction
// ---------------------------------------------------------------------------

interface FloatingPiece {
  pos: THREE.Vector3;
  heading: number;
  driftSpeed: number;
  bobPhase: number;
  bobSpeed: number;
  life: number;
  rotY: number;
  rotSpeed: number;
}

export class FloatingDebris {
  private mesh: THREE.InstancedMesh;
  private pieces: FloatingPiece[] = [];
  private dummy = new THREE.Object3D();
  private static MAX = 50;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BoxGeometry(0.3, 0.2, 0.8);
    const mat = new THREE.MeshToonMaterial({ color: 0x8b6b4a });
    this.mesh = new THREE.InstancedMesh(geo, mat, FloatingDebris.MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  emit(origin: THREE.Vector3) {
    const count = 4 + Math.floor(Math.random() * 3); // 4-6 pieces
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const dist = 1 + Math.random() * 3;
      this.pieces.push({
        pos: new THREE.Vector3(
          origin.x + Math.cos(theta) * dist,
          0,
          origin.z + Math.sin(theta) * dist,
        ),
        heading: Math.random() * Math.PI * 2,
        driftSpeed: 0.3 + Math.random() * 0.7,
        bobPhase: Math.random() * Math.PI * 2,
        bobSpeed: 1.5 + Math.random() * 1.5,
        life: 25,
        rotY: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.5,
      });
    }
  }

  shouldCull(piece: FloatingPiece, playerPos: THREE.Vector3): boolean {
    const dx = piece.pos.x - playerPos.x;
    const dz = piece.pos.z - playerPos.z;
    return dx * dx + dz * dz > 150 * 150;
  }

  update(dt: number, getWaveHeight: (x: number, z: number) => number, playerPos: THREE.Vector3) {
    let alive = 0;
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i];
      p.life -= dt;
      if (p.life <= 0 || this.shouldCull(p, playerPos)) {
        this.pieces.splice(i, 1);
        continue;
      }

      // Drift with current heading
      p.pos.x += Math.cos(p.heading) * p.driftSpeed * dt;
      p.pos.z += Math.sin(p.heading) * p.driftSpeed * dt;

      // Bob on ocean surface
      p.bobPhase += p.bobSpeed * dt;
      const waveY = getWaveHeight(p.pos.x, p.pos.z);
      p.pos.y = waveY + Math.sin(p.bobPhase) * 0.1;

      // Slow rotation
      p.rotY += p.rotSpeed * dt;

      this.dummy.position.copy(p.pos);
      this.dummy.rotation.set(
        Math.sin(p.bobPhase * 0.7) * 0.15, // slight roll
        p.rotY,
        Math.sin(p.bobPhase * 1.1) * 0.1,  // slight pitch
      );

      // Fade out in last 3s
      const fadeScale = p.life < 3 ? p.life / 3 : 1;
      this.dummy.scale.setScalar(fadeScale);
      this.dummy.updateMatrix();
      if (alive < FloatingDebris.MAX) {
        this.mesh.setMatrixAt(alive, this.dummy.matrix);
        alive++;
      }
    }
    this.mesh.count = alive;
    if (alive > 0) this.mesh.instanceMatrix.needsUpdate = true;
  }
}
