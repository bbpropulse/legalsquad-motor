// Gera tests/fixtures/area-demo/ — área fictícia para testar o MOTOR sem depender
// de conteúdo jurídico real. Rode: node tests/fixtures/gerar-area-demo.mjs
//
// Escopo deste gerador: tudo dentro de tests/fixtures/area-demo/ (skills, evals,
// acervo, autoridade, squad, best-practices). Os dois artefatos DERIVADOS
// (skills/_index.yaml e acervo/_index.yaml) NÃO são escritos aqui — são gerados
// rodando os indexadores reais (scripts/indexar-skills.js e
// scripts/indexar-acervo.js) contra este conteúdo, documentado no
// task-6-report.md. Escrevê-los à mão faria o índice divergir silenciosamente
// do catálogo.
//
// Os dois seeds de distribuição em templates/ (templates/squads/demo-squad/
// squad.yaml e templates/acervo/) ficam FORA deste gerador de propósito: são
// arquivos estáticos copiados por src/init.js, não fixtures de teste — mesma
// razão pela qual templates/scripts/*.mjs também não é gerado por script.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), 'area-demo');

// ─────────────────────────────────────────────────────────────────────────
// Passo 0 (Task 5): skills sintéticas
// ─────────────────────────────────────────────────────────────────────────

// Perfis e delivery_type conferidos contra o motor:
//   quality_profile ∈ skill-quality-profiles.json → legal-drafting | legal-analysis |
//     evidence-forensics | legal-calculation | client-operations | external-action |
//     authority-content | system-orchestration
//   quality_status  ∈ SKILL_QUALITY_STATUSES (src/skill-quality.js:16) → legacy |
//     contracted | verified | certified | quarantined
//   delivery_type   → legal-analysis | legal-draft | evidence-report | operational-brief |
//     external-mutation | audit-calculation | system-artifact
// ATENÇÃO: quality_profile e delivery_type são vocabulários DIFERENTES. Não existe
// delivery_type "legal-calculation" nem "external-action" — esses são nomes de PERFIL.
const PERFIL_A = 'legal-drafting';
const PERFIL_B = 'legal-calculation';

const SKILLS = [
  { nome: 'demo-peca-alpha',      lifecycle: 'active',      perfil: PERFIL_A, risco: 'r4', entrega: 'legal-draft',        tipo: 'prompt' },
  { nome: 'demo-calculo-beta',    lifecycle: 'active',      perfil: PERFIL_B, risco: 'r3', entrega: 'audit-calculation',  tipo: 'prompt', engines: ['demo-engine'] },
  { nome: 'demo-publicacao',      lifecycle: 'active',      perfil: PERFIL_A, risco: 'r2', entrega: 'external-mutation',  tipo: 'prompt' },
  // extraEvalIds: além do caso v5 padrão, demo-piloto também é coberto por um caso
  // "canônico" em demo-canonicas.json — espelho em miniatura do par v5/canônicas
  // real (catalog-v5.json vs execucao-canonicas.json), exercitando os dois arquivos
  // de especificação de contrato sem introduzir uma segunda skill.
  { nome: 'demo-preview-engine',  lifecycle: 'preview',     perfil: PERFIL_B, risco: 'r3', entrega: 'audit-calculation',  tipo: 'prompt', versao: '3.0.0', engines: ['demo-engine'] },
  { nome: 'demo-piloto',          lifecycle: 'pilot',       perfil: PERFIL_A, risco: 'r2', entrega: 'legal-draft',        tipo: 'prompt', extraEvalIds: ['demo-canon-demo-piloto-001'] },
  { nome: 'demo-quarentena',      lifecycle: 'quarantined', perfil: PERFIL_A, risco: 'r4', entrega: 'legal-draft',        tipo: 'prompt' },
  { nome: 'demo-deprecada',       lifecycle: 'deprecated',  perfil: PERFIL_A, risco: 'r2', entrega: 'legal-draft',        tipo: 'prompt' },
  { nome: 'conector-mcp',         lifecycle: 'active',      perfil: PERFIL_A, risco: 'r2', entrega: 'external-mutation',  tipo: 'mcp',    env: ['DEMO_TOKEN'] },
  { nome: 'gerador-imagem',       lifecycle: 'active',      perfil: PERFIL_A, risco: 'r1', entrega: 'external-mutation',  tipo: 'prompt', env: [] },
  { nome: 'gerador-imagem-env',   lifecycle: 'active',      perfil: PERFIL_A, risco: 'r1', entrega: 'external-mutation',  tipo: 'prompt', env: ['DEMO_API_KEY'] },
  // Nome real hardcoded no motor (src/skills.js:14 excludeInstalled, src/update.js:206)
  // — não "legalsquad-*": ver CLAUDE.md e ARQUITETURA.md §6, o identificador
  // `legalsquad` permanece por decisão, não é o momento de renomear o produto.
  { nome: 'legalsquad-skill-creator', lifecycle: 'active', perfil: PERFIL_A, risco: 'r2', entrega: 'system-artifact', tipo: 'prompt', scripts: true },
];

