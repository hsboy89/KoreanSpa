/** 나의 기록. 배포본은 서버(supabaseStats.ts), 환경변수 없는 로컬 개발은 브라우저에 남는다. */
export interface Stats { saunaSec: number; eggs: number; sikhye: number; logs: number }

export const EMPTY_STATS: Stats = { saunaSec: 0, eggs: 0, sikhye: 0, logs: 0 };

export function addStats(a: Stats, delta: Partial<Stats>): Stats {
  return {
    saunaSec: a.saunaSec + (delta.saunaSec ?? 0),
    eggs: a.eggs + (delta.eggs ?? 0),
    sikhye: a.sikhye + (delta.sikhye ?? 0),
    logs: a.logs + (delta.logs ?? 0),
  };
}

export interface StatsStore {
  /** 접속 시점의 기록 */
  readonly initial: Stats;
  add(delta: Partial<Stats>): void;
}

const KEY = 'ondol.stats.v1';

export class LocalStatsStore implements StatsStore {
  readonly initial: Stats;
  private current: Stats;

  constructor() {
    this.initial = this.current = this.load();
  }

  add(delta: Partial<Stats>) {
    this.current = addStats(this.current, delta);
    try { localStorage.setItem(KEY, JSON.stringify(this.current)); } catch { /* ignore */ }
  }

  private load(): Stats {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return { ...EMPTY_STATS, ...JSON.parse(raw) };
    } catch { /* ignore */ }
    return { ...EMPTY_STATS };
  }
}
