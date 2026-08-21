import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

test('BOM e CRLF: sinais idênticos aos do arquivo LF — frontmatter nunca vira corpo', () => {
  // Regressão: sem normalizar, o frontmatter inteiro contava como corpo e o
  // gatilho NEGATIVO "art. 312 do CPP" virava citação — o digest afirmava
  // substância exatamente onde a skill declara não cobrir.
  const fm = 'name: skill-teste\nnegative_triggers: ["art. 312 do CPP", "sumula 331"]\n';
  const corpo = '## Base\nO art. 5 rege o tema.';
  const lf = skillSintetica(corpo, fm);
  const crlf = skillSintetica(corpo, fm);
  const caminho = join(crlf, 'skills', 'skill-teste', 'SKILL.md');
  writeFileSync(caminho, '\uFEFF' + readFileSync(caminho, 'utf8').replace(/\n/g, '\r\n'));

  const a = detailSkill('skill-teste', lf);
  const b = detailSkill('skill-teste', crlf);
  assert.deepEqual(b.sinais, a.sinais, 'BOM+CRLF não pode mudar os sinais');
  assert.equal(b.sinais.artigos_citados, 1, 'só o art. 5 do corpo — nunca o 312 do frontmatter');
});

test('heading dentro de fence é conteúdo do exemplo, não seção — e --secao não trunca', () => {
  const raiz = skillSintetica([
    '## Modelo da peça',
    'Use este esqueleto:',
    '```markdown',
    '## DOS FATOS',
    'narrativa',
    '## DOS PEDIDOS',
    'pedidos',
    '```',
    'Fim do modelo.',
    '## Checklist',
    'x',
  ].join('\n'));
  const r = detailSkill('skill-teste', raiz, { secao: 'modelo da peca' });
  const nomes = r.estrutura.map((s) => s.secao);
  assert.ok(!nomes.includes('DOS FATOS') && !nomes.includes('DOS PEDIDOS'),
    `headings do fence não são seções: ${nomes}`);
  assert.match(r.secao.conteudo, /DOS PEDIDOS/, 'a seção inclui o exemplo inteiro');
  assert.match(r.secao.conteudo, /Fim do modelo/);
});

test('regex de citações: plural de lei, ponto final e ordinal de artigo', () => {
  const raiz = skillSintetica([
    '## Base',
    'As Leis 8.072 e a Lei 9.099. regem o tema.',
    'O art. 1º-A e o art. 1º são artigos DIFERENTES; o art. 1o repete o segundo.',
  ].join('\n'));
  const r = detailSkill('skill-teste', raiz);
  assert.equal(r.sinais.leis_citadas, 2, 'plural conta; ponto final não duplica');
  assert.equal(r.sinais.artigos_citados, 2, '1-A e 1 são chaves distintas; 1º e 1o fundem');
});
