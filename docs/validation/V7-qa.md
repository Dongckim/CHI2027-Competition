# V7 QA 자동화 (2026-11-20, test/qa-automation)

앱 동작은 바꾸지 않고 검사만 추가했다. 브라우저가 필요 없는 것은 `npm test`, 헤드리스는 `npm run qa:auto`(빌드 → 9개 검사, `--deploy <주소>`면 배포 검사까지) 한 명령으로 돈다. 실패하면 화면 번호와 값을 출력한다.

## 가설
배포 전에 사람이 일일이 보지 않아도 다음을 자동으로 잡을 수 있다: 탭 두 개의 저장 충돌, 성능 예산 초과, 바깥으로 나가는 요청과 질문 문장, 저장소의 비밀, 가로 넘침, 공유 링크 깨짐, 44px·12px 미달.

## 방법
| 검사 | 파일 | 돌리는 곳 |
|---|---|---|
| 1 두 탭 동시 저장 | `tests/qa/two-tabs-check.mjs` | qa:auto |
| 2 성능 예산 | `tests/qa/perf-check.mjs` → `docs/validation/perf.json` | qa:auto |
| 3 바깥 요청 허용 목록, 질문 문장 | `tests/qa/requests-check.mjs`, 허용 목록 `tests/qa/allowed-hosts.json` | qa:auto |
| 4 저장소 비밀 | `tests/qa/secrets.test.mjs`, 예외 `tests/qa/secrets-allow.json` | npm test |
| 5 가로 넘침 390·375·360, 16 스와이프 중 | `tests/arc/a11y-check.mjs` | qa:auto |
| 6 공유 링크 왕복 | `tests/qa/link-roundtrip.test.mjs`(인코딩) + `tests/qa/link-check.mjs`(18 화면) | npm test + qa:auto |
| 7 axe + 10번, 44px·12px | `tests/arc/a11y-check.mjs`, 예외 `tests/qa/a11y-exceptions.json` | qa:auto |

- 헤드리스는 `tests/qa/cdp.mjs`를 쓴다.
  - Chrome이 디버그 포트를 스스로 고른다(`--remote-debugging-port=0`). 그래서 남아 있던 다른 Chrome에 붙을 수 없다.
  - 서버 포트가 이미 쓰이고 있으면 실패한다. 남은 서버가 옛 빌드를 보여 주는 일을 막기 위해서다.
- 3번은 페이지와 서비스 워커(브라우저 세션에서 생기자마자 붙음)의 요청을 CDP로 모은다.
  - 처음에는 프록시로 모았는데, Chrome 자체 통신(업데이트·동기화)과 앱 요청을 구분할 수 없어 바꿨다.
  - 질문 문장 검사가 제대로 잡는지 대조 요청으로 확인한다.
- 7번 누르는 영역: 가운데에서 상하좌우 22px 지점을 눌러 그 요소가 잡혀야 한다.
  - `::before`로 넓힌 영역은 인정하고, 다른 요소에 가려지면 실패다.
  - 입력칸은 그것을 감싼 label도 인정한다. 시트가 열려 있으면 시트 안만 잰다.
- 7번 글자: 글자 크기 × 축소 비율(지도)이 11.85px 미만이면 실패다.
- 알려진 실패: `tests/qa/known-failures.json`에 이유와 함께 둔다. 목록에 없는 실패가 하나라도 있으면 qa:auto는 실패다. 고쳐서 더 안 나오는 항목은 qa:auto가 알려 준다.

## 통과 기준과 결과
| 검사 | 기준 | 결과 |
|---|---|---|
| 1 두 탭 | 새로고침 뒤 Arc 수·내용과 Heard가 예상과 같음 | Arc 3개 모두 남음, 편집 유지. **Heard 사라짐(실패, 아래)** |
| 2 성능 | 첫 화면 ≤ 100 KB, 01 ≤ 5초(Slow 4G, CPU 4배) | 87.9 KB, 01 1.09초, 01까지 113 KB, 첫 방문 페이지 1,459 KB·34요청, 워커 보관 7,255 KB(압축 풀린 크기) |
| 3 요청 | 허용 목록 밖 0, 07→12 동안 질문 0 | localhost만(페이지·워커), 질문 0, 대조 요청 1건 탐지 |
| 4 비밀 | 발견 0 | 0 (가짜 비밀 다섯 종류는 모두 탐지) |
| 5 가로 넘침 | scrollWidth ≤ clientWidth | 390은 전부 통과. **375·360에서 01·03·05·06·12·23·24·25, 360에서 11 넘침** |
| 6 링크 | 질문·발표·관점·근거 위치 같음, 잘린 링크 거부 | 질문 4종 모두 같음, 잘린 링크 8가지 거부 |
| 7 접근성 | axe serious 0, 44px, 12px | axe 25화면 serious 0(10번 포함). **44px·12px·10번 대비 미달은 아래** |

### 찾은 문제 (고치지 않음, known-failures.json)
1. **Heard가 다른 탭의 쓰기에 사라짐**: DeviceState(localStorage)를 탭마다 한 번 읽고 통째로 쓴다. B에서 "I heard it"을 누른 뒤 A에서 입력하면 A의 옛 상태가 덮어쓴다.
   - 재현: ① A에서 07을 연다 ② B에서 시작한 발표의 14를 열고 "I heard it" ③ A에서 입력 ④ 새로고침하면 Heard가 없다.
2. **01·03·05·06 Skip(그리고 05 Code of Conduct)을 눌러도 그림이 눌림**: Start.tsx의 Frame(390×844 absolute)이 상단을 덮는다.
3. **375·360 폭 가로 넘침**: 01·03·05·06은 같은 Frame, 12·23·24·25는 지도 390 상자, 11은 고리 상자 때문이다.
4. **누르는 영역 미달**: 08·09 칩은 38px만 눌린다. 08의 ? 버튼은 칩 줄과 겹친다. 12·13·23·24·25 지도/목록 토글은 36px만 눌린다.
5. **12px 미만**: 축소 지도(15 0.74, 18·19 0.78)의 "+2"가 11.1–11.7px다. 18·19의 "No clear challenge at CHI this year."는 real()을 쓰지 않아 9.4px다.
6. **10번 원 안 질문 대비 3.75:1**: 지도 원(12 등)은 사용자가 Figma 예외로 정했지만, 10은 정하지 않았다.

## 판정
조건부. 검사는 모두 돌고 새 실패는 0이다. 위 6가지는 앱을 고치지 않는다는 지시에 따라 알려진 실패로 남겼다.

## 다음 행동
- 1번 고치는 방법을 정한다. 예: 쓰기 직전에 localStorage를 다시 읽어 합치고, storage 이벤트를 받는다.
- 2·3번은 Frame에 `pointer-events: none`과 가로 넘침 막기를 넣는다(그림은 aria-hidden이라 누를 것이 없음).
- 4·5번은 사용자에게 Figma 크기와 비교해 확인받는다.
- 고친 항목은 `tests/qa/known-failures.json`에서 뺀다.
- 배포 주소 성능(`perf-check.mjs --url …`)은 확인하지 않았다.
