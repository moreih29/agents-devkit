import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const raw = match[1];
  const result = {};
  for (const line of raw.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const val = line.slice(colonIdx + 1).trim().replace(/^"(.*)"$/, '$1');
    result[key] = val;
  }
  return result;
}

// Read agents
const agentsDir = join(__dirname, 'agents');
const agentFiles = readdirSync(agentsDir).filter(f => f.endsWith('.md'));
const agents = agentFiles
  .map(f => parseFrontmatter(readFileSync(join(agentsDir, f), 'utf8')))
  .filter(a => a.name && a.task)
  .sort((a, b) => a.name.localeCompare(b.name));

// Read skills
const skillsDir = join(__dirname, 'skills');
const skillDirs = readdirSync(skillsDir);
const skills = skillDirs
  .map(d => {
    const skillPath = join(skillsDir, d, 'SKILL.md');
    if (!existsSync(skillPath)) return null;
    return parseFrontmatter(readFileSync(skillPath, 'utf8'));
  })
  .filter(s => s && s.name && s.trigger_display && s.purpose)
  .sort((a, b) => a.name.localeCompare(b.name));

// Read tags
const tags = JSON.parse(readFileSync(join(__dirname, 'src/data/tags.json'), 'utf8'));

// Generate table rows
const categoryOrder = { how: 0, do: 1, check: 2 };
const sortedAgents = [...agents].sort((a, b) => (categoryOrder[a.category] ?? 9) - (categoryOrder[b.category] ?? 9) || a.name.localeCompare(b.name));
const agentRows = sortedAgents.map(a => `| ${a.alias_ko || a.name} | ${(a.category || '').toUpperCase()} | ${a.task} | ${a.name} |`).join('\n');
const skillRows = skills.map(s => `| ${s.name} | ${s.trigger_display} | ${s.purpose} |`).join('\n');
const tagRows = tags.map(t => `| [${t.tag}] | ${t.purpose} |`).join('\n');

const template = `## Nexus Agent Orchestration

**Default: DELEGATE** — route code work, analysis, and multi-file changes to agents.

Lead는 사용자와 직접 대화하는 메인 에이전트. tasks.json에서 \`owner: "lead"\`는 Lead가 직접 처리.

Before starting work, check \`.nexus/memory/\` and \`.nexus/context/\` for project-specific knowledge.

### .nexus/ Structure

- \`memory/\` — lessons learned, references (\`[m]\`)
- \`context/\` — design principles, architecture philosophy (\`[sync]\`)
- \`rules/\` — project custom rules (\`[rule]\`)
- \`state/\` — plan.json, tasks.json (runtime)

### Agent Routing

병렬 작업이나 다른 관점이 필요할 때 에이전트를 활용하라.

| 이름 | Category | Task | Agent |
|------|----------|------|-------|
${agentRows}

단순 작업(파일 1-2개 읽기/수정)은 직접 처리하라.

### Skills

| Skill | Trigger | Purpose |
|-------|---------|---------|
${skillRows}

### Tags

| Tag | Purpose |
|-----|---------|
${tagRows}
`;

// Write templates/nexus-section.md
const templatesDir = join(__dirname, 'templates');
if (!existsSync(templatesDir)) mkdirSync(templatesDir, { recursive: true });
writeFileSync(join(templatesDir, 'nexus-section.md'), template, 'utf8');

console.log(`Generated templates/nexus-section.md (${agents.length} agents, ${skills.length} skills, ${tags.length} tags)`);

// Update CLAUDE.md
const claudeMdPath = join(__dirname, 'CLAUDE.md');
const claudeContent = readFileSync(claudeMdPath, 'utf8');
const startMarker = '<!-- NEXUS:START -->';
const endMarker = '<!-- NEXUS:END -->';
const startIdx = claudeContent.indexOf(startMarker);
const endIdx = claudeContent.indexOf(endMarker);

if (startIdx !== -1 && endIdx !== -1) {
  const before = claudeContent.slice(0, startIdx + startMarker.length);
  const after = claudeContent.slice(endIdx);
  const updated = `${before}\n${template}${after}`;
  writeFileSync(claudeMdPath, updated, 'utf8');
  console.log('Updated CLAUDE.md Nexus section');
}
