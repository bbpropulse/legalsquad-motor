import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { searchSkillCatalog } from '../src/skill-search.js';

// Supervisão na shortlist. A fixture `area-demo` tem as 11 skills `contracted`,
// então o caso "declarada promovida SEM evidência" nunca foi exercitado — e é
// justamente ele que aparece quando alguém põe uma skill na mão dentro de um
// projeto instalado, que é um fluxo real e suportado.
//
// A evidência comportamental é local (`skills/_evals/results/`, user-owned): uma
// skill pode declarar `certified` no frontmatter e não ter prova nenhuma. Se a
// shortlist tratar a declaração como verdade, a skill sem prova aparece
// exigindo MENOS cuidado que a `contracted` honesta — fail-open no lugar exato
// onde o Arquiteto escolhe em quem confiar.

function projetoCom(skills) {
  const raiz = mkdtempSync(join(tmpdir(), 'legalsquad-supervisao-'));
  for (const [id, status] of Object.entries(skills)) {
    mkdirSync(join(raiz, 'skills', id), { recursive: true });
    writeFileSync(join(raiz, 'skills', id, 'SKILL.md'), [
      '---',
      `name: ${id}`,
      'description: >-',
      `  Skill sintética ${id} para exercitar o gate de supervisão. Gatilhos: ${id}, alvo supervisao.`,
      'metadata:',
      '  type: "prompt"',
      '  lifecycle: "active"',
      '  categories: [teste]',
      `  quality_status: "${status}"`,
      '  quality_profile: "legal-drafting"',
      '  risk_level: "r2"',
      '  delivery_type: "advisory"',
      `  positive_triggers: ["${id}", "alvo supervisao"]`,
      '---',
      '',
      'Corpo.',
      '',
    ].join('\n'));
  }
  return raiz;
}

test('skill que se declara promovida sem evidência exige supervisão', () => {
  // Nenhuma das duas tem evidência em `skills/_evals/results/` — a diferença é
  // só o que o frontmatter alega. Alegar mais não pode render menos cuidado.
  const raiz = projetoCom({ 'alvo-contracted': 'contracted', 'alvo-certified': 'certified' });

  const { results } = searchSkillCatalog('alvo supervisao', raiz, { limit: 10 });
  const certificada = results.find((r) => r.id === 'alvo-certified');
  const contratada = results.find((r) => r.id === 'alvo-contracted');

  assert.ok(certificada && contratada, 'as duas skills precisam aparecer para o teste valer algo');
  assert.equal(certificada.high_performance_eligible, false, 'sem evidência, não é elegível');
  assert.equal(
    certificada.supervision_required,
    true,
    'skill não comprovada tem de exigir supervisão, ainda que o frontmatter alegue `certified` — ' +
      'senão declarar promoção rende MENOS cuidado que ser honesto sobre não tê-la'
  );
  assert.equal(contratada.supervision_required, true);
});
