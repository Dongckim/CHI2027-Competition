# V9 · mock 대 ondevice 엔진 비교 (2026-11-21)

## 가설
원준 엔진(`recsys/src/web`, 모델 `model-2026-11-21`)을 우리 Engine 인터페이스 뒤에 붙이면,
- mock과 같은 계약(Arc 0.1.0과 규칙)을 지키고,
- 폰 브라우저(WebKit)에서 Arc 하나를 mock만큼 빨리 만들고,
- 각도는 초록의 결과 문장에 더 단단히 묶인다.

## 방법
- **연결**:
  - `app/src/engine/ondevice.ts`가 Web Worker `ondevice.worker.js`에 요청을 보낸다.
  - worker는 원준의 `load.mjs`로 `/model/`을 읽는다.
  - 원준 응답을 우리 형식으로 바꾸는 일은 `ondevice-map.js`가 한다.
- **실행 조건**: 비교 기간에는 `?engine=ondevice`일 때만 모델을 받는다(사용자 결정 「비교 기간에는 ?engine=ondevice일 때만」). 기본은 mock 그대로다.
- **질문 14개**: 질문 12개 + "VR" + "Robotics could be helpful to the human daily life?".
  - 7개는 `tests/engine/mock.test.mjs`에서, 3개는 `try.mjs`에서, 2개는 원준 bench에서 가져왔다.
  - "Which CHI work can I use in industry?"는 07의 시작 예시다.
  - #52 때 쓴 질문 13개 목록은 기록에 없어서 새로 정했다. 해석(확인 전).
- **옵션**: 두 엔진 모두 같은 값이다. 세 각도 모두, 모든 날·모든 형식, 08 칩 없음, 데모 시계 화요일 10:00.
- **도구**: `node tests/engine/compare-webkit.mjs`. Playwright WebKit의 iPhone 14 프로필로, 이 Mac에서 돌렸다. **실제 폰이 아니다.**
  - mock 시간에는 화면용 1.2초 대기가 빠져 있다. 순수 계산 시간이다.
  - mock 색인을 처음 읽는 시간도 빠져 있다.
- **계약 검사**: 모든 Arc를 Ajv(Arc.schema.json)와 `arcRuleErrors`로 확인했다. `arcRuleErrors`는 인용 문장이 data/build 초록과 같은지도 본다.

## 통과 기준
- 두 엔진 모두 계약 실패 0.
- ondevice Arc 하나를 만드는 시간이 mock 이하.
- 모델 안의 결과 문장이 모두 우리 초록의 인용으로 바뀐다.

## 결과(숫자)
모든 Arc가 계약을 통과했다: mock 14/14, ondevice 14/14.

| 질문 | mock 종족 | mock 각도 | mock ms | ondevice 종족 | ondevice 각도 | ondevice ms | ondevice 인용 있음 |
|---|---|---|---|---|---|---|---|
| Does VR fidelity raise presence? | xr | ↑2 ↻3 ⊣1 | 207 | xr | ↑2 ↻5 ⊣0 | 40 | 7/7 |
| privacy of smart home devices | society | ↑4 ↻3 ⊣0 | 55 | learning | ↑1 ↻6 ⊣0 | 78 | 1/7 |
| older adults and technology | access | ↑4 ↻0 ⊣0 | 81 | access | ↑0 ↻6 ⊣0 | 65 | 6/6 |
| LLM agents for programming | ai | ↑4 ↻3 ⊣0 | 165 | ai | ↑0 ↻7 ⊣0 | 75 | 1/7 |
| children learning with robots | learning | ↑4 ↻3 ⊣0 | 76 | ai | ↑1 ↻6 ⊣0 | 71 | 7/7 |
| mental health apps | health | ↑4 ↻3 ⊣0 | 44 | health | ↑1 ↻5 ⊣1 | 63 | 7/7 |
| presence | xr | ↑4 ↻3 ⊣1 | 16 | xr | ↑1 ↻6 ⊣0 | 53 | 7/7 |
| What is accessibility research asking now? | access | ↑4 ↻3 ⊣0 | 29 | access | ↑0 ↻7 ⊣0 | 60 | 6/7 |
| LLM writing assistants and student learning | learning | ↑4 ↻3 ⊣2 | 192 | learning | ↑1 ↻6 ⊣0 | 41 | 7/7 |
| haptic feedback for VR | xr | ↑4 ↻3 ⊣0 | 98 | devices | ↑3 ↻3 ⊣1 | 51 | 7/7 |
| accessible indoor navigation for blind people | access | ↑2 ↻3 ⊣0 | 32 | society | ↑0 ↻7 ⊣0 | 62 | 7/7 |
| Which CHI work can I use in industry? | society | ↑1 ↻3 ⊣0 | 19 | society | ↑0 ↻7 ⊣0 | 49 | 2/7 |
| VR | xr | ↑4 ↻3 ⊣0 | 62 | xr | ↑0 ↻7 ⊣0 | 42 | 7/7 |
| Robotics could be helpful to the human daily life? | devices | ↑4 ↻3 ⊣1 | 136 | design | ↑0 ↻7 ⊣0 | 49 | 7/7 |

