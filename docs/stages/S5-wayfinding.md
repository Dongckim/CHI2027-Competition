# S5 길 안내

브랜치 `stage/S5-wayfinding` · Figma v3 `288:3335` (09 Getting there `292:646`, 09-1 Where are you now `292:683`) · 참고 `reference/wayfinding/arc-wayfinding.html` (읽기 전용)

## 계획 (A)

### 지금 있는 것
- V6(조건부 통과)의 `data/venue/ccib.json`: CCIB 공식 평면도 PDF에서 뽑은 6개 층 전체. 구역 108개(치수·수용 인원·사각형), 문·복도·엘리베이터·에스컬레이터 지점 190개, 연결 212개, 미터. 계단 표시는 PDF에 없음
- `app/src/venue/route.js`: 이 그래프의 최단 경로, 시간 범위, 휠체어(엘리베이터만), 지나는 랜드마크 목록. 문장 안내는 없음
- 플래너는 이미 이 모듈로 이동 시간을 씀 (`venueTravelMinutes`). Today 카드만 가짜 상수 (`today/card.js` `WALK_MIN = [2, 4]`, `FIRST_WALK_MIN = [3, 5]`)
- 피드 `floors[]`: 7개 층, `roomIds`로 방 43개 (P1 23, P0 7, M2 8, P2 3, M1 1, 오디토리움 1)

### 프로토타입이 하는 것 (구조만 참고, 복사 안 함)
- 배치: P1(평면도에서 따라 그림)·P0(추정, "schematic")만. 복도 3개(`Foyer 1`, `the corridor to Rooms 118–134`, `the P0 concourse`), 방 사각형 30개, 엘리베이터 3개, 계단 1개(`the stairs to P0`), 그림만 그리는 영역 4개
- 그래프: 방 문 → 복도 위 가장 가까운 점, 복도는 점들을 순서대로 이음, 엘리베이터는 층마다 탑승 지점 + 층간 연결, 계단 1개
- 비용: 걷기 1.2 m/s, 탑승 30초, 층간 10초, 계단 25초. step-free면 계단 제외
- 시간 범위: 걷기 1.4–1.0 m/s + 엘리베이터·계단 대기
- 문장: 걷기 구간을 복도별로 묶고 "turn left/right" (벡터 외적), 도착은 "is on your left/right", 거리는 10 m 단위 ("a few metres" < 15 m)
- 3D: three.js r128(cdnjs), 층마다 판·복도·방 상자, 경로 곡선과 움직이는 점, 카메라 3가지(Original angle / Fit route / Route floors only), 동작 줄이기면 애니메이션 없음
- 방향 소리: Web Audio PannerNode HRTF, 버튼을 눌러야 시작, `navigator.audioSession.type = "playback"`

### 프로토타입 문장 (테스트 기준, 프로토타입 코드를 그대로 실행해서 얻음)
| 경로 | 결과 |
|---|---|
| Room 117 → Room 127 (step-free) | Leave Room 117, **turn right** and walk about 130 m along **Foyer 1**, then **turn left** into the corridor to Rooms 118–134 and walk about 80 m. **Room 127 is on your right.** (226 m, 3–5 min) |
| Room 133 → Room 111 (step-free) | Leave Room 133, **turn left** and walk about 20 m along the corridor to Rooms 118–134, **then turn right into Foyer 1** and walk a few metres. **Room 111 is on your left.** (40 m, 1–2 min) |
| Room 113 → Posters (계단 허용) | … walk about 20 m along Foyer 1 to **the stairs to P0**. / Take the stairs down to P0. / At the bottom of the stairs, walk about 20 m along the P0 concourse. Exhibit Hall · posters is on your right. |
| Entrance Hall → Room 121 (step-free) | … to Elevator 2. / **Take Elevator 2 up to P1.** / Step out of the elevator and walk about 70 m along Foyer 1, then turn left … **Room 121 is on your left.** |

### 같은 경로를 공식 평면도(ccib.json)로 하면
| 경로 | ccib.json (V6 모듈) |
|---|---|
| 117 → 127 | 195 m, 4–5분, 117 → Elevators → 114 → 112 → **Foyer 2** → 119 → 123 → 127 |
| 133 → 111 | 59 m, 1–2분, 133 → Foyer 1 → 111 |
| 113 → Areas 1+2+3 | 69 m, 2–3분, **에스컬레이터 P1 → M1 → P0** (계단 없음) |
| Entrance Hall → 121 (휠체어) | 130 m, 3–6분, Escalators → **Elevator P0→P1** → Foyer 2 → 119 → 121 |

→ 두 원천이 복도 이름(118–134 복도 = 공식 "Foyer 2"), 층 연결(프로토타입 계단 1개 vs 공식 에스컬레이터 + M1 중간층), 거리(226 vs 195 m)가 다름. 프로토타입의 P0은 스스로 "Rough guess"라고 적혀 있음

