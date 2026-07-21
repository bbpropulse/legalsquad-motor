import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getSkillLifecyclePolicy,
  parseSkillMetadata,
  SKILL_LIFECYCLES,
} from '../src/frontmatter.js';
import {
  parseCanonicalization,
  parseDeterministicEngines,
  validateSkillCatalog,
} from '../src/skill-catalog.js';
import { CORE_DEMO, SKILLS_DEMO } from './fixtures/caminhos.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

test('frontmatter normaliza schema legado/oficial, listas e lifecycle', () => {
  const raw = `---
name: exemplo
description: >-
  Primeira linha.
  Segunda linha.
type: prompt
categories: [law, "execucao-penal"]
metadata:
  lifecycle: pilot
  aliases: [exemplo-legado]
  supersedes:
    - exemplo-antigo
  coexists_with: [exemplo-gate]
  triggers:
    - progressao
    - calculo
  negative_triggers: [direito-civil]
  next_skills_sugeridas: [exemplo-gate]
  risk_level: alto
---
# Exemplo
`;
  const meta = parseSkillMetadata(raw);
  assert.equal(meta.description, 'Primeira linha. Segunda linha.');
  assert.equal(meta.lifecycle, 'pilot');
  assert.deepEqual(meta.categories, ['law', 'execucao-penal']);
  assert.deepEqual(meta.aliases, ['exemplo-legado']);
  assert.deepEqual(meta.supersedes, ['exemplo-antigo']);
  assert.deepEqual(meta.coexists, ['exemplo-gate']);
  assert.deepEqual(meta.positiveTriggers, ['progressao', 'calculo']);
  assert.deepEqual(meta.negativeTriggers, ['direito-civil']);
  assert.deepEqual(meta.nextSkills, ['exemplo-gate']);
  assert.deepEqual(meta.engines, []);
  assert.equal(meta.riskLevel, 'alto');
});

test('política de lifecycle cobre os cinco estados e preserva legado como active', () => {
  assert.deepEqual(SKILL_LIFECYCLES, ['preview', 'pilot', 'active', 'deprecated', 'quarantined']);
  assert.equal(getSkillLifecyclePolicy().lifecycle, 'active');
  assert.equal(getSkillLifecyclePolicy('active').autoInstallable, true);
  assert.equal(getSkillLifecyclePolicy('pilot').autoInstallable, true);
  assert.equal(getSkillLifecyclePolicy('pilot').productionEligible, true);
  assert.equal(getSkillLifecyclePolicy('preview').productionEligible, false);
  assert.equal(getSkillLifecyclePolicy('deprecated').productionEligible, false);
  assert.equal(getSkillLifecyclePolicy('quarantined').selection, 'blocked');
});

test('catálogo da fixture está fresco, íntegro e serializa gatilhos/lifecycle', async () => {
  // requireIntegration:false — a fixture demo não traz um manifesto de
  // canonicalização (esse conceito é por área; ver skill-catalog.js:562 na
  // dívida registrada em F0-SANEAMENTO.md §5-bis). bestPracticesCatalogPath
  // aponta para o catálogo da própria fixture, não para o do motor.
  const result = validateSkillCatalog({
    skillsDir: SKILLS_DEMO,
    requireIntegration: false,
    bestPracticesCatalogPath: join(CORE_DEMO, 'best-practices', '_catalog.yaml'),
  });
  assert.equal(result.ok, true, result.errors.map((error) => `[${error.code}] ${error.message}`).join('\n'));
  assert.ok(result.catalog.entries.length > 0, 'a fixture precisa ter skills para o teste valer algo');
  const index = await readFile(join(SKILLS_DEMO, '_index.yaml'), 'utf8');
  assert.match(index, /schema_version: 3/);
  assert.match(index, /quality_policy:/);
  assert.match(index, /quality_profile: "legal-calculation"/);
  assert.match(index, /quality_status: "contracted"/);
  assert.match(index, /guard_triggers:/);
  assert.match(index, /eval_case_ids:/);
  assert.match(index, /high_performance_eligible: false/);
  assert.match(index, /blocked_in_production: \[preview, deprecated, quarantined\]/);
  assert.match(index, /positive_triggers: \["demo-calculo-beta", "demo beta"\]/);
  assert.match(index, /negative_triggers: \["entrega_producao", "peca_protocolavel", "parecer_final"\]/);
  assert.match(index, /engines: \["demo-engine"\]/);
});

