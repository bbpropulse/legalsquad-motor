import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankSkills } from '../src/skill-rank.js';

// Gatilho negativo é declaração do CURADOR: "não use esta skill quando…".
// Até aqui a busca só ECOAVA os negativos na shortlist — uma consulta que
// casasse exatamente um "não use quando" subia no rank como qualquer positivo.
// Estes testes prendem a semântica nova: casamento de FRASE com negativo
// penaliza; casamento de TOKEN não penaliza (negativos compartilham o
// vocabulário do domínio com os positivos, e por token a skill certa cairia
// pelas próprias palavras).

const CORPUS = [
  {
    id: 'recurso-especial',
    description: 'Recurso especial ao STJ por violação de lei federal',
    positiveTriggers: ['recurso especial', 'resp'],
    negativeTriggers: ['recurso ordinário', 'recurso de revista'],
  },
  {
    id: 'recurso-ordinario-generico',
    description: 'Peça genérica de recurso para segunda instância',
    positiveTriggers: ['recurso'],
    negativeTriggers: [],
  },
];

test('consulta que É um gatilho negativo derruba a skill que o declara', () => {
  // "recurso ordinário" é exatamente o que `recurso-especial` diz não cobrir.
  const semPenalidade = rankSkills(
    CORPUS.map((doc) => ({ ...doc, negativeTriggers: [] })),
    'recurso ordinário'
  );
  const comPenalidade = rankSkills(CORPUS, 'recurso ordinário');

  const antes = semPenalidade.find((r) => r.id === 'recurso-especial');
  const depois = comPenalidade.find((r) => r.id === 'recurso-especial');

  // A skill casou por token ("recurso") nos dois cenários; com o negativo
  // declarado, o score tem de cair — e a razão tem de aparecer, para o
  // Arquiteto VER o conflito na shortlist em vez de ser poupado dele.
  assert.ok(antes, 'sem negativos, a skill casa por token e aparece');
  if (depois) {
    assert.ok(depois.score < antes.score, `score deveria cair: ${antes.score} → ${depois.score}`);
    assert.ok(depois.reasons.includes('gatilho-negativo'));
  }
  // Nos dois cenários, a skill certa para a consulta vence a penalizada.
  assert.equal(comPenalidade[0].id, 'recurso-ordinario-generico');
});

test('casamento por TOKEN não aciona o negativo — só frase aciona', () => {
  // "recurso especial" compartilha o token "recurso" com o negativo
  // "recurso ordinário". Penalizar por token derrubaria a skill com as
  // palavras dela mesma. A consulta certa NÃO pode sofrer a penalidade.
  const ranked = rankSkills(CORPUS, 'recurso especial');
  const alvo = ranked.find((r) => r.id === 'recurso-especial');
  assert.ok(alvo, 'a skill certa aparece');
  assert.equal(alvo.reasons.includes('gatilho-negativo'), false);
  assert.equal(ranked[0].id, 'recurso-especial');
});

test('documentos sem negativeTriggers seguem intactos (campo é opcional)', () => {
  const ranked = rankSkills(
    [{ id: 'sem-negativos', description: 'qualquer coisa', positiveTriggers: ['tema x'] }],
    'tema x'
  );
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].reasons.includes('gatilho-negativo'), false);
});
