import * as THREE from 'three';

export type Pose = 'idle' | 'walk' | 'sit';
export type Emote = 'wave' | 'cheers';
export type Hat = 'none' | 'cap' | 'beanie';

export interface Outfit { top: number; bottom: number; hair: number; skin: number; hat: Hat; hatColor: number }

export const TOPS = [0xff385c, 0x2f6fed, 0xffd166, 0x2ec4b6, 0xffffff, 0x9b51e0, 0xff9f1c, 0x222222, 0x8ac926];
export const BOTTOMS = [0x1f2a44, 0x3b3b3b, 0xcfc2a8, 0x4a6fa5, 0x6d4c41];
export const HAIRS = [0x2d1e14, 0x111111, 0x6b4a2e, 0xb08968, 0x8a3b2e, 0xd9b26a];
export const SKINS = [0xf6d2b5, 0xf1c9a5, 0xe8b792, 0xd9a07a];
const HATS: Hat[] = ['none', 'none', 'none', 'cap', 'beanie'];

export function randomOutfit(seed = Math.random()): Outfit {
  const pick = <T,>(arr: T[], k: number) => arr[Math.floor(((seed * k) % 1) * arr.length)];
  return {
    top: pick(TOPS, 97), bottom: pick(BOTTOMS, 53), hair: pick(HAIRS, 31), skin: pick(SKINS, 17),
    hat: pick(HATS, 71), hatColor: pick([0xff385c, 0x1f2a44, 0xffffff, 0xffd166], 43),
  };
}

/** 머리 크고 팔다리 짧은 치비 비율의 평상복 아바타 */
export class Avatar {
  group = new THREE.Group();
  pose: Pose = 'idle';
  /** 차례대로 갈 지점들. 마지막에 도착하면 비워진다 */
  path: THREE.Vector3[] = [];
  speed = 2.6;

  private body = new THREE.Group();
  private head = new THREE.Group();
  private hand = new THREE.Group();
  private prop: THREE.Object3D | null = null;
  private legs: THREE.Mesh[];
  private arms: THREE.Mesh[];
  private t = Math.random() * 10;
  private emote: Emote | null = null;
  private emoteUntil = 0;
  private blinkAt = 2 + Math.random() * 3;
  private eyes: THREE.Mesh[];

