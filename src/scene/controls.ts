import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/**
 * 산사와 같은 조작감: 바닥 클릭으로 이동, 드래그로 둘러보기, 휠/핀치로 확대, WASD.
 * 카메라는 아바타를 따라다닌다.
 */
export class Controls {
  orbit: OrbitControls;
  keys = new Set<string>();
  private down: { x: number; y: number; id: number } | null = null;
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private follow = new THREE.Vector3();
  private tmp = new THREE.Vector3();

  constructor(
    private camera: THREE.PerspectiveCamera,
    private dom: HTMLElement,
    private floor: THREE.Object3D,
    private onClickFloor: (p: THREE.Vector3) => void,
    private onKey: (e: KeyboardEvent) => void,
  ) {
    this.orbit = new OrbitControls(camera, dom);
    this.orbit.enablePan = false;
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.08;
    this.orbit.minDistance = 2.2;
    this.orbit.maxDistance = 11;
    this.orbit.minPolarAngle = 0.3;
    this.orbit.maxPolarAngle = Math.PI / 2 - 0.06;
    this.orbit.rotateSpeed = 0.6;

    dom.addEventListener('pointerdown', e => { if (e.isPrimary) this.down = { x: e.clientX, y: e.clientY, id: e.pointerId }; });
    dom.addEventListener('pointerup', e => {
      if (!this.down || e.pointerId !== this.down.id) return;
      const dx = e.clientX - this.down.x, dy = e.clientY - this.down.y;
      this.down = null;
      if (dx * dx + dy * dy > 36) return;
      this.pick(e.clientX, e.clientY);
    });
    dom.addEventListener('pointercancel', () => { this.down = null; });
    window.addEventListener('keydown', e => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      this.keys.add(e.code);
      this.onKey(e);
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  private pick(x: number, y: number) {
    const r = this.dom.getBoundingClientRect();
    this.ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    const hit = this.ray.intersectObject(this.floor, false)[0];
    if (hit) this.onClickFloor(hit.point);
  }

  /** 카메라 기준 WASD 이동 방향. 입력 없으면 null */
  moveVector(): THREE.Vector3 | null {
    const k = this.keys;
    let fx = 0, fz = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) fz += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) fz -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) fx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) fx += 1;
    if (!fx && !fz) return null;
    const fwd = new THREE.Vector3();
    this.camera.getWorldDirection(fwd);
    fwd.y = 0; fwd.normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
    return fwd.multiplyScalar(fz).addScaledVector(right, fx).normalize();
  }

  snapTo(focus: THREE.Vector3) {
    this.follow.copy(focus);
    this.orbit.target.copy(focus);
  }

  /** 카메라를 특정 위치로 옮기고 바라볼 지점을 맞춘다 (불가마 입장 등) */
  placeCamera(pos: THREE.Vector3, focus: THREE.Vector3) {
    // 직전 드래그의 관성을 먼저 없앤다. 남아 있으면 매번 조금씩 다른 시점이 된다
    this.orbit.enableDamping = false;
    this.orbit.update();
    this.camera.position.copy(pos);
    this.snapTo(focus);
    this.orbit.update();
    this.orbit.enableDamping = true;
  }

  /** 불가마 안에서는 문틀 뒤로 내려가거나 천장을 뚫지 않게 시점을 제한한다 */
  setSaunaView(on: boolean) {
    this.orbit.maxDistance = on ? 3.9 : 11;
    this.orbit.minPolarAngle = on ? 0.45 : 0.3;
    this.orbit.maxPolarAngle = on ? 1 : Math.PI / 2 - 0.06;
  }

  update(dt: number, focus: THREE.Vector3) {
    this.follow.lerp(focus, Math.min(1, dt * 6));
    this.tmp.subVectors(this.follow, this.orbit.target);
    this.orbit.target.copy(this.follow);
    this.camera.position.add(this.tmp);
    this.orbit.update();
  }
}
