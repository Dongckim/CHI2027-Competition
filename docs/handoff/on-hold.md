# 보류한 것

## 링크 v2: QR용 짧은 payload (2026-11-21)
사용자 「링크 v2(QR용 짧은 payload)는 보류. docs/handoff에 "QR이 실제로 안 찍히면 진행"으로만 기록」

- **QR이 실제로 안 찍히면 진행**한다. 폰 카메라로 17 QR(7노드 링크)을 찍어 보는 것은 docs/stages/A4-ship.md ⑦의 4번이다.
- 안: payload(지금 v1은 JSON을 base64url로 담음, `app/src/arc/link.js`)를 바이너리로 줄인 v2. v1 링크도 계속 열리게 한다. 서버 저장형 짧은 링크는 하지 않는다(사용자 「서버 저장형 짧은 링크는 하지 마」).
