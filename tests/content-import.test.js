import { test } from 'node:test';
import assert from 'node:assert/strict';
import { converterRegistro } from '../src/content-import.js';

// Conversão de um export externo para o formato de conteúdo do motor.
//
// O ponto inteiro deste módulo é NÃO INVENTAR. Um export de biblioteca traz
// slug, título, resumo, tags e corpo — tudo que descreve o QUE a skill faz. Não
// traz `risk_level` nem `delivery_type`, que são justamente os campos de que os
// gates fail-closed dependem: risco define quanta evidência a promoção exige, e
// delivery_type define se a skill mexe no mundo externo.
//
// Preencher esses dois por heurística sobre texto livre seria fabricar a
// metadata que existe para impedir que uma skill errada entre numa peça. O
// conversor recusa; quem decide é o curador, uma vez por lote.

const REGISTRO = {
  slug: 'notificacao-extrajudicial-estrategica',
  title: 'Notificação extrajudicial estratégica',
  summary: 'Estrutura notificação extrajudicial com prazo, efeitos e prova de recebimento.',
  area: 'advocacia-extrajudicial',
  content_type: 'skill',
  version: '1.0.0',
  tags: ['notificação', 'inadimplemento', 'acordo'],
  instructions_markdown: '# Papel\n\nAtue na notificação extrajudicial.\n',
};

const DEFAULTS = { origem: 'lote advocacia-extrajudicial' };

test('sem risk_level e delivery_type, OMITE — para o motor classificar', () => {
  // Correção de um erro medido em produção. A versão anterior deste módulo EXIGIA
  // os dois campos, "para não inventar". Só que o motor já os deriva por regra
  // (`skill-contract.js`): perfil → delivery_type 1:1, e risco por função +
  // vocabulário crítico (prazo, prescrição, cálculo, liminar, protocolo…).
  //
  // Pior: `skill-contract.js:135` faz a DECLARAÇÃO EXPLÍCITA VENCER a inferência.
  // Exigir um default de lote não evitava a invenção — obrigava a ela, e a
  // invenção SUPRIMIA a classificação do motor. Medido em 4521 skills reais: com
  // `r3` carimbado, 1489 que o motor classificaria como `r4` ficaram `r3` — barra
  // de promoção de 12 casos e 2 revisores humanos rebaixada para 8 e 1, em um
  // terço do acervo, justamente nas skills de redigir, calcular e agir.
  //
  // Omitir é mais seguro que qualquer default: quem não sabe não atrapalha quem sabe.
  const { conteudo } = converterRegistro(REGISTRO, {});

  assert.doesNotMatch(conteudo, /risk_level:/, 'omitido — o motor classifica por função');
  assert.doesNotMatch(conteudo, /delivery_type:/, 'omitido — o motor deriva do perfil');
});

test('valor declarado pelo curador é respeitado e marcado como herdado', () => {
  // O override continua existindo para quem SABE — só deixou de ser obrigatório.
  const { conteudo } = converterRegistro(REGISTRO, { ...DEFAULTS, risk_level: 'r4' });

  assert.match(conteudo, /risk_level: "r4"/);
  assert.match(conteudo, /herdad|default de lote|não curad/i, 'a origem do valor fica visível');
});

test('mapeia o que tem origem no registro', () => {
  const { path, conteudo } = converterRegistro(REGISTRO, DEFAULTS);

  assert.equal(path, 'skills/notificacao-extrajudicial-estrategica/SKILL.md');
  assert.match(conteudo, /^---\n/, 'sai com frontmatter');
  assert.match(conteudo, /name: notificacao-extrajudicial-estrategica/);
  assert.match(conteudo, /Estrutura notificação extrajudicial/, 'o resumo vira descrição');
  assert.match(conteudo, /categories: \[notificação, inadimplemento, acordo\]/, 'tags viram categorias');
  assert.match(conteudo, /# Papel/, 'o corpo original é preservado');
});

test('a conversão nunca produz skill promovida', () => {
  // A evidência comportamental é local e não existe numa importação. Sair como
  // `verified` seria o motor mentindo na dimensão em que ele acabou de parar.
  const { conteudo } = converterRegistro({ ...REGISTRO, quality_status: 'certified' }, DEFAULTS);

  assert.doesNotMatch(conteudo, /quality_status: "(verified|certified)"/);
  assert.match(conteudo, /quality_status: "contracted"/);
});

test('não declara quality_profile — deixa a regra do motor classificar', () => {
  // `classifySkillQualityProfile` deriva o perfil da função da skill (id +
  // categorias) e a declaração explícita tem precedência. Declarar aqui seria
  // sobrepor a regra do motor com um palpite do importador.
  const { conteudo } = converterRegistro(REGISTRO, DEFAULTS);

  assert.doesNotMatch(conteudo, /quality_profile:/);
});

test('registro sem corpo é recusado', () => {
  assert.throws(
    () => converterRegistro({ ...REGISTRO, instructions_markdown: '   ' }, DEFAULTS),
    /corpo|vazi/i
  );
});
