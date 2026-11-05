# 온돌 · 온라인 찜질방

말없이 같이 누워 있는 온라인 찜질방. 불가마의 불은 모두가 함께 지키고, 장작이 떨어지면 꺼진다.
sansatemple.com(온라인 절)의 구조를 벤치마크로 삼되, 테마는 찜질방으로, 핵심 메커니즘은 "꺼지지 않는 불"로 바꾼 프로젝트.

## 실행

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 타입 체크 + dist 빌드
npm run preview  # dist 미리보기
```

## 조작

- 바닥 클릭 또는 WASD / 방향키로 이동, 드래그로 둘러보기, 휠과 두 손가락으로 확대/축소
- 1 눕기 · 2 불가마 · 3 양머리 수건 · 4 맥반석 계란 · 5 식혜
- 상단 "장작 넣기"를 누르면 장작더미로 걸어가 불을 살린다

## 구조

```
src/
  main.ts              부팅 화면 → Game 시작
  game.ts              씬, 입력, 동작 상태머신, 루프 (오케스트레이터)
  scene/world.ts       찜질방 공간 생성 (바닥, 벽, 조명, 매트, 불가마, 매점, 장작더미) + FireVisual
  scene/avatar.ts      찜질복 + 양머리 수건 절차적 아바타, 포즈(idle/walk/sit/lie)
  scene/controls.ts    OrbitControls 추적 카메라, 클릭 이동, WASD
  ui/hud.ts            상단 불 배너, 하단 동작 바, 토스트, 불가마 타이머, 도움말
  state/fire.ts        FireStore 인터페이스 + LocalFireStore (로컬 개발용)
  state/supabaseFire.ts 서버 불 상태 (Realtime + RPC)
  state/presence.ts    접속자 모델 + 목업 봇
  state/stats.ts       StatsStore 인터페이스 + LocalStatsStore (로컬 개발용)
  state/supabaseStats.ts 서버 내 기록 (익명 로그인 + RPC)
  state/supabase.ts    Supabase 클라이언트
  audio/ambient.ts     Web Audio 절차적 환경음 (공조기 웅웅, 장작 타닥)
```

## 백엔드 (Supabase)

1. `supabase/migrations/`의 SQL을 파일명 순서대로 Supabase SQL Editor에서 실행한다.
2. Authentication > Sign In / Providers에서 Anonymous sign-ins를 켠다.
3. `.env.example`을 `.env.local`로 복사해 URL과 anon 키를 넣는다. Vercel에는 같은 이름의 환경변수로 등록한다.

환경변수가 없으면 로컬 개발에서는 브라우저 저장소(`LocalFireStore`, `LocalStatsStore`)로 동작한다. 배포본에서 불 연결에 실패하면 로컬 불로 열리되 화면에 안내를 띄운다. 기록 연결에 실패하면 콘솔에 오류를 남기고 기록은 브라우저에 저장한다.

- 내 기록: `player_stats`에 익명 로그인 사용자별로 저장한다. 자기 행만 읽을 수 있고, 쓰기는 RPC로만 가능하다. 브라우저 데이터를 지우면 새 사용자가 된다.
  장작 수는 서버가 직접 세지만, 계란·식혜·불가마 시간은 클라이언트가 보고하는 값이므로 순위나 보상의 근거로 쓰면 안 된다.

- 불: 전역 단일 행 `fire`를 Realtime으로 구독한다. 장작 넣기는 RPC `add_log`가 서버에서 계산해 레이스를 막으며, 로그인 사용자만 10초에 한 번 호출할 수 있다.
  현재 잔량과 소진 여부는 `updated_at`으로부터 경과 시간으로 계산하므로 cron이 필요 없다.
- 타는 시간: `fire.burn_seconds`(기본 1800초). 행 값을 바꾸면 클라이언트에도 반영된다.
- 접속자(예정): 아직 목업 봇이다. Supabase Realtime Presence 채널로 교체하며 테이블은 필요 없다. `Peer` 모델(위치, 포즈, 수건)만 맞추면 된다.

## 보안

- 브라우저에는 공개용 anon/publishable 키만 넣는다. `VITE_`로 시작하는 값은 모두 번들에 포함되므로 service_role/secret 키를 이 접두사로 두면 안 된다.
- 권한은 클라이언트가 아니라 RLS와 RPC에서 강제한다. 새 테이블은 RLS를 켜고 `anon`, `authenticated` 권한을 먼저 회수한다.
- `vercel.json`이 CSP와 보안 헤더를 건다. 외부 스크립트, 스타일, 폰트를 쓰지 않는다. 새 외부 출처가 필요하면 CSP를 함께 고친다.
- 접속자를 붙일 때: 다른 사람이 보낸 이름과 값은 신뢰하지 말고 `textContent`로 넣고, Realtime 채널은 Realtime Authorization으로 권한을 건다.

## 자산

3D 모델과 음원 파일 없이 전부 코드로 생성한다(캔버스 텍스처, 기본 지오메트리, Web Audio 합성).
나중에 GLB 모델과 실제 음원으로 교체하면 된다.
