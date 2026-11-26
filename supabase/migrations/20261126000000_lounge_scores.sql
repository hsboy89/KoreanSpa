-- 파팅 라운지: 방별 미니게임 "오늘의 순위"
-- Supabase SQL Editor에서 이 파일 전체를 한 번 실행한다. 여러 번 실행해도 안전하다.
-- (20261116000000_lounge_stats.sql 을 먼저 실행한 상태여야 한다)
--
-- 하루(한국 시간) 단위로 게임마다 한 사람의 최고 점수 하나만 남긴다.
-- 로그인이 없어 점수를 꾸며 보낼 수 있으므로 게임별 상한을 넘는 점수는 버린다. 상품을 걸 만큼 믿을 수 있는 기록은 아니다.
-- 게임이나 점수 계산을 바꾸면 src/ui/minigames.ts 와 아래 상한을 같이 고친다.

create table if not exists public.lounge_scores (
  visitor_id uuid not null,
  day date not null,
  game text not null check (game in ('wine', 'board', 'rooftop', 'run', 'book', 'club')),
  score integer not null check (score between 1 and 300),
  name text not null check (char_length(name) between 1 and 16),
  updated_at timestamptz not null default now(),
  primary key (visitor_id, day, game)
);

alter table public.lounge_scores enable row level security;
revoke all on public.lounge_scores from anon, authenticated;

create or replace function public.lounge_score_submit(p_visitor uuid, p_game text, p_score integer, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cap integer := case p_game
    when 'wine' then 100
    when 'board' then 10
    when 'rooftop' then 60
    when 'run' then 260
    when 'book' then 100
    when 'club' then 48
  end;
  n text := btrim(coalesce(p_name, ''));
begin
  if cap is null or p_score is null or p_score < 1 or p_score > cap then
    return;
  end if;
  -- 이름은 라운지가 지어 주는 "느긋한 참가자 12" 꼴만 그대로 받는다
  if n !~ '^(느긋한|수줍은|신나는|다정한|호기심 많은|말없는|유쾌한|차분한|반가운) (참가자|호스트|뉴비|단골|방문자|친구|이웃) [0-9]{1,2}$' then
    n := '파팅 방문자';
  end if;
  insert into public.lounge_scores as s (visitor_id, day, game, score, name)
  values (p_visitor, (now() at time zone 'Asia/Seoul')::date, p_game, p_score, n)
  on conflict (visitor_id, day, game) do update
    set name = excluded.name,
        updated_at = case when excluded.score > s.score then now() else s.updated_at end,
        score = greatest(s.score, excluded.score);
end;
$$;

-- 오늘의 순위. 게임마다 상위 5명, 참여 인원, 그리고 물어본 사람의 순위와 점수
-- 예) {"run": {"players": 12, "top": [{"name": "...", "score": 240}], "rank": 3, "mine": 221}}
create or replace function public.lounge_scores_today(p_visitor uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with ranked as (
    select
      game, visitor_id, name, score,
      row_number() over (partition by game order by score desc, updated_at) as r,
      count(*) over (partition by game) as players
    from public.lounge_scores
    where day = (now() at time zone 'Asia/Seoul')::date
  )
  select coalesce(jsonb_object_agg(g.game, g.obj), '{}'::jsonb)
  from (
    select
      game,
      jsonb_build_object(
        'players', max(players),
        'top', jsonb_agg(jsonb_build_object('name', name, 'score', score) order by r) filter (where r <= 5),
        'rank', max(r) filter (where visitor_id = p_visitor),
        'mine', max(score) filter (where visitor_id = p_visitor)
      ) as obj
    from ranked
    group by game
  ) g;
$$;

revoke execute on function public.lounge_score_submit(uuid, text, integer, text) from public;
revoke execute on function public.lounge_scores_today(uuid) from public;
grant execute on function public.lounge_score_submit(uuid, text, integer, text) to anon, authenticated;
grant execute on function public.lounge_scores_today(uuid) to anon, authenticated;
