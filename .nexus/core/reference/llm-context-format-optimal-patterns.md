<!-- tags: XML, markdown, prompt-format, additionalContext, hooks, skills, Claude Code, context-engineering -->
# LLM 컨텍스트 유형별 최적 포맷 패턴

**Searched:** 2026-03-29
**Artifact:** `.nexus/state/artifacts/llm-context-format-findings.md`

## Key Findings

### 정적 긴 문서 (700-2500 토큰)

- Anthropic 공식: XML 태그로 섹션 구분 권장 (`<instructions>`, `<context>`, `<role>` 등)
- 분석 과제에서 XML 포맷이 Markdown 단독 대비 **12% 준수율 향상** (비공식 측정)
- XML은 Markdown 대비 ~80% 토큰 오버헤드 발생
- 공식 SKILL.md 패턴: **YAML frontmatter + Markdown body** (전체 XML wrapper 없음)
- Claude Code 내부 시스템 프롬프트: Markdown 기반, 조건부 모듈 조합

### 동적 짧은 메시지 (additionalContext, 1-5줄)

- 공식 명세: `additionalContext` 필드는 **plain text string**
- XML 요구 없음. 단, Claude Code 내부는 `<system-reminder>` XML 태그 패턴 실사용 중
- Prefix 패턴([NEXUS] 등)에 대한 공식 데이터 없음
- 짧은 메시지에서 XML wrapper 추가 시 오버헤드 비율이 상대적으로 커짐

### Claude Code 실제 패턴 (OMC, 공식 스킬)

- SKILL.md, OMC 에이전트 모두 YAML frontmatter + Markdown body
- 스킬 활성화 메타: `<command-message>`, `<command-name>` XML 태그
- 스킬 본문(모델에 전달): Markdown
- `additionalContext` plain text → "discretely" 주입 (transcript에 덜 노출)

## Source URLs

- https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
- https://code.claude.com/docs/en/hooks
- https://code.claude.com/docs/en/skills
- https://arxiv.org/html/2411.10541v1
- https://algorithmunmasked.com/2025/05/14/mastering-claude-prompts-xml-vs-markdown-formatting-for-optimal-results/
- https://leehanchung.github.io/blogs/2025/10/26/claude-skills-deep-dive/
- https://github.com/Piebald-AI/claude-code-system-prompts
