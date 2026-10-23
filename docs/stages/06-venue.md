# 06 이동 시간·길 안내 (V6)

브랜치 `stage/06-venue` · 이슈 #7 · 검증 문서 [V6-venue.md](../validation/V6-venue.md) · 결정 [003](../decisions/003-venue-from-ccib-floorplans.md) · 정리일 2026-10-22

## ① 만든 것
- `data/scripts/venue-ccib.py` (`npm run data:venue -- <PDF>`): CCIB 공식 평면도 PDF → `data/venue/ccib.json`
  - 구역 108개의 치수·수용 인원, 방 테두리, 걷는 길 그래프 (지점 190, 연결 212, 미터)
- `data/venue/chi2026.json`: 시간대, 학회장 `ccib`, 피드 방 43개 → 구역 ID
- `app/src/venue/route.js`: 문에서 문까지 최단 경로 → 거리(m), 시간 범위(분), 층, 에스컬레이터/엘리베이터, 랜드마크 순서(`stops`)
  - 걷기는 에스컬레이터, 휠체어는 엘리베이터만
- 플래너 연결: `venueTravelMinutes` (02 참고)
- 확인: `node tests/venue/try.mjs 111 211 [--wheelchair]`, `/tests/venue/bench.html`, `tests/venue/share.mjs`(서버 없이 공유할 한 장짜리 페이지)
- 테스트 `tests/venue/route.test.mjs`

## ② 통과 기준 결과
- 손 계산 5개 구간 모두 1m 안 → 통과
- 휠체어 경로: 1,444쌍 모두 경로 있음, 에스컬레이터 0회 → 통과
- 해마다 교체 구조 (`<venue>.json` + `<edition>.json`) → 통과
- 경로 1회 0.14ms
- 이동 시간 정확도: 실측 없음 → 미검증
- 판정: 조건부 통과

## ③ 결정과 이유
- 공식 평면도 PDF를 유일한 학회장 원천으로 (프로그램 피드에 거리가 없음, 결정 003). 거리는 저장 때 이미 미터
- 안내는 복도 이름 대신 눈에 보이는 랜드마크 (WC > 에스컬레이터 > 엘리베이터 > 방 번호)
- 문장 안내("Exit right…")는 Figma에서 보류, 지점 목록까지만

## ④ 남은 문제
- 속도·대기 상수는 경험값 → 2–3개 구간 실측 필요
- 복도 중심선·P0/M1 문·오디토리움 안쪽은 손 입력, 계단 데이터 없음
- 화면 핀 좌표: 피드의 입체 평면도와 좌표 체계가 다름 (은비 #11)

## ⑤ 다음 단계가 알아야 할 것
- chi2027(Pittsburgh)은 2027년 4월 데이터 공개 후 같은 방식으로 평면도 확보 → `data/venue/<venue>.json`, `data/venue/chi2027.json`만 새로
- 앱에서 거리 단위 변환 금지 (이미 미터)

## ⑥ 비용·토큰
- 외부 API 없음
- Claude 토큰: 측정하지 않음
