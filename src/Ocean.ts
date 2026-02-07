import * as THREE from 'three';

const MAX_REEFS = 16;

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uWaveScale;
  varying vec3 vWorldPos;
  varying float vElevation;
  varying float vFogDepth;

  vec3 gerstnerWave(vec2 pos, float steepness, float wavelength, vec2 dir, float time) {
    float k = 6.28318 / wavelength;
    float c = sqrt(9.8 / k);
    vec2 d = normalize(dir);
    float f = k * (dot(d, pos) - c * time);
    float a = steepness / k;
    return vec3(d.x * a * cos(f), a * sin(f), d.y * a * cos(f));
  }

  void main() {
    vec3 worldBase = (modelMatrix * vec4(position, 1.0)).xyz;
    vec2 b = worldBase.xz;

    vec3 disp = vec3(0.0);

    // Long ocean swells — big gentle rolling hills
    disp += gerstnerWave(b, 0.06, 38.0, vec2( 1.0,  0.2), uTime * 0.6);
    disp += gerstnerWave(b, 0.07, 24.0, vec2(-0.3,  0.9), uTime * 0.7);

    // Primary waves — the main visible crests
    disp += gerstnerWave(b, 0.20, 12.5, vec2( 0.6,  0.8), uTime * 0.85);
    disp += gerstnerWave(b, 0.16,  8.5, vec2(-0.8, -0.4), uTime * 1.0);

    // Chop — shorter, faster, cross-directional
    disp += gerstnerWave(b, 0.13,  5.2, vec2( 0.2, -1.0), uTime * 1.1);
    disp += gerstnerWave(b, 0.11,  3.8, vec2(-0.9,  0.3), uTime * 1.0);

    // Ripples — fine detail
    disp += gerstnerWave(b, 0.09,  2.3, vec2( 0.7,  0.7), uTime * 1.3);
    disp += gerstnerWave(b, 0.07,  1.6, vec2(-0.5, -0.8), uTime * 1.5);

    disp *= uWaveScale;

    vec3 pos = position + disp;
    vElevation = pos.y;
    vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;

    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    vFogDepth = length(mvPos.xyz);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uSunDir;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  uniform vec4 uReefPositions[${MAX_REEFS}];
  uniform int uReefCount;
  varying vec3 vWorldPos;
  varying float vElevation;
  varying float vFogDepth;

  // ---- Noise ----
  float hash21(vec2 p) {
    p = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
  }

  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * vnoise(p);
      p *= 2.1;
      a *= 0.45;
    }
    return v;
  }

  // ---- Reef foam calculation ----
  float reefFoam(vec2 worldXZ) {
    float totalFoam = 0.0;
    for (int i = 0; i < ${MAX_REEFS}; i++) {
      if (i >= uReefCount) break;
      vec4 reef = uReefPositions[i];
      vec2 reefCenter = reef.xz;
      float reefRadius = reef.w;

      vec2 delta = worldXZ - reefCenter;
      float dist = length(delta);

      // Foam ring near the reef radius edge (outer ring of breaking waves)
      float ringDist = abs(dist - reefRadius);
      float ringFoam = smoothstep(3.0, 0.0, ringDist);

      // Inner reef shallows foam (sparser, within the reef)
      float innerFoam = smoothstep(reefRadius, reefRadius * 0.4, dist) * 0.4;

      // Animated foam noise for natural look
      vec2 foamUV = worldXZ * 0.35 + uTime * vec2(0.08, 0.06);
      float noise1 = fbm(foamUV);
      float noise2 = fbm(worldXZ * 0.5 - uTime * vec2(0.05, 0.1));

      // Combine: outer ring is strong breaking waves, inner is gentle
      float foam = ringFoam * smoothstep(0.3, 0.6, noise1);
      foam += innerFoam * smoothstep(0.4, 0.7, noise2);

      // Animated shimmer on the ring
      float shimmer = sin(dist * 2.5 - uTime * 2.0) * 0.5 + 0.5;
      foam *= 0.7 + shimmer * 0.3;

      totalFoam = max(totalFoam, foam);
    }
    return clamp(totalFoam, 0.0, 1.0);
  }

  void main() {
    // ---- Normals ----
    vec3 flatN = normalize(cross(dFdx(vWorldPos), dFdy(vWorldPos)));

    // Detail normal perturbation for specular shimmer only
    vec2 nUV1 = vWorldPos.xz * 0.6 + uTime * vec2(0.18, 0.12);
    vec2 nUV2 = vWorldPos.xz * 1.1 + uTime * vec2(-0.12, 0.22);
    float eps = 0.04;
    float nx = (vnoise(nUV1 + vec2(eps, 0.0)) - vnoise(nUV1 - vec2(eps, 0.0)))
             + (vnoise(nUV2 + vec2(eps, 0.0)) - vnoise(nUV2 - vec2(eps, 0.0))) * 0.6;
    float nz = (vnoise(nUV1 + vec2(0.0, eps)) - vnoise(nUV1 - vec2(0.0, eps)))
             + (vnoise(nUV2 + vec2(0.0, eps)) - vnoise(nUV2 - vec2(0.0, eps))) * 0.6;
    vec3 detailN = normalize(flatN + vec3(nx * 0.35, 0.0, nz * 0.35));

    // ---- Setup ----
    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 L = uSunDir;
    float NdotL = max(dot(flatN, L), 0.0);
    float NdotV = max(dot(flatN, V), 0.0);

    // ---- Base colour ----
    vec3 deep    = vec3(0.005, 0.035, 0.14);
    vec3 mid     = vec3(0.015, 0.13, 0.28);
    vec3 shallow = vec3(0.04, 0.38, 0.44);
    vec3 bright  = vec3(0.10, 0.52, 0.50);

    float depthT = smoothstep(-1.5, 2.5, vElevation);
    vec3 color = mix(deep, mid, smoothstep(0.0, 0.35, depthT));
    color = mix(color, shallow, smoothstep(0.35, 0.7, depthT));
    color = mix(color, bright, smoothstep(0.75, 1.0, depthT));

    // ---- Subsurface scattering ----
    vec3 sssDir = normalize(-L + flatN * 0.4);
    float sss = pow(clamp(dot(V, sssDir), 0.0, 1.0), 3.0);
    sss *= smoothstep(0.2, 1.0, vElevation);
    color += vec3(0.06, 0.30, 0.25) * sss * 0.9;

    // ---- Diffuse (half-lambert) ----
    float diff = NdotL * 0.5 + 0.5;
    color *= diff;

    // ---- Foam ----
    vec2 foamUV = vWorldPos.xz * 0.25 + uTime * 0.1;
    float foamNoise = fbm(foamUV);
    float foamMask = smoothstep(0.5, 1.1, vElevation);
    foamMask *= smoothstep(0.35, 0.65, foamNoise);
    float foamEdge = smoothstep(0.3, 0.55, vElevation) * smoothstep(0.7, 0.45, vElevation);
    foamEdge *= smoothstep(0.5, 0.7, fbm(vWorldPos.xz * 0.4 - uTime * 0.06));
    foamMask = max(foamMask, foamEdge * 0.4);
    vec3 foam = vec3(0.82, 0.90, 0.95);
    color = mix(color, foam, foamMask * 0.7);

    // ---- Reef foam overlay ----
    if (uReefCount > 0) {
      float rFoam = reefFoam(vWorldPos.xz);
      vec3 reefFoamColor = vec3(0.88, 0.94, 0.98);
      color = mix(color, reefFoamColor, rFoam * 0.75);
    }

    // ---- Specular: sun streak ----
    vec3 H = normalize(L + V);
    float dNdotH = max(dot(detailN, H), 0.0);
    float specTight = pow(dNdotH, 350.0);
    float specWide  = pow(dNdotH, 24.0);
    color += vec3(1.0, 0.88, 0.65) * specTight * 1.5;
    color += vec3(0.9, 0.65, 0.35) * specWide * 0.12;

    // ---- Sun glitter ----
    vec2 glitterCell = floor(vWorldPos.xz * 1.8 + uTime * 0.3);
    float glitterRand = hash21(glitterCell);
    float glitterMask = step(0.92, glitterRand);
    float glitterSpec = pow(dNdotH, 12.0);
    color += vec3(1.0, 0.95, 0.8) * glitterMask * glitterSpec * 2.5;

    // ---- Fresnel / sky reflection ----
    float fresnel = pow(1.0 - NdotV, 5.0);
    vec3 skyReflect = mix(vec3(0.10, 0.06, 0.16), vec3(0.35, 0.18, 0.10), fresnel);
    color = mix(color, skyReflect, fresnel * 0.35);

    // ---- Fog ----
    float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
    color = mix(color, uFogColor, clamp(fogFactor, 0.0, 1.0));

    gl_FragColor = vec4(color, 1.0);
  }
