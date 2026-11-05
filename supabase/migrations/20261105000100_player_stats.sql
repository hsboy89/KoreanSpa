-- 온돌: 사람별 내 기록과 장작 넣기. Supabase 익명 로그인 사용자 기준이다.
-- 대시보드 Authentication > Sign In / Providers에서 Anonymous sign-ins를 켜야 한다.

create table public.player_stats (
  user_id uuid primary key references auth.users (id) on delete cascade,
  sauna_sec bigint not null default 0 check (sauna_sec >= 0),
  eggs bigint not null default 0 check (eggs >= 0),
  sikhye bigint not null default 0 check (sikhye >= 0),
  logs bigint not null default 0 check (logs >= 0),
  last_log_at timestamptz,
  updated_at timestamptz not null default now()
);

-- 자기 행만 읽을 수 있다. 쓰기는 아래 함수로만 가능하다.
alter table public.player_stats enable row level security;
revoke all on table public.player_stats from anon, authenticated;
grant select on table public.player_stats to authenticated;
create policy "players read their own stats"
  on public.player_stats for select to authenticated
  using ((select auth.uid()) = user_id);

-- 클라이언트가 보고하는 기록. 증가분만 받아 더하므로 탭을 여러 개 열어도 덮어쓰지 않는다.
-- 조작 가능한 값이므로 순위나 보상의 근거로 쓰면 안 된다. 상한은 비정상 입력을 막는 용도다.
create function public.add_stats(
  p_sauna_sec integer default 0,
  p_eggs integer default 0,
  p_sikhye integer default 0
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if least(p_sauna_sec, p_eggs, p_sikhye) < 0
    or p_sauna_sec > 86400 or p_eggs > 1000 or p_sikhye > 1000 then
    raise exception 'invalid stats' using errcode = '22023';
  end if;

  insert into public.player_stats as s (user_id, sauna_sec, eggs, sikhye)
  values (uid, p_sauna_sec, p_eggs, p_sikhye)
  on conflict (user_id) do update set
    sauna_sec = s.sauna_sec + excluded.sauna_sec,
    eggs = s.eggs + excluded.eggs,
    sikhye = s.sikhye + excluded.sikhye,
    updated_at = now();
end;
$$;

-- 장작 넣기. 사용자별 쿨다운과 장작 수를 서버가 직접 관리한다.
-- 불 행을 잠그고 서버 시각으로 계산하므로 동시에 눌러도 안전하다. 이미 꺼졌다면 다시 지핀다.
create function public.add_log()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  f public.fire;
  ts timestamptz := clock_timestamp();
  accepted boolean;
  remaining double precision;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  insert into public.player_stats as s (user_id, logs, last_log_at)
  values (uid, 1, ts)
  on conflict (user_id) do update set
    logs = s.logs + 1, last_log_at = excluded.last_log_at, updated_at = excluded.last_log_at
    where s.last_log_at is null or s.last_log_at <= excluded.last_log_at - interval '10 seconds'
  returning true into accepted;

  if accepted is null then
    raise exception 'log_cooldown' using errcode = 'P0001';
  end if;

  select * into strict f from public.fire where id = 1 for update;
  ts := clock_timestamp();
  remaining := f.fuel - extract(epoch from ts - f.updated_at) / f.burn_seconds;

  if f.lit_at is null or remaining <= 0 then
    update public.fire
      set fuel = 0.3, lit_at = ts, out_at = null, logs = logs + 1, updated_at = ts
      where id = 1;
  else
    update public.fire
      set fuel = least(1, remaining + 0.25), logs = logs + 1, updated_at = ts
      where id = 1;
  end if;

  return public.get_fire();
end;
$$;

revoke all on function public.add_stats(integer, integer, integer) from public, anon, authenticated;
revoke all on function public.add_log() from public, anon, authenticated;
grant execute on function public.add_stats(integer, integer, integer) to authenticated;
grant execute on function public.add_log() to authenticated;
