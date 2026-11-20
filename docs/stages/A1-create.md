# A1 Arc 만들기 화면 (2026-11-20, stage/A1-create)

## ① 만든 것
- 화면: 01 Welcome → 02–05 CHI 101 → 06 How ARC works → 07 Ask → 08 Choose your angles → 09 When and what → 10 Building → 11 Your neighborhood, 21 빈 홈(+ Arc가 있으면 간단한 목록), 22 Three angles 시트, 12 자리(A2 전, 질문·종족·관점별 발표 이름만)
- 라우트: `#/start/1…6`, `#/ask`, `#/angles`, `#/when`, `#/building`, `#/hood/<id>`, `#/home`, `#/arc/<id>`. 처음 열면 01, 온보딩 뒤에는 홈
- 옛 플래너 화면은 `app/src/Legacy.tsx`(직접 주소로만: `#/today`, `#/explore`, `#/talk/…`, `#/directions/…`). 옛 온보딩(O-1~O-5)과 옛 Building은 진입점에서 뺐다
- 부품 `app/src/components/arc.tsx`(Screen, ArcButton/ArcLink, Chip, IconButton/BackButton, Dots, StepBar, SectionHeader, Sheet, Pic), 토큰 `--arc-*`(tokens.css), Inter 글꼴
- 상태: `app/src/arc/draft.js`(DeviceState 안 `arc` 칸), `app/src/arc/store.ts`(IndexedDB `arc`/`arcs`), `app/src/arc/live.ts`(엔진 미리 준비, 테두리)
- 검사: `tests/app/arc-draft.test.mjs`, `node --experimental-websocket tests/arc/create-check.mjs [--shots <dir>]`

## ② 통과 기준 결과
| 기준 | 결과 |
|---|---|
| 헤드리스 Chrome 390×844, CPU 4배: 01 → 12를 클릭만으로 | **14/14** (create-check, 간격 두고 5회 연속 통과. 바로 이어 돌린 1회는 앞 서버가 꺼지기 전이라 첫 단계 실패) |
| `npm test` | 123/123 |
| `npm run typecheck` · `npm run contracts:check` | 통과 · 8/8 |
| 옛 플래너 직접 주소 (`tests/legacy/venue/entry-check.mjs`) | PASS: all checks |
| 첫 화면 JS+CSS (gzip) | **114.5 KB → 86.8 KB** (Arc 화면·Legacy를 따로 받는 조각으로) |
| 10 → 11 (Build my Arc부터, CPU 4배) | 2.6초 (Figma "약 3초", 최소 3초로 맞춤) |
| 에셋 | SVG 84개 54.6 KB (gzip 32 KB), PNG 0개, 빌드에 들어간 것 58개, 서비스 워커 precache 31 → 89개 |

### 엔진 (A0 리뷰 요청)
- **"Does VR fidelity raise presence?"의 ↑0 원인**: 점수를 1등 = 1로 나눴는데, 이 질문은 1등(1.00) 하나가 튀어 2·3등이 0.60·0.51로 눌렸다. 1등은 "did not find" 문장으로 ⊣에, 0.6을 넘는 유일한 다른 발표는 핵심어 presence가 없어 ↑에서 빠졌다. → **상위 3개 평균 = 1**로 바꿈 (`fix(engine): score angles against the top-3 mean`)
- 기준값: ↑ ≥ 0.6, ↻ 0.35–0.8, ⊣ ≥ 0.4 (상위 3개 평균 대비), 최대 4/3/2

- 아래 표는 **앱이 만드는 경로** 그대로다: 08 기본 칩(↑·↻ 앞 2개, ⊣ 앞 1개) → 09 All week + Talks/Posters/Demos → buildArc. (처음 잰 표는 칩 없이 돌린 것이라 앱과 달랐다: 앱 경로로는 포스터·데모가 0개였음 → `fix(engine): let posters and demos into Arcs built from 08 chips`)

| 질문 | 08 칩 ↑/↻/⊣ | ↑ | ↻ | ⊣ | tension | 종류 |
|---|---|---|---|---|---|---|
| presence | 4/5/2 | 4 | 3 | 2 | found | Paper 5 · Posters 3 · Demo 1 |
| Does VR fidelity raise presence? | 2/5/1 | **3** (전 0) | 3 | 2 | found | Paper 5 · Posters 3 |
| What is accessibility research asking now? | 5/4/1 | 4 | 3 | 2 | found | Paper 5 · Posters 4 |
| LLM writing assistants and student learning | 4/5/4 | 4 | 3 | 2 | found | Paper 7 · Posters 2 |
| privacy of smart home devices | 5/5/4 | 4 | 3 | 2 | found | Paper 5 · Posters 3 · Journal 1 |
| haptic feedback | 5/2/3 | 4 | 3 | 2 | found | Paper 6 · Posters 2 · Demo 1 |
| sign language | 3/2/**0** | 4 | 3 | **0** | none (→ 23) | Paper 4 · Posters 2 · Demo 1 |
| older adults loneliness | 5/**0**/2 | 4 | 3 | 2 | found | Paper 2 · Posters 7 |
| conversational agents for mental health | 5/4/5 | 4 | 3 | 2 | found | Paper 3 · Posters 6 |
| tangible interfaces for children | 1/5/3 | 3 | 3 | 2 | found | Paper 4 · Posters 3 · Demo 1 |
| misinformation on social media | 4/5/5 | 4 | 3 | 2 | found | Paper 7 · Posters 2 |
| eye tracking in VR | 4/5/1 | 4 | 3 | 2 | found | Paper 3 · Posters 6 |

