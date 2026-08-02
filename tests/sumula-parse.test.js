import test from 'node:test';
import assert from 'node:assert/strict';
import { fatiarSumulas } from '../src/sumula-parse.js';

// Bloco no formato exato da compilação oficial: cabeçalho de seção sozinho na
// linha, conteúdo abaixo.
const DUAS = [
  'Súmula 1',
  '',
  'DIREITO PROCESSUAL CIVIL - COMPETÊNCIA',
  '',
  'Enunciado',
  'O FORO DO DOMICILIO OU DA RESIDENCIA DO ALIMENTANDO E O',
  'COMPETENTE PARA A AÇÃO DE INVESTIGAÇÃO DE PATERNIDADE.',
  '',
  'Órgão Julgador',
  'SEGUNDA SEÇÃO',
  '',
  'Data da Decisão',
  '25/04/1990',
  '',
  'Fonte',
  'DJ DATA:02/05/1990 PG:03619',
  '',
  'Referências Legislativas',
  'LEG:FED LEI:005869 ANO:1973',
  '',
  'Excerto dos Precedentes Originários',
  '"PREVALENCIA DO FORO ESPECIAL DA AÇÃO DE ALIMENTOS."',
  '',
  'Súmula 2',
  '',
  'DIREITO CIVIL - ALIENAÇÃO FIDUCIÁRIA',
  '',
  'Enunciado',
  'NÃO CABE AÇÃO DE BUSCA E APREENSÃO.',
  '',
  'Órgão Julgador',
  'SEGUNDA SEÇÃO',
  '',
  'Data da Decisão',
  '11/04/1990',
  '',
  'Fonte',
  'DJ DATA:18/04/1990',
].join('\n');

test('fatia por súmula e não vaza o enunciado de uma para a outra', () => {
  const sumulas = fatiarSumulas(DUAS);
  assert.equal(sumulas.length, 2);
  assert.equal(sumulas[0].numero, '1');
  assert.match(sumulas[0].enunciado, /INVESTIGAÇÃO DE PATERNIDADE/);
  assert.ok(!sumulas[0].enunciado.includes('BUSCA E APREENSÃO'), 'não vaza para a próxima');
  assert.equal(sumulas[1].numero, '2');
});

test('o enunciado é transcrito LITERALMENTE, maiúsculas e tudo', () => {
  // As súmulas antigas do STJ estão em caixa alta e sem acento na fonte
  // oficial. "Corrigir" a grafia seria reescrever o enunciado — e enunciado
  // reescrito não é mais transcrição, é paráfrase apresentada como fonte.
  const [s] = fatiarSumulas(DUAS);
  assert.equal(
    s.enunciado,
    'O FORO DO DOMICILIO OU DA RESIDENCIA DO ALIMENTANDO E O\nCOMPETENTE PARA A AÇÃO DE INVESTIGAÇÃO DE PATERNIDADE.'
  );
});

test('separa os campos estruturais do enunciado', () => {
  const [s] = fatiarSumulas(DUAS);
  assert.equal(s.assunto, 'DIREITO PROCESSUAL CIVIL - COMPETÊNCIA');
  assert.equal(s.orgao, 'SEGUNDA SEÇÃO');
  assert.equal(s.data, '25/04/1990');
  assert.match(s.fonte, /DJ DATA:02\/05\/1990/);
  assert.match(s.referencias, /LEI:005869/);
  assert.match(s.precedentes, /FORO ESPECIAL/);
});

test('campos ausentes viram string vazia, não quebram a súmula', () => {
  // 34 das 649 não têm precedentes e 60 não têm referências legislativas.
  // Descartar a súmula por causa disso perderia o enunciado, que é o que
  // realmente se cita.
  const [, s] = fatiarSumulas(DUAS);
  assert.equal(s.precedentes, '');
  assert.equal(s.referencias, '');
  assert.match(s.enunciado, /BUSCA E APREENSÃO/);
});

test('súmula sem enunciado é ERRO nomeado, não silêncio', () => {
  // Enunciado é a única parte que se cita. Uma entrada sem ele no acervo faria
  // o gate resolver a citação contra um arquivo que não prova nada — pior que
  // não ter a súmula.
  // Nada antes do primeiro cabeçalho de campo e nenhum cabeçalho "Enunciado":
  // não há enunciado em nenhum dos dois layouts.
  assert.throws(
    () => fatiarSumulas('Súmula 7\n\nÓrgão Julgador\nCORTE ESPECIAL'),
    /Súmula 7.*sem enunciado/i
  );
  // Com o cabeçalho presente mas vazio, também não há.
  assert.throws(
    () => fatiarSumulas('Súmula 8\n\nDIREITO CIVIL\n\nEnunciado\n\nÓrgão Julgador\nCORTE ESPECIAL'),
    /Súmula 8.*sem enunciado/i
  );
});

test('texto sem nenhuma súmula devolve lista vazia', () => {
  assert.deepEqual(fatiarSumulas('Página de erro do servidor.'), []);
});

test('"Súmula 7" citada DENTRO do texto não abre entrada nova', () => {
  // O excerto de precedentes cita outras súmulas o tempo todo. Abrir entrada
  // ali partiria a súmula ao meio e criaria uma duplicata sem enunciado.
  const texto = [
    'Súmula 1',
    '',
    'DIREITO CIVIL',
    '',
    'Enunciado',
    'TEXTO DA PRIMEIRA.',
    '',
    'Excerto dos Precedentes Originários',
    'Aplica-se aqui a Súmula 7 desta Corte, conforme precedente.',
  ].join('\n');
  const sumulas = fatiarSumulas(texto);
  assert.equal(sumulas.length, 1);
  assert.match(sumulas[0].precedentes, /Súmula 7 desta Corte/);
});

test('layout do STF: sem cabeçalho "Enunciado", o texto antes do primeiro campo É o enunciado', () => {
  // A compilação do STJ põe a taxonomia do tribunal antes do cabeçalho
  // "Enunciado"; a do STF não tem esse cabeçalho e põe o enunciado ali mesmo.
  // Tratar as duas como "assunto" faria o STF entrar no acervo com o
  // enunciado vazio — e enunciado é a única parte que se cita.
  const stf = [
    '                    SÚMULA 347',
    'O Tribunal de Contas, no exercício de suas atribuições, pode apreciar a',
    'constitucionalidade das leis e dos atos do poder público.',
    '',
    'Data de Aprovação',
    'Sessão Plenária de 13/12/1963',
    '',
    'Referência Legislativa',
    'Constituição Federal de 1946, art. 77.',
  ].join('\n');

  const [s] = fatiarSumulas(stf);
  assert.equal(s.numero, '347');
  assert.match(s.enunciado, /pode apreciar a\nconstitucionalidade/);
  assert.equal(s.assunto, '', 'não há taxonomia neste layout');
  assert.match(s.data, /13\/12\/1963/);
});

test('linha de sumário ("SÚMULA 1    13   SÚMULA 32    29") não abre entrada', () => {
  // O PDF do STF abre com um índice de duas colunas. Cada linha traz vários
  // "SÚMULA <n>" seguidos do número da página — abrir entrada ali criaria
  // centenas de súmulas vazias e quebraria a numeração.
  assert.deepEqual(fatiarSumulas('SÚMULA 1    13   SÚMULA 32    29   SÚMULA 63   44'), []);
});
