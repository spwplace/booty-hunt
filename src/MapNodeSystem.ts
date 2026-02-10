import type { V2ContentRegistry, V2Region } from './V2Content';

export type MapNodeType = 'combat' | 'event' | 'port' | 'contract' | 'boss' | 'forge';

export interface MapNode {
  id: string;
  act: number;
  layer: number;           // 0-4 within the act
  type: MapNodeType;
  regionId: string;
  label: string;
  connections: string[];   // forward-edge node IDs
  visited: boolean;
}

export interface MapAct {
  actNumber: number;
  layers: MapNode[][];     // layers[0..4], each has 1-3 nodes
}

export interface MapGraph {
  acts: MapAct[];
  currentNodeId: string | null;
}

export interface MapNodeSnapshot {
  seed: number;
  currentNodeId: string | null;
  visitedNodeIds: string[];
  scars?: MapScar[];
}

// War Table: persistent scars from player choices
export type MapScarType = 'burned_port' | 'faction_dominance' | 'hazard_stack';

export interface MapScar {
  nodeId: string;
  type: MapScarType;
  label: string;
  factionId?: string;
  addedHazard?: string;
}

// Node type pools per act (weighted — more entries = higher chance)
const ACT_POOLS: MapNodeType[][] = [
  ['combat', 'combat', 'event', 'port'],              // Act 1: guaranteed port
  ['combat', 'event', 'contract', 'port', 'combat'],  // Act 2: guaranteed port
  ['combat', 'combat', 'contract', 'event', 'combat'],// Act 3: no guaranteed port
];

// Acts 1 and 2 guarantee at least one port in layers 1-3
const GUARANTEE_PORT = [true, true, false];

export class MapNodeSystem {
  private readonly content: V2ContentRegistry;
  private acts: MapAct[] = [];
  private currentNodeId: string | null = null;
  private nodeMap: Map<string, MapNode> = new Map();
  private seed = 0;
  private scars: MapScar[] = [];

  constructor(content: V2ContentRegistry) {
    this.content = content;
  }

  reset(): void {
    this.acts = [];
    this.currentNodeId = null;
    this.nodeMap = new Map();
    this.scars = [];
  }

  /* ------------------------------------------------------------------ */
  /*  Run generation                                                     */
  /* ------------------------------------------------------------------ */

  startRun(seed: number): void {
    this.reset();
    this.seed = seed;

    const regionCycle = this.buildRegionCycle(seed);
    // Act 1 → regions[0,1], Act 2 → regions[2,3], Act 3 → regions[3,4]
    const actRegions: string[][] = [
      regionCycle.slice(0, 2),
      regionCycle.slice(2, 4),
      regionCycle.slice(3, 5),
    ];

    for (let a = 0; a < 3; a++) {
      const act = this.generateAct(a + 1, actRegions[a], seed + a * 1000);
      this.acts.push(act);
    }

    // Connect boss of act K to entry of act K+1
    for (let a = 0; a < this.acts.length - 1; a++) {
      const bossLayer = this.acts[a].layers[4];
      const nextEntry = this.acts[a + 1].layers[0];
      for (const boss of bossLayer) {
        for (const entry of nextEntry) {
          boss.connections.push(entry.id);
        }
      }
    }

    // Build flat lookup map
    for (const act of this.acts) {
      for (const layer of act.layers) {
        for (const node of layer) {
          this.nodeMap.set(node.id, node);
        }
      }
    }

    // Auto-select the first node (act 1, layer 0)
    const firstNode = this.acts[0].layers[0][0];
    if (firstNode) {
      this.currentNodeId = firstNode.id;
      firstNode.visited = true;
    }
  }

