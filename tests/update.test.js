import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { init } from '../src/init.js';
import { update } from '../src/update.js';

test('update returns failure when not initialized', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legalsquad-test-'));

  try {
    const result = await update(tempDir);
    assert.equal(result.success, false);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('update overwrites system files', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legalsquad-test-'));

  try {
    await init(tempDir, { _skipPrompts: true });
    await writeFile(join(tempDir, 'CLAUDE.md'), 'garbage content', 'utf-8');

    await update(tempDir);

    const content = await readFile(join(tempDir, 'CLAUDE.md'), 'utf-8');
    assert.ok(content.includes('LegalSquad'));
    assert.ok(!content.includes('garbage content'));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('update preserves _memory contents', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legalsquad-test-'));

  try {
    await init(tempDir, { _skipPrompts: true });
    await writeFile(
      join(tempDir, '_legalsquad', '_memory', 'company.md'),
      'My Company Info',
      'utf-8'
    );

    await update(tempDir);

    const content = await readFile(
      join(tempDir, '_legalsquad', '_memory', 'company.md'),
      'utf-8'
    );
    assert.equal(content, 'My Company Info');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('update preserves _investigations contents', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legalsquad-test-'));

  try {
    await init(tempDir, { _skipPrompts: true });
    await writeFile(
      join(tempDir, '_legalsquad', '_investigations', 'profile-analysis.md'),
      'investigation data',
      'utf-8'
    );

    await update(tempDir);

    const content = await readFile(
      join(tempDir, '_legalsquad', '_investigations', 'profile-analysis.md'),
      'utf-8'
    );
    assert.equal(content, 'investigation data');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('update preserves squads contents', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legalsquad-test-'));

  try {
    await init(tempDir, { _skipPrompts: true });
    await mkdir(join(tempDir, 'squads', 'my-squad'), { recursive: true });
    await writeFile(
      join(tempDir, 'squads', 'my-squad', 'custom.md'),
      'user squad content',
      'utf-8'
    );

    await update(tempDir);

    const content = await readFile(
      join(tempDir, 'squads', 'my-squad', 'custom.md'),
      'utf-8'
    );
    assert.equal(content, 'user squad content');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('update writes new version to .legalsquad-version', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legalsquad-test-'));

  try {
    await init(tempDir, { _skipPrompts: true });

    await update(tempDir);

    const version = await readFile(
      join(tempDir, '_legalsquad', '.legalsquad-version'),
      'utf-8'
    );
    assert.ok(version.trim().length > 0);
    assert.match(version.trim(), /^\d+\.\d+\.\d+$/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('update succeeds without existing .legalsquad-version (legacy install)', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legalsquad-test-'));

  try {
    await init(tempDir, { _skipPrompts: true });
    await rm(join(tempDir, '_legalsquad', '.legalsquad-version'), { force: true });

    const result = await update(tempDir);
    assert.equal(result.success, true);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('update returns success when initialized', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legalsquad-test-'));

  try {
    await init(tempDir, { _skipPrompts: true });
    const result = await update(tempDir);
    assert.equal(result.success, true);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('update succeeds when no bundled agents exist', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legalsquad-test-'));
  try {
    await init(tempDir, { _skipPrompts: true });
    const result = await update(tempDir);
    assert.equal(result.success, true);
    // No bundled agents — agents/ dir should not exist
    await assert.rejects(
      stat(join(tempDir, 'agents')),
      { code: 'ENOENT' }
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('update preserves user-created agent files', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legalsquad-test-'));
  try {
    await init(tempDir, { _skipPrompts: true });
    // User manually created an agent
    const agentsDir = join(tempDir, 'agents');
    await mkdir(agentsDir, { recursive: true });
    await writeFile(join(agentsDir, 'custom.agent.md'), 'my agent', 'utf-8');

    await update(tempDir);

    const content = await readFile(join(agentsDir, 'custom.agent.md'), 'utf-8');
    assert.equal(content, 'my agent');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

// BLOQUEADO (Task 7, não corrigido nesta task — ver task-7-report.md e o
// mesmo bloco em tests/init.test.js). update() reusa
// listAvailableSkills/getSkillMeta/installSkill e syncSkillCatalogArtifacts
// de src/init.js sem nenhum parâmetro de raiz — os dois testes abaixo
// dependem do bundle real do pacote (<repo>/skills), que não existe neste
// repo, e o segundo também do manifesto '_execucao-penal-v3-integration.yaml'
// hardcoded, dívida registrada e congelada para o F1 em
// F0-SANEAMENTO.md §5-bis.
test('update auto-imports bundled skills with env requirements', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legalsquad-test-'));
  try {
    await init(tempDir, { _skipPrompts: true });
    // image-ai-generator is the canonical non-MCP skill with env requirements (env: [OPENROUTER_API_KEY])
    // Simulate a user who installed legalsquad before this skill was bundled
    await rm(join(tempDir, 'skills', 'image-ai-generator'), { recursive: true, force: true });

    await update(tempDir);

    // image-ai-generator has `env: [OPENROUTER_API_KEY]` and should be re-installed by update
    const skillMd = join(tempDir, 'skills', 'image-ai-generator', 'SKILL.md');
    const content = await readFile(skillMd, 'utf-8');
    assert.ok(content.includes('OPENROUTER_API_KEY'));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('update does not auto-import preview skills', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legalsquad-test-'));
  try {
    await init(tempDir, { _skipPrompts: true });
    await writeFile(join(tempDir, 'skills', '_index.yaml'), 'stale\n');
    await writeFile(join(tempDir, 'skills', '_execucao-penal-v3-integration.yaml'), 'stale\n');
    await update(tempDir);
    await assert.rejects(
      stat(join(tempDir, 'skills', 'ep-fracao-progressao-engine')),
      { code: 'ENOENT' }
    );
    assert.match(await readFile(join(tempDir, 'skills', '_index.yaml'), 'utf8'), /schema_version: 3/);
    assert.match(
      await readFile(join(tempDir, 'skills', '_execucao-penal-v3-integration.yaml'), 'utf8'),
      /canonicalization:/,
    );
    await stat(join(tempDir, 'scripts', 'legal-calculators', 'remission-engine.mjs'));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('update preserva a edição do usuário feita DEPOIS da primeira atualização', async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legalsquad-bak-'));
  t.after(() => rm(tempDir, { recursive: true, force: true }));

  // Simula um arquivo canônico que o motor distribui e o usuário personaliza.
  const alvo = join(tempDir, '_legalsquad', 'core', 'runner.pipeline.md');
  await mkdir(dirname(alvo), { recursive: true });

  // Estado após a 1ª atualização: .bak guarda o ORIGINAL, o arquivo tem a
  // versão do motor — e então o advogado personaliza o arquivo.
  await writeFile(alvo + '.bak', 'ORIGINAL do usuário\n');
  await writeFile(alvo, 'EDIÇÃO DO ADVOGADO — semanas de ajuste fino\n');

  const { backupIfExists } = await import('../src/update.js');
  const resultado = await backupIfExists(alvo);

  // O conteúdo editado precisa estar preservado em ALGUM backup. Antes, a
  // função via que já existia um .bak e devolvia true sem copiar nada — o
  // update sobrescrevia a edição e ainda anunciava "(backup: X.bak)",
  // apontando para um backup que continha outra coisa.
  const { readdir } = await import('node:fs/promises');
  const arquivos = await readdir(dirname(alvo));
  const backups = arquivos.filter((f) => f.startsWith('runner.pipeline.md.bak'));

  const conteudos = await Promise.all(
    backups.map((f) => readFile(join(dirname(alvo), f), 'utf8'))
  );

  assert.ok(
    conteudos.some((c) => c.includes('EDIÇÃO DO ADVOGADO')),
    `a edição do usuário não foi preservada em nenhum backup. backups: ${JSON.stringify(backups)}, conteúdos: ${JSON.stringify(conteudos)}`
  );
  assert.ok(
    conteudos.some((c) => c.includes('ORIGINAL do usuário')),
    'o backup original também precisa sobreviver'
  );
  assert.ok(resultado, 'a função deve reportar que houve backup');
});

test('update não cria backup redundante quando nada mudou desde o último', async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legalsquad-bak2-'));
  t.after(() => rm(tempDir, { recursive: true, force: true }));

  const alvo = join(tempDir, 'arquivo.md');
  await writeFile(alvo, 'mesmo conteúdo\n');
  await writeFile(alvo + '.bak', 'mesmo conteúdo\n');

  const { backupIfExists } = await import('../src/update.js');
  await backupIfExists(alvo);

  const { readdir } = await import('node:fs/promises');
  const backups = (await readdir(tempDir)).filter((f) => f.includes('.bak'));
  assert.equal(backups.length, 1, `não deve multiplicar backups idênticos; veio ${JSON.stringify(backups)}`);
});
