# Arc engine: 질문 하나를 Support · Reframe · Challenge로 나누는 모델

11/16 팀 문서("ARC 최종 흐름 · UI/인터랙션 디자인 가이드")와 Figma "final flow" 페이지에 맞춰, 사용자의 연구 질문을 가운데 두고 CHI 발표를 세 각도로 배치하는 모델을 만들었다. 무거운 계산은 서버에서 한 번 해 두고, 폰은 이미 있던 8 MB query encoder만으로 질문을 해석해 맞춰 보게 했다. 그래서 서버 없이 폰 브라우저에서 돈다. 여기 숫자는 `docs/angle_eval.json`, `docs/angle_build.log`에서 나왔고 맨 아래 명령으로 다시 만들 수 있다.

## 무엇을 하나

화면 번호는 11/17에 업데이트된 Figma "ARC Mobile Wireframes"의 "final" 페이지 기준이다. 헤더에 적힌 제안(Q1~Q20)을 그대로 따랐다.

| Figma 화면 | screen | 모델이 내는 것 |
|---|---|---|
| 07 첫 질문 | `ask` | 입력 종류(topic / relation / open), 질문에서 찾은 factor X와 outcome Y와 방향, 종족 미리보기. 주제어나 열린 질문이면 더 좁은 질문 3개와 각각의 ↑ ↻ ⊣ 개수. 오타를 프로그램 단어로 고친 문장(`corrected`), CHI가 다루지 않는 주제이거나 영어가 아니면 `warning`(이때는 더 좁은 질문을 내지 않는다) |
| 08 Choose your angles | `angles` | 각도마다 "비슷한 주제" 칩 최대 3개(예: Supports에 Interaction fidelity), 처음엔 Supports·Reframes 2개, Challenges 1개 선택. 반론이 없으면 "No clear clash at CHI this year." |
| 09 When and what | `arc`의 `days`, `formats` | `today`(기본) / `tomorrow` / `week`, Talks · Posters · Demos(기본) · Panels · SIGs |
| 10 Building, 11 종족 공개 | `arc`의 `loading`, `tribe` | "Reading 2,606 talks for you", "Look for the blue diamond." |
| 12 메인 Arc, 24 노드가 많을 때 | `arc` | 노드마다 각도, 짧은 이름, "14:00 · Rm 119" 줄, 상태(next, upcoming, heard, ended, read). 걷는 시간은 Next 카드에만 넣었다(Q6). 각도마다 3개를 넘으면 나머지는 `bundles`의 "+N"으로 접힌다. 08에서 고른 칩의 발표가 먼저 배치된다. |
| 13 목록 보기 | `summary` | 각도별 묶음과 "Heard · 11:26 · Rm 116", "Next · 14:00 · Rm 119" 줄, DOI 목록(Markdown, BibTeX) |
| 14 Talk detail | `node` | "WHY IT SUPPORTS"와 초록 문장, 밑줄 위치, "Tue 14:00 · Room 119", 첫 저자와 First CHI paper 배지, Q&A에 처음 띄울 질문 2개(빌드 때 LLM이 쓴 것). 질문 올리기와 추천 수는 서버가 맡는다. |
| 15 Edit | `edit` | 노드를 누르면 교체(같은 각도), + 칸이면 추가(Q7). 필터는 각도 / First CHI paper / Wildcard이고 검색도 된다(Q8, Q9). 시간이 겹치는 후보는 빼지 않고 "Same time as …", "Right after …"로 표시한다. |
| 16·17 공유, 18 받은 Arc, 19 골라 담기 | `shared` | 링크의 질문과 논문 번호만으로 같은 각도를 다시 계산한다. 보낸 사람이 15번에서 직접 각도를 정한 발표는 링크에 그 각도(`angles`)를 같이 담아, 받는 사람에게도 같은 각도로 보인다. 받는 사람 시각에 이미 끝난 발표는 잠기고(Ended), 버튼은 "Add N to my Arcs"다. 결과는 보낸 사람의 질문으로 만든 새 Arc다(Q12). |
| 20 홈, 21 빈 홈 | `home` | 저장된 Arc마다 종족과 "Today", "Wed", "Mon · all heard". Arc가 없으면 "Start with one question." |
| 22 ? 각도 설명 | `meta`, 모든 화면의 `help` | Figma 문구 그대로("Same question, same finding." 등)와 한국어 |

## 어떻게 판정하나