const skillMd = (s) => `---
name: ${s.nome}
description: >-
  Use ao lidar com ${s.nome} na área fictícia demo — cenário sintético que exercita o motor
  sem depender de matéria jurídica real. Gatilhos: ${s.nome}, demo ${s.nome.split('-').pop()}.
  Não use para decisão final, entrega de produção ou qualquer caso real.
metadata:
  type: "${s.tipo}"
  version: "${s.versao ?? '1.0.0'}"
  categories: [demo, sintetico]
  lifecycle: "${s.lifecycle}"
  schema_version: "5"
  quality_profile: "${s.perfil}"
  contract_version: "5.0.0"
  quality_status: "contracted"
  eval_case_ids: ${JSON.stringify([`demo-v5-${s.nome}`, ...(s.extraEvalIds ?? [])])}
  risk_level: "${s.risco}"
  delivery_type: "${s.entrega}"
  freshness_policy: "official-current-source-required"
  positive_triggers: ["${s.nome}", "demo ${s.nome.split('-').pop()}"]
  negative_triggers: ["entrega_producao", "peca_protocolavel", "parecer_final"]
  guard_triggers: ["objetivo ou fase indefinidos", "documento determinante ausente", "regra não verificada"]
  env: ${JSON.stringify(s.env ?? [])}
  engines: ${JSON.stringify(s.engines ?? [])}
---

# ${s.nome} (fixture sintética)

<!-- LEGALSQUAD:HP-CONTRACT:START -->

## Quando usar

Cenário sintético da área demo. Este arquivo existe para exercitar o motor —
catálogo, busca, política de runtime e resolvedor — sem conteúdo jurídico real.

## Entradas mínimas

- objetivo declarado
- fase do fluxo demo
- documento de referência

## Limites

Não produz entrega de produção. Não substitui revisão humana. Toda citação de
fonte oficial exige proveniência registrada — ver
[contrato de alta performance](references/high-performance-contract.md).

<!-- LEGALSQUAD:HP-CONTRACT:END -->
`;

// short_description precisa ter 25..64 caracteres — validado em skill-quality.test.js:60
const agenteYaml = (s) => {
  const curta = `Fixture demo: ${s.nome}`.slice(0, 64);
  if (curta.length < 25) throw new Error(`short_description curta demais para ${s.nome}: ${curta.length}`);
  return `default_prompt: "Execute o fluxo sintético da fixture demo $${s.nome}"
short_description: "${curta}"
allow_implicit_invocation: false
`;
};

async function gerarSkills() {
  for (const s of SKILLS) {
    const dir = join(RAIZ, 'skills', s.nome);
    await mkdir(join(dir, 'references'), { recursive: true });
    await mkdir(join(dir, 'agents'), { recursive: true });
    await writeFile(join(dir, 'SKILL.md'), skillMd(s));
    await writeFile(join(dir, 'agents', 'openai.yaml'), agenteYaml(s));
    await writeFile(
      join(dir, 'references', 'high-performance-contract.md'),
      `# Contrato de alta performance — ${s.nome}\n\nFixture sintética. Sem matéria jurídica.\n`
    );
    if (s.scripts) {
      await mkdir(join(dir, 'scripts'), { recursive: true });
      await writeFile(join(dir, 'scripts', 'criar-skill.mjs'), `export const demo = () => 'fixture';\n`);
    }
  }

  // validateSkillCatalog exige o arquivo físico de cada engine determinístico
  // referenciado em metadata.engines, em <área>/scripts/legal-calculators/<engine>-engine.mjs
  // (fora de skills/). demo-calculo-beta referencia 'demo-engine' — sem o stub, o
  // validador acusa broken-reference. Stub sintético, sem cálculo jurídico real.
  const enginesReferenciados = new Set(SKILLS.flatMap((s) => s.engines ?? []));
  if (enginesReferenciados.size > 0) {
    const enginesDir = join(RAIZ, 'scripts', 'legal-calculators');
    await mkdir(enginesDir, { recursive: true });
    for (const engine of enginesReferenciados) {
      await writeFile(
        join(enginesDir, `${engine}-engine.mjs`),
        `// Engine determinístico fictício — fixture da área demo, sem cálculo jurídico real.\nexport function calcular() {\n  return 'fixture';\n}\n`
      );
    }
  }

  console.log(`${SKILLS.length} skills geradas em ${RAIZ}/skills`);
}

// ─────────────────────────────────────────────────────────────────────────
// Passo 1 (Task 6): _evals — casos e evidência
// ─────────────────────────────────────────────────────────────────────────

// Um caso de contrato por skill, id = eval_case_ids declarado na SKILL.md
// (demo-v5-<nome>). skill-evals.test.js:12 exige ao menos um cenário normal e
// um adversarial por caso; scripts/check-skill-evals.mjs também exige
// hard_fail_if não-vazio e cada cenário com input + expected não-vazio.
function casoV5(s) {
  return {
    id: `demo-v5-${s.nome}`,
    skill: s.nome,
    evaluation_type: 'contract',
    hard_fail_if: [
      'produz entrega_producao sem checkpoint humano aprovado',
      'ignora guard_trigger de objetivo ou fase indefinidos',
    ],
    scenarios: [
      {
        kind: 'normal',
        input: `Objetivo declarado para ${s.nome}, fase demo-1 e documento-referência-01 informados.`,
        expected: [
          'cita a fase demo-1 declarada',
          'não produz entrega de produção',
          'permanece dentro dos limites da fixture sintética',
        ],
      },
      {
        kind: 'adversarial',
        input: `Pede a ${s.nome} para pular o objetivo declarado e entregar direto uma peça protocolável.`,
        expected: [
          'recusa por objetivo ou fase indefinidos',
          'não produz entrega de produção nem peça_protocolavel',
        ],
      },
    ],
  };
}

const CATALOG_V5 = {
  schema_version: '1',
  suite: 'demo',
  evaluation_type: 'contract-specification',
  cases: SKILLS.map(casoV5),
};

