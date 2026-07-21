import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  today,
  addDays,
  freshness,
  readTrackerResult,
  readTracker,
  appendEntry,
  recordSweep,
  lastSweep,
  lastCapture,
} from '../scripts/orchestra/_lib.mjs';
import {
  consolidarCarteira,
  writeCarteira,
  metricasCarteira,
  CARTEIRA_COLUNAS,
  FASES,
} from '../scripts/orchestra/carteira-consolidar.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ORCHESTRA = join(ROOT, 'scripts', 'orchestra');

const HORA = 3600 * 1000;
const iso = (msAtras) => new Date(Date.now() - msAtras).toISOString();

/** Cria um tracker temporário e devolve o caminho (usado via LEGALSQUAD_TRACKER). */
function tracker(linhas) {
  const dir = mkdtempSync(join(tmpdir(), 'orchestra-'));
  const file = join(dir, 'djen-tracker.jsonl');
  writeFileSync(file, linhas.map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n') + '\n', 'utf8');
  return file;
}

/** Roda um script da orchestra com o tracker temporário injetado. */
function run(script, args, trackerFile, env = {}) {
  return execFileSync(process.execPath, [join(ORCHESTRA, script), ...args], {
    encoding: 'utf8',
    env: { ...process.env, LEGALSQUAD_TRACKER: trackerFile, ...env },
  });
}

function comTracker(file, fn) {
  const antes = process.env.LEGALSQUAD_TRACKER;
  process.env.LEGALSQUAD_TRACKER = file;
  try { return fn(); } finally {
    if (antes === undefined) delete process.env.LEGALSQUAD_TRACKER;
    else process.env.LEGALSQUAD_TRACKER = antes;
  }
}

// --- Defeito 2: fuso do foro -------------------------------------------------

test('today() usa o fuso do foro (America/Sao_Paulo), não o da máquina', () => {
  // 02:00Z = 23:00 do dia anterior em Brasília: quem usa UTC erra o dia do vencimento.
  assert.equal(today(new Date('2026-07-21T02:00:00Z')), '2026-07-20');
  assert.equal(today(new Date('2026-07-21T12:00:00Z')), '2026-07-21');
  // 03:00Z = 00:00 em Brasília — já é o dia novo no foro.
  assert.equal(today(new Date('2026-07-21T03:00:00Z')), '2026-07-21');
});

test('addDays continua estável a partir de uma data de calendário', () => {
  assert.equal(addDays('2026-07-20', 7), '2026-07-27');
});

test('prazos-hoje enxerga o vencimento do dia mesmo numa máquina em UTC', () => {
  const hoje = today();
  const file = tracker([{ id: 'a', processo: '111', fatal: hoje, capturado_em: iso(0), teor: 'x' }]);
  const out = run('prazos-hoje.mjs', ['--json'], file, { TZ: 'UTC' });
  assert.equal(JSON.parse(out).registros.length, 1);
});

// --- Defeito 1: frescor no --json -------------------------------------------

test('--json carrega o frescor como campo estruturado', () => {
  const file = tracker([{ id: 'a', processo: '111', fatal: '1999-01-01', capturado_em: iso(2 * HORA) }]);
  const payload = JSON.parse(run('prazos-hoje.mjs', ['--json'], file));
  assert.ok(payload.freshness, 'JSON sem campo freshness');
  assert.equal(typeof payload.freshness.age_hours, 'number');
  assert.equal(payload.freshness.stale, false);
  assert.ok(Array.isArray(payload.registros));
  assert.equal(payload.registros.length, 0);
});

test('--json distingue cache inexistente de "não há prazo"', () => {
  const dir = mkdtempSync(join(tmpdir(), 'orchestra-vazio-'));
  const payload = JSON.parse(run('prazos-hoje.mjs', ['--json'], join(dir, 'nao-existe.jsonl')));
  assert.equal(payload.registros.length, 0);
  assert.equal(payload.freshness.stale, true);
  assert.equal(payload.freshness.last_capture, null);
  assert.equal(payload.freshness.age_hours, null);
});

test('--json marca cache velho como stale', () => {
  const file = tracker([{ id: 'a', processo: '111', capturado_em: iso(400 * 24 * HORA) }]);
  const payload = JSON.parse(run('prazos-semana.mjs', ['--json'], file));
  assert.equal(payload.freshness.stale, true);
  assert.ok(payload.freshness.age_hours > 1000);
});

// --- Defeito 3: comparação de instantes em intimacoes-recentes ---------------

test('intimacoes-recentes compara instantes, não strings (offset -03:00 não some)', () => {
  const agoraSP = new Date(Date.now() - 46 * 60 * 1000);
  // Mesmo instante, escrito com offset -03:00 — como STRING fica menor que o corte em Z.
  const comOffset = agoraSP.toISOString().replace('Z', '');
  const local = new Date(agoraSP.getTime() - 3 * HORA).toISOString().slice(0, -1) + '-03:00';
  assert.ok(comOffset.length > 0);
  const file = tracker([{ id: 'a', processo: '111', capturado_em: local, teor: 'recente' }]);
  const payload = JSON.parse(run('intimacoes-recentes.mjs', ['24', '--json'], file));
  assert.equal(payload.registros.length, 1, 'entrada com offset -03:00 sumiu do resultado');
});

// --- Defeito 4: linha JSONL ilegível ----------------------------------------

test('linha JSONL corrompida é contada e reportada, não descartada em silêncio', () => {
  const file = tracker([
    { id: 'a', processo: '111', capturado_em: iso(HORA), fatal: today() },
    '{"processo":"222","capturado_em"',
  ]);
  const { entries, ilegiveis } = comTracker(file, () => readTrackerResult());
  assert.equal(entries.length, 1);
  assert.equal(ilegiveis, 1);

  const payload = JSON.parse(run('prazos-hoje.mjs', ['--json'], file));
  assert.equal(payload.ilegiveis, 1);

  const humano = run('prazos-hoje.mjs', [], file);
  assert.match(humano, /ilegív/i);
});

test('readTracker continua devolvendo só as entradas legíveis', () => {
  const file = tracker([{ id: 'a', processo: '111' }, 'lixo']);
  assert.equal(comTracker(file, () => readTracker()).length, 1);
});

// --- Defeito 5: varredura separada da última intimação ----------------------

test('varredura sem novidades renova o frescor sem gravar intimação', () => {
  const file = tracker([{ id: 'a', processo: '111', capturado_em: iso(72 * HORA) }]);
  comTracker(file, () => {
    assert.equal(freshness().stale, true, 'sem varredura registrada deveria estar stale');
    recordSweep();
    const f = freshness();
    assert.equal(f.stale, false, 'varredura recente deveria renovar o frescor');
    assert.ok(f.last_sweep, 'freshness sem last_sweep');
    // A última intimação continua sendo a antiga — os dois instantes são distintos.
    assert.ok(f.last_capture < f.last_sweep);
    assert.ok(lastSweep());
    assert.ok(lastCapture());
  });
});

test('djen-tracker-add --varredura registra a varredura sem gravar entrada', () => {
  const file = tracker([{ id: 'a', processo: '111', capturado_em: iso(72 * HORA) }]);
  run('djen-tracker-add.mjs', ['--varredura'], file);
  const payload = JSON.parse(run('prazos-hoje.mjs', ['--json'], file));
  assert.equal(payload.freshness.stale, false);
  assert.equal(comTracker(file, () => readTracker()).length, 1);
});

test('gravar intimação também registra a varredura', () => {
  const file = tracker([]);
  comTracker(file, () => {
    appendEntry({ processo: '999', teor: 'novo' });
    assert.ok(lastSweep());
  });
});

// --- Defeito 6: frescor em cliente-lookup e processo-lookup -----------------

for (const [script, arg] of [['cliente-lookup.mjs', 'Fulano'], ['processo-lookup.mjs', '111']]) {
  test(`${script} informa o frescor do cache`, () => {
    const file = tracker([{ id: 'a', processo: '111', cliente: 'Fulano', capturado_em: iso(400 * 24 * HORA) }]);
    const humano = run(script, [arg], file);
    assert.match(humano, /desatualizado/i, `${script} não avisou que o cache está velho`);
    const payload = JSON.parse(run(script, [arg, '--json'], file));
    assert.equal(payload.freshness.stale, true);
  });
}

// --- Defeito 7: diretório de casos ausente ≠ carteira vazia ------------------

function casosCom(rowsByName) {
  const casos = join(mkdtempSync(join(tmpdir(), 'carteira-o-')), 'acervo', 'casos');
  for (const [nome, row] of Object.entries(rowsByName)) {
    const dir = join(casos, nome);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'carteira-row.json'), JSON.stringify(row));
  }
  return casos;
}

