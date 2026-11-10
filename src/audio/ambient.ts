/**
 * 음원 파일 없이 Web Audio로 만드는 환경음.
 * - 공조기 저음 웅웅거림(노이즈 + 로우패스)
 * - 불가마 장작 타닥거림(짧은 노이즈 버스트 + 밴드패스). 거리와 장작 잔량으로 세기 조절
 * - 불가마 밖의 잔잔한 음악(느린 패드 화음 + 5음계 뜯는 소리). 매번 다르게 즉석 합성한다
 */
const midiHz = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

const CHORD_SEC = 14;
/** D장조 계열의 느린 진행 (MIDI 음높이) */
const CHORDS = [
  [50, 57, 62, 66, 69], // D
  [47, 54, 62, 66, 69], // Bm7
  [43, 55, 59, 62, 66], // Gmaj7
  [45, 52, 57, 62, 64], // Asus4
];
/** D 5음계 */
const PLUCK_NOTES = [62, 64, 66, 69, 71, 74, 76, 78];

const MUSIC_LEVEL = 0.6;
const LOOKAHEAD_SEC = 1;

export class Ambient {
  enabled = false;
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private crackle!: GainNode;
  private noise!: AudioBuffer;
  private level = 0;
  private nextPop = 0;

  private music!: GainNode;
  private musicDry!: GainNode;
  private musicOn = true;
  private nextChord = 0;
  private chordIndex = 0;
  private nextPluck = 0;
  private lastPluck = 2;

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

  /** 음악을 천천히 올리거나 내린다 */
  setMusic(on: boolean) {
    if (on === this.musicOn) return;
    this.musicOn = on;
    if (this.ctx) this.music.gain.setTargetAtTime(on ? MUSIC_LEVEL : 0, this.ctx.currentTime, on ? 2 : 0.8);
  }

  update(dt: number) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const gain = 0.03 + this.level * 1.6;
    this.crackle.gain.setTargetAtTime(gain, ctx.currentTime, 0.4);
    this.nextPop -= dt;
    if (this.level > 0 && this.nextPop <= 0) {
      this.pop();
      const base = 0.05 + (1 - this.level) * 0.35;
      this.nextPop = base + Math.random() * base * 2;
    }
    if (this.musicOn) this.scheduleMusic(ctx.currentTime);
  }

  private start() {
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    // 장작과 음악이 겹쳐도 소리가 찢어지지 않게 한다
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.2;
    this.master.connect(limiter).connect(ctx.destination);

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
    this.crackle.gain.value = 0.03;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 250;
    this.crackle.connect(hp).connect(this.master);

    // 음악 버스. 되먹임 딜레이로 넓은 공간의 울림을 흉내 낸다
    this.music = ctx.createGain();
    this.music.gain.value = 0;
    this.music.gain.setTargetAtTime(this.musicOn ? MUSIC_LEVEL : 0, ctx.currentTime, 2);
    this.music.connect(this.master);
    this.musicDry = ctx.createGain();
    this.musicDry.connect(this.music);
    const delay = ctx.createDelay(1); delay.delayTime.value = 0.46;
    const feedback = ctx.createGain(); feedback.gain.value = 0.42;
    const dampen = ctx.createBiquadFilter(); dampen.type = 'lowpass'; dampen.frequency.value = 1600;
    this.musicDry.connect(delay).connect(dampen).connect(feedback).connect(delay);
    dampen.connect(this.music);
  }

  private pop() {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    // 가끔 낮고 굵게 터지는 소리를 섞어 장작 느낌을 낸다
    const snap = Math.random() < 0.14;
    const dur = snap ? 0.09 + Math.random() * 0.08 : 0.02 + Math.random() * 0.07;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = snap ? 320 + Math.random() * 500 : 900 + Math.random() * 2800;
    bp.Q.value = snap ? 0.9 : 1.4;
    const env = ctx.createGain();
    const t = ctx.currentTime;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(snap ? 1.6 : 0.5 + Math.random() * 0.7, t + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(env).connect(this.crackle);
    src.start(t, Math.random() * 1.5, dur + 0.01);
  }

  private scheduleMusic(now: number) {
    // 탭이 가려졌다 돌아오거나 음악이 다시 켜지면 밀린 음을 몰아 내지 않고 지금부터 잇는다
    if (this.nextChord < now) this.nextChord = now;
    if (this.nextPluck < now) this.nextPluck = now + 1 + Math.random() * 2;

    while (this.nextChord < now + LOOKAHEAD_SEC) {
      for (const n of CHORDS[this.chordIndex]) this.padNote(midiHz(n), this.nextChord);
      this.chordIndex = (this.chordIndex + 1) % CHORDS.length;
      this.nextChord += CHORD_SEC;
    }
    while (this.nextPluck < now + LOOKAHEAD_SEC) {
      this.pluckNote(this.nextPluck);
      // 음 사이를 넉넉히 비운다. 가끔은 두 음을 이어서 낸다
      this.nextPluck += Math.random() < 0.25 ? 0.6 + Math.random() * 0.4 : 2.2 + Math.random() * 4;
    }
  }

  private padNote(hz: number, t: number) {
    const ctx = this.ctx!;
    const attack = 4, hold = CHORD_SEC - 3, release = 5;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.045, t + attack);
    env.gain.setValueAtTime(0.045, t + hold);
    env.gain.linearRampToValueAtTime(0, t + hold + release);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 750;
    lp.connect(env).connect(this.musicDry);
    // 살짝 어긋난 두 음으로 부드럽게 맥놀이를 만든다
    for (const detune of [-5, 5]) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = hz;
      osc.detune.value = detune;
      osc.connect(lp);
      osc.start(t);
      osc.stop(t + hold + release + 0.1);
    }
  }

  private pluckNote(t: number) {
    const ctx = this.ctx!;
    // 이웃한 음으로 움직여 선율처럼 들리게 한다
    const step = Math.floor(Math.random() * 5) - 2;
    this.lastPluck = Math.max(0, Math.min(PLUCK_NOTES.length - 1, this.lastPluck + step));
    const hz = midiHz(PLUCK_NOTES[this.lastPluck]);
    const peak = 0.09 + Math.random() * 0.05;
    const dur = 2.4;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    env.connect(this.musicDry);
    for (const [mult, level] of [[1, 1], [2, 0.22]]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = hz * mult;
      const g = ctx.createGain(); g.gain.value = level;
      osc.connect(g).connect(env);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    }
  }
}
