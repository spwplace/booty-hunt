import type { V2ContentRegistry, V2Region } from './V2Content';

export type MapNodeType = 'combat' | 'event' | 'port' | 'contract' | 'boss';

export interface MapNode {
  id: string;
  act: number;
  index: number;
  type: MapNodeType;
  regionId: string;
  label: string;
}

export class MapNodeSystem {
  private readonly content: V2ContentRegistry;
  private nodes: MapNode[] = [];
  private pointer = 0;

  constructor(content: V2ContentRegistry) {
    this.content = content;
  }

  reset(): void {
    this.nodes = [];
    this.pointer = 0;
  }

  startRun(seed: number): void {
    this.reset();

    const regionCycle = this.buildRegionCycle(seed);
    const plan: MapNodeType[][] = [
      ['combat', 'event', 'combat', 'port', 'boss'],
      ['combat', 'contract', 'event', 'combat', 'boss'],
      ['combat', 'event', 'contract', 'combat', 'boss'],
    ];

    let counter = 0;
    for (let act = 0; act < plan.length; act++) {
      for (let i = 0; i < plan[act].length; i++) {
        const regionId = regionCycle[(counter + i) % regionCycle.length];
        const type = plan[act][i];
        this.nodes.push({
          id: `a${act + 1}-n${i + 1}`,
          act: act + 1,
          index: i,
          type,
          regionId,
          label: this.labelForNode(type, act + 1, i + 1),
        });
      }
      counter += plan[act].length;
    }
  }

  getCurrentNode(): MapNode | null {
    return this.nodes[this.pointer] ?? null;
  }

  getCurrentRegion(): V2Region | null {
    const node = this.getCurrentNode();
    if (!node) return null;
    return this.content.getRegion(node.regionId);
  }

  advanceNode(): MapNode | null {
    if (this.pointer < this.nodes.length) {
      this.pointer++;
    }
    return this.getCurrentNode();
  }

  getUpcoming(count = 3): MapNode[] {
    return this.nodes.slice(this.pointer, this.pointer + count);
  }

  private buildRegionCycle(seed: number): string[] {
    const regions = [...this.content.data.regions];
    if (regions.length === 0) return [];

    for (let i = regions.length - 1; i > 0; i--) {
      const j = (seed + i * 31) % (i + 1);
      const tmp = regions[i];
      regions[i] = regions[j];
      regions[j] = tmp;
    }
    return regions.map(region => region.id);
  }

  private labelForNode(type: MapNodeType, act: number, n: number): string {
    switch (type) {
      case 'combat': return `Act ${act} Engagement ${n}`;
      case 'event': return `Act ${act} Sea Event ${n}`;
      case 'port': return `Act ${act} Port Call ${n}`;
      case 'contract': return `Act ${act} Contract ${n}`;
      case 'boss': return `Act ${act} Flagship Clash`;
    }
  }
}
