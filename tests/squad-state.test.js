import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, '..', 'scripts', 'squad-state.mjs');

// Cria uma pasta de squad mínima (squad.yaml + squad-party.csv) num tmp dir.
function makeSquad() {
  const dir = mkdtempSync(join(tmpdir(), 'cs-state-'));
  writeFileSync(join(dir, 'squad.yaml'), 'name: "Teste"\ncode: "teste-x"\nicon: "⚖️"\n', 'utf-8');
  writeFileSync(
    join(dir, 'squad-party.csv'),
    'id,name,icon,role,path,execution,skills\n' +
      'triagem,Tânia,🗂️,coleta,./agents/triagem.custom.md,inline,\n' +
      'redator,Rafael,✍️,redige,./agents/redator.custom.md,inline,"web_search,web_fetch"\n' +
      'revisor,Vera,✅,revisa,./agents/revisor.custom.md,subagent,\n',
    'utf-8'
  );
  return dir;
}

function run(dir, ...args) {
  return execFileSync('node', [SCRIPT, args[0], dir, ...args.slice(1)], { encoding: 'utf-8' });
}
const stateOf = (dir) => JSON.parse(readFileSync(join(dir, 'state.json'), 'utf-8'));

const VALID_SQUAD = new Set(['idle', 'running', 'completed', 'checkpoint', 'failed']);
const VALID_AGENT = new Set(['idle', 'working', 'delivering', 'done', 'checkpoint']);

// Espelha o contrato (state.schema.json) e o isValidState do dashboard.
function assertValid(s) {
  assert.equal(typeof s.squad, 'string');
  assert.ok(VALID_SQUAD.has(s.status), `status válido: ${s.status}`);
  assert.equal(typeof s.step.current, 'number');
  assert.equal(typeof s.step.total, 'number');
  assert.equal(typeof s.step.label, 'string');
  assert.ok(Array.isArray(s.agents));
  for (const a of s.agents) {
    assert.equal(typeof a.id, 'string');
    assert.equal(typeof a.name, 'string');
    assert.equal(typeof a.icon, 'string');
    assert.ok(VALID_AGENT.has(a.status), `agente status válido: ${a.status}`);
    assert.equal(typeof a.desk.col, 'number');
    assert.equal(typeof a.desk.row, 'number');
  }
  assert.ok(s.handoff === null || typeof s.handoff === 'object');
}

test('init cria state.json idle, schema-válido, com desks por índice', () => {
  const dir = makeSquad();
  try {
    run(dir, 'init', '--total', '3');
    const s = stateOf(dir);
    assertValid(s);
    assert.equal(s.squad, 'teste-x');
    assert.equal(s.status, 'idle');
    assert.deepEqual(s.step, { current: 0, total: 3, label: '' });
    assert.equal(s.agents.length, 3);
    assert.ok(s.agents.every((a) => a.status === 'idle'));
    assert.deepEqual(s.agents[0].desk, { col: 1, row: 1 });
    assert.deepEqual(s.agents[1].desk, { col: 2, row: 1 });
    assert.deepEqual(s.agents[2].desk, { col: 3, row: 1 });
    assert.equal(s.handoff, null);
    assert.equal(s.startedAt, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('step 1 marca working, seta startedAt e handoff null; step 2 com --from gera handoff e marca o anterior done', () => {
  const dir = makeSquad();
  try {
    run(dir, 'init', '--total', '3');
    run(dir, 'step', '--current', '1', '--label', 'Triagem', '--working', 'triagem');
    let s = stateOf(dir);
    assertValid(s);
    assert.equal(s.status, 'running');
    assert.equal(s.step.current, 1);
    assert.equal(s.agents.find((a) => a.id === 'triagem').status, 'working');
    assert.ok(s.startedAt, 'startedAt deve ser setado no primeiro step');
    assert.equal(s.handoff, null);

    const firstStarted = s.startedAt;
    run(dir, 'step', '--current', '2', '--label', 'Redação', '--working', 'redator', '--from', 'triagem', '--message', 'Ficha pronta');
    s = stateOf(dir);
    assertValid(s);
    assert.equal(s.agents.find((a) => a.id === 'triagem').status, 'done', 'agente anterior vira done');
    assert.equal(s.agents.find((a) => a.id === 'redator').status, 'working');
    assert.equal(s.agents.find((a) => a.id === 'revisor').status, 'idle');
    assert.deepEqual(
      { from: s.handoff.from, to: s.handoff.to, message: s.handoff.message },
      { from: 'triagem', to: 'redator', message: 'Ficha pronta' }
    );
    assert.equal(s.startedAt, firstStarted, 'startedAt é preservado');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('step com múltiplos --working (fan-out) marca todos working com a mesma activity', () => {
  const dir = makeSquad();
  try {
    run(dir, 'init', '--total', '3');
    run(dir, 'step', '--current', '2', '--label', 'paralelo (2)', '--working', 'redator', '--working', 'revisor', '--activity', 'processando');
    const s = stateOf(dir);
    assertValid(s);
    assert.equal(s.agents.find((a) => a.id === 'redator').status, 'working');
    assert.equal(s.agents.find((a) => a.id === 'revisor').status, 'working');
    assert.equal(s.agents.find((a) => a.id === 'redator').activity, 'processando');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('checkpoint, complete e fail produzem estados válidos com os campos corretos', () => {
  const dir = makeSquad();
  try {
    run(dir, 'init', '--total', '3');
    run(dir, 'step', '--current', '1', '--label', 'X', '--working', 'triagem');

    run(dir, 'checkpoint', '--agent', 'triagem');
    let s = stateOf(dir);
    assertValid(s);
    assert.equal(s.status, 'checkpoint');
    assert.equal(s.agents.find((a) => a.id === 'triagem').status, 'checkpoint');

    run(dir, 'complete');
    s = stateOf(dir);
    assertValid(s);
    assert.equal(s.status, 'completed');
    assert.ok(s.agents.every((a) => a.status === 'done'));
    assert.ok(s.completedAt, 'completedAt definido');

    run(dir, 'fail');
    s = stateOf(dir);
    assertValid(s);
    assert.equal(s.status, 'failed');
    assert.ok(s.failedAt, 'failedAt definido');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('escrita é atômica: não deixa state.json.tmp para trás', () => {
  const dir = makeSquad();
  try {
    run(dir, 'init', '--total', '3');
    assert.ok(!existsSync(join(dir, 'state.json.tmp')), 'tmp não deve restar');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
