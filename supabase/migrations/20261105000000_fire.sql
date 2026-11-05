-- 온돌: 모두가 함께 지키는 불가마 불.
-- 전역 단일 행. fuel은 updated_at 시점의 잔량이고, 현재 잔량은 경과 시간으로 계산한다.
-- 그래서 cron 없이도 시간이 지나면 불이 꺼진 것으로 판정된다.

create table public.fire (
  id smallint primary key default 1 check (id = 1),
  fuel double precision not null check (fuel between 0 and 1),
  lit_at timestamptz,
  out_at timestamptz,
  logs bigint not null default 0,
  burn_seconds integer not null default 1800 check (burn_seconds > 0),
  updated_at timestamptz not null default now()
);

insert into public.fire (fuel, lit_at) values (0.7, now());

-- 누구나 읽을 수 있다. 쓰기는 다음 마이그레이션의 add_log 함수로만 가능하다.
alter table public.fire enable row level security;
revoke all on table public.fire from anon, authenticated;
grant select on table public.fire to anon, authenticated;
create policy "fire is readable by everyone"
  on public.fire for select to anon, authenticated using (true);

-- 현재 행과 서버 시각을 함께 준다. 클라이언트 시계 오차 보정용.
create function public.get_fire()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select to_jsonb(f) || jsonb_build_object('server_now', clock_timestamp())
  from public.fire f
  where f.id = 1;
$$;

revoke all on function public.get_fire() from public, anon, authenticated;
grant execute on function public.get_fire() to anon, authenticated;

-- 다른 사람이 넣은 장작을 실시간으로 받는다.
alter publication supabase_realtime add table public.fire;
