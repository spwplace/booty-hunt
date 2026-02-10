// ===================================================================
//  Ghost Replay — Render a translucent ghost ship from a ghost tape
//  Decodes tape, interpolates position/heading between 4Hz frames
// ===================================================================

import * as THREE from 'three';
import type { GhostFrame, GhostTapeHeader } from './GhostTape';
import { createShipMesh } from './Ship';

const GHOST_OPACITY = 0.35;
const GHOST_COLOR = 0x88aacc;

export class GhostReplaySystem {
  private frames: GhostFrame[] = [];
  private header: GhostTapeHeader | null = null;
  private mesh: THREE.Group | null = null;
  private scene: THREE.Scene | null = null;
  private elapsed = 0;
  private active = false;

  /** Load decoded ghost tape data */
  load(header: GhostTapeHeader, frames: GhostFrame[]): void {
    this.header = header;
    this.frames = frames;
  }

  /** Add ghost ship to the scene and start playback */
  start(scene: THREE.Scene): void {
    if (this.frames.length === 0 || !this.header) return;
    this.scene = scene;
    this.elapsed = 0;
    this.active = true;

    if (!this.mesh) {
      this.mesh = createShipMesh(GHOST_COLOR, GHOST_COLOR, 0.7);
      // Make all materials translucent
      this.mesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const mat = child.material as THREE.MeshToonMaterial;
          const ghostMat = mat.clone();
          ghostMat.transparent = true;
          ghostMat.opacity = GHOST_OPACITY;
          ghostMat.depthWrite = false;
          child.material = ghostMat;
        }
      });
    }

    scene.add(this.mesh);
  }

  /** Update ghost ship position based on elapsed time */
  update(dt: number): void {
    if (!this.active || !this.mesh || !this.header || this.frames.length === 0) return;

    this.elapsed += dt;

    const sampleInterval = 1 / this.header.sampleHz;
    const frameTime = this.elapsed / sampleInterval;
    const frameIndex = Math.floor(frameTime);

    if (frameIndex >= this.frames.length - 1) {
      // Replay finished
      this.stop();
      return;
    }

    const f0 = this.frames[frameIndex];
    const f1 = this.frames[frameIndex + 1];
    const t = frameTime - frameIndex; // 0-1 interpolation factor

    // Lerp position
    const x = f0.x + (f1.x - f0.x) * t;
    const z = f0.z + (f1.z - f0.z) * t;
    this.mesh.position.set(x, 0, z);

    // Slerp heading (handling wrap-around)
    let dHeading = f1.heading - f0.heading;
    if (dHeading > Math.PI) dHeading -= Math.PI * 2;
    if (dHeading < -Math.PI) dHeading += Math.PI * 2;
    this.mesh.rotation.y = f0.heading + dHeading * t;
  }

  /** Stop playback and remove from scene */
  stop(): void {
    this.active = false;
    if (this.mesh && this.scene) {
      this.scene.remove(this.mesh);
    }
  }

  /** Full cleanup — dispose materials and geometry */
  dispose(): void {
    this.stop();
    if (this.mesh) {
      this.mesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose();
          if (child.material instanceof THREE.Material) {
            child.material.dispose();
          }
        }
      });
      this.mesh = null;
    }
    this.frames = [];
    this.header = null;
    this.scene = null;
  }

  isActive(): boolean {
    return this.active;
  }

  /** Get current frame info for HUD display */
  getCurrentFrameInfo(): { wave: number; hpPct: number; speed: number } | null {
    if (!this.active || !this.header || this.frames.length === 0) return null;

    const sampleInterval = 1 / this.header.sampleHz;
    const frameIndex = Math.min(
      Math.floor(this.elapsed / sampleInterval),
      this.frames.length - 1,
    );
    const frame = this.frames[frameIndex];
    return {
      wave: frame.wave,
      hpPct: frame.hpPct,
      speed: frame.speed,
    };
  }
}
