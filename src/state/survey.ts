/**
 * 설문 문항. 보기의 key는 DB 제약과 맞아야 한다 (supabase/migrations/20261116000000_lounge_stats.sql).
 * 문구(label)는 자유롭게 바꿔도 되지만 key를 바꾸거나 추가하면 SQL의 check 목록도 같이 고친다.
 */
export type QId = 'category' | 'region' | 'size' | 'time' | 'fee' | 'worry';

export interface Choice { key: string; label: string }
export interface Question { id: QId; title: string; hostTitle: string; multi?: boolean; choices: Choice[] }

export const QUESTIONS: Question[] = [
  {
    id: 'category', title: '어떤 모임에 가장 가고 싶어요?', hostTitle: '가고 싶은 모임',
    choices: [
      { key: 'wine', label: '와인 · 다이닝' }, { key: 'board', label: '보드게임' }, { key: 'rooftop', label: '루프탑 파티' },
      { key: 'run', label: '러닝 · 액티비티' }, { key: 'book', label: '독서 · 토크' }, { key: 'club', label: '노래 · 클럽' },
      { key: 'etc', label: '그 외' },
    ],
  },
  {
    // 임시 목록. 파팅이 실제로 파티를 여는 지역에 맞춰 바꾼다
    id: 'region', title: '어디서 열리면 갈 수 있어요?', hostTitle: '갈 수 있는 지역', multi: true,
    choices: [
      { key: 'gangnam', label: '강남 · 서초' }, { key: 'hongdae', label: '홍대 · 합정 · 연남' }, { key: 'seongsu', label: '성수 · 건대' },
      { key: 'itaewon', label: '이태원 · 한남' }, { key: 'jongno', label: '종로 · 을지로' }, { key: 'gyeonggi', label: '경기 · 인천' },
      { key: 'busan', label: '부산' }, { key: 'other', label: '그 외' },
    ],
  },
  {
    id: 'size', title: '몇 명 모임이 편해요?', hostTitle: '편한 인원',
    choices: [{ key: 'small', label: '4~6명' }, { key: 'medium', label: '8~12명' }, { key: 'large', label: '20명 이상' }],
  },
  {
    id: 'time', title: '언제가 좋아요?', hostTitle: '선호 시간대',
    choices: [{ key: 'weekday', label: '평일 저녁' }, { key: 'frisat', label: '금 · 토 밤' }, { key: 'weekend', label: '주말 낮' }],
  },
  {
    id: 'fee', title: '참가비는 얼마까지 괜찮아요?', hostTitle: '괜찮은 참가비',
    choices: [{ key: 'f1', label: '1만 원 이하' }, { key: 'f2', label: '1~3만 원' }, { key: 'f3', label: '3~5만 원' }, { key: 'f4', label: '5만 원 이상' }],
  },
  {
    id: 'worry', title: '처음 가는 모임에서 가장 걱정되는 건?', hostTitle: '가장 걱정하는 점',
    choices: [{ key: 'awkward', label: '어색함' }, { key: 'safety', label: '안전과 신원' }, { key: 'cost', label: '비용' }, { key: 'alone', label: '혼자 가는 것' }],
  },
];

export interface Answers { category: string; regions: string[]; size: string; time: string; fee: string; worry: string }

export function labelOf(id: QId, key: string): string {
  return QUESTIONS.find(q => q.id === id)?.choices.find(c => c.key === key)?.label ?? key;
}
