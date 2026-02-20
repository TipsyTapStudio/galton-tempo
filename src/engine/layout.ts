/**
 * Pure geometry — no canvas, no DOM.
 * Copied from GALTON-TIMER with minor adjustments.
 */

import { maxBinProbability } from './simulation';

export const SQRT3_2 = Math.sqrt(3) / 2;

export interface Layout {
  width: number;
  height: number;
  dpr: number;
  centerX: number;
  contentW: number;
  hopperTop: number;
  hopperJunction: number;
  hopperBottom: number;
  hopperRectHW: number;
  hopperTopHW: number;
  nozzleHW: number;
  hopperSigma: number;
  emitY: number;
  boardTop: number;
  boardBottom: number;
  accTop: number;
  accBottom: number;
  accHeight: number;
  inlineTimerY: number;
  pegSpacing: number;
  rowSpacingY: number;
  numRows: number;
  pegRadius: number;
  grainRadius: number;
  settledDiameter: number;
  settledRadius: number;
  stackScale: number;
  stackRowH: number;
  miniGrainR: number;
}

export function computeLayout(
  w: number, h: number, dpr: number,
  numRows: number, totalParticles: number,
): Layout {
  const centerX = w / 2;
  const marginX = w * 0.15;
  const contentW = w - marginX * 2;

  const topMargin = h * 0.05;
  const bottomMargin = h * 0.15;
  const safeH = h - topMargin - bottomMargin;

  const dxFromWidth = contentW / (numRows + 2);
  const inlineTimerH = h * 0.08;  // BPM + beat dots + bars counter
  const gapBudget = h * 0.03;
  const availableForSystem = safeH - inlineTimerH - gapBudget;

  const boardH_target = availableForSystem * 3 / 5;
  const dxFromRatio = numRows > 1
    ? boardH_target / ((numRows - 1) * SQRT3_2)
    : dxFromWidth;

  const pegSpacing = Math.min(dxFromWidth, dxFromRatio);
  const rowSpacingY = pegSpacing * SQRT3_2;
  const boardH = numRows > 1 ? (numRows - 1) * rowSpacingY : 0;

  const grainRadius = Math.max(3.0, Math.min(8.0, pegSpacing * 0.25));
  const pegRadius = Math.max(1.5, Math.min(5.0, pegSpacing * 0.12));

  const nozzleHW = pegSpacing * 0.8;
  const gridHW = (numRows * pegSpacing) / 2;
  const hopperTopHW = Math.max(pegSpacing * 4, gridHW * 1.3);
  const hopperRectHW = hopperTopHW;

  const taperH = Math.min(safeH * 0.25, Math.max(boardH / 3, pegSpacing * 2.5));

  const hopperToGrid = Math.min(h * 0.03, Math.max(pegSpacing * 0.6, h * 0.012));
  const gridToAcc = Math.min(h * 0.03, Math.max(pegSpacing * 0.7, h * 0.015));

  const accBottom = h - bottomMargin;
  const aboveAccH = inlineTimerH + taperH + hopperToGrid + boardH + gridToAcc;
  const accHeight_available = safeH - aboveAccH;
  const accHeight = Math.max(h * 0.06, Math.min(accHeight_available, boardH / 2));

  const maxProb = maxBinProbability(numRows);
  const maxBinCount = maxProb * totalParticles * 1.15;

  const accTop = accBottom - accHeight;
  const boardBottom = accTop - gridToAcc;
  const boardTopY = boardBottom - boardH;
  const hopperBottom = boardTopY - hopperToGrid;
  const hopperTop = hopperBottom - taperH;
  const hopperJunction = hopperTop;
  const emitY = hopperBottom + hopperToGrid * 0.55;
  const inlineTimerY = Math.max(topMargin + inlineTimerH * 0.35, hopperTop - inlineTimerH * 0.9);

  const stackScale = (accHeight * 0.85) / (maxProb * totalParticles);

  const d_natural = grainRadius * 1.6;
  const rowH_natural = d_natural * SQRT3_2;
  const peakCeiling = accHeight * 0.95;
  const stackRowH = maxBinCount > 0
    ? Math.min(rowH_natural, peakCeiling / maxBinCount)
    : rowH_natural;

  const miniGrainR = Math.max(1.5, grainRadius * 0.55);

  // Vertical centering
  let finalHopperTop = hopperTop;
  let finalHopperJunction = hopperJunction;
  let finalHopperBottom = hopperBottom;
  let finalEmitY = emitY;
  let finalBoardTop = boardTopY;
  let finalBoardBottom = boardBottom;
  let finalAccTop = accTop;
  let finalAccBottom = accBottom;
  let finalInlineTimerY = inlineTimerY;

  const contentTop = finalInlineTimerY - inlineTimerH * 0.5;
  const contentBottom = finalAccBottom;
  const totalContentH = contentBottom - contentTop;
  const idealOffsetY = (h - totalContentH) / 2 - contentTop;
  const uiSafeBottom = h * 0.12;
  const maxOffset = (h - uiSafeBottom) - finalAccBottom;
  const minOffset = topMargin - contentTop;
  const offsetY = Math.max(minOffset, Math.min(idealOffsetY, maxOffset));

  finalHopperTop += offsetY;
  finalHopperJunction += offsetY;
  finalHopperBottom += offsetY;
  finalEmitY += offsetY;
  finalBoardTop += offsetY;
  finalBoardBottom += offsetY;
  finalAccTop += offsetY;
  finalAccBottom += offsetY;
  finalInlineTimerY += offsetY;

  return {
    width: w, height: h, dpr, centerX, contentW,
    hopperTop: finalHopperTop,
    hopperJunction: finalHopperJunction,
    hopperBottom: finalHopperBottom,
    hopperRectHW, hopperTopHW: hopperRectHW, nozzleHW,
    hopperSigma: taperH * 0.47 / pegSpacing,
    emitY: finalEmitY,
    boardTop: finalBoardTop, boardBottom: finalBoardBottom,
    accTop: finalAccTop, accBottom: finalAccBottom, accHeight,
    inlineTimerY: finalInlineTimerY,
    pegSpacing, rowSpacingY, numRows, pegRadius,
    grainRadius, settledDiameter: stackRowH,
    settledRadius: stackRowH / 2,
    stackScale, stackRowH, miniGrainR,
  };
}

