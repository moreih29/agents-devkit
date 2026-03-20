# Plan: feature/session-cleanup-and-tasks

## 목표
세션 상태 정리 버그 수정 + 태스크 관리 MCP 도구 추가 + consult 스킬 추가.

## 완료 조건
- [x] SessionEnd에서 활성 워크플로우 상태 자동 정리
- [x] SessionStart에서 이전 세션 잔존 상태 방어적 정리
- [x] 태스크 관리 MCP 도구 (create, list, update, summary)
- [x] consult 스킬 (대화형 발산→수렴 워크플로우)
- [x] E2E 테스트 확장 (52개 통과)
- [x] 빌드 + 캐시 동기화
- [x] (추가) AST 테스트 분기 버그 수정

## Unit 1: 세션 상태 자동 정리 (버그 수정)

### 문제
- `handleSessionEnd()`가 `pass()`만 호출 — 활성 상태 파일 미정리
- 세션 비정상 종료 시 SessionEnd 자체 미호출 → 다음 세션에서 잔존 상태 간섭

### 수정
1. **`handleSessionEnd()`**: 현재 세션 디렉토리의 워크플로우 상태 파일(nonstop, pipeline, parallel) 삭제
2. **`handleSessionStart()`**: 이전 세션 ID를 읽어 잔존 상태 파일 정리 (방어적)

파일: `src/hooks/tracker.ts`

## Unit 2: 태스크 관리 MCP 도구

### 설계
멀티세션 작업 추적을 위한 태스크 CRUD. knowledge(git 추적)가 아닌 runtime state에 저장.

저장 위치: `.nexus/tasks/` (gitignore, 프로젝트 로컬)

```typescript
// .nexus/tasks/{id}.json
interface Task {
  id: string;           // 8-char UUID
  title: string;
  status: 'todo' | 'in_progress' | 'done' | 'blocked';
  description?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}
```

### MCP 도구 (4개)
- `nx_task_create({ title, description?, tags? })` → 태스크 생성
- `nx_task_list({ status?, tags? })` → 필터링 목록
- `nx_task_update({ id, status?, title?, description?, tags? })` → 상태/내용 변경
- `nx_task_summary()` → 요약 (todo/in_progress/done/blocked 카운트 + 진행 중 목록)

파일: `src/mcp/tools/task.ts`, `src/mcp/server.ts` 수정

## Unit 3: Consult 스킬

### 설계
사용자의 진짜 목적을 파악하고 더 나은 구성/도구를 제안하는 대화형 워크플로우.

핵심: `AskUserQuestion` 도구를 활용한 구조화된 선택지 제공.

워크플로우:
1. **탐색** — 요청 분석 + 코드베이스/knowledge 조사
2. **발산** — 가능한 접근법 도출 (2~4개)
3. **제안** — AskUserQuestion으로 선택지 제시 (preview 활용)
4. **수렴** — 선택 기반으로 상세 계획 수립
5. (선택) 바로 실행으로 전환 (auto/pipeline 연계)

파일: `skills/consult/SKILL.md`
키워드: `[consult]`, `consult`, `상담`, `어떻게 하면 좋을까`

Gate 확장: `src/hooks/gate.ts`에 consult 키워드 감지 추가

### 에이전트 vs 스킬 결정
**스킬**로 구현. 이유:
- consult는 "메인 세션이 사용자와 직접 대화"하는 흐름 — 서브에이전트로 위임 불가
- AskUserQuestion은 메인 컨텍스트에서만 호출 가능
- 별도 에이전트가 아닌, 메인 Claude의 행동 패턴을 지시하는 스킬이 적합

## Unit 4: E2E 테스트 + 빌드

- SessionEnd 상태 정리 테스트
- SessionStart 잔존 상태 정리 테스트
- 태스크 CRUD 테스트
- 빌드 + 캐시 동기화

## 구현 순서
```
Unit 1 (버그 수정) → Unit 2 (태스크) → Unit 3 (consult) → Unit 4 (테스트)
```
