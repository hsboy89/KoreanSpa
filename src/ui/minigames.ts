/**
 * 방마다 하나씩 있는 30초짜리 미니게임. 혼자서 하고, 점수에 따라 코인을 받는다.
 * 기록은 이 브라우저에만 남는다. 새 게임은 GAMES에 방 id로 추가한다.
 */
import type { RoomId } from '../scene/rooms';

export interface GameResult {
  /** 높을수록 좋은 점수. 내 최고 기록 비교에 쓴다 */
  score: number;
  /** 0~1. 코인을 얼마나 줄지 정한다 */
  rating: number;
  /** 결과 화면에 크게 보여줄 말 */
  label: string;
}

type Start = (stage: HTMLElement, done: (r: GameResult) => void) => () => void;
export interface MiniGame { id: RoomId; name: string; how: string; start: Start }

/** 한 판에 받을 수 있는 최대 코인과, 하루에 코인을 받을 수 있는 판 수(게임별) */
const MAX_COINS = 8;
const PAID_PLAYS = 5;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const button = (cls: string, text: string) => { const b = el('button', cls, text); b.type = 'button'; return b; };
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const shuffle = <T,>(arr: T[]) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

// ───────── 와인: 정량 따르기 ─────────
const pour: Start = (stage, done) => {
  const SPEED = [42, 58, 76];
  const errs: number[] = [];
  let round = 0, fill = 0, target = 0, pouring = false, locked = false, raf = 0, last = performance.now(), timer = 0;
  const info = el('p', 'mg-info');
  const glass = el('div', 'mg-glass');
  const liquid = el('i', 'mg-liquid');
  const line = el('span', 'mg-line');
  glass.append(liquid, line);
  const btn = button('btn solid mg-big', '누르고 있으면 따라져요');
  stage.append(info, glass, btn);

  const setup = () => {
    fill = 0; locked = false;
    target = 35 + Math.floor(Math.random() * 50);
    line.style.bottom = `${target}%`;
    liquid.style.height = '0%';
    info.textContent = `${round + 1} / 3 · 선에 딱 맞게 따라요`;
  };
  const release = () => {
    if (!pouring || locked) return;
    pouring = false; locked = true;
    const err = Math.abs(fill - target);
    errs.push(err);
    info.textContent = fill >= 100 ? '넘쳤어요!' : `오차 ${err.toFixed(1)}%`;
    timer = window.setTimeout(() => {
      round++;
      if (round < 3) { setup(); return; }
      const avg = errs.reduce((a, b) => a + b, 0) / errs.length;
      const rating = clamp01(1 - avg / 25);
      done({ score: Math.round(rating * 100), rating, label: `평균 오차 ${avg.toFixed(1)}%` });
    }, 1000);
  };
  const tick = (t: number) => {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    if (!pouring || locked) return;
    fill = Math.min(100, fill + SPEED[round] * dt);
    liquid.style.height = `${fill}%`;
    if (fill >= 100) release();
  };
  btn.addEventListener('pointerdown', e => { e.preventDefault(); if (!locked) pouring = true; });
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
  setup();
  raf = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(raf); window.clearTimeout(timer);
    window.removeEventListener('pointerup', release); window.removeEventListener('pointercancel', release);
  };
};

// ───────── 보드게임: 주사위 높낮이 ─────────
const dice: Start = (stage, done) => {
  const FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
  const GOAL = 10;
  const roll = () => [Math.floor(Math.random() * 6), Math.floor(Math.random() * 6)];
  const sum = (d: number[]) => d[0] + d[1] + 2;
  let cur = roll(), streak = 0, busy = false, timer = 0;
  const info = el('p', 'mg-info');
  const face = el('div', 'mg-dice');
  const row = el('div', 'mg-row');
  const hi = button('btn solid mg-big', '더 높다');
  const lo = button('btn ghost mg-big', '더 낮다');
  row.append(lo, hi);
  stage.append(info, face, row);

  const show = (d: number[], text: string) => { face.textContent = `${FACES[d[0]]} ${FACES[d[1]]}`; info.textContent = text; };
  const ask = () => { busy = false; show(cur, `합 ${sum(cur)} · 다음 주사위는? (${streak}연속)`); };
  const finish = () => done({ score: streak, rating: clamp01(streak / 7), label: `${streak}연속 성공` });
  const guess = (higher: boolean) => {
    if (busy) return;
    busy = true;
    const next = roll();
    const a = sum(cur), b = sum(next);
    const ok = b === a || (higher ? b > a : b < a);
    if (ok) streak++;
    show(next, ok ? (b === a ? `합 ${b} · 같아서 통과!` : `합 ${b} · 맞혔어요!`) : `합 ${b} · 아쉬워요`);
    cur = next;
    timer = window.setTimeout(() => (ok && streak < GOAL ? ask() : finish()), ok ? 800 : 1100);
  };
  hi.addEventListener('click', () => guess(true));
  lo.addEventListener('click', () => guess(false));
  ask();
  return () => window.clearTimeout(timer);
};

