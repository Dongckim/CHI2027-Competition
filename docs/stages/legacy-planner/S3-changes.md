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
- 영상 여부: `data/build/<edition>/papers.json`의 `video` (피드 `contents[].addons`의 `type: video` URL, 없으면 null) → 앱의 `schedule.json` `video` (true/false). chi2026 schedule.json: 544 / 2,782 — paper 270/1,702, poster 235/807, demo 39/67, other 0/206
  - 영상 없음 → "Only here now", 있음 → "Can catch later"
- Choose → `pickOne`: 고른 것 added, 나머지 passed

### 3. 프로그램 변경 (`app/src/data/programme.ts`, `app/src/today/changes.js`)
- `version.json?t=<지금>`을 1분마다, **탭이 보일 때만** (숨은 탭은 건너뛰고, 다시 보일 때 1분이 지났으면 확인). 30초 미만 간격은 `checkDue`가 막음
- revision이 앱 데이터의 revision보다 크면 → 그 `revision_url` 파일만 받기 → 빌드와 같은 `buildEdition`(`data/scripts/edition.mjs`로 분리, 브라우저에서 따로 떨어진 2.8 KB 조각) → 새 프로그램으로 일정을 다시 짬
- `diffStops`: 내 일정에 있는 발표만 비교 → 방 이동 / 시간 이동 / 빠짐. 있으면 03-M 알림("Programme updated. [발표] moved to [방]." + OK)과 행의 "Moved to …"
- OK = 그 revision은 다시 알리지 않음 (`arc.programmeSeen`)
- 테스트용 가짜 변경: **샘플 하루에서만**. 샘플 띠의 "Simulate a room change" 버튼, 또는 `?simulate=room-change#/sample`. 샘플 하루를 나가면 가짜 변경은 지워짐 (계획 모드에서는 무시)
- CORS: version.json·revisions 모두 `access-control-allow-origin: *`, 커스텀 헤더 없는 GET만

### 4. 오프라인 (`app/sw.js`, `app/scripts/copy-static.mjs`)
- 서비스 워커를 빌드가 만듦: 그 배포의 파일 목록을 미리 저장 (페이지, 해시 붙은 JS·CSS·woff2, Today의 `schedule.json`, 학회장 그래프 2개 = 12개)
  - 페이지: 네트워크 먼저, 끊기면 저장된 index.html
  - `/assets/`, `/app-data/`: 저장본 먼저 (이름에 내용 해시)
  - `/data/venue/`: 저장본을 바로 주고 뒤에서 갱신
  - 피드 revision 파일: 저장본 먼저 (바뀌지 않음), version.json은 저장 안 함
- 새 배포 = 새 서비스 워커 → 옛 저장본 삭제 (`sw.js`는 `no-cache`)
- "Offline · saved at 08:40": 마지막으로 온라인에서 일정 데이터를 받은 시각 (`arc.savedAt`), **폰의 현지 시각**으로 표시

### 5. More for you 규칙 (`app/src/today/more.js`)
- 대상: 추천 항목 중 그날 일정에 없는 것 (뺀 것 제외, PICK ONE에서 넘긴 것 포함)
- 빈 시간: 그날 세션 시작~끝 안에서 정차 사이 10분 이상
- 맞음: 슬롯이 빈 시간 안에 들어가고, 앞 정차에서 걸어오는 시간과 다음 정차로 가는 시간(플래너의 이동 시간)까지 들어감
- 세 상태: 기본 "Fits your free time on Tue" (그날 모든 빈 시간) / Free time "Free 15:30–16:10" (Fill로 온 그 빈 시간) / "Nothing else fits Tue" + "See Wed"
- Swap = 그 정차를 뺀 빈 시간의 More for you, + Add가 빼기+넣기를 한 번에

## 임시 추천기 baseline-0 (원준님 API 전까지)
- `app/src/recommend/baseline.js` (순수, node·폰 공용): 연구 문장 ↔ 제목(가중치 2)·초록 TF-IDF → RecommendResponse 0.1.0, 최대 200개
  - reasons: 질문 단어가 가장 많이 든 초록 문장, `abstract.slice(start, end)` 그대로 (UTF-16 위치)
  - concepts: 세션 주제(`topics.json`), 주제가 없는 포스터·데모는 가장 드문 일치 단어 `term:<단어>`. topics = 점수 합 상위 3, nearby = 그다음 2
  - band는 순위로: 상위 25% near, 다음 40% adjacent, 나머지 wild (키워드 점수가 0.44~0.7에 몰려서 고정 기준이면 거의 다 near)
  - bridge는 비움 (`path: [], via: []`), Student Mentoring Program은 제외 (발표가 아님)
  - `modelVersion: "baseline-0"`
