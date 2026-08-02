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

test('súmula só resolve contra documento que É da súmula, não contra qualquer arquivo com o número', () => {
  // Falso positivo grave, medido contra o acervo de 67.708 documentos: a
  // citação "Súmula 7 do STJ" casava com um informativo administrativo
  // qualquer cujo path continha "7" e "stj", e saía VERIFICADA apontando para
  // documento que não enuncia súmula nenhuma. "Súmula 347 do STF" resolvia
  // contra `...-347-sp-re-e-perda-do-objeto...` — um acórdão com 347 no
  // número do processo — mesmo com o acervo não tendo aquele enunciado.
  //
  // É o pior resultado que este gate pode dar: confiança onde não há. Pior que
  // NAO_ENCONTRADA, porque NAO_ENCONTRADA manda conferir e VERIFICADA não.
  const acervo = [
    { path: 'jurisprudencia/direito-administrativo/stj/stj-0007-disciplinar-suspeicao.md', tema: 'STJ 0007 — suspeição em disciplinar' },
    { path: 'jurisprudencia/direito-constitucional/stf/stf-0134-347-sp-re-e-perda-do-objeto.md', tema: 'AR 347-SP — perda do objeto' },
  ];
  assert.equal(classificarCitacoes(extrairCitacoes('Súmula 7 do STJ'), { acervo })[0].status, 'NAO_ENCONTRADA');
  assert.equal(classificarCitacoes(extrairCitacoes('Súmula 347 do STF'), { acervo })[0].status, 'NAO_ENCONTRADA');
});

test('súmula resolve quando o acervo tem o documento da própria súmula', () => {
  const acervo = [
    { path: 'sumulas/STJ/stj-sumula-7.md', tema: 'Súmula 7 do STJ — DIREITO PROCESSUAL CIVIL - DOS RECURSOS' },
    { path: 'jurisprudencia/direito-administrativo/stj/stj-0007-disciplinar-suspeicao.md', tema: 'STJ 0007 — suspeição' },
  ];
  const [r] = classificarCitacoes(extrairCitacoes('Súmula 7 do STJ'), { acervo });
  assert.equal(r.status, 'VERIFICADA');
  assert.equal(r.fonte, 'sumulas/STJ/stj-sumula-7.md', 'e aponta para o documento da súmula, não para o vizinho');
});

test('a súmula do tribunal ERRADO não resolve', () => {
  // Súmula 7 do STJ e Súmula 7 do TST são enunciados diferentes. Casar por
  // número entregaria o texto de um tribunal como se fosse do outro.
  const acervo = [{ path: 'sumulas/TST/tst-sumula-7.md', tema: 'Súmula 7 do TST — férias' }];
  assert.equal(classificarCitacoes(extrairCitacoes('Súmula 7 do STJ'), { acervo })[0].status, 'NAO_ENCONTRADA');
});

test('citação dentro da seção de fontes/lacunas não é fundamentação — é declaração', () => {
  // Falso positivo real: cinco skills escritas por subagentes foram reprovadas
  // por "Súmula 347/STF" — numa linha que diz, literalmente, "busquei por
  // texto e por número no acervo e NÃO encontrei". O contrato manda o autor
  // nomear o que não conseguiu abrir; o gate lia a lacuna declarada como
  // afirmação apoiada nela.
  //
  // Reprovar quem nomeia a própria lacuna é o pior incentivo possível: ensina
  // a silenciar o que falta para passar no gate.
  const texto = [
    '## O que decide a questão',
    'Aplica-se a Súmula 7 do STJ ao caso.',
    '',
    '## Fontes abertas nesta redação',
    '- **Súmula 347/STF e Súmula Vinculante 3.** Busquei por texto e por número no acervo;',
    '  não há documento que enuncie nenhuma das duas. Não transcritas, não parafraseadas.',
  ].join('\n');

  const citacoes = extrairCitacoes(texto);
  assert.equal(citacoes.length, 1, 'só a do corpo conta');
  assert.equal(citacoes[0].numero, '7');
});

