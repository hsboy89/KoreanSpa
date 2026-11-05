import * as THREE from 'three';

export type Pose = 'idle' | 'walk' | 'sit' | 'lie';

const SKIN = 0xf1c9a5;

/** 찜질복 입고 양머리 수건 쓴 절차적 아바타 */
export class Avatar {
  group = new THREE.Group();
  pose: Pose = 'idle';
  target: THREE.Vector3 | null = null;
  speed = 2.4;

  private body = new THREE.Group();
  private towel = new THREE.Group();
  private hair: THREE.Mesh;
  private hand = new THREE.Group();
  private prop: THREE.Object3D | null = null;
  private legs: THREE.Mesh[];
  private arms: THREE.Mesh[];
  private t = Math.random() * 10;

  constructor(public name: string, robeColor: number, towelOn: boolean) {
    this.group.add(this.body);
    const robe = new THREE.MeshStandardMaterial({ color: robeColor, roughness: 0.9 });
    const skin = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.7 });
    const white = new THREE.MeshStandardMaterial({ color: 0xf7f2e8, roughness: 1 });

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.5, 6, 14), robe);
    torso.position.y = 0.66; torso.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 20, 16), skin);
    head.position.y = 1.22; head.castShadow = true;

    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x2b1d14 });
    const eL = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), eyeMat);
    eL.position.set(-0.08, 1.24, 0.215);
    const eR = eL.clone(); eR.position.x = 0.08;
    const blushMat = new THREE.MeshBasicMaterial({ color: 0xf0a08c });
    const bL = new THREE.Mesh(new THREE.CircleGeometry(0.035, 10), blushMat);
    bL.position.set(-0.15, 1.17, 0.19); bL.rotation.y = -0.6;
    const bR = bL.clone(); bR.position.x = 0.15; bR.rotation.y = 0.6;

    const legGeo = new THREE.CapsuleGeometry(0.09, 0.22, 4, 8);
    const lL = new THREE.Mesh(legGeo, robe); lL.position.set(-0.12, 0.22, 0); lL.castShadow = true;
    const lR = lL.clone(); lR.position.x = 0.12;
    const armGeo = new THREE.CapsuleGeometry(0.07, 0.3, 4, 8);
    const aL = new THREE.Mesh(armGeo, robe); aL.position.set(-0.37, 0.72, 0);
    const aR = aL.clone(); aR.position.x = 0.37;

    this.hand.position.set(0, 0.8, 0.38);

    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.13, 20), white);
    band.position.y = 1.38;
    const hL = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 12), white);
    hL.position.set(-0.23, 1.46, 0); hL.scale.set(1, 0.85, 1);
    const hR = hL.clone(); hR.position.x = 0.23;
    this.towel.add(band, hL, hR);
    this.towel.visible = towelOn;

    this.hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2.1),
      new THREE.MeshStandardMaterial({ color: 0x2d1e14, roughness: 1 }),
    );
    this.hair.position.y = 1.23;
    this.hair.visible = !towelOn;

    this.body.add(torso, head, eL, eR, bL, bR, lL, lR, aL, aR, this.hand, this.towel, this.hair);
    this.legs = [lL, lR];
    this.arms = [aL, aR];
  }

  hasTowel() { return this.towel.visible; }
  setTowel(on: boolean) { this.towel.visible = on; this.hair.visible = !on; }

  hold(obj: THREE.Object3D | null) {
    if (this.prop) this.hand.remove(this.prop);
    this.prop = obj;
    if (obj) this.hand.add(obj);
  }

  faceYaw(y: number) { this.group.rotation.y = y; }

  setPose(p: Pose) {
    this.pose = p;
    this.body.rotation.set(0, 0, 0);
    this.body.position.set(0, 0, 0);
    this.body.scale.set(1, 1, 1);
    this.legs.forEach(l => { l.rotation.x = 0; l.position.z = 0; l.position.y = 0.22; });
    this.arms.forEach(a => { a.rotation.x = 0; });
    if (p === 'lie') {
      this.body.rotation.x = -Math.PI / 2;
      this.body.position.y = 0.3;
      this.arms.forEach(a => { a.rotation.x = -0.15; });
    } else if (p === 'sit') {
      this.body.position.y = -0.28;
      this.legs.forEach(l => { l.rotation.x = -Math.PI / 2; l.position.z = 0.2; l.position.y = 0.26; });
    }
  }

  /** @returns 이번 프레임에 목표 지점에 도착했으면 true */
  update(dt: number): boolean {
    this.t += dt;
    let arrived = false;
    if (this.target) {
      const d = new THREE.Vector3().subVectors(this.target, this.group.position);
      d.y = 0;
      const dist = d.length();
      if (dist < 0.06) {
        this.group.position.x = this.target.x;
        this.group.position.z = this.target.z;
        this.target = null;
        arrived = true;
        if (this.pose === 'walk') this.setPose('idle');
      } else {
        const step = Math.min(dist, this.speed * dt);
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
    } else if (this.pose === 'lie') {
      this.body.scale.y = 1 + Math.sin(this.t * 1.6) * 0.015;
    } else if (this.pose === 'sit') {
      this.body.position.y = -0.28 + Math.sin(this.t * 1.8) * 0.01;
    }
    return arrived;
  }
}

export function eggProp(): THREE.Object3D {
  const e = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 10), new THREE.MeshStandardMaterial({ color: 0x7a4a2c, roughness: 0.7 }));
  e.scale.set(1, 1.2, 1);
  return e;
}

export function cupProp(): THREE.Object3D {
  const g = new THREE.Group();
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.17, 14), new THREE.MeshStandardMaterial({ color: 0xece2cc, roughness: 0.6 }));
  const top = new THREE.Mesh(new THREE.CircleGeometry(0.066, 14), new THREE.MeshStandardMaterial({ color: 0xd9b36a, roughness: 0.3 }));
  top.rotation.x = -Math.PI / 2; top.position.y = 0.082;
  g.add(cup, top);
  return g;
}

export function logProp(): THREE.Object3D {
  const l = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.8, 9), new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 1 }));
  l.rotation.z = Math.PI / 2;
  return l;
}
