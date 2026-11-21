# ARC 화면 API — 와이어프레임과 모델 출력 맞추기

기준 디자인: Figma "ARC Mobile Wireframes" → 페이지 **피드백 반영본** (화면 19개, 메모 4개).
Figma는 읽기만 했고 수정하지 않았다.

모델 쪽 구현: `src/package/arc.py` (패키지에서는 `dist/chi2026-retriever/arc.py`).
화면마다 요청 하나를 보내면, 그 화면에 그릴 값이 JSON으로 돌아온다. 인터넷과 서버 없이 CPU에서 동작한다.

```bash
python arc.py '{"screen": "route", "day": "tue", "profile": {"research": "haptic feedback for VR", "pace": 3}}'
```

## 원칙

- **앱이 상태를 들고 있고, 모델은 상태를 저장하지 않는다.**
  - 온보딩 답변은 `profile`, 사용자 행동은 `state`에 담는다.
  - 앱이 둘을 폰에 저장해 두었다가 요청마다 같이 보낸다.
  - 와이어프레임 문구 "No account. Your answers stay on this phone."과 같은 구조다.
- **추천 계산은 기존 모델 그대로 쓴다.**
  - 문장 → 34MB 학생 인코더 → 의미 유사도 + BM25 단어 점수로 순위를 매긴다.
  - ARC가 그 위에 화면별 가공을 더한다: 키워드, 루트, 겹침, 사람, 비슷한 발표 등.
- **화면에 들어갈 문구 일부는 모델이 완성해서 준다.**
  - 예: `"Why · the abstract shares …"`, `"Shares privacy · 3 talks"`, `"Next · Wed ~15:30 poster session"`
  - 앱은 그대로 표시하거나, 구조화된 필드로 직접 만들어도 된다.
- **잘못된 입력에는 오류를 돌려준다.**
  - 출력: `{"error": "..."}`, 종료 코드 2
  - 예: 학회 기간이 아닌 날짜, 강도 7, 없는 발표 id

### profile (온보딩 01–02에서 모은 값)

| 필드 | 화면 | 예 | 기본값 |
|---|---|---|---|
| `research` | 01-1 | `"I study haptic feedback for VR"` | (필수, 영어) |
| `keywords` | 01-2 켜 둔 칩 | `["haptic feedback", "VR"]` | 문장에서 자동 추출 |
| `topics` | 01-2 Related, 01-3에서 고른 것 | `["Haptics + XR"]` | 없음 |
| `days` | 02-1 | `["tue", "wed"]` (`2026-04-14`, `04-14`도 됨) | 전체 |
| `tracks` | 02-2 | `["Papers", "Posters", "Demos"]` | 이 3개 (Figma 기본 체크와 같음) |
| `language` | 02-3 | `"en"` | `"en"` (모델은 그대로 돌려줌) |
| `step_free` | 02-4 | `true` | `false` |
| `pace` | 02-5 | `3` | 3 |

### state (앱을 쓰면서 쌓이는 값)

`saved`, `attended`, `removed`는 발표 id 목록이다.
`added`는 id 목록이고, 어디서 추가했는지 남기려면 `{"id": …, "from": "Author Name"}` 형식으로 넣는다.
`opened_authors`는 열어 본 저자 이름 목록이다.

## 화면별 대응

