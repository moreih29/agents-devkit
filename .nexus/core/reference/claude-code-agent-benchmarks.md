# Claude Code — Agent & Model Benchmarks

> 실험 일시: 2026-04-06 / Claude Code v2.1.92
> 실험 환경: macOS Darwin 25.3.0, Anthropic Max Plan
> 실험 방법: `claude -p` CLI 모드, `--output-format json`으로 정밀 측정
> 실험 프로젝트: `/tmp/hook-probe-test` (git init된 임시 프로젝트, README.md 1줄)

---

## 1. 서브에이전트 vs 팀 에이전트

### 태스크

"Explore 에이전트로 README.md 읽기" — 동일 태스크, `--model sonnet`

### 결과

| | 서브에이전트 | 팀 에이전트 |
|---|---|---|
| **Run 1** | wall=14.4s, api=13.3s, $0.080 | wall=5.8s, api=49.2s, $0.189 |
| **Run 2** | wall=12.7s, api=11.7s, $0.038 | wall=157.4s, api=129.9s, $0.443 (34 turns!) |
| **Run 3** | wall=11.4s, api=10.5s, $0.075 | wall=10.7s, api=138.7s, $0.349 |
| **평균** | **wall=12.8s, api=11.8s, $0.064** | **wall=58.0s, api=105.9s, $0.327** |
| **중앙값** | wall=12.7s | wall=10.7s |

### 분석

#### 서브에이전트 특성
- **안정적**: wall time 편차 작음 (11.4~14.4s)
- **저비용**: 평균 $0.064
- **단순 구조**: Lead → Agent → 결과 반환 (2 turns)
- **모델 사용**: sonnet (리드) + haiku (에이전트)

#### 팀 에이전트 특성
- **불안정**: wall time 편차 극심 (5.8~157.4s)
- **고비용**: 평균 $0.327 (서브에이전트 대비 **5.1배**)
- **병렬 API**: `api > wall` 가능 (api=49s인데 wall=5.8s → 동시 API 호출)
- **다중 턴**: TeamCreate → Agent → SendMessage → UserPromptSubmit → ... → TeamDelete
- **turn 폭주 위험**: Run 2에서 34 turns, 157초 소요 (팀 통신 오버헤드)

#### wall time vs api time 해석

```
서브에이전트:  wall ≈ api    (순차 실행)
팀 에이전트:   wall << api   (병렬 실행)
               wall >> api   (통신 대기/오버헤드)
```

팀 에이전트의 `api` 시간이 `wall`보다 훨씬 큰 것은 **리드와 에이전트가 동시에 API 호출**을 하기 때문.
실제 사용자 체감 시간은 `wall` (5.8~10.7s)로, 서브에이전트(11.4~14.4s)보다 빠를 수 있음.
단, 오케스트레이션 실패 시(Run 2) 극단적으로 느려짐.

### 모델 사용 패턴

#### 서브에이전트

| 모델 | 역할 | 토큰 |
|------|------|------|
| claude-sonnet-4-6 | 리드 (메인 세션) | in=4, out≈250 |
| claude-haiku-4-5 | 에이전트 (Explore) | in≈12, out≈280 |

#### 팀 에이전트

| 모델 | 역할 | 토큰 |
|------|------|------|
| claude-sonnet-4-6 | 리드 (메인 세션) | in≈40, out≈3400 (통신 오버헤드) |
| claude-haiku-4-5 | 에이전트 (teammate) | in≈13, out≈430 |

**핵심 차이:** 팀 에이전트에서 리드의 output 토큰이 **13배 이상** 증가 (250 → 3400). SendMessage, TeamCreate/Delete, 팀 통신 메시지 처리 때문.

### 서브에이전트 병렬 vs 팀 에이전트

서브에이전트도 한 메시지에서 여러 Agent를 동시 호출하여 **병렬 실행 가능**:

```
서브에이전트 병렬:
  Agent(Explore, "파일 구조")  ─┐
  Agent(researcher, "API 조사") ─┼─ 동시 실행, 독립적, 결과만 반환
  Agent(architect, "설계 검토") ─┘

팀 에이전트:
  TeamCreate → Agent들 → SendMessage로 상호 소통 → TeamDelete
```

