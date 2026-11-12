# S1 온보딩

브랜치 `stage/S1-onboarding` · Figma v3 `288:680` (1 · 처음 열었을 때)

## 계획 (A)

### 1. 화면별 컴포넌트

| 화면 (Figma caption) | 새로 만든 것 | S0에서 재사용 |
|---|---|---|
| O-1 Start · research (연구 한 문장으로 시작. 둘러보기·샘플도 가능) | 문장 입력(textarea), 링크 버튼 2개 | Header(워드마크), Button |
| O-2 Topics (찾은 주제 확인, 가까운 분야 추가) | Chip을 토글형으로 바꿈(켜짐 = 채움 + 체크, 꺼짐 = 테두리), + Add 입력 | Header(뒤로) |
| O-3 Days (학회에 가는 날 고르기) | ChoiceRow (줄 전체가 체크박스) | |
| O-4 What would make CHI easier (이동·체력·언어에 필요한 것 고르기) | ChoiceRow | |
| O-5 Your plan (고른 내용 확인 후 하루 일정 만들기) | SummaryRow (라벨·값·화살표, 줄 전체가 링크) | |
| O-5a/5b/5c Edit (종류·언어·How full 수정) | ChoiceRow (radio), "Registration needed" 힌트 | Header(제목) |
| 03-1 Building your day (진행 단계 표시) | 단계 목록 (aria-live) | Button (다시 시도) |
| 공통 | BottomAction (화면당 하나뿐인 하단 버튼), Screen 틀 | tokens.css, Tag, DayTabs, Today |

### 2. 폰에 저장하는 "계획" (`app/src/state/device.js`, version 1)
```
{ version: 1, edition: "chi2026", mode: null | "plan" | "browse", step: "research" | "topics" | "days" | "needs" | "summary", builtAt: ms | null,
  plan: {
    query: "I study …",                        // 연구 문장
    topicsFor: "I study …",                    // 주제 목록을 만든 문장 (문장이 바뀌면 목록을 새로)
    topics: [{ conceptId, label, on, custom? }], // 켜짐/꺼짐. RecommendResponse.topics 스냅샷 + 직접 추가(custom:<글자>)
    nearbyAdded: [{ conceptId, label }],       // 추가한 nearby
    days: ["2026-04-14", …],                   // 개최지 현지 날짜
    needs: { stepFree, fewerRoomChanges, breaks, largerText, summaries },
    language: "ko",                            // 요약·질문 도우미 언어 (soniox-languages.json 코드)
    see: ["papers", "posters", "demos"],       // 볼 종류 → KINDS로 feedType에 연결
    howFull: "light" | "balanced" | "full"     // 하루 4 / 6 / 8곳
  } }
```
- 기본값: 학회 모든 날, Papers·Posters·Demos, Balanced, 기기 언어(없으면 English), 필요한 것 없음
- 계약(contracts/DeviceState)이 아니라 앱 내부 형식. DeviceState 계약은 사용자가 설계 중이라 필드를 계약에 넣지 않음

### 3. 저장 위치와 지워졌을 때
- **localStorage** 한 키(`arc.device`): 1 KB 남짓의 JSON. 동기로 읽혀서 첫 화면이 깜빡이지 않고 바로 맞는 곳으로 감. IndexedDB는 큰 데이터(저장한 발표 목록 등)가 생기면 그때
- 바꿀 때마다 바로 저장 → 온보딩 도중에 닫아도 그 화면부터
- 읽기 결과 4가지 (`readState().note`)
  - `saved`: 그대로 씀
  - `none`: 처음이거나 브라우저가 지움 → O-1부터 (둘을 구별할 수 없음)
  - `unreadable`: JSON 깨짐·옛 버전·다른 연도 → 버리고 O-1부터, O-1에 "Your earlier plan could not be read" 한 줄
  - `unavailable`: 저장소 접근이 막힘 (사생활 보호 모드 등) → 메모리로 동작, O-1 문구가 "This browser won't keep your plan after you close it."로 바뀜
- Build my day에서 `navigator.storage.persist()` 요청 (브라우저가 저장 공간이 부족할 때 지우지 않게)

