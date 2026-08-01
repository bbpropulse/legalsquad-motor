import test from 'node:test';
import assert from 'node:assert/strict';
import { termosDoTema, selecionarDispositivos, montarBaseLegal } from '../src/base-legal.js';

const CORPUS = [
  {
    sigla: 'RES23607', url: 'https://tse/res',
    numero: '39',
    texto: 'Art. 39. Para efetuar pagamento de gastos de pequeno vulto, o órgão partidário e a candidata ou o candidato podem constituir reserva em dinheiro (Fundo de Caixa), desde que observem o saldo máximo de 2%.',
  },
  {
    sigla: 'RES23607', url: 'https://tse/res',
    numero: '50',
    texto: 'Art. 50. Constituem sobras de campanha: I - a diferença positiva entre os recursos financeiros arrecadados e os gastos financeiros realizados em campanha.',
  },
  {
    sigla: 'RES23607', url: 'https://tse/res',
    numero: '1',
    texto: 'Art. 1º Esta Resolução dispõe sobre a arrecadação e os gastos de recursos por partidos políticos e candidatos.',
  },
];

test('extrai termos materiais do tema e descarta palavra vazia', () => {
  const termos = termosDoTema('Destinação de sobras de campanha');
  assert.ok(termos.includes('sobras'));
  assert.ok(termos.includes('campanha'));
  assert.ok(!termos.includes('de'), 'preposição não é termo material');
});

test('seleciona o dispositivo cujo texto casa os termos do tema', () => {
  const achados = selecionarDispositivos('Destinação de sobras de campanha', CORPUS);
  assert.equal(achados[0].numero, '50');
});

test('termo RARO vale mais que dois termos comuns', () => {
  // Medido no corpus real: `contabilizacao-de-fundo-partidario` casou com
  // "Revogam-se os arts. 92, 246, 250…" porque bateu duas palavras frequentes.
  // Tratar todo termo como igual faz palavra de uso geral ("campanha",
  // "eleitoral", "partido") decidir a seleção, e o artigo escolhido não tem
  // relação com o tema. Raridade é o que discrimina.
  const corpus = [
    { sigla: 'X', url: 'u', numero: '1', texto: 'Art. 1º Dos gastos eleitorais de campanha em geral.' },
    { sigla: 'X', url: 'u', numero: '2', texto: 'Art. 2º Dos gastos eleitorais de campanha e do impulsionamento de conteúdo.' },
    { sigla: 'X', url: 'u', numero: '3', texto: 'Art. 3º Dos gastos eleitorais de campanha e das convenções.' },
    { sigla: 'X', url: 'u', numero: '4', texto: 'Art. 4º Dos gastos eleitorais de campanha e da propaganda.' },
  ];
  const achados = selecionarDispositivos('Gastos com impulsionamento de campanha', corpus);
  assert.equal(achados.length, 1, 'só o que casa o termo raro');
  assert.equal(achados[0].numero, '2');
});

test('termos DISPERSOS num artigo-lista não contam como o mesmo artigo sendo sobre o tema', () => {
  // Bug real, medido no corpus: "contabilizacao-de-fundo-partidario" trouxe 6
  // artigos — entre eles um de revogação genérica ("Revogam-se os arts. 92,
  // 246…") e outro de prazo de registro de candidatura. Cada um batia os
  // mesmos 2 termos ("fundo", "partidario"), mas ESPALHADOS: um dispositivo
  // que enumera 15 assuntos revogados menciona "fundo" perto do início e
  // "partido" perto do fim, sem relação temática entre os dois — é lista, não
  // sentença sobre o tema. Contar presença no artigo inteiro não distingue
  // isso de um artigo curto onde os termos aparecem juntos porque o
  // dispositivo é, de fato, sobre aquilo.
  const distante = 'x '.repeat(200); // separador maior que a janela de proximidade nos dois sentidos
  const corpus = [
    {
      sigla: 'X', url: 'u', numero: '20',
      texto: 'Art. 20. A contabilizacao do fundo partidario segue regras próprias.',
    },
    {
      // Os TRÊS mesmos termos aparecem — a contagem bruta empata com o art.
      // 20 — mas espalhados por uma lista de revogação, sem os três juntos
      // em nenhum ponto do texto.
      sigla: 'X', url: 'u', numero: '107',
      texto: `Art. 107. Revogam-se: o art. sobre contabilizacao geral, ${distante} o art. sobre o fundo eleitoral, ${distante} o art. sobre registro de partidario, e outras trinta disposições diversas.`,
    },
  ];
  const achados = selecionarDispositivos('Contabilização de fundo partidário', corpus);
  assert.equal(achados.length, 1, `deveria excluir o artigo-lista, veio: ${achados.map((a) => a.numero)}`);
  assert.equal(achados[0].numero, '20');
});

test('empate DEMAIS no topo é recusado — 6 candidatos arbitrários não são melhor que zero', () => {
  // Medido no corpus real: "contabilizacao-de-fundo-partidario" continuou
  // trazendo 6 artigos mesmo com a janela de proximidade, porque "Fundo
  // Partidário" é expressão genuinamente comum na Lei 9.504 — os termos
  // aparecem juntos de verdade, só que em muitos artigos diferentes, sobre
  // aspectos distintos (revogação incidental, registro, requisitos de uso).
  // Cortar nos 6 primeiros pela ORDEM DO CORPUS não é seleção — é sorteio. Se
  // o empate no topo é maior que o teto de candidatos, o termo do tema é raso
  // demais para discriminar, e a resposta honesta é recusar.
  const corpus = Array.from({ length: 10 }, (_, i) => ({
    sigla: 'X', url: 'u', numero: String(i),
    texto: `Art. ${i}. Trata do fundo partidario em seu aspecto ${i}, item específico.`,
  }));
  assert.deepEqual(selecionarDispositivos('Contabilização de fundo partidário', corpus), []);
});