빌드 때 Qwen3-14B로 초록 2,780개를 세 번 읽었다. 첫 번째는 결과 카드를 뽑는 일이다. 카드 하나는 factor, outcome, 방향(increase, decrease, no_effect, mixed, associated), 대상, 그리고 그 문장이 이 논문의 결과인지(result), 시스템이 주장하는 효과인지(claim), 배경인지(prior), 목표인지(aim)를 담는다. 구절은 초록에 글자 그대로 있어야 하고, 없으면 같은 문장에서 같은 어간의 단어를 순서대로 덮는 가장 짧은 원문 구간으로 바꾸며, 그것도 없으면 버린다. 그래서 화면에 인용되는 문장과 밑줄은 항상 초록 원문이다. 두 번째와 세 번째는 매칭용 일반어를 붙이는 일이다. 카드 구절마다 연구자가 질문에 쓸 법한 이름 1~3개, 논문 전체가 무엇에 관한지, 그리고 카드를 질문 말투로 다시 쓴 claim을 만든다. 이것들은 매칭에만 쓰고 화면에 인용하지 않는다.

폰은 질문을 X → Y와 방향으로 읽는다("Does VR fidelity really raise presence?"는 vr fidelity, presence, +). 그다음 기존 retriever로 상위 40개를 고르고, 그 카드들을 X·Y와 비교한다. 비교는 머리 단어(같은 어간 포함)와 수식어가 겹치는 정도, 그리고 8 MB encoder의 구절 벡터 cosine 중 큰 값이다. 규칙은 이렇다.

| 각도 | 조건 |
|---|---|
| ↑ Support | 같은 X와 Y이고, 이 논문의 결과가 질문 방향과 같다. 데모나 시스템의 claim이면 세부 유형이 Try it이다. |
| ⊣ Challenge | 같은 X와 Y인데 결과가 반대거나 효과 없음이거나 조건부다. result 문장이어야 하고, X·Y가 모두 0.8 이상 맞아야 하며, 데모·패널·밋업에는 붙지 않는다. |
| ↻ Reframe | Y는 같고 다른 요인(Other factor), X는 같고 다른 결과나 측정(Other measure), 같은 질문인데 다른 사람이나 맥락(Other people), 또는 방향 없는 관계만 있는 경우(Same subject) |
| 지도에 안 올림 | 카드도, 논문 전체의 일반어도 X나 Y와 맞지 않는다. |

결과가 섞인 논문은 LLM이 중요하다고 먼저 쓴 카드가 각도를 정하고, 반대 방향의 결과 문장은 `caveat`로 함께 보낸다. 예를 들어 222304(VR System Fidelity)는 Support이고, "scenario fidelity는 효과 없음" 문장이 caveat로 붙는다.

주제어나 열린 질문으로 만든 Arc는 가장 맞는 좁은 질문 하나로 바꿔서 만들고(`asked`에 원래 입력), `edit`, `node`, `shared`, `summary`도 같은 질문으로 바꿔 계산해서 지도와 어긋나지 않는다. 칩과 질문 문구의 약어는 대문자로 보낸다("Wayfinding in VR"). 사용자가 Edit에서 직접 각도를 정한 발표는 `summary`, `shared`의 `angles`({"발표 id": 각도})와 `node`의 `angle`로 그 각도를 받아서, 지도·목록·상세·공유 링크가 모두 같은 각도를 보인다.

## 데이터 규모

| 항목 | 값 |
|---|---|
| 카드가 있는 항목 | 2,780 (프로그램 전체) |
| 원문 확인을 통과한 카드 | 11,052 (원문에 없는 구절로 약 2,600개를 버렸다) |
| 방향 분포 | associated 7,664 · increase 2,272 · decrease 551 · no_effect 459 · mixed 106 |
| 일반어가 붙은 구절, claim | 17,373 · 10,742 |
| 종족 | Society 703 · Devices 382 · Health 344 · Design 342 · AI 314 · XR 249 · Learning 225 · Accessibility 221 |
| 제1저자가 데뷔인 논문 | 1,033 (2023~2025 CHI 논문 저자 이름과 대조) |
| 패키지 크기 | 20 MB에서 34 MB(zip 20 MB)로 늘었다. phrase_vec.npy가 9.6 MB, angles.json이 3.7 MB다. |
| 속도 (Node, 이 서버 CPU) | 처음 로딩 1.4초, Arc 한 번 94 ms |

## 평가

질문 48개(종족마다 6개)에 대해 retriever 상위 15개씩, 720쌍에 정답 각도를 붙였다. 라벨은 Claude 에이전트 6개가 `data/eval/LABELING.md` 기준으로 초록을 하나씩 읽고 붙였다. 사람 라벨이 아니라는 점은 알고 봐야 한다. 정답 분포는 Reframe 514, Off 143, Support 57, Challenge 6이다. 짝수 질문(dev)에서 임계값을 정하고 홀수 질문(test)으로 보고했다. 평가는 Arc 화면과 같은 경로(`_judged`: 검색 상위 40개를 카드로 판정)로 한다.

