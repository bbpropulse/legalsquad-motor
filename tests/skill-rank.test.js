import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankSkills } from '../src/skill-rank.js';

// Guarda de RELEVÂNCIA. O ranking da busca de skills precisa saber que nem todo
// termo vale o mesmo: um token que aparece em quase todas as skills da área quase
// não informa, e um que aparece em três informa muito.
//
// Sem isso — soma de pesos fixos, que é como o motor pontuava — o termo comum
// afoga o raro exatamente quando mais importa: com 500 skills passa, com 5.000
// a shortlist degrada e o Arquiteto escolhe errado.

/** Documento mínimo no formato que `skill-search` extrai de `entry.metadata`. */
function doc(id, extra = {}) {
  return {
    id,
    description: '',
    group: 'demo',
    positiveTriggers: [],
    aliases: [],
    categories: [],
    ...extra,
  };
}

test('termo raro pesa mais que termo comum na mesma posição', () => {
  // Nove documentos carregam "comum" no nome; um só carrega "raro".
  // Os dois candidatos são idênticos em tudo — mesma posição (o nome), mesma
  // quantidade de termos casados (1 de 2). A ÚNICA diferença é a raridade.
  //
  // Os ids são escolhidos de propósito para que a ordem alfabética favoreça a
  // resposta ERRADA: sem IDF os dois empatam e o desempate alfabético entrega
  // `aaa-comum`. Um teste em que o acerto pudesse vir do desempate não provaria
  // nada.
  const docs = [
    doc('aaa-comum'),
    doc('bbb-comum'),
    doc('ccc-comum'),
    doc('ddd-comum'),
    doc('eee-comum'),
    doc('fff-comum'),
    doc('ggg-comum'),
    doc('hhh-comum'),
    doc('iii-comum'),
    doc('zzz-raro'),
  ];

  const ranked = rankSkills(docs, 'comum raro');

  assert.equal(
    ranked[0].id,
    'zzz-raro',
    'o documento que casa o termo RARO tem de vir na frente do que casa o termo comum — ' +
      'sem isso o vocabulário frequente da área domina a shortlist'
  );
});

// ── Guardas do invariante em que a segurança da mudança se apoia ────────────
// O peso de raridade é normalizado para (0, 1]: o teto é o termo que aparece em
// UM documento, e nesse caso vale exatamente o que valia antes. Termo comum só
// desconta. Se algum dia esse peso puder passar de 1, ou chegar a 0, as duas
// coisas abaixo quebram — e quebram em silêncio, que é o pior jeito.

function ruido(quantos) {
  return Array.from({ length: quantos }, (_, i) => doc(`ruido-${String(i).padStart(5, '0')}`));
}

test('o casamento exato de nome domina em qualquer tamanho de catálogo', () => {
  // Se o peso de token crescesse com N, uma área grande acabaria afogando o
  // casamento exato de nome sob uma pilha de casamentos parciais — e o Arquiteto
  // deixaria de achar a skill que tem exatamente o nome que ele pediu.
  const disputa = [
    doc('alfa-beta'),
    doc('zzz-parcial', {
      positiveTriggers: ['alfa'],
      aliases: ['beta'],
      categories: ['alfa', 'beta'],
      description: 'alfa beta alfa beta',
    }),
  ];

  for (const [rotulo, corpus] of [
    ['pequeno', [...disputa, ...ruido(1)]],
    ['grande', [...disputa, ...ruido(3000)]],
  ]) {
    const ranked = rankSkills(corpus, 'alfa beta');
    assert.equal(
      ranked[0].id,
      'alfa-beta',
      `catálogo ${rotulo}: o nome exato tem de ganhar do casamento parcial espalhado por campos`
    );
  }
});

test('termo presente em todos os documentos não some da shortlist', () => {
  // Peso de raridade ZERO seria o modo de falha silencioso: todo documento que
  // casasse só pelo termo ubíquo cairia no filtro de score > 0 e a busca diria
  // "nada encontrado" para algo que existe. Num acervo jurídico, "não encontrei"
  // lido como "não há" é o erro que chega na peça.
  const docs = Array.from({ length: 40 }, (_, i) => doc(`item-${i}-ubiquo`));

  const ranked = rankSkills(docs, 'ubiquo');

  assert.equal(ranked.length, 40, 'nenhum documento pode desaparecer por o termo ser comum');
  assert.ok(ranked.every((item) => item.score > 0), 'o peso de raridade nunca pode zerar o score');
});
