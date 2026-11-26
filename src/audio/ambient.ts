/**
 * 음원 파일 없이 Web Audio로 만드는 소리.
 * - 공조기 저음 웅웅거림(노이즈 + 로우패스)
 * - 장소별 음악. 광장과 방 여섯 개가 각자 다른 스타일이고, 스텝 시퀀서로 즉석 합성한다
 */
const midiHz = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export type MusicStyle = 'plaza' | 'wine' | 'board' | 'rooftop' | 'run' | 'book' | 'club';

type Lead = 'pluck' | 'marimba' | 'piano' | 'saw';

/**
 * 한 마디는 16스텝. 패턴 문자열에서 '.'은 쉼표.
 * bass: r 근음, f 5도, o 옥타브 위
 */
interface Style {
  bpm: number;
  /** 8분음표 뒷박을 늦추는 정도 (스윙) */
  swing?: number;
  /** 마디마다 하나씩. 첫 음이 베이스 근음, 나머지가 화음 */
  chords: number[][];
  kick?: string;
  snare?: string;
  hat?: string;
  bass?: string;
  bassSaw?: boolean;
  /** 마디 내내 깔리는 화음의 크기 */
  pad?: number;
  /** 짧게 끊어 치는 화음 */
  stab?: string;
  stabSaw?: boolean;
  lead?: { type: Lead; scale: number[]; prob: number; every: number; arp?: boolean };
  /** 드럼 크기 배율 */
  drums?: number;
}

const STYLES: Record<MusicStyle, Style> = {
  // 광장: 느린 패드와 드문드문 뜯는 소리
  plaza: {
    bpm: 17,
    chords: [[38, 50, 57, 62, 66, 69], [35, 47, 54, 62, 66, 69], [31, 43, 55, 59, 62, 66], [33, 45, 52, 57, 62, 64]],
    pad: 0.036,
    lead: { type: 'pluck', scale: [62, 64, 66, 69, 71, 74, 76, 78], prob: 0.28, every: 1 },
  },
  // 와인 · 다이닝: 스윙 재즈. 워킹 베이스, 브러시, 로즈 피아노
  wine: {
    bpm: 84, swing: 0.3,
    chords: [[38, 53, 57, 60, 64], [43, 53, 59, 64], [36, 52, 55, 59, 62], [45, 55, 61, 64]],
    hat: 'x...x.x.x...x.x.', snare: '....x.......x...', drums: 0.45,
    bass: 'r...f...o...f...',
    stab: 'x.........x.....',
    lead: { type: 'piano', scale: [67, 69, 72, 74, 76, 79, 81], prob: 0.16, every: 2 },
  },
  // 보드게임: 통통 튀는 마림바
  board: {
    bpm: 112,
    chords: [[48, 60, 64, 67], [41, 60, 65, 69], [43, 59, 62, 67], [45, 60, 64, 69]],
    kick: 'x.......x.......', hat: '..x...x...x...x.', snare: '....x.......x...', drums: 0.5,
    bass: 'r.....r.f.....f.',
    lead: { type: 'marimba', scale: [72, 74, 76, 79, 81, 84], prob: 0.62, every: 2 },
  },
  // 루프탑 파티: 느긋한 하우스
  rooftop: {
    bpm: 104,
    chords: [[41, 57, 60, 64], [40, 55, 59, 62], [38, 53, 57, 60], [43, 53, 57, 60, 62]],
    kick: 'x...x...x...x...', hat: '..x...x...x...x.', snare: '....x.......x...', drums: 0.7,
    bass: 'r.....r...r.....',
    pad: 0.038,
    lead: { type: 'pluck', scale: [69, 72, 74, 76, 79, 81], prob: 0.16, every: 2 },
  },
  // 러닝 · 액티비티: 빠르게 밀어 주는 비트와 아르페지오
  run: {
    bpm: 132,
    chords: [[45, 57, 60, 64], [41, 57, 60, 65], [36, 55, 60, 64], [43, 55, 59, 62]],
    kick: 'x...x...x...x...', hat: 'x.x.x.x.x.x.x.x.', snare: '....x.......x...', drums: 0.9,
    bass: 'r.r.r.r.r.r.r.r.', bassSaw: true,
    lead: { type: 'saw', scale: [], prob: 1, every: 2, arp: true },
  },
  // 독서 · 토크: 드럼 없이 조용한 피아노
  book: {
    bpm: 60,
    chords: [[41, 57, 60, 64], [40, 55, 60, 64], [38, 53, 57, 60], [46, 57, 62, 65]],
    bass: 'r...............',
    pad: 0.028,
    lead: { type: 'piano', scale: [65, 67, 69, 72, 74, 77, 79], prob: 0.13, every: 2 },
  },
  // 노래 · 클럽: 4비트 킥과 엇박 베이스
  club: {
    bpm: 126,
    chords: [[41, 56, 60, 65], [37, 56, 61, 65], [44, 56, 60, 63], [39, 55, 58, 63]],
    kick: 'x...x...x...x...', hat: '..x...x...x...x.', snare: '....x.......x...', drums: 1,
    bass: '..r...r...r...r.', bassSaw: true,
    stab: 'x..x..x...x..x..', stabSaw: true,
    lead: { type: 'saw', scale: [77, 80, 82, 84, 87], prob: 0.2, every: 2 },
  },
};