- **합계**:
  - mock: ↑49 ↻39 ⊣5, Challenge가 있는 질문 4개.
  - ondevice: ↑10 ↻85 ⊣2, Challenge가 있는 질문 2개.
- **Arc 하나 만드는 시간**: 중간값 mock 69 ms, ondevice 56.5 ms.
- **ondevice 첫 로딩**: 702 ms (모델 파일 읽기 + 준비, 이 Mac의 WebKit).
  - 받는 양은 압축 전 36.0 MB, gzip 21.9 MB다(로더가 읽는 파일 18개).
- **모델 안의 결과·측정 문장 15,484개**(`tests/engine/ondevice.test.mjs`):
  - 모두 우리 data/build 초록의 인용으로 바뀐다.
  - 56개는 위치를 옮겨야 했다. 원인은 아래 판정 2.

**Challenge 근거 문장**

| 엔진 | 질문 | 발표 | 근거 문장 |
|---|---|---|---|
| mock | Does VR fidelity raise presence?, presence | 222304 Effects of Virtual Reality System Fidelity on Presence… | However, unlike prior work, we did not find that changes in scenario fidelity significantly affected one’s scenario presence. |
| mock | LLM writing assistants and student learning | 223207 Instructional Mechanisms for Professional Writing… | Unstructured use of ChatGPT did not improve writing cognitive processes or writing quality more than Lettersmith. |
| mock | LLM writing assistants and student learning | 223142 Deaf and Hard of Hearing Access to Intelligent Personal Assistants… | Quantitative results showed no significant differences across both spoken English conditions vs LLM-assisted touch. |
| mock | Robotics could be helpful… | 230220 Human-Robot Companionship in the Forest… | Results show that robot engagement and authority did not directly enhance companionship. |
| ondevice | mental health apps | 230223 When Trust Splits the Room… | Overall, the human counselor condition received higher trust ratings, with the largest gaps in Faith and Personal Attachment, whereas Understandability was comparable across conditions. |
| ondevice | haptic feedback for VR | 222623 Effects of Haptic Feedback on Gaming Experiences… | This study investigated how haptic feedback influences user experience and technology acceptance in the context of first-person shooter (FPS) games, particularly by comparing its effects on active players and passive spectators. **(목표 문장, 결과 아님)** |

## 07b 제안 방식 비교 (주제어 5개)
- **지금 방식(mock)**:
  - 질문 문장에 주제어가 들어간 실제 논문 제목에서, Arc가 비지 않는 것을 3개까지 고른다.
  - 맨 앞 숫자는 그 주제에 맞는 발표 수다(모든 날).
- **원준 방식**:
  - 카드의 요인 → 결과로 조합 문장을 만든다.
  - 숫자는 화요일에 맞는 발표 수이고, 괄호는 그 질문의 각도 수다.

| 주제어 | 지금 방식 (실제 논문 제목) | 원준 방식 (조합 문장) |
|---|---|---|
| VR presence | 497 talks · Does Mid-Air Ultrasound Haptic Feedback Promote Relaxation in Virtual Cat Interaction? (↑1 ↻3) · What Happens When a Virtual Character Speaks With the Cloned Voice of a Person You Know? (↑1 ↻3) | 10 Tuesday talks · Does session duration improve VR presence? (↑2 ↻14) · How do personalized avatars affect VR presence? (↑0 ↻23) · Does session duration improve presence? (↑2 ↻15) |
| haptics | 78 talks · Does Mid-Air Ultrasound Haptic Feedback Promote Relaxation in Virtual Cat Interaction? (↑1 ↻3) | 18 Tuesday talks · Do haptics improve VR experience? (↑2 ↻34) · Do haptics improve immersion? (↑5 ↻33) · Do haptics improve realism? (↑5 ↻29) |
| older adults | 124 talks · (제안 없음: 주제어가 들어간 제목 질문이 없음) | 11 Tuesday talks · How do older adults affect portal use? (↑1 ↻22) · Do older adults improve participate in the gig economy? (↑1 ↻9) · Do digitalisation of public services improve exclusion of older adults? (↑1 ↻13) |
| privacy | 142 talks · What's Privacy Good for? (↑2 ↻3 ⊣1) · Who Explains Privacy Policies to Me? (↑4 ↻3 ⊣1) | 44 Tuesday talks · Does privacy improve trust? (↑3 ↻35) · How does privacy affect cognitive load? (↑0 ↻23 ⊣1) · Does privacy reduce AI adoption? (↑1 ↻31) |
| LLM agents | 1,148 talks · How Do We Research Human-Robot Interaction in the Age of Large Language Models? (↑4 ↻3 ⊣2) · Does How We Talk About LLMs Matter? (↑4 ↻3 ⊣1) · LLM or Human? (↑4 ↻3) | 8 Tuesday talks · Do LLM agents improve trust? (↑1 ↻34 ⊣1) · Do LLM agents improve user satisfaction? (↑2 ↻30) · Do LLM agents improve task efficiency? (↑2 ↻27) |

