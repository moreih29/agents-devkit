# ADR: 부트스트래핑 전략 (omc → Lattice 전환)

## 상태
확정 (2026-03-19)

## 맥락
Lattice는 Claude Code 오케스트레이션 플러그인이다. 개발 도구 자체를 개발해야 하므로, "무엇으로 개발하는가"가 중요하다. 현재 omc가 설치되어 있다.

## 결정
3단계 부트스트래핑으로 전환한다.

### Stage 0: omc로 Lattice MVP 개발
- omc의 autopilot/ralph/ultrawork 활용하여 Lattice Phase 1 구현
- 별도 테스트 프로젝트에서 Lattice 플러그인 설치/검증
- **완료 조건**: Phase 1의 5가지 (매니페스트, Gate 훅, MCP 서버, 에이전트 5개, Sustain 스킬)가 동작

### Stage 1: 프로젝트 레벨에서 omc 비활성화 + Lattice 활성화
- **omc를 삭제하지 않는다.** 프로젝트 `.claude/settings.json`에서 비활성화:
```json
{ "plugins": { "omc": { "enabled": false } } }
```
- Lattice 플러그인을 프로젝트 레벨로 설치
- `.claude/lattice/knowledge/`에 Lattice 프로젝트 자체의 knowledge 기록
- **장점**: 다른 프로젝트에서는 omc가 그대로 동작. 전환이 양방향으로 가능.
- **확인 필요**: Claude Code가 프로젝트 레벨에서 글로벌 플러그인의 훅을 완전히 비활성화하는지 (Phase 1 구현 시 실제 테스트)

### Stage 2: Lattice로 Lattice 개발 (Dogfooding)
- Phase 2, Phase 3를 Lattice 자체로 개발
- 불편한 점을 즉시 수정 (자기 개선 루프)
- 이것이 최고의 품질 검증

## 근거
- 부트스트래핑은 도구 진화의 자연스러운 과정 (C 컴파일러를 C로 작성하는 원리)
- omc 의존을 최소화하려면 MVP를 빠르게 완성하고 전환해야 함
- Dogfooding이 설계 결함을 가장 빠르게 발견하는 방법

## 위험 요소
1. **MVP가 불완전할 때 전환하면**: 작업 효율이 omc보다 떨어질 수 있음
   - 완화: Stage 1 전환 전 별도 프로젝트에서 충분히 검증
2. **omc 전환 후 복구**: 프로젝트 레벨 설정이므로 `"omc": { "enabled": true }`로 즉시 복구 가능. 위험도 낮음.
3. **Lattice 버그로 개발 중단**: Lattice 자체에 버그가 있으면 수정이 어려울 수 있음
   - 완화: Gate 훅만 제거하면 기본 Claude Code로 작업 가능 (graceful degradation)

## 대안
1. **omc를 계속 사용하고 Lattice는 별도 배포만** → dogfooding 불가, 품질 검증 약화. 기각.
2. **두 플러그인 동시 활성화** → 같은 훅 이벤트에 이중 등록되어 충돌. 기각. (단, 프로젝트 레벨에서 한쪽을 비활성화하면 공존 자체는 가능.)
3. **omc를 글로벌에서 삭제** → 다른 프로젝트에서 omc를 못 씀. 불필요한 파괴. 기각.
4. **처음부터 Lattice 없이 순수 Claude Code로 개발** → 오케스트레이션 없이 개발하면 느림. 기각.
