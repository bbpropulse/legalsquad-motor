import test from 'node:test';
import assert from 'node:assert/strict';
import { htmlParaTexto, fatiarArtigos } from '../src/legislacao-parse.js';

test('decodifica latin-1 — o Planalto serve ISO-8859-1 e utf-8 corromperia todo acento', () => {
  const latin1 = Buffer.from('<p>Art. 1º A República é instituída.</p>', 'latin1');
  assert.match(htmlParaTexto(latin1), /A República é instituída\./);
});

test('decodifica utf-8 quando a fonte é utf-8', () => {
  const utf8 = Buffer.from('<p>Art. 1º A cidadania é fundamento.</p>', 'utf8');
  assert.match(htmlParaTexto(utf8), /A cidadania é fundamento\./);
});

test('remove script e style — senão o corpo do JS entra como texto de lei', () => {
  const html = Buffer.from(
    '<style>p{color:red}</style><script>var Art="fake"</script><p>Art. 2º Texto real.</p>',
    'utf8'
  );
  const texto = htmlParaTexto(html);
  assert.ok(!texto.includes('color:red'));
  assert.ok(!texto.includes('var Art'));
  assert.match(texto, /Texto real\./);
});

test('quebra linha na ABERTURA de bloco, não só no fechamento', () => {
  // Medido na Lei 14.133/2021: a página do Planalto abre <p> e nunca fecha.
  // Quebrando só em </p>, a lei inteira virava 17 linhas e o coletor gravaria
  // 17 artigos de 194 — fail-open clássico: parecia sucesso.
  const html = Buffer.from(
    '<p>Art. 1º Primeiro.<p>Art. 2º Segundo.<p>Art. 3º Terceiro.',
    'utf8'
  );
  assert.deepEqual(fatiarArtigos(htmlParaTexto(html)).map((a) => a.numero), ['1', '2', '3']);
});

test('"Art." órfão do próprio número, na linha seguinte, ainda abre artigo', () => {
  // Forma dominante na Lei 14.133: o HTML exportado do Word separa "Art." do
  // número. Eram 194 "Art." soltos — exatamente os 194 artigos da lei — e
  // nenhum reconhecido. O coletor gravaria 17 de 194 sem sinal de erro.
  const html = Buffer.from('<p>Art.<br>1º Primeiro.<p>Art.<br>2º Segundo.', 'utf8');
  assert.deepEqual(fatiarArtigos(htmlParaTexto(html)).map((a) => a.numero), ['1', '2']);
});

test('CRLF não impede o casamento do artigo', () => {
  const html = Buffer.from('<div>Art. 1º Um.\r\n</div><div>Art. 2º Dois.\r\n</div>', 'utf8');
  assert.deepEqual(fatiarArtigos(htmlParaTexto(html)).map((a) => a.numero), ['1', '2']);
});

test('"Art.1.048." — sem espaço e com milhar — é o artigo 1048', () => {
  // Forma real encontrada na Lei 14.133. Lida como "artigo 1", o gate
  // resolveria a citação contra o dispositivo errado.
  const artigos = fatiarArtigos('Art.1.048. Revogam-se.\nArt. 2º Outro.');
  assert.equal(artigos[0].numero, '1048');
});

test('fatia por artigo e leva junto incisos e parágrafos até o artigo seguinte', () => {
  const texto = [
    'Art. 5º Todos são iguais.',
    'I - primeiro inciso;',
    'II - segundo inciso;',
    '§ 1º Parágrafo do art. 5º.',
    'Art. 6º São direitos sociais.',
  ].join('\n');

  const artigos = fatiarArtigos(texto);
  assert.equal(artigos.length, 2);
  assert.equal(artigos[0].numero, '5');
  assert.match(artigos[0].texto, /primeiro inciso/);
  assert.match(artigos[0].texto, /Parágrafo do art\. 5º/);
  assert.ok(!artigos[0].texto.includes('direitos sociais'), 'não pode vazar para o próximo artigo');
  assert.equal(artigos[1].numero, '6');
});

test('"Art. 30-A." com ponto após a letra também é entrada própria', () => {
  // Medido no acervo real: o art. 30-A da Lei 9.504/1997 — representação por
  // captação ou gasto ilícito, um dos dispositivos mais citados da matéria
  // eleitoral — virava "art. 30" e ficava indistinguível de uma redação
  // revogada do 30. Quem buscasse 30-A não acharia, e quem abrisse o "30"
  // leria outro dispositivo achando que era aquele.
  const artigos = fatiarArtigos('Art. 30. Prazo.\nArt. 30-A. Representação por gasto ilícito.');
  assert.deepEqual(artigos.map((a) => a.numero), ['30', '30-A']);
  assert.match(artigos[1].texto, /gasto ilícito/);
});