- 하루만(2026-04-14) 고르면 노드가 크게 준다: 12개 중 7개가 ⊣0(none), "sign language"는 ↑1 ↻0 ⊣0. 데이터가 그만큼이라 채우지 않는다
- 08 칩 수: 지시서는 관점별 3–5개. ↑ "Does VR fidelity…" 2개, "tangible interfaces…" 1개, ⊣ "sign language" 0개처럼 3개 미만도 있다(형식 블록 세션을 빼서). 지어서 채우지 않음

- **✦ New to CHI 기준**: 지도·목록 노드는 제1저자가 새 사람일 때만 (Paper 1,702편 중 460편, 27%). 저자 중 누구라도로 하면 1,092편(64%). 14 상세에서는 새로 온 저자 전원(A2). 사람 기준 chi2026 9,756명 중 3,546명(36.3%)이 새 사람
- **종족 분포 (chi2026, 미분류 0)**: 정하는 순서 세션·주제 1,502 → 제목 946 → 초록 키워드 수 316 → 가장 비슷한 종족 18 → 가장 큰 종족 0. 30% 넘는 종족 없음

| 종족 | 전체 2,782 | Paper 1,702 |
|---|---|---|
| society | 534 (19.2%) | 396 (23.3%) |
| ai | 456 (16.4%) | 254 (14.9%) |
| design | 374 (13.4%) | 189 (11.1%) |
| devices | 330 (11.9%) | 200 (11.8%) |
| learning | 328 (11.8%) | 162 (9.5%) |
| health | 312 (11.2%) | 218 (12.8%) |
| access | 231 (8.3%) | 152 (8.9%) |
| xr | 217 (7.8%) | 131 (7.7%) |

## ③ 결정과 이유
### Figma 대비 바꾼 것
| 화면 | Figma | 앱 | 이유 |
|---|---|---|---|
| 01 | 아래 문구 11px | 12px | 글씨 12px 이상 |
| 02–07 | 진행 점만 | 점 + 낭독기 "Step n of 6" | 점의 대비가 낮음(비활성 25%) |
| 01–07 | Skip 15px 글자 | 같은 모양, 누르는 영역 44px | 터치 44px |
| 05 | Code of Conduct 링크 주소 없음 | ACM 괴롭힘 방지 정책 페이지 (shortcut: CHI 2027 페이지가 나오면 교체) | Figma에 URL 없음 |
| 06 | 노드 설명 10px | 12px | 글씨 12px 이상 |
| 07 | 입력 예시 없음 | placeholder "A word or a question…" (가이드 A-1) | 빈 입력이 무엇을 받는지 |
| 07 | 아래 "Ready offline"만 | 준비 중이면 "Getting ready for offline…", 실패면 "Needs a connection to get ready" | 상태를 사실대로 |
| 07 | 온보딩 점 + Skip | 홈에서 열면 점 대신 뒤로 버튼 | 두 번째 Arc부터는 온보딩이 아님 |
| 08–09 | 칩 38px | 같은 모양, 누르는 영역 44px | 터치 44px |
| 08 | ? 아이콘 18px | 같은 모양, 누르는 영역 44px, 낭독기 "What are Supports?" | 터치 44px |
| 08 | 칩 줄바꿈 없음(예시가 짧음) | 긴 세션 이름은 한 줄 말줄임(낭독기는 전체) | 실제 세션 이름이 길다 |
| 08 | 관점마다 칩이 있음 | 칩이 없으면 한 줄("No clear challenge to it this year." 등) | 지어서 채우지 않음 |
| 09 | When = Today / Tomorrow / All week | 학회 날이 아니면 학회 날짜들(Mon 13 …) + All week | 학회 전·후엔 "Today"가 뜻이 없음 |
| 10 | 진행 고리·질문 구슬 SVG (XR 파랑) | CSS로 같은 모양, 종족 색 | 다른 종족도 파랑이 됨 |
| 10 | "Reading 2,614 talks for you" | 실제 범위의 수(예: 2,624) | 숫자는 데이터에서 |
| 11 | 고리 SVG·큰 XR 모양(빛남) | 고리는 CSS(종족 색), 큰 모양은 종족 아이콘 132px + 빛 | XR만 내보내져 있었음 |
| 11 | "Change" 뒤 화면 없음 | 8개 종족 시트에서 고름 | Figma에 다음 화면이 없음 |
| 21 | 점선 원 PNG | 같은 SVG | 큰 PNG는 SVG로 (사용자) |
| 22 | 각주 11px, 45% (≈ 4.1:1) | 12px, 55% (≈ 5.3:1) | 12px·4.5:1 |
| 22 | 12 지도 위 시트 | 08과 12 어디서든 같은 시트 | 사용자 결정 |
| 전체 | 하단 버튼 고정 | 내용이 길면 내용이 버튼 밑으로 스크롤(버튼은 화면당 하나 고정) | 08 칩이 많을 때 |