| test 360쌍 | 모두 Reframe이라고 답하기 | Arc engine (11/17) | Arc engine (11/20) |
|---|---|---|---|
| 지도에 올린 것의 precision / recall | 0.80 / 1.00 | 0.88 / 0.70 | 0.86 / 0.81 |
| Support precision / recall | 0 / 0 | 0.75 / 0.14 | 0.75 / 0.14 |
| Challenge precision / recall | 0 / 0 | 0.50 / 0.20 | 0.50 / 0.20 (정답이 5개뿐) |
| Reframe precision / recall | 0.72 / 1.00 | 0.79 / 0.67 | 0.77 / 0.78 |
| macro-F1 | 0.21 | 0.43 | 0.43 |
| accuracy | 0.72 | 0.63 | 0.67 |

11/20에 바뀐 것은 검색 순위로 남기는 Reframe이다. 카드로는 X나 Y를 찾지 못했지만 검색 점수가 1.5 이상이거나(코사인과 키워드 점수 합, 최대 2) 고른 형식 안에서 검색 5위 안이면, 확신도 0.2의 Reframe(Same subject)으로 지도 후보에 남긴다(`NEAR_SCORE`, `NEAR_TOP`). 카드에서 나온 각도보다 확신도가 낮아서 Arc를 다 채우지 못할 때만 올라온다. dev에서 이렇게 살린 것의 81%, test에서 79%가 정답에서도 관련 있는 발표였다. 여러 신호를 섞은 작은 로지스틱 회귀도 해 봤지만 test에서 0.864 / 0.822로 단순 규칙과 거의 같아서 규칙을 남겼다.

정확도만 보면 "모두 Reframe"이 더 높다. 정답의 72%가 Reframe이기 때문이다. 이 모델이 하는 일은 관련 없는 발표를 걸러 지도의 precision을 0.80보다 높게 지키고, Support와 Challenge를 틀리지 않게 고르는 것이다. Support는 고르면 4개 중 3개가 맞지만 정답 Support의 14%만 찾는다. 놓친 것은 대부분 사람이 의미로 이어 붙인 경우다. 예를 들어 "AR chatbot이 stress를 줄였다"를 "mental health apps가 stress를 줄이나"의 근거로 보는 판단은 정답 라벨에서는 Support지만 모델은 Reframe(Other factor)으로 둔다. 지금 규칙은 일부러 Support와 Challenge를 아껴 쓰는 쪽이다. 틀린 Support나 Challenge가 Reframe보다 신뢰를 더 잃게 하기 때문이다.

시도했다가 넣지 않은 것도 적어 둔다. 카드 구절 벡터를 teacher(bge-m3-chi)로 만들고 질문만 8 MB encoder로 만드는 방식은 정확도가 0.62에서 0.61로 오히려 낮았다. 논문 전체가 X에 관한 것이면 카드의 factor도 X로 보는 규칙은 Support precision을 0.71에서 0.56으로 떨어뜨렸다. Y의 다른 측정값도 Y로 보는 규칙은 거의 변화가 없었다. cosine 구절 벡터를 아예 빼면 test의 지도 recall이 0.70에서 0.65로 떨어져서 남겼다. 11/20에 Support recall을 올리려고 두 가지를 더 시험했다. 카드의 요인이 그 논문의 시스템 이름(라벨)일 때 논문 전체가 X에 관한 것이면 X로 보는 규칙은 dev에서 맞는 Support 1개를 더 찾고 test에서는 변화가 없었다. 카드에 방향이 없을("associated") 때 원문에서 두 구절 사이의 "enhanced", "reduced" 같은 단어로 방향을 되살리는 규칙은 dev에서 1개를 더 맞히고 test에서 틀린 Support 2개를 새로 만들었다. 둘 다 넣지 않았다.

## 일반 LLM과 비교

같은 질문 48개와 같은 후보 15개(720쌍)를 일반 LLM(Qwen3-14B, thinking 끔)에게도 주고, 위 정답 기준과 같은 각도 정의로 분류하게 했다(`scripts/compare_llm.py`, 결과 `docs/llm_compare.json`). LLM은 채팅 앱처럼 매번 새로 생성(temperature 0.7)해서 5번, 고정(temperature 0)해서 2번 돌렸다. 정확도는 test 360쌍, 반복 일관성은 48개 질문 전체로 쟀다.

| | Arc engine | LLM (5번 평균) |
|---|---|---|
| 지도에 올린 것의 precision / recall | 0.86 / 0.81 | 0.94 / 0.76 |
| Support precision / recall | 0.75 / 0.14 | 0.18 / 0.69 |
| Challenge precision | 0.50 | 0.16 |
| macro-F1 | 0.43 | 0.43 |
| 발표마다 분류가 5번 모두 같음 | 100% | 86% |
| Support·Challenge 목록이 5번 모두 같은 질문 | 100% | 58% |
| 실행 | 폰 브라우저, 34 MB, Arc 한 번 40 ms | 서버 GPU(L40S), 28 GB, 질문 하나 약 6초 |

