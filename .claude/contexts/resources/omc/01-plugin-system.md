# OMC Plugin System

## 1. Plugin 등록 구조

OMC는 Claude Code의 native plugin system을 사용한다. 등록 체인:

```
~/.claude/plugins/ → omc 설치 → ~/.claude/plugins/cache/omc/oh-my-claudecode/{version}/
                                    ├── .claude-plugin/plugin.json  ← 진입점
                                    ├── hooks/hooks.json            ← hook 등록
                                    └── skills/                     ← slash command
```

### .claude-plugin/plugin.json

```json
{
  "name": "oh-my-claudecode",
  "version": "4.8.2",
  "description": "Multi-agent orchestration system for Claude Code",
  "skills": "./skills/",
  "mcpServers": "./.mcp.json"
}
```

이 파일이 선언하는 것:
- `skills` - skill 디렉토리 경로. Claude Code가 이 디렉토리를 스캔하여 `oh-my-claudecode:{skill-name}` 형태의 slash command를 등록한다
- `mcpServers` - MCP 서버 설정 파일 경로

### .claude-plugin/marketplace.json

```json
{
  "$schema": "https://anthropic.com/claude-code/marketplace.schema.json",
  "name": "omc",
  "description": "Claude Code native multi-agent orchestration - intelligent model routing, 28 agents, 32 skills",
  "plugins": [{
    "name": "oh-my-claudecode",
    "source": "./",
    "category": "productivity",
    "tags": ["multi-agent", "orchestration", "delegation", "todo-management", "ultrawork"]
  }]
}
```

## 2. $CLAUDE_PLUGIN_ROOT 메커니즘

Claude Code는 plugin을 로드할 때 `$CLAUDE_PLUGIN_ROOT` 환경변수를 설정한다. 이 변수는 plugin cache 내의 해당 버전 디렉토리를 가리킨다:

```
$CLAUDE_PLUGIN_ROOT = ~/.claude/plugins/cache/omc/oh-my-claudecode/4.8.2/
```

모든 hook command에서 이 변수를 사용하여 스크립트 경로를 참조한다:

```json
{
  "type": "command",
  "command": "node \"$CLAUDE_PLUGIN_ROOT\"/scripts/run.cjs \"$CLAUDE_PLUGIN_ROOT\"/scripts/keyword-detector.mjs"
}
```

### Plugin Cache 관리

`session-start.mjs`에서 오래된 plugin cache 버전을 정리한다:
- 최신 2개 버전을 유지하고, 나머지는 **symlink로 대체** (삭제가 아님)
- symlink로 대체하는 이유: 이전 버전의 `CLAUDE_PLUGIN_ROOT`를 참조하는 기존 세션이 MODULE_NOT_FOUND 에러를 피하기 위함
- `run.cjs`에서 target이 존재하지 않으면 plugin cache를 스캔하여 최신 버전의 동일 스크립트를 찾는 fallback 로직 구현

## 3. hooks/hooks.json 구조

Hook 등록 파일은 event type별로 hook을 정의한다:

```json
{
  "description": "OMC orchestration hooks with async capabilities",
  "hooks": {
    "EventType": [
      {
        "matcher": "*",       // 또는 특정 패턴 (예: "Bash", "init")
        "hooks": [
          {
            "type": "command",
            "command": "node \"$CLAUDE_PLUGIN_ROOT\"/scripts/run.cjs \"$CLAUDE_PLUGIN_ROOT\"/scripts/script.mjs",
            "timeout": 5       // 초 단위 timeout
          }
        ]
      }
    ]
  }
}
```

**등록된 Event Types (11개):**

| Event | Hook Scripts | Timeout | 역할 |
|-------|-------------|---------|------|
| `UserPromptSubmit` | keyword-detector, skill-injector | 5s, 3s | 키워드 감지, skill 주입 |
| `SessionStart` | session-start, project-memory-session, setup-init*, setup-maintenance* | 5-60s | 상태 복원, 프로젝트 메모리, 초기 설정 |
| `PreToolUse` | pre-tool-enforcer | 3s | 도구 실행 전 리마인더/가드 |
| `PermissionRequest` | permission-handler (Bash만) | 5s | 권한 요청 처리 |
| `PostToolUse` | post-tool-verifier, project-memory-posttool | 3s | 실행 결과 분석, 메모리 업데이트 |
| `PostToolUseFailure` | post-tool-use-failure | 3s | 실패 처리 |
| `SubagentStart` | subagent-tracker start | 3s | Agent spawn 추적 |
| `SubagentStop` | subagent-tracker stop, verify-deliverables | 5s | Agent 완료 추적/검증 |
| `PreCompact` | pre-compact, project-memory-precompact | 10s, 5s | Compact 전 상태 보존 |
| `Stop` | context-guard-stop, persistent-mode, code-simplifier | 5-10s | 중단 제어 |
| `SessionEnd` | session-end | 10s | 세션 종료 cleanup |

