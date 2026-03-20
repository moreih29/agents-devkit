# Nexus 로컬 개발/테스트 가이드

## 새 환경에서 최초 설정 (1회)

### 1. 마켓플레이스 등록
```bash
claude plugin marketplace add https://github.com/moreih29/agents-devkit.git
```

### 2. 플러그인 설치
```bash
claude plugin install claude-nexus@nexus
```
→ 캐시 위치: `~/.claude/plugins/cache/nexus/claude-nexus/0.1.0/`

### 3. 개발 프로젝트 빌드
```bash
cd ~/workspaces/projects/agents-devkit
bun install
bun run dev   # build + 캐시 동기화
```

### 4. 테스트 폴더 생성
```bash
mkdir -p ~/workspaces/projects/nexus-test/.claude
cat > ~/workspaces/projects/nexus-test/.claude/settings.local.json << 'EOF'
{
  "enabledPlugins": {
    "oh-my-claudecode@omc": false
  }
}
EOF
```

### 5. 개발 프로젝트 설정
`agents-devkit/.claude/settings.local.json`에 아래 추가 (프로젝트 내 .mcp.json 중복 방지):
```json
{ "disabledMcpjsonServers": ["lat"] }
```

## 개발 사이클

```
src/ 수정 → bun run dev → nexus-test에서 Claude Code 재시작 → 검증
```

`bun run dev` = esbuild 빌드 + `dev-sync.mjs` (캐시 디렉토리에 빌드 산출물 복사)

## 핵심 주의사항

1. **빌드 산출물은 git에 포함**: `bridge/mcp-server.cjs`, `scripts/*.cjs` — 플러그인은 git clone으로 설치되므로 빌드 산출물이 저장소에 있어야 MCP 서버 로드 가능
2. **심링크 방식은 불안정**: Claude Code가 시작 시 캐시를 검증/정리하여 심링크 삭제됨 → `dev-sync.mjs` 파일 복사 방식 사용
3. **`claude plugin update` 버전 동일 시 무시**: `bun run dev`로 캐시에 직접 동기화
4. **omc 비활성화는 프로젝트 레벨**: `settings.local.json`의 `enabledPlugins`로 제어 — 글로벌에는 영향 없음

## 훅 I/O 프로토콜 (실측)

- Claude Code는 `hook_event_name` 필드를 보내지 않음
- UserPromptSubmit: `{ "prompt": "사용자 입력" }` (`user_prompt` 아님)
- 이벤트 구분: `prompt` 필드 존재 여부로 판별 (있으면 UserPromptSubmit, 없으면 Stop)
- additionalContext는 "제안"일 뿐 강제가 아님 → 중요 동작은 훅이 직접 실행

## E2E 테스트

```bash
bash test/e2e.sh   # 21개 자동 테스트 (MCP 11 + 훅 10)
```
