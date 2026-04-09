# Claude Code 서브에이전트 Resume (실측 검증)

**날짜**: 2026-04-09
**검증**: 같은 부모 세션 내 종료된 서브에이전트를 `SendMessage`로 부활 → 전체 컨텍스트 100% 복원 확인

## 핵심 발견

같은 부모 세션 내에서 **종료(completed) 상태의 서브에이전트를 재개**할 수 있다. 이전 대화·도구 호출·추론이 전부 보존된 채로 정확히 멈춘 지점부터 이어진다.

## 결정적 차이: `name` vs `agentId`

| to 필드 | 동작 | 용도 |
|---------|------|------|
| `name` (e.g. `"memory-test"`) | 인박스 전달만. 종료된 에이전트는 깨어나지 않음 | **running 중**인 팀메이트 통신용 |
| `agentId` (e.g. `"a51a882135212661f"`) | `"resumed from transcript in the background"` 트리거 | **종료된 에이전트 부활**용 |

→ SendMessage 도구 설명의 "Refer to teammates by name, never by UUID"는 팀원 간 통신 컨벤션일 뿐. **Lead가 종료된 서브에이전트를 부활시키려면 agentId가 필수**.

## 작동 흐름

```
Agent({name, prompt}) → 실행 → 종료 → agentId 반환
         ↓
SendMessage({to: agentId, message: "..."})
         ↓
시스템: "Agent X had no active task; resumed from transcript in the background"
         ↓ (비동기, 백그라운드 실행)
<task-notification status="completed"> 자동 배달
```

## 기술적 특성

- **UUID 체인 유지**: 새 메시지의 `parentUuid`가 이전 응답 `uuid`를 가리킴 → 동일 대화 트리
- **Prompt cache 활용**: resume 시 이전 컨텍스트가 `cache_creation_input_tokens`로 재구성, 신규 `input_tokens`는 메시지 본문만
- **실측 비용**: 13.6k 토큰 복원 + 2.2초 지연 (테스트 케이스 기준)
- **Live 관찰 가능**: `/private/tmp/claude-{uid}/-{cwd-slug}/{sessionId}/tasks/{agentId}.output` jsonl 파일을 Read로 직접 읽으면 완료 알림 전에도 결과 확인 가능

## 실전 사용법

```
# 1. 서브에이전트 생성
Agent({name: "researcher", prompt: "..."})
# → agentId: "abc123..." 반환

# 2. 종료된 에이전트 다시 활성화
SendMessage({to: "abc123...", message: "추가 질문"})
# → 전체 컨텍스트 복원된 채 응답 생성 (비동기)
```

## 제약

- **세션 경계 불가**: `--continue`/`--resume`로 부모 세션을 재개해도 서브에이전트는 자동 복구 안 됨 (공식 문서: "No session resumption with in-process teammates")
- **CLI 직접 호출 불가**: `claude --resume-agent <id>` 같은 옵션은 존재하지 않음
- **중첩 불가**: 서브에이전트는 또 다른 서브에이전트를 생성할 수 없음
- **jsonl은 사실상 로그**: `~/.claude/projects/.../subagents/agent-{id}.jsonl`는 공식 외부 API 없음. 30일 후 자동 삭제
- **전제 조건**: `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` 활성화 필요

## 실전 활용 시나리오

1. **긴 리서치 이어가기** — 리서처 서브에이전트가 1차 조사 → 결과 본 후 추가 질문을 같은 agentId로 이어감 (재탐색 비용 없음)
2. **단계적 검증** — 엔지니어가 코드 작성 → 테스터가 검증 → 엔지니어 다시 깨워서 수정 요청 (각자 컨텍스트 유지)
3. **대화형 QA** — 무거운 컨텍스트 로드(대용량 파일 분석)를 한 번만 하고, 후속 질문은 resume으로 cache 재활용
