# claude-lattice

Claude Code용 에이전트 오케스트레이션 플러그인. 이 프로젝트는 Lattice 자체를 사용하여 개발한다 (부트스트랩).

- omc는 이 프로젝트에서 비활성화. Lattice 에이전트/스킬만 사용.
- 설계 문서: `.claude/lattice/knowledge/`
- 브랜치 계획: `.claude/lattice/plans/`
- 개발 사이클: `src/ 수정 → npm run dev (빌드+캐시동기화) → lattice-test에서 검증`
- E2E 테스트: `bash test/e2e.sh`
