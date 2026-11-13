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
  - 공식 P1 이미지와 같은 비스듬한 위 각도(방위 45°)가 기본이자 유일한 각도. 층을 쌓은 판, 원본처럼 낮은 방 블록(1.6 m), 복도 선, 경로 선과 진행 방향 갈매기. 색은 `--plan-*` 토큰 (라이트·다크). 묶음 구역(`113+114`)은 부분과 겹쳐 그리지 않음
  - 방 번호는 잰 문 자리(방 안쪽)에, 엘리베이터·에스컬레이터·화장실은 잰 지점에 그림 아이콘. 평면도의 `estimate` 지점과 벽 높이는 쓰지 않음 (P1은 추정 지점 0)
  - 목적지 방은 금색 테두리
  - 보기 막대(3D 바로 아래, 큰 화면에서는 3D 위): Whole(전체) / Route(경로에 맞춤) / Floors(경로 층만)
  - 터치는 지도 앱처럼: 한 손가락 끌기 = 평면도 밀기(손가락을 따라감, 학회장 밖으로는 안 감), 두 손가락 비틀기 = 돌리기, 같이 위아래 = 기울이기, 벌리기 = 확대 (휠 = 확대). 끈 뒤에는 단계를 가운데로 다시 맞추지 않고, Next·목록의 단계·Whole·Route를 누르면 원본 각도로 다시 맞춤 (2026-11-13 사용자: 한 손가락 스와이프로 단계 넘기기는 인터랙션이 이상 → 밀기로)
  - 그릴 것이 있을 때만 그림. 동작 줄이기면 카메라 이동 없이 바로 바뀜 → 멈추면 그리지 않음
  - `webglcontextlost`에서 기본 동작 막고 `webglcontextrestored`에서 장면을 다시 만듦, 숨은 탭은 건너뜀
  - canvas `role="img"` + `aria-label` = 경로 요약 ("3D view. Route from … to …, about 3–5 min, 192 m, P0 to M1 to P1. The steps are listed above.")
