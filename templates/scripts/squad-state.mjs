#!/usr/bin/env node
// Escritor DETERMINÍSTICO do state.json de um squad — substitui a escrita à mão
// do JSON pelo Pipeline Runner. Garante timestamps reais, transições atômicas
// (write tmp + rename) e saída sempre válida contra o contrato.
// Contrato: _legalsquad/core/state.schema.json | Tipos: dashboard/src/types/state.ts
//
//   node scripts/squad-state.mjs init       <squad-dir> --total <N>
//   node scripts/squad-state.mjs step       <squad-dir> --current <K> --label "<L>" --working <id> [--working <id> ...] [--from <prevId>] [--message "<m>"] [--activity "<a>"]
//   node scripts/squad-state.mjs checkpoint <squad-dir> --agent <id>
//   node scripts/squad-state.mjs complete   <squad-dir>
//   node scripts/squad-state.mjs fail       <squad-dir>
//
// Loop de revisão (cartório determinístico — grava review-state.json ao lado):
//   node scripts/squad-state.mjs review-open    <squad-dir> --loop <step-revisor> --target <step-on-reject> [--max <N>]
//   node scripts/squad-state.mjs review-verdict <squad-dir> --reviewer <id> --verdict APPROVE|REJECT [--fix "..."]... [--expect <N>]
//   node scripts/squad-state.mjs review-status  <squad-dir>
// Os três imprimem a DECISÃO em JSON no stdout. `review-verdict`/`review-status`
// saem com código 3 quando a decisão é `escalate` — escalação não pode passar
// despercebida por quem só olha o exit code.
//
// <squad-dir> é a pasta do squad (contém squad.yaml + squad-party.csv); o
// state.json é gravado lá. Rode a partir da raiz do workspace.
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SQUAD_STATUSES = ['idle', 'running', 'completed', 'checkpoint', 'failed'];
const AGENT_STATUSES = ['idle', 'working', 'delivering', 'done', 'checkpoint'];
// Status que indicam que o agente já atuou — ao avançar, viram "done".
const ACTED = ['working', 'delivering', 'checkpoint', 'done'];

function die(msg) {
  console.error(`squad-state: ${msg}`);
  process.exit(1);
}

function now() {
  return new Date().toISOString();
}

// command, dir, depois --flags (algumas repetíveis, ex.: --working).
function parseArgs(argv) {
  const [command, dir, ...rest] = argv;
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    if (!rest[i].startsWith('--')) continue;
    const key = rest[i].slice(2);
    const val = rest[i + 1] !== undefined && !rest[i + 1].startsWith('--') ? rest[++i] : true;
    if (key in flags) flags[key] = [...(Array.isArray(flags[key]) ? flags[key] : [flags[key]]), val];
    else flags[key] = val;
  }
  return { command, dir, flags };
}

const asList = (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const str = (v) => (typeof v === 'string' ? v : '');

// Parser mínimo de linha CSV (lida com "campos, entre aspas").
function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function readAgents(dir) {
  const csvPath = join(dir, 'squad-party.csv');
  if (!existsSync(csvPath)) die(`squad-party.csv não encontrado em ${dir}`);
  const lines = readFileSync(csvPath, 'utf-8').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) die('squad-party.csv vazio');
  const header = parseCsvLine(lines[0]).map((h) => h.trim());
  const iId = header.indexOf('id');
  const iName = header.indexOf('name');
  const iIcon = header.indexOf('icon');
  if (iId < 0 || iName < 0 || iIcon < 0) die('squad-party.csv precisa das colunas id,name,icon');
  return lines.slice(1).map((line, i) => {
    const cells = parseCsvLine(line);
    return {
      id: (cells[iId] || '').trim(),
      name: (cells[iName] || '').trim(),
      icon: (cells[iIcon] || '').trim(),
      status: 'idle',
      desk: { col: (i % 3) + 1, row: Math.floor(i / 3) + 1 },
    };
  });
}

