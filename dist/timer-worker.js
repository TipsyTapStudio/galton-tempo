"use strict";
(() => {
  // src/workers/timer-worker.ts
  var totalMs = 0;
  var startAbsMs = 0;
  var pausedElapsedMs = 0;
  var paused = false;
  var running = false;
  var interval = null;
  function tick() {
    if (!running || paused) return;
    const now = performance.now();
    const elapsedMs = pausedElapsedMs + (now - startAbsMs);
    const remainingMs = Math.max(0, totalMs - elapsedMs);
    self.postMessage({ type: "TICK", remainingMs, elapsedMs });
    if (remainingMs <= 0) {
      self.postMessage({ type: "DONE" });
      stop();
    }
  }
  function stop() {
    running = false;
    if (interval !== null) {
      clearInterval(interval);
      interval = null;
    }
  }
  self.onmessage = (e) => {
    const msg = e.data;
    switch (msg.type) {
      case "START":
        totalMs = msg.totalMs;
        startAbsMs = msg.startAbsMs;
        pausedElapsedMs = 0;
        paused = false;
        running = true;
        if (interval !== null) clearInterval(interval);
        interval = setInterval(tick, 100);
        tick();
        break;
      case "ADD_TIME":
        totalMs += msg.addMs;
        tick();
        break;
      case "PAUSE":
        if (running && !paused) {
          const now = performance.now();
          pausedElapsedMs += now - startAbsMs;
          paused = true;
        }
        break;
      case "RESUME":
        if (running && paused) {
          startAbsMs = msg.resumeAbsMs;
          paused = false;
          tick();
        }
        break;
      case "RESET":
        stop();
        totalMs = 0;
        pausedElapsedMs = 0;
        paused = false;
        break;
    }
  };
})();
//# sourceMappingURL=timer-worker.js.map
