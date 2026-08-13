import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { RUN_STATUSES, abrirRun, avancarRun, registrarCheckpoint, fecharRun, retomarRun } from '../src/run-state.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SCRIPT = join(ROOT, 'scripts', 'squad-state.mjs');

const RUN = '2026-08-12-100000';

// ---------------------------------------------------------------------------
// Módulo puro — as transições do run
// ---------------------------------------------------------------------------

test('abrirRun guarda o run_id, que é o dado que hoje se perde na queda de sessão', () => {
  const l = abrirRun({ runId: RUN, squad: 'peca', total: 8 });
  assert.equal(l.runId, RUN);
  assert.equal(l.squad, 'peca');
  assert.equal(l.status, 'running');
  assert.equal(l.step.total, 8);
  assert.equal(l.step.current, 0);
});

test('abrirRun sem run_id falha — um run sem id não é retomável', () => {
  assert.throws(() => abrirRun({ runId: '', squad: 'peca', total: 8 }), /run/i);
});

test('avancarRun move o ponteiro do step', () => {
  const l = avancarRun(abrirRun({ runId: RUN, squad: 'peca', total: 8 }), { current: 5, label: 'step-05-redacao' });
  assert.equal(l.step.current, 5);
  assert.equal(l.step.label, 'step-05-redacao');
  assert.equal(l.step.total, 8, 'o total não pode ser perdido ao avançar');
});

test('registrarCheckpoint guarda a resposta do usuário por step', () => {
  const l = registrarCheckpoint(abrirRun({ runId: RUN, squad: 'peca', total: 8 }), {
    step: 'step-03',
    resposta: 'opção 2 — focar na prescrição',
  });
  assert.equal(l.checkpoints['step-03'], 'opção 2 — focar na prescrição');
});

test('fecharRun só aceita status terminal', () => {
  const aberto = abrirRun({ runId: RUN, squad: 'peca', total: 8 });
  assert.equal(fecharRun(aberto, { status: 'completed' }).status, 'completed');
  assert.equal(fecharRun(aberto, { status: 'failed' }).status, 'failed');
  assert.throws(() => fecharRun(aberto, { status: 'running' }), /status/i);
  assert.ok(RUN_STATUSES.includes('running'));
});

test('retomarRun sem ledger diz "nenhum run" em vez de inventar um', () => {
  assert.equal(retomarRun(null).action, 'none');
});

test('retomarRun de um run interrompido devolve o run_id e onde parou', () => {
  const l = avancarRun(abrirRun({ runId: RUN, squad: 'peca', total: 8 }), { current: 5, label: 'step-05' });
  const r = retomarRun(l);
  assert.equal(r.action, 'resume');
  assert.equal(r.runId, RUN);
  assert.equal(r.step.current, 5);
  assert.equal(r.step.total, 8);
});

test('retomarRun de um run já encerrado não manda retomar', () => {
  const l = fecharRun(abrirRun({ runId: RUN, squad: 'peca', total: 8 }), { status: 'completed' });
  const r = retomarRun(l);
  assert.equal(r.action, 'closed');
  assert.equal(r.status, 'completed');
});

// ---------------------------------------------------------------------------
// Persistência via scripts/squad-state.mjs
// ---------------------------------------------------------------------------

function makeSquad() {
  const dir = mkdtempSync(join(tmpdir(), 'ls-run-'));
  writeFileSync(join(dir, 'squad.yaml'), 'name: "Teste"\ncode: "teste-x"\n', 'utf-8');
  writeFileSync(join(dir, 'squad-party.csv'), 'id,name,icon\nredator,Rui,✍️\n', 'utf-8');
  return dir;
}

function cli(dir, ...args) {
  const stdout = execFileSync('node', [SCRIPT, args[0], dir, ...args.slice(1)], { encoding: 'utf-8' });
  return stdout;
}

const runLedger = (dir) => JSON.parse(readFileSync(join(dir, 'run-state.json'), 'utf-8'));

