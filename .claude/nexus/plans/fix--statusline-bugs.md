# fix--statusline-bugs

## 목표

상태라인 Line 2 깜빡임 + Line 3 에이전트 불일치 수정.

## 변경 범위

| 파일 | 변경 |
|------|------|
| `src/statusline/statusline.ts` | Bug 1: null-safe Line 2 + atomic cache write. Bug 2: 에이전트 이름 정규화 (표시용) |
| `src/hooks/tracker.ts` | Bug 2: active 배열 중복 허용 + stop시 splice + 이름 정규화 (저장 시점) |

## 단계별 구현

### Step 1-A: buildLine2() null-safe 구조

`getUsage()`가 null이어도 동일한 3-세그먼트 구조(`ctx | 5h 0% | 7d 0%`) 유지.

```typescript
// 변경 전
if (!usage || !usage.json) return ctx;
// 변경 후
if (!usage || !usage.json) {
  return `${ctx} ${SEP} ${coloredMeter('5h', 0, BAR_WIDTH)} ${SEP} ${coloredMeter('7d', 0, BAR_WIDTH)}`;
}
```

### Step 1-C: atomic cache write

`triggerBackgroundFetch()` 셸 스크립트에서 임시파일→rename:

```
printf ... > "${USAGE_CACHE_PATH}.tmp" && mv "${USAGE_CACHE_PATH}.tmp" "${USAGE_CACHE_PATH}"
```

동기 호출 경로(`writeFileSync`)도 동일하게 tmp→rename.

### Step 2-N: 에이전트 이름 정규화 (tracker.ts + statusline.ts)

공통 정규화 함수:
```typescript
function normalizeAgentName(name: string): string {
  return name.replace(/^(nexus|claude-nexus):/, '');
}
```

적용 위치:
- `tracker.ts` handleSubagentStart/Stop — 저장 시점에서 정규화 (canonical form)
- `statusline.ts` buildLine3() — 표시 시점에서도 방어적 정규화

### Step 2-B: active 배열 중복 허용

```typescript
// handleSubagentStart — includes 체크 제거
record.active.push(name); // 항상 push

// handleSubagentStop — filter→splice
const idx = record.active.indexOf(name);
if (idx >= 0) record.active.splice(idx, 1); // 첫 번째만 제거
```

## 삭제된 단계

- ~~Step 1-B (메모리 캐시)~~: statusline은 매 호출마다 새 프로세스 → 메모리 캐시 무의미
- ~~Step 2-A (raw 로깅)~~: 진단용. 정규화로 대체

## 테스트

1. `bun run dev` 빌드 오류 없음
2. `bash test/e2e.sh` 전체 통과
3. 캐시 삭제 후 statusline 실행 → 3-세그먼트 구조 유지 확인
4. SubagentStart 동일 이름 2회 → active에 2개, Stop 1회 → 1개 남음

## 완료 기준

- Line 2: usage null 시에도 `ctx | 5h | 7d` 구조 고정
- Line 2: 캐시 write race 제거 (atomic)
- Line 3: 동일 에이전트 복수 spawn 시 정확한 카운트
- Line 3: `nexus:builder` → `builder`로 표시
