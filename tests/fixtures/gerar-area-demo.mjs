// Gera tests/fixtures/area-demo/skills/ — área fictícia para testar o MOTOR
// sem depender de conteúdo jurídico real. Rode: node tests/fixtures/gerar-area-demo.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), 'area-demo');

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
  { nome: 'demo-preview-engine',  lifecycle: 'preview',     perfil: PERFIL_B, risco: 'r3', entrega: 'audit-calculation',  tipo: 'prompt', versao: '3.0.0' },
  { nome: 'demo-piloto',          lifecycle: 'pilot',       perfil: PERFIL_A, risco: 'r2', entrega: 'legal-draft',        tipo: 'prompt' },
  { nome: 'demo-quarentena',      lifecycle: 'quarantined', perfil: PERFIL_A, risco: 'r4', entrega: 'legal-draft',        tipo: 'prompt' },
  { nome: 'demo-deprecada',       lifecycle: 'deprecated',  perfil: PERFIL_A, risco: 'r2', entrega: 'legal-draft',        tipo: 'prompt' },
  { nome: 'conector-mcp',         lifecycle: 'active',      perfil: PERFIL_A, risco: 'r2', entrega: 'external-mutation',  tipo: 'mcp',    env: ['DEMO_TOKEN'] },
  { nome: 'gerador-imagem',       lifecycle: 'active',      perfil: PERFIL_A, risco: 'r1', entrega: 'external-mutation',  tipo: 'prompt', env: [] },
  { nome: 'gerador-imagem-env',   lifecycle: 'active',      perfil: PERFIL_A, risco: 'r1', entrega: 'external-mutation',  tipo: 'prompt', env: ['DEMO_API_KEY'] },
  { nome: 'legalsquad-skill-creator', lifecycle: 'active',  perfil: PERFIL_A, risco: 'r2', entrega: 'system-artifact',    tipo: 'prompt', scripts: true },
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
  eval_case_ids: ["demo-v5-${s.nome}"]
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

<!-- CRIMINALSQUAD:HP-CONTRACT:START -->

## Quando usar

Cenário sintético da área demo. Este arquivo existe para exercitar o motor —
catálogo, busca, política de runtime e resolvedor — sem conteúdo jurídico real.

## Entradas mínimas

- objetivo declarado
- fase do fluxo demo
- documento de referência

## Limites

Não produz entrega de produção. Não substitui revisão humana.

<!-- CRIMINALSQUAD:HP-CONTRACT:END -->
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
