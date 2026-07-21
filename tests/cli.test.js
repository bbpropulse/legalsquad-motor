import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { skillsCli } from '../src/skills-cli.js';
import { agentsCli } from '../src/agents-cli.js';
import { capturaCli } from '../src/captura-cli.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN = join(__dirname, '..', 'bin', 'legalsquad.js');

async function initializedDir() {
  const dir = await mkdtemp(join(tmpdir(), 'legalsquad-cli-'));
  await mkdir(join(dir, '_legalsquad', '_memory'), { recursive: true });
  return dir;
}

// Capture console.log output produced while running `fn`.
async function capture(fn) {
  const original = console.log;
  const lines = [];
  console.log = (...args) => lines.push(args.join(' '));
  try {
    const result = await fn();
    return { result, out: lines.join('\n') };
  } finally {
    console.log = original;
  }
}

function runBin(args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [BIN, ...args], { cwd });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

// --- skillsCli ---

test('skillsCli returns failure when project not initialized', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'legalsquad-cli-'));
  try {
    const { result } = await capture(() => skillsCli('list', [], dir));
    assert.equal(result.success, false);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('skillsCli list succeeds on an initialized project', async () => {
  const dir = await initializedDir();
  try {
    const { result, out } = await capture(() => skillsCli('list', [], dir));
    assert.equal(result.success, true);
    assert.ok(out.includes('LegalSquad Skills'));
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('skillsCli install with no id fails (prints usage)', async () => {
  const dir = await initializedDir();
  try {
    const { result, out } = await capture(() => skillsCli('install', [], dir));
    assert.equal(result.success, false);
    assert.ok(out.includes('Usage: legalsquad install <id>'));
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('skillsCli rejects an unknown subcommand', async () => {
  const dir = await initializedDir();
  try {
    const { result } = await capture(() => skillsCli('frobnicate', [], dir));
    assert.equal(result.success, false);
  } finally {
    await rm(dir, { recursive: true });
  }
});

// BLOQUEADO (Task 7, não corrigido nesta task — ver task-7-report.md).
// skillsCli() (src/skills-cli.js) passa por createResourceCli() (src/
// resource-cli.js), que chama resource.install(id, targetDir) — 2 argumentos
// fixos, sem espaço para o override de bundle aditivo que src/registry.js
// ganhou nesta task (usado em tests/skills.test.js). Dar esse terceiro
// argumento a resource-cli.js tocaria um dispatcher genérico compartilhado
// por skillsCli E agentsCli só para desbloquear este teste — risco
// desproporcional ao ganho; os outros 4 testes de skillsCli/agentsCli neste
// arquivo já cobrem o dispatcher (list/install-sem-id/subcomando
// desconhecido) sem precisar do bundle real.
test('skillsCli install + list + remove round-trips a bundled skill', async () => {
  const dir = await initializedDir();
  try {
    const installed = await capture(() => skillsCli('install', ['image-creator'], dir));
    assert.equal(installed.result.success, true);
    const content = await readFile(join(dir, 'skills', 'image-creator', 'SKILL.md'), 'utf-8');
    assert.ok(content.length > 0);

    const listed = await capture(() => skillsCli('list', [], dir));
    assert.ok(listed.out.includes('image-creator'));

    const removed = await capture(() => skillsCli('remove', ['image-creator'], dir));
    assert.equal(removed.result.success, true);
    await assert.rejects(
      () => readFile(join(dir, 'skills', 'image-creator', 'SKILL.md'), 'utf-8'),
      { code: 'ENOENT' }
    );
  } finally {
    await rm(dir, { recursive: true });
  }
});

// --- agentsCli ---

test('agentsCli list succeeds on an initialized project', async () => {
  const dir = await initializedDir();
  try {
    const { result, out } = await capture(() => agentsCli('list', [], dir));
    assert.equal(result.success, true);
    assert.ok(out.includes('LegalSquad Agents'));
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('agentsCli rejects an unknown subcommand', async () => {
  const dir = await initializedDir();
  try {
    const { result } = await capture(() => agentsCli('frobnicate', [], dir));
    assert.equal(result.success, false);
  } finally {
    await rm(dir, { recursive: true });
  }
});

// --- bin command table ---

test('bin prints help and exits 0 with no command', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'legalsquad-cli-'));
  try {
    const { code, stdout } = await runBin([], dir);
    assert.equal(code, 0);
    assert.ok(stdout.includes('legalsquad'));
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('bin exits 1 on an unknown command', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'legalsquad-cli-'));
  try {
    const { code, stdout } = await runBin(['bogus-command'], dir);
    assert.equal(code, 1);
    assert.ok(stdout.includes('legalsquad'));
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('bin skills exits 1 when project is not initialized', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'legalsquad-cli-'));
  try {
    const { code } = await runBin(['skills'], dir);
    assert.equal(code, 1);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('bin indexar-skills e check-skills funcionam num projeto distribuído sem src local', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'legalsquad-cli-'));
  try {
    const skillDir = join(dir, 'skills', 'exemplo');
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, 'SKILL.md'), `---
name: exemplo
description: Skill de teste
---
# Exemplo
`);

    const indexed = await runBin(['indexar-skills'], dir);
    assert.equal(indexed.code, 0, indexed.stderr);
    assert.match(await readFile(join(dir, 'skills', '_index.yaml'), 'utf8'), /name: exemplo/);

    const checked = await runBin(['check-skills'], dir);
    assert.equal(checked.code, 0, checked.stderr);

    await mkdir(join(dir, 'skills', 'incompleta'));
    const invalid = await runBin(['check-skills'], dir);
    assert.equal(invalid.code, 1);
    assert.match(invalid.stderr, /pasta sem SKILL\.md/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// --- capturaCli (native audiovisual command) ---

test('capturaCli help prints usage and succeeds without spawning python', async () => {
  const { result, out } = await capture(() => capturaCli(['help']));
  assert.equal(result.success, true);
  assert.ok(out.includes('legalsquad captura'));
  assert.ok(out.includes('--sigiloso'));
});

test('capturaCli with no args fails and does not spawn', async () => {
  const originalErr = console.error;
  console.error = () => {};
  try {
    const result = await capturaCli([]);
    assert.equal(result.success, false);
  } finally {
    console.error = originalErr;
  }
});

test('bin captura help exits 0 and surfaces the sigilo rule', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'legalsquad-cli-'));
  try {
    const { code, stdout } = await runBin(['captura', 'help'], dir);
    assert.equal(code, 0);
    assert.ok(stdout.includes('captura'));
    assert.ok(stdout.toLowerCase().includes('sigilo'));
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('bin captura with no args exits 1', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'legalsquad-cli-'));
  try {
    const { code } = await runBin(['captura'], dir);
    assert.equal(code, 1);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('main help lists the native captura command', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'legalsquad-cli-'));
  try {
    const { stdout } = await runBin([], dir);
    assert.ok(stdout.includes('captura'));
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('bin audit-skills gera relatório de maturidade num projeto distribuído', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'legalsquad-cli-'));
  try {
    const skillDir = join(dir, 'skills', 'exemplo');
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, 'SKILL.md'), `---
name: exemplo
description: Use para teste. Não use para decisão jurídica.
metadata:
  lifecycle: active
---
# Exemplo
`);

    const audited = await runBin(['audit-skills'], dir);
    assert.equal(audited.code, 0, audited.stderr);
    assert.match(audited.stdout, /Auditoria concluída: 1 skills/);
    const report = JSON.parse(await readFile(join(dir, 'skills', '_quality-report.json'), 'utf8'));
    assert.equal(report.summary.skills, 1);
    assert.equal(report.summary.high_performance_eligible, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
