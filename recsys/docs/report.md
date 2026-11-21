# CHI 2026 추천 모델 성과 리포트

- **모델**: `models/bge-m3-chi`
- **코퍼스**: 2509 건 (논문+포스터), 임베딩 차원 1024
- **인덱스 구축**: Nones on cuda

## 품질 지표

| 지표 | 값 | 의미 |
|------|-----|------|
| Self-retrieval@1 | 1.0 | 1.0에 가까울수록 인덱스 정상 |
| Score separation (top1 vs 100위) | 0.2972 | 높을수록 변별력 큼 |
| Top-8 다양성 | 0.6694 | 높을수록 중복 적음 |
| Cross-lingual overlap@8 (한↔영) | 0.7083 | 높을수록 교차언어 검색 우수 |
| 평균 질의 지연시간 | 1.4658s | 챗봇 응답 속도 |

## 샘플 질의 결과

**질의: privacy and trust in wearable camera devices**
- [0.554] See Me If You Can: A Multi-Layer Protocol for Bystander Privacy with Consent-Bas
- [0.536] Mind the Gap: Mapping Wearer–Bystander Privacy Tensions and Context-Adaptive Pat
- [0.429] MlondaCam: Designing Context-Aware Smart Cameras for Supporting Domestic Securit

**질의: large language models for accessibility**
- [0.458] Identifying, Explaining, and Correcting Ableist Language with AI
- [0.446] Understanding the Use of a Large Language Model-Powered Guide to Make Virtual Re
- [0.413] How Multimodal Large Language Models Support Access to Visual Information: A Dia

**질의: virtual reality for education and learning**
- [0.501] Everyone Deserves a Teacher They Like: Designing Personality-Matched Multimodal 
- [0.498] AttentiveLearn: Personalized Post-Lecture Support for Gaze-Aware Immersive Learn
- [0.494] Mapping Design Dimensions for Collaborative Learning in Virtual Reality: A Scopi

**질의: haptic feedback interfaces**
- [0.567] Next Generation Wearable Haptics Should Balance Virtual & Real-world Fidelity
- [0.560] HapPalm : Providing Rich Spatio-Temporal Vibrotactile Feedback on the Palm for L
- [0.517] HaptEx: Investigating Haptic Notification Channels for Exoskeletons Across Diffe

**질의: AI-assisted mental health support**
- [0.647] Standardized Soul: A Mixed-Methods Study on the Efficacy and User Perception of 
- [0.585] "Words are not enough": Examining Emotional Support by Conversational AI for Car
- [0.542] When Your Therapist Is an Algorithm: Understanding the Role of AI in Mental Heal

**질의: child-computer interaction and safety**
- [0.512] Beyond Age-Based Restrictions: Rethinking Children's Online Safety Through Compa
- [0.502] Player Safety by Design: Co-Designing Child-Centered Safety Mechanisms with Chil
- [0.480] Extending the Child-Centered Ethics Framework: Researchers' Reflections on Multi

**질의: sustainable and eco-friendly computing**
- [0.432] Entangled Life and Code: A Computational Design Taxonomy for Synergistic Bio-Dig
- [0.431] Good for the Planet, Bad for Me? Intended and Unintended Consequences of AI Ener
- [0.425] Modalities of Regulation in Sustainable HCI: Rethinking the Role of Design in Sh

**질의: gesture and gaze based interaction**
- [0.591] The People's Gaze: Co-Designing and Refining Gaze Gestures with Users and Expert
- [0.522] TinyGaze: Lightweight Gaze-Gesture Recognition on Commodity Mobile Devices
- [0.456] Objestures: Everyday Objects Meet Mid-Air Gestures for Expressive Interaction
