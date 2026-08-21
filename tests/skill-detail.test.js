import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detailSkill } from '../src/skill-detail.js';
import { AREA_DEMO } from './fixtures/caminhos.js';

// `detail-skill` é o meio-termo entre a shortlist (proibida por teste de vazar
// corpo) e ler o SKILL.md inteiro: um digest estrutural de UM finalista, para
// o Arquiteto julgar aderência skill↔agente com números, não com 300 chars de
// metadata. Estes testes prendem o contrato do digest.

function skillSintetica(corpo, frontmatter = '') {
  const raiz = mkdtempSync(join(tmpdir(), 'legalsquad-detail-'));
  mkdirSync(join(raiz, 'skills', 'skill-teste'), { recursive: true });
  writeFileSync(
    join(raiz, 'skills', 'skill-teste', 'SKILL.md'),
    `---\nname: skill-teste\n${frontmatter}---\n${corpo}`
  );
  return raiz;
}

test('digest da fixture demo: estrutura, gatilhos completos e substância', () => {
  const r = detailSkill('demo-peca-alpha', AREA_DEMO);
  assert.equal(r.success, true);
  assert.equal(r.source, 'pack');
  assert.equal(r.lifecycle, 'active');
  // Gatilhos INTEIROS — a busca corta em 5/3; o digest não corta.
  assert.ok(Array.isArray(r.triggers.negative));
  assert.ok(Array.isArray(r.triggers.guard));
  // A estrutura lista seções com contagem de linhas.
  assert.ok(r.estrutura.length > 0);
  assert.ok(r.estrutura.every((s) => typeof s.secao === 'string' && Number.isInteger(s.linhas)));
  // Os dois números são comparáveis (mesma régua: linhas não-vazias).
  assert.ok(r.sinais.linhas_bloco_contrato <= r.sinais.linhas_total);
});

test('sinais jurídicos contam artigos, súmulas e leis distintos e [NÃO VERIFICADO]', () => {
  const raiz = skillSintetica([
    '## Base legal',
    'O art. 896 e o art. 896-A da CLT regem o tema; o art. 896 repetido não conta duas vezes.',
    'A Súmula 126 e a súmula nº 337 do TST barram o resto. Lei 13.467/2017 e Lei 13.015/2014.',
    'O quórum é o do art. 1.035-A. [NÃO VERIFICADO: RISTJ pendente]',
  ].join('\n'));
  const r = detailSkill('skill-teste', raiz);
  assert.equal(r.success, true);
  assert.equal(r.sinais.artigos_citados, 3); // 896, 896-A, 1.035-A
  assert.equal(r.sinais.sumulas_citadas, 2); // 126, 337
  assert.equal(r.sinais.leis_citadas, 2); // 13.467, 13.015
  assert.equal(r.sinais.marcadores_nao_verificado, 1);
});

test('--secao devolve o conteúdo de UMA seção, sem acento e sem caixa', () => {
  const raiz = skillSintetica('## Contrato de saída\nDevolve veredito por bloco.\n\n## Outra\nNada.');
  const r = detailSkill('skill-teste', raiz, { secao: 'contrato de saida' });
  assert.match(r.secao.conteudo, /veredito por bloco/);
  assert.equal(r.contrato_de_saida.includes('veredito por bloco'), true);

  const ausente = detailSkill('skill-teste', raiz, { secao: 'inexistente' });
  assert.equal(ausente.secao.conteudo, null);
});

test('id com barra ou ponto-ponto é recusado — inspeção nunca vira travessia', () => {
  for (const id of ['../fora', 'a/b', 'a\\b', '']) {
    const r = detailSkill(id, AREA_DEMO);
    assert.equal(r.success, false);
    assert.equal(r.error.code, 'detail-id-invalido');
  }
});

test('skill inexistente devolve erro estruturado, nunca exceção', () => {
  const r = detailSkill('nao-existe-no-disco', AREA_DEMO);
  assert.equal(r.success, false);
  assert.equal(r.error.code, 'detail-skill-inexistente');
});
