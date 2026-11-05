/**
 * 불가마의 "꺼지지 않는 불" 전역 상태.
 * 지금은 LocalFireStore(브라우저 로컬)만 있고, 나중에 Supabase 테이블 + Realtime을
 * 같은 FireStore 인터페이스로 구현해 갈아끼운다.
 */
export interface FireState {
  /** 0..1 장작 잔량 */
  fuel: number;
  /** 불이 켜진 시각(ms). null이면 꺼진 상태 */
  litAt: number | null;
  /** 꺼진 시각(ms) */
  outAt: number | null;
  /** 지금까지 넣은 장작 수 */
  logs: number;
}

export interface FireStore {
  /** fuel 1 → 0까지 걸리는 시간(ms) */
  readonly burnMs: number;
  get(): FireState;
  subscribe(cb: (s: FireState) => void): () => void;
  addLog(): FireState;
  relight(): FireState;
}

const KEY = 'ondol.fire.local.v1';
const LOG_FUEL = 0.25;
const RELIGHT_FUEL = 0.3;

interface Saved extends FireState { savedAt: number }

export class LocalFireStore implements FireStore {
  readonly burnMs: number;
  private state: FireState;
  private subs = new Set<(s: FireState) => void>();
  private last = Date.now();

  constructor(burnMs = 30 * 60 * 1000) {
    this.burnMs = burnMs;
    this.state = this.load();
    setInterval(() => this.tick(), 1000);
  }

  get() { return { ...this.state }; }

  subscribe(cb: (s: FireState) => void) {
    this.subs.add(cb);
    cb(this.get());
    return () => { this.subs.delete(cb); };
  }

  addLog() {
    const s = this.state;
    if (s.litAt === null) return this.relight();
    s.fuel = Math.min(1, s.fuel + LOG_FUEL);
    s.logs += 1;
    this.save(); this.emit();
    return this.get();
  }

  relight() {
    const s = this.state;
    s.litAt = Date.now();
    s.outAt = null;
    s.fuel = RELIGHT_FUEL;
    s.logs += 1;
    this.save(); this.emit();
    return this.get();
  }

  private tick() {
    const now = Date.now();
    const dt = now - this.last;
    this.last = now;
    this.burn(this.state, dt, now);
    this.save(); this.emit();
  }

  private burn(s: FireState, dt: number, now: number) {
    if (s.litAt === null) return;
    s.fuel = Math.max(0, s.fuel - dt / this.burnMs);
    if (s.fuel <= 0) { s.fuel = 0; s.litAt = null; s.outAt = now; }
  }

  private load(): FireState {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Saved;
        const s: FireState = { fuel: saved.fuel, litAt: saved.litAt, outAt: saved.outAt, logs: saved.logs };
        this.burn(s, Date.now() - saved.savedAt, Date.now());
        return s;
      }
    } catch { /* 저장소를 못 쓰는 환경 */ }
    return { fuel: 0.7, litAt: Date.now(), outAt: null, logs: 0 };
  }

  private save() {
    try { localStorage.setItem(KEY, JSON.stringify({ ...this.state, savedAt: Date.now() })); } catch { /* ignore */ }
  }

  private emit() { const s = this.get(); this.subs.forEach(cb => cb(s)); }
}

/** "3일 4시간째" 식의 지속 시간 문구 */
export function formatSince(litAt: number, now = Date.now()): string {
  const sec = Math.max(0, Math.floor((now - litAt) / 1000));
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}일 ${h}시간째`;
  if (h > 0) return `${h}시간 ${m}분째`;
  if (m > 0) return `${m}분째`;
  return '방금 지핀';
}
