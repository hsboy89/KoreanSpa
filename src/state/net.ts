/**
 * 접속자 동기화 전송 계층.
 * - SupabaseNet: Supabase Realtime의 Presence(입장/퇴장, 상태 스냅샷)와 Broadcast(이동, 앉기, 이모트, 말풍선)
 * - BroadcastNet: 서버가 없을 때 같은 기기의 탭끼리 보이는 로컬 폴백(BroadcastChannel)
 * 둘 다 같은 Msg 프로토콜을 쓰므로 게임 코드는 어느 쪽인지 몰라도 된다.
 */
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { CONNECT_TIMEOUT_MS, getSupabase } from './supabase';
import type { Outfit } from '../scene/avatar';
import type { RoomId } from '../scene/rooms';
import { sanitizeState } from './presence';

export type XZ = [number, number];

export interface PeerState {
  name: string;
  outfit: Outfit;
  pos: XZ;
  yaw: number;
  pose: 'idle' | 'walk' | 'sit';
  /** world.seats 인덱스 */
  seat: number | null;
  room: RoomId | null;
}

export type Msg =
  | { t: 'hello'; id: string; state: PeerState }
  | { t: 'state'; id: string; state: PeerState }
  | { t: 'walk'; id: string; from: XZ; path: XZ[] }
  | { t: 'pos'; id: string; pos: XZ; yaw: number }
  | { t: 'sit'; id: string; seat: number }
  | { t: 'stand'; id: string }
  | { t: 'emote'; id: string; kind: 'wave' | 'cheers' }
  | { t: 'say'; id: string; text: string }
  | { t: 'bye'; id: string };

export interface Net {
  readonly kind: 'supabase' | 'local';
  connect(id: string, state: PeerState): Promise<void>;
  /** 다른 사람들에게 보낸다 (나에게는 안 온다) */
  send(msg: Msg): void;
  /** 내 상태 스냅샷을 갱신한다. 늦게 들어온 사람이 이걸 본다 */
  track(state: PeerState): void;
  onMessage(cb: (msg: Msg) => void): void;
  close(): void;
}

/** 점검용 빌드는 VITE_LOUNGE_CHANNEL로 다른 채널을 써서 운영 라운지와 섞이지 않게 한다 */
const CHANNEL = (import.meta.env.VITE_LOUNGE_CHANNEL as string | undefined) || 'parting-lounge';

class BroadcastNet implements Net {
  readonly kind = 'local' as const;
  private ch = new BroadcastChannel(CHANNEL);
  private handlers: ((m: Msg) => void)[] = [];
  private id = '';
  private state!: PeerState;
  private heartbeat = 0;

  async connect(id: string, state: PeerState) {
    this.id = id;
    this.state = state;
    this.ch.onmessage = e => {
      const m = e.data as Msg;
      if (!m || typeof m !== 'object' || m.id === this.id) return;
      // 새로 들어온 탭에게 내 상태를 알려준다
      if (m.t === 'hello') this.post({ t: 'state', id: this.id, state: this.state });
      this.handlers.forEach(h => h(m));
    };
    this.post({ t: 'hello', id, state });
    this.heartbeat = window.setInterval(() => this.post({ t: 'state', id: this.id, state: this.state }), 4000);
    window.addEventListener('pagehide', () => this.close());
  }

  send(m: Msg) { this.post(m); }
  track(s: PeerState) { this.state = s; this.post({ t: 'state', id: this.id, state: s }); }
  onMessage(cb: (m: Msg) => void) { this.handlers.push(cb); }

  close() {
    this.post({ t: 'bye', id: this.id });
    window.clearInterval(this.heartbeat);
    try { this.ch.close(); } catch { /* 이미 닫힘 */ }
  }

  private post(m: Msg) { try { this.ch.postMessage(m); } catch { /* 닫힌 채널 */ } }
}

class SupabaseNet implements Net {
  readonly kind = 'supabase' as const;
  private channel!: RealtimeChannel;
  private handlers: ((m: Msg) => void)[] = [];
  private id = '';
  private known = new Set<string>();
  private pending: Msg[] = [];

  constructor(private client: SupabaseClient) {}

  connect(id: string, state: PeerState) {
    this.id = id;
    return new Promise<void>((resolve, reject) => {
      this.channel = this.client.channel(CHANNEL, { config: { broadcast: { self: false }, presence: { key: id } } });
      this.channel
        .on('broadcast', { event: 'msg' }, ({ payload }) => this.emit(payload as Msg))
        .on('presence', { event: 'sync' }, () => this.syncPresence())
        .subscribe(async (status, err) => {
          if (status === 'SUBSCRIBED') {
            await this.channel.track(state);
            resolve();
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            reject(err ?? new Error(status));
          }
        });
    });
  }

  send(m: Msg) { void this.channel.send({ type: 'broadcast', event: 'msg', payload: m }); }
  track(s: PeerState) { void this.channel.track(s); }
  onMessage(cb: (m: Msg) => void) {
    this.handlers.push(cb);
    const queued = this.pending; this.pending = [];
    queued.forEach(m => cb(m));
  }
  close() { void this.client.removeChannel(this.channel); }

  /**
   * Presence 상태 전체를 훑어 새 사람은 hello, 아는 사람은 state, 사라진 사람은 bye로 올린다.
   * 상태를 갱신(track)하면 같은 사람의 leave와 join이 연달아 오므로 leave 이벤트는 믿지 않고
   * 동기화된 목록에 실제로 없을 때만 나간 것으로 본다.
   */
  private syncPresence() {
    const all = this.channel.presenceState<PeerState & { presence_ref: string }>();
    const present = new Set<string>();
    for (const [key, list] of Object.entries(all)) {
      if (key === this.id || !list.length) continue;
      present.add(key);
      const { presence_ref: _ref, ...state } = list[list.length - 1];
      const fresh = !this.known.has(key);
      this.known.add(key);
      this.emit({ t: fresh ? 'hello' : 'state', id: key, state: state as PeerState });
    }
    for (const key of [...this.known]) {
      if (present.has(key)) continue;
      this.known.delete(key);
      this.emit({ t: 'bye', id: key });
    }
  }

  private emit(m: Msg) {
    if (!m || typeof m !== 'object' || typeof m.id !== 'string' || m.id === this.id) return;
    if ((m.t === 'hello' || m.t === 'state') && !sanitizeState(m.state)) return;
    // 게임이 수신 준비를 마치기 전에 온 메시지는 모아 두었다가 넘긴다
    if (!this.handlers.length) { this.pending.push(m); return; }
    this.handlers.forEach(h => h(m));
  }
}

export interface Connection { net: Net; /** 서버가 설정돼 있는데 연결에 실패했으면 true */ offline: boolean }

export async function connectNet(id: string, state: PeerState): Promise<Connection> {
  const client = getSupabase();
  if (client) {
    const net = new SupabaseNet(client);
    try {
      await Promise.race([
        net.connect(id, state),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('시간 초과')), CONNECT_TIMEOUT_MS)),
      ]);
      return { net, offline: false };
    } catch (err) {
      console.error('실시간 연결 실패. Supabase Realtime 설정을 확인하세요.', err);
      net.close();
    }
  }
  const local = new BroadcastNet();
  await local.connect(id, state);
  return { net: local, offline: !!client };
}