| 화면 | `screen` | 주요 입력 | Figma 요소 → 출력 필드 |
|---|---|---|---|
| 01-0 시작, 02-2·02-3·02-5, 03-1 스폰서 | `meta` | 없음 | 날짜 → `days[].label`<br>트랙과 개수 → `tracks[]`<br>강도 정의 → `pace[]`<br>스폰서 캐러셀 → `sponsors[]` (등급순, 로고 URL) |
| 01-2 Keywords | `keywords` | `research` | 문장 속 밑줄 → `keywords[].start/end` (문자 위치)<br>Your topics 칩 → `keywords[].keyword`<br>Related 칩 → `related[].topic` |
| 01-3 Nearby topics | `nearby` | `profile` | Close to your research → `adjacent[]` (`field`, `why`: "Shares X · n talks", `suggested`)<br>Sessions on these topics → `sessions[]`<br>More topics → `more_topics` |
| 02-1 Days | `days` | `profile` | "[n] talks for you" → `days[].talks_for_you`<br>Day theme → `theme` (데이터에 없어서 null. Figma 메모대로 줄을 숨긴다) |
| 03-1 Loading | `route` 결과 | — | "Matching [n] talks" → `matched_talks`<br>"Found [n] related talks" → `related_talks` |
| 03 Today · Route | `route` | `profile`, `day`, `state`, `now`(선택), `filters`(선택) | 제목과 부제 → `title`, `subtitle`<br>시간순 카드 → `stops[]`<br>Leave now 배너 → `next` |
| 03-2 More for today | `more` | `profile`, `day`, `state` | More picks → `picks[]` (`line`: "~14:00 · Room C · overlaps your route")<br>People to meet → `people[]` (이름, 기관, 나라, 이니셜, "2 shared topics", 다음 발표) |
| 04 Filters | `filters` | `institution_query`, `filters` | CMU → `institutions[0]` = Carnegie Mellon University · matches "CMU"<br>다른 후보 → `institutions[1..]`<br>Topic, Country, Track 칩 → `topics`, `countries`, `tracks`<br>두 버튼의 [n] → `counts` |
| 05 Search | `search` | `q`, `by`(`institution`/`day`/`field`) | 탭 숫자 → `tabs`<br>결과 줄 → `papers[].line` ("이름 · 기관 · 요일")<br>People, Sessions 탭 → `people[]`, `sessions[]` |
| 06 Paper detail | `paper` | `id`, `profile`(선택), `from_room`(선택) | 시간 → `when` ("Tue 14 · ~11:24–11:36 (est.)")<br>장소 → `where` ("Room · Talk 3 of 7 in “Session”")<br>기관 → `institutions`<br>Why recommended → `why.text`<br>Similar talks → `similar[]`<br>DOI → `doi`<br>Directions → `directions` |
| 07 Author profile | `author` | `name`, `profile`(선택) | 이니셜 아바타 → `initials`<br>Overlaps → `overlaps.shared/theirs`<br>Where to find → `where[]` (발표, 포스터, 세션 좌장)<br>Papers → `papers[]`<br>Similar researchers → `similar[]` |
| 08 Day wrap-up | `wrapup` | `profile`, `day`, `state` | 숫자 3개 → `counts`<br>Mostly about → `mostly_about`<br>클러스터 버블 → `clusters[]` (`new: true`가 제안 주제)<br>저장한 논문 → `papers[]`<br>저자 → `authors[].next`<br>FOR TOMORROW → `for_tomorrow` |
| 09 Getting there | `getting_there` | `from_room`, `to_room`, `step_free` | "about 2–4 min" → `minutes`<br>Level 이동 → `from_level/to_level`, `via`<br>평면도 → `floor_plans[].map`<br>핀 → `pins`<br>Step by step → `steps` (보류라 null) |

`stops[]` 카드 하나에는 다음이 들어 있다.

| 필드 | Figma 요소 |
|---|---|
| `time` | "~09:12" |
| `badge` | PAPER, POSTER, DEMO |
| `live_label` | "See it live · no video" |
| `open_minutes` | 포스터 "Open 90 min" |
| `title`, `room`, `session`, `talk_order` | 제목, 방, 세션, "Talk 3 of 7" |
| `why.text` | "Why · the abstract shares …" |
| `walk_to_next` | 이동 칩: "about 4–6 min", "elevator to Level P0" |
| `kind` | `pick`, `wildcard`, `added` 중 하나 |
| `wildcard.path` | You → Bridge → New area |
| `added_from` | "added from [Author]" |

