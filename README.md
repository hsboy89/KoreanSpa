# 파팅 라운지

파팅(parting.io)의 파티 카테고리를 아바타로 둘러보는 3D 라운지. 가운데 광장을 두고 카테고리 방 6개가 붙어 있다.
각 방 벽에는 파팅 로고와 QR이 걸려 있고, QR을 찍으면 parting.io로 이어진다. 채팅은 없고 같이 있는 사람만 보인다.

## 실행

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 타입 체크 + dist 빌드
npm run preview  # dist 미리보기
```

main에 푸시하면 Vercel이 자동 배포한다.

## 조작

- 바닥 클릭 또는 WASD / 방향키로 이동, 드래그로 둘러보기, 휠과 두 손가락으로 확대/축소
- 1 방 목록 · 2 앉기/일어나기 · 3 손 흔들기 · 4 건배
- 광장과 방 사이는 문을 거쳐 자동으로 길을 잡는다. 카메라와 내 캐릭터 사이에 낀 벽과 명패는 반투명해진다.

## 카테고리 바꾸기

[src/scene/rooms.ts](src/scene/rooms.ts) 한 파일만 고치면 된다.

- `ROOM_THEMES`: 방 이름, 한 줄 소개, 바닥·벽·조명 색
- `ROOM_LAYOUTS`: 방 위치와 문 방향
- `PARTING_URL`: QR과 "파티 보기" 버튼이 가리키는 주소. 지금은 메인으로 통일
- 방마다 다른 소품은 [src/scene/world.ts](src/scene/world.ts)의 `decorate()`에 테마 id별로 있다.

로고는 코드로 그린 임시 마크다. 공식 로고 파일이 생기면 [src/scene/brand.ts](src/scene/brand.ts)의 `drawLogoMark`와 [src/ui/hud.ts](src/ui/hud.ts)의 SVG, `public/favicon.svg`를 교체한다.

## 구조

```
src/
  main.ts              부팅 화면 → Game 시작
  game.ts              씬, 입력, 경로 탐색, 앉기/이모트, 봇, 가림 처리, 루프
  scene/rooms.ts       카테고리 정의와 배치 (여기만 고치면 방이 바뀐다)
  scene/world.ts       광장과 방 생성, 벽 충돌, 자리, 테마별 소품
  scene/brand.ts       로고 마크, 벽 안내판(QR 포함), 명패 텍스처
  scene/avatar.ts      평상복 절차적 아바타, 포즈(idle/walk/sit), 이모트(wave/cheers)
  scene/controls.ts    OrbitControls 추적 카메라, 클릭 이동, WASD
  ui/hud.ts            브랜드, 현재 위치 칩, 방 목록, 동작 바, 토스트, 도움말
  state/presence.ts    접속자 모델 + 목업 봇
  state/supabase.ts    Supabase 클라이언트 (접속자 연동 예정)
  audio/ambient.ts     Web Audio 절차적 라운지 음악과 룸톤
```

## 접속자 연동 (예정)

지금 접속자는 목업 봇이다. Supabase Realtime Presence 채널로 교체하며 테이블은 필요 없다.
`Peer` 모델(이름, 복장, 방, 자리)만 맞추면 된다. `.env.example`을 `.env.local`로 복사해 URL과 anon 키를 넣는다.

`supabase/migrations/`의 불·기록 테이블은 이전 컨셉(온라인 찜질방)의 것으로 지금 앱은 쓰지 않는다. 지워도 된다.

## 보안

- 브라우저에는 공개용 anon/publishable 키만 넣는다. `VITE_`로 시작하는 값은 번들에 포함된다.
- `vercel.json`이 CSP와 보안 헤더를 건다. 외부 스크립트, 스타일, 폰트, 이미지를 쓰지 않는다. 새 외부 출처가 필요하면 CSP를 함께 고친다.
- 접속자를 붙일 때 다른 사람이 보낸 이름과 값은 `textContent`로만 넣는다.

## 자산

3D 모델과 음원 파일 없이 전부 코드로 생성한다(캔버스 텍스처, 기본 지오메트리, Web Audio 합성, QR은 qrcode 패키지).
