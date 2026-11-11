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
  /** 들어와 있는 라운지 번호. 서버에 붙지 못했으면 0 */
  readonly lounge: number;
  /** 라운지별 현재 인원. 확인하지 못한 곳은 -1 */
  loungeCounts(): Promise<number[]>;
}

/** 점검용 빌드는 VITE_LOUNGE_CHANNEL로 다른 채널을 써서 운영 라운지와 섞이지 않게 한다 */
const CHANNEL = (import.meta.env.VITE_LOUNGE_CHANNEL as string | undefined) || 'parting-lounge';

/** 라운지 하나의 정원과 라운지 수. 합계가 Supabase 요금제의 동시 접속 한도를 넘지 않게 맞춘다 (무료 200) */
export const LOUNGE_CAPACITY = Number(import.meta.env.VITE_LOUNGE_CAPACITY) || 50;
export const LOUNGE_COUNT = 4;
const PROBE_MS = 1200;

class BroadcastNet implements Net {
  readonly kind = 'local' as const;
  readonly lounge = 0;
  async loungeCounts(): Promise<number[]> { return []; }
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

  /** 들어간 라운지 번호(1부터). 모든 라운지가 찼으면 0 */
  lounge = 0;

  /** 선호 라운지부터 차례로 들여다보고 정원이 남은 첫 라운지에 들어간다 */
  async connect(id: string, state: PeerState, preferred = 1) {
    this.id = id;
    const order = [preferred, ...Array.from({ length: LOUNGE_COUNT }, (_, i) => i + 1).filter(n => n !== preferred)];
    for (const n of order) {
      if (await this.join(n, state)) { this.lounge = n; return; }
    }
  }

  private join(n: number, state: PeerState) {
    return new Promise<boolean>((resolve, reject) => {
      let decided = false;
      const channel = this.client.channel(`${CHANNEL}-${n}`, { config: { broadcast: { self: false }, presence: { key: this.id } } });
      this.channel = channel;
      // 접속 직후의 첫 동기화는 비어 있을 수 있다. 정원이 찬 게 보이면 바로 물러나고,
      // 그렇지 않으면 잠깐 기다린 뒤의 인원으로 들어갈지 정한다
      const decide = async (final: boolean) => {
        if (decided) return;
        const others = Object.keys(channel.presenceState()).filter(k => k !== this.id).length;
        if (!final && others < LOUNGE_CAPACITY) return;
        decided = true;
        if (others >= LOUNGE_CAPACITY) {
          this.known.clear(); this.pending = [];
          await this.client.removeChannel(channel);
          resolve(false);
          return;
        }
        await channel.track(state);
        resolve(true);
      };
      channel
        .on('broadcast', { event: 'msg' }, ({ payload }) => this.emit(payload as Msg))
        .on('presence', { event: 'sync' }, () => { this.syncPresence(); void decide(false); })
        .subscribe((status, err) => {
          if (status === 'SUBSCRIBED') setTimeout(() => void decide(true), PROBE_MS);
          else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(err ?? new Error(status));
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
  close() { if (this.channel) void this.client.removeChannel(this.channel); }

  async loungeCounts() {
    const own = Object.keys(this.channel.presenceState()).length;
    return Promise.all(Array.from({ length: LOUNGE_COUNT }, (_, i) => i + 1).map(n => (n === this.lounge ? own : this.peek(n))));
  }

  /** 들어가지 않고 다른 라운지의 인원만 잠깐 들여다본다 */
  private peek(n: number) {
    return new Promise<number>(resolve => {
      const ch = this.client.channel(`${CHANNEL}-${n}`);
      let done = false;
      const finish = async () => {
        if (done) return;
        done = true;
        const count = Object.keys(ch.presenceState()).length;
        await this.client.removeChannel(ch);
        resolve(count);
      };
      ch.on('presence', { event: 'sync' }, () => { if (Object.keys(ch.presenceState()).length) void finish(); })
        .subscribe(status => {
          if (status === 'SUBSCRIBED') setTimeout(() => void finish(), PROBE_MS);
          else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { done = true; resolve(-1); }
        });
    });
  }

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

export interface Connection {
  net: Net;
  /** 서버가 설정돼 있는데 연결에 실패했으면 true */
  offline: boolean;
  /** 모든 라운지가 정원이라 들어가지 못했으면 true */
  full: boolean;
  /** 들어간 라운지 번호. 서버에 붙지 못했으면 0 */
  lounge: number;
}

/** 주소의 ?l=2 로 들어갈 라운지를 고를 수 있다. 친구와 같은 라운지에서 만날 때 쓴다 */
function preferredLounge(): number {
  const n = Number(new URLSearchParams(location.search).get('l'));
  return Number.isInteger(n) && n >= 1 && n <= LOUNGE_COUNT ? n : 1;
}

export async function connectNet(id: string, state: PeerState): Promise<Connection> {
  const client = getSupabase();
  let offline = false, full = false;
  if (client) {
    const net = new SupabaseNet(client);
    try {
      await Promise.race([
        net.connect(id, state, preferredLounge()),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('시간 초과')), CONNECT_TIMEOUT_MS + LOUNGE_COUNT * PROBE_MS)),
      ]);
      if (net.lounge) return { net, offline: false, full: false, lounge: net.lounge };
      full = true;
    } catch (err) {
      console.error('실시간 연결 실패. Supabase Realtime 설정을 확인하세요.', err);
      net.close();
      offline = true;
    }
  }
  const local = new BroadcastNet();
  await local.connect(id, state);
  return { net: local, offline, full, lounge: 0 };
}
