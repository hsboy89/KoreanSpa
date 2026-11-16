import * as THREE from 'three';
import { BRAND_PINK } from './rooms';

/**
 * 라운지 바깥 세상: 구름 위에 떠 있는 섬.
 * 잔디 섬 위에 라운지가 있고, 아래로 구름바다가 펼쳐진다. 멀리 작은 섬과 열기구가 떠 있다.
 * 전부 장식이라 충돌이나 클릭 대상이 아니다.
 */
export const HORIZON_COLOR = 0xfbe9e2;

/** 건물(광장 + 방)이 차지하는 범위. 이 안에는 아무것도 심지 않는다 */
const BUILDING = { halfX: 21.5, halfZ: 17.5 };
const ISLAND_RADIUS = 32;
/** 구름바다 윗면의 높이 */
const CLOUD_SEA_Y = -5;

/** 매번 같은 풍경이 나오도록 고정된 난수 */
function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function skyTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 512;
  const g = c.getContext('2d')!;
  // 위쪽 절반이 하늘, 가운데가 지평선
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#3f7fd9');
  grad.addColorStop(0.25, '#6fb0ee');
  grad.addColorStop(0.4, '#b9dcf7');
  grad.addColorStop(0.47, '#ffe3d3');
  grad.addColorStop(0.5, '#fbe9e2');
  grad.addColorStop(1, '#fbe9e2');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const outsideBuilding = (x: number, z: number, margin: number) =>
  Math.abs(x) > BUILDING.halfX + margin || Math.abs(z) > BUILDING.halfZ + margin;

