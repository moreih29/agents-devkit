#!/usr/bin/env node
// 배포 자동화 스크립트
// Usage: node release.mjs [patch|minor|major]
// - 인자 없으면 커밋 메시지 기반 자동 결정
// - --dry-run: 실제 배포 없이 시뮬레이션

import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { execSync } from 'child_process';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const explicitBump = args.find(a => ['patch', 'minor', 'major'].includes(a));

function run(cmd, opts = {}) {
  console.log(`  $ ${cmd}`);
  if (dryRun && !opts.force) {
    console.log('  [dry-run] skipped');
    return '';
  }
  return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], ...opts }).trim();
}

function fail(msg) {
  console.error(`\n❌ ${msg}`);
  process.exit(1);
}

// --- 0. Pre-flight checks ---

console.log('\n🔍 Pre-flight checks...');

// main 브랜치 확인
const branch = run('git rev-parse --abbrev-ref HEAD', { force: true });
if (branch !== 'main') fail(`main 브랜치에서만 릴리스 가능 (현재: ${branch})`);

// 워킹 트리 클린 확인
const status = run('git status --porcelain', { force: true });
if (status) fail(`워킹 트리가 클린하지 않음:\n${status}`);

// 현재 버전
const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
const currentVersion = pkg.version;
console.log(`  현재 버전: v${currentVersion}`);

// 마지막 태그 이후 커밋
const lastTag = `v${currentVersion}`;
let commits;
try {
  commits = run(`git log ${lastTag}..HEAD --oneline`, { force: true });
} catch {
  commits = run('git log --oneline -20', { force: true });
}

if (!commits) fail('릴리스할 커밋이 없음');
console.log(`  릴리스 대상: ${commits.split('\n').length}개 커밋`);

// --- 1. Semantic version 결정 ---

console.log('\n📊 버전 결정...');

