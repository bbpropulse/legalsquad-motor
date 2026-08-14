import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avaliarRedacao, extrairAncoras, extrairExigenciasDeSaida } from '../src/redacao-gate.js';

// Redação Gate — o irmão determinístico do Citation Gate.
//
// O Citation Gate bloqueia citação pendente. Não bloqueia peça RASA: um esqueleto
// bem formatado, sem os fatos do caso, passa por ele inteiro. `skills:` no
// squad.yaml é declaração e o `check-squad` agora confere que a skill EXISTE —
// mas existir não é ter sido lida nem aplicada.
//
// Três sinais, em ordem de força. O primeiro é o único que mede profundidade;
// os outros dois medem forma.

const CONTRATO = `# Contrato operacional

## Entradas mínimas
- pergunta decisória, polo e fase

## Contrato de saída

- status: ready, partial ou blocked
- conclusão calibrada com nível de confiança
- premissas, fontes, evidências favoráveis e contrárias
- alternativas priorizadas, riscos e próxima ação

## Hard stops
- objetivo indefinido
`;

const ENTRADA = `Processo 0801234-56.2025.8.19.0001. Notificante ACME LTDA, notificado BETA COMERCIO.
Contrato firmado em 12/03/2024, valor de R$ 48.500,00. Inadimplemento desde 05/2025.`;

const PECA_DENSA = `# Notificação extrajudicial

status: ready

ACME LTDA notifica BETA COMERCIO quanto ao contrato de 12/03/2024, no valor de
R$ 48.500,00, cujo inadimplemento perdura desde 05/2025 nos autos 0801234-56.2025.8.19.0001.

## Premissas e fontes
Considerada a mora desde 05/2025, com as evidências documentais anexas.

## Conclusão
Há fundamento para a constituição em mora.

## Alternativas e riscos
Acordo direto, protesto ou execução; riscos de cada via avaliados.
`;

const PECA_GENERICA = `# Notificação extrajudicial

status: ready

A notificação extrajudicial é o instrumento pelo qual o credor constitui o devedor em mora.
Deve conter a identificação das partes, o objeto e o prazo.

## Premissas e fontes
As premissas usuais aplicam-se ao caso.

## Conclusão
Há fundamento para a notificação.

## Alternativas e riscos
As alternativas usuais devem ser consideradas.
`;

test('as âncoras do caso são identificadores, não vocabulário jurídico', () => {
  // Número de processo, data, valor, parte em caixa alta. Palavra comum de
  // petição não serve: ela aparece em qualquer peça e não distingue caso nenhum.
  const ancoras = extrairAncoras(ENTRADA);

  assert.ok(ancoras.includes('0801234-56.2025.8.19.0001'), `faltou o número do processo: ${ancoras}`);
  assert.ok(ancoras.includes('12/03/2024'), 'faltou a data');
  assert.ok(ancoras.some((a) => a.includes('48.500')), 'faltou o valor');
  assert.ok(ancoras.includes('ACME'), 'faltou a parte em caixa alta');
  assert.equal(ancoras.includes('contrato'), false, 'vocabulário comum não é âncora');
});

test('peça soldada ao caso passa; peça genérica é BLOQUEADA', () => {
  // O sinal que mede o que o advogado observou. Peça rasa é genérica por
  // construção: serve para qualquer caso, e por isso não cita âncora nenhuma.
  const densa = avaliarRedacao({ artefato: PECA_DENSA, entrada: ENTRADA, contratos: [CONTRATO] });
  const generica = avaliarRedacao({ artefato: PECA_GENERICA, entrada: ENTRADA, contratos: [CONTRATO] });

  assert.equal(densa.ok, true, `a densa não podia falhar: ${JSON.stringify(densa.problemas)}`);
  assert.equal(generica.ok, false);
  assert.ok(
    generica.problemas.some((p) => /ancorag/i.test(p)),
    `o motivo precisa ser a ancoragem — recebido: ${JSON.stringify(generica.problemas)}`
  );
});

test('entrada sem âncoras vira NÃO AVALIADO — não passa em silêncio', () => {
  // Mesma regra da best-practice ausente no runner: o que não dá para verificar é
  // declarado não avaliado, nunca aprovado por omissão. Aprovar em silêncio seria
  // o gate mentindo exatamente onde ele deveria calar.
  const r = avaliarRedacao({ artefato: PECA_GENERICA, entrada: 'sem identificadores aqui', contratos: [CONTRATO] });

  assert.equal(r.sinais.ancoragem, 'nao-avaliado');
  assert.ok(r.problemas.some((p) => /não avaliad/i.test(p)), 'a impossibilidade precisa aparecer no veredito');
});

test('as exigências de saída saem do contrato da skill, não de lista fixa', () => {
  // Derivado da skill: o núcleo não sabe o que é uma petição, sabe ler o
  // "Contrato de saída" que o contrato v5 declara.
  const exigencias = extrairExigenciasDeSaida(CONTRATO);

  assert.deepEqual(exigencias.sort(), ['alternativas', 'conclusão', 'premissas', 'status'].sort());
});

