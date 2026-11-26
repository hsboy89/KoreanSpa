/**
 * 방문 집계, 방별 "열리면 갈래요", 설문.
 * 서버(Supabase RPC)가 있으면 서버에, 없으면 이 브라우저에만 저장한다(개발용).
 * 서버 호출이 실패하면 null을 돌려주고, 화면은 해당 기능을 숨긴 채 그대로 동작한다.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from './supabase';
import type { Answers, QId } from './survey';
import type { RoomId } from '../scene/rooms';

export interface Stats {
  /** 방문 수(방문자 × 방문한 날) */
  visits: number;
  /** 서로 다른 방문자 수(브라우저 기준) */
  visitors: number;
  today: number;
  daily: { day: string; n: number }[];
  interest: Record<string, number>;
  surveyCount: number;
  survey: Record<QId, Record<string, number>>;
  /** 카테고리 → 지역 → 응답 수 */
  cross: Record<string, Record<string, number>>;
  /** 방문 한 번의 평균 체류 시간(초). 기록이 없으면 0 */
  dwellAvg: number;
  /** 행동별 사람 수(하루 한 번씩 집계). EventKind 참고 */
  events: Record<string, number>;
}

/** 뒤에서 세는 행동. SQL의 check 목록과 같아야 한다 */
export type EventKind = 'party_click' | 'quiz_join' | 'quiz_perfect' | 'wardrobe' | `game_${RoomId}`;

/** 가장 최근 퀴즈 우승자 */
export interface Winners { day: string; count: number; names: string[] }

let offset = 0;
/** 서버 시각 - 이 기기 시각(ms). 퀴즈 시작을 모두에게 같은 순간으로 맞추는 데 쓴다 */
export const clockOffset = () => offset;

export interface Note { message: string; at: string }
/** 방명록 등록 결과. 'error'는 서버에 닿지 못한 경우 */
export type NoteResult = 'ok' | 'length' | 'blocked' | 'daily' | 'error';

export interface StatsApi {
  /** 최근 방명록. 불러오지 못하면 null */
  notes(): Promise<Note[] | null>;
  addNote(message: string): Promise<NoteResult>;
  visit(): Promise<Stats | null>;
  load(): Promise<Stats | null>;
  addInterest(room: RoomId): Promise<Stats | null>;
  submitSurvey(a: Answers): Promise<Stats | null>;
  /** 체류 시간을 초 단위로 더한다 */
  dwell(seconds: number): void;
  event(kind: EventKind): void;
  quizWin(name: string): void;
  winners(): Promise<Winners | null>;
}

const VISITOR_KEY = 'parting.visitor';
const uuid = () => (typeof crypto.randomUUID === 'function'
  ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16)));

/** 이 브라우저의 익명 방문자 번호. 저장소를 못 쓰면 매번 새 번호가 된다 */
function visitorId(): string {
  try {
    const saved = localStorage.getItem(VISITOR_KEY);
    if (saved && /^[0-9a-f-]{36}$/.test(saved)) return saved;
    const id = uuid();
    localStorage.setItem(VISITOR_KEY, id);
    return id;
  } catch { return uuid(); }
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const counts = (v: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (v && typeof v === 'object') for (const [k, n] of Object.entries(v as Record<string, unknown>)) out[k] = num(n);
  return out;
};

/** 서버가 돌려준 값을 믿지 않고 모양을 맞춘다 */
function normalize(raw: unknown): Stats | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const s = (r.survey ?? {}) as Record<string, unknown>;
  // 기기 시계가 틀려도 퀴즈가 같은 순간에 시작하도록 서버 시각과의 차이를 기억한다
  if (typeof r.now === 'number' && Number.isFinite(r.now)) offset = r.now - Date.now();
  const cross: Stats['cross'] = {};
  if (r.cross && typeof r.cross === 'object') for (const [k, v] of Object.entries(r.cross as Record<string, unknown>)) cross[k] = counts(v);
  return {
    visits: num(r.visits), visitors: num(r.visitors), today: num(r.today),
    daily: Array.isArray(r.daily) ? r.daily.map(d => ({ day: String((d as { day?: unknown }).day ?? ''), n: num((d as { n?: unknown }).n) })) : [],
    interest: counts(r.interest),
    surveyCount: num(r.surveyCount),
    survey: { category: counts(s.category), region: counts(s.region), size: counts(s.size), time: counts(s.time), fee: counts(s.fee), worry: counts(s.worry) },
    cross,
    dwellAvg: num(r.dwellAvg),
    events: counts(r.events),
  };
}

class SupabaseStats implements StatsApi {
  private id = visitorId();
  constructor(private client: SupabaseClient) {}

  async load() {
    const { data, error } = await this.client.rpc('lounge_stats');
    if (error) { console.warn('통계를 불러오지 못했어요. SQL 마이그레이션을 실행했는지 확인하세요.', error.message); return null; }
    return normalize(data);
  }

  async notes() {
    const { data, error } = await this.client.rpc('lounge_guestbook_list');
    if (error || !Array.isArray(data)) return null;
    return data
      .filter(n => n && typeof n.message === 'string')
      .map(n => ({ message: String(n.message).slice(0, 30), at: String(n.at ?? '') }));
  }

  async addNote(message: string): Promise<NoteResult> {
    const { data, error } = await this.client.rpc('lounge_guestbook_add', { p_visitor: this.id, p_message: message });
    if (error) { console.warn('lounge_guestbook_add 실패', error.message); return 'error'; }
    return data === 'ok' || data === 'length' || data === 'blocked' || data === 'daily' ? data : 'error';
  }

