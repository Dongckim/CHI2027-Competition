# S3 바꾸기·예외

브랜치 `stage/S3-changes` · Figma v3 `288:1903` (3 · 오늘 · 바꾸기와 예외)

## 계획 (A)

### 1. 사용자 변경을 저장하고 다시 계산하는 방법 (`app/src/today/edits.js`)
- 플래너 결과를 고치지 않고 **플래너 입력**을 고침. 변경은 세 목록:
  - `removed`: Remove, Skip으로 뺀 것. 다시 제안하지 않음
  - `passed`: PICK ONE에서 고르지 않은 쪽. 일정에서는 빠지지만 More for you에는 나옴
  - `added`: Pick, Swap, More for you의 + Add로 넣은 것. 관련도에 +10을 더해서 플래너와 How full이 항상 남김
- 저장: 계획이 있으면 DeviceState `plan.edits` (localStorage), 샘플 하루는 메모리. `edits`가 없는 옛 계획은 "변경 없음"으로 읽음 (version 1 그대로)
- 다시 계산: 바뀔 때마다 `planDays`가 같은 플래너를 다시 돌림 (기기 안, 서버 호출 없음)
- 되돌리기: 동작 직전의 `edits`를 토스트가 기억했다가 Undo에서 그대로 돌려놓음

### 2. PICK ONE 규칙과 영상 여부
- 같은 시각 다른 발표 = 플래너의 `conflicts`. 행을 누르면 두(이상) 발표와 Choose
- 영상 여부: `data/build/<edition>/papers.json`의 `video` (피드 `contents[].addons`의 `type: video` URL, 없으면 null). chi2026: 2,782편 중 544편 (Paper 270, Posters 235, Demos 39)
  - 영상 없음 → "Only here now", 있음 → "Can catch later"
- Choose → `pickOne`: 고른 것 added, 나머지 passed

### 3. 프로그램 변경 (`app/src/data/programme.ts`, `app/src/today/changes.js`)
- `version.json?t=<지금>`을 1분마다, **탭이 보일 때만** (숨은 탭은 건너뛰고, 다시 보일 때 1분이 지났으면 확인). 30초 미만 간격은 `checkDue`가 막음
- revision이 앱 데이터의 revision보다 크면 → 그 `revision_url` 파일만 받기 → 빌드와 같은 `buildEdition`(`data/scripts/edition.mjs`로 분리, 브라우저에서 따로 떨어진 2.8 KB 조각) → 새 프로그램으로 일정을 다시 짬
- `diffStops`: 내 일정에 있는 발표만 비교 → 방 이동 / 시간 이동 / 빠짐. 있으면 03-M 알림("Programme updated. [발표] moved to [방]." + OK)과 행의 "Moved to …"
- OK = 그 revision은 다시 알리지 않음 (`arc.programmeSeen`)
- 테스트용 가짜 변경: 샘플 하루의 "Simulate a room change" 버튼, 또는 아무 화면에서 주소에 `?simulate=room-change` (같은 경로로 한 발표의 방을 바꿈)
- CORS: version.json·revisions 모두 `access-control-allow-origin: *`, 커스텀 헤더 없는 GET만

### 4. 오프라인 (`app/sw.js`, `app/scripts/copy-static.mjs`)
- 서비스 워커를 빌드가 만듦: 그 배포의 파일 목록을 미리 저장 (페이지, 해시 붙은 JS·CSS·woff2, Today의 `schedule.json`, 학회장 그래프 2개 = 12개)
  - 페이지: 네트워크 먼저, 끊기면 저장된 index.html
  - `/assets/`, `/app-data/`: 저장본 먼저 (이름에 내용 해시)
  - `/data/venue/`: 저장본을 바로 주고 뒤에서 갱신
  - 피드 revision 파일: 저장본 먼저 (바뀌지 않음), version.json은 저장 안 함
- 새 배포 = 새 서비스 워커 → 옛 저장본 삭제 (`sw.js`는 `no-cache`)
- "Offline · saved at 08:40": 마지막으로 온라인에서 일정 데이터를 받은 시각 (`arc.savedAt`, 개최지 시각)