`overlaps[]`는 Figma의 "You added … It overlaps …. Keep one." 블록이다.
선택지 두 개(`options`, 영상이 있으면 "has video, OK to miss")와 "Or the same topic at ~16:00" 대안(`alternative`)이 들어 있다.

## 정한 규칙 (팀 확인 필요)

| 항목 | 정한 값 | 근거 |
|---|---|---|
| 발표 시각 추정 | 세션 시작 + 앞 발표 길이 합<br>(논문 12분, 저널 15분, 세션 안 순서는 데이터의 순서) | Figma 메모 "세션 시작 + 12분 × 순서"와 같다. 논문 세션 238개 중 200개가 90분에 7편, 37개가 6편 |
| 02-5 하루 강도 | 1단계 3개 / 2단계 4개 / 3단계 6개 / 4단계 8개 / 5단계 10개<br>발표 사이 여유: 30 / 20 / 10 / 5 / 0분 | Figma에 "검토 · 강도 정의 필요"로 표시된 부분이다. 3단계 6개는 03 화면의 "6 stops"와 맞췄다 |
| 포스터와 데모 | 열려 있는 90분 안에서 20분 머무는 것으로 계산 | 03의 "Open 90 min" |
| 걸어서 이동 | 같은 방 0분, 같은 층 2–4분, 다른 층 4–6분 | 평면도에 좌표가 없어 층 단위로만 추정한다. 09의 "about 2–4 min" 형식 |
| "talks for you" | 고른 트랙 안에서 관련도 상위 120편 | 02-1, 03-1의 숫자 |
| 의외의 1편 (wildcard) | 사용자 키워드를 하나 이상 공유하지만, 사용자의 상위 주제(세션)에는 없는 발표 중 가장 관련 높은 것 | 03 "one step from your field" |
| 주제 | 논문이 발표되는 세션 이름(238개)을 주제로 쓴다. 포스터·데모는 가장 가까운 주제로 묶는다 | Figma 메모 "keywords 필드는 거의 비어 있어 sessions.name으로 주제를 만듦" |
| 추가한 발표 | 이미 짠 루트는 그대로 두고 위에 얹는다. 겹치면 "Keep one"으로 보여 준다 | 03 화면 |

## 디자인과 어긋나는 점 (디자인 팀에 공유할 것)

1. **01-1 "Any language works."** (10/24 회의: 입력은 영어로 정함, 다국어는 나중에 검토)
   - 모델은 영어만 이해한다. 한국어 등을 넣으면 경고(`warnings`)가 나오고 결과가 엉뚱해진다.
   - 문구를 바꾸거나, 앱에서 입력을 영어로 번역한 뒤 보내야 한다.
2. **"CHI 2027" 표기**
   - 지금 데이터와 모델은 CHI 2026(4월 13–17일, 바르셀로나) 기준이다.
   - 날짜·요일 라벨은 `meta.days`를 쓰면 데이터에 맞게 나온다.
3. **02-1 날짜별 테마**
   - 데이터에 없다. `theme: null`로 오고, Figma 메모대로 줄을 숨기면 된다.
   - 대신 그날 가장 많은 주제를 `top_topic`으로 준다.
4. **02-4 선택지 "Step-Free" / "Wheel Chair"** (10/24 회의: 휠체어에 "계단을 쓸 수 없는 모든 경우" 설명을 붙이기로 함)
   - 둘 다 계단 없는 길을 뜻해서, 모델에는 `step_free: true` 하나로 들어간다.
   - 다친 사람처럼 휠체어가 아니어도 계단을 못 쓰는 경우가 있어서, 질문은 예/아니오 하나면 충분하다.
5. **06 AI summary, Key concepts, Ask ARC**
   - 사용자 언어로 요약하거나 질문에 답하려면 LLM이 필요해서 이 모델 범위 밖이다.
   - `summary.text`는 null로 오고, 원문 초록(`abstract`)을 준다. Key concepts는 Figma에서도 보류다.
6. **08 "Bigger means more time spent"**
   - 모델은 머문 시간을 모른다. 저장하거나 참석한 발표 수로 크기를 정한다.
