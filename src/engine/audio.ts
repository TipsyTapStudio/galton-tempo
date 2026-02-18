/**
 * AudioEngine — Web Audio synthesis for GALTON-TEMPO.
 *
 * Sound types:
 *   1. Click: short noise burst (metronome wood block)
 *   2. Kick:  low sine with pitch envelope
 *   3. Peg hit: short metallic ping (pitch varies by position)
 */

export type SoundType = 'click' | 'kick' | 'both';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  soundType: SoundType = 'click';

  /** Must be called after a user gesture (tap/click). */
  async ensureContext(): Promise<void> {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.7;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  /** Play metronome beat. accent = true for beat 1 of bar. */
  playBeat(accent: boolean): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    if (this.soundType === 'click' || this.soundType === 'both') {
      this.playClick(now, accent);
    }
    if (this.soundType === 'kick' || this.soundType === 'both') {
      this.playKick(now, accent);
    }
  }

  /** Play peg collision sound. Pitch mapped from row/col position. */
  playPegHit(row: number, col: number, numRows: number): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    // Map row to frequency: higher rows = higher pitch
    // Range: ~200Hz (row 0) to ~2000Hz (last row)
    const rowFrac = row / Math.max(1, numRows - 1);
    const freq = 200 + rowFrac * 1800;

    // Slight pan based on column position
    const colFrac = row > 0 ? (col / row - 0.5) * 2 : 0;

    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.03, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    // Pan
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, colFrac * 0.6));

    osc.connect(gain);
    gain.connect(pan);
    pan.connect(this.masterGain!);

    osc.start(now);
    osc.stop(now + 0.05);
  }

  private playClick(time: number, accent: boolean): void {
    const ctx = this.ctx!;

    // Short oscillator burst (wood block style)
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = accent ? 1500 : 1000;

    const gain = ctx.createGain();
    const vol = accent ? 0.5 : 0.3;
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.03);

    // High-pass for click character
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 600;

    osc.connect(hp);
    hp.connect(gain);
    gain.connect(this.masterGain!);

    osc.start(time);
    osc.stop(time + 0.04);
  }

  private playKick(time: number, accent: boolean): void {
    const ctx = this.ctx!;

    // Body: triangle wave (harmonics richer than sine, audible on laptop speakers)
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(accent ? 220 : 180, time);
    osc.frequency.exponentialRampToValueAtTime(50, time + 0.10);

    const gain = ctx.createGain();
    const vol = accent ? 0.7 : 0.5;
    gain.gain.setValueAtTime(vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.20);

    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(time);
    osc.stop(time + 0.25);

    // Attack transient: short noise burst for click presence
    const bufLen = Math.ceil(ctx.sampleRate * 0.015);
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;

    const noise = ctx.createBufferSource();
    noise.buffer = buf;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(accent ? 0.4 : 0.25, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.015);

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 800;
    bp.Q.value = 1.5;

    noise.connect(bp);
    bp.connect(noiseGain);
    noiseGain.connect(this.masterGain!);
    noise.start(time);
    noise.stop(time + 0.02);
  }
}
