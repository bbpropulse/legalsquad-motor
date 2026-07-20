import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, mkdir, stat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { installGlobal } from '../src/install-global.js';

async function withTempHome(fn) {
  const home = await mkdtemp(join(tmpdir(), 'criminalsquad-global-'));
  try {
    return await fn(home);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

test('install-global does NOT create a global data home (project data stays per-folder)', async () => {
  await withTempHome(async (home) => {
    await installGlobal({ homeDir: home });
    // No casa padrão: the global install ships only the command; the /criminalsquad
    // skill auto-initializes the current project folder on first use.
    await assert.rejects(stat(join(home, 'CriminalSquad', '_criminalsquad')));
  });
});

test('install-global installs the skill into ~/.claude/skills', async () => {
  await withTempHome(async (home) => {
    await installGlobal({ homeDir: home });
    const skill = await readFile(
      join(home, '.claude', 'skills', 'criminalsquad', 'SKILL.md'),
      'utf-8'
    );
    assert.ok(skill.includes('name: criminalsquad'));
    assert.ok(skill.includes('Chefe-roteador'));
  });
});

test('install-global installs specialist agents but skips the README index', async () => {
  await withTempHome(async (home) => {
    const result = await installGlobal({ homeDir: home });
    const agentsDir = join(home, '.claude', 'agents');
    const files = await readdir(agentsDir);
    assert.ok(result.agentsInstalled > 10, 'expected the specialist agents to be installed');
    assert.ok(files.includes('catalog-scout.md'));
    assert.ok(!files.includes('README.md'), 'README index must not be copied as an agent');
  });
});

test('install-global activates the chefe-roteador in ~/.claude/CLAUDE.md', async () => {
  await withTempHome(async (home) => {
    await installGlobal({ homeDir: home });
    const claudeMd = await readFile(join(home, '.claude', 'CLAUDE.md'), 'utf-8');
    assert.ok(claudeMd.includes('chefe-roteador'));
    assert.ok(claudeMd.includes('ignore este bloco e responda normalmente'), 'must include the non-legal exit clause');
    assert.ok(claudeMd.includes('BEGIN CriminalSquad'));
  });
});

test('install-global preserves an existing global CLAUDE.md and is idempotent', async () => {
  await withTempHome(async (home) => {
    const claudeDir = join(home, '.claude');
    await mkdir(claudeDir, { recursive: true });
    await writeFile(join(claudeDir, 'CLAUDE.md'), '# Minhas regras globais\nNão apague isto.\n', 'utf-8');

    await installGlobal({ homeDir: home });
    await installGlobal({ homeDir: home }); // run twice

    const claudeMd = await readFile(join(claudeDir, 'CLAUDE.md'), 'utf-8');
    assert.ok(claudeMd.includes('Minhas regras globais'), 'user content must be preserved');
    const occurrences = claudeMd.split('BEGIN CriminalSquad').length - 1;
    assert.equal(occurrences, 1, 'the CriminalSquad block must appear exactly once');
  });
});

test('install-global never overwrites a user agent of the same name', async () => {
  await withTempHome(async (home) => {
    const agentsDir = join(home, '.claude', 'agents');
    await mkdir(agentsDir, { recursive: true });
    const userAgent = join(agentsDir, 'catalog-scout.md');
    await writeFile(userAgent, 'MEU AGENTE PESSOAL', 'utf-8');

    const result = await installGlobal({ homeDir: home });

    assert.equal(await readFile(userAgent, 'utf-8'), 'MEU AGENTE PESSOAL');
    assert.ok(result.agentsSkipped >= 1, 'the colliding agent must be reported as skipped');
  });
});

test('install-global collapses duplicate/corrupted CriminalSquad blocks into one', async () => {
  await withTempHome(async (home) => {
    const claudeDir = join(home, '.claude');
    await mkdir(claudeDir, { recursive: true });
    // Simulate a file already corrupted by an older buggy run: two full blocks.
    const begin = '<!-- BEGIN CriminalSquad (install-global) -->';
    const end = '<!-- END CriminalSquad (install-global) -->';
    const corrupted =
      `# Regras do usuário\nManter isto.\n\n${begin}\nbloco antigo 1\n${end}\n\n${begin}\nbloco antigo 2\n${end}\n`;
    await writeFile(join(claudeDir, 'CLAUDE.md'), corrupted, 'utf-8');

    await installGlobal({ homeDir: home });

    const md = await readFile(join(claudeDir, 'CLAUDE.md'), 'utf-8');
    assert.ok(md.includes('Manter isto.'), 'user content must survive');
    assert.equal(md.split(begin).length - 1, 1, 'exactly one BEGIN after collapse');
    assert.equal(md.split(end).length - 1, 1, 'exactly one END after collapse');
    assert.ok(!md.includes('bloco antigo'), 'stale block bodies must be removed');
  });
});

test('install-global backs up CLAUDE.md before modifying an existing file', async () => {
  await withTempHome(async (home) => {
    const claudeDir = join(home, '.claude');
    await mkdir(claudeDir, { recursive: true });
    // Worst case: user wrapped their OWN rule in our reserved markers. We cannot
    // tell it apart from our block, so it is replaced — but must be recoverable.
    const original =
      '# Minhas regras\n<!-- BEGIN CriminalSquad (install-global) -->\nREGRA QUE NAO PODE SUMIR\n<!-- END CriminalSquad (install-global) -->\n';
    await writeFile(join(claudeDir, 'CLAUDE.md'), original, 'utf-8');

    const result = await installGlobal({ homeDir: home });

    assert.equal(result.claudeMdBackedUp, true);
    const bak = await readFile(join(claudeDir, 'CLAUDE.md.bak'), 'utf-8');
    assert.equal(bak, original, 'the .bak must hold the exact original for recovery');
  });
});

test('install-global keeps CRLF line endings on a Windows-style CLAUDE.md', async () => {
  await withTempHome(async (home) => {
    const claudeDir = join(home, '.claude');
    await mkdir(claudeDir, { recursive: true });
    await writeFile(join(claudeDir, 'CLAUDE.md'), '# Regras\r\nlinha\r\n', 'utf-8');

    await installGlobal({ homeDir: home });

    const md = await readFile(join(claudeDir, 'CLAUDE.md'), 'utf-8');
    assert.ok(md.includes('BEGIN CriminalSquad'), 'block was inserted');
    // No lone LF inside the appended block (everything should be CRLF).
    const loneLf = /[^\r]\n/.test(md);
    assert.ok(!loneLf, 'must not introduce lone LF into a CRLF file');
  });
});

test('install-global installs the Citation Gate hook and registers it globally', async () => {
  await withTempHome(async (home) => {
    const result = await installGlobal({ homeDir: home });
    assert.equal(result.citationHook, 'registered');
    // hook file copied
    await stat(join(home, '.claude', 'hooks', 'verifica-citacoes.mjs'));
    // PostToolUse entry registered with an absolute command to our hook
    const settings = JSON.parse(await readFile(join(home, '.claude', 'settings.json'), 'utf-8'));
    const entries = settings.hooks.PostToolUse;
    const cmds = entries.flatMap((e) => e.hooks.map((h) => h.command));
    assert.ok(cmds.some((c) => c.includes('verifica-citacoes')), 'hook command must be registered');
  });
});

test('install-global hook registration is idempotent and preserves user hooks', async () => {
  await withTempHome(async (home) => {
    const claudeDir = join(home, '.claude');
    await mkdir(claudeDir, { recursive: true });
    // Pre-existing user settings with their own hook.
    const userSettings = {
      hooks: { PostToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: 'echo meu-hook' }] }] },
      outputStyle: 'default',
    };
    await writeFile(join(claudeDir, 'settings.json'), JSON.stringify(userSettings, null, 2), 'utf-8');

    await installGlobal({ homeDir: home });
    await installGlobal({ homeDir: home }); // twice

    const settings = JSON.parse(await readFile(join(claudeDir, 'settings.json'), 'utf-8'));
    const cmds = settings.hooks.PostToolUse.flatMap((e) => e.hooks.map((h) => h.command));
    assert.ok(cmds.includes('echo meu-hook'), 'user hook must be preserved');
    assert.equal(settings.outputStyle, 'default', 'user keys preserved');
    const ours = cmds.filter((c) => c.includes('verifica-citacoes'));
    assert.equal(ours.length, 1, 'our hook must appear exactly once');
    // backup created
    await stat(join(claudeDir, 'settings.json.bak'));
  });
});

