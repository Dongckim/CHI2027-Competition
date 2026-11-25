# V10 · 페르소나 end-to-end 검토 (2026-11-25)

사용자 「고연차 연구원이라는 페르소나 … 처음이나 초년차 CHI에 참석한 연구원 대학생 대학원생 … 애플의 QA 기획자라고 생각하고 … 배포된 서비스의 end to end user experience를 점검」.

## 가설
배포된 arc2027.com이 두 사람에게 처음부터 끝까지 의미 있게 쓰인다.
- 시니어 연구자: 바쁨. 내 질문에 맞는 발표 5–10개를 찾고, 근거를 믿을 수 있는지 보고, 시간·방을 계획하고, 학생에게 보낸다.
- 처음 오는 학생: CHI를 잘 모르고, 질문을 잘 못 만들고, 저자에게 말 걸기가 어렵고, 학회장 Wi-Fi가 불안하다.

## 방법
- arc2027.com(배포판, ondevice 엔진 11-21 모델)을 WebKit iPhone 14 프로필로 썼다. 390×844와 390×664(Safari 막대 포함)에서, 빈 저장소로 시작했다.
- 시나리오:
  - 시니어: 질문 → 하루·Talks만 → Arc → 근거 판단 → 편집 → 공유 → 학생으로 받기 → 다음 날.
  - 학생: CHI 101 → 막연한 질문·시작 질문 → Arc → 발표장 → 링크 받기 → 오프라인.
- 서버에 쓰는 동작(Q&A 글·추천·신고)은 하지 않았다.
- 스크린샷은 작업 임시 폴더에 있다(커밋 안 함).

## 통과 기준
두 사람 모두 막히는 곳 없이 끝까지 가고, 보이는 정보가 계획에 틀린 판단을 하게 하지 않는다.

## 결과

### 잘 되는 것 (두 검토 공통)
- 14 상세:
  - 근거 문장이 실제 초록 문장이다.
  - 세션 "talk 4 of 6", 저자 소속, DOI가 있다.
  - "New to CHI"가 붙는다.
  - Meet the authors에 층 정보와 길 안내가 있다.
  - 발표 하나를 5초 안에 "갈지 말지" 정할 수 있다.
- CHI 101(02–06c)은 짧고 구체적이다(4,000명, 10+방, 형식 = 동사).
- 공유 → 새 휴대폰에서 받기가 계정 없이 된다. 19는 발표마다 요일을 보여 준다.
- After CHI(20b)는 들은 것, 읽을 것, BibTeX 내보내기를 보여 준다.
- 09에서 새로고침해도 고른 것이 남는다.

### 시니어 연구자 (중요한 순)
| # | 본 것 | 처리 |
|---|---|---|
| S1 | "Today, Talks only" Arc에 목요일 발표가 시간만 보여 그날 발표처럼 보임(엔진이 다른 날 발표 2개를 "읽을거리"로 넣는데 앱이 그 표시를 버림) | **고침**: 오늘이 아닌 발표는 노드·목록·카드·Swap에 요일("Thu 12:27 · Rm 113"). 읽을거리 따로 표시는 결정 필요 |
| S2 | Swap(12b)·24b가 09의 날짜·형식을 무시(포스터·다른 날이 나옴) | 일부 고침(요일 표시). 필터 전달은 엔진 인터페이스 변경이라 결정 필요 |
| S3 | "LLM agents for programming" 같은 큰 주제에서 종족·칩이 엉뚱("Ta agent performance", "N=60 participants") | 엔진(원준) |
| S4 | 방향 있는 질문에도 Challenge 0 → "No clear challenge"가 신뢰를 깎음 | 엔진. 문구 개선은 결정 필요 |
| S5 | 10:00에 만든 "Today" Arc에 이미 끝난 09:24·09:48 발표 | 결정 필요(엔진 규칙) |
| S6 | 같은 링크를 다시 열면 "Add"가 또 나와 같은 Arc가 두 개 | **고침**: 이미 있으면 "Open in my Arcs" |
| S7 | 진행 중인 발표도 Next 카드에 "Next" | **고침**: "Now" |
| S8 | 14에서 다음 정류장까지 떠나야 할 시각·충돌 경고 없음, 15에 시간 없음 | 결정 필요 |
| S9 | 아는 발표(동료 논문)를 제목·저자로 찾아 넣을 수 없음 | 결정 필요 |
| S10 | 11에서 뒤로 가면 질문이 지워진 07 | **고침**: New Arc를 누를 때까지 질문·선택 유지(뒤로 → 09에서 날짜만 바꿔 다시 만들기) |

