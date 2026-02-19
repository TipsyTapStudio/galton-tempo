/**
 * GALTON-TEMPO — main entry point.
 * "Rhythm from Chaos, Groove from Gravity."
 *
 * A physics-based metronome and rhythm machine.
 * Grains are emitted on BPM beats, collide with pegs producing sounds,
 * and settle into bins creating visual rhythm patterns.
 *
 * Time authority: The Web Worker timer is the SOLE source of truth for elapsed time.
 */

import { readParams, writeParams } from './utils/url-params';
import { createPRNG } from './utils/seed';
import { Simulation } from './engine/simulation';
import { Renderer, getThemeByName } from './engine/renderer';
import { TimerBridge } from './engine/timer-bridge';
import { AudioEngine } from './engine/audio';
import { createConsole, applyPreset } from './components/console';
import { computeBandClones, updateCloneStates } from './engine/clone-system';
import type { CloneConfig } from './engine/clone-system';
import type { SoundType } from './engine/audio';
import { PerfTracker } from './engine/perf-hud';

// ── Bootstrap ──

const params = readParams();
const DEBUG = new URLSearchParams(window.location.search).get('debug') === '1';
const perf = DEBUG ? new PerfTracker() : null;
writeParams(params);

const BEATS_PER_BAR = 4;

let rng = createPRNG(params.s);

function totalBeats(): number {
  return params.bars * BEATS_PER_BAR;
}

let sim = new Simulation({
  numRows: params.rows,
  totalBeats: totalBeats(),
  bpm: params.bpm,
  rng,
});

// ── DOM ──

const container = document.getElementById('app')!;
const renderer = new Renderer(container, params.rows, totalBeats());

// ── Audio ──

const audio = new AudioEngine();
audio.soundType = params.sound as SoundType;

// ── Apply initial theme ──

renderer.setThemeByName(params.theme);

// ── Clone band ──

let cloneConfigs: CloneConfig[] = computeBandClones(renderer.layout);

// ── Apply initial physics preset ──

applyPreset(params.mode);

// ── Web Worker Timer ──

const timerBridge = new TimerBridge();
let lastBeatIndex = -1;

timerBridge.onTick = (_remainingMs, elapsedMs) => {
  sim.setElapsedMs(elapsedMs);

  // Beat detection: fire audio on each new beat
  const currentBeat = sim.getCurrentBeat();
  if (currentBeat > lastBeatIndex) {
    const beatInBar = currentBeat % BEATS_PER_BAR;
    const accent = beatInBar === 0;
    audio.playBeat(accent);
    lastBeatIndex = currentBeat;
  }
};

timerBridge.onDone = () => {
  // Timer expired — ensure elapsedMs covers all beats so update() emits remaining
  // Do NOT set sim.allEmitted directly; let the emission count in update() handle it.
  // This prevents a race where allEmitted=true before all particles are actually emitted.
  sim.setElapsedMs(sim.totalTimeMs);
};

// ── Console ──

const consoleCtrl = createConsole(
  params.bpm,
  params.bars,
  params.rows,
  params.theme,
  params.sound as SoundType,
  params.mode,
);

// Set initial accent color
consoleCtrl.setAccentColor(getThemeByName(params.theme).segmentRGB);

// Auto-hide console (5 seconds)
let hideTimeout: ReturnType<typeof setTimeout> | null = null;

function showConsole(): void {
  consoleCtrl.show();
  if (hideTimeout !== null) clearTimeout(hideTimeout);
  hideTimeout = setTimeout(() => consoleCtrl.hide(), 5000);
}

document.addEventListener('mousemove', showConsole);
document.addEventListener('touchstart', showConsole);
showConsole();

// ── Console callbacks ──

consoleCtrl.onBpmChange = (bpm: number) => {
  params.bpm = bpm;
  writeParams(params);
  if (appState === 'idle') {
    rebuildSim();
    drawIdleFrame();
  } else if (appState === 'running' || appState === 'paused') {
    const currentBeat = sim.getCurrentBeat();
    const newTotalMs = sim.updateBpm(bpm);
    timerBridge.adjust(newTotalMs, sim.elapsedMs);
    lastBeatIndex = currentBeat - 1;
  }
};

consoleCtrl.onBarsChange = (bars: number) => {
  params.bars = bars;
  writeParams(params);
  if (appState === 'idle') {
    rebuildSim();
    drawIdleFrame();
  }
};

