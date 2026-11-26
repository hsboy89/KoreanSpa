import * as THREE from 'three';
import { buildWorld, type Seat, type World } from './scene/world';
import { Avatar, cupProp, DANCE_MS, randomOutfit, type Outfit } from './scene/avatar';
import { Controls } from './scene/controls';
import { Peers } from './scene/peers';
import { Hud, type ActionId } from './ui/hud';
import { Overlay, type OverlayEntry } from './ui/overlay';
import { inRect, PLAZA, ROOM_LAYOUTS, ROOM_THEMES, type RoomId } from './scene/rooms';
import { isSayable, mockPeers, randomName, type Peer } from './state/presence';
import { connectNet, LOUNGE_CAPACITY, LOUNGE_COUNT, type Msg, type Net, type PeerState, type XZ } from './state/net';
import { Ambient } from './audio/ambient';
import { clockOffset, createStatsApi, loadDone, saveDone, type Note, type Stats } from './state/stats';
import { COIN_PER_CORRECT, COIN_PERFECT, formatLeft, QUIZ_COUNT, QUIZ_HOUR, quizPhase, type QuizPhase } from './state/quiz';
import { Wallet } from './state/wallet';
import { WardrobePanel } from './ui/wardrobe';
import { GAMES, MiniGamePanel } from './ui/minigames';
import type { Hat } from './scene/avatar';
import { GuestbookPanel } from './ui/guestbook';
import type { Answers } from './state/survey';
import { SurveyPanel } from './ui/survey';

type Task = { kind: 'sit'; seat: Seat } | { kind: 'enter'; room: RoomId };

interface Bot { peer: Peer; avatar: Avatar; nextWander: number; seat: Seat | null }

export interface ConnectInfo { kind: 'supabase' | 'local'; offline: boolean; full: boolean; lounge: number }

const IDENTITY_KEY = 'parting.me';

/** 새로고침이나 라운지 이동 뒤에도 같은 이름과 옷으로 보이게 탭 단위로 기억한다 */
function loadIdentity(): { name: string; outfit: Outfit } {
  try {
    const saved = JSON.parse(sessionStorage.getItem(IDENTITY_KEY) ?? 'null');
    if (saved && typeof saved.name === 'string' && saved.outfit && typeof saved.outfit.top === 'number') return saved;
  } catch { /* 저장소를 못 쓰는 환경 */ }
  const me = { name: randomName(), outfit: randomOutfit() };
  try { sessionStorage.setItem(IDENTITY_KEY, JSON.stringify(me)); } catch { /* ignore */ }
  return me;
}

/** 유니온의 각 멤버에서 id를 뺀 타입 (Omit은 유니온을 합쳐 버린다) */
type MsgBody = Msg extends infer M ? (M extends Msg ? Omit<M, 'id'> : never) : never;

