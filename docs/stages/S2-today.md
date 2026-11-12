# S2 오늘

브랜치 `stage/S2-today` (S1 위에 쌓음, S1 머지 후 main 기준으로 PR) · Figma v3 `288:1174` (2 · 오늘 · 하루의 흐름)

## 계획 (A)

### 1. 플래너를 앱에서 쓰는 방법
- 같은 코드: `app/src/planner/plan.js`의 `planDay` (tests/planner/try.mjs가 부르는 것)
- `app/src/today/plan-days.js`의 `planDays({ index, travelMinutes, days }, response, plan)` → 날짜마다 `{ day, stops, conflicts, skipped }`
  - 입력 = 추천 items (`candidatesFor`: 꺼진 주제·볼 종류로 거름) + 계획: 날짜(고른 날만), 필요한 것(step-free → 휠체어 경로, fewer room changes → 이동 비용 ×3), How full(`limitStops` 4/6/8)
  - 샘플 하루(`plan = null`): 추천 전부, 필요한 것·한도 없음
  - 이동 시간: S1과 같이 학회장 그래프(`venueTravelMinutes`). 플래너는 이미 이것으로 "갈 수 있는" 일정만 짬

### 2. 시계 (`app/src/clock.ts`)
- 지금 시각은 여기서만: `now()`, 화면은 `useNow()` (데모가 바뀔 때, 실제 시계는 30초마다 다시 그림)
- `setDemoNow(ms)`: 03-P 슬라이더가 데모 시각을 넣음 → 앱 전체가 그 시각으로. `setDemoNow(null)` = 실제 시계
- 데모 시각은 샘플 하루와 거기서 연 상세 화면(06/09/S6 자리)에서만 유지, 다른 곳으로 가면 App이 실제 시계로 되돌림

### 3. 맨 위 카드 규칙 (`app/src/today/card.js` `dayCard`)
위에서부터 처음 맞는 것:

| 조건 (그날 정차를 시간순으로) | 카드 | 내용 |
|---|---|---|
| 정차 없음 | (없음) | "Nothing planned for Tuesday." |
| 어떤 정차의 시작 ≤ 지금 < 끝 | NOW | "Talk i of n · ~m min in" (포스터 등 block 세션은 "~m min in · 방"), "You missed k earlier talks", Catch up / Question |
| 지금 ≥ 마지막 정차의 끝 | DONE (진한 카드) | "Your Tuesday is done", "n of n stops", See your day, 다음 날 링크 |
| 지금 ≥ 다음 정차의 Leave now 시각 | LEAVE NOW (진한 카드) | "Starts in ~m min · 2–4 min walk" |
| 다음 정차가 그날 첫 정차 | FIRST STOP | "3–5 min from Registration" |
| 그 밖 | NEXT | "2–4 min walk" |

- 카드 아래 줄: 카드에 나온 정차 뒤의 정차들. 제목 줄 "Your Tuesday · 끝난 수 of 전체"
- 다른 날짜(03-F)는 카드 없이 "Your Wednesday" + 전체 줄

### 4. Leave now 시각
- `leaveAt = 다음 시작 − 걷는 시간(느린 쪽) − 여유 5분`
- 걷는 시간은 S5 전까지 가짜: 정차 사이 2–4분, 첫 정차는 등록대에서 3–5분 (`WALK_MIN`, `FIRST_WALK_MIN`, `shortcut:` 주석)
- 예: 09:00 첫 발표 → 08:50부터 LEAVE NOW, 11:15 → 11:06부터

### 5. 2027 데이터가 없을 때 데모
- 샘플 하루 = chi2026 프로그램에서 가짜 추천이 고르는 날 (화요일 2026-04-14), 개최지 시간(Europe/Madrid)
- 띠에 "Tue, Apr 14, 2026 · CHI 2026 programme · venue time"을 적어서 심사위원이 실제 날짜가 아님을 알게 함
- 날짜 탭은 데이터의 날짜 그대로 (Mon 13 ~ Fri 17). chi2027 피드가 나오면(2027년 4월) 같은 코드가 2027 날짜·America/New_York로 동작 (시간대 변환 테스트 포함)
- 계획 모드(실제 시계)에서는 지금이 학회 날이 아니므로 모든 날이 미리보기(03-F)로 보임

## ① 만든 것
- `app/src/clock.ts`: 시계 한 곳 (실제/데모)
- `app/src/time.js`: `wallToInstant`(빌드 스크립트에서 옮김, `build.mjs`는 다시 내보냄), `venueInstant(day, minutes, tz)`, `venueClock(ms, tz)`
- `app/src/today/card.js`: 카드 규칙, `laterStops`, `talkPosition`(세션 안 몇 번째 발표인지), `sessionSlotsFrom`
- `app/src/today/plan-days.js`: 추천 + 계획 → 날짜별 일정
- `app/src/screens/Today.tsx`: 날짜 탭, 카드 5가지 + 빈 날, 남은 줄(TRY NEW / PICK ONE / POSTER / PAPER / DEMO), DONE의 See your day·다음 날, 03-P 띠와 슬라이더
- `app/src/screens/Placeholder.tsx`: `#/talk/<key>` (06, S4), `#/directions/<key>` (09, S5), `#/catchup/<key>`·`#/question/<key>` (S6) 자리. 발표 제목은 실제로 보여 줌
- 줄(태그·제목)과 카드 제목 → 06 자리, Directions → 09 자리, Catch up/Question → S6 자리
- `ButtonLink` (버튼 모양 링크), LinkRow `onClick`
- `schedule.json` 세션에 `timing`(talks/block/none) 추가 → 앱 데이터 경로 `r1-fb93c8b5` → `r1-831bd150`
- 테스트 `tests/app/card.test.mjs` 4개: 경계값, 세션 안 순서, 시간대 변환(DST·chi2027 EDT), 샘플 화요일 시각별 카드

