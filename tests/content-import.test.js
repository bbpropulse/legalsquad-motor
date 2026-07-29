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

const DEFAULTS = { risk_level: 'r3', delivery_type: 'advisory', origem: 'lote advocacia-extrajudicial, revisado por curador' };

test('sem defaults declarados, a conversão RECUSA e nomeia os campos', () => {
  // O teste que sustenta o módulo. Se ele passar a converter sem defaults, o
  // importador vira uma máquina de fabricar metadata de segurança plausível.
  assert.throws(
    () => converterRegistro(REGISTRO, {}),
    /risk_level.*delivery_type|delivery_type.*risk_level/s,
    'a mensagem precisa nomear EXATAMENTE os campos que ele se recusa a adivinhar'
  );
});

test('com defaults declarados, mapeia o que tem origem e marca o que foi herdado', () => {
  const { path, conteudo } = converterRegistro(REGISTRO, DEFAULTS);

  assert.equal(path, 'skills/notificacao-extrajudicial-estrategica/SKILL.md');
  assert.match(conteudo, /^---\n/, 'sai com frontmatter');
  assert.match(conteudo, /name: notificacao-extrajudicial-estrategica/);
  assert.match(conteudo, /Estrutura notificação extrajudicial/, 'o resumo vira descrição');
  assert.match(conteudo, /categories: \[notificação, inadimplemento, acordo\]/, 'tags viram categorias');
  assert.match(conteudo, /# Papel/, 'o corpo original é preservado');
  assert.match(conteudo, /risk_level: "r3"/);
  assert.match(conteudo, /delivery_type: "advisory"/);

  // Proveniência: quem ler o arquivo tem de saber que estes dois vieram de um
  // default de lote, não de análise da skill. Sem isso, um campo herdado fica
  // indistinguível de um campo curado.
  assert.match(
    conteudo,
    /herdad|default de lote|não curad/i,
    'o arquivo precisa dizer que risk_level e delivery_type vieram de default'
  );
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