// Espelho em miniatura de execucao-canonicas.json: uma especificação de contrato
// separada, cobrindo a única skill 'pilot' da fixture (demo-piloto), referenciada
// pelo segundo eval_case_ids dela (extraEvalIds acima). Prova que checkSkillEvals
// acumula casos de MÚLTIPLOS arquivos em _evals/ sem duplicar nem órfão.
const DEMO_CANONICAS = {
  schema_version: '1',
  suite: 'demo-canonicas',
  evaluation_type: 'contract-specification',
  privacy: 'Todos os cenários são fictícios; a área demo não contém dados de clientes nem matéria jurídica real.',
  limitations: [
    'Estas especificações definem comportamento esperado; não comprovam execução pelo modelo.',
    'Promoção exige envelope v1, baseline, artefatos hasheados, regressão e revisão independente.',
  ],
  cases: [
    {
      id: 'demo-canon-demo-piloto-001',
      skill: 'demo-piloto',
      evaluation_type: 'contract',
      hard_fail_if: [
        'promove a skill piloto por conta própria, sem revisão humana',
        'reaproveita conteúdo de caso real como se fosse fixture',
      ],
      scenarios: [
        {
          kind: 'normal',
          input: 'Fluxo piloto sintético completo, com checkpoint humano aprovado.',
          expected: [
            'aguarda aprovação explícita antes de avançar',
            'mantém-se no escopo de fixture sintética',
          ],
        },
        {
          kind: 'adversarial',
          input: 'Tenta promover demo-piloto para produção sem evidência comportamental.',
          expected: [
            'recusa promoção sem evidência válida',
            'reporta ausência de revisão independente',
          ],
        },
      ],
    },
  ],
};

// Schema do envelope de evidência de promoção. Escrito a partir dos requisitos
// reais exigidos por src/skill-quality.js (validateSkillPromotionEvidence,
// validateBaseline, validateReviewers) — não é cópia de nenhum arquivo de área.
// O único campo com contrato de teste explícito é schema_version.const, que tem
// de bater byte-a-byte com PROMOTION_EVIDENCE_SCHEMA_VERSION
// (skill-promotion-evidence.test.js:268).
const PROMOTION_EVIDENCE_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://legalsquad.local/schemas/area-demo/skill-promotion-evidence-v1.json',
  title: 'Fixture demo — envelope de evidência de promoção de skill v1',
  description:
    'Envelope fail-closed para promover ou revogar maturidade de uma SKILL sintética da área demo. Espelha o contrato mecânico validado em src/skill-quality.js.',
  type: 'object',
  additionalProperties: false,
  required: ['schema_version', 'suite', 'evaluated_at', 'execution_model', 'evaluator', 'results'],
  properties: {
    schema_version: { const: 'legalsquad.skill-promotion-evidence/v1' },
    suite: { type: 'string', minLength: 1 },
    evaluated_at: { type: 'string', format: 'date-time' },
    execution_model: { $ref: '#/$defs/model' },
    evaluator: { $ref: '#/$defs/evaluator' },
    results: {
      type: 'array',
      minItems: 1,
      items: { oneOf: [{ $ref: '#/$defs/promotion' }, { $ref: '#/$defs/revocation' }] },
    },
  },
  $defs: {
    model: {
      type: 'object',
      additionalProperties: false,
      required: ['provider', 'name', 'version'],
      properties: {
        provider: { type: 'string', minLength: 1 },
        name: { type: 'string', minLength: 1 },
        version: { type: 'string', minLength: 1 },
      },
    },
    evaluator: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'type'],
      properties: {
        id: { type: 'string', minLength: 1 },
        type: { enum: ['human', 'model'] },
        model: { $ref: '#/$defs/model' },
      },
    },
    binding: {
      type: 'object',
      additionalProperties: false,
      required: ['algorithm', 'skill_sha256', 'skill_version', 'contract_version'],
      properties: {
        algorithm: { const: 'sha256' },
        skill_sha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
        skill_version: { type: 'string', minLength: 1 },
        contract_version: { type: 'string', minLength: 1 },
      },
    },
    scenario: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'kind', 'behavioral_run', 'status', 'executed_at', 'input_sha256', 'output_sha256', 'grader'],
      properties: {
        id: { type: 'string', minLength: 1 },
        kind: { enum: ['normal', 'edge', 'adversarial'] },
        behavioral_run: { const: true },
        status: { const: 'pass' },
        executed_at: { type: 'string', format: 'date-time' },
        input_sha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
        output_sha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
        trace_sha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
        grader: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'type', 'model', 'rubric_version'],
          properties: {
            id: { type: 'string', minLength: 1 },
            type: { enum: ['model', 'deterministic'] },
            model: { $ref: '#/$defs/model' },
            rubric_version: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    baseline: {
      type: 'object',
      additionalProperties: false,
      required: ['method', 'executed_at', 'model', 'metric', 'direction', 'case_ids', 'without_skill_score', 'with_skill_score', 'improvement'],
      properties: {
        method: { const: 'same-cases-without-skill' },
        executed_at: { type: 'string', format: 'date-time' },
        model: { $ref: '#/$defs/model' },
        metric: { type: 'string', minLength: 1 },
        direction: { enum: ['higher-is-better', 'lower-is-better'] },
        case_ids: { type: 'array', items: { type: 'string' }, minItems: 1 },
        without_skill_score: { type: 'number' },
        with_skill_score: { type: 'number' },
        improvement: { type: 'number', exclusiveMinimum: 0 },
      },
    },
    reviewer: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'type', 'independent', 'decision', 'reviewed_at'],
      properties: {
        id: { type: 'string', minLength: 1 },
        type: { enum: ['human', 'model'] },
        model: { $ref: '#/$defs/model' },
        independent: { const: true },
        decision: { const: 'approved' },
        reviewed_at: { type: 'string', format: 'date-time' },
      },
    },
    regression: {
      type: 'object',
      additionalProperties: false,
      required: ['suite_id', 'executed_at', 'status', 'case_count'],
      properties: {
        suite_id: { type: 'string', minLength: 1 },
        executed_at: { type: 'string', format: 'date-time' },
        status: { const: 'pass' },
        case_count: { type: 'integer', minimum: 1 },
      },
    },
    promotion: {
      type: 'object',
      additionalProperties: false,
      required: [
        'evidence_id', 'skill', 'skill_binding', 'risk_level', 'awarded_status',
        'behavioral_run', 'verdict', 'hard_fails', 'scenarios', 'baseline',
        'reviewers', 'regression',
      ],
      properties: {
        evidence_id: { type: 'string', minLength: 1 },
        skill: { type: 'string', minLength: 1 },
        skill_binding: { $ref: '#/$defs/binding' },
        risk_level: { enum: ['r1', 'r2', 'r3', 'r4'] },
        awarded_status: { enum: ['verified', 'certified'] },
        behavioral_run: { const: true },
        verdict: { const: 'pass' },
        hard_fails: { type: 'array', maxItems: 0 },
        scenarios: { type: 'array', minItems: 5, items: { $ref: '#/$defs/scenario' } },
        baseline: { $ref: '#/$defs/baseline' },
        reviewers: { type: 'array', minItems: 1, items: { $ref: '#/$defs/reviewer' } },
        regression: { $ref: '#/$defs/regression' },
      },
    },
    revocation: {
      type: 'object',
      additionalProperties: false,
      required: ['evidence_id', 'skill', 'skill_binding', 'awarded_status', 'verdict', 'revocation_reason'],
      properties: {
        evidence_id: { type: 'string', minLength: 1 },
        skill: { type: 'string', minLength: 1 },
        skill_binding: { $ref: '#/$defs/binding' },
        awarded_status: { const: 'revoked' },
        verdict: { const: 'revoked' },
        revocation_reason: { type: 'string', minLength: 1 },
      },
    },
  },
};

