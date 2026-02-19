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
}

/**
 * Compute the band of clones that fit the current screen.
 * Center (△) is the main board and is NOT included in the result.
 * Odd distance from center = flipped (▽), even = normal (△).
 * Margin between adjacent units: pegSpacing × 1.5
 */
export function computeBandClones(L: Layout): CloneConfig[] {
  const unitW = L.numRows * L.pegSpacing;
  const margin = L.pegSpacing * 1.5;
  const step = unitW + margin;

  if (step <= 0) return [];

  const clones: CloneConfig[] = [];
  const maxReach = L.width / 2 + unitW; // include partially visible units

  for (let i = 1; step * i - unitW / 2 < maxReach; i++) {
    const flipped = i % 2 === 1;
    clones.push({ offsetX:  step * i, flipY: flipped, index:  i });
    clones.push({ offsetX: -step * i, flipY: flipped, index: -i });
  }

  return clones;
}

/**
 * Build per-frame CloneState array.
 * Phase 1: every clone uses the same beatPhase as the main board.
 */
export function updateCloneStates(
  configs: CloneConfig[],
  beatPhase: number,
): CloneState[] {
  return configs.map(config => ({ config, beatPhase }));
}
