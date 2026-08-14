import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compararVersao, versaoAvanca } from '../src/pack-version.js';

// Versão de pacote é calendário `AAAA.MM.SEQ` (SPEC §6.1). O SEQ é sequência do
// curador, não dia — dois builds no mesmo mês são `.1` e `.2`.
//
// Comparar isso como STRING é o mesmo defeito do `v10 > v9` que já mordeu o
// resolvedor de caminho: textualmente "2026.08.10" < "2026.08.9", e o pacote
// mais novo seria tratado como mais velho. Aqui a consequência é pior, porque
// não há tela onde alguém veja: o servidor simplesmente continua servindo o
// conteúdo antigo como `latest`.

test('compara componente a componente, NUMERICAMENTE', () => {
  assert.ok(compararVersao('2026.08.10', '2026.08.9') > 0, '10 > 9 — textualmente seria o contrário');
  assert.ok(compararVersao('2026.08.2', '2026.08.11') < 0, '2 < 11');
  assert.equal(compararVersao('2026.08.3', '2026.08.3'), 0);
});

test('ano e mês pesam mais que a sequência', () => {
  assert.ok(compararVersao('2026.09.1', '2026.08.99') > 0, 'mês novo vence sequência alta do anterior');
  assert.ok(compararVersao('2027.01.1', '2026.12.99') > 0, 'virada de ano');
  assert.ok(compararVersao('2026.08.1', '2026.10.1') < 0);
});

test('`versaoAvanca` exige estritamente maior — republicar a MESMA versão não avança', () => {
  // Reempacotar com o mesmo número e mandar de novo é o caso comum de quem
  // corrigiu conteúdo e esqueceu de subir o SEQ. O servidor guarda por versão:
  // aceitar em silêncio deixaria o curador convicto de ter publicado a correção.
  assert.equal(versaoAvanca('2026.08.14', '2026.08.11'), true);
  assert.equal(versaoAvanca('2026.08.11', '2026.08.11'), false, 'igual não avança');
  assert.equal(versaoAvanca('2026.08.1', '2026.08.11'), false, 'menor não avança');
});

test('sem versão publicada ainda, qualquer versão válida avança', () => {
  assert.equal(versaoAvanca('2026.08.1', null), true, 'primeiro publish de um pack novo');
  assert.equal(versaoAvanca('2026.08.1', undefined), true);
  assert.equal(versaoAvanca('2026.08.1', ''), true);
});

test('versão ilegível é RECUSADA, nunca tratada como "provavelmente ok"', () => {
  // Fail-closed: "não sei ler" não vira "pode publicar". Uma versão malformada
  // no manifesto assinado é sintoma de build errado, e publicar por cima do
  // acervo de produção é caro de desfazer.
  for (const ruim of ['2026.08', 'v2026.08.1', '2026.08.x', '', null, undefined, '2026.08.1.2']) {
    assert.throws(
      () => compararVersao(ruim, '2026.08.1'),
      /vers[ãa]o/i,
      `${JSON.stringify(ruim)} tinha de ser recusada`
    );
  }
});

test('versão publicada ilegível também recusa — não se publica às cegas', () => {
  assert.throws(() => versaoAvanca('2026.08.14', 'lixo'), /vers[ãa]o/i);
});