7. **09 평면도 핀**
   - 데이터에는 층별 평면도 이미지(`floor_plans[].map`)만 있고 방 좌표가 없다.
   - 그래서 핀을 그림 위에 정확히 찍을 수 없다. 좌표를 따로 만들거나, 방 이름만 보여 줘야 한다.
   - Step by step은 Figma에서도 보류다.
8. **03 출발 알림 (검토)**
   - 앱이 현재 시각을 `now`로 보내면, 모델이 `next`(언제 출발할지, 몇 분 걸리는지)를 계산한다.
   - 알림을 띄우는 일 자체는 앱이 한다.
9. **02-2 트랙에 없는 종류**
   - 밋업(32), 멘토링(40), 시상(5)은 고를 수 있는 트랙이 없어서 루트에 들어가지 않는다.
   - 검색(05)에서는 나온다.
   - Journals(36)는 Papers에, Student Research Competition(12)은 Posters에 묶었다.

## 검증

`python tests/run_arc_cases.py` → **39/39 통과** (화면 29개 케이스 + 잘못된 입력 10개).
결과 원본은 `tests/arc_results.json`에 있다.

자동으로 확인하는 항목:
- 루트의 발표 수가 하루 강도를 넘지 않는다.
- 발표가 시간순이고, 걷는 시간을 포함해도 겹치지 않는다.
- 모든 카드에 추천 이유가 있다.
- 의외의 1편은 최대 1개다.
- 고른 트랙만 들어가고, 뺀 발표는 다시 나오지 않는다.
- 키워드의 문자 위치가 문장과 맞는다.
- CMU를 넣으면 Carnegie Mellon University가 첫 줄이다.
- 비슷한 발표 3개에 자기 자신이 없다.
- 하루 마무리의 숫자가 `state`와 같다.

속도: 화면당 0.3–384ms (`author`가 가장 느리다. 처음 한 번 저자 벡터를 만드는 시간이다).
모델 로드는 약 1.2초 걸린다.

## v2 제안안 (Figma "v2 제안안 · 10/23 회의") 대응

10/22에 Figma에 v2 페이지가 새로 생겨서 다시 맞췄다. 화면 35개 중 O-1~O-4와 O-2 · Few matches 5개는 아직 빈 틀이라 내용을 알 수 없다. 기존 필드는 그대로 두고 v2 필드를 더했기 때문에 피드백 반영본 기준으로 만든 코드도 그대로 돈다.

