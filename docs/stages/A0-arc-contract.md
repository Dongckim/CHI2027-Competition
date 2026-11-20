# A0 Arc 계약·엔진 (2026-11-20, stage/A0-arc-contract)

## ① 만든 것
- 결정 `006-arc-pivot`(플래너 → Arc, 남기는 것/빼는 것, 링크에 질문이 담김), `007-qa-server-exception`(Q&A만 서버, 2027-06-13 삭제, 우회 한계)
- CLAUDE.md: UI 작업 해제, Final UI 582:7 기준, Q&A 예외, 추천은 `app/src/engine/`에만
- `contracts/Arc.schema.json` 0.1.0 + 예시 2개(chi2026 실데이터) + `contracts:check` 규칙 `arcRuleErrors`(evidence = abstract.slice, `quotes.js`의 `verifiedReasons` 재사용 · 키 중복·edition · found ⇔ T 노드)
- `app/src/engine/`: `types.ts`(Engine·Arc), `index.ts`(mock/ondevice 선택), `mock-core.js`(node·폰 공용 규칙), `mock.ts`(폰: app-data → 색인, 지연, `?mock=`), `ondevice.ts`(자리만, `MODEL_CACHE`)
- `app/src/arc/tribes.js`(8종족·키워드·다수결), `theme.ts`(`setTribe`, `setGlowStill`), tokens.css `--tribe-*`, index.css 테두리 빛
- 데뷔: `data/scripts/debut.mjs`, build가 `data/build/<edition>/debut.json`과 app-data `debut.json`을 만든다. `build:deploy`는 chi2023–2025도 받는다
- 확인 도구: `node tests/engine/try.mjs ["질문" ...] [--mode none|pending|crowded] [--no-t]`

## ② 통과 기준 결과
| 기준 | 결과 |
|---|---|
| `npm test` | 118/118 |
| `npm run typecheck` | 통과 |
| `npm run contracts:check` | 8/8 (Arc 스키마 + 예시 2) |
| 질문 5개 → Arc JSON, evidence 검사 | 5/5 PASS, 모두 ↑4 ↻3 ⊣2, evidence 43/45(나머지 2개는 질문 단어가 겹치는 문장이 없어 null) |
| 속도 (node, chi2026 2,782편) | 색인 94 ms, Arc 하나 11–47 ms |
| 데뷔 | chi2026 사람 9,756명 중 3,546명(36.3%) 새 사람. Paper 1,702편 중 ✦ 붙는 것: 저자 중 하나라도 1,092편(64%), 제1저자만 460편(27%) |

## ③ 결정과 이유
- Arc 버전 필드는 `v: 1` 대신 `schema_version: "0.1.0"` (사용자 선택: 다른 계약과 같은 규칙). 링크 payload의 `v:1`은 따로
- `tension`에 `off` 추가(사용자 승인): T를 고르지 않으면 23번을 띄우지 않는다
- 링크 payload 노드 `[key, angle, start, end]`(사용자 승인, A3에서 구현). 받는 쪽은 quotes.js로 재검사, 틀리면 evidence null
- 08 관점별 후보 = 그 관점 발표들이 속한 세션 이름(실데이터), id = sessionKey, 최대 5개
- 데뷔 판정: 이전 3개 대회에 같은 정규화 전체 이름, 또는 이름 첫 글자+성이 같은 사람이 있으면 새 사람 아님. 문구 "✦ New to CHI", 탭하면 "No paper under this name in CHI 2023–2025."
- **지시서 규칙을 좁힌 곳 (mock 품질)**
  - T 문장은 대비 단서 + **질문 단어를 하나 이상** 포함해야 한다. 서론의 "However, little is known about X"가 질문과 무관한 Tension이 되는 것을 막기 위해서다
  - "mixed"는 mixed results/findings/evidence/effects만. "mixed-methods"가 Tension으로 잡혔다(Cudly)
  - S는 "상위"를 후보 30개 중 상위 절반으로, 핵심어는 후보의 1/3 이상이 공유하는 질문 단어 최대 2개로 정했다. 가장 드문 단어로 하면 "raise" 하나 때문에 S가 0개가 됐다
- 종족 표는 node가 같이 쓰게 `tribes.js`(지시서에는 `tribes.ts`). 기존 순수 모듈(card.js, quotes.js)과 같은 방식
- 서버 함수는 기존 구조를 따른다: 로직은 `functions/<이름>.mjs`, Vercel 진입점은 `api/<이름>.mjs` (A3)

## ④ 남은 문제
- **Figma 프레임 id 표**: Figma MCP 인증 대기. 아래는 지시서에 있던 id만 적었다
- ✦가 너무 흔함: 저자 중 하나라도로 하면 Paper의 64%에 붙어 "히트" 기능이 눈에 띄지 않는다. 제1저자 기준(27%)으로 바꿀지 사용자 결정 필요
- mock의 Tension은 실데이터 5개 질문 모두 `found`. "however"가 흔해서 23번(`none`)은 `?mock=none`으로만 보인다. 실제 판정은 원준 엔진 몫
- 키워드 종족 분류의 한계: "Collaborating with AI" → society('collaborat'). 다수결 30표라 질문 단위로는 대체로 맞지만, 분포 측정은 안 했다
- 옛 Today·Explore 화면과 헤드리스 검사(entry-check, phone-check)는 A1에서 라우트를 바꿀 때 직접 주소로 고친다
- 폰에서 mock 색인 시간은 측정 안 함 (node 94 ms, CPU 4배 기준은 A1 헤드리스 검사에서)

## ⑤ 다음 단계가 알아야 할 것
- 화면은 `import { engine } from '../engine'`만 쓴다. `init` 진행률 → `buildArc`. 시간·방·저자는 `loadSchedule()` 등에서 key로 붙인다
- 테두리: `setTribe(arc.tribe)` / 끌 때 `setTribe(null)`. 색만 쓰지 말고 `TRIBE[id].shape`·`name`을 같이
- mock 상태 재현: `?mock=slow|none|pending|crowded` (해시 앞, 예: `/?mock=none#/arc/<id>`)
- `debut.json`이 비어 있으면(이전 피드 없이 빌드) 모든 노드가 debut false. build가 note를 출력한다

### Figma Final UI (582:7) 프레임 — 인증 후 채움
| # | 화면 | 노드 |
|---|---|---|
| 01 | Welcome | 590:453 |
| 02–05 | CHI 101 | ? |
| 06 | How ARC works | ? |
| 07 | Ask first question | ? |
| 08 | Choose your angles | 593:600 |
| 09 | When and what | 593:700 |
| 10 | Building | ? |
| 11 | Your neighborhood | ? |
| 12 | My Arc map | 597:711 |
| 13 | List | ? |
| 14 | Talk detail + Q&A | 597:972 |
| 15 | Edit | 598:917 |
| 16 | Share | 598:1098 |
| 17 | QR full screen | ? |
| 18 | Shared Arc opened | 599:994 |
| 19 | Pick some | 599:1117 |
| 20–21 | Home / empty | ? |
| 22 | Angle help | ? |
| 23 | No clear challenge | ? |
| 24 | Crowded Arc | ? |
| 25 | Angles still sorting | ? |
| — | Components | 588:446 |

## ⑥ 비용·토큰
- 외부 API 호출 없음. 빌드 시간 +0.1초(이전 피드 3개 이름 비교), 배포 때 피드 3개를 더 받음(리비전 파일, 약 25 MB)
