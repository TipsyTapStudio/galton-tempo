/**
 * Clone System — band-style mirrored peg grid display.
 * Pattern: ...▽△▽△▽△▽...
 *
 * Phase 1: all clones share the same beat phase (no delay).
 * Future phases will add per-clone delay and individual effects.
 */

import type { Layout } from './layout';

/** Static configuration for a single clone unit */
export interface CloneConfig {
  /** Horizontal offset from Layout.centerX (CSS px) */
  offsetX: number;
  /** Whether this unit is vertically flipped (▽) */
  flipY: boolean;
  /** Band index (±1, ±2, ...; 0 = main, not in this array) */
  index: number;
}

/** Per-frame state for each clone */
export interface CloneState {
  config: CloneConfig;
  /** Current beat phase [0..1) — controls peg glow wave */
  beatPhase: number;
  /** Opacity multiplier for grain particles (0..1) */
  grainAlpha: number;
}

/**
 * Compute the band of clones that fit the current screen.
 * Center (△) is the main board and is NOT included in the result.
 * Odd distance from center = flipped (▽), even = normal (△).
 *
 * Step = (numRows + 3) × pegSpacing
 * → bottom-row gap between adjacent units ≈ 4 × pegSpacing.
 * Upper rows are narrower so their gaps are proportionally wider,
 * creating a natural visual separation that tightens toward the base.
 */
export function computeBandClones(L: Layout): CloneConfig[] {
  const step = (L.numRows + 3) * L.pegSpacing;

  if (step <= 0) return [];

  const clones: CloneConfig[] = [];
  const bottomRowW = (L.numRows - 1) * L.pegSpacing;
  const maxReach = L.width / 2 + bottomRowW; // include partially visible units

  for (let i = 1; step * i - bottomRowW / 2 < maxReach; i++) {
    const flipped = i % 2 === 1;
    clones.push({ offsetX:  step * i, flipY: flipped, index:  i });
    clones.push({ offsetX: -step * i, flipY: flipped, index: -i });
  }

  return clones;
}

/**
 * Build per-frame CloneState array.
 * Phase 1: every clone uses the same beatPhase as the main board.
 * Clone grains are rendered at reduced opacity.
 */
export function updateCloneStates(
  configs: CloneConfig[],
  beatPhase: number,
): CloneState[] {
  return configs.map(config => ({ config, beatPhase, grainAlpha: 0.35 }));
}
