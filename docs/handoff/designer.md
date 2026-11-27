# 디자이너에게 확인받을 것 (2026-11-20)

Figma Final UI(582:7)와 앱이 다르거나, Figma만으로는 정할 수 없는 것들이다. 각 항목에 지금 앱이 어떻게 하는지와 고를 것을 적었다. 모두 **디자이너 확인 전**.

## 1. 20 "New Arc" 버튼 폭 — Figma 116 px가 들어가지 않음
- Figma 20(600:1105): 116×44, 좌우 20 px, 아이콘 20, 간격 8, "New Arc" Inter 600 16 px.
- 실제 폭:
  - 글자만 WebKit(iPhone) 65 px다. 20 + 8 + 65 + 좌우 40 = **133 px**라 116 px 안에 들어가지 않는다.
  - 고정 116 px로 두었을 때 아이폰에서 "+ New / Arc" 두 줄로 꺾였다(사용자 실기기, V8 문서 "정정").
- 지금 앱: 최소 폭 116 px, 글자에 맞춰 늘어남(133 px), 좌우 20 px, 높이 44 px, 줄바꿈 없음. 12·13 "Edit"도 같은 방식(최소 128 px).
- 고를 것:
  - (a) 133 px 그대로
  - (b) 좌우 여백을 줄여 116 px에 맞춤(좌우 약 11 px)
  - (c) 글자 15 px
  - (d) 아이콘 없이 "New Arc"만

