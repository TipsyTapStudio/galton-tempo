/**
 * Control Console for GALTON-TEMPO.
 * Simplified from GALTON-TIMER: BPM control, bars, sound type, theme.
 */

import { PRESETS, PHYSICS, PhysicsParams } from '../engine/simulation';
import { CLOCK_THEMES } from '../engine/seven-seg';
import type { SoundType } from '../engine/audio';

export interface ConsoleController {
  el: HTMLElement;
  show(): void;
  hide(): void;
  onStart: (() => void) | null;
  onPause: (() => void) | null;
  onStop: (() => void) | null;
  onBpmChange: ((bpm: number) => void) | null;
  onBarsChange: ((bars: number) => void) | null;
  onRowsChange: ((rows: number) => void) | null;
  onSoundChange: ((sound: SoundType) => void) | null;
  onPegEnabledChange: ((enabled: boolean) => void) | null;
  onPegVolumeChange: ((volume: number) => void) | null;
  onThemeChange: ((name: string) => void) | null;
  onModeChange: ((mode: string) => void) | null;
  onShareURL: (() => void) | null;
  onResetDefaults: (() => void) | null;
  setPaused(paused: boolean): void;
  setThemeName(name: string): void;
  setAccentColor(rgb: [number, number, number]): void;
  setBpm(bpm: number): void;
  setBars(bars: number): void;
  setRows(rows: number): void;
  setConfigEnabled(enabled: boolean): void;
  closeDrawer(): void;
}

