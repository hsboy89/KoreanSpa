import * as THREE from 'three';
import { buildWorld, type World } from './scene/world';
import { Avatar, cupProp, eggProp, logProp } from './scene/avatar';
import { Controls } from './scene/controls';
import { Hud, type ActionId } from './ui/hud';
import { LocalFireStore, type FireState, type FireStore } from './state/fire';
import { mockPeers, randomName, ROBES, type Peer } from './state/presence';
import { loadStats, saveStats, type Stats } from './state/stats';
import { Ambient } from './audio/ambient';

type TaskKind = 'lie' | 'sauna' | 'egg' | 'sikhye' | 'log';
interface Task { kind: TaskKind; matIndex?: number; doingUntil?: number }

interface Bot { peer: Peer; avatar: Avatar; nextWander: number }

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private world: World;
  private player: Avatar;
  private bots: Bot[] = [];
  private controls: Controls;
  private hud: Hud;
  private fire: FireStore;
  private fireState: FireState;
  private ambient = new Ambient();
  private stats: Stats;
  private clock = new THREE.Clock();

  private task: Task | null = null;
  private inSauna = false;
  private saunaStart = 0;
  private occupiedMats = new Set<number>();
  private myMat: number | null = null;
  private keyWalking = false;

  constructor(root: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    root.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x1f1612);
    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 80);

    this.scene.add(new THREE.HemisphereLight(0xffe2c0, 0x5a3a28, 0.55));
    this.scene.add(new THREE.AmbientLight(0xffd9b5, 0.25));
    const sun = new THREE.DirectionalLight(0xffe8cc, 1.1);
    sun.position.set(6, 12, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -15; sun.shadow.camera.right = 15;
    sun.shadow.camera.top = 12; sun.shadow.camera.bottom = -12;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 40;
    sun.shadow.bias = -0.0008;
    this.scene.add(sun);

    this.world = buildWorld(this.scene);

    this.player = new Avatar(randomName(), ROBES[Math.floor(Math.random() * ROBES.length)], true);
    this.player.group.position.set(0, 0, 3.5);
    this.player.faceYaw(Math.PI);
    this.scene.add(this.player.group);

    this.spawnBots(mockPeers());

    this.controls = new Controls(this.camera, this.renderer.domElement, this.world.floor, p => this.onClickFloor(p), e => this.onKey(e));
    this.camera.position.set(0, 4.2, 9.5);
    this.controls.snapTo(this.focusPoint());

    this.fire = new LocalFireStore();
    this.fireState = this.fire.get();
    this.stats = loadStats();

    this.hud = new Hud(root, this.fire.burnMs, {
      onAction: id => this.action(id),
      onAddLog: () => this.goAddLog(),
      onSound: () => this.toggleSound(),
      onExitSauna: () => this.exitSauna(),
    });
    this.hud.setPresence(this.bots.length + 1);
    this.hud.setStats(this.stats);
    this.hud.setTowelState(true);
    this.fire.subscribe(s => {
      const wasLit = this.fireState.litAt !== null;
      this.fireState = s;
      this.hud.setFire(s);
      if (wasLit && s.litAt === null) this.hud.toast('불이 꺼졌어요. 장작더미에서 다시 지펴주세요.', 5000);
    });

    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.clock.getDelta(); });
  }

  start() {
    this.hud.toast(`${this.player.name}님, 잠깐 누워가요.`, 3500);
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ───────── 입력 ─────────

  private onClickFloor(p: THREE.Vector3) {
    if (this.hud.helpOpen) return;
    const w = this.world;
    const target = p.clone();
    target.y = 0;
    const toSauna = target.distanceTo(w.saunaCenter);
    if (toSauna < w.saunaRadius + 0.4) {
      // 불가마를 누르면 입구로
      this.walkTo(w.saunaDoor, null);
      return;
    }
    if (w.counterBox.containsPoint(target)) target.copy(w.counter);
    this.clampToRoom(target);
    this.walkTo(target, null);
  }

  private onKey(e: KeyboardEvent) {
    if (e.repeat) return;
    if (e.key === 'Escape') { this.hud.showHelp(false); return; }
    if (this.hud.helpOpen) return;
    const map: Record<string, ActionId> = { '1': 'lie', '2': 'sauna', '3': 'towel', '4': 'egg', '5': 'sikhye' };
    const a = map[e.key];
    if (a) this.action(a);
  }

  private action(id: ActionId) {
    const w = this.world;
    switch (id) {
      case 'towel': {
        const on = !this.player.hasTowel();
        this.player.setTowel(on);
        this.hud.setTowelState(on);
        this.hud.toast(on ? '양머리 수건을 접어 썼어요.' : '수건을 풀었어요.');
        break;
      }
      case 'lie': {
        if (this.player.pose === 'lie') { this.standUp(); this.hud.toast('일어났어요.'); break; }
        const idx = this.nearestFreeMat();
        if (idx === null) { this.hud.toast('빈 매트가 없어요. 잠시 뒤에 다시 눌러주세요.'); break; }
        this.walkTo(w.mats[idx].pos, { kind: 'lie', matIndex: idx });
        this.hud.toast('빈 매트로 걸어가요.');
        break;
      }
      case 'sauna': {
        if (this.inSauna) { this.exitSauna(); break; }
        this.walkTo(w.saunaDoor, { kind: 'sauna' });
        this.hud.toast('불가마로 걸어가요.');
        break;
      }
      case 'egg':
      case 'sikhye': {
        this.walkTo(w.counter, { kind: id });
        this.hud.toast('매점으로 걸어가요.');
        break;
      }
    }
  }

  private goAddLog() {
    this.walkTo(this.world.woodpile, { kind: 'log' });
    this.hud.toast('장작더미로 걸어가요.');
  }

  private async toggleSound() {
    const on = await this.ambient.toggle();
    this.hud.setSound(on);
    this.hud.toast(on ? '소리를 켰어요. 불가마 가까이 가면 타닥거려요.' : '소리를 껐어요.');
  }

  // ───────── 동작 처리 ─────────

  private walkTo(p: THREE.Vector3, task: Task | null) {
    this.standUp();
    this.player.hold(null);
    this.player.target = p.clone();
    this.task = task;
    this.hud.setActive(task && task.kind !== 'log' ? (task.kind as ActionId) : null);
  }

  /** 눕거나 불가마에 있으면 일어선다 */
  private standUp() {
    if (this.player.pose === 'lie') {
      this.player.setPose('idle');
      if (this.myMat !== null) { this.occupiedMats.delete(this.myMat); this.myMat = null; }
    }
    if (this.inSauna) this.exitSauna(false);
    if (this.player.pose === 'sit') this.player.setPose('idle');
    this.hud.setActive(null);
  }

  private onArrive() {
    const task = this.task;
    if (!task) return;
    const w = this.world;
    const now = performance.now();
    switch (task.kind) {
      case 'lie': {
        const idx = task.matIndex!;
        if (this.occupiedMats.has(idx)) { this.task = null; this.hud.toast('누가 먼저 누웠어요. 다른 매트를 찾아요.'); this.action('lie'); return; }
        this.occupiedMats.add(idx);
        this.myMat = idx;
        this.player.group.position.copy(w.mats[idx].pos);
        this.player.faceYaw(w.mats[idx].yaw);
        this.player.setPose('lie');
        this.hud.setActive('lie');
        this.hud.toast('누웠어요. 천장 보면서 잠깐 쉬어요.');
        this.task = null;
        break;
      }
      case 'sauna': {
        const seat = w.saunaSeats[0];
        this.player.group.position.copy(seat.pos);
        this.player.faceYaw(seat.yaw);
        this.player.setPose('sit');
        this.inSauna = true;
        this.saunaStart = now;
        // 자리 바로 뒤에서 불을 바라보도록 카메라를 당긴다
        this.controls.setMaxDistance(5);
        this.controls.placeCamera(
          new THREE.Vector3(seat.pos.x + 0.6, 2.1, seat.pos.z + 3.6),
          new THREE.Vector3(seat.pos.x, 0.9, seat.pos.z - 0.8),
        );
        this.hud.setActive('sauna');
        this.hud.toast('불가마에 들어왔어요. 버틸 수 있을 만큼만 버텨요.');
        this.task = null;
        break;
      }
      case 'egg':
      case 'sikhye': {
        if (task.doingUntil) return;
        this.player.faceYaw(0);
        this.player.hold(task.kind === 'egg' ? eggProp() : cupProp());
        task.doingUntil = now + 2600;
        break;
      }
      case 'log': {
        if (task.doingUntil) return;
        this.player.faceYaw(-Math.PI / 2);
        this.player.hold(logProp());
        task.doingUntil = now + 1400;
        break;
      }
    }
  }

  private finishTask() {
    const task = this.task;
    if (!task) return;
    this.task = null;
    this.player.hold(null);
    this.hud.setActive(null);
    switch (task.kind) {
      case 'egg':
        this.stats.eggs += 1;
        this.hud.toast(`맥반석 계란 ${this.stats.eggs}개째. 톡톡, 어깨에 깼어요.`);
        break;
      case 'sikhye':
        this.stats.sikhye += 1;
        this.hud.toast('식혜 한 모금. 시원해요.');
        break;
      case 'log': {
        const wasOut = this.fireState.litAt === null;
        const s = this.fire.addLog();
        this.stats.logs += 1;
        this.hud.toast(wasOut ? '불을 다시 지폈어요. 이번엔 꺼지지 않게 지켜요.' : `장작을 넣었어요. 불이 ${Math.round(s.fuel * 100)}%까지 살아났어요.`);
        break;
      }
    }
    saveStats(this.stats);
    this.hud.setStats(this.stats);
  }

  private exitSauna(announce = true) {
    if (!this.inSauna) return;
    const sec = Math.floor((performance.now() - this.saunaStart) / 1000);
    this.inSauna = false;
    this.stats.saunaSec += sec;
    saveStats(this.stats);
    this.hud.setStats(this.stats);
    this.hud.setSauna(false);
    this.hud.setActive(null);
    this.controls.setMaxDistance(11);
    this.player.setPose('idle');
    this.player.group.position.copy(this.world.saunaDoor);
    this.player.faceYaw(0);
    if (announce) {
      const m = Math.floor(sec / 60), s = sec % 60;
      this.hud.toast(m > 0 ? `불가마에서 ${m}분 ${s}초 버텼어요.` : `불가마에서 ${s}초 버텼어요.`, 3500);
    }
  }

  private nearestFreeMat(): number | null {
    const p = this.player.group.position;
    let best: number | null = null, bestD = Infinity;
    this.world.mats.forEach((m, i) => {
      if (this.occupiedMats.has(i)) return;
      const d = m.pos.distanceToSquared(p);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  }

  private clampToRoom(v: THREE.Vector3) {
    const b = this.world.bounds;
    v.x = THREE.MathUtils.clamp(v.x, b.minX, b.maxX);
    v.z = THREE.MathUtils.clamp(v.z, b.minZ, b.maxZ);
  }

  /** 불가마 벽과 매점을 통과하지 않게 밀어낸다 */
  private resolveObstacles(v: THREE.Vector3) {
    const w = this.world;
    const d = new THREE.Vector2(v.x - w.saunaCenter.x, v.z - w.saunaCenter.z);
    const min = w.saunaRadius + 0.35;
    if (d.length() < min) {
      d.normalize().multiplyScalar(min);
      v.x = w.saunaCenter.x + d.x; v.z = w.saunaCenter.z + d.y;
    }
    if (w.counterBox.containsPoint(v)) v.z = w.counterBox.min.z - 0.05;
  }

  // ───────── 봇 ─────────

  private spawnBots(peers: Peer[]) {
    const w = this.world;
    let saunaSeat = 1;
    for (const peer of peers) {
      const a = new Avatar(peer.name, peer.robe, peer.towel);
      const bot: Bot = { peer, avatar: a, nextWander: 2 + Math.random() * 6 };
      switch (peer.kind) {
        case 'lie': {
          const idx = peer.matIndex ?? 0;
          this.occupiedMats.add(idx);
          a.group.position.copy(w.mats[idx].pos);
          a.faceYaw(w.mats[idx].yaw);
          a.setPose('lie');
          break;
        }
        case 'sauna': {
          const seat = w.saunaSeats[Math.min(saunaSeat++, w.saunaSeats.length - 1)];
          a.group.position.copy(seat.pos); a.faceYaw(seat.yaw); a.setPose('sit');
          break;
        }
        case 'counter':
          a.group.position.set(w.counter.x + 1.4, 0, w.counter.z); a.faceYaw(0);
          break;
        case 'wander':
          a.group.position.set(-3, 0, 5); a.speed = 1.4;
          break;
      }
      this.scene.add(a.group);
      this.bots.push(bot);
    }
  }

  private updateBots(dt: number) {
    for (const b of this.bots) {
      if (b.peer.kind === 'wander') {
        b.nextWander -= dt;
        if (!b.avatar.target && b.nextWander <= 0) {
          const t = new THREE.Vector3(-4 + Math.random() * 8, 0, -2 + Math.random() * 8);
          this.resolveObstacles(t);
          b.avatar.target = t;
          b.nextWander = 5 + Math.random() * 9;
        }
      }
      b.avatar.update(dt);
    }
  }

  // ───────── 루프 ─────────

  private focusPoint() {
    const p = this.player.group.position.clone();
    p.y += this.player.pose === 'lie' ? 0.5 : 1.0;
    return p;
  }

  private frame() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const now = performance.now();

    // WASD
    const mv = this.controls.moveVector();
    if (mv && !this.hud.helpOpen) {
      if (!this.keyWalking) { this.standUp(); this.player.target = null; this.task = null; this.player.hold(null); this.keyWalking = true; }
      const p = this.player.group.position;
      p.addScaledVector(mv, this.player.speed * dt);
      this.clampToRoom(p);
      this.resolveObstacles(p);
      this.player.faceYaw(Math.atan2(mv.x, mv.z));
      if (this.player.pose !== 'walk') this.player.setPose('walk');
    } else if (this.keyWalking) {
      this.keyWalking = false;
      if (this.player.pose === 'walk') this.player.setPose('idle');
    }

    if (this.player.update(dt)) this.onArrive();
    if (this.task?.doingUntil && now >= this.task.doingUntil) this.finishTask();

    this.updateBots(dt);

    // 불
    const f = this.fireState.fuel;
    this.world.fire.update(dt, this.fireState.litAt === null ? 0 : f);
    (this.world.doorGlow.material as THREE.MeshBasicMaterial).opacity = 0.1 + 0.6 * (this.fireState.litAt === null ? 0 : f);
    const domeMat = this.world.dome.material as THREE.MeshStandardMaterial;
    const targetOpacity = this.inSauna ? 0.16 : 1;
    domeMat.opacity += (targetOpacity - domeMat.opacity) * Math.min(1, dt * 4);
    this.world.dome.castShadow = domeMat.opacity > 0.6;

    if (this.inSauna) {
      const sec = (now - this.saunaStart) / 1000;
      this.hud.setSauna(true, sec, sec / 600);
    }

    // 소리
    const dist = this.player.group.position.distanceTo(this.world.saunaCenter);
    const near = this.inSauna ? 1 : THREE.MathUtils.clamp(1 - (dist - 3) / 9, 0.05, 1);
    this.ambient.setCrackle(near * (this.fireState.litAt === null ? 0.05 : 0.3 + 0.7 * f));
    this.ambient.update(dt);

    this.controls.update(dt, this.focusPoint());
    this.renderer.render(this.scene, this.camera);
  }

  private resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
