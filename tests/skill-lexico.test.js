import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lerLexicos, variantesDeConsulta } from '../src/skill-lexico.js';
import { searchSkillCatalog } from '../src/skill-search.js';

// O léxico é a resposta sancionada pela spec (DESCOBERTA.md §3.1) para o
// recall da busca lexical: o CURADOR declara equivalências, o pacote as
// distribui, a busca expande a consulta em variantes e funde por melhor
// score. Estes testes prendem: simetria dos grupos, teto de variantes,
// degradação sem arquivo, e o efeito fim-a-fim — a skill nomeada por um
// termo é achada pelo sinônimo.

function projetoComLexico() {
  const raiz = mkdtempSync(join(tmpdir(), 'legalsquad-lexico-'));
  const skillsDir = join(raiz, 'skills');
  mkdirSync(join(skillsDir, 'acao-de-despejo'), { recursive: true });
  writeFileSync(join(skillsDir, 'acao-de-despejo', 'SKILL.md'), [
    '---',
    'name: acao-de-despejo',
    'description: Ação de despejo por falta de pagamento na Lei 8.245/91',
    'positive_triggers: [despejo, acao de despejo]',
    '---',
    '## Corpo',
    'Conteúdo da peça.',
  ].join('\n'));
  writeFileSync(join(skillsDir, '_lexico.direito-civil.yaml'), [
    'sinonimos:',
    '  despejo: [retomada de imovel, desocupacao]',
    '  locacao: [aluguel]',
  ].join('\n'));
  return raiz;
}

test('grupos são simétricos: qualquer termo do grupo conhece os demais', () => {
  const raiz = projetoComLexico();
  const grupos = lerLexicos(join(raiz, 'skills'));
  assert.ok(grupos.get('retomada de imovel').has('despejo'));
  assert.ok(grupos.get('despejo').has('desocupacao'));
});

test('variantes: original primeiro, substituição de frase e termo, teto de 4', () => {
  const raiz = projetoComLexico();
  const grupos = lerLexicos(join(raiz, 'skills'));
  const variantes = variantesDeConsulta('retomada de imovel', grupos);
  assert.equal(variantes[0], 'retomada de imovel');
  assert.ok(variantes.some((v) => v.includes('despejo')));
  assert.ok(variantes.length <= 4);
});

test('fim-a-fim: o sinônimo do curador acha a skill nomeada pelo outro termo', () => {
  const raiz = projetoComLexico();
  const semLexico = searchSkillCatalog('retomada de imovel urgente', raiz, {});
  const resultado = searchSkillCatalog('retomada de imovel', raiz, {});
  // A consulta pelo sinônimo encontra a skill e a razão registra a via.
  const alvo = resultado.results.find((r) => r.id === 'acao-de-despejo');
  assert.ok(alvo, `esperava acao-de-despejo em ${JSON.stringify(resultado.results.map((r) => r.id))}`);
  assert.ok(alvo.matched_by.includes('via-lexico'));
  assert.deepEqual(resultado.lexico_variantes.length > 0, true);
  void semLexico;
});

test('sem _lexico*.yaml a busca segue idêntica — enriquecimento, não dependência', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'legalsquad-sem-lexico-'));
  mkdirSync(join(raiz, 'skills', 'x'), { recursive: true });
  writeFileSync(join(raiz, 'skills', 'x', 'SKILL.md'), '---\nname: x\ndescription: tema y\n---\n## C\nz');
  const r = searchSkillCatalog('tema y', raiz, {});
  assert.equal(r.success, true);
  assert.deepEqual(r.lexico_variantes, []);
});

test('filtro por delivery_type recorta o conjunto ANTES do rank', () => {
  const raiz = projetoComLexico();
  const skillsDir = join(raiz, 'skills');
  mkdirSync(join(skillsDir, 'calc-multa'), { recursive: true });
  writeFileSync(join(skillsDir, 'calc-multa', 'SKILL.md'), [
    '---',
    'name: calc-multa',
    'description: Cálculo de multa por despejo',
    'delivery_type: calculo',
    '---',
    '## C',
    'x',
  ].join('\n'));
  const todos = searchSkillCatalog('despejo', raiz, {});
  const soCalculo = searchSkillCatalog('despejo', raiz, { deliveryType: 'calculo' });
  assert.ok(todos.results.length >= 2);
  assert.deepEqual(soCalculo.results.map((r) => r.id), ['calc-multa']);
  assert.deepEqual(soCalculo.filtros, { delivery_type: 'calculo' });
});