/** @returns 매 프레임 부를 갱신 함수 */
export function buildBackdrop(scene: THREE.Scene): (dt: number) => void {
  const rand = seeded(20261116);
  const root = new THREE.Group();
  root.name = 'backdrop';
  scene.add(root);

  scene.background = new THREE.Color(HORIZON_COLOR);
  scene.fog = new THREE.Fog(HORIZON_COLOR, 90, 300);

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), color = new THREE.Color();
  const UP = THREE.Object3D.DEFAULT_UP;

  // ── 하늘과 해
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(380, 32, 24),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false, toneMapped: false, depthWrite: false }),
  );
  sky.renderOrder = -10;
  root.add(sky);

  const sun = new THREE.Group();
  const glow = new THREE.Mesh(new THREE.CircleGeometry(34, 40), new THREE.MeshBasicMaterial({ color: 0xfff3d0, transparent: true, opacity: 0.35, fog: false, toneMapped: false, depthWrite: false }));
  const disc = new THREE.Mesh(new THREE.CircleGeometry(15, 40), new THREE.MeshBasicMaterial({ color: 0xfffbe8, fog: false, toneMapped: false, depthWrite: false }));
  disc.position.z = 0.5;
  sun.add(glow, disc);
  sun.position.set(150, 95, -290);
  sun.lookAt(0, 0, 0);
  root.add(sun);

  // ── 떠 있는 섬: 잔디 윗면, 흙 테두리, 아래로 뾰족한 바위
  const lawn = new THREE.Mesh(new THREE.CircleGeometry(ISLAND_RADIUS, 64), new THREE.MeshStandardMaterial({ color: 0x7cc071, roughness: 1 }));
  lawn.rotation.x = -Math.PI / 2; lawn.position.y = -0.04; lawn.receiveShadow = true;
  const path = new THREE.Mesh(new THREE.RingGeometry(ISLAND_RADIUS - 2.4, ISLAND_RADIUS - 0.9, 64), new THREE.MeshStandardMaterial({ color: 0xf1e6d6, roughness: 1 }));
  path.rotation.x = -Math.PI / 2; path.position.y = -0.03;
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(ISLAND_RADIUS, ISLAND_RADIUS - 1.5, 3, 64, 1, true), new THREE.MeshStandardMaterial({ color: 0x9a7453, roughness: 1 }));
  rim.position.y = -1.54;
  const rock = new THREE.Mesh(new THREE.ConeGeometry(ISLAND_RADIUS - 1.5, 30, 11), new THREE.MeshStandardMaterial({ color: 0x86654c, roughness: 1, flatShading: true }));
  rock.rotation.x = Math.PI; rock.position.y = -18;
  root.add(lawn, path, rim, rock);

  // ── 나무와 덤불
  const TREES = 30;
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.22, 1.2, 7), new THREE.MeshStandardMaterial({ color: 0x7a5638, roughness: 1 }), TREES);
  const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true }), TREES);
  const greens = [0x4f9a58, 0x67b35f, 0x3f8a5c, 0x86c26a, 0xf29fb5];
  for (let i = 0; i < TREES; i++) {
    let x = 0, z = 0;
    do {
      const r = 23 + rand() * (ISLAND_RADIUS - 26), a = rand() * Math.PI * 2;
      x = Math.cos(a) * r; z = Math.sin(a) * r;
    } while (!outsideBuilding(x, z, 1.6));
    const s = 0.7 + rand() * 0.6;
    trunks.setMatrixAt(i, m.compose(new THREE.Vector3(x, 0.6 * s, z), q.identity(), new THREE.Vector3(s, s, s)));
    crowns.setMatrixAt(i, m.compose(new THREE.Vector3(x, 2.3 * s, z), q.setFromAxisAngle(UP, rand() * 6), new THREE.Vector3(1.25 * s, 1.5 * s, 1.25 * s)));
    // 가끔 분홍 꽃나무를 섞는다
    crowns.setColorAt(i, color.setHex(greens[rand() < 0.16 ? 4 : Math.floor(rand() * 4)]));
  }
  root.add(trunks, crowns);

  const BUSHES = 34;
  const bushes = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.6, 1), new THREE.MeshStandardMaterial({ color: 0x5aa462, roughness: 1, flatShading: true }), BUSHES);
  for (let i = 0; i < BUSHES; i++) {
    // 건물 벽 바로 바깥을 따라 놓는다
    const side = Math.floor(rand() * 4), along = rand() * 2 - 1, off = 1.2 + rand() * 1.6;
    const x = side < 2 ? along * BUILDING.halfX : (side === 2 ? -1 : 1) * (BUILDING.halfX + off);
    const z = side < 2 ? (side === 0 ? -1 : 1) * (BUILDING.halfZ + off) : along * BUILDING.halfZ;
    const s = 0.7 + rand() * 0.8;
    bushes.setMatrixAt(i, m.compose(new THREE.Vector3(x, 0.3 * s, z), q.identity(), new THREE.Vector3(s * 1.3, s, s * 1.3)));
  }
  root.add(bushes);

  // ── 산책로 가로등
  const LAMPS = 14;
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.09, 3.2, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }), LAMPS);
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.28, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffe9bd, toneMapped: false }), LAMPS);
  for (let i = 0; i < LAMPS; i++) {
    const a = (i / LAMPS) * Math.PI * 2 + 0.2, r = ISLAND_RADIUS - 1.6;
    poles.setMatrixAt(i, m.compose(new THREE.Vector3(Math.cos(a) * r, 1.6, Math.sin(a) * r), q.identity(), new THREE.Vector3(1, 1, 1)));
    bulbs.setMatrixAt(i, m.compose(new THREE.Vector3(Math.cos(a) * r, 3.3, Math.sin(a) * r), q, new THREE.Vector3(1, 1, 1)));
  }
  root.add(poles, bulbs);

  // ── 구름바다: 바닥 한 장 위에 뭉게구름을 빽빽하게 깐다
  const seaBase = new THREE.Mesh(new THREE.CircleGeometry(400, 48), new THREE.MeshBasicMaterial({ color: 0xfdf3ef }));
  seaBase.rotation.x = -Math.PI / 2; seaBase.position.y = CLOUD_SEA_Y - 3;
  root.add(seaBase);
  const PUFFS = 480;
  const puffGeo = new THREE.IcosahedronGeometry(1, 2);
  const sea = new THREE.InstancedMesh(puffGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xfff4f0, emissiveIntensity: 0.8 }), PUFFS);
  const tints = [0xffffff, 0xfff6f2, 0xffeef0, 0xf4f7ff];
  for (let i = 0; i < PUFFS; i++) {
    // 섬 가까이는 낮고 촘촘하게(잔디를 덮지 않게), 멀어질수록 크고 높게
    const k = rand();
    const r = ISLAND_RADIUS + 4 + k * k * 250, a = rand() * Math.PI * 2;
    const w = 9 + rand() * 10 + k * 16, h = 2.2 + rand() * 1.6 + k * 6;
    sea.setMatrixAt(i, m.compose(
      new THREE.Vector3(Math.cos(a) * r, CLOUD_SEA_Y + rand() * 1.5, Math.sin(a) * r),
      q.setFromAxisAngle(UP, rand() * 6),
      new THREE.Vector3(w, h, w * (0.7 + rand() * 0.5)),
    ));
    sea.setColorAt(i, color.setHex(tints[Math.floor(rand() * tints.length)]));
  }
  root.add(sea);

  // ── 하늘에 떠가는 구름
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, fog: false, depthWrite: false });
  const clouds: { group: THREE.Group; speed: number }[] = [];
  for (let i = 0; i < 10; i++) {
    const group = new THREE.Group();
    for (let k = 0; k < 5; k++) {
      const p = new THREE.Mesh(puffGeo, cloudMat);
      p.position.set((k - 2) * 5 + rand() * 2, rand() * 2, rand() * 3);
      p.scale.set(5 + rand() * 4, 2.2 + rand() * 1.6, 4 + rand() * 2);
      group.add(p);
    }
    const a = rand() * Math.PI * 2, r = 120 + rand() * 90;
    group.position.set(Math.cos(a) * r, 30 + rand() * 45, Math.sin(a) * r);
    group.rotation.y = rand() * Math.PI;
    root.add(group);
    clouds.push({ group, speed: 0.004 + rand() * 0.006 });
  }

  // ── 멀리 떠 있는 작은 섬들
  const isletTop = new THREE.MeshStandardMaterial({ color: 0x7cc071, roughness: 1 });
  const isletRock = new THREE.MeshStandardMaterial({ color: 0x86654c, roughness: 1, flatShading: true });
  const isletTree = new THREE.MeshStandardMaterial({ color: 0x4f9a58, roughness: 1, flatShading: true });
  const floaters: { obj: THREE.Object3D; baseY: number; phase: number; amp: number; sway: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const islet = new THREE.Group();
    const r = 4 + rand() * 5;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.9, 0.8, 9), isletTop);
    const under = new THREE.Mesh(new THREE.ConeGeometry(r * 0.9, r * 1.8, 7), isletRock);
    under.rotation.x = Math.PI; under.position.y = -0.4 - r * 0.9;
    islet.add(top, under);
    for (let k = 0; k < 2 + Math.floor(rand() * 3); k++) {
      const tree = new THREE.Mesh(new THREE.ConeGeometry(0.9 + rand() * 0.6, 2.6 + rand() * 1.6, 6), isletTree);
      tree.position.set((rand() - 0.5) * r, 1.8, (rand() - 0.5) * r);
      islet.add(tree);
    }
    const a = (i / 7) * Math.PI * 2 + rand() * 0.5, d = 75 + rand() * 70;
    const baseY = -2 + rand() * 20;
    islet.position.set(Math.cos(a) * d, baseY, Math.sin(a) * d);
    root.add(islet);
    floaters.push({ obj: islet, baseY, phase: rand() * 6, amp: 0.8, sway: 0 });
  }

  // ── 열기구
  const stripe = [BRAND_PINK, 0xffd166, 0x8ecae6, 0xffffff];
  for (let i = 0; i < 4; i++) {
    const airship = new THREE.Group();
    const envelope = new THREE.Mesh(new THREE.SphereGeometry(5, 16, 12), new THREE.MeshStandardMaterial({ color: stripe[i % stripe.length], roughness: 0.6 }));
    envelope.scale.y = 1.2;
    const band = new THREE.Mesh(new THREE.TorusGeometry(4.95, 0.45, 8, 24), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }));
    band.rotation.x = Math.PI / 2;
    const basket = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.4, 1.8), new THREE.MeshStandardMaterial({ color: 0x9a7453, roughness: 1 }));
    basket.position.y = -8.4;
    airship.add(envelope, band, basket);
    const a = (i / 4) * Math.PI * 2 + 0.9 + rand() * 0.6, d = 70 + rand() * 50;
    const baseY = 16 + rand() * 22;
    airship.position.set(Math.cos(a) * d, baseY, Math.sin(a) * d);
    root.add(airship);
    floaters.push({ obj: airship, baseY, phase: rand() * 6, amp: 1.6, sway: 0 });
  }

  // ── 풍선
  const balloonColors = [BRAND_PINK, 0xffffff, 0xffd166, 0xff8fab, 0x8ecae6];
  const balloonGeo = new THREE.SphereGeometry(0.55, 16, 12);
  balloonGeo.scale(1, 1.2, 1);
  const stringGeo = new THREE.CylinderGeometry(0.012, 0.012, 1.6, 4);
  stringGeo.translate(0, -1.45, 0);
  const stringMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (let i = 0; i < 22; i++) {
    let x = 0, z = 0;
    do {
      const r = 20 + rand() * 20, a = rand() * Math.PI * 2;
      x = Math.cos(a) * r; z = Math.sin(a) * r;
    } while (!outsideBuilding(x, z, 1.2));
    const mesh = new THREE.Mesh(balloonGeo, new THREE.MeshStandardMaterial({ color: balloonColors[i % balloonColors.length], roughness: 0.35 }));
    mesh.add(new THREE.Mesh(stringGeo, stringMat));
    const baseY = 4 + rand() * 9;
    mesh.position.set(x, baseY, z);
    root.add(mesh);
    floaters.push({ obj: mesh, baseY, phase: rand() * 6, amp: 0.45, sway: 0.03 + rand() * 0.04 });
  }

  let t = 0;
  return dt => {
    t += dt;
    for (const f of floaters) {
      f.obj.position.y = f.baseY + Math.sin(t * 0.6 + f.phase) * f.amp;
      if (f.sway) f.obj.rotation.z = Math.sin(t * 0.5 + f.phase) * f.sway;
    }
    for (const c of clouds) {
      // 하늘을 아주 천천히 돈다
      const p = c.group.position, a = c.speed * dt;
      const x = p.x * Math.cos(a) - p.z * Math.sin(a);
      p.z = p.x * Math.sin(a) + p.z * Math.cos(a);
      p.x = x;
    }
  };
}
