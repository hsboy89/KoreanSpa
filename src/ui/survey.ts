import { QUESTIONS, type Answers, type Choice, type QId } from '../state/survey';
import type { Stats } from '../state/stats';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

/** 보기별 응답 수를 막대로 그린다. 설문 결과와 주최자용 페이지가 같이 쓴다 */
export function barList(title: string, choices: Choice[], counts: Record<string, number>, unit = '명'): HTMLElement {
  const box = el('section', 'bars');
  box.appendChild(el('h3', undefined, title));
  const total = choices.reduce((s, c) => s + (counts[c.key] ?? 0), 0);
  const max = Math.max(1, ...choices.map(c => counts[c.key] ?? 0));
  for (const c of choices) {
    const n = counts[c.key] ?? 0;
    const row = el('div', 'bar-row');
    row.appendChild(el('span', 'bar-label', c.label));
    const track = el('span', 'bar-track');
    const fill = el('i');
    fill.style.width = `${Math.round((n / max) * 100)}%`;
    track.appendChild(fill);
    row.appendChild(track);
    row.appendChild(el('span', 'bar-num', total ? `${n}${unit} · ${Math.round((n / total) * 100)}%` : `0${unit}`));
    box.appendChild(row);
  }
  return box;
}

/** 설문 창의 내용. 한 문항씩 넘기고, 끝나면 전체 결과를 보여준다 */
export class SurveyPanel {
  private step = 0;
  private picked: Partial<Record<QId, string[]>> = {};

  constructor(private body: HTMLElement, private onSubmit: (a: Answers) => Promise<Stats | null>) {}

  start() {
    this.step = 0;
    this.picked = {};
    this.renderQuestion();
  }

  showResults(stats: Stats | null, note = '지금까지 모인 답이에요.') {
    this.body.textContent = '';
    if (!stats) { this.body.appendChild(el('p', 'survey-note', '결과를 불러오지 못했어요. 잠시 뒤에 다시 열어주세요.')); return; }
    this.body.appendChild(el('p', 'survey-note', `${note} 응답 ${stats.surveyCount}명`));
    const wrap = el('div', 'survey-results');
    for (const q of QUESTIONS) wrap.appendChild(barList(q.hostTitle, q.choices, stats.survey[q.id]));
    this.body.appendChild(wrap);
    const again = el('button', 'btn ghost', '다시 답하기');
    again.addEventListener('click', () => this.start());
    const foot = el('div', 'modal-foot');
    foot.appendChild(again);
    this.body.appendChild(foot);
  }

  private renderQuestion() {
    const q = QUESTIONS[this.step];
    const chosen = new Set(this.picked[q.id] ?? []);
    this.body.textContent = '';
    this.body.appendChild(el('p', 'survey-step', `${this.step + 1} / ${QUESTIONS.length}`));
    this.body.appendChild(el('h3', 'survey-title', q.title));
    if (q.multi) this.body.appendChild(el('p', 'survey-note', '여러 개 고를 수 있어요.'));

    const chips = el('div', 'chips');
    const next = el('button', 'btn solid', this.step === QUESTIONS.length - 1 ? '보내기' : '다음');
    next.disabled = chosen.size === 0;
    for (const c of q.choices) {
      const b = el('button', 'chip' + (chosen.has(c.key) ? ' is-on' : ''), c.label);
      b.addEventListener('click', () => {
        if (q.multi) {
          if (chosen.has(c.key)) chosen.delete(c.key); else chosen.add(c.key);
          b.classList.toggle('is-on', chosen.has(c.key));
        } else {
          chosen.clear(); chosen.add(c.key);
          chips.querySelectorAll('.chip').forEach(x => x.classList.toggle('is-on', x === b));
        }
        this.picked[q.id] = [...chosen];
        next.disabled = chosen.size === 0;
      });
      chips.appendChild(b);
    }
    this.body.appendChild(chips);

    const foot = el('div', 'modal-foot survey-foot');
    if (this.step > 0) {
      const back = el('button', 'btn ghost', '이전');
      back.addEventListener('click', () => { this.step -= 1; this.renderQuestion(); });
      foot.appendChild(back);
    }
    next.addEventListener('click', () => {
      if (this.step < QUESTIONS.length - 1) { this.step += 1; this.renderQuestion(); }
      else void this.submit();
    });
    foot.appendChild(next);
    this.body.appendChild(foot);
  }

  private async submit() {
    const p = this.picked;
    const one = (id: QId) => p[id]?.[0] ?? '';
    const answers: Answers = { category: one('category'), regions: p.region ?? [], size: one('size'), time: one('time'), fee: one('fee'), worry: one('worry') };
    this.body.textContent = '';
    this.body.appendChild(el('p', 'survey-note', '보내는 중이에요…'));
    const stats = await this.onSubmit(answers);
    if (stats) this.showResults(stats, '고마워요! 다른 사람들은 이렇게 답했어요.');
    else {
      this.body.textContent = '';
      this.body.appendChild(el('p', 'survey-note', '답을 보내지 못했어요. 잠시 뒤에 다시 해주세요.'));
      const retry = el('button', 'btn solid', '다시 보내기');
      retry.addEventListener('click', () => void this.submit());
      const foot = el('div', 'modal-foot');
      foot.appendChild(retry);
      this.body.appendChild(foot);
    }
  }
}
