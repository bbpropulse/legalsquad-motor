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

test('andaime vazado para a entrega BLOQUEIA', () => {
  // O sinal mais fraco dos três — blacklist vaza —, e por isso é o último. Mas o
  // vazamento de template é defeito real e barato de pegar.
  const comAndaime = PECA_DENSA.replace('## Conclusão', '## Conclusão\n\n(tese 2) Agente: redator');

  const r = avaliarRedacao({ artefato: comAndaime, entrada: ENTRADA, contratos: [CONTRATO] });

  assert.equal(r.ok, false);
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
