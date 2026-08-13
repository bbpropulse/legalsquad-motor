import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SCRIPT = join(ROOT, 'scripts', 'squad-state.mjs');

// O runner tem CINCO laços com teto além da revisão — veto (2), Citation Gate
// (3), Redação Gate (3), retry de output (1) e retry de subagente (1). Todos
// eram contados de cabeça, e a escalada dependia de o modelo lembrar de
// escalar. Aqui eles passam a usar o MESMO cartório do loop de revisão, o que
// exige que vários laços coexistam no mesmo run — um por gate.

function makeSquad() {
  const dir = mkdtempSync(join(tmpdir(), 'ls-gate-'));
  writeFileSync(join(dir, 'squad.yaml'), 'name: "Teste"\ncode: "teste-x"\n', 'utf-8');
  writeFileSync(join(dir, 'squad-party.csv'), 'id,name,icon\nredator,Rui,✍️\n', 'utf-8');
  return dir;
}

function run(dir, ...args) {
  try {
    const stdout = execFileSync('node', [SCRIPT, args[0], dir, ...args.slice(1)], { encoding: 'utf-8' });
    return { code: 0, json: JSON.parse(stdout) };
  } catch (err) {
    return { code: err.status, json: JSON.parse(err.stdout || 'null') };
  }
}

const ledger = (dir) => JSON.parse(readFileSync(join(dir, 'review-state.json'), 'utf-8'));

test('dois gates coexistem no mesmo run sem um sobrescrever o outro', () => {
  // Antes, abrir o laço da citação apagaria o da revisão: o ledger guardava um
  // único loop. Num step de redação os dois estão abertos ao mesmo tempo.
  const dir = makeSquad();
  try {
    run(dir, 'gate-open', '--gate', 'revisao', '--loop', 'step-08', '--target', 'step-05', '--max', '3');
    run(dir, 'gate-open', '--gate', 'citacao', '--loop', 'citation-gate', '--target', 'step-05', '--max', '3');

    run(dir, 'gate-verdict', '--gate', 'citacao', '--reviewer', 'verificador', '--verdict', 'REJECT', '--fix', 'REsp 1 não encontrado');

    const l = ledger(dir);
    assert.equal(l.loops.citacao.cycles.length, 1, 'a citação contou o ciclo dela');
    assert.equal(l.loops.revisao.cycles.length, 0, 'a revisão não foi tocada');
    assert.equal(l.loops.revisao.status, 'open');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('cada gate tem o próprio teto, e estourar um não estoura o outro', () => {
  const dir = makeSquad();
  try {
    run(dir, 'gate-open', '--gate', 'veto', '--loop', 'veto-step-05', '--target', 'step-05', '--max', '2');
    run(dir, 'gate-open', '--gate', 'revisao', '--loop', 'step-08', '--target', 'step-05', '--max', '3');

    run(dir, 'gate-verdict', '--gate', 'veto', '--reviewer', 'veto', '--verdict', 'REJECT', '--fix', 'slide > 30 palavras');
    const estourou = run(dir, 'gate-verdict', '--gate', 'veto', '--reviewer', 'veto', '--verdict', 'REJECT', '--fix', 'outro problema');

    assert.equal(estourou.json.action, 'escalate');
    assert.equal(estourou.json.reason, 'teto-atingido');
    assert.equal(ledger(dir).loops.revisao.status, 'open', 'a revisão segue viva');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('escalada de QUALQUER gate sai com exit code 3 — não passa despercebida', () => {
  // É a assimetria que motivou a mudança: só a revisão saía com código de
  // erro. Um Citation Gate que escala em silêncio deixa passar peça com
  // citação não verificada.
  const dir = makeSquad();
  try {
    run(dir, 'gate-open', '--gate', 'citacao', '--loop', 'citation-gate', '--target', 'step-05', '--max', '1');
    const r = run(dir, 'gate-verdict', '--gate', 'citacao', '--reviewer', 'verificador', '--verdict', 'REJECT', '--fix', 'súmula inexistente');

    assert.equal(r.json.action, 'escalate');
    assert.notEqual(r.code, 0, 'escalada precisa sair com código != 0');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('gate-status consulta um gate específico e não confunde com os outros', () => {
  const dir = makeSquad();
  try {
    run(dir, 'gate-open', '--gate', 'revisao', '--loop', 'step-08', '--target', 'step-05');
    run(dir, 'gate-open', '--gate', 'redacao', '--loop', 'redacao-gate', '--target', 'step-05');
    run(dir, 'gate-verdict', '--gate', 'redacao', '--reviewer', 'redacao-gate', '--verdict', 'REJECT', '--fix', 'sem âncora do caso');

    const redacao = run(dir, 'gate-status', '--gate', 'redacao');
    assert.equal(redacao.json.action, 'revise');
    assert.deepEqual(redacao.json.fixes, ['sem âncora do caso']);

    const revisao = run(dir, 'gate-status', '--gate', 'revisao');
    assert.equal(revisao.json.action, 'none', 'revisão aberta e sem veredito ainda não decide nada');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('gate desconhecido no verdict falha em vez de abrir um laço implícito', () => {
  // Abrir sozinho zeraria a contagem: cada REJECT viraria "ciclo 1" e o teto
  // nunca chegaria — o laço giraria para sempre.
  const dir = makeSquad();
  try {
    const r = run(dir, 'gate-verdict', '--gate', 'inexistente', '--reviewer', 'x', '--verdict', 'APPROVE');
    assert.notEqual(r.code, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('sem --gate, o comando cai no laço de revisão — uso legado segue valendo', () => {
  const dir = makeSquad();
  try {
    run(dir, 'review-open', '--loop', 'step-08', '--target', 'step-05', '--max', '3');
    const r = run(dir, 'review-verdict', '--reviewer', 'step-08', '--verdict', 'REJECT', '--fix', 'faltou o pedido');

    assert.equal(r.json.action, 'revise');
    assert.equal(ledger(dir).loops.revisao.cycles.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('RETOMADA: os laços de todos os gates sobrevivem à sessão cair', () => {
  const dir = makeSquad();
  try {
    run(dir, 'gate-open', '--gate', 'citacao', '--loop', 'citation-gate', '--target', 'step-05', '--max', '3');
    run(dir, 'gate-verdict', '--gate', 'citacao', '--reviewer', 'verificador', '--verdict', 'REJECT', '--fix', 'conferir o REsp');

    // Sessão caiu: nada em memória, só o arquivo.
    const r = run(dir, 'gate-status', '--gate', 'citacao');
    assert.equal(r.json.cycle, 1);
    assert.deepEqual(r.json.fixes, ['conferir o REsp']);

    // E o ciclo seguinte continua de onde parou.
    const proximo = run(dir, 'gate-verdict', '--gate', 'citacao', '--reviewer', 'verificador', '--verdict', 'REJECT', '--fix', 'outro ponto');
    assert.equal(proximo.json.cycle, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
