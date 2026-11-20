# A4 미리보기 그림·오프라인·접근성·배포 (2026-11-20, stage/A4-ship)

상태: 코드 작업은 끝. 아래 **⑦ 동결 전 체크리스트**는 사용자가 해야 하는 것이 남아 있음(토큰, Upstash, 폰).

## ① 만든 것
- **링크 미리보기 그림** `/api/og?d=<payload>` (`functions/og.mjs`, `api/og.mjs`): 1200×630 PNG
  - 종족 색 배경·모양·이름, 질문 두 줄, 관점별 개수, "ARC · for CHI 2027 · unofficial, from the CHI programme data"
  - CHI·ACM 로고 없음. 링크만으로 그리고 저장·로그 없음, 1년 immutable 캐시
  - share 페이지에 og:image(크기·대체 글 포함)와 `twitter:card summary_large_image`. share 페이지 캐시 하루 → 1년
- **오프라인**: 서비스 워커가 app-data 폴더 전체를 미리 받음
  - 대상: schedule, 날짜별 초록 6개, people, topics, institutions, debut
  - 전에는 schedule.json만이라 첫 방문 직후 비행기 모드에서 Arc를 못 만들 수 있었음(A1 남은 문제)
- **접근성**
  - 보이는 글자가 이름이 되게(WCAG 2.5.3): 지도 노드, 13 행, +N 묶음, Next up 패널, 20 행, 16 가로 스크롤
  - 지도 가운데 원의 질문 대비를 4.5:1로
- **검사 3개**
  - `tests/arc/offline-check.mjs`: 첫 방문 → 서버 끔 → 01, 07 → 12 새 Arc, 14, 홈
  - `tests/arc/a11y-check.mjs`: axe-core 22개 화면, 그리고 axe가 판단 못 한 대비는 글자 획 밑 픽셀로 측정
  - `tests/app/og.test.mjs`
