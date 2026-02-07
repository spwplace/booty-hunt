export interface TelemetryEvent {
  name: string;
  ts: number;
  payload: Record<string, string | number | boolean | null>;
}

export interface TelemetrySnapshot {
  exportedAt: string;
  totalEvents: number;
  counters: Record<string, number>;
  events: TelemetryEvent[];
  runContext: Record<string, string | number | boolean | null>;
}

export class TelemetrySystem {
  private events: TelemetryEvent[] = [];
  private counters = new Map<string, number>();

  resetRun(): void {
    this.events = [];
    this.counters.clear();
  }

  track(name: string, payload: Record<string, string | number | boolean | null> = {}): void {
    this.events.push({ name, ts: Date.now(), payload });
    this.counters.set(name, (this.counters.get(name) ?? 0) + 1);
  }

  getCount(name: string): number {
    return this.counters.get(name) ?? 0;
  }

  flushSnapshot(): { totalEvents: number; counters: Record<string, number> } {
    const counterObj: Record<string, number> = {};
    for (const [key, value] of this.counters) {
      counterObj[key] = value;
    }
    return {
      totalEvents: this.events.length,
      counters: counterObj,
    };
  }

  getEvents(): TelemetryEvent[] {
    return this.events.map((entry) => ({
      name: entry.name,
      ts: entry.ts,
      payload: { ...entry.payload },
    }));
  }

  buildExport(runContext: Record<string, string | number | boolean | null> = {}): TelemetrySnapshot {
    const snapshot = this.flushSnapshot();
    return {
      exportedAt: new Date().toISOString(),
      totalEvents: snapshot.totalEvents,
      counters: snapshot.counters,
      events: this.getEvents(),
      runContext: { ...runContext },
    };
  }
}
