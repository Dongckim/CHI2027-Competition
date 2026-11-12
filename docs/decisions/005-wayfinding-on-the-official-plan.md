# 005 길 안내는 공식 평면도 위에, 보이는 이름만 사람이 덧붙인다

날짜: 2026-11-12 · 단계: S5 (09 Getting there)

## 결정
- 09 길 안내의 경로·거리·층·왼쪽/오른쪽은 공식 CCIB 평면도에서 뽑은 `data/venue/ccib.json` 하나로 계산한다 (결정 003과 같은 원천, 플래너의 이동 시간과 같은 숫자)
- 사람이 보는 이름(복도 이름 등)만 `data/venue/ccib.labels.json`에 손으로 적는다. 좌표·거리는 넣지 않는다
- 프로토타입(`reference/wayfinding/arc-wayfinding.html`)은 구조·문장 규칙만 참고한다. 그 배치(P1을 따라 그림, P0은 추정)는 쓰지 않는다
- 계단은 PDF에 없으므로 만들지 않는다. 층 이동은 평면도에 있는 에스컬레이터·엘리베이터만
- 09-1의 고정 장소(Registration)는 해마다 달라서 `data/venue/<edition>.json`의 `places`에 둔다

## 이유
- 사용자 선택 (2026-11-12): "공식 좌표 + 이름 보정"
- 프로토타입의 P0은 스스로 "Rough guess"라고 적혀 있고, P2·M1·M2·오디토리움은 없다. 공식 평면도는 6개 층 전체이고 표 치수와 2.4% 안
- 두 원천을 쓰면 Today(카드)와 플래너의 시간이 서로 달라진다

## 프로토타입과 달라진 것 (확인 필요)
- 133 → 111: 공식 평면도에서는 118–134 복도가 Foyer 1과 x = 167.8 m에서 만나고 111(x 175.6–190.2 m)이 그 모퉁이를 지난 곳에 있다 → "Turn left into Foyer 1 … Room 111 on your right" (프로토타입: turn right, on your left)
- 113 → Posters: 계단 대신 에스컬레이터 P1 → M1 → P0 ("Escalator down to P0")
- Entrance Hall → 121 (step-free): 가장 빠른 엘리베이터가 3번 ("Elevator 3 up to P1", 프로토타입은 2번)
- 117 → 127: 거리 195 m (프로토타입 226 m), 문장 내용은 같음

## 2027
- 피츠버그 평면도로 `data/venue/<venue>.json`(PDF에서 생성)과 `<venue>.labels.json`(이름), `data/venue/chi2027.json`(방·층·장소 연결)을 만들면 된다. 모듈에는 CCIB 이름이 없다. `npm run data:venue:check chi2027`로 피드와 맞는지 확인
