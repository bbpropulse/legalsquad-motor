import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarTema, medirOriginalidade } from '../src/skill-originality.js';

// Mede quanto de um corpus de skills é conteúdo PRÓPRIO e quanto é o mesmo
// esqueleto com o tema trocado.
//
// A normalização do tema é o que dá honestidade à medida: sem ela, duas
// skills idênticas exceto pelo assunto ("Abuso de poder econômico" ×
// "Abuso de poder político") pareceriam distintas em toda linha que cita o
// próprio nome — e o gerador-de-lote passaria por original.
//
// Frequência de linha, não comparação par a par: O(n) em vez de O(n²), o que
// permite medir 5000 skills sem esperar.

test('normalizarTema troca slug, título e variantes por <TEMA>', () => {
  const texto = [
    '# Prazo da impugnação de registro',
    'Execute prazo-da-impugnacao-de-registro com controle de fontes.',
    'A skill Prazo da impugnação de registro exige memória de cálculo.',
  ].join('\n');

  const normalizado = normalizarTema(texto, {
    id: 'prazo-da-impugnacao-de-registro',
    titulo: 'Prazo da impugnação de registro',
  });

  assert.equal(normalizado.includes('prazo-da-impugnacao-de-registro'), false);
  assert.equal(normalizado.includes('Prazo da impugnação de registro'), false);
  assert.equal((normalizado.match(/<TEMA>/g) || []).length, 3);
});

test('normalizarTema é insensível a caixa e acento — o gerador varia isso', () => {
  const texto = 'Abuso de poder econômico, ABUSO DE PODER ECONOMICO e abuso de poder economico.';
  const normalizado = normalizarTema(texto, {
    id: 'abuso-de-poder-economico',
    titulo: 'Abuso de poder econômico',
  });
  assert.equal((normalizado.match(/<TEMA>/g) || []).length, 3);
});

test('duas skills idênticas exceto pelo tema medem 0% de originalidade', () => {
  const molde = (tema) => [
    '## Missão',
    `Executar ${tema} como capacidade profissional.`,
    '## Regras invioláveis',
    '1. Não presuma competência.',
    '2. Não cite artigo sem abrir a fonte.',
  ].join('\n');

  const relatorio = medirOriginalidade([
    { id: 'tema-alfa', titulo: 'Tema Alfa', texto: molde('Tema Alfa') },
    { id: 'tema-beta', titulo: 'Tema Beta', texto: molde('Tema Beta') },
  ]);

  assert.equal(relatorio.skills.length, 2);
  for (const skill of relatorio.skills) {
    assert.equal(skill.linhasExclusivas, 0, 'nada é exclusivo quando só o tema muda');
    assert.equal(skill.originalidade, 0);
  }
});

test('skill com conteúdo próprio de verdade mede originalidade > 0', () => {
  const comum = ['## Missão', 'Texto igual em todas.'];
  const relatorio = medirOriginalidade([
    {
      id: 'prazo-da-impugnacao',
      titulo: 'Prazo da impugnação',
      texto: [...comum, 'O prazo do art. 3o da LC 64/90 e de cinco dias.'].join('\n'),
    },
    {
      id: 'cancelamento-de-registro',
      titulo: 'Cancelamento de registro',
      texto: [...comum, 'Texto proprio diferente da outra skill.'].join('\n'),
    },
  ]);

  const prazo = relatorio.skills.find((s) => s.id === 'prazo-da-impugnacao');
  assert.equal(prazo.linhasExclusivas, 1, 'a linha sobre o prazo só existe nela');
  assert.ok(prazo.originalidade > 0 && prazo.originalidade < 1);
});

test('tema NÃO casa dentro de palavra maior — "prazo" não pode virar <TEMA> em "prazos"', () => {
  // Sem limite de palavra, "prazos" viraria "<TEMA>s" e a linha deixaria de
  // bater com a mesma linha de outra skill, inflando originalidade falsa.
  const normalizado = normalizarTema('Os prazos correm; o prazo é fatal.', {
    id: 'prazo',
    titulo: 'prazo',
  });
  assert.match(normalizado, /Os prazos correm/, 'o plural fica intacto');
  assert.match(normalizado, /o <TEMA> é fatal/, 'a palavra isolada é trocada');
});

test('tema curto demais é ignorado — id de uma letra não pode dissolver o texto', () => {
  const texto = 'A analise da causa aparece aqui.';
  assert.equal(normalizarTema(texto, { id: 'a', titulo: 'A' }), texto);
});

test('corpus de uma skill só: tudo é exclusivo — não há com quem compartilhar', () => {
  const relatorio = medirOriginalidade([{ id: 'unica', titulo: 'Única', texto: '## A\nlinha um\nlinha dois' }]);
  assert.equal(relatorio.skills[0].originalidade, 1);
});

test('linhas vazias e espaço não contam — formatação não é conteúdo', () => {
  const relatorio = medirOriginalidade([
    { id: 'a', titulo: 'A', texto: 'linha\n\n   \nlinha\n' },
  ]);
  assert.equal(relatorio.skills[0].totalLinhas, 1, 'linha repetida na MESMA skill conta uma vez');
});

test('o relatório traz o boilerplate mais compartilhado, com quantas skills o repetem', () => {
  const relatorio = medirOriginalidade([
    { id: 'abuso-economico', titulo: 'Abuso econômico', texto: '## Regras\nNão presuma competência.\nsó de alfa' },
    { id: 'abuso-politico', titulo: 'Abuso político', texto: '## Regras\nNão presuma competência.\nsó de beta' },
    { id: 'abuso-religioso', titulo: 'Abuso religioso', texto: '## Regras\nNão presuma competência.\nsó de gama' },
  ]);

  const topo = relatorio.boilerplate[0];
  assert.equal(topo.skills, 3, 'a linha mais repetida está nas três');
  assert.ok(['## Regras', 'Não presuma competência.'].includes(topo.linha));
});

test('o resumo agrega a mediana de originalidade do corpus', () => {
  // O caso que importa medir: molde idêntico, só o tema trocado, mais uma
  // linha própria em cada. Depois de normalizar o tema, "Executar <TEMA>."
  // vira linha comum — é exatamente essa a duplicação que o gerador produz.
  const molde = (tema, extra) => `## Missão\nExecutar ${tema}.\n${extra}`;
  const relatorio = medirOriginalidade([
    { id: 'abuso-economico', titulo: 'Abuso econômico', texto: molde('Abuso econômico', 'exclusivo de alfa') },
    { id: 'abuso-politico', titulo: 'Abuso político', texto: molde('Abuso político', 'exclusivo de beta') },
    { id: 'abuso-religioso', titulo: 'Abuso religioso', texto: molde('Abuso religioso', 'exclusivo de gama') },
  ]);

  assert.equal(relatorio.resumo.totalSkills, 3);
  assert.ok(
    Math.abs(relatorio.resumo.medianaOriginalidade - 1 / 3) < 0.01,
    `esperava 1/3 (1 linha própria em 3) — recebido ${relatorio.resumo.medianaOriginalidade}`
  );
});

test('corpus vazio não quebra — devolve resumo zerado', () => {
  const relatorio = medirOriginalidade([]);
  assert.equal(relatorio.resumo.totalSkills, 0);
  assert.deepEqual(relatorio.skills, []);
});