consoleCtrl.onRowsChange = (rows: number) => {
  params.rows = rows;
  writeParams(params);
  if (appState === 'idle') {
    rebuildSim();
    drawIdleFrame();
  }
};

consoleCtrl.onSoundChange = (sound: SoundType) => {
  audio.soundType = sound;
  params.sound = sound;
  writeParams(params);
};

consoleCtrl.onModeChange = (modeName: string) => {
  applyPreset(modeName);
  params.mode = modeName;
  writeParams(params);
};

consoleCtrl.onThemeChange = (themeName: string) => {
  renderer.setThemeByName(themeName);
  consoleCtrl.setThemeName(themeName);
  consoleCtrl.setAccentColor(getThemeByName(themeName).segmentRGB);
  params.theme = themeName.toLowerCase();
  writeParams(params);
  if (appState === 'idle') {
    drawIdleFrame();
  } else if (paused) {
    drawPausedFrame();
  }
};

consoleCtrl.onShareURL = () => {
  writeParams(params);
  navigator.clipboard.writeText(window.location.href).catch(() => {});
};

consoleCtrl.onResetDefaults = () => {
  window.location.search = '';
};

consoleCtrl.onStart = () => {
  if (paused) {
    togglePause();
  } else if (appState === 'idle' || sim.allSettled) {
    startFresh();
  }
};

consoleCtrl.onPause = () => togglePause();
consoleCtrl.onStop = () => stopToIdle();

// ── State ──

type AppState = 'running' | 'paused' | 'stopping' | 'idle';
let appState: AppState = 'idle';
let lastTime: number | null = null;
let paused = false;
let rafId = 0;
let hopperFadeAlpha = 1;

// Snapshot of hopper state for stopping fade
let stoppingEmitted = 0;
let stoppingTotal = 0;

// ── Helpers ──

function rebuildSim(): void {
  rng = createPRNG(params.s);
  sim = new Simulation({
    numRows: params.rows,
    totalBeats: totalBeats(),
    bpm: params.bpm,
    rng,
  });
  renderer.clearStatic();
  renderer.resize(params.rows, totalBeats());
  cloneConfigs = computeBandClones(renderer.layout);
}

function drawIdleFrame(): void {
  const tb = totalBeats();
  const cs = updateCloneStates(cloneConfigs, 0);
  renderer.drawFrame([], params.bpm, tb, 0, 0, params.bars, 0, 0, cs);
}

function drawPausedFrame(): void {
  const currentBeat = sim.getCurrentBeat();
  const currentBar = Math.floor(currentBeat / BEATS_PER_BAR);
  const beatInBar = currentBeat % BEATS_PER_BAR;
  const cs = updateCloneStates(cloneConfigs, 0);
  renderer.drawFrame(
    sim.activeParticles,
    params.bpm,
    sim.totalParticles,
    sim.emittedCount,
    currentBar,
    params.bars,
    beatInBar,
    0,
    cs,
  );
}

function togglePause(): void {
  if (appState === 'stopping') return;
  if (appState === 'idle') return;
  if (sim.allSettled) return;

  paused = !paused;
  consoleCtrl.setPaused(paused);

  if (paused) {
    appState = 'paused';
    timerBridge.pause();
    cancelAnimationFrame(rafId);
    drawPausedFrame();
  } else {
    appState = 'running';
    timerBridge.resume();
    lastTime = null;
    rafId = requestAnimationFrame(frame);
  }
}

async function startFresh(): Promise<void> {
  // Ensure audio context is initialized (requires user gesture)
  await audio.ensureContext();

  rebuildSim();
  lastBeatIndex = 0;

  const totalMs = Math.max(0, (totalBeats() - 1)) * (60000 / params.bpm);

  paused = false;
  appState = 'running';
  consoleCtrl.setPaused(false);
  consoleCtrl.setConfigEnabled(false);

  // Wire peg collision sounds
  sim.onPegHit = (row, col, numRows) => {
    audio.playPegHit(row, col, numRows);
  };

  timerBridge.start(totalMs);

  // Play initial beat immediately (beat 0 at time 0)
  audio.playBeat(true);

  lastTime = null;
  rafId = requestAnimationFrame(frame);
}

