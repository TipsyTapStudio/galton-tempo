/**
 * GALTON-TEMPO — main entry point.
 * "Rhythm from Chaos, Groove from Gravity."
 *
 * A physics-based metronome and rhythm machine.
 * Grains are emitted on BPM beats, collide with pegs producing sounds,
 * and settle into bins creating visual rhythm patterns.
 */

const container = document.getElementById('app')!;
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d')!;
container.appendChild(canvas);

function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}

function draw(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  ctx.clearRect(0, 0, w, h);

  // Placeholder: project title
  ctx.fillStyle = 'rgba(255,140,0,0.8)';
  ctx.font = '700 24px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('GALTON-TEMPO', w / 2, h / 2 - 16);

  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.font = '400 12px "JetBrains Mono", monospace';
  ctx.fillText('Rhythm from Chaos, Groove from Gravity.', w / 2, h / 2 + 16);
}

window.addEventListener('resize', resize);
resize();
