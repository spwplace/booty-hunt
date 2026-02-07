import * as THREE from 'three';
import type { Island, IslandType } from './Types';
import type { Scenario, ScenarioIsland } from './Scenario';
import { ISLAND_TYPE_CONFIGS, ISLAND_BASE_Y, buildIslandMesh } from './World';
import type { WorldSystem } from './World';
import type { Ocean } from './Ocean';

// ===================================================================
//  Editor Tool Types
// ===================================================================

export type EditorTool = 'select' | 'place' | 'move' | 'resize' | 'delete';

// ===================================================================
//  Undo/Redo
// ===================================================================

interface UndoState {
  islands: ScenarioIsland[];
}

function cloneIslands(islands: ScenarioIsland[]): ScenarioIsland[] {
  return islands.map(i => ({ ...i }));
}

// ===================================================================
//  ScenarioEditor
// ===================================================================

const HANDLE_RADIUS = 0.6;
const SELECTION_RING_Y = 0.2;

export class ScenarioEditor {
  private scenario: Scenario | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private world: WorldSystem | null = null;
  private ocean: Ocean | null = null;

  private tool: EditorTool = 'select';
  private selectedIndex = -1;

  // Ghost mesh for placement preview
  private ghostMesh: THREE.Group | null = null;
  private ghostType: IslandType = 'rocky';
  private placeType: IslandType = 'rocky';

  // Selection visuals
  private selectionRing: THREE.Mesh | null = null;
  private resizeHandles: THREE.Mesh[] = [];

  // Drag state
  private isDragging = false;
  private dragStart = new THREE.Vector2();
  private dragIslandStart = new THREE.Vector2();

  // Resize state
  private isResizing = false;
  private resizeHandleIndex = -1;
  private resizeStartRadius = 0;
  private resizeStartDist = 0;