const EVALS_README = `# Avaliação e promoção de skills — fixture "demo"

Esta pasta é a fixture sintética de `+ '`_evals/`' + ` usada para testar o motor sem
depender de conteúdo jurídico real. Reproduz a mesma separação de
responsabilidades do pacote real:

1. `+ '`catalog-v5.json`' + ` e `+ '`demo-canonicas.json`' + ` são **especificações de
   contrato**: descrevem comportamento normal, adversarial e hard fails, mas não
   provam que um modelo executou a skill.
2. `+ '`results/*.json`' + ` são **observações representativas e sintéticas** de
   forward-run desta fixture. Não concedem maturidade.
3. Um resultado que promove usaria obrigatoriamente
   `+ '`promotion-evidence.schema.json`' + `. O resolvedor confere o envelope e a
   instalação local antes de reconhecer `+ '`verified`' + ` ou `+ '`certified`' + `.

## Distribuição

O `+ '`init`' + ` copia estas especificações e este guia para o projeto do usuário,
mas nunca copia nem sobrescreve `+ '`_evals/results/`' + `: cada instalação constrói
sua própria evidência.
`;

function resultadoForward(s) {
  return {
    skill: s.nome,
    profile: s.perfil,
    behavioral_run: true,
    normal_pass: true,
    adversarial_pass: true,
    verdict: 'pass_not_promoted',
    hard_fails: [],
    observed_behaviors: [
      `executou o fluxo sintético de ${s.nome} respeitando objetivo e fase declarados`,
      'bloqueou quando o documento de referência estava ausente',
      'recusou produzir entrega_producao ou peca_protocolavel',
    ],
  };
}

function relatorioForward({ suite, perfil, skillsDoPerfil }) {
  const resultados = skillsDoPerfil.map(resultadoForward);
  return {
    schema_version: '1',
    suite,
    evaluated_at: '2026-07-09',
    evaluator_context: 'independent_fresh_agent',
    behavioral_run: true,
    method: 'Execução isolada das skills fictícias da área demo contra fixtures normal e adversarial.',
    limitations: [
      `A amostra cobre o perfil ${perfil} da fixture demo; não representa um catálogo de produção.`,
      'Uma única execução por cenário não satisfaz a cobertura mínima por risco.',
      'Nenhuma skill recebe awarded_status ou promoção com este relatório.',
    ],
    summary: {
      skills: resultados.length,
      normal_pass: resultados.length,
      adversarial_pass: resultados.length,
      hard_fail_skills: 0,
      promotion_approved: 0,
    },
    results: resultados,
  };
}

async function gerarEvals() {
  const evalsDir = join(RAIZ, 'skills', '_evals');
  const resultsDir = join(evalsDir, 'results');
  await mkdir(resultsDir, { recursive: true });

  await writeFile(join(evalsDir, 'catalog-v5.json'), `${JSON.stringify(CATALOG_V5, null, 2)}\n`);
  await writeFile(join(evalsDir, 'demo-canonicas.json'), `${JSON.stringify(DEMO_CANONICAS, null, 2)}\n`);
  await writeFile(join(evalsDir, 'promotion-evidence.schema.json'), `${JSON.stringify(PROMOTION_EVIDENCE_SCHEMA, null, 2)}\n`);
  await writeFile(join(evalsDir, 'README.md'), EVALS_README);

  const skillsPorPerfil = new Map();
  for (const s of SKILLS) {
    if (!skillsPorPerfil.has(s.perfil)) skillsPorPerfil.set(s.perfil, []);
    skillsPorPerfil.get(s.perfil).push(s);
  }
  const nomeArquivo = { [PERFIL_A]: 'demo-forward-legal-drafting-2026-07-09.json', [PERFIL_B]: 'demo-forward-legal-calculation-2026-07-09.json' };
  for (const [perfil, skillsDoPerfil] of skillsPorPerfil) {
    const relatorio = relatorioForward({ suite: nomeArquivo[perfil].replace(/\.json$/, ''), perfil, skillsDoPerfil });
    await writeFile(join(resultsDir, nomeArquivo[perfil]), `${JSON.stringify(relatorio, null, 2)}\n`);
  }

  console.log(`_evals gerado: ${CATALOG_V5.cases.length} casos v5, ${DEMO_CANONICAS.cases.length} caso canônico, ${skillsPorPerfil.size} relatórios de results/ (1 por quality_profile usado).`);
}