test('consolidarCarteira sinaliza diretório ausente', () => {
  const ausente = join(tmpdir(), 'nao-existe-carteira-xyz');
  assert.equal(consolidarCarteira(ausente).diretorio_ausente, true);
  assert.equal(consolidarCarteira(casosCom({ a: { processo: 'a' } })).diretorio_ausente, false);
});

test('writeCarteira não grava dataset vazio quando o diretório não existe', () => {
  const ausente = join(mkdtempSync(join(tmpdir(), 'carteira-aus-')), 'acervo', 'casos');
  const summary = writeCarteira(ausente);
  assert.equal(summary.diretorio_ausente, true);
  assert.equal(existsSync(join(ausente, '_carteira', 'carteira.json')), false);
});

test('metricasCarteira marca diretório ausente em vez de reportar 0 como fato', () => {
  const m = metricasCarteira(join(tmpdir(), 'nao-existe-carteira-abc'));
  assert.equal(m.diretorio_ausente, true);
  assert.equal(m.total, null);
});

test('CLI da carteira falha (exit != 0) quando o diretório de casos não existe', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'carteira-cli-'));
  for (const script of ['carteira-consolidar.mjs', 'carteira-metricas.mjs']) {
    assert.throws(
      () => execFileSync(process.execPath, [join(ORCHESTRA, script)], { cwd, encoding: 'utf8', stdio: 'pipe' }),
      /./,
      `${script} deveria falhar com diretório de casos ausente`,
    );
  }
});

