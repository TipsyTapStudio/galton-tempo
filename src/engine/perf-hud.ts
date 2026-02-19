/**
 * Performance HUD — lightweight FPS/frame-time tracker.
 * Enabled via ?debug=1 URL parameter.
 */

export interface PerfStats {
  fps: number;
  frameTimeMs: number;
  frameTimePeak: number;
  cloneCount: number;
}

const WINDOW = 60; // rolling window size (frames)

export class PerfTracker {
  private frameTimes: number[] = [];
  private timestamps: number[] = [];

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

  /** Compute current stats snapshot. */
  getStats(cloneCount: number): PerfStats {
    const n = this.timestamps.length;
    if (n < 2) return { fps: 0, frameTimeMs: 0, frameTimePeak: 0, cloneCount };

    const elapsed = this.timestamps[n - 1] - this.timestamps[0];
    const fps = elapsed > 0 ? (n - 1) / elapsed * 1000 : 0;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / n;

    let peak = 0;
    for (const t of this.frameTimes) { if (t > peak) peak = t; }

    return { fps, frameTimeMs: avg, frameTimePeak: peak, cloneCount };
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

  const warn = stats.fps < 55;
  ctx.fillStyle = warn ? 'rgba(255,70,70,0.9)' : 'rgba(0,255,100,0.75)';

  const x = 8;
  const lineH = 15;
  let y = screenH - 8 - lineH * 2;

  ctx.fillText(`FPS ${stats.fps.toFixed(1)}  Frame ${stats.frameTimeMs.toFixed(1)}ms  Peak ${stats.frameTimePeak.toFixed(0)}ms`, x, y);
  y += lineH;
  ctx.fillText(`Clones ${stats.cloneCount}`, x, y);

  ctx.restore();
}
