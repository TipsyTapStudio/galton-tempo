/**
 * Physics-based particle simulation — BPM-synced emission for GALTON-TEMPO.
 *
 * Key difference from GALTON-TIMER:
 *   TIMER: emitInterval = totalTime / totalParticles (time-linear)
 *   TEMPO: emitInterval = 60000 / bpm (BPM-synced, one grain per beat)
 *
 * Peg collision callback enables sound triggering.
 */

// ── Types ───────────────────────────────────────────────────────────

export interface Particle {
  path: number[];       // 0=left, 1=right at each peg row
  bin: number;          // final bin = sum(path)
  x: number;
  y: number;
  vx: number;
  vy: number;
  pegIndex: number;     // next peg row to interact with
  settled: boolean;
  jitter: number;
  beatIndex: number;    // which beat this particle was emitted on
}

export interface BoardGeom {
  emitX: number;
  emitY: number;
  pegX: (row: number, index: number) => number;
  pegY: (row: number) => number;
  pegSpacing: number;
  numRows: number;
  accBottom: number;
}

export interface SimConfig {
  numRows: number;
  totalBeats: number;   // bars * beatsPerBar
  bpm: number;
  rng: () => number;
}

// ── Physics constants ──

export type PhysicsParams = {
  restitution: number;
  restitutionRange: number;
  nudge: number;
  dragX: number;
  dragY: number;
  dragXSettle: number;
  dragYSettle: number;
  gravity: number;
};

export const PRESETS: Record<string, PhysicsParams> = {
  'Standard': {
    restitution: 0.20, restitutionRange: 0.08,
    nudge: 0.08,
    dragX: 3.0, dragY: 1.5, dragXSettle: 6.0, dragYSettle: 3.0, gravity: 800,
  },
  'Heavy Sand': {
    restitution: 0.01, restitutionRange: 0.02,
    nudge: 0.10,
    dragX: 6.0, dragY: 2.0, dragXSettle: 14.0, dragYSettle: 7.0, gravity: 1400,
  },
  'Techno': {
    restitution: 0.0, restitutionRange: 0.0,
    nudge: 0.15,
    dragX: 10.0, dragY: 1.0, dragXSettle: 18.0, dragYSettle: 4.0, gravity: 1600,
  },
  'Moon Gravity': {
    restitution: 0.08, restitutionRange: 0.03,
    nudge: 0.12,
    dragX: 2.0, dragY: 0.08, dragXSettle: 3.0, dragYSettle: 0.8, gravity: 50,
  },
  'Super Ball': {
    restitution: 0.70, restitutionRange: 0.15,
    nudge: 0.04,
    dragX: 0.8, dragY: 0.4, dragXSettle: 2.5, dragYSettle: 1.2, gravity: 800,
  },
};

export const PHYSICS: PhysicsParams = { ...PRESETS['Standard'] };

// ── Helpers ─────────────────────────────────────────────────────────

function fract(x: number): number {
  return x - Math.floor(x);
}

function timeToHit(y: number, vy: number, g: number, targetY: number): number {
  const dy = targetY - y;
  if (dy <= 0) return 0;
  if (Math.abs(g) < 1e-6) {
    return vy > 1e-9 ? dy / vy : Infinity;
  }
  const disc = vy * vy + 2 * g * dy;
  if (disc < 0) return Infinity;
  const sqrtDisc = Math.sqrt(disc);
  const t1 = (-vy + sqrtDisc) / g;
  const t2 = (-vy - sqrtDisc) / g;
  let t = Infinity;
  if (t1 > 1e-9) t = t1;
  if (t2 > 1e-9 && t2 < t) t = t2;
  return t;
}

export function maxBinProbability(numRows: number): number {
  const k = Math.floor(numRows / 2);
  let logC = 0;
  for (let i = 1; i <= numRows; i++) logC += Math.log(i);
  for (let i = 1; i <= k; i++) logC -= Math.log(i);
  for (let i = 1; i <= numRows - k; i++) logC -= Math.log(i);
  return Math.exp(logC - numRows * Math.LN2);
}

