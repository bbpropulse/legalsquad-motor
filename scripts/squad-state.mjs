#!/usr/bin/env node
// Escritor DETERMINÍSTICO do state.json de um squad — substitui a escrita à mão
// do JSON pelo Pipeline Runner. Garante timestamps reais, transições atômicas
// (write tmp + rename) e saída sempre válida contra o contrato.
// Contrato: _criminalsquad/core/state.schema.json | Tipos: dashboard/src/types/state.ts
//
//   node scripts/squad-state.mjs init       <squad-dir> --total <N>
//   node scripts/squad-state.mjs step       <squad-dir> --current <K> --label "<L>" --working <id> [--working <id> ...] [--from <prevId>] [--message "<m>"] [--activity "<a>"]
//   node scripts/squad-state.mjs checkpoint <squad-dir> --agent <id>
//   node scripts/squad-state.mjs complete   <squad-dir>
//   node scripts/squad-state.mjs fail       <squad-dir>
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

// Rede de segurança: espelha _criminalsquad/core/state.schema.json e o isValidState
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

function writeState(dir, s) {
  validate(s);
  const tmp = join(dir, 'state.json.tmp');
  writeFileSync(tmp, JSON.stringify(s, null, 2) + '\n', 'utf-8');
  renameSync(tmp, join(dir, 'state.json')); // atômico no mesmo filesystem
}

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

const { command, dir, flags } = parseArgs(process.argv.slice(2));
if (!command || !dir) die('uso: squad-state <init|step|checkpoint|complete|fail> <squad-dir> [opções]');
if (!existsSync(dir)) die(`pasta do squad não existe: ${dir}`);

const commands = { init: cmdInit, step: cmdStep, checkpoint: cmdCheckpoint, complete: cmdComplete, fail: cmdFail };
if (!commands[command]) die(`comando desconhecido: ${command}`);
commands[command](dir, flags);
console.log(`state.json atualizado (${command}) em ${dir}`);
