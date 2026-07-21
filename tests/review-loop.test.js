import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  REVIEW_ACTIONS,
  DEFAULT_MAX_REVIEW_CYCLES,
  normalizeFix,
  combineVerdicts,
  repeatedFixes,
  decideReview,
  applyVerdict,
  resumeReview,
} from '../src/review-loop.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SCRIPT = join(ROOT, 'scripts', 'squad-state.mjs');

const approve = (reviewer) => ({ reviewer, verdict: 'APPROVE', fixes: [] });
const reject = (reviewer, ...fixes) => ({ reviewer, verdict: 'REJECT', fixes });

// ---------------------------------------------------------------------------
// Módulo puro — a contabilidade do loop
// ---------------------------------------------------------------------------

test('APPROVE no primeiro ciclo manda seguir em frente', () => {
  const d = decideReview({ verdicts: [approve('revisor')], history: [] });
  assert.equal(d.action, REVIEW_ACTIONS.ADVANCE);
  assert.equal(d.cycle, 1);
  assert.equal(d.verdict, 'APPROVE');
  assert.deepEqual(d.fixes, []);
});

test('REJECT com fixes novos manda revisar e conta o ciclo', () => {
  const d = decideReview({ verdicts: [reject('revisor', 'citar a fonte do pedido')], history: [] });
  assert.equal(d.action, REVIEW_ACTIONS.REVISE);
  assert.equal(d.cycle, 1);
  assert.equal(d.nextCycle, 2);
  assert.deepEqual(d.fixes, ['citar a fonte do pedido']);
  assert.equal(d.maxCycles, DEFAULT_MAX_REVIEW_CYCLES);
});

test('teto atingido sem APPROVE escala em vez de girar de novo', () => {
  const history = [
    { cycle: 1, fixes: ['primeiro problema'] },
    { cycle: 2, fixes: ['segundo problema'] },
  ];
  const d = decideReview({ verdicts: [reject('revisor', 'terceiro problema')], history, maxCycles: 3 });
  assert.equal(d.action, REVIEW_ACTIONS.ESCALATE);
  assert.equal(d.reason, 'teto-atingido');
  assert.equal(d.cycle, 3);
});

test('fix REPETIDO escala antes do teto — não gasta os ciclos restantes', () => {
  const history = [{ cycle: 1, fixes: ['Falta indicar a folha do documento.'] }];
  const d = decideReview({
    verdicts: [reject('revisor', 'falta  indicar a folha do documento')],
    history,
    maxCycles: 5,
  });
  assert.equal(d.action, REVIEW_ACTIONS.ESCALATE);
  assert.equal(d.reason, 'nao-convergiu');
  assert.equal(d.cycle, 2);
  assert.ok(d.maxCycles > d.cycle, 'ainda havia ciclo sobrando quando escalou');
  assert.deepEqual(d.repeated, ['falta  indicar a folha do documento']);
});

test('normalizeFix ignora acento, caixa, pontuação e espaço duplicado', () => {
  assert.equal(normalizeFix('Falta a  CITAÇÃO!'), normalizeFix('falta a citacao'));
  assert.notEqual(normalizeFix('falta citação'), normalizeFix('sobra citação'));
  assert.equal(normalizeFix(null), '');
});

test('repeatedFixes só acusa o que já apareceu antes', () => {
  const history = [{ fixes: ['a'] }, { fixes: ['b'] }];
  assert.deepEqual(repeatedFixes(['B', 'c'], history), ['B']);
  assert.deepEqual(repeatedFixes(['c'], history), []);
});

// --- o furo apontado pelo painel: dois revisores em parallel_group ---

test('revisores em paralelo: se um aprova e o outro rejeita, vale o REJECT (conservador)', () => {
  const d = decideReview({ verdicts: [approve('revisor-forma'), reject('revisor-merito', 'tese sem fundamento')] });
  assert.equal(d.verdict, 'REJECT');
  assert.equal(d.action, REVIEW_ACTIONS.REVISE);
  assert.deepEqual(d.fixes, ['tese sem fundamento']);
});

test('revisores em paralelo: os fixes dos que rejeitam são unidos sem duplicata', () => {
  const c = combineVerdicts([
    reject('a', 'faltou o pedido', 'Faltou  o PEDIDO'),
    reject('b', 'faltou o pedido!', 'faltou a data'),
  ]);
  assert.equal(c.verdict, 'REJECT');
  assert.deepEqual(c.fixes, ['faltou o pedido', 'faltou a data']);
});