const MUSIC_LEVEL = 0.6;
const LOOKAHEAD_SEC = 0.25;
const hit = (pattern: string | undefined, step: number) => !!pattern && pattern[step] !== '.';

export class Ambient {
  enabled = false;
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;

  private music!: GainNode;
  private musicDry!: GainNode;
  private style: MusicStyle = 'plaza';
  /** 지금 스타일의 소리가 지나는 길. 스타일이 바뀌면 통째로 줄였다가 버린다 */
  private tone: GainNode | null = null;
  private drum: GainNode | null = null;
  private nextStep = 0;
  private step = 0;
  private lastLead = 2;

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

  /** 장소에 맞는 음악으로 바꾼다. 이전 음악은 짧게 사라지고 새 음악이 첫 마디부터 시작한다 */
  setStyle(style: MusicStyle) {
    if (style === this.style) return;
    this.style = style;
    if (this.ctx) this.openBuses();
  }

  update() {
    if (!this.ctx || !this.enabled) return;
    this.scheduleMusic(this.ctx.currentTime);
  }

  private start() {
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    // 여러 소리가 겹쳐도 찢어지지 않게 한다
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

    // 음악 버스. 되먹임 딜레이로 넓은 공간의 울림을 흉내 낸다
    this.music = ctx.createGain();
    this.music.gain.value = MUSIC_LEVEL;
    this.music.connect(this.master);
    this.musicDry = ctx.createGain();
    this.musicDry.connect(this.music);
    const delay = ctx.createDelay(1); delay.delayTime.value = 0.46;
    const feedback = ctx.createGain(); feedback.gain.value = 0.42;
    const dampen = ctx.createBiquadFilter(); dampen.type = 'lowpass'; dampen.frequency.value = 1600;
    this.musicDry.connect(delay).connect(dampen).connect(feedback).connect(delay);
    dampen.connect(this.music);
    this.openBuses();
  }

  private openBuses() {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    for (const old of [this.tone, this.drum]) {
      if (!old) continue;
      old.gain.cancelScheduledValues(t);
      old.gain.setTargetAtTime(0, t, 0.25);
      // 소리가 다 줄어든 뒤에 떼어 낸다
      window.setTimeout(() => old.disconnect(), 3000);
    }
    this.tone = ctx.createGain();
    this.drum = ctx.createGain();
    for (const g of [this.tone, this.drum]) {
      g.gain.value = 0;
      g.gain.setTargetAtTime(1, t + 0.3, 0.3);
    }
    // 드럼과 베이스는 울림 없이 바로, 나머지는 딜레이를 거친다
    this.tone.connect(this.musicDry);
    this.drum.connect(this.music);
    this.step = 0;
    this.nextStep = t + 0.35;
    this.lastLead = 2;
  }

  private scheduleMusic(now: number) {
    const st = STYLES[this.style];
    const stepSec = 60 / st.bpm / 4;
    // 탭이 가려졌다 돌아오면 밀린 음을 몰아 내지 않고 지금부터 잇는다
    if (this.nextStep < now - 0.05) this.nextStep = now + 0.05;

    while (this.nextStep < now + LOOKAHEAD_SEC) {
      const i = this.step % 16;
      const chord = st.chords[Math.floor(this.step / 16) % st.chords.length];
      const t = this.nextStep + (st.swing && i % 4 === 2 ? st.swing * stepSec * 2 : 0);
      const drums = st.drums ?? 1;

      if (hit(st.kick, i)) this.kick(t, 0.5 * drums);
      if (hit(st.snare, i)) this.noiseHit(t, 1800, 'bandpass', 0.13, 0.22 * drums);
      if (hit(st.hat, i)) this.noiseHit(t, 7000, 'highpass', st.swing ? 0.09 : 0.04, 0.09 * drums);

      if (st.bass && st.bass[i] !== '.') {
        const up = st.bass[i] === 'f' ? 7 : st.bass[i] === 'o' ? 12 : 0;
        this.bassNote(midiHz(chord[0] + up), t, Math.min(1.6, stepSec * 3.2), !!st.bassSaw);
      }
      if (st.pad && i === 0) for (const n of chord.slice(1)) this.padNote(midiHz(n), t, stepSec * 16, st.pad);
      if (hit(st.stab, i)) for (const n of chord.slice(1)) this.stabNote(midiHz(n), t, !!st.stabSaw);

      const lead = st.lead;
      if (lead && i % lead.every === 0) {
        if (lead.arp) {
          // 화음을 아래에서 위로 오르내린다
          const tones = [...chord.slice(1), chord[1] + 12];
          const k = (this.step / lead.every) % (tones.length * 2 - 2);
          this.leadNote(midiHz(tones[k < tones.length ? k : tones.length * 2 - 2 - k] + 12), t, lead.type, stepSec);
        } else if (Math.random() < lead.prob) {
          // 이웃한 음으로 움직여 선율처럼 들리게 한다
          const move = Math.floor(Math.random() * 5) - 2;
          this.lastLead = Math.max(0, Math.min(lead.scale.length - 1, this.lastLead + move));
          this.leadNote(midiHz(lead.scale[this.lastLead]), t, lead.type, stepSec);
        }
      }

      this.step += 1;
      this.nextStep += stepSec;
    }
  }

