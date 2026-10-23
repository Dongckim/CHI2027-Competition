# V3 모바일 웹 플랫폼

이슈: [#4](https://github.com/Dongckim/CHI2027-Competition/issues/4) · 판정: **진행 중 (휴대폰 실기기 테스트 시작)** · 시작일 2026-10-22

## 가설
저장 유지·출발 배너·마이크가 휴대폰 브라우저에서 동작한다.

## 방법
- 배포: Vercel (HTTPS, 마이크에 필요). 정적 파일은 레포 그대로, `api/soniox-key.mjs`가 `functions/soniox-key.mjs`를 `/api/soniox-key`로 연결
  - 올리는 데이터는 `.vercelignore`로 chi2026의 확인 페이지가 읽는 것만 (people·aliases·raw·다른 연도 제외)
  - 키: Vercel 환경 변수 `SONIOX_API_KEY` (Production)
  - 시작 페이지 `/` → `/tests/` (링크 3개)
- 1차 (이번): 자막 마이크·대면 대화를 휴대폰에서
  - `/tests/captions/bench.html`: 마이크 권한 → Start → 원문·번역 자막, `recorder.mimeType` 기록
  - `/tests/captions/conversation.html`: 휴대폰을 눕히고 두 사람 (예: 한국어 ↔ English), 위쪽 화면이 뒤집혀 읽히는지
  - 각 기기에서: 권한 요청이 뜨는지, 거부 후 다시 허용, 화면 꺼짐·앱 전환 후 상태, Wake Lock 유지
- 2차 (다음): /bench 페이지에 IndexedDB 저장, `navigator.storage.persist()`, 예약 배너, 밀린 배너, 결과 표 + 복사. DeviceState 계약 확정 뒤 (contracts/ 필드는 Dongchan 설계 중)
- 같이 잴 것: 플래너 휴대폰 실측 (V2 조건 ①, 추천 200개)

## 통과 기준
- iPhone Safari·Samsung Internet에서 각 항목 결과 기록
- 7일 후 저장 유지 여부 기록 (홈 화면 추가 O/X 각각)

## 결과 (1차: 자막)
| 항목 | iPhone Safari | Samsung Internet | Android Chrome |
|---|---|---|---|
| 기기·OS·브라우저 버전 | | | |
| 마이크 권한 요청 → 허용 | O (2026-10-22) | | |
| 거부 후 다시 허용하는 방법 | | | |
| MediaRecorder 형식 (`mimeType`) | | | |
| 자막 나옴 (첫 글자까지 체감) | O (2026-10-22) | | |
| 번역 나옴 | | | |
| 대면 대화: 두 언어 나뉨 | O (2026-10-22) | | |
| 대면 대화: 위쪽 화면 뒤집힘·잘림 없음 | | | |
| 한국어 줄바꿈 (단어 단위) | | | |
| Wake Lock (화면 안 꺼짐) | | | |
| 화면 꺼짐 → 다시 켬 | | | |
| 다른 앱 → 복귀 | | | |
| 무음 스위치·이어폰 연결 시 | | | |

## 판정
**진행 중.** iPhone Safari에서 마이크·자막·대면 대화 동작 확인 (2026-10-22, 사용자 보고. 기기·버전·형식은 미기록). Samsung Internet 전.

## 다음 행동
- 사람: 위 표 채우기 (iPhone Safari, Samsung Internet 우선)
- iPhone에서 `mimeType`이 `audio/mp4`면 Soniox `audio_format: auto`가 받는지가 핵심 (노트북은 webm)
- 2차 /bench 페이지 (DeviceState 계약 후), 7일 저장 유지
- 은비 #16 출발 알림 방식 결정안
- 공개 주소의 `/api/soniox-key`는 누구나 부를 수 있음: Soniox 콘솔 지출 한도 확인. 제한은 메모리 카운터라 Vercel 인스턴스마다 따로 (V8)
