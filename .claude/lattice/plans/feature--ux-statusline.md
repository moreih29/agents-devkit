# Plan: feature/ux-statusline

## 목표
Lattice 내장 상태라인 구현 — 플러그인 설치만으로 풍부한 상태 정보 표시.

## 완료 조건
- [ ] scripts/statusline.cjs 구현 (Lattice 런타임 파일 직접 읽기)
- [ ] 구독(OAuth) + API 키 사용량 분기 표시
- [ ] preset 3단계 (minimal/standard/full)
- [ ] E2E 테스트
- [ ] 빌드 + 캐시 동기화

## 설계

### 데이터 소스 (transcript 파싱 제거)

| 정보 | 소스 | 비고 |
|------|------|------|
| 모델명 | stdin JSON (`display_name`) | Claude Code 제공 |
| 컨텍스트 사용량 | stdin JSON (`used_percentage`) | Claude Code 제공 |
| 프로젝트/브랜치 | git 명령 | 기존 로직 |
| 세션 시간 | stdin JSON (`transcript_path`) → mtime | 기존 로직 |
| 에이전트 활성/이력 | `.lattice/state/sessions/{id}/agents.json` | Tracker 제공 |
| 워크플로우 상태 | `.lattice/state/sessions/{id}/sustain|pipeline|parallel.json` | Gate 제공 |
| 도구 호출 수 | `.lattice/state/sessions/{id}/whisper-tracker.json` | Pulse 제공 |
| 태스크 현황 | `.claude/lattice/tasks/*.json` | Task MCP 제공 |
| 구독 사용량 | OAuth API (`/api/oauth/usage`) | 기존 로직 재사용 |
| API 사용량 | Anthropic Admin API 또는 환경 감지 | API 모드 분기 |

### 표시 구성

```
[minimal]
◆Lattice  Opus 4.6  │  project  │  main (+2~1)  │  12:34 (15m)

[standard] — minimal + 사용량
◆Lattice  Opus 4.6  │  project  │  main (+2~1)  │  12:34 (15m)
ctx ██████░░░░ 52% │ 5h ██░░░ 20% ~14:30 │ 7d █░░░░ 8% ~Thu 09:00

[full] — standard + 워크플로우/에이전트/태스크
◆Lattice  Opus 4.6  │  project  │  main (+2~1)  │  12:34 (15m)
ctx ██████░░░░ 52% │ 5h ██░░░ 20% ~14:30 │ 7d █░░░░ 8% ~Thu 09:00
▶ cruise (implement 3/5) │ 🤖 artisan×2 │ 📝 3 tasks │ 🔧 45 tools
```

API 모드일 때 (구독 아님):
```
ctx ██████░░░░ 52% │ API mode │ 🔧 45 tools
```

### Preset 설정
`.claude/settings.local.json`에서:
```json
{
  "statusLine": {
    "type": "command",
    "command": "node \"$CLAUDE_PLUGIN_ROOT\"/scripts/statusline.cjs"
  }
}
```

Preset은 `.lattice/statusline-preset.json` (또는 환경변수 `LATTICE_STATUSLINE`):
- `minimal` | `standard` (기본) | `full`

### CJS vs Shell
Node CJS로 구현. 이유:
- JSON 파싱이 핵심 — bash grep/sed보다 안정적
- `.lattice/` 경로 로직 재사용 가능 (paths.ts 번들에 포함)
- 기존 statusline.sh의 OAuth 로직만 포팅

## 구현 순서
1. `src/statusline/statusline.ts` — 메인 로직
2. `esbuild.config.mjs` — statusline.cjs 빌드 추가
3. E2E 테스트
4. 빌드 + 캐시 동기화
