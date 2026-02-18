/**
 * Seven-segment neon clock renderer.
 *
 * Segment layout:
 *   ─a─
 *  │   │
 *  f   b
 *  │   │
 *   ─g─
 *  │   │
 *  e   c
 *  │   │
 *   ─d─
 *
 * Rendering: no shadowBlur. Glow via multi-pass overlay at scaled width.
 * Ultra-thin segments — glow is the star, core is the whisper.
 */

// ── Segment map: [a,b,c,d,e,f,g] per digit 0-9 ──

export const DIGIT_SEGMENTS: boolean[][] = [
  [true,  true,  true,  true,  true,  true,  false], // 0
  [false, true,  true,  false, false, false, false], // 1
  [true,  true,  false, true,  true,  false, true],  // 2
  [true,  true,  true,  true,  false, false, true],  // 3
  [false, true,  true,  false, false, true,  true],  // 4
  [true,  false, true,  true,  false, true,  true],  // 5
  [true,  false, true,  true,  true,  true,  true],  // 6
  [true,  true,  true,  false, false, false, false], // 7
  [true,  true,  true,  true,  true,  true,  true],  // 8
  [true,  true,  true,  true,  false, true,  true],  // 9
];

// ── Theme interface ──

export interface ClockTheme {
  name: string;
  segmentRGB: [number, number, number];
  grainRGB: [number, number, number];
  glowIntensity: number;
}

export const CLOCK_THEMES: ClockTheme[] = [
  { name: 'Tempo',  segmentRGB: [255, 20, 147],   grainRGB: [255, 120, 190], glowIntensity: 1.2 },
  { name: 'Nixie',  segmentRGB: [255, 147, 41],  grainRGB: [255, 180, 100], glowIntensity: 1.2 },
  { name: 'System', segmentRGB: [0, 255, 65],     grainRGB: [120, 255, 140], glowIntensity: 0.8 },
  { name: 'Studio', segmentRGB: [220, 220, 230],  grainRGB: [230, 230, 240], glowIntensity: 1.0 },
  { name: 'Cyber',  segmentRGB: [0, 150, 255],    grainRGB: [80, 180, 255],  glowIntensity: 1.0 },
];

export function getThemeByName(name: string): ClockTheme {
  const lower = name.toLowerCase();
  return CLOCK_THEMES.find(t => t.name.toLowerCase() === lower) || CLOCK_THEMES[0];
}

// ── Segment geometry helpers ──

function drawSegmentPath(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  w: number, h: number,
  segIndex: number,
  thickness: number,
): void {
  const ht = thickness / 2;
  const margin = thickness * 0.3;

  let sx: number, sy: number, len: number, horizontal: boolean;

  switch (segIndex) {
    case 0: sx = x + margin; sy = y; len = w - margin * 2; horizontal = true; break;
    case 1: sx = x + w; sy = y + margin; len = h / 2 - margin * 2; horizontal = false; break;
    case 2: sx = x + w; sy = y + h / 2 + margin; len = h / 2 - margin * 2; horizontal = false; break;
    case 3: sx = x + margin; sy = y + h; len = w - margin * 2; horizontal = true; break;
    case 4: sx = x; sy = y + h / 2 + margin; len = h / 2 - margin * 2; horizontal = false; break;
    case 5: sx = x; sy = y + margin; len = h / 2 - margin * 2; horizontal = false; break;
    case 6: sx = x + margin; sy = y + h / 2; len = w - margin * 2; horizontal = true; break;
    default: return;
  }

  if (horizontal) {
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + ht, sy - ht);
    ctx.lineTo(sx + len - ht, sy - ht);
    ctx.lineTo(sx + len, sy);
    ctx.lineTo(sx + len - ht, sy + ht);
    ctx.lineTo(sx + ht, sy + ht);
    ctx.closePath();
  } else {
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx - ht, sy + ht);
    ctx.lineTo(sx - ht, sy + len - ht);
    ctx.lineTo(sx, sy + len);
    ctx.lineTo(sx + ht, sy + len - ht);
    ctx.lineTo(sx + ht, sy + ht);
    ctx.closePath();
  }
}

// ── Public drawing functions ──

