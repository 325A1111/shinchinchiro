// Web Audio API Sound Synthesizer for Japanese Chinchirorin

class ChinchiroSoundEngine {
  private ctx: AudioContext | null = null;
  public enabled: boolean = true;

  private getContext(): AudioContext | null {
    if (!this.enabled) return null;
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  // Ceramic bowl dice clink ("Chin-Chiro-Rin")
  public playDiceRoll(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Series of high ceramic metallic/porcelain pings simulating dice hitting a ceramic donburi bowl
    const pings = [
      { time: 0.0, freq: 2450, dur: 0.06, gain: 0.12 },
      { time: 0.05, freq: 3120, dur: 0.05, gain: 0.10 },
      { time: 0.11, freq: 2780, dur: 0.07, gain: 0.14 },
      { time: 0.18, freq: 3420, dur: 0.05, gain: 0.09 },
      { time: 0.25, freq: 2890, dur: 0.08, gain: 0.11 },
      { time: 0.34, freq: 3680, dur: 0.14, gain: 0.13 },
    ];

    pings.forEach((p) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(p.freq, now + p.time);
      osc.frequency.exponentialRampToValueAtTime(p.freq * 0.88, now + p.time + p.dur);

      gain.gain.setValueAtTime(0.001, now + p.time);
      gain.gain.linearRampToValueAtTime(p.gain, now + p.time + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, now + p.time + p.dur);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + p.time);
      osc.stop(now + p.time + p.dur + 0.01);
    });
  }

  // Hyoshigi wooden clapper / Taiko sound for strong Yaku (Pinzoro, Arashi, Shigoro)
  public playHighYaku(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Two crisp wooden clapper strikes ("Kan! Kan!")
    [0, 0.16].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1680, now + offset);
      osc.frequency.exponentialRampToValueAtTime(920, now + offset + 0.09);

      gain.gain.setValueAtTime(0.001, now + offset);
      gain.gain.linearRampToValueAtTime(0.24, now + offset + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.11);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.12);
    });
  }

  // Standard lock-in chime for normal point (Demé)
  public playPointLock(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, now); // D5
    osc.frequency.setValueAtTime(880, now + 0.08); // A5

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  // Low dull thud for Menashi or Hifumi / Shonben
  public playMissOrPenalty(isSevere: boolean = false): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = isSevere ? 'sawtooth' : 'sine';
    osc.frequency.setValueAtTime(isSevere ? 220 : 310, now);
    osc.frequency.exponentialRampToValueAtTime(isSevere ? 95 : 180, now + 0.28);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.32);
  }

  // Victory / Coin settlement fanfare
  public playWinSettlement(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + idx * 0.07;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.15, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.26);
    });
  }
}

export const soundEngine = new ChinchiroSoundEngine();
