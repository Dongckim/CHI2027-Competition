# contracts CHANGELOG

버전을 올릴 때마다 위에 추가: 날짜 · 계약 · 버전 · 바뀐 것 · 영향받는 쪽

- 2026-11-20 · RecommendRequest 0.1.0, RecommendResponse 0.1.0 · 표시만 (삭제·변경 없음): 옛 플래너(Today, app/src/legacy/)와 mock 엔진 내부(app/src/recommend/baseline.js가 RecommendResponse 모양을 내고 engine/mock-core.js가 그것을 읽음)에서 씀. Arc 앱의 계약은 아님(Arc는 contracts/Arc) · 없음
- 2026-11-20 · 엔진 인터페이스(app/src/engine/types.ts, Arc 0.1.0과 함께 공유) · `wildcard(query, excludeKeys, limit?)` 추가 (사용자 결정 「engine에 wildcard 메서드 추가 … mock은 점수 중간대에서 무작위」, 15 Swap의 Wildcard 칩). 엔진이 노드마다 관점을 정함, 0.15–0.35 점수대는 해석(확인 전, docs/stages/A2-arc.md 확인 필요) · 앱 15, recsys (원준 확인 필요)
- 2026-11-20 · Arc 0.1.0 · `debut` 뜻을 "저자 중 하나라도 새 사람"(Paper 64%) → "제1저자가 새 사람"(27%)으로 (사용자 결정, 필드 모양은 같음, 아직 쓰는 쪽이 없어 버전 그대로) · 앱, recsys (원준 확인 필요)
- 2026-11-20 · Arc 0.1.0 · 처음 만듦 (결정 006, 사용자 승인). 엔진 인터페이스 `app/src/engine/types.ts`와 같은 모양. 승인안에서 바뀐 것: 버전 필드 `v: 1` → `schema_version: "0.1.0"`(다른 계약과 같은 규칙), `tension`에 `off`(Tension을 고르지 않음) 추가. check.mjs가 evidence = abstract.slice(start, end)(quotes.js와 같은 검사), 키 중복·edition, `found` ⇔ T 노드 있음도 검사. 예시 2개(chi2026 실데이터, mock@0.1) · 앱(A0~), recsys (원준 확인 필요)
- 2026-11-11 · RecommendRequest 0.1.0, RecommendResponse 0.1.0 · 처음 만듦 (예시 chi2026 화요일). check.mjs가 quote 위치·정렬·clusterId·bridge 단계도 검사 · 앱(S0 Today), recsys (원준 확인 필요)

- 2026-10-21 · 틀만 만듦 (규칙, `npm run contracts:check`). 계약 없음
