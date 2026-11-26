/**
 * 하루 한 번 광장에서 열리는 OX 퀴즈.
 * 진행은 전부 시계 기준이라 서버 없이도 모든 라운지가 같은 시각에 같은 문제를 본다.
 * 문제와 답이 브라우저에 들어 있으므로 조작이 가능하다. 실제 상품을 걸려면 서버 채점이 먼저다.
 */
import { ROOM_THEMES } from '../scene/rooms';

export interface Question { q: string; a: boolean; why: string }

/** 한국 시간 기준 시작 시각 */
export const QUIZ_HOUR = 21;
export const QUIZ_COUNT = 8;
export const COIN_PER_CORRECT = 5;
export const COIN_PERFECT = 50;

const SOON_MS = 10 * 60_000;
const INTRO_MS = 15_000;
const ASK_MS = 13_000;
const REVEAL_MS = 5_000;
const DONE_MS = 90_000;
const DAY_MS = 86_400_000;
const KST_MS = 9 * 3_600_000;

/**
 * 문제 은행. 날짜마다 여기서 QUIZ_COUNT개를 뽑는다.
 * 파팅 서비스에 대한 문제는 사실 확인이 필요해 넣지 않았다. 추가할 때는 a(정답)와 why(해설)를 같이 적는다.
 */
const BANK: Question[] = [
  { q: '레드 와인은 보통 화이트 와인보다 차갑게 마신다.', a: false, why: '화이트 와인을 더 차갑게 마셔요.' },
  { q: '샴페인은 프랑스 샹파뉴 지방의 스파클링 와인만 가리키는 이름이다.', a: true, why: '다른 지역 것은 스파클링 와인이라고 불러요.' },
  { q: '와인 잔을 돌리는 것은 향을 더 잘 나게 하려는 것이다.', a: true, why: '공기와 닿으면 향이 피어올라요.' },
  { q: '와인 한 병(750ml)은 보통 5~6잔쯤 나온다.', a: true, why: '한 잔에 125~150ml쯤 따라요.' },
  { q: '로제 와인은 대부분 레드와 화이트를 섞어서 만든다.', a: false, why: '대부분 적포도 껍질을 잠깐만 담가 색을 내요.' },
  { q: '체스에서 먼저 두는 쪽은 검은색이다.', a: false, why: '흰색이 먼저 둬요.' },
  { q: '루미큐브에는 조커가 4개 들어 있다.', a: false, why: '조커는 2개예요.' },
  { q: '할리갈리는 같은 과일이 정확히 5개 보이면 종을 친다.', a: true, why: '5개일 때 가장 먼저 종을 친 사람이 카드를 가져가요.' },
  { q: '젠가는 한 층에 블록을 4개씩 쌓는다.', a: false, why: '한 층에 3개씩 쌓아요.' },
  { q: '부루마불은 주사위 3개를 굴린다.', a: false, why: '주사위 2개를 굴려요.' },
  { q: "윷놀이에서 '모'가 나오면 다섯 칸을 가고 한 번 더 던진다.", a: true, why: '윷과 모는 한 번 더 던져요.' },
  { q: '마라톤 풀코스는 40km다.', a: false, why: '42.195km예요.' },
  { q: '하프 마라톤은 약 21km다.', a: true, why: '풀코스의 절반인 21.0975km예요.' },
  { q: '10km 달리기는 풀코스 마라톤의 절반이다.', a: false, why: '절반은 약 21km인 하프 마라톤이에요.' },
  { q: '육상 경기장 트랙의 한 바퀴는 400m다.', a: true, why: '가장 안쪽 레인 기준 400m예요.' },
  { q: '『어린 왕자』를 쓴 작가는 생텍쥐페리다.', a: true, why: '프랑스의 작가이자 비행사였어요.' },
  { q: '『해리 포터』 원작은 일곱 편으로 이루어져 있다.', a: true, why: '마법사의 돌부터 죽음의 성물까지 일곱 편이에요.' },
  { q: '『채식주의자』의 작가 한강은 노벨 문학상을 받았다.', a: true, why: '2024년에 받았어요.' },
  { q: '『데미안』의 작가는 괴테다.', a: false, why: '헤르만 헤세가 썼어요.' },
  { q: '셜록 홈즈를 만든 작가는 애거서 크리스티다.', a: false, why: '아서 코난 도일이 만들었어요.' },
  { q: '모히토에는 민트가 들어간다.', a: true, why: '럼, 라임, 민트, 탄산수로 만들어요.' },
  { q: '하이볼은 위스키에 탄산수를 섞은 술이다.', a: true, why: '얼음 잔에 위스키와 탄산수를 넣어요.' },
  { q: "술이 들어가지 않은 칵테일을 '목테일'이라고 부른다.", a: true, why: 'mock(가짜)과 cocktail을 합친 말이에요.' },
  { q: "DJ는 '디스크 자키'를 줄인 말이다.", a: true, why: 'Disc Jockey의 머리글자예요.' },
  { q: '보름달은 일주일에 한 번 뜬다.', a: false, why: '약 한 달(29.5일)에 한 번 떠요.' },
  { q: 'N서울타워(남산타워)는 한강 남쪽에 있다.', a: false, why: '한강 북쪽 용산구 남산에 있어요.' },
  { q: '맥주의 주원료는 보리를 싹 틔운 맥아다.', a: true, why: '맥아, 홉, 효모, 물로 만들어요.' },
  { q: '막걸리는 주로 쌀로 빚는다.', a: true, why: '쌀과 누룩으로 빚는 우리 술이에요.' },
  { q: '소주 한 병은 보통 500ml다.', a: false, why: '보통 360ml예요.' },
  { q: '토마토는 식물학적으로 열매(과일)에 속한다.', a: true, why: '씨를 품은 열매라서 식물학에서는 과일로 봐요.' },
  { q: '아메리카노는 에스프레소에 우유를 넣은 커피다.', a: false, why: '물을 넣어요. 우유를 넣으면 라테예요.' },
  { q: 'MBTI에서 E는 내향, I는 외향을 뜻한다.', a: false, why: '반대예요. E가 외향, I가 내향이에요.' },
  { q: '한 해는 정확히 50주다.', a: false, why: '52주에 하루(윤년은 이틀)가 더 있어요.' },
  { q: "'불금'은 '불타는 금요일'을 줄인 말이다.", a: true, why: '주말을 앞둔 금요일 밤을 뜻해요.' },
  { q: `이 라운지에는 카테고리 방이 ${ROOM_THEMES.length}개 있다.`, a: true, why: '광장을 둘러싸고 있어요. 전부 가 보셨나요?' },
  { q: `파팅 라운지 퀴즈는 매일 밤 ${QUIZ_HOUR - 12 + 2}시에 열린다.`, a: false, why: `매일 밤 ${QUIZ_HOUR - 12}시에 열려요.` },
];

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 그날의 문제. 같은 날이면 누구에게나 같은 순서로 나온다 */
export function questionsFor(day: number): Question[] {
  const rand = mulberry32(day * 2654435761);
  const pool = [...BANK];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, QUIZ_COUNT);
}

