/**
 * URL parameter serialization for GALTON-TEMPO.
 */

export interface AppParams {
  bpm: number;
  bars: number;
  rows: number;
  s: number;
  sound: string;
  theme: string;
  mode: string;
}

const VALID_SOUNDS = ['click', 'kick', 'both'];
const VALID_THEMES = ['tempo', 'nixie', 'system', 'studio', 'cyber'];
const VALID_MODES = ['standard', 'heavy sand', 'techno', 'moon gravity', 'super ball'];

const DEFAULTS: AppParams = {
  bpm: 120,
  bars: 128,
  rows: 24,
  s: 0,
  sound: 'click',
  theme: 'tempo',
  mode: 'standard',
};

export function readParams(): AppParams {
  const sp = new URLSearchParams(window.location.search);
  const raw = (key: string, fallback: number): number => {
    const v = sp.get(key);
    if (v === null) return fallback;
    const num = parseInt(v, 10);
    return Number.isFinite(num) ? num : fallback;
  };

  let seed = raw('s', DEFAULTS.s);
  if (seed === 0) {
    seed = (Date.now() % 1_000_000) | 1;
  }

  const soundRaw = (sp.get('sound') || DEFAULTS.sound).toLowerCase().trim();
  const sound = VALID_SOUNDS.includes(soundRaw) ? soundRaw : DEFAULTS.sound;

  const themeRaw = (sp.get('theme') || DEFAULTS.theme).toLowerCase().trim();
  const theme = VALID_THEMES.includes(themeRaw) ? themeRaw : DEFAULTS.theme;

  const modeRaw = (sp.get('mode') || DEFAULTS.mode).toLowerCase().trim();
  const mode = VALID_MODES.includes(modeRaw) ? modeRaw : DEFAULTS.mode;

  return {
    bpm: Math.max(20, Math.min(300, raw('bpm', DEFAULTS.bpm))),
    bars: Math.max(1, Math.min(999, raw('bars', DEFAULTS.bars))),
    rows: Math.max(4, Math.min(64, raw('rows', DEFAULTS.rows))),
    s: seed,
    sound,
    theme,
    mode,
  };
}

export function writeParams(cfg: AppParams): void {
  const sp = new URLSearchParams();
  sp.set('bpm', String(cfg.bpm));
  sp.set('bars', String(cfg.bars));
  sp.set('rows', String(cfg.rows));
  sp.set('s', String(cfg.s));
  sp.set('sound', cfg.sound);
  sp.set('theme', cfg.theme);
  sp.set('mode', cfg.mode);
  // Preserve debug flag across URL rewrites
  const current = new URLSearchParams(window.location.search);
  if (current.get('debug') === '1') sp.set('debug', '1');
  const url = `${window.location.pathname}?${sp.toString()}`;
  window.history.replaceState(null, '', url);
}
