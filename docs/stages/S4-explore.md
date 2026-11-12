# S4 찾기·자세히

브랜치 `stage/S4-explore` · Figma v3 `288:3007` (5 · 찾기와 자세히 보기): 05 Explore `292:446`, 04 Filters `292:508`, 05 No results `292:550`, 06 Talk detail `292:590`, 07 Author `292:616`

## 계획 (A)

### 1. 검색 확장 (`data/scripts/search.mjs`, node·폰 공용, 순수)
- 원래 있던 `searchInstitutions(aliases, query)`는 그대로 둠 (report.mjs가 씀). `normalizeName`은 `build.mjs`(fs 사용)가 아니라 `edition.mjs`에서 가져옴 → 브라우저에서도 import 가능
- `buildSearchIndex({ schedule, people, topics, aliases })`: 발표·사람·세션마다 정규화한 단어, 발표의 날짜(개최지 기준), 그리고 **모든 저자의 모든 `affiliations[]`**에서 모은 기관 키·나라를 미리 계산. 한 번만 만듦
- 검색어 규칙: 검색어의 단어마다, 필드 안의 어떤 단어가 그 단어로 **시작**해야 함 (순서는 상관없음: "mellon carn" ~ "carnegie mellon")
- 발표가 맞는 곳의 순서: 제목 → 저자 이름 → 세션 주제(`topics.json`) → 장소
  - 장소 = 검색어 전체가 기관 별칭과 정확히 같으면 **그중 저자가 가장 많은 기관 하나** ("CMU"는 Carnegie Mellon 281명, Capital Medical 2명, Chiang Mai 1명 등 4곳을 가리킴 → Carnegie Mellon만). 4글자 이상이면 이름이 그 글자로 시작하는 기관들. 아니면 나라 (`usa`, `uk`, `korea` 같은 흔한 표기 포함)
- 필터: 날짜(그날 슬롯이 하나라도 있으면), 종류(paper·poster·demo), 장소(기관 또는 나라, 위와 같이 모든 소속). 필터 화면의 기관 입력은 `placeChoices`(별칭 상위 5개 + 맞는 나라). 첫 번째를 미리 고르고, 바꿀 수 있음
- 사람: 이름, 그다음 그 장소에 소속된 사람. 세션: 이름(날짜 필터, 종류·장소는 세션 안 발표에 적용)
- 앱에 필요한 데이터: `institutions.json`을 앱 데이터에 추가 (별칭 표에서 철자 변형 목록을 뺀 것, gzip 91 KB, Explore를 열 때만 받음). 나머지는 이미 있는 `schedule.json`·`people.json`·`topics.json`

### 2. 추천 점수와 섞지 않음
- 검색 결과는 프로그램 순서(첫 슬롯 시각 → 제목)이고, 맞은 필드별로 묶음. `relevance`·`band`는 읽지 않음
- 화면 윗줄 "Not ranked for you · in programme order", 장소로 맞은 결과에는 "At Carnegie Mellon University"처럼 이유를 표시

### 3. 06 Why for you 인용 규칙과 하이라이트 (`app/src/explore/quotes.js`)
- 보여 주는 이유: `RecommendResponse.items[].reasons[]` 중 `abstract.slice(start, end) === quote`인 것만. 위치가 범위를 벗어나거나, 정수가 아니거나, 이모지·𝑁 같은 글자(UTF-16 두 칸)의 가운데를 자르면 숨김
- 이유가 하나도 안 남으면 Why for you 칸 전체를 숨김. 계획이나 샘플 하루가 없는(둘러보기) 사람에게도 숨김
- 하이라이트: 초록을 일반 조각·강조 조각으로 나누고(겹치면 합침), 강조 조각은 `<mark>`. 조각을 이으면 초록 원문과 같음 (테스트로 확인)
- 문장: "Shares **[주제 이름]** with your research." 주제 이름은 응답의 topics/nearby나 계획의 topics에서 conceptId로 찾음

### 4. "Only here now · no video"와 DOI
- `schedule.json`의 `video`(S3) → 있으면 "Can catch later · video", 없으면 "Only here now · no video" (Today의 PICK ONE과 같은 말)
- DOI: `papers.json`의 `doi`(전체 URL)를 `schedule.json`에 추가 (gzip +15 KB). 있으면 "Paper in the ACM Digital Library" 링크 (새 탭, `noopener`)

