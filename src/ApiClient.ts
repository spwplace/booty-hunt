// ===================================================================
//  ApiClient — Thin fetch wrapper for Booty Hunt server
//  All methods return Promise<T | null> — null on any error.
//  Fire-and-forget: game never blocks on network.
// ===================================================================

export interface RunSubmission {
  seed: number;
  shipClass: string;
  doctrineId: string;
  score: number;
  waves: number;
  victory: boolean;
  shipsDestroyed: number;
  damageDealt: number;
  maxCombo: number;
  timePlayed: number;
  maxHeat: number;
  ghostTape: Uint8Array | null;
  playerName: string;
}

export interface RunSubmissionResult {
  id: string;
  rank: number;
}

export interface LeaderboardEntry {
  id: string;
  playerName: string;
  score: number;
  waves: number;
  victory: boolean;
  shipClass: string;
  doctrineId: string;
  shipsDestroyed: number;
  timePlayed: number;
  maxHeat: number;
  createdAt: string;
}

export type LeaderboardCategory = 'global' | 'weekly' | 'seed';

export interface RegattaInfo {
  weekKey: string;
  seed: number;
  endsAt: string;
  topRuns: LeaderboardEntry[];
}

export interface SignalFireCreateResult {
  code: string;
}

export interface SignalFireRedeemResult {
  aidType: string;
  aidAmount: number;
  heatCost: number;
}

export interface TideOmen {
  weekKey: string;
  omenId: string;
  omenName: string;
  modifiers: Record<string, number | string>;
}

class ApiClient {
  private baseUrl: string | null;
  private readonly timeout = 5000;

  constructor() {
    const envUrl = typeof import.meta !== 'undefined'
      ? (import.meta as unknown as Record<string, Record<string, unknown>>).env?.VITE_API_URL as string | undefined
      : undefined;
    this.baseUrl = envUrl?.replace(/\/+$/, '') ?? null;
  }

  isConfigured(): boolean {
    return this.baseUrl !== null;
  }

  // -- Ghost Fleet League --

  async submitRun(run: RunSubmission): Promise<RunSubmissionResult | null> {
    const body: Record<string, unknown> = {
      seed: run.seed,
      ship_class: run.shipClass,
      doctrine_id: run.doctrineId,
      score: run.score,
      waves: run.waves,
      victory: run.victory,
      ships_destroyed: run.shipsDestroyed,
      damage_dealt: run.damageDealt,
      max_combo: run.maxCombo,
      time_played: run.timePlayed,
      max_heat: run.maxHeat,
      player_name: run.playerName,
    };
    if (run.ghostTape) {
      body.ghost_tape = uint8ToBase64(run.ghostTape);
    }
    return this.post<RunSubmissionResult>('/api/runs', body);
  }

  async getLeaderboard(
    category: LeaderboardCategory = 'global',
    seed?: number,
    limit = 20,
  ): Promise<LeaderboardEntry[] | null> {
    let url = `/api/leaderboard?category=${category}&limit=${limit}`;
    if (seed !== undefined) url += `&seed=${seed}`;
    return this.get<LeaderboardEntry[]>(url);
  }

  async getGhostTape(runId: string): Promise<ArrayBuffer | null> {
    return this.getBinary(`/api/ghost/${encodeURIComponent(runId)}`);
  }

  async getRegatta(): Promise<RegattaInfo | null> {
    return this.get<RegattaInfo>('/api/regatta');
  }

  // -- Signal Fires --

  async createSignalFire(creatorRun: string, aidType: string, aidAmount: number): Promise<SignalFireCreateResult | null> {
    return this.post<SignalFireCreateResult>('/api/signal-fire/create', {
      creator_run: creatorRun,
      aid_type: aidType,
      aid_amount: aidAmount,
    });
  }

  async redeemSignalFire(code: string): Promise<SignalFireRedeemResult | null> {
    return this.post<SignalFireRedeemResult>('/api/signal-fire/redeem', { code });
  }

  // -- Tide Calendar --

  async getTideOmen(): Promise<TideOmen | null> {
    return this.get<TideOmen>('/api/tide');
  }

  async contributeTide(metric: string, value: number): Promise<{ accepted: boolean } | null> {
    return this.post<{ accepted: boolean }>('/api/tide/contribute', { metric, value });
  }

  // -- HTTP helpers --

  private async get<T>(path: string): Promise<T | null> {
    if (!this.baseUrl) return null;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeout);
      const res = await fetch(`${this.baseUrl}${path}`, {
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) return null;
      return await res.json() as T;
    } catch {
      return null;
    }
  }

  private async getBinary(path: string): Promise<ArrayBuffer | null> {
    if (!this.baseUrl) return null;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeout);
      const res = await fetch(`${this.baseUrl}${path}`, {
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) return null;
      return await res.arrayBuffer();
    } catch {
      return null;
    }
  }

  private async post<T>(path: string, body: unknown): Promise<T | null> {
    if (!this.baseUrl) return null;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeout);
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) return null;
      return await res.json() as T;
    } catch {
      return null;
    }
  }
}

function uint8ToBase64(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}

export const apiClient = new ApiClient();