test('install-global never clobbers an unparseable settings.json', async () => {
  await withTempHome(async (home) => {
    const claudeDir = join(home, '.claude');
    await mkdir(claudeDir, { recursive: true });
    await writeFile(join(claudeDir, 'settings.json'), '{ not valid json', 'utf-8');

    const result = await installGlobal({ homeDir: home });

    assert.equal(result.citationHook, 'manual');
    assert.equal(await readFile(join(claudeDir, 'settings.json'), 'utf-8'), '{ not valid json');
  });
});

test('install-global preserves the ORIGINAL backups across re-runs', async () => {
  await withTempHome(async (home) => {
    const claudeDir = join(home, '.claude');
    await mkdir(claudeDir, { recursive: true });
    const originalMd = '# Minhas regras originais\nNão apagar.\n';
    const originalSettings = JSON.stringify({ outputStyle: 'default' }, null, 2) + '\n';
    await writeFile(join(claudeDir, 'CLAUDE.md'), originalMd, 'utf-8');
    await writeFile(join(claudeDir, 'settings.json'), originalSettings, 'utf-8');

    await installGlobal({ homeDir: home }); // 1st run: .bak = original
    await installGlobal({ homeDir: home }); // 2nd run: must NOT overwrite the .bak

    assert.equal(
      await readFile(join(claudeDir, 'CLAUDE.md.bak'), 'utf-8'),
      originalMd,
      'CLAUDE.md.bak must still hold the ORIGINAL after re-run'
    );
    assert.equal(
      await readFile(join(claudeDir, 'settings.json.bak'), 'utf-8'),
      originalSettings,
      'settings.json.bak must still hold the ORIGINAL after re-run'
    );
  });
});