## ② 통과 기준 결과
- `npm test` 56/56 · `contracts:check` 4/4 · `tsc` 0 · `build:deploy` 성공 · JS gzip 80 → 82 KB
- 샘플 화요일 정차: 09:00 · 11:15(PICK ONE) · 12:03 · 14:15(포스터)
- 시각별 카드 (테스트 + 헤드리스 Chrome 390×844에서 슬라이더를 실제로 움직여 같은 결과):

| 시각 | 카드 | 내용 | 제목 줄 |
|---|---|---|---|
| 8:40 | FIRST STOP | ~09:00 · P1 - Room 127, 3–5 min from Registration | 0 of 4 |
| 8:50 | LEAVE NOW | Starts in ~10 min | 0 of 4 |
| 9:05 | NOW | Talk 1 of 6 · ~5 min in | 0 of 4 |
| 10:22 | NEXT | ~11:15 · P1 - Room 130 | 1 of 4 |
| 11:08 | LEAVE NOW | Starts in ~7 min (슬라이더는 5분 단위라 11:10 → ~5 min) | 1 of 4 |
| 11:20 | NOW | Talk 1 of 7 · ~5 min in | 1 of 4 |
| 11:40 | NEXT | ~12:03 · P1 - Room 134 | 2 of 4 |
| 12:07 | NOW | Talk 5 of 7, You missed 4 earlier talks | 2 of 4 |
| 15:00 | NOW | ~45 min in · Area 1 + 2 + 3: posters | 3 of 4 |
| 18:30 | DONE | Your Tuesday is done · 4 of 4 stops | — |

- Directions → `#/directions/…`, 줄 → `#/talk/…`, 뒤로 오면 슬라이더 시각 유지. 샘플은 저장하지 않음 (다시 열면 O-1)
- 폰 실기기 (2026-11-11, 정식 배포 `main` `350f1db`, 사용자 확인, 기종·브라우저는 기록 안 함): 샘플 데이에서 슬라이더를 움직이면 맨 위 카드가 시각에 맞게 바뀜. 완료 기준 충족
- 판정: 통과

## ③ 결정과 이유
- **발표 시각은 데이터의 값** (세션 시작 + 콘텐츠 종류 길이 × 순서, data:build가 계산). 요청의 "발표당 12분 추정" 대신 이것을 씀: CLAUDE.md "12분 상수 금지" (해마다 길이가 다름). chi2026은 실제로 12분이라 화면 결과는 같음
- "You missed k" = 세션에서 이 발표 앞의 발표 수 (Catch up이 요약할 대상)
- LEAVE NOW 시각의 여유 5분: 03-C의 "Starts in ~8 min"과 같은 범위. 첫 정차는 등록대에서 오래 걸려서 10분 전
- NOW가 LEAVE NOW보다 먼저: 듣는 중인 발표를 끊지 않음. 플래너가 이미 이동할 수 있는 시간만큼 띄워 둠
- 슬라이더 범위 8:30~18:30 (요청은 9:00~18:00): 9:00에는 첫 발표가 이미 시작돼 FIRST STOP을 볼 수 없음. 시작값 8:40 (FIRST STOP부터 하루를 따라가게)
- 03-P의 시각 칩(9:00, 10:25 …) 대신 슬라이더 하나 (요청대로). Chip 컴포넌트는 남아 있음
- DONE 카드는 진한 카드 (Figma 03-E), 그 안 버튼은 진한 카드용 색

## ④ 남은 문제
- ~~폰 실기기 확인~~ → 확인함 (②)
- 걷는 시간이 가짜(2–4분, 3–5분) → S5에서 학회장 경로로
- Skip, Edit, 줄의 … 버튼은 아직 동작 없음
- 가짜 추천은 화요일만 있어서 다른 날은 "Nothing planned", 03-F 미리보기를 실제로 보려면 다른 날 추천이 필요
- DONE의 "[5] talks saved"는 저장 기능이 없어서 뺌
- 계획 모드에서 지금이 학회 날이 아니면 데모 시계가 없음 (요청대로 03-P에만). 심사위원은 Try a sample day로
- DeviceState 계약은 S7에서 확정 (S1에서 이어짐)

## ⑤ 다음 단계가 알아야 할 것
- 시각은 `now()` / `useNow()`만. `Date.now()`를 화면 코드에서 직접 쓰지 말 것 (데모가 깨짐)
- 개최지 시각 ↔ 순간: `venueInstant`, `venueClock` (app/src/time.js). 빌드와 앱이 같은 함수
- S4 06 상세: `#/talk/<paperKey>` 자리를 Placeholder에서 바꾸면 됨. 초록은 `loadAbstracts(abstractDay(paper, tz))`
- S5 09 길 안내: `#/directions/<paperKey>`, 그리고 `card.js`의 `WALK_MIN`·`FIRST_WALK_MIN`을 실제 경로로
- S6: `#/catchup/<key>`, `#/question/<key>`. `talkPosition`이 missed 발표 수를 줌
- 앱 데이터 내용을 바꾸면 경로 해시가 바뀜 (이번에 `timing` 추가로 바뀜) → 옛 경로는 다음 배포에서 사라지고 앱은 새 경로를 번들에 가짐

## ⑥ 비용·토큰
- 외부 API 비용 0
- 토큰 사용량은 측정하지 않음
