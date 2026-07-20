// Validador MECÂNICO de squad — converte em código os gates que o Build hoje
// só descreve em prompt.
//
// A auditoria do Arquiteto apontou que o enforcement era majoritariamente
// textual: os gates verificavam MENÇÃO, não existência, e a "Filesystem
// Validation" do build.prompt.md dependia da obediência do modelo ao markdown.
// Este módulo é a contraparte determinística: mesmo conjunto de invariantes,
// verificado por código, com exit code — utilizável como gate real.
//
// Sem dependência de lib YAML, pelo mesmo motivo do resto do motor
// (src/acervo-search.js, tests/pipeline-runner.test.js): parsing por regex
// sobre um formato que nós mesmos geramos.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function squadsDirPadrao() {
  return join(PACKAGE_ROOT, 'squads');
}

function issue(severity, code, detail) {
  return { severity, code, detail };
}

/** squad-party.csv cita campos com vírgula — split ingênuo desalinha colunas. */
function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else cur += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function parseSteps(pipeline) {
  const ids = [...pipeline.matchAll(/^ {2}- id: (\S+)$/gm)].map((m) => m[1]);

  return ids.map((id) => {
    const start = pipeline.indexOf(`  - id: ${id}\n`);
    const next = pipeline.indexOf('\n  - id:', start + 1);
    const bloco = pipeline.slice(start, next < 0 ? undefined : next);

    return {
      id,
      tipo: bloco.match(/^ {4}type: (\S+)\s*$/m)?.[1] || '',
      file: bloco.match(/^ {4}file: (\S+)\s*$/m)?.[1] || null,
      agent: bloco.match(/^ {4}agent: (\S+)\s*$/m)?.[1] || null,
      onReject: bloco.match(/^ {4}on_reject: (\S+)\s*$/m)?.[1] || null,
    };
  });
}

function parseCheckpoints(pipeline) {
  const bloco = pipeline.match(/^checkpoints:\s*\n((?: {2}- .*\n)*)/m);
  if (!bloco) return [];
  return [...bloco[1].matchAll(/^ {2}- (\S+)\s*$/gm)].map((m) => m[1]);
}

/**
 * Valida um squad. Nunca lança: problemas viram `issues` com severidade.
 * `ok` é falso quando há ao menos um `error` — é o que o CLI usa como exit code.
 */