  async visit() { return this.call('lounge_visit', { p_visitor: this.id }); }
  async addInterest(room: RoomId) { return this.call('lounge_interest_add', { p_visitor: this.id, p_room: room }); }
  async submitSurvey(a: Answers) {
    return this.call('lounge_survey_submit', {
      p_visitor: this.id, p_category: a.category, p_regions: a.regions,
      p_size: a.size, p_time: a.time, p_fee: a.fee, p_worry: a.worry,
    });
  }

  dwell(seconds: number) { this.fire('lounge_dwell', { p_visitor: this.id, p_seconds: Math.round(seconds) }); }
  event(kind: EventKind) { this.fire('lounge_event', { p_visitor: this.id, p_kind: kind }); }
  quizWin(name: string) { this.fire('lounge_quiz_win', { p_visitor: this.id, p_name: name }); }

  async winners(): Promise<Winners | null> {
    const { data, error } = await this.client.rpc('lounge_quiz_latest');
    if (error || !data || typeof data !== 'object') return null;
    const d = data as Record<string, unknown>;
    if (typeof d.day !== 'string') return null;
    return {
      day: d.day, count: num(d.count),
      names: Array.isArray(d.names) ? d.names.filter(n => typeof n === 'string').map(n => String(n).slice(0, 16)).slice(0, 5) : [],
    };
  }

  /** 결과를 기다리지 않는 기록용 호출. 실패해도 화면에는 영향이 없다 */
  private fire(fn: string, args: Record<string, unknown>) {
    void this.client.rpc(fn, args).then(({ error }) => { if (error) console.warn(`${fn} 실패`, error.message); });
  }

  private async call(fn: string, args: Record<string, unknown>) {
    const { error } = await this.client.rpc(fn, args);
    if (error) { console.warn(`${fn} 실패`, error.message); return null; }
    return this.load();
  }
}

/** 서버 설정이 없는 개발 환경용. 이 브라우저의 기록만 센다 */
class LocalStats implements StatsApi {
  private key = 'parting.localstats';
  private data: { days: string[]; interest: string[]; survey: Answers | null; notes: Note[]; seconds: number; events: Record<string, number>; winner: Winners | null };

  constructor() {
    let d: Partial<LocalStats['data']> = {};
    try { d = JSON.parse(localStorage.getItem(this.key) ?? '{}'); } catch { /* ignore */ }
    this.data = { days: d.days ?? [], interest: d.interest ?? [], survey: d.survey ?? null, notes: d.notes ?? [], seconds: d.seconds ?? 0, events: d.events ?? {}, winner: d.winner ?? null };
  }

  async load() {
    const { days, interest, survey, seconds, events } = this.data;
    const today = new Date().toISOString().slice(0, 10);
    const one = (k: string | undefined) => (k ? { [k]: 1 } : {});
    return {
      visits: days.length, visitors: days.length ? 1 : 0, today: days.includes(today) ? 1 : 0,
      daily: days.map(day => ({ day, n: 1 })),
      interest: Object.fromEntries(interest.map(r => [r, 1])),
      surveyCount: survey ? 1 : 0,
      survey: {
        category: one(survey?.category), region: Object.fromEntries((survey?.regions ?? []).map(r => [r, 1])),
        size: one(survey?.size), time: one(survey?.time), fee: one(survey?.fee), worry: one(survey?.worry),
      },
      cross: survey ? { [survey.category]: Object.fromEntries(survey.regions.map(r => [r, 1])) } : {},
      dwellAvg: days.length ? Math.round(seconds / days.length) : 0,
      events: { ...events },
    } satisfies Stats;
  }

  async visit() {
    const today = new Date().toISOString().slice(0, 10);
    if (!this.data.days.includes(today)) this.data.days.push(today);
    return this.save();
  }
  async addInterest(room: RoomId) { if (!this.data.interest.includes(room)) this.data.interest.push(room); return this.save(); }
  async notes() { return [...this.data.notes].reverse(); }
  async addNote(message: string): Promise<NoteResult> {
    this.data.notes.push({ message: message.slice(0, 30), at: new Date().toISOString() });
    await this.save();
    return 'ok';
  }
  async submitSurvey(a: Answers) { this.data.survey = a; return this.save(); }
  dwell(seconds: number) { this.data.seconds += Math.round(seconds); void this.save(); }
  event(kind: EventKind) { this.data.events[kind] = 1; void this.save(); }
  quizWin(name: string) { this.data.winner = { day: new Date().toISOString().slice(0, 10), count: 1, names: [name] }; void this.save(); }
  async winners() { return this.data.winner; }

  private save() {
    try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch { /* ignore */ }
    return this.load();
  }
}

export function createStatsApi(): StatsApi {
  const client = getSupabase();
  return client ? new SupabaseStats(client) : new LocalStats();
}

/** 내가 이미 한 일. 버튼 상태를 기억하는 용도라 지워져도 문제없다 */
const DONE_KEY = 'parting.done';
interface Done { survey: boolean; interest: string[] }

export function loadDone(): Done {
  try {
    const d = JSON.parse(localStorage.getItem(DONE_KEY) ?? '{}');
    return { survey: !!d.survey, interest: Array.isArray(d.interest) ? d.interest.filter((x: unknown) => typeof x === 'string') : [] };
  } catch { return { survey: false, interest: [] }; }
}

export function saveDone(d: Done) {
  try { localStorage.setItem(DONE_KEY, JSON.stringify(d)); } catch { /* ignore */ }
}
