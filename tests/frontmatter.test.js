import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSkillMetadata, parseList } from '../src/frontmatter.js';

// Achado ao importar um lote de terceiro (1000 skills de Direito Eleitoral):
// listas em bloco YAML com os itens `-` no MESMO nível de indentação da
// chave (`categories:\n  - law\n  - electoral`) — sintaxe válida e comum,
// gerada por outras ferramentas — vinham vazias. `categories`,
// `positive_triggers`, `negative_triggers`, `guard_triggers` e
// `eval_case_ids` saíam `[]` mesmo com o YAML declarando valores reais, o
// que apaga silenciosamente os gatilhos de busca da skill: uma skill sem
// `positiveTriggers` nunca é encontrada por `search-skills`.

test('parseList lê lista de bloco com itens no MESMO nível de indentação da chave (YAML válido)', () => {
  const fm = [
    'metadata:',
    '  categories:',
    '  - law',
    '  - electoral',
    '  lifecycle: active',
  ].join('\n');

  assert.deepEqual(parseList(fm, 'categories'), ['law', 'electoral']);
});

test('parseList continua lendo a lista de bloco recuada (comportamento já existente, não pode regredir)', () => {
  const fm = [
    'metadata:',
    '  categories:',
    '    - law',
    '    - electoral',
    '  lifecycle: active',
  ].join('\n');

  assert.deepEqual(parseList(fm, 'categories'), ['law', 'electoral']);
});

test('parseList para no fim da lista de bloco no mesmo nível — não engole a próxima chave', () => {
  const fm = [
    'metadata:',
    '  categories:',
    '  - law',
    '  - electoral',
    '  lifecycle: active',
    '  quality_status: contracted',
  ].join('\n');

  assert.deepEqual(parseList(fm, 'categories'), ['law', 'electoral']);
});

test('parseSkillMetadata recupera categories/triggers/eval_case_ids de um SKILL.md real com listas no mesmo nível', () => {
  // Frontmatter reduzido, mas fiel ao formato do lote eleitoral (3o produto).
  const raw = `---
name: abuso-de-poder-economico
description: Use para analisar Abuso de poder econômico.
metadata:
  type: prompt
  categories:
  - law
  - electoral
  - condutas-vedadas-abuso-ilicitos
  lifecycle: active
  schema_version: '5'
  quality_profile: legal-analysis
  quality_status: contracted-reviewed
  eval_case_ids:
  - eleit-0479-ready
  - eleit-0479-blocked
  risk_level: r5
  delivery_type: analise-estrategia
  positive_triggers:
  - abuso-de-poder-economico
  - abuso de poder econômico
  negative_triggers:
  - consulta puramente acadêmica
  guard_triggers:
  - objeto indefinido
---

corpo
`;

  const meta = parseSkillMetadata(raw, { fallbackName: 'abuso-de-poder-economico' });

  assert.deepEqual(meta.categories, ['law', 'electoral', 'condutas-vedadas-abuso-ilicitos']);
  assert.deepEqual(meta.evalCaseIds, ['eleit-0479-ready', 'eleit-0479-blocked']);
  assert.deepEqual(meta.positiveTriggers, ['abuso-de-poder-economico', 'abuso de poder econômico']);
  assert.deepEqual(meta.negativeTriggers, ['consulta puramente acadêmica']);
  assert.deepEqual(meta.guardTriggers, ['objeto indefinido']);
});