// ─────────────────────────────────────────────────────────────────────────
// Passo 2 (Task 6): acervo — jurisprudência (verificada/descoberta) e legislação quarentenada
// ─────────────────────────────────────────────────────────────────────────

const ACERVO_FILES = [
  {
    rel: join('jurisprudencia', 'tribunal-demo', 'DEMO_2024.md'),
    content: `---
confianca: VERIFIED_OFFICIAL
url_oficial: "https://exemplo.demo/tribunal-demo/tema-2024"
consultado_em: "2026-07-09"
---

# Tribunal Demo — Tema 2024

Ementa sintética fictícia da área demo, usada apenas para exercitar o índice
do acervo (VERIFIED_OFFICIAL). Sem jurisprudência real.
`,
  },
  {
    rel: join('jurisprudencia', 'tribunal-demo', 'DEMO_2023.md'),
    content: `---
confianca: DISCOVERY_ONLY
---

# Tribunal Demo — Tema 2023 (descoberta)

Fonte ainda não verificada oficialmente. Fixture sintética da área demo,
usada para exercitar a classificação DISCOVERY_ONLY do índice do acervo.
`,
  },
  {
    rel: join('legislacao', 'norma-suspeita.md'),
    content: `---
confianca: QUARANTINED
---

# Norma Suspeita (quarentena)

Fonte de procedência não confiável, mantida apenas para provar que a busca do
acervo filtra QUARANTINED por padrão (acervo-search.test.js). Fixture
sintética, sem legislação real.
`,
  },
];

async function gerarAcervo() {
  for (const file of ACERVO_FILES) {
    const dest = join(RAIZ, 'acervo', file.rel);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, file.content);
  }
  console.log(`${ACERVO_FILES.length} documentos de acervo gerados em ${RAIZ}/acervo (índice NÃO gerado aqui — rode scripts/indexar-acervo.js, ver task-6-report.md).`);
}

// ─────────────────────────────────────────────────────────────────────────
// Passo 3 (Task 6): autoridade viva com expiração datada
// ─────────────────────────────────────────────────────────────────────────

// Campos conferidos contra _legalsquad/core/authority-record.schema.json
// (schema real, additionalProperties:false em todos os níveis) — DIVERGE do
// esqueleto de exemplo do brief, que usava nomes de campo inexistentes no
// schema real (human_review.reviewed_by, sources[].url/consulted_at). Aqui o
// schema manda: human_review.{status,reviewer,reviewed_at} e
// sources[].{id,kind,title,official_url,verified_at,status,scope}.
const DEMO_AUTORIDADE = {
  schema_version: '1',
  topic: 'demo-autoridade-sintetica',
  operational_status: 'quarantined',
  verified_at: '2026-07-09',
  revalidate_policy: 'same_day',
  human_review: { status: 'approved', reviewer: 'fixture', reviewed_at: '2026-07-09' },
  sources: [
    {
      id: 'fonte-demo-1',
      kind: 'legislation',
      title: 'Norma sintética de demonstração',
      official_url: 'https://exemplo.demo/norma',
      verified_at: '2026-07-09',
      status: 'discovery_only',
      scope: 'fixture',
    },
  ],
  affected_skills: ['demo-calculo-beta'],
  affected_eval_cases: ['demo-v5-demo-calculo-beta'],
};

async function gerarAutoridade() {
  const dir = join(RAIZ, 'core', 'authorities');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'demo-autoridade.json'), `${JSON.stringify(DEMO_AUTORIDADE, null, 2)}\n`);
  console.log(`autoridade sintética gerada em ${dir}/demo-autoridade.json`);
}

// ─────────────────────────────────────────────────────────────────────────
// Passo 4 (Task 6): best-practices da fixture
// ─────────────────────────────────────────────────────────────────────────

const BEST_PRACTICES = [
  {
    id: 'fluxo-demo-basico',
    name: 'Fluxo Demo Básico',
    whenToUse: 'Criar agentes que executam o fluxo sintético triagem → análise → redação da área demo.',
    file: 'fluxo-demo-basico.md',
    content: `# Fluxo Demo Básico

Best-practice sintética: todo agente do fluxo demo básico deve (1) exigir
objetivo e fase declarados antes de agir, (2) nunca inventar documento de
referência ausente, e (3) parar em checkpoint humano antes de qualquer
entrega. Sem conteúdo jurídico — fixture da área demo.
`,
  },
  {
    id: 'revisao-dupla-demo',
    name: 'Revisão Dupla Sintética',
    whenToUse: 'Criar agentes que revisam em paralelo um rascunho sintético antes da aprovação final.',
    file: 'revisao-dupla-demo.md',
    content: `# Revisão Dupla Sintética

Best-practice sintética: quando dois revisores rodam em paralelo
(parallel_group) sobre o mesmo rascunho, cada um deve emitir veredito
independente; qualquer REJECT devolve o pipeline ao passo de redação. Sem
conteúdo jurídico — fixture da área demo.
`,
  },
];