| 항목 | 서브에이전트 병렬 | 팀 에이전트 |
|------|-----------------|------------|
| 병렬 실행 | O | O |
| 에이전트 간 통신 | X (독립적) | O (SendMessage) |
| 리드와 중간 소통 | X (완료 시에만 결과 반환) | O (실시간) |
| 오버헤드 | 낮음 | 높음 (비용 5배) |
| 안정성 | 높음 (turn 고정) | 낮음 (turn 폭주 위험) |

### 권장 사용 시나리오

| 시나리오 | 권장 | 이유 |
|---------|------|------|
| 단순 조회/탐색 | 서브에이전트 | 빠르고 안정적이고 저렴 |
| 단일 태스크 위임 | 서브에이전트 | 팀 오버헤드 불필요 |
| 독립적 병렬 작업 | **서브에이전트 병렬** | 팀 오버헤드 없이 동시 실행 가능 |
| 에이전트 간 협업/조율 필요 | 팀 에이전트 | SendMessage로 직접 통신, 중간 보고 가능 |
| 비용 민감 | 서브에이전트 | 5배 저렴 |

---

## 2. 모델별 속도/비용 비교

### 태스크

"README.md 읽고 내용 요약해줘" — `--allowedTools "Read"`, 에이전트 없이 직접 실행

### 결과

| 모델 | Run 1 | Run 2 | Run 3 | 평균 wall | 평균 api | 평균 비용 |
|------|-------|-------|-------|----------|---------|----------|
| **haiku** | 10.8s | 5.5s | 7.4s | **7.9s** | **7.1s** | **$0.053** |
| **sonnet** | 6.6s | 6.4s | 7.8s | **6.9s** | **6.2s** | **$0.032** |
| **opus** | 6.5s | 20.7s | 7.3s | **11.5s** | **10.7s** | **$0.123** |

### 상세 토큰 사용량

#### Haiku (claude-haiku-4-5-20251001)

| Run | input | output | cache_read | cache_write | 비용 |
|-----|-------|--------|------------|-------------|------|
| 1 | 18 | 359 | 37,788 | 38,030 | $0.0531 |
| 2 | 18 | 326 | 37,788 | 38,030 | $0.0530 |
| 3 | 18 | 330 | 37,788 | 38,050 | $0.0530 |

#### Sonnet (claude-sonnet-4-6)

| Run | input | output | cache_read | cache_write | 비용 |
|-----|-------|--------|------------|-------------|------|
| 1 | 4 | 135 | 23,744 | 7,272 | $0.0364 |
| 2 | 4 | 134 | 23,744 | 7,272 | $0.0364 |
| 3 | 4 | 133 | 27,323 | 3,693 | $0.0241 |

#### Opus (claude-opus-4-6)

| Run | input | output | cache_read | cache_write | 비용 |
|-----|-------|--------|------------|-------------|------|
| 1 | 4 | 138 | 0 | 31,282 | $0.1990 |
| 2 | 4 | 138 | 15,584 | 15,698 | $0.1094 |
| 3 | 4 | 138 | 24,014 | 7,268 | $0.0609 |

### 분석

#### 속도 순위 (wall time 평균)

```
1위: sonnet (6.9s) — 가장 빠르고 안정적
2위: haiku  (7.9s) — 예상보다 느림
3위: opus   (11.5s) — Run 2 이상치 제외 시 6.9s로 sonnet과 동등
```

#### 비용 순위 (평균)

```
1위: sonnet ($0.032) — 가장 저렴
2위: haiku  ($0.053) — sonnet보다 1.7배 비쌈
3위: opus   ($0.123) — sonnet보다 3.8배 비쌈
```

#### Haiku가 Sonnet보다 비싼 이유

- Haiku의 `cache_write`가 매 실행마다 **38,000 토큰** (시스템 프롬프트 전체 캐시)
- Sonnet의 `cache_write`는 **7,272 토큰** (기존 캐시 재사용)
- Haiku의 context window가 200K로 동일하지만, 캐시 히트율이 낮음
- `cache_creation` 비용이 `cache_read`보다 훨씬 높아 Haiku의 총 비용이 상승

#### Opus의 캐시 warming 패턴

- Run 1: cache_read=0, cache_write=31,282 → 완전 cold start ($0.199)
- Run 2: cache_read=15,584, cache_write=15,698 → 부분 캐시 ($0.109)
- Run 3: cache_read=24,014, cache_write=7,268 → 대부분 캐시 ($0.061)
- **3회차에서 sonnet 수준 비용 도달** — 반복 사용 시 비용 크게 감소

