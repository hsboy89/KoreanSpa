-- 파팅 라운지: 방문 집계, 방별 "열리면 갈래요", 설문
-- Supabase SQL Editor에서 이 파일 전체를 한 번 실행한다. 여러 번 실행해도 안전하다.
--
-- 테이블은 RLS로 잠그고 직접 읽기/쓰기를 막는다. 브라우저는 아래 함수(RPC)로만 접근하고,
-- 읽기는 합계만 돌려주므로 개별 응답은 밖으로 나가지 않는다.
-- visitor_id는 브라우저가 만든 익명 번호다. 사람을 식별하는 정보는 저장하지 않는다.

create table if not exists public.lounge_visits (
  visitor_id uuid not null,
  day date not null,
  created_at timestamptz not null default now(),
  primary key (visitor_id, day)
);

create table if not exists public.lounge_interest (
  visitor_id uuid not null,
  room text not null check (room in ('wine', 'board', 'rooftop', 'run', 'book', 'club')),
  created_at timestamptz not null default now(),
  primary key (visitor_id, room)
);

create table if not exists public.lounge_survey (
  visitor_id uuid primary key,
  category text not null check (category in ('wine', 'board', 'rooftop', 'run', 'book', 'club', 'etc')),
  regions text[] not null check (
    cardinality(regions) between 1 and 8
    and regions <@ array['gangnam', 'hongdae', 'seongsu', 'itaewon', 'jongno', 'gyeonggi', 'busan', 'other']
  ),
  size text not null check (size in ('small', 'medium', 'large')),
  time_slot text not null check (time_slot in ('weekday', 'frisat', 'weekend')),
  fee text not null check (fee in ('f1', 'f2', 'f3', 'f4')),
  worry text not null check (worry in ('awkward', 'safety', 'cost', 'alone')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.lounge_visits enable row level security;
alter table public.lounge_interest enable row level security;
alter table public.lounge_survey enable row level security;

revoke all on public.lounge_visits from anon, authenticated;
revoke all on public.lounge_interest from anon, authenticated;
revoke all on public.lounge_survey from anon, authenticated;

-- 하루에 한 번만 집계된다 (한국 시간 기준)
create or replace function public.lounge_visit(p_visitor uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.lounge_visits (visitor_id, day)
  values (p_visitor, (now() at time zone 'Asia/Seoul')::date)
  on conflict do nothing;
$$;

create or replace function public.lounge_interest_add(p_visitor uuid, p_room text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.lounge_interest (visitor_id, room)
  values (p_visitor, p_room)
  on conflict do nothing;
$$;

-- 같은 방문자가 다시 답하면 이전 답을 덮어쓴다
create or replace function public.lounge_survey_submit(
  p_visitor uuid,
  p_category text,
  p_regions text[],
  p_size text,
  p_time text,
  p_fee text,
  p_worry text
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.lounge_survey (visitor_id, category, regions, size, time_slot, fee, worry)
  values (p_visitor, p_category, p_regions, p_size, p_time, p_fee, p_worry)
  on conflict (visitor_id) do update
    set category = excluded.category,
        regions = excluded.regions,
        size = excluded.size,
        time_slot = excluded.time_slot,
        fee = excluded.fee,
        worry = excluded.worry,
        updated_at = now();
$$;

-- 합계만 돌려준다
create or replace function public.lounge_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'visits', (select count(*) from public.lounge_visits),
    'visitors', (select count(distinct visitor_id) from public.lounge_visits),
    'today', (select count(*) from public.lounge_visits where day = (now() at time zone 'Asia/Seoul')::date),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('day', d.day, 'n', d.n) order by d.day)
      from (
        select day, count(*) as n from public.lounge_visits
        where day > (now() at time zone 'Asia/Seoul')::date - 14
        group by day
      ) d
    ), '[]'::jsonb),
    'interest', coalesce((
      select jsonb_object_agg(i.room, i.n)
      from (select room, count(*) as n from public.lounge_interest group by room) i
    ), '{}'::jsonb),
    'surveyCount', (select count(*) from public.lounge_survey),
    'survey', jsonb_build_object(
      'category', coalesce((select jsonb_object_agg(x.k, x.n) from (select category as k, count(*) as n from public.lounge_survey group by category) x), '{}'::jsonb),
      'region', coalesce((select jsonb_object_agg(x.k, x.n) from (select r as k, count(*) as n from public.lounge_survey s cross join lateral unnest(s.regions) as r group by r) x), '{}'::jsonb),
      'size', coalesce((select jsonb_object_agg(x.k, x.n) from (select size as k, count(*) as n from public.lounge_survey group by size) x), '{}'::jsonb),
      'time', coalesce((select jsonb_object_agg(x.k, x.n) from (select time_slot as k, count(*) as n from public.lounge_survey group by time_slot) x), '{}'::jsonb),
      'fee', coalesce((select jsonb_object_agg(x.k, x.n) from (select fee as k, count(*) as n from public.lounge_survey group by fee) x), '{}'::jsonb),
      'worry', coalesce((select jsonb_object_agg(x.k, x.n) from (select worry as k, count(*) as n from public.lounge_survey group by worry) x), '{}'::jsonb)
    ),
    -- 카테고리 × 지역 교차표: {"wine": {"gangnam": 12, ...}, ...}
    'cross', coalesce((
      select jsonb_object_agg(z.category, z.regs)
      from (
        select y.category, jsonb_object_agg(y.r, y.n) as regs
        from (
          select s.category, r, count(*) as n
          from public.lounge_survey s cross join lateral unnest(s.regions) as r
          group by s.category, r
        ) y
        group by y.category
      ) z
    ), '{}'::jsonb)
  );
$$;

revoke execute on function public.lounge_visit(uuid) from public;
revoke execute on function public.lounge_interest_add(uuid, text) from public;
revoke execute on function public.lounge_survey_submit(uuid, text, text[], text, text, text, text) from public;
revoke execute on function public.lounge_stats() from public;

grant execute on function public.lounge_visit(uuid) to anon, authenticated;
grant execute on function public.lounge_interest_add(uuid, text) to anon, authenticated;
grant execute on function public.lounge_survey_submit(uuid, text, text[], text, text, text, text) to anon, authenticated;
grant execute on function public.lounge_stats() to anon, authenticated;

-- ───────── 방명록 ─────────
-- 하루에 한 번, 2~30자. 링크·연락처·욕설은 받지 않는다.
-- 보기 싫은 글은 Table Editor에서 hidden을 true로 바꾸거나 행을 지우면 사라진다.

create table if not exists public.lounge_guestbook (
  id bigint generated always as identity primary key,
  visitor_id uuid not null,
  day date not null,
  message text not null check (char_length(message) between 2 and 30),
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  unique (visitor_id, day)
);

alter table public.lounge_guestbook enable row level security;
revoke all on public.lounge_guestbook from anon, authenticated;

-- 결과: 'ok' | 'length' | 'blocked' | 'daily'
create or replace function public.lounge_guestbook_add(p_visitor uuid, p_message text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  m text := btrim(regexp_replace(coalesce(p_message, ''), '[[:space:]]+', ' ', 'g'));
begin
  if char_length(m) < 2 or char_length(m) > 30 then
    return 'length';
  end if;
  if m ~* '(https?:|www[.]|[.]com|[.]kr|[.]net|[0-9]{7,}|카톡|오픈채팅|텔레그램|라인아이디)'
     or m ~* '(시발|씨발|ㅅㅂ|병신|ㅂㅅ|좆|존나|개새|새끼|꺼져|섹스|sex)' then
    return 'blocked';
  end if;
  insert into public.lounge_guestbook (visitor_id, day, message)
  values (p_visitor, (now() at time zone 'Asia/Seoul')::date, m);
  return 'ok';
exception
  when unique_violation then
    return 'daily';
end;
$$;

create or replace function public.lounge_guestbook_list()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('message', g.message, 'at', g.created_at) order by g.created_at desc), '[]'::jsonb)
  from (
    select message, created_at from public.lounge_guestbook
    where not hidden
    order by created_at desc
    limit 40
  ) g;
$$;

revoke execute on function public.lounge_guestbook_add(uuid, text) from public;
revoke execute on function public.lounge_guestbook_list() from public;
grant execute on function public.lounge_guestbook_add(uuid, text) to anon, authenticated;
grant execute on function public.lounge_guestbook_list() to anon, authenticated;