// ───────── 루프탑: 별똥별 잡기 ─────────
const stars: Start = (stage, done) => {
  const DURATION = 20_000;
  const start = performance.now();
  let caught = 0, spawnTimer = 0, clock = 0, over = false;
  const info = el('p', 'mg-info');
  const sky = el('div', 'mg-sky');
  stage.append(info, sky);

  const spawn = () => {
    if (over) return;
    const elapsed = performance.now() - start;
    const s = button('mg-star', '★');
    s.setAttribute('aria-label', '별똥별');
    s.style.left = `${4 + Math.random() * 80}%`;
    s.style.animationDuration = `${1.5 + Math.random() * 1.1}s`;
    s.addEventListener('animationend', () => s.remove());
    s.addEventListener('pointerdown', e => {
      e.preventDefault();
      if (over || s.classList.contains('is-hit')) return;
      caught++;
      s.classList.add('is-hit');
      window.setTimeout(() => s.remove(), 160);
    });
    sky.appendChild(s);
    spawnTimer = window.setTimeout(spawn, 520 - 220 * clamp01(elapsed / DURATION) + Math.random() * 120);
  };
  const tick = () => {
    const left = DURATION - (performance.now() - start);
    info.textContent = `남은 시간 ${Math.max(0, Math.ceil(left / 1000))}초 · 잡은 별 ${caught}개`;
    if (left > 0) return;
    over = true;
    window.clearInterval(clock); window.clearTimeout(spawnTimer);
    done({ score: caught, rating: clamp01(caught / 30), label: `별 ${caught}개` });
  };
  clock = window.setInterval(tick, 200);
  tick(); spawn();
  return () => { over = true; window.clearInterval(clock); window.clearTimeout(spawnTimer); };
};

// ───────── 러닝: 100m 달리기 ─────────
const sprint: Start = (stage, done) => {
  const STEP = 2.5;
  let meters = 0, lastFoot = '', startAt = 0, raf = 0, over = false;
  const info = el('p', 'mg-info', '왼발과 오른발을 번갈아 눌러요');
  const track = el('div', 'mg-track');
  const runner = el('i', 'mg-runner');
  track.appendChild(runner);
  const row = el('div', 'mg-row');
  const left = button('btn solid mg-big', '왼발');
  const right = button('btn solid mg-big', '오른발');
  row.append(left, right);
  stage.append(info, track, row);

  const step = (foot: string) => {
    if (over) return;
    if (foot === lastFoot) { info.textContent = '같은 발은 안 돼요! 번갈아 눌러요'; return; }
    lastFoot = foot;
    if (!startAt) startAt = performance.now();
    meters = Math.min(100, meters + STEP);
    runner.style.left = `${meters * 0.9}%`;
    runner.classList.toggle('is-alt');
    if (meters < 100) return;
    over = true;
    const t = (performance.now() - startAt) / 1000;
    done({ score: Math.max(0, Math.round((30 - t) * 10)), rating: clamp01((15 - t) / 9), label: `${t.toFixed(2)}초` });
  };
  const tick = () => {
    raf = requestAnimationFrame(tick);
    if (startAt && !over) info.textContent = `${meters.toFixed(0)}m · ${((performance.now() - startAt) / 1000).toFixed(1)}초`;
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.repeat) return;
    if (e.key === 'ArrowLeft') step('L'); else if (e.key === 'ArrowRight') step('R');
  };
  left.addEventListener('pointerdown', e => { e.preventDefault(); step('L'); });
  right.addEventListener('pointerdown', e => { e.preventDefault(); step('R'); });
  window.addEventListener('keydown', onKey);
  raf = requestAnimationFrame(tick);
  return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey); };
};

// ───────── 독서: 초성 퀴즈 ─────────
const BOOKS = [
  '어린 왕자', '데미안', '해리 포터', '채식주의자', '노인과 바다', '죄와 벌', '위대한 개츠비', '오만과 편견',
  '호밀밭의 파수꾼', '연금술사', '소나기', '토지', '삼국지', '홍길동전', '춘향전', '동물농장', '모모', '아몬드',
  '파친코', '변신', '이방인', '레 미제라블', '돈키호테', '걸리버 여행기', '키다리 아저씨', '빨간 머리 앤', '작은 아씨들',
  '나미야 잡화점의 기적', '불편한 편의점', '달러구트 꿈 백화점',
];
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const initials = (s: string) => [...s].map(ch => {
  const code = ch.charCodeAt(0) - 0xac00;
  return code >= 0 && code < 11172 ? CHO[Math.floor(code / 588)] : ch;
}).join('');