- 미리보기 배포 검사 `tests/arc/preview-check.mjs`는 A3 뒤(PR #46)

## ② 통과 기준 결과
| 기준 | 결과 |
|---|---|
| `npm test` | 139/139 |
| `npm run typecheck` · `npm run contracts:check` | 통과 · 8/8 |
| create-check · arc-check · share-check | 15/15 · 12/12 · 10/10 |
| offline-check (390×844, CPU 4배, 서버를 끈 진짜 오프라인) | **6/6**: 워커 132개 보관(438 ms), 01, 07 → 12, 14 초록 + "Questions are not available", 홈 목록, 오류 0 |
| a11y-check: axe (WCAG 2.0/2.1/2.2 A·AA) | 22/22 화면, serious·critical **0** (고치기 전 9개 화면 label-content-name-mismatch, 16 scrollable-region-focusable) |
| a11y-check: 대비(axe 미판단 89건을 픽셀로) | 전부 통과. 가장 낮은 값 06 4.53, 12 4.99 (고치기 전 지도 가운데 질문 2.2–3.8) |
| og 그림 | 1200×630, 첫 그림 약 270 ms · 다음 170 ms (node, 로컬), 280–360 KB |
| precache | 122 → 132개 (app-data gzip 1.67 MB 추가, 파일은 immutable이라 대개 HTTP 캐시에서) |
| 첫 화면 JS+CSS | 87.8 KB (index.html이 부르는 것, gzip -9. A3 90.1 KB와 같은 방법인지 확인 안 함) |
| 새 의존성 | satori 0.33.5, @resvg/resvg-wasm 2.4.1 (함수만, 앱 번들 아님), devDependency axe-core 4.14.0 |

## ③ 결정과 이유
### Figma·기준과 다르게 한 것
| 화면 | Figma | 앱 | 이유 |
|---|---|---|---|
| 12·15·18·19·23·25 가운데 원 | 흰 글자, 가운데부터 옅어지는 빛 | **짙은 글자(#15121f), 원 안쪽 76%는 종족 색 그대로, 빛은 가장자리만** | 흰 글자 대비 1.3–3.7:1(8종족 모두 미달). 짙은 글자는 4.71(파랑)–13.55. 모양·크기는 그대로. **디자이너 확인 필요** |
| 지도 노드 | 줄인 제목(24자) | 전체 제목을 두 줄로 자름(…) | 보이는 글자와 이름이 같아야 함(2.5.3). 보이는 모양은 거의 같음 |
| og 그림 | 디자인 없음 | 종족 모양 + 질문 + 개수 | 16 미리보기 카드와 같은 내용 |

### 그 밖의 결정
- **@vercel/og 대신 satori + resvg-wasm**: @vercel/og 1.0.3은 Node ESM 함수에서 require와 `__dirname` 없이 돌지 않음(Next 번들 전제). 그 안의 두 부품을 직접 씀
- **og 그림에 한글 등이 들어 있으면 제목을 "An Arc for CHI"로**: 글꼴이 Inter latin뿐이라 빈 상자가 그려짐. 질문은 og:title 글자로 그대로 감. 다국어 글꼴(수 MB)은 함수 크기와 첫 그림 시간을 늘려 넣지 않음
- **npm audit**: satori가 쓰는 fflate 0.7.x에 moderate 경고 1건(손상된 ZIP64에서 멈춤). satori에는 우리 글꼴 파일만 들어가 외부 입력이 닿지 않아 받아들임
- **axe-core 4.14.0**: 4.14.1은 나온 지 2주가 안 됨
- **이름 규칙**: 노드 이름은 "<관점> · <제목> <시각 · 방>"(관점은 sr-only 글자), 요일·상태는 aria-description("Tue 14 · ~09:36 · Ended"). A2의 "<관점> · <제목> · <시간>"과 순서는 같고, 이름과 설명으로 나눔
- 대비를 axe가 판단 못 하면(그림·그라데이션 위) 픽셀로 잼: 글자 있게·없게 두 장, 다른 픽셀의 배경 중 나쁜 2%. 비활성(잠긴 노드)은 WCAG 1.4.3 예외라 뺌

## ④ 남은 문제
- **지도 가운데 원 모양 변경은 디자이너 확인 필요**(③ 표). 되돌리면 대비 기준 미달
- 지도 노드 Heard(종족 색 원 + 흰 기호): 기호 대비(1.4.11, 3:1)는 종족에 따라 미달일 수 있음. 상태는 이름·설명 글자로도 전달됨. 재지 않음
- og 그림에서 라틴 문자가 아닌 질문은 그림 제목이 일반 문구(위)
- VoiceOver·실기기·실제 메신저 미리보기·QR 폰 인식은 확인 안 함(사용자, ⑦)
- `app/src/assets/arc/20-mini-arc-{accessibility,ai,xr}.svg` 세 파일은 git에 없고 어디서도 안 씀(Home은 MiniArc를 코드로 그림). 커밋하지 않음
- 데모 시계는 탭을 연 순간 정해짐(A3과 같음)

## ⑤ 다음 단계가 알아야 할 것
- 미리보기 그림 주소는 share 페이지 og:image와 같은 payload: `/api/og?d=<payload>`. 함수 파일(wasm·글꼴·SVG)은 vercel.json `functions["api/og.mjs"].includeFiles`
- 오프라인 보관 목록은 `app/scripts/copy-static.mjs` `precacheList`(app-data 폴더 전체를 읽음)
- 원준 엔진이 오면 `/model/`도 precache 대상인지 정해야 함(지금 목록은 app-data만, 모델은 런타임 캐시)
- 검사 명령은 CLAUDE.md "명령"

## ⑥ 비용·토큰
- 외부 API 호출 없음. og 그림은 요청마다 함수 CPU 약 0.2초, 그 뒤 CDN 1년

## ⑦ 동결 전 체크리스트 (11/23)
| # | 할 것 | 누가 | 명령·방법 | 결과 |
|---|---|---|---|---|
| 1 | **프로덕션 주소를 로그인 없는 브라우저로 열기** (제출 주소는 보호 없이) | 사용자 + 검사 | 시크릿 창으로 열기, 그리고 `node --experimental-websocket tests/arc/preview-check.mjs <프로덕션 주소> --public` | 확인 안 함 |
| 2 | 미리보기에서 /s/ → 18, Q&A 왕복 | 검사(토큰 필요) | `VERCEL_BYPASS_TOKEN=… node --experimental-websocket tests/arc/preview-check.mjs <미리보기 주소>` | 토큰 대기 |
| 3 | Q&A가 Upstash로 가는지 | 검사 | 2 또는 1에 `--expect-upstash` | Upstash 연결 대기 |
| 4 | QR을 폰 카메라로 찍기 (17, 7노드 링크) | 사용자 | 안 읽히면 payload 바이너리 압축(base64url) 안을 진행. 서버 저장형 짧은 링크는 하지 않음 | 대기 |
| 5 | 메신저 미리보기(카카오톡·iMessage·Slack)에 그림·질문이 뜨는지 | 사용자 | 프로덕션 /s/ 링크를 보내 보기 | 확인 안 함 |
| 6 | VoiceOver로 01 → 12 → 14 | 사용자 | iPhone 설정 → 손쉬운 사용 | 확인 안 함 |
| 7 | 실기기에서 비행기 모드 | 사용자 | 한 번 연 뒤 비행기 모드로 새 Arc 만들기 | 헤드리스만 6/6 |
| 8 | 지도 가운데 원 모양 변경 승인 | 사용자·디자이너 | ③ 표 | 대기 |
