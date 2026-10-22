# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# ARC (Academic Research Compass)
CHI 2027 Digital Experience Competition 출품작. 모바일 웹, 로그인 없음, 오픈소스, 비상업.
제출 마감 2026-12-04. 학회 2027-05-10~14, Pittsburgh (David L. Lawrence Convention Center).

## 현재 상태
- V0(데이터) 완료. V6 길 안내 조건부(`app/src/venue/route.js`, 플래너에 연결). V4 자막 조건부(`app/src/captions/`, `functions/soniox-key.mjs`, 키는 `.env.local`)
- V2 진행 중: 플래너 `app/src/planner/plan.js`(내부 입력), contracts/는 틀만 있고 필드는 사용자가 Figma 기준으로 설계 중 → 임의로 계약 필드를 만들지 말 것. recsys/는 비어 있음
- 명령 (Node 20, `arc/`에서):
  - `npm run data:fetch [edition...]` : version.json 조회 → 새 리비전만 data/raw에 저장
  - `npm run data:validate` : 공식 스키마 검사 (스키마는 초안이라 chi2025 외 실패가 정상, V0 문서 참고)
  - `npm run data:ror` : data/raw의 새 기관 이름만 ROR로 조회해 data/curated/ror-*.json에 캐시 (새 리비전 받은 뒤)
  - `npm run data:build [edition...]` : data/build 생성 (data/raw 필요, 네트워크 안 씀)
  - `node data/scripts/report.mjs` : V0 측정값 JSON 출력
  - `npm run data:venue -- <CCIB 평면도 PDF>` : data/venue/ccib.json 다시 생성 (python3 + pdfplumber, PDF는 커밋 안 함)
  - `node tests/venue/try.mjs 111 211 [--wheelchair]` : 방 사이 거리·시간 (app/src/venue/route.js)
  - `npm run contracts:check` : 계약 스키마와 examples 검사
  - `node tests/planner/bench.mjs` : 플래너 하루 계산 시간 (data/build 필요)
  - `node tests/planner/try.mjs <후보.json> [--day YYYY-MM-DD] [--wheelchair]` : 후보 목록으로 루트를 눈으로 확인 (예: tests/planner/examples/accessibility.json). 추천은 recsys/ 몫, 플래너·도구에 추천 로직 넣지 말 것
  - `npm run bench` : 확인 페이지 서버 (tests/serve.mjs, functions/를 /api/로 연결). 길 안내 /tests/venue/bench.html, 자막 /tests/captions/bench.html, 대면 대화 /tests/captions/conversation.html (`.env.local`에 `SONIOX_API_KEY=...`, git 무시)
  - `npm test` : 전체 테스트 / 하나만: `node --test --test-name-pattern="talk slots" tests/`
- git은 반드시 `arc/` 안에서 실행. 상위 `chi2027-arc/`는 자체 레포가 아니라 홈 디렉토리(`/Users/dongchankim`) 레포로 잡힘

## 현재 단계: 기능 검증 (화면 만들지 않음)
- Figma는 최종 디자인이 아님. UI 컴포넌트·스타일 작업 금지
- 검증은 CLI 스크립트 또는 /bench 테스트 페이지(무디자인)로만
- 모든 출력은 contracts/ 형식을 따를 것 (나중에 화면에 그대로 연결)
- 검증마다 docs/validation/Vn-이름.md에 기록: 가설 / 방법 / 통과 기준 / 결과(숫자) / 판정(통과·조건부·실패) / 다음 행동

## 데이터 원천: CHI 공식 프로그램 데이터 (유일한 데이터 원천)
- 안내: https://chidigitalexperience.org/programme-data/
- 스키마: https://chidigitalexperience.org/programme-data/schema/ , 기계용 /data/schema/v1.json
- 피드 (모두 같은 구조, schemeVersion 7, camelCase)
  - 개발 기준: /data/chi2026/latest.json (실제, 고정)
  - 견고성 테스트: /data/chi2025, chi2024, chi2023 (실제, 고정), /data/sandbox/latest.json (가짜)
  - 실서비스: /data/chi2027/latest.json (2027년 4월부터 공개, 그전엔 없음)
- 업데이트: version.json을 ?t=타임스탬프 붙여 조회 → 리비전이 바뀌었을 때만 revisions/NNN.json 받기
  - version.json 조회는 30초에 1번 이하 (권장 1분에 1번)
  - latest.json 반복 다운로드 금지, revisions 파일은 변하지 않으므로 영구 캐시
  - 호스팅이 모든 파일을 10분 캐시함 → latest.json은 최대 10분 늦을 수 있음
