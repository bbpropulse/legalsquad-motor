import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseScores, statsForSquad, resumirSquads } from '../scripts/eval-resumo.mjs';
import { AREA_DEMO } from './fixtures/caminhos.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const SQUADS_DEMO = join(AREA_DEMO, 'squads');

// A fixture demo-squad tem 7 linhas: 6 com nota válida (92, 85, 88, 74, 8.5, 61)
// e 1 sem nota ("n/a"), que o parser deve ignorar em vez de contaminar a média.
const NOTAS_VALIDAS = [92, 85, 88, 74, 8.5, 61];
const MEDIA = Math.round(NOTAS_VALIDAS.reduce((a, b) => a + b, 0) / NOTAS_VALIDAS.length);

test('parseScores lê a tabela ignorando cabeçalho, separador e linhas sem nota', () => {
  const linhas = parseScores(join(SQUADS_DEMO, 'demo-squad', '_evals', 'scores.md'));

  assert.equal(linhas.length, NOTAS_VALIDAS.length, 'a linha "n/a" não pode entrar');
  assert.deepEqual(linhas.map((l) => l.nota), NOTAS_VALIDAS);
  assert.equal(linhas[0].caso, 'caso-entrega-simples');
  assert.equal(linhas[0].verdict, 'APROVADO');
});

test('parseScores normaliza vírgula decimal e nota com denominador', () => {
  // Os dois formatos que o parser declara aceitar — "8,5" (escala 0-10) e
  // "61/100" (com denominador). Sem isso a média era corrompida em silêncio.
  const linhas = parseScores(join(SQUADS_DEMO, 'demo-squad', '_evals', 'scores.md'));
  assert.ok(linhas.some((l) => l.nota === 8.5), 'deve ler "8,5" como 8.5');
  assert.ok(linhas.some((l) => l.nota === 61), 'deve ler "61/100" como 61');
});

test('statsForSquad calcula média, faixa e aprovados', () => {
  const st = statsForSquad('demo-squad', { squadsDir: SQUADS_DEMO });

  assert.equal(st.n, NOTAS_VALIDAS.length);
  assert.equal(st.media, MEDIA);
  assert.equal(st.min, Math.min(...NOTAS_VALIDAS));
  assert.equal(st.max, Math.max(...NOTAS_VALIDAS));
  assert.equal(st.ultima, NOTAS_VALIDAS.at(-1));
  assert.equal(st.aprovados, 3, 'três linhas com verdict APROVADO');
});

test('statsForSquad sinaliza regressão quando a última nota cai abaixo da média', () => {
  const st = statsForSquad('demo-squad', { squadsDir: SQUADS_DEMO });
  assert.ok(st.ultima < st.media, 'a fixture foi montada com regressão deliberada');
  assert.equal(st.regressao, true);
});

test('statsForSquad devolve null para squad sem scores.md', () => {
  assert.equal(statsForSquad('nao-existe', { squadsDir: SQUADS_DEMO }), null);
});

test('statsForSquad distingue scores.md vazio de squad inexistente', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'eval-vazio-'));
  try {
    await mkdir(join(tmp, 'squad-vazio', '_evals'), { recursive: true });
    await writeFile(
      join(tmp, 'squad-vazio', '_evals', 'scores.md'),
      '| Data | Run/Caso | Nota | Verdict | Observações |\n|---|---|---|---|---|\n'
    );

    const st = statsForSquad('squad-vazio', { squadsDir: tmp });
    assert.notEqual(st, null, 'arquivo existe: não é null');
    assert.equal(st.n, 0, 'tabela só com cabeçalho conta zero avaliações');
    assert.equal(st.regressao, false, 'sem notas não há regressão a declarar');
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('resumirSquads descobre sozinho os squads que têm scores', () => {
  const todos = resumirSquads({ squadsDir: SQUADS_DEMO });
  assert.deepEqual(todos.map((s) => s.squad), ['demo-squad']);
});

test('o CLI eval-resumo roda contra uma raiz arbitrária e reporta a regressão', () => {
  const r = spawnSync(
    process.execPath,
    [join(RAIZ, 'scripts', 'eval-resumo.mjs'), 'demo-squad', '--squads-dir', SQUADS_DEMO],
    { encoding: 'utf8' }
  );

  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /demo-squad/);
  assert.match(r.stdout, new RegExp(String(MEDIA)), 'a média deve aparecer na saída');
  assert.match(r.stdout, /⚠️/, 'a regressão deve ser sinalizada ao usuário');
});

test('o CLI não quebra quando não há nenhum squad com scores', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'eval-nenhum-'));
  try {
    const r = spawnSync(
      process.execPath,
      [join(RAIZ, 'scripts', 'eval-resumo.mjs'), '--squads-dir', tmp],
      { encoding: 'utf8' }
    );
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Nenhum squad com/i);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});
