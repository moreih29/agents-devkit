// 모든 에이전트에게 memory, context, rules 폴더가 동일하게 노출됨
export const AGENT_ROLES = [
  'architect',
  'postdoc',
  'designer',
  'strategist',
  'engineer',
  'researcher',
  'writer',
  'tester',
  'reviewer',
] as const;

export type AgentRole = typeof AGENT_ROLES[number];

/** 'claude-nexus:engineer' → 'engineer'. nexus 에이전트가 아니면 null 반환 */
export function extractRole(agentType: string): string | null {
  const prefix = 'claude-nexus:';
  if (!agentType.startsWith(prefix)) return null;
  const role = agentType.slice(prefix.length);
  return (AGENT_ROLES as readonly string[]).includes(role) ? role : null;
}

/** @deprecated 플랫 구조로 전환됨 — gate.ts 업데이트 후 제거 예정 */
export function getAllowedLayers(_role: string): string[] {
  return [];
}