- **원준 방식**: 주제어가 질문에 늘 남고 질문이 연구 질문 모양이다.
  - 다만 문법이 깨진 문장이 있다: "Do older adults improve participate in the gig economy?", "Do digitalisation … improve …".
- **지금 방식**: 실제 제목이라 문장은 자연스럽다.
  - 하지만 제목이 질문형인 논문에서만 나와서 "older adults"는 0개, "haptics"는 1개다.
  - 주제와 먼 제목도 나온다(VR presence → 고양이 햅틱).
- **사용자 선택 대기**.

## 판정: 조건부 통과
1. **계약**: 두 엔진 모두 통과(14/14, 14/14). 계산은 ondevice가 더 빠르다(중간값 56.5 대 69 ms).
2. **인용 위치**:
   - 원인: 패키지 초록은 앞뒤 공백을 지운 것(Python strip)이고, 우리 초록은 피드 그대로 앞 공백을 둔다.
   - 그래서 10개 발표에서 위치가 1–4자 어긋난다.
   - 수정: 앱이 우리 초록에서 같은 문장을 찾아 위치를 옮긴다(`onOurAbstract`). 못 찾으면 인용을 넣지 않는다.
   - 코드포인트 → UTF-16 변환은 사용자 결정 「Python 코드포인트 → JS UTF-16 변환을 어댑터에서」에 따라 `evidenceOf`가 한다.
3. **시각 2시간 차이 (원준 확인 필요)**:
   - 패키지는 피드 시각을 진짜 UTC로 읽는다. 세션 225080이 원본 09:00Z → 패키지 11:00+02:00이다.
   - 우리 결정 001은 이 값을 현지 벽시계로 본다(09:00 바르셀로나).
   - 그래서 "지금 이후" 판정이 두 시간 늦다. 어댑터가 엔진에 주는 `now`를 같은 만큼 밀어서 맞췄다(`engineNow`, shortcut).
   - 화면의 시각·방은 원래대로 data/build에서 온다.
   - 패키지가 고쳐지면 테스트가 실패해서 `engineNow`를 지우라고 알려 준다.
4. **Challenge 하나가 목표 문장**:
   - 222623의 "This study investigated how …"는 LLM 카드가 status `result`, effect `no_effect`로 적은 문장이다.
   - #52 규칙("Challenge는 연구 자신의 결과 문장만")에 어긋난다. 원준 데이터 쪽 수정이 필요하다.
5. **각도 모양**:
   - ondevice는 Supports가 적고(14개 질문에서 10개) 대부분 Reframes다. 원준 문서의 한계와 같다(Support recall 0.14).
   - Figma의 "2 support · 2 reframe · 1 challenge" 모양은 거의 나오지 않는다.
6. **인용 없는 노드**:
   - 질문 3개(privacy, LLM agents, industry)는 7개 중 1–2개만 인용이 있다.
   - 검색 순위로 남긴 Reframe("On the same subject")에는 결과 문장이 없기 때문이다. 14에서 그 발표는 인용 없이 보인다.
7. **종족이 어색한 경우**: "accessible indoor navigation for blind people" → Society, "privacy of smart home devices" → Learning, "Robotics … daily life" → Design.
8. **LLM 시드 질문**(`seed: true`, 14): 앱은 엔진의 `node` 화면 질문을 쓰지 않는다. 그래서 사용자 질문과 섞이지 않고, 화면에도 나오지 않는다. 사용자 결정 「쓰려면 "Suggested question" 표시로 따로, 아니면 빼고 나한테 물어봐」에 따라 뺐다. 쓸지는 물어볼 것.

## 다음 행동
- 사용자:
  - 표를 보고 기본 엔진 전환 승인.
  - 07b 방식 선택.
  - 시드 질문을 쓸지 결정.
- 원준에게 보낼 것:
  - 시각 2시간(판정 3).
  - 222623 목표 문장(판정 4).
  - 공백을 지운 초록(판정 2).
  - 종족이 어색한 3개(판정 7).
  - 라이선스 2칸: 원준 인코더·카드, 브라우저 tokenizers 빌드(README).
- 전환할 때:
  - `ondevice*.js`를 precache에 넣는다(지금은 뺌).
  - 온보딩 01–07 동안 미리 받는다(`warm()`이 이미 01에서 엔진을 켬). 다 못 받았으면 25.
