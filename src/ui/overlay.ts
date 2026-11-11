import * as THREE from 'three';

interface Tag { root: HTMLElement; name: HTMLElement; bubble: HTMLElement; until: number }

export interface OverlayEntry { id: string; name: string; head: THREE.Vector3; mine?: boolean }

/** 아바타 머리 위에 붙는 이름표와 말풍선. 매 프레임 3D 좌표를 화면 좌표로 바꿔 놓는다 */
export class Overlay {
  private root: HTMLElement;
  private tags = new Map<string, Tag>();
  private v = new THREE.Vector3();

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'overlay';
    parent.appendChild(this.root);
  }

  say(id: string, text: string, ms = 3800) {
    const t = this.tags.get(id);
    if (!t) return;
    t.bubble.textContent = text;
    t.bubble.hidden = false;
    t.bubble.classList.remove('pop');
    void t.bubble.offsetWidth; // 애니메이션 재시작
    t.bubble.classList.add('pop');
    t.until = performance.now() + ms;
  }

  update(camera: THREE.Camera, entries: OverlayEntry[], now: number) {
    const seen = new Set<string>();
    const w = window.innerWidth, h = window.innerHeight;
    for (const e of entries) {
      seen.add(e.id);
      let t = this.tags.get(e.id);
      if (!t) {
        const root = document.createElement('div');
        root.className = 'tag' + (e.mine ? ' is-mine' : '');
        const bubble = document.createElement('div'); bubble.className = 'bubble'; bubble.hidden = true;
        const name = document.createElement('div'); name.className = 'name';
        root.append(bubble, name);
        this.root.appendChild(root);
        t = { root, name, bubble, until: 0 };
        this.tags.set(e.id, t);
      }
      if (t.name.textContent !== e.name) t.name.textContent = e.name;
      if (!t.bubble.hidden && now > t.until) t.bubble.hidden = true;
      this.v.copy(e.head).project(camera);
      const behind = this.v.z > 1 || this.v.z < -1;
      const x = (this.v.x + 1) / 2 * w, y = (1 - this.v.y) / 2 * h;
      const off = behind || x < -80 || x > w + 80 || y < -40 || y > h + 40;
      t.root.style.display = off ? 'none' : '';
      if (!off) t.root.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
    for (const [id, t] of this.tags) {
      if (seen.has(id)) continue;
      t.root.remove();
      this.tags.delete(id);
    }
  }
}
