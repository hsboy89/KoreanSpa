import type { SupabaseClient } from '@supabase/supabase-js';
import { addStats, EMPTY_STATS, LocalStatsStore, type Stats, type StatsStore } from './stats';
import { CONNECT_TIMEOUT_MS, getSupabase } from './supabase';

class SupabaseStatsStore implements StatsStore {
  /** 아직 서버에 반영되지 못한 증가분. 실패하면 남겨 두었다가 다음 기록 때 함께 보낸다. */
  private pending: Stats = { ...EMPTY_STATS };
  private flushing = false;

  constructor(private client: SupabaseClient, readonly initial: Stats) {}

  add(delta: Partial<Stats>) {
    // 장작 수는 서버의 add_log가 직접 센다
    this.pending = addStats(this.pending, { ...delta, logs: 0 });
    void this.flush();
  }

  private async flush() {
    if (this.flushing) return;
    this.flushing = true;
    try {
      while (Object.values(this.pending).some(v => v > 0)) {
        const sending = this.pending;
        this.pending = { ...EMPTY_STATS };
        const { error } = await this.client.rpc('add_stats', {
          p_sauna_sec: sending.saunaSec,
          p_eggs: sending.eggs,
          p_sikhye: sending.sikhye,
        });
        if (error) {
          this.pending = addStats(this.pending, sending);
          console.warn('기록 저장 실패', error);
          return;
        }
      }
    } finally {
      this.flushing = false;
    }
  }
}

async function open(client: SupabaseClient): Promise<StatsStore> {
  // getSession과 달리 서버에서 토큰을 검증하므로 삭제되거나 만료된 사용자도 걸러진다
  const { data: { user } } = await client.auth.getUser();
  if (!user) {
    const { error } = await client.auth.signInAnonymously();
    if (error) throw error;
  }
  const { data, error } = await client
    .from('player_stats')
    .select('sauna_sec, eggs, sikhye, logs')
    .maybeSingle();
  if (error) throw error;
  return new SupabaseStatsStore(client, data
    ? { saunaSec: data.sauna_sec, eggs: data.eggs, sikhye: data.sikhye, logs: data.logs }
    : { ...EMPTY_STATS });
}

/** 익명 로그인 후 내 기록을 불러온다. 실패해도 게임은 열리고 기록은 브라우저에 남는다. */
export async function connectStats(): Promise<StatsStore> {
  const client = getSupabase();
  if (!client) return new LocalStatsStore();
  try {
    return await Promise.race([
      open(client),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('시간 초과')), CONNECT_TIMEOUT_MS)),
    ]);
  } catch (err) {
    console.error('서버 기록 연결 실패. Anonymous sign-ins 설정을 확인하세요.', err);
    return new LocalStatsStore();
  }
}