### 5. 07 저자 (결정 004)
- `people.json`의 이름과 **모든 소속**(기관 · 나라, 저자가 쓴 그대로), 그 사람이 저자인 발표의 시간·방·+ Add
- 사진·외부 링크·"전문가" 같은 평가 없음. "They may not be at every session.", "Public programme data only." + 출처 문구

## ① 만든 것
- `data/scripts/search.mjs`: `buildSearchIndex`, `searchTalks`, `searchPeople`, `searchSessions`, `placeOf`, `placeChoices`, `filterCount`, `NO_FILTERS` (+ 기존 `searchInstitutions`)
- `data/scripts/app-data.mjs`: `schedule.json`에 `doi`, 새 `institutions.json` → 앱 데이터 경로 `r1-9b2672d8` → `r1-2e9abadb`
- `app/src/explore/`: `quotes.js`(인용 검사·하이라이트), `useExplore.ts`(검색 인덱스를 한 번 만들기, 검색 상태를 메모리에 유지, 내 하루에 있는지, + Add), `format.ts`
- 화면
  - 05 `#/explore`: 검색창(type=search), Filters(활성 필터 수 "Filters · 2"), Talks/People/Sessions 탭과 개수, 결과 30개씩 + "Show 30 more", 발표마다 + Add(이미 있으면 "Added"). 세션은 그 자리에서 펼쳐 발표 목록
  - 04 `#/explore/filters`: 전체 화면, Day·Type 칩, Institution 입력 + 고르기, Reset, "Show [n] results"(바로 다시 셈), 뒤로 = 바꾸지 않음
  - 05 No results: "No matches" + Clear filters (필터가 없으면 "Try fewer or shorter words.")
  - 06 `#/talk/<key>` (S2의 자리 화면 대체): 종류, 제목, 저자(3명 + "+n" 펼치기, 이름은 07로), 슬롯마다 "Tue 14 · ~11:15 · Room · Talk 1 of 7", 세션 이름, 영상 여부, DOI, Why for you, 초록(하이라이트), 하단 Question + Add to my day("In your day")
  - 07 `#/person/<key>`: 위 5번, 하단 "Prepare a question" (첫 발표의 질문 자리, S6)
  - 돋보기: 워드마크 헤더(Today·Explore 제외·Questions)와 06·07 헤더에 있음. Explore·발표·사람 화면은 계획이 없어도 열림 (샘플 하루의 데모 시계는 이 화면들에서 유지)