LLM은 관련 없는 발표를 조금 더 잘 거르지만 관련 있는 발표는 엔진보다 덜 올리고, Support를 많이 찾지만, Support라고 한 것의 5개 중 4개가 틀린다. 같은 질문을 다시 물으면 48개 중 42%에서 Support나 Challenge 목록이 바뀌고, 3개 질문에서는 Challenge가 나왔다 안 나왔다 한다. temperature 0으로 고정하면 반복 결과는 같아지지만 Support precision은 0.20으로 그대로다. 그림은 `docs/screenshots/24_llm_vs_engine.png`, 같은 질문 5번의 예시는 `25_llm_repeat_example.png`다.

## 주제어와 문장형 결과 (11/20)

- 주제어("haptics")는 그 주제를 다룬 발표들의 카드에서 가장 흔한 결과(주제가 요인일 때)나 원인(주제가 결과일 때)을 붙여, 사용자의 단어가 남은 질문을 먼저 제안한다("Do haptics improve VR experience?"). 발표 두 개 이상이 받쳐 줄 때만 쓰고, 없으면 예전처럼 카드의 요인→결과 쌍으로 만든다. 주제어 25개로 재면 첫 제안 뒤의 발표가 평균 1.4개에서 1.9개로, 발표 하나뿐인 제안이 16개에서 9개로 줄었다.
- 주제어나 열린 질문으로 만든 Arc는 좁힌 질문으로 7개를 채우지 못하면 원래 주제의 검색 상위 발표(확신도 0.1의 Reframe)로 나머지를 채운다. 화요일 기준 점검 질문 20개 중 3개 이하이던 9개가 모두 7개가 됐다.
- "help blind users browse the web faster"처럼 결과가 동사구면 논문이 재는 결과처럼 바꿔 읽는다(web browsing speed, 사람은 대상으로). "feel less lonely"는 loneliness를 줄이는 질문이 된다.

## 한계

- 주제어를 좁힌 질문은 여전히 어색할 때가 있다("Does accessibility reduce performance?"). 긴 열린 질문은 주제어로 제안을 만들지 못해 예전 방식으로 만든다.
- Support recall이 낮다. Arc 7개 중 Support는 대개 0~3개이고 Reframe이 많다. Figma 시안의 "2 support · 2 reframe · 1 challenge" 모양이 항상 나오지는 않는다.
- Challenge는 정답 자체가 6개뿐이라 숫자를 믿기 어렵다. 프로그램 전체에서 초록에 반대 결과를 분명히 쓴 논문이 적어서, "이번 CHI에서 뚜렷한 엇갈림을 찾지 못했어요"가 자주 뜨는 것이 정상이다.
- 종족은 LLM 판정이고, 키워드 규칙과의 일치는 55%다. 화면에서 바꿀 수 있게 2위 종족을 같이 보낸다(팀 문서 Q5).
- 데뷔 판정은 이름만 맞춘 것이고 2022년 이전은 보지 않았다. 2026 논문 저자의 62%가 2023~2025에 없던 이름이라, 필터가 아니라 상세 페이지의 배지로 쓰는 것이 맞다.
- 영어 질문만 받는다(Q21).

## 요청 예시

```bash
cd dist/chi2026-retriever
python angles.py '{"screen": "ask", "text": "VR presence"}'
python angles.py '{"screen": "angles", "question": "Does VR fidelity raise presence?"}'
python angles.py '{"screen": "arc", "question": "Does VR fidelity raise presence?", "days": "today", "formats": ["talks", "posters", "demos"], "chips": ["support:fidel", "reframe:avatar"], "now": "2026-04-14T13:30:00+02:00"}'
python angles.py '{"screen": "edit", "question": "...", "days": "today", "nodes": [222304, 222323], "node": 222304}'
python angles.py '{"screen": "edit", "question": "...", "days": "today", "nodes": [222304, 222323], "add": "reframe", "filter": "wildcard"}'
python angles.py '{"screen": "node", "question": "...", "id": 222304}'
python angles.py '{"screen": "shared", "question": "...", "ids": [222323, 222304], "now": "2026-04-14T09:12:00+02:00"}'
python angles.py '{"screen": "summary", "question": "...", "ids": [222323, 222304], "heard": [222323], "now": "..."}'
python angles.py '{"screen": "home", "arcs": [{"question": "...", "ids": [222323, 222304], "heard": [222323]}], "now": "..."}'
python angles.py '{"screen": "ask", "text": "VR presence", "now": "2026-04-14T13:30:00+02:00"}'
python angles.py '{"screen": "arc", "question": "...", "days": "week", "walk": ["calm", "step_free"], "now": "..."}'
python angles.py '{"screen": "hold", "question": "...", "days": "week", "nodes": [222304, 222323, 222447], "node": 222447, "now": "..."}'
python angles.py '{"screen": "questions", "id": 223179, "questions": ["Over time, did participants delegate more?", "..."], "new": "Did they delegate more over time?"}'
```