### 5. More for you 규칙 (`app/src/today/more.js`)
- 대상: 추천 항목 중 그날 일정에 없는 것 (뺀 것 제외, PICK ONE에서 넘긴 것 포함)
- 빈 시간: 그날 세션 시작~끝 안에서 정차 사이 10분 이상
- 맞음: 슬롯이 빈 시간 안에 들어가고, 앞 정차에서 걸어오는 시간과 다음 정차로 가는 시간(플래너의 이동 시간)까지 들어감
- 세 상태: 기본 "Fits your free time on Tue" (그날 모든 빈 시간) / Free time "Free 15:30–16:10" (Fill로 온 그 빈 시간) / "Nothing else fits Tue" + "See Wed"
- Swap = 그 정차를 뺀 빈 시간의 More for you, + Add가 빼기+넣기를 한 번에

## ① 만든 것
- 로직 (순수, 테스트): `today/edits.js`, `today/more.js`, `today/changes.js`, `today/offline.js`, `plan-days.js`가 edits 적용
- `data/scripts/edition.mjs`: 피드 정규화를 `build.mjs`에서 분리 (빌드 결과 바이트 동일, app-data 경로 그대로)
- 브라우저: `data/programme.ts` (1분 확인·revision 받기·가짜 변경), `data/offline.ts` (온라인 상태, saved at, 계획 표시, 서비스 워커 등록), `app/sw.js`
- 화면
  - 03-G 행의 ⋯ → Remove / Swap
  - 03-H PICK ONE 행 → 발표별 방·"Only here now"/"Can catch later"·Choose
  - 03-I 뺀 자리 "Free 12:15–18:00 · Fill" + "Removed … · Undo" 토스트. 카드의 Skip도 같은 빼기
  - 03-M 프로그램 변경 알림 + 행의 "Moved to …"
  - 03-J No plan(S1), 03-J2 `#/cleared` "Your plan isn't on this phone" (Plan again, Open my plan link → S7 자리), 03-K 가지 않는 날 "You're not at CHI on Mon 13 · Add this day" (날짜 탭은 이제 학회 전체 날짜)
  - 03-L "Offline · saved at …"
  - 03-2 `#/more/<날짜>[/<시작>-<끝>][?swap=<key>]` 세 상태, + Add → "Added … at 15:30 · View"
- 공통: `useDayPlans` (Today와 More for you가 같은 계산), `useEdits`, Toast, FreeRow, RouteRow(⋯·펼침·변경 표시)
- 고친 것
  - `useNow` 무한 렌더 (S2 교차 검증 수정이 만든 것, 이미 main에 있음): 실제 시계에서 구독마다 새 값을 만들어 계획 모드 Today가 빈 화면이 될 수 있었음 → 구독·스냅숏을 모듈 수준으로, 30초 지났을 때만 새 값
  - `report.mjs`가 `data/build/app-data/`를 연도로 읽다가 실패 (S0부터)
- 테스트 `tests/app/changes.test.mjs` 7개, `device.test.mjs`·`card.test.mjs` 그대로 통과

## ② 통과 기준 결과
- `npm test` 63/63 · `contracts:check` 4/4 · `tsc` 0 · `build:deploy` 성공 · JS gzip 83 → 88 KB (+ 변경 시에만 받는 2.8 KB)
- 헤드리스 Chrome 390×844 (실제 빌드, 서비스 워커 포함)
  - 샘플 하루: 14:15 포스터 ⋯ → Remove → "Free 12:15–18:00 · Fill"과 "Removed … · Undo" → Undo → 원래 4곳. PICK ONE → Forage / Prism, 둘 다 "Only here now" → Prism Choose → 11:15가 Prism으로. More for you → "Nothing else fits Tue · See Wed". Simulate a room change → "Programme updated. More Isn't Always Better … moved to P1 - Room 111." + 행 "Moved to P1 - Room 111"
  - **오프라인**: 계획을 만든 뒤 서비스 워커가 페이지를 맡은 것을 확인 → 서버를 실제로 끄고 네트워크도 끊고 새로고침 → `#/today`에 화요일 4곳과 "Offline · saved at 05:18" → 오프라인에서 Remove → Free 줄 → Undo → 원래 4곳
  - 03-K: 월요일을 뺀 계획에서 Mon → "You're not at CHI on Mon 13" → Add this day → 날짜에 추가
  - 03-J2: 계획을 만든 뒤 localStorage만 지우고 다시 열기 → `#/cleared`
  - S1 온보딩 → 닫았다 열기 = Today, S2 시각별 카드 10개 그대로
