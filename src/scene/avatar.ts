import * as THREE from 'three';

export type Pose = 'idle' | 'walk' | 'sit';
export type Emote = 'wave' | 'cheers';

export interface Outfit { top: number; bottom: number; hair: number; skin: number }

export const TOPS = [0xff385c, 0x2f6fed, 0xf2c94c, 0x27ae60, 0xffffff, 0x9b51e0, 0xf2994a, 0x222222];
export const BOTTOMS = [0x1f2a44, 0x3b3b3b, 0xcfc2a8, 0x4a6fa5];
export const HAIRS = [0x2d1e14, 0x111111, 0x6b4a2e, 0xb08968, 0x8a3b2e];
export const SKINS = [0xf1c9a5, 0xe8b792, 0xd9a07a, 0xfbe0c8];

export function randomOutfit(seed = Math.random()): Outfit {
  const pick = <T,>(arr: T[], k: number) => arr[Math.floor((seed * k) % 1 * arr.length)];
  return { top: pick(TOPS, 97), bottom: pick(BOTTOMS, 53), hair: pick(HAIRS, 31), skin: pick(SKINS, 17) };
}

/** 평상복 차림의 절차적 아바타 */
export class Avatar {
  group = new THREE.Group();
  pose: Pose = 'idle';
  /** 차례대로 갈 지점들. 마지막에 도착하면 비워진다 */
  path: THREE.Vector3[] = [];
  speed = 2.6;

  private body = new THREE.Group();
  private hand = new THREE.Group();
  private prop: THREE.Object3D | null = null;
  private legs: THREE.Mesh[];
  private arms: THREE.Mesh[];
  private t = Math.random() * 10;
  private emote: Emote | null = null;
  private emoteUntil = 0;