  private generateAct(actNum: number, regions: string[], seed: number): MapAct {
    const layers: MapNode[][] = [];
    let rng = this.seededRng(seed);

    // Layer 0: single combat entry
    layers.push([this.makeNode(actNum, 0, 0, 'combat', regions[0])]);

    // Layers 1-3: 2-3 branching nodes
    const pool = ACT_POOLS[actNum - 1];
    let portPlaced = false;

    for (let L = 1; L <= 3; L++) {
      const count = rng() < 0.4 ? 3 : 2;
      const layerNodes: MapNode[] = [];

      for (let i = 0; i < count; i++) {
        const regionId = regions[i % regions.length];
        let type = pool[Math.floor(rng() * pool.length)];

        // Force a port in layer 3 if act guarantees one and none placed yet
        if (L === 3 && !portPlaced && GUARANTEE_PORT[actNum - 1] && i === count - 1) {
          type = 'port';
        }
        if (type === 'port') portPlaced = true;

        // Rare forge node in Act 2-3 (10% chance to replace a combat node)
        if (actNum >= 2 && type === 'combat' && L >= 2 && rng() < 0.10) {
          type = 'forge';
        }

        layerNodes.push(this.makeNode(actNum, L, i, type, regionId));
      }
      layers.push(layerNodes);
    }

    // Layer 4: single boss
    layers.push([this.makeNode(actNum, 4, 0, 'boss', regions[0])]);

    // Wire connections between adjacent layers
    for (let L = 0; L < layers.length - 1; L++) {
      this.wireLayer(layers[L], layers[L + 1], rng);
    }

    return { actNumber: actNum, layers };
  }

  private wireLayer(from: MapNode[], to: MapNode[], rng: () => number): void {
    // Ensure every 'to' node has at least one incoming edge
    const incoming = new Set<string>();

    // Each 'from' node connects to 1-2 'to' nodes
    for (const src of from) {
      const connectCount = to.length === 1 ? 1 : (rng() < 0.5 ? 2 : 1);
      const shuffled = [...to].sort(() => rng() - 0.5);
      for (let i = 0; i < Math.min(connectCount, shuffled.length); i++) {
        src.connections.push(shuffled[i].id);
        incoming.add(shuffled[i].id);
      }
    }

    // Patch: ensure all 'to' nodes are reachable
    for (const dst of to) {
      if (!incoming.has(dst.id)) {
        const src = from[Math.floor(rng() * from.length)];
        src.connections.push(dst.id);
      }
    }
  }

  private makeNode(act: number, layer: number, index: number, type: MapNodeType, regionId: string): MapNode {
    return {
      id: `a${act}-L${layer}-${index}`,
      act,
      layer,
      type,
      regionId,
      label: this.labelForNode(type, act, layer),
      connections: [],
      visited: false,
    };
  }

  /* ------------------------------------------------------------------ */
  /*  Navigation                                                         */
  /* ------------------------------------------------------------------ */

  /** Select a specific node by ID. Marks it visited and sets it as current. */
  selectNode(nodeId: string): MapNode | null {
    const node = this.nodeMap.get(nodeId);
    if (!node) return null;
    node.visited = true;
    this.currentNodeId = nodeId;
    return node;
  }

  /** Get nodes the player can move to from the current node. */
  getAvailableNextNodes(): MapNode[] {
    if (!this.currentNodeId) return [];
    const current = this.nodeMap.get(this.currentNodeId);
    if (!current) return [];
    return current.connections
      .map((id) => this.nodeMap.get(id))
      .filter((n): n is MapNode => n != null);
  }

  getCurrentNode(): MapNode | null {
    if (!this.currentNodeId) return null;
    return this.nodeMap.get(this.currentNodeId) ?? null;
  }

  getCurrentRegion(): V2Region | null {
    const node = this.getCurrentNode();
    if (!node) return null;
    return this.content.getRegion(node.regionId);
  }

  /** Backward-compatible: advance to the first available next node. */
  advanceNode(): MapNode | null {
    const available = this.getAvailableNextNodes();
    if (available.length > 0) {
      return this.selectNode(available[0].id);
    }
    return null;
  }

  /** Return the full graph for UI rendering. */
  getGraph(): MapGraph {
    return {
      acts: this.acts,
      currentNodeId: this.currentNodeId,
    };
  }

