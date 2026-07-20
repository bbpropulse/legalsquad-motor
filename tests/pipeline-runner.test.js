// Cobertura de MECANISMO do Pipeline Runner (_criminalsquad/core/runner.pipeline.md)
// — não de execução penal. Recria, sobre a fixture sintética, a cobertura que
// saiu junto com a matéria na Task 4 (tests/execucao-v4.test.js, removido) e
// não tinha sucessor em nenhuma suíte remanescente (ver task-4-report.md,
// "Regras de Mecanismo a Recuperar na Task 7").
//
// O Pipeline Runner em si é um prompt para o agente (markdown), não um módulo
// JS — por isso estes testes validam a ESTRUTURA que ele consome
// (pipeline.yaml + squad-party.csv + agents/*.custom.md), com o mesmo
// parsing por regex que a suíte removida usava (o motor não depende de lib
// YAML — ver src/acervo-search.js).
//
// Guarda contra falso-verde: todo teste abaixo afirma primeiro que a coleção
// que vai percorrer não está vazia, antes de a percorrer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SQUADS_DEMO } from './fixtures/caminhos.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SQUAD_DIR = join(SQUADS_DEMO, 'demo-squad');
const PIPELINE_DIR = join(SQUAD_DIR, 'pipeline');
const PIPELINE_PATH = join(PIPELINE_DIR, 'pipeline.yaml');

function readPipeline() {
  return readFileSync(PIPELINE_PATH, 'utf8');
}

// Mesmo algoritmo de scripts/squad-state.mjs:parseCsvLine (não exportado de
// lá) — squad-party.csv cita campos com vírgula (ex.: "role" com prosa
// livre), então um split ingênuo por vírgula desalinha as colunas depois
// dele (path, execution, skills).
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

// Recorta o bloco de um step (da linha "  - id: X" até o próximo "  - id:" ou
// o fim do arquivo) — mesma técnica usada pela suíte removida para isolar os
// campos de um step sem precisar de um parser YAML completo.
function stepBlock(pipeline, id) {
  const start = pipeline.indexOf(`  - id: ${id}\n`);
  assert.ok(start >= 0, `step ${id} não encontrado no pipeline.yaml`);
  const next = pipeline.indexOf('\n  - id:', start + 1);
  return pipeline.slice(start, next < 0 ? undefined : next);
}

function parseSteps(pipeline) {
  const ids = [...pipeline.matchAll(/^ {2}- id: (step-[a-z0-9-]+)$/gm)].map((m) => m[1]);
  return ids.map((id) => {
    const block = stepBlock(pipeline, id);
    const parallelGroup = block.match(/^ {4}parallel_group: (\S+)\s*$/m)?.[1] || null;
    const onReject = block.match(/^ {4}on_reject: (\S+)\s*$/m)?.[1] || null;
    const dependsOnList = block.match(/^ {4}depends_on: \[(.+)\]\s*$/m);
    const dependsOnSingle = block.match(/^ {4}depends_on: (\S+)\s*$/m);
    const dependsOn = dependsOnList
      ? dependsOnList[1].split(',').map((item) => item.trim())
      : dependsOnSingle ? [dependsOnSingle[1]] : [];
    return { id, parallelGroup, onReject, dependsOn };
  });
}

// --- 1. Schema do pipeline ---

test('pipeline.yaml: step-ids são sequenciais e únicos', () => {
  const pipeline = readPipeline();
  const ids = [...pipeline.matchAll(/^ {2}- id: (step-[a-z0-9-]+)$/gm)].map((m) => m[1]);
  assert.ok(ids.length > 0, 'o pipeline da fixture precisa ter steps para o teste valer algo');
  assert.deepEqual(
    ids,
    Array.from({ length: ids.length }, (_, index) => `step-${String(index + 1).padStart(2, '0')}`),
    'os step-id devem ser step-01, step-02, ... sem furo nem fora de ordem',
  );
  assert.equal(new Set(ids).size, ids.length, 'há step-id duplicado');
});

test('pipeline.yaml: todo id em checkpoints: existe entre os steps', () => {
  const pipeline = readPipeline();
  const stepIds = new Set([...pipeline.matchAll(/^ {2}- id: (step-[a-z0-9-]+)$/gm)].map((m) => m[1]));
  assert.ok(stepIds.size > 0, 'o pipeline da fixture precisa ter steps para o teste valer algo');
  const checkpointsBlock = pipeline.match(/^checkpoints:\n((?: {2}- .+\n)+)/m);
  assert.ok(checkpointsBlock, 'pipeline.yaml precisa declarar checkpoints:');
  const checkpoints = [...checkpointsBlock[1].matchAll(/^ {2}- (step-[a-z0-9-]+)$/gm)].map((m) => m[1]);
  assert.ok(checkpoints.length > 0, 'a fixture precisa ter ao menos um checkpoint para o teste valer algo');
  for (const id of checkpoints) {
    assert.ok(stepIds.has(id), `checkpoints: referencia ${id}, que não existe entre os steps`);
  }
});

test('pipeline.yaml: todo file: referenciado existe em disco', () => {
  const pipeline = readPipeline();
  const files = [...pipeline.matchAll(/^ {4}file: (.+)$/gm)].map((match) => match[1].trim());
  assert.ok(files.length > 0, 'a fixture precisa referenciar arquivos de step para o teste valer algo');
  for (const file of files) {
    assert.ok(existsSync(join(PIPELINE_DIR, file)), `file: ${file} não existe em disco`);
  }
});