test('checker detecta índice stale, pasta sem SKILL, name divergente, ref quebrada e grafo inválido', async () => {
  const root = await mkdtemp(join(tmpdir(), 'legalsquad-catalog-'));
  const skillsDir = join(root, 'skills');
  try {
    await mkdir(join(skillsDir, 'sem-skill'), { recursive: true });
    await mkdir(join(skillsDir, 'alpha'), { recursive: true });
    await mkdir(join(skillsDir, 'beta'), { recursive: true });
    await mkdir(join(skillsDir, 'nome-errado'), { recursive: true });
    await writeFile(join(skillsDir, 'alpha', 'SKILL.md'), `---
name: alpha
description: Alpha
metadata:
  supersedes: [beta]
---
[arquivo](references/ausente.md)
`);
    await writeFile(join(skillsDir, 'beta', 'SKILL.md'), `---
name: beta
description: Beta
metadata:
  supersedes: [alpha]
---
`);
    await writeFile(join(skillsDir, 'nome-errado', 'SKILL.md'), `---
name: outro-nome
description: Divergente
---
`);
    await writeFile(join(skillsDir, '_index.yaml'), 'stale\n');

    const result = validateSkillCatalog({
      skillsDir,
      requireIntegration: false,
      bestPracticesCatalogPath: null,
    });
    const codes = new Set(result.errors.map((error) => error.code));
    assert.equal(result.ok, false);
    assert.ok(codes.has('missing-skill-file'));
    assert.ok(codes.has('folder-name-mismatch'));
    assert.ok(codes.has('broken-reference'));
    assert.ok(codes.has('invalid-graph'));
    assert.ok(codes.has('stale-index'));
    assert.ok(result.errors.some((error) => error.message.includes('ciclo em supersedes')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// O manifesto de canonicalização (`_execucao-penal-v3-integration.yaml`) é, ele
// próprio, conteúdo por área — a fixture demo não traz um equivalente (ver
// F0-SANEAMENTO.md §5-bis: o nome do arquivo está hardcoded em três lugares do
// motor como dívida registrada para o F1). Em vez de ler um manifesto real —
// criminal ou sintético — este teste vira um teste de unidade puro do parser:
// o manifesto é escrito aqui mesmo, pequeno e demo-*, e as contagens são
// derivadas do próprio texto (via regex), nunca hardcodadas — assim o teste
// continua válido se alguém adicionar uma linha à string amanhã.
test('parseCanonicalization cobre as fontes do manifesto, respeita as contagens e lê a entrada expandida', () => {
  const raw = `deterministic_engines:
  demo-engine:
    file: scripts/legal-calculators/demo-engine-engine.mjs
    canonical_skills: [demo-calculo-beta]

canonicalization:
    ADD: 1
    MERGE: 1
    SPLIT: 1
    ABSORB: 1
    - {source: demo-fonte-add, action: ADD, targets: [demo-peca-alpha]}
    - {source: demo-fonte-merge, action: MERGE, targets: [demo-peca-alpha, demo-publicacao]}
    - {source: demo-fonte-split, action: SPLIT, targets: [demo-peca-alpha, demo-publicacao]}
    - source: demo-fonte-absorb
      action: ABSORB
      targets: [demo-calculo-beta]
`;
  const canonicalization = parseCanonicalization(raw);
  assert.ok(canonicalization);

  const expectedEntryCount = [...raw.matchAll(/^ {4}(?:- \{source:|- source:)/gm)].length;
  assert.ok(expectedEntryCount > 0, 'a string sintética precisa declarar ao menos uma fonte');
  assert.equal(canonicalization.entries.length, expectedEntryCount);

  const expectedCounts = { ADD: 0, MERGE: 0, SPLIT: 0, ABSORB: 0 };
  for (const entry of canonicalization.entries) expectedCounts[entry.action]++;
  assert.deepEqual(canonicalization.counts, expectedCounts);

  assert.deepEqual(
    canonicalization.entries.find((entry) => entry.source === 'demo-fonte-merge'),
    { source: 'demo-fonte-merge', action: 'MERGE', targets: ['demo-peca-alpha', 'demo-publicacao'] },
  );
  // A entrada expandida (source/action/targets em linhas separadas) — a forma
  // que a MS ocupava no manifesto real.
  assert.deepEqual(
    canonicalization.entries.find((entry) => entry.source === 'demo-fonte-absorb'),
    { source: 'demo-fonte-absorb', action: 'ABSORB', targets: ['demo-calculo-beta'] },
  );

  assert.deepEqual(parseDeterministicEngines(raw), [
    {
      id: 'demo-engine',
      file: 'scripts/legal-calculators/demo-engine-engine.mjs',
      canonicalSkills: ['demo-calculo-beta'],
    },
  ]);
});

test('Arquitetura, Discovery, Design e Sherlock usam shortlist local e manifesto direcionado', async () => {
  const files = [
    '_legalsquad/core/architect.agent.yaml',
    '_legalsquad/core/prompts/discovery.prompt.md',
    '_legalsquad/core/prompts/design.prompt.md',
    '_legalsquad/core/prompts/sherlock-shared.md',
    '_legalsquad/core/prompts/sherlock-instagram.md',
    '_legalsquad/core/prompts/sherlock-linkedin.md',
    '_legalsquad/core/prompts/sherlock-twitter.md',
    '_legalsquad/core/prompts/sherlock-youtube.md',
  ];
  for (const file of files.slice(0, 4)) {
    const content = await readFile(join(ROOT, file), 'utf8');
    assert.match(content, /skills\/_index\.yaml/, `${file} não lê o índice`);
    // O manifesto de canonicalização é POR ÁREA: o motor referencia o padrão
    // (`skills/_*-integration.yaml`), não o nome de uma área específica —
    // fixar `_execucao-penal-v3-integration.yaml` aqui era matéria criminal
    // dentro do teste, e travava o motor numa única área.
    assert.match(
      content,
      /skills\/_\*-integration\.yaml|manifesto de canonicaliza/i,
      `${file} não referencia o manifesto de canonicalização da área`
    );
  }

  for (const file of files.slice(0, 4)) {
    const content = await readFile(join(ROOT, file), 'utf8');
    assert.match(content, /search-skills/, `${file} não usa a busca compacta`);
    // O protocolo obrigatório é declarado PELA ÁREA no `_catalog.yaml`, não
    // fixado no motor: exigir `execucao-penal-alta-performance.md` aqui
    // amarrava o núcleo a uma área. O que o motor deve garantir é que
    // consulta o catálogo de best-practices da área instalada.
    assert.match(
      content,
      /_catalog\.yaml/,
      `${file} não descobre as best-practices obrigatórias pelo catálogo da área`
    );
  }

  for (const file of files.slice(4)) {
    const content = await readFile(join(ROOT, file), 'utf8');
    assert.match(content, /sherlock-shared\.md/);
    assert.match(content, /search-skills/);
  }
});
