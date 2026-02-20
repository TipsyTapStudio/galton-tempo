/**
 * AppRenderer for GALTON-TEMPO.
 * Adapted from GALTON-TIMER: BPM display instead of countdown, bar counter.
 */

import type { Particle, BoardGeom } from './simulation';
import { drawBPM, getThemeByName, CLOCK_THEMES } from './seven-seg';
import type { ClockTheme } from './seven-seg';
import { computeLayout, pegX, pegY } from './layout';
import type { Layout } from './layout';
import { GrainRenderer } from './grain-renderer';
import type { CloneState } from './clone-system';
import { drawHUD } from './perf-hud';
import type { PerfStats } from './perf-hud';

export class Renderer {
  layout!: Layout;
  private gr: GrainRenderer;
  private totalParticles: number;

  private currentTheme: ClockTheme = CLOCK_THEMES[0];

  constructor(
    container: HTMLElement,
    numRows: number,
    totalParticles: number,
  ) {
    this.totalParticles = totalParticles;
    this.gr = new GrainRenderer(container);
    this.gr.updateGrainColors(this.currentTheme);
    this.resize(numRows);
  }

  setTheme(theme: ClockTheme): void {
    this.currentTheme = theme;
    this.gr.updateGrainColors(theme);
    const [r, g, b] = theme.segmentRGB;
    document.documentElement.style.setProperty('--bg',
      `rgb(${Math.round(r * 0.02)},${Math.round(g * 0.02)},${Math.round(b * 0.02)})`);
    this.gr.rebakeStatic(this.layout, theme);
  }

  setThemeByName(name: string): void {
    this.setTheme(getThemeByName(name));
  }

  getTheme(): ClockTheme {
    return this.currentTheme;
  }

  resize(numRows: number, totalParticles?: number): void {
    if (totalParticles !== undefined) this.totalParticles = totalParticles;
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.layout = computeLayout(w, h, dpr, numRows, this.totalParticles);
    this.gr.applyLayout(this.layout, this.totalParticles);
  }

  pegX(row: number, index: number): number { return pegX(this.layout, row, index); }
  pegY(row: number): number { return pegY(this.layout, row); }

  getGeom(): BoardGeom {
    return {
      emitX: this.layout.centerX,
      emitY: this.layout.emitY,
      pegX: (r, i) => this.pegX(r, i),
      pegY: (r) => this.pegY(r),
      pegSpacing: this.layout.pegSpacing,
      numRows: this.layout.numRows,
      accBottom: this.layout.accBottom,
    };
  }

  getGroundY(x: number): number {
    return this.gr.getGroundY(this.layout, x);
  }

  bakeParticle(p: Particle): void {
    this.gr.bakeParticle(this.layout, p);
  }

  drawFrame(
    particles: Particle[],
    bpm: number,
    totalParticles: number,
    emittedCount: number,
    currentBar: number,
    totalBars: number,
    beatInBar: number,
    beatPhase: number = 0,
    cloneStates: CloneState[] = [],
  ): void {
    const L = this.layout;
    const ctx = this.gr.dCtx;
    ctx.clearRect(0, 0, L.width, L.height);

    // Clone band (behind main board)
    for (const cs of cloneStates) {
      this.gr.drawPegsTransformed(ctx, L, this.currentTheme, cs.beatPhase, cs.config.offsetX, cs.config.flipY);
      ctx.globalAlpha = cs.grainAlpha;
      this.gr.drawParticlesTransformed(ctx, L, particles, cs.config.offsetX, cs.config.flipY);
      ctx.globalAlpha = 1;
    }

    // Progress bar
    if (totalParticles > 0) {
      const progress = Math.min(1, emittedCount / totalParticles);
      const [r, g, b] = this.currentTheme.segmentRGB;
      ctx.fillStyle = `rgba(${r},${g},${b},0.60)`;
      ctx.fillRect(0, 0, L.width * progress, 2);
    }

    // BPM display
    const [lr, lg, lb] = this.currentTheme.segmentRGB;
    const digitH = Math.max(16, Math.min(L.width * 0.04, L.height * 0.04));
    const elementGap = digitH * 0.4;
    const bpmY = L.inlineTimerY;
    drawBPM(ctx, bpm, L.centerX, bpmY, digitH, this.currentTheme);

    // Beat indicator dots (4 dots, current one highlighted)
    const dotR = Math.max(2.5, digitH * 0.08);
    const dotGap = dotR * 4.5;
    const dotY = bpmY + digitH / 2 + elementGap + dotR;
    const dotsStartX = L.centerX - (3 * dotGap) / 2;
    for (let i = 0; i < 4; i++) {
      const dx = dotsStartX + i * dotGap;
      const isActive = i === beatInBar;
      ctx.fillStyle = isActive
        ? `rgba(${lr},${lg},${lb},0.9)`
        : `rgba(${lr},${lg},${lb},0.12)`;
      ctx.beginPath();
      ctx.arc(dx, dotY, isActive ? dotR * 1.5 : dotR, 0, Math.PI * 2);
      ctx.fill();
    }

    // Bars counter (split-anchor: right-align left of "/", left-align right)
    const barsFontSize = Math.max(9, digitH * 0.55);
    const barsY = dotY + dotR * 1.5 + elementGap + barsFontSize * 0.35;
    ctx.font = `${barsFontSize}px monospace`;
    ctx.fillStyle = `rgba(${lr},${lg},${lb},0.45)`;
    ctx.textAlign = 'right';
    ctx.fillText(`${currentBar + 1} `, L.centerX, barsY);
    ctx.textAlign = 'left';
    ctx.fillText(`/ ${totalBars}`, L.centerX, barsY);

    // Hopper
    this.gr.drawHopper(ctx, L, emittedCount, totalParticles);

    // Pegs
    this.gr.drawPegs(ctx, L, this.currentTheme, undefined, beatPhase);

    // Moving particles
    this.gr.drawParticles(ctx, L, particles);
  }

  clearStatic(): void {
    this.gr.clearStatic(this.layout);
  }

  fillStacks(numRows: number, totalParticles: number): void {
    this.gr.fillStacks(this.layout, numRows, totalParticles, this.currentTheme);
  }

  drawDebugHUD(stats: PerfStats): void {
    drawHUD(this.gr.dCtx, stats, this.layout.height);
  }

  beginHopperFade(): void { this.gr.beginHopperFade(); }
  setHopperFadeAlpha(a: number): void { this.gr.setHopperFadeAlpha(a); }
  resetHopperFade(): void { this.gr.resetHopperFade(); }
}

export { CLOCK_THEMES, getThemeByName };
export type { ClockTheme, Layout, CloneState };