  constructor(public name: string, public outfit: Outfit) {
    this.group.add(this.body);
    const top = new THREE.MeshStandardMaterial({ color: outfit.top, roughness: 0.85 });
    const bottom = new THREE.MeshStandardMaterial({ color: outfit.bottom, roughness: 0.9 });
    const skin = new THREE.MeshStandardMaterial({ color: outfit.skin, roughness: 0.75 });
    const hairMat = new THREE.MeshStandardMaterial({ color: outfit.hair, roughness: 0.95 });
    const shoe = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.6 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a1c16, roughness: 0.6 });
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff });

    // 몸통: 짧고 둥글게
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.22, 8, 16), top);
    torso.position.y = 0.6; torso.castShadow = true;

    // 다리와 신발
    const legGeo = new THREE.CapsuleGeometry(0.1, 0.12, 4, 10);
    const lL = new THREE.Mesh(legGeo, bottom); lL.position.set(-0.13, 0.22, 0); lL.castShadow = true;
    const lR = lL.clone(); lR.position.x = 0.13;
    const shoeGeo = new THREE.SphereGeometry(0.12, 12, 8); shoeGeo.scale(1, 0.6, 1.25);
    const sL = new THREE.Mesh(shoeGeo, shoe); sL.position.set(0, -0.14, 0.04); lL.add(sL);
    lR.add(sL.clone());

    // 팔: 어깨에서 돌도록 지오메트리를 아래로 내린다
    const armGeo = new THREE.CapsuleGeometry(0.085, 0.16, 4, 10);
    armGeo.translate(0, -0.1, 0);
    const aL = new THREE.Mesh(armGeo, top); aL.position.set(-0.36, 0.76, 0);
    const aR = new THREE.Mesh(armGeo, top); aR.position.set(0.36, 0.76, 0);
    const handGeo = new THREE.SphereGeometry(0.075, 10, 8);
    const hL = new THREE.Mesh(handGeo, skin); hL.position.y = -0.24; aL.add(hL);
    aR.add(hL.clone());
    this.hand.position.set(0.3, 0.72, 0.3);

    // 머리: 크고 둥글게
    this.head.position.y = 1.2;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.37, 28, 20), skin);
    skull.scale.set(1, 0.96, 0.98); skull.castShadow = true;
    // 머리카락은 이마 위까지만 덮는다. 눈을 가리지 않게 적도 위에서 끝낸다
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.385, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.42), hairMat);
    hair.position.y = 0.03;
    // 뒤통수는 좀 더 내려오게
    const back = new THREE.Mesh(new THREE.SphereGeometry(0.385, 28, 12, Math.PI * 0.6, Math.PI * 0.8, Math.PI * 0.42, Math.PI * 0.2), hairMat);
    back.position.y = 0.03;
    const bang = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), hairMat);
    bang.position.set(0.1, 0.17, 0.3); bang.scale.set(1.5, 0.6, 0.6);
    bang.visible = outfit.hat === 'none';
    const earGeo = new THREE.SphereGeometry(0.07, 10, 8);
    const eL = new THREE.Mesh(earGeo, skin); eL.position.set(-0.36, -0.02, 0);
    const eR = eL.clone(); eR.position.x = 0.36;

    // 눈: 큼직한 타원 + 하이라이트
    const eyeGeo = new THREE.SphereGeometry(0.055, 12, 10); eyeGeo.scale(1, 1.35, 0.5);
    const eyeL = new THREE.Mesh(eyeGeo, dark); eyeL.position.set(-0.13, 0.0, 0.345);
    const eyeR = eyeL.clone(); eyeR.position.x = 0.13;
    const glintGeo = new THREE.SphereGeometry(0.018, 8, 6);
    const gL = new THREE.Mesh(glintGeo, white); gL.position.set(0.018, 0.028, 0.03); eyeL.add(gL);
    eyeR.add(gL.clone());
    // 볼터치와 미소
    const blush = new THREE.MeshBasicMaterial({ color: 0xffa3a3, transparent: true, opacity: 0.75 });
    const bL = new THREE.Mesh(new THREE.CircleGeometry(0.055, 12), blush); bL.position.set(-0.23, -0.1, 0.285); bL.rotation.y = -0.7;
    const bR = bL.clone(); bR.position.x = 0.23; bR.rotation.y = 0.7;
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.011, 6, 12, Math.PI), dark);
    smile.position.set(0, -0.11, 0.35); smile.rotation.z = Math.PI;

    this.head.add(skull, hair, back, bang, eL, eR, eyeL, eyeR, bL, bR, smile);

    if (outfit.hat === 'cap') {
      const capMat = new THREE.MeshStandardMaterial({ color: outfit.hatColor, roughness: 0.8 });
      const crown = new THREE.Mesh(new THREE.SphereGeometry(0.395, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.48), capMat);
      crown.position.y = 0.04;
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.035, 20, 1, false, -Math.PI * 0.55, Math.PI * 1.1), capMat);
      brim.position.set(0, 0.12, 0.2); brim.scale.set(1, 1, 1.2);
      this.head.add(crown, brim);
    } else if (outfit.hat === 'beanie') {
      const beanieMat = new THREE.MeshStandardMaterial({ color: outfit.hatColor, roughness: 1 });
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.4, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), beanieMat);
      dome.position.y = 0.06;
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.37, 0.05, 8, 24), beanieMat);
      band.rotation.x = Math.PI / 2; band.position.y = 0.08;
      const pom = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }));
      pom.position.y = 0.46;
      this.head.add(dome, band, pom);
    }

    this.body.add(torso, lL, lR, aL, aR, this.hand, this.head);
    this.legs = [lL, lR];
    this.arms = [aL, aR];
    this.eyes = [eyeL, eyeR];
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
    this.body.rotation.set(0, 0, 0);
    this.legs.forEach(l => { l.rotation.x = 0; l.position.z = 0; l.position.y = 0.22; });
    this.arms.forEach(a => { a.rotation.set(0, 0, 0); });
    if (p === 'sit') {
      this.body.position.y = -0.3;
      this.legs.forEach(l => { l.rotation.x = -Math.PI / 2; l.position.z = 0.18; l.position.y = 0.3; });
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
      const s = Math.sin(this.t * 12);
      this.body.position.y = Math.abs(s) * 0.06;
      this.body.rotation.z = Math.sin(this.t * 6) * 0.05;
      this.legs[0].rotation.x = s * 0.8;
      this.legs[1].rotation.x = -s * 0.8;
      this.arms[0].rotation.x = -s * 0.6;
      this.arms[1].rotation.x = s * 0.6;
      this.head.rotation.z = Math.sin(this.t * 6) * 0.06;
    } else if (this.pose === 'idle') {
      this.body.position.y = Math.sin(this.t * 2) * 0.015;
      this.head.rotation.z = Math.sin(this.t * 0.9) * 0.05;
      this.head.rotation.y = Math.sin(this.t * 0.6) * 0.15;
    } else if (this.pose === 'sit') {
      this.body.position.y = -0.3 + Math.sin(this.t * 1.8) * 0.012;
      this.head.rotation.y = Math.sin(this.t * 0.5) * 0.12;
    }

    // 깜빡임
    if (this.t > this.blinkAt) {
      const k = this.t - this.blinkAt;
      const sy = k < 0.18 ? Math.max(0.1, 1 - Math.sin((k / 0.18) * Math.PI)) : 1;
      this.eyes.forEach(e => { e.scale.y = sy; });
      if (k > 0.2) { this.eyes.forEach(e => { e.scale.y = 1; }); this.blinkAt = this.t + 2.5 + Math.random() * 3.5; }
    }

    if (this.emote) {
      if (this.t > this.emoteUntil) {
        this.emote = null;
        this.arms[1].rotation.set(0, 0, 0);
        this.hand.position.set(0.3, 0.72, 0.3);
      } else if (this.emote === 'wave') {
        this.arms[1].rotation.z = -2.5;
        this.arms[1].rotation.x = Math.sin(this.t * 14) * 0.5;
        this.head.rotation.z = -0.12;
      } else {
        this.arms[1].rotation.x = -2.2;
        this.hand.position.set(0.34, 1.12, 0.22);
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
