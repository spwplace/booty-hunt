import * as THREE from 'three';

// ---------------------------------------------------------------------------
//  Gold coin burst on ship capture
// ---------------------------------------------------------------------------

interface CoinParticle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Vector3;
  life: number;
}

export class GoldBurst {
  private mesh: THREE.InstancedMesh;
  private particles: CoinParticle[] = [];
  private dummy = new THREE.Object3D();
  private static MAX = 300;

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
          (Math.random() - 0.5) * 1.5,
          Math.random() * 0.5 + 0.5,
          (Math.random() - 0.5) * 1.5,
        )),
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 10,
          Math.random() * 10 + 5,
          (Math.random() - 0.5) * 10,
        ),
        rot: new THREE.Vector3(
          Math.random() * 10,
          Math.random() * 10,
          Math.random() * 10,
        ),
        life: 1.0,
      });
    }
  }

  update(dt: number) {
    let alive = 0;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.vel.y -= 18 * dt;
      p.pos.addScaledVector(p.vel, dt);
      p.life -= dt * 1.2;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      this.dummy.position.copy(p.pos);
      this.dummy.rotation.set(
        p.rot.x * p.life,
        p.rot.y * p.life,
        p.rot.z * p.life,
      );
      this.dummy.scale.setScalar(p.life * p.life);
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
//  Screen Shake
// ---------------------------------------------------------------------------

export class ScreenShake {
  private intensity = 0;
  private decay = 5;
  offset = new THREE.Vector3();

  trigger(strength = 1) {
    this.intensity = strength;
  }

  update(dt: number) {
    if (this.intensity > 0.001) {
      this.offset.set(
        (Math.random() - 0.5) * this.intensity * 1.5,
        (Math.random() - 0.5) * this.intensity * 1.0,
        (Math.random() - 0.5) * this.intensity * 1.5,
      );
      this.intensity *= Math.exp(-this.decay * dt * 6);
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
  private static MAX = 200;
  private spawnTimer = 0;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.SphereGeometry(0.2, 4, 3);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xc8dde8,
      transparent: true,
      opacity: 0.4,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, WakeTrail.MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  /** Call every frame with the stern-ish position of the ship */
  spawn(pos: THREE.Vector3, speed: number, dt: number) {
    this.spawnTimer += dt;
    const interval = Math.max(0.02, 0.12 - speed * 0.008);
    if (this.spawnTimer < interval || speed < 0.5) return;
    this.spawnTimer = 0;

    for (let i = 0; i < 2; i++) {
      this.dots.push({
        pos: pos.clone().add(new THREE.Vector3(
          (Math.random() - 0.5) * 0.8,
          0,
          (Math.random() - 0.5) * 0.8,
        )),
        life: 1.0,
      });
    }
  }

  update(dt: number) {
    let alive = 0;
    for (let i = this.dots.length - 1; i >= 0; i--) {
      const d = this.dots[i];
      d.life -= dt * 0.6;
      if (d.life <= 0) {
        this.dots.splice(i, 1);
        continue;
      }
      this.dummy.position.copy(d.pos);
      const s = d.life * 1.5;
      this.dummy.scale.set(s, 0.15, s);
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
