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

test('catálogo do repositório está fresco, íntegro e serializa gatilhos/lifecycle', async () => {
  const result = validateSkillCatalog({ skillsDir: join(ROOT, 'skills') });
  assert.equal(result.ok, true, result.errors.map((error) => `[${error.code}] ${error.message}`).join('\n'));
  const index = await readFile(join(ROOT, 'skills', '_index.yaml'), 'utf8');
  assert.match(index, /schema_version: 3/);
  assert.match(index, /quality_policy:/);
  assert.match(index, /quality_profile: "legal-calculation"/);
  assert.match(index, /quality_status: "contracted"/);
  assert.match(index, /guard_triggers:/);
  assert.match(index, /eval_case_ids:/);
  assert.match(index, /high_performance_eligible: false/);
  assert.match(index, /blocked_in_production: \[preview, deprecated, quarantined\]/);
  assert.match(index, /positive_triggers: \["beneficio", "progressao"/);
  assert.match(index, /negative_triggers: \["entrega_producao", "peca_protocolavel", "parecer_final"\]/);
  assert.match(index, /engines: \["fraction-date"\]/);
});

test('checker detecta índice stale, pasta sem SKILL, name divergente, ref quebrada e grafo inválido', async () => {
  const root = await mkdtemp(join(tmpdir(), 'criminalsquad-catalog-'));
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

test('canonicalization cobre 73 fontes, respeita contagens e lê a entrada MS expandida', async () => {
  const raw = await readFile(join(ROOT, 'skills', '_execucao-penal-v3-integration.yaml'), 'utf8');
  const canonicalization = parseCanonicalization(raw);
  assert.ok(canonicalization);
  assert.equal(canonicalization.entries.length, 73);
  assert.deepEqual(canonicalization.counts, { ADD: 15, MERGE: 37, SPLIT: 7, ABSORB: 14 });
  assert.deepEqual(
    canonicalization.entries.find((entry) => entry.source === 'ep-peca-mandado-seguranca-correcao'),
    {
      source: 'ep-peca-mandado-seguranca-correcao',
      action: 'MERGE',
      targets: ['agravo-em-execucao', 'habeas-corpus'],
    },
  );
  assert.deepEqual(parseDeterministicEngines(raw), [
    {
      id: 'fraction-date',
      file: 'scripts/legal-calculators/fraction-date-engine.mjs',
      canonicalSkills: ['execucao-data-base-beneficios', 'execucao-progressao-regime'],
    },
    {
      id: 'remission',
      file: 'scripts/legal-calculators/remission-engine.mjs',
      canonicalSkills: ['execucao-remicao'],
    },
    {
      id: 'executory-limitation',
      file: 'scripts/legal-calculators/executory-limitation-engine.mjs',
      canonicalSkills: ['calculadora-prescricao'],
    },
  ]);
});

test('Arquitetura, Discovery, Design e Sherlock usam shortlist local e manifesto direcionado', async () => {
  const files = [
    '_criminalsquad/core/architect.agent.yaml',
    '_criminalsquad/core/prompts/discovery.prompt.md',
    '_criminalsquad/core/prompts/design.prompt.md',
    '_criminalsquad/core/prompts/sherlock-shared.md',
    '_criminalsquad/core/prompts/sherlock-instagram.md',
    '_criminalsquad/core/prompts/sherlock-linkedin.md',
    '_criminalsquad/core/prompts/sherlock-twitter.md',
    '_criminalsquad/core/prompts/sherlock-youtube.md',
  ];
  for (const file of files.slice(0, 4)) {
    const content = await readFile(join(ROOT, file), 'utf8');
    assert.match(content, /skills\/_index\.yaml/, `${file} não lê o índice`);
    assert.match(content, /skills\/_execucao-penal-v3-integration\.yaml/, `${file} não lê o manifesto`);
  }

  for (const file of files.slice(0, 4)) {
    const content = await readFile(join(ROOT, file), 'utf8');
    assert.match(content, /search-skills/, `${file} não usa a busca compacta`);
    assert.match(content, /execucao-penal-alta-performance\.md/, `${file} não descobre o protocolo de execução penal`);
  }

  for (const file of files.slice(4)) {
    const content = await readFile(join(ROOT, file), 'utf8');
    assert.match(content, /sherlock-shared\.md/);
    assert.match(content, /search-skills/);
  }
});
