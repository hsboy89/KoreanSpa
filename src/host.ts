/**
 * 주최자용 현황 페이지. 주소에 ?host 를 붙이면 3D 라운지 대신 이 페이지가 열린다.
 * 합계만 보여주며 개별 응답은 서버에서 내려오지 않는다.
 */
import './host.css';
import { createStatsApi, type Stats } from './state/stats';
import { QUESTIONS, labelOf } from './state/survey';
import { ROOM_THEMES, PARTING_URL } from './scene/rooms';
import { barList } from './ui/survey';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

const fmt = (n: number) => n.toLocaleString('ko-KR');

const duration = (sec: number) => (sec >= 60 ? `${Math.floor(sec / 60)}분 ${Math.round(sec % 60)}초` : `${Math.round(sec)}초`);

function card(label: string, value: string, hint: string) {
  const c = el('div', 'host-card');
  c.append(el('small', undefined, label), el('strong', undefined, value), el('span', undefined, hint));
  return c;
}

function dailyChart(daily: Stats['daily']) {
  const box = el('section', 'bars');
  box.appendChild(el('h3', undefined, '최근 14일 방문'));
  if (!daily.length) { box.appendChild(el('p', 'host-empty', '아직 기록이 없어요.')); return box; }
  const max = Math.max(1, ...daily.map(d => d.n));
  const chart = el('div', 'host-daily');
  for (const d of daily) {
    const col = el('div', 'host-day');
    const bar = el('i');
    bar.style.height = `${Math.max(4, Math.round((d.n / max) * 100))}%`;
    col.append(el('b', undefined, String(d.n)), bar, el('span', undefined, d.day.slice(5).replace('-', '/')));
    chart.appendChild(col);
  }
  box.appendChild(chart);
  return box;
}

/** "강남 · 서초에서 와인 · 다이닝 12명" 식의 상위 조합 */
function topCombos(cross: Stats['cross']) {
  const box = el('section', 'bars');
  box.appendChild(el('h3', undefined, '지역 × 모임 수요 상위'));
  const rows: { text: string; n: number }[] = [];
  for (const [cat, regs] of Object.entries(cross)) for (const [reg, n] of Object.entries(regs)) {
    rows.push({ text: `${labelOf('region', reg)}에서 ${labelOf('category', cat)}`, n });
  }
  rows.sort((a, b) => b.n - a.n);
  if (!rows.length) { box.appendChild(el('p', 'host-empty', '설문 응답이 모이면 여기에 나와요.')); return box; }
  const list = el('ol', 'host-combos');
  for (const r of rows.slice(0, 10)) {
    const li = el('li');
    li.append(el('span', undefined, r.text), el('b', undefined, `${fmt(r.n)}명`));
    list.appendChild(li);
  }
  box.appendChild(list);
  return box;
}

function render(root: HTMLElement, s: Stats | null) {
  root.textContent = '';
  const head = el('header', 'host-head');
  head.append(el('h1', undefined, '파팅 라운지 현황'), el('p', undefined, '주최를 검토하는 분께 보여드리는 실제 방문과 수요 데이터예요.'));
  root.appendChild(head);

  if (!s) {
    root.appendChild(el('p', 'host-empty', '데이터를 불러오지 못했어요. 잠시 뒤에 새로고침해 주세요.'));
    return;
  }

  const cards = el('div', 'host-cards');
  cards.append(
    card('누적 방문', fmt(s.visits), '하루에 한 번씩 집계'),
    card('방문자', fmt(s.visitors), '브라우저 기준'),
    card('오늘 방문', fmt(s.today), '한국 시간 기준'),
    card('설문 응답', fmt(s.surveyCount), '응답자 수'),
    card('평균 체류', s.dwellAvg ? duration(s.dwellAvg) : '-', '방문 한 번에 머문 시간'),
    card('파티 보기 클릭', fmt(s.events.party_click ?? 0), '파팅으로 넘어간 사람'),
    card('퀴즈 참여', fmt(s.events.quiz_join ?? 0), '밤 9시 OX 퀴즈'),
    card('모자 구매', fmt(s.events.wardrobe ?? 0), '코인을 모아 꾸민 사람'),
  );
  root.appendChild(cards);

  const grid = el('div', 'host-grid');
  grid.appendChild(dailyChart(s.daily));
  grid.appendChild(barList('열리면 가겠다고 누른 수', ROOM_THEMES.map(t => ({ key: t.id, label: t.name })), s.interest));
  grid.appendChild(barList('방별 미니게임을 한 사람', ROOM_THEMES.map(t => ({ key: t.id, label: t.name })), Object.fromEntries(ROOM_THEMES.map(t => [t.id, s.events[`game_${t.id}`] ?? 0]))));
  grid.appendChild(topCombos(s.cross));
  for (const q of QUESTIONS) grid.appendChild(barList(q.hostTitle, q.choices, s.survey[q.id]));
  root.appendChild(grid);

  const foot = el('footer', 'host-foot');
  foot.appendChild(el('p', undefined, '방문과 응답은 로그인 없이 브라우저 단위로 집계한 익명 수치예요. 회원 수가 아니에요.'));
  const cta = el('a', 'btn solid', '파팅에서 주최 문의하기 ↗');
  cta.href = PARTING_URL; cta.target = '_blank'; cta.rel = 'noopener noreferrer';
  foot.appendChild(cta);
  root.appendChild(foot);
}

export async function renderHost(root: HTMLElement) {
  document.documentElement.classList.add('host-mode');
  document.title = '파팅 라운지 현황';
  const page = el('main', 'host');
  root.appendChild(page);
  const api = createStatsApi();
  const refresh = async () => render(page, await api.load());
  await refresh();
  setInterval(() => { if (!document.hidden) void refresh(); }, 60000);
}
