/**
 * 음원 파일 없이 Web Audio로 만드는 환경음.
 * - 공조기 저음 웅웅거림(노이즈 + 로우패스)
 * - 불가마 장작 타닥거림(짧은 노이즈 버스트 + 밴드패스). 거리와 장작 잔량으로 세기 조절
 */
export class Ambient {
  enabled = false;
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private crackle!: GainNode;
  private noise!: AudioBuffer;
  private level = 0;
  private nextPop = 0;

  async toggle(): Promise<boolean> {
    if (!this.ctx) this.start();
    const ctx = this.ctx!;
    if (ctx.state === 'suspended') await ctx.resume();
    this.enabled = !this.enabled;
    const t = ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(this.enabled ? 1 : 0, t, 0.25);
    return this.enabled;
  }

  /** 0..1 타닥거림 세기 */
  setCrackle(level: number) { this.level = Math.max(0, Math.min(1, level)); }

  update(dt: number) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const gain = 0.05 + this.level * 0.55;
    this.crackle.gain.setTargetAtTime(gain, ctx.currentTime, 0.4);
    this.nextPop -= dt;
    if (this.nextPop <= 0) {
      this.pop();
      const base = 0.05 + (1 - this.level) * 0.35;
      this.nextPop = base + Math.random() * base * 2;
    }
  }

  private start() {
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // 공조기 웅웅거림
    const hum = ctx.createBufferSource();
    hum.buffer = this.noise; hum.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160; lp.Q.value = 0.5;
    const humGain = ctx.createGain(); humGain.gain.value = 0.35;
    hum.connect(lp).connect(humGain).connect(this.master);
    hum.start();

    // 타닥거림 버스
    this.crackle = ctx.createGain();
    this.crackle.gain.value = 0.05;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 500;
    this.crackle.connect(hp).connect(this.master);
  }

  private pop() {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const dur = 0.02 + Math.random() * 0.07;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900 + Math.random() * 2800;
    bp.Q.value = 1.4;
    const env = ctx.createGain();
    const t = ctx.currentTime;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.4 + Math.random() * 0.6, t + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(env).connect(this.crackle);
    src.start(t, Math.random() * 1.5, dur + 0.01);
  }
}