- 폰 실기기: 확인 안 함 (완료 기준: 비행기 모드에서 오늘 일정이 보이고, 뺀 발표를 되돌릴 수 있음)
- 판정: 조건부 통과 (폰 확인 남음)

## ③ 결정과 이유
- 변경은 플래너 **입력**에 적용: 결과를 직접 고치면 겹침·이동 시간이 깨짐. 다시 계산해도 1 ms 안팎
- 뺀 것(removed)과 넘긴 것(passed)을 나눔: "나머지는 More for you로"와 "뺀 건 다시 권하지 않음"을 둘 다 지키려고
- PICK ONE 한쪽을 Remove하면 플래너가 다른 쪽을 스스로 넣음 (그 시각이 비지 않음). Free 줄은 그 자리가 정말 빌 때만
- 새 revision을 받으면 기기에서 정규화: 서버를 거치지 않고 (무상태 원칙), 빌드와 같은 코드라 결과가 같음. 기관 ROR 정리는 생략 (`institutions: {}`), 일정 비교에는 영향 없음
- 서비스 워커 목록은 빌드가 만듦: 해시 붙은 파일 이름을 손으로 적지 않으려고. 이전 배포의 app-data도 새 워커가 지우므로, 열린 탭은 S2의 "404면 한 번 새로고침"으로 넘어감
- J2 감지: localStorage는 비었는데 Cache Storage의 표시가 남아 있으면 "지워짐". 둘 다 지워지면 구분할 수 없어 O-1부터 (최선의 노력)
- 날짜 탭은 학회 전체 날짜 (03-K를 위해). 고르지 않은 날은 Add this day로
- "Simulate a room change"는 샘플 띠에 둠: 심사위원이 03-M을 직접 볼 수 있게. 실제 경로(diff·알림·행 표시)를 그대로 탐

## ④ 남은 문제
- 폰 실기기 확인 (비행기 모드, Undo)
- 가짜 추천이 5개뿐이라 "Fits your free time"(맞는 추천이 있는 상태)은 화면에서 볼 수 없음. 규칙은 테스트로 확인 (가상 데이터). recsys가 붙으면 나옴
- 서비스 워커는 개발 서버(`npm run dev`)에서는 켜지 않음 (빌드에서만)
- "saved at"은 개최지 시각으로 보임 (학회 전에는 기기 시각과 다름)
- 프로그램 변경 알림은 앱이 열려 있을 때만 (푸시 아님). 시간 이동도 감지하지만 실제 피드 변경으로는 확인 못 함 (chi2026 피드는 고정)
- Edit 버튼은 아직 동작 없음. 토스트가 하단 고정 요소(탭 바) 위에 잠깐 겹침
- DeviceState 계약은 S7 (edits 포함)

## ⑤ 다음 단계가 알아야 할 것
- 변경은 `useEdits(mode)`의 setter로: `setEdits(e => removeStop(e, key))`. Today와 More for you는 `useDayPlans(mode)`로 같은 일정을 봄
- 새 화면이 데이터를 오프라인에서도 써야 하면 `copy-static.mjs`의 `precacheList`에 넣을 것 (지금은 Today만). 초록·people은 처음 열 때 저장됨
- 프로그램이 바뀌면 `useProgrammeUpdate()`가 새 `schedule`을 줌. `useDayPlans`가 알아서 씀
- 시계: 화면은 `now()`/`useNow()`, 기록(saved at, built at, 확인 간격)은 `realNow()`
- `useSyncExternalStore`의 getSnapshot은 같은 값을 돌려줄 것 (이번 useNow 버그)

## ⑥ 비용·토큰
- 외부 API 비용 0. 피드 요청: version.json 1분에 1번 (탭이 보일 때), revision 파일은 바뀔 때만
- 토큰 사용량은 측정하지 않음
