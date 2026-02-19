/**
 * Performance HUD — lightweight FPS/frame-time tracker.
 * Enabled via ?debug=1 URL parameter.
 */

export interface PerfStats {
  fps: number;
  frameTimeMs: number;
  frameTimePeak: number;
  cloneCount: number;
  /** Latest beat detection latency (ms). How late the beat was detected. */
  beatLatencyMs: number;
  /** Worst beat latency in recent history (ms). */
  beatLatencyPeak: number;
  /** Worker tick messages received per second. */
  ticksPerSec: number;
}

const WINDOW = 60; // rolling window size (frames)
const BEAT_WINDOW = 16; // keep last N beat latencies

export class PerfTracker {
  private frameTimes: number[] = [];
  private timestamps: number[] = [];
  private beatLatencies: number[] = [];
  private tickTimestamps: number[] = [];

  /** Call at the very start of frame(). Returns a token for endFrame(). */
  beginFrame(): number {
    return performance.now();
  }

  /** Call after all frame work is done. */
  endFrame(startTime: number): void {
    const now = performance.now();
    this.frameTimes.push(now - startTime);
    this.timestamps.push(now);
    if (this.frameTimes.length > WINDOW) {
      this.frameTimes.shift();
      this.timestamps.shift();
    }
  }

  /** Record a beat detection event with its latency. */
  recordBeat(latencyMs: number): void {
    this.beatLatencies.push(latencyMs);
    if (this.beatLatencies.length > BEAT_WINDOW) {
      this.beatLatencies.shift();
    }
  }

  /** Record a worker tick arrival. */
  recordTick(): void {
    const now = performance.now();
    this.tickTimestamps.push(now);
    // Keep only last 2 seconds of ticks
    const cutoff = now - 2000;
    while (this.tickTimestamps.length > 0 && this.tickTimestamps[0] < cutoff) {
      this.tickTimestamps.shift();
    }
  }

  /** Compute current stats snapshot. */
  getStats(cloneCount: number): PerfStats {
    const n = this.timestamps.length;
    if (n < 2) return { fps: 0, frameTimeMs: 0, frameTimePeak: 0, cloneCount, beatLatencyMs: 0, beatLatencyPeak: 0, ticksPerSec: 0 };

    const elapsed = this.timestamps[n - 1] - this.timestamps[0];
    const fps = elapsed > 0 ? (n - 1) / elapsed * 1000 : 0;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / n;

    let peak = 0;
    for (const t of this.frameTimes) { if (t > peak) peak = t; }

    const bn = this.beatLatencies.length;
    const beatLatencyMs = bn > 0 ? this.beatLatencies[bn - 1] : 0;
    let beatPeak = 0;
    for (const b of this.beatLatencies) { if (b > beatPeak) beatPeak = b; }

    // Ticks/s: count ticks in the last 1 second
    const now = performance.now();
    const oneSecAgo = now - 1000;
    let tickCount = 0;
    for (const t of this.tickTimestamps) { if (t >= oneSecAgo) tickCount++; }

    return { fps, frameTimeMs: avg, frameTimePeak: peak, cloneCount, beatLatencyMs, beatLatencyPeak: beatPeak, ticksPerSec: tickCount };
  }
}

/** Draw the HUD overlay on the given canvas context. */
export function drawHUD(
  ctx: CanvasRenderingContext2D,
  stats: PerfStats,
  screenH: number,
): void {
  ctx.save();
  ctx.font = '11px monospace';
  ctx.textAlign = 'left';

  const x = 8;
  const lineH = 15;
  let y = screenH - 8 - lineH * 3;

  // FPS line
  const fpsWarn = stats.fps < 55;
  ctx.fillStyle = fpsWarn ? 'rgba(255,70,70,0.9)' : 'rgba(0,255,100,0.75)';
  ctx.fillText(`FPS ${stats.fps.toFixed(1)}  Frame ${stats.frameTimeMs.toFixed(1)}ms  Peak ${stats.frameTimePeak.toFixed(0)}ms`, x, y);
  y += lineH;

  // Clones + Ticks line
  ctx.fillText(`Clones ${stats.cloneCount}  Ticks ${stats.ticksPerSec}/s`, x, y);
  y += lineH;

  // Beat latency line
  const beatWarn = stats.beatLatencyPeak > 30;
  ctx.fillStyle = beatWarn ? 'rgba(255,170,50,0.9)' : 'rgba(0,255,100,0.75)';
  ctx.fillText(`Beat +${stats.beatLatencyMs.toFixed(0)}ms  Peak +${stats.beatLatencyPeak.toFixed(0)}ms`, x, y);

  ctx.restore();
}
