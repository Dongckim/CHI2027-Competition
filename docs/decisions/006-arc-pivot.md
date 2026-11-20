# 006 플래너(Today) 중심에서 Arc 중심으로 바꾼다

날짜: 2026-11-20 · 단계: A0 (stage/A0-arc-contract)

## 결정
- 앱의 중심을 "오늘 어디 갈지"(Today 카드·하루 루트)에서 **Arc**로 바꾼다. Arc는 사용자의 연구 질문 하나를 가운데 두고, CHI 발표들을 세 관점 Support ↑ / Reframe ↻ / Tension ⊣로 묶은 것이다
- 질문마다 8개 종족(tribe) 중 하나가 정해지고, 화면 테두리가 그 종족 색으로 빛난다. 관점에는 색을 쓰지 않는다(색은 종족 전용). 색만으로 구분하지 않고 항상 모양·이름을 같이 보여 준다
- Arc는 링크·QR로 공유하고, 받은 사람은 전체 또는 일부를 담는다(새 Arc로 저장, 합치지 않음)
- 추천(무엇을 어떤 관점으로)은 `app/src/engine/`에만 둔다. 지금은 같은 인터페이스의 mock(baseline TF-IDF + 단순 규칙)이고, 원준의 온디바이스 엔진은 `ondevice.ts` 하나를 바꿔 끼운다
- 화면 기준: Figma Final UI 페이지(582:7, 25화면 + Components 588:446). v3(288-679)는 참고용
- 플래너·길 안내·자막 코드는 지우지 않는다. 새 내비게이션의 진입점에서만 뺀다. 옛 화면 라우트는 직접 주소로 열린다

## 이유
- 사용자 결정 (2026-11-20, 개발 지시서): 연구 질문 중심이 CHI가 원하는 방향이고, 일정 관리 앱은 흔하다
- 데이터 파이프라인·오프라인·시간 계산·검색·인용 검사는 그대로 쓸 수 있어 바닥부터 다시 짜지 않는다

## 남기는 것 / 빼는 것
| 남김 (재사용) | 진입점에서 뺌 (코드 유지) |
|---|---|
| data/build, `data/load.ts`·`programme.ts`·`offline.ts`, `app/sw.js` | Today 카드, More for you, Swap/Undo |
| `data/scripts/search.mjs` (15 Edit 검색) | 길 안내 09·3D (`app/src/venue/`) |
| `explore/quotes.js` (evidence 검사) | 자막 (`app/src/captions/`) |
| `screens/Talk.tsx`·`Person.tsx`·`explore/authors.js` (14 상세) | 옛 온보딩 O-1~O-5 |
| `recommend/baseline.js` (mock 유사도) | step-free·Calm 경로 |

## 공유 링크와 개인정보
- 링크 payload는 `{ v, e, q, t, n:[[key, angle, start, end]] }`(base64url JSON). 이름·위치·기기 정보는 없다
- **질문 문장(q)이 URL에 담긴다.** `/s/<payload>`와 `/api/og?d=<payload>`는 서버가 받으므로, 우리 코드는 로그를 남기지 않아도 호스팅의 요청 로그에 경로가 남을 수 있다. 질문은 개인정보가 아니지만 사용자가 알아야 하므로 16 공유 화면에 "Your question is part of the link."를 적는다. 질문은 200자로 자른다
- 받는 쪽은 evidence 위치를 `quotes.js`로 다시 검사하고, 맞지 않으면 evidence를 null로 둔다(링크로 문장을 지어 넣을 수 없음)

## 이름 충돌
- 새 단계 접두어는 `A`(A0~A4). 레포의 S0~S5b(단계)·V0~V6(검증)와 Figma 화면 번호(01~25)는 서로 다른 것이다
