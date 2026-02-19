/**
 * GrainRenderer — owns both canvases + all grain/peg/hopper drawing.
 * Copied from GALTON-TIMER.
 */

import type { Particle } from './simulation';
import type { ClockTheme } from './seven-seg';
import {
  Layout, HopperGrain,
  pegX, pegY,
  stackJitterX, stackJitterY,
  computeHopperGrains,
  gaussianHW,
} from './layout';

const PI2 = Math.PI * 2;

const GRAIN_ALPHA = 0.85;
const GRAIN_DIM_ALPHA = 0.45;   // non-accent grains (sub-beats)
const GRAIN_GLOW_ALPHA = 0.06;
const GRAIN_GLOW_SCALE = 3.0;
const STATIC_GRAIN_ALPHA = 1.0;

export class GrainRenderer {
  readonly staticCanvas: HTMLCanvasElement;
  readonly dynamicCanvas: HTMLCanvasElement;
  readonly sCtx: CanvasRenderingContext2D;
  readonly dCtx: CanvasRenderingContext2D;

  private binCounts: number[];
  private hopperGrainCache: HopperGrain[] = [];
  private hopperGrainTopY = 0;
  private hopperFadeAlpha = 1;

  private grainCoreFill = '';
  private grainCoreDimFill = '';
  private grainGlowFill = '';
  private staticGrainFill = '';

  constructor(container: HTMLElement) {
    this.staticCanvas = document.createElement('canvas');
    this.dynamicCanvas = document.createElement('canvas');
    for (const c of [this.staticCanvas, this.dynamicCanvas]) {
      c.style.position = 'absolute';
      c.style.top = '0';
      c.style.left = '0';
      container.appendChild(c);
    }
    this.sCtx = this.staticCanvas.getContext('2d')!;
    this.dCtx = this.dynamicCanvas.getContext('2d')!;
    this.binCounts = [];
  }

  updateGrainColors(theme: ClockTheme): void {
    const [r, g, b] = theme.grainRGB;
    this.grainCoreFill = `rgba(${r},${g},${b},${GRAIN_ALPHA})`;
    this.grainCoreDimFill = `rgba(${r},${g},${b},${GRAIN_DIM_ALPHA})`;
    this.grainGlowFill = `rgba(${r},${g},${b},${GRAIN_GLOW_ALPHA})`;
    this.staticGrainFill = `rgba(${r},${g},${b},${STATIC_GRAIN_ALPHA})`;
  }

  applyLayout(L: Layout, totalParticles: number): void {
    const w = L.width;
    const h = L.height;
    const dpr = L.dpr;

    for (const c of [this.staticCanvas, this.dynamicCanvas]) {
      c.width = w * dpr;
      c.height = h * dpr;
      c.style.width = w + 'px';
      c.style.height = h + 'px';
    }
    this.sCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.dCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.binCounts = new Array(L.numRows + 1).fill(0);
    this.sCtx.clearRect(0, 0, w, h);

    this.hopperGrainCache = computeHopperGrains(L, totalParticles, L.miniGrainR);

    let minY = L.hopperBottom;
    for (const g of this.hopperGrainCache) {
      if (g.y < minY) minY = g.y;
    }
    this.hopperGrainTopY = minY;
  }

  bakeParticle(L: Layout, p: Particle): void {
    const bin = p.bin;
    this.binCounts[bin]++;
    const count = this.binCounts[bin];

    const binX = pegX(L, L.numRows - 1, bin);
    const mr = L.miniGrainR;
    const d = mr * 2.1;
    const rowH = L.stackRowH;
    const maxJitterX = Math.min(4, mr * 2.5);
    const maxJitterY = rowH * 0.18;
    const hexOff = (count % 2 === 0) ? d * 0.5 : 0;
    const jx = stackJitterX(bin, count, maxJitterX);
    const jy = stackJitterY(bin, count, maxJitterY);
    const grainX = binX + hexOff + jx;
    const grainY = L.accBottom - (count - 0.5) * rowH + jy;

    const ctx = this.sCtx;
    ctx.fillStyle = this.staticGrainFill;
    ctx.beginPath();
    ctx.arc(grainX, grainY, mr, 0, PI2);
    ctx.fill();
  }