  constructor(public name: string, outfit: Outfit) {
    this.group.add(this.body);
    const top = new THREE.MeshStandardMaterial({ color: outfit.top, roughness: 0.85 });
    const bottom = new THREE.MeshStandardMaterial({ color: outfit.bottom, roughness: 0.9 });
    const skin = new THREE.MeshStandardMaterial({ color: outfit.skin, roughness: 0.7 });
    const hairMat = new THREE.MeshStandardMaterial({ color: outfit.hair, roughness: 1 });
    const shoe = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.6 });

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.42, 6, 14), top);
    torso.position.y = 0.74; torso.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 20, 16), skin);
    head.position.y = 1.26; head.castShadow = true;
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.255, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2.05), hairMat);
    hair.position.y = 1.27;

    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x2b1d14 });
    const eL = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), eyeMat);
    eL.position.set(-0.08, 1.27, 0.215);
    const eR = eL.clone(); eR.position.x = 0.08;
    const blushMat = new THREE.MeshBasicMaterial({ color: 0xf0a08c });
    const bL = new THREE.Mesh(new THREE.CircleGeometry(0.035, 10), blushMat);
    bL.position.set(-0.15, 1.2, 0.19); bL.rotation.y = -0.6;
    const bR = bL.clone(); bR.position.x = 0.15; bR.rotation.y = 0.6;

    const legGeo = new THREE.CapsuleGeometry(0.09, 0.26, 4, 8);
    const lL = new THREE.Mesh(legGeo, bottom); lL.position.set(-0.12, 0.3, 0); lL.castShadow = true;
    const lR = lL.clone(); lR.position.x = 0.12;
    const shoeGeo = new THREE.BoxGeometry(0.16, 0.08, 0.24);
    const sL = new THREE.Mesh(shoeGeo, shoe); sL.position.set(0, -0.2, 0.03); lL.add(sL);
    const sR = sL.clone(); lR.add(sR);

    const armGeo = new THREE.CapsuleGeometry(0.065, 0.3, 4, 8);
    const aL = new THREE.Mesh(armGeo, top); aL.position.set(-0.35, 0.78, 0);
    const aR = new THREE.Mesh(armGeo, top); aR.position.set(0.35, 0.78, 0);
    // 팔은 어깨를 기준으로 돌도록 지오메트리를 아래로 내린다
    aL.geometry.translate(0, -0.15, 0); aL.position.y = 0.93;
    aR.geometry = aL.geometry; aR.position.y = 0.93;

    this.hand.position.set(0.3, 0.82, 0.3);

    this.body.add(torso, head, hair, eL, eR, bL, bR, lL, lR, aL, aR, this.hand);
    this.legs = [lL, lR];
    this.arms = [aL, aR];
  }

  hold(obj: THREE.Object3D | null) {
    if (this.prop) this.hand.remove(this.prop);
    this.prop = obj;
    if (obj) this.hand.add(obj);
  }

  faceYaw(y: number) { this.group.rotation.y = y; }

  get moving() { return this.path.length > 0; }

  walkTo(points: THREE.Vector3[]) {
    this.path = points.map(p => p.clone());
    if (this.path.length && this.pose === 'sit') this.setPose('idle');
  }

  stop() { this.path = []; if (this.pose === 'walk') this.setPose('idle'); }

  setPose(p: Pose) {
    this.pose = p;
    this.body.position.set(0, 0, 0);
    this.legs.forEach(l => { l.rotation.x = 0; l.position.z = 0; l.position.y = 0.3; });
    this.arms.forEach(a => { a.rotation.set(0, 0, 0); });
    if (p === 'sit') {
      this.body.position.y = -0.32;
      this.legs.forEach(l => { l.rotation.x = -Math.PI / 2; l.position.z = 0.2; l.position.y = 0.36; });
    }
  }

  play(e: Emote, ms = 1800) {
    this.emote = e;
    this.emoteUntil = this.t + ms / 1000;
  }

  /** @returns 이번 프레임에 마지막 지점에 도착했으면 true */
  update(dt: number): boolean {
    this.t += dt;
    let arrived = false;
    if (this.path.length) {
      const target = this.path[0];
      const d = new THREE.Vector3().subVectors(target, this.group.position);
      d.y = 0;
      const dist = d.length();
      const step = this.speed * dt;
      if (dist <= step + 0.02) {
        this.group.position.x = target.x;
        this.group.position.z = target.z;
        this.path.shift();
        if (!this.path.length) { arrived = true; if (this.pose === 'walk') this.setPose('idle'); }
      } else {
        d.normalize();
        this.group.position.addScaledVector(d, step);
        this.group.rotation.y = Math.atan2(d.x, d.z);
        if (this.pose !== 'walk') this.setPose('walk');
      }
    }

    if (this.pose === 'walk') {
      const s = Math.sin(this.t * 11);
      this.body.position.y = Math.abs(s) * 0.05;
      this.legs[0].rotation.x = s * 0.6;
      this.legs[1].rotation.x = -s * 0.6;
      this.arms[0].rotation.x = -s * 0.5;
      this.arms[1].rotation.x = s * 0.5;
    } else if (this.pose === 'idle') {
      this.body.position.y = Math.sin(this.t * 2) * 0.012;
    } else if (this.pose === 'sit') {
      this.body.position.y = -0.32 + Math.sin(this.t * 1.8) * 0.01;
    }

    if (this.emote) {
      if (this.t > this.emoteUntil) {
        this.emote = null;
        this.arms[1].rotation.set(0, 0, 0);
        this.hand.position.set(0.3, 0.82, 0.3);
      } else if (this.emote === 'wave') {
        this.arms[1].rotation.z = -2.6;
        this.arms[1].rotation.x = Math.sin(this.t * 14) * 0.5;
      } else {
        this.arms[1].rotation.x = -2.2;
        this.hand.position.set(0.34, 1.35, 0.25);
      }
    }
    return arrived;
  }
}

export function cupProp(color = 0xf9f3e6): THREE.Object3D {
  const g = new THREE.Group();
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.15, 14), new THREE.MeshStandardMaterial({ color, roughness: 0.5 }));
  const top = new THREE.Mesh(new THREE.CircleGeometry(0.056, 14), new THREE.MeshStandardMaterial({ color: 0xd97b5a, roughness: 0.3 }));
  top.rotation.x = -Math.PI / 2; top.position.y = 0.072;
  g.add(cup, top);
  return g;
}
