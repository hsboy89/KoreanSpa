import * as THREE from 'three';
import { buildBackdrop } from './backdrop';
import {
  BRAND_PINK, DOOR_WIDTH, PLAZA, ROOM_LAYOUTS, WALL_HEIGHT, WALL_THICKNESS,
  type Rect, type RoomId, type RoomLayout,
} from './rooms';
import { QUIZ_HOUR } from '../state/quiz';
import { makeCounterBoard, makeDoorPlate, makeGuestbookBoard, makeQuizBoard, makeRankBoard, makeZoneTexture, makeInterestBoard, makeKioskTexture, makeSignTexture, makeStripesTexture, makeTotemFace, type LiveTexture } from './brand';

export interface Seat { pos: THREE.Vector3; yaw: number; room: RoomId | null }
export type Wall = Rect;
export interface Obstacle { x: number; z: number; r: number }

export interface RoomInfo {
  layout: RoomLayout;
  center: THREE.Vector3;
  /** 문 바로 안쪽 / 바깥쪽(광장) 지점. 방 사이를 오갈 때 경유한다 */
  doorIn: THREE.Vector3;
  doorOut: THREE.Vector3;
}

export interface World {
  /** 클릭 이동용 바닥들 */
  floors: THREE.Mesh[];
  walls: Wall[];
  obstacles: Obstacle[];
  seats: Seat[];
  rooms: Map<RoomId, RoomInfo>;
  /** 카메라와 내 캐릭터 사이에 끼면 반투명해지는 것들(벽, 명패) */
  occluders: THREE.Mesh[];
  spawn: THREE.Vector3;
  update(dt: number): void;
  /** 눌러서 쓰는 물건들. userData.action에 동작 이름이 있다 */
  interactives: THREE.Object3D[];
  /** 광장 벽 퀴즈 안내판의 아래 두 줄 */
  setQuizBoard(sub: string, names: string): void;
  /** 광장 바닥의 O/X 구역. correct를 주면 정답 쪽만 밝힌다 */
  setQuizZones(visible: boolean, correct?: boolean | null): void;
  /** 광장 전광판의 숫자. 처음 불릴 때 전광판과 키오스크가 나타난다 */
  setCounter(visits: number, today: number): void;
  /** 방 안내판 옆 "열리면 갈래요" 숫자 */
  setInterest(room: RoomId, n: number): void;
  /** 방 벽의 오늘의 순위판. rows는 [이름, 점수 표기]. 처음 불릴 때 나타난다 */
  setRanking(room: RoomId, title: string, rows: [string, string][]): void;
  /** 방명록 게시판에 붙일 최근 글. 처음 불릴 때 게시판이 나타난다 */
  setGuestbook(notes: string[]): void;
}

/** 앉았을 때 엉덩이가 의자 윗면에 오도록 하는 그룹 높이 */
export const SEAT_Y = 0.5;

/** 방의 로컬 축. U는 문이 난 벽과 평행, V는 문에서 안쪽(뒷벽) 방향 */
interface Frame { center: THREE.Vector3; U: THREE.Vector3; V: THREE.Vector3; halfU: number; halfV: number }

function frameOf(l: RoomLayout): Frame {
  const r = l.rect;
  const center = new THREE.Vector3((r.minX + r.maxX) / 2, 0, (r.minZ + r.maxZ) / 2);
  const w = r.maxX - r.minX, d = r.maxZ - r.minZ;
  switch (l.doorSide) {
    case 's': return { center, U: new THREE.Vector3(1, 0, 0), V: new THREE.Vector3(0, 0, -1), halfU: w / 2, halfV: d / 2 };
    case 'n': return { center, U: new THREE.Vector3(1, 0, 0), V: new THREE.Vector3(0, 0, 1), halfU: w / 2, halfV: d / 2 };
    case 'w': return { center, U: new THREE.Vector3(0, 0, 1), V: new THREE.Vector3(1, 0, 0), halfU: d / 2, halfV: w / 2 };
    case 'e': return { center, U: new THREE.Vector3(0, 0, 1), V: new THREE.Vector3(-1, 0, 0), halfU: d / 2, halfV: w / 2 };
  }
}

const local = (f: Frame, u: number, v: number, y = 0) =>
  new THREE.Vector3(f.center.x + f.U.x * u + f.V.x * v, y, f.center.z + f.U.z * u + f.V.z * v);

/** PlaneGeometry(+z를 향함)가 방향 D를 바라보게 하는 yaw */
const yawFacing = (d: THREE.Vector3) => Math.atan2(d.x, d.z);

