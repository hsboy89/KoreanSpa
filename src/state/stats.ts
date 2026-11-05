/** 나의 기록. 로그인 없이 브라우저에만 남는다. */
export interface Stats { saunaSec: number; eggs: number; sikhye: number; logs: number }

const KEY = 'ondol.stats.v1';

export function loadStats(): Stats {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { saunaSec: 0, eggs: 0, sikhye: 0, logs: 0, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { saunaSec: 0, eggs: 0, sikhye: 0, logs: 0 };
}

export function saveStats(s: Stats) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