| v2 화면 | 요청 | 새로 나오는 것 |
|---|---|---|
| 03 Your day · Next / Up first / Leave now / Now | `route` + `now` | `now_card` (`state`: FIRST STOP, NEXT, LEAVE NOW, NOW · `label` · `title` · `line` 예 "Starts in ~9 min · 4–6 min walk from the entrance · step-free" · `buttons`) |
| 03 Your day 목록 | `route` | `rows` (화면의 한 줄: 시간, 배지, 제목), `progress.label` "Tue route · 1 of 6 done", `more_for_today.label` "[n] picks fit your free time" |
| BRIDGE 행 | `route` | 의외의 1편 배지를 `BRIDGE`로 바꿈 |
| 03 · Same time (2 TALKS) | `route` | 비슷하게 좋은 발표 두 개가 같은 시간이면 모델이 하나를 고르지 않고 `rows[].choice`로 둘 다 보여 준다. "Pick one. The other moves to More picks." 고르지 않은 쪽은 `state.declined`로 보내면 More picks로 간다 |
| 03 · Row actions / Removed | `route` + `state.removed` | 뺀 발표 자리를 `gaps[]` "Free 11:15–11:43 · Fill from picks"로 남기고 나머지 루트는 그대로 둔다 (다른 발표로 다시 채우지 않음) |
| 03 · Other day | `route` + 다른 날 `now` | `state: "preview"`, `progress.label` "Wed route · preview" |
| 03 Your day · Day done | `route` + 하루 끝 `now` | `state: "day_done"`, `day_done.title` "Your Tuesday is done", `day_done.next_day.text` "Wed route is ready · 6 stops · first one ~11:00" |
| 03 · No plan yet / Not attending | `route` | `state: "no_plan"` / `"not_attending"`와 `empty` (제목, 본문, 버튼) |
| 03-2 More for you (· Free time) | `more` (+ `gap`) | 빈 시간에 들어가는 발표만, 발표마다 `fits` "Fits 16:10–16:40". 루트와 겹치는 발표는 빠진다 |
| 03-2 · Nothing fits | `more` | `state: "nothing_fits"`, "No more picks fit Tue", 버튼 "See Wed picks" |
| 10 Session live · arrived late | `session_live` (`id` 또는 `session_id` 또는 `room`, `now`) | "Talk 4 of 7 · about 3 min in", 7칸 진행 표시, 지금 발표, 앞 발표, Up next, "Session start + 12 min per talk. Speakers can run late." |
| 05 Explore / No results | `search` (+ `filters`: institutions, countries, days, tracks, topics) | 개인화하지 않음("Search everything at CHI. Not ranked for you."), "Filters · 2", 결과 없으면 `state: "no_results"` |
| 11 Ask ARC 안의 길 안내 | `getting_there` (`from_room: "registration desk"`) | 등록 데스크·입구는 Entrance Hall로 본다 |
| 08 Day wrap-up | `wrapup` | 버튼 "Add a bridge pick to Wed" |
| keywords / days / route | | `relevance` (`top_similarity`, `low`, `few_matches`): O-2 · Few matches가 채워지면 쓸 값 |

모델 범위 밖 (LLM이나 공유 서버가 필요): 10의 한 줄 요약을 영어 말고 사용자 언어로 보여 주는 것(영어 한 줄 요약과 "Prepare a question"용 질문 2개는 11/7부터 LLM이 미리 써 둔 `summaries.json`으로 `paper`·`session_live`에 들어간다), 11 Ask ARC 대화와 질문 다듬기, 12a 실시간 통역, 13 Meetups(인원수를 여러 사람이 공유하려면 서버가 필요해서 "서버 없이 오프라인"과 부딪힌다), 03 · Offline 배너(앱이 저장해 둔 루트를 보여 주면 된다).

검증: `python tests/run_arc_cases.py` → 54/54 (v2 상태·화면 14개와 오류 2개 추가). 패키지 `arc_examples/`에 v2 예시 14쌍(`v2_*.json`)을 넣었다.

## 10/24 회의 반영

Figma 구조가 바뀌었다. v2 화면들은 이제 "피드백 반영본" 페이지 안의 오른쪽 섹션(1 · 처음 온 참가자의 하루, 2 · 하루 중에 들어가는 화면, 3 · 상태와 예외)으로 옮겨졌고, "v2 제안안" 페이지는 "피드백 반영본 2"라는 빈 페이지가 되었다. 화면 이름과 내용은 그대로라서 위 대응표가 그대로 맞는다.

| 회의에서 정한 것 | 요청 | 나오는 것 |
|---|---|---|
| 입력은 연구 질문 하나 (기관·나라는 받지 않고, 앱이 결과를 받아서 거른다) | `route` (`profile.research`만) | 하루 추천 상위 16개 `recommendations[]` (`rank`, `score`, `status`, `stop`, `institutions`, `countries`). `retriever.py` 결과에도 `institutions`, `countries`를 붙였다 |
| 겹치는 일정은 따로 던지지 않고 노드 아래 서브 노드로 | `route` | `stops[n].alternatives[]`: 상위 16개 중 루트에 못 들어간 발표가 시간이 겹치는 정류장 아래에 달린다 (`reason` "same time as stop 2", `overlap_min`, `swap.replaces`). `rows[].alternative_ids`. 겹치지 않는 나머지는 `status: "fits_free_time"`(03-2) |
| 1등부터 채우는 방식의 한계 (2·3등을 함께 놓침) | `route` + `"planner": "best"` | 하루 점수 합이 가장 큰 조합. 기본은 그대로 `greedy`. 비교는 `docs/planner_report.json` |
| 주제별·키워드별 클러스터 (08 하루 마무리 버블, 보류 중인 학회 지형도) | `clusters` (+ `cluster`, `profile`, `state`) | 전체 프로그램 20개 주제 클러스터: 이름, 설명, 키워드(키워드별 발표 id), 크기, `map` x/y, 내 연구와 가까운 순서, `yours`(담기·참석 수). `wrapup.clusters` 버블도 이 클러스터로 바꿨다 |
| 로딩 화면 | | 모델은 화면 하나에 0.2초 안팎이라 기다림은 앱에서 일부러 1–3초 둔다 |