const PLAYER_RADIUS = 0.32;
const POS_SEND_MS = 250;
const TRACK_MS = 6000;
const LOCAL_EXPIRE_MS = 12000;

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private world: World;
  private player: Avatar;
  private bots: Bot[] = [];
  private controls: Controls;
  private hud: Hud;
  private overlay: Overlay;
  private peers: Peers;
  private ambient = new Ambient();
  private clock = new THREE.Clock();

  private myId = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  private net: Net | null = null;
  private lastPosSent = 0;
  private lastTrack = 0;

  private task: Task | null = null;
  private mySeat: Seat | null = null;
  private botSeats = new Set<Seat>();
  private zone: RoomId | null = null;
  private keyWalking = false;
  private cheersTimer = 0;
  private stall = 0;
  private lastDist = Infinity;
  /** 방에 들어갈 때 카메라를 당기는 목표 거리. null이면 사용자가 조절한 대로 둔다 */
  private zoomTo: number | null = null;
  /** 입장 직후의 전체 조망 상태. 화면을 처음 누르면 내 캐릭터 뒤로 내려간다 */
  private intro = true;
  private stats = createStatsApi();
  private statsData: Stats | null = null;
  private lastStats = 0;
  private done = loadDone();
  private survey!: SurveyPanel;
  private nudged = false;
  private guestbook!: GuestbookPanel;
  private notes: Note[] | null = null;
  private diving = false;
  private wallet = new Wallet();
  private wardrobe!: WardrobePanel;
  private minigame!: MiniGamePanel;
  /** 코인으로 바꾸기 전까지 쌓인 체류 초 */
  private stay = 0;
  /** 서버에 아직 알리지 않은 체류 초 */
  private dwell = 0;
  /** 주소에 ?quiz=test 를 붙이면 20초 뒤 연습 퀴즈가 한 번 열린다. 보상과 기록은 없다 */
  private quizTest = new URLSearchParams(location.search).get('quiz') === 'test' ? Date.now() + 20_000 : undefined;
  private quizKey = '';
  private quizSecond = -1;
  private quizAsked = -1;
  private quizAnswers = new Map<number, boolean>();
  private quizPlayed = false;
  private quizHint = '';
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

    this.camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.6, 600);

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

    const me = loadIdentity();
    this.player = new Avatar(me.name, this.wallet.outfit ?? me.outfit);
    this.player.group.position.copy(this.world.spawn);
    this.player.faceYaw(Math.PI);
    this.scene.add(this.player.group);

    this.overlay = new Overlay(root);
    this.peers = new Peers(this.scene, this.world, () => this.refreshPresence(), (id, text) => this.overlay.say(id, text));

    this.controls = new Controls(this.camera, this.renderer.domElement, this.world.floors, p => this.onClickFloor(p), e => this.onKey(e));
    this.controls.setInteractives(this.world.interactives, action => {
      if (this.hud.modalOpen) return;
      // 첫 터치는 무엇을 눌렀든 라운지 안으로 들어가는 동작이다
      if (this.intro) { this.dive(); return; }
      if (action === 'survey') this.openSurvey();
      else if (action === 'guestbook') this.openGuestbook();
    });
    // 처음엔 라운지 전체가 보이도록 멀리서 시작한다
    this.camera.position.set(this.world.spawn.x, 24, this.world.spawn.z + 21);
    this.controls.snapTo(this.focusPoint());

    this.hud = new Hud(root, {
      onAction: id => this.action(id),
      onGoRoom: id => this.goRoom(id),
      onSay: text => this.say(text),
      onSound: () => this.toggleSound(),
      onOpenLounges: () => void this.openLounges(),
      onInterest: () => void this.addInterest(),
      onPickLounge: n => this.pickLounge(n),
      onPartyClick: () => this.stats.event('party_click'),
      onOpenWardrobe: () => { this.wardrobe.render(); this.hud.showWardrobe(true); },
      onPlay: () => this.openGame(),
      onGameClosed: () => this.minigame.close(),
    });
    this.minigame = new MiniGamePanel(this.hud.gameBody, (game, coins) => {
      if (coins) this.earn(coins);
      this.stats.event(`game_${game.id}`);
    });
    this.wardrobe = new WardrobePanel(this.hud.wardrobeBody, this.wallet, () => this.player.outfit, (o, bought) => this.changeOutfit(o, bought));
    this.hud.setCoins(this.wallet.coins);
    this.hud.setLocation(null);
    this.survey = new SurveyPanel(this.hud.surveyBody, a => this.submitSurvey(a));
    this.guestbook = new GuestbookPanel(this.hud.guestbookBody, text => this.submitNote(text));
    this.refreshPresence();

    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.flushDwell(); else this.clock.getDelta(); });
    window.addEventListener('pagehide', () => this.flushDwell());

    // 가림 판정용 경계 상자. 벽과 명패는 움직이지 않으므로 한 번만 계산한다
    this.scene.updateMatrixWorld(true);
    this.occluderBoxes = this.world.occluders.map(m => new THREE.Box3().setFromObject(m).expandByScalar(0.45));
  }

  /** 실시간 서버에 붙는다. 서버가 없으면 같은 기기 탭끼리만 보이는 로컬 모드 + 연습용 봇 */
  async connect(): Promise<ConnectInfo> {
    const { net, offline, full, lounge } = await connectNet(this.myId, this.myState());
    this.net = net;
    net.onMessage(m => this.onNet(m));
    window.addEventListener('pagehide', () => net.close());
    // 봇은 서버 설정이 아예 없는 개발 환경에서만 보여준다
    if (net.kind === 'local' && !offline && !full) this.spawnBots(mockPeers());
    this.hud.setLounge(lounge, LOUNGE_CAPACITY);
    this.refreshPresence();
    // 방문을 기록하고 통계를 받아 온다. 실패해도 라운지는 그대로 열린다
    this.lastStats = performance.now();
    void this.stats.visit().then(s => this.applyStats(s));
    void this.refreshGuestbook();
    void this.refreshWinners();
    return { kind: net.kind, offline, full, lounge };
  }

  start(info: ConnectInfo) {
    if (info.full) this.hud.toast('지금은 라운지가 모두 찼어요. 혼자 둘러볼 수 있고, 잠시 뒤 다시 들어오면 자리가 날 거예요.', 8000);
    else if (info.offline) this.hud.toast('서버에 연결하지 못했어요. 지금은 이 기기의 다른 창만 보여요.', 6000);
    else if (info.kind === 'local') this.hud.toast(`${this.player.name}님, 연습 모드예요. 서버 설정이 없어 같은 기기의 다른 창만 서로 보여요.`, 5000);
    else this.hud.toast(`${this.player.name}님, 파팅 라운지예요. 화면을 누르면 안으로 들어가요.`, 5000);
    const bonus = this.wallet.claimDaily();
    if (bonus) {
      this.hud.setCoins(this.wallet.coins);
      window.setTimeout(() => this.hud.toast(`오늘 첫 방문이라 코인 ${bonus}개를 받았어요. 왼쪽 위 코인을 누르면 옷장이 열려요.`, 5000), 5600);
    }
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ───────── 코인 · 옷장 · 체류 시간 ─────────

  private earn(n: number) {
    this.wallet.add(n);
    this.hud.setCoins(this.wallet.coins);
  }

  /** 화면이 보이는 동안만 불린다. 1분마다 코인을 주고 체류 시간을 서버에 알린다 */
  private tickStay(dt: number) {
    this.stay += dt;
    this.dwell += dt;
    if (this.stay >= 60) { this.stay -= 60; this.earn(this.mySeat ? 2 : 1); }
    if (this.dwell >= 60) this.flushDwell();
  }

  private flushDwell() {
    if (this.dwell < 5) return;
    this.stats.dwell(this.dwell);
    this.dwell = 0;
  }

  private changeOutfit(outfit: Outfit, bought: Hat | null) {
    this.wallet.setOutfit(outfit);
    this.player = Avatar.restyle(this.player, outfit, this.scene);
    this.hud.setCoins(this.wallet.coins);
    this.track();
    if (bought) this.stats.event('wardrobe');
  }

  /** 지금 있는 방의 미니게임을 연다 */
  private openGame() {
    if (!this.zone || this.hud.modalOpen) return;
    this.task = null;
    this.player.stop();
    this.minigame.open(this.zone);
    this.hud.showGame(true, GAMES[this.zone].name);
  }

  // ───────── 하루 한 번 OX 퀴즈 ─────────

  /** 광장 왼쪽이면 O(true), 오른쪽이면 X(false), 광장 밖이면 null */
  private quizSide(): boolean | null {
    const p = this.player.group.position;
    if (this.zone !== null || !inRect(PLAZA, p.x, p.z)) return null;
    return p.x < 0;
  }

  /** index번 문제까지 전부 맞혔는지 */
  private quizAlive(index: number) {
    for (let i = 0; i <= index; i++) if (!this.quizAnswers.get(i)) return false;
    return true;
  }

  private updateQuiz() {
    const test = this.quizTest !== undefined;
    const ph = quizPhase(Date.now() + clockOffset(), this.quizTest);
    const key = ph.kind + ('index' in ph ? ph.index : '');
    if (key !== this.quizKey) { this.quizKey = key; this.onQuizPhase(ph, test); }

    const second = Math.floor(Date.now() / 1000);
    if (second !== this.quizSecond) {
      this.quizSecond = second;
      if (ph.kind === 'idle') this.hud.setQuizChip(Number.isFinite(ph.startsIn) ? `밤 ${QUIZ_HOUR - 12}시 퀴즈까지 ${formatLeft(ph.startsIn)}` : '', false);
      else if (ph.kind === 'soon') this.hud.setQuizChip(`${test ? '연습 퀴즈' : '퀴즈'} 시작까지 ${formatLeft(ph.startsIn)}`, true);
      else if (ph.kind === 'done') this.hud.setQuizChip('퀴즈가 끝났어요', false);
      else this.hud.setQuizChip('퀴즈 진행 중', true);
    }

    if (ph.kind === 'ask') {
      const side = this.quizSide();
      this.hud.setQuizProgress(ph.left / ph.total, side === null ? '광장으로 와서 O는 파란 바닥, X는 분홍 바닥에 서요' : `지금 내 답: ${side ? 'O (파란 바닥)' : 'X (분홍 바닥)'}`);
    } else if (ph.kind === 'intro') {
      this.hud.setQuizProgress(0, `${Math.ceil(ph.startsIn / 1000)}초 뒤 첫 문제가 나와요`);
    } else if (ph.kind === 'reveal') {
      const n = this.peers.quizAlive(ph.index) + (this.quizAlive(ph.index) ? 1 : 0);
      this.hud.setQuizProgress(0, `${this.quizHint} · 전부 맞힌 사람 ${n}명`);
    }
  }

  private onQuizPhase(ph: QuizPhase, test: boolean) {
    const label = test ? '연습 퀴즈' : '오늘의 파팅 퀴즈';
    switch (ph.kind) {
      case 'idle':
        this.world.setQuizZones(false);
        this.hud.setQuizCard(null);
        break;
      case 'soon':
        this.world.setQuizZones(true);
        this.hud.setQuizCard(null);
        this.hud.toast(`${formatLeft(ph.startsIn)} 뒤 광장에서 OX 퀴즈가 열려요. O는 파란 바닥, X는 분홍 바닥이에요.`, 7000);
        break;
      case 'intro':
        this.quizAnswers.clear();
        this.quizPlayed = false;
        this.quizAsked = -1;
        this.world.setQuizZones(true);
        this.hud.closeModals();
        // 광장에 있으면 파란 바닥과 분홍 바닥이 한눈에 보이게 한 번 물러난다
        if (!this.intro && !this.diving && this.zone === null && this.controls.distance() < 14) this.zoomTo = 17;
        this.hud.setQuizCard({ step: label, text: '곧 시작해요! 광장으로 모이세요', hint: '', tone: 'info' });
        break;
      case 'ask':
        this.quizAsked = ph.index;
        this.world.setQuizZones(true);
        this.hud.setQuizCard({ step: `${label} ${ph.index + 1} / ${QUIZ_COUNT}`, text: ph.question.q, hint: '', tone: 'ask' });
        break;
      case 'reveal': {
        this.world.setQuizZones(true, ph.question.a);
        // 문제를 보지 못한 채 정답 공개부터 본 경우(방금 들어왔거나 화면을 꺼 뒀던 경우)는 채점하지 않는다
        const side = this.quizAsked === ph.index ? this.quizSide() : null;
        const ok = side !== null && side === ph.question.a;
        this.quizAnswers.set(ph.index, ok);
        if (side !== null) {
          if (!this.quizPlayed) { this.quizPlayed = true; if (!test) this.stats.event('quiz_join'); }
          this.overlay.say(this.myId, ok ? '⭕ 정답' : '💦 땡');
          this.send({ t: 'quiz', q: ph.index, ok, alive: this.quizAlive(ph.index) });
          if (ok) { this.player.play('wave', 1400); if (!test) this.earn(COIN_PER_CORRECT); }
        }
        this.quizHint = side === null ? '광장 안에 서 있어야 답으로 쳐요' : ok ? (test ? '정답!' : `정답! 코인 +${COIN_PER_CORRECT}`) : '아쉬워요. 다음 문제를 맞히면 코인은 받아요';
        this.hud.setQuizCard({ step: `정답은 ${ph.question.a ? 'O' : 'X'}`, text: ph.question.why, hint: this.quizHint, tone: ok ? 'right' : 'wrong' });
        break;
      }
      case 'done':
        this.world.setQuizZones(false);
        this.hud.setQuizCard(null);
        this.finishQuiz(test);
        break;
    }
  }

  private finishQuiz(test: boolean) {
    if (!this.quizPlayed) return;
    const right = [...this.quizAnswers.values()].filter(Boolean).length;
    const perfect = right === QUIZ_COUNT;
    this.quizPlayed = false;
    this.quizAnswers.clear();
    const lines: string[] = [];
    if (test) {
      lines.push(`${QUIZ_COUNT}문제 중 ${right}개를 맞혔어요.`, `연습이라 코인과 왕관은 없어요. 진짜 퀴즈는 매일 밤 ${QUIZ_HOUR - 12}시에 열려요.`);
    } else if (perfect) {
      this.wallet.grantCrown();
      this.earn(COIN_PERFECT);
      this.stats.quizWin(this.player.name);
      this.stats.event('quiz_perfect');
      this.changeOutfit({ ...this.player.outfit, hat: 'crown' }, null);
      window.setTimeout(() => void this.refreshWinners(), 4000);
      lines.push(`${QUIZ_COUNT}문제를 전부 맞혔어요.`, `우승 왕관을 24시간 동안 쓰고, 코인 ${right * COIN_PER_CORRECT + COIN_PERFECT}개를 받았어요.`, '광장 벽의 퀴즈 안내판에 이름이 올라가요.');
    } else {
      lines.push(`코인 ${right * COIN_PER_CORRECT}개를 받았어요.`, `전부 맞히면 왕관을 써요. 내일 밤 ${QUIZ_HOUR - 12}시에 다시 도전해요.`);
    }
    this.hud.showResult(true, perfect ? '전부 맞혔어요! 👑' : `${QUIZ_COUNT}문제 중 ${right}개 정답`, lines);
  }

  /** 광장 벽 안내판에 가장 최근 우승자를 적는다 */
  private async refreshWinners() {
    const w = await this.stats.winners();
    if (!w || !w.count) return;
    const kst = (ms: number) => new Date(ms + clockOffset() + 9 * 3_600_000).toISOString().slice(0, 10);
    const when = w.day === kst(Date.now()) ? '오늘' : w.day === kst(Date.now() - 86_400_000) ? '어제' : `${Number(w.day.slice(5, 7))}월 ${Number(w.day.slice(8, 10))}일`;
    const more = w.count > w.names.length ? ` 외 ${w.count - w.names.length}명` : '';
    this.world.setQuizBoard(`${when} 우승 ${w.count}명`, w.names.join(' · ') + more);
  }

  // ───────── 네트워크 ─────────

  private myState(): PeerState {
    const p = this.player.group.position;
    return {
      name: this.player.name,
      outfit: this.outfitOf(this.player),
      pos: [p.x, p.z],
      yaw: this.player.group.rotation.y,
      pose: this.player.pose,
      seat: this.mySeat ? this.world.seats.indexOf(this.mySeat) : null,
      room: this.zone,
    };
  }

  private outfitOf(a: Avatar) { return a.outfit; }

  private send(m: MsgBody) {
    this.net?.send({ ...m, id: this.myId } as Msg);
  }

  private track() {
    this.lastTrack = performance.now();
    this.net?.track(this.myState());
  }

  private onNet(m: Msg) {
    // 늦게 들어온 사람은 Presence 스냅샷으로 내 상태를 받으므로 여기서 다시 보낼 필요가 없다
    this.peers.apply(m, performance.now());
  }

  private async openLounges() {
    const net = this.net;
    if (!net || !net.lounge) { this.hud.toast('지금은 라운지에 연결돼 있지 않아요.'); return; }
    this.hud.setLounges(null, net.lounge, LOUNGE_CAPACITY, LOUNGE_COUNT);
    this.hud.showLounges(true);
    const counts = await net.loungeCounts();
    this.hud.setLounges(counts, net.lounge, LOUNGE_CAPACITY, LOUNGE_COUNT);
  }

  /** 다른 라운지로 옮긴다. 주소에 번호를 실어 다시 들어가는 방식이고 이름과 옷은 그대로 유지된다 */
  private pickLounge(n: number) {
    this.hud.showLounges(false);
    if (n === this.net?.lounge) return;
    this.hud.toast(`라운지 ${n}(으)로 옮기는 중이에요.`, 6000);
    const url = new URL(location.href);
    url.searchParams.set('l', String(n));
    location.href = url.toString();
  }

  // ───────── 방문 집계 · 설문 ─────────

  private applyStats(s: Stats | null) {
    if (!s) return;
    this.statsData = s;
    this.hud.setSurveyEnabled(true);
    this.world.setCounter(s.visits, s.today);
    for (const t of ROOM_THEMES) this.world.setInterest(t.id, s.interest[t.id] ?? 0);
    this.refreshInterest();
  }

  private refreshInterest() {
    const s = this.statsData;
    if (!s || !this.zone) { this.hud.setInterest(null); return; }
    this.hud.setInterest({ count: s.interest[this.zone] ?? 0, done: this.done.interest.includes(this.zone) });
  }

  private async addInterest() {
    const zone = this.zone;
    if (!zone || !this.statsData || this.done.interest.includes(zone)) return;
    this.done.interest.push(zone);
    saveDone(this.done);
    this.statsData.interest[zone] = (this.statsData.interest[zone] ?? 0) + 1;
    this.applyStats(this.statsData);
    this.hud.toast('기록했어요. 이 파티가 열리면 파팅에서 만나요.');
    this.applyStats(await this.stats.addInterest(zone));
  }

  private openSurvey() {
    if (!this.statsData) { this.hud.toast('설문은 아직 준비 중이에요.'); return; }
    this.hud.showSurvey(true);
    if (this.done.survey) this.survey.showResults(this.statsData);
    else this.survey.start();
  }

  private async submitSurvey(a: Answers) {
    const s = await this.stats.submitSurvey(a);
    if (s) { this.done.survey = true; saveDone(this.done); this.applyStats(s); }
    return s;
  }

  private async refreshGuestbook() {
    const notes = await this.stats.notes();
    if (!notes) return;
    this.notes = notes;
    this.hud.setGuestbookEnabled(true);
    this.world.setGuestbook(notes.map(n => n.message));
    this.guestbook.render(notes);
  }

  private openGuestbook() {
    if (!this.notes) { this.hud.toast('방명록은 아직 준비 중이에요.'); return; }
    this.guestbook.render(this.notes);
    this.hud.showGuestbook(true);
    void this.refreshGuestbook();
  }

  /** @returns 빈 문자열이면 성공, 아니면 사용자에게 보여줄 사유 */
  private async submitNote(text: string): Promise<string> {
    const result = await this.stats.addNote(text);
    if (result === 'ok') { await this.refreshGuestbook(); return ''; }
    if (result === 'daily') return '오늘은 이미 남겼어요. 내일 또 남겨주세요.';
    if (result === 'blocked') return '링크, 연락처, 거친 말은 남길 수 없어요.';
    if (result === 'length') return '2자에서 30자 사이로 적어주세요.';
    return '남기지 못했어요. 잠시 뒤에 다시 해주세요.';
  }

  private refreshPresence() {
    this.hud.setPresence(this.peers.count + this.bots.length + 1);
    this.refreshRoomCards();
  }

  // ───────── 입력 ─────────

  /** 전체 조망에서 내 캐릭터 바로 뒤 시점으로 내려간다 */
  private dive() {
    if (!this.intro) return;
    this.intro = false;
    this.diving = true;
    this.zoomTo = null;
  }

  private onClickFloor(p: THREE.Vector3) {
    if (this.hud.modalOpen) return;
    // 첫 터치는 이동이 아니라 라운지 안으로 들어가는 동작이다
    if (this.intro) { this.dive(); return; }
    const target = p.clone();
    target.y = 0;
    // 걷는 중 밀려나는 반경보다 넉넉히 보정해야 목표에 도착할 수 있다
    this.pushOutOfObstacles(target, PLAYER_RADIUS + 0.06);
    this.pushOutOfWalls(target, PLAYER_RADIUS + 0.06);
    this.task = null;
    this.standUp();
    this.go(this.pathTo(target));
  }

  private onKey(e: KeyboardEvent) {
    if (e.repeat) return;
    if (e.key === 'Escape') { this.hud.closeModals(); return; }
    if (this.hud.modalOpen) return;
    const map: Record<string, ActionId> = { '1': 'rooms', '2': 'sit', '3': 'wave', '4': 'cheers', '5': 'dance', '6': 'say', '7': 'survey', '8': 'guestbook' };
    const a = map[e.key];
    if (a) this.action(a);
  }

  private action(id: ActionId) {
    switch (id) {
      case 'rooms':
        this.refreshRoomCards();
        this.hud.showRooms(true);
        break;
      case 'say':
        this.hud.showSay(true);
        break;
      case 'survey':
        this.openSurvey();
        break;
      case 'guestbook':
        this.openGuestbook();
        break;
      case 'sit': {
        if (this.mySeat) { this.standUp(); this.hud.toast('일어났어요.'); break; }
        const seat = this.nearestFreeSeat();
        if (!seat) { this.hud.toast('근처에 빈 자리가 없어요. 다른 방으로 가볼까요?'); break; }
        this.task = { kind: 'sit', seat };
        this.go(this.pathTo(seat.pos));
        this.hud.toast('빈 자리로 걸어가요.');
        break;
      }
      case 'wave':
        this.player.play('wave');
        this.send({ t: 'emote', kind: 'wave' });
        this.hud.toast('손을 흔들었어요.');
        break;
      case 'cheers':
        this.player.hold(cupProp());
        this.player.play('cheers', 2000);
        this.send({ t: 'emote', kind: 'cheers' });
        window.clearTimeout(this.cheersTimer);
        this.cheersTimer = window.setTimeout(() => this.player.hold(null), 2100);
        this.hud.toast('건배!');
        break;
      case 'dance':
        window.clearTimeout(this.cheersTimer);
        this.player.hold(null);
        this.player.play('dance', DANCE_MS);
        this.send({ t: 'emote', kind: 'dance' });
        this.hud.toast('막춤 타임!');
        break;
    }
  }

  private say(text: string) {
    if (!isSayable(text)) return;
    this.overlay.say(this.myId, text);
    this.send({ t: 'say', text });
  }

  private goRoom(id: RoomId) {
    const info = this.world.rooms.get(id)!;
    const theme = ROOM_THEMES.find(t => t.id === id)!;
    this.standUp();
    this.task = { kind: 'enter', room: id };
    const inside = info.doorIn.clone().addScaledVector(info.center.clone().sub(info.doorIn).normalize(), 1.2);
    this.go(this.pathTo(inside));
    this.hud.toast(`${theme.name} 방으로 걸어가요.`);
  }

  private async toggleSound() {
    const on = await this.ambient.toggle();
    this.hud.setSound(on);
    this.hud.toast(on ? '소리를 켰어요. 방마다 다른 음악이 흘러요.' : '소리를 껐어요.');
  }

  // ───────── 이동 · 경로 ─────────

  /** 내 캐릭터를 걷게 하고 다른 사람들에게도 같은 경로를 보낸다 */
  private go(path: THREE.Vector3[]) {
    this.player.walkTo(path);
    const p = this.player.group.position;
    this.send({ t: 'walk', from: [p.x, p.z], path: path.map(v => [v.x, v.z] as XZ) });
  }

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
    if (this.mySeat) {
      this.mySeat = null;
      this.hud.setSeated(false);
      this.player.group.position.y = 0;
      this.send({ t: 'stand' });
      this.track();
    }
    if (this.player.pose === 'sit') this.player.setPose('idle');
  }

  private nearestFreeSeat(): Seat | null {
    const p = this.player.group.position;
    const zone = this.zoneOf(p);
    const remote = this.peers.takenSeats();
    let best: Seat | null = null, bestD = Infinity;
    this.world.seats.forEach((s, i) => {
      if (s.room !== zone || this.botSeats.has(s) || remote.has(i)) return;
      const d = s.pos.distanceToSquared(p);
      if (d < bestD) { bestD = d; best = s; }
    });
    return best;
  }

  private onArrive() {
    const task = this.task;
    this.task = null;
    if (!task) return;
    if (task.kind === 'sit') {
      const index = this.world.seats.indexOf(task.seat);
      if (this.botSeats.has(task.seat) || this.peers.takenSeats().has(index)) { this.hud.toast('누가 먼저 앉았어요. 다른 자리를 찾아요.'); this.action('sit'); return; }
      this.mySeat = task.seat;
      this.player.group.position.copy(task.seat.pos);
      this.player.faceYaw(task.seat.yaw);
      this.player.setPose('sit');
      this.hud.setSeated(true);
      this.send({ t: 'sit', seat: index });
      this.track();
      this.hud.toast('앉았어요. 같이 앉은 사람에게 손을 흔들어 볼까요?');
    }
  }

  private onZoneChange(zone: RoomId | null) {
    this.zone = zone;
    this.ambient.setStyle(zone ?? 'plaza');
    const theme = zone ? ROOM_THEMES.find(t => t.id === zone)! : null;
    this.hud.setLocation(theme);
    this.hud.setPlay(zone ? GAMES[zone].name : null);
    // 멀리서 보고 있다가 방에 들어가면 가까이 당긴다
    if (zone && this.intro) this.dive();
    else if (zone && !this.diving && this.controls.distance() > 13) this.zoomTo = 9;
    if (theme && this.statsData && !this.done.survey && !this.nudged) {
      this.nudged = true;
      this.hud.toast(`${theme.name} 방이에요. 30초 설문에 답하면 다른 사람들 답을 볼 수 있어요.`, 5000);
    } else if (theme) this.hud.toast(`${theme.name} 방이에요. 이번 주 파티는 '파티 보기'에서 볼 수 있어요.`, 3600);
    else this.hud.toast('광장이에요. 방 목록에서 다른 파티를 골라요.', 2400);
    this.track();
    this.refreshRoomCards();
    this.refreshInterest();
  }

  private refreshRoomCards() {
    this.hud.setRooms(ROOM_THEMES.map(theme => ({
      theme,
      count: this.bots.filter(b => b.peer.room === theme.id).length + this.peers.roomCount(theme.id) + (this.zone === theme.id ? 1 : 0),
    })));
  }

  // ───────── 봇 (서버 없는 연습 모드) ─────────

  private spawnBots(peers: Peer[]) {
    for (const peer of peers) {
      const a = new Avatar(peer.name, peer.outfit);
      a.speed = 1.5;
      const bot: Bot = { peer, avatar: a, nextWander: 2 + Math.random() * 6, seat: null };
      const room = peer.room ? this.world.rooms.get(peer.room)! : null;
      if (peer.kind === 'seat') {
        const free = this.world.seats.filter(s => s.room === (peer.room ?? null) && !this.botSeats.has(s));
        const seat = free[Math.floor(Math.random() * free.length)];
        if (seat) {
          this.botSeats.add(seat); bot.seat = seat;
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

  private updateOverlay(now: number) {
    const head = new THREE.Vector3(0, 1.9, 0);
    const entries: OverlayEntry[] = [{ id: this.myId, name: this.player.name, head: this.player.group.position.clone().add(head), mine: true }];
    for (const [id, r] of this.peers.entries()) entries.push({ id, name: r.state.name, head: r.avatar.group.position.clone().add(head) });
    this.overlay.update(this.camera, entries, now);
  }

  private frame() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const now = performance.now();

    const mv = this.controls.moveVector();
    if (mv && !this.hud.modalOpen) {
      if (!this.keyWalking) { this.standUp(); this.player.stop(); this.task = null; this.keyWalking = true; this.dive(); }
      const p = this.player.group.position;
      p.addScaledVector(mv, this.player.speed * dt);
      this.player.faceYaw(Math.atan2(mv.x, mv.z));
      if (this.player.pose !== 'walk') this.player.setPose('walk');
      if (now - this.lastPosSent > POS_SEND_MS) { this.lastPosSent = now; this.send({ t: 'pos', pos: [p.x, p.z], yaw: this.player.group.rotation.y }); }
    } else if (this.keyWalking) {
      this.keyWalking = false;
      if (this.player.pose === 'walk') this.player.setPose('idle');
      const p = this.player.group.position;
      this.send({ t: 'pos', pos: [p.x, p.z], yaw: this.player.group.rotation.y });
      this.track();
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
    if (arrived) {
      this.onArrive();
      // 멈춘 위치를 스냅샷에 남겨 늦게 들어온 사람도 제자리에서 보게 한다
      if (!this.mySeat) this.track();
    }

    const zone = this.zoneOf(this.player.group.position);
    if (zone !== this.zone) this.onZoneChange(zone);
    // 로컬 모드는 주기적 신호로 살아 있음을 알린다. 서버 모드는 Presence가 대신한다
    if (this.net?.kind === 'local' && now - this.lastTrack > TRACK_MS) this.track();

    if (now - this.lastStats > 60000) { this.lastStats = now; void this.stats.load().then(s => this.applyStats(s)); void this.refreshGuestbook(); void this.refreshWinners(); }
    this.tickStay(dt);
    this.updateQuiz();
    this.updateBots(dt);
    this.peers.update(dt, now, this.net?.kind === 'local' ? LOCAL_EXPIRE_MS : null);
    this.world.update(dt);

    this.ambient.update();

    if (this.diving && this.controls.approach(6.2, 1.12, Math.min(1, dt * 2.6))) this.diving = false;
    if (this.zoomTo !== null) {
      const d = this.controls.distance();
      if (Math.abs(d - this.zoomTo) < 0.2) this.zoomTo = null;
      else this.controls.setDistance(THREE.MathUtils.lerp(d, this.zoomTo, Math.min(1, dt * 3)));
    }
    this.controls.update(dt, this.focusPoint());
    this.fadeOccluders();
    this.renderer.render(this.scene, this.camera);
    this.updateOverlay(now);
  }

  private resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
