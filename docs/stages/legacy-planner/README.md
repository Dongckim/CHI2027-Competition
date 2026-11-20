# 옛 플래너 줄기 (S0 ~ S5b, 2026-11-11 ~ 11-13)

결정 006(2026-11-20)으로 앱의 중심이 Arc로 바뀌기 전 기록입니다. 코드는 지우지 않았고(`app/src/legacy/`, 공용 모듈은 제자리),
옛 화면은 직접 주소로만 열립니다(`#/today`, `#/explore`, `#/directions/…`, `#/sample`). 이 폴더의 단계 문서가 각 단계의 정리입니다.

## 그때의 현재 상태 (CLAUDE.md에서 옮김)
- V0(데이터) 완료. V6 길 안내 조건부(`app/src/venue/route.js`, 플래너에 연결). V4 자막 조건부(`app/src/captions/`, `functions/soniox-key.mjs`, 키는 `.env.local`)
- V2 진행 중: 플래너 `app/src/planner/plan.js`(내부 입력). contracts/는 RecommendRequest·RecommendResponse 0.1.0만 확정, 나머지는 사용자가 설계 중 → 임의로 계약 필드를 만들지 말 것. recsys/는 비어 있음
- S0 뼈대: `app/` Vite + React + TS + Tailwind v4, 해시 라우팅 3탭, 가짜 추천 = `contracts/examples/RecommendResponse.chi2026-tuesday.json`
- S1 온보딩: `#/start/<step>` O-1~O-5 → `#/building` → Today. 계획은 `app/src/state/device.js` 형식으로 localStorage `arc.device`에 저장 (앱 내부 형식, DeviceState 계약 아님)
- S2 오늘: 시각은 `app/src/clock.ts`(`now()`/`useNow()`)에서만, 샘플 하루는 데모 시계. 카드 규칙 `app/src/today/card.js`, 개최지 시각 변환 `app/src/time.js`
- S3 바꾸기·예외: 변경은 플래너 입력에 (`app/src/today/edits.js`, `plan.edits`), 프로그램 확인 `app/src/data/programme.ts`(1분, 보일 때만), 오프라인 `app/sw.js`(빌드가 목록 생성)
- S4 찾기: 검색 `data/scripts/search.mjs`(폰·node 공용, 추천 점수 안 씀), 인용 검사·하이라이트 `app/src/explore/quotes.js`, 내 하루·+ Add `app/src/explore/useExplore.ts`의 `useMyDay`
- S5b 진입점: 09는 발표(`#/directions/<paperKey>`)와 장소(`#/directions/place/<id>`, `app/src/venue/places.js`)로 열림, 하루 목록 ⋯·06·05에서
- S5 길 안내: 공식 평면도 ccib.json + 보이는 이름 `data/venue/ccib.labels.json` (결정 005), 문장 `app/src/venue/directions.js`, Today 걷는 시간 `app/src/venue/walk.js`, 3D `app/src/venue/view3d.js`(09에서 import()로만, three 0.186.1 고정), 소리 `app/src/venue/sound.js`

## 그때의 명령 (경로는 tests/legacy/로 옮긴 뒤 기준)
  - `node tests/legacy/venue/try.mjs 111 211 [--wheelchair]` : 방 사이 거리·시간 (app/src/venue/route.js)
  - `npm run data:venue:check [edition]` : 피드 floors[].roomIds가 data/venue 파일과 맞는지 / `node --experimental-websocket tests/legacy/venue/directions-check.mjs` : 헤드리스 Chrome으로 09·09-1·3D 확인 (빌드 먼저, 서버를 스스로 켜고 끔) / `tests/legacy/venue/revision-check.mjs` : 09를 연 채 경로·revision이 바뀔 때 3D (같은 방식) / `tests/legacy/venue/entry-check.mjs` : 직접 만든 계획(실제 시계)에서 하루 목록·06·05 → 09 (같은 방식)
  - `node tests/legacy/planner/bench.mjs` : 플래너 하루 계산 시간 (data/build 필요)
  - `node tests/legacy/planner/try.mjs <후보.json> [--day YYYY-MM-DD] [--wheelchair]` : 후보 목록으로 루트를 눈으로 확인 (예: tests/legacy/planner/examples/accessibility.json). 추천은 recsys/ 몫, 플래너·도구에 추천 로직 넣지 말 것
  - `node tests/legacy/explore/bench.mjs [질의...]` : 검색 속도 (node) / `node --experimental-websocket tests/legacy/explore/phone-check.mjs` : 헤드리스 Chrome 390×844·CPU 4배로 S4 화면 확인 (`vite preview --port 4317` 먼저) / `tests/legacy/explore/offline-check.mjs` : 오프라인 Explore (서버를 스스로 켜고 끔) / `tests/legacy/explore/qa-check.mjs` : QA 재현 (같은 방식)