test('elemento do Contrato de saída ausente BLOQUEIA, nomeando qual', () => {
  const semConclusao = PECA_DENSA.replace(/## Conclusão\n[^#]*/, '');

  const r = avaliarRedacao({ artefato: semConclusao, entrada: ENTRADA, contratos: [CONTRATO] });

  assert.equal(r.ok, false);
  assert.ok(r.problemas.some((p) => /conclus/i.test(p)), `esperava apontar "conclusão": ${JSON.stringify(r.problemas)}`);
});

test('andaime vazado BLOQUEIA mesmo sendo o ÚNICO sinal reprovado', () => {
  // A peça é boa em tudo menos nisto: ancorada, coberta e sem vícios. Se o
  // andaime só corroborasse — como um comentário antigo deste módulo afirmava,
  // divergindo do código —, `{{variavel}}` e `[INSERIR]` sairiam para protocolo
  // toda vez que os outros três aprovassem, que é justamente o caso comum.
  const comAndaime = PECA_DENSA.replace('## Conclusão', '## Conclusão\n\n(tese 2) Agente: redator');

  const r = avaliarRedacao({ artefato: comAndaime, entrada: ENTRADA, contratos: [CONTRATO] });

  assert.equal(r.sinais.andaime, 'reprovado');
  assert.deepEqual(
    Object.entries(r.sinais).filter(([, v]) => v === 'reprovado').map(([k]) => k),
    ['andaime'],
    'o caso precisa isolar o andaime — se outro sinal também reprovar, o teste não prova nada'
  );
  assert.equal(r.ok, false, 'um único sinal reprovado basta para o gate fechar');
  assert.ok(r.problemas.some((p) => /andaime|template/i.test(p)));
});

test('sem contrato de skill, a cobertura é NÃO AVALIADA e a ancoragem continua valendo', () => {
  // Área não instalada ou skill sem contrato v5 não pode desligar o gate inteiro:
  // desliga só a dimensão que depende dela. É a mesma degradação por dimensão que
  // o runner aplica na best-practice de redação.
  const r = avaliarRedacao({ artefato: PECA_GENERICA, entrada: ENTRADA, contratos: [] });

  assert.equal(r.sinais.cobertura, 'nao-avaliado');
  assert.equal(r.ok, false, 'a ancoragem sozinha ainda reprova a peça genérica');
});

// ---------------------------------------------------------------------------
// 4º sinal — vícios de redação (marcas de texto gerado por IA em peça)
// ---------------------------------------------------------------------------
//
// Par mecânico da best-practice `redacao-sem-marcas-de-ia`. Mede DENSIDADE, não
// presença: "outrossim" uma vez é conectivo; seis vezes é enchimento. O guia
// julga caso a caso; aqui só entra o que dá para contar sem interpretar.

const PECA_LIMPA = `
A ré cobrou R$ 2.480,00 por serviço cancelado em 12/03/2026 (protocolo 88.412).
Manteve a cobrança após três reclamações registradas. O ônus se inverte porque o
registro das chamadas está sob controle exclusivo da ré (CDC, art. 6º, VIII).
Requer-se a devolução em dobro do valor cobrado, na forma do art. 42.
`;

const PECA_VICIADA = `
É cediço que o consumidor é a parte hipossuficiente. Outrossim, resta cristalino
que a conduta foi absolutamente descabida. Destarte, não há dúvidas de que o dano
restou configurado. Ademais, é notório que a jurisprudência é robusta.
Diante do exposto, requer a procedência, por ser medida de mais lídima justiça.
`;

test('peça ancorada e sem enchimento passa no sinal de vícios', () => {
  const r = avaliarRedacao({ artefato: PECA_LIMPA, entrada: PECA_LIMPA, contratos: [] });
  assert.equal(r.sinais.vicios, 'aprovado');
});

test('acúmulo de asserção-sem-prova e conectivo em cadeia reprova', () => {
  const r = avaliarRedacao({ artefato: PECA_VICIADA, entrada: PECA_VICIADA, contratos: [] });
  assert.equal(r.sinais.vicios, 'reprovado');
  const problema = r.problemas.find((p) => /v[íi]cios/i.test(p));
  assert.match(problema, /assercao-sem-prova|conectivo-em-cadeia/);
});

test('uma ocorrência isolada NÃO reprova — é densidade, não presença', () => {
  // "Outrossim" uma vez é conectivo legítimo. Reprovar aqui ensinaria a evitar
  // a palavra em vez de evitar o enchimento, e o gate viraria superstição.
  const texto = `${PECA_LIMPA}\nOutrossim, requer a produção de prova pericial.`;
  const r = avaliarRedacao({ artefato: texto, entrada: texto, contratos: [] });
  assert.equal(r.sinais.vicios, 'aprovado');
});

test('vício DENTRO de citação não conta — transcrever fielmente não é vício do autor', () => {
  // O caso que decide se o gate é confiável: a peça que transcreve uma ementa
  // corretamente não pode ser reprovada pelo estilo de quem redigiu a ementa.
  // Sem isto, o gate empurraria o redator a adulterar a fonte para passar.
  const texto = `${PECA_LIMPA}
> É cediço que resta cristalino. Outrossim, destarte, ademais, não há dúvidas de
> que é notório, por ser medida de mais lídima justiça. Destarte. Outrossim.
`;
  const r = avaliarRedacao({ artefato: texto, entrada: texto, contratos: [] });
  assert.equal(r.sinais.vicios, 'aprovado', 'citação é fonte, não redação do autor');
});

test('sem lista de vícios o sinal é NÃO AVALIADO — nunca aprovação por omissão', () => {
  const r = avaliarRedacao({ artefato: PECA_VICIADA, entrada: PECA_VICIADA, contratos: [], vicios: [] });
  assert.equal(r.sinais.vicios, 'nao-avaliado');
  assert.ok(r.problemas.some((p) => /v[íi]cios N[ÃA]O AVALIADO/i.test(p)));
});

test('a lista de vícios é parametrizável — outro idioma traz a sua', () => {
  const texto = 'Isto contém wibble e wibble e wibble e wibble e wibble.';
  const r = avaliarRedacao({
    artefato: texto,
    entrada: texto,
    contratos: [],
    vicios: [{ id: 'wibble', regex: /wibble/gi, rotulo: 'wibble repetido' }],
  });
  assert.equal(r.sinais.vicios, 'reprovado');
});
