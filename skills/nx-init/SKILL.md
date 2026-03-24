---
name: nx-init
description: Onboard a project to Nexus — auto-generate knowledge from existing docs.
disable-model-invocation: true
---
# Init

Onboard Nexus into an existing project — scan, triage, and restructure project knowledge for optimal context efficiency.

## Trigger
- Direct invocation: `/claude-nexus:nx-init`

## What It Does

Scans the existing project, triages documentation, and generates structured Nexus knowledge files — replacing scattered .md files with a clean, efficient knowledge base.

```
SCAN → TRIAGE → PROPOSE → GENERATE → VERIFY
```

## Prerequisites

- Nexus plugin must be installed and active
- `.claude/nexus/knowledge/` directory should NOT already have project-specific files (if it does, ask user if they want to re-init)

## Workflow

### Phase 1: SCAN (자동)

Gather all available project context:

**Project Structure:**
```
- List top-level directories and their purpose (src/, test/, docs/, config files)
- Identify language/framework (package.json, Cargo.toml, pyproject.toml, go.mod, etc.)
- Identify build system, test framework, linter
- Count files by type for scale understanding
```

**Existing Documentation:**
```
- CLAUDE.md (always loaded by Claude Code — most critical)
- README.md
- .claude/ directory contents (contexts, settings, etc.)
- docs/ directory if exists
- Any other .md files in project root
- .cursorrules, .github/copilot-instructions.md, etc. (other AI tool configs)
```

**Git Context:**
```
- Recent commit messages (last 20) for project activity pattern
- Branch structure for workflow understanding
- Contributors for team context
```

Output: A structured summary of everything found.

### Phase 2: TRIAGE (자동)

Classify every piece of existing documentation into 4 categories:

| Category | Meaning | Action |
|----------|---------|--------|
| **Essential** | Architecture, conventions, decisions that agents MUST know | → `knowledge/` |
| **Useful** | Tips, practices, context that helps but isn't critical | → `knowledge/` (condensed) |
| **Redundant** | Info that Nexus handles better (workflow instructions, agent tips) | → Skip |
| **Outdated** | Stale, auto-generated, or no longer relevant | → Skip |

**Triage Rules:**
- Code structure descriptions → Essential (architecture.md)
- Coding conventions, style rules → Essential (conventions.md)
- Architecture decisions with rationale → Essential (decisions/)
- Project goals, roadmap, team context → Useful (project-context.md)
- "How to use Claude" instructions → Redundant (Nexus replaces this)
- Auto-memory instructions, hook configs → Redundant
- Old TODO lists, resolved issues → Outdated
- Generated API docs → Outdated (can be regenerated)

### Phase 3: PROPOSE (사용자 상호작용)

Present the triage result using `AskUserQuestion`:

```
AskUserQuestion({
  questions: [
    {
      question: "CLAUDE.md 슬림화 방식을 선택해주세요.",
      header: "CLAUDE.md",
      multiSelect: false,
      options: [
        {
          label: "슬림화 (Recommended)",
          description: "핵심 지시사항만 유지, 나머지는 knowledge/로 이동",
          preview: "## 기존 CLAUDE.md (150줄)\n핵심 지시: 15줄\n프로젝트 지식: 100줄 → knowledge/로\n중복/불필요: 35줄 → 제거\n\n## 새 CLAUDE.md (20줄)\n- 핵심 지시사항 (15줄)\n- Nexus 연동 안내 (5줄)"
        },
        {
          label: "유지 + 추가만",
          description: "기존 CLAUDE.md 건드리지 않고 Nexus 연동만 추가"
        },
        {
          label: "완전 교체",
          description: "CLAUDE.md를 Nexus 전용으로 교체 (기존은 백업)"
        }
      ]
    },
    {
      question: "knowledge 파일로 이동할 항목을 확인해주세요.",
      header: "Knowledge",
      multiSelect: true,
      options: [
        { label: "architecture.md", description: "코드 구조, 기술 스택, 주요 의존성" },
        { label: "conventions.md", description: "코딩 규칙, 네이밍, 패턴" },
        { label: "project-context.md", description: "프로젝트 목적, 현재 상태, 팀 컨텍스트" }
      ]
    }
  ]
})
```

Note: The actual options should be populated based on SCAN/TRIAGE results, not hardcoded. The above is a template.

### Phase 4: GENERATE (자동)

Based on user approval:

1. **Backup existing CLAUDE.md:**
```
cp CLAUDE.md .claude/nexus/knowledge/original-claude-md.md
```

2. **Generate knowledge files** in `.claude/nexus/knowledge/`:
```
architecture.md:
  - # {Project Name} Architecture
  - ## Tech Stack (language, framework, build, test)
  - ## Directory Structure (with purpose annotations)
  - ## Key Dependencies
  - ## Entry Points

conventions.md:
  - # Coding Conventions
  - ## Style (from existing linter/prettier config + CLAUDE.md rules)
  - ## Naming Patterns (from code analysis)
  - ## Testing Conventions
  - ## Git/PR Conventions

project-context.md:
  - # Project Context
  - ## Purpose (from README/CLAUDE.md)
  - ## Current State (from git activity)
  - ## Team Context (if available)
  - ## Key Decisions (extracted from docs)
```

3. **Slim down CLAUDE.md** (if user chose slimming):
```markdown
# {Project Name}

{핵심 지시사항 — 기존에서 추출, 5-15줄}

## Nexus
- 프로젝트 지식: `.claude/nexus/knowledge/` 참조
- 아카이브: `.nexus/archives/` (로컬, 세션 독립)
- 원본 CLAUDE.md: `.claude/nexus/knowledge/original-claude-md.md`
```

4. **Add `.claude/nexus/` to git** if not already tracked.

### Phase 5: VERIFY (자동)

Quick validation:
1. All generated knowledge files are valid markdown
2. `nx_knowledge_read` can read them successfully
3. CLAUDE.md is valid and not empty
4. Original CLAUDE.md backup exists
5. Report: "Init 완료. knowledge N개 파일, CLAUDE.md X줄 → Y줄"

## Important Constraints

- NEVER delete existing files without user approval — always backup first
- If `.claude/nexus/knowledge/` already has files, ask before overwriting
- If CLAUDE.md has critical instructions (API keys, deploy commands), keep them in CLAUDE.md
- Don't extract secrets or credentials into knowledge files
- If the project has no CLAUDE.md, create a minimal one

## Re-init

If nexus knowledge already exists, `[init]` should:
1. Detect existing knowledge files
2. Ask: "기존 knowledge가 있습니다. 다시 초기화할까요?"
3. If yes: backup existing knowledge to `.claude/nexus/knowledge/backup-{date}/`
4. Re-run full workflow