test('a seção de fontes continua alimentando as fontes abertas, só não gera pendência', () => {
  // A URL declarada ali é o que LIBERA a citação de lei do corpo. Se a seção
  // fosse ignorada por inteiro, o gate passaria a reprovar quem declarou a
  // fonte no lugar certo.
  const texto = [
    '## O que decide a questão',
    'O prazo é o do CPC, art. 1.003.',
    '',
    '## Fontes abertas nesta redação',
    '- `https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13105.htm`',
  ].join('\n');
  const fontes = [...texto.matchAll(/https?:\/\/[^\s`)]+/g)].map((m) => m[0]);
  const [r] = classificarCitacoes(extrairCitacoes(texto), { acervo: [], fontesAbertas: fontes });
  assert.equal(r.status, 'VERIFICADA');
});

test('súmula resolve contra o DOCUMENTO DA SÚMULA, não contra um acórdão que só a menciona', () => {
  // Falso positivo real, medido no acervo de produção: "Súmula Vinculante 10"
  // casava com uma Reclamação cujo TEMA é "... e Ofensa à Súmula Vinculante
  // 10" — um acórdão que discute a violação da súmula, não o enunciado dela.
  // O documento certo (tipo: sumula, em sumulas/STF-VINCULANTE/) vinha
  // DEPOIS no índice e nunca era alcançado, porque `find` pára no primeiro
  // candidato textual.
  //
  // A mesma armadilha se generaliza: qualquer acórdão que cite "Súmula
  // Vinculante N" na ementa vira candidato textual válido, e o mais antigo do
  // índice sempre ganha da fonte certa — não é caso de canto, é sistemático.
  const acervo = [
    {
      path: 'jurisprudencia/direito-constitucional/stf/stf-0585-rcl-8150-...-a47dbf27.md',
      tipo: 'jurisprudencia',
      tema: 'Reclamação: Inconstitucionalidade do Art. 71 e Ofensa à Súmula Vinculante 10',
    },
    // `tema` vem do H1 do arquivo (é assim que `scripts/indexar-acervo.js`
    // preenche o índice de verdade) — "" aqui seria um índice que este
    // projeto nunca produz.
    { path: 'sumulas/STF-VINCULANTE/stf-sv-10.md', tipo: 'sumula', tema: 'Súmula Vinculante 10 do STF' },
  ];
  const [r] = classificarCitacoes(extrairCitacoes('Súmula Vinculante 10'), { acervo });
  assert.equal(r.status, 'VERIFICADA');
  assert.equal(r.fonte, 'sumulas/STF-VINCULANTE/stf-sv-10.md', 'aponta pro documento da súmula, não pro acórdão que a cita');
});

test('sem documento tipo=sumula no acervo, cai para o candidato textual (compatibilidade)', () => {
  // Preserva o comportamento já testado acima ("súmula resolve contra o
  // acervo quando o enunciado está lá"): quando não há candidato "forte"
  // (tipo sumula, ou caminho que denuncia ser a própria súmula), o texto
  // continua bastando — não regride para ACERVO_AUSENTE por excesso de rigor.
  const acervo = [{ path: 'jurisprudencia/tse/sumula-49.md', tema: 'Súmula TSE 49 — registro de candidatura' }];
  const [r] = classificarCitacoes(extrairCitacoes('Súmula 49 do TSE'), { acervo });
  assert.equal(r.status, 'VERIFICADA');
});

test('o nome de arquivo abreviado (sv-N) basta, sem depender do tema vir do H1', () => {
  // `ehDocumentoDaSumula` não pode depender só do `tema` (que vem do H1 do
  // arquivo, via `scripts/indexar-acervo.js`). Se o H1 estiver ausente,
  // truncado, ou o índice for regenerado antes do arquivo terminar de
  // gravar, a súmula fica ACHÁVEL só pelo nome do arquivo — que é o dado
  // mais barato de manter correto, porque nasce do próprio coletor.
  const acervo = [{ path: 'sumulas/STF-VINCULANTE/stf-sv-10.md', tipo: 'sumula', tema: '' }];
  const [r] = classificarCitacoes(extrairCitacoes('Súmula Vinculante 10'), { acervo });
  assert.equal(r.status, 'VERIFICADA');
  assert.equal(r.fonte, 'sumulas/STF-VINCULANTE/stf-sv-10.md');
});

test('processo eleitoral no formato "classe-sequencial/UF" não perde o segundo grupo numérico', () => {
  // Falha real, achada ao gatear skills de ações eleitorais: "REspe
  // 1323-32/GO" e "AgR-REspe 26.276/CE" bloqueavam porque o número capturado
  // parava no primeiro hífen ou não incluía a UF depois da barra — a barra
  // ficava fora do número (correto) mas a UF nunca chegava ao terceiro grupo,
  // porque esse só reconhecia hífen antes da UF, não barra.
  //
  // O formato "1323-32/GO" é comum em numeração de processo eleitoral do TSE
  // (classe-sequencial, sem os pontos de milhar do formato mais recente).
  const [c] = extrairCitacoes('Ver o REspe 1323-32/GO, julgado em sessão.');
  assert.equal(c.numero, '132332', 'os dois grupos numéricos se combinam, como já ocorre com ponto/barra');
  assert.equal(c.uf, 'GO');
});

test('"MS 17.526-DF" continua funcionando depois da mudança acima', () => {
  // Não pode regredir o caso original: aqui o hífen é seguido de LETRA (a
  // UF direto), não de outro grupo numérico.
  const [c] = extrairCitacoes('Ver o MS 17.526-DF, Rel. Manoel Erhardt.');
  assert.equal(c.numero, '17526');
  assert.equal(c.uf, 'DF');
});

test('acervo com o path "1323-32-go" resolve a citação "REspe 1323-32/GO"', () => {
  const acervo = [{
    path: 'jurisprudencia/direito-eleitoral/tse/tse-respe-1323-32-go-aije-gravidade.md',
    tema: 'REspe 1323-32/GO — AIJE, gravidade das circunstâncias',
  }];
  const [r] = classificarCitacoes(extrairCitacoes('REspe 1323-32/GO'), { acervo });
  assert.equal(r.status, 'VERIFICADA');
});

test('classe por extenso no acervo resolve citação em sigla — "REspe" casa com "Recurso Especial Eleitoral"', () => {
  // Achado real ao gatear skills de ações eleitorais: informativos antigos do
  // TSE (Ano06_n31 etc.) gravam a classe por EXTENSO no tema/path, nunca a
  // sigla — "recurso-especial-eleitoral-no-23-100-sp", nunca "respe-23100".
  // Medido: 747 documentos no acervo com classe só por extenso (Recurso
  // Especial Eleitoral, Mandado de Segurança, Habeas Corpus, Agravo
  // Regimental). O número casava (a normalização de hífen entre dígitos já
  // funcionava); a CLASSE que nunca batia, porque "RESPE" não é substring de
  // "recurso especial eleitoral" nem de perto.
  //
  // O mapa sigla↔extenso NÃO mora no núcleo (ver o comentário em
  // `casaClasseNoCampo`, em src/citacao-gate.js) — é vocabulário de
  // nomenclatura processual, então cada teste que precisa dele o declara
  // aqui, como um script de gate real faria.
  const sinonimosClasse = { RESPE: 'recurso especial eleitoral' };
  const acervo = [{
    path: 'jurisprudencia/direito-eleitoral/tse/tse-Ano06_n31-recurso-especial-eleitoral-no-23-100-sp-compulsando-melhor-os-autos-verifica-se-que-nao-houve-impugnacao-forma-200a6349.md',
    tema: 'Recurso Especial Eleitoral no 23.100-SP',
  }];
  const [r] = classificarCitacoes(extrairCitacoes('REspe 23.100/SP'), { acervo, sinonimosClasse });
  assert.equal(r.status, 'VERIFICADA');
});

test('sem "sinonimosClasse" declarado, a classe por extenso NÃO resolve — o núcleo não embute vocabulário de área', () => {
  // O mesmo acervo do teste acima, mas sem passar o mapa: comportamento
  // padrão é reconhecer só a sigla. Prova que o sinônimo é aditivo e vem de
  // fora, não um fallback escondido dentro do módulo.
  const acervo = [{
    path: 'jurisprudencia/direito-eleitoral/tse/tse-Ano06_n31-recurso-especial-eleitoral-no-23-100-sp-...md',
    tema: 'Recurso Especial Eleitoral no 23.100-SP',
  }];
  const [r] = classificarCitacoes(extrairCitacoes('REspe 23.100/SP'), { acervo });
  assert.equal(r.status, 'NAO_ENCONTRADA');
});

test('"MS" casa com "Mandado de Segurança" por extenso, via sinonimosClasse', () => {
  const acervo = [{ path: 'jurisprudencia/tse/algum-arquivo-9988.md', tema: 'Mandado de Segurança nº 9988' }];
  const r = classificarCitacoes(extrairCitacoes('MS 9988'), {
    acervo,
    sinonimosClasse: { MS: 'mandado de seguranca' },
  })[0];
  assert.equal(r.status, 'VERIFICADA');
});

test('classe por extenso não vira porta aberta — outra classe continua rejeitada', () => {
  // "EDcl 9988" (embargos de declaração) citado contra um acervo que só tem
  // "Mandado de Segurança" com o MESMO número não pode resolver: habilitar o
  // sinônimo por extenso de MS não pode abrir a porta para qualquer classe.
  const acervo = [{ path: 'jurisprudencia/tse/algum-arquivo-9988.md', tema: 'Mandado de Segurança nº 9988' }];
  const r = classificarCitacoes(extrairCitacoes('EDcl 9988'), {
    acervo,
    sinonimosClasse: { MS: 'mandado de seguranca', EDCL: 'embargos de declaracao' },
  })[0];
  assert.equal(r.status, 'NAO_ENCONTRADA');
});

test('sinônimo por extenso casa mesmo quando só o PATH carrega a classe, com hífen no lugar do espaço', () => {
  // Achado real, medido no acervo de produção: `REspe 35.980/MG` continuava
  // NAO_ENCONTRADA mesmo com o sinônimo habilitado, porque o `tema` real do
  // índice é "RECURSO ESPECIAL. INVESTIGAÇÃO JUDICIAL ELEITORAL" (não contém
  // "eleitoral" logo após "especial") — só o PATH do arquivo carrega a
  // sequência certa, e como nome de arquivo: "recurso-especial-eleitoral",
  // com HÍFEN separando as palavras, não espaço. O sinônimo comparava contra
  // "recurso especial eleitoral" com espaço e nunca batia no path.
  const acervo = [{
    path: 'jurisprudencia/direito-eleitoral/tse/tse-Ano12_n08-recurso-especial-eleitoral-no-35-980-mg-recurso-especial-investigacao-judicial-eleitoral-0ed7202c.md',
    tema: 'RECURSO ESPECIAL. INVESTIGAÇÃO JUDICIAL ELEITORAL',
  }];
  const [r] = classificarCitacoes(extrairCitacoes('REspe 35.980/MG'), {
    acervo,
    sinonimosClasse: { RESPE: 'recurso especial eleitoral' },
  });
  assert.equal(r.status, 'VERIFICADA');
});