검증: `python tests/run_arc_cases.py` → 62개 (10/24 반영 6개, 오류 2개 추가).


## 11/7 회의 반영

| 회의에서 정한 것 | 요청 | 나오는 것 |
|---|---|---|
| 겹치는 시간대는 1순위 말고 2·3순위도 옆(사이드 UI)에서 보이게 | `route` | 정류장마다 `options[]`: 1순위는 정류장 자신(`current: true`), 2·3순위는 그 시간을 두고 다투는 발표(같은 시간이거나 쉬는 시간·걷는 시간이 안 남는 발표) 중 그 정류장과 바꾸면 들어가는 것, 점수 순. `swap.replaces`. `rows[].option_ids` |
| 그레이딩 방식 점수 | `route`, `browse`, `plan` | 발표마다 `grade: {letter, points}`. 그날 가장 잘 맞는 발표 점수 대비 90% 이상 A, 80% 이상 B, 70% 이상 C, 그 아래 D. `points`는 그 비율(%). 기준은 응답의 `grading`에 같이 나간다 |
| 처음 시작은 추천만이 아니라 골라담기 또는 추천 | `start` | `modes`: "Pick talks myself"(→ `browse`) / "Get recommendations"(→ `keywords`). 골라담기도 맨땅에서 시작하지 않게 진열대 `shelves`: 주제 20개(세부 주제 수, 예시 제목), 키노트, 데모, 사람·학교 찾기(→ `search`). 연구 질문이 있으면 "For your research", 담은 게 있으면 "Like the talks you picked"가 맨 앞에 온다 |
| 골라담을 것도 추천해 줘야 | `browse` (`shelf`: `for_you`, `similar`, `topics`, `topic:c14`, `topic:c14.2`, `keynotes`, `demos`, `posters`, `workshops`, `panels`, `day:wed`, `top_k`, `offset`) | 진열대 하나를 페이지로. 연구 질문이 있으면 그것으로, 없고 담은 게 있으면 담은 발표들의 평균 벡터로 순위와 등급을 매긴다. 둘 다 없으면 개인화하지 않는다. 발표마다 `in_cart` |
| 골라담은 걸 AI가 루트·일정으로 정리 | `plan` (`state.cart`: 담은 id, `day` 선택) | 날짜별로 예상 시각 순 정류장, 정류장 사이 걷는 시간, 시간이 부딪히는 담은 발표는 그 정류장의 `options` 2·3순위(더 잘 맞는 것이 1순위), 빈 시간 `free`와 거기 들어가는 발표 `fill`, 담은 것과 비슷한 발표 `similar`. 여러 날 열리는 발표는 담은 게 많은 날로 모은다. 담은 발표 사이에는 걷는 시간만 둔다(사용자가 고른 것이라 쉬는 시간을 따로 두지 않음) |
| 클러스터는 큰 주제에서 시작해 좁혀 가며 추천 논문의 위치를 보여 주기 (LM 위키와 다름) | `clusters` (+ `cluster`: `c14` 또는 세부 주제 `c14.2`) | 주제 20개마다 세부 주제 3–5개(모두 79개, 이름·설명은 LLM). 연구 질문이 있으면 주제·세부 주제마다 `recommended`(내 상위 30개 중 몇 개), `where`(상위 5개의 [주제, 세부 주제] 경로). 상세에는 `subtopics`와 `path` |
| 온디바이스 경량 모델, 서버 결과와 비교한 평가 노트 | | `docs/ondevice_eval.md`. 질문 인코더 34 MB → 8 MB(트랜스포머 없음), 논문 벡터 1,024차원 float32 → 128차원 int8, 같은 모델을 폰 브라우저에서 돌리는 JavaScript(`web/`) |