### 그 밖의 결정
- 관점 화면 이름은 Figma대로 Supports / Reframes / Challenges (사용자). 코드·계약 키 S/R/T
- DeviceState는 `arc.device` 하나 그대로, `arc` 칸만 추가. 기존 검사가 모르는 칸을 무시해서 VERSION을 올리지 않았다(옛 계획이 있는 기기 = 온보딩 끝)
- Arc 목록은 IndexedDB. 막힌 브라우저에선 메모리 + 홈에 "This browser does not keep Arcs." 한 줄
- 08에서 관점의 칩을 모두 끄면 그 관점을 빼고 만든다(⊣를 끄면 `tension: off`, 23번 안 뜸)
- 08 칩에서 형식·시간 블록 세션("Posters (Tuesday)", "Interactivity Demos" 등)은 빼고, 두 번 열리는 워크숍은 한 번만
- **B3 규칙을 좁힌 곳**: 08 칩은 주제 세션만이라, 주제 세션이 하나도 없는 발표(대부분의 포스터·데모)는 칩 필터를 통과하고 09 What이 정한다. 칩이 아예 없는 관점은 빼지 않는다(⊣ 칩 0개 → none → 23)
- Arc id는 `getRandomValues` 32자리(randomUUID는 http LAN 개발 주소에서 없음)
- 11의 "Change"는 사용자가 종족을 고칠 수 있게 함(가이드 Q5의 답이 없어 가장 단순한 쪽). 다르게 하려면 알려 주세요

## ④ 남은 문제
- 12는 자리만 (지도·목록·상세·Edit은 A2). 20 홈 목록도 간단한 목록 (Figma 20은 A3)
- 처음 여는 순간 서비스 워커가 켜지기 전에 받은 초록 파일은 오프라인 보관이 안 될 수 있음 → A4 비행기 모드 검사에서 확인. 07 "Ready offline"은 엔진 준비 완료 기준
- 옛 헤드리스 검사 중 entry-check만 다시 돌림(PASS). phone-check·offline-check·qa-check·directions-check·revision-check는 확인 안 함
- 폰 실기기 확인 안 함 (Vercel 미리보기에서)
- create-check을 간격 없이 바로 이어 돌리면 포트가 아직 잡혀 있어 첫 단계가 실패할 수 있음 (3초 쉬면 통과)
- DeviceState VERSION은 계획(2)과 달리 1 그대로: arc 칸만 추가해 옛 검사가 그대로 읽음
- 첫 화면 86.8 KB는 JS+CSS만. 01을 열면 엔진 준비로 초록 전체를 뒤에서 받기 시작한다(온보딩 동안 받기, 가이드 1번)
- Figma 대비 시각 비교는 헤드리스 스크린샷을 눈으로만 (픽셀 비교 없음)

## ⑤ 다음 단계가 알아야 할 것
- 화면 이름은 `ANGLE_NAME`(`screens/arc/AngleHelp.tsx`), ? 시트는 `<AngleHelp open onClose />`
- 새 화면은 `Screen`(헤더/본문/하단 하나) + `ArcButton`·`Chip` 등 `components/arc.tsx` 부품으로. 그림은 `Pic`(장식, 낭독기 숨김)
- 테두리: 화면마다 `useTribe(tribe | null)`
- 저장한 Arc: `getArc(id)` / `saveArc(arc)` / `useArcs()` (`arc/store.ts`)
- 12의 지도 그림(22-orbit-*, 22-lines, 22-holo-ring, 22-orb-*)은 받아 두었고 아직 안 씀. 질문 구슬은 `.arc-orb`(종족 색)
- 스크린샷: `node --experimental-websocket tests/arc/create-check.mjs --shots <dir>`

## ⑥ 비용·토큰
- 외부 API 호출 없음. 새 의존성 @fontsource/inter 5.3.0 (Inter latin 400/500/600 woff2 72 KB, CSS에서 쓸 때만 받음), IBM Plex Sans 제거