### 처음 오는 학생 (중요한 순)
| # | 본 것 | 처리 |
|---|---|---|
| N1 | 07 시작 질문 3개가 모두 ↑0 ⊣0, 엉뚱한 Reframe | 결정 필요(Figma 문구). 아래 후보 표 |
| N2 | 모든 흐름에서 Challenge 0 → 06에서 배운 세 번째 각도를 못 봄 | 엔진 + 모델 11-25 결정 |
| N3 | Next 카드·목록에 요일 없음("09:48"이 사실은 수요일) | **고침**(S1과 같음) |
| N4 | 664 높이에서 01 제목 "with an answer"가 버튼 밑에 가려짐 | **고침**: 720 이하에서 궤도 그림 86% |
| N5 | 오프라인에서 아직 받지 않은 화면이 빈 화면 / 14 "Could not load the programme."에 다시 시도 없음 | **고침**: 빈 화면 대신 "This screen isn't on your phone yet" + Try again / My Arcs, 14에 Try again. 실기기 확인 필요 |
| N6 | 14 "No sentence of the abstract was clear enough to quote." | 엔진·결정 필요 |
| N7 | 07b가 "I study VR"를 그대로 써 "Does i study VR improve usability?" | **고침**: 앞말("I study", "I'm interested in") 빼고 주제만, 주어가 I·we인 문장은 뺌 |
| N8 | 칩 "Ai assistance" | **고침**: AI·VR·LLMs 등 약어 대문자 |
| N9 | 학회 중 After CHI 탭이 빈 화면 | **고침**: "When CHI ends, what you heard and what is left to read come here." |
| N10 | 11 "aging" 아래 획 잘림(664), 데모 배너 두 줄 | 디자이너 |

### 시작 질문 후보 (같은 앱 어댑터, 모델별 ↑ / ↻ / ⊣)
| 질문 | 11-21(배포) | 11-25 |
|---|---|---|
| What is accessibility research asking now? (지금) | 0 / 7 / 0 | 0 / 7 / 0 |
| Which CHI work can I use in industry? (지금) | 0 / 7 / 0 | 0 / 7 / 0 |
| My first CHI: how do I spend a day? (지금) | 0 / 7 / 0 | 0 / 7 / 0 |
| Do AI explanations increase user trust? | 3 / 4 / 0 | 3 / 2 / 2 |
| Does haptic feedback improve immersion in VR? | 3 / 4 / 0 | 3 / 4 / 0 |
| Does self-tracking improve wellbeing? | 2 / 5 / 0 | 0 / 6 / 1 |
| Do conversational agents reduce loneliness? | 0 / 7 / 0 | 0 / 5 / 2 |
| Does AI assistance improve writing? | 1 / 6 / 0 | 1 / 6 / 0 |

## 판정
조건부 통과.
- 발표 하나를 판단하고(14) 나누는(16–19) 경험은 두 사람 모두에게 의미가 있다.
- 계획 층이 아직 약하다.
  - 다른 날 발표, 끝난 발표, 필터를 무시하는 Swap이 있다.
  - 처음 오는 사람이 기본으로 가는 길(시작 질문·막연한 주제)에서는 Support와 Challenge가 거의 비어, 약속한 "세 각도"를 보기 어렵다.
- 이번에 고친 것: S1·S6·S7·S10·N3·N4·N5·N7·N8·N9.

## 다음 행동
docs/handoff/designer.md, wonjune.md와 이 문서의 "결정 필요"·"엔진"을 따른다(작업 요약의 액션 플랜).