const chosung: Start = (stage, done) => {
  const ROUNDS = 5, LIMIT = 8000;
  const answers = shuffle(BOOKS).slice(0, ROUNDS);
  let round = 0, right = 0, startAt = 0, raf = 0, timer = 0, locked = false;
  const info = el('p', 'mg-info');
  const word = el('div', 'mg-word');
  const bar = el('div', 'quiz-track');
  const barFill = el('i');
  bar.appendChild(barFill);
  const list = el('div', 'mg-choices');
  stage.append(info, word, bar, list);

  const next = () => {
    round++;
    if (round < ROUNDS) { ask(); return; }
    done({ score: right * 20, rating: right / ROUNDS, label: `${ROUNDS}문제 중 ${right}개` });
  };
  const settle = (picked: HTMLButtonElement | null) => {
    if (locked) return;
    locked = true;
    const answer = answers[round];
    const ok = picked?.textContent === answer;
    if (ok) right++;
    list.querySelectorAll('button').forEach(b => {
      if (b.textContent === answer) b.classList.add('is-right');
      else if (b === picked) b.classList.add('is-wrong');
    });
    info.textContent = ok ? '정답!' : picked ? '아쉬워요' : '시간 초과!';
    timer = window.setTimeout(next, 900);
  };
  const ask = () => {
    locked = false;
    const answer = answers[round];
    info.textContent = `${round + 1} / ${ROUNDS} · 어떤 책일까요?`;
    word.textContent = initials(answer);
    list.textContent = '';
    for (const title of shuffle([answer, ...shuffle(BOOKS.filter(b => b !== answer)).slice(0, 3)])) {
      const b = button('mg-choice', title);
      b.addEventListener('click', () => settle(b));
      list.appendChild(b);
    }
    startAt = performance.now();
  };
  const tick = () => {
    raf = requestAnimationFrame(tick);
    if (locked) return;
    const left = 1 - (performance.now() - startAt) / LIMIT;
    barFill.style.transform = `scaleX(${clamp01(left).toFixed(3)})`;
    if (left <= 0) settle(null);
  };
  ask();
  raf = requestAnimationFrame(tick);
  return () => { cancelAnimationFrame(raf); window.clearTimeout(timer); };
};

// ───────── 클럽: 리듬 탭 ─────────
const rhythm: Start = (stage, done) => {
  const BEAT = 560, TRAVEL = 1300, COUNT = 24, LINE = 170, WINDOW = 180;
  const info = el('p', 'mg-info', '동그라미가 선에 닿을 때 눌러요');
  const lane = el('div', 'mg-lane');
  lane.appendChild(el('span', 'mg-hitline'));
  const btn = button('btn solid mg-big', '탭!');
  stage.append(info, lane, btn);

  const t0 = performance.now() + 1400;
  let at = 0;
  const notes = Array.from({ length: COUNT }, () => {
    at += Math.random() < 0.25 ? BEAT / 2 : BEAT;
    const node = el('i', 'mg-note');
    lane.appendChild(node);
    return { t: t0 + at, node, done: false };
  });
  let points = 0, combo = 0, best = 0, raf = 0, timer = 0, over = false;

  const retire = (n: (typeof notes)[number], cls: string) => {
    n.done = true;
    n.node.classList.add(cls);
    window.setTimeout(() => n.node.remove(), 180);
  };
  const tap = () => {
    if (over) return;
    const now = performance.now();
    const n = notes.find(x => !x.done && Math.abs(x.t - now) < WINDOW);
    if (!n) { combo = 0; info.textContent = '너무 빨라요'; return; }
    const perfect = Math.abs(n.t - now) < 70;
    points += perfect ? 2 : 1;
    combo++; best = Math.max(best, combo);
    retire(n, 'is-hit');
    info.textContent = `${perfect ? '완벽!' : '좋아요'} · ${combo}콤보`;
  };
  const tick = () => {
    raf = requestAnimationFrame(tick);
    const now = performance.now();
    for (const n of notes) {
      if (n.done) continue;
      const y = LINE - ((n.t - now) / TRAVEL) * LINE;
      n.node.style.transform = `translate(-50%, ${y.toFixed(1)}px)`;
      n.node.style.opacity = y < -24 ? '0' : '1';
      if (now - n.t > WINDOW) { combo = 0; retire(n, 'is-miss'); }
    }
    if (!over && notes.every(n => n.done)) {
      over = true;
      timer = window.setTimeout(() => done({ score: points, rating: clamp01(points / (COUNT * 2 * 0.85)), label: `${points}점 · 최고 ${best}콤보` }), 500);
    }
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === ' ' && !e.repeat) { e.preventDefault(); tap(); } };
  btn.addEventListener('pointerdown', e => { e.preventDefault(); tap(); });
  lane.addEventListener('pointerdown', e => { e.preventDefault(); tap(); });
  window.addEventListener('keydown', onKey);
  raf = requestAnimationFrame(tick);
  return () => { cancelAnimationFrame(raf); window.clearTimeout(timer); window.removeEventListener('keydown', onKey); };
};

