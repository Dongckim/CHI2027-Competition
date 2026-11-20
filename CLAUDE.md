# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# ARC (Academic Research Compass)
CHI 2027 Digital Experience Competition 출품작. 모바일 웹, 로그인 없음, 오픈소스, 비상업.
제출 마감 2026-12-04. 학회 2027-05-10~14, Pittsburgh (David L. Lawrence Convention Center).

## 현재 상태 (Arc, 결정 006)
- 질문 하나 → 세 관점의 발표 묶음(Arc). 화면 이름 Supports ↑ / Reframes ↻ / Challenges ⊣, 코드·계약 키 S/R/T (개발 지시서의 "Tension" = 화면의 Challenges). 8개 종족 색 테두리, 링크·QR 공유·받기
- 단계 A0~A4 (`stage/A0-arc-contract`…), 11/23 동결, 마감 12/4. A0~A4 코드 끝, 남은 것은 동결 전 체크리스트(docs/stages/A4-ship.md ⑦: 토큰·Upstash·폰)
- 계약: `contracts/Arc.schema.json` 0.1.0과 엔진 인터페이스 `app/src/engine/types.ts`(사용자 승인). 그 밖의 필드는 임의로 추가하지 말고 물어볼 것. 계약을 바꾸면 PR에 "원준 확인 필요"
- 추천(무엇을 어떤 관점으로)은 `app/src/engine/`에만. `index.ts`가 mock(기본) / ondevice(`?engine=ondevice`, `VITE_ENGINE`) 선택. 시간·방·저자·세션은 엔진이 아니라 data/build에서 key로 붙임. mock은 "VR" 수정·어근 처리(-s/-ing/-ed/-ic, 11/20 사용자 요청) 뒤 동결(더 다듬지 않음)
- 원준 엔진: 소스·생성 스크립트는 `recsys/`, 모델 zip은 git 밖 → `build:deploy`가 `MODEL_URL`·`MODEL_SHA256`으로 `dist/model/`에 풂(`/model/` 서빙). 없으면 mock (recsys/README.md)
- 옛 플래너(S0~S5b)는 지우지 않고 진입점에서만 뺌: 화면 `app/src/legacy/`, 직접 주소로 열림. 기록 `docs/stages/legacy-planner/`
- 데모 시계: 학회 기간 밖이면 자동으로 둘째 날 10:00(배너 표시), `?at=2026-04-14T12:00`(개최지 시각)이 우선. mock 상태 `?mock=slow|none|pending|crowded`
- 공유 `/s/<payload>`(arc/link.js, functions/share.mjs), 받기 `#/r/<payload>`. Q&A `functions/qa.mjs`: Upstash 환경변수가 없으면 메모리, 키는 `<VERCEL_ENV>:qa:…`. `npm run qa:clean -- preview`(production 거부) · `npm run qa:expiry -- <환경>`(.env.local에 Upstash 값)

## 명령 (Node 26 = Vercel 빌드와 같게, `package.json` engines. 로컬 20.19+도 동작하지만 26 권장. `arc/`에서)
- 데이터: `npm run data:fetch [edition...]`(version.json 조회 → 새 리비전만 data/raw) · `npm run data:validate`(공식 스키마, chi2025 외 실패가 정상) · `npm run data:ror`(새 기관 이름만 ROR 캐시) · `npm run data:build [edition...]`(data/build, 네트워크 안 씀) · `node data/scripts/report.mjs`(V0 측정값) · `npm run data:venue -- <CCIB PDF>` · `npm run data:venue:check [edition]`
- 검사: `npm test`(하나만 `node --test --test-name-pattern="talk slots" tests/`) · `npm run typecheck` · `npm run contracts:check`
- 헤드리스(빌드 먼저, 서버를 스스로 켜고 끔): `node --experimental-websocket tests/arc/create-check.mjs [--shots <dir>]`(01 → 12 → 14) · `tests/arc/arc-check.mjs`(12·13·14·15·23–25, mock Arc를 IndexedDB에 넣고 데모 시계) · `tests/arc/share-check.mjs`(16–20, /s/ 링크, 14 Q&A; vite preview가 /api/share·/api/qa·/api/og를 붙임) · `tests/arc/offline-check.mjs`(첫 방문 뒤 서버를 끄고 07 → 12 → 14) · `tests/arc/a11y-check.mjs [--shots <dir>]`(axe 24개 화면 + 글자 획 밑 픽셀 대비)
- 배포 확인: `VERCEL_BYPASS_TOKEN=… node --experimental-websocket tests/arc/preview-check.mjs <미리보기 주소> [--expect-upstash]` (보호 해제 토큰은 헤더로만, 출력은 가림. 토큰은 커밋·로그 금지) · 프로덕션은 `… preview-check.mjs <주소> --public`(로그인 없이 열리는지)
- 엔진: `node tests/engine/try.mjs ["질문" ...] [--mode none|pending|crowded] [--no-t]`(mock Arc JSON + 계약 검사) · `node tests/engine/tribes-report.mjs`(종족 분포)
- 앱: `npm run dev`(같은 Wi-Fi 폰에서도 열림) · `npm run build`(dist/, data/build/chi2026 필요) · `npm run build:deploy`(Vercel: 피드 받기 → 빌드 → 앱 → 모델)
- 벤치: `npm run bench`(tests/serve.mjs, functions/를 /api/로) → `/tests/legacy/…` 페이지(`.env.local`에 `SONIOX_API_KEY=...`, git 무시)
- 옛 플래너 도구·헤드리스: `docs/stages/legacy-planner/README.md`
- git은 반드시 `arc/` 안에서 실행. 상위 `chi2027-arc/`는 자체 레포가 아니라 홈 디렉토리(`/Users/dongchankim`) 레포로 잡힘