function readSquadCode(dir) {
  const p = join(dir, 'squad.yaml');
  if (!existsSync(p)) die(`squad.yaml não encontrado em ${dir}`);
  const m = readFileSync(p, 'utf-8').match(/^code:\s*["']?([^"'\n]+?)["']?\s*$/m);
  return m ? m[1].trim() : '';
}

function loadState(dir) {
  const p = join(dir, 'state.json');
  if (!existsSync(p)) die('state.json não existe — rode `init` primeiro');
  try {
    return JSON.parse(readFileSync(p, 'utf-8'));
  } catch {
    return die('state.json existente é JSON inválido');
  }
}

// Rede de segurança: espelha _legalsquad/core/state.schema.json e o isValidState
// do dashboard. Por construção a saída já é válida; isto pega regressões cedo.
function validate(s) {
  const errs = [];
  if (typeof s.squad !== 'string') errs.push('squad deve ser string');
  if (!SQUAD_STATUSES.includes(s.status)) errs.push(`status inválido: ${s.status}`);
  if (!s.step || typeof s.step.current !== 'number' || typeof s.step.total !== 'number' || typeof s.step.label !== 'string')
    errs.push('step inválido (current/total/label)');
  if (!Array.isArray(s.agents)) errs.push('agents deve ser array');
  else s.agents.forEach((a, i) => {
    if (typeof a.id !== 'string' || typeof a.name !== 'string' || typeof a.icon !== 'string') errs.push(`agente ${i}: id/name/icon`);
    if (!AGENT_STATUSES.includes(a.status)) errs.push(`agente ${i}: status inválido (${a.status})`);
    if (!a.desk || typeof a.desk.col !== 'number' || typeof a.desk.row !== 'number') errs.push(`agente ${i}: desk inválido`);
  });
  if (s.handoff !== null && (typeof s.handoff !== 'object' || typeof s.handoff.from !== 'string' || typeof s.handoff.to !== 'string'))
    errs.push('handoff inválido');
  if (errs.length) die('estado inválido:\n  - ' + errs.join('\n  - '));
}

// Escrita atômica (tmp + rename): uma sessão que morre no meio nunca deixa um
// JSON truncado para a próxima ler.
function writeJson(dir, file, data) {
  const tmp = join(dir, `${file}.tmp`);
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  renameSync(tmp, join(dir, file)); // atômico no mesmo filesystem
}

function writeState(dir, s) {
  validate(s);
  writeJson(dir, 'state.json', s);
}

// ---------------------------------------------------------------------------
// Loop de revisão — cópia VERBATIM de src/review-loop.js.
// Este script é distribuído ao usuário (templates/scripts/) e roda num projeto
// que NÃO tem src/ — por isso a lógica é embutida em vez de importada. A cópia
// é guardada por tests/review-loop.test.js: se divergir, a suíte quebra.
// ---------------------------------------------------------------------------
// >>> review-loop:begin
/** Ações possíveis de uma decisão do loop de revisão. */
const REVIEW_ACTIONS = Object.freeze({
  ADVANCE: 'advance', // veredito APPROVE → segue para o próximo step
  REVISE: 'revise', // REJECT convergindo → volta ao step do `on_reject`
  ESCALATE: 'escalate', // teto, não-convergência ou veredito ilegível → humano
  AWAIT: 'await', // faltam vereditos deste ciclo (revisores em paralelo)
});

/** Teto default de ciclos, quando o step/pipeline não declara `max_review_cycles`. */
const DEFAULT_MAX_REVIEW_CYCLES = 3;

/**
 * Chave de comparação de um `fix`: o mesmo problema descrito com outra pontuação,
 * caixa ou acento ainda é o MESMO problema. Sem isto, "Falta a citação." e
 * "falta a citacao" pareceriam correções diferentes e a não-convergência passaria
 * batida até o teto.
 */