- 앱: O-1 Next → `app/src/data/recommend.ts`의 `recommend()` (`TODO(recsys)`: 여기서 API로 바꿈) → 지금은 baseline을 폰에서 실행 (연구 문장이 폰 밖으로 안 나감) → 응답을 계획 옆에 저장 (`arc.recommendation`, 약 118 KB) → O-2·Building·Today·More for you가 씀. 샘플 하루는 계약 예시 그대로
- 앱 데이터에 `topics.json` 추가 (gzip 11.5 KB) → 경로 `r1-831bd150` → `r1-9b2672d8`. baseline 코드는 따로 떨어진 2.2 KB 조각
- `node tests/recommend/baseline.mjs "<문장>" [--out 파일]`: 명령줄에서 실행. 예시 `contracts/examples/RecommendResponse.baseline-sensemaking.json` (contracts:check 5/5)
- 결과 ("I study how people make sense of information and make decisions with AI help"): 1,501개 일치 중 200개, node 131 ms, 헤드리스 Chrome에서 O-1 → O-2 263 ms. 주제 Human-AI Decision Making · Sensemaking · AI Explanations and Decision Support in Healthcare
  - 계획 모드 Today(월요일): PICK ONE 4줄 (3개·2개·3개·3개 중 고르기, 방과 "Only here now") + TRY NEW 1줄
  - More for you: "Fits your free time on Mon" (18:00 포스터·데모), + Add → "Added When Friction Helps: … at 18:00"

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
- 테스트: `changes.test.mjs` 6개, `baseline.test.mjs` 3개, `clock.test.mjs` 2개 (useNow 무한 렌더 회귀: react-test-renderer로 실제 훅을 그리고 Date.now()를 호출마다 1 ms씩 움직임. 고치기 전 코드에서는 "Maximum update depth exceeded"로 실패, 고친 뒤 통과). `clock.ts` → `clock.js` (JSDoc, node에서 import하려고)

## ② 통과 기준 결과
- `npm test` 68/68 · `contracts:check` 5/5 · `tsc` 0 · `build:deploy` 성공 · JS gzip 83 → 88 KB (+ 필요할 때만 받는 조각: 피드 정규화 2.8 KB, baseline 2.2 KB). 서비스 워커 13개 파일
- 헤드리스 Chrome 390×844 (실제 빌드, 서비스 워커 포함)
  - 샘플 하루: 14:15 포스터 ⋯ → Remove → "Free 12:15–18:00 · Fill"과 "Removed … · Undo" → Undo → 원래 4곳. PICK ONE → Forage / Prism, 둘 다 "Only here now" → Prism Choose → 11:15가 Prism으로. More for you → "Nothing else fits Tue · See Wed". Simulate a room change → "Programme updated. More Isn't Always Better … moved to P1 - Room 111." + 행 "Moved to P1 - Room 111"
  - **오프라인**: 계획을 만든 뒤 서비스 워커가 페이지를 맡은 것을 확인 → 서버를 실제로 끄고 네트워크도 끊고 새로고침 → `#/today`에 화요일 4곳과 "Offline · saved at 22:29" (이 컴퓨터의 현지 시각 America/Chicago와 같음) → 오프라인에서 Remove → Free 줄 → Undo → 원래 4곳
  - 가짜 변경: 샘플 하루 + `?simulate` → 알림, 샘플을 나가 계획을 만들면 알림 없음, 계획 모드 + `?simulate` → 알림 없음
  - 03-K: 월요일을 뺀 계획에서 Mon → "You're not at CHI on Mon 13" → Add this day → 날짜에 추가
  - 03-J2: 계획을 만든 뒤 localStorage만 지우고 다시 열기 → `#/cleared`
  - S1 온보딩 → 닫았다 열기 = Today, S2 시각별 카드 10개 그대로
- 폰 실기기 (2026-11-12, 정식 배포 `main` `dc36692`, iPhone Safari, 사용자 확인)
  - 처음에는 비행기 모드에서 "인터넷 연결 안 됨"으로 열리지 않음 → 원인: **사생활 보호(Private) 탭**. Safari는 사생활 보호 탭에서 서비스 워커를 쓰지 않음
  - 일반 탭: 온라인으로 한 번 연 뒤 비행기 모드 → Today와 "Offline · saved at …"이 보임
  - 오프라인에서 Remove → Undo: 폰에서는 아직 확인 안 함 (헤드리스 Chrome에서는 확인)
  - 점검 페이지 `/tests/offline.html` 추가: 서비스 워커 설치·활성, 페이지를 맡는지, 저장된 파일 수, 계획 저장 여부
- 판정: 조건부 통과 (폰에서 오프라인 Undo 확인 남음)

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
- 폰에서 오프라인 Remove → Undo 확인
- Safari 사생활 보호 탭에서는 오프라인이 안 됨 (서비스 워커 없음). 앱이 이걸 알려 주지 않음 → O-1이나 오프라인 띠에 한 줄 안내를 넣을지 결정 필요 (`'serviceWorker' in navigator`로 알 수 있음)
- 샘플 하루는 아직 5개짜리 계약 예시라 거기서는 "Fits your free time"이 안 나옴 (계획 모드는 baseline으로 나옴)
- baseline은 키워드 일치라 PICK ONE이 많음 (월요일 5줄 중 4줄). 원준님 모델로 바뀌면 달라짐. 문장마다 abstracts 6개 파일 + people.json(gzip 약 1.3 MB)을 처음 한 번 받음
- 계획을 baseline 전에 만든 사람은 저장된 응답이 없어 계약 예시로 보임 (다시 Build하면 baseline)
- 서비스 워커는 개발 서버(`npm run dev`)에서는 켜지 않음 (빌드에서만)
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