## 현재 단계: Arc 화면 만들기 (A0~A4, 결정 006)
- UI 작업 해제 (2026-11-20). 최종 UI는 Figma Final UI 페이지(582:7)
- 모든 출력은 contracts/ 형식을 따를 것
- 화면 문구는 영어만, Figma 문구 그대로. 관점은 흰 기호 ↑ ↻ ⊣ + 위치로만 구분, 색은 종족 전용. 색만으로 구분하지 않음(모양·이름 같이)
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
- 개인 데이터는 기기에만 저장 (DeviceState 하나로 통일, Arc 목록은 IndexedDB `arc.arcs`). 계정·서버 저장 없음
  - **예외 하나: 발표 Q&A** (결정 007). 익명 글·추천·신고 수만 Upstash Redis에, 이름·이메일·IP·UA 저장 안 함, 2027-06-13 전부 삭제
- 서버는 무상태, 요청 내용 로그 금지 (Q&A 저장소 외)
- AI는 공개 프로그램 데이터만 사용. 논문 내용을 지어내지 않음. 이유는 개념 ID + 초록 원문 인용
- 음성·대화 저장 금지 (자막은 화면 3줄만, 종료 시 삭제)
- 최소화 대상 아님: 테스트, contracts 스키마 검사, 공식 스키마 검사, 접근성, 개인정보 처리, 출처 표기

## 구조
- data/raw/<edition>/rev-<NNN>.json : 받은 원본 (수정 금지)
- data/build/<edition>/ : 정규화 결과 (단일 데이터 원천). meta·papers·sessions·rooms·people·topics·aliases·debut. 키: `edition:id`, 기관 `inst:<slug>`, 주제 `topic:<slug>`
- data/build/app-data/<edition>/r<리비전>-<해시>/ : 앱이 받는 조각 (schedule·abstracts/<날짜>·people·topics·institutions·debut)
- data/curated/ : 빌드 입력 (institutions.json은 사람이 관리, ror-*.json은 ROR 캐시). data/scripts/ : fetch·validate·ror·build·debut·report·search
- data/venue/<edition>.json : 시간대, 학회장, 피드 방 → 구역 ID · data/venue/<venue>.json : 구역 표와 걷는 길 그래프(미터)
- contracts/ : 계약 JSON 스키마 (바꾸면 schema_version 올리고 CHANGELOG). Arc 0.1.0이 지금 것, RecommendRequest·Response는 옛 플래너·mock 내부용
- app/src/screens/arc/ : Arc 화면(01–25) · components/arc.tsx : Final UI 부품 · arc/ : draft(DeviceState의 arc 칸)·store(IndexedDB)·map·tribes·theme · engine/ : 엔진
- app/src/legacy/ : 옛 플래너 화면·부품 (직접 주소로만) · 공용 모듈(data/, planner/, today/, explore/, state/, venue/, captions/)은 제자리(Arc도 씀)
- app/src/tokens.css : 토큰(`--arc-*` = Final UI) · app/sw.js : 서비스 워커(빌드가 목록 생성) · app/scripts/ : copy-static, fetch-model
- functions/ : 서버 함수 로직, api/<이름>.mjs가 Vercel 진입점 (Soniox 임시 키, push, 이후 qa·og·share)
- recsys/ : 원준 엔진 소스·생성 스크립트 (모델 파일은 git 밖)
- tests/ : 단위 테스트(`*.test.mjs`), tests/arc/(Arc 헤드리스), tests/engine/, tests/legacy/(옛 헤드리스·벤치)

