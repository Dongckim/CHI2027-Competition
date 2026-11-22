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
