// ===================================================================
//  Ghost Tape — Binary ghost replay recorder/decoder
//  Format: 16-byte header + 12-byte frames @ 4Hz
//  Compressed via CompressionStream deflate (~30-50KB for a full run)
// ===================================================================

const GHOST_MAGIC = 0x47485354; // "GHST"
const GHOST_VERSION = 1;
const GHOST_SAMPLE_HZ = 4;
const HEADER_SIZE = 16;
const FRAME_SIZE = 12;

// -- Action bitfield --
export const ACTION_PORT_FIRE     = 0x01;
export const ACTION_STARBOARD_FIRE = 0x02;
export const ACTION_CAPTURING      = 0x04;
export const ACTION_TOOK_DAMAGE    = 0x08;
export const ACTION_KILLED_ENEMY   = 0x10;
export const ACTION_BOSS_ACTIVE    = 0x20;

export interface GhostFrame {
  x: number;
  z: number;
  heading: number;
  speed: number;
  actions: number;
  hpPct: number;
  wave: number;
  scoreDelta: number;
}

export interface GhostTapeHeader {
  magic: number;
  version: number;
  seed: number;
  frameCount: number;
  sampleHz: number;
}

// ===================================================================
//  Recorder — call record() every frame, it samples at GHOST_SAMPLE_HZ
// ===================================================================

export class GhostTapeRecorder {
  private frames: GhostFrame[] = [];
  private accumulator = 0;
  private lastScore = 0;
  private readonly sampleInterval = 1 / GHOST_SAMPLE_HZ;

  reset(): void {
    this.frames = [];
    this.accumulator = 0;
    this.lastScore = 0;
  }

  record(
    dt: number,
    playerX: number,
    playerZ: number,
    angle: number,
    speed: number,
    hp: number,
    maxHp: number,
    wave: number,
    score: number,
    actions: number,
  ): void {
    this.accumulator += dt;
    if (this.accumulator < this.sampleInterval) return;
    this.accumulator -= this.sampleInterval;

    const scoreDelta = Math.max(0, score - this.lastScore);
    this.lastScore = score;

    this.frames.push({
      x: playerX,
      z: playerZ,
      heading: angle,
      speed,
      actions,
      hpPct: maxHp > 0 ? Math.round((hp / maxHp) * 100) : 0,
      wave,
      scoreDelta,
    });
  }

  getFrameCount(): number {
    return this.frames.length;
  }

  /** Encode frames into the binary ghost tape format */
  encodeRaw(seed: number): Uint8Array {
    const buf = new ArrayBuffer(HEADER_SIZE + this.frames.length * FRAME_SIZE);
    const view = new DataView(buf);

    // Header (16 bytes)
    view.setUint32(0, GHOST_MAGIC, false);
    view.setUint16(4, GHOST_VERSION, false);
    view.setUint32(6, seed >>> 0, false);
    view.setUint32(10, this.frames.length, false);
    view.setUint16(14, GHOST_SAMPLE_HZ, false);

    // Frames (12 bytes each)
    let offset = HEADER_SIZE;
    for (const frame of this.frames) {
      view.setInt16(offset, Math.round(frame.x * 10), false);
      view.setInt16(offset + 2, Math.round(frame.z * 10), false);
      view.setUint16(offset + 4, Math.round(((frame.heading % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) * 10000), false);
      view.setUint8(offset + 6, Math.min(255, Math.round(frame.speed * 10)));
      view.setUint8(offset + 7, frame.actions & 0xff);
      view.setUint8(offset + 8, Math.min(100, Math.max(0, frame.hpPct)));
      view.setUint8(offset + 9, Math.min(255, frame.wave));
      view.setUint16(offset + 10, Math.min(65535, frame.scoreDelta), false);
      offset += FRAME_SIZE;
    }

    return new Uint8Array(buf);
  }

  /** Encode and compress with deflate via CompressionStream */
  async encode(seed: number): Promise<Uint8Array> {
    const raw = this.encodeRaw(seed);
    return compressBytes(raw);
  }
}

// ===================================================================
//  Decoder — parse binary ghost tape back into frames
// ===================================================================

export function decodeGhostTapeHeader(data: ArrayBuffer): GhostTapeHeader | null {
  if (data.byteLength < HEADER_SIZE) return null;
  const view = new DataView(data);
  const magic = view.getUint32(0, false);
  if (magic !== GHOST_MAGIC) return null;
  return {
    magic,
    version: view.getUint16(4, false),
    seed: view.getUint32(6, false),
    frameCount: view.getUint32(10, false),
    sampleHz: view.getUint16(14, false),
  };
}

export function decodeGhostTapeRaw(data: ArrayBuffer): { header: GhostTapeHeader; frames: GhostFrame[] } | null {
  const header = decodeGhostTapeHeader(data);
  if (!header) return null;
  if (header.version !== GHOST_VERSION) return null;

  const expectedSize = HEADER_SIZE + header.frameCount * FRAME_SIZE;
  if (data.byteLength < expectedSize) return null;

  const view = new DataView(data);
  const frames: GhostFrame[] = [];
  let offset = HEADER_SIZE;

  for (let i = 0; i < header.frameCount; i++) {
    const rawX = view.getInt16(offset, false);
    const rawZ = view.getInt16(offset + 2, false);
    const rawHeading = view.getUint16(offset + 4, false);
    const rawSpeed = view.getUint8(offset + 6);
    const actions = view.getUint8(offset + 7);
    const hpPct = view.getUint8(offset + 8);
    const wave = view.getUint8(offset + 9);
    const scoreDelta = view.getUint16(offset + 10, false);

    frames.push({
      x: rawX / 10,
      z: rawZ / 10,
      heading: rawHeading / 10000,
      speed: rawSpeed / 10,
      actions,
      hpPct,
      wave,
      scoreDelta,
    });
    offset += FRAME_SIZE;
  }

  return { header, frames };
}

/** Decompress then decode a ghost tape */
export async function decodeGhostTape(
  compressed: ArrayBuffer,
): Promise<{ header: GhostTapeHeader; frames: GhostFrame[] } | null> {
  try {
    const raw = await decompressBytes(new Uint8Array(compressed));
    return decodeGhostTapeRaw(raw.buffer as ArrayBuffer);
  } catch {
    return null;
  }
}

// ===================================================================
//  Compression helpers (deflate via CompressionStream)
// ===================================================================

async function compressBytes(input: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('deflate');
  const writer = cs.writable.getWriter();
  writer.write(input as unknown as BufferSource);
  writer.close();
  return collectStream(cs.readable);
}

async function decompressBytes(input: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate');
  const writer = ds.writable.getWriter();
  writer.write(input as unknown as BufferSource);
  writer.close();
  return collectStream(ds.readable);
}

async function collectStream(readable: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const reader = readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const totalLen = chunks.reduce((s, c) => s + c.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

// Re-export constants for tests
export { GHOST_MAGIC, GHOST_VERSION, GHOST_SAMPLE_HZ, HEADER_SIZE, FRAME_SIZE };