test('init --run grava o run-state.json ao lado do state.json', () => {
  const dir = makeSquad();
  try {
    cli(dir, 'init', '--total', '8', '--run', RUN);
    assert.equal(runLedger(dir).runId, RUN);
    assert.equal(runLedger(dir).step.total, 8);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('init sem --run não cria o ledger — retrocompatível com squads antigos', () => {
  const dir = makeSquad();
  try {
    cli(dir, 'init', '--total', '8');
    assert.ok(!existsSync(join(dir, 'run-state.json')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('RETOMADA: depois da sessão cair, run-status devolve o run_id gravado em disco', () => {
  // É o buraco que este ledger fecha: hoje o run_id só existe na memória da
  // sessão, então o runner recomeça num run novo e a pasta antiga fica órfã.
  const dir = makeSquad();
  try {
    cli(dir, 'init', '--total', '8', '--run', RUN);
    cli(dir, 'step', '--current', '5', '--label', 'step-05-redacao', '--working', 'redator');

    // Sessão caiu: nada em memória, só o arquivo.
    const out = JSON.parse(cli(dir, 'run-status'));
    assert.equal(out.action, 'resume');
    assert.equal(out.runId, RUN);
    assert.equal(out.step.current, 5);
    assert.equal(out.step.label, 'step-05-redacao');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('run-status sem ledger diz "none" — não inventa um run para retomar', () => {
  const dir = makeSquad();
  try {
    assert.equal(JSON.parse(cli(dir, 'run-status')).action, 'none');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('checkpoint --resposta persiste a escolha, para não reperguntar ao retomar', () => {
  const dir = makeSquad();
  try {
    cli(dir, 'init', '--total', '8', '--run', RUN);
    cli(dir, 'checkpoint', '--agent', 'redator', '--step', 'step-03', '--resposta', 'seguir com a tese A');
    assert.equal(JSON.parse(cli(dir, 'run-status')).checkpoints['step-03'], 'seguir com a tese A');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('complete fecha o ledger — run encerrado não pede retomada', () => {
  const dir = makeSquad();
  try {
    cli(dir, 'init', '--total', '8', '--run', RUN);
    cli(dir, 'step', '--current', '8', '--label', 'fim', '--working', 'redator');
    cli(dir, 'complete');
    const out = JSON.parse(cli(dir, 'run-status'));
    assert.equal(out.action, 'closed');
    assert.equal(out.status, 'completed');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('fail fecha o ledger preservando onde parou — é o rastro do aborto', () => {
  const dir = makeSquad();
  try {
    cli(dir, 'init', '--total', '8', '--run', RUN);
    cli(dir, 'step', '--current', '3', '--label', 'step-03', '--working', 'redator');
    cli(dir, 'fail');
    const out = JSON.parse(cli(dir, 'run-status'));
    assert.equal(out.action, 'closed');
    assert.equal(out.status, 'failed');
    assert.equal(out.step.current, 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('step sem ledger aberto não quebra o state.json — o ledger é opcional', () => {
  const dir = makeSquad();
  try {
    cli(dir, 'init', '--total', '8');
    cli(dir, 'step', '--current', '1', '--label', 'step-01', '--working', 'redator');
    const s = JSON.parse(readFileSync(join(dir, 'state.json'), 'utf-8'));
    assert.equal(s.step.current, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Paridade das cópias (o script do usuário é auto-contido: não importa de src/)
// ---------------------------------------------------------------------------

const BEGIN = '// >>> run-state:begin';
const END = '// <<< run-state:end';

function block(raw, file) {
  const from = raw.indexOf(BEGIN);
  const to = raw.indexOf(END);
  assert.ok(from >= 0 && to > from, `marcadores run-state ausentes em ${file}`);
  return raw.slice(from + BEGIN.length, to).trim();
}

test('as transições do run são as MESMAS em src/, scripts/ e templates/scripts/', () => {
  const files = [
    join(ROOT, 'src', 'run-state.js'),
    join(ROOT, 'scripts', 'squad-state.mjs'),
    join(ROOT, 'templates', 'scripts', 'squad-state.mjs'),
  ];
  const [reference, ...rest] = files.map((f) => block(readFileSync(f, 'utf-8'), f));
  assert.ok(reference.length > 400, 'bloco de referência parece curto demais');
  rest.forEach((b, i) => assert.equal(b, reference, `bloco divergiu em ${files[i + 1]}`));
});