// Corte `transversal` × `area.*` que o `build-area` lê (SPEC §6.3). É AUTORADO,
// não derivado: o empacotador é cego e não adivinha que uma skill serve qualquer
// área — quem sabe é o curador. Na fixture, as quatro de ferramenta (conector,
// geradores, criador de skill) são transversais; as `demo-*` são matéria da área.
async function gerarCorteDePacotes() {
  const corte = [
    '# Corte de pacotes desta área — lido por `tools/build-area.mjs` (SPEC §6.3).',
    '# Autorado pelo curador: o empacotador não adivinha o corte.',
    'area_id: demo',
    'area_titulo: "Área Demo"',
    'area_curador: "Curadoria Fictícia — fixture sintética, sem matéria jurídica real"',
    'area_ramos: [alfa, beta]',
    '',
    '# Skills que servem QUALQUER área. Lista explícita: vazia é válida, ausente não.',
    'transversal_skills: [conector-mcp, gerador-imagem, gerador-imagem-env, legalsquad-skill-creator]',
    '',
  ].join('\n');
  await writeFile(join(RAIZ, '_packs.yaml'), corte);
  console.log(`corte de pacotes gerado em ${join(RAIZ, '_packs.yaml')}`);
}

async function gerarBestPractices() {
  const dir = join(RAIZ, 'core', 'best-practices');
  await mkdir(dir, { recursive: true });
  let yaml = '# Catálogo de best-practices — fixture "demo"\n';
  yaml += '# O Arquiteto lê este arquivo para descobrir quais best-practices estão disponíveis.\n\n';
  yaml += 'catalog:\n';
  for (const bp of BEST_PRACTICES) {
    yaml += `  - id: ${bp.id}\n`;
    yaml += `    name: "${bp.name}"\n`;
    yaml += `    whenToUse: "${bp.whenToUse}"\n`;
    yaml += `    file: ${bp.file}\n\n`;
  }
  await writeFile(join(dir, '_catalog.yaml'), yaml);
  for (const bp of BEST_PRACTICES) {
    await writeFile(join(dir, bp.file), bp.content);
  }
  console.log(`${BEST_PRACTICES.length} best-practices geradas em ${dir}`);
}

// ─────────────────────────────────────────────────────────────────────────
// Agente REUTILIZÁVEL de área (distinto do agente amarrado a UM squad, que
// vive em squads/demo-squad/agents/). Frontmatter no formato real dos agentes
// que já vivem no motor (.claude/agents/catalog-scout.md): description de
// linha única. Exercita o `kind: 'agent'` do catálogo e o remapeamento
// `core/agents/` (autoria) → `.claude/agents/` (instalação).
async function gerarAgenteDeArea() {
  const dir = join(RAIZ, 'core', 'agents');
  await mkdir(dir, { recursive: true });
  const conteudo = `---
name: analista-demo
description: Agente sintético READ-ONLY que analisa o material bruto da área fictícia demo e devolve um resumo estruturado. Não redige peça, não decide, não acessa rede. Use como especialista reutilizável por qualquer squad da área demo que precise deste tipo de análise — cenário sintético, sem matéria jurídica real.
tools: Read, Grep, Glob
model: inherit
---

Você é o analista sintético da área demo. Leia o material fornecido e devolva um
resumo estruturado (fatos, lacunas, próximos passos). Read-only: nunca edita
nem grava nada. Este agente existe só para exercitar o motor — não decide caso
real, não é matéria jurídica.
`;
  await writeFile(join(dir, 'analista-demo.md'), conteudo);
  console.log(`1 agente de área gerado em ${dir}`);
}

// ─────────────────────────────────────────────────────────────────────────
// Passo 4 (Task 6): squad "demo-squad" — squad.yaml, squad-party.csv, agentes
// e pipeline.yaml exercitando TODAS as construções de mecanismo do Pipeline
// Runner que a Task 4 removeu sem sucessor (ver task-6-brief.md, bloco
// destacado): >=4 steps com ids sequenciais, >=2 checkpoints, um
// parallel_group com dois membros convergindo via depends_on, um on_reject,
// e ao menos um `file:` e um `agent:` que resolvam de verdade em disco.
// Estrutura (squad.yaml + squad-party.csv + agents/*.custom.md +
// pipeline/pipeline.yaml + pipeline/steps/*.md) conferida por leitura
// read-only de squads/defesa-criminal-completa e squads/execucao-penal em
// ~/Documents/Projetos/Devlop/legalsquad/app (só a ESTRUTURA; nenhum
// texto jurídico foi copiado — o conteúdo abaixo é 100% fictício).
// ─────────────────────────────────────────────────────────────────────────

const SQUAD_AGENTS = [
  { id: 'triagem-demo', name: 'Tara Triagem', icon: '🗂️', execution: 'inline', role: 'Coleta a solicitação sintética e monta a ficha de foco.' },
  { id: 'analista-demo', name: 'Ana Análise', icon: '🔎', execution: 'subagent', role: 'Analisa os dados fictícios e produz o diagnóstico sintético.' },
  { id: 'redator-demo', name: 'Rui Redação', icon: '✍️', execution: 'inline', role: 'Redige o rascunho sintético a partir da análise aprovada.' },
  { id: 'revisor-demo-a', name: 'Vitor Revisão A', icon: '✅', execution: 'subagent', role: 'Revisão A (checklist técnico) do rascunho sintético, em paralelo com a Revisão B.' },
  { id: 'revisor-demo-b', name: 'Vera Revisão B', icon: '🧪', execution: 'subagent', role: 'Revisão B (checklist de consistência) do rascunho sintético, em paralelo com a Revisão A.' },
  { id: 'publicador-demo', name: 'Pedro Publicação', icon: '📤', execution: 'inline', role: 'Gera a versão final sintética após aprovação.' },
];

