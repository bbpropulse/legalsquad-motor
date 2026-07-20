import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const IDE = join(__dirname, '..', 'templates', 'ide-templates');

// Removes a leading YAML frontmatter block (--- ... ---), returning the body.
function stripFrontmatter(raw) {
  const text = raw.replace(/\r\n/g, '\n');
  const match = text.match(/^---\n[\s\S]*?\n---\n?/);
  return match ? text.slice(match[0].length) : text;
}

async function body(relPath) {
  const raw = await readFile(join(IDE, relPath), 'utf-8');
  // Trim absorbs cosmetic leading/trailing blank-line differences between IDE
  // wrappers while still catching any real divergence in the shared content.
  return stripFrontmatter(raw).trim();
}

// These distribution assets carry the SAME logical content across IDEs, only
// wrapped differently per IDE. Drift between copies is silent in production
// (each file is hand-maintained) — these tests turn drift into a CI failure.

// --- Shared /criminalsquad command body (the ~271-line skill prompt) ---

const COMMAND_BODY_FILES = [
  'claude-code/.claude/skills/criminalsquad/SKILL.md',
  'gemini-cli/.gemini/skills/criminalsquad/SKILL.md',
  'qwen-code/.qwen/skills/criminalsquad/SKILL.md',
  'vscode-copilot/.github/prompts/criminalsquad.prompt.md',
  'antigravity/.agent/workflows/criminalsquad.md',
  'codex/AGENTS.md',
  'opencode/AGENTS.md',
];

test('the /criminalsquad command body is identical across every IDE that carries it', async () => {
  const [reference, ...rest] = await Promise.all(COMMAND_BODY_FILES.map(body));
  assert.ok(reference.length > 1000, 'reference command body looks too short');
  for (let i = 0; i < rest.length; i++) {
    assert.equal(
      rest[i],
      reference,
      `command body drift: ${COMMAND_BODY_FILES[i + 1]} differs from ${COMMAND_BODY_FILES[0]}`
    );
  }
});

// --- Shared project-instructions body (the ~58-line CLAUDE.md content) ---

const INSTRUCTIONS_BODY_FILES = [
  'claude-code/CLAUDE.md',
  'gemini-cli/GEMINI.md',
  'qwen-code/QWEN.md',
  'antigravity/.agent/rules/criminalsquad.md',
  'cursor/.cursor/rules/criminalsquad.mdc',
  'trae/.trae/rules/criminalsquad.md',
];

test('the project-instructions body is identical across every IDE that carries it', async () => {
  const [reference, ...rest] = await Promise.all(INSTRUCTIONS_BODY_FILES.map(body));
  assert.ok(reference.length > 500, 'reference instructions body looks too short');
  for (let i = 0; i < rest.length; i++) {
    assert.equal(
      rest[i],
      reference,
      `instructions body drift: ${INSTRUCTIONS_BODY_FILES[i + 1]} differs from ${INSTRUCTIONS_BODY_FILES[0]}`
    );
  }
});

// --- Playwright MCP server config consistency ---

const MCP_FILES = [
  { path: 'claude-code/.mcp.json', key: 'mcpServers' },
  { path: 'cursor/.cursor/mcp.json', key: 'mcpServers' },
  { path: 'trae/.trae/mcp.json', key: 'mcpServers' },
  { path: 'vscode-copilot/.vscode/mcp.json', key: 'servers' },
  { path: 'gemini-cli/.gemini/settings.json', key: 'mcpServers' },
  { path: 'qwen-code/.qwen/settings.json', key: 'mcpServers' },
];

async function playwrightServer({ path, key }) {
  const raw = await readFile(join(IDE, path), 'utf-8');
  const parsed = JSON.parse(raw);
  return parsed[key]?.playwright;
}

test('the playwright MCP server config is identical across every IDE', async () => {
  const servers = await Promise.all(MCP_FILES.map(playwrightServer));
  const reference = servers[0];
  assert.ok(reference, `no playwright server in ${MCP_FILES[0].path}`);
  for (let i = 1; i < servers.length; i++) {
    assert.deepEqual(
      servers[i],
      reference,
      `MCP config drift: ${MCP_FILES[i].path} differs from ${MCP_FILES[0].path}`
    );
  }
});

// --- indexador: repo (scripts/) vs cópia user-facing (templates/scripts/) ---
// As duas cópias do indexador devem ser idênticas; um conserto numa precisa ir
// na outra. Esta trava impede que correções (ex.: validação de wikilinks) cheguem
// só ao repo e não ao usuário.
const ROOT = join(__dirname, '..');

test('o indexar-acervo do repo e o template user-facing são idênticos', async () => {
  const [repo, template] = await Promise.all([
    readFile(join(ROOT, 'scripts', 'indexar-acervo.js'), 'utf-8'),
    readFile(join(ROOT, 'templates', 'scripts', 'indexar-acervo.mjs'), 'utf-8'),
  ]);
  assert.equal(
    template,
    repo,
    'scripts/indexar-acervo.js e templates/scripts/indexar-acervo.mjs divergiram — sincronize as duas cópias'
  );
});

test('o eval-resumo do repo e o template user-facing são idênticos', async () => {
  const [repo, template] = await Promise.all([
    readFile(join(ROOT, 'scripts', 'eval-resumo.mjs'), 'utf-8'),
    readFile(join(ROOT, 'templates', 'scripts', 'eval-resumo.mjs'), 'utf-8'),
  ]);
  assert.equal(
    template,
    repo,
    'scripts/eval-resumo.mjs e templates/scripts/eval-resumo.mjs divergiram — sincronize as duas cópias'
  );
});

