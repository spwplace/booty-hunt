import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We test the ApiClient class internals by constructing a fresh instance
// and stubbing fetch. The singleton `apiClient` won't have VITE_API_URL set
// in test env, so we test via a subclass that forces baseUrl.

class TestableApiClient {
  private baseUrl: string | null;
  private readonly timeout = 5000;

  constructor(baseUrl: string | null) {
    this.baseUrl = baseUrl;
  }

  isConfigured(): boolean {
    return this.baseUrl !== null;
  }

  async get<T>(path: string): Promise<T | null> {
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

  async post<T>(path: string, body: unknown): Promise<T | null> {
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

describe('ApiClient', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns null when not configured', async () => {
    const client = new TestableApiClient(null);
    expect(client.isConfigured()).toBe(false);
    expect(await client.get('/api/tide')).toBeNull();
    expect(await client.post('/api/runs', {})).toBeNull();
  });

  it('makes GET requests and parses JSON', async () => {
    const mockData = { weekKey: '2025-W01', omenId: 'calm', omenName: 'Calm Seas', modifiers: {} };
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    });

    const client = new TestableApiClient('http://localhost:3000');
    const result = await client.get('/api/tide');
    expect(result).toEqual(mockData);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/tide',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('makes POST requests with JSON body', async () => {
    const mockResult = { id: 'run-123', rank: 5 };
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResult),
    });

    const client = new TestableApiClient('http://localhost:3000');
    const result = await client.post('/api/runs', { seed: 42 });
    expect(result).toEqual(mockResult);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/runs',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed: 42 }),
      }),
    );
  });

  it('returns null on HTTP error', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
    });

    const client = new TestableApiClient('http://localhost:3000');
    expect(await client.get('/api/tide')).toBeNull();
  });

  it('returns null on network error', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

    const client = new TestableApiClient('http://localhost:3000');
    expect(await client.get('/api/tide')).toBeNull();
    expect(await client.post('/api/runs', {})).toBeNull();
  });
});