#### Output 토큰 비교

| 모델 | 평균 output tokens |
|------|-------------------|
| haiku | 338 |
| sonnet | 134 |
| opus | 138 |

Haiku가 **2.5배 많은 출력** 생성 → 더 장황한 응답. Sonnet과 Opus는 비슷한 간결함.

### 모델 선택 가이드

| 요구사항 | 권장 모델 | 이유 |
|---------|----------|------|
| 빠른 응답 + 저비용 | **sonnet** | 속도 1위, 비용 1위 |
| 에이전트 내부 작업 | 에이전트 타입에 따라 다름 | Explore는 haiku, 다른 타입은 별도 설정 가능 |
| 복잡한 추론 | **opus** | 캐시 warm 후 비용 합리적, 추론 품질 최고 |
| 반복적 작업 | **opus** (캐시 warm 후) | Run 3에서 $0.061까지 하락 |
| 첫 실행 비용 최소화 | **sonnet** | cold start에서도 $0.036 |

---

## 3. 에이전트 내부 모델 할당

`--model` 플래그는 **리드 세션**의 모델만 지정. 에이전트 내부 모델은 에이전트 타입별 설정에 따름.

### 실험에서 관측된 모델 할당

| 리드 모델 | Explore 에이전트 모델 | 비고 |
|----------|---------------------|------|
| sonnet | **haiku** | Explore는 "Fast agent"로 haiku 사용 |
| opus | *(미측정)* | |

**주의:** Explore가 haiku를 사용하는 것은 **Explore 에이전트 타입의 설정**이지, 모든 에이전트의 공통 정책이 아님. 에이전트 타입별로 기본 모델이 다를 수 있음:

- **Explore**: haiku (빠른 탐색 목적)
- **기타 커스텀 에이전트** (`claude-nexus:engineer` 등): 에이전트 정의에 따라 다름
- **일반 Agent(subagent_type 미지정)**: 리드 모델 상속 (추정, 미검증)

에이전트 내부 모델을 명시적으로 변경하려면 Agent 도구의 `model` 파라미터 사용:
```json
{"subagent_type": "Explore", "model": "sonnet"}
```

---

## 4. JSON 출력 필드 레퍼런스

`claude -p --output-format json` 반환값:

```json
{
  "type": "result",
  "subtype": "success",
  "is_error": false,
  "duration_ms": 14350,          // wall clock time (ms)
  "duration_api_ms": 13347,      // 총 API 호출 시간 (병렬 시 wall보다 클 수 있음)
  "num_turns": 2,                // 대화 턴 수
  "result": "응답 텍스트",
  "stop_reason": "end_turn",
  "session_id": "uuid",
  "total_cost_usd": 0.08,       // 총 비용 (USD)
  "usage": {
    "input_tokens": 4,
    "cache_creation_input_tokens": 15704,
    "cache_read_input_tokens": 15453,
    "output_tokens": 225,
    "service_tier": "standard",
    "speed": "standard"
  },
  "modelUsage": {
    "claude-sonnet-4-6": {
      "inputTokens": 4,
      "outputTokens": 225,
      "cacheReadInputTokens": 15453,
      "cacheCreationInputTokens": 15704,
      "webSearchRequests": 0,
      "costUSD": 0.0669,
      "contextWindow": 200000,
      "maxOutputTokens": 32000
    },
    "claude-haiku-4-5-20251001": {
      "inputTokens": 8,
      "outputTokens": 157,
      "cacheReadInputTokens": 25063,
      "cacheCreationInputTokens": 28286,
      "costUSD": 0.0387,
      "contextWindow": 200000,
      "maxOutputTokens": 32000
    }
  },
  "permission_denials": [],
  "terminal_reason": "completed",
  "fast_mode_state": "off"
}
```

### 주요 필드 해석