test('o squad-state do repo e o template user-facing são idênticos', async () => {
  const [repo, template] = await Promise.all([
    readFile(join(ROOT, 'scripts', 'squad-state.mjs'), 'utf-8'),
    readFile(join(ROOT, 'templates', 'scripts', 'squad-state.mjs'), 'utf-8'),
  ]);
  assert.equal(
    template,
    repo,
    'scripts/squad-state.mjs e templates/scripts/squad-state.mjs divergiram — sincronize as duas cópias'
  );
});

for (const file of [
  'audit-core.mjs',
  'fraction-date-engine.mjs',
  'remission-engine.mjs',
  'executory-limitation-engine.mjs',
]) {
  test(`o motor jurídico ${file} e o template user-facing são idênticos`, async () => {
    const [repo, template] = await Promise.all([
      readFile(join(ROOT, 'scripts', 'legal-calculators', file), 'utf-8'),
      readFile(join(ROOT, 'templates', 'scripts', 'legal-calculators', file), 'utf-8'),
    ]);
    assert.equal(template, repo, `${file} divergiu do espelho em templates/scripts/legal-calculators`);
  });
}

for (const file of ['validate-legal-output.mjs', 'check-legal-authorities.mjs']) {
  test(`${file} do repo e o template user-facing são idênticos`, async () => {
    const [repo, template] = await Promise.all([
      readFile(join(ROOT, 'scripts', file), 'utf-8'),
      readFile(join(ROOT, 'templates', 'scripts', file), 'utf-8'),
    ]);
    assert.equal(template, repo, `${file} divergiu do espelho em templates/scripts`);
  });
}

test('a matriz temporal do art. 112 e o template distribuído são idênticos', async () => {
  const [repo, template] = await Promise.all([
    readFile(join(ROOT, 'acervo', 'legislacao', 'matriz-temporal-art-112-lep.md'), 'utf-8'),
    readFile(join(ROOT, 'templates', 'acervo', 'legislacao', 'matriz-temporal-art-112-lep.md'), 'utf-8'),
  ]);
  assert.equal(template, repo, 'a matriz temporal distribuída divergiu do acervo canônico');
});

test('o hook verifica-citacoes do repo e o template claude-code são idênticos', async () => {
  const [repo, template] = await Promise.all([
    readFile(join(ROOT, '.claude', 'hooks', 'verifica-citacoes.mjs'), 'utf-8'),
    readFile(join(ROOT, 'templates', 'ide-templates', 'claude-code', '.claude', 'hooks', 'verifica-citacoes.mjs'), 'utf-8'),
  ]);
  assert.equal(
    template,
    repo,
    '.claude/hooks/verifica-citacoes.mjs e o espelho em templates/ide-templates/claude-code divergiram — sincronize'
  );
});

test('Citation Gate v2 permanece idêntico em Claude, Codex e templates distribuídos', async () => {
  const canonical = await readFile(join(ROOT, '.claude', 'hooks', 'verifica-citacoes.mjs'), 'utf8');
  const mirrors = [
    join(ROOT, '.Codex', 'hooks', 'verifica-citacoes.mjs'),
    join(ROOT, 'templates', 'ide-templates', 'claude-code', '.claude', 'hooks', 'verifica-citacoes.mjs'),
    join(ROOT, 'templates', 'ide-templates', 'codex', '.Codex', 'hooks', 'verifica-citacoes.mjs'),
  ];
  for (const mirror of mirrors) {
    assert.equal(await readFile(mirror, 'utf8'), canonical, `Citation Gate fora de sincronia: ${mirror}`);
  }
});

test('configurações distribuídas do Citation Gate são portáveis e não vazam caminho local', async () => {
  const claudeRepo = await readFile(join(ROOT, '.claude', 'settings.json'), 'utf8');
  const claudeTemplate = await readFile(
    join(ROOT, 'templates', 'ide-templates', 'claude-code', '.claude', 'settings.json'),
    'utf8',
  );
  const codexRepo = await readFile(join(ROOT, '.Codex', 'hooks.json'), 'utf8');
  const codexTemplate = await readFile(
    join(ROOT, 'templates', 'ide-templates', 'codex', '.Codex', 'hooks.json'),
    'utf8',
  );
  assert.equal(claudeTemplate, claudeRepo);
  assert.equal(codexTemplate, codexRepo);
  assert.doesNotMatch(`${claudeTemplate}\n${codexTemplate}`, /\/Users\/|[A-Za-z]:\\\\/);
  assert.match(claudeTemplate, /\$CLAUDE_PROJECT_DIR/);
  assert.match(codexTemplate, /node \\"[.]Codex\/hooks\/verifica-citacoes[.]mjs\\"/);
});

test('catalog-scout Claude permanece idêntico ao template distribuído', async () => {
  const repo = join(ROOT, '.claude', 'agents', 'catalog-scout.md');
  const template = join(ROOT, 'templates', 'ide-templates', 'claude-code', '.claude', 'agents', 'catalog-scout.md');
  assert.equal(
    await readFile(template, 'utf8'),
    await readFile(repo, 'utf8'),
    `catalog-scout fora de sincronia: ${template}`,
  );
});

test('catalog-scout Codex descobre TOML local e Markdown compartilhado', async () => {
  const content = await readFile(
    join(ROOT, 'templates', 'ide-templates', 'codex', '.Codex', 'agents', 'catalog-scout.toml'),
    'utf8',
  );
  assert.match(content, /\.Codex\/agents\/\*\.toml/);
  assert.match(content, /\.claude\/agents\/\*\.md/);
  assert.doesNotMatch(content, /^\s*\d+\.\s+\*\*Subagentes especialistas.*\.Codex\/agents\/\*\.md/m);
});