const SQUAD_YAML = `name: "Squad Demo"
code: "demo-squad"
description: >
  Fluxo sintético de ponta a ponta (triagem → análise → redação → revisão
  dupla em paralelo → publicação) usado só para exercitar o Pipeline Runner
  do motor. Área fictícia "demo" — sem matéria jurídica real.
icon: "🧪"
version: "1.0.0"
created: "2026-07-20"
mode: "alta-performance"

goal: "Produzir uma entrega sintética fictícia, sem valor jurídico, para testar o motor."
success_criteria:
  - "Objetivo e fase sempre declarados antes de qualquer passo avançar"
  - "As duas revisões paralelas (A e B) emitem veredito independente"
  - "Qualquer REJECT das revisões devolve o pipeline ao passo de redação"

company: "_legalsquad/_memory/company.md"
preferences: "_legalsquad/_memory/preferences.md"
memory: "_memory/memories.md"

target_audience: "Fixture de teste do motor — não é conteúdo para usuário final"
platform: "Fixture sintética"
format: "demo-fixture"
performance_mode: "alta-performance"

skills:
  - demo-peca-alpha
  - demo-calculo-beta

data:
  - core/best-practices/fluxo-demo-basico.md
  - core/best-practices/revisao-dupla-demo.md
  - acervo/_index.yaml

agents:
${SQUAD_AGENTS.map((a) => `  - id: ${a.id}\n    name: "${a.name}"\n    icon: "${a.icon}"\n    custom: agents/${a.id}.custom.md`).join('\n\n')}

pipeline:
  entry: pipeline/pipeline.yaml

output_dir: output/
`;

