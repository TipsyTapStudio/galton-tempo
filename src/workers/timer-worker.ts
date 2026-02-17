/**
 * Web Worker timer — drift-free countdown using absolute time.
 * Messages IN:  START, ADD_TIME, PAUSE, RESUME, RESET
 * Messages OUT: TICK, DONE
 */

interface StartMsg { type: 'START'; totalMs: number; startAbsMs: number }
interface AddTimeMsg { type: 'ADD_TIME'; addMs: number }
interface PauseMsg { type: 'PAUSE' }
interface ResumeMsg { type: 'RESUME'; resumeAbsMs: number }
interface ResetMsg { type: 'RESET' }

type InMsg = StartMsg | AddTimeMsg | PauseMsg | ResumeMsg | ResetMsg;

let totalMs = 0;
let startAbsMs = 0;
let pausedElapsedMs = 0;
let paused = false;
let running = false;
let interval: ReturnType<typeof setInterval> | null = null;

function tick(): void {
  if (!running || paused) return;
  const now = performance.now();
  const elapsedMs = pausedElapsedMs + (now - startAbsMs);
  const remainingMs = Math.max(0, totalMs - elapsedMs);

  (self as unknown as Worker).postMessage({ type: 'TICK', remainingMs, elapsedMs });

  if (remainingMs <= 0) {
    (self as unknown as Worker).postMessage({ type: 'DONE' });
    stop();
  }
}

function stop(): void {
  running = false;
  if (interval !== null) {
    clearInterval(interval);
    interval = null;
  }
}

self.onmessage = (e: MessageEvent<InMsg>) => {
  const msg = e.data;

  switch (msg.type) {
    case 'START':
      totalMs = msg.totalMs;
      startAbsMs = msg.startAbsMs;
      pausedElapsedMs = 0;
      paused = false;
      running = true;
      if (interval !== null) clearInterval(interval);
      interval = setInterval(tick, 100);
      tick();
      break;

    case 'ADD_TIME':
      totalMs += msg.addMs;
      tick();
      break;

    case 'PAUSE':
      if (running && !paused) {
        const now = performance.now();
        pausedElapsedMs += now - startAbsMs;
        paused = true;
      }
      break;

    case 'RESUME':
      if (running && paused) {
        startAbsMs = msg.resumeAbsMs;
        paused = false;
        tick();
      }
      break;

    case 'RESET':
      stop();
      totalMs = 0;
      pausedElapsedMs = 0;
      paused = false;
      break;
  }
};
