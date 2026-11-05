import type { SupabaseClient } from '@supabase/supabase-js';
import { deriveFire, LocalFireStore, LogCooldownError, type FireRow, type FireState, type FireStore } from './fire';
import { CONNECT_TIMEOUT_MS, getSupabase } from './supabase';

const RESYNC_MS = 60_000;

type Snapshot = FireRow & { server_now: string };

/**
 * 서버의 전역 불 상태. 잔량은 서버 행을 기준으로 매초 보간하고,
 * 장작 넣기는 RPC로 서버가 계산한다.
 */
class SupabaseFireStore implements FireStore {
  private subs = new Set<(s: FireState) => void>();
  private row: FireRow;
  private clockOffset = 0;

  constructor(private client: SupabaseClient, first: Snapshot) {
    this.row = first;
    this.syncClock(first);

    client.channel('fire')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'fire' }, payload => {
        this.apply(payload.new as FireRow);
      })
      // 구독이 열리기 전(또는 끊긴 동안) 놓친 변경을 메운다
      .subscribe(status => { if (status === 'SUBSCRIBED') void this.resync(); });

    document.addEventListener('visibilitychange', () => { if (!document.hidden) void this.resync(); });
    setInterval(() => void this.resync(), RESYNC_MS);
    setInterval(() => this.emit(), 1000);
  }

  get burnMs() { return this.row.burn_seconds * 1000; }

  get() { return deriveFire(this.row, Date.now() + this.clockOffset); }

  subscribe(cb: (s: FireState) => void) {
    this.subs.add(cb);
    cb(this.get());
    return () => { this.subs.delete(cb); };
  }

  async addLog() {
    const { data, error } = await this.client.rpc('add_log');
    if (error?.message === 'log_cooldown') throw new LogCooldownError();
    if (error) throw error;
    this.receive(data as Snapshot);
    return this.get();
  }

  private async resync() {
    const { data, error } = await this.client.rpc('get_fire');
    if (error) { console.warn('불 상태 동기화 실패', error); return; }
    this.receive(data as Snapshot);
  }

  private receive(snapshot: Snapshot) {
    this.syncClock(snapshot);
    this.apply(snapshot);
  }

  private syncClock(snapshot: Snapshot) {
    this.clockOffset = Date.parse(snapshot.server_now) - Date.now();
  }

  /** 응답 순서가 뒤바뀌어도 오래된 행으로 되돌아가지 않게 한다 */
  private apply(row: FireRow) {
    if (Date.parse(row.updated_at) < Date.parse(this.row.updated_at)) return;
    this.row = row;
    this.emit();
  }

  private emit() { const s = this.get(); this.subs.forEach(cb => cb(s)); }
}

export interface FireConnection {
  store: FireStore;
  /** true면 서버에 붙지 못해 불이 이 브라우저에만 존재한다 */
  offline: boolean;
}

/** 환경변수가 없는 로컬 개발에서는 조용히 로컬 불을 쓴다. 배포본에서는 offline으로 알린다. */
export async function connectFire(): Promise<FireConnection> {
  const client = getSupabase();

  if (!client) {
    if (import.meta.env.PROD) console.error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY가 빌드에 없습니다.');
    return { store: new LocalFireStore(), offline: import.meta.env.PROD };
  }

  try {
    const { data, error } = await client.rpc('get_fire').abortSignal(AbortSignal.timeout(CONNECT_TIMEOUT_MS));
    if (error) throw error;
    if (!data) throw new Error('fire 행이 없습니다. 마이그레이션을 확인하세요.');
    return { store: new SupabaseFireStore(client, data as Snapshot), offline: false };
  } catch (err) {
    console.error('Supabase 연결 실패', err);
    return { store: new LocalFireStore(), offline: true };
  }
}
