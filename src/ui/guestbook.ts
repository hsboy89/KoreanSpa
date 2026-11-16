import type { Note } from '../state/stats';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export const NOTE_MAX = 30;

/** 방명록 창의 내용: 한마디 입력과 최근 글 목록. 남의 글은 textContent로만 넣는다 */
export class GuestbookPanel {
  private list = el('ul', 'notes');
  private input = el('input', 'note-input');
  private send = el('button', 'btn solid', '남기기');
  private hint = el('p', 'note-hint', `하루에 한 번, ${NOTE_MAX}자까지 남길 수 있어요.`);

  constructor(body: HTMLElement, onSubmit: (text: string) => Promise<string>) {
    this.input.type = 'text';
    this.input.maxLength = NOTE_MAX;
    this.input.placeholder = '다녀간 한마디를 남겨주세요';
    this.input.setAttribute('aria-label', '방명록 한마디');
    const form = el('form', 'note-form');
    form.append(this.input, this.send);
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const text = this.input.value.trim();
      if (text.length < 2) { this.say('두 글자 이상 적어주세요.', true); return; }
      this.send.disabled = true;
      const message = await onSubmit(text);
      this.send.disabled = false;
      if (!message) { this.input.value = ''; this.say('남겼어요. 고마워요!', false); }
      else this.say(message, true);
    });
    body.append(form, this.hint, this.list);
  }

  render(notes: Note[] | null) {
    this.list.textContent = '';
    if (!notes) { this.list.appendChild(el('li', 'notes-empty', '방명록을 불러오지 못했어요.')); return; }
    if (!notes.length) { this.list.appendChild(el('li', 'notes-empty', '아직 아무도 남기지 않았어요. 첫 번째로 남겨보세요.')); return; }
    for (const n of notes) {
      const li = el('li');
      li.append(el('span', 'note-text', n.message), el('time', undefined, n.at.slice(5, 10).replace('-', '/')));
      this.list.appendChild(li);
    }
  }

  private say(text: string, error: boolean) {
    this.hint.textContent = text;
    this.hint.classList.toggle('is-error', error);
  }
}
