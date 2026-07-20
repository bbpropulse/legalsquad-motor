import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contractSkillsProject } from '../src/skill-catalog-cli.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

async function scaffoldProject({ qualityStatus, lifecycle = 'active' } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'csq-contract-'));
  await mkdir(join(dir, 'skills', 'nova-skill-defesa'), { recursive: true });
  await mkdir(join(dir, 'skills', '_evals'), { recursive: true });
  await mkdir(join(dir, '_criminalsquad', 'core'), { recursive: true });
  // The Architect authors a rich SKILL.md with a minimal v5 starter frontmatter;
  // the contract layer supplies everything else.
  await cp(
    join(ROOT, '_criminalsquad', 'core', 'skill-quality-profiles.json'),
    join(dir, '_criminalsquad', 'core', 'skill-quality-profiles.json'),
  );
  await writeFile(
    join(dir, 'skills', 'nova-skill-defesa', 'SKILL.md'),
    `---
name: nova-skill-defesa
description: >-
  Use ao construir a defesa de exemplo para o teste do contrato operacional v5.
  Gatilhos: teste, defesa exemplo. Não use para conclusão definitiva sem autos suficientes.
metadata:
  type: "prompt"
  version: "1.0.0"
  categories: [law, criminal, defesa, contra-pessoa]
  lifecycle: "${lifecycle}"${qualityStatus ? `\n  quality_status: "${qualityStatus}"` : ''}
---

# Nova Skill de Defesa (exemplo)

## Base legal
Conteúdo forense de exemplo para exercitar o pipeline de contrato.
`,
    'utf8',
  );
  return dir;
}

test('contract-skills aplica o contrato v5 completo num projeto (cwd-aware)', async () => {
  const dir = await scaffoldProject();
  try {
    const result = contractSkillsProject(dir);
    assert.equal(result.success, true, 'catálogo deve ficar íntegro após o contrato');
    assert.equal(result.contract.changed, 1, 'a skill nova deve ser contratada');

    const skillPath = join(dir, 'skills', 'nova-skill-defesa', 'SKILL.md');
    const skill = await readFile(skillPath, 'utf8');
    assert.match(skill, /schema_version: "5"/, 'frontmatter deve migrar para v5');
    assert.match(skill, /quality_profile: "legal-analysis"/, 'perfil deve ser classificado');
    assert.match(skill, /quality_status: "contracted"/, 'skill nova nasce contracted');
    assert.match(skill, /eval_case_ids: \["csq-v5-nova-skill-defesa"\]/);
    assert.match(skill, /CRIMINALSQUAD:HP-CONTRACT:START/, 'bloco de contrato deve ser injetado');
    assert.match(skill, /## Base legal/, 'o conteúdo autoral deve ser preservado');

    // O bloco não pode alegar desempenho: `high_performance_eligible` é computado a
    // partir de evidência (skill-quality.js), e uma skill nova não tem nenhuma.
    assert.match(skill, /## Contrato operacional \(v5\)/, 'o bloco declara contrato estrutural');
    assert.doesNotMatch(skill, /Contrato de alta performance/, 'não pode alegar alta performance');
    assert.match(skill, /não\*\* é desempenho comprovado/, 'o bloco deve declarar a maturidade honesta');

    assert.ok(
      existsSync(join(dir, 'skills', 'nova-skill-defesa', 'references', 'high-performance-contract.md')),
      'a referência de contrato deve ser gerada',
    );
    assert.ok(
      existsSync(join(dir, 'skills', 'nova-skill-defesa', 'agents', 'openai.yaml')),
      'o agents/openai.yaml deve ser gerado',
    );

    const catalog = JSON.parse(await readFile(join(dir, 'skills', '_evals', 'catalog-v5.json'), 'utf8'));
    const evalCase = catalog.cases.find((c) => c.id === 'csq-v5-nova-skill-defesa');
    assert.ok(evalCase, 'o eval de contrato deve ser registrado no catalog-v5.json');
    assert.equal(evalCase.skill, 'nova-skill-defesa');
    const kinds = new Set(evalCase.scenarios.map((s) => s.kind));
    assert.ok(kinds.has('normal') && kinds.has('adversarial'), 'eval exige normal e adversarial');

    assert.ok(existsSync(join(dir, 'skills', '_index.yaml')), 'o índice deve ser regenerado');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('contract-skills é idempotente (segunda passada não altera skills conformes)', async () => {
  const dir = await scaffoldProject();
  try {
    contractSkillsProject(dir);
    const second = contractSkillsProject(dir);
    assert.equal(second.success, true);
    assert.equal(second.contract.changed, 0, 'skill já conforme não é reescrita');
    assert.equal(second.contract.skipped, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// Regressão: o normalizador estrutural reescrevia TUDO para `contracted`, apagando a
// promoção a cada rodada e tornando o caminho verified/certified inalcançável.
test('contract-skills preserva promoção conquistada em vez de rebaixá-la', async () => {
  const dir = await scaffoldProject({ qualityStatus: 'verified' });
  try {
    contractSkillsProject(dir);
    const skill = await readFile(join(dir, 'skills', 'nova-skill-defesa', 'SKILL.md'), 'utf8');
    assert.match(skill, /quality_status: "verified"/, 'promoção não pode ser apagada pelo normalizador');
    assert.match(skill, /promovida por evidência comportamental/, 'o bloco reflete a maturidade real');
    assert.doesNotMatch(skill, /não\*\* é desempenho comprovado/, 'não rebaixa o texto de uma promovida');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('contract-skills normaliza status não-promovido para contracted', async () => {
  const dir = await scaffoldProject({ qualityStatus: 'legacy' });
  try {
    contractSkillsProject(dir);
    const skill = await readFile(join(dir, 'skills', 'nova-skill-defesa', 'SKILL.md'), 'utf8');
    assert.match(skill, /quality_status: "contracted"/, 'status sem evidência normaliza para contracted');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('quarantined tem precedência sobre promoção (trava de segurança)', async () => {
  const dir = await scaffoldProject({ qualityStatus: 'verified', lifecycle: 'quarantined' });
  try {
    contractSkillsProject(dir);
    const skill = await readFile(join(dir, 'skills', 'nova-skill-defesa', 'SKILL.md'), 'utf8');
    assert.match(skill, /quality_status: "quarantined"/, 'quarentena vence promoção');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