export function checkSquad(squad, options = {}) {
  const squadsDir = options.squadsDir || squadsDirPadrao();
  const dir = join(squadsDir, squad);
  const issues = [];
  const resultado = () => ({
    squad,
    dir,
    ok: !issues.some((i) => i.severity === 'error'),
    issues,
  });

  if (!existsSync(dir)) {
    issues.push(issue('error', 'squad-nao-encontrado', `${dir} não existe`));
    return resultado();
  }

  // --- squad.yaml: identidade e rubrica ---
  const squadYamlPath = join(dir, 'squad.yaml');
  if (!existsSync(squadYamlPath)) {
    issues.push(issue('error', 'squad-yaml-ausente', 'squad.yaml não existe'));
  } else {
    const y = readFileSync(squadYamlPath, 'utf8');

    const code = y.match(/^code:\s*["']?([^"'\n]+)["']?\s*$/m)?.[1]?.trim();
    if (!code) {
      issues.push(issue('error', 'code-ausente', 'squad.yaml sem campo code'));
    } else if (code !== squad) {
      // O dashboard casa squad por `code`; divergência quebra o handoff.
      issues.push(issue('error', 'code-divergente', `code "${code}" != pasta "${squad}"`));
    }

    const goal = y.match(/^goal:\s*["']?([^"'\n]*)["']?\s*$/m)?.[1]?.trim();
    if (!goal) {
      issues.push(issue('error', 'goal-ausente', 'goal vazio ou ausente — o runner não tem meta a verificar'));
    }

    const bloco = y.match(/^success_criteria:\s*\n((?: {2}- .*\n)*)/m);
    const criterios = bloco ? [...bloco[1].matchAll(/^ {2}- .+$/gm)].length : 0;
    if (criterios < 3 || criterios > 6) {
      issues.push(issue(
        'error',
        'success-criteria-insuficiente',
        `${criterios} critério(s); esperado 3–6 — é a rubrica do eval e da Verificação da Meta`
      ));
    }
  }

  // --- _evals: o harness nasce com o squad ---
  const scores = join(dir, '_evals', 'scores.md');
  if (!existsSync(scores)) {
    issues.push(issue('error', 'evals-scores-ausente', '_evals/scores.md não existe — sem log não há regressão a detectar'));
  } else if (!/\|\s*Data\s*\|/.test(readFileSync(scores, 'utf8'))) {
    issues.push(issue('error', 'evals-scores-sem-cabecalho', '_evals/scores.md sem o cabeçalho que o eval:resumo parseia'));
  }

  const casosDir = join(dir, '_evals', 'casos');
  const casos = existsSync(casosDir) ? readdirSync(casosDir).filter((f) => f.endsWith('.md')) : [];
  if (casos.length === 0) {
    issues.push(issue('error', 'caso-ouro-ausente', '_evals/casos/ sem nenhum caso — a avaliação não é repetível'));
  }

  // --- squad-party.csv: agentes declarados existem em disco ---
  const partyPath = join(dir, 'squad-party.csv');
  const agentesDoParty = new Set();
  if (!existsSync(partyPath)) {
    issues.push(issue('error', 'party-ausente', 'squad-party.csv não existe'));
  } else {
    const linhas = readFileSync(partyPath, 'utf8').split(/\r?\n/).filter((l) => l.trim());
    for (const linha of linhas.slice(1)) {
      const [id, , , , caminho] = parseCsvLine(linha);
      if (!id) continue;
      agentesDoParty.add(id);
      const arquivo = join(dir, (caminho || '').replace(/^\.\//, ''));
      if (caminho && !existsSync(arquivo)) {
        issues.push(issue('error', 'agent-file-ausente', `agente "${id}": ${caminho} não existe`));
      }
    }
  }

  // --- pipeline.yaml: integridade do grafo ---
  const pipelinePath = join(dir, 'pipeline', 'pipeline.yaml');
  if (!existsSync(pipelinePath)) {
    issues.push(issue('error', 'pipeline-ausente', 'pipeline/pipeline.yaml não existe'));
    return resultado();
  }

  const pipeline = readFileSync(pipelinePath, 'utf8');
  const steps = parseSteps(pipeline);

  if (steps.length === 0) {
    issues.push(issue('error', 'pipeline-sem-steps', 'nenhum step declarado'));
    return resultado();
  }

  const idsVistos = new Set();
  for (const step of steps) {
    if (idsVistos.has(step.id)) {
      issues.push(issue('error', 'step-id-duplicado', step.id));
    }
    idsVistos.add(step.id);

    if (!step.file) {
      issues.push(issue('error', 'step-sem-file', `${step.id} não declara file:`));
    } else if (!existsSync(join(dir, 'pipeline', step.file))) {
      issues.push(issue('error', 'step-file-ausente', `${step.id}: ${step.file} não existe em disco`));
    }

    if (step.agent && agentesDoParty.size && !agentesDoParty.has(step.agent)) {
      issues.push(issue('error', 'agent-fora-do-party', `${step.id} usa "${step.agent}", ausente do squad-party.csv`));
    }

    if (step.onReject && !steps.some((s) => s.id === step.onReject)) {
      issues.push(issue('error', 'on-reject-invalido', `${step.id}: on_reject "${step.onReject}" não é um step`));
    }
  }

  const checkpoints = parseCheckpoints(pipeline);
  for (const cp of checkpoints) {
    if (!steps.some((s) => s.id === cp)) {
      issues.push(issue('error', 'checkpoint-invalido', `checkpoint "${cp}" não existe entre os steps`));
    }
  }
  if (checkpoints.length === 0) {
    // Aviso, não erro: um squad puramente analítico pode não ter aprovação
    // humana. Mas um squad que entrega peça sem checkpoint é defeito grave —
    // por isso o alerta existe.
    issues.push(issue('warn', 'sem-checkpoint', 'nenhum checkpoint humano declarado — confirme que é intencional'));
  }

  return resultado();
}