김동찬이 보낼 클러스터 세부 사항이 오면 `clusters`를 거기에 맞춘다. 드래그앤드롭으로 시간을 넣고 빼는 것은 앱이 `state.added` / `state.removed`(추천 모드) 또는 `state.cart`(골라담기 모드)를 바꿔서 다시 요청하면 된다.

검증: `python tests/run_arc_cases.py` → 75개 (11/7 반영 10개, 오류 3개 추가). `node tests/run_web_parity.mjs --encoder` → 150개 모두 Python과 같은 답.

## v3 리뷰 반영본 (Figma "v3 · 리뷰 반영 (11/09)", 화면 52개) 대응

Figma는 읽기만 했다. v3에서 바뀐 문구와 구조에 모델 출력을 맞췄다.

| v3 화면 | 요청 | 맞춘 것 |
|---|---|---|
| O-5c How full | `profile.pace` | 하루 강도 3단계: `light` 하루 4개, `balanced` 6개(기본), `full` 8개 (숫자 1–3도 받음). `meta.pace[].line` "About 6 stops a day" |
| O-4 What would make CHI easier? | `profile.needs` | `step_free`(계단 없는 길), `fewer_room_changes`(다른 층으로 옮기는 발표는 8% 낮게 쳐서 같은 층 위주로), `breaks`(발표 사이 쉬는 시간 +10분)는 루트에 반영. `larger_text`, `summaries`는 앱 쪽. `meta.needs` |
| O-5a Edit · What to see | `meta.tracks[].registration_needed` | Workshops는 따로 등록이 필요하다고 표시 |
| 03-1 Building your day | `route.building.steps` | "Read your research", "Found 120 talks for you", "Checking rooms and step-free paths" |
| 03-A–D 지금 카드 | `route.now_card` | `badge` FIRST STOP / NEXT / LEAVE NOW / NOW, `label` "~10:30 · Poster area", `line` "2–4 min walk", 첫 정류장은 "4–6 min from Registration", LEAVE NOW는 "Starts in ~8 min · 2–4 min walk". NOW는 `label` "Talk 3 of 7 · ~4 min in", `line` "You missed 2 earlier talks", 버튼 "Catch up", "Question" |
| 03 하루 목록 | `route.title`, `progress.label`, `rows` | "Your Tuesday", "Your Tuesday · 1 of 6", 배지 TRY NEW(예전 BRIDGE), PICK ONE "Pick one of 2 talks"(예전 2 TALKS) |
| 03-H Pick one | `rows[].choice.options` | "[Room C] · Only here now" / "[Room D] · Can catch later"(영상이 있거나 뒤에 다시 열리면), 버튼 "Choose" |
| 03-I Removed | `route.gaps` | "Free 15:30–16:10", "Fill", 토스트 "Removed [제목]", "Undo" |
| 03-E Day done | `route.day_done` | `badge` DONE, "Your Tuesday is done", "6 of 6 stops · 5 talks saved", "See your day", 다음 날 "Your Wednesday is ready" |
| 03-J / 03-K | `route.empty` | "No plan yet" + "Plan my days", "Explore" / "You're not at CHI on Mon 13" + "Add this day" |
| 03-2 More for you | `more` | "Fits your free time on Tue", 발표마다 `label` "PAPER · ~14:00", "+ Add", 토스트 "Added [제목] at 14:00". 없을 때 "Nothing else fits Tue" + "See Wed" |
| 10 Catch up | `session_live` | `header` "Catch up", `title` "[세션] · [방]", "Talk 3 of 7 · ~4 min in", 지금 발표와 놓친 발표마다 한 줄 요약(영어), 버튼 "Prepare a question" |
| 11 Questions | `questions` (`id`) **새 화면** | "Ask in English", "For · [제목]", 미리 써 둔 영어 질문 2개(`show_large`는 따옴표 붙인 큰 글씨용). 사용자가 자기 언어로 쓴 질문을 영어로 바꾸는 건 LLM이라 앱 쪽 |
| 05 Explore / 04 Filters / No results | `search` | `header` "Search talks, people, topics", 탭 `talks`/`people`/`sessions`(예전 `papers`), 결과마다 `label` "PAPER · Tue", "+ Add", 필터 버튼 "Show 12 results", 없을 때 "No matches" + "Clear filters" |
| 06 Talk detail | `paper` | `authors_line` "A, B +3", `when` "Tue 14 · ~11:36 · P1 - Room 119", `availability` "Only here now · no video"(또는 "Can catch later · has video", "Can catch later · also Thu ~10:00"), `why.text` "Shares haptics with your research.", `summary.label` "Summary · AI, from the abstract", 버튼 "Question", "Add to my day" |
| 07 Author | `author` | `line` "[기관] · [나라]", `their_talks` "Tue · ~11:36 · [방]" + "+ Add", `note` "They may not be at every session.", 버튼 "Prepare a question" |
| 09 Getting there | `getting_there` | `header`, `from_label` "From [Room A]", `headline` "2–4 min", `to_line` "to [Room B] · Level P1 · step-free", 버튼 "I'm here". 1·2·3 단계 길 안내(`steps`)는 방 좌표가 없어서 아직 비워 둔다 |
| 09-1 Where are you now | `places` (`last_room`, `q`) **새 화면** | 마지막 정류장("Your last stop"), "Registration"(Entrance Hall), 그다음 방들을 층 순서로. `q`로 찾기 |
| 08 Day wrap-up | `wrapup` | "For tomorrow · Try one talk in [새 분야] on Wed?", 버튼 "No thanks", "Add to Wed". `people_to_find`: 오늘 열어본 저자 중 내일 발표하는 사람 "Wed · ~15:30 · Poster area" |