function stopToIdle(): void {
  if (appState === 'idle' || appState === 'stopping') return;
  cancelAnimationFrame(rafId);
  timerBridge.reset();
  paused = false;
  consoleCtrl.setPaused(true);

  // Snapshot for hopper fade
  stoppingEmitted = sim.emittedCount;
  stoppingTotal = sim.totalParticles;

  // Fill stacks with binomial distribution
  renderer.fillStacks(params.rows, totalBeats());

  // Begin hopper fade-out
  renderer.beginHopperFade();
  hopperFadeAlpha = 1;
  appState = 'stopping';
  consoleCtrl.setConfigEnabled(true);
  lastTime = null;
  rafId = requestAnimationFrame(frame);
}

// ── Resize ──

window.addEventListener('resize', () => {
  renderer.resize(params.rows, totalBeats());
  cloneConfigs = computeBandClones(renderer.layout);
  if (appState === 'idle') {
    drawIdleFrame();
  } else if (paused || sim.allSettled) {
    drawPausedFrame();
  }
});

// ── Keyboard ──

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    if (appState === 'idle') {
      startFresh();
    } else {
      togglePause();
    }
  }
});

// ── Visibility API ──

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    cancelAnimationFrame(rafId);
  } else {
    if (appState === 'running') {
      // Snap particles that should have settled while hidden
      const geom = renderer.getGeom();
      const forcedSettled = sim.forceSettleActive();
      for (const p of forcedSettled) renderer.bakeParticle(p);
      const snapped = sim.instantSnap(geom);
      for (const p of snapped) renderer.bakeParticle(p);

      // Reset allSettled so the loop doesn't stop immediately
      // (update() will re-evaluate on next frame)
      sim.allSettled = false;

      lastTime = null;
      rafId = requestAnimationFrame(frame);
    } else if (appState === 'stopping') {
      lastTime = null;
      rafId = requestAnimationFrame(frame);
    }
  }
});

// ── Main Loop ──

function frame(now: number): void {
  if (appState === 'paused' || appState === 'idle') return;

  const perfT0 = perf?.beginFrame() ?? 0;

  if (lastTime === null) lastTime = now;
  const dtMs = Math.min(now - lastTime, 100);
  const dtSec = dtMs / 1000;
  lastTime = now;

  // ── Stopping state (hopper fade-out) ──
  if (appState === 'stopping') {
    hopperFadeAlpha -= dtSec / 0.5;
    renderer.setHopperFadeAlpha(Math.max(0, hopperFadeAlpha));
    const stopCs = updateCloneStates(cloneConfigs, 0);
    renderer.drawFrame([], params.bpm, stoppingTotal, stoppingEmitted, 0, params.bars, 0, 0, stopCs);
    if (perf) {
      perf.endFrame(perfT0);
      renderer.drawDebugHUD(perf.getStats(stopCs.length));
    }
    if (hopperFadeAlpha <= 0) {
      appState = 'idle';
      renderer.resetHopperFade();
      drawIdleFrame();
      return;
    }
    rafId = requestAnimationFrame(frame);
    return;
  }

  // ── Running state ──
  // Schedule next frame FIRST — if processing throws, loop survives
  rafId = requestAnimationFrame(frame);

  const geom = renderer.getGeom();
  const settled = sim.update(dtMs, geom, (x) => renderer.getGroundY(x));

  for (const p of settled) {
    renderer.bakeParticle(p);
  }

  const currentBeat = sim.getCurrentBeat();
  const currentBar = Math.floor(currentBeat / BEATS_PER_BAR);
  const beatInBar = currentBeat % BEATS_PER_BAR;

  const beatPhase = (sim.elapsedMs % sim.emitIntervalMs) / sim.emitIntervalMs;

  const cs = updateCloneStates(cloneConfigs, beatPhase);
  renderer.drawFrame(
    sim.activeParticles,
    params.bpm,
    sim.totalParticles,
    sim.emittedCount,
    currentBar,
    params.bars,
    beatInBar,
    beatPhase,
    cs,
  );

  if (perf) {
    perf.endFrame(perfT0);
    renderer.drawDebugHUD(perf.getStats(cs.length));
  }

  // Stop only when ALL particles have been both emitted AND settled
  const trulyDone = sim.allSettled
    && sim.emittedCount >= sim.totalParticles;

  if (trulyDone) {
    cancelAnimationFrame(rafId);
    appState = 'idle';
    consoleCtrl.setPaused(true);
    consoleCtrl.setConfigEnabled(true);
  }
}

// ── Initial state: idle ──

appState = 'idle';
consoleCtrl.setPaused(true);
consoleCtrl.setConfigEnabled(true);
drawIdleFrame();