export const GAMES: Record<RoomId, MiniGame> = {
  wine: { id: 'wine', name: '정량 따르기', how: '버튼을 누르고 있으면 와인이 따라져요. 선에 딱 맞을 때 손을 떼요. 3잔을 따라요.', start: pour },
  board: { id: 'board', name: '주사위 높낮이', how: '다음 주사위 두 개의 합이 지금보다 높을지 낮을지 맞혀요. 같으면 통과예요. 10연속이 끝이에요.', start: dice },
  rooftop: { id: 'rooftop', name: '별똥별 잡기', how: '밤하늘에 떨어지는 별을 20초 동안 눌러서 잡아요.', start: stars },
  run: { id: 'run', name: '100m 달리기', how: '왼발과 오른발을 번갈아 빠르게 눌러 100m를 달려요. 키보드는 ← → 키예요.', start: sprint },
  book: { id: 'book', name: '초성 퀴즈', how: '초성만 보고 책 제목을 골라요. 5문제이고 문제마다 8초예요.', start: chosung },
  club: { id: 'club', name: '리듬 탭', how: '내려오는 동그라미가 선에 닿는 순간 눌러요. 키보드는 스페이스바예요.', start: rhythm },
};

// ───────── 기록 (이 브라우저에만) ─────────
const KEY = 'parting.games';
interface Save { best: Record<string, number>; day: string; plays: Record<string, number> }

function loadSave(): Save {
  const today = new Date().toDateString();
  try {
    const d = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Save>;
    const best = d.best && typeof d.best === 'object' ? d.best : {};
    return d.day === today && d.plays && typeof d.plays === 'object' ? { best, day: today, plays: d.plays } : { best, day: today, plays: {} };
  } catch { return { best: {}, day: today, plays: {} }; }
}

export class MiniGamePanel {
  private stop: (() => void) | null = null;
  private game: MiniGame | null = null;

  /** @param onFinish 한 판이 끝났을 때. coins는 이번에 줄 코인(하루 한도를 넘으면 0) */
  constructor(private root: HTMLElement, private onFinish: (game: MiniGame, coins: number) => void) {}

  open(id: RoomId) {
    this.close();
    this.game = GAMES[id];
    this.intro();
  }

  /** 진행 중인 게임의 타이머와 입력을 정리한다 */
  close() {
    this.stop?.();
    this.stop = null;
  }

  private intro() {
    const game = this.game!;
    const save = loadSave();
    this.root.textContent = '';
    this.root.appendChild(el('p', undefined, game.how));
    const best = save.best[game.id];
    const left = Math.max(0, PAID_PLAYS - (save.plays[game.id] ?? 0));
    this.root.appendChild(el('p', 'mg-meta', `${best !== undefined ? `내 최고 ${best}점 · ` : ''}한 판에 코인 최대 ${MAX_COINS}개 · 오늘 코인 받는 판 ${left}번 남음`));
    const foot = el('div', 'modal-foot');
    const start = button('btn solid', '시작');
    start.addEventListener('click', () => this.play());
    foot.appendChild(start);
    this.root.appendChild(foot);
  }

  private play() {
    const game = this.game!;
    this.close();
    this.root.textContent = '';
    const stage = el('div', 'mg-stage');
    this.root.appendChild(stage);
    this.stop = game.start(stage, r => this.result(r));
  }

  private result(r: GameResult) {
    const game = this.game!;
    this.close();
    const save = loadSave();
    const plays = save.plays[game.id] ?? 0;
    const coins = plays < PAID_PLAYS ? Math.max(1, Math.round(clamp01(r.rating) * MAX_COINS)) : 0;
    const record = save.best[game.id] === undefined || r.score > save.best[game.id];
    if (record) save.best[game.id] = r.score;
    save.plays[game.id] = plays + 1;
    try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* ignore */ }
    this.onFinish(game, coins);

    this.root.textContent = '';
    this.root.appendChild(el('div', 'mg-result', r.label));
    this.root.appendChild(el('p', 'mg-meta', `${r.score}점${record ? ' · 내 최고 기록!' : ` · 내 최고 ${save.best[game.id]}점`}`));
    this.root.appendChild(el('p', undefined, coins ? `코인 ${coins}개를 받았어요.` : '오늘 이 게임에서 받을 코인은 다 받았어요. 기록 도전은 계속할 수 있어요.'));
    const foot = el('div', 'modal-foot');
    const again = button('btn solid', '한 판 더');
    again.addEventListener('click', () => this.play());
    foot.appendChild(again);
    this.root.appendChild(foot);
  }
}