`;

// Must exactly match the vertex shader
const WAVES = [
  // Long swells
  { s: 0.06, w: 38.0, d: [1.0, 0.2],   tm: 0.6 },
  { s: 0.07, w: 24.0, d: [-0.3, 0.9],  tm: 0.7 },
  // Primary waves
  { s: 0.20, w: 12.5, d: [0.6, 0.8],   tm: 0.85 },
  { s: 0.16, w: 8.5,  d: [-0.8, -0.4], tm: 1.0 },
  // Chop
  { s: 0.13, w: 5.2,  d: [0.2, -1.0],  tm: 1.1 },
  { s: 0.11, w: 3.8,  d: [-0.9, 0.3],  tm: 1.0 },
  // Ripples
  { s: 0.09, w: 2.3,  d: [0.7, 0.7],   tm: 1.3 },
  { s: 0.07, w: 1.6,  d: [-0.5, -0.8], tm: 1.5 },
];

export interface WaveInfo {
  height: number;
  slopeX: number;
  slopeZ: number;
}

export class Ocean {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;

  constructor(fogColor: THREE.Color, fogDensity: number) {
    const isMobile = navigator.maxTouchPoints > 0 || 'ontouchstart' in globalThis;
    const segments = isMobile ? 100 : 180;
    const geo = new THREE.PlaneGeometry(300, 300, segments, segments);
    geo.rotateX(-Math.PI / 2);
    const nonIndexed = geo.toNonIndexed();

    // Initialize reef uniform arrays
    const reefPositions: THREE.Vector4[] = [];
    for (let i = 0; i < MAX_REEFS; i++) {
      reefPositions.push(new THREE.Vector4(0, 0, 0, 0));
    }

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSunDir: { value: new THREE.Vector3(0.4, 0.6, 0.3).normalize() },
        uFogColor: { value: fogColor },
        uFogDensity: { value: fogDensity },
        uWaveScale: { value: 1.0 },
        uReefPositions: { value: reefPositions },
        uReefCount: { value: 0 },
      },
      vertexShader,
      fragmentShader,
    });

    this.mesh = new THREE.Mesh(nonIndexed, this.material);
  }

  update(time: number, playerPos: THREE.Vector3) {
    this.material.uniforms.uTime.value = time;
    this.mesh.position.x = Math.round(playerPos.x / 4) * 4;
    this.mesh.position.z = Math.round(playerPos.z / 4) * 4;
  }

  setFogColor(color: THREE.Color) {
    this.material.uniforms.uFogColor.value = color;
  }

  setFogDensity(density: number) {
    this.material.uniforms.uFogDensity.value = density;
  }

  setSunDirection(dir: THREE.Vector3) {
    this.material.uniforms.uSunDir.value = dir;
  }

  setWaveScale(scale: number) {
    this.material.uniforms.uWaveScale.value = scale;
  }

  /** Update reef positions for the foam shader effect. */
  setReefPositions(positions: { x: number; z: number; radius: number }[]): void {
    const reefs = this.material.uniforms.uReefPositions.value as THREE.Vector4[];
    const count = Math.min(positions.length, MAX_REEFS);

    for (let i = 0; i < MAX_REEFS; i++) {
      if (i < count) {
        const p = positions[i];
        reefs[i].set(p.x, 0, p.z, p.radius);
      } else {
        reefs[i].set(0, 0, 0, 0);
      }
    }

    this.material.uniforms.uReefCount.value = count;
  }

  /** Wave height + surface slope at a world-space coordinate. */
  getWaveInfo(x: number, z: number, time: number, waveScale: number = 1.0): WaveInfo {
    let height = 0;
    let slopeX = 0;
    let slopeZ = 0;
    for (const w of WAVES) {
      const k = 6.28318 / w.w;
      const c = Math.sqrt(9.8 / k);
      const len = Math.sqrt(w.d[0] ** 2 + w.d[1] ** 2);
      const dx = w.d[0] / len;
      const dz = w.d[1] / len;
      const f = k * (dx * x + dz * z - c * time * w.tm);
      const a = w.s / k;
      height += a * Math.sin(f);
      const dcos = a * k * Math.cos(f);
      slopeX += dcos * dx;
      slopeZ += dcos * dz;
    }
    return {
      height: height * waveScale,
      slopeX: slopeX * waveScale,
      slopeZ: slopeZ * waveScale,
    };
  }
}