export type QuizPhase =
  /** 다음 퀴즈를 기다리는 중 */
  | { kind: 'idle'; startsIn: number }
  /** 시작 10분 전부터. 광장에 O/X 구역이 깔린다 */
  | { kind: 'soon'; startsIn: number }
  | { kind: 'intro'; startsIn: number; day: number }
  | { kind: 'ask'; day: number; index: number; question: Question; left: number; total: number }
  | { kind: 'reveal'; day: number; index: number; question: Question }
  | { kind: 'done'; day: number };

/**
 * 지금이 퀴즈의 어느 단계인지.
 * @param now 서버 시각에 맞춘 현재 시각(ms)
 * @param testStart 연습 퀴즈의 시작 시각. 주면 매일 일정 대신 이 시각에 한 번 연다
 */
export function quizPhase(now: number, testStart?: number): QuizPhase {
  const span = INTRO_MS + QUIZ_COUNT * (ASK_MS + REVEAL_MS);
  let day = Math.floor((now + KST_MS) / DAY_MS);
  let start = testStart ?? day * DAY_MS + QUIZ_HOUR * 3_600_000 - KST_MS;
  if (testStart !== undefined) day = -1;
  let t = now - start;
  if (t >= span + DONE_MS) {
    if (testStart !== undefined) return { kind: 'idle', startsIn: Infinity };
    start += DAY_MS; t = now - start;
  }
  if (t < -SOON_MS) return { kind: 'idle', startsIn: -t };
  if (t < 0) return { kind: 'soon', startsIn: -t };
  if (t < INTRO_MS) return { kind: 'intro', startsIn: INTRO_MS - t, day };
  if (t >= span) return { kind: 'done', day };
  const q = t - INTRO_MS;
  const index = Math.floor(q / (ASK_MS + REVEAL_MS));
  const within = q - index * (ASK_MS + REVEAL_MS);
  const question = questionsFor(day)[index];
  if (within < ASK_MS) return { kind: 'ask', day, index, question, left: ASK_MS - within, total: ASK_MS };
  return { kind: 'reveal', day, index, question };
}

/** "3시간 12분", "12:40" 같은 남은 시간 표기 */
export function formatLeft(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h}시간 ${m}분`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}