폰에서는 `web/load.mjs`의 `loadAngles(base)`가 같은 요청을 받는다. `arc`의 `state`로 사용자의 편집을 보낸다. `removed`는 뺀 노드, `locked`는 고정한 노드, `added`는 `{"id", "angle"}`로 사용자가 정한 각도, `heard`는 들은 노드다. 모델은 상태를 저장하지 않는다. 25번 "Sorting angles…"는 모델 파일을 받는 동안 앱이 보여 주는 화면이라 모델 쪽 일은 없다.

## Figma "final" 11/20 추가 화면 (엔진 쪽)

11/20에 Figma "final" 페이지에 화면 16개가 더해졌다. 엔진 요청은 아래처럼 늘었다. Python과 JavaScript 결과가 같은지 확인하는 테스트에 새 케이스 10개를 넣었고, 모두 같다(239/239).

| Figma | 요청 | 하는 일 |
|---|---|---|
| 07b 넓은 질문 좁히기 | `ask` + `now` | "That's a topic. 10 Tuesday talks match it. Pick a sharper question:"처럼 그날 맞는 발표 수를 센다(`matching_day`). "What is X research asking now?"의 research, asking, now 같은 말은 세지 않는다. |
| 09 How you walk | `arc`, `edit`, `hold`의 `walk` | `calm`은 정류장 사이를 10분 이상 비운다(기본 5분). `step_free`는 층을 옮길 때 엘리베이터로 걷고, Next 카드에 "elevator"를 붙인다. |
| 12b 노드 길게 누르기 | `hold` | 누른 정류장과 같은 각도이면서, 나머지 일정에 맞고, 그 시각 앞뒤 90분 안에 있는 발표를 최대 3개 준다. 각 카드에는 바로 앞 정류장에서 걷는 시간("stay", "2–4 min walk")이 붙는다. 판정한 40개 밖에서도 30개를 더 읽는다. |
| 14b 발표 중 질문 | `questions` + `new` | 새 질문과 비슷한 질문(코사인 0.50 이상), 그 질문이 들어갈 묶음, 초록의 핵심어("From the abstract · delegate → delegation")를 준다. 핵심어는 제목과 결과 카드에 나온 말만 쓴다. |
| 14d 저자 화면 | `questions` | 질문을 묶음으로 나눈다(묶음 중심과 코사인 0.45 이상이면 합류). 묶음 이름은 묶음 안에서 가장 많이 나온 두 단어이고, 초록에 나오는 단어를 먼저 쓴다. |
| 20 Today / This week / After CHI | `home`의 `tab` | 오늘 일정이 남은 Arc는 `today`, 남은 날이 있으면 `week`, 다 들었거나 날이 지났으면 `after`다. |

질문 묶기는 8 MB 인코더로 하므로 영어 문장이어야 한다. 다른 언어 질문은 앱이 먼저 영어로 옮긴다(브라우저의 온디바이스 번역기). 이 인코더는 "train station"과 "airports"처럼 뜻만 가까운 질문은 잘 묶지 못한다.

## 결과 문장만 근거로, 종족은 입력한 말로 (11/22)

팀 확인에서 두 가지가 나왔다.

**결과가 아닌 문장의 카드.** 222623의 Challenge 근거가 "This study investigated how haptic feedback influences …"였다. LLM이 목표·방법 문장을 `result`, `no_effect`로 저장한 것이다. 이제 `build_angles.py`가 `result` 카드의 문장을 한 번 더 읽는다. 연구 공백·선행 연구 문장("little is known", "prior work")은 `prior`가 된다. 결과 표현(found, results show, significantly, % 등)이 없는 문장 가운데 초록 첫 문장도 `prior`가 된다. 시스템 소개("We present X that …")는 `claim`(Support는 Try it까지만), 목표·방법("This study investigated", "We conducted interviews with 20 …")은 `aim`이다. "unlike prior work, we did not find …"처럼 우리 결과를 말하는 문장은 그대로 `result`다. Challenge와 Evidence Support는 `result` 카드에서만 나오므로, 이런 문장은 더 이상 근거가 되지 않는다. 카드 14,666개 가운데 약 1,600개가 `result`에서 빠졌다(aim 878, prior 387, claim 335). 정답 세트의 Challenge 하나(229929)가 사라졌는데, 그 근거도 초록 첫 문장("Social isolation … challenge older adults' wellbeing")이었다.

**종족.** 주제("privacy of smart home devices")로 만든 Arc는 가장 날카로운 질문 하나로 만들어진다. 그런데 종족도 그 질문으로 계산해서, 질문이 다른 데로 흐르면 종족도 함께 흘렀다("Do parent-child tensions …" → Learning). 이제 종족은 언제나 사람이 입력한 말로 정한다(`arc`, `edit`의 Wildcard, `shared`). `ask`의 종족과 같아진다.

| 입력 | 전 | 지금 |
|---|---|---|
| accessible indoor navigation for blind people | Society & communities | Accessibility & aging (margin 0.94) |
| privacy of smart home devices | Learning & families | Society & communities (0.47) |
| Robotics could be helpful to the human daily life? | Design & creativity | Health & wellbeing (0.16, 다음은 Accessibility & aging) |

