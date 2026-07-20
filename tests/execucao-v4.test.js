import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

test('pipeline v4 tem 15 etapas, cinco checkpoints e todos os arquivos/agentes resolvem', () => {
  const pipeline = read('squads/execucao-penal/pipeline/pipeline.yaml');
  const steps = [...pipeline.matchAll(/^ {2}- id: (step-\d+)$/gm)].map((match) => match[1]);
  assert.deepEqual(steps, Array.from({ length: 15 }, (_, index) => `step-${String(index + 1).padStart(2, '0')}`));
  assert.match(pipeline, /checkpoints:\n {2}- step-01\n {2}- step-04\n {2}- step-07\n {2}- step-09\n {2}- step-14/);

  const files = [...pipeline.matchAll(/^ {4}file: (.+)$/gm)].map((match) => match[1]);
  for (const file of files) assert.ok(existsSync(join(ROOT, 'squads/execucao-penal/pipeline', file)), file);

  const party = read('squads/execucao-penal/squad-party.csv');
  const agentIds = new Set(party.trim().split('\n').slice(1).map((line) => line.split(',')[0]));
  for (const agent of [...pipeline.matchAll(/^ {4}agent: (.+)$/gm)].map((match) => match[1])) {
    assert.ok(agentIds.has(agent), `agent ausente no squad-party: ${agent}`);
  }
});

test('redação seleciona uma skill canônica e não preinjeta todos os institutos', () => {
  const squad = read('squads/execucao-penal/squad.yaml');
  const redator = read('squads/execucao-penal/agents/redator.custom.md');
  const step = read('squads/execucao-penal/pipeline/steps/step-08-redacao-condicional.md');
  assert.match(squad, /exactly_one_canonical_skill_per_institute/);
  assert.match(squad, /forbidden: \[preview, deprecated, quarantined\]/);
  assert.match(redator, /^skills: \[\]$/m);
  assert.match(step, /exatamente uma.*skill ativa/i);
  assert.doesNotMatch(redator.match(/^skills:[\s\S]*?^---$/m)?.[0] || '', /execucao-progressao-regime/);
});

test('quarteto de revisão é paralelo, independente e converge no checkpoint final', () => {
  const pipeline = read('squads/execucao-penal/pipeline/pipeline.yaml');
  for (const id of ['step-10', 'step-11', 'step-12', 'step-13']) {
    const start = pipeline.indexOf(`  - id: ${id}\n`);
    const next = pipeline.indexOf('\n  - id:', start + 1);
    const block = pipeline.slice(start, next < 0 ? undefined : next);
    assert.match(block, /execution: subagent/);
    assert.match(block, /parallel_group: revisao-quarteto/);
    assert.match(block, /depends_on: step-09/);
    assert.match(block, /on_reject: step-08/);
  }
  assert.match(pipeline, /depends_on: \[step-10, step-11, step-12, step-13\]/);
  for (const dir of ['revisao-juridica', 'revisao-probatoria', 'revisao-calculo', 'revisao-citacoes']) {
    assert.match(pipeline, new RegExp(`output/${dir}/relatorio[.]md`));
  }
});

test('cálculo exige regra humana e usa motores sem regra universal', () => {
  const step = read('squads/execucao-penal/pipeline/steps/step-05-calculo-deterministico.md');
  assert.match(step, /fraction-date-engine[.]mjs/);
  assert.match(step, /remission-engine[.]mjs/);
  assert.match(step, /executory-limitation-engine[.]mjs/);
  assert.match(step, /REGRA_APROVADA_POR_HUMANO/);
  assert.match(step, /regra ou aplicabilidade não confirmada por humano/);
});

test('release exige sidecar, quatro APPROVE e checkpoint humano', () => {
  const final = read('squads/execucao-penal/pipeline/steps/step-14-aprovar-final-v4.md');
  const protocol = read('squads/execucao-penal/pipeline/steps/step-15-protocolo-v4.md');
  assert.match(final, /validate-legal-output[.]mjs --release/);
  assert.match(final, /quatro relatórios/);
  assert.match(protocol, /não protocola|Não envie, assine nem protocole/i);
  assert.match(protocol, /bloqueio-protocolo[.]md/);
});

test('caso real bloqueia perfil institucional incompleto e piloto sem opt-in', () => {
  const entry = read('squads/execucao-penal/pipeline/steps/step-01-foco-do-caso.md');
  assert.match(entry, /company[.]md/);
  assert.match(entry, /placeholders/);
  assert.match(entry, /pilot_opt_in: false/);
});
