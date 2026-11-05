import type { FireState } from '../state/fire';
import { formatSince } from '../state/fire';
import type { Stats } from '../state/stats';

export type ActionId = 'lie' | 'sauna' | 'towel' | 'egg' | 'sikhye';

export interface HudHandlers {
  onAction(id: ActionId): void;
  onAddLog(): void;
  onSound(): void;
  onExitSauna(): void;
}

const ICON = {
  flame: '<path d="M12 3c1 3 4 4 4 8a4 4 0 0 1-8 0c0-1.5.6-2.5 1.5-3.5.3 1.2 1 2 2.5 2.5C12 8 11 5.5 12 3z"/><path d="M4 21h16"/>',
  lie: '<path d="M3 17h18"/><path d="M3 17v-5h18v5"/><path d="M3 12V7"/><circle cx="7" cy="9.5" r="1.6"/><path d="M11 12V9.5h7a2 2 0 0 1 2 2.5"/>',
  towel: '<circle cx="12" cy="12" r="5"/><circle cx="5.5" cy="9" r="2.5"/><circle cx="18.5" cy="9" r="2.5"/><path d="M9 12.5a3 3 0 0 0 6 0"/>',
  egg: '<path d="M12 3c3.5 0 6 4.5 6 9a6 6 0 0 1-12 0c0-4.5 2.5-9 6-9z"/>',
  cup: '<path d="M5 8h11v7a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z"/><path d="M16 10h1.5a2 2 0 0 1 0 4H16"/><path d="M8 4v2M11 3v3"/>',
  sound: '<path d="M4 10v4h3l4 3V7L7 10z"/><path d="M15 9a3.5 3.5 0 0 1 0 6"/><path d="M17.5 6.5a7 7 0 0 1 0 11"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.7"/><path d="M12 17h.01"/>',
};
const svg = (d: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

const ACTIONS: { id: ActionId; label: string; key: string; icon: string }[] = [
  { id: 'lie', label: '눕기', key: '1', icon: ICON.lie },
  { id: 'sauna', label: '불가마', key: '2', icon: ICON.flame },
  { id: 'towel', label: '양머리', key: '3', icon: ICON.towel },
  { id: 'egg', label: '계란', key: '4', icon: ICON.egg },
  { id: 'sikhye', label: '식혜', key: '5', icon: ICON.cup },
];

export class Hud {
  private root: HTMLElement;
  private els: Record<string, HTMLElement> = {};
  private toastTimer = 0;
  private burnMs: number;
  private lastFire: FireState | null = null;

  constructor(parent: HTMLElement, burnMs: number, handlers: HudHandlers) {
    this.burnMs = burnMs;
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <header class="hud-top">
        <div class="panel brand">
          <span class="brand-mark">${svg(ICON.flame)}</span>
          <div><strong>온돌</strong><small id="presence">함께 1명</small></div>
        </div>
        <section class="panel fire" id="fire" aria-live="polite">
          <div class="fire-row">
            <span class="fire-icon">${svg(ICON.flame)}</span>
            <div class="fire-text"><strong id="fire-title">불가마 불</strong><small id="fire-sub">확인 중</small></div>
            <button id="fire-btn" class="btn solid">장작 넣기</button>
          </div>
          <div class="fuel"><i id="fuel-bar"></i></div>
        </section>
        <div class="panel icons">
          <button id="sound-btn" aria-pressed="false" aria-label="소리 켜기" title="소리">${svg(ICON.sound)}</button>
          <button id="help-btn" aria-label="조작 방법" title="조작 방법">${svg(ICON.help)}</button>
        </div>
      </header>
      <div id="toast" class="toast" role="status" hidden></div>
      <div id="sauna" class="panel sauna" hidden>
        <small>불가마 안</small>
        <strong id="sauna-time">00:00</strong>
        <span>버티는 중</span>
        <button id="sauna-exit" class="btn ghost">나가기</button>
        <div class="heat"><i id="heat-bar"></i></div>
      </div>
      <nav class="panel bar" aria-label="동작">
        ${ACTIONS.map(a => `<button data-action="${a.id}" aria-label="${a.label}">${svg(a.icon)}<span>${a.label}</span><kbd>${a.key}</kbd></button>`).join('')}
      </nav>
      <div id="help" class="modal" hidden>
        <div class="panel modal-card" role="dialog" aria-modal="true" aria-labelledby="help-title">
          <h2 id="help-title">온돌 · 온라인 찜질방</h2>
          <p>말없이 같이 누워 있는 곳이에요. 채팅은 없어요.<br>불가마의 불은 모두가 함께 지켜요. 장작이 떨어지면 꺼져요.</p>
          <p>바닥 클릭 · WASD · 방향키로 이동<br>드래그로 둘러보기 · 휠과 두 손가락으로 확대/축소<br>1 눕기 · 2 불가마 · 3 양머리 · 4 계란 · 5 식혜</p>
          <div class="stats">
            <div><b id="st-sauna">0분</b><small>불가마 버틴 시간</small></div>
            <div><b id="st-egg">0</b><small>맥반석 계란</small></div>
            <div><b id="st-log">0</b><small>넣은 장작</small></div>
          </div>
          <div class="modal-foot"><button id="help-close" class="btn ghost">닫기</button></div>
        </div>
      </div>`;
    parent.appendChild(this.root);

    for (const id of ['presence', 'fire', 'fire-title', 'fire-sub', 'fire-btn', 'fuel-bar', 'sound-btn', 'help-btn', 'toast', 'sauna', 'sauna-time', 'sauna-exit', 'heat-bar', 'help', 'help-close', 'st-sauna', 'st-egg', 'st-log']) {
      this.els[id] = this.root.querySelector<HTMLElement>(`#${id}`)!;
    }

    this.root.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(b => {
      b.addEventListener('click', () => handlers.onAction(b.dataset.action as ActionId));
    });
    this.els['fire-btn'].addEventListener('click', () => handlers.onAddLog());
    this.els['sound-btn'].addEventListener('click', () => handlers.onSound());
    this.els['sauna-exit'].addEventListener('click', () => handlers.onExitSauna());
    this.els['help-btn'].addEventListener('click', () => this.showHelp(true));
    this.els['help-close'].addEventListener('click', () => this.showHelp(false));
    this.els['help'].addEventListener('click', e => { if (e.target === this.els['help']) this.showHelp(false); });

    setInterval(() => { if (this.lastFire) this.setFire(this.lastFire); }, 15000);
  }

  get helpOpen() { return !this.els['help'].hidden; }
  showHelp(open: boolean) { this.els['help'].hidden = !open; }

  setPresence(n: number) { this.els['presence'].textContent = `함께 ${n}명`; }

  setFire(s: FireState) {
    this.lastFire = s;
    const fire = this.els['fire'];
    const title = this.els['fire-title'];
    const sub = this.els['fire-sub'];
    const btn = this.els['fire-btn'] as HTMLButtonElement;
    (this.els['fuel-bar']).style.width = `${Math.round(s.fuel * 100)}%`;
    fire.classList.toggle('is-out', s.litAt === null);
    fire.classList.toggle('is-low', s.litAt !== null && s.fuel < 0.25);
    if (s.litAt === null) {
      title.textContent = '불이 꺼졌어요';
      sub.textContent = s.logs > 0 ? `장작 ${s.logs}개까지 버텼어요 · 다시 지펴주세요` : '아무도 지키지 못했어요 · 다시 지펴주세요';
      btn.textContent = '다시 지피기';
    } else {
      title.textContent = `불가마 불 · ${formatSince(s.litAt)} 타오르는 중`;
      const minLeft = Math.max(1, Math.ceil((s.fuel * this.burnMs) / 60000));
      sub.textContent = s.fuel < 0.25
        ? `${minLeft}분 뒤 꺼져요 · 장작을 넣어주세요`
        : `장작 ${Math.round(s.fuel * 100)}% · 지금까지 ${s.logs}개 넣었어요`;
      btn.textContent = '장작 넣기';
    }
  }

  setSauna(visible: boolean, sec = 0, heat = 0) {
    const el = this.els['sauna'];
    el.hidden = !visible;
    if (!visible) return;
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    this.els['sauna-time'].textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    this.els['heat-bar'].style.width = `${Math.round(Math.min(1, heat) * 100)}%`;
  }

  setActive(id: ActionId | null) {
    this.root.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(b => {
      b.classList.toggle('is-active', b.dataset.action === id);
    });
  }

  setTowelState(on: boolean) {
    const b = this.root.querySelector<HTMLButtonElement>('[data-action="towel"]')!;
    b.classList.toggle('is-active', on);
  }

  setSound(on: boolean) {
    const b = this.els['sound-btn'];
    b.setAttribute('aria-pressed', String(on));
    b.setAttribute('aria-label', on ? '소리 끄기' : '소리 켜기');
  }

  setStats(st: Stats) {
    const min = Math.floor(st.saunaSec / 60);
    this.els['st-sauna'].textContent = min >= 60 ? `${Math.floor(min / 60)}시간 ${min % 60}분` : `${min}분`;
    this.els['st-egg'].textContent = String(st.eggs);
    this.els['st-log'].textContent = String(st.logs);
  }

  toast(msg: string, ms = 2600) {
    const t = this.els['toast'];
    t.textContent = msg;
    t.hidden = false;
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => { t.hidden = true; }, ms);
  }
}