function tileTexture(base: string, line: string, cells: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = base; g.fillRect(0, 0, 512, 512);
  g.strokeStyle = line; g.lineWidth = 2;
  const s = 512 / cells;
  for (let i = 0; i <= cells; i++) {
    g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, 512); g.stroke();
    g.beginPath(); g.moveTo(0, i * s); g.lineTo(512, i * s); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function buildWorld(scene: THREE.Scene): World {
  const floors: THREE.Mesh[] = [];
  const walls: Wall[] = [];
  const obstacles: Obstacle[] = [];
  const seats: Seat[] = [];
  const rooms = new Map<RoomId, RoomInfo>();
  const occluders: THREE.Mesh[] = [];
  const animated: ((dt: number) => void)[] = [];
  const interactives: THREE.Object3D[] = [];
  const interestBoards = new Map<RoomId, { mesh: THREE.Mesh; live: LiveTexture<[number]> }>();
  const rankBoards = new Map<RoomId, { mesh: THREE.Mesh; live: LiveTexture<[string, [string, string][]]> }>();
  const decal = { polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 };

  const wallMat = new THREE.MeshStandardMaterial({ color: 0xf2eee8, roughness: 0.95 });
  const pink = new THREE.MeshStandardMaterial({ color: BRAND_PINK, roughness: 0.6 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a6240, roughness: 0.85 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.5, metalness: 0.4 });

  function addWall(ax: number, az: number, bx: number, bz: number, mat: THREE.Material, plaza = false) {
    const horizontal = Math.abs(bx - ax) >= Math.abs(bz - az);
    const len = horizontal ? Math.abs(bx - ax) : Math.abs(bz - az);
    if (len < 0.05) return;
    const thick = plaza ? WALL_THICKNESS - 0.06 : WALL_THICKNESS;
    const height = plaza ? WALL_HEIGHT - 0.05 : WALL_HEIGHT;
    const along = plaza ? len : len + WALL_THICKNESS;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(horizontal ? along : thick, height, horizontal ? thick : along),
      (mat as THREE.Material).clone(),
    );
    mesh.position.set((ax + bx) / 2, height / 2, (az + bz) / 2);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.name = 'wall';
    scene.add(mesh);
    occluders.push(mesh);
    const h = WALL_THICKNESS / 2;
    walls.push({ minX: Math.min(ax, bx) - h, maxX: Math.max(ax, bx) + h, minZ: Math.min(az, bz) - h, maxZ: Math.max(az, bz) + h });
  }

  function addFloor(rect: Rect, mat: THREE.Material, room: RoomId | null) {
    const w = rect.maxX - rect.minX, d = rect.maxZ - rect.minZ;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set((rect.minX + rect.maxX) / 2, 0, (rect.minZ + rect.maxZ) / 2);
    m.receiveShadow = true;
    m.userData.room = room;
    scene.add(m);
    floors.push(m);
    return m;
  }

  // 바깥 배경: 하늘, 공원, 도시
  animated.push(buildBackdrop(scene));

  // ───────── 광장 ─────────
  const plazaTex = tileTexture('#ebe6de', 'rgba(0,0,0,0.07)', 10);
  plazaTex.repeat.set(10, 7);
  addFloor(PLAZA, new THREE.MeshStandardMaterial({ map: plazaTex, roughness: 0.9 }), null);

  // 광장 둘레 벽(방이 없는 구간만)
  addWall(-1, PLAZA.minZ, 1, PLAZA.minZ, wallMat, true);
  addWall(-1, PLAZA.maxZ, 1, PLAZA.maxZ, wallMat, true);
  addWall(PLAZA.maxX, PLAZA.minZ, PLAZA.maxX, -4, wallMat, true);
  addWall(PLAZA.maxX, 4, PLAZA.maxX, PLAZA.maxZ, wallMat, true);
  addWall(PLAZA.minX, PLAZA.minZ, PLAZA.minX, -4, wallMat, true);
  addWall(PLAZA.minX, 4, PLAZA.minX, PLAZA.maxZ, wallMat, true);

  // 가운데 기둥
  const totemFace = new THREE.MeshStandardMaterial({ map: makeTotemFace(), roughness: 0.7 });
  const totem = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.6, 1.3), [totemFace, totemFace, pink, pink, totemFace, totemFace]);
  totem.position.set(0, 1.5, 0); totem.castShadow = true;
  const totemBase = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.4, 0.4, 32), pink);
  totemBase.position.set(0, 0.2, 0); totemBase.castShadow = true;
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.3, 2.6, 48), new THREE.MeshStandardMaterial({ color: BRAND_PINK, roughness: 0.8 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.035;
  scene.add(totem, totemBase, ring);
  obstacles.push({ x: 0, z: 0, r: 1.45 });

  // 통계 표시물: 서버에서 첫 숫자가 오기 전까지는 숨겨 둔다
  const statsGroup = new THREE.Group();
  statsGroup.visible = false;
  scene.add(statsGroup);

  // 기둥 위 전광판 (네 면 모두 같은 숫자)
  const counter = makeCounterBoard();
  const counterFace = new THREE.MeshBasicMaterial({ map: counter.tex });
  const counterBox = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.84, 2.0), [counterFace, counterFace, pink, pink, counterFace, counterFace]);
  counterBox.position.set(0, 3.3, 0);
  // 위에서 내려다보는 첫 화면에서도 숫자가 읽히게 윗면에도 붙인다
  const counterTop = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.79), new THREE.MeshBasicMaterial({ map: counter.tex, ...decal }));
  counterTop.rotation.x = -Math.PI / 2;
  counterTop.position.set(0, 3.3 + 0.42 + 0.03, 0);
  statsGroup.add(counterBox, counterTop);

  // 퀴즈 안내판: 위쪽 벽, 와인 방과 보드게임 방 사이. 퀴즈는 서버 없이도 열리므로 항상 보인다
  const quizBoard = makeQuizBoard(QUIZ_HOUR);
  const hostMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.76, 1.13), new THREE.MeshBasicMaterial({ map: quizBoard.tex, ...decal }));
  hostMesh.position.set(0, 1.5, PLAZA.minZ + WALL_THICKNESS / 2 + 0.1);
  const hostFrame = new THREE.Mesh(new THREE.BoxGeometry(1.86, 1.23, 0.06), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 }));
  hostFrame.position.set(0, 1.5, PLAZA.minZ + WALL_THICKNESS / 2 + 0.04);
  scene.add(hostFrame, hostMesh);

  // 퀴즈 O/X 구역: 광장 왼쪽 절반이 O, 오른쪽 절반이 X
  const zoneGroup = new THREE.Group();
  zoneGroup.visible = false;
  const zoneW = (PLAZA.maxX - PLAZA.minX) / 2 - 0.5, zoneD = PLAZA.maxZ - PLAZA.minZ - 0.8;
  const zoneMats = (['O', 'X'] as const).map(mark => new THREE.MeshBasicMaterial({ map: makeZoneTexture(mark), transparent: true, opacity: 0.5, depthWrite: false, ...decal }));
  zoneMats.forEach((mat, i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(zoneW, zoneD), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set((i ? 1 : -1) * (zoneW / 2 + 0.25), 0.02, 0);
    m.renderOrder = 1;
    zoneGroup.add(m);
  });
  scene.add(zoneGroup);

  // 설문 키오스크: 아래쪽 벽 앞, 입장 지점 근처
  const kiosk = new THREE.Group();
  const kioskPost = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.0, 0.16), darkMetal); kioskPost.position.y = 0.5;
  const kioskBase = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.06, 24), darkMetal); kioskBase.position.y = 0.03;
  const kioskBody = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.68, 0.08), pink); kioskBody.position.set(0, 1.2, 0); kioskBody.rotation.x = -0.5;
  const kioskScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.6), new THREE.MeshBasicMaterial({ map: makeKioskTexture(), ...decal }));
  kioskScreen.position.set(0, 1.222, 0.04); kioskScreen.rotation.x = -0.5;
  kioskScreen.translateZ(0.012);
  kiosk.add(kioskPost, kioskBase, kioskBody, kioskScreen);
  kiosk.position.set(2.2, 0, 5.7);
  kiosk.rotation.y = Math.PI; // 화면이 광장 안쪽(-z)을 본다
  kiosk.userData.action = 'survey';
  kioskPost.castShadow = true; kioskBody.castShadow = true;
  statsGroup.add(kiosk);
  interactives.push(kiosk);

  // 방명록 게시판: 아래쪽 벽 가운데
  const guestbook = makeGuestbookBoard();
  const guestGroup = new THREE.Group();
  const guestMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.76, 1.13), new THREE.MeshStandardMaterial({ map: guestbook.tex, roughness: 0.8, ...decal }));
  guestMesh.position.set(0, 1.45, PLAZA.maxZ - WALL_THICKNESS / 2 - 0.1);
  guestMesh.rotation.y = Math.PI;
  const guestFrame = new THREE.Mesh(new THREE.BoxGeometry(1.86, 1.23, 0.06), wood);
  guestFrame.position.set(0, 1.45, PLAZA.maxZ - WALL_THICKNESS / 2 - 0.04);
  guestGroup.add(guestFrame, guestMesh);
  guestGroup.userData.action = 'guestbook';
  guestGroup.visible = false;
  scene.add(guestGroup);
  interactives.push(guestGroup);

  // 벤치
  const benchSpots = [[-3.6, -4.6], [3.6, -4.6], [-3.6, 4.6], [3.6, 4.6]];
  for (const [bx, bz] of benchSpots) {
    const yaw = yawFacing(new THREE.Vector3(-bx, 0, -bz));
    const bench = new THREE.Group();
    const seatTop = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.5), wood); seatTop.position.y = 0.45; seatTop.castShadow = true;
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.4, 0.06), wood); back.position.set(0, 0.72, -0.22);
    const legMat = darkMetal;
    for (const lx of [-0.7, 0.7]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 0.45), legMat); leg.position.set(lx, 0.22, 0); bench.add(leg);
    }
    bench.add(seatTop, back);
    bench.position.set(bx, 0, bz); bench.rotation.y = yaw;
    scene.add(bench);
    obstacles.push({ x: bx, z: bz, r: 0.95 });
    for (const off of [-0.45, 0.45]) {
      const p = new THREE.Vector3(off, 0, 0.02).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(new THREE.Vector3(bx, SEAT_Y, bz));
      seats.push({ pos: p, yaw, room: null });
    }
  }

  // 화분과 가로등
  const potMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x4e8f4a, roughness: 0.9 });
  for (const [x, z] of [[-9, -6], [9, -6], [-9, 6], [9, 6]]) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.34, 0.6, 16), potMat); pot.position.set(x, 0.3, z);
    const leaves = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 10), leafMat); leaves.position.set(x, 1.1, z); leaves.scale.set(1, 1.35, 1); leaves.castShadow = true;
    scene.add(pot, leaves);
    obstacles.push({ x, z, r: 0.6 });
  }
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff1d6 });
  for (const [x, z] of [[-7.5, -2.2], [7.5, 2.2]]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 3.2, 8), darkMetal); post.position.set(x, 1.6, z);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), bulbMat); head.position.set(x, 3.25, z);
    const light = new THREE.PointLight(0xffe4c0, 20, 14, 2); light.position.set(x, 3.1, z);
    scene.add(post, head, light);
    obstacles.push({ x, z, r: 0.25 });
  }

  // ───────── 카테고리 방 ─────────
  for (const layout of ROOM_LAYOUTS) {
    const { theme, rect, doorSide, doorAt } = layout;
    const f = frameOf(layout);
    const roomWall = new THREE.MeshStandardMaterial({ color: theme.wall, roughness: 0.95 });
    addFloor(rect, new THREE.MeshStandardMaterial({ color: theme.floor, roughness: 0.9 }), theme.id);

    // 벽 4면. 문이 난 벽은 둘로 나눈다
    const sides: [string, number, number, number, number][] = [
      ['n', rect.minX, rect.minZ, rect.maxX, rect.minZ],
      ['s', rect.minX, rect.maxZ, rect.maxX, rect.maxZ],
      ['w', rect.minX, rect.minZ, rect.minX, rect.maxZ],
      ['e', rect.maxX, rect.minZ, rect.maxX, rect.maxZ],
    ];
    for (const [side, ax, az, bx, bz] of sides) {
      if (side !== doorSide) { addWall(ax, az, bx, bz, roomWall); continue; }
      const half = DOOR_WIDTH / 2;
      if (side === 'n' || side === 's') {
        addWall(ax, az, doorAt - half, az, roomWall);
        addWall(doorAt + half, az, bx, bz, roomWall);
      } else {
        addWall(ax, az, ax, doorAt - half, roomWall);
        addWall(ax, doorAt + half, bx, bz, roomWall);
      }
    }

    // 문 상인방과 명패
    const doorCenter = local(f, 0, -f.halfV);
    const outward = f.V.clone().negate();
    const lintel = new THREE.Mesh(
      new THREE.BoxGeometry(f.U.x ? DOOR_WIDTH + 0.4 : WALL_THICKNESS + 0.08, 0.42, f.U.z ? DOOR_WIDTH + 0.4 : WALL_THICKNESS + 0.08),
      pink.clone(),
    );
    lintel.position.set(doorCenter.x, WALL_HEIGHT - 0.15, doorCenter.z);
    scene.add(lintel);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.64), new THREE.MeshStandardMaterial({ map: makeDoorPlate(theme.name), roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    plate.position.copy(doorCenter).addScaledVector(outward, 0.26); plate.position.y = WALL_HEIGHT + 0.45;
    plate.rotation.y = yawFacing(outward);
    const plateBack = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.74, 0.08), pink.clone());
    plateBack.position.copy(doorCenter).addScaledVector(outward, 0.14); plateBack.position.y = WALL_HEIGHT + 0.45;
    plateBack.rotation.y = plate.rotation.y;
    plate.name = 'plate'; plateBack.name = 'plateBack'; lintel.name = 'lintel';
    scene.add(plateBack, plate);
    occluders.push(plate, plateBack, lintel);

    // 뒷벽 안내판 (로고 + 카테고리)
    const signPos = local(f, 0, f.halfV - WALL_THICKNESS / 2 - 0.12, 1.42);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.93), new THREE.MeshStandardMaterial({ map: makeSignTexture(theme.name, theme.tagline), roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    sign.position.copy(signPos);
    sign.rotation.y = yawFacing(outward);
    const signFrame = new THREE.Mesh(new THREE.BoxGeometry(3.56, 2.09, 0.06), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 }));
    signFrame.position.copy(signPos).addScaledVector(f.V, 0.07);
    signFrame.rotation.y = sign.rotation.y;
    scene.add(signFrame, sign);

    // 안내판 옆 "열리면 갈래요" 숫자판. 숫자가 올 때까지 숨긴다
    const interest = makeInterestBoard();
    const interestMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.56), new THREE.MeshStandardMaterial({ map: interest.tex, roughness: 0.6, transparent: true, ...decal }));
    interestMesh.position.copy(local(f, 2.62, f.halfV - WALL_THICKNESS / 2 - 0.12, 1.42));
    interestMesh.rotation.y = sign.rotation.y;
    interestMesh.visible = false;
    scene.add(interestMesh);
    interestBoards.set(theme.id, { mesh: interestMesh, live: interest });

    // 안내판 반대편 옆 "오늘의 순위". 순위가 올 때까지 숨긴다
    const rank = makeRankBoard();
    const rankMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.21), new THREE.MeshBasicMaterial({ map: rank.tex, transparent: true, ...decal }));
    rankMesh.position.copy(local(f, -2.62, f.halfV - WALL_THICKNESS / 2 - 0.12, 1.42));
    rankMesh.rotation.y = sign.rotation.y;
    rankMesh.visible = false;
    scene.add(rankMesh);
    rankBoards.set(theme.id, { mesh: rankMesh, live: rank });

    // 방 조명
    const light = new THREE.PointLight(theme.light, theme.lightIntensity, 13, 2);
    light.position.set(f.center.x, 2.4, f.center.z);
    scene.add(light);

    // 테이블 4개와 의자
    const tableTop = new THREE.MeshStandardMaterial({ color: theme.id === 'club' ? 0x2b2633 : theme.id === 'wine' ? 0x3a2219 : 0xf4efe6, roughness: 0.6 });
    const chairMat = new THREE.MeshStandardMaterial({ color: theme.id === 'club' ? 0x3a3344 : theme.id === 'run' ? 0x3c4a5c : 0x5a4030, roughness: 0.8 });
    const tu = f.halfU - 2.1, tv = f.halfV - 2.5;
    const tables: THREE.Vector3[] = [];
    for (const su of [-1, 1]) for (const sv of [-1, 1]) {
      const p = local(f, su * tu, sv * tv);
      tables.push(p);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.06, 28), tableTop); top.position.set(p.x, 0.76, p.z); top.castShadow = true;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.72, 10), darkMetal); stem.position.set(p.x, 0.38, p.z);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.34, 0.04, 20), darkMetal); base.position.set(p.x, 0.02, p.z);
      scene.add(top, stem, base);
      obstacles.push({ x: p.x, z: p.z, r: 0.78 });
      for (const dir of [f.U, f.U.clone().negate(), f.V, f.V.clone().negate()]) {
        const sp = p.clone().addScaledVector(dir, 1.02);
        const yaw = yawFacing(dir.clone().negate());
        const chair = new THREE.Group();
        const cs = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.06, 0.44), chairMat); cs.position.y = 0.46;
        const cb = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.46, 0.06), chairMat); cb.position.set(0, 0.7, -0.2);
        const cl = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.46, 8), darkMetal); cl.position.y = 0.23;
        chair.add(cs, cb, cl); chair.position.copy(sp); chair.rotation.y = yaw;
        cs.castShadow = true;
        scene.add(chair);
        seats.push({ pos: new THREE.Vector3(sp.x, SEAT_Y, sp.z), yaw, room: theme.id });
      }
    }

    decorate(theme.id, f, tables);

    rooms.set(theme.id, {
      layout,
      center: f.center.clone(),
      doorIn: local(f, 0, -f.halfV + 1.3),
      doorOut: local(f, 0, -f.halfV - 1.3),
    });
  }

  function decorate(id: RoomId, f: Frame, tables: THREE.Vector3[]) {
    const sideU = f.halfU - 0.55;
    switch (id) {
      case 'wine': {
        const candleMat = new THREE.MeshStandardMaterial({ color: 0xfff6e0, roughness: 0.8 });
        const flameMat = new THREE.MeshBasicMaterial({ color: 0xffb347 });
        const glassMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, transparent: true, opacity: 0.35 });
        const wineMat = new THREE.MeshStandardMaterial({ color: 0x7a0f2a, roughness: 0.2 });
        for (const t of tables) {
          const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 8), candleMat); candle.position.set(t.x, 0.86, t.z);
          const flame = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), flameMat); flame.position.set(t.x, 0.95, t.z);
          scene.add(candle, flame);
          animated.push(dt => { flame.scale.setScalar(0.9 + Math.sin(performance.now() / 90 + t.x) * 0.15 * dt * 60 / 60); });
          for (const [ox, oz] of [[0.25, 0.1], [-0.22, -0.15]]) {
            const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), glassMat);
            bowl.rotation.x = Math.PI; bowl.position.set(t.x + ox, 0.98, t.z + oz);
            const wine = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.03, 0.04, 10), wineMat); wine.position.set(t.x + ox, 0.95, t.z + oz);
            const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 6), glassMat); stem.position.set(t.x + ox, 0.86, t.z + oz);
            scene.add(bowl, wine, stem);
          }
        }
        // 옆벽 와인 선반
        const rack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.6, 2.8), wood);
        const rp = local(f, -sideU, 0.5, 0.8);
        rack.position.copy(rp); rack.rotation.y = f.U.z ? Math.PI / 2 : 0;
        scene.add(rack);
        const bottleMat = new THREE.MeshStandardMaterial({ color: 0x1f3d2a, roughness: 0.3 });
        for (let i = 0; i < 12; i++) {
          const b = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.32, 8), bottleMat);
          const pos = local(f, -sideU + 0.25, 0.5 + (i % 6 - 2.5) * 0.42, 0.45 + Math.floor(i / 6) * 0.55);
          b.position.copy(pos); b.rotation.z = Math.PI / 2; b.rotation.y = f.U.z ? Math.PI / 2 : 0;
          scene.add(b);
        }
        break;
      }
      case 'board': {
        const colors = [0xff385c, 0x2f6fed, 0xf2c94c, 0x27ae60, 0x9b51e0, 0xf2994a];
        tables.forEach((t, i) => {
          for (let k = 0; k < 3; k++) {
            const box = new THREE.Mesh(new THREE.BoxGeometry(0.34 - k * 0.04, 0.07, 0.26 - k * 0.03), new THREE.MeshStandardMaterial({ color: colors[(i + k) % colors.length], roughness: 0.7 }));
            box.position.set(t.x, 0.83 + k * 0.07, t.z); box.rotation.y = k * 0.3;
            scene.add(box);
          }
        });
        const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.9, 3.2), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }));
        shelf.position.copy(local(f, sideU, 0.4, 0.95)); shelf.rotation.y = f.U.z ? Math.PI / 2 : 0;
        scene.add(shelf);
        const spines = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.7), new THREE.MeshStandardMaterial({ map: makeStripesTexture(['#ff385c', '#2f6fed', '#f2c94c', '#27ae60', '#9b51e0', '#f2994a', '#ff385c', '#2f6fed'], false), roughness: 0.8 }));
        spines.position.copy(local(f, sideU - 0.26, 0.4, 0.95)); spines.rotation.y = yawFacing(f.U.clone().negate());
        scene.add(spines);
        break;
      }
      case 'rooftop': {
        // 뒷벽 도시 불빛
        const win = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
        for (let i = 0; i < 26; i++) {
          const w = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.12), win);
          const u = (Math.random() - 0.5) * (f.halfU * 2 - 1);
          w.position.copy(local(f, u, f.halfV - WALL_THICKNESS / 2 - 0.06, 0.3 + Math.random() * 1.9));
          w.rotation.y = yawFacing(f.V.clone().negate());
          scene.add(w);
        }
        // 줄전구
        const bulbs: THREE.Mesh[] = [];
        for (let i = 0; i < 14; i++) {
          const u = -f.halfU + 0.6 + i * ((f.halfU * 2 - 1.2) / 13);
          const b = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff0c2 }));
          b.position.copy(local(f, u, f.halfV - 1.2, 2.35 - Math.sin((i / 13) * Math.PI) * 0.25));
          scene.add(b); bulbs.push(b);
        }
        animated.push(() => { const t = performance.now() / 1000; bulbs.forEach((b, i) => { (b.material as THREE.MeshBasicMaterial).color.setHSL(0.11, 0.8, 0.75 + Math.sin(t * 2 + i) * 0.1); }); });
        const glass = new THREE.MeshStandardMaterial({ color: 0xffd1dc, roughness: 0.15, transparent: true, opacity: 0.6 });
        for (const t of tables) {
          const cone = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.1, 10), glass); cone.rotation.x = Math.PI; cone.position.set(t.x + 0.2, 0.9, t.z);
          const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.1, 6), glass); stem.position.set(t.x + 0.2, 0.83, t.z);
          scene.add(cone, stem);
        }
        for (const su of [-1, 1]) {
          const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.3, 0.5, 12), new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.9 }));
          pot.position.copy(local(f, su * sideU, f.halfV - 0.9, 0.25));
          const leaves = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.4, 8), new THREE.MeshStandardMaterial({ color: 0x3f7a46, roughness: 0.9 }));
          leaves.position.copy(local(f, su * sideU, f.halfV - 0.9, 1.2));
          scene.add(pot, leaves);
        }
        break;
      }
      case 'run': {
        const coneMat = new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.6 });
        for (let i = 0; i < 5; i++) {
          const c = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.42, 10), coneMat);
          c.position.copy(local(f, -sideU + 0.2, -f.halfV + 1.2 + i * 1.3, 0.21)); c.castShadow = true;
          scene.add(c);
        }
        const banner = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.5), new THREE.MeshStandardMaterial({ map: makeStripesTexture(['#111111', '#ffffff', '#111111', '#ffffff', '#111111', '#ffffff', '#111111', '#ffffff'], true), roughness: 0.8 }));
        banner.position.copy(local(f, sideU - 0.3, 0.4, 2.1)); banner.rotation.y = yawFacing(f.U.clone().negate());
        scene.add(banner);
        const bottleMat = new THREE.MeshStandardMaterial({ color: 0x4aa3ff, roughness: 0.2, transparent: true, opacity: 0.8 });
        for (const t of tables) {
          const b = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.2, 8), bottleMat); b.position.set(t.x - 0.2, 0.89, t.z + 0.1);
          scene.add(b);
        }
        const mat = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.7), new THREE.MeshStandardMaterial({ color: 0x5b6ee1, roughness: 0.9 }));
        mat.rotation.x = -Math.PI / 2; mat.position.copy(local(f, sideU - 1.2, -f.halfV + 1.4, 0.035)); mat.rotation.z = f.U.z ? Math.PI / 2 : 0;
        scene.add(mat);
        break;
      }
      case 'book': {
        const spineTex = makeStripesTexture(['#8a3b2e', '#2f4858', '#c9a227', '#5b7553', '#3b3b58', '#b8562b', '#2f6fed', '#7a4f2a'], true);
        for (const su of [-1, 1]) {
          const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.1, 3.6), wood);
          shelf.position.copy(local(f, su * sideU, 0.6, 1.05)); shelf.rotation.y = f.U.z ? Math.PI / 2 : 0;
          scene.add(shelf);
          for (let row = 0; row < 3; row++) {
            const spines = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 0.5), new THREE.MeshStandardMaterial({ map: spineTex, roughness: 0.9 }));
            spines.position.copy(local(f, su * (sideU - 0.26), 0.6, 0.45 + row * 0.62));
            spines.rotation.y = yawFacing(f.U.clone().multiplyScalar(-su));
            scene.add(spines);
          }
        }
        const rug = new THREE.Mesh(new THREE.CircleGeometry(2.6, 40), new THREE.MeshStandardMaterial({ color: 0x9b4a3a, roughness: 1 }));
        rug.rotation.x = -Math.PI / 2; rug.position.copy(local(f, 0, 0, 0.035));
        scene.add(rug);
        const shadeMat = new THREE.MeshStandardMaterial({ color: 0xf3e2c0, roughness: 0.9, side: THREE.DoubleSide });
        for (const su of [-1, 1]) {
          const p = local(f, su * (sideU - 1.0), f.halfV - 0.9);
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.5, 8), darkMetal); post.position.set(p.x, 0.75, p.z);
          const shade = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.36, 16, 1, true), shadeMat); shade.position.set(p.x, 1.6, p.z);
          const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe3b0 })); bulb.position.set(p.x, 1.5, p.z);
          scene.add(post, shade, bulb);
          obstacles.push({ x: p.x, z: p.z, r: 0.35 });
        }
        for (const t of tables) {
          const book = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.3), new THREE.MeshStandardMaterial({ color: 0x2f4858, roughness: 0.8 }));
          book.position.set(t.x + 0.1, 0.81, t.z - 0.1); book.rotation.y = 0.4;
          scene.add(book);
        }
        break;
      }
      case 'club': {
        const neonPink = new THREE.MeshBasicMaterial({ color: 0xff3aa0 });
        const neonCyan = new THREE.MeshBasicMaterial({ color: 0x3af2ff });
        for (const su of [-1, 1]) {
          const strip = new THREE.Mesh(new THREE.BoxGeometry(f.U.x ? 0.08 : f.halfV * 2 - 0.4, 0.06, f.U.z ? 0.08 : f.halfV * 2 - 0.4), su < 0 ? neonPink : neonCyan);
          strip.position.copy(local(f, su * (f.halfU - 0.25), 0, 0.08));
          scene.add(strip);
        }
        const backStrip = new THREE.Mesh(new THREE.BoxGeometry(f.U.x ? f.halfU * 2 - 0.4 : 0.08, 0.06, f.U.z ? f.halfU * 2 - 0.4 : 0.08), neonPink);
        backStrip.position.copy(local(f, 0, f.halfV - 0.25, 2.3));
        scene.add(backStrip);
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.35, 24, 16), new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.15, flatShading: true }));
        ball.position.set(f.center.x, 2.0, f.center.z);
        const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.2, 6), darkMetal); cord.position.set(f.center.x, 2.9, f.center.z);
        scene.add(ball, cord);
        const cyanLight = new THREE.PointLight(0x3af2ff, 18, 10, 2);
        cyanLight.position.copy(local(f, sideU - 0.5, -1.5, 2.2));
        scene.add(cyanLight);
        animated.push(dt => { ball.rotation.y += dt * 0.8; cyanLight.intensity = 14 + Math.sin(performance.now() / 300) * 6; });
        for (const su of [-1, 1]) {
          const spk = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.1, 0.5), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7 }));
          spk.position.copy(local(f, su * (sideU - 0.3), f.halfV - 0.9, 0.55)); spk.castShadow = true;
          scene.add(spk);
          obstacles.push({ x: spk.position.x, z: spk.position.z, r: 0.5 });
        }
        const glow = new THREE.MeshBasicMaterial({ color: 0x9df7ff });
        for (const t of tables) {
          const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.12, 10), glow); cup.position.set(t.x + 0.2, 0.85, t.z - 0.1);
          scene.add(cup);
        }
        break;
      }
    }
  }

  return {
    floors, walls, obstacles, seats, rooms, occluders,
    spawn: new THREE.Vector3(0, 0, 3.2),
    interactives,
    setCounter(visits, today) {
      counter.set(visits, today);
      if (!statsGroup.visible) {
        statsGroup.visible = true;
        obstacles.push({ x: kiosk.position.x, z: kiosk.position.z, r: 0.55 });
      }
    },
    setQuizBoard(sub, names) { quizBoard.set(sub, names); },
    setQuizZones(visible, correct = null) {
      zoneGroup.visible = visible;
      zoneMats[0].opacity = correct === null ? 0.5 : correct ? 0.85 : 0.14;
      zoneMats[1].opacity = correct === null ? 0.5 : correct ? 0.14 : 0.85;
    },
    setGuestbook(notes) {
      guestbook.set(notes);
      guestGroup.visible = true;
    },
    setRanking(room, title, rows) {
      const b = rankBoards.get(room);
      if (!b) return;
      b.live.set(title, rows);
      b.mesh.visible = true;
    },
    setInterest(room, n) {
      const b = interestBoards.get(room);
      if (!b) return;
      b.live.set(n);
      b.mesh.visible = true;
    },
    update(dt) { for (const fn of animated) fn(dt); },
  };
}