test('artigo com letra (5º-A) é entrada PRÓPRIA, não uma segunda ocorrência do 5º', () => {
  // Confundir 5º-A com 5º faria o gate validar uma citação contra o texto errado
  // — pior que não validar, porque devolve VERIFICADA com o conteúdo de outro
  // dispositivo.
  const texto = 'Art. 5º Caput original.\nArt. 5º-A Dispositivo acrescido.\nArt. 6º Outro.';
  const artigos = fatiarArtigos(texto);
  const numeros = artigos.map((a) => a.numero);
  assert.deepEqual(numeros, ['5', '5-A', '6']);
  assert.match(artigos[1].texto, /Dispositivo acrescido/);
});

test('artigo repetido preserva TODAS as ocorrências — redação revogada é informação', () => {
  // O texto compilado do Planalto traz a redação antiga riscada junto da nova.
  // Descartar uma delas esconderia do verificador que houve alteração.
  const texto = [
    'Art. 6º Redação original.',
    'Art. 7º Intercalado.',
    'Art. 6º Redação dada pela Emenda.',
  ].join('\n');
  const artigos = fatiarArtigos(texto);
  const seis = artigos.filter((a) => a.numero === '6');
  assert.equal(seis.length, 2);
  assert.match(seis[0].texto, /Redação original/);
  assert.match(seis[1].texto, /Redação dada pela Emenda/);
});

test('texto sem nenhum artigo devolve lista vazia, não erro', () => {
  assert.deepEqual(fatiarArtigos('Página de erro do servidor.'), []);
});

test('"art." em minúscula no meio da frase NÃO abre artigo novo', () => {
  const texto = 'Art. 10. Observado o disposto no art. 5º desta Lei.\nArt. 11. Seguinte.';
  const artigos = fatiarArtigos(texto);
  assert.deepEqual(artigos.map((a) => a.numero), ['10', '11']);
  assert.match(artigos[0].texto, /no art\. 5º desta Lei/);
});

test('a ÚLTIMA ocorrência do artigo é a vigente — a primeira é redação revogada', () => {
  // Achado em campo, custoso: o texto compilado do Planalto lista as redações
  // em ordem cronológica, então a PRIMEIRA ocorrência de um artigo alterado é
  // a redação ORIGINAL, já revogada. Medido na Lei 9.099: o art. 61 original
  // dizia "pena máxima não superior a um ano, excetuados os casos em que a lei
  // preveja procedimento especial"; a vigente (Lei 11.313/2006) diz "não
  // superior a 2 (dois) anos" e derrubou a ressalva — o que INVERTE quais
  // crimes eleitorais são de menor potencial ofensivo.
  //
  // Quem gravasse a primeira ocorrência com o nome canônico entregaria a
  // regra revogada como se fosse a lei vigente.
  const artigos = fatiarArtigos([
    'Art. 61. Pena máxima não superior a um ano, excetuados procedimento especial.',
    'Art. 61. Pena máxima não superior a 2 (dois) anos. (Redação dada pela Lei nº 11.313, de 2006)',
  ].join('\n'));

  assert.equal(artigos.length, 2, 'as duas redações são preservadas');
  assert.match(artigos.at(-1).texto, /2 \(dois\) anos/, 'a última é a vigente');
  assert.match(artigos[0].texto, /um ano/, 'a primeira é a revogada');
});

test('"Art. 248 - O cancelamento" — travessão + inicial de frase NÃO é sufixo de artigo', () => {
  // Bug real, achado por um subagente ao enriquecer skill de registros
  // públicos: a Lei 6.015 usa "Art. 248 - O cancelamento efetuar-se-á..." e o
  // parser lia o "O" como sufixo, gravando `l6015-art-248-o.md`. O artigo
  // canônico 248 deixava de existir — e como são os arts. 248-259 que regem o
  // cancelamento de registro, a skill inteira ficava sem seus dispositivos
  // centrais.
  //
  // A distinção é o que vem DEPOIS da letra: em "5º-A Dispositivo", a letra é
  // seguida de espaço e outra palavra maiúscula do dispositivo; em "248 - O
  // cancelamento", a letra é seguida de palavra minúscula — é artigo definido
  // iniciando a frase, não sufixo.
  const artigos = fatiarArtigos([
    'Art. 248 - O cancelamento efetuar-se-á a requerimento do interessado.',
    'Art. 251-A. Dispositivo autônomo incluído pela Lei 14.382/2022.',
  ].join('\n'));

  assert.equal(artigos[0].numero, '248', 'o "O" de "O cancelamento" não é sufixo');
  assert.equal(artigos[1].numero, '251-A', 'mas o -A de 251-A é sufixo de verdade');
});

