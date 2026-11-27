# 14g 통역(Talk face to face)과 개인 데이터 (2026-11-27)

사용자 「14g 통역. 마이크 켜기 전 "음성이 통역 서비스(Soniox)로 전송되고 저장되지 않음" 동의 화면, 키는 서버 함수에서 짧은 임시 키로만, Soniox 데이터 보관 정책 확인해서 docs에 정리. 앱 안 "개인 데이터는 폰에만" 문구도 통역은 예외라고 맞춰.」

## 앱에서 하는 일
- 처음 "Tap to talk"을 누르면 동의 시트 "Before you start"가 뜬다: 목소리는 Soniox로 가서 말하는 동안 번역된다 / ARC도 Soniox도 저장하지 않는다(녹음·받아쓰기 없음), 화면 글자는 멈추면 지운다 / ARC의 나머지는 폰에만, 통역만 실행 중에 폰을 떠난다. "Start interpreting"을 누른 뒤에만 마이크를 켠다. 동의했다는 표시(`arc.interpretOk`)만 폰에 남는다.
- 키: 폰은 Soniox의 긴 키를 갖지 않는다. `/api/soniox-key`(functions/soniox-key.mjs)가 서버의 `SONIOX_API_KEY`로 Soniox 임시 키를 받아 준다: 60초 안에 열어야 하는 1회용, 한 연결 최대 2시간. 요청 내용은 로그에 남기지 않고, 기기별·하루 한도는 메모리에서만 센다.
- 화면 글자: `captions.js`가 마지막 몇 줄만 메모리에 두고, 멈추거나 화면을 닫으면 지운다. 음성·대화는 어디에도 저장하지 않는다.
- 문구: 01 "Unofficial · No account · Stays on your phone" 아래 "Except live interpreting: sent to Soniox, never saved" 14g 아래 안내에도 같은 말.

## Soniox 데이터 보관 정책 (2026-11-27 확인)
- 실시간 API 요청은 일시적으로 처리되고 Soniox가 저장하지 않는다(개인정보 처리방침).
- 오디오·받아쓰기는 저장 기능을 명시적으로 쓸 때(비동기/Files API)만 보관된다. ARC는 실시간 WebSocket만 쓴다.
- API에 보낸 내용(오디오, 받아쓰기, 메타데이터)은 모델 학습에 쓰지 않는다.
- 사용량 추적용 로그는 남지만 원본 오디오나 받아쓰기는 들어가지 않는다고 한다.
- 문서마다 "저장은 선택"인 경로를 비동기 API / Files API로 다르게 적고 있어, 규정 준수 근거로 쓰려면 support@soniox.com에 확인할 것.

출처: [Soniox security and privacy](https://soniox.com/docs/stt/security-and-privacy), [Soniox privacy policy](https://soniox.com/company/policies/privacy-policy/), [Data residency](https://soniox.com/docs/stt/data-residency)