### 4. O-2 데이터 (가짜 추천 응답)
- `app/src/data/fake-recommend.ts` = `contracts/examples/RecommendResponse.chi2026-tuesday.json`. 문장과 상관없이 같은 응답
- topics → 주제 칩 (모두 켜진 채로 시작), nearby → "Close to yours" 칩 (`label · matchCount talks`), totalMatches → "38 talks match your sentence."
- 켜고 끈 결과는 `candidatesFor(response, plan)`이 추천 항목을 거름: 볼 종류에 없는 feedType 제외, 꺼진 주제에만 걸리는 항목 제외 (켜진 주제나 추가한 nearby에도 걸리면 남김)
- recsys가 생기면 O-1 Next에서 `RecommendRequest { schema_version, edition, query }`를 보내고 같은 자리에서 응답을 씀

### 5. Just browse / Try a sample day
- **Just browse** → `mode: "browse"` 저장 → Explore. 다시 열면 Explore. Today 탭은 "No plan yet · Plan my days"
- **Try a sample day** → `#/sample`: 가짜 응답 전체로 만든 Today + "Preview · sample day" 띠 + "Make my own"(O-1로). 아무것도 저장하지 않음. 03-P의 시각 칩(시간 바꿔 보기)은 시계가 생기는 단계에서

## ① 만든 것
- `app/src/state/device.js`: 저장 형식, 읽기·쓰기(저장소 객체를 받음 → 테스트 가능), 화면 결정(`startRoute`), 바꾸기 함수들, `candidatesFor`, `limitStops`
- `app/src/state/useDevice.ts`: localStorage 연결, 바뀌면 저장·화면 갱신, Larger text → `<html data-text="large">`
- `app/src/screens/Onboarding.tsx`: O-1~O-5, O-5a/5b/5c (`#/start/<step>`, 요약에서 고칠 때 `#/start/<step>/edit` → 버튼이 Done, 요약으로 돌아옴)
- `app/src/screens/Building.tsx`: 03-1. 단계마다 0.7초 (움직임 줄이기 설정이면 0), 일정 데이터를 받은 뒤에만 `builtAt` 저장, 실패 시 오류와 다시 시도
- `app/src/App.tsx`: 여는 곳 결정. 탭은 계획(또는 browse)이 있어야 열림, 없으면 멈춘 단계로
- Today: 저장된 계획으로 계산 (고른 날만, step-free = 휠체어 경로, fewer room changes = 이동 비용 ×3, How full = 하루 N곳)
- `tokens.css`: `data-text="large"`이면 글씨 크기 한 단계씩 (12→14, 14→16, 16→20 …)
- 컴포넌트: ChoiceRow, SummaryRow, BottomAction 새로. Chip(토글), Header(뒤로·제목·오른쪽 칸), Tag·DayTabs(큰 글씨에서 높이가 늘어나게) 수정
- `data/scripts/app-data.mjs`: `current.json`에 학회 날짜(`days`) 추가 → O-3이 데이터 파일 없이 날짜를 보여 줌
- 테스트: `tests/app/device.test.mjs` 6개 (저장/불러오기, 깨진·없는·막힌 저장소, 다시 열기, 주제 끄기, 종류, How full)

## ② 통과 기준 결과
- `npm test` 52/52 · `npm run contracts:check` 4/4 · `tsc` 오류 0 · `npm run build:deploy` 성공 · JS gzip 75 KB → 80 KB (언어 목록 포함)
- 헤드리스 Chrome (390×844, DevTools 프로토콜로 조작, 라이트·다크)
  - 전체: 문장 → 주제 1개 끄기 + nearby 1개 추가 → Mon·Fri 끄기 → Step-free + Larger text → How full Light → Build my day → Today. **Chrome을 완전히 끄고 같은 프로필로 다시 열면 `#/today`, 큰 글씨 유지**
  - Today 결과: 화요일 3곳 (Light). 끈 주제(Human-AI Decision Making)에만 걸린 발표 "More Isn't Always Better"가 빠짐. PICK ONE·TRY NEW 유지
  - 도중에 닫기: O-3에서 끄고 다시 열면 O-3
  - Just browse → Explore, 다시 열어도 Explore. Try a sample day → 띠가 있는 Today, 저장 없음