로봇 질문은 맞는 발표가 여러 분야에 흩어져 있어 차이가 작다. 11 화면의 Change 목록 맨 위에 2등 종족이 나온다.

Support 기준을 풀어 본 결과(정답 세트, 바꾸지는 않음): Support가 X·Y 둘 다 0.70 대신 0.65 이상이면 48문항 precision .619→.625, recall .228→.263이다. 0.55까지 내리면 recall은 .298로 오르지만 holdout precision이 .50→.17로 떨어진다. 80개 질문의 Arc 노드 가운데 Support 비율은 7%(0.70), 8%(0.65), 10%(0.55)로 거의 그대로다. Support가 적은 것은 기준 탓보다 "X가 Y를 올린다"고 직접 말하는 결과 카드가 적어서다.

## Challenge가 나오게, 판정은 더 정확하게 (11/25)

**판정 자체는 맞다.** 결과 카드마다 그 카드 문구 그대로 질문을 만들어("Does {요인} increase {결과}?") 넣어 보면, 반대·무효 결과 카드 1,305개 가운데 98%가 Challenge, 증가 카드 3,193개 가운데 99%가 Support로 나온다(고치기 전 91%, 95%). Challenge가 드문 이유는 판정이 아니라, 질문의 X·Y와 카드 문구가 맞는 경우가 드물다는 데 있다. 정답 세트에서도 Challenge는 1,200쌍 가운데 9쌍(0.75%)뿐이다.

**고친 것.**
- 단어 비교: "한 단어가 다른 단어로 끝나면 같은 말"이 explainability = ability, emotion = motion, interaction = action, supervision = vision, attention = tension으로 번지고 있었다. 이제 앞부분이 4자 이상이고 접두사(inter, super, tele …)가 아닐 때만(cybersickness = sickness), 그리고 ability는 머리말로 보지 않는다.
- 오타 교정: 프로그램에 없는 "happier"가 "happen"으로 바뀌어 질문이 깨졌다. 질문 해석기가 아는 단어(동사, happier, safer …)는 고치지 않는다.
- 한 발표 안 카드 고르기: 질문에 맞는 카드가 여럿이면 맨 앞 카드가 아니라 질문에 가장 가까운 카드로 판정한다. 같은 발표의 반대 결과가 Support에 묻히던 67건이 이것이었다.
- 요인과 결과가 뒤바뀌어 맞은 카드(swap)는 효과 방향을 알 수 없으므로 Challenge가 되지 않는다.

**Trade-off Challenge (새 subtype `cost`).** 질문은 X가 좋다고 가정한다("raise" 좋은 Y, "reduce" 나쁜 Y). 바로 그 X가, 그 연구가 시험한 그대로, 다른 결과를 나쁘게 만들었다는 결과 문장은 질문자가 지나치면 안 되는 엇갈림이다("uncertainty visualization improved drilling accuracy by 24% but increased task time by 76%", "self-tracking … may also increase anxiety"). 좋아졌는지 나빠졌는지는 낱말로 알 수 없어서("reduced time"은 좋고 "reduced accuracy"는 나쁘다), Qwen3-14B가 결과 카드마다 한 번 읽는다(`scripts/gen_valence.py`, 3,958장: better 2,608 · worse 813 · neither 537, 이 가운데 요인이 비교 기준인 것 421). 조건: X는 카드 요인과 직접 0.80 이상(Challenge 기준 그대로), 결과가 질문의 Y가 아니고, 질문의 X 자체가 결함이 아니며("dark patterns"), 카드 요인이 X의 고장이 아니고("subtitle errors", "latency"), 발표가 질문 검색 상위 15위 안에 있을 것. 77개 평가 질문에서 13건이 나왔고 직접 읽어 보니 10건이 맞다(≈77%). 정답 세트 가이드는 이런 발표를 Reframe(measure)로 라벨링했으므로 정답 세트 숫자로는 오답이 된다.

| 80개 질문의 Arc (정류장 7개) | Support | Reframe | Challenge | Challenge가 있는 Arc |
|---|---|---|---|---|
| 전 | 34 | 518 | 4 | 4 |
| 지금 | 34 | 508 | 14 | 11 |

holdout(튜닝에 안 쓴 32문항): Challenge 정답 3개 가운데 2개를 찾고, Challenge로 낸 2개가 모두 맞다(전에는 0/3).

**해 봤지만 넣지 않은 것.** (1) 상위 40개 밖의 발표까지 모두 판정: 77문항에서 Challenge 2개 늘고 질문마다 29초. (2) X를 카드 문구 대신 질문 문장과 결과 문장의 유사도로 맞추기: 0.5까지 내려야 움직이고 새 Challenge 3개가 모두 틀림. (3) 논문 자체 시스템("EarlyArchi")을 X로 인정: 거의 안 바뀜, 조건을 넓히면 같은 Y의 다른 요인(정답 Reframe)이 Support가 됨. Support recall(.19)이 낮은 것은 "eHMI = external display" 같은 분야 지식이 필요한 경우가 대부분이다.