## 디자인
- 기준: Figma Final UI 페이지 https://www.figma.com/design/UfKtv7eGMTOrCZEzszq9GS/ARC-Mobile-Wireframes?node-id=582-7 (25화면 + Components 588:446). 프레임 id 표는 docs/stages/A0-arc-contract.md
- Figma와 개발 지시서가 다르면: 화면 구성은 Figma, 데이터 규칙은 지시서. 판단이 안 서면 물어볼 것
- Figma MCP는 읽기 도구만 (get_metadata·get_design_context·get_screenshot 등). `use_figma` 등 파일을 바꾸는 도구 금지 (2026-11-20 사용자). 서브에이전트에게도 같은 지시
- 390×844 기준, 본문·입력창 16px, 글씨 12px 이상, 터치 44px, 대비 4.5:1, safe area, dvh. Figma가 기준보다 작으면 모양은 두고 크기·누르는 영역만 올리고 stage 문서에 표로
- Figma 코드 초안은 그대로 쓰지 말고 app/src/components 부품으로 바꿔 끼울 것
- 옛 기준(Figma v3)은 docs/stages/legacy-planner/README.md

## 외부 문서
- 모르는 라이브러리 API는 Context7로 조회
- Soniox: https://soniox.com/docs (임시 키: /docs/guides/temporary-api-keys)
- Claude API 도구 호출은 기본 API 사용 (OpenAI 호환 주소 사용 금지)

## 작업 방식
- 단계마다 브랜치 stage/NN-이름, 끝나면 docs/stages/NN-이름.md 정리
- 중요한 결정은 docs/decisions/NNN-제목.md (이유 포함)
- 정리 문서 형식: ① 만든 것 ② 통과 기준 결과(숫자) ③ 결정과 이유 ④ 남은 문제 ⑤ 다음 단계가 알아야 할 것 ⑥ 비용·토큰

## Git 규칙
- 단계가 끝나면 push → PR → 머지까지 한다 (2026-11-20 사용자 결정). 허용 범위는 `.claude/settings.json`과 같다:
  - push는 `stage/*`, `fix/*`, `docs/*`, `chore/*`, `refactor/*`, `test/*`, `perf/*`, `build/*` 브랜치만 (2026-11-20 넓힘). main에 직접 push, 강제 push, 원격 브랜치 삭제, `git remote` 금지
  - `gh pr create`(아래 PR 형식), `gh pr view/list/checks`, `gh pr merge --merge`(merge commit만, squash·rebase·--admin 금지). `gh api`, `gh repo` 금지
  - 머지 전에 `npm test`·`npm run typecheck`·`npm run contracts:check`가 통과해야 한다. 실패하면 머지하지 않고 알린다
  - 머지 후 로컬 main을 `git pull --ff-only`로 맞추고 다음 단계 브랜치를 main에서 딴다
  - 계약(contracts/)을 바꾼 PR도 머지는 하되, PR 본문 "확인할 것"에 "원준 확인 필요"를 남긴다
- 커밋 메시지에 Co-Authored-By나 도구 이름을 넣지 않는다.
- 단계마다 stage/<단계>-<이름> 브랜치에서 작업한다. 단계가 아닌 작업은 <type>/<이름> (예: docs/git-conventions, fix/fetch-timeout).

### 커밋 메시지 (Conventional Commits)
```
<type>(<scope>): <요약>

<본문: 무엇을 왜. 숫자가 있으면 숫자>
```
- type: feat(기능) · fix(버그) · docs(문서만) · refactor(동작 그대로 구조 변경) · test(테스트만) · perf(속도·크기) · build(빌드·의존성·vercel.json) · chore(그 밖) · revert
- scope: 단계(s0, v4) 또는 영역(app, data, contracts, planner, venue, captions, functions, deploy). 여러 개면 가장 큰 것 하나
- 요약: 영어, 명령형 현재형(add, fix), 소문자로 시작, 마침표 없음, 72자 이내
- 본문: 한 줄 비우고 시작, 72자에서 줄바꿈. 한국어도 됨. 왜 바꿨는지, 측정값, 영향받는 쪽
- 계약 필드 삭제·이름 변경처럼 깨지는 변경은 type 뒤에 `!`, 본문에 `BREAKING CHANGE: <무엇이 깨지는지>`
- 커밋 하나 = 기능 하나. 데이터·캐시·문서처럼 성격이 다르면 나눈다
- 예: `feat(app): add hash-routed tabs for Today, Explore, Questions` · `fix(data): stop with the cause when the feed fetch fails` · `build(deploy): use Node 26 on Vercel`

### PR
- 제목: 커밋과 같은 형식 (`feat(s0): app skeleton with tabs, tokens and fake recommendations`)
- 본문: `.github/pull_request_template.md`의 순서 (요약 / 바뀐 것 / 확인한 것 / 확인할 것 / 문서)
- 확인한 것에는 실제로 돌린 명령과 결과 숫자만 적는다 (예: `npm test` 46/46). 안 돌린 것은 "확인 안 함"으로 적는다
- 계약(contracts/)을 바꾸면 확인할 것에 "원준 확인 필요"를 적는다
- 머지는 merge commit으로 (커밋을 기능별로 나눈 기록을 유지). `gh pr merge <번호> --merge`

