import test from 'node:test';
import assert from 'node:assert/strict';
import { extrairCitacoes, classificarCitacoes } from '../src/citacao-gate.js';

test('número de acórdão com sufixo de UF não é truncado no hífen', () => {
  // Falha real, medida em 182 skills: `MS 17.526-DF` era extraído como
  // `MS 17.526-` (o hífen entrava no número e o "DF" ficava de fora), e
  // depois `17526` não casava com o path do acervo, que grava `ms-17-526-df`.
  // O processo EXISTIA — o gate reportava NAO_ENCONTRADA para citação boa,
  // que é o modo de falha mais caro: leva a remover fundamentação correta.
  const [c] = extrairCitacoes('Ver o MS 17.526-DF, Rel. Manoel Erhardt.');
  assert.equal(c.tipo, 'acordao');
  assert.equal(c.numero, '17526');
  assert.equal(c.uf, 'DF');
});

test('acórdão com UF resolve contra o acervo que grava a UF no path', () => {
  const acervo = [{
    path: 'jurisprudencia/direito-administrativo/stj/stj-0008E-ms-17-526-df-anistia-politica.md',
    tema: 'MS 17.526-DF — anistia política',
  }];
  const [r] = classificarCitacoes(extrairCitacoes('MS 17.526-DF'), { acervo });
  assert.equal(r.status, 'VERIFICADA');
});

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

test('nota editorial DENTRO do texto transcrito não é citação do autor', () => {
  // Falso positivo real: o Planalto insere "(Vide ADIN 6096)" DENTRO do texto
  // do art. 103 da Lei 8.213. Uma skill que transcreve o dispositivo
  // fielmente carrega essa nota junto — e o gate a tratava como se o autor
  // estivesse citando a ADI. Reprovar transcrição fiel é o pior resultado
  // possível: ensina a truncar a fonte para passar no gate.
  const texto = '> Art. 103. O prazo é de 10 anos. (Redação dada pela Lei nº 13.846, de 2019) (Vide ADIN 6096)';
  const acordaos = extrairCitacoes(texto).filter((c) => c.tipo === 'acordao');
  assert.deepEqual(acordaos, []);
});

test('acórdão com fonte oficial declarada resolve, como já ocorria com a lei', () => {
  // O gate aceitava fonte declarada só para legislação. Mas precedente aberto
  // no portal oficial do tribunal tem a mesma qualidade de verificação — e
  // exigir que ele ALÉM disso esteja no acervo local de informativos rejeita
  // tese de repercussão geral legítima, que é justamente a mais citável.
  const r = classificarCitacoes(extrairCitacoes('Tema 414/STF, RE 638.483 RG.'), {
    acervo: [],
    fontesAbertas: ['https://portal.stf.jus.br/jurisprudencia/sumariosumulas.asp?base=30&sumula=1604'],
  });
  assert.equal(r[0].status, 'VERIFICADA');
});

test('lei lida do ACERVO LOCAL conta como fonte aberta', () => {
  // O acervo de legislação foi coletado do Planalto e cada arquivo guarda a
  // `fonte_url` de origem. Ler o artigo de lá é MAIS verificável que abrir
  // online — é reproduzível. Exigir a URL http quando o autor declarou o
  // caminho local reprova quem seguiu a instrução de usar o acervo, que é
  // exatamente o comportamento que o projeto quer incentivar.
  const r = classificarCitacoes(extrairCitacoes('CPC, art. 1.009 e art. 203.'), {
    acervo: [],
    fontesAbertas: ['acervo/legislacao/CPC/cpc-art-1009.md'],
  });
  assert.ok(r.every((c) => c.status === 'VERIFICADA'), 'caminho do acervo de legislação vale como fonte');
});

test('caminho que NÃO é do acervo de legislação continua não bastando', () => {
  const [r] = classificarCitacoes(extrairCitacoes('CPC, art. 1.009'), {
    acervo: [],
    fontesAbertas: ['notas-pessoais/rascunho.md'],
  });
  assert.equal(r.status, 'FONTE_NAO_DECLARADA');
});

test('"CESSAÇÃO" não é o Código Eleitoral: a sigla exige fronteira à direita', () => {
  // Falso positivo real, medido em 6.276 skills: o título "CESSAÇÃO – ALCANCE
  // DO ARTIGO 11" era extraído como "CE, art. 11" porque a sigla `CE` casava
  // dentro de CESSAÇÃO e o `[^\n.;]{0,20}?` engolia o resto até "ARTIGO 11".
  // A skill era reprovada por citar uma lei que ela não cita.
  //
  // Reprovar por citação inexistente é o erro mais caro do gate: ensina a
  // mutilar o texto até passar.
  assert.deepEqual(extrairCitacoes('CESSAÇÃO – ALCANCE DO ARTIGO 11'), []);
  assert.deepEqual(extrairCitacoes('CCB art. 186'), [], 'sigla dentro de outra sigla também não vale');
});

test('"lei" como substantivo comum não é citação de lei', () => {
  // Outro falso positivo real: "...previsto em lei. Inteligência do art. 96"
  // virava "Lei ., art. 96". A palavra "lei" só nomeia diploma quando vem
  // seguida de número.
  assert.deepEqual(extrairCitacoes('previsto em lei. Inteligência do art. 96'), []);
});

test('a sigla de código continua valendo sem número, e a lei com número também', () => {
  // A guarda não pode custar o caso normal.
  assert.equal(extrairCitacoes('CPC, art. 300')[0]?.artigo, '300');
  assert.equal(extrairCitacoes('CF art. 5º')[0]?.artigo, '5');
  assert.equal(extrairCitacoes('Lei nº 9.504/1997, art. 41')[0]?.numeroLei, '9.504/1997');
  assert.equal(extrairCitacoes('LEI Nº 9.868/99 (ART. 7')[0]?.artigo, '7');
});
