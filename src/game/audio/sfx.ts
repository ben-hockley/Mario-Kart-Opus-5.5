/** All sound effects are synthesised with the Web Audio API — no asset files. */

export type SfxName =
  | 'beep'
  | 'go'
  | 'menuMove'
  | 'menuOk'
  | 'menuBack'
  | 'join'
  | 'hop'
  | 'spark1'
  | 'spark2'
  | 'boost'
  | 'itemBox'
  | 'tick'
  | 'itemGet'
  | 'throw'
  | 'hit'
  | 'bump'
  | 'wall'
  | 'lap'
  | 'finalLap'
  | 'finish'
  | 'fall'
  | 'trick'
  | 'star'
  | 'break'
  | 'bounce';

interface Engine {
  osc1: OscillatorNode;
  osc2: OscillatorNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  drift: GainNode;
}

export class Sfx {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;
  private engines: Engine[] = [];
  volume = 0.7;

  get unlocked() {
    return this.ctx?.state === 'running';
  }

  /** Call from a user gesture. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp).connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private tone(
    type: OscillatorType,
    f0: number,
    f1: number,
    dur: number,
    vol: number,
    delay = 0,
    attack = 0.005,
  ) {
    const c = this.ctx!;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noiseBurst(dur: number, vol: number, filterType: BiquadFilterType, f0: number, f1: number, delay = 0, q = 1) {
    const c = this.ctx!;
    const t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = filterType;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  play(name: SfxName, vol = 1) {
    if (!this.ctx || this.ctx.state !== 'running' || vol <= 0.01) return;
    const v = (x: number) => x * vol;
    switch (name) {
      case 'beep':
        this.tone('square', 440, 440, 0.25, v(0.12));
        break;
      case 'go':
        this.tone('square', 880, 880, 0.6, v(0.12));
        this.tone('square', 1320, 1320, 0.6, v(0.05));
        break;
      case 'menuMove':
        this.tone('triangle', 700, 760, 0.06, v(0.12));
        break;
      case 'menuOk':
        this.tone('triangle', 660, 660, 0.08, v(0.15));
        this.tone('triangle', 990, 990, 0.12, v(0.15), 0.07);
        break;
      case 'menuBack':
        this.tone('triangle', 520, 360, 0.14, v(0.13));
        break;
      case 'join':
        [523, 659, 784, 1047].forEach((f, i) => this.tone('square', f, f, 0.12, v(0.06), i * 0.06));
        break;
      case 'hop':
        this.tone('sine', 260, 520, 0.09, v(0.1));
        break;
      case 'spark1':
        this.tone('sine', 1400, 1400, 0.12, v(0.07));
        this.tone('sine', 2100, 2100, 0.12, v(0.04), 0.04);
        break;
      case 'spark2':
        this.tone('sine', 1800, 1800, 0.12, v(0.08));
        this.tone('sine', 2700, 2700, 0.15, v(0.05), 0.04);
        break;
      case 'boost':
        this.noiseBurst(0.6, v(0.25), 'lowpass', 400, 4000, 0, 2);
        this.tone('sawtooth', 180, 520, 0.45, v(0.05));
        break;
      case 'itemBox':
        [784, 988, 1175, 1568].forEach((f, i) => this.tone('triangle', f, f, 0.08, v(0.09), i * 0.035));
        break;
      case 'tick':
        this.tone('square', 1200, 1200, 0.025, v(0.035));
        break;
      case 'itemGet':
        this.tone('triangle', 1320, 1320, 0.18, v(0.12));
        this.tone('triangle', 1760, 1760, 0.25, v(0.08), 0.06);
        break;
      case 'throw':
        this.noiseBurst(0.22, v(0.18), 'bandpass', 900, 2600, 0, 3);
        break;
      case 'hit':
        this.noiseBurst(0.35, v(0.3), 'lowpass', 3000, 300);
        this.tone('sine', 160, 50, 0.4, v(0.3));
        this.tone('square', 700, 180, 0.5, v(0.05), 0.05);
        break;
      case 'bump':
        this.tone('sine', 120, 70, 0.12, v(0.25));
        this.noiseBurst(0.08, v(0.08), 'lowpass', 1200, 300);
        break;
      case 'wall':
        this.tone('sine', 90, 50, 0.15, v(0.3));
        this.noiseBurst(0.12, v(0.12), 'lowpass', 1800, 200);
        break;
      case 'lap':
        this.tone('square', 880, 880, 0.1, v(0.08));
        this.tone('square', 1320, 1320, 0.2, v(0.08), 0.1);
        break;
      case 'finalLap':
        [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone('square', f, f, 0.14, v(0.07), i * 0.1));
        break;
      case 'finish':
        [784, 784, 784, 1047, 988, 1047, 1319].forEach((f, i) => this.tone('square', f, f, 0.18, v(0.07), i * 0.13));
        [392, 523, 659].forEach((f) => this.tone('triangle', f, f, 1.2, v(0.05), 0.8));
        break;
      case 'fall':
        this.tone('sine', 1000, 180, 0.7, v(0.12));
        this.noiseBurst(0.5, v(0.15), 'lowpass', 1500, 200, 0.5);
        break;
      case 'trick':
        this.tone('triangle', 500, 1500, 0.22, v(0.12));
        this.tone('sine', 1000, 2400, 0.22, v(0.05), 0.05);
        break;
      case 'star':
        for (let r = 0; r < 3; r++) [1047, 1319, 1568, 2093].forEach((f, i) => this.tone('square', f, f, 0.07, v(0.05), r * 0.3 + i * 0.07));
        break;
      case 'break':
        this.noiseBurst(0.15, v(0.12), 'highpass', 2000, 5000);
        break;
      case 'bounce':
        this.tone('square', 300, 200, 0.06, v(0.06));
        break;
    }
  }

  /** Engine drones for the local players' karts. */
  setEngines(n: number) {
    if (!this.ctx) return;
    while (this.engines.length > n) {
      const e = this.engines.pop()!;
      e.osc1.stop();
      e.osc2.stop();
      e.gain.disconnect();
      e.drift.disconnect();
    }
    while (this.engines.length < n) {
      const c = this.ctx;
      const osc1 = c.createOscillator();
      const osc2 = c.createOscillator();
      osc1.type = 'sawtooth';
      osc2.type = 'square';
      const filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 600;
      const gain = c.createGain();
      gain.gain.value = 0;
      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain).connect(this.master);
      osc1.start();
      osc2.start();
      const src = c.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2400;
      bp.Q.value = 2;
      const drift = c.createGain();
      drift.gain.value = 0;
      src.connect(bp).connect(drift).connect(this.master);
      src.start();
      this.engines.push({ osc1, osc2, filter, gain, drift });
    }
  }

  updateEngine(i: number, speedRatio: number, boosting: boolean, drifting: boolean, active: boolean) {
    const e = this.engines[i];
    if (!e || !this.ctx) return;
    const t = this.ctx.currentTime;
    const f = 48 + Math.max(0, speedRatio) * 120 + (boosting ? 40 : 0);
    e.osc1.frequency.setTargetAtTime(f, t, 0.05);
    e.osc2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
    e.filter.frequency.setTargetAtTime(400 + speedRatio * 1400 + (boosting ? 800 : 0), t, 0.05);
    const n = this.engines.length;
    e.gain.gain.setTargetAtTime(active ? (0.05 + speedRatio * 0.035) / Math.sqrt(n) : 0, t, 0.08);
    e.drift.gain.setTargetAtTime(active && drifting ? 0.035 / Math.sqrt(n) : 0, t, 0.05);
  }

  stopEngines() {
    this.setEngines(0);
  }
}
