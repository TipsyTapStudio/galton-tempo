/**
 * Timer Bridge — wraps the Web Worker timer for main-thread use.
 */

export class TimerBridge {
  private worker: Worker;
  onTick: ((remainingMs: number, elapsedMs: number) => void) | null = null;
  onDone: (() => void) | null = null;

  constructor() {
    this.worker = new Worker('dist/timer-worker.js');
    this.worker.onmessage = (e: MessageEvent) => {
      const msg = e.data;
      if (msg.type === 'TICK') {
        this.onTick?.(msg.remainingMs, msg.elapsedMs);
      } else if (msg.type === 'DONE') {
        this.onDone?.();
      }
    };
  }

  start(totalMs: number): void {
    this.worker.postMessage({
      type: 'START',
      totalMs,
      startAbsMs: performance.now(),
    });
  }

  addTime(addMs: number): void {
    this.worker.postMessage({ type: 'ADD_TIME', addMs });
  }

  pause(): void {
    this.worker.postMessage({ type: 'PAUSE' });
  }

  resume(): void {
    this.worker.postMessage({
      type: 'RESUME',
      resumeAbsMs: performance.now(),
    });
  }

  reset(): void {
    this.worker.postMessage({ type: 'RESET' });
  }
}