- 폰 실기기 (2026-11-11, 정식 배포 `main` `350f1db`, 사용자 확인, 기종·브라우저는 기록 안 함): 문장 → Build my day → 브라우저를 닫았다 열어도 계획 유지. 완료 기준 충족
- 판정: 통과

## ③ 결정과 이유
- localStorage: 작은 JSON, 동기 읽기로 첫 화면 결정. 실패해도 앱은 메모리로 계속 동작
- 계획 형식은 앱 내부 (version 1). DeviceState 계약은 사용자가 설계하므로 임의로 만들지 않음
- 주제 목록은 문장별 스냅샷: 앞뒤로 오가도 끈 주제가 유지되고, 문장을 바꾸면 새 목록
- 뒤로 버튼은 `history.back()`이 아니라 이전 질문으로 직접: 다시 연 앱에는 방문 기록이 없음
- O-1에도 "1 of 4" 표시 (Figma에는 없음, 요청대로 네 질문 모두에 표시)
- O-3 날짜는 데이터에서 (chi2026 = Mon 13 ~ Fri 17). Figma의 Mon 10 ~ Fri 14는 chi2027 날짜
- 볼 종류 연결: Papers = Paper·Journals, Posters = Posters·Student Research Competition, Demos = Interactive Demos, Panels, Keynotes = Plenary and Keynote·SIGCHI Awards, Workshops = Workshop (등록 필요). Meet-Ups·Student Mentoring Program은 목록에 없음
- 언어 목록 = Soniox 지원 언어 (자막 번역과 같은 목록). 기기 언어 → English → 가나다순
- How full은 계획 뒤 가장 가치 높은 N곳만 남김 (플래너 입력이 아니라 후처리)

## ④ 남은 문제
- ~~폰 실기기 확인~~ → 확인함 (②)
- "Breaks between talks"는 저장만 함. 플래너에 쉬는 시간 기능이 없음 (contracts/README "지금 플래너가 못 하는 것")
- "Summaries in [언어]"·언어는 저장만 함. 요약 기능이 생길 때 사용
- 추천은 여전히 가짜: 문장·주제·nearby가 바뀌어도 같은 응답에서 거르기만 함. 직접 추가한 주제(custom)는 거르기에 영향 없음
- How full 후처리 뒤 `travelFromPrevMin`을 다시 계산하지 않음 (Today가 걷는 시간을 보여 줄 때 planDay에 한도를 넣기, `shortcut:` 주석)
- 설정(톱니) 버튼은 임시로 O-5 Your plan(`#/start/summary`)을 엶. S7에서 17 Settings 화면으로 바꿈 (`Header.tsx`의 `TODO(S7)`)
- DeviceState 계약은 S7(계획 링크)에서 확정. 그때까지 앱 내부 형식 v1 (`app/src/state/device.js`)
- Safari는 홈 화면에 추가하지 않은 사이트의 저장소를 7일 동안 안 쓰면 지울 수 있음. 학회 기간에는 매일 쓰므로 영향 작음, 그래도 지워지면 O-1부터 (`none`)
- 03-P 샘플 하루의 시각 칩

## ⑤ 다음 단계가 알아야 할 것
- 계획 읽기: `useDevice()` (화면), 바꾸기: `update(s => toggleDay(s, d))`처럼 device.js 함수를 넘김. 저장은 자동
- 저장 형식을 바꾸면 `VERSION`을 올리고 `isState`를 고칠 것. 옛 버전은 지금 `unreadable`로 처음부터 시작함 (옮겨 주려면 변환 함수 추가)
- 경로: `#/start/<research|topics|days|needs|summary|see|language|howfull>[/edit]`, `#/building`, `#/sample`, 탭 `#/today|explore|questions`
- 큰 글씨는 tokens.css의 크기 토큰만 바꿈. 새 컴포넌트는 고정 높이(`h-*`) 대신 `min-h-*`를 쓸 것
- 날짜 목록은 `data/build/app-data/<edition>/current.json`의 `days`

## ⑥ 비용·토큰
- 외부 API 비용 0 (추천은 가짜, 서버 호출 없음)
- 토큰 사용량은 측정하지 않음