## 2. 화면 가장자리 종족 빛의 세기
- Figma 11·14의 "Tribe edge glow" 레이어에는 채움도 효과도 없다(get_design_context·get_variable_defs로 확인). Figma 14 렌더의 가장자리 픽셀은 배경과 같다(#121119, 가장자리에서 2·6·12·24 px 모두). 15·19에도 같은 이름의 레이어가 있지만 값은 읽지 않았다.
- 지금 앱(결정 006의 "8개 종족 색 테두리"): 가장자리 2 px에서 (26,31,55) 정도의 빛, reduced-motion이면 멈춤.
- 고를 것: 빛의 세기·폭, 숨 쉬는 움직임 유지 여부, 또는 없앰.

## 3. 가운데 원 안 (12·15·18·19·23·24·25 지도, 10 로딩)
- Figma: 원을 종족 색으로 채우고 그 위에 흰 질문.
  - 흰 글자 대비가 1.33(디자인 흰색)–3.8(XR 파랑):1로, 8종족 모두 4.5:1 미만이다.
- 지금 앱(사용자 결정 「지도 원 질문은 장식이 아니라 핵심 내용이라 예외로 두지 마」):
  - 안쪽 #0E0E12, 종족 색은 2 px 테두리, 바깥 빛 20 px(35%), 안쪽 가장자리 빛, 둘레 링
  - 질문 대비는 8종족 모두 17.7:1 이상
- 전후 비교: `docs/validation/V8-orb/compare.jpg`(ai·health·design, 12와 10). 표는 `docs/validation/V8-orb.md`.
- 고를 것: 이 방향 승인, 또는 다른 방법(예: 원 크기·글자 판). 어떤 방법이든 4.5:1은 지켜야 한다(사용자 「접근성 조정(… 대비 4.5:1 …)은 되돌리지 마」).

## 4. ARC 로고
- 16 공유 카드 오른쪽 아래의 그라데이션 마크(`arc-mark`, 34×20)가 로딩 스피너처럼 보인다(사용자 「카드 오른쪽 아래 그라데이션 원이 로딩 스피너처럼 보여」).
- 지금 앱: 모양은 Figma 그대로, 화면 낭독기 이름 "ARC", `Share.tsx`에 TODO.
- 01 Welcome 원 안의 흰 반원 선은 Figma에 없어서 뺐다. 원 안에는 "ARC" 글자만 있다.
- 물을 것:
  - 이 마크가 ARC 로고인가?
  - 로고라면 정식 모양과 최소 크기는?
  - 앱 아이콘·링크 미리보기 그림(/api/og)에도 쓸 것인가? 지금 og 그림에는 로고 없이 "ARC" 글자만 있다.

## 함께 보면 좋은 것
- Figma와 다르게 한 곳의 표: `docs/stages/A4-ship.md` ③·⑧
- 대비·글자·누르는 영역 예외(장식·그림만): `tests/qa/a11y-exceptions.json`

## 5. 새 문구 (디자이너 확인 필요)
Figma에 없는 상태에 쓸 문구다. 사용자가 정했고, 디자이너 확인 전이다.

| 화면 | 문구 | 어디에 |
|---|---|---|
| 18 Just read | "Not saved · Add to keep it" + Add 버튼 | 읽기 전용 지도 위 한 줄. Add는 "Add to my Arcs"와 같은 동작 |
| 20 Today 탭이 빌 때 | "Nothing left today in your Arcs." | 탭 아래 가운데 |
| 20 같은 곳 | "See this week" | 위 문구 아래 버튼, This week 탭으로 |
| 17 Lock screen 뒤 | "Image ready to save" | Lock screen 버튼 위 |

## 6. 20 Today / This week / After CHI — 무엇을 거르는지 (디자이너 확인 전)
사용자 결정은 「A안(Arc 단위로 거르기)」이다. 각 탭에 어떤 Arc를 보일지는 내가 정한 해석이다(`app/src/arc/period.js`).
- Today: 오늘(개최지 날짜) 남은 발표가 있는 Arc
- This week: 학회 마지막 날까지 남은 발표가 있는 Arc
- After CHI: 남은 발표가 없는 Arc(다 끝났거나 다 들음). 학회가 끝나면 모든 Arc
- 처음 열리는 탭: 오늘 해당하는 Arc가 있으면 Today, 없으면 This week, 그것도 없으면 After CHI

## 7. 이번 범위 밖(본선 예정): Figma에는 있고 앱에는 넣지 않은 것
- 17 "Print badge"(그래서 Lock screen이 전체 폭)
- 16 "Follow along / Read only"(그 자리를 없애고 아래 공유 버튼 줄을 Figma의 다른 간격으로 당김)
- 09 "How you walk: Calm route / Step-free"(빈 자리 없음)
- 14g 통역 대화(Talk face to face)

사용자 「본선으로(docs/handoff에 "본선 예정"): 14g 통역 대화, Print badge, Follow along/Read only, Calm route/Step-free」

## 빼기 (2026-11-21)
앱에 넣지 않는 화면이다. 사용자 「빼기: 14c, 14d, 14h, Web · Discussion spots」
- 14c Questions
- 14d Author view
- 14h Conversation summary
- Web · Discussion spots

## 8. 링크 미리보기 그림(og)과 종족 색 (2026-11-20, 사용자 「figma대로 og-image 해줄래?」)
- og 그림은 Figma "OG · <tribe> · 1200×630"(746:1913 XR, 746:1948 Accessibility, 746:1982 AI)대로 바꿨다.
- 해석(디자이너 확인 전):
  - **Figma에 없는 5종족의 모양**: 종족 아이콘을 Figma와 같은 크기로 키우고 모서리를 둥글게 했다. 그라데이션은 Figma 세 장과 같은 규칙(위쪽이 종족 색 + 흰색 36.5%)이다.
  - **"N talks" 줄**: 형식을 "N talks · N rooms(+ demos) · 첫 발표 요일 · CHI 연도"로 정했다. Figma 세 장은 형식이 조금씩 다르다("· CHI 2026"이 있는 것과 없는 것, "+ demos"). 방이 하나여도 "1 rooms"로 쓴다.
  - **관점 기호**: ↑ ↻ ⊣를 글자 대신 관점 아이콘(투명도 0.72)으로 그렸다. Inter latin에는 ↻·⊣ 글자가 없다.
  - 질문 글자 크기는 길이로 고른다: 40자 이하 60 px, 60자 이하 56 px, 그보다 길면 50 px. 최대 세 줄.
  - 노드 자리: Supports 3, Reframes 2, Challenge 1까지(Figma 자리). 개수 줄은 실제 숫자다.
- **종족 색**: 앱 코드의 색(`tribes.js`, `tokens.css`)이 Figma 아이콘 색과 8종족 모두 달라서 Figma 값으로 바꿨다. 예: XR #4C7DFF → #6E8BFF, Accessibility #2FBF71 → #4CCF9E. 화면의 종족 색 테두리·타일·빛도 같이 바뀐다.
- 원 바깥 빛을 35% → 30%로 낮췄다. 색이 밝아져 25 노드 시간 글자 대비가 4.47:1이 됐기 때문이다.

## 9. 07 입력·예시 질문 (2026-11-20)
- 입력창 포커스 고리: Figma는 퍼짐 0(그려지지 않음), 앱은 4 px 유지(WCAG 2.4.7 포커스 보임, 사용자 결정 「포커스 고리는 4px 유지」). 디자이너 확인 전.
- 첫 예시 질문: Figma는 문장이 화살표 밑으로 들어감. 앱은 화살표 앞에서 두 줄로 줄바꿈(사용자 결정 「말줄임 대신 화살표 앞에서 두 줄 줄바꿈」). 두 줄도 52 px 줄 안에 들어감.

## 10. 14 질문 (2026-11-21)
- **추천 버튼: 접근성 때문에 바꿈.** Figma는 누른 상태 = 카드 채움 + 8% 테두리, 안 누른 상태 = 채움 없음 + 14% 테두리라 어두운 카드에서 거의 같아 보였다. 앱은 누른 상태를 채운 화살표 + 밝은 바탕(#F4F3F8, 카드 #1C1B24 대비 15:1)으로 바꿨다(사용자 결정 「누른 상태가 눈으로 구분되게(아이콘 채움 + 색, 비텍스트 대비 3:1)」). 디자이너 확인 전.
- **입력 아래 안내**: 한 줄 "Public · No personal info · Deleted 13 Jun 2027" + ⓘ(사용자 결정). 입력은 Figma 위치(y 742), 안내는 그 아래 홈 표시줄 위.
- **ⓘ 설명 시트 "About questions"** — 문구는 해석(확인 전), 결정 007과 functions/qa.mjs 기준:
  - Anyone who opens this talk in ARC can read its questions.
  - Only the question, its votes and reports are kept, with a scrambled code for this phone so you can vote once and delete your own. No name, email, IP address or browser details.
  - A question reported by three people is hidden.
  - You can delete your own questions from this phone.
  - Everything is deleted on 13 June 2027.

## 11. Figma와 남은 작은 차이 (사용자 「나머지 작은 차이는 디자이너 목록에만」)
| 화면 | 차이 | 이유 |
|---|---|---|
| 08 | "?" 버튼 x 133.5(Figma 135) | Chromium이 "Supports"를 1.5 px 좁게 그림 |
| 08·09 | 안 고른 칩 폭 = 글자 + 30(Figma + 28) | 1 px 테두리가 여백에 더해짐(공통 Chip) |
| 08–09 | 단계 막대 모서리 4 px(Figma 2) | 공통 StepBar, 4 px 막대에서는 같아 보임 |
| 10 | 상태 줄 가운데 정렬(Figma 왼쪽 고정, 중심 174) | 숫자가 바뀌는 글이라 가운데 둠 |
| 11 | YOU'RE IN·제목 가운데(Figma 중심 192·190) | 종족 이름 길이가 바뀜 |
| 11 | XR 색 #6E8BFF(Figma 프레임 #5C7CFF) | 종족 색은 Figma 아이콘 색으로 통일(§8) |
| 14 | 구분선·"Questions" 위치 | 그 위에 사용자가 남긴 줄(세션, 저자 전원, I heard it, Full abstract) |
| 14 | 아래 배경·가장자리 빛 | §2 |
| 16 | 개인정보 줄 첫 줄 y 767 | 사용자가 넣은 둘째 줄 |
| 16·19·21 | 글 몇 개가 1.5–2 px 가운데로 | Figma 상자가 가운데에서 조금 벗어나 있음 |
| 18·19 | 질문 아래 종족 아이콘 1.8 px 아래 | 공통 ArcView |
| 19 | 고른 노드 고리 59(Figma 54) | 공통 .arc-node-selected |
| 19 | Skip 원 테두리 1 px로 보임(Figma 1.5) | 1× 화면에서만, 폰은 1.5 |
| 17·18·21 | 화면마다 아래 간격이 다름(20, 10·12, 20) | 화면별로 맞춤 |
| 22 | 없음 | |

## 12. 06b·06c 온보딩, 16b 링크 미리보기 (2026-11-21, Figma 741:1448·741:1512·743:1697)
- 문구는 Figma 그대로다(다른 것 없음). 06 → 06b → 06c → 07, 점 6·7번째. Skip은 홈.
- 06b 칩 이름은 Figma의 짧은 이름("Accessibility", "Health & care", "Learning", "Society", "Devices", "Design")이다. 07·11 등 다른 화면의 종족 이름은 긴 이름("Accessibility & aging" 등, `tribes.js`)이라 둘이 다르다. 어느 쪽으로 맞출지 디자이너 확인 전.
- 16b 링크 미리보기(743:1697): 공유 링크의 설명을 Figma대로 "ARC · ↑ n support · ↻ n reframe · ⊣ n challenge · Tue 14"(실제 개수, 첫 발표 요일), 사이트 이름 "arc2027.com"으로 바꿨다. 예전 설명 끝의 "Unofficial."은 빠졌다(og 그림의 출처 줄에는 그대로 있음).

## 13. ondevice 엔진으로 생긴 새 표시 (2026-11-21, 디자이너 확인 전)
기본 엔진을 원준 엔진(ondevice)으로 바꾸면서 생긴 표시다. Figma에 없다. 문구는 사용자가 정했거나(인용) 원준 엔진의 말을 그대로 썼다.

| 화면 | 표시 | 어디에 | 출처 |
|---|---|---|---|
| 12 지도 | Reframe 종류: "Same subject" · "Other factor" · "Other measure" · "Other people" (**새 표시**) | Reframe 노드의 제목 둘째 줄 자리(제목은 한 줄로). 지도가 좁아 이미 제목이 한 줄인 노드에는 안 보이고 화면 읽기 도구로만 읽힘(아래 버튼과 겹치지 않게) | 사용자 「Reframe 노드에 원준이 주는 종류 … 짧은 글자로 표시. 13 목록과 14에도. 디자이너 목록에 "새 표시"로」, 글자는 원준 엔진의 이름 |
| 13 목록 | 같은 글자 (**새 표시**) | 시간 줄 앞: "Other factor · 11:24 · Rm 116" | 같음 |
| 14 상세 | 같은 글자 (**새 표시**) | 관점 태그 안: "Reframes · Other factor" | 같음 |
| 07b | "Suggested" | 카드의 각도 수 앞 | 사용자 「제안 카드라는 게 보이게」, 문구는 해석(확인 전) |
| 10 | "Sorting angles… 62%" | 원 아래 상태 줄(모델을 받는 동안) | 사용자 「10에서 "Sorting angles… 62%"처럼 진행률을 보여 주고」 |
| 10 | "Connect to the internet to finish setting up ARC." + "Try again" | 상태 줄 + 아래 버튼(오프라인이거나 30초 동안 진행이 없을 때, 입력한 질문은 그대로) | 사용자 같은 메시지 |

- 07b 질문은 원준 엔진이 결과 카드로 만든 조합 문장이다("Do haptics improve VR experience?"). 문법이 깨진 문장은 빼고, 남는 게 없으면 실제 논문 제목 질문을 쓴다.
- 25("Sorting angles…" 지도)는 원래 뜻(Tension 각도 판정 중)으로만 쓴다. 사용자 「25는 원래 뜻(각도 판정 중)으로만 써」

## 14. 새 프레임에서 생긴 새 문구 (#72–#75, 2026-11-21, 디자이너 확인 전)
Figma 새 프레임(06b·06c·07b·12b·14b·14e·14f·19b·20b)을 앱에 넣으며 Figma에 없던 상태에 쓴 문구다. 문구는 앱 코드 그대로다. 사용자가 원문으로 정한 것만 「」로 적었고 나머지는 해석(확인 전)이다.

| 화면 | 문구 | 언제·어디 |
|---|---|---|
| 07b | "That’s a topic. N talks match it." · "Pick a sharper question:" | 주제어를 쳤을 때 안내(사용자 「N talks」, 요일 없음) |
| 07b | "Keep ‘<topic>’ as a topic" · "Or keep typing your own." | 제안 카드 아래(사용자 「"Keep '<주제어>' as a topic"을 반드시 넣어」) |
| 07b | "Suggested" | 카드의 각도 수 앞(§13) |
| 12b | "Pick a talk to swap." · "Release on a talk to swap." | 길게 누른 뒤 안내 |
| 12b | "Both keep …" · "All three keep …" · "It keeps …" (그 관점 이름) | 대안 카드가 같은 관점을 지킨다는 줄 |
| 12b | "Looking…" · "Nothing more here." | 대안을 찾는 중 / 없음 |
| 12b | "Swapped · Undo" | 바꾼 직후 5초(사용자 「"Swapped · Undo" 알림을 5초」) |
| 14b | "Now · <방> · Talk 3 of 7" | 발표 중 머리줄 |
| 14b | "N people asked something close." + 그 질문 + "Me too + add mine" · "Post on its own" | 비슷한 질문이 이미 있을 때 |
| 14b | "N characters left" | 질문 글자 수 |
| 14e | "Meet the authors after the session" · "Session ends 15:30" · "N min from your previous stop" · "Same room as your previous stop" · "No walking time for this room on the venue plan." | 세션 뒤 카드 |
| 14e | "Directions" 시트: "Floor P1" · "Rooms on <층>" · "Step-free" · "Escalators on the way" | 요약 카드(사용자 「Directions: (a)」) |
| 14f | "Show my shape" · "Look for the same shape" · "Find each other." · "Where are you?" · "Found them" · "Cancel" | 종족 모양 크게 보이기 |
| 14f | 공유 글: "I'm at <방> · look for the <종족> shape on my phone" · "Copied: “…”" · "Send this: “…”" | 공유 시트 / 복사 / 공유 시트가 없을 때 |
| 19b | "Make it mine" · "Pick what to keep." · "Keep all theirs" · "Save as my Arc" · "Keep at least one stop to save." · "Already yours" | 받은 Arc를 내 것으로(사용자 「18 "Make it mine" → 19b」) |
| 20 | "Your CHI" 줄 | 홈 목록, Figma 20에 없음 |
| 20b | "Share my CHI" · "Export reading list" · "Text (.txt)" · "BibTeX (.bib)" · "Still open" · "Nothing left to read." · "Copied." | 학회 뒤 화면(사용자 「.txt와 .bib 둘 다」) |
| 16b | 링크 미리보기 설명 "ARC · ↑ 2 support · ↻ 3 reframe · ⊣ 2 challenge · Tue 14" | 메신저 미리보기(Figma대로 단수형) |

디자이너에게 같이 물을 것:
- 14b "Now" 점 색 #FF8E86은 Health 종족 색과 같다(색은 종족 전용 원칙).
- 19b "+" 버튼은 Figma에 없다.
- 06b 칩은 Figma의 짧은 종족 이름("Accessibility")이고, 다른 화면은 긴 이름이다.
- 14e 방 줄은 가로 스크롤(P1 방 23개)이고, Figma의 "You" 점은 뺐다(위치를 모름).

## 15. 독립 대조 뒤 바꾼 것 (2026-11-22, 디자이너 확인 전)
프로덕션을 Figma와 따로 대조한 결과(iPhone 14 크기 WebKit 사진 35장, 맞음 21 · 다름 11 · 일부 3)에서 고친 것이다. 해석(확인 전)이다.

| 화면 | 바꾼 것 | 이유 |
|---|---|---|
| 15 Swap | 선택된 관점 칩의 아이콘을 글자색 마스크로 그림 | WebKit에서 선택된 칩의 아이콘이 빈칸으로 보였음 |
| 18 · 19 · 19b | 지도를 0.78로 줄여 그리는 화면은 노드 제목 한 줄, 시간 줄은 읽기 전용(아래 목록에 시간 있음) | 12 px 글자가 줄지 않아 노드끼리 겹쳤음 |
| 12 · 23 · 24 | 아래쪽 Reframe 바깥 자리(100 / 290)를 쓸 때, 양옆 아래 노드(66 / 324, 358)를 14 px 올림(344) | 옆 노드의 시간 줄이 Reframe 원에 10 px 들어갔음 |
| 07b | 아래 "Ready offline" + "Find my angles" 줄을 없앰(Figma 07b처럼). "Keep ‘<topic>’ as a topic"이 같은 동작 | 그 줄이 Keep 버튼과 "Or keep typing your own."을 가렸음 |
| 12b | 바꿀 대안이 없을 때 "Release on a talk to swap." 줄을 안 보임 | "Nothing more here."와 맞지 않았음 |
| 12 · 13 · 18 | 피드에 시간이 없는 발표(scheduled false)는 "Time TBA"(14는 "Time to be announced") | 시간 줄이 비어 있었음 |

남은 차이(그대로 둠, 디자이너 판단):
- 14b: Figma는 짧은 화면(머리줄·제목·세션·Q&A 카드). 앱은 14 전체에 Q&A 카드를 더함.
- 14f: Figma의 "● Lunch hall · now" 머리줄, 둥근 다이아몬드, "They're at the poster", 고른 "Where are you?" 칩이 앱과 다름.
- 15: Figma는 Swap 시트가 열린 상태. 앱은 노드를 누르면 열림.
- 22: Figma는 12 위에서 열림. 앱은 08의 "?"에서도 열림(내용 같음).

## 16. Safari 툴바가 보이는 높이 390×664 (2026-11-22)
사용자 「Safari 툴바가 보이는 높이(390×664)를 qa:auto 기본 크기에 추가 … 겹치면 지도 크기를 화면 높이(dvh 기준)에 맞춰 줄이되 글자 12px·누르는 영역 44px는 유지」
- 12·18·23·24·25: 지도가 화면 높이에 맞춰 더 줄어든다. 가장 아래 노드(누르는 영역 44 px 포함)가 아래 버튼 줄 위에 오고, 페이지가 스크롤되지 않을 때까지 줄인다. 최소 0.55. 툴바가 숨거나 나타나면 다시 맞춘다.
- 글자 12 px와 누르는 영역 44 px는 그대로다. 0.9보다 작게 그려지면 노드 제목은 한 줄이고, 시간과 Reframe 종류는 화면 읽기 도구로만 읽힌다(§15와 같은 규칙).
- 01–06·10: Figma 프레임 크기(844)로 깔린 배경 그림은 화면 아래 끝에서 잘린다. 짧은 화면이 스크롤되지 않게 하려는 것이고, 844에서는 그대로다.

## 17. Figma 11/23 지도 개편 반영 (2026-11-23)
사용자 「지금 피그마 업데이트 됐는데 디자인 반영해줄래?」. Figma Final UI(582:7)를 11/21 메타데이터와 비교해 바뀐 화면을 모두 반영했다.

| 화면 | 반영한 것 |
|---|---|
| 12 · 15 · 16 · 18 · 19 · 19b · 22 · 23 · 25 · 12b | 지도가 세 구역(Regions)으로: Supports 위, Reframes 왼쪽 아래, Challenges 오른쪽 아래. 바깥 궤도 두 개는 없어짐. 구역마다 개수 표시(↑ 2 등) |
| 12 | Next 카드가 논문 제목 두 줄(15/19) + "Next · 시간 · 방", 높이 88 |
| 12a (새) | 처음 한 번 "Hold a stop / to see 3 others like it" 말풍선. 지도를 한 번 만지면 사라지고 다시 안 나옴(기기에만 기록) |
| 12c (새) | 노드 탭 → 고른 표시 + 아래 카드에 그 논문(상태 · 시간 · 방). 카드를 누르거나 같은 노드를 한 번 더 누르면 14 |
| 24 · 24c | 구역마다 중요한 3개만, 나머지는 개수 버튼과 바깥 화살표 쪽에(이전 +N 묶음 대신) |
| 24b (새) | 개수 버튼 → 지도가 그 각도 쪽으로 이동(구역이 돌고 질문 원이 아래로), 그 각도의 발표를 12개까지. 위에 "↑ Supports 12", 아래 "See all three angles". 다른 두 각도의 개수 버튼은 아래 양쪽 |
| 01 | 제목 "Bring one question / Leave CHI / with an answer"(마침표 없음), 안쪽 고리 대신 채운 원 |
| 06 | 설명 그림도 같은 세 구역 배치 |
| 07b · 20 · 20b | 작은 Arc 그림이 새 배치(20은 구역 포함) |
| 16b 링크 그림(/api/og) | 오른쪽 그림이 세 구역 배치, 선은 모양 둘레에서 노드까지 |

해석(확인 전), 디자이너에게 물을 것:
- ~~24b "Not on your Arc" + Add 미구현~~ → §18에서 구현(최종 프로토타입이 후보 + Add로 정함).
- 24b 노드 아래 연결선은 그리지 않았다(질문 원이 화면 아래로 내려가 선이 원 밖에서 시작함). Figma에도 거의 안 보인다.
- 지도 노드의 시간 줄: Figma 0.55 → 0.72. 구역의 옅은 흰색 위에서 대비가 3.0–4.1:1이었다.
- 15 편집: Supports가 2개면 바깥 두 자리(72 / 318)에 두고 + 를 가운데(195, 88)에. Figma는 121 / 269인데, 그러면 + 와 − 의 누르는 영역(44 px)이 겹친다. 한 구역이 3개 이상이면 + 는 그 구역 개수 표시 옆.
- 구역에 노드가 2개 이상이면 Reframes · Challenges 노드 제목은 한 줄(두 줄이면 아래 노드 원에 닿음). Reframe 종류(새 표시 §13)는 그때 화면 읽기 도구로만.
- 질문 원 안쪽은 V8대로 #0E0E12(흰 글자 대비). Figma 그림의 파란 원과 다르다.

## 18. 최종 프로토타입 반영 (2026-11-23, ARC_prototype (1).html)
사용자 「인터렉션 같은거 그대로 구현해주고 변경된 사항들 다 반영해줘 … 번역 이런거는 아직 결정 중이니까 제외」, 범위 「1번(09 How you walk)만 넣어. 원준 엔진의 walk: calm / step_free를 그대로 쓰고, Step-free면 Next 카드에 엘리베이터 표시. 2·3·4는 이전 결정 유지.」

연결(프로토타입 LINKS 표, `tests/qa/flow-check.mjs` 32줄이 확인):
| 화면 | 바뀐 것 |
|---|---|
| 12 · 23 · 24 · 24c | 구역 개수 버튼은 늘 누를 수 있음 → 24b(#/arc/<id>/S·R·T). 개수 = 내 Arc + 엔진이 찾은 그 각도의 다른 발표(최대 12) — 사용자 「각 영역을 보면 전체갯수가 있어 그거 맞춰서」 |
| 24b | 내 Arc의 발표 + 다른 발표(점선 원, "Not on your Arc"). 다른 발표를 누르면 카드에 Add → 이 Arc에 더함. 뒤로·See all three angles → 12 |
| 12 | 카드에 이미 보이는 발표(Next)는 첫 탭에 14, 다른 발표는 첫 탭에 카드(12c) |
| 19 | Add N to my Arcs → 홈(20) |
| 19b | Keep all theirs → 그들의 Arc를 그대로 저장하고 홈(20). 이전에는 모두 '유지'로 표시만 했음 |
| 09 | How you walk: Calm route(기본 켜짐) · Step-free. 이 폰에만 저장, Arc·링크에는 안 들어감. 원준 엔진에 walk로 넘김 |
| 12 Next 카드 | Step-free를 골랐고 앞 정류장(없으면 등록대)에서 층이 바뀌면 "· Elevator" + 아이콘 |

움직임(프로토타입 그대로, 줄인 움직임 설정이면 모두 정지):
- 모든 화면: 위에서 아래로 12 px 올라오며 나타남(32–70 ms 간격), 숫자는 0부터 올라감, 누르면 0.97로 살짝 눌림
- 지도(12·15·18·19·19b·22–25): 질문 원이 생기고 → 고리가 열리고 → 가장 중요한 발표(Next)가 있는 구역부터 구역이 퍼지고 선이 뻗은 뒤 노드가 튀어나옴, 개수가 올라감. 끝나면 고리가 숨 쉬고 Next 노드 고리가 퍼짐. 25는 구역이 깜빡이고 노드가 떠 있음. 23 빈 칸이 천천히 돎. 24·24c 화살표가 그쪽으로 까딱임
- 24b: 지도가 그 각도 쪽으로 미끄러지고, 다른 발표가 가까운 것부터 튀어나옴
- 12a: 지도가 다 나온 뒤(2.5초) 고리가 채워졌다 비워지기를 반복, 말풍선이 왼쪽에서
- 12c: 고른 노드 고리가 튀어나오고 카드가 아래에서 올라옴 · 12b: 세 대안이 위에서 떨어지듯, 선이 아래로 그려짐
- 01: ARC 원이 생기고, 바깥 선이 밝은 머리를 달고 한 바퀴 그려지며 종족 모양이 지나갈 때마다 그 색으로 내려앉음. 이후 모양들이 천천히 시계 방향으로 돌고, 질문이 하나씩 빛줄기로 찾아감
- 03 칸이 열마다 나타나고 고른 칸이 차례로 켜지며 길이 그려짐 · 05 ? ! 말풍선이 튀어나오고 사이 호가 그려짐, 규칙이 올라옴 · 06 지도처럼 피어남 · 07 종족 칩이 튀어나옴 · 11 종족 모양이 태어남 · 17 QR이 튀어나옴 · 20 작은 Arc가 원 → 구역 → 선 → 점 순서로

링크 미리보기 그림(/api/og): 프로토타입 OG1–3과 자리·구역이 같다. 선 끝을 노드 중심에서 30 px 앞으로(이전 23).

해석(확인 전):
- 엘리베이터 아이콘은 Figma에 없어 새로 그렸다(문 + 위아래 화살표, 14 px).
- 24b 다른 발표 수는 그 각도 12자리까지만 채운다(개수도 최대 12, 내 Arc가 12를 넘으면 그 수).
- 07 입력창에 질문이 저절로 타이핑되는 장면은 프로토타입 시연용이라 넣지 않았다.
- 지도가 있는 화면에서 아래 카드·버튼은 프로토타입처럼 지도가 다 나올 때까지 기다리지 않고 바로 나타난다.
- 01 가운데 원(844:1847): 중심 불투명도 0.95 → 0.82. "ARC" 흰 글자 대비가 4.3:1이었다(4.5:1 기준).
- 24b 방향(사용자 「위쪽 아니더라도 좌하단 우하단을 클릭하면 그쪽으로 영역이 커져야지」, 11/23): Supports는 Figma대로 질문이 아래로, Reframes는 질문이 오른쪽 위(320, 70)로 가고 왼쪽 아래 구역에 발표 12자리(3열 × 5줄, 줄 간격 108), Challenges는 그 거울. 다른 두 각도의 개수는 반대쪽 가장자리 띠에. 자리는 해석(확인 전), Figma는 Supports만 그림.
- 구역 배경은 지도가 작아져도 아래 카드 위까지 이어짐(iPhone에서 가운데 아래가 잘려 보였음). 구석 화살표는 프로토타입 각도(240° / 120°)로.
- 24b 다른 두 각도 개수(사용자 「위랑 우 하단 화살표 배치가 어색해서 디자이너 느낌으로 깔끔하게」, 11/24): 버튼 밖에 기울어 붙던 화살표를 없애고, Reframes·Challenges에서는 두 개수를 화면 가장자리(8px)에 맞춘 한 줄 기둥으로(Supports 위, 나머지 아래, 56 간격). 개수 자체가 버튼이라 12의 개수 버튼과 같은 모양. 해석(확인 전), 디자이너 확인 전.
- 10 로딩(사용자 「html에 딱 맞게 로딩 화면 적용해줘」, 11/24): 프로토타입 그대로 두 궤도 원이 1.6배에서 줄어들며 나타나고(1.1 s, 80/200 ms 차), 진행 링은 1.4 s마다 한 바퀴씩 감속하며 돌고, 3.3 s 뒤 11로. 원 안쪽은 V8대로 어두운 원 유지(흰 글자 대비).

## 19. 프로토타입과 다른 곳 맞춤 (2026-11-24, 사용자 「추가적으로 Html이랑 다른 부분 있으면 인터렉션과 디자인 포함해서 HTML 대로 진행해줘」)
ARC_prototype (1).html의 프레임 47개를 앱 화면 32개와 나란히 비교(좌표·색·문구·LINKS·프레임별 움직임 코드)한 뒤 맞춘 것:

| 화면 | 바꾼 것 |
|---|---|
| 01 | 바깥 선 0.08 → 0.16, 빛 0.34/0.16@0.62/0.04, 궤도 뒤 원이 숨 쉼(1.025, 5.2 s)·빛 숨 쉼(0.7, 6 s), 동네가 내려앉을 때마다 원이 잠깐 밝아짐 |
| 02 · 20b | 큰 숫자가 0부터 올라감 |
| 03 · 05 | 점선 길은 1.05 s 페이드, 시간 축 0.42 s, 05 호 0.7 s, ? ! 말풍선이 한 번씩 밝아짐(640 / 1320 ms) |
| 07 | 시작 질문을 누르면 바로 08 |
| 09 | "How you walk"는 13px 캡션, 칩 13 간격, Calm route = 길 아이콘, Step-free = 체크(늘 보임) |
| 10 | 궤도 원 1.6배 → 1, 링 1.4 s 감속 회전, 3.3 s 뒤 11 (#91) |
| 12 | Next 카드 "Room 119"(노드는 "Rm"), bloom: 구역이 질문에서 퍼짐(1 s)·앞 구역 0.45로 흐려졌다 함께 돌아옴·선이 링에서 자라남 |
| 12a | 링 2px(0.18 / 0.9), 말풍선 모서리 16, 꼬리 8×14 삼각형, 링 아래 발표가 0.92로 눌렸다 1.06으로 |
| 12b | 개수 버튼 흐려지지 않음, 선 360 ms 뒤, 카드 530/640/750 ms, 잡은 원이 튀어나옴 |
| 12c | 다른 발표를 고른 채 Next를 누르면 고르기만 풀림 |
| 15 | 구역이 화면 아래까지 |
| 16 | 그림 카드에 구역 개수 버튼 없음(아래 개수 줄만), 두 번째 카드는 큰 종족 모양 + 메신저와 같은 문구(arc2027.com, "ARC · ↑ n support …") |
| 17 | 흰 카드·코드·모양이 함께 튀어나옴 |
| 18 | Just read → 13 목록(저장 안 함, Add 줄 유지) |
| 19 | 범례가 아래 개수와 겹치던 것 → 그 아래로 |
| 19b | 뒤로 버튼 없음(프로토타입 LINKS) |
| 23 | 빈 ⊣ 0.35 |
| 24b | 구역·원·발표가 함께 900 ms, 후보는 가까운 것부터 시계 방향 |
| OG | 선이 종족 모양 가장자리 + 10px에서 시작(OG1–3 숫자와 1–2px 차이, ⊣ 막대가 모양에 가려지던 것), 칩 아이콘 0.62 |

안 맞춘 것(이유):
- 23 "⊣ 0" 0.5 → 글자 대비 약 3:1로 기준 4.5:1 미달, 그대로.
- 17 QR 가운데: 프로토타입도 코드 위에 모양만 얹음(지운 칸 없음), 크기 차이 작아 그대로.
- 16 "Your question is part of the link." 둘째 줄: 사용자 요청으로 넣은 것, 그대로.
- 20b Share my CHI: 프로토타입은 16으로 가지만 16은 Arc 하나만 공유 → 모든 Arc 링크를 공유 시트로(그대로, 디자이너 확인 전).
- 24 화살표 누르기: 화살표 자리가 개수 버튼과 겹치고 지도 밖으로 나가 44px 누르기 검사 실패 → 개수 버튼으로만(같은 24b).
- 14e: 14d(제외)에서만 가는 화면, 14 안 "Meet the authors" 카드 유지.
- 14f 모양 158px·그라데이션, 06 지도 전체 bloom, 07b 작은 Arc 움직임, 12 구역 안 순서(시간순), 25 물결: 작은 차이, 다음에.
- 지도 노드 글자(사용자 「figma 대로」, 11/24, 질문에 "Figma as is" 선택): 노드는 짧은 이름(엔진 label, 24자 이하, 보통 제목의 앞부분)을 두 줄까지 + 시간 · 방. 저자는 노드에 없음(Figma와 같음). 전체 제목은 아래 카드·14·화면 낭독(버튼 설명)에. 작은 지도(0.9 미만)에서도 두 줄(시간 줄은 원래 빠짐). 쌓인 Reframe/Challenge 자리와 24b는 자리가 좁아 한 줄 그대로.

## 20. 세 각도가 보이게 · 시니어 피드백 (2026-11-25, 사용자 「최종 결정」)
사용자 결정 원문에서: 「07b 제안을 엔진으로 실제로 돌려 카드에 ↑↻⊣ 개수를 보여 주고, 세 관점이 다 있는 것(특히 Challenge ≥1)을 위로 정렬. 맨 위 카드는 "Where CHI disagrees" 표시」, 「시작 질문 3개: … Support ≥2, Challenge ≥1인 것을 서로 다른 종족에서 3개」, 「"Today" Arc: 끝난 발표와 다른 날 발표는 지도에서 빼고, 13 목록 맨 아래 "Other days" 묶음으로만」, 「"Presenter"라는 말은 쓰지 마」.

### 시작 질문 (07)
같은 앱 어댑터로 54개를 돌림(모델 11-25와 11-25b 결과가 같음). ↑ ≥ 2 · ⊣ ≥ 1인 것은 4개.

| 질문 | 종족 | ↑ / ↻ / ⊣ | 채택 |
|---|---|---|---|
| Do AI explanations increase user trust? | AI & agents | 3 / 2 / 2 | ✓ |
| Do avatars increase presence in VR? | XR & immersive | 2 / 4 / 1 | ✓ |
| Does haptic feedback improve performance? | Devices | 2 / 4 / 1 | ✓ |
| Does AI improve design creativity? | Design | 3 / 2 / 2 | 예비(질문에 AI가 겹쳐 뺌) |
| (이전) What is accessibility research asking now? / Which CHI work can I use in industry? / My first CHI: how do I spend a day? | | 0 / 7 / 0 (셋 다) | 교체됨 |

나머지 50개 중 ↑ 2+ 이지만 ⊣ 0: Does haptic feedback improve immersion in VR?, Does gamification increase motivation?, Do design tools improve creativity? 등. 전체 표는 작업 기록(V10)에.

### 화면에 생긴 것 (디자이너 확인 전)
| 화면 | 무엇 |
|---|---|
| 07 | 시작 질문 3개 교체. 버튼 아래 "Build now"(ghost): 08·09를 건너뛰고 기본값(모든 각도·All week·Talks/Posters/Demos)으로 10 → 12 |
| 07b | 조합 질문 8개까지 실제로 Arc를 만들어 세 각도 있는 것 → ⊣ 있는 것 → ↑ 많은 것 순으로 3개. 맨 위 카드에 ⊣가 있으면 "Suggested" 자리에 "Where CHI disagrees". 셋 다 ⊣ 0이면 카드 아래 "No clear challenge at CHI this year." |
| 12 | 날짜를 고른 Arc(Today·Tomorrow·특정 날): 그날이 아닌 발표와 이미 끝났는데 듣지 않은 발표는 지도에서 빠짐. Next 카드 제목 아래 "by 이름 · 소속 · Chair 이름" |
| 13 | 행마다 "by 이름 · 소속". 맨 아래 "Other days" 묶음(지도에서 빠진 발표, 설명 "Not on your map: another day, or already over.") |
| 14 | 제목 아래 "First author · 이름, 소속", "Session chair · 이름". "Next stop · 12:15 · Rm 132 · 3–5 min walk"(같은 날 다음 정류장, 누르면 그 발표). 2개 이상 Arc에 있으면 태그 "In 2 of your Arcs" |
| 20 | 맨 위 "Talks across your Arcs"(2개 이상 Arc에 있는, 아직 안 끝난 발표 3개까지, "In 2 of your Arcs · 시각 · 방") |

사용자 승인 (11/25 「정한 두 가지(끝난 발표 기준, 첫 번째 chair) 승인」):
- "끝난 발표": Arc를 만든 시각은 실제 시각이라 데모 시계와 맞지 않아, "지금 끝났고 듣지 않은 것"으로 판단.
- Chair는 세션의 첫 번째 chair만.
해석(확인 전): All week Arc와 받은 Arc는 그대로(날짜를 고르지 않음).

## 21. Add / Swap 시트: 엔진이 정한 각도로 (2026-11-25, 사용자 결정 「A로 하고」)
검색은 이 Arc의 질문과 상관없이 CHI 발표 전체를 제목·저자로 찾는다. 예전에는 찾은 발표가 근거 문장 없이 시트의 각도(예: Supports)로 들어갔다. 이제 엔진이 이 질문에 대해 판단한 각도와 근거 문장으로 들어가고, 카드가 어디로 가는지 말한다(옵션 A).

### 카드 (디자이너 확인 전)
| 경우 | 카드 윗줄 | 버튼 이름(스크린리더) | 누르면 |
|---|---|---|---|
| 시트 각도와 같음 | 각도 기호만 (예전과 같음) | "Add to Supports: …" / "Swap in · Supports: …" | 그 각도로 |
| 다른 각도 | 기호 + **"Goes to Reframes"** | "Add to Reframes: Goes to Reframes · …" / "Swap in · Reframes: …" | 엔진이 정한 각도로 (시트 제목 "Add to Supports"와 달라도) |
| 질문과 관계없음 | **"Not about your question"**, 테두리 점선 | "Not about your question: …" | 못 누름(disabled) |
| Wildcard 칩 | 다른 각도면 위와 같이 "Goes to …" | 같음 | 엔진이 정한 각도로 |

### 문구 (디자이너 확인 전)
- 검색 placeholder: "Search all CHI talks by title or author" (예전 "Search")
- Wildcard 칩을 고르면 칩 아래 12px: "Wildcard picks its own angle for each talk."
- 판단하는 동안 "Looking…", 엔진이 실패하면 "Could not sort these talks. Try again."

해석(확인 전):
- 질문과 관계없는 발표도 목록에는 보인다(검색이 찾았다는 것을 숨기지 않으려고).
- 다른 각도로 들어간 발표가 그 구역의 4번째면 지도에서는 개수 버튼(+N) 안에 들어간다(구역마다 3개, 17절).
- mock 엔진(배포 아님): 후보 분류에 없는 발표도 점수가 Wildcard 하한(0.15) 이상이면 Reframe으로, 그 아래만 "Not about your question" (Wildcard가 주는 발표가 검색에서 막히지 않게).
- 엔진 인터페이스에 `judge(query, keys)` 추가 — 원준 확인 필요.

## 22. 노드 이름은 단어 단위로 (2026-11-25, 사용자 「UI 표현을 뭐 12자 정도만 표시하는식으로 안돼? 길게 오더라도」)
- 엔진의 짧은 이름(최대 24자)을 노드 칸에 들어가는 만큼 앞에서부터 **단어 단위로** 보여 줌. "…"으로 단어 중간을 자르지 않음.
  - 한 줄 자리(위아래로 쌓인 자리, 24b, 종류 줄이 붙는 Reframe): 한 줄. 두 줄 자리: 두 줄. 칸 폭은 실제 글꼴 폭으로 잼(지도 배율에 따라 1배 약 14자, 0.78배 약 11자).
  - 끝에 of·the·and 같은 말이나 짝 없는 따옴표가 남으면 뗌. 엔진이 이미 자른 이름("…Real…")의 마지막 조각 단어도 뗌.
  - 예: "A Tree’s Perspective" → "A Tree’s", "Effects of Virtual Real…" → "Effects of Virtual".
- 첫 단어 하나가 한 줄보다 길면("RoboHaptics", "Demonstrating" 등, 드묾) 그 단어만 "…"로 잘림. 글씨는 12 px 아래로 줄이지 않음.
- 전체 제목은 아래 카드·13·14와 화면 낭독(버튼 설명)에 그대로. 디자이너 확인 전.

## 23. 논문으로 시작 · Swap "Same time" · 14 ✦ (2026-11-25, Figma 11/25 갱신)
Figma 갱신: 07p "Do you have a paper at CHI?"(950:2182)와 07r "Is this your paper?"(950:2258) 새로, 흐름 06c → 07p → 07r → 08(논문이 없으면 07p → 07), 빈 홈·New Arc → 07p. Swap 시트 칩 "First CHI paper" → "Same time". 14 저자 줄의 "First CHI paper" 칩 삭제. 24c 삭제.

사용자 결정 (11/25):
- 「New to CHI: 14에서 칩은 빼고, 저자 이름 옆에 작은 ✦만 + 목록 아래 "✦ New to CHI" 설명 한 줄. 지도 노드 ✦는 유지.」 → **사용자 결정: 14는 칩 대신 이름 옆 ✦**. 목록 아래 "✦ New to CHI · no paper under this name in CHI 2023–2025".
- 「2편 이상 저자: 07r에서 논문 카드를 나란히 보여 주고 하나 고르게. 기본은 첫 번째 선택됨.」 → 카드가 가로로 나란히(넘겨 보기), 고른 카드는 밝은 테두리, 나머지 0.7.
- 「07r Edit: 그 자리에서 질문 고치기. Build 누르면 고친 질문으로 만들기.」

구현 메모(해석, 디자이너 확인 전):
- 07p 이름 찾기는 기기 안에서만(프로그램의 저자 이름, 엔진 "mine"과 같은 규칙: 악센트 무시, 입력한 단어마다 이름의 어떤 단어가 그걸로 시작). 2글자부터, 8명까지 + "N more · type more of your name". 아무것도 보내거나 남기지 않음(질문과 자기 발표 목록만 임시 draft에).
- 07r 질문은 엔진의 "mine"(논문 결과로 만든 질문 중 첫째). 엔진이 준비 중이면 "Reading your paper…". 그 사람의 발표는 모두 Arc 정류장에서 뺌(엔진 `mine` 인자).
- Swap "Same time": 바꾸는(빠지는) 발표와 시간이 겹치는 같은 각도 발표. 추가(Add)에는 겹칠 기준이 없어 칩 없음(각도·Wildcard만).
- 07p·07r 단계 점은 07과 같은 8번째(Figma).

## 24. Arc를 일주일 동안 폰에 남기기 (2026-11-25, 사용자 「하루 지나면 페이지가 사라지는데, 혹시 한 일주일 정도 데이터가 핸드폰에 저장되는 방식으로」)
앱에는 Arc를 지우는 코드가 없다. 지워지는 것은 브라우저 쪽: (1) 영구 저장 요청이 없어 저장공간이 부족하면 Safari가 사이트 데이터를 통째로 지울 수 있음(모델·데이터로 30 MB 넘게 씀), (2) 카카오톡 등 앱 안 브라우저는 저장소가 따로이고 짧음, (3) Safari는 7일 동안 안 연 사이트의 데이터를 지움(홈 화면 앱은 예외).
- Arc가 생기면 `navigator.storage.persist()` 요청(알림 없음, 브라우저가 결정).
- 홈 화면 앱: manifest·아이콘(ARC 표시, 180/192/512)·standalone. 홈 화면에 추가하면 따로 된 앱으로 열리고 7일 규칙에서 빠짐.
- 20 홈 위 안내(새 표시, 디자이너 확인 전): 앱 안 브라우저면 "This app’s browser may delete your Arcs. Open arc2027.com in Safari or Chrome to keep them all week." + Copy link. iPhone Safari면 "Keep your Arcs all week: add ARC to your Home Screen. Tap Share ↑ and then “Add to Home Screen”." + Got it(한 번 닫으면 안 보임).
- 한계: 저장 여부는 브라우저가 정함. 확실히 남기려면 홈 화면에 추가. 받은 링크(/s/…)에서는 Arc를 언제든 다시 만들 수 있음.

## 25. New Arc → 07 + "Start from my paper" · 07b 걸러내기 (2026-11-26)
- 사용자 결정 「New Arc 버튼: 07(질문)로 바로 가고, 07에 "Start from my paper" → 07p 링크 추가. 첫 사용(06c → 07p)은 Figma대로 유지」 (11/26 「OK, 진행해」). 07 시작 질문 목록 아래 글자 링크 "Start from my paper ›"(디자이너 확인 전).
- 사용자 결정 「요인(X) 자리에 숫자나 연구 방법 단어(interview, survey, participants, study, N=)가 있으면 빼. … 걸러서 카드가 3개 미만이면 남은 것만」: 07b 조합 질문 중 요인에 숫자나 그 단어가 있으면 뺌. 원준 엔진이 고치면 지울 임시 규칙(테스트에 표시).

## 26. 프로토타입 (3) 반영 (2026-11-26 밤, 동결 예외)
- 사용자 결정 「①②③ 모두 지금 머지」 (11/26 22:27, 동결 뒤 예외로 승인).
- ① 02–06c 제목을 질문으로, 그 아래 한 줄 답: "What is CHI 2027?", "What do I do all day?", "What are all these formats?", "How do people meet?", "What is ARC?", "Where are my people?", "When do I use ARC?". 06의 그림은 윗부분 16 px를 덜 보여 줌(844에서 스크롤 없음).
- ② 12·24b: 노드를 누르면 그 자리에 제목 팝업(상태 · 시간 · 방, 전체 제목, "View details ›", 24b에서 Arc에 없는 발표는 "Add to my Arc"). 나머지는 어둡게, 바깥 누르기·×·Esc로 닫힘, 같은 노드를 한 번 더 누르면 14. 아래 카드는 다음 발표를 그대로 보여 줌(전에는 누른 발표로 바뀜).
- ③ 06b: 분야 칩 격자 대신 프로토타입의 사람 그림("You"와 같은 모양 두 사람), 두 카드에 그림(Figma SVG를 잘라 씀: assets/arc/06b-*.svg). "Spot the shape on their phone or badge."
- 넣지 않음: 14b·14f 번역(본선 예정, §7), 14e 삭제는 앱에 따로 화면이 없어 그대로.

## 27. 컨퍼런스 날짜 · 08 없앰 · 07 논문 입구 · 통역 (2026-11-26 밤, 동결 예외)
- 사용자 「날짜기준으로 혹시 컨퍼런스 날짜 기준으로 해줄래? … arc 생성하더라도 컨퍼런스 날짜들 안에서 선택할 수 있게 해주고 그거에 맞춰서 나오도록」: 09 "When"은 컨퍼런스 날짜 칩(여러 개) + All week. Today/Tomorrow 없음. 고른 날의 발표만 지도에. 끝난 날을 골라도 그날 발표는 지도에 남음(끝난 표시); 오늘 이미 끝난 발표만 빠짐.
- 사용자 「choose angle 부분은 지워주고 굳이 필요없을꺼 같아」: 08 없앰. 07(Find my angles, 07b 카드)·07r(Build my Arc from this paper) → 09. 09의 뒤로 → 07, 단계 막대 없음. 각도는 엔진이 정함.
- 사용자 「Start from my paper 왜 html 대로 안했어. Have a paper? 이거대로 해야지」: 07 시작 질문 아래 가운데 알약 "📖 Have a paper at CHI? Find it ›" → 07p.
- 사용자 「통역 부분도 다 진행해줘」: 14g Talk face to face. 14 머리의 통역 아이콘, 14f "Start live translation"에서 들어감. 폰을 둘 사이에 놓고 위쪽 반은 상대 쪽으로 뒤집힘. Soniox 양방향 통역(/api/soniox-key 임시 키), 저장 없음(멈추거나 닫으면 지움). 14b의 "글로 쓴 질문 번역"은 글 번역 서비스가 없어 넣지 않음.

## 28. 11/27 요청 묶음 (테스트 기간, 사용자 요청)
- Q&A(14): 입력 글자 16px(iOS는 16px 미만 입력창을 누르면 확대), 키보드가 올라오면 아래 영역을 visualViewport에 맞춰 키보드 바로 위로(스크롤해도 따라옴). 안내 "Ask the authors anything you’re curious about!". 14 가이드: 저자가 세션에서 직접 답하고, 표가 많은 질문이 먼저.
- 12b 꾹 누르기: iPhone에서 글자 선택·링크 메뉴가 먼저 잡던 것을 노드에서 막음(touch-callout, user-select, touch-action).
- 노드 팝업: 제목 아래 "by 1저자 · 소속".
- 24b: 아래쪽 다른 각도 버튼을 그 방향 모서리에(Challenges에서 Reframes는 왼쪽 아래, 반대도), Supports는 위. 머리 숫자는 지도에 그린 수, 넘치면 "12 on the map · See all 19 ›"(목록으로).
- 20: Arc를 만든 컨퍼런스 날짜별로 묶음(All week는 끝). After CHI 탭: 언제든 "Your CHI so far"(20b) + 모든 Arc.
- 07: 664에서 스크롤 없음: 간격을 줄이고 Build now · Find my angles를 한 줄에.
- 14g: 언어 시트(자주 쓰는 12개 버튼 + 전체 목록), 내 언어도 바꿀 수 있음, 첫 사용 전 동의 시트. 01에 통역 예외 문구. docs/privacy/interpreting.md.
- 어제 목록: 07p "Find your paper", 14 방 "Room 116", 다른 날 노드 시간 줄은 "Wed · Rm 132", 20b 타일을 모든 Arc로.

- 사용자 결정 「D: "No clear challenge at CHI this year." 유지 (관점 이름과 통일)」 (11/27): 23 문구는 프로토타입의 "clash"가 아니라 "challenge" 그대로.
- 사용자 결정 「캐싱은 지금 방식 유지」 (11/27): 서버 백업 없음. Arc는 폰(IndexedDB, persist 요청)에만, 홈 화면 추가·앱 안 브라우저 안내 그대로.
- 사용자 「Soniox 언급하지 말고 어디에도 저장되지 않는다는걸 확인만」 (11/27): 01 "Live interpreting is never saved, anywhere", 14g 안내 "Nothing you say is saved, anywhere." Soniox 이름은 동의 시트에만(사용자 11/27 동의 화면 요청).

## 29. Edit 흐름 (2026-11-27, 테스트 기간, 사용자 요청)
- 사용자 「추가하면 추가하시겠습니다 창 띄워주고 그다음 넣어주고」: 시트에서 카드를 누르면 "Add this talk to Reframes?"(Swap은 "Swap in this talk?") 확인 → Add to …/Cancel.
- 사용자 「각 3파트 자유롭게 돌아다니면서 editing」: Add 시트의 칩이 Supports · Reframes · Challenges(+ Same time · Wildcard), 시트 안에서 각도를 바꿈. 추가해도 시트는 열린 채(계속 추가), × 로 닫음.
- 사용자 「추가하고 나서 갑자기 scale이 쑥 작아지는데」: 시트가 닫히거나 발표가 들어올 때 지도 맞춤을 화면 폭부터 다시 잼.
- 사용자 「꾹 누르면 전체 논문 제목, 저자 시간 장소 abstract까지 나오는 미리보기」: 시트 카드를 0.45초 누르면 미리보기(각도 · 시간 · 방, 제목, 1저자 · 소속과 저자 수, 초록), 거기서 바로 추가.
- 사용자 「처음 editing들어가면 다른 곳처럼 가이드」: 지도 가이드를 본 뒤 처음 여는 15에서 4단계(+, 발표 바꾸기, −, Done), 한 번만.
- Q&A: iOS 26 Safari는 키보드가 없을 때도 툴바만큼 보이는 영역이 짧아, 그 차이를 빼고 키보드만큼만 올림(입력창이 70pt 떠 있던 것). 안내 "Ask the authors anything"(16px에서 잘리던 것).

## 30. 키보드 위 빈 공간 · 꾹 눌러 미리보기 · 시트 가이드 (2026-11-27)
- 사용자 「키패드 올라와있는 상태에서 페이지 아래까지 내리니까 … Gap이 생겨서 키보드 위에 빈공간」: 키보드가 올라와 있는 동안 14의 질문 상자를 보이는 영역(visualViewport) 아래 끝에 고정(fixed, top = offsetTop + height). 전에는 sticky 자리에서 키보드만큼 올려, 페이지 끝까지 내리면 그 차이만큼 떴음. 그동안 화면 아래에 상자 높이만큼 여백을 둬 내용이 튀지 않음.
- 사용자 「꾹 누르면 그 위쪽으로 다른 창으로 보이게 해주고, 때면 사라지는 느낌」: 15 시트 카드를 0.45초 누르면 시트 위쪽에 논문 창(각도 · 시간 · 방, 제목, 1저자 · 소속, 초록)이 떠 있고, 손을 떼면 사라짐. 추가는 카드를 누르면(확인 후).
- 사용자 「노드 꾹 누르는게 아니라 서칭 창에서 꾹 누르면 << 이거 가이드가 정정」: Edit 가이드 첫 단계는 "+ 를 누르면 아래 시트에 그 각도의 발표", 꾹 누르기는 시트가 처음 발표를 보여 줄 때의 시트 가이드 2단계(각도 바꾸기, 꾹 눌러 읽기·눌러 추가)에서. 시트 아래 한 줄 "Hold a card to read the paper · tap it to add".

## 31. 입력창 안전화 · Edit 전체 목록 (2026-11-27)
- 실기기 측정(?kbdebug): innerHeight 714, 보이는 영역 404 → 키보드·Safari 막대가 310을 가림. 질문 상자는 fixed + top/translate인데 원래 class의 bottom-0이 남아 상자가 아래로 늘어났음(위 94 · 아래 404, 입력 밑 310 빈 공간). 
- 사용자 「검색창이 있는 모든 부분 전면 재교체 해야할꺼 같아 안전화」: 키보드 계산을 useKeyboardInset 하나로(보이는 영역 아래 끝까지의 거리, 입력 중이고 80 넘을 때만). 붙이는 곳은 두 곳만: 14 질문 상자(Screen pinBottom: fixed, bottom = 그 거리) · Add/Swap 시트(bottom = 그 거리, 높이는 보이는 영역 안). 07 · 07p 같은 검색 화면은 아래 버튼을 키보드 밑에 둠(결과가 가려지지 않게). 모든 입력 글자 16px 이상(Add 시트 검색 14 → 16), 이름·검색 입력은 자동 고침·맞춤법 끔. ?kbdebug는 그대로(측정용).
- 사용자 「editing 할때 각 파트 전부 다 노드 볼 수 있도록」: 15 지도 아래에 각도별 전체 목록(제목, 시간·방, Swap, −, 각도마다 + Add). 지도는 화면 높이를 그대로 쓰고 목록은 스크롤로.

## 32. 14 질문 입력 = 입력 전용 시트 (2026-11-27)
- 사용자(붙여 넣은 지시) 「visualViewport로 입력창 따라붙이는 방식은 Safari가 레이아웃 뷰포트를 밀어 올리는 것과 계속 충돌해서 안 돼. 방식 바꿔」: 14 아래 상자는 누르면 열리는 버튼("Ask the authors anything"). 누르면 같은 탭 안에서 시트가 열리고 textarea에 초점(iOS는 같은 탭에서 초점을 줘야 키보드가 뜸). 시트는 fixed, top = visualViewport.offsetTop, height = visualViewport.height(resize·scroll 때 다시), 뒤 페이지는 body 고정(닫을 때 스크롤 위치 복원), 글자 16px, Esc·×로 닫기, 보내면 닫힘. 비슷한 질문이 있으면 시트 안에 "Me too + add mine"/"Post on its own".
- 확인: iOS 26.5 시뮬레이터 Safari(safaridriver)에서 시트가 보이는 영역을 꽉 채움(0–678). 소프트웨어 키보드는 자동화로 띄울 수 없어 실기기 또는 시뮬레이터에서 손으로 확인 필요(tests/qa/sim-qa-ios.mjs).
- 15(11/27): 사용자 「edit도 원래 화면이랑 비슷하게 각 영역에 가려진 애들 더 넓은 영역에서 볼 수 있게」: 각도 개수를 누르면 24b처럼 그 각도를 넓게(최대 12개, 각 − · 눌러 바꾸기), 머리 "‹ See all three angles" 또는 가운데 원으로 돌아옴. 지도 크기는 칸 높이로만 정함(목록 스크롤 중 지도가 줄던 것). − 버튼 영역을 6px 위로(노드 위쪽을 누르면 − 가 눌리던 것).
- 15 시트 미리보기(11/27): 사용자 「B로 해줘」(iOS 방식): 카드를 꾹 누르면 미리보기가 뜨고 손을 떼도 남음, 초록은 그 안에서 스크롤, 바깥·×로 닫기, 미리보기 안에서 바로 "Add to …"(확인 없이, 이미 읽은 뒤라). 시트 가이드 문구도 맞춤.
