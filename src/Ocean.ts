import * as THREE from 'three';

const vertexShader = /* glsl */ `
  uniform float uTime;
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
    vec3 pos = position;

    pos += gerstnerWave(pos.xz, 0.25, 13.0, vec2(1.0, 0.5), uTime * 0.8);
    pos += gerstnerWave(pos.xz, 0.15, 7.5, vec2(-0.3, 1.0), uTime * 1.05);
    pos += gerstnerWave(pos.xz, 0.10, 4.5, vec2(0.7, -0.4), uTime * 0.9);
    pos += gerstnerWave(pos.xz, 0.06, 2.5, vec2(-0.5, -0.8), uTime * 1.3);

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
  varying vec3 vWorldPos;
  varying float vElevation;
  varying float vFogDepth;

  void main() {
    // Flat-shading normal via screen-space derivatives
    vec3 normal = normalize(cross(dFdx(vWorldPos), dFdy(vWorldPos)));

    // Ocean colour gradient based on wave height
    vec3 deep    = vec3(0.01, 0.06, 0.20);
    vec3 mid     = vec3(0.04, 0.22, 0.36);
    vec3 shallow = vec3(0.08, 0.50, 0.55);

    float t = smoothstep(-1.2, 2.0, vElevation);
    vec3 color = mix(deep, mid, smoothstep(0.0, 0.4, t));
    color = mix(color, shallow, smoothstep(0.4, 0.85, t));

    // Foam on wave crests
    vec3 foam = vec3(0.82, 0.90, 0.95);
    float foamAmt = smoothstep(0.65, 1.0, vElevation) * 0.65;
    color = mix(color, foam, foamAmt);

    // Diffuse lighting
    float diff = max(dot(normal, uSunDir), 0.0) * 0.55 + 0.45;
    color *= diff;

    // Specular highlight
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    vec3 halfDir = normalize(uSunDir + viewDir);
    float spec = pow(max(dot(normal, halfDir), 0.0), 200.0);
    color += vec3(1.0, 0.92, 0.80) * spec * 0.9;

    // Subsurface / Fresnel rim
    float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 4.0);
    color = mix(color, vec3(0.15, 0.55, 0.75), fresnel * 0.2);

    // Fog
    float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
    color = mix(color, uFogColor, clamp(fogFactor, 0.0, 1.0));

    gl_FragColor = vec4(color, 1.0);
  }
`;

// Wave params must match the vertex shader exactly
const WAVES = [
  { s: 0.25, w: 13.0, d: [1.0, 0.5], tm: 0.8 },
  { s: 0.15, w: 7.5, d: [-0.3, 1.0], tm: 1.05 },
  { s: 0.10, w: 4.5, d: [0.7, -0.4], tm: 0.9 },
  { s: 0.06, w: 2.5, d: [-0.5, -0.8], tm: 1.3 },
];

export class Ocean {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;

  constructor(fogColor: THREE.Color, fogDensity: number) {
    const geo = new THREE.PlaneGeometry(400, 400, 128, 128);
    geo.rotateX(-Math.PI / 2);
    const nonIndexed = geo.toNonIndexed();

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSunDir: { value: new THREE.Vector3(0.4, 0.6, 0.3).normalize() },
        uFogColor: { value: fogColor },
        uFogDensity: { value: fogDensity },
      },
      vertexShader,
      fragmentShader,
    });

    this.mesh = new THREE.Mesh(nonIndexed, this.material);
  }

  update(time: number, playerPos: THREE.Vector3) {
    this.material.uniforms.uTime.value = time;
    // Keep ocean centered on the player (snapped to avoid shimmer)
    this.mesh.position.x = Math.round(playerPos.x / 4) * 4;
    this.mesh.position.z = Math.round(playerPos.z / 4) * 4;
  }

  /** CPU-side wave height for a world position. Must mirror the vertex shader. */
  getWaveHeight(x: number, z: number, time: number): number {
    let y = 0;
    for (const w of WAVES) {
      const k = 6.28318 / w.w;
      const c = Math.sqrt(9.8 / k);
      const len = Math.sqrt(w.d[0] ** 2 + w.d[1] ** 2);
      const dx = w.d[0] / len;
      const dz = w.d[1] / len;
      const f = k * (dx * x + dz * z - c * time * w.tm);
      y += (w.s / k) * Math.sin(f);
    }
    return y;
  }
}