- + Add: 계획이 있으면 그 계획의 `edits.added`(S3와 같음, 그날이 계획에 없으면 날짜도 추가), 샘플 하루는 메모리, 둘러보기는 기기에 만드는 중인 계획에 저장 (나중에 계획을 만들어도 남음)
- 토큰 `--highlight` (라이트 #fff0a0 / 다크 #5a4a00, 글자는 --text)
- 테스트 `tests/app/explore.test.mjs` 5개: 인용(이모지·𝑁 초록, 코드 포인트 위치는 숨김, 글자 가운데 자르기는 숨김), 하이라이트 조각, 검색 순서, 모든 소속 필터, chi2026 실제 데이터로 "CMU"
- 별칭이 여러 기관을 가리키면 결과 위에 "CMU = Carnegie Mellon University · Other CMUs". Other CMUs → `#/explore/filters?place=CMU` (그 별칭의 후보 목록, 가장 큰 곳이 선택됨). 다른 곳을 고르면 별칭은 검색어에서 빠지고 필터가 됨 ("CMU"를 검색어로 두면 계속 Carnegie Mellon을 뜻해서 결과가 0이 되므로)
- 오프라인 Explore: Today가 그려진 뒤 한가할 때(`requestIdleCallback`, 없으면 3초 뒤) `people.json`·`institutions.json`·`topics.json`을 서비스 워커를 거쳐 한 번 받아 둠 (`prefetchWhenIdle`, `app/src/data/offline.ts`). `navigator.connection.saveData`이면 안 함, 이미 캐시에 있으면 안 함. `topics.json`은 요청에 없었지만 Explore가 이것 없이는 열리지 않아서 넣음 (gzip 11 KB)
- 오프라인 06: 같은 방식으로 계획한 날짜의 `abstracts/<날짜>.json`(샘플 하루는 그날)과 계획에 든 발표의 초록 파일(첫 슬롯 날짜가 다른 날일 수 있음)도 미리 받음. 하루 파일 gzip 129–218 KB
- 06 초록 문구: 초록이 원래 없으면 "No abstract in the programme.", 그날 파일을 못 받았는데 오프라인이면 "Abstract not saved on this phone yet. Connect to load it.", 온라인인데 실패하면 "Could not load the abstract. Try again in a moment." 다시 온라인이 되면 다시 받음
- simulate 규칙을 `app/src/today/simulate.js`로 분리 (`simulateRequested`, `keepsSample`). Today와 App이 이것을 씀. 값도 확인함: `?simulate=room-change`만 (전에는 `?simulate`에 무슨 값이든)
- 고친 것: 서비스 워커가 `Vary: Origin`을 붙이는 서버에서는 오프라인일 때 JS·CSS를 못 찾음 (모듈 스크립트 요청에는 Origin이 붙고 미리 저장할 때는 없음). `vite preview`가 그렇고, 이 때문에 처음 오프라인 확인에서 빈 화면. `caches.match(…, { ignoreVary: true })` (이름에 내용 해시가 있어 안전)
- 도구: `node --experimental-websocket tests/explore/qa-check.mjs` (QA 4·5·11·12 재현, 서버를 스스로 켜고 끔), `node tests/explore/bench.mjs [질의...]` (node 속도), `node --experimental-websocket tests/explore/phone-check.mjs [스크린숏 폴더]` (헤드리스 Chrome 390×844, CPU 4배 느리게), `node --experimental-websocket tests/explore/offline-check.mjs` (자기 서버를 켜고 끔)

## ② 통과 기준 결과
- **"CMU" → Carnegie Mellon 발표 109개** (Talks 109 · People 181). 테스트가 실제 데이터에서 "저자 중 누구든 어느 소속이든 Carnegie Mellon인 발표" 전체와 같은지 확인
- **06 하이라이트 = 초록 글자**: 헤드리스 Chrome에서 `<mark>` 글자 = `reasons[].quote`, 그리고 화면의 초록 `textContent.slice(start, end) === quote` (샘플 하루, Forage 발표)
- 검색 속도 (폰 기준 100 ms): 헤드리스 Chrome CPU 4배 느리게, 입력 → 결과가 그려질 때까지
  - "CMU" 68 · 71 · 76 ms (3회), 한 글자씩 "sensemaking" 입력 20–46 ms
  - 처음 Explore를 열 때 데이터 받기 + 인덱스 만들기 331–393 ms (로컬 서버)
  - node: 인덱스 76–83 ms, 질의 중앙값 1.5–2 ms
  - 처음 측정은 "CMU" 106–107 ms → 고친 것 2개: 기관 별칭 표(4,536개)를 탭마다 훑던 것을 질의당 한 번으로, 첫 결과 목록이 그려질 때 돌던 플래너 계산을 Explore를 열 때로
- `npm test` 81/81 · `contracts:check` 5/5 · `build:deploy` 성공 (QA 수정 뒤)
- QA 전: `npm test` 74/74 · `contracts:check` 5/5 · `build:deploy` 성공
- 처음 S4: `npm test` 73/73 · `contracts:check` 5/5 · `tsc` 0 · `npm run build` 성공 · JS gzip 89.5 → 98.0 KB · 서비스 워커 12개 파일 (S3의 피드 정규화 조각 2.8 KB가 본 번들로 들어감: 검색이 `normalizeName`을 씀)
- 05 No results → Clear filters → 필터 0, 04 Show 1 result → "Filters · 1"
- 오프라인 (헤드리스 Chrome, 새 프로필): Today(샘플 하루)만 열고 Explore는 안 연 상태에서 세 파일이 103 ms 만에 캐시에 들어감 → 서버를 끄고 `#/explore`를 새로 열어 "CMU" → Talks 109 · People 181 (온라인과 같음) → Other CMUs → 후보 5개 → Chiang Mai → Talks 1
- 오프라인 06 (같은 확인, 서버를 끄고 브라우저도 오프라인 `navigator.onLine = false`): 샘플 하루(4월 14일)의 계획한 발표는 초록이 보임. 미리 받지 않은 4월 16일 발표는 "Abstract not saved on this phone yet. Connect to load it.", 초록이 없는 발표(chi2026:251828, 온라인)는 "No abstract in the programme."
- simulate: `tests/app/changes.test.mjs`의 규칙 테스트 (샘플 하루만 true, 계획·계획 없음·다른 값은 false, 샘플 하루를 떠나면 지움). 헤드리스 Chrome: `?simulate=room-change#/sample` → "Programme updated", 같은 주소로 계획 모드 Today → 알림 없음
- `saveData`일 때 안 받는 것은 확인 안 함 (헤드리스 Chrome에서 켤 방법이 없음, 코드만)

## ③ 결정과 이유
- **"CMU"는 가장 큰 기관 하나**: 별칭이 여러 기관을 가리킬 때 모두 넣으면 Chiang Mai·Capital Medical 발표가 섞임. 필터 화면에서는 5개를 모두 보여 주고 고르게 함
- **나라는 저자가 쓴 그대로**: v3 필터에 나라 필터가 없어서 Hong Kong·Macao·China 묶기는 보류 (결정 004에 추가). 나라 필터를 넣으면 다시 결정
- **결과는 맞은 필드 → 프로그램 순서**: 관련도 순서가 아니라서 "Not ranked for you"가 사실이 됨. 제목이 맞은 발표가 저자 이름만 맞은 발표보다 앞
- **인용 위치는 UTF-16**: 계약 그대로. 파이썬처럼 코드 포인트로 센 위치는 이모지 뒤에서 어긋나므로 숨김 (테스트에 있음). 원준님 모델이 위치를 셀 때 알아야 함 (⑤)
- **06 요약 자리는 초록 원문**: "Summary · AI" 대신 "Abstract · from the programme". S7에서 바꿈
- 세션 화면은 디자인에 없어서 결과 안에서 펼침

## 교차 검증 (QA, 2026-11-12, 브랜치 `fix/s4-qa`)
코드 검토(제 결론을 모르는 에이전트) + 실제 데이터·헤드리스 Chrome의 경계 입력 확인. 고친 것마다 재현 테스트를 먼저 넣고 고치기 전 실패 → 고친 뒤 통과를 확인.
- node 재현 테스트 `tests/app/explore-qa.test.mjs` 7개 (QA 1·2·3·6·7·9·10). 브라우저 재현 `tests/explore/qa-check.mjs` (QA 4·5·11·12, 13은 측정만)

| # | 문제 | 고치기 전 | 고친 뒤 | 상태 |
|---|---|---|---|---|
| 1 | 별칭·나라 표가 `constructor`·`__proto__`를 찾음 → Filters 빈 화면 | 테스트 실패 | 통과 (`Object.hasOwn`) | 고침 |
| 2 | DOI 형식이 피드마다 다름 → 링크 깨짐 | 테스트 실패 | 통과. 링크: chi2023 1,538/1,538 · chi2024 1,696/1,696 · chi2025 2,169/2,180 · chi2026 2,721/2,721 | 고침 |
| 3 | 가지 않는 날의 발표가 "In your day" | 테스트 실패 | 통과 (계획한 날만) | 고침 |
| 4 | Explore·06·07이 옛 revision | Today Room 111 / 06 Room 134 | 둘 다 Room 111 | 고침 |
| 5 | 필터 뒤 뒤로가기 두 번 | 한 번 뒤로 → `#/explore` | 한 번 뒤로 → `#/sample` | 고침 |
| 6 | 기호만 입력하면 2,782개 | 테스트 실패 | 통과, 화면은 검색 전 안내 | 고침 |
| 7 | 악센트 ("Vazquez" → 0) | 테스트 실패 | 통과 | 고침 |
| 8 | 한글 줄임말 ("서울대" 0, "서울대학교" 36) | — | — | 보류 (④, 원준님) |
| 9 | 나라 앞부분 일치 ("unit" → UAE 16개) | 테스트 실패 | 통과 (이름 전체만) | 고침 |
| 10 | People 탭 엉뚱한 "No matches" | 테스트 실패 | 통과 ("Day filters apply to talks only") | 고침 |
| 11 | 06 저자 링크 18 px, "+2" 21 px | 18 px | 모두 44 px 이상 | 고침 |
| 12 | 06 늦게 온 앞 발표 초록이 덮어씀 | 앞 발표 초록이 보임 | 지금 발표 초록 유지 | 고침 |
| 13 | 둘러보기에서 플래너 계산 | 긴 작업 204 ms | 268 ms (차이는 측정 흔들림 범위) | 고침 (정리, 체감 차이 없음) |
| — | `abstractFileDay` 중복 | — | — | 보류 (다음 단계) |

- DOI는 요청 범위(doi.org/…, http://dx.doi.org/…, 공백)에 ACM DL 주소(`https://dl.acm.org/doi/10.…`)를 더 받음. 안 받으면 chi2025 2,180개가 모두 숨겨짐. 숨기는 11개는 `https://dl.acm.org/doi/`뿐인 값
- 13: 둘러보기의 플래너 입력은 샘플 응답 5개뿐이라 원래 가벼웠음. 쓰지 않는 계산을 없앤 정리
- 하이라이트 대비: 글자 라이트 14.3:1, 다크 7.4:1. 하이라이트와 주변 배경의 차이는 라이트 1.2:1, 다크 2.2:1이라 색만으로 구별됨 (④)
- 문제없음 (확인): 잘못된 경로, 슬롯 없는 발표 251개, 소속 없는 사람 31명, 큰 글씨 가로 넘침 0, 페이지 오류 0

## ④ 남은 문제
- **원준님께 (8번, 한글 줄임말)**: 검색창에서 "서울대"는 0건, "서울대학교"는 36건. 검색창은 별칭이 정확히 같거나 4글자 이상이 앞부분 일치일 때만 기관으로 봄 (`search.mjs` `findPlace`). 필터 화면의 후보 목록(`placeChoices`)은 "서울대"로도 서울대를 보여 줌. 검색창도 필터와 같은 별칭 표 규칙을 쓰게 할지 정해 주세요 (짧은 한글·중국어 줄임말의 잡음과 맞바꿈)
- 하이라이트는 색으로만 구별됨 (배경과 1.2:1·2.2:1). 밑줄이나 굵기를 더할지 결정 필요
- `abstractFileDay`(`app/src/explore/format.ts`)는 `app-data.mjs`의 `abstractDay`와 같은 일: 다음 단계에서 하나로
- 새 revision에 새 저자가 생기면 Explore·07은 배포 때 `people.json`을 씀 (이름이 비어 보일 수 있음)
- 폰 실기기 확인 안 함 (헤드리스 Chrome CPU 4배로만)
- 06 저자 줄의 "+n"은 버튼이라 Figma처럼 한 줄로 끝나지 않을 수 있음. 07의 "Prepare a question"과 06의 Question은 S6 자리 화면으로 감
- 검색 상태(검색어·탭·필터)는 메모리에만 있어서 새로고침하면 사라짐. 돌아올 때 스크롤 위치도 맨 위
- 의장만 하는 사람은 07에서 "No talks of their own" (세션 의장 일정은 앱 데이터에 없음)
- 오프라인: 계획하지 않은 날의 초록은 미리 받지 않음 (그 발표를 오프라인에서 열면 "not saved on this phone yet")
- simulate의 자동 테스트는 규칙 함수만 (Today를 node에서 그리지는 않음). 화면 동작은 헤드리스 확인으로만
- 폰 실기기에서 비행기 모드 Explore는 확인 안 함 (S3처럼 Safari 사생활 보호 탭에서는 서비스 워커가 없어 안 됨)

## ⑤ 다음 단계가 알아야 할 것
- 추천 API로 바꾸면(TODO(recsys)) 06은 응답의 `reasons`를 그대로 씀. 위치가 틀린 이유는 화면에서 조용히 빠지므로, `contracts:check`의 인용 규칙을 통과하는지 먼저 볼 것
- 돋보기는 `Header`의 `search` (워드마크가 있으면 기본으로 켜짐). 새 화면에서 켜려면 `<Header back=… search />`
- `useMyDay()` (`app/src/explore/useExplore.ts`)가 "내 하루에 있음"과 + Add를 한곳에서 함. S5·S6 화면도 이것을 쓰면 됨

## ⑥ 비용·토큰
- 외부 API 호출 없음 (검색·인용 검사 모두 폰 안)
- 앱 데이터: +`institutions.json` gzip 91 KB (Explore에서만), `schedule.json` gzip 222 → 231 KB (DOI)
