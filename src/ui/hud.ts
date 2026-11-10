import { PARTING_URL, type RoomId, type RoomTheme } from '../scene/rooms';

export type ActionId = 'rooms' | 'sit' | 'wave' | 'cheers';

export interface HudHandlers {
  onAction(id: ActionId): void;
  onGoRoom(id: RoomId): void;
  onSound(): void;
}

export interface RoomCard { theme: RoomTheme; count: number }

const LOGO = `<svg viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" rx="24" fill="#ff385c"/><circle cx="50" cy="58" r="26" fill="#fff"/><circle cx="41" cy="54" r="3.2" fill="#ff385c"/><circle cx="59" cy="54" r="3.2" fill="#ff385c"/><path d="M38 61a12 12 0 0 0 24 0" stroke="#ff385c" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M36 36h28L52 7z" fill="#fff"/><circle cx="52" cy="7" r="4.5" fill="#ff385c"/></svg>`;

const ICON = {
  rooms: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  sit: '<path d="M6 11V5a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v6"/><path d="M4 11h14a2 2 0 0 1 2 2v3H4a2 2 0 0 1-2-2v-1a2 2 0 0 1 2-2z"/><path d="M5 16v5M19 16v5"/>',
  wave: '<path d="M7 11V6.5a1.5 1.5 0 0 1 3 0V11"/><path d="M10 10V4.5a1.5 1.5 0 0 1 3 0V10"/><path d="M13 10V5.5a1.5 1.5 0 0 1 3 0V12"/><path d="M16 12v-1.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1a6 6 0 0 1-5.2-3L4 13.5a1.6 1.6 0 0 1 2.8-1.6L8 13.5"/>',
  cheers: '<path d="M8 3h5l-1 8a2.5 2.5 0 0 1-2.5 2.3A2.5 2.5 0 0 1 7 11z"/><path d="M9.5 13.5V20M7 20h5"/><path d="M15 6l4-1.5 1 5.5a2.5 2.5 0 0 1-2 2.9 2.5 2.5 0 0 1-2.8-1.6z"/><path d="M17.5 13.5l1.2 5.7M16 20.2l4.5-1"/>',
  sound: '<path d="M4 10v4h3l4 3V7L7 10z"/><path d="M15 9a3.5 3.5 0 0 1 0 6"/><path d="M17.5 6.5a7 7 0 0 1 0 11"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.7"/><path d="M12 17h.01"/>',
  pin: '<path d="M12 21s6-5.3 6-11a6 6 0 0 0-12 0c0 5.7 6 11 6 11z"/><circle cx="12" cy="10" r="2.2"/>',
};
const svg = (d: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

const ACTIONS: { id: ActionId; label: string; key: string; icon: string }[] = [
  { id: 'rooms', label: '방 목록', key: '1', icon: ICON.rooms },
  { id: 'sit', label: '앉기', key: '2', icon: ICON.sit },
  { id: 'wave', label: '손 흔들기', key: '3', icon: ICON.wave },
  { id: 'cheers', label: '건배', key: '4', icon: ICON.cheers },
];

export class Hud {
  private root: HTMLElement;
  private els: Record<string, HTMLElement> = {};
  private toastTimer = 0;

  constructor(parent: HTMLElement, handlers: HudHandlers) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <header class="hud-top">
        <div class="panel brand">
          <span class="brand-mark">${LOGO}</span>
          <div><strong>파팅</strong><small id="presence">함께 1명</small></div>
        </div>
        <section class="panel where" id="where" aria-live="polite">
          <span class="where-icon">${svg(ICON.pin)}</span>
          <div class="where-text"><strong id="where-name">광장</strong><small id="where-sub">방 목록에서 가고 싶은 파티를 골라요</small></div>
          <a class="btn solid" id="where-link" href="${PARTING_URL}" target="_blank" rel="noopener noreferrer">파티 보기 ↗</a>
        </section>
        <div class="panel icons">
          <button id="sound-btn" aria-pressed="false" aria-label="소리 켜기" title="소리">${svg(ICON.sound)}</button>
          <button id="help-btn" aria-label="도움말" title="도움말">${svg(ICON.help)}</button>
        </div>
      </header>
      <div id="toast" class="toast" role="status" hidden></div>
      <nav class="panel bar" aria-label="동작">
        ${ACTIONS.map(a => `<button data-action="${a.id}" aria-label="${a.label}">${svg(a.icon)}<span>${a.label}</span><kbd>${a.key}</kbd></button>`).join('')}
      </nav>
      <div id="rooms" class="modal" hidden>
        <div class="panel modal-card rooms-card" role="dialog" aria-modal="true" aria-labelledby="rooms-title">
          <div class="modal-head"><h2 id="rooms-title">어떤 파티가 끌려요?</h2><button id="rooms-close" class="icon-btn" aria-label="닫기">✕</button></div>
          <p>방에 들어가면 벽의 QR로 그 카테고리의 이번 주 파티를 볼 수 있어요.</p>
          <div id="rooms-list" class="rooms-list"></div>
        </div>
      </div>
      <div id="help" class="modal" hidden>
        <div class="panel modal-card" role="dialog" aria-modal="true" aria-labelledby="help-title">
          <div class="modal-head"><h2 id="help-title">파팅 라운지</h2><button id="help-close" class="icon-btn" aria-label="닫기">✕</button></div>
          <p>파팅의 파티 카테고리를 둘러보는 공간이에요. 채팅은 없고, 같이 있는 사람만 보여요.<br>각 방 벽에 걸린 QR을 폰으로 찍으면 파팅으로 이어져요.</p>
          <p>바닥 클릭 · WASD · 방향키로 이동<br>드래그로 둘러보기 · 휠과 두 손가락으로 확대/축소<br>1 방 목록 · 2 앉기 · 3 손 흔들기 · 4 건배</p>
          <div class="modal-foot"><a class="btn solid" href="${PARTING_URL}" target="_blank" rel="noopener noreferrer">parting.io 열기 ↗</a></div>
        </div>
      </div>`;
    parent.appendChild(this.root);

    for (const id of ['presence', 'where', 'where-name', 'where-sub', 'where-link', 'sound-btn', 'help-btn', 'toast', 'rooms', 'rooms-list', 'rooms-close', 'help', 'help-close']) {
      this.els[id] = this.root.querySelector<HTMLElement>(`#${id}`)!;
    }

    this.root.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(b => {
      b.addEventListener('click', () => handlers.onAction(b.dataset.action as ActionId));
    });
    this.els['sound-btn'].addEventListener('click', () => handlers.onSound());
    this.els['help-btn'].addEventListener('click', () => this.showHelp(true));
    this.els['help-close'].addEventListener('click', () => this.showHelp(false));
    this.els['help'].addEventListener('click', e => { if (e.target === this.els['help']) this.showHelp(false); });
    this.els['rooms-close'].addEventListener('click', () => this.showRooms(false));
    this.els['rooms'].addEventListener('click', e => { if (e.target === this.els['rooms']) this.showRooms(false); });
    this.els['rooms-list'].addEventListener('click', e => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('[data-room]');
      if (!card) return;
      this.showRooms(false);
      handlers.onGoRoom(card.dataset.room as RoomId);
    });
  }

  get modalOpen() { return !this.els['help'].hidden || !this.els['rooms'].hidden; }
  showHelp(open: boolean) { this.els['help'].hidden = !open; }
  showRooms(open: boolean) { this.els['rooms'].hidden = !open; }
  closeModals() { this.showHelp(false); this.showRooms(false); }

  setPresence(n: number) { this.els['presence'].textContent = `함께 ${n}명`; }

  setLocation(theme: RoomTheme | null) {
    this.els['where'].classList.toggle('in-room', !!theme);
    this.els['where-name'].textContent = theme ? theme.name : '광장';
    this.els['where-sub'].textContent = theme ? '벽의 QR을 찍으면 이번 주 파티가 보여요' : '방 목록에서 가고 싶은 파티를 골라요';
  }

  setRooms(cards: RoomCard[]) {
    this.els['rooms-list'].innerHTML = cards.map(c => `
      <button class="room-card" data-room="${c.theme.id}" style="--room:${'#' + c.theme.light.toString(16).padStart(6, '0')}">
        <span class="room-dot"></span>
        <span class="room-text"><strong>${c.theme.name}</strong><small>${c.theme.tagline}</small></span>
        <span class="room-count">${c.count}명</span>
      </button>`).join('');
  }

  setSeated(seated: boolean) {
    const b = this.root.querySelector<HTMLButtonElement>('[data-action="sit"]')!;
    b.querySelector('span')!.textContent = seated ? '일어나기' : '앉기';
    b.classList.toggle('is-active', seated);
  }

  setSound(on: boolean) {
    const b = this.els['sound-btn'];
    b.setAttribute('aria-pressed', String(on));
    b.setAttribute('aria-label', on ? '소리 끄기' : '소리 켜기');
  }

  toast(msg: string, ms = 2800) {
    const t = this.els['toast'];
    t.textContent = msg;
    t.hidden = false;
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => { t.hidden = true; }, ms);
  }
}