## 참고 파일
- reference/wayfinding/arc-wayfinding.html: 길 안내·시공간 큐브·방향 소리 프로토타입 (CHI 2026 CCIB P1)
- reference/wayfinding/sign-scan-test.html: 표지판 인식 테스트
- reference/는 읽기 전용 참고 자료다. 수정하거나 커밋하지 않는다.
- 코드를 그대로 복사해 붙이지 않는다. 구조, 데이터 모양, 계산 방식(경로, 왼쪽/오른쪽 판단, 시간 추정)을 참고해서 앱 구조에 맞게 새로 작성한다.
- 앱과 프로토타입의 결과가 다르면(예: 안내 문장), 어느 쪽이 맞는지 나에게 물어본다.

## 진행 상황
(단계마다 3줄씩 추가. S0~S5b는 docs/stages/legacy-planner/README.md)
- A0 Arc 계약·엔진 (2026-11-20, stage/A0-arc-contract): 결정 006·007, contracts/Arc 0.1.0(schema_version, tension off 추가) + evidence 규칙, engine/ 인터페이스·mock(TF-IDF + 단순 규칙, ?mock=)
- 8종족 tribes.js + 테두리 빛(reduced-motion 정지), 데뷔 debut.json(chi2026 36.3%). 실데이터 질문 5개 → Arc 모두 검사 통과, node 11–47 ms
- 남은 것: Figma 프레임 id 표(인증 대기), ✦ 기준(전체 저자 64% vs 제1저자 27%), mock Tension이 늘 found (docs/stages/A0-arc-contract.md)
- A1 만들기 (2026-11-20, stage/A1-create): 01–11·21·22, Final UI 토큰·Inter·부품, Arc는 IndexedDB, 옛 플래너는 Legacy(직접 주소), 화면 이름 Supports/Reframes/Challenges
- 헤드리스 01 → 12 클릭 14/14, 첫 화면 gzip 114.5 → 86.8 KB, 에셋 SVG 84개 54.6 KB. 엔진: 상위 3개 평균 기준(↑0 해결), 08 칩에서 형식 블록 세션 제외
- 남은 것: 12는 자리만(A2), 첫 방문 오프라인 보관(A4), 옛 헤드리스 검사 일부·실기기 확인 안 함 (docs/stages/A1-create.md)
- A2 지도·목록·상세·편집 (2026-11-20, stage/A2-arc): 12 지도(노드 상태 4가지, +N 묶음, 23·25), 13 목록(제목 두 줄), 14(저자 전원 ✦ New to CHI, 세션, I heard it, Q&A 자리), 15 Edit(−/+, Swap, Wildcard)
- 엔진 wildcard 추가(원준 확인 필요), mock "VR" 최소 수정 후 동결. arc-check 11/11, create-check 15/15, 첫 화면 88.4 KB
- 남은 것: Share·Q&A는 A3, 15에서 묶인 노드 편집, 실기기 (docs/stages/A2-arc.md)
- A3 공유·받기·Q&A (2026-11-20, stage/A3-share): 데모 시계(기간 밖이면 둘째 날 10:00 + 배너), 23 "No clear challenge", 16 Share·17 QR(uqr 0.1.3)·18 Shared Arc·19 Pick some·20 My Arcs, /s/ share 함수(OG 태그), 14 Q&A(메모리 → Upstash REST)
- share-check 10/10, create-check 15/15, arc-check 12/12, npm test 136/136, 첫 화면 90.1 KB. 고친 버그: 탭에서 첫 저장 전에 목록을 안 읽어 홈에 예전 Arc가 안 보임
- 남은 것: Upstash 연결(사용자), og:image·실기기·메신저 미리보기(A4), QR이 촘촘함(긴 링크) (docs/stages/A3-share.md)
- A4 미리보기 그림·오프라인·접근성 (2026-11-20, stage/A4-ship): /api/og 1200×630(satori + resvg-wasm), share 페이지 og:image·1년 캐시, app-data 전체 precache(132개), 보이는 글자 = 이름(2.5.3), 지도 가운데 원은 Figma대로(흰 글자 대비 미달, 사용자 결정 예외)
- offline-check 6/6(서버 끈 상태로 07 → 12), a11y-check 24/24 serious 0·대비 최저 4.53, npm test 139/139, 첫 화면 87.8 KB
- 남은 것: 동결 체크리스트(프로덕션 로그인 없이 열기, 토큰 미리보기 검사, Upstash, QR 폰, 메신저, VoiceOver), 16 카드 마크 로고 확인 (docs/stages/A4-ship.md)
