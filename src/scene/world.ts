import * as THREE from 'three';

export interface Spot { pos: THREE.Vector3; yaw: number }

export interface World {
  floor: THREE.Mesh;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** 매트 중심. 머리는 -z 쪽 목침을 향한다 */
  mats: Spot[];
  saunaCenter: THREE.Vector3;
  saunaRadius: number;
  /** 불가마 들어가기 전 서는 자리 */
  saunaDoor: THREE.Vector3;
  /** 불가마 안 자리. [0]이 플레이어, 나머지는 봇 */
  saunaSeats: Spot[];
  /** 매점 앞 서는 자리 */
  counter: THREE.Vector3;
  counterBox: THREE.Box3;
  /** 장작더미 앞 서는 자리 */
  woodpile: THREE.Vector3;
  fire: FireVisual;
  dome: THREE.Mesh;
  doorGlow: THREE.Mesh;
}

const ROOM_W = 26;
const ROOM_D = 18;
const ROOM_H = 4.2;

function plankTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#b4854f';
  g.fillRect(0, 0, 512, 512);
  const rows = 8;
  const h = 512 / rows;
  for (let r = 0; r < rows; r++) {
    const shade = 0.9 + Math.random() * 0.18;
    g.fillStyle = `rgb(${Math.round(182 * shade)},${Math.round(134 * shade)},${Math.round(80 * shade)})`;
    g.fillRect(0, r * h, 512, h - 2);
    g.strokeStyle = 'rgba(80,50,25,0.16)';
    g.lineWidth = 1;
    for (let i = 0; i < 12; i++) {
      const y = r * h + Math.random() * h;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(170, y + (Math.random() - 0.5) * 6, 340, y + (Math.random() - 0.5) * 6, 512, y);
      g.stroke();
    }
    g.fillStyle = 'rgba(60,35,15,0.55)';
    g.fillRect((r % 2) * 256 + Math.random() * 50, r * h, 2, h - 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(7, 5);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function textTexture(text: string, w: number, h: number, bg: string, fg: string, font: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8);
  g.fillStyle = fg;
  g.font = font;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function flameTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,200,120,0.9)');
  grad.addColorStop(0.7, 'rgba(255,110,30,0.35)');
  grad.addColorStop(1, 'rgba(255,60,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Flame { s: THREE.Sprite; life: number; speed: number; r: number; a: number }

export class FireVisual {
  group = new THREE.Group();
  light: THREE.PointLight;
  private ember: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  private flames: Flame[] = [];
  private fuel = 1;
  private t = 0;

  constructor() {
    const logGeo = new THREE.CylinderGeometry(0.09, 0.11, 1.1, 8);
    const logMat = new THREE.MeshStandardMaterial({ color: 0x4a2f1c, roughness: 1 });
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(logGeo, logMat);
      m.rotation.z = Math.PI / 2;
      m.rotation.y = i * Math.PI / 3;
      m.position.y = 0.11;
      m.castShadow = true;
      this.group.add(m);
    }
    this.ember = new THREE.Mesh(new THREE.CircleGeometry(0.55, 24), new THREE.MeshBasicMaterial({ color: 0xff5a1a, transparent: true, opacity: 0.8 }));
    this.ember.rotation.x = -Math.PI / 2;
    this.ember.position.y = 0.02;
    this.group.add(this.ember);

    this.light = new THREE.PointLight(0xff8c3a, 30, 14, 2);
    this.light.position.y = 0.9;
    this.group.add(this.light);

    const tex = flameTexture();
    for (let i = 0; i < 48; i++) {
      const mat = new THREE.SpriteMaterial({ map: tex, color: 0xffa040, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      const s = new THREE.Sprite(mat);
      this.group.add(s);
      this.flames.push({ s, life: Math.random(), speed: 0.8 + Math.random() * 0.7, r: Math.random(), a: Math.random() * Math.PI * 2 });
    }
  }

  update(dt: number, fuel: number) {
    this.fuel += (fuel - this.fuel) * Math.min(1, dt * 2);
    this.t += dt;
    const f = this.fuel;
    const flicker = 0.85 + 0.15 * Math.sin(this.t * 17) * Math.sin(this.t * 7.3);
    this.light.intensity = (1.5 + 40 * f) * flicker;
    this.ember.material.opacity = 0.2 + 0.65 * f;
    const active = Math.round(5 + 43 * f);
    this.flames.forEach((p, i) => {
      if (i >= active) { p.s.visible = false; return; }
      p.s.visible = true;
      p.life += dt * p.speed * (0.6 + f * 0.6);
      if (p.life > 1) { p.life = 0; p.r = Math.random(); p.a = Math.random() * Math.PI * 2; }
      const rad = p.r * (0.1 + 0.32 * f) * (1 - p.life * 0.6);
      const h = p.life * (0.45 + 1.35 * f);
      p.s.position.set(Math.cos(p.a) * rad + Math.sin(this.t * 3 + p.a) * 0.05, 0.14 + h, Math.sin(p.a) * rad);
      const sc = (0.3 + 0.55 * f) * (1 - p.life) + 0.05;
      p.s.scale.set(sc, sc * 1.4, 1);
      const mat = p.s.material;
      mat.opacity = (1 - p.life) * (0.45 + 0.55 * f);
      mat.color.setHSL(0.085 - p.life * 0.06, 1, 0.55 + (1 - p.life) * 0.2);
    });
  }
}

export function buildWorld(scene: THREE.Scene): World {
  const wood = new THREE.MeshStandardMaterial({ color: 0x7a5236, roughness: 0.85 });
  const woodLight = new THREE.MeshStandardMaterial({ color: 0xc19a66, roughness: 0.8 });
  const hwangto = new THREE.MeshStandardMaterial({ color: 0xcfa67c, roughness: 0.98 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf2ece0, roughness: 0.9 });

  // 바닥
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, ROOM_D), new THREE.MeshStandardMaterial({ map: plankTexture(), roughness: 0.82 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // 벽과 천장
  const wallGeoW = new THREE.PlaneGeometry(ROOM_W, ROOM_H);
  const wallGeoD = new THREE.PlaneGeometry(ROOM_D, ROOM_H);
  const walls: [THREE.PlaneGeometry, THREE.Vector3, number][] = [
    [wallGeoW, new THREE.Vector3(0, ROOM_H / 2, -ROOM_D / 2), 0],
    [wallGeoW, new THREE.Vector3(0, ROOM_H / 2, ROOM_D / 2), Math.PI],
    [wallGeoD, new THREE.Vector3(-ROOM_W / 2, ROOM_H / 2, 0), Math.PI / 2],
    [wallGeoD, new THREE.Vector3(ROOM_W / 2, ROOM_H / 2, 0), -Math.PI / 2],
  ];
  for (const [geo, pos, ry] of walls) {
    const w = new THREE.Mesh(geo, hwangto);
    w.position.copy(pos); w.rotation.y = ry; w.receiveShadow = true;
    scene.add(w);
    // 아래쪽 나무 징두리
    const len = geo === wallGeoW ? ROOM_W : ROOM_D;
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(len, 1.0, 0.08), wood);
    skirt.position.copy(pos); skirt.position.y = 0.5; skirt.rotation.y = ry;
    skirt.translateZ(0.04);
    scene.add(skirt);
  }
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, ROOM_D), new THREE.MeshStandardMaterial({ color: 0x3d2f26, roughness: 1 }));
  ceiling.rotation.x = Math.PI / 2; ceiling.position.y = ROOM_H;
  scene.add(ceiling);
  // 천장 서까래
  for (let x = -ROOM_W / 2 + 2; x < ROOM_W / 2; x += 4) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, ROOM_D), wood);
    beam.position.set(x, ROOM_H - 0.13, 0);
    scene.add(beam);
  }

  // 펜던트 조명
  const lampPositions = [[-1.5, -4], [5, -4], [-3, 5], [5, 4], [10.5, 0], [-11, 5.5]];
  const shadeMat = new THREE.MeshStandardMaterial({ color: 0xe8d9b8, roughness: 0.9, side: THREE.DoubleSide });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe3b0 });
  lampPositions.forEach(([x, z], i) => {
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.0, 6), new THREE.MeshStandardMaterial({ color: 0x1f1510 }));
    cord.position.set(x, ROOM_H - 0.5, z);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.34, 20, 1, true), shadeMat);
    shade.position.set(x, ROOM_H - 1.05, z);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), bulbMat);
    bulb.position.set(x, ROOM_H - 1.12, z);
    scene.add(cord, shade, bulb);
    if (i < 4) {
      const l = new THREE.PointLight(0xffc98a, 22, 16, 2);
      l.position.set(x, ROOM_H - 1.2, z);
      scene.add(l);
    }
  });

  // 간판
  const signBrand = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.0), new THREE.MeshStandardMaterial({ map: textTexture('온돌 찜질방', 680, 200, '#5c3b24', '#f3e2c0', '600 92px "Pretendard Variable", Pretendard, sans-serif'), roughness: 0.9 }));
  signBrand.position.set(6.5, 3.0, -ROOM_D / 2 + 0.05);
  scene.add(signBrand);

  // ───── 매트 ─────
  const mats: Spot[] = [];
  const matGeo = new THREE.BoxGeometry(0.95, 0.06, 1.95);
  const matMat = new THREE.MeshStandardMaterial({ color: 0x8c6644, roughness: 0.95 });
  const pillowGeo = new THREE.BoxGeometry(0.42, 0.15, 0.2);
  for (const x of [2.5, 5.5, 8.5, 11.5]) {
    for (const z of [-5.5, -1.5, 2.5]) {
      const m = new THREE.Mesh(matGeo, matMat);
      m.position.set(x, 0.03, z);
      m.receiveShadow = true;
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.97, 0.062, 0.12), woodLight);
      stripe.position.set(x, 0.03, z + 0.6);
      const pillow = new THREE.Mesh(pillowGeo, woodLight);
      pillow.position.set(x, 0.135, z - 0.78);
      pillow.castShadow = true;
      scene.add(m, stripe, pillow);
      mats.push({ pos: new THREE.Vector3(x, 0, z), yaw: 0 });
    }
  }

  // ───── 불가마 ─────
  const saunaCenter = new THREE.Vector3(-7, 0, -3.5);
  const saunaRadius = 3.3;
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(saunaRadius, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x9a6a48, roughness: 0.97, transparent: true, opacity: 1, side: THREE.DoubleSide }),
  );
  dome.position.copy(saunaCenter);
  dome.castShadow = true; dome.receiveShadow = true;
  scene.add(dome);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(saunaRadius + 0.25, saunaRadius + 0.35, 0.22, 48), new THREE.MeshStandardMaterial({ color: 0x5a4a40, roughness: 1 }));
  base.position.set(saunaCenter.x, 0.11, saunaCenter.z);
  base.receiveShadow = true;
  scene.add(base);
  // 돌 띠 장식
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x6d5a4c, roughness: 1 });
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), stoneMat);
    s.position.set(saunaCenter.x + Math.cos(a) * (saunaRadius - 0.05), 0.35, saunaCenter.z + Math.sin(a) * (saunaRadius - 0.05));
    s.scale.set(1, 0.7, 1.2);
    scene.add(s);
  }
  // 입구
  const doorZ = saunaCenter.z + saunaRadius;
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x3a2619, roughness: 0.9 });
  const postL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.9, 0.5), frameMat); postL.position.set(saunaCenter.x - 0.75, 0.95, doorZ - 0.1);
  const postR = postL.clone(); postR.position.x = saunaCenter.x + 0.75;
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.26, 0.5), frameMat); lintel.position.set(saunaCenter.x, 1.95, doorZ - 0.1);
  scene.add(postL, postR, lintel);
  const doorGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.75), new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.6 }));
  doorGlow.position.set(saunaCenter.x, 0.9, doorZ - 0.3);
  scene.add(doorGlow);
  const signSauna = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.42), new THREE.MeshStandardMaterial({ map: textTexture('불가마', 450, 126, '#2d1b10', '#ffb46b', '600 74px "Pretendard Variable", Pretendard, sans-serif'), roughness: 0.9 }));
  signSauna.position.set(saunaCenter.x, 2.35, doorZ + 0.16);
  scene.add(signSauna);

  const fire = new FireVisual();
  fire.group.position.copy(saunaCenter);
  scene.add(fire.group);
  // 불가마 안 돌 벤치
  const bench = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.22, 10, 40), stoneMat);
  bench.rotation.x = Math.PI / 2; bench.position.set(saunaCenter.x, 0.22, saunaCenter.z);
  scene.add(bench);
  const saunaSeats: Spot[] = [
    { pos: new THREE.Vector3(saunaCenter.x, 0.2, saunaCenter.z + 1.75), yaw: Math.PI },
    { pos: new THREE.Vector3(saunaCenter.x - 1.75, 0.2, saunaCenter.z), yaw: Math.PI / 2 },
    { pos: new THREE.Vector3(saunaCenter.x + 1.5, 0.2, saunaCenter.z - 0.9), yaw: -Math.PI * 0.7 },
  ];
  const saunaDoor = new THREE.Vector3(saunaCenter.x, 0, doorZ + 0.9);

  // ───── 장작더미 ─────
  const woodpileCenter = new THREE.Vector3(-11, 0, 1.6);
  const logGeo = new THREE.CylinderGeometry(0.13, 0.13, 1.2, 9);
  const logMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 1 });
  const stack = [[0, 0.13], [0.3, 0.13], [-0.3, 0.13], [0.15, 0.36], [-0.15, 0.36], [0, 0.59]];
  for (const [ox, y] of stack) {
    const l = new THREE.Mesh(logGeo, logMat);
    l.rotation.z = Math.PI / 2; l.rotation.y = Math.PI / 2;
    l.position.set(woodpileCenter.x + ox, y, woodpileCenter.z);
    l.castShadow = true;
    scene.add(l);
  }
  const woodpile = new THREE.Vector3(woodpileCenter.x + 1.1, 0, woodpileCenter.z);

  // ───── 매점 ─────
  const counterCenter = new THREE.Vector3(3, 0, 7.7);
  const counterBody = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.0, 0.9), wood);
  counterBody.position.set(counterCenter.x, 0.5, counterCenter.z); counterBody.castShadow = true; counterBody.receiveShadow = true;
  const counterTop = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.08, 1.05), woodLight);
  counterTop.position.set(counterCenter.x, 1.04, counterCenter.z);
  scene.add(counterBody, counterTop);
  const cooler = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.62, 0.6), new THREE.MeshStandardMaterial({ color: 0x3e6ea8, roughness: 0.5 }));
  cooler.position.set(counterCenter.x - 1.4, 1.39, counterCenter.z); cooler.castShadow = true;
  const coolerLid = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.08, 0.64), white);
  coolerLid.position.set(counterCenter.x - 1.4, 1.74, counterCenter.z);
  scene.add(cooler, coolerLid);
  const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.3, 0.24, 18, 1, true), new THREE.MeshStandardMaterial({ color: 0xb08a55, roughness: 1, side: THREE.DoubleSide }));
  basket.position.set(counterCenter.x + 1.3, 1.2, counterCenter.z);
  scene.add(basket);
  const eggMat = new THREE.MeshStandardMaterial({ color: 0x7a4a2c, roughness: 0.7 });
  for (let i = 0; i < 9; i++) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), eggMat);
    const a = (i / 9) * Math.PI * 2;
    const r = i < 6 ? 0.2 : 0.07;
    e.position.set(counterCenter.x + 1.3 + Math.cos(a) * r, 1.17 + (i >= 6 ? 0.1 : 0), counterCenter.z + Math.sin(a) * r);
    e.scale.set(1, 1.2, 1);
    scene.add(e);
  }
  const signShop = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.7), new THREE.MeshStandardMaterial({ map: textTexture('매점 · 식혜 · 맥반석 계란', 900, 196, '#f0e0c0', '#4a2e1c', '600 72px "Pretendard Variable", Pretendard, sans-serif'), roughness: 0.9 }));
  signShop.position.set(counterCenter.x, 2.5, ROOM_D / 2 - 0.05); signShop.rotation.y = Math.PI;
  scene.add(signShop);
  const counter = new THREE.Vector3(counterCenter.x, 0, counterCenter.z - 1.35);
  const counterBox = new THREE.Box3(
    new THREE.Vector3(counterCenter.x - 2.8, 0, counterCenter.z - 0.9),
    new THREE.Vector3(counterCenter.x + 2.8, 2, ROOM_D / 2),
  );

  // 화분 몇 개
  const potMat = new THREE.MeshStandardMaterial({ color: 0x8a5a3c, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x4e7a3a, roughness: 0.9 });
  for (const [x, z] of [[-12.2, -8.2], [12.2, 8.2], [12.2, -8.2]]) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.24, 0.5, 12), potMat);
    pot.position.set(x, 0.25, z);
    const leaves = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), leafMat);
    leaves.position.set(x, 0.95, z); leaves.scale.set(1, 1.3, 1); leaves.castShadow = true;
    scene.add(pot, leaves);
  }

  return {
    floor,
    bounds: { minX: -ROOM_W / 2 + 0.7, maxX: ROOM_W / 2 - 0.7, minZ: -ROOM_D / 2 + 0.7, maxZ: ROOM_D / 2 - 0.7 },
    mats,
    saunaCenter, saunaRadius, saunaDoor, saunaSeats,
    counter, counterBox,
    woodpile,
    fire, dome, doorGlow,
  };
}