- 시간: 피드 epoch ms는 현지 벽시계 시각을 UTC처럼 적은 값 (docs/decisions/001). data/build의 시각은 빌드가 실제 UTC 순간으로 바꾼 값 → Date.now()와 바로 비교, 화면은 data/venue/<edition>.json의 IANA 시간대로 표시
- 발표별 시각은 피드에 없음: 세션 시작 + 콘텐츠 종류 duration × 순서(contentIds)로 계산. 길이는 해마다 다름 (12분 상수 금지)
  - chi2026 = Europe/Madrid, chi2027 = America/New_York
- ID: 정수, 같은 해(edition) 안에서만 고정 → 내부 키는 항상 edition과 함께 다룸 (예: chi2026:222795)
- 데이터 버전: publicationInfo.version (version.json의 리비전과 함께 기록)
- 제공되지 않는 것: 로그인, 참가자 명단, 논문 전문·PDF(→ DOI·ACM DL 링크만), status/last_modified 필드
- 라이선스: CC BY-NC-SA 4.0 (각 피드의 cc_licence 필드)
  - 화면에 출처 표기: "Programme data © ACM CHI 2027, licensed under CC BY-NC-SA 4.0." (연도는 사용 중인 edition)
  - data/ 아래 파생 데이터는 CC BY-NC-SA 4.0, 앱 코드는 MIT
- 문의: app@chi2027.acm.org (평면도 등)
- 예외: 기관 이름 정리만 ROR(CC0)을 보조로 사용 (docs/decisions/002). 빌드 시점에만 조회·캐시, 앱 실행 중 호출 금지
- 예외: 학회장 거리·층은 CCIB 공식 평면도 PDF에서 뽑은 data/venue/ccib.json (docs/decisions/003). 거리는 저장 시 이미 미터, 앱에서 변환 금지

## 원칙 (절대 어기지 말 것)
- 개인 데이터는 기기에만 저장 (DeviceState 하나로 통일). 계정·서버 저장 없음
- 서버는 무상태, 요청 내용 로그 금지
- AI는 공개 프로그램 데이터만 사용. 논문 내용을 지어내지 않음. 이유는 개념 ID + 초록 원문 인용
- 음성·대화 저장 금지 (자막은 화면 3줄만, 종료 시 삭제)
- 최소화 대상 아님: 테스트, contracts 스키마 검사, 공식 스키마 검사, 접근성, 개인정보 처리, 출처 표기

## 구조
- data/raw/<edition>/rev-<NNN>.json : 받은 원본 (수정 금지)
- data/build/<edition>/ : 정규화 결과 (단일 데이터 원천, 앱·추천·지니 모두 이것만 읽음). meta·papers·sessions·rooms·people·topics·aliases. 키: `edition:id`, 기관 `inst:<slug>`, 주제 `topic:<slug>`
- data/curated/ : 빌드 입력 (institutions.json은 사람이 관리, ror-*.json은 ROR 캐시). data/scripts/ : fetch·validate·ror·build·report
- data/venue/<edition>.json : 시간대, 사용하는 학회장(`venue`), 피드 방 키 → 학회장 구역 ID(`rooms`) (해마다 교체)
- data/venue/<venue>.json : 학회장 구역 표(치수·수용 인원)와 걷는 길 그래프(미터). 예: ccib.json
- contracts/ : 기능 간 계약 JSON 스키마 (바꾸면 schema_version 올리고 CHANGELOG 기록)
- app/ : Vite + React + TS + Tailwind, 토큰은 app/src/tokens.css
- functions/ : 서버 함수 (Soniox 임시 키, 추천 API, 지니 API)
- recsys/ : 원준 추천 모델 (contracts만 맞추면 됨)

## 디자인
- 지금 Figma는 초안. 최종 디자인은 사용자가 따로 알려줄 때까지 아래 규칙은 적용하지 않음 (UI 작업 금지)
- Figma: https://www.figma.com/design/UfKtv7eGMTOrCZEzszq9GS (페이지: 피드백 반영본)
- 390×844 기준, 본문·입력창 16px, 터치 44px, 대비 4.5:1, safe area, dvh
- Figma 코드 초안은 그대로 쓰지 말고 app/src/components 부품으로 바꿔 끼울 것
- [대괄호] 자리는 contracts 데이터 필드로 연결

## 외부 문서
- 모르는 라이브러리 API는 Context7로 조회
- Soniox: https://soniox.com/docs (임시 키: /docs/guides/temporary-api-keys)
- Claude API 도구 호출은 기본 API 사용 (OpenAI 호환 주소 사용 금지)

## 작업 방식
- 단계마다 브랜치 stage/NN-이름, 끝나면 docs/stages/NN-이름.md 정리
- 중요한 결정은 docs/decisions/NNN-제목.md (이유 포함)
- 정리 문서 형식: ① 만든 것 ② 통과 기준 결과(숫자) ③ 결정과 이유 ④ 남은 문제 ⑤ 다음 단계가 알아야 할 것 ⑥ 비용·토큰
