import * as THREE from 'three';

// ---------------------------------------------------------------------------
//  Interfaces
// ---------------------------------------------------------------------------

interface BioParticle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
}

interface LightningBolt {
  mesh: THREE.LineSegments;
  timer: number;
}

// ---------------------------------------------------------------------------
//  Canvas texture helpers
// ---------------------------------------------------------------------------

function createSunTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cx);
  grad.addColorStop(0, 'rgba(255,255,255,1.0)');
  grad.addColorStop(0.3, 'rgba(255,240,200,0.8)');
  grad.addColorStop(0.7, 'rgba(255,160,50,0.3)');
  grad.addColorStop(1, 'rgba(255,120,20,0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

function createSunGlowTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cx);
  grad.addColorStop(0, 'rgba(255,200,100,0.25)');
  grad.addColorStop(0.4, 'rgba(255,160,60,0.1)');
  grad.addColorStop(1, 'rgba(255,120,20,0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

function createMoonTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cx);
  grad.addColorStop(0, 'rgba(200,210,255,1.0)');
  grad.addColorStop(0.3, 'rgba(180,195,240,0.7)');
  grad.addColorStop(0.7, 'rgba(140,160,220,0.2)');
  grad.addColorStop(1, 'rgba(120,140,200,0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

function createMoonGlowTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cx);
  grad.addColorStop(0, 'rgba(160,180,240,0.2)');
  grad.addColorStop(0.4, 'rgba(130,150,220,0.08)');
  grad.addColorStop(1, 'rgba(100,120,200,0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

// ---------------------------------------------------------------------------
//  Star shaders
// ---------------------------------------------------------------------------

const starVertexShader = /* glsl */ `
  attribute float size;
  uniform float uStarVisibility;
  varying float vPhase;
  varying float vVisibility;

  void main() {
    // Derive a pseudo-random phase from position
    vPhase = fract(sin(dot(position.xy, vec2(12.9898, 78.233))) * 43758.5453);
    vVisibility = uStarVisibility;

    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * (300.0 / -mvPos.z);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const starFragmentShader = /* glsl */ `
  uniform float uTime;
  varying float vPhase;
  varying float vVisibility;

  void main() {
    // Circular point
    vec2 uv = gl_PointCoord - vec2(0.5);
    float dist = length(uv);
    if (dist > 0.5) discard;

    // Twinkle rate derived from phase
    float rate = 1.5 + vPhase * 2.5;
    float twinkle = 0.5 + 0.5 * sin(uTime * rate + vPhase * 6.2831);

    float alpha = vVisibility * twinkle;
    gl_FragColor = vec4(1.0, 1.0, 1.0, alpha);
  }
`;

// ===================================================================
//  SkySystem
// ===================================================================

export class SkySystem {
  stars: THREE.Points;

  private scene: THREE.Scene;
  private starMaterial: THREE.ShaderMaterial;

  // Celestials
  private sunSprite: THREE.Sprite;
  private sunGlow: THREE.Sprite;
  private moonSprite: THREE.Sprite;
  private moonGlow: THREE.Sprite;

  // Lightning
  private lightningBolts: LightningBolt[] = [];

  // Bioluminescent wake
  private bioMesh: THREE.InstancedMesh;
  private bioParticles: BioParticle[] = [];
  private bioDummy = new THREE.Object3D();
  private bioSpawnTimer = 0;
  active = false;
  private static BIO_MAX = 150;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // ---------------------------------------------------------------
    //  Stars
    // ---------------------------------------------------------------
    const starCount = 400;
    const positions = new Float32Array(starCount * 3);
    const sizes = new Float32Array(starCount);

    for (let i = 0; i < starCount; i++) {
      // Random point on unit hemisphere (y >= 0)
      let x: number, y: number, z: number;
      do {
        x = Math.random() * 2 - 1;
        y = Math.random();
        z = Math.random() * 2 - 1;
      } while (x * x + y * y + z * z > 1 || x * x + y * y + z * z < 0.01);

      const len = Math.sqrt(x * x + y * y + z * z);
      const radius = 390;
      positions[i * 3] = (x / len) * radius;
      positions[i * 3 + 1] = (y / len) * radius;
      positions[i * 3 + 2] = (z / len) * radius;

      sizes[i] = 1 + Math.random() * 2; // 1-3
    }

    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    this.starMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uStarVisibility: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: starVertexShader,
      fragmentShader: starFragmentShader,
      transparent: true,
      depthWrite: false,
    });

    this.stars = new THREE.Points(starGeo, this.starMaterial);
    this.stars.frustumCulled = false;
    scene.add(this.stars);

    // ---------------------------------------------------------------
    //  Sun sprite + glow
    // ---------------------------------------------------------------
    const sunTex = createSunTexture();
    this.sunSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: sunTex, transparent: true, depthWrite: false }),
    );
    this.sunSprite.scale.set(12, 12, 1);
    scene.add(this.sunSprite);

    const sunGlowTex = createSunGlowTexture();
    this.sunGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: sunGlowTex, transparent: true, depthWrite: false }),
    );
    this.sunGlow.scale.set(24, 24, 1);
    scene.add(this.sunGlow);

    // ---------------------------------------------------------------
    //  Moon sprite + glow
    // ---------------------------------------------------------------
    const moonTex = createMoonTexture();
    this.moonSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: moonTex, transparent: true, depthWrite: false }),
    );
    this.moonSprite.scale.set(8, 8, 1);
    this.moonSprite.visible = false;
    scene.add(this.moonSprite);

    const moonGlowTex = createMoonGlowTexture();
    this.moonGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: moonGlowTex, transparent: true, depthWrite: false }),
    );
    this.moonGlow.scale.set(16, 16, 1);
    this.moonGlow.visible = false;
    scene.add(this.moonGlow);

    // ---------------------------------------------------------------
    //  Bioluminescent wake particles
    // ---------------------------------------------------------------
    const bioGeo = new THREE.SphereGeometry(0.15, 4, 3);
    const bioMat = new THREE.MeshBasicMaterial({
      color: 0x00ffaa,
      transparent: true,
      opacity: 0.7,
    });
    this.bioMesh = new THREE.InstancedMesh(bioGeo, bioMat, SkySystem.BIO_MAX);
    this.bioMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bioMesh.count = 0;
    this.bioMesh.frustumCulled = false;
    scene.add(this.bioMesh);
  }

  // ---------------------------------------------------------------
  //  Update -- call every frame
  // ---------------------------------------------------------------

  update(dt: number, time: number, sunDirection: THREE.Vector3, weatherState: string): void {
    // Stars
    this.starMaterial.uniforms.uTime.value = time;

    // Celestials
    this.updateCelestials(sunDirection, weatherState);

    // Lightning bolts -- remove expired
    for (let i = this.lightningBolts.length - 1; i >= 0; i--) {
      const bolt = this.lightningBolts[i];
      bolt.timer += dt;
      if (bolt.timer >= 0.05) {
        this.scene.remove(bolt.mesh);
        bolt.mesh.geometry.dispose();
        (bolt.mesh.material as THREE.Material).dispose();
        this.lightningBolts.splice(i, 1);
      }
    }

    // Bio wake particles
    this.updateBioWake(dt);
  }

  // ---------------------------------------------------------------
  //  Celestials
  // ---------------------------------------------------------------

  updateCelestials(sunDirection: THREE.Vector3, weatherState: string): void {
    const celestialDist = 350;

    if (weatherState === 'night') {
      // Show moon, hide sun
      this.sunSprite.visible = false;
      this.sunGlow.visible = false;
      this.moonSprite.visible = true;
      this.moonGlow.visible = true;

      const moonPos = sunDirection.clone().multiplyScalar(celestialDist);
      this.moonSprite.position.copy(moonPos);
      this.moonGlow.position.copy(moonPos);
    } else {
      // Show sun, hide moon
      this.sunSprite.visible = true;
      this.sunGlow.visible = true;
      this.moonSprite.visible = false;
      this.moonGlow.visible = false;

      const sunPos = sunDirection.clone().multiplyScalar(celestialDist);
      this.sunSprite.position.copy(sunPos);
      this.sunGlow.position.copy(sunPos);
    }
  }

  // ---------------------------------------------------------------
  //  Lightning
  // ---------------------------------------------------------------

  triggerLightning(playerPos?: THREE.Vector3): void {
    const segments = 8;
    const points: number[] = [];

    // Random starting position in the sky, offset to player position
    const ox = playerPos ? playerPos.x : 0;
    const oz = playerPos ? playerPos.z : 0;
    const baseX = ox + (Math.random() - 0.5) * 40;
    const baseZ = oz + (Math.random() - 0.5) * 40;
    let cx = baseX;
    let cz = baseZ;

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const y = 35 * (1 - t); // from y=35 to y=0

      if (i > 0 && i < segments) {
        cx += (Math.random() - 0.5) * 6; // +/-3 jitter
        cz += (Math.random() - 0.5) * 6;
      }

      points.push(cx, y, cz);

      // Add connecting segment (pairs of points for LineSegments)
      if (i < segments) {
        // Next point will be pushed in the next iteration;
        // LineSegments needs pairs, so we duplicate the end of each segment
        // as the start of the next
      }
    }

    // Convert to pairs for LineSegments (each segment = 2 vertices)
    const pairPositions: number[] = [];
    for (let i = 0; i < segments; i++) {
      // Start of segment
      pairPositions.push(points[i * 3], points[i * 3 + 1], points[i * 3 + 2]);
      // End of segment
      pairPositions.push(points[(i + 1) * 3], points[(i + 1) * 3 + 1], points[(i + 1) * 3 + 2]);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pairPositions, 3));

    const mat = new THREE.LineBasicMaterial({ color: 0xffffff });
    const bolt = new THREE.LineSegments(geo, mat);
    this.scene.add(bolt);

    this.lightningBolts.push({ mesh: bolt, timer: 0 });
  }

  // ---------------------------------------------------------------
  //  Bioluminescent wake
  // ---------------------------------------------------------------

  spawnBioWake(pos: THREE.Vector3, speed: number, dt: number): void {
    if (!this.active) return;

    this.bioSpawnTimer += dt;
    const interval = Math.max(0.02, 0.12 - speed * 0.008);
    if (this.bioSpawnTimer < interval || speed < 1.0) return;
    this.bioSpawnTimer = 0;

    const count = speed > 8 ? 3 : 2;
    for (let i = 0; i < count; i++) {
      if (this.bioParticles.length >= SkySystem.BIO_MAX) break;
      this.bioParticles.push({
        pos: pos.clone().add(new THREE.Vector3(
          (Math.random() - 0.5) * 1.5,
          0.05,
          (Math.random() - 0.5) * 1.5,
        )),
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 0.3,
          (Math.random() - 0.5) * 0.05,
          (Math.random() - 0.5) * 0.3,
        ),
        life: 1.2,
      });
    }
  }

  private updateBioWake(dt: number): void {
    let alive = 0;
    for (let i = this.bioParticles.length - 1; i >= 0; i--) {
      const p = this.bioParticles[i];
      p.pos.addScaledVector(p.vel, dt);
      p.life -= dt;
      if (p.life <= 0) {
        this.bioParticles.splice(i, 1);
        continue;
      }
      const t = p.life / 1.2; // 1 -> 0 over lifetime
      this.bioDummy.position.copy(p.pos);
      this.bioDummy.scale.setScalar(t);
      this.bioDummy.updateMatrix();
      if (alive < SkySystem.BIO_MAX) {
        this.bioMesh.setMatrixAt(alive, this.bioDummy.matrix);
        alive++;
      }
    }
    this.bioMesh.count = alive;
    if (alive > 0) this.bioMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------
  //  Public setters
  // ---------------------------------------------------------------

  setStarVisibility(v: number): void {
    this.starMaterial.uniforms.uStarVisibility.value = v;
  }

  setBioWakeActive(active: boolean): void {
    this.active = active;
  }
}