test('veredito ilegível não vira aprovação — escala (não sei ler ≠ aprovado)', () => {
  const d = decideReview({ verdicts: [approve('revisor-forma'), { reviewer: 'revisor-merito', verdict: '' }] });
  assert.equal(d.action, REVIEW_ACTIONS.ESCALATE);
  assert.equal(d.reason, 'veredito-ilegivel');
  assert.ok(d.detail.includes('revisor-merito'));
});

test('nenhum veredito recebido escala em vez de seguir', () => {
  const d = decideReview({ verdicts: [] });
  assert.equal(d.action, REVIEW_ACTIONS.ESCALATE);
  assert.equal(d.reason, 'veredito-ilegivel');
});

test('REJECT sem fixes escala — não há feedback-delta para devolver ao writer', () => {
  const d = decideReview({ verdicts: [reject('revisor')] });
  assert.equal(d.action, REVIEW_ACTIONS.ESCALATE);
  assert.equal(d.reason, 'reject-sem-fixes');
});

test('maxCycles inválido cai no default em vez de virar loop infinito', () => {
  for (const bad of [0, -1, 'três', null, undefined, 2.5]) {
    const d = decideReview({ verdicts: [reject('r', 'x')], maxCycles: bad });
    assert.equal(d.maxCycles, DEFAULT_MAX_REVIEW_CYCLES, `maxCycles=${bad}`);
  }
});

// --- ledger puro (o que é persistido) ---

test('applyVerdict com --expect 2 aguarda o segundo revisor antes de decidir', () => {
  const opened = { loop: 'step-08', target: 'step-05', maxCycles: 3, cycles: [], pending: null, status: 'open' };
  const first = applyVerdict(opened, approve('step-07'), { expect: 2 });
  assert.equal(first.result.action, REVIEW_ACTIONS.AWAIT);
  assert.equal(first.result.received, 1);
  assert.equal(first.ledger.cycles.length, 0);

  const second = applyVerdict(first.ledger, reject('step-08', 'sem dispositivo'), { expect: 2 });
  assert.equal(second.result.action, REVIEW_ACTIONS.REVISE);
  assert.equal(second.ledger.cycles.length, 1);
  assert.equal(second.ledger.pending, null);
  assert.equal(second.ledger.status, 'open');
});

test('applyVerdict marca o ledger como approved / escalated conforme a decisão', () => {
  const base = { loop: 'r', target: 't', maxCycles: 1, cycles: [], pending: null, status: 'open' };
  assert.equal(applyVerdict(base, approve('r'), {}).ledger.status, 'approved');
  assert.equal(applyVerdict(base, reject('r', 'x'), {}).ledger.status, 'escalated');
});

test('resumeReview devolve a última decisão persistida (retomada)', () => {
  const base = { loop: 'step-06', target: 'step-05', maxCycles: 3, cycles: [], pending: null, status: 'open' };
  const { ledger } = applyVerdict(base, reject('step-06', 'faltou a preliminar'), {});
  const r = resumeReview(ledger);
  assert.equal(r.action, REVIEW_ACTIONS.REVISE);
  assert.equal(r.target, 'step-05');
  assert.equal(r.resumedFrom, 1);
  assert.deepEqual(r.fixes, ['faltou a preliminar']);
  assert.equal(resumeReview(null).action, 'none');
});

// ---------------------------------------------------------------------------
// Persistência durável via scripts/squad-state.mjs
// ---------------------------------------------------------------------------

function makeSquad() {
  const dir = mkdtempSync(join(tmpdir(), 'ls-review-'));
  writeFileSync(join(dir, 'squad.yaml'), 'name: "Teste"\ncode: "teste-x"\n', 'utf-8');
  writeFileSync(join(dir, 'squad-party.csv'), 'id,name,icon\nrevisor,Vera,✅\n', 'utf-8');
  return dir;
}

// Roda o CLI devolvendo stdout + exit code (escalação sai com código != 0).
function run(dir, ...args) {
  try {
    const stdout = execFileSync('node', [SCRIPT, args[0], dir, ...args.slice(1)], { encoding: 'utf-8' });
    return { code: 0, stdout, json: JSON.parse(stdout) };
  } catch (err) {
    return { code: err.status, stdout: err.stdout, json: JSON.parse(err.stdout || 'null') };
  }
}
const ledgerOf = (dir) => JSON.parse(readFileSync(join(dir, 'review-state.json'), 'utf-8'));

