/**
 * 함께 있는 사람(접속자) 모델.
 * 지금은 목업 봇 몇 명을 돌리고, 나중에 Supabase Realtime Presence로 교체한다.
 */
import type { RoomId } from '../scene/rooms';
import { randomOutfit, type Outfit } from '../scene/avatar';

export type PeerKind = 'seat' | 'wander' | 'stand';

export interface Peer {
  id: string;
  name: string;
  outfit: Outfit;
  kind: PeerKind;
  /** 어느 방에 있는지. undefined면 광장 */
  room?: RoomId;
}

const ADJ = ['느긋한', '수줍은', '신나는', '다정한', '호기심 많은', '말없는', '유쾌한', '차분한', '반가운'];
const NOUN = ['참가자', '호스트', '뉴비', '단골', '방문자', '친구', '이웃'];

export function randomName(seed = Math.random()): string {
  const a = ADJ[Math.floor(seed * ADJ.length) % ADJ.length];
  const n = NOUN[Math.floor((seed * 7919) % NOUN.length)];
  return `${a} ${n} ${1 + Math.floor((seed * 104729) % 99)}`;
}

export function mockPeers(): Peer[] {
  const mk = (i: number, kind: PeerKind, room?: RoomId): Peer => {
    const seed = (i + 1) / 13.7;
    return { id: `bot-${i}`, name: randomName(seed), outfit: randomOutfit(seed), kind, room };
  };
  return [
    mk(0, 'seat', 'wine'), mk(1, 'seat', 'wine'),
    mk(2, 'seat', 'board'), mk(3, 'seat', 'board'), mk(4, 'seat', 'board'),
    mk(5, 'seat', 'rooftop'),
    mk(6, 'stand', 'run'), mk(7, 'seat', 'run'),
    mk(8, 'seat', 'book'),
    mk(9, 'seat', 'club'), mk(10, 'stand', 'club'),
    mk(11, 'wander'), mk(12, 'wander'), mk(13, 'seat'),
  ];
}
