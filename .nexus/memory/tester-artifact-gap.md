# Tester 검증 시 산출물 artifact 부재 이슈

**날짜**: 2026-04-10
**출처**: resume_tier Phase 1 [run] 사이클에서 발견된 운영 갭

## 문제

researcher 같은 정보 수집 에이전트가 산출물을 **task notification(텍스트 응답)으로만 반환**하면, tester가 acceptance 검증 단계에서 파일을 찾을 수 없어 검증이 중단된다. tester는 ephemeral 읽기 전용이라 task notification 내용을 직접 받을 수 없고, Read 도구로 파일만 검증할 수 있다.

## 실측 사례

resume_tier Phase 1 사이클 (2026-04-10):

- **Task 5**: Claude Code SubagentStop 훅 페이로드 조사 (owner: researcher)
- Researcher가 200-400단어 보고서를 task notification으로 반환 → Lead가 직접 평가
- Tester 스폰 → 다른 4개 task 검증은 진행했으나 task 5에서 "보고서 artifact를 찾을 수 없음"으로 중단
- Lead spot check + bun run dev 재실행으로 우회 검증 완료

## 권장 패턴

비코드 산출물 중 **검증이 필요한 것**은 파일로도 저장:

1. **권장 위치**: `.nexus/reference/<topic>.md` 또는 `.nexus/artifacts/<task-id>-<topic>.md`
2. **저장 도구**: writer가 사용하는 `nx_artifact_write` MCP 도구 패턴 차용 가능
3. **acceptance 명시**: task의 acceptance 필드에 "보고서 파일 위치"를 명시하면 tester가 그 파일을 Read로 검증 가능
4. **task notification은 요약**: 텍스트 응답은 Lead 즉시 판단용 요약으로 두고, 검증 가능한 1차 산출물은 파일에 기록

## 향후 개선 후보

- **nx-run SKILL.md**에 "비코드 산출물의 artifact 저장 의무" 규칙 추가
- 또는 **agents/researcher.md**에 "검증 대상 산출물은 항상 `.nexus/reference/`에 저장" 가이드 추가
- Phase 2 작업 또는 별도 [plan] 의제로 다룰 수 있음

## 임시 회피 (Phase 1 적용)

Lead가 직접 spot check + 빌드 재실행으로 검증. tester가 ephemeral tier라 resume 불가, 새 tester 스폰은 비효율 → Lead 직접 검증이 가장 합리적.
