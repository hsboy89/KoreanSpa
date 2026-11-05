/**
 * 함께 있는 사람(접속자) 모델.
 * 지금은 목업 봇 몇 명을 돌리고, 나중에 Supabase Realtime Presence로 교체한다.
 */
export type PeerKind = 'lie' | 'sauna' | 'counter' | 'wander';

export interface Peer {
  id: string;
  name: string;
  robe: number;
  towel: boolean;
  kind: PeerKind;
  matIndex?: number;
}

export const ROBES = [0xd9b56a, 0xe39a86, 0xb7c4a0, 0xd4a0b4, 0xc9b58f, 0x9fb8c4];

const ADJ = ['조용한', '느긋한', '뜨끈한', '졸린', '포근한', '말없는', '노곤한', '나른한'];
const NOUN = ['양머리', '식혜', '맥반석', '목침', '황토', '불가마', '수건'];

export function randomName(seed = Math.random()): string {
  const a = ADJ[Math.floor(seed * ADJ.length) % ADJ.length];
  const n = NOUN[Math.floor((seed * 7919) % NOUN.length)];
  return `${a} ${n} ${1 + Math.floor((seed * 104729) % 99)}`;
}

export function mockPeers(): Peer[] {
  const mk = (i: number, kind: PeerKind, matIndex?: number): Peer => ({
    id: `bot-${i}`,
    name: randomName((i + 1) / 9.7),
    robe: ROBES[i % ROBES.length],
    towel: i % 3 !== 2,
    kind,
    matIndex,
  });
  return [
    mk(0, 'lie', 0), mk(1, 'lie', 5), mk(2, 'lie', 7), mk(3, 'lie', 10),
    mk(4, 'sauna'), mk(5, 'counter'), mk(6, 'wander'),
  ];
}
