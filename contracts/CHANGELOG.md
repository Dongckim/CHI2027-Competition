# contracts CHANGELOG

버전을 올릴 때마다 위에 추가: 날짜 · 계약 · 버전 · 바뀐 것 · 영향받는 쪽

- 2026-11-20 · Arc 0.1.0 · 처음 만듦 (결정 006, 사용자 승인). 엔진 인터페이스 `app/src/engine/types.ts`와 같은 모양. 승인안에서 바뀐 것: 버전 필드 `v: 1` → `schema_version: "0.1.0"`(다른 계약과 같은 규칙), `tension`에 `off`(Tension을 고르지 않음) 추가. check.mjs가 evidence = abstract.slice(start, end)(quotes.js와 같은 검사), 키 중복·edition, `found` ⇔ T 노드 있음도 검사. 예시 2개(chi2026 실데이터, mock@0.1) · 앱(A0~), recsys (원준 확인 필요)
- 2026-11-11 · RecommendRequest 0.1.0, RecommendResponse 0.1.0 · 처음 만듦 (예시 chi2026 화요일). check.mjs가 quote 위치·정렬·clusterId·bridge 단계도 검사 · 앱(S0 Today), recsys (원준 확인 필요)

- 2026-10-21 · 틀만 만듦 (규칙, `npm run contracts:check`). 계약 없음