  private kick(t: number, level: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const env = ctx.createGain();
    env.gain.setValueAtTime(level, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    osc.connect(env).connect(this.drum!);
    osc.start(t); osc.stop(t + 0.3);
  }

  private noiseHit(t: number, hz: number, type: BiquadFilterType, dur: number, level: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = hz; f.Q.value = 0.8;
    const env = ctx.createGain();
    env.gain.setValueAtTime(level, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(env).connect(this.drum!);
    src.start(t, Math.random() * 1.5, dur + 0.02);
  }

  private bassNote(hz: number, t: number, dur: number, saw: boolean) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = saw ? 'sawtooth' : 'triangle';
    osc.frequency.value = hz;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = saw ? 420 : 900;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(saw ? 0.16 : 0.22, t + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    // 베이스는 울림을 타면 뭉개지므로 드럼과 같은 길로 보낸다
    osc.connect(lp).connect(env).connect(this.drum!);
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  private padNote(hz: number, t: number, barSec: number, level: number) {
    const ctx = this.ctx!;
    const attack = Math.min(4, barSec * 0.3), release = Math.min(5, barSec * 0.5);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(level, t + attack);
    env.gain.setValueAtTime(level, t + barSec);
    env.gain.linearRampToValueAtTime(0, t + barSec + release);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 750;
    lp.connect(env).connect(this.tone!);
    // 살짝 어긋난 두 음으로 부드럽게 맥놀이를 만든다
    for (const detune of [-5, 5]) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = hz;
      osc.detune.value = detune;
      osc.connect(lp);
      osc.start(t);
      osc.stop(t + barSec + release + 0.1);
    }
  }

  private stabNote(hz: number, t: number, saw: boolean) {
    const ctx = this.ctx!;
    const dur = saw ? 0.22 : 1.3;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(saw ? 0.075 : 0.1, t + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = saw ? 2200 : 1400;
    lp.connect(env).connect(this.tone!);
    for (const detune of saw ? [-8, 8] : [0]) {
      const osc = ctx.createOscillator();
      osc.type = saw ? 'sawtooth' : 'sine';
      osc.frequency.value = hz;
      osc.detune.value = detune;
      osc.connect(lp);
      osc.start(t); osc.stop(t + dur + 0.05);
    }
  }

  private leadNote(hz: number, t: number, type: Lead, stepSec: number) {
    const ctx = this.ctx!;
    const dur = type === 'pluck' ? 2.4 : type === 'piano' ? 1.8 : type === 'marimba' ? 0.4 : stepSec * 1.8;
    const peak = type === 'saw' ? 0.085 : type === 'marimba' ? 0.2 : 0.09 + Math.random() * 0.04;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = type === 'saw' ? 2600 : 6000;
    env.connect(lp).connect(this.tone!);
    // 기음에 배음을 조금 섞어 악기 색을 낸다
    const partials: [number, number][] = type === 'marimba' ? [[1, 1], [4, 0.25]] : type === 'saw' ? [[1, 1]] : [[1, 1], [2, 0.22]];
    for (const [mult, level] of partials) {
      const osc = ctx.createOscillator();
      osc.type = type === 'saw' ? 'sawtooth' : type === 'piano' ? 'triangle' : 'sine';
      osc.frequency.value = hz * mult;
      const g = ctx.createGain(); g.gain.value = level;
      osc.connect(g).connect(env);
      osc.start(t); osc.stop(t + dur + 0.05);
    }
  }
}
