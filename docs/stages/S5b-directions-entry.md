# S5b 길 안내 진입점

브랜치 `stage/S5b-directions-entry` (main의 S5 머지 `c5c5c54`에서)

## 왜
S5의 09는 Today 맨 위 카드에서만 열렸다. 이 카드는 실제 오늘이 학회 날일 때만 나온다(`Today.tsx` `live`). 그래서 직접 만든 계획(실제 시계)으로는 2027년 5월 전까지 길 안내를 볼 길이 없었다. 발표가 아닌 곳(방, Registration, 화장실, 엘리베이터)으로 가는 길 안내도 없었다.

## ① 만든 것
- 진입점
  - 하루 목록: 모든 정차의 ⋯에 Directions. 어느 날이든, 출발점은 앞 정차, 첫 정차는 Registration
  - 06 발표: 방 줄 아래 Directions
  - 05 검색
    - 발표 줄마다 Directions(위치 아이콘, 44 px)
    - 방 번호·시설("127", "toilet", "restroom", "lift", "Registration")은 결과 위에 Rooms and places 줄 + Directions
- 장소로 여는 09: `#/directions/place/<id>[/from]`
  - id: 프로그램 방 키 · `registration` · `wc` · `elevator`
  - `wc`·`elevator`는 평면도의 그 종류 모두가 후보이고, 출발점에서 가장 빨리 가는 것을 고름. 엘리베이터는 번호로 부름("Elevator 3")
  - 출발점: 학회 날이고 계획이 있으면(샘플 하루는 데모 시계) 지금 있는 정차의 방(발표 중이면 그 방, 사이면 방금 끝난 방), 그 외 Registration. Change로 바꿈. 없는·깨진·빈 장소 id는 "No such place on the venue plan."
- `app/src/venue/places.js`(node·폰 공용)
  - `placeTargets`: 장소 id → 목적지 후보
  - `routeToNearest`: 후보 중 가장 빠른 경로
  - `searchPlaces`: 05 검색용
- `route()`가 구역뿐 아니라 평면도의 지점(`P1/wc2` 같은 화장실·엘리베이터)도 출발·도착으로 받음
- 문구
  - "pass …"에는 평면도 내부 복도 이름(예: "Foyer 0" = 지금 걷는 P0 concourse)을 쓰지 않음(전체 경로 중 81줄이었음). 다음 후보가 없으면 "pass"를 뺌
  - "1–1 min" → "1 min"(`card.js` `minutesText`, 09와 Today 카드가 같이 씀)

## ② 통과 기준 결과
- `tests/venue/entry-check.mjs`(헤드리스, 직접 만든 계획, 실제 시계 = 학회 날 아님, Today 맨 위 카드 없음): 구현 전 4개 실패 → 통과
  - 하루 목록 두 번째 정차 → 09 "From Room 130 · to Room 134"
  - 첫 정차 → "From Registration"
  - 06 → 09
  - 05 발표 줄 → 09 · "127" → 장소 키 09 "to Room 127 · P1" · "toilet" → "to WC"
- `directions-check.mjs`에 장소 키 09 추가: wc "to WC · P0" … "WC on your left"(3D 그림) / 방 키 / registration "You are already there" / 없는 장소. 전체 통과, CPU 4배 p95 16.7 ms
- `tests/venue/places.test.mjs`
  - WC에서 끝나는 경로 문장
  - 장소 id 4종
  - 가장 가까운 WC가 모든 WC 중 가장 빠름
  - step-free 엘리베이터는 같은 층
  - 검색어("virtual reality"는 장소 없음)
- 모든 경로에서 복도 이름을 "pass"하지 않음(테스트 먼저 실패 → 통과). "pass"가 남은 줄은 1,000개 이상
- `npm test` 105/105 · `contracts:check` 5/5 · `tsc` 0 · `data:venue:check` 7개 층·방 43개 · revision-check 통과 · explore qa·offline·phone 확인 통과(CMU 검색 63 ms) · 첫 화면 JS gzip 110.0 KB(S5 109.0), 3D 조각 151.9 KB

- 교차 검토(결론을 모르는 새 에이전트, 재현한 것만) 6건 + 약한 확인 2개 모두 고침, 각각 실패하는 테스트 먼저:
  - 가장 가까운 WC·엘리베이터: 초 단위로 비교, 같으면 출발 층, 그다음 거리. 모든 방 156건 집계 전: 더 느린 쪽 32 · 같은 층 후보를 두고 다른 층 32 → 후: 0 · 0
  - 장소 검색: 여러 단어("Room 127", "Entrance Hall"), 3글자 이상(시설 말은 짧아도), 숫자는 통째로, 한 구역은 한 줄("Exhibit Hall (Areas 1–3) · P0", ccib.labels.json areas)
  - 깨진·빈 장소 id → "No such place" (전: 빈 화면 / 엉뚱한 문구)
  - 시간 문구 하나(`directions.js` `minutesText`): 경로 요약(3D aria-label)도 "1 min"
  - entry-check: 앞 정차의 방을 정확히, Today 맨 위 카드 없음을 검사. 보강하다 PICK ONE이 앞 정차인 경우를 확인(앱은 맞음)
- 마지막 전체 실행: `npm test` 107/107 · directions·revision·entry·explore qa·offline 확인 통과 · 첫 화면 JS gzip 110.2 KB. CPU 4배 p95는 33.4 ms(기준 34, 중앙값 33.3 = 30 fps 고르게): 같은 3D 파일이 앞 실행에선 16.7 ms였고 이때 기기 load average 7이라 환경 탓으로 보지만 확정 못 함

## ③ 결정과 이유
- 하루 목록의 Directions는 ⋯ 안에(Remove·Swap 위). 줄마다 버튼을 늘 보이게 하면 61 px 줄에 제목 자리가 줄어듦
- 05 발표 줄의 Directions는 글자 대신 위치 아이콘(aria-label "Directions to <제목>"). + Add가 이미 오른쪽에 있음
- WC·엘리베이터는 "가장 가까운 것" 하나만. 평면도에 WC 10개, 엘리베이터 15개(층마다)라 목록으로는 고르기 어려움
- 장소의 출발점은 Registration. 지금 어디 있는지 앱은 모름(위치 추적 없음), Change로 고름

## ④ 남은 문제
- 마지막 실행의 CPU 4배 p95 33.4 ms (위) — 조용한 기기에서 다시 재야 함
- 헤드리스 확인 스크립트는 `--strictPort`로 서버를 켜지만, 남은 브라우저·서버가 포트를 잡고 있으면 잘못된 결과가 나올 수 있음(이번에 한 번 겪음, 남은 프로세스를 정리하니 통과)
- 실기기 확인 안 함 (05 장소 줄, ⋯ 안 Directions)

## ⑤ 다음 단계가 알아야 할 것
- 09 링크: 발표 `#/directions/<paperKey>`, 장소 `#/directions/place/<id>` (id는 `encodeURIComponent`)
- 새 시설 종류(예: 물 마시는 곳)는 평면도 지점의 kind와 `places.js` `FACILITIES`에 말(words)만 추가

## ⑥ 비용·토큰
- 외부 API 없음. 데이터 추가 없음