// ── Simulation ──────────────────────────────────────────────────────

const PEG_COLLISION_FRAC = 0.30;

export class Simulation {
  readonly numRows: number;
  readonly totalParticles: number;
  totalTimeMs: number;

  binCounts: number[];
  activeParticles: Particle[] = [];
  emittedCount = 0;
  elapsedMs = 0;
  allEmitted = false;
  allSettled = false;

  /** Callback: fired when a particle collides with a peg. */
  onPegHit: ((row: number, col: number, numRows: number) => void) | null = null;

  private rng: () => number;
  emitIntervalMs: number;

  constructor(cfg: SimConfig) {
    this.numRows = cfg.numRows;
    this.totalParticles = cfg.totalBeats;
    this.emitIntervalMs = 60000 / cfg.bpm;
    this.totalTimeMs = Math.max(0, (cfg.totalBeats - 1)) * this.emitIntervalMs;
    this.rng = cfg.rng;
    this.binCounts = new Array(cfg.numRows + 1).fill(0);
  }

  update(
    dtMs: number,
    geom: BoardGeom,
    getGroundY: (x: number) => number,
  ): Particle[] {
    const dt = Math.min(dtMs, 100) / 1000;
    const settled: Particle[] = [];

    // ── Emission (BPM-synced) ──
    if (!this.allEmitted) {
      const expectedEmitted = Math.min(
        this.totalParticles,
        1 + Math.floor(this.elapsedMs / this.emitIntervalMs),
      );
      const toEmit = expectedEmitted - this.emittedCount;
      for (let i = 0; i < toEmit; i++) {
        this.activeParticles.push(this.createParticle(geom));
      }
      if (this.emittedCount >= this.totalParticles) this.allEmitted = true;
    }

    // ── Physics ──
    const alive: Particle[] = [];
    const halfBoard = geom.pegSpacing * (this.numRows / 2 + 1.5);
    const pegR = geom.pegSpacing * PEG_COLLISION_FRAC;

    for (const p of this.activeParticles) {
      const g = PHYSICS.gravity;

      const settling = p.pegIndex >= this.numRows;
      const dxCoeff = settling ? PHYSICS.dragXSettle : PHYSICS.dragX;
      const dyCoeff = settling ? PHYSICS.dragYSettle : PHYSICS.dragY;
      p.vx *= Math.exp(-dxCoeff * dt);
      p.vy *= Math.exp(-dyCoeff * dt);

      let remainDt = dt;
      let didSettle = false;
      const MAX_CCD_ITER = this.numRows + 2;

      for (let iter = 0; iter < MAX_CCD_ITER && remainDt > 0; iter++) {
        if (p.pegIndex < this.numRows) {
          const pegRowY = geom.pegY(p.pegIndex);
          const tHit = timeToHit(p.y, p.vy, g, pegRowY);

          if (tHit > remainDt) {
            p.x += p.vx * remainDt;
            p.y += p.vy * remainDt + 0.5 * g * remainDt * remainDt;
            p.vy += g * remainDt;
            remainDt = 0;
            break;
          }

          p.x += p.vx * tHit;
          p.vy += g * tHit;
          p.y = pegRowY;
          remainDt -= tHit;

          const dir = p.path[p.pegIndex];
          const bj = fract(p.jitter * 997.0 + p.pegIndex * 7.31);

          let hIdx = 0;
          for (let i = 0; i < p.pegIndex; i++) hIdx += p.path[i];
          const pegCX = geom.pegX(p.pegIndex, hIdx);

          const nudge = PHYSICS.nudge;
          p.x = p.x * (1 - nudge) + pegCX * nudge;

          let dx = p.x - pegCX;
          const minOff = pegR * (0.10 + 0.12 * bj);
          if (dir === 1 && dx < minOff) dx = minOff;
          if (dir === 0 && dx > -minOff) dx = -minOff;
          dx = Math.max(-pegR, Math.min(pegR, dx));

          const frac = dx / pegR;
          const nx = frac;
          const ny = -Math.sqrt(Math.max(0, 1 - frac * frac));

          const vDotN = p.vx * nx + p.vy * ny;
          if (vDotN < 0) {
            const e = PHYSICS.restitution + PHYSICS.restitutionRange * bj;
            p.vx -= (1 + e) * vDotN * nx;
            p.vy -= (1 + e) * vDotN * ny;
          }

          // Fire peg collision callback
          this.onPegHit?.(p.pegIndex, hIdx, this.numRows);

          p.pegIndex++;
        } else {
          const groundY = getGroundY(p.x);
          const tGround = timeToHit(p.y, p.vy, g, groundY);

          if (tGround > remainDt) {
            p.x += p.vx * remainDt;
            p.y += p.vy * remainDt + 0.5 * g * remainDt * remainDt;
            p.vy += g * remainDt;
            remainDt = 0;
            break;
          }

          p.x += p.vx * tGround;
          p.y = groundY;
          p.settled = true;
          this.binCounts[p.bin]++;
          settled.push(p);
          didSettle = true;
          break;
        }
      }

      if (didSettle) continue;
      p.x = Math.max(geom.emitX - halfBoard, Math.min(geom.emitX + halfBoard, p.x));
      alive.push(p);
    }

    this.activeParticles = alive;
    if (this.allEmitted && alive.length === 0) this.allSettled = true;

    return settled;
  }