- 헤드리스: `node --experimental-websocket tests/legacy/venue/directions-check.mjs` · `revision-check.mjs` · `entry-check.mjs`, `tests/legacy/explore/phone-check.mjs`(`vite preview --port 4317` 먼저) · `offline-check.mjs` · `qa-check.mjs`
  - 2026-11-20 기준: entry-check의 "06 Talk → Directions → 09"는 A2부터 실패(#/talk/<key>가 옛 06이 아니라 새 14로 열림). directions-check는 가끔 3D 시점 단계에서 흔들림
- 벤치 페이지: `npm run bench` → `/tests/legacy/venue/bench.html`, `/tests/legacy/captions/bench.html`, `/tests/legacy/captions/conversation.html`, `/tests/legacy/mobile/bench.html`

## 디자인 기준 (Figma v3, 옛 플래너 화면의 기준. 지금 기준은 Final UI 582:7)
- 파일: UfKtv7eGMTOrCZEzszq9GS, 페이지 "v3 · 리뷰 반영 (11/09)"
- 섹션 노드: 1 처음 열었을 때 288:680 / 2 오늘·하루 흐름 288:1174 / 3 바꾸기·예외 288:1903 / 4 발표장 288:2822 / 5 찾기·자세히 288:3007 / 6 이동·마무리 288:3335 / 7 보관·설정 288:3520 / 컴포넌트 289:450
- 화면 기준 390×844. 각 프레임 아래 caption이 그 화면의 역할이다.
- 원칙: 화면마다 질문 하나에만 답한다. 첫 화면에 지금 할 일이 보인다. 화면엔 쉬운 말만(route, plan, picks, bridge는 내부 용어). 기본값이 채워져 있고 뭘 눌러도 되돌릴 수 있다.
- 접근성: 글씨 태그 12px / 보조 14px / 본문 16px 이상, 누르는 곳 44px, 회색 글씨 대비 4.5:1, 하단 고정 요소는 화면당 하나, safe area 34px.


## 진행 상황 (CLAUDE.md에서 옮김)
- S0 뼈대 (2026-11-11, stage/S0-skeleton): 3탭 해시 라우팅, Figma v3 토큰(+다크 제안), 공통 컴포넌트 9개, Today = 가짜 추천 → 플래너
- 계약 RecommendRequest/Response 0.1.0 + contracts:check 규칙(인용 위치 등). Vercel 빌드가 피드를 받아 dist/ 생성, 실패 시 원인 출력
- 앱 데이터 분리(첫 화면 gzip 2.02 MB → 393 KB)·캐시 헤더, Vercel 미리보기·폰 실기기 확인 통과. 남은 것: 버튼 동작·시계, 계약 원준 확인 (docs/stages/legacy-planner/S0-skeleton.md)
- S1 온보딩 (2026-11-11, stage/S1-onboarding): O-1~O-5·수정 3화면·03-1, 계획을 localStorage에 저장, 다시 열면 Today 또는 멈춘 화면
- Larger text는 앱 전체 글씨 한 단계 위, step-free·fewer room changes·How full은 Today 계산에 반영. 헤드리스 Chrome으로 끄고 다시 열기 통과
- 폰 확인 통과. 남은 것: breaks·요약 언어는 저장만, 설정 버튼(S7), 추천은 아직 가짜 (docs/stages/legacy-planner/S1-onboarding.md)
- S2 오늘 (2026-11-11, stage/S2-today): 추천 → 플래너 → 날짜별 일정, 카드 FIRST STOP/NEXT/LEAVE NOW/NOW/DONE, 03-P 슬라이더로 데모 시계
- 발표 순서·경과 시간은 데이터의 발표 시각으로 (12분 상수 아님). 시각별 카드 테스트 10개 시점, 헤드리스 Chrome에서 같은 결과
- 폰 확인 통과(데모 슬라이더). 남은 것: 걷는 시간 가짜(S5), Skip·Edit 동작, 06/09/S6 자리만 (docs/stages/legacy-planner/S2-today.md)
- S3 바꾸기·예외 (2026-11-12, stage/S3-changes): Remove/Swap/Undo, PICK ONE, More for you 3상태, 03-J2/K/L/M, 서비스 워커 오프라인
- 새 revision은 기기에서 같은 buildEdition으로 정규화 → 내 일정 변경만 알림. 헤드리스 Chrome에서 서버를 끄고도 Today·Undo 동작
- 임시 추천기 baseline-0 (TF-IDF, 폰에서 실행, `app/src/data/recommend.ts`의 TODO(recsys)가 API 자리). 남은 것: 폰 확인(비행기 모드), Edit 버튼 (docs/stages/legacy-planner/S3-changes.md)
- S4 찾기·자세히 (2026-11-12, stage/S4-explore): 05 검색(Talks/People/Sessions, 프로그램 순서 "Not ranked for you"), 04 필터 전체 화면, No results, 06 발표, 07 저자, 어디서든 돋보기
- "CMU" → Carnegie Mellon 발표 109개(모든 저자의 모든 소속). 06 하이라이트는 abstract.slice(start, end)가 맞는 인용만, 이모지 초록 테스트. 헤드리스 Chrome CPU 4배에서 검색 68–76 ms
- 앱 데이터에 institutions.json(gzip 91 KB)·DOI(피드마다 다른 형식 정규화) 추가, Today 뒤 한가할 때 검색 파일·계획한 날 초록을 미리 받아 오프라인 동작. QA 13건 중 11건 고침, 새 revision도 빌드와 같은 앱 모양(app-shape.mjs)·저자 갱신. Figma v3 값으로 05·04·06·07 맞춤(Button outline/lg, 26px 제목). 남은 것: 폰 실기기, 한글 줄임말(원준님), 요약은 S7 (docs/stages/legacy-planner/S4-explore.md)
- S5 길 안내 (2026-11-12, stage/S5-wayfinding): 09(Figma 순서: 짧은 단계 줄 → 3D 평면도 → I'm here), 09-1(검색·Your last stop·Registration, 위치 추적 없음), Hear the turns(HRTF)
- 공식 평면도 기준 경로 테스트 4개 통과(133→111 좌우·계단·엘리베이터 번호는 프로토타입과 다름, 결정 005). CPU 4배에서 3D p95 16.8 ms, context lost 복구, 동작 줄이기면 정지
- Today 카드 걷는 시간 = 경로 시간(step-free면 더 일찍 Leave now). 남은 것: 프로토타입과 다른 3가지 확인, 폰 실기기 (docs/stages/legacy-planner/S5-wayfinding.md)
- S5b 진입점 (2026-11-13, stage/S5b-directions-entry): 하루 목록 모든 정차 ⋯·06·05 검색에서 Directions, 학회 날이 아니어도. 장소 키 09(방·Registration·가장 가까운 WC·엘리베이터)
- route()가 평면도 지점도 받음, 05에 Rooms and places 줄. "pass Foyer 0" 같은 복도 이름 pass 없앰, "1 min". 직접 만든 계획(실제 시계) 헤드리스 entry-check 통과
- 교차 검토 6건 고침(가장 가까운 WC는 초 단위·같은 층, 검색 여러 단어·한 구역 한 줄, 깨진 id, 시간 문구 하나), 장소 출발점은 지금 있는 방. 남은 것: 실기기 (docs/stages/legacy-planner/S5b-directions-entry.md)