  rebakeStatic(L: Layout, _theme: ClockTheme): void {
    if (!L) return;
    this.sCtx.clearRect(0, 0, L.width, L.height);
    const mr = L.miniGrainR;
    const d = mr * 2.1;
    const rowH = L.stackRowH;
    const maxJitterX = Math.min(4, mr * 2.5);
    const maxJitterY = rowH * 0.18;

    this.sCtx.fillStyle = this.staticGrainFill;
    this.sCtx.beginPath();
    for (let bin = 0; bin <= L.numRows; bin++) {
      const binX = pegX(L, L.numRows - 1, bin);
      for (let k = 1; k <= this.binCounts[bin]; k++) {
        const hexOff = (k % 2 === 0) ? d * 0.5 : 0;
        const jx = stackJitterX(bin, k, maxJitterX);
        const jy = stackJitterY(bin, k, maxJitterY);
        const gx = binX + hexOff + jx;
        const gy = L.accBottom - (k - 0.5) * rowH + jy;
        this.sCtx.moveTo(gx + mr, gy);
        this.sCtx.arc(gx, gy, mr, 0, PI2);
      }
    }
    this.sCtx.fill();
  }

  drawHopper(
    ctx: CanvasRenderingContext2D, L: Layout,
    emitted: number, total: number,
  ): void {
    const cx = L.centerX;
    ctx.save();
    ctx.globalAlpha = this.hopperFadeAlpha;

    // Funnel outline
    const visTop = Math.max(0, L.hopperTop);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 0.5;
    const nSamples = 40;
    ctx.beginPath();
    for (let i = 0; i <= nSamples; i++) {
      const y = visTop + (L.hopperBottom - visTop) * (i / nSamples);
      const hw = gaussianHW(y, L);
      if (i === 0) ctx.moveTo(cx + hw, y);
      else ctx.lineTo(cx + hw, y);
    }
    for (let i = nSamples; i >= 0; i--) {
      const y = visTop + (L.hopperBottom - visTop) * (i / nSamples);
      const hw = gaussianHW(y, L);
      ctx.lineTo(cx - hw, y);
    }
    ctx.closePath();
    ctx.stroke();

    // Grain fill
    const remaining = Math.max(0, total - emitted);
    const cacheLen = this.hopperGrainCache.length;

    if (remaining > 0 && cacheLen > 0) {
      const r = L.miniGrainR;
      const ratio = remaining / total;
      const progress = 1 - ratio;
      const grainTop = this.hopperGrainTopY;
      const grainH = L.hopperBottom - grainTop;

      const volP = 1 - Math.pow(1 - progress, 1 / 3);
      const centerDrop = volP * grainH * 1.1;
      const edgeDrop = Math.pow(volP, 2.0) * grainH * 1.1;
      const bowlDepth = centerDrop - edgeDrop;
      const noiseAmp = r * 3.5;

      ctx.fillStyle = this.grainGlowFill;
      ctx.beginPath();
      for (let i = 0; i < cacheLen; i++) {
        const g = this.hopperGrainCache[i];
        if (g.y < -r * 3) continue;
        const localHW = gaussianHW(g.y, L);
        const off = Math.min(1, Math.abs(g.x - cx) / localHW);
        const noise = (((i * 2654435761) >>> 0) % 10000 / 10000 - 0.5) * noiseAmp;
        const surfaceY = grainTop + edgeDrop + bowlDepth * (1 - off * off) + noise;
        if (g.y < surfaceY) continue;
        ctx.moveTo(g.x + r * GRAIN_GLOW_SCALE, g.y);
        ctx.arc(g.x, g.y, r * GRAIN_GLOW_SCALE, 0, PI2);
      }
      ctx.fill();

      ctx.fillStyle = this.grainCoreFill;
      ctx.beginPath();
      for (let i = 0; i < cacheLen; i++) {
        const g = this.hopperGrainCache[i];
        if (g.y < -r) continue;
        const localHW = gaussianHW(g.y, L);
        const off = Math.min(1, Math.abs(g.x - cx) / localHW);
        const noise = (((i * 2654435761) >>> 0) % 10000 / 10000 - 0.5) * noiseAmp;
        const surfaceY = grainTop + edgeDrop + bowlDepth * (1 - off * off) + noise;
        if (g.y < surfaceY) continue;
        ctx.moveTo(g.x + r, g.y);
        ctx.arc(g.x, g.y, r, 0, PI2);
      }
      ctx.fill();
    }

    // Nozzle stream
    if (remaining > 0) {
      const now = performance.now();
      const r = L.miniGrainR;
      const streamCount = remaining < 10 ? Math.max(1, Math.ceil(remaining / 3)) : 4;
      for (let i = 0; i < streamCount; i++) {
        const phase = ((now * 0.003 + i * 0.25) % 1);
        const sy = L.hopperBottom + (L.emitY - L.hopperBottom) * phase;
        ctx.globalAlpha = 0.4 * (1 - phase * 0.8);
        ctx.fillStyle = this.grainCoreFill;
        ctx.beginPath();
        ctx.arc(cx, sy, r * 0.7, 0, PI2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  drawPegs(ctx: CanvasRenderingContext2D, L: Layout, theme: ClockTheme, pegAlphaOverride?: number, beatPhase: number = 0): void {
    const [pr, pg, pb] = theme.segmentRGB;
    const alpha = pegAlphaOverride !== undefined ? pegAlphaOverride : 0.15;
    const themeWeight = (pegAlphaOverride !== undefined && pegAlphaOverride > 0.5) ? 0.6 : 0.3;
    const grayWeight = 1 - themeWeight;
    const blendR = Math.round(pr * themeWeight + 180 * grayWeight);
    const blendG = Math.round(pg * themeWeight + 180 * grayWeight);
    const blendB = Math.round(pb * themeWeight + 180 * grayWeight);

    // Base pass: all pegs at normal alpha
    ctx.fillStyle = `rgba(${blendR},${blendG},${blendB},${alpha.toFixed(3)})`;
    ctx.beginPath();
    for (let row = 0; row < L.numRows; row++) {
      for (let j = 0; j <= row; j++) {
        const x = pegX(L, row, j);
        const y = pegY(L, row);
        ctx.moveTo(x + L.pegRadius, y);
        ctx.arc(x, y, L.pegRadius, 0, PI2);
      }
    }
    ctx.fill();

    // Glow pass: concentric pulse wave from center outward
    if (beatPhase > 0 && pegAlphaOverride === undefined) {
      const cx = L.centerX;
      const cy = L.boardTop + (L.boardBottom - L.boardTop) * (2 / 3);
      let maxDist = 0;
      for (let row = 0; row < L.numRows; row++) {
        for (let j = 0; j <= row; j++) {
          const px = pegX(L, row, j);
          const py = pegY(L, row);
          const d = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
          if (d > maxDist) maxDist = d;
        }
      }
      if (maxDist < 1) maxDist = 1;

      const waveRadius = maxDist * beatPhase;
      const thickness = L.pegSpacing * 1.5;

      for (let row = 0; row < L.numRows; row++) {
        for (let j = 0; j <= row; j++) {
          const px = pegX(L, row, j);
          const py = pegY(L, row);
          const dist = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
          const proximity = 1 - Math.abs(dist - waveRadius) / thickness;
          if (proximity <= 0) continue;
          const glowAlpha = proximity * (1 - beatPhase * 0.6) * 0.45;
          if (glowAlpha <= 0) continue;
          ctx.fillStyle = `rgba(${pr},${pg},${pb},${glowAlpha.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(px, py, L.pegRadius * 1.8, 0, PI2);
          ctx.fill();
        }
      }
    }
  }

  drawParticles(ctx: CanvasRenderingContext2D, L: Layout, particles: Particle[]): void {
    if (particles.length === 0) return;
    const r = L.grainRadius;

    // Glow pass — all particles
    ctx.fillStyle = this.grainGlowFill;
    ctx.beginPath();
    for (const p of particles) {
      ctx.moveTo(p.x + r * GRAIN_GLOW_SCALE, p.y);
      ctx.arc(p.x, p.y, r * GRAIN_GLOW_SCALE, 0, PI2);
    }
    ctx.fill();

    // Core pass — non-accent (dimmer sub-beat grains)
    ctx.fillStyle = this.grainCoreDimFill;
    ctx.beginPath();
    for (const p of particles) {
      if (p.isAccent) continue;
      ctx.moveTo(p.x + r, p.y);
      ctx.arc(p.x, p.y, r, 0, PI2);
    }
    ctx.fill();

    // Core pass — accent (bright downbeat grains)
    ctx.fillStyle = this.grainCoreFill;
    ctx.beginPath();
    for (const p of particles) {
      if (!p.isAccent) continue;
      ctx.moveTo(p.x + r, p.y);
      ctx.arc(p.x, p.y, r, 0, PI2);
    }
    ctx.fill();
  }

  clearStatic(L: Layout): void {
    this.binCounts.fill(0);
    this.sCtx.clearRect(0, 0, L.width, L.height);
  }

  beginHopperFade(): void { this.hopperFadeAlpha = 1; }
  setHopperFadeAlpha(a: number): void { this.hopperFadeAlpha = a; }
  resetHopperFade(): void { this.hopperFadeAlpha = 1; }

  fillStacks(L: Layout, numRows: number, totalParticles: number, theme: ClockTheme): void {
    const n = numRows;
    const numBins = n + 1;
    this.binCounts = new Array(numBins).fill(0);

    const lnFact: number[] = new Array(n + 1);
    lnFact[0] = 0;
    for (let i = 1; i <= n; i++) lnFact[i] = lnFact[i - 1] + Math.log(i);

    const probs: number[] = new Array(numBins);
    let placed = 0;
    for (let k = 0; k < numBins; k++) {
      probs[k] = Math.exp(lnFact[n] - lnFact[k] - lnFact[n - k] - n * Math.LN2);
      this.binCounts[k] = Math.round(probs[k] * totalParticles);
      placed += this.binCounts[k];
    }
    const centerBin = Math.floor(numBins / 2);
    this.binCounts[centerBin] += totalParticles - placed;
    this.rebakeStatic(L, theme);
  }

  drawPegsTransformed(
    ctx: CanvasRenderingContext2D,
    L: Layout,
    theme: ClockTheme,
    beatPhase: number,
    offsetX: number,
    flipY: boolean,
  ): void {
    ctx.save();
    ctx.translate(offsetX, 0);
    if (flipY) {
      const cy = (L.boardTop + L.boardBottom) / 2;
      ctx.translate(0, 2 * cy);
      ctx.scale(1, -1);
    }
    this.drawPegs(ctx, L, theme, undefined, beatPhase);
    ctx.restore();
  }

  drawParticlesTransformed(
    ctx: CanvasRenderingContext2D,
    L: Layout,
    particles: Particle[],
    offsetX: number,
    flipY: boolean,
  ): void {
    if (particles.length === 0) return;
    ctx.save();
    ctx.translate(offsetX, 0);
    if (flipY) {
      const cy = (L.boardTop + L.boardBottom) / 2;
      ctx.translate(0, 2 * cy);
      ctx.scale(1, -1);
    }
    this.drawParticles(ctx, L, particles);
    ctx.restore();
  }

  getGroundY(L: Layout, x: number): number {
    const numBins = L.numRows + 1;
    let nearestBin = 0;
    let minDist = Infinity;
    for (let b = 0; b < numBins; b++) {
      const bx = pegX(L, L.numRows - 1, b);
      const dist = Math.abs(x - bx);
      if (dist < minDist) { minDist = dist; nearestBin = b; }
    }
    return L.accBottom - this.binCounts[nearestBin] * L.stackRowH;
  }
}