*`setup-init`과 `setup-maintenance`는 각각 `"init"`, `"maintenance"` matcher를 사용하여 특정 상황에서만 실행된다.

## 4. scripts/run.cjs - Cross-Platform Hook Runner

모든 hook은 `run.cjs`를 통해 실행된다. 이 스크립트는:

1. `process.execPath`(현재 Node.js 바이너리)를 사용하여 target script를 spawn
2. PATH/shell discovery 문제를 우회 (Windows에서 /usr/bin/sh 문제 해결)
3. Target이 존재하지 않을 때 plugin cache에서 최신 버전을 찾는 fallback

```javascript
// scripts/run.cjs 핵심 로직
function resolveTarget(targetPath) {
  if (existsSync(targetPath)) return targetPath;       // 빠른 경로
  try { return realpathSync(targetPath); } catch {}     // symlink 해석
  // Fallback: plugin cache 스캔하여 최신 버전의 동일 스크립트 찾기
  const cacheBase = dirname(pluginRoot);
  const entries = readdirSync(cacheBase).filter(v => /^\d+\.\d+\.\d+/.test(v));
  entries.sort(/* semver desc */);
  for (const version of entries) {
    const candidate = join(cacheBase, version) + scriptRelative;
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

const result = spawnSync(process.execPath, [resolved, ...process.argv.slice(3)], {
  stdio: 'inherit',
  env: process.env,
  windowsHide: true,
});
```

## 5. scripts/lib/stdin.mjs - Stdin 읽기

모든 hook script가 사용하는 공통 stdin reader. timeout 보호 기능이 포함되어 Linux/Windows에서 stdin hang을 방지한다:

```javascript
export function readStdin(timeoutMs = 5000) {
  return new Promise((resolve) => {
    const chunks = [];
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) { settled = true; resolve(Buffer.concat(chunks).toString('utf-8')); }
    }, timeoutMs);
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => { if (!settled) { settled = true; clearTimeout(timeout); resolve(...); } });
  });
}
```

## 6. Settings.json 설정 흐름

Claude Code의 `~/.claude/settings.json`과 OMC의 상호작용:

### HUD 설정
```json
{
  "statusLine": {
    "command": "node ~/.claude/hud/omc-hud.mjs"
  }
}
```

### Team 기능 활성화
```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

`keyword-detector.mjs`의 `isTeamEnabled()` 함수가 이 설정을 읽어 team 관련 기능의 가용성을 판단한다.

## 7. Hook Script 공통 패턴

### Skip Guard 패턴
모든 hook script는 시작 시 비활성화 체크를 수행한다:

```javascript
const _skipHooks = (process.env.OMC_SKIP_HOOKS || '').split(',').map(s => s.trim());
if (process.env.DISABLE_OMC === '1' || _skipHooks.includes('keyword-detector')) {
  console.log(JSON.stringify({ continue: true }));
  return;
}
```

### Team Worker Guard 패턴
keyword-detector에서 team worker 내부의 무한 루프를 방지:

```javascript
if (process.env.OMC_TEAM_WORKER) {
  console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  return;
}
```

### Error Handling 패턴
모든 hook에서 에러 발생 시 `continue: true`를 반환하여 Claude Code를 절대 차단하지 않는다:

```javascript
try {
  // ... hook 로직
} catch (error) {
  console.log(JSON.stringify({ continue: true, suppressOutput: true }));
}
```

### suppressOutput 패턴
할 말이 없을 때 `suppressOutput: true`를 설정하여 불필요한 system-reminder 주입을 방지:

```json
{ "continue": true, "suppressOutput": true }
```

## 8. Plugin 배포 모델

OMC는 npm 패키지로 배포된다:
- npm 패키지명: `oh-my-claude-sisyphus`
- `package.json`의 `files` 배열이 포함될 파일을 정의
- `prepublishOnly` script로 빌드 후 배포
- `bin` 필드로 `omc`, `oh-my-claudecode` CLI 명령어 등록

```json
{
  "bin": {
    "oh-my-claudecode": "bridge/cli.cjs",
    "omc": "bridge/cli.cjs",
    "omc-cli": "bridge/cli.cjs"
  },
  "files": ["dist", "agents", "bridge", "hooks", "scripts", "skills", "templates", "docs", ".claude-plugin", ".mcp.json"]
}
```

plugin cache에 설치된 후에는 `$CLAUDE_PLUGIN_ROOT`를 통해 모든 파일에 접근한다.
