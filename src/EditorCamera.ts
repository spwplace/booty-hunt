import * as THREE from 'three';

// ===================================================================
//  WASD Fly-Cam for Scenario Editor
// ===================================================================

const MOVE_SPEED = 40;
const SHIFT_SPEED = 20; // vertical speed
const MOUSE_SENSITIVITY = 0.003;
const SCROLL_SPEED = 8;
const MIN_Y = 2.0;
const MAX_PITCH = (89 * Math.PI) / 180;
const FOCUS_DISTANCE = 30;

export class EditorCamera {
  private yaw = 0;
  private pitch = -0.4; // slight downward look
  private position = new THREE.Vector3(0, 25, 50);

  private keys = new Set<string>();
  private rightDown = false;
  private enabled = false;

  private focusTarget: THREE.Vector3 | null = null;
  private focusLerp = 0;
  private focusFrom = new THREE.Vector3();

  // Bound handlers for cleanup
  private onKeyDown: (e: KeyboardEvent) => void;
  private onKeyUp: (e: KeyboardEvent) => void;
  private onMouseDown: (e: MouseEvent) => void;
  private onMouseUp: (e: MouseEvent) => void;
  private onMouseMove: (e: MouseEvent) => void;
  private onWheel: (e: WheelEvent) => void;
  private onContextMenu: (e: Event) => void;

  constructor() {
    this.onKeyDown = (e) => this.handleKeyDown(e);
    this.onKeyUp = (e) => this.handleKeyUp(e);
    this.onMouseDown = (e) => this.handleMouseDown(e);
    this.onMouseUp = (e) => this.handleMouseUp(e);
    this.onMouseMove = (e) => this.handleMouseMove(e);
    this.onWheel = (e) => this.handleWheel(e);
    this.onContextMenu = (e) => e.preventDefault();
  }

  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    this.keys.clear();
    this.rightDown = false;

    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('mousedown', this.onMouseDown);
    document.addEventListener('mouseup', this.onMouseUp);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('wheel', this.onWheel, { passive: false });
    document.addEventListener('contextmenu', this.onContextMenu);
  }

  disable(): void {
    if (!this.enabled) return;
    this.enabled = false;
    this.keys.clear();
    this.rightDown = false;

    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('mousedown', this.onMouseDown);
    document.removeEventListener('mouseup', this.onMouseUp);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('wheel', this.onWheel);
    document.removeEventListener('contextmenu', this.onContextMenu);
  }

  focusOn(target: THREE.Vector3, distance: number = FOCUS_DISTANCE): void {
    this.focusFrom.copy(this.position);
    // Place camera at distance along current view direction reversed
    const dir = new THREE.Vector3(0, 0, -1)
      .applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'))
      .negate()
      .multiplyScalar(distance);
    this.focusTarget = target.clone().add(dir);
    // Ensure min Y
    if (this.focusTarget.y < MIN_Y) this.focusTarget.y = MIN_Y;
    this.focusLerp = 0;
  }

  update(dt: number, camera: THREE.PerspectiveCamera): void {
    if (!this.enabled) return;

    // Animated focus transition
    if (this.focusTarget) {
      this.focusLerp += dt * 3;
      if (this.focusLerp >= 1) {
        this.position.copy(this.focusTarget);
        this.focusTarget = null;
      } else {
        this.position.lerpVectors(this.focusFrom, this.focusTarget, this.focusLerp);
      }
    } else {
      // WASD movement
      const forward = new THREE.Vector3(
        -Math.sin(this.yaw),
        0,
        -Math.cos(this.yaw),
      );
      const right = new THREE.Vector3(
        Math.cos(this.yaw),
        0,
        -Math.sin(this.yaw),
      );

      const speed = MOVE_SPEED * dt;
      if (this.keys.has('w')) this.position.addScaledVector(forward, speed);
      if (this.keys.has('s')) this.position.addScaledVector(forward, -speed);
      if (this.keys.has('a')) this.position.addScaledVector(right, -speed);
      if (this.keys.has('d')) this.position.addScaledVector(right, speed);

      // Shift+W/S for vertical
      const vSpeed = SHIFT_SPEED * dt;
      if (this.keys.has('shift_w')) this.position.y += vSpeed;
      if (this.keys.has('shift_s')) this.position.y -= vSpeed;
    }

    // Clamp Y
    if (this.position.y < MIN_Y) this.position.y = MIN_Y;

    // Apply to camera
    camera.position.copy(this.position);
    const euler = new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ');
    camera.quaternion.setFromEuler(euler);
  }

  getPosition(): THREE.Vector3 {
    return this.position.clone();
  }

  // ---------------------------------------------------------------
  //  Input handlers
  // ---------------------------------------------------------------

  private handleKeyDown(e: KeyboardEvent): void {
    // Don't capture if typing in an input
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;

    const key = e.key.toLowerCase();

    if (key === 'f') {
      // F key handled externally by ScenarioEditor
      e.stopPropagation();
      return;
    }

    if (['w', 'a', 's', 'd'].includes(key)) {
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey && (key === 'w' || key === 's')) {
        this.keys.add('shift_' + key);
      } else {
        this.keys.delete('shift_' + key); // clear shift variant
        this.keys.add(key);
      }
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    const key = e.key.toLowerCase();
    if (['w', 'a', 's', 'd'].includes(key)) {
      this.keys.delete(key);
      this.keys.delete('shift_' + key);
    }
  }

  private handleMouseDown(e: MouseEvent): void {
    if (e.button === 2) {
      this.rightDown = true;
    }
  }

  private handleMouseUp(e: MouseEvent): void {
    if (e.button === 2) {
      this.rightDown = false;
    }
  }

  private handleMouseMove(e: MouseEvent): void {
    if (!this.rightDown) return;

    this.yaw -= e.movementX * MOUSE_SENSITIVITY;
    this.pitch -= e.movementY * MOUSE_SENSITIVITY;
    this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch));
  }

  private handleWheel(e: WheelEvent): void {
    e.preventDefault();
    // Dolly forward/backward along view direction
    const dir = new THREE.Vector3(0, 0, -1)
      .applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    const amount = -Math.sign(e.deltaY) * SCROLL_SPEED;
    this.position.addScaledVector(dir, amount);
    if (this.position.y < MIN_Y) this.position.y = MIN_Y;
  }
}