디자인 팀에 같이 확인할 것:

- **날짜:** Figma는 Mon 10–Fri 14, 데이터는 CHI 2026(4월 13–17일)이다.
- **장소 이름:** 09-1의 "West Atrium · Level 3", "Westin connector · Level 3"는 데이터에 없는 장소다. 모델은 데이터의 방 이름을 준다.
- **18 About:** "Sent, not stored: Your research sentence and questions"라고 적혀 있다. 그런데 이제 추천 모델은 폰 안에서 돌아서 연구 문장이 어디로도 나가지 않는다. 질문을 영어로 바꾸는 LLM을 서버에 둘 때만 질문이 나간다.
- **16 Plan link:** 계획 링크는 `profile`과 `state`만 담으면 된다. 모델이 아무것도 저장하지 않아서 그것만으로 같은 화면이 다시 나온다.
- **03-M Programme changed:** 앱이 저장해 둔 계획과 새 프로그램 데이터를 비교해서 띄우는 것이라 모델 쪽 일은 없다.
- **11/7에 만든 기능:** 골라담기 시작(`start`, `browse`, `plan`), 등급과 2·3순위(`grade`, `options`)는 v3 화면에는 없지만 API에는 그대로 있다. v3의 "Just browse"에서 Explore로 가서 "+ Add"로 담는 흐름에는 `search`와 `plan`(`state.cart`)을 쓰면 된다.

검증: `python tests/run_arc_cases.py` → 80개 (v3 반영 4개, 오류 1개 추가, pace 값을 light/balanced/full로 바꿈). `node tests/run_web_parity.mjs --encoder` → 155개 모두 Python과 같은 답.