  getSnapshot(): MapNodeSnapshot {
    const visitedNodeIds: string[] = [];
    for (const [id, node] of this.nodeMap) {
      if (node.visited) visitedNodeIds.push(id);
    }
    return {
      seed: this.seed,
      currentNodeId: this.currentNodeId,
      visitedNodeIds,
      scars: this.scars.length > 0 ? [...this.scars] : undefined,
    };
  }

  restoreSnapshot(snapshot: MapNodeSnapshot): void {
    this.startRun(snapshot.seed);
    const visited = new Set(snapshot.visitedNodeIds);
    for (const [id, node] of this.nodeMap) {
      node.visited = visited.has(id);
    }
    if (snapshot.currentNodeId && this.nodeMap.has(snapshot.currentNodeId)) {
      this.currentNodeId = snapshot.currentNodeId;
      const current = this.nodeMap.get(snapshot.currentNodeId);
      if (current) current.visited = true;
    }
    this.scars = Array.isArray(snapshot.scars) ? [...snapshot.scars] : [];
  }

  // -----------------------------------------------------------------------
  // War Table: persistent map scars
  // -----------------------------------------------------------------------

  addScar(scar: MapScar): void {
    // Prevent duplicate scars on the same node of the same type
    if (this.scars.some(s => s.nodeId === scar.nodeId && s.type === scar.type)) return;
    this.scars.push(scar);
  }

  getScars(): MapScar[] {
    return [...this.scars];
  }

  getScarsForNode(nodeId: string): MapScar[] {
    return this.scars.filter(s => s.nodeId === nodeId);
  }

  hasNodeScar(nodeId: string, type: MapScarType): boolean {
    return this.scars.some(s => s.nodeId === nodeId && s.type === type);
  }

  /** Burn a port node (player raided it) — converts port to combat for future visits */
  burnPort(nodeId: string): void {
    const node = this.nodeMap.get(nodeId);
    if (!node || node.type !== 'port') return;
    this.addScar({
      nodeId,
      type: 'burned_port',
      label: 'Burned Port',
    });
  }

  /** Add faction dominance scar (faction took over this node) */
  addFactionDominance(nodeId: string, factionId: string, factionName: string): void {
    this.addScar({
      nodeId,
      type: 'faction_dominance',
      label: `${factionName} Territory`,
      factionId,
    });
  }

  /** Stack an additional hazard onto a node */
  addHazardStack(nodeId: string, hazardId: string, hazardName: string): void {
    this.addScar({
      nodeId,
      type: 'hazard_stack',
      label: hazardName,
      addedHazard: hazardId,
    });
  }

  /** Get a node by ID. */
  getNode(id: string): MapNode | null {
    return this.nodeMap.get(id) ?? null;
  }

  /* ------------------------------------------------------------------ */
  /*  Helpers                                                            */
  /* ------------------------------------------------------------------ */

  private buildRegionCycle(seed: number): string[] {
    const regions = [...this.content.data.regions];
    if (regions.length === 0) return [];

    for (let i = regions.length - 1; i > 0; i--) {
      const j = (seed + i * 31) % (i + 1);
      const tmp = regions[i];
      regions[i] = regions[j];
      regions[j] = tmp;
    }
    return regions.map((region) => region.id);
  }

  private labelForNode(type: MapNodeType, act: number, layer: number): string {
    switch (type) {
      case 'combat': return `Act ${act} Engagement`;
      case 'event': return `Act ${act} Sea Event`;
      case 'port': return `Act ${act} Port Call`;
      case 'contract': return `Act ${act} Contract`;
      case 'boss': return `Act ${act} Flagship Clash`;
      case 'forge': return `Act ${act} Doctrine Forge`;
    }
  }

  private seededRng(seed: number): () => number {
    let s = seed | 0;
    return () => {
      s = (s * 1664525 + 1013904223) | 0;
      return (s >>> 0) / 4294967296;
    };
  }
}