  setElapsedMs(ms: number): void {
    this.elapsedMs = ms;
  }

  /** Get current beat index (0-based). */
  getCurrentBeat(): number {
    return Math.min(this.totalParticles, 1 + Math.floor(this.elapsedMs / this.emitIntervalMs));
  }

  /** Update BPM (emission rate) while preserving beat position. Returns new totalTimeMs. */
  updateBpm(newBpm: number): number {
    const currentBeat = this.getCurrentBeat();
    this.emitIntervalMs = 60000 / newBpm;
    this.elapsedMs = currentBeat * this.emitIntervalMs;
    this.totalTimeMs = Math.max(0, (this.totalParticles - 1)) * this.emitIntervalMs;
    return this.totalTimeMs;
  }

  /** Get current bar (0-based). */
  getCurrentBar(beatsPerBar: number): number {
    return Math.floor(this.getCurrentBeat() / beatsPerBar);
  }

  instantSnap(geom: BoardGeom): Particle[] {
    const expectedEmitted = Math.min(
      this.totalParticles,
      1 + Math.floor(this.elapsedMs / this.emitIntervalMs),
    );
    const toEmit = expectedEmitted - this.emittedCount;
    if (toEmit <= 0) return [];

    const settled: Particle[] = [];
    for (let i = 0; i < toEmit; i++) {
      const p = this.createParticle(geom);
      p.settled = true;
      p.pegIndex = this.numRows;
      this.binCounts[p.bin]++;
      settled.push(p);
    }

    if (this.emittedCount >= this.totalParticles) this.allEmitted = true;
    return settled;
  }

  forceSettleActive(): Particle[] {
    const settled: Particle[] = [];
    for (const p of this.activeParticles) {
      p.settled = true;
      p.pegIndex = this.numRows;
      this.binCounts[p.bin]++;
      settled.push(p);
    }
    this.activeParticles = [];
    return settled;
  }

  private createParticle(geom: BoardGeom): Particle {
    const path: number[] = [];
    let bin = 0;
    for (let i = 0; i < this.numRows; i++) {
      const d = this.rng() < 0.5 ? 0 : 1;
      path.push(d);
      bin += d;
    }
    const beatIndex = this.emittedCount;
    this.emittedCount++;
    return {
      path, bin,
      x: geom.emitX, y: geom.emitY,
      vx: 0, vy: 0,
      pegIndex: 0, settled: false,
      jitter: this.rng(),
      beatIndex,
    };
  }
}
