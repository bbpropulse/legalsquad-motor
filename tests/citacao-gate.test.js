import test from 'node:test';
import assert from 'node:assert/strict';
import { extrairCitacoes, classificarCitacoes } from '../src/citacao-gate.js';

test('extrai lei com artigo, súmula e acórdão', () => {
  const texto = [
    'O prazo é de 5 dias (LC 64/90, art. 3º).',
    'Nesse sentido, a Súmula 49 do TSE.',
    'Ver o REspe nº 6373.',
  ].join('\n');

  const tipos = extrairCitacoes(texto).map((c) => c.tipo).sort();
  assert.deepEqual(tipos, ['acordao', 'lei', 'sumula']);
});

test('captura o artigo citado, não só a lei', () => {
  const [citacao] = extrairCitacoes('conforme a LC 64/90, art. 3º, caput');
  assert.equal(citacao.tipo, 'lei');
  assert.equal(citacao.artigo, '3');
});

test('trecho já marcado [NÃO VERIFICADO] não vira pendência nova', () => {
  // Quem declarou a incerteza cumpriu o contrato. Re-listar isso afogaria o
  // relatório em ruído e esconderia as citações que se apresentam como certas
  // — que são exatamente as perigosas.
  const texto = 'Ac. nº 8249 no REspe nº 6373 [NÃO VERIFICADO]';
  assert.deepEqual(extrairCitacoes(texto), []);
});

test('súmula resolve contra o acervo quando o enunciado está lá', () => {
  const acervo = [{ path: 'jurisprudencia/tse/sumula-49.md', tema: 'Súmula TSE 49 — registro de candidatura' }];
  const [r] = classificarCitacoes(extrairCitacoes('Súmula 49 do TSE'), { acervo });
  assert.equal(r.status, 'VERIFICADA');
  assert.equal(r.fonte, 'jurisprudencia/tse/sumula-49.md');
});

test('acórdão que o acervo não conhece é NAO_ENCONTRADA — nunca silêncio', () => {
  const [r] = classificarCitacoes(extrairCitacoes('Ac. nº 8249 no REspe nº 6373'), { acervo: [] });
  assert.equal(r.status, 'NAO_ENCONTRADA');
});

test('LEI não é resolvida contra o acervo: exige a fonte online declarada', () => {
  // A legislação passou a ser consultada online no Planalto, no ato. O gate
  // não pode carimbar VERIFICADA por ausência de contraprova local — teria de
  // ter aberto a lei, e não abriu.
  const [semFonte] = classificarCitacoes(extrairCitacoes('LC 64/90, art. 3º'), { acervo: [] });
  assert.equal(semFonte.status, 'FONTE_NAO_DECLARADA');

  const comFonte = classificarCitacoes(extrairCitacoes('LC 64/90, art. 3º'), {
    acervo: [],
    fontesAbertas: ['https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp64.htm'],
  })[0];
  assert.equal(comFonte.status, 'VERIFICADA');
});

test('"não sei ler" nunca se apresenta como "não existe"', () => {
  // Princípio do projeto, e aqui ele é literal: acervo ausente é ACERVO_AUSENTE,
  // não NAO_ENCONTRADA. Um relatório dizendo "não existe" porque o índice não
  // carregou faria o autor remover citação boa.
  const [r] = classificarCitacoes(extrairCitacoes('Súmula 49 do TSE'), { acervo: null });
  assert.equal(r.status, 'ACERVO_AUSENTE');
});

test('mesmo número, classe diferente, NÃO é a mesma decisão', () => {
  // Falso positivo real, medido contra o acervo de 64.459 documentos:
  // "REspe nº 6373" do TSE (1986) casou com um "RO 6373" do TST (2011) — outro
  // tribunal, outra classe, outra matéria — e saiu VERIFICADA. Carimbar
  // citação inventada como conferida é pior que não ter gate: dá confiança
  // onde não há.
  const acervo = [{
    path: 'jurisprudencia/direito-do-trabalho/tst/tst-ro-6373-15-2011-mandado-de-seguranca.md',
    tema: 'TST RO 6373-15.2011 — mandado de segurança',
  }];
  const [r] = classificarCitacoes(extrairCitacoes('Ac. nº 8249 no REspe nº 6373, de 3.10.86'), { acervo });
  assert.equal(r.status, 'NAO_ENCONTRADA');
});

test('mesmo número E mesma classe resolve', () => {
  const acervo = [{
    path: 'jurisprudencia/direito-eleitoral/tse/tse-agr-respei-n-060020820-registro.md',
    tema: 'AgR-REspEI 060020820 — registro de candidatura',
  }];
  const [r] = classificarCitacoes(extrairCitacoes('AgR-REspEI nº 060020820'), { acervo });
  assert.equal(r.status, 'VERIFICADA');
});

test('resumo separa o que passou do que bloqueia', () => {
  const citacoes = extrairCitacoes('Súmula 49 do TSE. E o REspe nº 999888.');
  const resultados = classificarCitacoes(citacoes, {
    acervo: [{ path: 'j/sumula-49.md', tema: 'Súmula TSE 49' }],
  });
  assert.equal(resultados.filter((r) => r.status === 'VERIFICADA').length, 1);
  assert.equal(resultados.filter((r) => r.status !== 'VERIFICADA').length, 1);
});
