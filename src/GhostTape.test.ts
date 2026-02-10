import { describe, it, expect, beforeEach } from 'vitest';
import {
  GhostTapeRecorder,
  decodeGhostTapeRaw,
  decodeGhostTapeHeader,
  GHOST_MAGIC,
  GHOST_VERSION,
  GHOST_SAMPLE_HZ,
  HEADER_SIZE,
  FRAME_SIZE,
  ACTION_PORT_FIRE,
  ACTION_STARBOARD_FIRE,
  ACTION_CAPTURING,
} from './GhostTape';

describe('GhostTape', () => {
  let recorder: GhostTapeRecorder;

  beforeEach(() => {
    recorder = new GhostTapeRecorder();
  });

  it('starts with 0 frames', () => {
    expect(recorder.getFrameCount()).toBe(0);
  });

  it('samples at 4Hz (every 250ms)', () => {
    // Small dt shouldn't produce a frame
    recorder.record(0.1, 10, 20, 1.5, 5, 80, 100, 1, 500, 0);
    expect(recorder.getFrameCount()).toBe(0);

    // At 250ms, should produce one frame
    recorder.record(0.15, 10, 20, 1.5, 5, 80, 100, 1, 500, 0);
    expect(recorder.getFrameCount()).toBe(1);
  });

  it('encodes and decodes a header correctly', () => {
    recorder.record(0.25, 10, 20, 1.5, 5, 80, 100, 1, 500, 0);
    const raw = recorder.encodeRaw(12345);
    const header = decodeGhostTapeHeader(raw.buffer as ArrayBuffer);

    expect(header).not.toBeNull();
    expect(header!.magic).toBe(GHOST_MAGIC);
    expect(header!.version).toBe(GHOST_VERSION);
    expect(header!.seed).toBe(12345);
    expect(header!.frameCount).toBe(1);
    expect(header!.sampleHz).toBe(GHOST_SAMPLE_HZ);
  });

  it('round-trips frame data through encode/decode', () => {
    // Record a frame with known values
    recorder.record(0.25, 15.3, -22.7, Math.PI / 4, 8.5, 75, 100, 3, 1200, ACTION_PORT_FIRE | ACTION_CAPTURING);
    const raw = recorder.encodeRaw(42);
    const result = decodeGhostTapeRaw(raw.buffer as ArrayBuffer);

    expect(result).not.toBeNull();
    expect(result!.frames.length).toBe(1);
    const frame = result!.frames[0];
    expect(frame.x).toBeCloseTo(15.3, 0);
    expect(frame.z).toBeCloseTo(-22.7, 0);
    expect(frame.speed).toBeCloseTo(8.5, 0);
    expect(frame.hpPct).toBe(75);
    expect(frame.wave).toBe(3);
    expect(frame.actions & ACTION_PORT_FIRE).toBeTruthy();
    expect(frame.actions & ACTION_CAPTURING).toBeTruthy();
    expect(frame.actions & ACTION_STARBOARD_FIRE).toBeFalsy();
  });

  it('handles multiple frames', () => {
    for (let i = 0; i < 10; i++) {
      recorder.record(0.25, i * 5, i * -3, (i * 0.5) % (Math.PI * 2), 6, 90 - i * 5, 100, 1, i * 100, 0);
    }
    expect(recorder.getFrameCount()).toBe(10);

    const raw = recorder.encodeRaw(99);
    expect(raw.byteLength).toBe(HEADER_SIZE + 10 * FRAME_SIZE);

    const result = decodeGhostTapeRaw(raw.buffer as ArrayBuffer);
    expect(result).not.toBeNull();
    expect(result!.frames.length).toBe(10);
    expect(result!.header.seed).toBe(99);
  });

  it('tracks score deltas between frames', () => {
    recorder.record(0.25, 0, 0, 0, 5, 100, 100, 1, 0, 0);
    recorder.record(0.25, 0, 0, 0, 5, 100, 100, 1, 500, 0);
    recorder.record(0.25, 0, 0, 0, 5, 100, 100, 1, 500, 0);
    recorder.record(0.25, 0, 0, 0, 5, 100, 100, 1, 800, 0);

    const raw = recorder.encodeRaw(1);
    const result = decodeGhostTapeRaw(raw.buffer as ArrayBuffer);
    expect(result!.frames[0].scoreDelta).toBe(0);
    expect(result!.frames[1].scoreDelta).toBe(500);
    expect(result!.frames[2].scoreDelta).toBe(0);
    expect(result!.frames[3].scoreDelta).toBe(300);
  });

  it('resets properly', () => {
    recorder.record(0.25, 10, 20, 1.5, 5, 80, 100, 1, 500, 0);
    expect(recorder.getFrameCount()).toBe(1);
    recorder.reset();
    expect(recorder.getFrameCount()).toBe(0);
  });

  it('rejects invalid data', () => {
    expect(decodeGhostTapeHeader(new ArrayBuffer(4))).toBeNull();
    // wrong magic
    const bad = new ArrayBuffer(HEADER_SIZE);
    new DataView(bad).setUint32(0, 0xDEADBEEF, false);
    expect(decodeGhostTapeHeader(bad)).toBeNull();
  });

  it('rejects truncated frame data', () => {
    recorder.record(0.25, 10, 20, 1.5, 5, 80, 100, 1, 500, 0);
    const raw = recorder.encodeRaw(1);
    // Truncate the frame data
    const truncated = raw.slice(0, HEADER_SIZE + 4);
    expect(decodeGhostTapeRaw(truncated.buffer as ArrayBuffer)).toBeNull();
  });

  it('clamps values to safe ranges', () => {
    // Speed > 25.5 (255/10) should clamp, hpPct > 100 clamps, scoreDelta > 65535 clamps
    recorder.record(0.25, 0, 0, 0, 30, 150, 100, 1, 70000, 0);
    const raw = recorder.encodeRaw(1);
    const result = decodeGhostTapeRaw(raw.buffer as ArrayBuffer);
    expect(result!.frames[0].speed).toBe(25.5);
    expect(result!.frames[0].hpPct).toBe(100);
    expect(result!.frames[0].scoreDelta).toBe(65535);
  });
});