test('review-open cria o ledger e review-verdict persiste a decisão', () => {
  const dir = makeSquad();
  try {
    run(dir, 'review-open', '--loop', 'step-06', '--target', 'step-05', '--max', '3');
    assert.equal(ledgerOf(dir).status, 'open');

    const r = run(dir, 'review-verdict', '--reviewer', 'step-06', '--verdict', 'REJECT', '--fix', 'faltou o pedido');
    assert.equal(r.code, 0);
    assert.equal(r.json.action, 'revise');
    assert.equal(r.json.target, 'step-05');

    const led = ledgerOf(dir);
    assert.equal(led.cycles.length, 1);
    assert.deepEqual(led.cycles[0].decision.fixes, ['faltou o pedido']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('escalação sai com código de erro para não passar despercebida', () => {
  const dir = makeSquad();
  try {
    run(dir, 'review-open', '--loop', 'step-06', '--target', 'step-05', '--max', '1');
    const r = run(dir, 'review-verdict', '--reviewer', 'step-06', '--verdict', 'REJECT', '--fix', 'x');
    assert.equal(r.json.action, 'escalate');
    assert.equal(r.json.reason, 'teto-atingido');
    assert.notEqual(r.code, 0);
    assert.equal(ledgerOf(dir).status, 'escalated');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('retomada: review-status reconstrói o loop a partir do ledger em disco', () => {
  const dir = makeSquad();
  try {
    run(dir, 'review-open', '--loop', 'step-06', '--target', 'step-05', '--max', '3');
    run(dir, 'review-verdict', '--reviewer', 'step-06', '--verdict', 'REJECT', '--fix', 'faltou o pedido');

    // Simula a sessão caindo: nada em memória, só o arquivo.
    const r = run(dir, 'review-status');
    assert.equal(r.code, 0);
    assert.equal(r.json.action, 'revise');
    assert.equal(r.json.target, 'step-05');
    assert.equal(r.json.cycle, 1);
    assert.deepEqual(r.json.fixes, ['faltou o pedido']);

    // E o ciclo seguinte continua de onde parou (ciclo 2, não ciclo 1).
    const next = run(dir, 'review-verdict', '--reviewer', 'step-06', '--verdict', 'REJECT', '--fix', 'outro problema');
    assert.equal(next.json.cycle, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('dois revisores em paralelo: --expect 2 só decide com os dois vereditos', () => {
  const dir = makeSquad();
  try {
    run(dir, 'review-open', '--loop', 'step-08', '--target', 'step-05');
    const a = run(dir, 'review-verdict', '--reviewer', 'step-07', '--verdict', 'APPROVE', '--expect', '2');
    assert.equal(a.json.action, 'await');
    const b = run(dir, 'review-verdict', '--reviewer', 'step-08', '--verdict', 'REJECT', '--fix', 'sem dispositivo', '--expect', '2');
    assert.equal(b.json.action, 'revise');
    assert.deepEqual(b.json.fixes, ['sem dispositivo']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('review-status sem ledger diz "sem loop" em vez de inventar aprovação', () => {
  const dir = makeSquad();
  try {
    const r = run(dir, 'review-status');
    assert.equal(r.json.action, 'none');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('review-verdict sem review-open falha em vez de abrir um loop implícito', () => {
  const dir = makeSquad();
  try {
    let failed = false;
    try {
      execFileSync('node', [SCRIPT, 'review-verdict', dir, '--reviewer', 'r', '--verdict', 'APPROVE'], {
        encoding: 'utf-8',
        stdio: 'pipe',
      });
    } catch {
      failed = true;
    }
    assert.ok(failed, 'review-verdict sem ledger deveria falhar');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Paridade das cópias (o script do usuário é auto-contido: não importa de src/)
// ---------------------------------------------------------------------------

const BEGIN = '// >>> review-loop:begin';
const END = '// <<< review-loop:end';

function block(raw, file) {
  const from = raw.indexOf(BEGIN);
  const to = raw.indexOf(END);
  assert.ok(from >= 0 && to > from, `marcadores review-loop ausentes em ${file}`);
  return raw.slice(from + BEGIN.length, to).trim();
}

test('a contabilidade do loop é a MESMA em src/, scripts/ e templates/scripts/', () => {
  const files = [
    join(ROOT, 'src', 'review-loop.js'),
    join(ROOT, 'scripts', 'squad-state.mjs'),
    join(ROOT, 'templates', 'scripts', 'squad-state.mjs'),
  ];
  const [reference, ...rest] = files.map((f) => block(readFileSync(f, 'utf-8'), f));
  assert.ok(reference.length > 500, 'bloco de referência parece curto demais');
  rest.forEach((b, i) => assert.equal(b, reference, `bloco divergiu em ${files[i + 1]}`));
});

test('o script distribuído ao usuário não importa nada de src/', () => {
  const raw = readFileSync(join(ROOT, 'templates', 'scripts', 'squad-state.mjs'), 'utf-8');
  assert.ok(!/from\s+['"][^'"]*\/src\//.test(raw), 'templates/scripts/squad-state.mjs importa de src/');
});
