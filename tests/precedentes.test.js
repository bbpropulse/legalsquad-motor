import test from 'node:test';
import assert from 'node:assert/strict';
import { extrairPrecedente, montarPrecedentes } from '../src/precedentes.js';

const STJ_ESTRUTURADO = `---
tribunal: "STJ"
processo: "REsp 1.860.018-RJ"
relator: "Mauro Campbell Marques"
orgao_julgador: "Primeira Seção"
data_julgamento: "23/06/2021"
fonte_url: "https://processo.stj.jus.br/x"
confianca: DISCOVERY_ONLY
---

# Inscrição em dívida ativa

## Conteúdo do informativo

PROCESSO REsp 1.860.018-RJ, Rel. Min. Mauro Campbell Marques, Primeira Seção, julgado em 23/06/2021, DJe 28/06/2021. (Tema 1064)

RAMO DO DIREITO DIREITO ADMINISTRATIVO, DIREITO PREVIDENCIÁRIO

TEMA Inscrição em dívida ativa. Benefício previdenciário indevidamente recebido.

## Proveniência
- Observação: resumo de informativo; não substitui a conferência do acórdão oficial.
`;

const STF_CORRIDO = `---
tribunal: "STF"
processo: "MS 25962"
relator: "Marco Aurélio"
orgao_julgador: "Plenário"
data_julgamento: "1.4.2013"
fonte_url: "https://stf/x"
confianca: DISCOVERY_ONLY
---

# Mandado de segurança: CNJ e participação da União

## Conteúdo do informativo

Mandado de segurança: CNJ e participação da União A União pode intervir em mandado de segurança no qual o ato apontado como coator for do Conselho Nacional de Justiça - CNJ.

## Proveniência
`;

test('extrai identificação completa do precedente do frontmatter', () => {
  const p = extrairPrecedente(STJ_ESTRUTURADO);
  assert.equal(p.tribunal, 'STJ');
  assert.equal(p.processo, 'REsp 1.860.018-RJ');
  assert.equal(p.relator, 'Mauro Campbell Marques');
  assert.equal(p.orgao, 'Primeira Seção');
  assert.equal(p.data, '23/06/2021');
});

test('do informativo ESTRUTURADO do STJ, extrai o campo TEMA como tese', () => {
  const p = extrairPrecedente(STJ_ESTRUTURADO);
  assert.match(p.tese, /Inscrição em dívida ativa/);
  assert.ok(!p.tese.includes('RAMO DO DIREITO'), 'não deve vazar o rótulo do campo seguinte');
  assert.ok(!p.tese.includes('PROCESSO'), 'não deve incluir o cabeçalho de processo');
});

test('do informativo em TEXTO CORRIDO, usa o título como tese', () => {
  const p = extrairPrecedente(STF_CORRIDO);
  assert.match(p.tese, /CNJ e participação da União/);
});

test('documento sem processo identificável é RECUSADO', () => {
  // Sem número de processo não há o que conferir no acórdão oficial — citar
  // "há precedente do STJ sobre isso" sem identificá-lo é pior que não citar.
  assert.equal(extrairPrecedente('---\ntribunal: "STJ"\n---\n\n# Título\n'), null);
});

test('o bloco montado traz número, relator, órgão e data de cada precedente', () => {
  const bloco = montarPrecedentes([extrairPrecedente(STJ_ESTRUTURADO)]);
  assert.match(bloco, /REsp 1\.860\.018-RJ/);
  assert.match(bloco, /Mauro Campbell Marques/);
  assert.match(bloco, /Primeira Seção/);
  assert.match(bloco, /23\/06\/2021/);
});

test('o bloco AVISA que informativo não substitui o acórdão — e marca NÃO VERIFICADO', () => {
  // O próprio acervo declara isso em todo arquivo, e a confiança é
  // DISCOVERY_ONLY em 100% do corpus. Apresentar tese de informativo como
  // se fosse holding conferida do acórdão é exatamente o erro que o gate de
  // citação existe para impedir — aqui a ressalva tem de vir no texto.
  const bloco = montarPrecedentes([extrairPrecedente(STJ_ESTRUTURADO)]);
  assert.match(bloco, /não substitui/i);
  assert.match(bloco, /\[NÃO VERIFICADO\]/);
});

test('lista vazia devolve string vazia — nunca um bloco com título e nada dentro', () => {
  assert.equal(montarPrecedentes([]), '');
  assert.equal(montarPrecedentes([null, null]), '');
});