### 정한 것 (2026-11-12, 사용자)
1. 원천: **공식 좌표 + 이름 보정** (ccib.json 그대로, 보이는 이름만 `ccib.labels.json`) → 결정 [005](../decisions/005-wayfinding-on-the-official-plan.md)
2. 09 배치: **Figma대로** (안내 목록이 위, 3D는 그 아래 평면도 자리, 하단 I'm here)
3. 문장: **짧은 줄**, 테스트는 프로토타입과 같은 내용인지 확인

### 정해야 했던 것 (구현 전)
1. 길 안내 원천: 프로토타입 배치를 `chi2026.json`으로 / 공식 `ccib.json` 하나로 / 둘을 합침
2. 09 배치: Figma(안내 목록이 위, 140 px 평면도가 아래, 하단 "I'm here") vs 요청(3D가 위, 글 안내가 아래)
3. 안내 문장: Figma의 짧은 줄("Exit right, pass Room 315", "Elevator to Level 4") vs 프로토타입의 긴 문장
- 참고: `reference/wayfinding/p1-floorplan.png`이 저장소에 없음 (프로토타입이 비교 패널에 씀)

### 만들 것 (원천이 정해지면 그대로)
1. 학회장 배치 데이터 + 검사 스크립트 `data/scripts/venue-check.mjs`: 피드 `floors[].roomIds`의 방이 모두 배치에 있는지, 배치의 방 이름이 피드 이름과 같은지, 층이 맞는지. `npm test`에 넣음
2. 경로 모듈 `app/src/venue/` (three.js 없이, node·폰 공용): 그래프 만들기, 최단 경로(step-free면 계단·에스컬레이터 제외), 시간 범위, 단계별 문장(왼쪽/오른쪽), 방향 소리용 신호(각도). 테스트: 위 4개 문장 + 그래프·시간·step-free
3. 3D `app/src/venue/view3d.ts`: `import('three')`로 09를 열 때만 (따로 떨어진 조각, 첫 화면 크기 그대로). `three`는 npm 버전 고정 (`0.187.0`, `package.json`에 `^` 없이). 경로 요약을 canvas의 `aria-label`로, 글 안내가 기본
4. 방향 소리 `app/src/venue/sound.ts`: Hear the turns 버튼을 눌렀을 때만 AudioContext, HRTF, `navigator.audioSession.type = "playback"` 시도, 끝나면 닫음 (소리 저장 없음)
5. Today 연결: `card.js`의 가짜 `WALK_MIN`·`FIRST_WALK_MIN` → 앞 정차에서 이 방까지의 경로 시간 (첫 정차는 Registration에서). step-free면 휠체어 속도·엘리베이터 대기가 들어가서 Leave now가 더 일찍. 카드 문구 "2–4 min walk"도 그 값
6. 2027: 피츠버그 평면도로 학회장 파일만 새로. 모듈은 층·복도·방 이름을 데이터에서만 읽음 (상수에 CCIB 이름 없음)
- 동작 줄이기: `prefers-reduced-motion`이면 카메라 이동·움직이는 점 없음
- WebGL context lost: `webglcontextlost`에서 기본 동작 막고, `webglcontextrestored`·`visibilitychange`에서 장면을 다시 만듦
- 09-1: 방·장소 검색, Your last stop(앞 정차), Registration 등 고정 장소. 위치 추적 없음. "Scan a room sign"은 실험 기능, 기본 꺼짐 (설정 플래그)

## ① 만든 것
- 데이터
  - `data/venue/ccib.labels.json` (손으로 관리): 보이는 복도 이름 (`Foyer 2` → "the corridor to Rooms 118–134", `Foyer 0` → "the P0 concourse"), "Elevator {n}", "Escalator"
  - `data/venue/chi2026.json`에 `floors`(피드 층 ID → 학회장 층)와 `places`(Registration = Entrance Hall, 추정)
  - `data/scripts/venue-check.mjs` (`npm run data:venue:check [edition]`): 피드 `floors[].roomIds`의 방이 모두 문 있는 구역에 연결되는지, 층이 같은지, 장소가 있는지
- 모듈 (three.js 없음, node·폰 공용)
  - `app/src/venue/directions.js`: route() 경로 → Figma식 짧은 줄 + 방향 소리 신호. 왼쪽/오른쪽은 평면도 좌표(y 아래)의 외적, 15 m 안 모퉁이는 한 줄. 이름은 데이터에서만
  - `app/src/venue/walk.js`: 두 방(또는 장소) 사이 분 → Today 카드
  - `route.js`는 지나는 연결(`edges`)도 돌려줌 (나머지 그대로, 플래너 영향 없음)
- 3D `app/src/venue/view3d.js`: 09에서 `import()`로만 불러오는 조각 (`view3d-*.js`, three.js 포함 gzip 137 KB, 서비스 워커 미리 저장에서 뺌). `three` 0.186.1 고정 (`^` 없음; 0.187.0은 나온 지 13일이라 그 전 판)
  - 층을 쌓은 판·구역 상자·복도 선, 목적지 강조(`--highlight`), 경로 관, 움직이는 점, 시작·끝 표시. 색은 토큰에서 (라이트·다크)
  - Original angle / Fit route / Route floors only, 끌어서 돌리기·두 손가락으로 확대
  - 그릴 것이 있을 때만 그림. 동작 줄이기면 카메라 이동·움직이는 점 없음 → 멈추면 그리지 않음
  - `webglcontextlost`에서 기본 동작 막고 `webglcontextrestored`에서 장면을 다시 만듦, 숨은 탭은 건너뜀
  - canvas `role="img"` + `aria-label` = 경로 요약 ("3D view. Route from … to …, about 3–5 min, 192 m, P0 to M1 to P1. The steps are listed above.")
- 단계 번호와 1인칭 (2026-11-12 추가 요청)
  - 경로 위 각 단계 자리에 글 안내와 같은 번호(1, 2, 3 …). 화면에서 크기가 일정하고 가려지지 않음, 지금 단계는 크게·목적지 색·맨 위
  - 글 안내의 각 줄이 버튼(44 px): 누르면 3D가 그 단계로. 3D가 보여 주는 단계는 목록에서 번호가 채워짐(`aria-current="step"`), "Step 3 of 5: …"를 `aria-live`로
  - Walk the route: 눈높이 1인칭으로 경로를 따라감 (미리보기 속도 8 m/s, 앞 14 m를 내려다봄). 닿은 단계가 목록에 표시, Pause / Walk on, 화면을 만지면 멈춤, 이전·다음 단계 버튼
  - 동작 줄이기: 미끄러지듯 움직이지 않고 1단계에 선 뒤 Next step으로 한 단계씩
- 방향 소리 `app/src/venue/sound.js`: Hear the turns를 눌러야 AudioContext, HRTF PannerNode, `navigator.audioSession.type = "playback"` 시도, 끝나면 닫음. 화면에 지금 신호를 `aria-live`로
- 화면 `app/src/screens/Directions.tsx`
  - 09 `#/directions/<paperKey>`: "From …" + Change, 32 px 시간, "to … · 층 · step-free", 번호 목록, 3D, 3개 보기 버튼, Hear the turns, 하단 I'm here (Today 또는 샘플 하루로)
  - 09-1 `#/directions/<paperKey>/from`: 검색(Room or place), Your last stop(앞 정차), Registration, 고른 출발점, 검색한 방. 위치 추적 없음. 고르면 09로 한 번 뒤로
  - "Scan a room sign · experiment": `?experiments=sign-scan` 또는 `localStorage arc.experiments`에 `sign-scan`일 때만, 자리 화면 `#/signscan/<key>`로 (프로토타입 페이지는 `reference/`라 저장소·배포에 없음)
- Today: 카드의 가짜 걷는 시간 → 경로 시간 (앞 정차에서, 첫 정차는 Registration에서), step-free 계획은 step-free 경로 → Leave now가 더 일찍. 학회장 파일에 없는 방은 예전 추정값
- 토큰 `--text-display` 32 px (큰 글씨 36)

## ② 통과 기준 결과
- 경로 테스트 4개 통과 (`tests/venue/directions.test.mjs`, 공식 평면도 기준. 프로토타입과 다른 2개는 테스트에 이유를 적음, 결정 005)
  - 117 → 127 (step-free): "Exit right into Foyer 1, pass Elevators" / "Turn left into the corridor to Rooms 118–134, pass Room 119" / "Room 127 on your right" — 프로토타입과 같은 내용
  - 133 → 111 (step-free): "Exit left into the corridor to Rooms 118–134" / "Turn left into Foyer 1" / "Room 111 on your right" — **프로토타입과 왼쪽·오른쪽이 반대** (공식 평면도에서 111이 모퉁이를 지난 곳)
  - 113 → Posters: "Exit left into Foyer 1" / "**Escalator down to P0**" / "Walk along the P0 concourse" / "Posters on your left" — 계단 대신 에스컬레이터
  - Entrance Hall → 121 (step-free): "… / **Elevator 3 up to P1** / … / Room 121 on your left" — 프로토타입은 Elevator 2
  - 피드 방 모든 쌍 × 걷기/step-free 2,000개 이상: 모두 방에서 끝나고, step-free는 에스컬레이터 0
- 3D가 끊김 없이: 헤드리스 Chrome 390×844, **CPU 4배 느리게**, 움직이는 점이 도는 동안 3초에 181장, 프레임 간격 중앙값 16.7 ms · p95 16.8 ms · 50 ms 넘는 프레임 0 (`tests/venue/directions-check.mjs`). 폰 실기기는 확인 안 함
- 3D는 09에서만: Today에서는 `view3d-*.js` 요청 0, 09를 열면 1. 09를 연 뒤 83 ms에 첫 그림
- WebGL context 잃음 → 복구 → 108 ms 뒤 다시 그림. 동작 줄이기: 멈춘 뒤 1.5초에 0장
- Change → 09-1 → Room 133 → 09 "From Room 133", 뒤로 한 번에 샘플 하루. 이미 고른 줄을 다시 눌러도 09로
- 단계 번호·1인칭 (헤드리스): 단계 5개 = 경로 위 번호 5개, 3번을 누르면 목록·3D가 3번, Walk the route → 1단계에서 시작해 6.3초 뒤 스스로 2단계, Pause면 1초에 0장, 동작 줄이기면 1단계 → Next → 2단계, 그 사이 0장
- `npm test` 93/93 · `contracts:check` 5/5 · `tsc` 0 · `data:venue:check` 7개 층·방 43개 · `build:deploy` 성공 · 첫 화면 JS gzip 99.9 → 106.2 KB (+ 3D 조각 137 KB는 09에서만) · 서비스 워커 14개 파일 (+ 이름 파일)

## ③ 결정과 이유
- 원천은 공식 평면도 (결정 005). 프로토타입 배치를 쓰면 P0이 추정이고 4개 층이 없음
- 3D 모듈은 JS(`view3d.js`): `checkJs`가 꺼져 있어 three.js 타입 패키지를 따로 넣지 않아도 됨
- 3D 조각은 미리 저장하지 않음: "09를 열 때만"을 지키려고. 한 번 열면 서비스 워커가 저장해서 그다음은 오프라인에서도 됨
- 3D 상자 높이는 Figma 140 px를 최소로, 남는 화면을 채움 (Figma에서 평면도 아래가 빈 공간)
- 09-1에서 이미 고른 줄을 다시 눌러도 돌아감: radio는 이미 선택된 것을 누르면 change가 없어서, 처음엔 아무 일도 안 일어났음 (헤드리스 확인에서 발견)

## ④ 남은 문제
- **확인 필요**: 프로토타입과 공식 평면도가 다른 3가지 (133→111 좌우, 계단 vs 에스컬레이터, 엘리베이터 번호). 공식 평면도가 맞다고 봤지만 현장 확인 없음
- 공식 평면도의 복도·문은 일부 손 입력(`estimate`), 엘리베이터 대기·속도는 경험값 (V6 그대로)
- 엘리베이터·에스컬레이터에서 내린 뒤 어느 쪽을 보는지 평면도에 없어서 "Walk along …"만 (왼쪽/오른쪽 없음)
- 09 첫 화면에 3D 아래 버튼들(Hear the turns 설명)이 하단 버튼에 가려질 수 있음 (스크롤하면 보임)
- 3D의 구역 이름(글자)은 그리지 않음. 목적지만 색으로
- 전체 보기에서는 가까운 단계(예: 에스컬레이터 앞뒤)의 번호가 겹침. 지금 단계가 맨 위에 오고, Fit route나 단계를 누르면 펼쳐 보임
- 1인칭은 방 상자가 낮아(1.6 m) 벽 사이를 걷는 느낌은 아님. 엘리베이터·에스컬레이터 구간은 위아래로 곧게 움직임
- 1인칭 중 CPU 4배 프레임 측정은 안 함 (전체 보기에서만 p95 16.8 ms)
- Registration 위치는 추정 (Entrance Hall)
- 폰 실기기: 3D 끊김·소리·아이폰 무음 스위치 확인 안 함
- "Scan a room sign"은 자리 화면만 (프로토타입은 `reference/`라 배포 안 됨)

## ⑤ 다음 단계가 알아야 할 것
- 학회장이 바뀌면 데이터 3개만: `<venue>.json`(PDF), `<venue>.labels.json`(이름), `<edition>.json`(방·층·장소). `npm run data:venue:check <edition>`
- 안내 문장은 `directions(venue, labels, route(...))`. 화면 밖(S6 등)에서도 같은 함수
- 3D를 다른 화면에서 쓰려면 `import('../venue/view3d.js')`의 `mount(canvas, { venue, route, summary, reduceMotion })`, 꼭 `dispose()`
- 헤드리스 확인: `npm run build && node --experimental-websocket tests/venue/directions-check.mjs [스크린숏 폴더]` (WebGL은 SwiftShader)

## ⑥ 비용·토큰
- 외부 API 없음 (경로·소리·3D 모두 폰 안)
- 데이터: 이름 파일 1 KB 미만 (미리 저장), 3D 조각 gzip 137 KB (09를 처음 열 때 한 번)