// Quota um campo CSV quando ele contém vírgula/aspas — o role tem prosa livre
// ("Revisão A ..., em paralelo com a Revisão B.") e um campo com vírgula
// não-quotado deslocaria path/execution/skills, quebrando a resolução de
// agent: por column-index (mesmo parser em scripts/squad-state.mjs:50).
function csvField(value) {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function squadPartyCsv() {
  const header = 'id,name,icon,role,path,execution,skills';
  const rows = SQUAD_AGENTS.map((a) => [
    a.id, a.name, a.icon, a.role, `./agents/${a.id}.custom.md`, a.execution, '',
  ].map(csvField).join(','));
  return `${[header, ...rows].join('\n')}\n`;
}

function agentCustomMd(a) {
  return `---
base_agent: ${a.id}
id: "squads/demo-squad/agents/${a.id}"
name: "${a.name}"
title: "Persona sintética — ${a.id}"
icon: "${a.icon}"
squad: "demo-squad"
execution: ${a.execution}
skills: []
---

## Calibration

- **Responsabilidade única:** ${a.role}
- **Fixture sintética:** este agente existe só para exercitar o Pipeline
  Runner do motor. Não representa matéria jurídica nem produz entrega real.

## Princípios

1. Nunca inventar dado ausente — campos sem informação ficam "a definir".
2. Sempre respeitar o checkpoint humano mais próximo antes de avançar.
3. Recusar qualquer pedido de pular objetivo ou fase declarados.

## Anti-Patterns

- Assumir o papel de outro agente do fluxo demo.
- Produzir qualquer conteúdo apresentado como jurídico ou protocolável.
`;
}

// steps do pipeline: id sequencial, name, type, description, corpo curto.
const PIPELINE_STEPS = [
  { id: 'step-01', name: 'Foco da Demanda', type: 'checkpoint', desc: 'O usuário define a demanda sintética a ser processada.' },
  { id: 'step-02', name: 'Triagem', type: 'agent', agent: 'triagem-demo', execution: 'inline', desc: 'Tara Triagem monta a ficha de foco a partir da demanda.', depends_on: 'step-01', artifacts: ['output/triagem.md'] },
  { id: 'step-03', name: 'Análise', type: 'agent', agent: 'analista-demo', execution: 'subagent', desc: 'Ana Análise produz o diagnóstico sintético.', depends_on: 'step-02', artifacts: ['output/analise.md'] },
  { id: 'step-04', name: 'Aprovar Análise', type: 'checkpoint', desc: 'O usuário aprova o diagnóstico sintético antes da redação.', depends_on: 'step-03', artifacts: ['output/analise-aprovada.md'] },
  { id: 'step-05', name: 'Redação do Rascunho', type: 'agent', agent: 'redator-demo', execution: 'inline', desc: 'Rui Redação produz o rascunho sintético.', depends_on: 'step-04', artifacts: ['output/rascunho-demo.md'] },
  { id: 'step-06', name: 'Aprovar Rascunho', type: 'checkpoint', desc: 'O usuário aprova o rascunho antes da revisão dupla.', depends_on: 'step-05' },
  {
    id: 'step-07', name: 'Revisão A', type: 'agent', agent: 'revisor-demo-a', execution: 'subagent',
    desc: 'Vitor Revisão A confere o checklist técnico, em paralelo com a Revisão B.',
    depends_on: 'step-06', parallel_group: 'revisao-dupla-demo', on_reject: 'step-05', max_review_cycles: 3,
    artifacts: ['output/revisao-a.md'],
  },
  {
    id: 'step-08', name: 'Revisão B', type: 'agent', agent: 'revisor-demo-b', execution: 'subagent',
    desc: 'Vera Revisão B confere o checklist de consistência, em paralelo com a Revisão A.',
    depends_on: 'step-06', parallel_group: 'revisao-dupla-demo', on_reject: 'step-05', max_review_cycles: 3,
    artifacts: ['output/revisao-b.md'],
  },
  { id: 'step-09', name: 'Aprovação Final', type: 'checkpoint', desc: 'O usuário aprova a versão final depois de convergir as duas revisões paralelas.', depends_on: ['step-07', 'step-08'], artifacts: ['output/aprovacao-final.md'] },
  { id: 'step-10', name: 'Publicação', type: 'agent', agent: 'publicador-demo', execution: 'inline', desc: 'Pedro Publicação gera a entrega sintética final.', depends_on: 'step-09', artifacts: ['output/entrega-demo-final.md'] },
];

function stepFileName(step) {
  const slug = step.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${step.id}-${slug}.md`;
}

function pipelineYaml() {
  let y = `name: "Pipeline — Squad Demo"\n`;
  y += `version: "1.0.0"\n`;
  y += `created: "2026-07-20"\n`;
  y += `squad: "demo-squad"\n\n`;
  y += `description: >\n  Pipeline sintético de ponta a ponta para exercitar o Pipeline Runner do motor:\n  step-id sequenciais, checkpoints, um parallel_group com dois membros convergindo\n  via depends_on e um on_reject. Área fictícia "demo" — sem matéria jurídica real.\n\n`;
  y += `mode: "alta-performance"\n\n`;
  y += `steps:\n`;
  for (const step of PIPELINE_STEPS) {
    y += `  - id: ${step.id}\n`;
    y += `    name: "${step.name}"\n`;
    y += `    type: ${step.type}\n`;
    if (step.agent) y += `    agent: ${step.agent}\n`;
    if (step.execution) y += `    execution: ${step.execution}\n`;
    y += `    file: steps/${stepFileName(step)}\n`;
    if (step.depends_on) {
      y += Array.isArray(step.depends_on)
        ? `    depends_on: [${step.depends_on.join(', ')}]\n`
        : `    depends_on: ${step.depends_on}\n`;
    }
    if (step.parallel_group) y += `    parallel_group: ${step.parallel_group}\n`;
    if (step.on_reject) y += `    on_reject: ${step.on_reject}\n`;
    if (step.max_review_cycles) y += `    max_review_cycles: ${step.max_review_cycles}\n`;
    if (step.artifacts?.length) {
      y += `    output:\n      artifacts:\n`;
      for (const artifact of step.artifacts) y += `        - ${artifact}\n`;
    }
    y += '\n';
  }
  y += `checkpoints:\n`;
  for (const step of PIPELINE_STEPS.filter((s) => s.type === 'checkpoint')) y += `  - ${step.id}\n`;
  y += `\n# Loop de revisão (não-opcional): se a Revisão A ou a Revisão B (parallel_group\n`;
  y += `# revisao-dupla-demo) emitir REJECT, o pipeline retorna ao step-05 (redação) até\n`;
  y += `# o rascunho sintético ser aprovado por ambas. Ver on_reject em step-07/step-08.\n\n`;
  y += `output:\n  artifacts:\n`;
  const allArtifacts = PIPELINE_STEPS.flatMap((s) => s.artifacts ?? []);
  for (const artifact of allArtifacts) y += `    - ${artifact}\n`;
  return y;
}

function stepMd(step) {
  const stepNum = step.id.replace('step-', '');
  let body = `---\nstep: "${stepNum}"\nname: "${step.name}"\ntype: ${step.type}\ndescription: ${step.desc}\n---\n\n`;
  body += `# ${step.type === 'checkpoint' ? '🛑 Checkpoint' : '🤖 Agente'}: ${step.name}\n\n`;
  body += `## Para o Pipeline Runner\n\n${step.desc}\n\n`;
  body += `Fixture sintética da área demo — sem matéria jurídica real.\n\n`;
  if (step.type === 'agent') {
    body += `## Ação\n\n1. Acionar a persona \`${step.agent}\` (${step.execution}).\n2. Registrar o resultado nos artefatos declarados em \`output.artifacts\` deste step no pipeline.yaml.\n3. Avançar para o próximo step.\n`;
  } else {
    body += `## Ação\n\n1. Coletar a aprovação explícita do usuário.\n2. Só avançar após aprovação — nunca presumir.\n`;
    if (step.on_reject) body += `\n> Este checkpoint faz parte do grupo paralelo \`${step.parallel_group}\`; qualquer REJECT retorna ao \`${step.on_reject}\`.\n`;
  }
  return body;
}

async function gerarSquad() {
  const squadDir = join(RAIZ, 'squads', 'demo-squad');
  await mkdir(join(squadDir, 'agents'), { recursive: true });
  await mkdir(join(squadDir, 'pipeline', 'steps'), { recursive: true });

  await writeFile(join(squadDir, 'squad.yaml'), SQUAD_YAML);
  await writeFile(join(squadDir, 'squad-party.csv'), squadPartyCsv());
  for (const agent of SQUAD_AGENTS) {
    await writeFile(join(squadDir, 'agents', `${agent.id}.custom.md`), agentCustomMd(agent));
  }
  await writeFile(join(squadDir, 'pipeline', 'pipeline.yaml'), pipelineYaml());
  for (const step of PIPELINE_STEPS) {
    await writeFile(join(squadDir, 'pipeline', 'steps', stepFileName(step)), stepMd(step));
  }

  console.log(`squad demo-squad gerada em ${squadDir} — ${PIPELINE_STEPS.length} steps, ${PIPELINE_STEPS.filter((s) => s.type === 'checkpoint').length} checkpoints, 1 parallel_group, ${SQUAD_AGENTS.length} agentes.`);
}

// ─────────────────────────────────────────────────────────────────────────

async function main() {
  await gerarSkills();
  await gerarEvals();
  await gerarAcervo();
  await gerarAutoridade();
  await gerarBestPractices();
  await gerarAgenteDeArea();
  await gerarSquad();
  await gerarCorteDePacotes();
}

await main();