**"Did you submit a paper?" (`mine` 화면).** `{"screen": "mine", "name": "metatla"}` → 그 이름으로 시작하는 CHI 2026 저자와 발표(악센트 무시, 8명까지). `{"screen": "mine", "paper": id}` → 그 논문의 결과로 만든 질문 3개까지. 방향 있는 결과("Does X increase Y?")가 먼저, 그다음 다른 결과("How does X affect Y?"), 그다음 발표 전체 주제. 양쪽 이름은 LLM이 붙인 두 단계 넓은 이름을 쓴다("StepQuest" → "health technology"). 논문·포스터 2,527개 가운데 1,957개가 질문 3개, 나머지도 모두 1개 이상(같은 말이 반복되는 질문을 거르기 전 집계). Arc는 그 질문으로 `arc` 화면을 부르고 `"mine": [저자의 발표 id]`를 주면 자기 발표는 정류장에서 빠진다.

**JS 버그.** 초록에 "𝑛" 같은 확장 문자가 있으면(15개 초록) JS가 문자 위치를 UTF-16 단위로 세어 근거 문장이 한 글자씩 밀렸다. 이제 Python처럼 문자(code point) 단위로 자른다. `start`, `end`, `highlight`도 code point 기준이다.

## Support 재현율과 주제어 Arc의 균형 (11/25 오후)

**결과가 답하는 질문.** 놓친 Support는 대부분 질문은 종류("generative AI")로 묻고 결과는 그 한 사례("EarlyArchi")를 말하는 경우였다. 둘이 같은 것이라는 지식은 LLM에 있지만 LLM은 사용자 질문을 볼 수 없다. 그래서 거꾸로, Qwen3-14B가 방향 있는 결과 카드마다 그 결과가 "예"라고 답하는 참석자 질문을 좁은 것부터 넓은 것까지 3개까지 써 둔다(`scripts/gen_card_questions.py`, 1,627개 발표, GPU 4개 약 11분). 시스템 이름은 종류로 바꿔 쓴다(MindfulAgents는 "multi-agent system", Forage는 "LLM-facilitated search tools"). 폰은 카드로 Support·Challenge가 나오지 않은 발표에서, 사용자 질문과 이 질문들의 cosine이 0.75 이상이고, Y가 MATCH(0.70) 이상, X가 0.40 이상, 방향이 같으면 Support로 둔다. 질문 문장, 그 X·Y는 기존 phrase 표에 들어가서 새 파일은 없다(phrase_vec 9.6 MB에서 12.7 MB).

| 48개 질문 720쌍 | Support precision | Support recall |
|---|---|---|
| 전 | 0.65 (17개 중 11개) | 0.19 (57개 중 11개) |
| 결과가 답하는 질문 | 0.70 (23개 중 16개) | 0.28 (57개 중 16개) |

질문 cosine만 보면 recall은 더 오르지만(test 0.29), "캡션이 소통을 돕나"에 "캡션이 음악 감상을 돕는다"처럼 X나 Y 한쪽이 다른 것이 섞여 test precision이 0.38까지 떨어졌다. X·Y를 따로 확인하니 막혔다. holdout 32문항은 26개 중 1개로 그대로다. "No"라고 답하는 질문(효과 없음)도 함께 만들었지만 Challenge에는 아직 쓰지 않는다.

**팀원 제안(11/25) 가운데 넣은 것.** 주제어로 만든 Arc는 더 좁은 질문 후보 3개 중 세 각도가 가장 많이 채워지는 질문으로 만든다(주제어의 단어를 지키는 후보가 있으면 그중에서). 세부 클러스터 이름 98개를 주제어로 넣어 재면 다음과 같다.

| 주제어 98개의 Arc | Challenge 있음 | Support 있음 | 각도 2종류 이상 |
|---|---|---|---|
| 전 | 9% | 55% | 56% |
| 지금 | 20% | 77% | 78% |

좁힌 질문이 어색한 경우("Does locomotion intention improve sensory conflict?")는 전에도 있었고 균형 선택으로 다른 어색한 질문이 고를 때가 있다. 방향 없는 질문을 줄이려 "효과 없음" 카드가 많아도 방향을 붙이는 방법은 주제어의 단어로 만드는 경로가 먼저 쓰여서 바뀐 것이 없어 넣지 않았다. 방법 문장("We assessed …, measured …, analyzed …")이 결과로 남던 것(230223)은 aim이 되게 고쳤다(결과에서 106개가 더 빠졌다).

## 넓은 질문, 주제어 좁히기, 근거 문구 (11/25 저녁)