function normalizeFix(fix) {
  if (typeof fix !== 'string') return '';
  return fix
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Funde os vereditos de UM ciclo (pode haver N revisores em `parallel_group`).
 *
 * Regra conservadora, porque o risco aqui é real (peça vai a protocolo):
 *   - qualquer REJECT derruba os APPROVEs — um revisor que aprova não anula
 *     o problema que o outro achou;
 *   - qualquer veredito ausente/ilegível vira UNREADABLE, mesmo que os demais
 *     aprovem: "não sei ler" não é "aprovado".
 * Os `fixes` dos que rejeitaram são unidos e deduplicados por `normalizeFix`.
 */
function combineVerdicts(verdicts) {
  const list = Array.isArray(verdicts) ? verdicts : [];
  const reviewers = [];
  const unreadable = [];
  const rejecting = [];
  const fixes = [];
  const seen = new Set();

  for (const entry of list) {
    const who =
      entry && typeof entry.reviewer === 'string' && entry.reviewer.trim() ? entry.reviewer.trim() : '(revisor anônimo)';
    reviewers.push(who);
    const verdict = entry && typeof entry.verdict === 'string' ? entry.verdict.trim().toUpperCase() : '';
    if (verdict !== 'APPROVE' && verdict !== 'REJECT') {
      unreadable.push(who);
      continue;
    }
    if (verdict === 'APPROVE') continue;
    rejecting.push(who);
    const raw = entry && Array.isArray(entry.fixes) ? entry.fixes : [];
    for (const fix of raw) {
      if (typeof fix !== 'string') continue;
      const key = normalizeFix(fix);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      fixes.push(fix.trim());
    }
  }

  if (!list.length) {
    return { verdict: 'UNREADABLE', fixes, reviewers, unreadable: ['(nenhum veredito recebido)'], rejecting };
  }
  if (unreadable.length) return { verdict: 'UNREADABLE', fixes, reviewers, unreadable, rejecting };
  return { verdict: rejecting.length ? 'REJECT' : 'APPROVE', fixes, reviewers, unreadable, rejecting };
}

/** Quais dos `fixes` deste ciclo já haviam aparecido em algum ciclo anterior. */
function repeatedFixes(fixes, history) {
  const previous = new Set();
  for (const cycle of Array.isArray(history) ? history : []) {
    for (const fix of cycle && Array.isArray(cycle.fixes) ? cycle.fixes : []) {
      const key = normalizeFix(fix);
      if (key) previous.add(key);
    }
  }
  return (Array.isArray(fixes) ? fixes : []).filter((fix) => previous.has(normalizeFix(fix)));
}

/**
 * A decisão do ciclo. Entrada: os vereditos deste ciclo, o histórico dos ciclos
 * já fechados e o teto. Saída: o que o runner deve fazer — sem margem para
 * interpretação.
 *
 * Ordem das saídas de escalação importa: não-convergência vem ANTES do teto,
 * porque gastar os ciclos restantes repetindo o mesmo problema é desperdício
 * (e o `runner.pipeline.md` sempre mandou escalar "imediatamente").
 */
function decideReview(input) {
  const raw = input && typeof input === 'object' ? input : {};
  const maxCycles =
    Number.isInteger(raw.maxCycles) && raw.maxCycles > 0 ? raw.maxCycles : DEFAULT_MAX_REVIEW_CYCLES;
  const history = Array.isArray(raw.history) ? raw.history : [];
  const cycle = history.length + 1;
  const combined = combineVerdicts(raw.verdicts);
  const base = {
    cycle,
    maxCycles,
    verdict: combined.verdict,
    fixes: combined.fixes,
    reviewers: combined.reviewers,
  };

  if (combined.verdict === 'UNREADABLE') {
    return {
      ...base,
      action: REVIEW_ACTIONS.ESCALATE,
      reason: 'veredito-ilegivel',
      detail: `veredito ausente ou ilegível de: ${combined.unreadable.join(', ')} — "não sei ler" não é "aprovado"`,
    };
  }
  if (combined.verdict === 'APPROVE') {
    return { ...base, action: REVIEW_ACTIONS.ADVANCE, reason: 'aprovado', detail: 'todos os revisores aprovaram' };
  }
  if (!combined.fixes.length) {
    return {
      ...base,
      action: REVIEW_ACTIONS.ESCALATE,
      reason: 'reject-sem-fixes',
      detail: `REJECT de ${combined.rejecting.join(', ')} sem nenhuma correção acionável — sem feedback-delta o writer só reescreveria no escuro`,
    };
  }
  const repeated = repeatedFixes(combined.fixes, history);
  if (repeated.length) {
    return {
      ...base,
      action: REVIEW_ACTIONS.ESCALATE,
      reason: 'nao-convergiu',
      repeated,
      detail: `correção repetida do ciclo anterior (${repeated.length}) — o loop não está convergindo`,
    };
  }
  if (cycle >= maxCycles) {
    return {
      ...base,
      action: REVIEW_ACTIONS.ESCALATE,
      reason: 'teto-atingido',
      detail: `${cycle}/${maxCycles} ciclos sem APPROVE`,
    };
  }
  return {
    ...base,
    action: REVIEW_ACTIONS.REVISE,
    reason: 'rejeitado',
    nextCycle: cycle + 1,
    detail: `devolver ao writer apenas os ${combined.fixes.length} fixes (feedback-delta)`,
  };
}

/** Ledger vazio de um loop — o que `review-open` persiste. */
function openReview(options) {
  const raw = options && typeof options === 'object' ? options : {};
  const maxCycles =
    Number.isInteger(raw.maxCycles) && raw.maxCycles > 0 ? raw.maxCycles : DEFAULT_MAX_REVIEW_CYCLES;
  return {
    loop: typeof raw.loop === 'string' ? raw.loop : '',
    target: typeof raw.target === 'string' ? raw.target : '',
    maxCycles,
    status: 'open',
    cycles: [],
    pending: null,
  };
}

/**
 * Registra o veredito de UM revisor no ledger e devolve `{ ledger, result }`.
 *
 * Com `expect > 1` (dois revisores num `parallel_group`, por exemplo), os
 * vereditos se acumulam em `pending` e a decisão só sai quando todos chegam —
 * é o que impede que o APPROVE do revisor A, chegando primeiro, faça o pipeline
 * andar antes do REJECT do revisor B.
 */
function applyVerdict(ledger, entry, options) {
  const base = ledger && typeof ledger === 'object' ? ledger : openReview({});
  const opts = options && typeof options === 'object' ? options : {};
  const expect = Number.isInteger(opts.expect) && opts.expect > 0 ? opts.expect : 1;
  const cycles = Array.isArray(base.cycles) ? base.cycles : [];
  const cycle = cycles.length + 1;
  const pending =
    base.pending && Array.isArray(base.pending.verdicts) && base.pending.cycle === cycle ? base.pending.verdicts : [];
  const verdicts = [...pending, entry];

  if (verdicts.length < expect) {
    return {
      ledger: { ...base, cycles, status: 'open', pending: { cycle, expect, verdicts } },
      result: {
        action: REVIEW_ACTIONS.AWAIT,
        reason: 'aguardando-revisores',
        cycle,
        expect,
        received: verdicts.length,
        loop: base.loop,
        target: base.target,
        detail: `${verdicts.length}/${expect} vereditos deste ciclo`,
      },
    };
  }

  const history = cycles.map((c) => ({
    cycle: c && c.cycle,
    fixes: c && c.decision && Array.isArray(c.decision.fixes) ? c.decision.fixes : [],
  }));
  const decision = decideReview({ verdicts, history, maxCycles: base.maxCycles });
  const status =
    decision.action === REVIEW_ACTIONS.ADVANCE
      ? 'approved'
      : decision.action === REVIEW_ACTIONS.ESCALATE
        ? 'escalated'
        : 'open';
  return {
    ledger: { ...base, cycles: [...cycles, { cycle, verdicts, decision }], pending: null, status },
    result: { ...decision, loop: base.loop, target: base.target },
  };
}

/**
 * Retomada durável: dado o ledger lido do disco, o que o runner deve fazer agora.
 * É o que permite uma sessão nova continuar o loop no ciclo certo em vez de
 * recomeçar do zero (e estourar o teto sem perceber).
 */
function resumeReview(ledger) {
  if (!ledger || typeof ledger !== 'object') {
    return { action: 'none', reason: 'sem-loop', detail: 'nenhum loop de revisão aberto' };
  }
  const loop = typeof ledger.loop === 'string' ? ledger.loop : '';
  const target = typeof ledger.target === 'string' ? ledger.target : '';
  if (ledger.pending && Array.isArray(ledger.pending.verdicts)) {
    return {
      action: REVIEW_ACTIONS.AWAIT,
      reason: 'aguardando-revisores',
      cycle: ledger.pending.cycle,
      expect: ledger.pending.expect,
      received: ledger.pending.verdicts.length,
      loop,
      target,
      detail: 'ciclo incompleto — refaça os vereditos que faltam',
    };
  }
  const cycles = Array.isArray(ledger.cycles) ? ledger.cycles : [];
  const last = cycles[cycles.length - 1];
  if (!last || !last.decision) {
    return { action: 'none', reason: 'sem-ciclos', loop, target, detail: 'loop aberto, nenhum ciclo fechado ainda' };
  }
  return { ...last.decision, loop, target, resumedFrom: last.cycle };
}
// <<< review-loop:end

function cmdInit(dir, flags) {
  const total = Number(flags.total);
  if (!Number.isInteger(total) || total < 0) die('init requer --total <N> (inteiro >= 0)');
  writeState(dir, {
    squad: readSquadCode(dir),
    status: 'idle',
    step: { current: 0, total, label: '' },
    agents: readAgents(dir),
    handoff: null,
    startedAt: null,
    updatedAt: now(),
  });
}

function cmdStep(dir, flags) {
  const current = Number(flags.current);
  if (!Number.isInteger(current)) die('step requer --current <K> (inteiro)');
  const working = asList(flags.working).filter((v) => typeof v === 'string');
  if (!working.length) die('step requer ao menos um --working <id>');
  const workingSet = new Set(working);
  const activity = str(flags.activity);

  const s = loadState(dir);
  s.status = 'running';
  s.step = { current, total: s.step?.total ?? 0, label: str(flags.label) };
  s.agents = s.agents.map((a) => {
    const c = { ...a };
    delete c.activity;
    if (workingSet.has(a.id)) {
      c.status = 'working';
      if (activity) c.activity = activity;
    } else {
      c.status = ACTED.includes(a.status) ? 'done' : 'idle';
    }
    return c;
  });
  s.handoff = flags.from
    ? { from: String(flags.from), to: working[0], message: str(flags.message), completedAt: now() }
    : null;
  if (!s.startedAt) s.startedAt = now();
  s.updatedAt = now();
  writeState(dir, s);
}

function cmdCheckpoint(dir, flags) {
  if (typeof flags.agent !== 'string') die('checkpoint requer --agent <id>');
  const s = loadState(dir);
  s.status = 'checkpoint';
  s.agents = s.agents.map((a) => (a.id === flags.agent ? { ...a, status: 'checkpoint' } : a));
  s.updatedAt = now();
  writeState(dir, s);
}

function clearActivity(agents, status) {
  return agents.map((a) => {
    const c = { ...a };
    delete c.activity;
    if (status) c.status = status;
    return c;
  });
}

function cmdComplete(dir) {
  const s = loadState(dir);
  s.status = 'completed';
  s.agents = clearActivity(s.agents, 'done');
  s.completedAt = now();
  s.updatedAt = now();
  writeState(dir, s);
}

function cmdFail(dir) {
  const s = loadState(dir);
  s.status = 'failed';
  s.agents = clearActivity(s.agents, null);
  s.failedAt = now();
  s.updatedAt = now();
  writeState(dir, s);
}

// --- Loop de revisão: o ledger durável (review-state.json) --------------------
// Fica FORA do state.json de propósito: o contrato do state.json é fechado
// (`additionalProperties: false` em state.schema.json, lido pelo dashboard) e
// o state.json é APAGADO no cleanup pós-conclusão. O ledger precisa sobreviver
// a uma sessão caída — por isso mora no seu próprio arquivo.
const LEDGER = 'review-state.json';

function loadLedger(dir, { required } = {}) {
  const p = join(dir, LEDGER);
  if (!existsSync(p)) {
    if (required) die(`${LEDGER} não existe — rode \`review-open\` antes de registrar vereditos`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(p, 'utf-8'));
  } catch {
    // Ledger ilegível ≠ ledger ausente: seguir como se não houvesse loop
    // reiniciaria a contagem de ciclos em silêncio. Fail-closed.
    return die(`${LEDGER} existente é JSON inválido — resolva à mão antes de continuar`);
  }
}

// A saída dos comandos de revisão é JSON no stdout (o runner parseia) e o
// exit code 3 marca escalação para quem só olha o código de saída.
function emitDecision(result) {
  console.log(JSON.stringify(result, null, 2));
  if (result && result.action === REVIEW_ACTIONS.ESCALATE) process.exitCode = 3;
  return null;
}

function cmdReviewOpen(dir, flags) {
  if (typeof flags.loop !== 'string') die('review-open requer --loop <step-id do revisor>');
  if (typeof flags.target !== 'string') die('review-open requer --target <step-id do on_reject>');
  const max = flags.max === undefined ? undefined : Number(flags.max);
  if (max !== undefined && (!Number.isInteger(max) || max < 1)) die('--max precisa ser inteiro >= 1');
  const ledger = openReview({ loop: flags.loop, target: flags.target, maxCycles: max });
  writeJson(dir, LEDGER, { ...ledger, updatedAt: now() });
  return emitDecision({ action: 'open', loop: ledger.loop, target: ledger.target, maxCycles: ledger.maxCycles });
}

function cmdReviewVerdict(dir, flags) {
  if (typeof flags.verdict !== 'string') die('review-verdict requer --verdict APPROVE|REJECT');
  const expect = flags.expect === undefined ? 1 : Number(flags.expect);
  if (!Number.isInteger(expect) || expect < 1) die('--expect precisa ser inteiro >= 1');
  const entry = {
    reviewer: str(flags.reviewer),
    verdict: flags.verdict,
    fixes: asList(flags.fix).filter((v) => typeof v === 'string'),
  };
  const { ledger, result } = applyVerdict(loadLedger(dir, { required: true }), entry, { expect });
  writeJson(dir, LEDGER, { ...ledger, updatedAt: now() });
  return emitDecision(result);
}

function cmdReviewStatus(dir) {
  return emitDecision(resumeReview(loadLedger(dir)));
}

const { command, dir, flags } = parseArgs(process.argv.slice(2));
if (!command || !dir)
  die('uso: squad-state <init|step|checkpoint|complete|fail|review-open|review-verdict|review-status> <squad-dir> [opções]');
if (!existsSync(dir)) die(`pasta do squad não existe: ${dir}`);

const commands = {
  init: cmdInit,
  step: cmdStep,
  checkpoint: cmdCheckpoint,
  complete: cmdComplete,
  fail: cmdFail,
  'review-open': cmdReviewOpen,
  'review-verdict': cmdReviewVerdict,
  'review-status': cmdReviewStatus,
};
if (!commands[command]) die(`comando desconhecido: ${command}`);
// Comandos de revisão já imprimiram o JSON da decisão; os de estado confirmam
// a escrita em uma linha (como sempre fizeram).
if (commands[command](dir, flags) !== null) console.log(`state.json atualizado (${command}) em ${dir}`);
