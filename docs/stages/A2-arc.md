# A2 Arc 지도·목록·상세·편집 (2026-11-20, stage/A2-arc)

## ① 만든 것
- 12 지도 `#/arc/<id>` (Figma 597:711), 상태 23 · 24 · 25, 13 목록 `#/arc/<id>/list`, 14 상세 `#/talk/<key>`, 15 Edit `#/arc/<id>/edit`
- `app/src/arc/map.js`: 노드 상태(next · upcoming · heard · ended)와 자리(Figma 좌표), "+N" 묶음, 23 빈 자리, 25 중립 배치
- `app/src/screens/arc/ArcView.tsx`: 12와 15가 같이 쓰는 지도. 노드는 모두 버튼, 낭독기 이름 "<관점> · <제목> · <시간>", 상태는 aria-description
- 14: 관점·형식 태그, "WHY IT SUPPORTS/REFRAMES/CHALLENGES"(근거 문장), 시간·방, 세션 이름·몇 번째 발표, 저자 전원 + 새로 온 저자마다 ✦ New to CHI(탭하면 "No paper under this name in CHI 2023–2025."), I heard it, DOI 버튼, 전체 초록(근거 문장 표시), Q&A 자리
- 15: 0.74 지도에 −(제거)·+(자리가 남은 관점에 추가), 노드 탭 → Swap 시트(검색, 관점 · New to CHI · Wildcard 칩, 카드에 "Same time as …"/"New to CHI"), Done에 저장
- 엔진 `wildcard(query, excludeKeys, limit?)` (사용자 결정, 원준 확인 필요)
- 데모 시계 `?at=2026-04-14T12:00` (개최지 시각): Next·Ended를 보려고. 실제 시계가 기본
- 12 노드 → 14 먼저 연결(사용자 요청), mock "VR" 최소 수정(사용자 승인, 이후 mock 동결)
- 검사: `node --experimental-websocket tests/arc/arc-check.mjs [--shots <dir>]`, `tests/app/arc-map.test.mjs`

## ② 통과 기준 결과
| 기준 | 결과 |
|---|---|
| `npm test` | 126/126 |
| `npm run typecheck` · `npm run contracts:check` | 통과 · 8/8 |
| arc-check (390×844, CPU 4배, 데모 시계) | **11/11**: 12 상태·다음 발표·테두리, ? 시트, 14 전 항목, I heard it → Heard, 13 상태 말, 23, 24(+N → 13), 25, 15 제거·바꾸기·저장, Wildcard |
| create-check (01 → 12 → 14) | 15/15 |
| 첫 화면 JS+CSS gzip | 88.4 KB (A1 86.8, A1 전 114.5) |
| 에셋 | 79개, PNG 0 |

### "VR" 원인과 수정 (사용자 보고)
- 질문 단어가 vr 하나 → 후보 30개가 모두 0.68–1.00, 0.6 넘는 것은 다 Supports(최대 4)로 가서 Reframes 0. Challenges 2개는 "However, there is a lack of research…" 같은 연구 공백 문장
- 수정: 약어 확장(VR → virtual reality 등 14개), Supports·Challenges는 근거 문장에 질문 단어가 있을 때만, 1~2단어 주제어는 결과형 대비 문장만 Challenges(공백 문장은 항상 제외), 주제어 Reframes 범위 확대
- 결과 "VR": ↑4 ↻3 ⊣0(none → 23). "I store some passwords…"는 VR 인증 포스터라 글자 그대로는 VR이 맞아 남음(의미 판단은 원준 엔진)

