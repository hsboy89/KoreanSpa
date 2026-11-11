/**
 * 접속자 모델. 다른 사람이 보낸 값은 전부 여기서 검증하고 나서 쓴다.
 * 서버가 없는 로컬 개발에서는 목업 봇도 같이 돌린다.
 */
import { ROOM_THEMES, type RoomId } from '../scene/rooms';
import { BOTTOMS, HAIRS, randomOutfit, SKINS, TOPS, type Hat, type Outfit } from '../scene/avatar';
import type { PeerState } from './net';

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

/** 말풍선으로 보낼 수 있는 정해진 문구. 이 목록 밖의 텍스트는 받아도 버린다 */
export const PHRASES = [
  '안녕하세요 👋', '같이 앉아요', '이 파티 궁금해요', '처음 왔어요',
  '잘 부탁해요', '다음에 또 봐요', '저쪽 방 가볼까요', '여기 분위기 좋네요',
];
export const EMOJIS = ['👍', '😂', '❤️', '🎉', '🍻', '👀'];
const SAYABLE = new Set([...PHRASES, ...EMOJIS]);

export function isSayable(text: unknown): text is string {
  return typeof text === 'string' && SAYABLE.has(text);
}

const HATS: Hat[] = ['none', 'cap', 'beanie'];
const num = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const color = (v: unknown) => num(v, 0, 0xffffff) ? (v as number) : null;

/** 다른 사람이 보낸 상태를 검증해 안전한 값만 돌려준다. 형식이 틀리면 null */
export function sanitizeState(raw: unknown): PeerState | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  const o = (s.outfit ?? {}) as Record<string, unknown>;
  const name = typeof s.name === 'string' ? s.name.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 16) : '';
  const pos = s.pos as unknown[];
  if (!name || !Array.isArray(pos) || !num(pos[0], -40, 40) || !num(pos[1], -40, 40)) return null;
  const outfit: Outfit = {
    top: color(o.top) ?? TOPS[0], bottom: color(o.bottom) ?? BOTTOMS[0],
    hair: color(o.hair) ?? HAIRS[0], skin: color(o.skin) ?? SKINS[0],
    hat: HATS.includes(o.hat as Hat) ? (o.hat as Hat) : 'none',
    hatColor: color(o.hatColor) ?? 0xff385c,
  };
  const pose = s.pose === 'walk' || s.pose === 'sit' ? s.pose : 'idle';
  const room = ROOM_THEMES.some(t => t.id === s.room) ? (s.room as RoomId) : null;
  return {
    name, outfit,
    pos: [pos[0] as number, pos[1] as number],
    yaw: num(s.yaw, -10, 10) ? (s.yaw as number) : 0,
    pose,
    seat: num(s.seat, 0, 500) ? Math.floor(s.seat as number) : null,
    room,
  };
}

export const isXZ = (v: unknown): v is [number, number] =>
  Array.isArray(v) && v.length === 2 && num(v[0], -40, 40) && num(v[1], -40, 40);