  // Raycaster
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -ISLAND_BASE_Y);
  private mouse = new THREE.Vector2();

  // Undo/Redo
  private undoStack: UndoState[] = [];
  private redoStack: UndoState[] = [];

  // Mouse handlers
  private onMouseDown: (e: MouseEvent) => void;
  private onMouseMove: (e: MouseEvent) => void;
  private onMouseUp: (e: MouseEvent) => void;
  private active = false;

  // Callbacks for external notifications
  onSelectionChanged: ((index: number) => void) | null = null;
  onIslandsChanged: (() => void) | null = null;

  constructor() {
    this.onMouseDown = (e) => this.handleMouseDown(e);
    this.onMouseMove = (e) => this.handleMouseMove(e);
    this.onMouseUp = (e) => this.handleMouseUp(e);
  }

  // ---------------------------------------------------------------
  //  Lifecycle
  // ---------------------------------------------------------------

  enter(
    scenario: Scenario,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    world: WorldSystem,
    ocean: Ocean,
  ): void {
    this.scenario = scenario;
    this.scene = scene;
    this.camera = camera;
    this.world = world;
    this.ocean = ocean;
    this.active = true;

    this.selectedIndex = -1;
    this.undoStack = [];
    this.redoStack = [];
    this.tool = 'select';

    this.syncIslandsToWorld();

    document.addEventListener('mousedown', this.onMouseDown);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mouseup', this.onMouseUp);
  }

  exit(): void {
    this.active = false;
    this.clearSelectionVisuals();
    this.clearGhostMesh();

    document.removeEventListener('mousedown', this.onMouseDown);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseup', this.onMouseUp);

    this.scenario = null;
    this.scene = null;
    this.camera = null;
    this.world = null;
    this.ocean = null;
  }

  // ---------------------------------------------------------------
  //  Tool control
  // ---------------------------------------------------------------

  setTool(tool: EditorTool): void {
    this.tool = tool;
    if (tool !== 'select' && tool !== 'move' && tool !== 'resize') {
      this.setSelection(-1);
    }
    if (tool === 'place') {
      this.updateGhostMesh();
    } else {
      this.clearGhostMesh();
    }
  }

  getTool(): EditorTool { return this.tool; }

  setPlaceType(type: IslandType): void {
    this.placeType = type;
    if (this.tool === 'place') {
      this.updateGhostMesh();
    }
  }

  getPlaceType(): IslandType { return this.placeType; }

  // ---------------------------------------------------------------
  //  Selection
  // ---------------------------------------------------------------

  getSelectedIndex(): number { return this.selectedIndex; }

  getSelectedIsland(): ScenarioIsland | null {
    if (!this.scenario || this.selectedIndex < 0) return null;
    return this.scenario.islands[this.selectedIndex] ?? null;
  }

  setSelection(index: number): void {
    this.selectedIndex = index;
    this.updateSelectionVisuals();
    this.onSelectionChanged?.(index);
  }

  // ---------------------------------------------------------------
  //  Island CRUD
  // ---------------------------------------------------------------

  addIsland(type: IslandType, x: number, z: number): void {
    if (!this.scenario) return;
    this.pushUndo();

    const config = ISLAND_TYPE_CONFIGS[type];
    const radius = (config.minRadius + config.maxRadius) / 2;
    const island: ScenarioIsland = {
      type,
      x,
      z,
      radius,
      hasTreasure: false,
      seed: Math.floor(Math.random() * 0xFFFFFFFF),
    };
    this.scenario.islands.push(island);
    this.syncIslandsToWorld();
    this.setSelection(this.scenario.islands.length - 1);
    this.onIslandsChanged?.();
  }

  removeIsland(index: number): void {
    if (!this.scenario || index < 0 || index >= this.scenario.islands.length) return;
    this.pushUndo();
    this.scenario.islands.splice(index, 1);
    if (this.selectedIndex === index) this.setSelection(-1);
    else if (this.selectedIndex > index) this.selectedIndex--;
    this.syncIslandsToWorld();
    this.onIslandsChanged?.();
  }

  updateIslandProperty<K extends keyof ScenarioIsland>(
    index: number,
    key: K,
    value: ScenarioIsland[K],
  ): void {
    if (!this.scenario || index < 0 || index >= this.scenario.islands.length) return;
    this.pushUndo();
    this.scenario.islands[index][key] = value;

    // Clamp radius to type limits
    if (key === 'radius' || key === 'type') {
      const island = this.scenario.islands[index];
      const config = ISLAND_TYPE_CONFIGS[island.type];
      island.radius = Math.max(config.minRadius, Math.min(config.maxRadius, island.radius));
      // Regenerate seed on type change so mesh appearance updates
      if (key === 'type') {
        island.seed = Math.floor(Math.random() * 0xFFFFFFFF);
      }
    }

    this.syncIslandsToWorld();
    this.updateSelectionVisuals();
    this.onIslandsChanged?.();
  }

  // ---------------------------------------------------------------
  //  Undo / Redo
  // ---------------------------------------------------------------

  private pushUndo(): void {
    if (!this.scenario) return;
    this.undoStack.push({ islands: cloneIslands(this.scenario.islands) });
    this.redoStack = [];
    if (this.undoStack.length > 50) this.undoStack.shift();
  }

  undo(): void {
    if (!this.scenario || this.undoStack.length === 0) return;
    this.redoStack.push({ islands: cloneIslands(this.scenario.islands) });
    const state = this.undoStack.pop()!;
    this.scenario.islands = state.islands;
    this.selectedIndex = -1;
    this.syncIslandsToWorld();
    this.updateSelectionVisuals();
    this.onIslandsChanged?.();
  }

  redo(): void {
    if (!this.scenario || this.redoStack.length === 0) return;
    this.undoStack.push({ islands: cloneIslands(this.scenario.islands) });
    const state = this.redoStack.pop()!;
    this.scenario.islands = state.islands;
    this.selectedIndex = -1;
    this.syncIslandsToWorld();
    this.updateSelectionVisuals();
    this.onIslandsChanged?.();
  }

  // ---------------------------------------------------------------
  //  World sync
  // ---------------------------------------------------------------

  syncIslandsToWorld(): void {
    if (!this.scenario || !this.world || !this.ocean) return;

    const islands: Island[] = this.scenario.islands.map((si, _i) => {
      const config = ISLAND_TYPE_CONFIGS[si.type];
      return {
        type: si.type,
        name: `Island ${_i + 1}`,
        pos: new THREE.Vector3(si.x, ISLAND_BASE_Y, si.z),
        radius: si.radius,
        reefRadius: si.radius * config.reefMultiplier,
        hasTreasure: si.hasTreasure,
        treasureCollected: false,
        meshCreated: false,
        meshGroup: null,
        seed: si.seed,
      };
    });

    this.world.loadIslands(islands);
    this.world.forceCreateAllMeshes();
    this.ocean.setReefPositions(this.world.getReefData());
  }

  // ---------------------------------------------------------------
  //  Ghost mesh (placement preview)
  // ---------------------------------------------------------------

  private updateGhostMesh(): void {
    this.clearGhostMesh();
    if (!this.scene) return;

    const config = ISLAND_TYPE_CONFIGS[this.placeType];
    const radius = (config.minRadius + config.maxRadius) / 2;
    const dummyIsland: Island = {
      type: this.placeType,
      name: 'ghost',
      pos: new THREE.Vector3(0, ISLAND_BASE_Y, 0),
      radius,
      reefRadius: radius * config.reefMultiplier,
      hasTreasure: false,
      treasureCollected: false,
      meshCreated: false,
      meshGroup: null,
      seed: 12345,
    };

    this.ghostMesh = buildIslandMesh(dummyIsland);
    this.ghostType = this.placeType;

    // Make semi-transparent
    this.ghostMesh.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const mat = (child.material as THREE.Material).clone();
        if ('transparent' in mat) {
          (mat as THREE.MeshToonMaterial).transparent = true;
          (mat as THREE.MeshToonMaterial).opacity = 0.5;
        }
        child.material = mat;
      }
    });

    this.ghostMesh.visible = false;
    this.scene.add(this.ghostMesh);
  }

  private clearGhostMesh(): void {
    if (this.ghostMesh && this.scene) {
      this.scene.remove(this.ghostMesh);
      this.ghostMesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
    }
    this.ghostMesh = null;
  }

  // ---------------------------------------------------------------
  //  Selection visuals
  // ---------------------------------------------------------------

  private updateSelectionVisuals(): void {
    this.clearSelectionVisuals();
    if (!this.scene || !this.scenario || this.selectedIndex < 0) return;

    const island = this.scenario.islands[this.selectedIndex];
    if (!island) return;

    // Gold selection ring
    const ringGeo = new THREE.RingGeometry(island.radius - 0.3, island.radius + 0.3, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffd700,
      side: THREE.DoubleSide,
      depthTest: false,
      transparent: true,
      opacity: 0.6,
    });
    this.selectionRing = new THREE.Mesh(ringGeo, ringMat);
    this.selectionRing.rotation.x = -Math.PI / 2;
    this.selectionRing.position.set(island.x, ISLAND_BASE_Y + SELECTION_RING_Y, island.z);
    this.selectionRing.renderOrder = 999;
    this.scene.add(this.selectionRing);

    // 4 resize handles at N/S/E/W
    const handleGeo = new THREE.SphereGeometry(HANDLE_RADIUS, 8, 6);
    const handleMat = new THREE.MeshBasicMaterial({
      color: 0xff8800,
      depthTest: false,
    });

    const offsets = [
      [0, island.radius],   // N (z+)
      [0, -island.radius],  // S (z-)
      [island.radius, 0],   // E (x+)
      [-island.radius, 0],  // W (x-)
    ];

    for (const [dx, dz] of offsets) {
      const handle = new THREE.Mesh(handleGeo, handleMat.clone());
      handle.position.set(
        island.x + dx,
        ISLAND_BASE_Y + SELECTION_RING_Y,
        island.z + dz,
      );
      handle.renderOrder = 1000;
      this.scene.add(handle);
      this.resizeHandles.push(handle);
    }
  }

  private clearSelectionVisuals(): void {
    if (this.selectionRing && this.scene) {
      this.scene.remove(this.selectionRing);
      this.selectionRing.geometry.dispose();
      (this.selectionRing.material as THREE.Material).dispose();
      this.selectionRing = null;
    }
    for (const h of this.resizeHandles) {
      if (this.scene) this.scene.remove(h);
      h.geometry.dispose();
      (h.material as THREE.Material).dispose();
    }
    this.resizeHandles = [];
  }

  // ---------------------------------------------------------------
  //  Raycasting helpers
  // ---------------------------------------------------------------

  private updateMouse(e: MouseEvent): void {
    this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  }

  private raycastGround(): THREE.Vector3 | null {
    if (!this.camera) return null;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const target = new THREE.Vector3();
    const hit = this.raycaster.ray.intersectPlane(this.groundPlane, target);
    return hit ? target : null;
  }

  private findIslandAtMouse(): number {
    if (!this.scenario) return -1;
    const pt = this.raycastGround();
    if (!pt) return -1;

    for (let i = this.scenario.islands.length - 1; i >= 0; i--) {
      const isl = this.scenario.islands[i];
      const dx = pt.x - isl.x;
      const dz = pt.z - isl.z;
      if (Math.sqrt(dx * dx + dz * dz) < isl.radius) {
        return i;
      }
    }
    return -1;
  }

  private findHandleAtMouse(): number {
    if (!this.camera || this.resizeHandles.length === 0) return -1;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.resizeHandles);
    if (intersects.length > 0) {
      return this.resizeHandles.indexOf(intersects[0].object as THREE.Mesh);
    }
    return -1;
  }

  // ---------------------------------------------------------------
  //  Mouse input handlers
  // ---------------------------------------------------------------

  private handleMouseDown(e: MouseEvent): void {
    if (!this.active || !this.scenario || e.button !== 0) return;

    // Don't process clicks on UI elements
    if (e.target instanceof HTMLElement && e.target.closest('.editor-ui')) return;

    this.updateMouse(e);

    switch (this.tool) {
      case 'place': {
        const pt = this.raycastGround();
        if (pt) this.addIsland(this.placeType, pt.x, pt.z);
        break;
      }
      case 'delete': {
        const idx = this.findIslandAtMouse();
        if (idx >= 0) this.removeIsland(idx);
        break;
      }
      case 'select': {
        const idx = this.findIslandAtMouse();
        this.setSelection(idx);
        break;
      }
      case 'move': {
        const idx = this.findIslandAtMouse();
        if (idx >= 0) {
          this.setSelection(idx);
          this.isDragging = true;
          this.dragStart.set(e.clientX, e.clientY);
          const isl = this.scenario.islands[idx];
          this.dragIslandStart.set(isl.x, isl.z);
          this.pushUndo();
        } else {
          this.setSelection(-1);
        }
        break;
      }
      case 'resize': {
        // Check handles first
        const hIdx = this.findHandleAtMouse();
        if (hIdx >= 0 && this.selectedIndex >= 0) {
          this.isResizing = true;
          this.resizeHandleIndex = hIdx;
          const isl = this.scenario.islands[this.selectedIndex];
          this.resizeStartRadius = isl.radius;
          const pt = this.raycastGround();
          if (pt) {
            this.resizeStartDist = Math.sqrt(
              (pt.x - isl.x) ** 2 + (pt.z - isl.z) ** 2,
            );
          }
          this.pushUndo();
        } else {
          // Select island for resize
          const idx = this.findIslandAtMouse();
          this.setSelection(idx);
        }
        break;
      }
    }
  }

  private handleMouseMove(e: MouseEvent): void {
    if (!this.active || !this.scenario) return;
    this.updateMouse(e);

    // Ghost mesh follows cursor
    if (this.tool === 'place' && this.ghostMesh) {
      const pt = this.raycastGround();
      if (pt) {
        this.ghostMesh.position.set(pt.x, ISLAND_BASE_Y, pt.z);
        this.ghostMesh.visible = true;
      } else {
        this.ghostMesh.visible = false;
      }
    }

    // Move drag
    if (this.isDragging && this.selectedIndex >= 0) {
      const pt = this.raycastGround();
      if (pt) {
        this.scenario.islands[this.selectedIndex].x = pt.x;
        this.scenario.islands[this.selectedIndex].z = pt.z;
        this.syncIslandsToWorld();
        this.updateSelectionVisuals();
      }
    }

    // Resize drag
    if (this.isResizing && this.selectedIndex >= 0) {
      const pt = this.raycastGround();
      if (pt) {
        const isl = this.scenario.islands[this.selectedIndex];
        const currentDist = Math.sqrt(
          (pt.x - isl.x) ** 2 + (pt.z - isl.z) ** 2,
        );
        const config = ISLAND_TYPE_CONFIGS[isl.type];
        const newRadius = Math.max(
          config.minRadius,
          Math.min(config.maxRadius, this.resizeStartRadius + (currentDist - this.resizeStartDist)),
        );
        isl.radius = newRadius;
        this.syncIslandsToWorld();
        this.updateSelectionVisuals();
      }
    }
  }

  private handleMouseUp(e: MouseEvent): void {
    if (e.button !== 0) return;

    if (this.isDragging) {
      this.isDragging = false;
      this.onIslandsChanged?.();
    }
    if (this.isResizing) {
      this.isResizing = false;
      this.resizeHandleIndex = -1;
      this.onIslandsChanged?.();
    }
  }

  // ---------------------------------------------------------------
  //  Per-frame update (minimal — mostly event-driven)
  // ---------------------------------------------------------------

  update(_dt: number): void {
    // Ghost mesh type tracking
    if (this.tool === 'place' && this.ghostType !== this.placeType) {
      this.updateGhostMesh();
    }
  }
}