**결과가 답하는 질문 2판.** 1판 질문은 좁았다("Does an attention-guiding eHMI improve driver confidence?"). 사용자는 넓게 묻는다("Do external displays on self-driving cars improve pedestrian safety?"). 2판은 카드마다 세 단계로 하나씩 쓴다: 이 연구가 본 그대로(시스템 이름 없이), 그 종류, 분야 밖 사람이 물을 말(요인은 일상어, 결과는 safety, wellbeing, user experience 같은 큰 갈래). 방향 없는 결과(associated)에도 "How does X affect Y?"를 쓰고(`affects`), 이런 질문은 사용자 질문도 방향이 없을 때만 맞춘다. 1판과 2판을 합쳐 쓴다(2,283개 발표). 질문을 해석하다 놓치던 것도 고쳤다: "help everyday users find …"(사람 앞 형용사), "feeling in control"(in control은 장소가 아님), bystanders·pedestrians 같은 사람 단어.

| Support precision / recall | 48개 질문 | holdout 32문항 |
|---|---|---|
| PR #94 (11/25b) | 0.70 / 0.28 | 0.50 / 0.04 (26개 중 1개) |
| 지금 | 0.70 / 0.28 | 0.56 / 0.19 (26개 중 5개) |

기준(cosine 0.75, X 0.40)은 그대로 두었다. 0.70·0.20으로 낮추면 holdout이 0.73 / 0.31이 되지만, holdout을 보고 고른 값이 되므로 쓰지 않았다.

**주제어 좁히기.** 주제어는 이제 그 주제 상위 60개 발표의 "결과가 답하는 질문" 가운데 가장 많은 발표가 함께 받치는 질문(cosine 0.75, 같은 방향, 서로 다른 발표 2개 이상)으로 좁힌다. 입력과 cosine 0.40 이상, 12단어 이하, 방향 있는 질문만 쓴다(팀 제안 2번). "chatbots and mental health", "AI for learning"처럼 두 가지를 이어 쓰면 그 말 그대로 "Do chatbots improve mental health?"를 먼저 제안한다. 후보가 없으면 예전 방식으로 만든다.

| 주제어 98개의 Arc | Challenge 있음 | Support 있음 | 각도 2종류 이상 | 방향 있는 질문 |
|---|---|---|---|---|
| PR #94 | 20% | 77% | 78% | 76% |
| 지금 | 20% | 88% | 94% | 78% |

예: Autonomous Driving은 "Do interacting with autonomous systems reduce cooperative driving behavior?"에서 "Do external displays on self-driving cars improve trust?"로, Educational Gaming은 "How do grief and domestic disruptions affect gaming?"에서 "Do educational games improve learning?"으로 바뀌었다. 바뀐 38개 가운데 8개쯤은 오히려 좁아졌다("Does a nose-mounted speech interface improve speech quality?").

**근거 문구.** Qwen3-14B가 카드마다 결과를 한 문장으로 써 둔다(`scripts/gen_card_summary.py`, 11,296장). 화면의 why 문장은 각도의 뜻 + 그 문장이다("A different factor behind your outcome. Higher frequency of use increases presence in social virtual reality."). 결과가 답하는 질문으로 Support가 된 발표는 "Answers yes to “Do AI design tools improve creativity?” …"로 그 질문을 보여 준다. 카드가 없는 발표는 각도의 뜻만 쓴다(전에는 "Looks at  from another side."처럼 비었다).

패키지는 zip 23.9 MB에서 28.6 MB로 늘었다(phrase 120,376개). Python·JavaScript 일치 266/266, Arc 80/80, 검색 42/42, 앵글 39/40.

## 다시 만들기

```bash
sbatch scripts/gen_findings.slurm                     # 결과 카드 (Qwen3-14B, GPU 4개 약 30분)
python scripts/build_angles.py                         # 원문 확인, offsets, 종족, 데뷔
sbatch scripts/gen_concepts.slurm                      # 일반어 (약 15분)
CHI_TASK=claims sbatch scripts/gen_concepts.slurm      # 질문 말투 claim (약 12분)
sbatch scripts/gen_valence.slurm                       # 결과가 좋아졌나 나빠졌나 (GPU 4개 약 4분)
sbatch scripts/gen_card_questions.slurm                # 결과가 답하는 질문 (GPU 4개 약 30분, valence 다음; 1판은 cardq_raw에 합쳐 둠)
sbatch scripts/gen_card_summary.slurm                  # why 문장: 카드마다 결과 한 문장 (GPU 4개 약 8분)
python scripts/build_angles.py                         # 일반어까지 합쳐 다시
python scripts/eval_angles.py                          # docs/angle_eval.json (--sweep: 임계값 탐색)
sbatch scripts/compare_llm.slurm && python scripts/compare_llm_report.py   # 일반 LLM과 비교 (GPU 7개 약 15분)
python scripts/package_model.py
python tests/run_angle_cases.py                        # 40개 사례
python tests/web_reference.py && node tests/run_web_parity.mjs   # JavaScript가 Python과 같은지 (266개)
```