- 단계마다 멈춤 (2026-11-12 사용자 피드백: 1인칭은 가상 환경 같고 무엇을 하라는지 불분명 → 빼고 아래로)
  - Show step 1 / Next / 이전, 또는 목록의 단계: 앞 단계에서 그 단계까지 금색 점이 경로를 따라 달리고 보기가 따라감(거리에 따라 0.9–2.6초, 에스컬레이터·엘리베이터는 중간에 층이 바뀜), 끝나면 그 단계를 빈 영역 가운데에 맞춤. 손가락을 대거나 Whole·Route를 누르면 멈춤. 동작 줄이기면 바로
  - 단계 카드(3D 위): 큰 방향 아이콘(→ ← ↑, 위·아래, 도착) + 한 줄 (목록 문장에서 "pass …"를 뺀 것, 도착은 "Room 127 · on your right"). 목록과 같은 단계 데이터, 지금 단계는 목록에서 번호가 채워짐(`aria-current="step"`)
  - 바닥 화살표: 지금 단계에만, 들어오는 방향에서 나가는 방향으로 꺾인 금색 화살표(도로 표지처럼). 도착은 복도에서 문 안으로. 그 구간의 갈매기는 숨김
  - 경로 선: 단계별 구간으로 나눠 지나온 구간 회색(`--plan-passed`), 지금 구간 금색 + 흰 테두리(`--plan-casing`), 남은 구간 진한 색. 선 위 갈매기는 걷는 방향. 경로·표시는 깊이 검사 없이 그 층 블록 다음·위층 블록 전에 그림 → 방 블록에 묻히지 않고(Entrance Hall), Whole에서는 위층이 가림. 그래서 경로가 있는 층의 바닥판은 불투명
  - 단계 번호: 동작 지점(꺾는 곳·탑승 지점·문)에 발. 지금 단계는 큰 번호(46 px)를 꺾임 바깥쪽으로 36 px 띄우고 같은 길이 막대로 연결(탑승은 위로, 오른쪽에 "To P1"). 화면 px 기준이라 확대·축소해도 같음. 나머지는 작은 점(18 px). Whole에서는 모든 번호(34 px). 시작은 고리 위 핀
  - 지나온 구간은 점선(--plan-passed, 바닥 대비 라이트 2.94:1·다크 2.97:1, 잰 바닥색 133·28), 그 구간 갈매기 숨김. 테두리 --plan-casing 라이트 흰색·다크 #1c1c1c
  - 겹침 정리(`declutter`): 화면 좌표로 순위대로 놓고 겹치면 낮은 것을 숨김(150 ms 흐려짐, 동작 줄이기면 바로). 순위: 시작 핀(1단계·전체 보기) → 지금 단계 번호·표지 → 목적지(테두리 안 방 번호 허용) → 다른 단계 점 → 이번에 타는·방금 내린 시설(지점 8 m 안, 경로 위) → 경로 12 m 안 방 번호 → 나머지 아이콘 → 나머지 방 번호. 지금 번호는 꺾임 바깥쪽부터 45°씩 돌려 시작 핀을 반드시, 이번 시설은 되도록 피함. 단계 보기에서는 지점 25 m 안 라벨과 타는 시설만, 카드·막대 아래 라벨은 숨김. 카메라·단계·크기가 바뀔 때만 다시 계산
  - 화면 정리: 09가 카드·막대가 가리는 높이를 `view.pad()`로 넘기고, 3D는 지금 단계 지점·큰 번호·표지를 그 사이 빈 영역 가운데로 옮김(view offset, 각도·확대는 그대로). Whole/Route/Floors는 지도 밖 아래(큰 화면은 지도 위), "Step n of m"은 sr-only, 버튼은 작은 ‹ + 큰 Next, 마지막 단계는 ‹ + "You've arrived" (I'm here는 아래 고정 버튼 하나)
  - 층별로 보기: 단계에서는 그 단계 층만 보이고 방 번호·시설 아이콘도 그 층 것만 나옴. 올라가기·내려가기 단계는 출발 층만 보이고 금색 "↑ To P1"(↓) 표지. Whole·Route·Floors에서는 모든 층(또는 경로 층)을 보이되 번호·아이콘은 숨김(겹침 방지), 층 사이 이동은 세로 선으로
  - 큰 화면: 폰을 가로로 돌리면 3D가 화면 전체가 되고 카드·보기 막대·단계 버튼을 그대로 씀, 세로로 돌리면 원래대로. 세로에서도 Larger plan 버튼으로 같은 화면 (안드로이드 Chrome은 전체 화면 + 가로 고정, 아이폰은 창 전체). 뒤로·Esc·닫기로 09
- 방향 소리 `app/src/venue/sound.js`: Hear the turns를 눌러야 AudioContext, HRTF PannerNode, `navigator.audioSession.type = "playback"` 시도, 끝나면 닫음. 화면에 지금 신호를 `aria-live`로
- 화면 `app/src/screens/Directions.tsx`
  - 09 `#/directions/<paperKey>`: "From …" + Change, 32 px 시간, "to … · 층 · step-free", 번호 목록(각 줄을 누르면 3D가 그 단계로), 3D(카드·보기 막대·크게 보기), 단계 버튼, Hear the turns, 하단 I'm here (Today 또는 샘플 하루로)
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
- 단계 (헤드리스): 단계 5개 = 경로 위 번호 5개, Show step 1 → 1, Next → 2, Next → 3 (목록·카드가 같이), 한 손가락으로 120 px 끌면 보는 곳만 옮겨지고 단계 그대로, 그 단계를 다시 누르면 원래 자리·빈 영역 안, Whole → 단계 없음. 동작 줄이기면 단계가 바로 바뀌고 그 뒤 0장
- 층 (헤드리스): 단계 1 → 보이는 층 1개(`canvas.dataset.levels`), Whole → 여러 층. Registration → 127 스크린숏: 에스컬레이터 단계는 P0만 + "To P1" 표지, 3·5단계는 P1만
- 라벨 (헤드리스): 단계 1·2·3에서 보이는 라벨끼리 겹침 0, 지금 단계 번호 보임. 단계 사이 이동 중 CPU 4배 p95 16.7 ms. Registration → 127(5단계)·Room 117 → 127(3단계), 라이트·다크 모든 단계에서 겹침 0
- 빈 영역 (헤드리스): 모든 단계에서 지점·큰 번호가 카드와 막대 사이 안(`canvas.dataset.inArea`), 마지막 단계 = Previous step + "You've arrived", I'm here 버튼은 1개. Registration → 127·Room 117 → 127 라이트·다크 모든 단계 영역 안·겹침 0
- 두 손가락 (헤드리스): 시계 방향 0.5 rad 비틀기 → 보기 0.5 rad 돎(평면도도 시계 방향, 스크린숏 확인), 같이 올리기 → 기울기 0.95 → 1.19, Whole → 0.785, 0.950 (원본 각도)
- 큰 화면 (헤드리스): 가로 844×390으로 돌리면 3D가 화면 전체(카드·보기 막대·단계 버튼), 세로로 돌리면 09로. Larger plan → 390×844, 뒤로 → 09
- 117 → 127 세 장면(출발·Foyer 2로 꺾기·도착)과 가로 화면을 원본 P1 이미지와 나란히 확인 (사용자 확인용 스크린숏)
- (교차 검토 수정 후) `npm test` 99/99 · 헤드리스 전체 통과(CPU 4배 p95 16.8 / 16.7 ms) · revision-check 2/2 · 첫 화면 JS gzip 109.0 KB, 3D 조각 150.6 KB
- `npm test` 94/94 · `contracts:check` 5/5 · `tsc` 0 · `data:venue:check` 7개 층·방 43개 · `build:deploy` 성공 · 첫 화면 JS gzip 99.9 → 106.2 KB (+ 3D 조각 137 KB는 09에서만) · 서비스 워커 14개 파일 (+ 이름 파일)

- 교차 검토(결론을 모르는 새 에이전트, 재현한 것만) 5건 모두 고침, 테스트를 먼저 넣어 실패를 확인한 뒤:
  - 좌표 없는 곳(오디토리움·Connecting Walkway): 왼쪽/오른쪽·pass 없이 "Take the Connecting Walkway to the Auditorium · about 120 m" → "Auditorium entrance", 3D는 "No floor plan for the Auditorium". 오디토리움에서 시작하면 출구 기준 "Leave the Auditorium · take the Connecting Walkway to Access A · about 120 m", 3D는 Access A에 "You come out here". 좌표 없는 곳을 지나는 모든 경로에서 방향 단어 0 (테스트). 플래너 걷는 시간은 이미 통로 116.8 m 포함 (테스트로 고정)
  - 09를 연 채 경로가 바뀌거나 새 revision이 와도 3D가 다시 그림 (경로마다 새 canvas). `tests/venue/revision-check.mjs`(가짜 revision 2): 고치기 전 2개 실패 → 통과
  - 09-1에서 고른 출발점은 09를 떠나면(I'm here 포함) 지움: 다시 열면 From Registration (헤드리스)
  - 같은 방은 "Same room", 같은 구역은 "Same area", Directions 버튼 숨김 (`walkNote`, 테스트)
  - `directions-check.mjs`가 중간에 멈추면 "FAIL: stopped: …" (전에는 PASS 출력)

## ③ 결정과 이유
- 원천은 공식 평면도 (결정 005). 프로토타입 배치를 쓰면 P0이 추정이고 4개 층이 없음
- 3D 모듈은 JS(`view3d.js`): `checkJs`가 꺼져 있어 three.js 타입 패키지를 따로 넣지 않아도 됨
- 3D 조각은 미리 저장하지 않음: "09를 열 때만"을 지키려고. 한 번 열면 서비스 워커가 저장해서 그다음은 오프라인에서도 됨
- 3D 상자 최소 300 px (Figma는 140 px): 단계 카드가 위에 얹히고 단계 주변 방이 보여야 해서
- 1인칭·어깨 뒤 시점은 뺌 (사용자 결정): 원본 평면도와 같은 각도에서 단계마다 멈추는 쪽이 현장과 맞춰 보기 쉬움
- 09-1에서 이미 고른 줄을 다시 눌러도 돌아감: radio는 이미 선택된 것을 누르면 change가 없어서, 처음엔 아무 일도 안 일어났음 (헤드리스 확인에서 발견)

## ④ 남은 문제
- **확인 필요**: 프로토타입과 공식 평면도가 다른 3가지 (133→111 좌우, 계단 vs 에스컬레이터, 엘리베이터 번호). 공식 평면도가 맞다고 봤지만 현장 확인 없음
- 공식 평면도의 복도·문은 일부 손 입력(`estimate`), 엘리베이터 대기·속도는 경험값 (V6 그대로)
- 엘리베이터·에스컬레이터에서 내린 뒤 어느 쪽을 보는지 평면도에 없어서 "Walk along …"만 (왼쪽/오른쪽 없음)
- 09 첫 화면에 3D 아래 버튼들(Hear the turns 설명)이 하단 버튼에 가려질 수 있음 (스크롤하면 보임)
- 3D의 구역 이름(글자)은 그리지 않음. 목적지만 색으로
- 전체 보기에서는 가까운 단계(예: 에스컬레이터 앞뒤)의 번호 중 겹치는 것은 숨김. 단계를 누르면 그 지점으로 가서 보임
- 원본 이미지는 구역을 색으로 칠하고(빨간 방, 파란 복도) 방을 두 개씩("118-119") 적음. 우리는 피드처럼 방을 하나씩 회색 블록으로
- 아이폰은 가로 고정·진짜 전체 화면이 안 됨 (Safari 제한): 돌리면 창 전체를 씀. 실제 폰에서 주소창·노치 확인 안 함
- 3D 위에서 한 손가락 끌기는 평면도를 밀고 페이지는 스크롤하지 않음(touch-none): 폰에서 3D 위로 페이지를 스크롤하려다 막히지 않는지 실기기 확인 안 함
- Registration 위치는 추정 (Entrance Hall)
- 폰 실기기: 3D 끊김·소리·아이폰 무음 스위치 확인 안 함
- "Scan a room sign"은 자리 화면만 (프로토타입은 `reference/`라 배포 안 됨)

## ⑤ 다음 단계가 알아야 할 것
- 학회장이 바뀌면 데이터 3개만: `<venue>.json`(PDF), `<venue>.labels.json`(이름), `<edition>.json`(방·층·장소). `npm run data:venue:check <edition>`
- 안내 문장은 `directions(venue, labels, route(...))`. 화면 밖(S6 등)에서도 같은 함수
- 3D를 다른 화면에서 쓰려면 `import('../venue/view3d.js')`의 `mount(canvas, { venue, route, summary, reduceMotion })`, 꼭 `dispose()`
- 헤드리스 확인: `npm run build && node --experimental-websocket tests/venue/directions-check.mjs [스크린숏 폴더]` (WebGL은 SwiftShader), 09를 연 채 경로·revision이 바뀌는 경우는 `tests/venue/revision-check.mjs`
- 좌표 없는 장소(예: 2027 학회장의 별관)는 평면도 그래프에 이름 있는 연결과 거리만 있으면 됨: directions가 그 구간을 한 줄로, 3D는 "No floor plan for …"

## ⑥ 비용·토큰
- 외부 API 없음 (경로·소리·3D 모두 폰 안)
- 데이터: 이름 파일 1 KB 미만 (미리 저장), 3D 조각 gzip 137 KB (09를 처음 열 때 한 번)
