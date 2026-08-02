import test from 'node:test';
import assert from 'node:assert/strict';
import { fatiarSumulaVinculante } from '../src/sumula-vinculante-parse.js';

// Formato real da página individual do STF, já em texto puro (após
// htmlParaTexto): título, enunciado, "Precedente Representativo" e opcional
// "Teses de Repercussão Geral". Uma série numérica PRÓPRIA, distinta da
// súmula ordinária — SV 10 não é a Súmula 10.
const PAGINA = [
  'Aplicação das Súmulas no STF',
  '',
  'Súmula Vinculante 10',
  '',
  'Viola a cláusula de reserva de plenário (CF, artigo 97) a decisão de órgão',
  'fracionário de tribunal que, embora não declare expressamente a',
  'inconstitucionalidade de lei ou ato normativo do Poder Público, afasta sua',
  'incidência, no todo ou em parte.',
  '',
  'Precedente Representativo',
  '',
  'Discute-se no recurso extraordinário se o acórdão recorrido violou a reserva',
  'de plenário [...]',
  '',
  '[RE 482.090, voto do rel. min. Joaquim Barbosa, P, j. 18-6-2008, DJE 48 de 13-3-2009.]',
  '',
  'Teses de Repercussão Geral',
  '',
  '● É nula a decisão de órgão fracionário que se recusa a aplicar o art. 94,',
  'II, da Lei 9.472/1997, sem observar a cláusula de reserva de Plenário.',
].join('\n');

test('extrai número e enunciado da página individual', () => {
  const sv = fatiarSumulaVinculante(PAGINA, { numeroPorPosicao: 10 });
  assert.equal(sv.numero, '10');
  assert.match(sv.enunciado, /Viola a cláusula de reserva de plenário/);
  assert.match(sv.enunciado, /afasta sua\nincidência, no todo ou em parte\./);
  assert.ok(!sv.enunciado.includes('Precedente Representativo'), 'não vaza para a seção seguinte');
});

test('separa o precedente representativo do enunciado', () => {
  const sv = fatiarSumulaVinculante(PAGINA, { numeroPorPosicao: 10 });
  assert.match(sv.precedente, /RE 482\.090/);
  assert.ok(!sv.precedente.includes('Teses de Repercussão Geral'), 'não vaza para a seção seguinte');
});

test('captura as teses de repercussão geral quando existem', () => {
  const sv = fatiarSumulaVinculante(PAGINA, { numeroPorPosicao: 10 });
  assert.match(sv.teses, /Lei 9\.472\/1997/);
});

test('teses ausentes vira string vazia, não quebra a súmula', () => {
  const semTeses = PAGINA.split('\nTeses de Repercussão Geral')[0];
  const sv = fatiarSumulaVinculante(semTeses, { numeroPorPosicao: 10 });
  assert.equal(sv.teses, '');
  assert.match(sv.precedente, /RE 482\.090/, 'o precedente segue intacto sem a seção seguinte');
});

test('súmula cancelada é marcada — e o enunciado é preservado, não descartado', () => {
  // SV 9 foi cancelada, mas o enunciado histórico continua sendo informação:
  // descartá-lo faria o gate tratar toda citação à SV9 como inexistente, em
  // vez de "existe e está cancelada" — a mesma distinção fail-closed que o
  // projeto já aplica a "não encontrado" vs "não tenho acervo".
  const pagina = [
    'Súmula Vinculante 9 (cance​lada)',
    '',
    'O disposto no artigo 127 da Lei 7.210/1984 foi recebido pela ordem',
    'constitucional vigente, e não se lhe aplica o limite temporal do art. 58.',
    '',
    'Precedente Representativo',
    '',
    '[texto do precedente]',
  ].join('\n');
  const sv = fatiarSumulaVinculante(pagina, { numeroPorPosicao: 9 });
  assert.equal(sv.numero, '9');
  assert.equal(sv.cancelada, true);
  assert.match(sv.enunciado, /Lei 7\.210\/1984/);
});

test('número vem da posição no índice, não do título — a numeração da fonte pode ter zero-width chars', () => {
  // O título real inclui caracteres invisíveis (viu-se um zero-width space,
  // U+200B, dentro de "cancelada") e o link de origem usa um ID interno
  // sequencial do sistema do STF, que
  // NÃO é o número da súmula. O número confiável é a posição no índice
  // ordenado — por isso o parser recebe o número, não o adivinha do título.
  const sv = fatiarSumulaVinculante(PAGINA, { numeroPorPosicao: 10 });
  assert.equal(typeof sv.numero, 'string');
  assert.equal(sv.numero, '10');
});

test('página sem enunciado é ERRO nomeado, não silêncio', () => {
  assert.throws(
    () => fatiarSumulaVinculante('Súmula Vinculante 5\n\nPrecedente Representativo\n\n[x]', { numeroPorPosicao: 5 }),
    /Súmula Vinculante 5.*sem enunciado/i
  );
});
