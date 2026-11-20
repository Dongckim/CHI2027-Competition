# A3 공유·받기·Q&A (2026-11-20, stage/A3-share)

## ① 만든 것
- **데모 시계** (사용자 결정): 학회 기간 밖이면 둘째 날 10:00(개최지 시각, chi2026 = 2026-04-14 10:00 Europe/Madrid). `?at=`이 있으면 그 시각, 학회 중이면 실제 시계. 시간이 중요한 화면(09·12·13·14·15·18·19·20)에 배너 "Demo time: Tue 14 Apr, 10:00 at the venue. CHI 2026 is over." (`arc/demo.js`, `arc/demoClock.ts`)
- **23 문구** "No clear challenge" (지도 빈 자리, 13, 08)
- **링크** `/s/<payload>`, payload = base64url(JSON { v, e, q, t, n:[[id, angle, start?, end?]] }) (`arc/link.js`). 받는 쪽은 필드마다 검사, 근거 문장은 자기 초록으로 다시 확인, 이 프로그램에 없는 발표는 빼고 셈
- **share 함수** (`functions/share.mjs`, `api/share.mjs`, vercel.json rewrite `/s/:d`): 메신저 미리보기 태그(og:title = 질문, og:description = 관점별 개수 + "from the CHI 2026 programme. Unofficial."), noindex, 바로 `/#/r/<payload>`. 함수 없이 열린 `/s/…`(오프라인·개발 서버)는 main.tsx가 `#/r/…`로
- **Q&A** (`functions/qa.mjs`, `api/qa.mjs`, 결정 007): 메모리 저장소, `KV_REST_API_URL/TOKEN` 또는 `UPSTASH_REDIS_REST_URL/TOKEN`이 있으면 Upstash REST(의존성 없음). 14에 연결(목록·질문·추천·신고·내 것 삭제)
- **화면** 16 Share, 17 QR, 18 Shared Arc, 19 Pick some, 20 My Arcs(Figma 목록), 12·13 Share 버튼 켬
- vite 개발·미리보기 서버가 `/api/share`, `/api/qa`, `/s/…`를 함수로 연결(헤드리스 검사와 같은 Wi-Fi 폰)
- 검사 `tests/arc/share-check.mjs`, 단위 테스트 arc-demo · arc-link · share-page · qa

## ② 통과 기준 결과
| 기준 | 결과 |
|---|---|
| `npm test` | 136/136 |
| `npm run typecheck` · `npm run contracts:check` | 통과 · 8/8 |
| share-check (390×844, CPU 4배, 실제 시계) | **10/10**: /s/ 태그, 데모 배너, 16 문구·Copy link, 17 QR, 빈 폰에서 /s/ → 18, 19 Add n−1·잠금·새 received Arc, Add to my Arcs, 20 두 행, 14 질문·추천 1번·삭제, 깨진 링크 |
| create-check · arc-check | 15/15 · 12/12 (데모 시계가 켜진 뒤에도) |
| 첫 화면 JS+CSS gzip | 90.1 KB (A2 88.4: 데모 배너·시계가 메인에) |
| 링크 길이 | 7노드 302자, 19노드(crowded) 652자 |
| 새 의존성 | uqr 0.1.3 (QR, 17 조각 gzip 6.2 KB) |