export function pegX(L: Layout, row: number, index: number): number {
  return L.centerX + (index - row / 2) * L.pegSpacing;
}

export function pegY(L: Layout, row: number): number {
  return L.boardTop + row * L.rowSpacingY;
}

export function gaussianHW(y: number, L: Layout): number {
  const totalH = L.hopperBottom - L.hopperTop;
  if (totalH <= 0) return L.nozzleHW;
  const t = Math.max(0, Math.min(1, (L.hopperBottom - y) / totalH));
  const sigPx = L.hopperSigma * L.pegSpacing;
  const d = t * totalH;
  const gaussVal = 1 - Math.exp(-(d * d) / (2 * sigPx * sigPx));
  return L.nozzleHW + (L.hopperTopHW - L.nozzleHW) * gaussVal;
}

export interface HopperGrain { x: number; y: number; }

const HOPPER_GRAIN_CAP = 500;

export function computeHopperGrains(
  L: Layout, totalCount: number, grainR: number,
): HopperGrain[] {
  const grains: HopperGrain[] = [];
  const displayCount = Math.min(totalCount, HOPPER_GRAIN_CAP);
  const d = grainR * 2.1;
  const rowH = d * SQRT3_2;
  const cx = L.centerX;

  let row = 0;
  let y = L.hopperBottom - grainR * 1.5;

  while (grains.length < displayCount) {
    const clipMargin = Math.max(grainR * 3, (L.hopperBottom - L.hopperTop) * 0.25);
    if (y < L.hopperTop + clipMargin) break;
    const hw = gaussianHW(y, L);
    const usableW = hw * 0.88;
    const xOff = (row % 2 === 1) ? d * 0.5 : 0;
    const nCols = Math.max(1, Math.floor((usableW * 2) / d));

    for (let c = 0; c < nCols && grains.length < displayCount; c++) {
      const gx = cx - usableW + xOff + c * d + grainR;
      const seed = (row * 1009 + c * 7919 + 31337) & 0x7fffffff;
      const jx = ((seed % 1000) / 1000 - 0.5) * grainR * 0.5;
      const jy = (((seed * 1103515245 + 12345) & 0x7fffffff) % 1000 / 1000 - 0.5) * grainR * 0.4;
      grains.push({ x: gx + jx, y: y + jy });
    }

    y -= rowH;
    row++;
  }
  return grains;
}

export function stackJitterX(bin: number, k: number, maxJitter: number): number {
  const hash = ((bin * 2654435761 + k * 340573321) >>> 0) & 0x7fffffff;
  return (hash % 10000 / 10000 - 0.5) * 2 * maxJitter;
}

export function stackJitterY(bin: number, k: number, maxJitter: number): number {
  const hash = ((bin * 1103515245 + k * 1299709) >>> 0) & 0x7fffffff;
  return (hash % 10000 / 10000 - 0.5) * 2 * maxJitter;
}
