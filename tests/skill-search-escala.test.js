import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { searchSkillCatalog } from '../src/skill-search.js';

// Guarda de ESCALA da busca, medida em corpus real (4521 skills importadas):
//
//   discoverSkillCatalog     1652 ms   ← varredura do disco
//   auditSkillCatalogQuality  538 ms   ← AUDITAVA AS 4521 PARA EXIBIR 8
//   rankSkills                164 ms
//
// A varredura fica: é ela que garante que a busca nunca minta sobre o que está
// instalado, e trocá-la por um índice trocaria correção por velocidade.
//
// A auditoria não tem essa desculpa. `evaluateSkillQuality` é POR SKILL — só
// compartilha contexto (perfis, casos, evidência), sem estado cruzado. Auditar
// quem nem casou a consulta é trabalho jogado fora: medido, 516 ms para avaliar
// 4521 contra 0,7 ms para avaliar 8.
//
// A sutileza que impede auditar só os N finais: o `maturityBonus` da auditoria
// entra no RANK, então ela decide QUEM chega aos N. O corte exato — e o único
// que preserva o resultado — é auditar exatamente quem CASOU a consulta.

function projetoCom(quantidade, casam) {
  const raiz = mkdtempSync(join(tmpdir(), 'legalsquad-escala-'));
  for (let i = 0; i < quantidade; i += 1) {
    // Só as primeiras `casam` carregam o termo da consulta; o resto usa
    // vocabulário disjunto, para que a shortlist seja de fato estreita.
    const alvo = i < casam;
    const id = alvo ? `alvo-${i}-agulha` : `ruido-${String(i).padStart(4, '0')}-palheiro`;
    mkdirSync(join(raiz, 'skills', id), { recursive: true });
    writeFileSync(join(raiz, 'skills', id, 'SKILL.md'), [
      '---',
      `name: ${id}`,
      'description: >-',
      `  Skill sintética ${id} para medir escala da busca.`,
      'metadata:',
      '  type: "prompt"',
      '  lifecycle: "active"',
      `  categories: [${alvo ? 'agulha' : 'palheiro'}]`,
      '  quality_status: "contracted"',
      `  positive_triggers: [${id}]`,
      '---',
      '',
      'Corpo.',
      '',
    ].join('\n'));
  }
  return raiz;
}

test('a busca audita só quem casou a consulta, não o catálogo inteiro', () => {
  const raiz = projetoCom(300, 5);

  const resultado = searchSkillCatalog('agulha', raiz, { limit: 8 });

  assert.equal(resultado.success, true);
  assert.equal(resultado.results.length, 5, 'as 5 que casam precisam voltar');
  assert.ok(
    resultado.audited <= 5,
    `auditou ${resultado.audited} para devolver 5 — avaliar quem não casou é trabalho jogado fora, ` +
      'e com 4521 skills instaladas isso custou 516 ms de 2,4 s'
  );
  assert.ok(
    resultado.audited < 300,
    'o custo da auditoria não pode crescer com o tamanho do catálogo'
  );
});

test('auditar menos não muda o resultado', () => {
  // O corte só vale se for EXATO. Como o bônus de maturidade entra no rank,
  // auditar de menos mudaria a ordem — e mudaria em silêncio.
  const raiz = projetoCom(120, 12);

  const { results } = searchSkillCatalog('agulha', raiz, { limit: 20 });

  assert.equal(results.length, 12);
  for (const item of results) {
    assert.equal(item.quality_status, 'contracted', 'o veredito de qualidade continua presente');
    assert.equal(item.supervision_required, true, 'e continua correto');
  }
  const ordenado = [...results].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  assert.deepEqual(results.map((r) => r.id), ordenado.map((r) => r.id), 'a ordem se mantém');
});
