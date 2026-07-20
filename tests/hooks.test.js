// Testes do hook do Gate de Citações (.claude/hooks/verifica-citacoes.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOK = join(__dirname, '..', '.claude', 'hooks', 'verifica-citacoes.mjs');

function runHook(filePath) {
  const input = JSON.stringify({ tool_name: 'Write', tool_input: { file_path: filePath } });
  return spawnSync('node', [HOOK], { input, encoding: 'utf8' });
}
function pecaOutput(content) {
  const base = mkdtempSync(join(tmpdir(), 'cs-hook-'));
  const dir = join(base, 'squads', 'x', 'output');
  mkdirSync(dir, { recursive: true });
  const fp = join(dir, 'peca.md');
  writeFileSync(fp, content);
  return { base, fp };
}

function approveCitationGate(fp, content) {
  writeFileSync(`${fp}.citation-gate.json`, JSON.stringify({
    schema_version: '1',
    kind: 'criminalsquad.citation-gate-attestation',
    artifact: basename(fp),
    artifact_sha256: createHash('sha256').update(content).digest('hex'),
    gate_status: 'aprovado',
    verification_type: 'material',
    scope: 'citacoes_materiais',
    verified_by: 'revisor-ficticio',
    verified_at: '2026-07-09T18:00:00-03:00',
    citations: [{
      title: 'REsp fictício usado apenas no teste do manifesto',
      status: 'verificada',
      source_url: 'https://example.invalid/fonte-ficticia',
      consulted_at: '2026-07-09T17:45:00-03:00',
    }],
  }));
}

test('hook BLOQUEIA (exit 2) peça com marcador de pendência', () => {
  const { base, fp } = pecaOutput('Alegações finais. Conforme [NÃO VERIFICADO] precedente.\n');
  try {
    const r = runHook(fp);
    assert.equal(r.status, 2, 'deve bloquear com exit 2');
    assert.match(r.stderr, /BLOQUEAD/);
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test('hook PASSA (exit 0) peça limpa com citação completa', () => {
  const content = 'Conforme REsp 1.234.567/SP, Rel. Min. Fulano, 3a Turma, julgado em 01/02/2026.\n';
  const { base, fp } = pecaOutput(content);
  try {
    approveCitationGate(fp, content);
    assert.equal(runHook(fp).status, 0);
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test('hook IGNORA (exit 0) arquivo fora de squads/*/output, mesmo com marcador', () => {
  const base = mkdtempSync(join(tmpdir(), 'cs-hook-'));
  const fp = join(base, 'rascunho.md');
  writeFileSync(fp, 'Texto interno [NÃO VERIFICADO].\n');
  try {
    assert.equal(runHook(fp).status, 0);
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test('hook BLOQUEIA citação sem atestação material em vez de apenas avisar', () => {
  const { base, fp } = pecaOutput('Vide HC 999 e a Súmula 7 do tribunal.\n');
  try {
    const r = runHook(fp);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /manifesto ausente|BLOQUEADO/i);
  } finally { rmSync(base, { recursive: true, force: true }); }
});

// Caminho estilo Windows (backslash): a detecção de squads/*/output deve normalizar
// os separadores. Sem a normalização, o hook ignorava a peça no Windows (bug real:
// o Gate de Citações não bloqueava nada). O conteúdo vai inline (o arquivo não existe).
test('hook BLOQUEIA caminho com separador Windows (\\)', () => {
  const winPath = 'C:\\Users\\adv\\proj\\squads\\defesa\\output\\peca.md';
  const input = JSON.stringify({
    tool_name: 'Write',
    tool_input: { file_path: winPath, content: 'Alegações finais. Conforme [NÃO VERIFICADO].\n' },
  });
  const r = spawnSync('node', [HOOK], { input, encoding: 'utf8' });
  assert.equal(r.status, 2, 'deve bloquear mesmo com caminho Windows');
  assert.match(r.stderr, /BLOQUEAD/);
});