export function drawDigit(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  w: number, h: number,
  segments: boolean[],
  rgb: [number, number, number],
  glowIntensity: number,
): void {
  const thickness = Math.max(1.2, w * 0.07);

  const glowScales = [5.5, 4.5, 3.5, 2.8, 2.2, 1.8];
  const glowAlphaFactors = [0.5, 0.7, 1.0, 1.0, 1.2, 1.2];

  for (let s = 0; s < 7; s++) {
    if (segments[s]) {
      const glowAlpha = 0.09 * glowIntensity;
      for (let pass = 0; pass < 6; pass++) {
        ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${(glowAlpha * glowAlphaFactors[pass]).toFixed(4)})`;
        ctx.beginPath();
        drawSegmentPath(ctx, x, y, w, h, s, thickness * glowScales[pass]);
        ctx.fill();
      }

      ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.85)`;
      ctx.beginPath();
      drawSegmentPath(ctx, x, y, w, h, s, thickness);
      ctx.fill();
    } else {
      ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.02)`;
      ctx.beginPath();
      drawSegmentPath(ctx, x, y, w, h, s, thickness);
      ctx.fill();
    }
  }
}

/**
 * Draw BPM value centered at (cx, cy) using seven-segment digits.
 */
export function drawBPM(
  ctx: CanvasRenderingContext2D,
  bpm: number,
  cx: number, cy: number,
  digitH: number,
  theme: ClockTheme,
): void {
  const digits = String(Math.round(bpm)).split('').map(Number);
  const digitW = digitH * 0.50;
  const gap = digitW * 0.35;

  const rgb = theme.segmentRGB;
  const glow = theme.glowIntensity;

  const totalW = digits.length * digitW + (digits.length - 1) * gap;
  let dx = cx - totalW / 2;
  const startY = cy - digitH / 2;

  for (const d of digits) {
    drawDigit(ctx, dx, startY, digitW, digitH, DIGIT_SEGMENTS[d], rgb, glow);
    dx += digitW + gap;
  }
}

/**
 * Draw clock centered at (cx, cy).
 */
export function drawClock(
  ctx: CanvasRenderingContext2D,
  totalSec: number,
  cx: number, cy: number,
  digitH: number,
  theme: ClockTheme,
  centiseconds?: number,
  showHours?: boolean,
): void {
  const hh = Math.floor(totalSec / 3600);
  const mm = Math.floor((totalSec % 3600) / 60);
  const ss = Math.floor(totalSec % 60);

  const digitW = digitH * 0.50;
  const pairGap = digitW * 0.35;
  const groupGap = digitW * 1.3;

  const rgb = theme.segmentRGB;
  const glow = theme.glowIntensity;

  let groups: number[][];
  if (centiseconds !== undefined) {
    groups = [
      [Math.floor(mm / 10), mm % 10],
      [Math.floor(ss / 10), ss % 10],
      [Math.floor(centiseconds / 10), centiseconds % 10],
    ];
  } else if (hh > 0 || showHours) {
    groups = [
      [Math.floor(hh / 10), hh % 10],
      [Math.floor(mm / 10), mm % 10],
      [Math.floor(ss / 10), ss % 10],
    ];
  } else {
    groups = [
      [Math.floor(mm / 10), mm % 10],
      [Math.floor(ss / 10), ss % 10],
    ];
  }

  const numGroups = groups.length;
  const pairW = digitW * 2 + pairGap;
  const totalW = pairW * numGroups + groupGap * (numGroups - 1);
  const startX = cx - totalW / 2;
  const startY = cy - digitH / 2;

  let dx = startX;
  const dotR = Math.max(1.2, digitW * 0.08);

  for (let g = 0; g < numGroups; g++) {
    const [d1, d2] = groups[g];
    drawDigit(ctx, dx, startY, digitW, digitH, DIGIT_SEGMENTS[d1], rgb, glow);
    dx += digitW + pairGap;
    drawDigit(ctx, dx, startY, digitW, digitH, DIGIT_SEGMENTS[d2], rgb, glow);
    dx += digitW;

    if (g < numGroups - 1) {
      const colonX = dx + groupGap / 2;
      // Colon dots
      const topY = cy - digitH * 0.20;
      const botY = cy + digitH * 0.20;
      const glowAlpha = 0.09 * glow;
      for (const dy of [topY, botY]) {
        for (let pass = 0; pass < 3; pass++) {
          const scale = [3.0, 2.2, 1.6][pass];
          const factor = [0.6, 0.9, 1.1][pass];
          ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${(glowAlpha * factor).toFixed(4)})`;
          ctx.beginPath();
          ctx.arc(colonX, dy, dotR * scale, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.4)`;
        ctx.beginPath();
        ctx.arc(colonX, dy, dotR, 0, Math.PI * 2);
        ctx.fill();
      }
      dx += groupGap;
    }
  }
}