// --- Defeito 8: esquema sem matéria jurídica --------------------------------

test('o dataset da carteira não presume matéria (nada de reu/tipos_penais)', () => {
  assert.ok(!CARTEIRA_COLUNAS.includes('reu'), 'coluna `reu` presume polo passivo penal');
  assert.ok(!CARTEIRA_COLUNAS.includes('tipos_penais'), 'coluna `tipos_penais` presume matéria criminal');
  assert.ok(CARTEIRA_COLUNAS.includes('partes'));
  assert.ok(CARTEIRA_COLUNAS.includes('classificacao'));
});

test('as fases da carteira não são as do processo penal', () => {
  assert.ok(!FASES.includes('inquerito'), 'fase `inquerito` presume matéria criminal');
  assert.ok(!FASES.includes('denuncia'), 'fase `denuncia` presume matéria criminal');
});

test('linha legada (reu/tipos_penais) é lida para os campos generalizados', () => {
  const casos = casosCom({ a: { processo: 'a', reu: 'Fulano', tipos_penais: ['art. 157 CP'] } });
  const { rows } = consolidarCarteira(casos);
  assert.equal(rows[0].partes, 'Fulano');
  assert.deepEqual(rows[0].classificacao, ['art. 157 CP']);
});

// --- Defeito 9: paridade repo × template ------------------------------------

test('scripts/orchestra e templates/scripts/orchestra são idênticos arquivo a arquivo', () => {
  const repoDir = ORCHESTRA;
  const tplDir = join(ROOT, 'templates', 'scripts', 'orchestra');
  const lista = (d) => readdirSync(d).filter((f) => !f.startsWith('.')).sort();
  assert.deepEqual(lista(tplDir), lista(repoDir), 'conjunto de arquivos divergiu entre repo e template');
  for (const f of lista(repoDir)) {
    assert.equal(
      readFileSync(join(tplDir, f), 'utf8'),
      readFileSync(join(repoDir, f), 'utf8'),
      `${f} divergiu entre scripts/orchestra e templates/scripts/orchestra — sincronize as duas cópias`,
    );
  }
});
