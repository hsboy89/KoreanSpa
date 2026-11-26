/**
 * 파티 코인과 옷장. 이 브라우저에만 저장한다.
 * 로그인이 없어 서버가 주인을 확인할 수 없으므로 재미용이다. 실제 가치가 있는 보상과 연결하지 않는다.
 */
import { BOTTOMS, HAIRS, SKINS, TOPS, type Hat, type Outfit } from '../scene/avatar';

export interface HatItem { id: Hat; name: string; price: number; winnerOnly?: boolean }

export const HAT_ITEMS: HatItem[] = [
  { id: 'none', name: '없음', price: 0 },
  { id: 'cap', name: '캡모자', price: 0 },
  { id: 'beanie', name: '비니', price: 0 },
  { id: 'party', name: '고깔모자', price: 30 },
  { id: 'ears', name: '고양이 귀', price: 60 },
  { id: 'headphones', name: '헤드폰', price: 100 },
  { id: 'halo', name: '반짝 링', price: 150 },
  { id: 'crown', name: '우승 왕관', price: 0, winnerOnly: true },
];

export const HAT_COLORS = [0xff385c, 0x1f2a44, 0xffffff, 0xffd166];
export const DAILY_BONUS = 10;
const CROWN_MS = 24 * 3_600_000;
const KEY = 'parting.wallet';

interface Data { coins: number; owned: Hat[]; outfit: Outfit | null; crownUntil: number; bonusDay: string }

const isOutfit = (o: unknown): o is Outfit => {
  if (!o || typeof o !== 'object') return false;
  const v = o as Outfit;
  return TOPS.includes(v.top) && BOTTOMS.includes(v.bottom) && HAIRS.includes(v.hair) && SKINS.includes(v.skin)
    && HAT_ITEMS.some(h => h.id === v.hat) && typeof v.hatColor === 'number';
};

export class Wallet {
  private data: Data = { coins: 0, owned: [], outfit: null, crownUntil: 0, bonusDay: '' };

  constructor() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Data>;
      this.data = {
        coins: typeof d.coins === 'number' && d.coins >= 0 ? Math.floor(d.coins) : 0,
        owned: Array.isArray(d.owned) ? d.owned.filter(h => HAT_ITEMS.some(i => i.id === h)) : [],
        outfit: isOutfit(d.outfit) ? d.outfit : null,
        crownUntil: typeof d.crownUntil === 'number' ? d.crownUntil : 0,
        bonusDay: typeof d.bonusDay === 'string' ? d.bonusDay : '',
      };
    } catch { /* 저장소를 못 쓰는 환경 */ }
    // 왕관 기한이 지났으면 벗긴다
    if (this.data.outfit?.hat === 'crown' && !this.hasCrown) { this.data.outfit.hat = 'none'; this.save(); }
  }

  get coins() { return this.data.coins; }
  get outfit() { return this.data.outfit; }
  get hasCrown() { return this.data.crownUntil > Date.now(); }

  add(n: number) { this.data.coins = Math.max(0, this.data.coins + n); this.save(); }

  /** 하루 첫 방문 보너스. 받았으면 받은 코인 수, 이미 받았으면 0 */
  claimDaily(): number {
    const today = new Date().toDateString();
    if (this.data.bonusDay === today) return 0;
    this.data.bonusDay = today;
    this.add(DAILY_BONUS);
    return DAILY_BONUS;
  }

  owns(hat: Hat): boolean {
    const item = HAT_ITEMS.find(h => h.id === hat);
    if (!item) return false;
    if (item.winnerOnly) return this.hasCrown;
    return item.price === 0 || this.data.owned.includes(hat);
  }

  buy(hat: Hat): boolean {
    const item = HAT_ITEMS.find(h => h.id === hat);
    if (!item || item.winnerOnly || this.owns(hat) || this.data.coins < item.price) return false;
    this.data.coins -= item.price;
    this.data.owned.push(hat);
    this.save();
    return true;
  }

  setOutfit(o: Outfit) { this.data.outfit = { ...o }; this.save(); }

  grantCrown() { this.data.crownUntil = Date.now() + CROWN_MS; this.save(); }

  private save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* ignore */ }
  }
}
