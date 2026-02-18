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
  ): void {
    const L = this.layout;
    const ctx = this.gr.dCtx;
    ctx.clearRect(0, 0, L.width, L.height);

    // Progress bar
    if (totalParticles > 0) {
      const progress = Math.min(1, emittedCount / totalParticles);
      const [r, g, b] = this.currentTheme.segmentRGB;
      ctx.fillStyle = `rgba(${r},${g},${b},0.60)`;
      ctx.fillRect(0, 0, L.width * progress, 2);
    }

    // BPM display (smaller, above hopper)
    const digitH = Math.min(L.width * 0.08, L.height * 0.10);
    const bpmY = Math.max(digitH * 0.6, L.hopperTop - digitH * 0.8);
    drawBPM(ctx, bpm, L.centerX, bpmY, digitH, this.currentTheme);

    // "BPM" label below digits
    const [lr, lg, lb] = this.currentTheme.segmentRGB;
    ctx.fillStyle = `rgba(${lr},${lg},${lb},0.25)`;
    ctx.font = `400 ${Math.max(10, digitH * 0.12)}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('BPM', L.centerX, bpmY + digitH / 2 + digitH * 0.15);

    // Bar counter (inline, above hopper)
    const barText = `BAR ${currentBar + 1} / ${totalBars}`;
    ctx.fillStyle = `rgba(${lr},${lg},${lb},0.35)`;
    ctx.font = `500 ${Math.max(10, L.height * 0.018)}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(barText, L.centerX, L.inlineTimerY);

    // Beat indicator dots (4 dots, current one highlighted)
    const dotY = L.inlineTimerY + L.height * 0.025;
    const dotR = Math.max(2, L.height * 0.004);
    const dotGap = dotR * 4;
    const dotsStartX = L.centerX - (3 * dotGap) / 2;
    for (let i = 0; i < 4; i++) {
      const dx = dotsStartX + i * dotGap;
      const isActive = i === beatInBar;
      ctx.fillStyle = isActive
        ? `rgba(${lr},${lg},${lb},0.9)`
        : `rgba(${lr},${lg},${lb},0.15)`;
      ctx.beginPath();
      ctx.arc(dx, dotY, isActive ? dotR * 1.3 : dotR, 0, Math.PI * 2);
      ctx.fill();
    }

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

  beginHopperFade(): void { this.gr.beginHopperFade(); }
  setHopperFadeAlpha(a: number): void { this.gr.setHopperFadeAlpha(a); }
  resetHopperFade(): void { this.gr.resetHopperFade(); }
}

export { CLOCK_THEMES, getThemeByName };
export type { ClockTheme, Layout };
