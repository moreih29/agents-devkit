// null = 생략, 'all' = 전체
export const MATRIX: Record<string, Record<string, string | null>> = {
  architect:  { identity: 'all', codebase: 'all',  reference: 'all',  memory: 'all' },
  postdoc:    { identity: 'all', codebase: 'all',  reference: 'all',  memory: 'all' },
  designer:   { identity: 'all', codebase: 'all',  reference: 'all',  memory: 'all' },
  strategist: { identity: 'all', codebase: 'all',  reference: 'all',  memory: 'all' },
  engineer:   { identity: null,  codebase: 'all',  reference: 'all',  memory: 'all' },
  researcher: { identity: null,  codebase: null,   reference: 'all',  memory: 'all' },
  writer:     { identity: null,  codebase: 'all',  reference: 'all',  memory: 'all' },
  tester:     { identity: null,  codebase: 'all',  reference: 'all',  memory: 'all' },
  reviewer:   { identity: null,  codebase: null,   reference: 'all',  memory: 'all' },
};

/** 'claude-nexus:engineer' → 'engineer'. nexus 에이전트가 아니면 null 반환 */
export function extractRole(agentType: string): string | null {
  const prefix = 'claude-nexus:';
  if (!agentType.startsWith(prefix)) return null;
  const role = agentType.slice(prefix.length);
  return role in MATRIX ? role : null;
}

/** MATRIX에서 null이 아닌 레이어 이름 배열 반환 */
export function getAllowedLayers(role: string): string[] {
  const row = MATRIX[role];
  if (!row) return [];
  return Object.entries(row)
    .filter(([, value]) => value !== null)
    .map(([layer]) => layer);
}
