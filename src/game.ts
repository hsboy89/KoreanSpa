import * as THREE from 'three';
import { buildWorld, type Seat, type World } from './scene/world';
import { Avatar, cupProp, randomOutfit } from './scene/avatar';
import { Controls } from './scene/controls';
import { Hud, type ActionId } from './ui/hud';
import { inRect, PLAZA, ROOM_LAYOUTS, ROOM_THEMES, type RoomId } from './scene/rooms';
import { mockPeers, randomName, type Peer } from './state/presence';
import { Ambient } from './audio/ambient';

type Task = { kind: 'sit'; seat: Seat } | { kind: 'enter'; room: RoomId };

interface Bot { peer: Peer; avatar: Avatar; nextWander: number; seat: Seat | null }

const PLAYER_RADIUS = 0.32;

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private world: World;
  private player: Avatar;
  private bots: Bot[] = [];
  private controls: Controls;
  private hud: Hud;
  private ambient = new Ambient();
  private clock = new THREE.Clock();

  private task: Task | null = null;
  private mySeat: Seat | null = null;
  private takenSeats = new Set<Seat>();
  private zone: RoomId | null = null;
  private keyWalking = false;
  private cheersTimer = 0;
  private stall = 0;
  private lastDist = Infinity;
  /** 방에 들어갈 때 카메라를 당기는 목표 거리. null이면 사용자가 조절한 대로 둔다 */
  private zoomTo: number | null = null;
  private occludeRay = new THREE.Ray();
  private occluderBoxes: THREE.Box3[] = [];
  private faded = new Set<THREE.Mesh>();

  constructor(root: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    root.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x17131c);
    this.camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 120);

    this.scene.add(new THREE.HemisphereLight(0xfff4f6, 0x3a2a33, 0.7));
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.2));
    const sun = new THREE.DirectionalLight(0xfff3ea, 1.3);
    sun.position.set(8, 18, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -22; sun.shadow.camera.right = 22;
    sun.shadow.camera.top = 18; sun.shadow.camera.bottom = -18;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 50;
    sun.shadow.bias = -0.0006;
    this.scene.add(sun);

    this.world = buildWorld(this.scene);

    this.player = new Avatar(randomName(), randomOutfit());
    this.player.group.position.copy(this.world.spawn);
    this.player.faceYaw(Math.PI);
    this.scene.add(this.player.group);

    this.spawnBots(mockPeers());

    this.controls = new Controls(this.camera, this.renderer.domElement, this.world.floors, p => this.onClickFloor(p), e => this.onKey(e));
    // 처음엔 라운지 전체가 보이도록 멀리서 시작한다
    this.camera.position.set(this.world.spawn.x, 24, this.world.spawn.z + 21);
    this.controls.snapTo(this.focusPoint());

    this.hud = new Hud(root, {
      onAction: id => this.action(id),
      onGoRoom: id => this.goRoom(id),
      onSound: () => this.toggleSound(),
    });
    this.hud.setPresence(this.bots.length + 1);
    this.hud.setLocation(null);
    this.refreshRoomCards();

    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.clock.getDelta(); });

    // 가림 판정용 경계 상자. 벽과 명패는 움직이지 않으므로 한 번만 계산한다
    this.scene.updateMatrixWorld(true);
    this.occluderBoxes = this.world.occluders.map(m => new THREE.Box3().setFromObject(m).expandByScalar(0.45));
  }

  start() {
    this.hud.toast(`${this.player.name}님, 파팅 라운지에 오셨어요. 끌리는 방으로 가볼까요?`, 4000);
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ───────── 입력 ─────────

  private onClickFloor(p: THREE.Vector3) {
    if (this.hud.modalOpen) return;
    const target = p.clone();
    target.y = 0;
    // 걷는 중 밀려나는 반경보다 넉넉히 보정해야 목표에 도착할 수 있다
    this.pushOutOfObstacles(target, PLAYER_RADIUS + 0.06);
    this.pushOutOfWalls(target, PLAYER_RADIUS + 0.06);
    this.task = null;
    this.standUp();
    this.player.walkTo(this.pathTo(target));
  }

  private onKey(e: KeyboardEvent) {
    if (e.repeat) return;
    if (e.key === 'Escape') { this.hud.closeModals(); return; }
    if (this.hud.modalOpen) return;
    const map: Record<string, ActionId> = { '1': 'rooms', '2': 'sit', '3': 'wave', '4': 'cheers' };
    const a = map[e.key];
    if (a) this.action(a);
  }

  private action(id: ActionId) {
    switch (id) {
      case 'rooms':
        this.refreshRoomCards();
        this.hud.showRooms(true);
        break;
      case 'sit': {
        if (this.mySeat) { this.standUp(); this.hud.toast('일어났어요.'); break; }
        const seat = this.nearestFreeSeat();
        if (!seat) { this.hud.toast('근처에 빈 자리가 없어요. 다른 방으로 가볼까요?'); break; }
        this.task = { kind: 'sit', seat };
        this.player.walkTo(this.pathTo(seat.pos));
        this.hud.toast('빈 자리로 걸어가요.');
        break;
      }
      case 'wave':
        this.player.play('wave');
        this.hud.toast('손을 흔들었어요.');
        break;
      case 'cheers':
        this.player.hold(cupProp());
        this.player.play('cheers', 2000);
        window.clearTimeout(this.cheersTimer);
        this.cheersTimer = window.setTimeout(() => this.player.hold(null), 2100);
        this.hud.toast('건배!');
        break;
    }
  }

  private goRoom(id: RoomId) {
    const info = this.world.rooms.get(id)!;
    const theme = ROOM_THEMES.find(t => t.id === id)!;
    this.standUp();
    this.task = { kind: 'enter', room: id };
    const inside = info.doorIn.clone().addScaledVector(info.center.clone().sub(info.doorIn).normalize(), 1.2);
    this.player.walkTo(this.pathTo(inside));
    this.hud.toast(`${theme.name} 방으로 걸어가요.`);
  }

  private async toggleSound() {
    const on = await this.ambient.toggle();
    this.hud.setSound(on);
    this.hud.toast(on ? '소리를 켰어요. 잔잔한 라운지 음악이 흘러요.' : '소리를 껐어요.');
  }

  // ───────── 이동 · 경로 ─────────

  private zoneOf(p: THREE.Vector3): RoomId | null {
    for (const l of ROOM_LAYOUTS) if (inRect(l.rect, p.x, p.z)) return l.theme.id;
    return null;
  }

  /** 광장과 방 사이를 오갈 때는 문을 거쳐 간다 */
  private pathTo(target: THREE.Vector3): THREE.Vector3[] {
    const from = this.zoneOf(this.player.group.position);
    const to = this.zoneOf(target);
    const path: THREE.Vector3[] = [];
    if (from === to) return [target];
    if (from) { const r = this.world.rooms.get(from)!; path.push(r.doorIn, r.doorOut); }
    if (to) { const r = this.world.rooms.get(to)!; path.push(r.doorOut, r.doorIn); }
    path.push(target);
    return path;
  }

  private pushOutOfObstacles(v: THREE.Vector3, radius: number) {
    for (const o of this.world.obstacles) {
      const dx = v.x - o.x, dz = v.z - o.z;
      const d = Math.hypot(dx, dz);
      const min = o.r + radius;
      if (d < min && d > 1e-4) { v.x = o.x + (dx / d) * min; v.z = o.z + (dz / d) * min; }
    }
  }

  private pushOutOfWalls(v: THREE.Vector3, radius: number) {
    for (const w of this.world.walls) {
      const minX = w.minX - radius, maxX = w.maxX + radius, minZ = w.minZ - radius, maxZ = w.maxZ + radius;
      if (v.x <= minX || v.x >= maxX || v.z <= minZ || v.z >= maxZ) continue;
      const dl = v.x - minX, dr = maxX - v.x, dn = v.z - minZ, ds = maxZ - v.z;
      const m = Math.min(dl, dr, dn, ds);
      if (m === dl) v.x = minX; else if (m === dr) v.x = maxX; else if (m === dn) v.z = minZ; else v.z = maxZ;
    }
    // 바닥 밖으로 나가지 않게
    const inside = inRect(PLAZA, v.x, v.z, -0.1) || ROOM_LAYOUTS.some(l => inRect(l.rect, v.x, v.z, -0.1));
    if (!inside) {
      v.x = THREE.MathUtils.clamp(v.x, -18.9, 18.9);
      v.z = THREE.MathUtils.clamp(v.z, -14.9, 14.9);
    }
  }

  private standUp() {
    if (this.mySeat) { this.takenSeats.delete(this.mySeat); this.mySeat = null; this.hud.setSeated(false); }
    if (this.player.pose === 'sit') this.player.setPose('idle');
  }

  private nearestFreeSeat(): Seat | null {
    const p = this.player.group.position;
    const zone = this.zoneOf(p);
    let best: Seat | null = null, bestD = Infinity;
    for (const s of this.world.seats) {
      if (this.takenSeats.has(s) || s.room !== zone) continue;
      const d = s.pos.distanceToSquared(p);
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  }

  private onArrive() {
    const task = this.task;
    this.task = null;
    if (!task) return;
    if (task.kind === 'sit') {
      if (this.takenSeats.has(task.seat)) { this.hud.toast('누가 먼저 앉았어요. 다른 자리를 찾아요.'); this.action('sit'); return; }
      this.takenSeats.add(task.seat);
      this.mySeat = task.seat;
      this.player.group.position.copy(task.seat.pos);
      this.player.faceYaw(task.seat.yaw);
      this.player.setPose('sit');
      this.hud.setSeated(true);
      this.hud.toast('앉았어요. 같이 앉은 사람에게 손을 흔들어 볼까요?');
    }
  }

  private onZoneChange(zone: RoomId | null) {
    this.zone = zone;
    const theme = zone ? ROOM_THEMES.find(t => t.id === zone)! : null;
    this.hud.setLocation(theme);
    // 멀리서 보고 있다가 방에 들어가면 가까이 당긴다
    if (zone && this.controls.distance() > 13) this.zoomTo = 9;
    if (theme) this.hud.toast(`${theme.name} 방이에요. 벽의 QR을 찍으면 이번 주 파티가 보여요.`, 3600);
    else this.hud.toast('광장이에요. 방 목록에서 다른 파티를 골라요.', 2400);
  }

  private refreshRoomCards() {
    this.hud.setRooms(ROOM_THEMES.map(theme => ({
      theme,
      count: this.bots.filter(b => b.peer.room === theme.id).length + (this.zone === theme.id ? 1 : 0),
    })));
  }

  // ───────── 봇 ─────────

  private spawnBots(peers: Peer[]) {
    for (const peer of peers) {
      const a = new Avatar(peer.name, randomOutfit(Math.random()));
      a.speed = 1.5;
      const bot: Bot = { peer, avatar: a, nextWander: 2 + Math.random() * 6, seat: null };
      const room = peer.room ? this.world.rooms.get(peer.room)! : null;
      if (peer.kind === 'seat') {
        const free = this.world.seats.filter(s => s.room === (peer.room ?? null) && !this.takenSeats.has(s));
        const seat = free[Math.floor(Math.random() * free.length)];
        if (seat) {
          this.takenSeats.add(seat); bot.seat = seat;
          a.group.position.copy(seat.pos); a.faceYaw(seat.yaw); a.setPose('sit');
        }
      } else if (peer.kind === 'stand' && room) {
        const p = room.center.clone(); p.x += (Math.random() - 0.5) * 2; p.z += (Math.random() - 0.5) * 2;
        this.pushOutOfObstacles(p, 0.4);
        a.group.position.copy(p); a.faceYaw(Math.random() * Math.PI * 2);
      } else {
        a.group.position.set((Math.random() - 0.5) * 12, 0, (Math.random() - 0.5) * 8);
        this.pushOutOfObstacles(a.group.position, 0.5);
      }
      this.scene.add(a.group);
      this.bots.push(bot);
    }
  }

  private updateBots(dt: number) {
    for (const b of this.bots) {
      if (b.peer.kind === 'wander') {
        b.nextWander -= dt;
        if (!b.avatar.moving && b.nextWander <= 0) {
          const t = new THREE.Vector3((Math.random() - 0.5) * 16, 0, (Math.random() - 0.5) * 10);
          this.pushOutOfObstacles(t, 0.5);
          b.avatar.walkTo([t]);
          b.nextWander = 5 + Math.random() * 9;
        }
        if (Math.random() < dt * 0.05) b.avatar.play('wave');
      } else if (b.peer.kind === 'stand' && Math.random() < dt * 0.04) {
        b.avatar.play(Math.random() < 0.5 ? 'wave' : 'cheers');
      }
      b.avatar.update(dt);
      if (b.avatar.moving) this.pushOutOfObstacles(b.avatar.group.position, PLAYER_RADIUS);
    }
  }

  // ───────── 루프 ─────────

  /** 카메라와 내 캐릭터 사이에 낀 벽과 명패를 반투명하게 */
  private fadeOccluders() {
    const from = this.camera.position;
    const to = this.focusPoint();
    to.y -= 0.4; // 머리보다 몸통 가운데를 기준으로
    const dir = to.clone().sub(from);
    const dist = dir.length() - 0.4;
    this.occludeRay.set(from, dir.normalize());
    const hits = new Set<THREE.Mesh>();
    const hitPoint = new THREE.Vector3();
    this.occluderBoxes.forEach((box, i) => {
      if (this.occludeRay.intersectBox(box, hitPoint) && hitPoint.distanceTo(from) < dist) hits.add(this.world.occluders[i]);
    });
    for (const m of hits) {
      if (this.faded.has(m)) continue;
      const mat = m.material as THREE.Material & { opacity: number };
      mat.transparent = true; mat.opacity = 0.18; mat.depthWrite = false; mat.needsUpdate = true;
      m.castShadow = false;
      this.faded.add(m);
    }
    for (const m of this.faded) {
      if (hits.has(m)) continue;
      const mat = m.material as THREE.Material & { opacity: number };
      mat.opacity = 1; mat.transparent = false; mat.depthWrite = true; mat.needsUpdate = true;
      m.castShadow = true;
      this.faded.delete(m);
    }
  }

  private focusPoint() {
    const p = this.player.group.position.clone();
    p.y += 1.0;
    return p;
  }

  private frame() {
    const dt = Math.min(this.clock.getDelta(), 0.1);

    const mv = this.controls.moveVector();
    if (mv && !this.hud.modalOpen) {
      if (!this.keyWalking) { this.standUp(); this.player.stop(); this.task = null; this.keyWalking = true; }
      const p = this.player.group.position;
      p.addScaledVector(mv, this.player.speed * dt);
      this.player.faceYaw(Math.atan2(mv.x, mv.z));
      if (this.player.pose !== 'walk') this.player.setPose('walk');
    } else if (this.keyWalking) {
      this.keyWalking = false;
      if (this.player.pose === 'walk') this.player.setPose('idle');
    }

    let arrived = this.player.update(dt);
    // 의자는 테이블·벤치의 충돌 반경 안에 있으므로 마지막 구간에서는 밀어내지 않는다
    const seating = this.task?.kind === 'sit' && this.player.path.length === 1;
    if (this.player.pose !== 'sit' && !seating) {
      this.pushOutOfObstacles(this.player.group.position, PLAYER_RADIUS);
      this.pushOutOfWalls(this.player.group.position, PLAYER_RADIUS);
    }
    // 밀려나서 제자리걸음이면 도착으로 본다
    if (this.player.moving) {
      const d = this.player.group.position.distanceTo(this.player.path[0]);
      this.stall = d < this.lastDist - 0.001 ? 0 : this.stall + dt;
      this.lastDist = d;
      if (this.stall > 0.8) {
        this.stall = 0;
        this.player.path.shift();
        if (!this.player.moving) { this.player.stop(); arrived = true; }
      }
    } else {
      this.stall = 0; this.lastDist = Infinity;
    }
    if (arrived) this.onArrive();

    const zone = this.zoneOf(this.player.group.position);
    if (zone !== this.zone) this.onZoneChange(zone);

    this.updateBots(dt);
    this.world.update(dt);

    this.ambient.setCrackle(0);
    this.ambient.update(dt);

    if (this.zoomTo !== null) {
      const d = this.controls.distance();
      if (Math.abs(d - this.zoomTo) < 0.2) this.zoomTo = null;
      else this.controls.setDistance(THREE.MathUtils.lerp(d, this.zoomTo, Math.min(1, dt * 3)));
    }
    this.controls.update(dt, this.focusPoint());
    this.fadeOccluders();
    this.renderer.render(this.scene, this.camera);
  }

  private resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