test('ADCT é corpo SEPARADO — seu art. 5º não é "redação vigente" do art. 5º da CF', () => {
  // Bug que a correção "última ocorrência = vigente" INTRODUZIU: a página da
  // Constituição traz o ADCT no fim, então o art. 5º do ADCT (disposições
  // transitórias, 1988) virava o nome canônico e o art. 5º real — com os
  // direitos fundamentais e o inciso XXIV — ia para o sufixado.
  //
  // Isso é pior que perder o artigo: o gate validaria a citação contra o
  // texto errado e devolveria VERIFICADA para afirmação materialmente falsa.
  // A heurística cronológica só vale DENTRO do mesmo corpo normativo.
  const artigos = fatiarArtigos([
    'Art. 5º Todos são iguais perante a lei.',
    'XXIV - a lei estabelecerá o procedimento para desapropriação;',
    'ATO DAS DISPOSIÇÕES CONSTITUCIONAIS TRANSITÓRIAS',
    'Art. 5º Não se aplicará às eleições previstas para 15 de novembro de 1988.',
  ].join('\n'));

  const doCorpo = artigos.filter((a) => a.numero === '5' && a.corpo !== 'ADCT');
  assert.equal(doCorpo.length, 1, 'só um art. 5º pertence ao corpo permanente');
  assert.match(doCorpo[0].texto, /iguais perante a lei/);
  assert.equal(artigos.at(-1).corpo, 'ADCT', 'o do ADCT é marcado como outro corpo');
});

test('"Art. 200," com vírgula é REMISSÃO no meio da frase, não abertura', () => {
  // Bug real, achado por subagente ao enriquecer skill de totalização eleitoral:
  // o § 6º do art. 179 do Código Eleitoral termina com "...no prazo previsto no
  // Art. 200, quando terá vista do relatório da Comissão Apuradora". A quebra de
  // linha do HTML jogou "Art. 200," para o início de uma linha, e o parser abriu
  // artigo ali — gravando o FIM do art. 179 sob o nome do art. 200.
  //
  // Pior que perder o artigo: quem citasse o art. 200 leria os parágrafos de
  // outro dispositivo, e o gate carimbaria VERIFICADA.
  //
  // A distinção é a vírgula: a redação legislativa brasileira abre com
  // "Art. 200." ou "Art. 200º", nunca com "Art. 200, texto".
  const artigos = fatiarArtigos([
    'Art. 179. Caput do artigo.',
    '§ 6º O prazo é o previsto no',
    'Art. 200, quando terá vista do relatório.',
    'Art. 201. Dispositivo seguinte.',
  ].join('\n'));

  assert.deepEqual(artigos.map((a) => a.numero), ['179', '201'], 'a remissão não abre artigo');
  assert.match(artigos[0].texto, /vista do relatório/, 'o texto fica no artigo a que pertence');
});

test('número partido entre linhas ("Art. 5" + "7.") é o artigo 57, não o 5º', () => {
  // Bug real, medido na LGPD: o art. 57 é "(VETADO)" e o HTML quebrou o número
  // no meio — "Art. 5" numa linha, "7." na seguinte. O parser leu artigo 5, e
  // como a ÚLTIMA ocorrência é que leva o nome canônico, `l13709-art-5.md`
  // passou a conter o fragmento do 57 em vez das definições do art. 5º — o
  // dispositivo mais citado da lei, incluindo o conceito de dado sensível.
  const html = Buffer.from('<p>Art. 5º Para os fins desta Lei.<p>Art. 5<p>7.<p>(VETADO).', 'utf8');
  const artigos = fatiarArtigos(htmlParaTexto(html));

  assert.deepEqual(artigos.map((a) => a.numero), ['5', '57']);
  assert.match(artigos[0].texto, /Para os fins desta Lei/, 'o art. 5º mantém o próprio texto');
  assert.match(artigos[1].texto, /VETADO/);
});

test('"Art ." com espaço antes do ponto ainda abre artigo', () => {
  // Medido na Lei 6.437/1977 — a lei das infrações sanitárias, base de seis
  // skills de defesa em auto de infração. A página do Planalto escreve
  // "Art . 1º - As infrações..." com espaço entre "Art" e o ponto, e às vezes
  // quebra a linha ali. Das ~60 aberturas, o parser reconhecia 4.
  //
  // O guard de aberturas-não-reconhecidas pegou e recusou gravar — fail-closed
  // funcionando —, mas o efeito prático era a lei inteira ficar fora do acervo,
  // e "não baixado" convida a escrever de memória.
  const html = Buffer.from(
    '<p>Art . 1º - As infrações à legislação sanitária.<p>Art<br>. 2º - As infrações são punidas.<p>Art. 3º - Normal.',
    'utf8'
  );
  assert.deepEqual(fatiarArtigos(htmlParaTexto(html)).map((a) => a.numero), ['1', '2', '3']);
});
