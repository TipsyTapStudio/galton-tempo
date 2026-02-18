"use strict";
(() => {
  // src/utils/url-params.ts
  var VALID_SOUNDS = ["click", "kick", "both"];
  var VALID_THEMES = ["tempo", "nixie", "system", "studio", "cyber"];
  var VALID_MODES = ["standard", "heavy sand", "techno", "moon gravity", "super ball"];
  var DEFAULTS = {
    bpm: 120,
    bars: 16,
    rows: 24,
    s: 0,
    sound: "click",
    theme: "tempo",
    mode: "standard"
  };
  function readParams() {
    const sp = new URLSearchParams(window.location.search);
    const raw = (key, fallback) => {
      const v = sp.get(key);
      if (v === null) return fallback;
      const num = parseInt(v, 10);
      return Number.isFinite(num) ? num : fallback;
    };
    let seed = raw("s", DEFAULTS.s);
    if (seed === 0) {
      seed = Date.now() % 1e6 | 1;
    }
    const soundRaw = (sp.get("sound") || DEFAULTS.sound).toLowerCase().trim();
    const sound = VALID_SOUNDS.includes(soundRaw) ? soundRaw : DEFAULTS.sound;
    const themeRaw = (sp.get("theme") || DEFAULTS.theme).toLowerCase().trim();
    const theme = VALID_THEMES.includes(themeRaw) ? themeRaw : DEFAULTS.theme;
    const modeRaw = (sp.get("mode") || DEFAULTS.mode).toLowerCase().trim();
    const mode = VALID_MODES.includes(modeRaw) ? modeRaw : DEFAULTS.mode;
    return {
      bpm: Math.max(20, Math.min(300, raw("bpm", DEFAULTS.bpm))),
      bars: Math.max(1, Math.min(999, raw("bars", DEFAULTS.bars))),
      rows: Math.max(4, Math.min(64, raw("rows", DEFAULTS.rows))),
      s: seed,
      sound,
      theme,
      mode
    };
  }
  function writeParams(cfg) {
    const sp = new URLSearchParams();
    sp.set("bpm", String(cfg.bpm));
    sp.set("bars", String(cfg.bars));
    sp.set("rows", String(cfg.rows));
    sp.set("s", String(cfg.s));
    sp.set("sound", cfg.sound);
    sp.set("theme", cfg.theme);
    sp.set("mode", cfg.mode);
    const url = `${window.location.pathname}?${sp.toString()}`;
    window.history.replaceState(null, "", url);
  }

  // src/utils/seed.ts
  function createPRNG(seed) {
    let s = seed | 0;
    return () => {
      s |= 0;
      s = s + 1831565813 | 0;
      let t = Math.imul(s ^ s >>> 15, 1 | s);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // src/engine/simulation.ts
  var PRESETS = {
    "Standard": {
      restitution: 0.2,
      restitutionRange: 0.08,
      nudge: 0.08,
      dragX: 3,
      dragY: 1.5,
      dragXSettle: 6,
      dragYSettle: 3,
      gravity: 800
    },
    "Heavy Sand": {
      restitution: 0.01,
      restitutionRange: 0.02,
      nudge: 0.1,
      dragX: 6,
      dragY: 2,
      dragXSettle: 14,
      dragYSettle: 7,
      gravity: 1400
    },
    "Techno": {
      restitution: 0,
      restitutionRange: 0,
      nudge: 0.15,
      dragX: 10,
      dragY: 1,
      dragXSettle: 18,
      dragYSettle: 4,
      gravity: 1600
    },
    "Moon Gravity": {
      restitution: 0.08,
      restitutionRange: 0.03,
      nudge: 0.12,
      dragX: 2,
      dragY: 0.08,
      dragXSettle: 3,
      dragYSettle: 0.8,
      gravity: 50
    },
    "Super Ball": {
      restitution: 0.7,
      restitutionRange: 0.15,
      nudge: 0.04,
      dragX: 0.8,
      dragY: 0.4,
      dragXSettle: 2.5,
      dragYSettle: 1.2,
      gravity: 800
    }
  };
  var PHYSICS = { ...PRESETS["Standard"] };
  function fract(x) {
    return x - Math.floor(x);
  }
  function timeToHit(y, vy, g, targetY) {
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
  function maxBinProbability(numRows) {
    const k = Math.floor(numRows / 2);
    let logC = 0;
    for (let i = 1; i <= numRows; i++) logC += Math.log(i);
    for (let i = 1; i <= k; i++) logC -= Math.log(i);
    for (let i = 1; i <= numRows - k; i++) logC -= Math.log(i);
    return Math.exp(logC - numRows * Math.LN2);
  }
  var PEG_COLLISION_FRAC = 0.3;
  var Simulation = class {
    constructor(cfg) {
      this.activeParticles = [];
      this.emittedCount = 0;
      this.elapsedMs = 0;
      this.allEmitted = false;
      this.allSettled = false;
      /** Callback: fired when a particle collides with a peg. */
      this.onPegHit = null;
      this.numRows = cfg.numRows;
      this.totalParticles = cfg.totalBeats;
      this.emitIntervalMs = 6e4 / cfg.bpm;
      this.totalTimeMs = Math.max(0, cfg.totalBeats - 1) * this.emitIntervalMs;
      this.rng = cfg.rng;
      this.binCounts = new Array(cfg.numRows + 1).fill(0);
    }
    update(dtMs, geom, getGroundY) {
      const dt = Math.min(dtMs, 100) / 1e3;
      const settled = [];
      if (!this.allEmitted) {
        const expectedEmitted = Math.min(
          this.totalParticles,
          1 + Math.floor(this.elapsedMs / this.emitIntervalMs)
        );
        const toEmit = expectedEmitted - this.emittedCount;
        for (let i = 0; i < toEmit; i++) {
          this.activeParticles.push(this.createParticle(geom));
        }
        if (this.emittedCount >= this.totalParticles) this.allEmitted = true;
      }
      const alive = [];
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
            const bj = fract(p.jitter * 997 + p.pegIndex * 7.31);
            let hIdx = 0;
            for (let i = 0; i < p.pegIndex; i++) hIdx += p.path[i];
            const pegCX = geom.pegX(p.pegIndex, hIdx);
            const nudge = PHYSICS.nudge;
            p.x = p.x * (1 - nudge) + pegCX * nudge;
            let dx = p.x - pegCX;
            const minOff = pegR * (0.1 + 0.12 * bj);
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
    setElapsedMs(ms) {
      this.elapsedMs = ms;
    }
    /** Get current beat index (0-based). */
    getCurrentBeat() {
      return Math.min(this.totalParticles, 1 + Math.floor(this.elapsedMs / this.emitIntervalMs));
    }
    /** Update BPM (emission rate) while preserving beat position. Returns new totalTimeMs. */
    updateBpm(newBpm) {
      const currentBeat = this.getCurrentBeat();
      this.emitIntervalMs = 6e4 / newBpm;
      this.elapsedMs = currentBeat * this.emitIntervalMs;
      this.totalTimeMs = Math.max(0, this.totalParticles - 1) * this.emitIntervalMs;
      return this.totalTimeMs;
    }
    /** Get current bar (0-based). */
    getCurrentBar(beatsPerBar) {
      return Math.floor(this.getCurrentBeat() / beatsPerBar);
    }
    instantSnap(geom) {
      const expectedEmitted = Math.min(
        this.totalParticles,
        1 + Math.floor(this.elapsedMs / this.emitIntervalMs)
      );
      const toEmit = expectedEmitted - this.emittedCount;
      if (toEmit <= 0) return [];
      const settled = [];
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
    forceSettleActive() {
      const settled = [];
      for (const p of this.activeParticles) {
        p.settled = true;
        p.pegIndex = this.numRows;
        this.binCounts[p.bin]++;
        settled.push(p);
      }
      this.activeParticles = [];
      return settled;
    }
    createParticle(geom) {
      const path = [];
      let bin = 0;
      for (let i = 0; i < this.numRows; i++) {
        const d = this.rng() < 0.5 ? 0 : 1;
        path.push(d);
        bin += d;
      }
      const beatIndex = this.emittedCount;
      this.emittedCount++;
      return {
        path,
        bin,
        x: geom.emitX,
        y: geom.emitY,
        vx: 0,
        vy: 0,
        pegIndex: 0,
        settled: false,
        jitter: this.rng(),
        beatIndex
      };
    }
  };

  // src/engine/seven-seg.ts
  var DIGIT_SEGMENTS = [
    [true, true, true, true, true, true, false],
    // 0
    [false, true, true, false, false, false, false],
    // 1
    [true, true, false, true, true, false, true],
    // 2
    [true, true, true, true, false, false, true],
    // 3
    [false, true, true, false, false, true, true],
    // 4
    [true, false, true, true, false, true, true],
    // 5
    [true, false, true, true, true, true, true],
    // 6
    [true, true, true, false, false, false, false],
    // 7
    [true, true, true, true, true, true, true],
    // 8
    [true, true, true, true, false, true, true]
    // 9
  ];
  var CLOCK_THEMES = [
    { name: "Tempo", segmentRGB: [255, 20, 147], grainRGB: [255, 120, 190], glowIntensity: 1.2 },
    { name: "Nixie", segmentRGB: [255, 147, 41], grainRGB: [255, 180, 100], glowIntensity: 1.2 },
    { name: "System", segmentRGB: [0, 255, 65], grainRGB: [120, 255, 140], glowIntensity: 0.8 },
    { name: "Studio", segmentRGB: [220, 220, 230], grainRGB: [230, 230, 240], glowIntensity: 1 },
    { name: "Cyber", segmentRGB: [0, 150, 255], grainRGB: [80, 180, 255], glowIntensity: 1 }
  ];
  function getThemeByName(name) {
    const lower = name.toLowerCase();
    return CLOCK_THEMES.find((t) => t.name.toLowerCase() === lower) || CLOCK_THEMES[0];
  }
  function drawSegmentPath(ctx, x, y, w, h, segIndex, thickness) {
    const ht = thickness / 2;
    const margin = thickness * 0.3;
    let sx, sy, len, horizontal;
    switch (segIndex) {
      case 0:
        sx = x + margin;
        sy = y;
        len = w - margin * 2;
        horizontal = true;
        break;
      case 1:
        sx = x + w;
        sy = y + margin;
        len = h / 2 - margin * 2;
        horizontal = false;
        break;
      case 2:
        sx = x + w;
        sy = y + h / 2 + margin;
        len = h / 2 - margin * 2;
        horizontal = false;
        break;
      case 3:
        sx = x + margin;
        sy = y + h;
        len = w - margin * 2;
        horizontal = true;
        break;
      case 4:
        sx = x;
        sy = y + h / 2 + margin;
        len = h / 2 - margin * 2;
        horizontal = false;
        break;
      case 5:
        sx = x;
        sy = y + margin;
        len = h / 2 - margin * 2;
        horizontal = false;
        break;
      case 6:
        sx = x + margin;
        sy = y + h / 2;
        len = w - margin * 2;
        horizontal = true;
        break;
      default:
        return;
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
  function drawDigit(ctx, x, y, w, h, segments, rgb, glowIntensity, noGlow = false) {
    const thickness = Math.max(1.2, w * 0.07);
    const glowScales = [5.5, 4.5, 3.5, 2.8, 2.2, 1.8];
    const glowAlphaFactors = [0.5, 0.7, 1, 1, 1.2, 1.2];
    for (let s = 0; s < 7; s++) {
      if (segments[s]) {
        if (!noGlow) {
          const glowAlpha = 0.09 * glowIntensity;
          for (let pass = 0; pass < 6; pass++) {
            ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${(glowAlpha * glowAlphaFactors[pass]).toFixed(4)})`;
            ctx.beginPath();
            drawSegmentPath(ctx, x, y, w, h, s, thickness * glowScales[pass]);
            ctx.fill();
          }
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
  function drawBPM(ctx, bpm, cx, cy, digitH, theme) {
    const digits = String(Math.round(bpm)).split("").map(Number);
    const digitW = digitH * 0.5;
    const gap = digitW * 0.35;
    const rgb = theme.segmentRGB;
    const glow = theme.glowIntensity;
    const totalW = digits.length * digitW + (digits.length - 1) * gap;
    let dx = cx - totalW / 2;
    const startY = cy - digitH / 2;
    for (const d of digits) {
      drawDigit(ctx, dx, startY, digitW, digitH, DIGIT_SEGMENTS[d], rgb, glow, true);
      dx += digitW + gap;
    }
  }

  // src/engine/layout.ts
  var SQRT3_2 = Math.sqrt(3) / 2;
  function computeLayout(w, h, dpr, numRows, totalParticles) {
    const centerX = w / 2;
    const marginX = w * 0.15;
    const contentW = w - marginX * 2;
    const topMargin = h * 0.05;
    const bottomMargin = h * 0.15;
    const safeH = h - topMargin - bottomMargin;
    const dxFromWidth = contentW / (numRows + 2);
    const inlineTimerH = h * 0.06;
    const gapBudget = h * 0.03;
    const availableForSystem = safeH - inlineTimerH - gapBudget;
    const boardH_target = availableForSystem * 3 / 5;
    const dxFromRatio = numRows > 1 ? boardH_target / ((numRows - 1) * SQRT3_2) : dxFromWidth;
    const pegSpacing = Math.min(dxFromWidth, dxFromRatio);
    const rowSpacingY = pegSpacing * SQRT3_2;
    const boardH = numRows > 1 ? (numRows - 1) * rowSpacingY : 0;
    const grainRadius = Math.max(3, Math.min(8, pegSpacing * 0.25));
    const pegRadius = Math.max(1.5, Math.min(5, pegSpacing * 0.12));
    const nozzleHW = pegSpacing * 0.8;
    const gridHW = numRows * pegSpacing / 2;
    const hopperTopHW = Math.max(pegSpacing * 4, gridHW * 1.3);
    const hopperRectHW = hopperTopHW;
    const taperH = Math.max(boardH / 3, pegSpacing * 2.5);
    const hopperToGrid = Math.max(pegSpacing * 0.6, h * 0.012);
    const gridToAcc = Math.max(pegSpacing * 0.7, h * 0.015);
    const accBottom = h - bottomMargin;
    const aboveAccH = inlineTimerH + taperH + hopperToGrid + boardH + gridToAcc;
    const accHeight_available = safeH - aboveAccH;
    const accHeight = Math.max(pegSpacing * 2, Math.min(accHeight_available, boardH / 2));
    const maxProb = maxBinProbability(numRows);
    const maxBinCount = maxProb * totalParticles * 1.15;
    const accTop = accBottom - accHeight;
    const boardBottom = accTop - gridToAcc;
    const boardTopY = boardBottom - boardH;
    const hopperBottom = boardTopY - hopperToGrid;
    const hopperTop = hopperBottom - taperH;
    const hopperJunction = hopperTop;
    const emitY = hopperBottom + hopperToGrid * 0.55;
    const inlineTimerY = Math.max(topMargin + inlineTimerH * 0.5, hopperTop - inlineTimerH * 0.6);
    const stackScale = accHeight * 0.85 / (maxProb * totalParticles);
    const d_natural = grainRadius * 1.6;
    const rowH_natural = d_natural * SQRT3_2;
    const peakCeiling = accHeight * 0.95;
    const stackRowH = maxBinCount > 0 ? Math.min(rowH_natural, peakCeiling / maxBinCount) : rowH_natural;
    const miniGrainR = Math.max(1.5, grainRadius * 0.55);
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
    const maxOffset = h - uiSafeBottom - finalAccBottom;
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
      width: w,
      height: h,
      dpr,
      centerX,
      contentW,
      hopperTop: finalHopperTop,
      hopperJunction: finalHopperJunction,
      hopperBottom: finalHopperBottom,
      hopperRectHW,
      hopperTopHW: hopperRectHW,
      nozzleHW,
      hopperSigma: taperH * 0.47 / pegSpacing,
      emitY: finalEmitY,
      boardTop: finalBoardTop,
      boardBottom: finalBoardBottom,
      accTop: finalAccTop,
      accBottom: finalAccBottom,
      accHeight,
      inlineTimerY: finalInlineTimerY,
      pegSpacing,
      rowSpacingY,
      numRows,
      pegRadius,
      grainRadius,
      settledDiameter: stackRowH,
      settledRadius: stackRowH / 2,
      stackScale,
      stackRowH,
      miniGrainR
    };
  }
  function pegX(L, row, index) {
    return L.centerX + (index - row / 2) * L.pegSpacing;
  }
  function pegY(L, row) {
    return L.boardTop + row * L.rowSpacingY;
  }
  function gaussianHW(y, L) {
    const totalH = L.hopperBottom - L.hopperTop;
    if (totalH <= 0) return L.nozzleHW;
    const t = Math.max(0, Math.min(1, (L.hopperBottom - y) / totalH));
    const sigPx = L.hopperSigma * L.pegSpacing;
    const d = t * totalH;
    const gaussVal = 1 - Math.exp(-(d * d) / (2 * sigPx * sigPx));
    return L.nozzleHW + (L.hopperTopHW - L.nozzleHW) * gaussVal;
  }
  function computeHopperGrains(L, totalCount, grainR) {
    const grains = [];
    const d = grainR * 2.1;
    const rowH = d * SQRT3_2;
    const cx = L.centerX;
    let row = 0;
    let y = L.hopperBottom - grainR * 1.5;
    while (grains.length < totalCount) {
      const hw = gaussianHW(y, L);
      const usableW = hw * 0.88;
      const xOff = row % 2 === 1 ? d * 0.5 : 0;
      const nCols = Math.max(1, Math.floor(usableW * 2 / d));
      for (let c = 0; c < nCols && grains.length < totalCount; c++) {
        const gx = cx - usableW + xOff + c * d + grainR;
        const seed = row * 1009 + c * 7919 + 31337 & 2147483647;
        const jx = (seed % 1e3 / 1e3 - 0.5) * grainR * 0.5;
        const jy = ((seed * 1103515245 + 12345 & 2147483647) % 1e3 / 1e3 - 0.5) * grainR * 0.4;
        grains.push({ x: gx + jx, y: y + jy });
      }
      y -= rowH;
      row++;
    }
    return grains;
  }
  function stackJitterX(bin, k, maxJitter) {
    const hash = bin * 2654435761 + k * 340573321 >>> 0 & 2147483647;
    return (hash % 1e4 / 1e4 - 0.5) * 2 * maxJitter;
  }
  function stackJitterY(bin, k, maxJitter) {
    const hash = bin * 1103515245 + k * 1299709 >>> 0 & 2147483647;
    return (hash % 1e4 / 1e4 - 0.5) * 2 * maxJitter;
  }

  // src/engine/grain-renderer.ts
  var PI2 = Math.PI * 2;
  var GRAIN_ALPHA = 0.85;
  var GRAIN_GLOW_ALPHA = 0.06;
  var GRAIN_GLOW_SCALE = 3;
  var STATIC_GRAIN_ALPHA = 1;
  var GrainRenderer = class {
    constructor(container2) {
      this.hopperGrainCache = [];
      this.hopperGrainTopY = 0;
      this.hopperFadeAlpha = 1;
      this.grainCoreFill = "";
      this.grainGlowFill = "";
      this.staticGrainFill = "";
      this.staticCanvas = document.createElement("canvas");
      this.dynamicCanvas = document.createElement("canvas");
      for (const c of [this.staticCanvas, this.dynamicCanvas]) {
        c.style.position = "absolute";
        c.style.top = "0";
        c.style.left = "0";
        container2.appendChild(c);
      }
      this.sCtx = this.staticCanvas.getContext("2d");
      this.dCtx = this.dynamicCanvas.getContext("2d");
      this.binCounts = [];
    }
    updateGrainColors(theme) {
      const [r, g, b] = theme.grainRGB;
      this.grainCoreFill = `rgba(${r},${g},${b},${GRAIN_ALPHA})`;
      this.grainGlowFill = `rgba(${r},${g},${b},${GRAIN_GLOW_ALPHA})`;
      this.staticGrainFill = `rgba(${r},${g},${b},${STATIC_GRAIN_ALPHA})`;
    }
    applyLayout(L, totalParticles) {
      const w = L.width;
      const h = L.height;
      const dpr = L.dpr;
      for (const c of [this.staticCanvas, this.dynamicCanvas]) {
        c.width = w * dpr;
        c.height = h * dpr;
        c.style.width = w + "px";
        c.style.height = h + "px";
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
    bakeParticle(L, p) {
      const bin = p.bin;
      this.binCounts[bin]++;
      const count = this.binCounts[bin];
      const binX = pegX(L, L.numRows - 1, bin);
      const mr = L.miniGrainR;
      const d = mr * 2.1;
      const rowH = L.stackRowH;
      const maxJitterX = Math.min(4, mr * 2.5);
      const maxJitterY = rowH * 0.18;
      const hexOff = count % 2 === 0 ? d * 0.5 : 0;
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
    rebakeStatic(L, _theme) {
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
          const hexOff = k % 2 === 0 ? d * 0.5 : 0;
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
    drawHopper(ctx, L, emitted, total) {
      const cx = L.centerX;
      ctx.save();
      ctx.globalAlpha = this.hopperFadeAlpha;
      const visTop = Math.max(0, L.hopperTop);
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
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
        const edgeDrop = Math.pow(volP, 2) * grainH * 1.1;
        const bowlDepth = centerDrop - edgeDrop;
        const noiseAmp = r * 3.5;
        ctx.fillStyle = this.grainGlowFill;
        ctx.beginPath();
        for (let i = 0; i < cacheLen; i++) {
          const g = this.hopperGrainCache[i];
          if (g.y < -r * 3) continue;
          const localHW = gaussianHW(g.y, L);
          const off = Math.min(1, Math.abs(g.x - cx) / localHW);
          const noise = ((i * 2654435761 >>> 0) % 1e4 / 1e4 - 0.5) * noiseAmp;
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
          const noise = ((i * 2654435761 >>> 0) % 1e4 / 1e4 - 0.5) * noiseAmp;
          const surfaceY = grainTop + edgeDrop + bowlDepth * (1 - off * off) + noise;
          if (g.y < surfaceY) continue;
          ctx.moveTo(g.x + r, g.y);
          ctx.arc(g.x, g.y, r, 0, PI2);
        }
        ctx.fill();
      }
      if (remaining > 0) {
        const now = performance.now();
        const r = L.miniGrainR;
        const streamCount = remaining < 10 ? Math.max(1, Math.ceil(remaining / 3)) : 4;
        for (let i = 0; i < streamCount; i++) {
          const phase = (now * 3e-3 + i * 0.25) % 1;
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
    drawPegs(ctx, L, theme, pegAlphaOverride, beatPhase = 0) {
      const [pr, pg, pb] = theme.segmentRGB;
      const alpha = pegAlphaOverride !== void 0 ? pegAlphaOverride : 0.15;
      const themeWeight = pegAlphaOverride !== void 0 && pegAlphaOverride > 0.5 ? 0.6 : 0.3;
      const grayWeight = 1 - themeWeight;
      const blendR = Math.round(pr * themeWeight + 180 * grayWeight);
      const blendG = Math.round(pg * themeWeight + 180 * grayWeight);
      const blendB = Math.round(pb * themeWeight + 180 * grayWeight);
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
      if (beatPhase > 0 && pegAlphaOverride === void 0) {
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
    drawParticles(ctx, L, particles) {
      if (particles.length === 0) return;
      const r = L.grainRadius;
      ctx.fillStyle = this.grainGlowFill;
      ctx.beginPath();
      for (const p of particles) {
        ctx.moveTo(p.x + r * GRAIN_GLOW_SCALE, p.y);
        ctx.arc(p.x, p.y, r * GRAIN_GLOW_SCALE, 0, PI2);
      }
      ctx.fill();
      ctx.fillStyle = this.grainCoreFill;
      ctx.beginPath();
      for (const p of particles) {
        ctx.moveTo(p.x + r, p.y);
        ctx.arc(p.x, p.y, r, 0, PI2);
      }
      ctx.fill();
    }
    clearStatic(L) {
      this.binCounts.fill(0);
      this.sCtx.clearRect(0, 0, L.width, L.height);
    }
    beginHopperFade() {
      this.hopperFadeAlpha = 1;
    }
    setHopperFadeAlpha(a) {
      this.hopperFadeAlpha = a;
    }
    resetHopperFade() {
      this.hopperFadeAlpha = 1;
    }
    fillStacks(L, numRows, totalParticles, theme) {
      const n = numRows;
      const numBins = n + 1;
      this.binCounts = new Array(numBins).fill(0);
      const lnFact = new Array(n + 1);
      lnFact[0] = 0;
      for (let i = 1; i <= n; i++) lnFact[i] = lnFact[i - 1] + Math.log(i);
      const probs = new Array(numBins);
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
    getGroundY(L, x) {
      const numBins = L.numRows + 1;
      let nearestBin = 0;
      let minDist = Infinity;
      for (let b = 0; b < numBins; b++) {
        const bx = pegX(L, L.numRows - 1, b);
        const dist = Math.abs(x - bx);
        if (dist < minDist) {
          minDist = dist;
          nearestBin = b;
        }
      }
      return L.accBottom - this.binCounts[nearestBin] * L.stackRowH;
    }
  };

  // src/engine/renderer.ts
  var Renderer = class {
    constructor(container2, numRows, totalParticles) {
      this.currentTheme = CLOCK_THEMES[0];
      this.totalParticles = totalParticles;
      this.gr = new GrainRenderer(container2);
      this.gr.updateGrainColors(this.currentTheme);
      this.resize(numRows);
    }
    setTheme(theme) {
      this.currentTheme = theme;
      this.gr.updateGrainColors(theme);
      const [r, g, b] = theme.segmentRGB;
      document.documentElement.style.setProperty(
        "--bg",
        `rgb(${Math.round(r * 0.02)},${Math.round(g * 0.02)},${Math.round(b * 0.02)})`
      );
      this.gr.rebakeStatic(this.layout, theme);
    }
    setThemeByName(name) {
      this.setTheme(getThemeByName(name));
    }
    getTheme() {
      return this.currentTheme;
    }
    resize(numRows, totalParticles) {
      if (totalParticles !== void 0) this.totalParticles = totalParticles;
      const dpr = window.devicePixelRatio || 1;
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.layout = computeLayout(w, h, dpr, numRows, this.totalParticles);
      this.gr.applyLayout(this.layout, this.totalParticles);
    }
    pegX(row, index) {
      return pegX(this.layout, row, index);
    }
    pegY(row) {
      return pegY(this.layout, row);
    }
    getGeom() {
      return {
        emitX: this.layout.centerX,
        emitY: this.layout.emitY,
        pegX: (r, i) => this.pegX(r, i),
        pegY: (r) => this.pegY(r),
        pegSpacing: this.layout.pegSpacing,
        numRows: this.layout.numRows,
        accBottom: this.layout.accBottom
      };
    }
    getGroundY(x) {
      return this.gr.getGroundY(this.layout, x);
    }
    bakeParticle(p) {
      this.gr.bakeParticle(this.layout, p);
    }
    drawFrame(particles, bpm, totalParticles, emittedCount, currentBar, totalBars, beatInBar, beatPhase = 0) {
      const L = this.layout;
      const ctx = this.gr.dCtx;
      ctx.clearRect(0, 0, L.width, L.height);
      if (totalParticles > 0) {
        const progress = Math.min(1, emittedCount / totalParticles);
        const [r, g, b] = this.currentTheme.segmentRGB;
        ctx.fillStyle = `rgba(${r},${g},${b},0.60)`;
        ctx.fillRect(0, 0, L.width * progress, 2);
      }
      const [lr, lg, lb] = this.currentTheme.segmentRGB;
      const digitH = Math.min(L.width * 0.025, L.height * 0.03);
      const bpmY = L.inlineTimerY;
      drawBPM(ctx, bpm, L.centerX, bpmY, digitH, this.currentTheme);
      const dotR = Math.max(2, L.height * 4e-3);
      const dotGap = dotR * 5;
      const dotY = bpmY + digitH / 2 + dotR * 3.5;
      const dotsStartX = L.centerX - 3 * dotGap / 2;
      for (let i = 0; i < 4; i++) {
        const dx = dotsStartX + i * dotGap;
        const isActive = i === beatInBar;
        ctx.fillStyle = isActive ? `rgba(${lr},${lg},${lb},0.9)` : `rgba(${lr},${lg},${lb},0.12)`;
        ctx.beginPath();
        ctx.arc(dx, dotY, isActive ? dotR * 1.5 : dotR, 0, Math.PI * 2);
        ctx.fill();
      }
      this.gr.drawHopper(ctx, L, emittedCount, totalParticles);
      this.gr.drawPegs(ctx, L, this.currentTheme, void 0, beatPhase);
      this.gr.drawParticles(ctx, L, particles);
    }
    clearStatic() {
      this.gr.clearStatic(this.layout);
    }
    fillStacks(numRows, totalParticles) {
      this.gr.fillStacks(this.layout, numRows, totalParticles, this.currentTheme);
    }
    beginHopperFade() {
      this.gr.beginHopperFade();
    }
    setHopperFadeAlpha(a) {
      this.gr.setHopperFadeAlpha(a);
    }
    resetHopperFade() {
      this.gr.resetHopperFade();
    }
  };

  // src/engine/timer-bridge.ts
  var TimerBridge = class {
    constructor() {
      this.onTick = null;
      this.onDone = null;
      this.worker = new Worker("dist/timer-worker.js");
      this.worker.onmessage = (e) => {
        const msg = e.data;
        if (msg.type === "TICK") {
          this.onTick?.(msg.remainingMs, msg.elapsedMs);
        } else if (msg.type === "DONE") {
          this.onDone?.();
        }
      };
    }
    start(totalMs) {
      this.worker.postMessage({
        type: "START",
        totalMs,
        startAbsMs: performance.now()
      });
    }
    addTime(addMs) {
      this.worker.postMessage({ type: "ADD_TIME", addMs });
    }
    adjust(totalMs, elapsedMs) {
      this.worker.postMessage({ type: "ADJUST", totalMs, elapsedMs });
    }
    pause() {
      this.worker.postMessage({ type: "PAUSE" });
    }
    resume() {
      this.worker.postMessage({
        type: "RESUME",
        resumeAbsMs: performance.now()
      });
    }
    reset() {
      this.worker.postMessage({ type: "RESET" });
    }
  };

  // src/engine/audio.ts
  var AudioEngine = class {
    constructor() {
      this.ctx = null;
      this.masterGain = null;
      this.soundType = "click";
    }
    /** Must be called after a user gesture (tap/click). */
    async ensureContext() {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.7;
        this.masterGain.connect(this.ctx.destination);
      }
      if (this.ctx.state === "suspended") {
        await this.ctx.resume();
      }
    }
    /** Play metronome beat. accent = true for beat 1 of bar. */
    playBeat(accent) {
      if (!this.ctx || !this.masterGain) return;
      const now = this.ctx.currentTime;
      if (this.soundType === "click" || this.soundType === "both") {
        this.playClick(now, accent);
      }
      if (this.soundType === "kick" || this.soundType === "both") {
        this.playKick(now, accent);
      }
    }
    /** Play peg collision sound. Pitch mapped from row/col position. */
    playPegHit(row, col, numRows) {
      if (!this.ctx || !this.masterGain) return;
      const now = this.ctx.currentTime;
      const rowFrac = row / Math.max(1, numRows - 1);
      const freq = 200 + rowFrac * 1800;
      const colFrac = numRows > 0 ? (col / row - 0.5) * 2 : 0;
      const osc = this.ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = freq;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.03, now);
      gain.gain.exponentialRampToValueAtTime(1e-3, now + 0.04);
      const pan = this.ctx.createStereoPanner();
      pan.pan.value = Math.max(-1, Math.min(1, colFrac * 0.6));
      osc.connect(gain);
      gain.connect(pan);
      pan.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.05);
    }
    playClick(time, accent) {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = accent ? 1500 : 1e3;
      const gain = ctx.createGain();
      const vol = accent ? 0.5 : 0.3;
      gain.gain.setValueAtTime(vol, time);
      gain.gain.exponentialRampToValueAtTime(1e-3, time + 0.03);
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 600;
      osc.connect(hp);
      hp.connect(gain);
      gain.connect(this.masterGain);
      osc.start(time);
      osc.stop(time + 0.04);
    }
    playKick(time, accent) {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(accent ? 220 : 180, time);
      osc.frequency.exponentialRampToValueAtTime(50, time + 0.1);
      const gain = ctx.createGain();
      const vol = accent ? 0.7 : 0.5;
      gain.gain.setValueAtTime(vol, time);
      gain.gain.exponentialRampToValueAtTime(1e-3, time + 0.2);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(time);
      osc.stop(time + 0.25);
      const bufLen = Math.ceil(ctx.sampleRate * 0.015);
      const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(accent ? 0.4 : 0.25, time);
      noiseGain.gain.exponentialRampToValueAtTime(1e-3, time + 0.015);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 800;
      bp.Q.value = 1.5;
      noise.connect(bp);
      bp.connect(noiseGain);
      noiseGain.connect(this.masterGain);
      noise.start(time);
      noise.stop(time + 0.02);
    }
  };

  // src/components/console.ts
  function injectStyles() {
    if (document.getElementById("gt-console-style")) return;
    const style = document.createElement("style");
    style.id = "gt-console-style";
    style.textContent = `
    .gt-controls {
      position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%);
      z-index: 1000; display: flex; gap: 20px; align-items: center;
      user-select: none; transition: opacity 0.4s ease;
    }
    .gt-controls.hidden { opacity: 0; pointer-events: none; }
    .gt-ctrl-btn {
      width: 36px; height: 36px; border-radius: 50%;
      border: 1.5px solid rgba(255,255,255,0.12);
      background: transparent; color: rgba(255,255,255,0.45);
      font-size: 14px; display: flex; align-items: center; justify-content: center;
      cursor: pointer; transition: background 0.2s, color 0.2s, border-color 0.2s;
      padding: 0; line-height: 1;
    }
    .gt-ctrl-btn:hover { background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.80); border-color: rgba(255,255,255,0.25); }
    .gt-ctrl-btn:active { background: rgba(255,255,255,0.14); }
    .gt-ctrl-btn svg { width: 18px; height: 18px; fill: currentColor; }

    .gt-drawer-overlay {
      position: fixed; inset: 0; z-index: 600;
      background: rgba(0,0,0,0.35); opacity: 0; pointer-events: none;
      transition: opacity 0.3s ease;
    }
    .gt-drawer-overlay.open { opacity: 1; pointer-events: auto; }
    .gt-drawer {
      position: fixed; top: 0; right: 0; bottom: 0; width: 300px; max-width: 82vw;
      z-index: 601; background: rgba(8,8,12,0.72);
      border-left: 1px solid rgba(255,255,255,0.05);
      backdrop-filter: blur(32px) saturate(1.4);
      -webkit-backdrop-filter: blur(32px) saturate(1.4);
      transform: translateX(100%);
      transition: transform 0.35s cubic-bezier(0.4,0,0.2,1);
      display: flex; flex-direction: column;
      font-family: 'JetBrains Mono', 'SF Mono', 'Menlo', monospace;
      overflow-y: auto; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.06) transparent;
    }
    .gt-drawer.open { transform: translateX(0); }
    .gt-drawer-content { padding: 40px 28px 32px; display: flex; flex-direction: column; gap: 36px; }

    .gt-section-title {
      font-size: 10px; font-weight: 700; letter-spacing: 4px; text-transform: uppercase;
      color: rgba(255,255,255,0.25); margin-bottom: 20px; padding-bottom: 8px;
      border-bottom: 1px solid rgba(255,255,255,0.04);
    }
    .gt-section { display: flex; flex-direction: column; }

    .gt-field-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 36px; margin-bottom: 4px; }
    .gt-field-label { font-size: 11px; font-weight: 400; color: rgba(255,255,255,0.40); flex-shrink: 0; letter-spacing: 0.5px; }
    .gt-field-select {
      flex: 1; max-width: 150px; padding: 6px 10px;
      background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
      border-radius: 6px; color: rgba(255,255,255,0.60);
      font-family: inherit; font-size: 11px; outline: none; cursor: pointer;
    }
    .gt-field-select option { background: #0c0c0e; color: #bbb; }

    .gt-slider-input {
      -webkit-appearance: none; appearance: none; flex: 1; height: 2px;
      background: rgba(255,255,255,0.08); border-radius: 1px; outline: none; cursor: pointer;
    }
    .gt-slider-input::-webkit-slider-thumb {
      -webkit-appearance: none; appearance: none; width: 12px; height: 12px;
      border-radius: 50%; background: rgba(255,255,255,0.40); cursor: pointer;
    }
    .gt-slider-input::-moz-range-thumb {
      width: 12px; height: 12px; border-radius: 50%;
      background: rgba(255,255,255,0.40); cursor: pointer; border: none;
    }

    .gt-dur-row { display: flex; align-items: center; gap: 8px; min-height: 36px; margin-bottom: 4px; }
    .gt-dur-btn {
      width: 30px; height: 30px; border-radius: 50%;
      border: 1px solid rgba(255,255,255,0.08); background: transparent;
      color: rgba(255,255,255,0.35); font-size: 16px; font-family: inherit;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; user-select: none; flex-shrink: 0; transition: all 0.15s;
    }
    .gt-dur-btn:hover { background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.70); border-color: rgba(255,255,255,0.15); }
    .gt-dur-display {
      width: 56px; padding: 0; background: transparent; border: none;
      color: rgba(255,255,255,0.70); font-family: inherit; font-size: 14px;
      font-weight: 500; letter-spacing: 1.5px; outline: none; text-align: center;
      flex-shrink: 0; caret-color: rgba(255,255,255,0.40);
    }

    .gt-preset-row { display: flex; gap: 6px; margin-bottom: 8px; }
    .gt-preset-btn {
      flex: 1; padding: 4px 0; border: 1px solid transparent; border-radius: 4px;
      background: rgba(255,255,255,0.03); color: rgba(255,255,255,0.28);
      font-size: 11px; font-family: monospace; cursor: pointer; min-height: 26px;
      transition: all 0.2s;
    }
    .gt-preset-btn:hover { background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.55); }
    .gt-preset-btn.active {
      border-color: var(--accent, rgba(255,255,255,0.30));
      color: var(--accent, rgba(255,255,255,0.80));
      background: color-mix(in srgb, var(--accent, #fff) 8%, transparent);
      box-shadow: 0 0 6px color-mix(in srgb, var(--accent, #fff) 15%, transparent);
    }
    .gt-preset-btn:disabled { opacity: 0.3; cursor: default; }

    .gt-dur-hint {
      font-size: 10px; color: rgba(255,160,60,0.7); letter-spacing: 0.5px;
      margin-left: auto; animation: gt-hint-pulse 2s ease-in-out infinite;
    }
    @keyframes gt-hint-pulse { 0%, 100% { opacity: 0.7; } 50% { opacity: 1.0; } }

    .gt-theme-strip { display: flex; gap: 0; margin-bottom: 4px; border-radius: 8px; overflow: hidden; border: 1px solid rgba(255,255,255,0.05); }
    .gt-theme-chip {
      flex: 1; display: flex; align-items: center; justify-content: center; gap: 5px;
      padding: 10px 0; font-size: 8.5px; font-weight: 500; letter-spacing: 0.8px;
      text-transform: uppercase; font-family: inherit;
      color: rgba(255,255,255,0.30); background: rgba(255,255,255,0.02);
      border: none; border-right: 1px solid rgba(255,255,255,0.04);
      cursor: pointer; transition: all 0.25s;
    }
    .gt-theme-chip:last-child { border-right: none; }
    .gt-theme-chip .gt-led { width: 4px; height: 4px; border-radius: 50%; flex-shrink: 0; opacity: 0.45; transition: opacity 0.25s, box-shadow 0.25s; }
    .gt-theme-chip:hover { background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.55); }
    .gt-theme-chip:hover .gt-led { opacity: 0.7; }
    .gt-theme-chip.active { color: rgba(255,255,255,0.85); background: color-mix(in srgb, var(--tc) 6%, transparent); box-shadow: inset 0 0 12px color-mix(in srgb, var(--tc) 8%, transparent); }
    .gt-theme-chip.active .gt-led { opacity: 1; box-shadow: 0 0 4px var(--tc), 0 0 8px color-mix(in srgb, var(--tc) 50%, transparent); }

    .gt-sys-btn {
      width: 100%; padding: 10px 0; background: rgba(255,255,255,0.02);
      border: 1px solid rgba(255,255,255,0.05); border-radius: 8px;
      color: rgba(255,255,255,0.35); font-family: inherit; font-size: 10px;
      font-weight: 500; letter-spacing: 1px; text-transform: uppercase;
      cursor: pointer; transition: all 0.15s; margin-bottom: 8px;
    }
    .gt-sys-btn:hover { background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.60); border-color: rgba(255,255,255,0.10); }

    .gt-credits {
      position: fixed; bottom: 8px; left: 50%; transform: translateX(-50%);
      font-size: 9px; color: rgba(255,255,255,0.12); letter-spacing: 1.5px;
      z-index: 1; pointer-events: none; font-family: 'JetBrains Mono', 'SF Mono', monospace;
    }
  `;
    document.head.appendChild(style);
  }
  function makeHold(setter) {
    let iv = null;
    return {
      start(d) {
        setter(d);
        iv = setInterval(() => setter(d), 80);
      },
      stop() {
        if (iv) {
          clearInterval(iv);
          iv = null;
        }
      }
    };
  }
  function createConsole(initialBpm, initialBars, initialRows, initialTheme, initialSound, initialMode) {
    injectStyles();
    let currentBpm = initialBpm;
    let currentBars = initialBars;
    let currentRows = initialRows;
    const creditsEl = document.createElement("div");
    creditsEl.className = "gt-credits";
    creditsEl.textContent = "Crafted by Tipsy Tap Studio";
    document.body.appendChild(creditsEl);
    const controls = document.createElement("div");
    controls.className = "gt-controls";
    function makeBtn(svg, title) {
      const btn = document.createElement("button");
      btn.className = "gt-ctrl-btn";
      btn.innerHTML = svg;
      btn.title = title;
      return btn;
    }
    const startBtn = makeBtn('<svg viewBox="0 0 24 24"><polygon points="6,4 20,12 6,20"/></svg>', "Start");
    const pauseBtn = makeBtn('<svg viewBox="0 0 24 24"><rect x="5" y="4" width="4" height="16"/><rect x="15" y="4" width="4" height="16"/></svg>', "Pause");
    const stopBtn = makeBtn('<svg viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>', "Stop");
    const settingsBtn = makeBtn('<svg viewBox="0 0 24 24"><path d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>', "Settings");
    startBtn.addEventListener("click", () => ctrl.onStart?.());
    pauseBtn.addEventListener("click", () => ctrl.onPause?.());
    stopBtn.addEventListener("click", () => ctrl.onStop?.());
    settingsBtn.addEventListener("click", () => toggleDrawer());
    controls.appendChild(startBtn);
    controls.appendChild(pauseBtn);
    controls.appendChild(stopBtn);
    controls.appendChild(settingsBtn);
    document.body.appendChild(controls);
    const overlay = document.createElement("div");
    overlay.className = "gt-drawer-overlay";
    overlay.addEventListener("click", () => closeDrawer());
    const drawer = document.createElement("div");
    drawer.className = "gt-drawer";
    const drawerContent = document.createElement("div");
    drawerContent.className = "gt-drawer-content";
    const tempoSection = document.createElement("div");
    tempoSection.className = "gt-section";
    tempoSection.innerHTML = '<div class="gt-section-title">Tempo</div>';
    const bpmLabel = document.createElement("div");
    bpmLabel.className = "gt-field-row";
    bpmLabel.innerHTML = '<span class="gt-field-label">BPM</span>';
    bpmLabel.style.marginBottom = "0";
    const bpmHint = document.createElement("span");
    bpmHint.className = "gt-dur-hint";
    bpmHint.textContent = "Stop to change";
    bpmHint.style.display = "none";
    bpmLabel.appendChild(bpmHint);
    const bpmPresetRow = document.createElement("div");
    bpmPresetRow.className = "gt-preset-row";
    const BPM_PRESETS = [
      { label: "60", val: 60 },
      { label: "90", val: 90 },
      { label: "120", val: 120 },
      { label: "140", val: 140 },
      { label: "160", val: 160 }
    ];
    const bpmPresetBtns = [];
    for (const p of BPM_PRESETS) {
      const btn = document.createElement("button");
      btn.className = "gt-preset-btn";
      btn.textContent = p.label;
      if (p.val === currentBpm) btn.classList.add("active");
      btn.addEventListener("click", () => {
        setBpmVal(p.val);
        bpmPresetBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
      });
      bpmPresetRow.appendChild(btn);
      bpmPresetBtns.push(btn);
    }
    const bpmRow = document.createElement("div");
    bpmRow.className = "gt-dur-row";
    const bpmMinusBtn = document.createElement("button");
    bpmMinusBtn.className = "gt-dur-btn";
    bpmMinusBtn.textContent = "\u2212";
    const bpmSlider = document.createElement("input");
    bpmSlider.type = "range";
    bpmSlider.className = "gt-slider-input";
    bpmSlider.min = "20";
    bpmSlider.max = "300";
    bpmSlider.step = "1";
    bpmSlider.value = String(currentBpm);
    bpmSlider.style.flex = "1";
    const bpmDisplay = document.createElement("input");
    bpmDisplay.className = "gt-dur-display";
    bpmDisplay.type = "text";
    bpmDisplay.value = String(currentBpm);
    const bpmPlusBtn = document.createElement("button");
    bpmPlusBtn.className = "gt-dur-btn";
    bpmPlusBtn.textContent = "+";
    function setBpmVal(v) {
      v = Math.max(20, Math.min(300, v));
      currentBpm = v;
      bpmSlider.value = String(v);
      bpmDisplay.value = String(v);
      updateDuration();
      ctrl.onBpmChange?.(v);
    }
    bpmSlider.addEventListener("input", () => {
      const v = parseInt(bpmSlider.value, 10);
      currentBpm = v;
      bpmDisplay.value = String(v);
      bpmPresetBtns.forEach((b) => b.classList.remove("active"));
      updateDuration();
      ctrl.onBpmChange?.(v);
    });
    bpmDisplay.addEventListener("change", () => {
      const v = parseInt(bpmDisplay.value, 10);
      if (Number.isFinite(v)) setBpmVal(v);
      else bpmDisplay.value = String(currentBpm);
    });
    const bpmHold = makeHold((d) => setBpmVal(currentBpm + d));
    bpmMinusBtn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      bpmHold.start(-1);
    });
    bpmMinusBtn.addEventListener("pointerup", () => bpmHold.stop());
    bpmMinusBtn.addEventListener("pointerleave", () => bpmHold.stop());
    bpmPlusBtn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      bpmHold.start(1);
    });
    bpmPlusBtn.addEventListener("pointerup", () => bpmHold.stop());
    bpmPlusBtn.addEventListener("pointerleave", () => bpmHold.stop());
    bpmRow.appendChild(bpmMinusBtn);
    bpmRow.appendChild(bpmSlider);
    bpmRow.appendChild(bpmDisplay);
    bpmRow.appendChild(bpmPlusBtn);
    tempoSection.appendChild(bpmLabel);
    tempoSection.appendChild(bpmPresetRow);
    tempoSection.appendChild(bpmRow);
    const barsLabel = document.createElement("div");
    barsLabel.className = "gt-field-row";
    barsLabel.innerHTML = '<span class="gt-field-label">Bars</span>';
    barsLabel.style.marginBottom = "0";
    const barsHint = document.createElement("span");
    barsHint.className = "gt-dur-hint";
    barsHint.textContent = "Stop to change";
    barsHint.style.display = "none";
    barsLabel.appendChild(barsHint);
    const barsPresetRow = document.createElement("div");
    barsPresetRow.className = "gt-preset-row";
    const BARS_PRESETS = [
      { label: "4", val: 4 },
      { label: "8", val: 8 },
      { label: "16", val: 16 },
      { label: "32", val: 32 },
      { label: "64", val: 64 }
    ];
    const barsPresetBtns = [];
    for (const p of BARS_PRESETS) {
      const btn = document.createElement("button");
      btn.className = "gt-preset-btn";
      btn.textContent = p.label;
      if (p.val === currentBars) btn.classList.add("active");
      btn.addEventListener("click", () => {
        setBarsVal(p.val);
        barsPresetBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
      });
      barsPresetRow.appendChild(btn);
      barsPresetBtns.push(btn);
    }
    const barsRow = document.createElement("div");
    barsRow.className = "gt-dur-row";
    const barsMinusBtn = document.createElement("button");
    barsMinusBtn.className = "gt-dur-btn";
    barsMinusBtn.textContent = "\u2212";
    const barsSlider = document.createElement("input");
    barsSlider.type = "range";
    barsSlider.className = "gt-slider-input";
    barsSlider.min = "1";
    barsSlider.max = "128";
    barsSlider.step = "1";
    barsSlider.value = String(currentBars);
    barsSlider.style.flex = "1";
    const barsDisplay = document.createElement("input");
    barsDisplay.className = "gt-dur-display";
    barsDisplay.type = "text";
    barsDisplay.value = String(currentBars);
    const barsPlusBtn = document.createElement("button");
    barsPlusBtn.className = "gt-dur-btn";
    barsPlusBtn.textContent = "+";
    function setBarsVal(v) {
      v = Math.max(1, Math.min(999, v));
      currentBars = v;
      barsSlider.value = String(Math.min(128, v));
      barsDisplay.value = String(v);
      updateDuration();
      ctrl.onBarsChange?.(v);
    }
    barsSlider.addEventListener("input", () => {
      const v = parseInt(barsSlider.value, 10);
      currentBars = v;
      barsDisplay.value = String(v);
      barsPresetBtns.forEach((b) => b.classList.remove("active"));
      updateDuration();
      ctrl.onBarsChange?.(v);
    });
    barsDisplay.addEventListener("change", () => {
      const v = parseInt(barsDisplay.value, 10);
      if (Number.isFinite(v)) setBarsVal(v);
      else barsDisplay.value = String(currentBars);
    });
    const barsHold = makeHold((d) => setBarsVal(currentBars + d));
    barsMinusBtn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      barsHold.start(-1);
    });
    barsMinusBtn.addEventListener("pointerup", () => barsHold.stop());
    barsMinusBtn.addEventListener("pointerleave", () => barsHold.stop());
    barsPlusBtn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      barsHold.start(1);
    });
    barsPlusBtn.addEventListener("pointerup", () => barsHold.stop());
    barsPlusBtn.addEventListener("pointerleave", () => barsHold.stop());
    barsRow.appendChild(barsMinusBtn);
    barsRow.appendChild(barsSlider);
    barsRow.appendChild(barsDisplay);
    barsRow.appendChild(barsPlusBtn);
    const durationRow = document.createElement("div");
    durationRow.className = "gt-field-row";
    durationRow.style.marginTop = "-2px";
    const durationLabel = document.createElement("span");
    durationLabel.className = "gt-field-label";
    durationLabel.style.fontSize = "10px";
    durationLabel.style.opacity = "0.5";
    durationRow.appendChild(durationLabel);
    function updateDuration() {
      const secs = currentBars * 4 * 60 / currentBpm;
      const m = Math.floor(secs / 60);
      const s = Math.round(secs % 60);
      durationLabel.textContent = `\u2248 ${m}:${String(s).padStart(2, "0")}`;
    }
    updateDuration();
    tempoSection.appendChild(barsLabel);
    tempoSection.appendChild(barsPresetRow);
    tempoSection.appendChild(barsRow);
    tempoSection.appendChild(durationRow);
    const rowsLabel = document.createElement("div");
    rowsLabel.className = "gt-field-row";
    rowsLabel.innerHTML = '<span class="gt-field-label">Rows</span>';
    rowsLabel.style.marginBottom = "0";
    const rowsHint = document.createElement("span");
    rowsHint.className = "gt-dur-hint";
    rowsHint.textContent = "Stop to change";
    rowsHint.style.display = "none";
    rowsLabel.appendChild(rowsHint);
    const rowsPresetRow = document.createElement("div");
    rowsPresetRow.className = "gt-preset-row";
    const ROWS_PRESETS = [
      { label: "8", val: 8 },
      { label: "16", val: 16 },
      { label: "24", val: 24 },
      { label: "32", val: 32 },
      { label: "48", val: 48 }
    ];
    const rowsPresetBtns = [];
    for (const p of ROWS_PRESETS) {
      const btn = document.createElement("button");
      btn.className = "gt-preset-btn";
      btn.textContent = p.label;
      if (p.val === currentRows) btn.classList.add("active");
      btn.addEventListener("click", () => {
        setRowsVal(p.val);
        rowsPresetBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
      });
      rowsPresetRow.appendChild(btn);
      rowsPresetBtns.push(btn);
    }
    const rowsRow = document.createElement("div");
    rowsRow.className = "gt-dur-row";
    const rowsMinusBtn = document.createElement("button");
    rowsMinusBtn.className = "gt-dur-btn";
    rowsMinusBtn.textContent = "\u2212";
    const rowsSlider = document.createElement("input");
    rowsSlider.type = "range";
    rowsSlider.className = "gt-slider-input";
    rowsSlider.min = "4";
    rowsSlider.max = "64";
    rowsSlider.step = "1";
    rowsSlider.value = String(currentRows);
    rowsSlider.style.flex = "1";
    const rowsDisplay = document.createElement("input");
    rowsDisplay.className = "gt-dur-display";
    rowsDisplay.type = "text";
    rowsDisplay.value = String(currentRows);
    const rowsPlusBtn = document.createElement("button");
    rowsPlusBtn.className = "gt-dur-btn";
    rowsPlusBtn.textContent = "+";
    function setRowsVal(v) {
      v = Math.max(4, Math.min(64, v));
      currentRows = v;
      rowsSlider.value = String(v);
      rowsDisplay.value = String(v);
      ctrl.onRowsChange?.(v);
    }
    rowsSlider.addEventListener("input", () => {
      const v = parseInt(rowsSlider.value, 10);
      currentRows = v;
      rowsDisplay.value = String(v);
      rowsPresetBtns.forEach((b) => b.classList.remove("active"));
      ctrl.onRowsChange?.(v);
    });
    rowsDisplay.addEventListener("change", () => {
      const v = parseInt(rowsDisplay.value, 10);
      if (Number.isFinite(v)) setRowsVal(v);
      else rowsDisplay.value = String(currentRows);
    });
    const rowsHold = makeHold((d) => setRowsVal(currentRows + d));
    rowsMinusBtn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      rowsHold.start(-1);
    });
    rowsMinusBtn.addEventListener("pointerup", () => rowsHold.stop());
    rowsMinusBtn.addEventListener("pointerleave", () => rowsHold.stop());
    rowsPlusBtn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      rowsHold.start(1);
    });
    rowsPlusBtn.addEventListener("pointerup", () => rowsHold.stop());
    rowsPlusBtn.addEventListener("pointerleave", () => rowsHold.stop());
    rowsRow.appendChild(rowsMinusBtn);
    rowsRow.appendChild(rowsSlider);
    rowsRow.appendChild(rowsDisplay);
    rowsRow.appendChild(rowsPlusBtn);
    tempoSection.appendChild(rowsLabel);
    tempoSection.appendChild(rowsPresetRow);
    tempoSection.appendChild(rowsRow);
    const soundRow = document.createElement("div");
    soundRow.className = "gt-field-row";
    soundRow.innerHTML = '<span class="gt-field-label">Sound</span>';
    const soundSelect = document.createElement("select");
    soundSelect.className = "gt-field-select";
    for (const [val, label] of [["click", "Click"], ["kick", "Kick"], ["both", "Both"]]) {
      const opt = document.createElement("option");
      opt.value = val;
      opt.textContent = label;
      if (val === initialSound) opt.selected = true;
      soundSelect.appendChild(opt);
    }
    soundSelect.addEventListener("change", () => {
      ctrl.onSoundChange?.(soundSelect.value);
    });
    soundRow.appendChild(soundSelect);
    tempoSection.appendChild(soundRow);
    const presetRow = document.createElement("div");
    presetRow.className = "gt-field-row";
    presetRow.innerHTML = '<span class="gt-field-label">Physics</span>';
    const presetSelect = document.createElement("select");
    presetSelect.className = "gt-field-select";
    for (const name of Object.keys(PRESETS)) {
      const opt = document.createElement("option");
      opt.value = name.toLowerCase();
      opt.textContent = name;
      if (name.toLowerCase() === initialMode.toLowerCase()) opt.selected = true;
      presetSelect.appendChild(opt);
    }
    presetSelect.addEventListener("change", () => {
      ctrl.onModeChange?.(presetSelect.value);
    });
    presetRow.appendChild(presetSelect);
    tempoSection.appendChild(presetRow);
    drawerContent.appendChild(tempoSection);
    const themeSection = document.createElement("div");
    themeSection.className = "gt-section";
    themeSection.innerHTML = '<div class="gt-section-title">Theme</div>';
    const themeStrip = document.createElement("div");
    themeStrip.className = "gt-theme-strip";
    const themeChips = [];
    const LED_COLORS = {
      tempo: "#FF1493",
      nixie: "#FF8C00",
      system: "#00FF41",
      studio: "#FFFFFF",
      cyber: "#00D1FF"
    };
    for (const t of CLOCK_THEMES) {
      const chip = document.createElement("button");
      chip.className = "gt-theme-chip";
      const tc = LED_COLORS[t.name.toLowerCase()] || "#fff";
      chip.style.setProperty("--tc", tc);
      if (t.name.toLowerCase() === initialTheme.toLowerCase()) chip.classList.add("active");
      const led = document.createElement("span");
      led.className = "gt-led";
      led.style.background = tc;
      chip.appendChild(led);
      const label = document.createElement("span");
      label.textContent = t.name;
      chip.appendChild(label);
      chip.addEventListener("click", () => {
        themeChips.forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        ctrl.onThemeChange?.(t.name);
      });
      themeStrip.appendChild(chip);
      themeChips.push(chip);
    }
    themeSection.appendChild(themeStrip);
    drawerContent.appendChild(themeSection);
    const sysSection = document.createElement("div");
    sysSection.className = "gt-section";
    sysSection.innerHTML = '<div class="gt-section-title">System</div>';
    const shareBtn = document.createElement("button");
    shareBtn.className = "gt-sys-btn";
    shareBtn.textContent = "Share URL";
    shareBtn.addEventListener("click", () => {
      ctrl.onShareURL?.();
      shareBtn.textContent = "Copied!";
      setTimeout(() => {
        shareBtn.textContent = "Share URL";
      }, 1500);
    });
    sysSection.appendChild(shareBtn);
    const resetBtn = document.createElement("button");
    resetBtn.className = "gt-sys-btn";
    resetBtn.textContent = "Reset to Default";
    resetBtn.addEventListener("click", () => ctrl.onResetDefaults?.());
    sysSection.appendChild(resetBtn);
    drawerContent.appendChild(sysSection);
    drawer.appendChild(drawerContent);
    document.body.appendChild(overlay);
    document.body.appendChild(drawer);
    let drawerOpen = false;
    function toggleDrawer() {
      drawerOpen = !drawerOpen;
      drawer.classList.toggle("open", drawerOpen);
      overlay.classList.toggle("open", drawerOpen);
    }
    function closeDrawer() {
      drawerOpen = false;
      drawer.classList.remove("open");
      overlay.classList.remove("open");
    }
    const ctrl = {
      el: controls,
      show() {
        controls.classList.remove("hidden");
      },
      hide() {
        controls.classList.add("hidden");
        if (drawerOpen) closeDrawer();
      },
      onStart: null,
      onPause: null,
      onStop: null,
      onBpmChange: null,
      onBarsChange: null,
      onRowsChange: null,
      onSoundChange: null,
      onThemeChange: null,
      onModeChange: null,
      onShareURL: null,
      onResetDefaults: null,
      setPaused(p) {
        startBtn.style.display = p ? "" : "none";
        pauseBtn.style.display = p ? "none" : "";
      },
      setThemeName(name) {
        themeChips.forEach((c) => {
          c.classList.toggle("active", c.textContent?.toLowerCase() === name.toLowerCase());
        });
      },
      setAccentColor(rgb) {
        const [r, g, b] = rgb;
        const accentBorder = `rgba(${r},${g},${b},0.30)`;
        const accentColor = `rgba(${r},${g},${b},0.70)`;
        for (const btn of [startBtn, pauseBtn, stopBtn, settingsBtn]) {
          btn.style.borderColor = accentBorder;
          btn.style.color = accentColor;
        }
        drawer.style.setProperty("--accent", `rgb(${r},${g},${b})`);
        const titles = drawer.querySelectorAll(".gt-section-title");
        for (const t of titles) t.style.color = `rgba(${r},${g},${b},0.35)`;
      },
      setBpm(bpm) {
        currentBpm = bpm;
        bpmSlider.value = String(bpm);
        bpmDisplay.value = String(bpm);
        updateDuration();
      },
      setBars(bars) {
        currentBars = bars;
        barsSlider.value = String(Math.min(128, bars));
        barsDisplay.value = String(bars);
        updateDuration();
      },
      setRows(rows) {
        currentRows = rows;
        rowsSlider.value = String(Math.min(64, rows));
        rowsDisplay.value = String(rows);
      },
      setConfigEnabled(enabled) {
        barsSlider.disabled = !enabled;
        barsDisplay.disabled = !enabled;
        barsMinusBtn.disabled = !enabled;
        barsPlusBtn.disabled = !enabled;
        for (const btn of barsPresetBtns) btn.disabled = !enabled;
        barsHint.style.display = enabled ? "none" : "";
        rowsSlider.disabled = !enabled;
        rowsDisplay.disabled = !enabled;
        rowsMinusBtn.disabled = !enabled;
        rowsPlusBtn.disabled = !enabled;
        for (const btn of rowsPresetBtns) btn.disabled = !enabled;
        rowsHint.style.display = enabled ? "none" : "";
      },
      closeDrawer
    };
    startBtn.style.display = "none";
    return ctrl;
  }
  function applyPreset(modeName) {
    const key = Object.keys(PRESETS).find((k) => k.toLowerCase() === modeName.toLowerCase());
    if (!key) return;
    const preset = PRESETS[key];
    for (const k of Object.keys(preset)) {
      PHYSICS[k] = preset[k];
    }
  }

  // src/main.ts
  var params = readParams();
  writeParams(params);
  var BEATS_PER_BAR = 4;
  var rng = createPRNG(params.s);
  function totalBeats() {
    return params.bars * BEATS_PER_BAR;
  }
  var sim = new Simulation({
    numRows: params.rows,
    totalBeats: totalBeats(),
    bpm: params.bpm,
    rng
  });
  var container = document.getElementById("app");
  var renderer = new Renderer(container, params.rows, totalBeats());
  var audio = new AudioEngine();
  audio.soundType = params.sound;
  renderer.setThemeByName(params.theme);
  applyPreset(params.mode);
  var timerBridge = new TimerBridge();
  var lastBeatIndex = -1;
  timerBridge.onTick = (_remainingMs, elapsedMs) => {
    sim.setElapsedMs(elapsedMs);
    const currentBeat = sim.getCurrentBeat();
    if (currentBeat > lastBeatIndex) {
      const beatInBar = currentBeat % BEATS_PER_BAR;
      const accent = beatInBar === 0;
      audio.playBeat(accent);
      lastBeatIndex = currentBeat;
    }
  };
  timerBridge.onDone = () => {
    sim.setElapsedMs(sim.totalTimeMs);
  };
  var consoleCtrl = createConsole(
    params.bpm,
    params.bars,
    params.rows,
    params.theme,
    params.sound,
    params.mode
  );
  consoleCtrl.setAccentColor(getThemeByName(params.theme).segmentRGB);
  var hideTimeout = null;
  function showConsole() {
    consoleCtrl.show();
    if (hideTimeout !== null) clearTimeout(hideTimeout);
    hideTimeout = setTimeout(() => consoleCtrl.hide(), 5e3);
  }
  document.addEventListener("mousemove", showConsole);
  document.addEventListener("touchstart", showConsole);
  showConsole();
  consoleCtrl.onBpmChange = (bpm) => {
    params.bpm = bpm;
    writeParams(params);
    if (appState === "idle") {
      rebuildSim();
      drawIdleFrame();
    } else if (appState === "running" || appState === "paused") {
      const currentBeat = sim.getCurrentBeat();
      const newTotalMs = sim.updateBpm(bpm);
      timerBridge.adjust(newTotalMs, sim.elapsedMs);
      lastBeatIndex = currentBeat - 1;
    }
  };
  consoleCtrl.onBarsChange = (bars) => {
    params.bars = bars;
    writeParams(params);
    if (appState === "idle") {
      rebuildSim();
      drawIdleFrame();
    }
  };
  consoleCtrl.onRowsChange = (rows) => {
    params.rows = rows;
    writeParams(params);
    if (appState === "idle") {
      rebuildSim();
      drawIdleFrame();
    }
  };
  consoleCtrl.onSoundChange = (sound) => {
    audio.soundType = sound;
    params.sound = sound;
    writeParams(params);
  };
  consoleCtrl.onModeChange = (modeName) => {
    applyPreset(modeName);
    params.mode = modeName;
    writeParams(params);
  };
  consoleCtrl.onThemeChange = (themeName) => {
    renderer.setThemeByName(themeName);
    consoleCtrl.setThemeName(themeName);
    consoleCtrl.setAccentColor(getThemeByName(themeName).segmentRGB);
    params.theme = themeName.toLowerCase();
    writeParams(params);
    if (appState === "idle") {
      drawIdleFrame();
    } else if (paused) {
      drawPausedFrame();
    }
  };
  consoleCtrl.onShareURL = () => {
    writeParams(params);
    navigator.clipboard.writeText(window.location.href).catch(() => {
    });
  };
  consoleCtrl.onResetDefaults = () => {
    window.location.search = "";
  };
  consoleCtrl.onStart = () => {
    if (paused) {
      togglePause();
    } else if (appState === "idle" || sim.allSettled) {
      startFresh();
    }
  };
  consoleCtrl.onPause = () => togglePause();
  consoleCtrl.onStop = () => stopToIdle();
  var appState = "idle";
  var lastTime = null;
  var paused = false;
  var rafId = 0;
  var hopperFadeAlpha = 1;
  var stoppingEmitted = 0;
  var stoppingTotal = 0;
  function rebuildSim() {
    rng = createPRNG(params.s);
    sim = new Simulation({
      numRows: params.rows,
      totalBeats: totalBeats(),
      bpm: params.bpm,
      rng
    });
    renderer.clearStatic();
    renderer.resize(params.rows, totalBeats());
  }
  function drawIdleFrame() {
    const tb = totalBeats();
    renderer.drawFrame([], params.bpm, tb, 0, 0, params.bars, 0);
  }
  function drawPausedFrame() {
    const currentBeat = sim.getCurrentBeat();
    const currentBar = Math.floor(currentBeat / BEATS_PER_BAR);
    const beatInBar = currentBeat % BEATS_PER_BAR;
    renderer.drawFrame(
      sim.activeParticles,
      params.bpm,
      sim.totalParticles,
      sim.emittedCount,
      currentBar,
      params.bars,
      beatInBar
    );
  }
  function togglePause() {
    if (appState === "stopping") return;
    if (appState === "idle") return;
    if (sim.allSettled) return;
    paused = !paused;
    consoleCtrl.setPaused(paused);
    if (paused) {
      appState = "paused";
      timerBridge.pause();
      cancelAnimationFrame(rafId);
      drawPausedFrame();
    } else {
      appState = "running";
      timerBridge.resume();
      lastTime = null;
      rafId = requestAnimationFrame(frame);
    }
  }
  async function startFresh() {
    await audio.ensureContext();
    rebuildSim();
    lastBeatIndex = 0;
    const totalMs = Math.max(0, totalBeats() - 1) * (6e4 / params.bpm);
    paused = false;
    appState = "running";
    consoleCtrl.setPaused(false);
    consoleCtrl.setConfigEnabled(false);
    sim.onPegHit = (row, col, numRows) => {
      audio.playPegHit(row, col, numRows);
    };
    timerBridge.start(totalMs);
    audio.playBeat(true);
    lastTime = null;
    rafId = requestAnimationFrame(frame);
  }
  function stopToIdle() {
    if (appState === "idle" || appState === "stopping") return;
    cancelAnimationFrame(rafId);
    timerBridge.reset();
    paused = false;
    consoleCtrl.setPaused(true);
    stoppingEmitted = sim.emittedCount;
    stoppingTotal = sim.totalParticles;
    renderer.fillStacks(params.rows, totalBeats());
    renderer.beginHopperFade();
    hopperFadeAlpha = 1;
    appState = "stopping";
    consoleCtrl.setConfigEnabled(true);
    lastTime = null;
    rafId = requestAnimationFrame(frame);
  }
  window.addEventListener("resize", () => {
    renderer.resize(params.rows, totalBeats());
    if (appState === "idle") {
      drawIdleFrame();
    } else if (paused || sim.allSettled) {
      drawPausedFrame();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      if (appState === "idle") {
        startFresh();
      } else {
        togglePause();
      }
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      cancelAnimationFrame(rafId);
    } else {
      if (appState === "running") {
        const geom = renderer.getGeom();
        const forcedSettled = sim.forceSettleActive();
        for (const p of forcedSettled) renderer.bakeParticle(p);
        const snapped = sim.instantSnap(geom);
        for (const p of snapped) renderer.bakeParticle(p);
        sim.allSettled = false;
        lastTime = null;
        rafId = requestAnimationFrame(frame);
      } else if (appState === "stopping") {
        lastTime = null;
        rafId = requestAnimationFrame(frame);
      }
    }
  });
  function frame(now) {
    if (appState === "paused" || appState === "idle") return;
    if (lastTime === null) lastTime = now;
    const dtMs = Math.min(now - lastTime, 100);
    const dtSec = dtMs / 1e3;
    lastTime = now;
    if (appState === "stopping") {
      hopperFadeAlpha -= dtSec / 0.5;
      renderer.setHopperFadeAlpha(Math.max(0, hopperFadeAlpha));
      renderer.drawFrame([], params.bpm, stoppingTotal, stoppingEmitted, 0, params.bars, 0);
      if (hopperFadeAlpha <= 0) {
        appState = "idle";
        renderer.resetHopperFade();
        drawIdleFrame();
        return;
      }
      rafId = requestAnimationFrame(frame);
      return;
    }
    const geom = renderer.getGeom();
    const settled = sim.update(dtMs, geom, (x) => renderer.getGroundY(x));
    for (const p of settled) {
      renderer.bakeParticle(p);
    }
    const currentBeat = sim.getCurrentBeat();
    const currentBar = Math.floor(currentBeat / BEATS_PER_BAR);
    const beatInBar = currentBeat % BEATS_PER_BAR;
    const beatPhase = sim.elapsedMs % sim.emitIntervalMs / sim.emitIntervalMs;
    renderer.drawFrame(
      sim.activeParticles,
      params.bpm,
      sim.totalParticles,
      sim.emittedCount,
      currentBar,
      params.bars,
      beatInBar,
      beatPhase
    );
    const trulyDone = sim.allSettled && sim.emittedCount >= sim.totalParticles;
    if (trulyDone) {
      appState = "idle";
      consoleCtrl.setPaused(true);
      consoleCtrl.setConfigEnabled(true);
    } else {
      rafId = requestAnimationFrame(frame);
    }
  }
  appState = "idle";
  consoleCtrl.setPaused(true);
  consoleCtrl.setConfigEnabled(true);
  drawIdleFrame();
})();
//# sourceMappingURL=bundle.js.map