| 필드 | 설명 |
|------|------|
| `duration_ms` | 사용자 체감 시간. 팀 에이전트에서는 병렬 처리로 `duration_api_ms`보다 작을 수 있음 |
| `duration_api_ms` | 모든 API 호출의 합산 시간. 병렬 호출 포함 |
| `num_turns` | 대화 턴 수. 팀 에이전트에서 SendMessage마다 1턴 증가 |
| `total_cost_usd` | 전체 비용 (리드 + 에이전트 모두 포함) |
| `modelUsage` | 모델별 상세 사용량. 에이전트가 다른 모델 사용 시 키 분리됨 |
| `service_tier` | `"standard"` 또는 `"priority"` |
| `speed` | `"standard"` 또는 `"fast"` (fast mode 활성 시) |
| `terminal_reason` | `"completed"`, `"interrupted"`, `"budget_exceeded"` 등 |

---

## 5. 팀 런타임 상태 관리

> 실험 검증: 2026-04-06

### 팀 이름 스코프

**팀 이름은 머신 글로벌.** `~/.claude/teams/{team_name}/`에 저장되므로 같은 머신의 모든 세션이 같은 네임스페이스를 공유.

- 다른 세션에서 동일 이름 팀 생성 시: **race condition 위험** (config.json이 덮어씌워짐)
- TeamDelete 없이 세션 종료 시: 디렉토리 잔류
- `default` 팀: name 지정 서브에이전트의 inbox 저장소로 자동 사용됨

### 팀 상태 파일 구조

TeamCreate 시 다음 구조가 생성됨:

```
~/.claude/teams/{team_name}/
  config.json                    # 팀 설정 — 런타임 상태 포함, 수동 편집 금지
  inboxes/
    {agent_name}.json            # 에이전트별 메시지 inbox
```

### TeamCreate 반환값

```json
{
  "team_name": "probe-team",
  "team_file_path": "/Users/kih/.claude/teams/probe-team/config.json",
  "lead_agent_id": "team-lead@probe-team"
}
```

### Agent(team_name=...) 반환값

```
Spawned successfully.
agent_id: explorer@probe-team
name: explorer
team_name: probe-team
The agent is now running and will receive instructions via mailbox.
```

**팀 에이전트의 agent_id 형식:** `{name}@{team_name}` (예: `explorer@probe-team`)

### Inbox 파일 형식

`~/.claude/teams/{team_name_or_default}/inboxes/{agent_name}.json`:

```json
[
  {
    "from": "team-lead",
    "text": "메시지 본문",
    "summary": "요약",
    "timestamp": "2026-04-06T07:15:45.512Z",
    "read": false
  }
]
```

### 에이전트 메타데이터

`~/.claude/projects/{project}/subagents/agent-{agent_id}.meta.json`:

| 에이전트 유형 | meta.json 내용 |
|-------------|----------------|
| 서브에이전트 | `{"agentType":"Explore","description":"프로젝트 파일 목록 탐색"}` |
| 팀 에이전트 | `{"agentType":"explorer"}` (description 없음) |

### TeamDelete 동작

```json
{"success": true, "message": "Cleaned up directories and worktrees for team \"probe-team\"", "team_name": "probe-team"}
```

`~/.claude/teams/{team_name}/` 디렉토리 삭제. 단, `default` 팀의 inbox는 유지될 수 있음.

---

## 6. 서브에이전트 재개 (SendMessage)

> 실험 검증: 2026-04-06 / 3가지 시나리오 테스트

### 문서상 동작

Agent 도구 설명: "To continue a previously spawned agent, use SendMessage with the agent's ID or name as the `to` field. The agent resumes with its full context preserved."

### 실험 설계

서브에이전트(name="scout")로 README.md 읽기 → 세션 종료 → `--resume`로 재개 → .gitignore 읽기 요청

### 시나리오 A: `--resume` + SendMessage

```bash
claude -p "scout 에이전트한테 .gitignore 읽어달라고 해줘" --resume {session_id}
```

**결과: 재개 실패**
- SendMessage(to: "scout") 호출 → `{"success": true, "message": "Message sent to scout's inbox"}`
- `~/.claude/teams/default/inboxes/scout.json`에 `read: false`로 저장
- SubagentStart 발생하지 않음 — 에이전트 프로세스가 죽어 있음
- 리드가 "응답을 기다리고 있습니다"로 종료

### 시나리오 B: `--resume` + "이전 에이전트 다시 스폰해줘"

```bash
claude -p "Explore 에이전트를 name='scout'으로 다시 스폰해서 .gitignore 읽어줘" --resume {session_id}
```

