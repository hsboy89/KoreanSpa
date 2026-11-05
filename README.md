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
  state/fire.ts        FireStore 인터페이스 + LocalFireStore (로컬 목업)
  state/presence.ts    접속자 모델 + 목업 봇
  state/stats.ts       내 기록 (localStorage)
  audio/ambient.ts     Web Audio 절차적 환경음 (공조기 웅웅, 장작 타닥)
```

## 백엔드 연결 계획 (Supabase)

- `FireStore` 인터페이스를 그대로 두고 `SupabaseFireStore`를 추가한다.
  전역 단일 row(`fire`: fuel, lit_at, out_at, logs, updated_at)를 두고 Realtime으로 구독.
  장작 넣기는 RPC(`add_log`)로 서버에서 fuel을 계산해 레이스를 막는다.
  연소(fuel 감소)는 클라이언트가 `updated_at` 기준으로 보간하고, 실제 소진 판정은 서버 cron 또는 RPC 호출 시점에 한다.
- 접속자는 Supabase Realtime Presence 채널로 교체한다. `Peer` 모델(위치, 포즈, 수건)만 맞추면 된다.
- 로컬 데모에서는 fuel 1 → 0이 30분이다. `LocalFireStore` 생성자 인자로 바꿀 수 있다.

## 자산

3D 모델과 음원 파일 없이 전부 코드로 생성한다(캔버스 텍스처, 기본 지오메트리, Web Audio 합성).
나중에 GLB 모델과 실제 음원으로 교체하면 된다.
