export type NarrativeTone = 'neutral' | 'warning' | 'reward' | 'mystic';

export interface NarrativeLine {
  text: string;
  tone: NarrativeTone;
}

export class NarrativeSystem {
  private readonly emit: (line: NarrativeLine) => void;
  private readonly queued: NarrativeLine[] = [];
  private cadenceTimer = 0;

  constructor(emit: (line: NarrativeLine) => void) {
    this.emit = emit;
  }

  reset(): void {
    this.queued.length = 0;
    this.cadenceTimer = 0;
  }

  queue(text: string, tone: NarrativeTone = 'neutral'): void {
    const clean = text.trim();
    if (!clean) return;
    this.queued.push({ text: clean, tone });
  }

  onRunStart(regionName: string): void {
    this.queue(`Charts opened: ${regionName}. Keep guns dry and eyes sharp.`, 'neutral');
  }

  onRegionEntered(regionName: string, theme: string): void {
    this.queue(`Entering ${regionName}. ${theme}`, 'neutral');
  }

  onNodeStart(nodeLabel: string): void {
    this.queue(`Course set: ${nodeLabel}.`, 'neutral');
  }

  onFactionPressure(factionName: string): void {
    this.queue(`${factionName} banners sighted in local waters.`, 'warning');
  }

  update(dt: number): void {
    if (this.queued.length === 0) return;

    this.cadenceTimer -= dt;
    if (this.cadenceTimer > 0) return;

    const line = this.queued.shift();
    if (!line) return;

    this.emit(line);
    this.cadenceTimer = 2.2;
  }
}
