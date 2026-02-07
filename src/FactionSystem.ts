import type { V2ContentRegistry } from './V2Content';

export class FactionSystem {
  private readonly content: V2ContentRegistry;
  private readonly reputation = new Map<string, number>();

  constructor(content: V2ContentRegistry) {
    this.content = content;
    this.reset();
  }

  reset(): void {
    this.reputation.clear();
    for (const faction of this.content.data.factions) {
      this.reputation.set(faction.id, faction.startingReputation);
    }
  }

  applyReputationDelta(factionId: string, delta: number): number {
    const current = this.reputation.get(factionId) ?? 0;
    const next = current + delta;
    this.reputation.set(factionId, next);
    return next;
  }

  getReputation(factionId: string): number {
    return this.reputation.get(factionId) ?? 0;
  }

  getSpawnWeightMap(regionFactionIds: string[]): Map<string, number> {
    const map = new Map<string, number>();
    for (const faction of this.content.data.factions) {
      const inRegion = regionFactionIds.includes(faction.id);
      const rep = this.getReputation(faction.id);
      const repMod = 1 + Math.max(-0.3, Math.min(0.3, -rep / 200));
      const regionMod = inRegion ? 1.25 : 0.75;
      map.set(faction.id, faction.spawnWeight * repMod * regionMod);
    }
    return map;
  }

  getMostHostileFaction(): string | null {
    let id: string | null = null;
    let min = Infinity;
    for (const [factionId, score] of this.reputation) {
      if (score < min) {
        min = score;
        id = factionId;
      }
    }
    return id;
  }

  getReputationSnapshot(): Record<string, number> {
    const snapshot: Record<string, number> = {};
    for (const [id, score] of this.reputation) {
      snapshot[id] = score;
    }
    return snapshot;
  }
}