function injectStyles(): void {
  if (document.getElementById('gt-console-style')) return;
  const style = document.createElement('style');
  style.id = 'gt-console-style';
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

    .gt-toggle-row { display: flex; align-items: center; justify-content: space-between; min-height: 36px; margin-bottom: 4px; }
    .gt-toggle {
      position: relative; width: 36px; height: 20px; cursor: pointer; flex-shrink: 0;
    }
    .gt-toggle input { opacity: 0; width: 0; height: 0; }
    .gt-toggle-track {
      position: absolute; inset: 0; border-radius: 10px;
      background: rgba(255,255,255,0.08); transition: background 0.2s;
    }
    .gt-toggle-thumb {
      position: absolute; top: 2px; left: 2px; width: 16px; height: 16px;
      border-radius: 50%; background: rgba(255,255,255,0.35);
      transition: transform 0.2s, background 0.2s;
    }
    .gt-toggle input:checked ~ .gt-toggle-track { background: color-mix(in srgb, var(--accent, #fff) 30%, transparent); }
    .gt-toggle input:checked ~ .gt-toggle-thumb { transform: translateX(16px); background: var(--accent, rgba(255,255,255,0.80)); }

    .gt-credits {
      position: fixed; bottom: 8px; left: 50%; transform: translateX(-50%);
      font-size: 9px; color: rgba(255,255,255,0.12); letter-spacing: 1.5px;
      z-index: 1; pointer-events: none; font-family: 'JetBrains Mono', 'SF Mono', monospace;
    }
  `;
  document.head.appendChild(style);
}

function makeHold(setter: (d: number) => void) {
  let iv: ReturnType<typeof setInterval> | null = null;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return {
    start(d: number) {
      setter(d);
      timeout = setTimeout(() => {
        iv = setInterval(() => setter(d), 80);
      }, 400);
    },
    stop() {
      if (timeout) { clearTimeout(timeout); timeout = null; }
      if (iv) { clearInterval(iv); iv = null; }
    },
  };
}

export function createConsole(
  initialBpm: number,
  initialBars: number,
  initialRows: number,
  initialTheme: string,
  initialSound: SoundType,
  initialMode: string,
): ConsoleController {
  injectStyles();

  let currentBpm = initialBpm;
  let currentBars = initialBars;
  let currentRows = initialRows;

  // Credits
  const creditsEl = document.createElement('div');
  creditsEl.className = 'gt-credits';
  creditsEl.textContent = 'Crafted by Tipsy Tap Studio';
  document.body.appendChild(creditsEl);

  // ── On-screen controls ──
  const controls = document.createElement('div');
  controls.className = 'gt-controls';

  function makeBtn(svg: string, title: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'gt-ctrl-btn';
    btn.innerHTML = svg;
    btn.title = title;
    return btn;
  }

  const startBtn = makeBtn('<svg viewBox="0 0 24 24"><polygon points="6,4 20,12 6,20"/></svg>', 'Start');
  const pauseBtn = makeBtn('<svg viewBox="0 0 24 24"><rect x="5" y="4" width="4" height="16"/><rect x="15" y="4" width="4" height="16"/></svg>', 'Pause');
  const stopBtn = makeBtn('<svg viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>', 'Stop');
  const settingsBtn = makeBtn('<svg viewBox="0 0 24 24"><path d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>', 'Settings');

  startBtn.addEventListener('click', () => ctrl.onStart?.());
  pauseBtn.addEventListener('click', () => ctrl.onPause?.());
  stopBtn.addEventListener('click', () => ctrl.onStop?.());
  settingsBtn.addEventListener('click', () => toggleDrawer());

  controls.appendChild(startBtn);
  controls.appendChild(pauseBtn);
  controls.appendChild(stopBtn);
  controls.appendChild(settingsBtn);
  document.body.appendChild(controls);

  // ── Drawer ──
  const overlay = document.createElement('div');
  overlay.className = 'gt-drawer-overlay';
  overlay.addEventListener('click', () => closeDrawer());

  const drawer = document.createElement('div');
  drawer.className = 'gt-drawer';
  const drawerContent = document.createElement('div');
  drawerContent.className = 'gt-drawer-content';

  // ── Logo ──
  const logoSection = document.createElement('div');
  logoSection.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:8px;';
  logoSection.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="28" height="28" style="flex-shrink:0">
      <circle cx="16" cy="16" r="16" fill="#FF1493"/>
      <polygon points="9,7 23,7 16,16" fill="#000" stroke="#000" stroke-width="2.5" stroke-linejoin="round"/>
      <polygon points="16,16 9,25 23,25" fill="none" stroke="#000" stroke-width="2.5" stroke-linejoin="round"/>
    </svg>
    <span style="font-size:14px;font-weight:700;letter-spacing:3px;color:rgba(255,255,255,0.70)">GALTON-TEMPO</span>
  `;
  drawerContent.appendChild(logoSection);

  // ── TEMPO section ──
  const tempoSection = document.createElement('div');
  tempoSection.className = 'gt-section';
  tempoSection.innerHTML = '<div class="gt-section-title">Tempo</div>';

  // BPM
  const bpmLabel = document.createElement('div');
  bpmLabel.className = 'gt-field-row';
  bpmLabel.innerHTML = '<span class="gt-field-label">BPM</span>';
  bpmLabel.style.marginBottom = '0';
  const bpmHint = document.createElement('span');
  bpmHint.className = 'gt-dur-hint';
  bpmHint.textContent = 'Stop to change';
  bpmHint.style.display = 'none';
  bpmLabel.appendChild(bpmHint);

  const bpmPresetRow = document.createElement('div');
  bpmPresetRow.className = 'gt-preset-row';
  const BPM_PRESETS = [
    { label: '60', val: 60 },
    { label: '90', val: 90 },
    { label: '120', val: 120 },
    { label: '140', val: 140 },
    { label: '160', val: 160 },
  ];
  const bpmPresetBtns: HTMLButtonElement[] = [];
  for (const p of BPM_PRESETS) {
    const btn = document.createElement('button');
    btn.className = 'gt-preset-btn';
    btn.textContent = p.label;
    if (p.val === currentBpm) btn.classList.add('active');
    btn.addEventListener('click', () => {
      setBpmVal(p.val);
      bpmPresetBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
    bpmPresetRow.appendChild(btn);
    bpmPresetBtns.push(btn);
  }

  const bpmRow = document.createElement('div');
  bpmRow.className = 'gt-dur-row';
  const bpmMinusBtn = document.createElement('button');
  bpmMinusBtn.className = 'gt-dur-btn';
  bpmMinusBtn.textContent = '\u2212';
  const bpmSlider = document.createElement('input');
  bpmSlider.type = 'range';
  bpmSlider.className = 'gt-slider-input';
  bpmSlider.min = '20';
  bpmSlider.max = '300';
  bpmSlider.step = '1';
  bpmSlider.value = String(currentBpm);
  bpmSlider.style.flex = '1';
  const bpmDisplay = document.createElement('input');
  bpmDisplay.className = 'gt-dur-display';
  bpmDisplay.type = 'text';
  bpmDisplay.value = String(currentBpm);
  const bpmPlusBtn = document.createElement('button');
  bpmPlusBtn.className = 'gt-dur-btn';
  bpmPlusBtn.textContent = '+';

  function setBpmVal(v: number): void {
    v = Math.max(20, Math.min(300, v));
    currentBpm = v;
    bpmSlider.value = String(v);
    bpmDisplay.value = String(v);
    updateDuration();
    ctrl.onBpmChange?.(v);
  }

  bpmSlider.addEventListener('input', () => {
    const v = parseInt(bpmSlider.value, 10);
    currentBpm = v;
    bpmDisplay.value = String(v);
    bpmPresetBtns.forEach(b => b.classList.remove('active'));
    updateDuration();
    ctrl.onBpmChange?.(v);
  });
  bpmDisplay.addEventListener('change', () => {
    const v = parseInt(bpmDisplay.value, 10);
    if (Number.isFinite(v)) setBpmVal(v);
    else bpmDisplay.value = String(currentBpm);
  });

  const bpmHold = makeHold((d) => setBpmVal(currentBpm + d));
  bpmMinusBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); bpmHold.start(-1); });
  bpmMinusBtn.addEventListener('pointerup', () => bpmHold.stop());
  bpmMinusBtn.addEventListener('pointerleave', () => bpmHold.stop());
  bpmPlusBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); bpmHold.start(1); });
  bpmPlusBtn.addEventListener('pointerup', () => bpmHold.stop());
  bpmPlusBtn.addEventListener('pointerleave', () => bpmHold.stop());

  bpmRow.appendChild(bpmMinusBtn);
  bpmRow.appendChild(bpmSlider);
  bpmRow.appendChild(bpmDisplay);
  bpmRow.appendChild(bpmPlusBtn);

  tempoSection.appendChild(bpmLabel);
  tempoSection.appendChild(bpmPresetRow);
  tempoSection.appendChild(bpmRow);

  // Bars
  const barsLabel = document.createElement('div');
  barsLabel.className = 'gt-field-row';
  barsLabel.innerHTML = '<span class="gt-field-label">Bars</span>';
  barsLabel.style.marginBottom = '0';
  const barsHint = document.createElement('span');
  barsHint.className = 'gt-dur-hint';
  barsHint.textContent = 'Stop to change';
  barsHint.style.display = 'none';
  barsLabel.appendChild(barsHint);

  const barsPresetRow = document.createElement('div');
  barsPresetRow.className = 'gt-preset-row';
  const BARS_PRESETS = [
    { label: '32', val: 32 },
    { label: '64', val: 64 },
    { label: '128', val: 128 },
    { label: '256', val: 256 },
    { label: '512', val: 512 },
  ];
  const barsPresetBtns: HTMLButtonElement[] = [];
  for (const p of BARS_PRESETS) {
    const btn = document.createElement('button');
    btn.className = 'gt-preset-btn';
    btn.textContent = p.label;
    if (p.val === currentBars) btn.classList.add('active');
    btn.addEventListener('click', () => {
      setBarsVal(p.val);
      barsPresetBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
    barsPresetRow.appendChild(btn);
    barsPresetBtns.push(btn);
  }

  const barsRow = document.createElement('div');
  barsRow.className = 'gt-dur-row';
  const barsMinusBtn = document.createElement('button');
  barsMinusBtn.className = 'gt-dur-btn';
  barsMinusBtn.textContent = '\u2212';
  const barsSlider = document.createElement('input');
  barsSlider.type = 'range';
  barsSlider.className = 'gt-slider-input';
  barsSlider.min = '1';
  barsSlider.max = '999';
  barsSlider.step = '1';
  barsSlider.value = String(currentBars);
  barsSlider.style.flex = '1';
  const barsDisplay = document.createElement('input');
  barsDisplay.className = 'gt-dur-display';
  barsDisplay.type = 'text';
  barsDisplay.value = String(currentBars);
  const barsPlusBtn = document.createElement('button');
  barsPlusBtn.className = 'gt-dur-btn';
  barsPlusBtn.textContent = '+';

  function setBarsVal(v: number): void {
    v = Math.max(1, Math.min(999, v));
    currentBars = v;
    barsSlider.value = String(Math.min(999, v));
    barsDisplay.value = String(v);
    updateDuration();
    ctrl.onBarsChange?.(v);
  }

  barsSlider.addEventListener('input', () => {
    const v = parseInt(barsSlider.value, 10);
    currentBars = v;
    barsDisplay.value = String(v);
    barsPresetBtns.forEach(b => b.classList.remove('active'));
    updateDuration();
    ctrl.onBarsChange?.(v);
  });
  barsDisplay.addEventListener('change', () => {
    const v = parseInt(barsDisplay.value, 10);
    if (Number.isFinite(v)) setBarsVal(v);
    else barsDisplay.value = String(currentBars);
  });

  const barsHold = makeHold((d) => setBarsVal(currentBars + d));
  barsMinusBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); barsHold.start(-1); });
  barsMinusBtn.addEventListener('pointerup', () => barsHold.stop());
  barsMinusBtn.addEventListener('pointerleave', () => barsHold.stop());
  barsPlusBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); barsHold.start(1); });
  barsPlusBtn.addEventListener('pointerup', () => barsHold.stop());
  barsPlusBtn.addEventListener('pointerleave', () => barsHold.stop());

  barsRow.appendChild(barsMinusBtn);
  barsRow.appendChild(barsSlider);
  barsRow.appendChild(barsDisplay);
  barsRow.appendChild(barsPlusBtn);

  // Duration info row (read-only)
  const durationRow = document.createElement('div');
  durationRow.className = 'gt-field-row';
  durationRow.style.marginTop = '-2px';
  const durationLabel = document.createElement('span');
  durationLabel.className = 'gt-field-label';
  durationLabel.style.fontSize = '10px';
  durationLabel.style.opacity = '0.5';
  durationRow.appendChild(durationLabel);

  function updateDuration(): void {
    const secs = currentBars * 4 * 60 / currentBpm;
    const m = Math.floor(secs / 60);
    const s = Math.round(secs % 60);
    durationLabel.textContent = `\u2248 ${m}:${String(s).padStart(2, '0')}`;
  }
  updateDuration();

  tempoSection.appendChild(barsLabel);
  tempoSection.appendChild(barsPresetRow);
  tempoSection.appendChild(barsRow);
  tempoSection.appendChild(durationRow);

  // Rows
  const rowsLabel = document.createElement('div');
  rowsLabel.className = 'gt-field-row';
  rowsLabel.innerHTML = '<span class="gt-field-label">Rows</span>';
  rowsLabel.style.marginBottom = '0';
  const rowsHint = document.createElement('span');
  rowsHint.className = 'gt-dur-hint';
  rowsHint.textContent = 'Stop to change';
  rowsHint.style.display = 'none';
  rowsLabel.appendChild(rowsHint);

  const rowsPresetRow = document.createElement('div');
  rowsPresetRow.className = 'gt-preset-row';
  const ROWS_PRESETS = [
    { label: '8', val: 8 },
    { label: '16', val: 16 },
    { label: '24', val: 24 },
    { label: '32', val: 32 },
    { label: '48', val: 48 },
  ];
  const rowsPresetBtns: HTMLButtonElement[] = [];
  for (const p of ROWS_PRESETS) {
    const btn = document.createElement('button');
    btn.className = 'gt-preset-btn';
    btn.textContent = p.label;
    if (p.val === currentRows) btn.classList.add('active');
    btn.addEventListener('click', () => {
      setRowsVal(p.val);
      rowsPresetBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
    rowsPresetRow.appendChild(btn);
    rowsPresetBtns.push(btn);
  }

  const rowsRow = document.createElement('div');
  rowsRow.className = 'gt-dur-row';
  const rowsMinusBtn = document.createElement('button');
  rowsMinusBtn.className = 'gt-dur-btn';
  rowsMinusBtn.textContent = '\u2212';
  const rowsSlider = document.createElement('input');
  rowsSlider.type = 'range';
  rowsSlider.className = 'gt-slider-input';
  rowsSlider.min = '4';
  rowsSlider.max = '64';
  rowsSlider.step = '1';
  rowsSlider.value = String(currentRows);
  rowsSlider.style.flex = '1';
  const rowsDisplay = document.createElement('input');
  rowsDisplay.className = 'gt-dur-display';
  rowsDisplay.type = 'text';
  rowsDisplay.value = String(currentRows);
  const rowsPlusBtn = document.createElement('button');
  rowsPlusBtn.className = 'gt-dur-btn';
  rowsPlusBtn.textContent = '+';

  function setRowsVal(v: number): void {
    v = Math.max(4, Math.min(64, v));
    currentRows = v;
    rowsSlider.value = String(v);
    rowsDisplay.value = String(v);
    ctrl.onRowsChange?.(v);
  }

  rowsSlider.addEventListener('input', () => {
    const v = parseInt(rowsSlider.value, 10);
    currentRows = v;
    rowsDisplay.value = String(v);
    rowsPresetBtns.forEach(b => b.classList.remove('active'));
    ctrl.onRowsChange?.(v);
  });
  rowsDisplay.addEventListener('change', () => {
    const v = parseInt(rowsDisplay.value, 10);
    if (Number.isFinite(v)) setRowsVal(v);
    else rowsDisplay.value = String(currentRows);
  });

  const rowsHold = makeHold((d) => setRowsVal(currentRows + d));
  rowsMinusBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); rowsHold.start(-1); });
  rowsMinusBtn.addEventListener('pointerup', () => rowsHold.stop());
  rowsMinusBtn.addEventListener('pointerleave', () => rowsHold.stop());
  rowsPlusBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); rowsHold.start(1); });
  rowsPlusBtn.addEventListener('pointerup', () => rowsHold.stop());
  rowsPlusBtn.addEventListener('pointerleave', () => rowsHold.stop());

  rowsRow.appendChild(rowsMinusBtn);
  rowsRow.appendChild(rowsSlider);
  rowsRow.appendChild(rowsDisplay);
  rowsRow.appendChild(rowsPlusBtn);

  tempoSection.appendChild(rowsLabel);
  tempoSection.appendChild(rowsPresetRow);
  tempoSection.appendChild(rowsRow);

  // Sound type
  const soundRow = document.createElement('div');
  soundRow.className = 'gt-field-row';
  soundRow.innerHTML = '<span class="gt-field-label">Sound</span>';
  const soundSelect = document.createElement('select');
  soundSelect.className = 'gt-field-select';
  for (const [val, label] of [['click', 'Click'], ['kick', 'Kick'], ['both', 'Both']] as const) {
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = label;
    if (val === initialSound) opt.selected = true;
    soundSelect.appendChild(opt);
  }
  soundSelect.addEventListener('change', () => {
    ctrl.onSoundChange?.(soundSelect.value as SoundType);
  });
  soundRow.appendChild(soundSelect);
  tempoSection.appendChild(soundRow);

  // Peg sound toggle
  const pegRow = document.createElement('div');
  pegRow.className = 'gt-toggle-row';
  const pegLabel = document.createElement('span');
  pegLabel.className = 'gt-field-label';
  pegLabel.textContent = 'Peg Sound';
  pegRow.appendChild(pegLabel);

  const pegToggle = document.createElement('label');
  pegToggle.className = 'gt-toggle';
  const pegCheck = document.createElement('input');
  pegCheck.type = 'checkbox';
  pegCheck.checked = true;
  const pegTrack = document.createElement('span');
  pegTrack.className = 'gt-toggle-track';
  const pegThumb = document.createElement('span');
  pegThumb.className = 'gt-toggle-thumb';
  pegToggle.appendChild(pegCheck);
  pegToggle.appendChild(pegTrack);
  pegToggle.appendChild(pegThumb);
  pegRow.appendChild(pegToggle);
  tempoSection.appendChild(pegRow);

  pegCheck.addEventListener('change', () => {
    ctrl.onPegEnabledChange?.(pegCheck.checked);
    pegVolSlider.disabled = !pegCheck.checked;
  });

  // Peg volume slider
  const pegVolRow = document.createElement('div');
  pegVolRow.className = 'gt-field-row';
  const pegVolLabel = document.createElement('span');
  pegVolLabel.className = 'gt-field-label';
  pegVolLabel.textContent = 'Peg Vol';
  pegVolLabel.style.fontSize = '10px';
  pegVolRow.appendChild(pegVolLabel);
  const pegVolSlider = document.createElement('input');
  pegVolSlider.type = 'range';
  pegVolSlider.className = 'gt-slider-input';
  pegVolSlider.min = '0';
  pegVolSlider.max = '100';
  pegVolSlider.step = '1';
  pegVolSlider.value = '50';
  pegVolSlider.style.flex = '1';
  pegVolSlider.addEventListener('input', () => {
    ctrl.onPegVolumeChange?.(parseInt(pegVolSlider.value, 10) / 100);
  });
  pegVolRow.appendChild(pegVolSlider);
  tempoSection.appendChild(pegVolRow);

  // Physics preset
  const presetRow = document.createElement('div');
  presetRow.className = 'gt-field-row';
  presetRow.innerHTML = '<span class="gt-field-label">Physics</span>';
  const presetSelect = document.createElement('select');
  presetSelect.className = 'gt-field-select';
  for (const name of Object.keys(PRESETS)) {
    const opt = document.createElement('option');
    opt.value = name.toLowerCase();
    opt.textContent = name;
    if (name.toLowerCase() === initialMode.toLowerCase()) opt.selected = true;
    presetSelect.appendChild(opt);
  }
  presetSelect.addEventListener('change', () => {
    ctrl.onModeChange?.(presetSelect.value);
  });
  presetRow.appendChild(presetSelect);
  tempoSection.appendChild(presetRow);

  drawerContent.appendChild(tempoSection);

  // ── THEME section ──
  const themeSection = document.createElement('div');
  themeSection.className = 'gt-section';
  themeSection.innerHTML = '<div class="gt-section-title">Theme</div>';

  const themeStrip = document.createElement('div');
  themeStrip.className = 'gt-theme-strip';
  const themeChips: HTMLButtonElement[] = [];

  const LED_COLORS: Record<string, string> = {
    tempo: '#FF1493', nixie: '#FF8C00', system: '#00FF41', studio: '#FFFFFF', cyber: '#00D1FF',
  };

  for (const t of CLOCK_THEMES) {
    const chip = document.createElement('button');
    chip.className = 'gt-theme-chip';
    const tc = LED_COLORS[t.name.toLowerCase()] || '#fff';
    chip.style.setProperty('--tc', tc);
    if (t.name.toLowerCase() === initialTheme.toLowerCase()) chip.classList.add('active');

    const led = document.createElement('span');
    led.className = 'gt-led';
    led.style.background = tc;
    chip.appendChild(led);
    const label = document.createElement('span');
    label.textContent = t.name;
    chip.appendChild(label);

    chip.addEventListener('click', () => {
      themeChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      ctrl.onThemeChange?.(t.name);
    });
    themeStrip.appendChild(chip);
    themeChips.push(chip);
  }
  themeSection.appendChild(themeStrip);
  drawerContent.appendChild(themeSection);

  // ── SYSTEM section ──
  const sysSection = document.createElement('div');
  sysSection.className = 'gt-section';
  sysSection.innerHTML = '<div class="gt-section-title">System</div>';

  const shareBtn = document.createElement('button');
  shareBtn.className = 'gt-sys-btn';
  shareBtn.textContent = 'Share URL';
  shareBtn.addEventListener('click', () => {
    ctrl.onShareURL?.();
    shareBtn.textContent = 'Copied!';
    setTimeout(() => { shareBtn.textContent = 'Share URL'; }, 1500);
  });
  sysSection.appendChild(shareBtn);

  const resetBtn = document.createElement('button');
  resetBtn.className = 'gt-sys-btn';
  resetBtn.textContent = 'Reset to Default';
  resetBtn.addEventListener('click', () => ctrl.onResetDefaults?.());
  sysSection.appendChild(resetBtn);

  drawerContent.appendChild(sysSection);

  drawer.appendChild(drawerContent);
  document.body.appendChild(overlay);
  document.body.appendChild(drawer);

  // ── Drawer toggle ──
  let drawerOpen = false;
  function toggleDrawer(): void {
    drawerOpen = !drawerOpen;
    drawer.classList.toggle('open', drawerOpen);
    overlay.classList.toggle('open', drawerOpen);
  }
  function closeDrawer(): void {
    drawerOpen = false;
    drawer.classList.remove('open');
    overlay.classList.remove('open');
  }

  // ── Controller ──
  const ctrl: ConsoleController = {
    el: controls,
    show() { controls.classList.remove('hidden'); },
    hide() { controls.classList.add('hidden'); if (drawerOpen) closeDrawer(); },
    onStart: null, onPause: null, onStop: null,
    onBpmChange: null, onBarsChange: null, onRowsChange: null, onSoundChange: null,
    onPegEnabledChange: null, onPegVolumeChange: null,
    onThemeChange: null, onModeChange: null, onShareURL: null, onResetDefaults: null,
    setPaused(p: boolean) {
      startBtn.style.display = p ? '' : 'none';
      pauseBtn.style.display = p ? 'none' : '';
    },
    setThemeName(name: string) {
      themeChips.forEach(c => {
        c.classList.toggle('active', c.textContent?.toLowerCase() === name.toLowerCase());
      });
    },
    setAccentColor(rgb: [number, number, number]) {
      const [r, g, b] = rgb;
      const accentBorder = `rgba(${r},${g},${b},0.30)`;
      const accentColor = `rgba(${r},${g},${b},0.70)`;
      for (const btn of [startBtn, pauseBtn, stopBtn, settingsBtn]) {
        btn.style.borderColor = accentBorder;
        btn.style.color = accentColor;
      }
      drawer.style.setProperty('--accent', `rgb(${r},${g},${b})`);
      const titles = drawer.querySelectorAll<HTMLElement>('.gt-section-title');
      for (const t of titles) t.style.color = `rgba(${r},${g},${b},0.35)`;
    },
    setBpm(bpm: number) {
      currentBpm = bpm;
      bpmSlider.value = String(bpm);
      bpmDisplay.value = String(bpm);
      updateDuration();
    },
    setBars(bars: number) {
      currentBars = bars;
      barsSlider.value = String(Math.min(128, bars));
      barsDisplay.value = String(bars);
      updateDuration();
    },
    setRows(rows: number) {
      currentRows = rows;
      rowsSlider.value = String(Math.min(64, rows));
      rowsDisplay.value = String(rows);
    },
    setConfigEnabled(enabled: boolean) {
      // BPM: always enabled (live tempo change)
      // Bars + Rows: disabled during run
      barsSlider.disabled = !enabled;
      barsDisplay.disabled = !enabled;
      barsMinusBtn.disabled = !enabled;
      barsPlusBtn.disabled = !enabled;
      for (const btn of barsPresetBtns) btn.disabled = !enabled;
      barsHint.style.display = enabled ? 'none' : '';

      rowsSlider.disabled = !enabled;
      rowsDisplay.disabled = !enabled;
      rowsMinusBtn.disabled = !enabled;
      rowsPlusBtn.disabled = !enabled;
      for (const btn of rowsPresetBtns) btn.disabled = !enabled;
      rowsHint.style.display = enabled ? 'none' : '';
    },
    closeDrawer,
  };

  startBtn.style.display = 'none';
  return ctrl;
}

export function applyPreset(modeName: string): void {
  const key = Object.keys(PRESETS).find(k => k.toLowerCase() === modeName.toLowerCase());
  if (!key) return;
  const preset = PRESETS[key];
  for (const k of Object.keys(preset) as (keyof PhysicsParams)[]) {
    (PHYSICS as any)[k] = preset[k];
  }
}