**결과: 재개 실패**
- Claude가 "이전 scout 에이전트가 아직 활성 상태"라고 잘못 판단
- Agent 대신 SendMessage를 선택 → 시나리오 A와 동일하게 실패
- **Claude는 이전 에이전트가 살아있다고 착각하여 SendMessage로 빠짐**

### 시나리오 C: `--resume` + Agent 강제 (SendMessage 금지)

```bash
claude -p "Agent 도구로 Explore 에이전트를 name='scout'으로 스폰해서 .gitignore 읽어줘. SendMessage 사용 금지" \
  --resume {session_id} --allowedTools "Agent,Read,Glob,Bash"
```

**결과: 작동하지만 컨텍스트 미보존**
- 새 Agent 스폰 → SubagentStart (agent_id: `af27d...` ≠ 이전 `ad180...`)
- .gitignore 정상 읽기 → 결과 반환
- 하지만 **새 agent_id**, **새 transcript** — 이전 대화 컨텍스트 없음
- 이전 에이전트와 같은 name이지만 완전히 별개의 에이전트

### 시나리오 비교

| 시나리오 | 결과 | SubagentStart | 컨텍스트 유지 |
|---------|------|--------------|-------------|
| A. SendMessage | inbox에 저장만 됨 | X | - |
| B. 자연어 요청 | Claude가 SendMessage로 빠짐 | X | - |
| C. Agent 강제 스폰 | 새 에이전트로 작동 | O (새 ID) | **X** |

### 결론

**`-p` + `--resume` 모드에서 서브에이전트 컨텍스트 재개는 불가능.**

```
완료된 에이전트 → 프로세스 사망 → SendMessage는 inbox 저장만
                              → Agent 재스폰은 새 에이전트 (이전 컨텍스트 없음)
```

| 상황 | SendMessage | Agent 재스폰 | 컨텍스트 유지 |
|------|-------------|------------|-------------|
| 팀 에이전트 실행 중 | inbox → 읽고 처리 | - | O |
| 서브에이전트 완료 후 `--resume` | inbox 저장만 | 새 ID로 스폰 | **X** |
| interactive 세션 내 idle 에이전트 | 실용적으로 불가 | - | **X** |

**idle 에이전트 재개가 현실적으로 불가능한 이유:** 서브에이전트는 스폰→작업→결과반환→즉시종료의 단일 사이클로 동작하여 "idle 대기" 상태가 존재하지 않음. 팀 에이전트의 TeammateIdle도 곧바로 shutdown 프로토콜로 넘어가는 것이 일반적.

**에이전트 컨텍스트 재사용 현실적 방법:** 이전 에이전트의 결과를 새 에이전트 프롬프트에 직접 포함하는 것이 유일한 방법.

### Inbox 파일 위치 규칙

- 팀 에이전트: `~/.claude/teams/{team_name}/inboxes/{agent_name}.json`
- 서브에이전트 (name 지정): `~/.claude/teams/default/inboxes/{name}.json`
- `default` 팀의 inbox가 서브에이전트의 SendMessage 메시지 저장소로 사용됨

### 에이전트 Transcript 구조

같은 세션에서 같은 name으로 여러 번 스폰해도 각각 별도 transcript:

```
~/.claude/projects/{project}/{session_id}/subagents/
  agent-{agent_id_1}.jsonl       # 첫 번째 scout (README.md)
  agent-{agent_id_1}.meta.json
  agent-{agent_id_2}.jsonl       # 두 번째 scout (.gitignore) — 독립 컨텍스트
  agent-{agent_id_2}.meta.json
```

---

## 실험 한계

1. **소규모 태스크**: README.md 1줄 읽기는 매우 단순. 복잡한 태스크에서 결과가 다를 수 있음
2. **3회 반복**: 통계적 유의성을 위해 더 많은 반복 필요
3. **캐시 영향**: 연속 실행 시 캐시 히트율이 달라져 비용 편차 발생
4. **네트워크**: API 지연이 결과에 영향. 시간대/서버 부하에 따라 변동
5. **팀 에이전트 변동성**: Run 2의 34-turn 폭주는 재현 가능성 불확실
6. **에이전트 모델 고정 미측정**: `model: "sonnet"` 파라미터로 에이전트 모델 명시 시 속도 차이 미측정
