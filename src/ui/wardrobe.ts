/** 옷장: 옷 색은 자유롭게, 모자는 코인으로 산다 */
import { BOTTOMS, HAIRS, TOPS, type Hat, type Outfit } from '../scene/avatar';
import { HAT_COLORS, HAT_ITEMS, type Wallet } from '../state/wallet';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

export class WardrobePanel {
  private note = '';

  constructor(
    private root: HTMLElement,
    private wallet: Wallet,
    private current: () => Outfit,
    /** 옷이 바뀌었을 때. bought는 방금 산 모자 */
    private onChange: (o: Outfit, bought: Hat | null) => void,
  ) {}

  render() {
    const o = this.current();
    this.root.textContent = '';
    const head = el('p', 'wardrobe-coins');
    head.append('가진 코인 ', el('b', undefined, `${this.wallet.coins.toLocaleString('ko-KR')}개`));
    this.root.appendChild(head);
    this.root.appendChild(el('p', undefined, '머무르면 1분에 1개(앉아 있으면 2개), 퀴즈를 맞히면 더 모여요.'));

    this.root.appendChild(this.swatches('상의', TOPS, o.top, c => ({ ...o, top: c })));
    this.root.appendChild(this.swatches('하의', BOTTOMS, o.bottom, c => ({ ...o, bottom: c })));
    this.root.appendChild(this.swatches('머리색', HAIRS, o.hair, c => ({ ...o, hair: c })));

    const hats = el('section', 'wardrobe-row');
    hats.appendChild(el('h3', undefined, '모자'));
    const grid = el('div', 'hat-grid');
    for (const item of HAT_ITEMS) {
      const owned = this.wallet.owns(item.id);
      const on = o.hat === item.id;
      const b = el('button', 'hat-item' + (on ? ' is-on' : '') + (owned ? '' : ' is-locked'));
      b.type = 'button';
      const status = on ? '착용 중' : owned ? '갖고 있어요' : item.winnerOnly ? '퀴즈 우승자만' : `${item.price} 코인`;
      b.append(el('strong', undefined, item.name), el('small', undefined, status));
      b.addEventListener('click', () => this.pickHat(item.id));
      grid.appendChild(b);
    }
    hats.appendChild(grid);
    this.root.appendChild(hats);

    if (o.hat === 'cap' || o.hat === 'beanie') {
      this.root.appendChild(this.swatches('모자 색', HAT_COLORS, o.hatColor, c => ({ ...o, hatColor: c })));
    }
    const note = el('p', 'wardrobe-note', this.note);
    note.hidden = !this.note;
    this.root.appendChild(note);
  }

  private swatches(title: string, colors: number[], selected: number, apply: (c: number) => Outfit) {
    const row = el('section', 'wardrobe-row');
    row.appendChild(el('h3', undefined, title));
    const list = el('div', 'swatches');
    for (const c of colors) {
      const b = el('button', 'swatch' + (c === selected ? ' is-on' : ''));
      b.type = 'button';
      b.setAttribute('aria-label', `${title} ${hex(c)}`);
      b.style.background = hex(c);
      b.addEventListener('click', () => { this.note = ''; this.onChange(apply(c), null); this.render(); });
      list.appendChild(b);
    }
    row.appendChild(list);
    return row;
  }

  private pickHat(hat: Hat) {
    const item = HAT_ITEMS.find(h => h.id === hat)!;
    const o = this.current();
    let bought: Hat | null = null;
    if (!this.wallet.owns(hat)) {
      if (item.winnerOnly) { this.note = '밤 9시 퀴즈를 전부 맞히면 24시간 동안 쓸 수 있어요.'; this.render(); return; }
      if (!this.wallet.buy(hat)) { this.note = `코인이 ${item.price - this.wallet.coins}개 모자라요.`; this.render(); return; }
      bought = hat;
    }
    this.note = bought ? `${item.name}을(를) 샀어요.` : '';
    this.onChange({ ...o, hat }, bought);
    this.render();
  }
}