function detectBump(commitLog) {
  const lines = commitLog.split('\n');
  let bump = 'patch';

  for (const line of lines) {
    const msg = line.replace(/^[a-f0-9]+ /, '');
    if (/^feat[:(]|^feat!/.test(msg)) bump = 'minor';
    if (/BREAKING|^.*!:/.test(msg)) return 'major';
  }

  return bump;
}

const bump = explicitBump || detectBump(commits);
const [major, minor, patch] = currentVersion.split('.').map(Number);
const newVersion = bump === 'major' ? `${major + 1}.0.0`
  : bump === 'minor' ? `${major}.${minor + 1}.0`
  : `${major}.${minor}.${patch + 1}`;

console.log(`  감지된 변경: ${bump}`);
console.log(`  새 버전: v${currentVersion} → v${newVersion}`);

// --- 2. 버전 범프 (3곳) ---

console.log('\n📝 버전 범프...');

function bumpJsonVersion(file, version) {
  const content = readFileSync(file, 'utf-8');
  const updated = content.replace(/"version"\s*:\s*"[^"]+"/, `"version": "${version}"`);
  if (content === updated) fail(`${file}에서 version 필드를 찾을 수 없음`);
  if (!dryRun) writeFileSync(file, updated);
  console.log(`  ${file}: ${currentVersion} → ${version}`);
}

bumpJsonVersion('package.json', newVersion);
bumpJsonVersion('.claude-plugin/plugin.json', newVersion);
bumpJsonVersion('.claude-plugin/marketplace.json', newVersion);

// VERSION 파일 (statusline 참조)
if (!dryRun) writeFileSync('VERSION', newVersion + '\n');
console.log(`  VERSION: ${currentVersion} → ${newVersion}`);

// --- 3. CHANGELOG 안내 ---

console.log('\n📋 CHANGELOG...');

const today = new Date().toISOString().slice(0, 10);
const changelogHeader = `## ${newVersion} (${today})`;

// 커밋을 카테고리별로 분류
const categories = { Features: [], Refactoring: [], Fixes: [], Other: [] };
for (const line of commits.split('\n')) {
  const msg = line.replace(/^[a-f0-9]+ /, '');
  if (/^feat/.test(msg)) categories.Features.push(msg.replace(/^feat[^:]*:\s*/, ''));
  else if (/^refactor/.test(msg)) categories.Refactoring.push(msg.replace(/^refactor[^:]*:\s*/, ''));
  else if (/^fix/.test(msg)) categories.Fixes.push(msg.replace(/^fix[^:]*:\s*/, ''));
  else if (!/^chore|^docs|^test|^ci/.test(msg)) categories.Other.push(msg);
}

let changelogEntry = `\n${changelogHeader}\n`;
for (const [cat, items] of Object.entries(categories)) {
  if (items.length === 0) continue;
  changelogEntry += `\n### ${cat}\n`;
  for (const item of items) changelogEntry += `- ${item}\n`;
}

if (!dryRun) {
  const changelog = readFileSync('CHANGELOG.md', 'utf-8');
  const updated = changelog.replace(/^# Changelog\n/, `# Changelog\n${changelogEntry}`);
  writeFileSync('CHANGELOG.md', updated);
}
console.log(`  CHANGELOG.md에 ${changelogHeader} 추가됨`);

// --- 4. 빌드 + 검증 ---

console.log('\n🔨 빌드 + 검증...');
run('bun run build');
run('bun run build:types');
console.log('  ✅ 빌드 + 타입 체크 통과');

console.log('\n🧪 E2E 테스트...');
const testResult = run('bash test/e2e.sh');
const testMatch = testResult.match(/(\d+) passed, (\d+) failed/);
if (testMatch && parseInt(testMatch[2]) > 0) fail(`E2E 테스트 실패: ${testMatch[0]}`);
console.log(`  ✅ ${testMatch ? testMatch[0] : '테스트 통과'}`);

// --- 5. 커밋 ---

console.log('\n📦 커밋...');
run('git add package.json .claude-plugin/plugin.json .claude-plugin/marketplace.json CHANGELOG.md VERSION bridge/ scripts/');
run(`git commit -m "release: v${newVersion}"`);
console.log(`  ✅ release: v${newVersion}`);

// --- 6. 태그 + Push ---

console.log('\n🚀 태그 + Push...');
run(`git tag v${newVersion}`);
run('git push origin main');
run(`git push origin v${newVersion}`);
console.log(`  ✅ v${newVersion} 태그 push 완료`);

// --- 7. CI publish hand-off (OIDC Trusted Publishing via GitHub Actions) ---
//
// git tag v{newVersion} push가 .github/workflows/publish-npm.yml 워크플로우를
// 자동 트리거한다. 로컬에서 npm publish를 직접 실행하지 않는다.
// - 인증: OIDC (NPM_TOKEN, .npmrc, 2FA OTP 전부 불필요)
// - Provenance: npm publish --provenance --access public
// - 재현성: CI가 frozen lockfile + Node 24로 재빌드 검증
//
// Trusted Publisher 설정 (이미 등록됨):
//   owner=moreih29, repo=claude-nexus, workflow=publish-npm.yml

console.log('\n📤 CI publish hand-off...');
console.log(`  tag v${newVersion} pushed → .github/workflows/publish-npm.yml triggered`);
console.log('  Watch:');
console.log('    gh run watch $(gh run list --workflow=publish-npm.yml --limit 1 --json databaseId --jq ".[0].databaseId") --exit-status');

// --- 8. GitHub Release ---

console.log('\n🏷️  GitHub Release...');
try {
  const releaseNotes = changelogEntry.trim();
  const notesFile = '.release-notes.tmp.md';
  if (!dryRun) writeFileSync(notesFile, releaseNotes);
  run(`gh release create v${newVersion} --title "v${newVersion}" --notes-file ${notesFile}`);
  try { unlinkSync(notesFile); } catch { /* skip */ }
  console.log('  ✅ GitHub Release 생성 완료');
} catch {
  console.log('  ⚠️  gh CLI 없음 — 수동 생성: https://github.com/moreih29/claude-nexus/releases/new');
}

// --- 9. dev-sync ---

console.log('\n🔄 dev-sync...');
run('bun run dev');
console.log('  ✅ 로컬 개발 캐시 동기화 완료');

// --- Done ---

console.log(`\n✅ v${newVersion} 릴리스 완료!`);
console.log(`   npm: https://www.npmjs.com/package/claude-nexus`);
console.log(`   GitHub: https://github.com/moreih29/claude-nexus/releases/tag/v${newVersion}`);
