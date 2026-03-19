// Pulse 훅: PreToolUse/PostToolUse — Whisper 패턴 컨텍스트 주입 + Guard
import { readStdin, respond, pass } from '../shared/hook-io.js';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { sessionDir, ensureDir, statePath } from '../shared/paths.js';
import { getSessionId } from '../shared/session.js';
import { join } from 'path';

// --- Whisper Tracker ---

interface WhisperTracker {
  injections: Record<string, number>;
  toolCallCount: number;
}

function loadTracker(sid: string): WhisperTracker {
  const path = join(sessionDir(sid), 'whisper-tracker.json');
  if (existsSync(path)) {
    try {
      return JSON.parse(readFileSync(path, 'utf-8'));
    } catch { /* fallthrough */ }
  }
  return { injections: {}, toolCallCount: 0 };
}

function saveTracker(sid: string, tracker: WhisperTracker): void {
  const dir = sessionDir(sid);
  ensureDir(dir);
  writeFileSync(join(dir, 'whisper-tracker.json'), JSON.stringify(tracker));
}

// --- Context Messages ---

interface ContextMessage {
  key: string;
  priority: 'safety' | 'workflow' | 'guidance' | 'info';
  text: string;
}

const MAX_REPEAT = 3;
const ADAPTIVE_THRESHOLD = 60; // tool calls 이후 minimal 모드

function buildMessages(toolName: string, hookEvent: string, sid: string): ContextMessage[] {
  const messages: ContextMessage[] = [];

  // Guard: 안전 관련 (최우선)
  if (hookEvent === 'PreToolUse' && toolName === 'Bash') {
    messages.push({
      key: 'Bash:parallel_reminder',
      priority: 'guidance',
      text: 'Use parallel execution for independent tasks. Use run_in_background for long operations.',
    });
  }

  if (hookEvent === 'PreToolUse' && toolName === 'Read') {
    messages.push({
      key: 'Read:parallel_reminder',
      priority: 'guidance',
      text: 'Read multiple files in parallel when possible for faster analysis.',
    });
  }

  // Workflow: Sustain 리마인더
  const sustainPath = statePath(sid, 'sustain');
  if (existsSync(sustainPath)) {
    try {
      const state = JSON.parse(readFileSync(sustainPath, 'utf-8'));
      if (state.active) {
        messages.push({
          key: 'workflow:sustain_active',
          priority: 'workflow',
          text: `[SUSTAIN ${state.currentIteration ?? 0}/${state.maxIterations ?? 100}] Sustain mode is active. Continue working until the task is complete.`,
        });
      }
    } catch { /* skip */ }
  }

  return messages;
}

// --- Main ---

async function main() {
  const input = await readStdin();
  const event = JSON.parse(input);
  const hookEvent = event.hook_event_name ?? event.type ?? '';
  const toolName = event.tool_name ?? '';

  const sid = getSessionId();
  const tracker = loadTracker(sid);

  tracker.toolCallCount++;

  // minimal 모드: 일정 도구 호출 이후 핵심 메시지만
  const minimalMode = tracker.toolCallCount > ADAPTIVE_THRESHOLD;

  const messages = buildMessages(toolName, hookEvent, sid);
  const filtered: string[] = [];

  for (const msg of messages) {
    // minimal 모드에서는 safety/workflow만
    if (minimalMode && msg.priority !== 'safety' && msg.priority !== 'workflow') continue;

    // 중복 방지: MAX_REPEAT 초과 시 건너뜀
    const count = tracker.injections[msg.key] ?? 0;
    if (count >= MAX_REPEAT) continue;

    tracker.injections[msg.key] = count + 1;
    filtered.push(msg.text);
  }

  saveTracker(sid, tracker);

  if (filtered.length > 0) {
    respond({
      continue: true,
      additionalContext: filtered.join('\n'),
    });
  } else {
    pass();
  }
}

main().catch(() => {
  respond({ continue: true });
});