test('pipeline.yaml: todo agent: resolve no squad-party.csv e no disco', () => {
  const pipeline = readPipeline();
  const agentsInPipeline = [...pipeline.matchAll(/^ {4}agent: (.+)$/gm)].map((match) => match[1].trim());
  assert.ok(agentsInPipeline.length > 0, 'a fixture precisa ter steps de agente para o teste valer algo');

  const party = readFileSync(join(SQUAD_DIR, 'squad-party.csv'), 'utf8');
  const rows = party.trim().split('\n').slice(1).filter(Boolean).map(parseCsvLine);
  assert.ok(rows.length > 0, 'squad-party.csv precisa ter agentes para o teste valer algo');
  const rowById = new Map(rows.map((columns) => [columns[0], columns]));

  for (const agentId of agentsInPipeline) {
    assert.ok(rowById.has(agentId), `agent: ${agentId} não está no squad-party.csv`);
    const relPath = rowById.get(agentId)[4]; // header: id,name,icon,role,path,execution,skills
    assert.ok(relPath, `${agentId}: squad-party.csv sem coluna path`);
    assert.ok(existsSync(join(SQUAD_DIR, relPath)), `agent: ${agentId} aponta para path inexistente (${relPath})`);
  }
});

// --- 2. Grafo de execução ---

test('grafo de execução: parallel_group tem membros independentes que convergem num depends_on comum', () => {
  const pipeline = readPipeline();
  const steps = parseSteps(pipeline);
  assert.ok(steps.length > 0, 'o pipeline da fixture precisa ter steps para o teste valer algo');

  const groups = new Map();
  for (const step of steps) {
    if (!step.parallelGroup) continue;
    if (!groups.has(step.parallelGroup)) groups.set(step.parallelGroup, []);
    groups.get(step.parallelGroup).push(step);
  }
  assert.ok(groups.size > 0, 'a fixture precisa ter ao menos um parallel_group para o teste valer algo');

  for (const [group, members] of groups) {
    assert.ok(members.length >= 2, `${group}: parallel_group precisa ter ao menos 2 membros`);

    // Independentes: nenhum membro do grupo depende de outro membro do mesmo grupo.
    const memberIds = new Set(members.map((member) => member.id));
    for (const member of members) {
      assert.ok(
        member.dependsOn.every((dep) => !memberIds.has(dep)),
        `${member.id}: depende de outro membro do próprio parallel_group ${group} (não são independentes)`,
      );
    }

    // Convergem: existe um step fora do grupo cujo depends_on lista TODOS os membros.
    const convergent = steps.find((step) => (
      !memberIds.has(step.id) && members.every((member) => step.dependsOn.includes(member.id))
    ));
    assert.ok(convergent, `${group}: nenhum step converge (depends_on) os membros do grupo`);
  }
});

test('grafo de execução: on_reject aponta para um step existente', () => {
  const pipeline = readPipeline();
  const steps = parseSteps(pipeline);
  const stepIds = new Set(steps.map((step) => step.id));
  const withOnReject = steps.filter((step) => step.onReject);
  assert.ok(withOnReject.length > 0, 'a fixture precisa ter ao menos um on_reject para o teste valer algo');
  for (const step of withOnReject) {
    assert.ok(stepIds.has(step.onReject), `${step.id}: on_reject aponta para ${step.onReject}, que não existe`);
  }
});

// --- 3. Paridade squad ↔ template ---

test('paridade squad ↔ template: demo-squad e o seed distribuído não divergem no que ambos declaram', () => {
  const fixtureYaml = readFileSync(join(SQUAD_DIR, 'squad.yaml'), 'utf8');
  const templatePath = join(ROOT, 'templates', 'squads', 'demo-squad', 'squad.yaml');
  assert.ok(existsSync(templatePath), 'templates/squads/demo-squad/squad.yaml precisa existir (seed de distribuição)');
  const templateYaml = readFileSync(templatePath, 'utf8');

  // O seed de templates/ é deliberadamente incompleto (sem pipeline:/agents:
  // — ver o comentário no próprio arquivo): a paridade vale só para os campos
  // top-level que os DOIS arquivos declaram, não para a árvore inteira.
  const camposComuns = ['name', 'code', 'icon', 'version', 'created'];
  let comparados = 0;
  for (const campo of camposComuns) {
    const regex = new RegExp(`^${campo}:\\s*(.+)$`, 'm');
    const doFixture = fixtureYaml.match(regex)?.[1];
    const doTemplate = templateYaml.match(regex)?.[1];
    if (doFixture === undefined && doTemplate === undefined) continue;
    assert.ok(doFixture !== undefined, `fixture squad.yaml sem campo ${campo}`);
    assert.ok(doTemplate !== undefined, `template squad.yaml sem campo ${campo}`);
    assert.equal(doTemplate, doFixture, `campo ${campo} diverge entre a fixture e o template distribuído`);
    comparados++;
  }
  assert.ok(comparados > 0, 'nenhum campo comum encontrado — os dois squad.yaml precisam compartilhar ao menos um campo para o teste valer algo');
});
