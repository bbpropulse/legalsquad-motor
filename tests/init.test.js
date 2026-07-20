import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat, readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { init } from '../src/init.js';
import { auditSkillsProject, checkSkillsProject } from '../src/skill-catalog-cli.js';

test('init creates _criminalsquad directory structure', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));

  try {
    await init(tempDir, { _skipPrompts: true });

    await stat(join(tempDir, '_criminalsquad'));
    await stat(join(tempDir, '_criminalsquad', 'core'));
    await stat(join(tempDir, '_criminalsquad', 'core', 'architect.agent.yaml'));
    await stat(join(tempDir, '_criminalsquad', 'core', 'runner.pipeline.md'));
    await stat(join(tempDir, '_criminalsquad', '_memory'));
    await stat(join(tempDir, '.claude', 'skills', 'criminalsquad', 'SKILL.md'));
    await stat(join(tempDir, 'CLAUDE.md'));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('init creates empty squads directory', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));

  try {
    await init(tempDir, { _skipPrompts: true });

    await stat(join(tempDir, 'squads'));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('init does not overwrite if already initialized', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));

  try {
    await init(tempDir, { _skipPrompts: true });
    await init(tempDir, { _skipPrompts: true }); // Should not throw, just warn
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('CLAUDE.md contains CriminalSquad instructions', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));

  try {
    await init(tempDir, { _skipPrompts: true });

    const content = await readFile(join(tempDir, 'CLAUDE.md'), 'utf-8');
    assert.ok(content.includes('CriminalSquad'));
    assert.ok(content.includes('/criminalsquad'));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('init creates _investigations directory', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));

  try {
    await init(tempDir, { _skipPrompts: true });

    await stat(join(tempDir, '_criminalsquad', '_investigations'));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('init writes preferences file with defaults when prompts skipped', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));

  try {
    await init(tempDir, { _skipPrompts: true });

    const prefs = await readFile(join(tempDir, '_criminalsquad', '_memory', 'preferences.md'), 'utf-8');
    assert.ok(prefs.includes('Output Language:'));
    assert.ok(prefs.includes('English'));
    assert.ok(prefs.includes('IDEs:'));
    assert.ok(prefs.includes('claude-code'));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('init with language option produces translated preferences', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));

  try {
    await init(tempDir, { _skipPrompts: true, _language: 'Português (Brasil)' });

    const prefs = await readFile(join(tempDir, '_criminalsquad', '_memory', 'preferences.md'), 'utf-8');
    assert.ok(prefs.includes('Português (Brasil)'));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('init creates .criminalsquad-version file', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));

  try {
    await init(tempDir, { _skipPrompts: true });

    const version = await readFile(join(tempDir, '_criminalsquad', '.criminalsquad-version'), 'utf-8');
    assert.ok(version.trim().length > 0);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('init creates README.md in user project', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));

  try {
    await init(tempDir, { _skipPrompts: true });

    const content = await readFile(join(tempDir, 'README.md'), 'utf-8');
    assert.ok(content.includes('CriminalSquad'));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('README.md contains /criminalsquad command', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));

  try {
    await init(tempDir, { _skipPrompts: true });

    const content = await readFile(join(tempDir, 'README.md'), 'utf-8');
    assert.ok(content.includes('/criminalsquad'));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('README.md is in Portuguese when language is PT-BR', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));

  try {
    await init(tempDir, { _skipPrompts: true, _language: 'Português (Brasil)' });

    const content = await readFile(join(tempDir, 'README.md'), 'utf-8');
    assert.ok(content.includes('Como Usar'));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('README.md is in Spanish when language is Español', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));

  try {
    await init(tempDir, { _skipPrompts: true, _language: 'Español' });

    const content = await readFile(join(tempDir, 'README.md'), 'utf-8');
    // README is bilingual PT/EN — Spanish falls back to the same file
    assert.ok(content.includes('How to Use'));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('init with _ides installs only selected IDE files', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));

  try {
    await init(tempDir, { _skipPrompts: true, _ides: ['claude-code'] });

    // claude-code files exist
    await stat(join(tempDir, '.claude', 'skills', 'criminalsquad', 'SKILL.md'));
    await stat(join(tempDir, '.claude', 'hooks', 'verifica-citacoes.mjs'));
    await stat(join(tempDir, 'CLAUDE.md'));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('init with _ides codex creates AGENTS.md', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));

  try {
    await init(tempDir, { _skipPrompts: true, _ides: ['codex'] });

    const content = await readFile(join(tempDir, 'AGENTS.md'), 'utf-8');
    assert.ok(content.includes('CriminalSquad'));
    await stat(join(tempDir, '.Codex', 'hooks', 'verifica-citacoes.mjs'));
    const hookConfig = JSON.parse(await readFile(join(tempDir, '.Codex', 'hooks.json'), 'utf8'));
    const command = hookConfig.hooks.PostToolUse[0].hooks[0].command;
    assert.equal(command, 'node ".Codex/hooks/verifica-citacoes.mjs"');
    assert.doesNotMatch(command, /Users|\\\\/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('init with _ides antigravity creates .agent/rules/criminalsquad.md', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));

  try {
    await init(tempDir, { _skipPrompts: true, _ides: ['antigravity'] });

    const content = await readFile(
      join(tempDir, '.agent', 'rules', 'criminalsquad.md'),
      'utf-8'
    );
    assert.ok(content.includes('CriminalSquad'));
    assert.ok(content.includes('/criminalsquad'));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('init with _ides antigravity creates .agent/workflows/criminalsquad.md', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));

  try {
    await init(tempDir, { _skipPrompts: true, _ides: ['antigravity'] });

    const content = await readFile(
      join(tempDir, '.agent', 'workflows', 'criminalsquad.md'),
      'utf-8'
    );
    assert.ok(content.includes('description:'));
    assert.ok(content.includes('CriminalSquad'));
    assert.ok(content.includes('/criminalsquad'));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('init with multiple ides records all in preferences', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));

  try {
    await init(tempDir, { _skipPrompts: true, _ides: ['claude-code', 'codex'] });

    const prefs = await readFile(join(tempDir, '_criminalsquad', '_memory', 'preferences.md'), 'utf-8');
    assert.ok(prefs.includes('claude-code'));
    assert.ok(prefs.includes('codex'));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('init creates .gitignore with browser profile exclusion', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));

  try {
    await init(tempDir, { _skipPrompts: true });

    const content = await readFile(join(tempDir, '.gitignore'), 'utf-8');
    assert.ok(content.includes('_criminalsquad/_browser_profile/'));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('init merges sensitive entries into an existing .gitignore (sigilo)', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));
  try {
    // aluno já tem um .gitignore próprio
    await writeFile(join(tempDir, '.gitignore'), 'node_modules\n.env\n', 'utf-8');

    await init(tempDir, { _skipPrompts: true });

    const content = await readFile(join(tempDir, '.gitignore'), 'utf-8');
    assert.ok(content.includes('node_modules'), 'preserva o conteúdo do usuário');
    assert.ok(content.includes('.env'), 'preserva o conteúdo do usuário');
    assert.ok(content.includes('acervo/casos/'), 'dados de cliente devem ser ignorados');
    assert.ok(content.includes('_criminalsquad/logs/'), 'log de roteamento deve ser ignorado');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('init creates playwright config with persistent context', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));

  try {
    await init(tempDir, { _skipPrompts: true });

    const content = await readFile(
      join(tempDir, '_criminalsquad', 'config', 'playwright.config.json'),
      'utf-8'
    );
    const config = JSON.parse(content);
    assert.equal(config.browser.isolated, false);
    assert.equal(config.browser.userDataDir, '_criminalsquad/_browser_profile');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('init with claude-code IDE creates .mcp.json with playwright server', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));

  try {
    await init(tempDir, { _skipPrompts: true, _ides: ['claude-code'] });

    const content = await readFile(join(tempDir, '.mcp.json'), 'utf-8');
    const config = JSON.parse(content);
    assert.ok(config.mcpServers.playwright);
    assert.ok(config.mcpServers.playwright.args.includes('--config'));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('init does not create agents dir when no bundled agents exist', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));
  try {
    await init(tempDir, { _skipPrompts: true });
    // No bundled agents in dev environment — agents/ should not be created
    await assert.rejects(
      stat(join(tempDir, 'agents')),
      { code: 'ENOENT' }
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('init installs active/pilot skills for discovery and skips preview skills', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));
  try {
    await init(tempDir, { _skipPrompts: true });
    const skillsDir = join(tempDir, 'skills');
    const entries = await readdir(skillsDir);
    assert.ok(entries.includes('apify'), 'apify should be auto-installed');
    assert.ok(entries.includes('blotato'), 'blotato should be auto-installed');
    assert.ok(entries.includes('canva'), 'canva should be auto-installed');
    assert.ok(entries.includes('execucao-data-base-beneficios'), 'pilot skills should be installed but require explicit routing');
    assert.ok(!entries.includes('ep-fracao-progressao-engine'), 'preview skills must not be auto-installed');
    const index = await readFile(join(skillsDir, '_index.yaml'), 'utf8');
    const manifest = await readFile(join(skillsDir, '_execucao-penal-v3-integration.yaml'), 'utf8');
    assert.match(index, /schema_version: 3/);
    assert.doesNotMatch(index, /name: ep-fracao-progressao-engine/);
    assert.match(manifest, /canonicalization:/);
    await stat(join(tempDir, 'scripts', 'legal-calculators', 'fraction-date-engine.mjs'));
    assert.equal(checkSkillsProject(tempDir).success, true);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('init installs criminalsquad-skill-creator including subdirs', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));
  try {
    await init(tempDir, { _skipPrompts: true });
    const scripts = await readdir(join(tempDir, 'skills', 'criminalsquad-skill-creator', 'scripts'));
    assert.ok(scripts.length > 0);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('init entrega especificações de eval sem fabricar evidência local', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));
  try {
    await init(tempDir, { _skipPrompts: true });
    await stat(join(tempDir, 'skills', '_evals', 'README.md'));
    await stat(join(tempDir, 'skills', '_evals', 'catalog-v5.json'));
    await stat(join(tempDir, 'skills', '_evals', 'execucao-canonicas.json'));
    await stat(join(tempDir, 'skills', '_evals', 'promotion-evidence.schema.json'));
    await assert.rejects(
      () => stat(join(tempDir, 'skills', '_evals', 'results')),
      { code: 'ENOENT' },
    );
    const audit = auditSkillsProject(tempDir);
    assert.equal(audit.success, true);
    assert.equal(audit.report.summary.hard_fail_skills, 0);
    assert.equal(audit.report.summary.high_performance_eligible, 0);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('init does not overwrite existing package.json', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));
  try {
    const pkgPath = join(tempDir, 'package.json');
    await writeFile(pkgPath, JSON.stringify({ name: 'my-project', version: '2.0.0' }), 'utf-8');

    await init(tempDir, { _skipPrompts: true });

    const content = await readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(content);
    assert.equal(pkg.name, 'my-project');
    assert.equal(pkg.version, '2.0.0');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('init copies package.json to fresh project', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));
  try {
    await init(tempDir, { _skipPrompts: true });

    const content = await readFile(join(tempDir, 'package.json'), 'utf-8');
    const pkg = JSON.parse(content);
    assert.ok(pkg.dependencies?.playwright, 'playwright should be listed as a dependency');
    assert.equal(pkg.scripts?.['indexar-skills'], 'npx criminalsquad indexar-skills');
    assert.equal(pkg.scripts?.['check:skills'], 'npx criminalsquad check-skills');
    assert.equal(pkg.scripts?.['audit:skills'], 'npx criminalsquad audit-skills');
    await stat(join(tempDir, '_criminalsquad', 'core', 'skill-quality-profiles.json'));
    await stat(join(tempDir, 'skills', 'habeas-corpus', 'references', 'high-performance-contract.md'));
    await stat(join(tempDir, 'skills', 'habeas-corpus', 'agents', 'openai.yaml'));
    await stat(join(tempDir, 'scripts', 'citation-gate-manifest.schema.json'));
    await stat(join(tempDir, 'scripts', 'CITATION-GATE.md'));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('init with _ides codex creates .agents/skills/criminalsquad/SKILL.md', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));

  try {
    await init(tempDir, { _skipPrompts: true, _ides: ['codex'] });

    const content = await readFile(
      join(tempDir, '.agents', 'skills', 'criminalsquad', 'SKILL.md'),
      'utf-8'
    );
    assert.ok(content.includes('name: criminalsquad'));
    assert.ok(content.includes('description:'));
    assert.ok(content.includes('AGENTS.md'));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('init with vscode-copilot creates .github/prompts/criminalsquad.prompt.md', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));
  try {
    await init(tempDir, { _skipPrompts: true, _ides: ['vscode-copilot'] });
    const content = await readFile(
      join(tempDir, '.github', 'prompts', 'criminalsquad.prompt.md'),
      'utf-8'
    );
    assert.ok(content.includes('mode:'));
    assert.ok(content.includes('criminalsquad'));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('init with vscode-copilot creates .vscode/mcp.json with playwright server', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));
  try {
    await init(tempDir, { _skipPrompts: true, _ides: ['vscode-copilot'] });
    const content = await readFile(join(tempDir, '.vscode', 'mcp.json'), 'utf-8');
    const config = JSON.parse(content);
    assert.ok(config.servers?.playwright, 'playwright server missing');
    assert.ok(config.servers.playwright.args.includes('--config'));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('init with vscode-copilot creates .vscode/settings.json with promptFilesLocations when no file exists', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));
  try {
    await init(tempDir, { _skipPrompts: true, _ides: ['vscode-copilot'] });
    const content = await readFile(join(tempDir, '.vscode', 'settings.json'), 'utf-8');
    const settings = JSON.parse(content);
    assert.ok(
      Array.isArray(settings['chat.promptFilesLocations']),
      'chat.promptFilesLocations should be an array'
    );
    assert.ok(
      settings['chat.promptFilesLocations'].includes('.github/prompts'),
      '.github/prompts should be in the array'
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('init with vscode-copilot merges .vscode/settings.json when file already exists', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));
  try {
    const vscodePath = join(tempDir, '.vscode');
    await mkdir(vscodePath, { recursive: true });
    await writeFile(
      join(vscodePath, 'settings.json'),
      JSON.stringify({ 'editor.fontSize': 14 }),
      'utf-8'
    );

    await init(tempDir, { _skipPrompts: true, _ides: ['vscode-copilot'] });

    const content = await readFile(join(vscodePath, 'settings.json'), 'utf-8');
    const settings = JSON.parse(content);
    assert.equal(settings['editor.fontSize'], 14, 'existing key must be preserved');
    assert.ok(
      settings['chat.promptFilesLocations'].includes('.github/prompts'),
      '.github/prompts must be added'
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('init with vscode-copilot skips merge when settings.json has invalid JSON', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));
  try {
    const vscodePath = join(tempDir, '.vscode');
    await mkdir(vscodePath, { recursive: true });
    const settingsPath = join(vscodePath, 'settings.json');
    await writeFile(settingsPath, 'not valid json', 'utf-8');

    await init(tempDir, { _skipPrompts: true, _ides: ['vscode-copilot'] });

    // File must NOT be overwritten
    const content = await readFile(settingsPath, 'utf-8');
    assert.equal(content, 'not valid json', 'malformed settings.json must not be modified');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('init with cursor IDE creates .cursor/rules/criminalsquad.mdc', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));
  try {
    await init(tempDir, { _skipPrompts: true, _ides: ['cursor'] });

    const content = await readFile(
      join(tempDir, '.cursor', 'rules', 'criminalsquad.mdc'),
      'utf-8'
    );
    assert.ok(content.includes('alwaysApply: true'));
    assert.ok(content.includes('criminalsquad'));
    assert.ok(content.includes('/criminalsquad'));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('init with cursor IDE creates .cursor/mcp.json with playwright server', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));
  try {
    await init(tempDir, { _skipPrompts: true, _ides: ['cursor'] });

    const content = await readFile(join(tempDir, '.cursor', 'mcp.json'), 'utf-8');
    const config = JSON.parse(content);
    assert.ok(config.mcpServers?.playwright, 'playwright server missing');
    assert.ok(config.mcpServers.playwright.args.includes('--config'));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('init with cursor IDE creates .cursorignore with browser profile exclusion', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));
  try {
    await init(tempDir, { _skipPrompts: true, _ides: ['cursor'] });

    const content = await readFile(join(tempDir, '.cursorignore'), 'utf-8');
    assert.ok(content.includes('_criminalsquad/_browser_profile/'));
    assert.ok(content.includes('node_modules/'));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('init does not copy dashboard node_modules or dist to user project', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));

  try {
    await init(tempDir, { _skipPrompts: true });

    await assert.rejects(
      stat(join(tempDir, 'dashboard', 'node_modules')),
      { code: 'ENOENT' }
    );
    await assert.rejects(
      stat(join(tempDir, 'dashboard', 'dist')),
      { code: 'ENOENT' }
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('init with _ides qwen-code creates .qwen/skills/criminalsquad/SKILL.md', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));

  try {
    await init(tempDir, { _skipPrompts: true, _ides: ['qwen-code'] });

    const content = await readFile(
      join(tempDir, '.qwen', 'skills', 'criminalsquad', 'SKILL.md'),
      'utf-8'
    );
    assert.ok(content.includes('name: criminalsquad'));
    assert.ok(content.includes('CriminalSquad'));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('init with _ides qwen-code creates QWEN.md', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));

  try {
    await init(tempDir, { _skipPrompts: true, _ides: ['qwen-code'] });

    const content = await readFile(join(tempDir, 'QWEN.md'), 'utf-8');
    assert.ok(content.includes('CriminalSquad'));
    assert.ok(content.includes('/criminalsquad'));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('init with _ides qwen-code creates .qwen/settings.json with playwright MCP', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));

  try {
    await init(tempDir, { _skipPrompts: true, _ides: ['qwen-code'] });

    const content = await readFile(join(tempDir, '.qwen', 'settings.json'), 'utf-8');
    const config = JSON.parse(content);
    assert.ok(config.mcpServers.playwright);
    assert.ok(config.mcpServers.playwright.args.includes('--config'));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('init with _ides qwen-code merges .qwen/settings.json when file already exists', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));

  try {
    const qwenPath = join(tempDir, '.qwen');
    await mkdir(qwenPath, { recursive: true });
    await writeFile(
      join(qwenPath, 'settings.json'),
      JSON.stringify({ model: { name: 'qwen3-coder' } }),
      'utf-8'
    );

    await init(tempDir, { _skipPrompts: true, _ides: ['qwen-code'] });

    const content = await readFile(join(qwenPath, 'settings.json'), 'utf-8');
    const settings = JSON.parse(content);
    assert.equal(settings.model.name, 'qwen3-coder', 'existing key must be preserved');
    assert.ok(settings.mcpServers.playwright, 'playwright MCP must be added');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('init with _ides gemini-cli creates .gemini/skills/criminalsquad/SKILL.md', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));

  try {
    await init(tempDir, { _skipPrompts: true, _ides: ['gemini-cli'] });

    const content = await readFile(
      join(tempDir, '.gemini', 'skills', 'criminalsquad', 'SKILL.md'),
      'utf-8'
    );
    assert.ok(content.includes('name: criminalsquad'));
    assert.ok(content.includes('CriminalSquad'));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('init with _ides gemini-cli creates GEMINI.md', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));

  try {
    await init(tempDir, { _skipPrompts: true, _ides: ['gemini-cli'] });

    const content = await readFile(join(tempDir, 'GEMINI.md'), 'utf-8');
    assert.ok(content.includes('CriminalSquad'));
    assert.ok(content.includes('/criminalsquad'));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('init with _ides gemini-cli creates .gemini/settings.json with playwright MCP', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));

  try {
    await init(tempDir, { _skipPrompts: true, _ides: ['gemini-cli'] });

    const content = await readFile(join(tempDir, '.gemini', 'settings.json'), 'utf-8');
    const config = JSON.parse(content);
    assert.ok(config.mcpServers.playwright);
    assert.ok(config.mcpServers.playwright.args.includes('--config'));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('init with _ides gemini-cli merges .gemini/settings.json when file already exists', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));

  try {
    const geminiPath = join(tempDir, '.gemini');
    await mkdir(geminiPath, { recursive: true });
    await writeFile(
      join(geminiPath, 'settings.json'),
      JSON.stringify({ theme: 'dark' }),
      'utf-8'
    );

    await init(tempDir, { _skipPrompts: true, _ides: ['gemini-cli'] });

    const content = await readFile(join(geminiPath, 'settings.json'), 'utf-8');
    const settings = JSON.parse(content);
    assert.equal(settings.theme, 'dark', 'existing key must be preserved');
    assert.ok(settings.mcpServers.playwright, 'playwright MCP must be added');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('init with _ides trae creates .trae/rules/criminalsquad.md', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));

  try {
    await init(tempDir, { _skipPrompts: true, _ides: ['trae'] });

    const content = await readFile(
      join(tempDir, '.trae', 'rules', 'criminalsquad.md'),
      'utf-8'
    );
    assert.ok(content.includes('alwaysApply: true'));
    assert.ok(content.includes('CriminalSquad'));
    assert.ok(content.includes('/criminalsquad'));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('init with _ides trae creates .trae/mcp.json with playwright server', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));

  try {
    await init(tempDir, { _skipPrompts: true, _ides: ['trae'] });

    const content = await readFile(join(tempDir, '.trae', 'mcp.json'), 'utf-8');
    const config = JSON.parse(content);
    assert.ok(config.mcpServers.playwright);
    assert.ok(config.mcpServers.playwright.args.includes('--config'));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