## ③ 결정과 이유
### Figma 대비 바꾼 것
| 화면 | Figma | 앱 | 이유 |
|---|---|---|---|
| 12 | 노드 시간 10px | 12px, 한 줄 말줄임 | 12px 이상, 긴 방 이름("Area 1 + 2 + 3: posters" → "Posters") |
| 12 | 질문 구슬·고리 XR 파랑 그림 | CSS, 종족 색 | 다른 종족도 파랑이 됨 |
| 12 | Next·Heard가 색으로만 다름 | 버튼 aria-description에 상태 말 | 색만으로 구분 금지 |
| 12 | Share | A3까지 비활성 + 낭독기 "Sharing comes in the next build." | A3 |
| 12 | Reframes 아래 3개(24) | 양옆이 두 번째 자리를 쓰면 2개, 넘치면 1개 + "+N" | 실제 제목은 두 줄이라 이름이 겹침 |
| 12 | 토글 36px | 같은 모양, 누르는 영역 44px | 터치 44px |
| 13 | 제목 한 줄 말줄임 | 두 줄 (사용자) | 제목을 읽을 수 있게 |
| 13 | 메타 11px, 날짜 없음 | 12px, "Heard · Tue 14 · ~09:36 · Rm 116" | 12px, Arc는 일주일 |
| 13 | 개수 45% (4.28:1) | 55% | 4.5:1 |
| 14 | 저자 한 줄 + "First CHI paper" | 저자 전원, 새로 온 저자마다 "✦ New to CHI" | 사용자 결정(문구·전원) |
| 14 | 시간·방만 | 세션 이름 · talk n of m 추가 | 세션: 사용자 요청 「14 나머지(저자 ✦ 전원 표시, 세션, Q&A 자리)」. talk n of m은 해석(확인 전) |
| 14 | "WHY IT SUPPORTS" 11px | 12px | 12px 이상 |
| 14 | 문장 안 일부만 강조 | 근거 문장 전체 인용 + 전체 초록에서 그 문장 표시 | 엔진이 주는 단위가 문장 |
| 14 | 없음 | "I heard it" 버튼(시작한 발표만) | 사용자 결정: Heard는 사용자가 표시 |
| 14 | Q&A 카드·투표 | 빈 상태 "Be the first to ask" + 입력(비활성) + "Questions are public and anonymous. Don't include personal details." | Q&A 서버는 A3, 가짜 질문 금지 |
| 14 | 입력 placeholder 45% (4.21:1) | 55% | 4.5:1 |
| 15 | "First CHI paper" 칩 | "New to CHI" | 배지 문구는 사용자 결정 「문구는 "✦ New to CHI"」. 15 Swap 칩에도 쓴 것은 해석(확인 전) |
| 15 | − 22px, + 34px, Done 40px | 같은 모양, 누르는 영역 44px | 터치 44px |
| 15 | 카드 메타 11px | 12px | 12px 이상 |
| 15 | 제거 테두리 24% (2.54:1) | 40% | 비텍스트 3:1 |

### 그 밖의 결정
- 노드 상태 (사용자 결정): 지난 발표는 Ended, 14에서 "I heard it"을 누른 것만 Heard. 기록은 DeviceState arc.heard(기기에만)
- Wildcard: 엔진 메서드로는 사용자 결정(고른 보기 「engine에 wildcard 메서드 추가 … mock은 점수 중간대에서 무작위」). 0.15–0.35 구간, 관점 Reframes, 노드마다 엔진이 관점을 정하는 것은 해석(확인 전)
- 15에서 넣는 검색 결과는 사용자가 고른 관점으로, 근거 문장은 없음(엔진이 고른 것이 아님)
- 15 저장 후 tension: T 노드가 있으면 found, 없으면 none(off·pending은 그대로)
- 14의 근거는 마지막으로 연 Arc, 없으면 이 발표가 든 가장 새 Arc

## 확인 필요 (해석(확인 전), 2026-11-20 기록 점검)
| 무엇 | 원문 | 해석으로 정한 것 | 기록 |
|---|---|---|---|
| Wildcard 점수대·관점 | 「engine에 wildcard 메서드 추가 … mock은 점수 중간대에서 무작위」 | 0.15–0.35, 관점 Reframes, 노드마다 엔진이 관점 | 커밋 7b45bfb, contracts/CHANGELOG.md |
| 15 Swap 칩 문구 | 「문구는 "✦ New to CHI"」(배지) | 15 칩도 "New to CHI" | 이 문서 ③ |
| 14 "talk n of m" | 「14 나머지(… 세션 …)」 | 세션 안 순서도 보여 줌 | 이 문서 ③ |

## ④ 남은 문제
- 15에서 "+N"으로 묶인 노드는 지도에서 고를 수 없음(목록에서 보이지만 편집은 지도만)
- 지도 노드 이름은 엔진 label(24자), 두 줄이 넘으면 말줄임
- 25 "Sorting angles…"는 mock에서 끝나지 않음(?mock=pending). 실제 엔진이 판정을 마치면 갱신하는 흐름은 원준 엔진과 함께
- Q&A는 A3(api/qa). Share도 A3
- 지도 라벨 대비는 종족 빛 위라 측정 안 함
- 폰 실기기 확인 안 함

## ⑤ 다음 단계가 알아야 할 것
- 데모 시계: `/?at=2026-04-14T12:00#/arc/<id>`
- `useArc(id)`가 Arc·programme·상태·노드 글을 준다(12·13·15). 저장은 `save(arc)`
- Share 버튼은 `ArcMap.tsx`·`ArcList.tsx`에서 비활성 → A3에서 `#/share/<id>`로
- 14의 Q&A 입력은 `TalkDetail.tsx`에서 disabled → A3 api/qa 연결

## ⑥ 비용·토큰
- 외부 API 호출 없음, 새 의존성 없음
