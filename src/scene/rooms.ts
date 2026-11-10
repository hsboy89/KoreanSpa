/**
 * 파티 카테고리 방 정의. 카테고리는 아직 확정이 아니라 임의로 둔 것이며,
 * 이 파일만 고치면 방 이름·분위기·배치가 바뀐다.
 */
export type RoomId = 'wine' | 'board' | 'rooftop' | 'run' | 'book' | 'club';

export interface RoomTheme {
  id: RoomId;
  name: string;
  tagline: string;
  /** 바닥, 벽, 포인트 조명 색 */
  floor: number;
  wall: number;
  light: number;
  lightIntensity: number;
}

export const PARTING_URL = 'https://parting.io/';
export const BRAND_PINK = 0xff385c;

export const ROOM_THEMES: RoomTheme[] = [
  { id: 'wine', name: '와인 · 다이닝', tagline: '잔 하나 두고 천천히 이야기해요', floor: 0x4a2b24, wall: 0x5c2233, light: 0xffb070, lightIntensity: 26 },
  { id: 'board', name: '보드게임', tagline: '처음 만나도 한 판이면 친구', floor: 0xd9b98a, wall: 0xf3e9d8, light: 0xfff3e0, lightIntensity: 34 },
  { id: 'rooftop', name: '루프탑 파티', tagline: '야경 보면서 가볍게 한 잔', floor: 0x6b5a4a, wall: 0x1b2440, light: 0xffc6d6, lightIntensity: 24 },
  { id: 'run', name: '러닝 · 액티비티', tagline: '같이 뛰고 같이 숨 고르기', floor: 0x3f8f4a, wall: 0xe8edf0, light: 0xffffff, lightIntensity: 34 },
  { id: 'book', name: '독서 · 토크', tagline: '한 권 들고 오면 돼요', floor: 0xb08d63, wall: 0xd9c4a3, light: 0xffd9a0, lightIntensity: 28 },
  { id: 'club', name: '노래 · 클럽', tagline: '오늘 밤은 소리 질러', floor: 0x17141f, wall: 0x15121e, light: 0xff3aa0, lightIntensity: 30 },
];

/** 바닥 좌표계의 직사각형 */
export interface Rect { minX: number; maxX: number; minZ: number; maxZ: number }

export type Side = 'n' | 's' | 'e' | 'w';

export interface RoomLayout {
  theme: RoomTheme;
  rect: Rect;
  /** 광장과 맞닿은 벽. 문이 이 벽에 난다 */
  doorSide: Side;
  /** 문 중심의 벽 위 좌표(해당 축) */
  doorAt: number;
}

export const PLAZA: Rect = { minX: -10, maxX: 10, minZ: -7, maxZ: 7 };

export const ROOM_LAYOUTS: RoomLayout[] = [
  { theme: ROOM_THEMES[0], rect: { minX: -10, maxX: -1, minZ: -15, maxZ: -7 }, doorSide: 's', doorAt: -5.5 },
  { theme: ROOM_THEMES[1], rect: { minX: 1, maxX: 10, minZ: -15, maxZ: -7 }, doorSide: 's', doorAt: 5.5 },
  { theme: ROOM_THEMES[2], rect: { minX: 10, maxX: 19, minZ: -4, maxZ: 4 }, doorSide: 'w', doorAt: 0 },
  { theme: ROOM_THEMES[3], rect: { minX: 1, maxX: 10, minZ: 7, maxZ: 15 }, doorSide: 'n', doorAt: 5.5 },
  { theme: ROOM_THEMES[4], rect: { minX: -10, maxX: -1, minZ: 7, maxZ: 15 }, doorSide: 'n', doorAt: -5.5 },
  { theme: ROOM_THEMES[5], rect: { minX: -19, maxX: -10, minZ: -4, maxZ: 4 }, doorSide: 'e', doorAt: 0 },
];

export const DOOR_WIDTH = 2.6;
export const WALL_HEIGHT = 2.4;
export const WALL_THICKNESS = 0.3;

export function inRect(r: Rect, x: number, z: number, pad = 0) {
  return x >= r.minX - pad && x <= r.maxX + pad && z >= r.minZ - pad && z <= r.maxZ + pad;
}