test('casamento FRACO não devolve nada — artigo errado transcrito é pior que lacuna', () => {
  // O risco desta automação inteira: um artigo genérico ("Esta Resolução dispõe
  // sobre...") casa qualquer tema por acidente e seria transcrito com toda a
  // autoridade de fonte oficial. A skill pareceria fundamentada e apontaria
  // para o dispositivo errado — dano maior que a casca vazia, que ao menos se
  // declara vazia.
  assert.deepEqual(selecionarDispositivos('Impedimento de magistrado eleitoral', CORPUS), []);
});

test('exige mais de um termo casado — um só é coincidência', () => {
  // "campanha" sozinho aparece em quase todo artigo da resolução.
  const achados = selecionarDispositivos('Campanha', CORPUS);
  assert.deepEqual(achados, []);
});

test('a base legal montada traz TRANSCRIÇÃO LITERAL e a URL da fonte', () => {
  const bloco = montarBaseLegal('Fundo de caixa de campanha', CORPUS);
  assert.match(bloco, /Art\. 39/);
  assert.match(bloco, /reserva em dinheiro \(Fundo de Caixa\)/, 'texto literal, não paráfrase');
  assert.match(bloco, /https:\/\/tse\/res/);
});

test('sem dispositivo relevante, devolve string vazia — nunca um bloco inventado', () => {
  assert.equal(montarBaseLegal('Impedimento de magistrado eleitoral', CORPUS), '');
});

test('URLs de outras normas do MESMO corpus entram nas fontes, mesmo sem artigo selecionado delas', () => {
  // Achado real: a Res. 23.607 cita "Lei nº 9.504/1997, art. 26" dentro do
  // próprio texto do art. 35. A Lei 9.504 estava carregada no corpus — eu
  // genuinamente tenho o texto dela — só não entrava nas fontes porque o
  // artigo SELECIONADO para aquela skill veio da resolução, não da lei. O
  // gate então bloqueava uma remissão cuja fonte eu de fato possuía.
  const corpus = [
    { sigla: 'RES', url: 'https://tse/res', numero: '35', texto: 'Art. 35. Gastos eleitorais (Lei nº 9.504/1997, art. 26).' },
    // Este artigo NÃO bate nos termos do tema — se a URL dele entrar nas
    // fontes, tem de ser porque foi CITADO no texto acima, não porque
    // `selecionarDispositivos` o escolheu por conta própria.
    { sigla: 'L9504', url: 'https://planalto/l9504', numero: '26', texto: 'Art. 26. Assunto totalmente diverso, sem relação com o tema buscado.' },
  ];
  const bloco = montarBaseLegal('Gastos eleitorais', corpus);
  assert.match(bloco, /https:\/\/planalto\/l9504/, 'a URL da lei citada por remissão deveria constar');
  // E o artigo 26 em si não teria sido selecionado organicamente — confirma
  // que a URL só entrou pela remissão textual, não pela busca temática.
  assert.deepEqual(selecionarDispositivos('Gastos eleitorais', [corpus[1]]), []);
});

test('remissão do próprio compilador oficial (Vide ADI/ADIN) vem marcada [NÃO VERIFICADO]', () => {
  // Achado rodando o gate no lote real: o Código Eleitoral compilado no
  // Planalto anota "(Vide ADIN 5970)" junto de dispositivos com ação direta
  // pendente — é nota OFICIAL, não invenção. Mas transcrever essa remissão
  // sem marcação faz o gate bloquear (a ADI não está no acervo local) mesmo
  // a transcrição sendo fiel — e sem a marcação, a skill AFIRMA a remissão
  // como se a tivesse conferido, quando só copiou o texto. A transcrição
  // continua literal; só a remissão jurisprudencial interna ganha o aviso.
  const corpus = [{
    sigla: 'CE', url: 'https://planalto/ce',
    numero: '39',
    texto: 'Art. 39. A propaganda partidária independe de licença. (Vide ADIN 5970)',
  }];
  const bloco = montarBaseLegal('Propaganda partidária independente', corpus);
  assert.match(bloco, /ADIN 5970/, 'a remissão em si continua transcrita');
  assert.match(bloco, /\(Vide ADIN 5970\) \[NÃO VERIFICADO\]/);
});

test('remissão a Lei/Redação dentro do texto NÃO ganha a marca — é a própria fonte já declarada', () => {
  // "(Redação dada pela Lei nº 12.034, de 2009)" não é uma citação a
  // verificar à parte: é o histórico do PRÓPRIO dispositivo que já está
  // sendo transcrito da fonte declarada. Marcar isso [NÃO VERIFICADO] seria
  // ruído — a fonte da alteração é a mesma norma já aberta.
  const corpus = [{
    sigla: 'L9504', url: 'https://planalto/l9504',
    numero: '30',
    texto: 'Art. 30. Texto do dispositivo. (Redação dada pela Lei nº 12.034, de 2009)',
  }];
  const bloco = montarBaseLegal('Texto do dispositivo', corpus);
  assert.ok(!bloco.includes('[NÃO VERIFICADO]'), 'redação/histórico da própria norma não é remissão externa');
});

test('o bloco declara que é ponto de partida, não conclusão', () => {
  // A automação seleciona por casamento de termos; ela não sabe se o
  // dispositivo resolve a questão. Apresentar como base legal fechada
  // convidaria o agente a parar de pesquisar exatamente onde deveria começar.
  const bloco = montarBaseLegal('Fundo de caixa de campanha', CORPUS);
  assert.match(bloco, /conferir|ponto de partida|não exaustiv/i);
});