## ③ 결정과 이유
### Figma·지시서와 다르게 한 것
| 화면 | Figma / 지시서 | 앱 | 이유 |
|---|---|---|---|
| 16 | 개인정보 문구 11px | 12px + "Your question is part of the link." 한 줄 더 | 12px, 사용자 요청 |
| 16 | 링크 미리보기 카드 디자인 없음(큰 종족 모양만) | 메신저에 뜨는 모양(주소·질문·개수), 이미지는 A4 | 디자인이 없음 |
| 16 | Copy link | 클립보드가 막히면 링크를 화면에 보여 줌 | 복사할 방법이 남게 |
| 17 | QR 오류 정정(가운데 모양 때문에 H 권장) | Q | 모양은 약 3%, H는 긴 링크에서 101칸으로 촘촘함(Q 93칸) |
| 18 | 지시서 "Add all" | Figma "Add to my Arcs" | 화면 문구는 Figma |
| 18 | (없음) | 이 프로그램에 없는 발표 수 한 줄, 깨진 링크 화면 | 받는 쪽이 이유를 알게 |
| 19 | 잠금 = Ended(Figma) / 이미 내 것(지시서) | 둘 다 잠금, 범례에 "Already yours" 추가 | 둘 다 담을 이유가 없음 |
| 19 | 지도만 | +N 묶음이 있으면 아래 "All n talks" 목록 | 묶인 발표도 고를 수 있게 |
| 19 | 0개일 때 없음 | 버튼 비활성 "Pick at least one talk" | 디자인 없음 |
| 18·19 | 지도 글자 9.4·7.8px | 실제 12px(지도만 0.78) | 12px |
| 20 | 날짜 11px | 12px | 12px |
| 20 | 정렬 규칙 없음 | 새 Arc가 위 | 가장 최근 것을 먼저 찾음 |
| 14 | 추천 상태가 채움으로만 | 채움 + 테두리 + aria-pressed "Voted" | 색만으로 구분 금지 |
| 14 | 신고·삭제 없음 | Report(남의 것)·Delete(내 것) 글자 버튼 44px | 결정 007 안전 규칙 |
| 14 | 개수 45% | 55% | 4.5:1 |

### 그 밖의 결정
- 링크에 tension이 없어 받은 Arc는 T가 없으면 none(23). 보낸 사람이 Challenges를 껐어도(off) 받는 쪽은 "No clear challenge"
- 받은 Arc는 언제나 새 Arc(source: received, engine: "shared@1"). 담을 때까지 저장 안 함
- 처음 쓰는 사람이 링크로 열어 담으면 온보딩 끝으로 표시(다음에 열면 홈)
- 데모 시계가 켜지면 09의 When도 Today/Tomorrow(둘째 날 기준)
- share 페이지 캐시는 하루(A4에서 og:image가 붙으므로 아직 1년 아님)

## ④ 남은 문제
- **Upstash 연결 전에는 Vercel에서 Q&A가 메모리**: 함수 인스턴스마다 따로이고 다시 시작하면 사라진다. 학회·심사 전에 Upstash 연결 필요(사용자). 연결되면 코드 변경 없이 환경변수로 바뀜
- QR이 촘촘함(긴 링크): 짧은 링크(서버 저장)는 "서버 무상태" 원칙과 부딪혀 하지 않음. 필요하면 QR을 타일 가득(216px)으로 키우는 정도
- og:image(링크 미리보기 그림)는 A4
- 공유 카드(16)를 실제 이미지 파일로 저장·보내기는 안 함(More는 링크만 공유)
- 데모 시계는 탭을 연 순간 정해짐(학회 첫날 0시를 넘기며 탭을 계속 켜 두면 새로고침해야 실제 시계)
- 폰 실기기, 실제 메신저 미리보기 확인 안 함 (A4)

## ⑤ 다음 단계가 알아야 할 것
- 공유 주소 `shareUrl(arc)` (`screens/arc/Share.tsx`), 링크 형식 `arc/link.js`
- Q&A: 기기 쪽 `arc/qa.ts`, 서버 `functions/qa.mjs`의 `handle(request, env, store)`(테스트는 memoryStore)
- 데모 배너: `<Screen clock>` 또는 `<DemoBanner />`
- 배포 후 확인: `/s/<payload>`가 share 함수로 가는지(vercel.json rewrite), `/api/qa?paper=…`

## ⑥ 비용·토큰
- 외부 API 호출 없음(Upstash 연결 전). 새 의존성 uqr 0.1.3
