<!-- tags: prompt-engineering, multilingual, tokenization, Korean, instruction-following, research -->
# LLM 프롬프트 언어: 영어 vs 한국어 — 참조 요약

**조사일**: 2026-03-29

## 핵심 발견

### 토큰 효율
- 한국어는 영어 대비 약 **4~5배** 토큰 소비 (BPE 구조상 한글 각 글자가 1~2토큰)
- 출처: Petrov et al. 2023 (arXiv 2305.15425) — 언어 간 토크나이저 불공평성

### 명령 이행(Instruction Following)
- 영어 시스템 프롬프트가 추론/명령 태스크에서 일반적으로 우위 (아랍어 대상 실험 기준)
- 콘텐츠 분류/감성 분석에서는 콘텐츠 언어 일치가 더 효과적
- 출처: arXiv 2409.07054 (Native vs Non-Native Language Prompting, 2024)

### 혼합 언어(Cross-Lingual) 접근
- CLP: 영어로 정렬 후 영어 CoT 추론 → MGSM 벤치마크에서 +4.5%p 향상
- EfficientXLang: 비영어 추론이 토큰 절약하면서 정확도 유지 가능 (Microsoft Research, 2025)

### Anthropic 공식 입장
- 언어 자동 감지하지만 명시적 지정 권장
- 원본 스크립트 제출 권장 (음역 비추천)
- "영어 프롬프트가 더 낫다"는 공식 권고 없음
- 출처: https://platform.claude.com/docs/en/build-with-claude/multilingual-support

## 주요 출처 URL
- arXiv 2409.07054: https://arxiv.org/abs/2409.07054
- arXiv 2305.15425: https://arxiv.org/abs/2305.15425
- EfficientXLang: https://arxiv.org/abs/2507.00246
- Ryan Stenhouse: https://ryanstenhouse.dev/why-your-llm-prompts-should-match-your-content-language/
- Multilingual Survey 2025: https://arxiv.org/html/2505.11665v1

## Null Results
- 한국어 직접 대상 영어 vs 한국어 프롬프트 instruction following 비교 실험 논문: 미발견
- 에이전트 내부 영어/출력 한국어 분리 패턴의 통제 실험: 미발견
