import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizarTema } from '../src/skill-originality.js';
import {
  CORTE_MOLDE_PADRAO,
  identificarMolde,
  montarProtocolo,
  separarMolde,
} from '../src/molde-extract.js';

// Corpus sintético: `n` skills que compartilham o mesmo protocolo e diferem
// só na matéria. Reproduz a forma real medida no corpus de produção — molde
// contíguo dominante, matéria em ilhas pequenas.
function corpusSintetico(n, { protocolo, materiaDe }) {
  return Array.from({ length: n }, (_, i) => {
    const id = `skill-${i}`;
    const titulo = `Skill ${i}`;
    return {
      id,
      titulo,
      texto: [
        '---',
        `name: ${id}`,
        'lifecycle: active',
        '---',
        '',
        `# ${titulo}`,
        '',
        '## Protocolo',
        ...protocolo,
        '',
        '## Matéria',
        ...materiaDe(i),
        '',
      ].join('\n'),
    };
  });
}

const PROTOCOLO = [
  'Confirme o dispositivo exato antes de citar.',
  'Nunca cite precedente de memória.',
  'Registre a data de corte editorial.',
];

test('linha repetida acima do corte é molde; abaixo do corte é matéria', () => {
  const corpus = corpusSintetico(30, {
    protocolo: PROTOCOLO,
    materiaDe: (i) => [`Regra específica número ${i}.`],
  });

  const molde = identificarMolde(corpus, { corte: 21 });

  for (const linha of PROTOCOLO) assert.ok(molde.has(linha), `deveria ser molde: ${linha}`);
  assert.ok(!molde.has('Regra específica número 7.'));
});

test('o protocolo carrega TODA linha de molde removida — nada some do sistema', () => {
  // Bug real, encontrado depois de publicar: o protocolo era montado varrendo
  // só a skill mais longa, então linha de molde ausente dela nunca entrava.
  // Medido no lote médico: 858 linhas removidas das skills, 30 preservadas na
  // best-practice — 96% do protocolo evaporava sem nenhum aviso.
  const corpus = [
    ...corpusSintetico(25, { protocolo: ['Comum a todas.'], materiaDe: (i) => [`m${i}`] }),
    // Bloco de molde que só existe num subgrupo — e num arquivo curto, para
    // que a heurística "mais longa" não o alcance.
    ...corpusSintetico(25, { protocolo: ['Comum a todas.', 'Só do subgrupo.'], materiaDe: () => [] })
      .map((s, i) => ({ ...s, id: `sub-${i}`, titulo: `Sub ${i}` })),
  ];

  const molde = identificarMolde(corpus, { corte: 21 });
  const protocolo = montarProtocolo(corpus, molde);
  const linhasDoProtocolo = new Set(protocolo.split('\n').map((l) => l.trim()));

  for (const linha of molde) {
    assert.ok(linhasDoProtocolo.has(linha), `linha de molde perdida: ${linha}`);
  }
});

test('o protocolo não repete linha nem inventa conteúdo', () => {
  const corpus = corpusSintetico(30, { protocolo: PROTOCOLO, materiaDe: (i) => [`m${i}`] });
  const molde = identificarMolde(corpus, { corte: 21 });
  const linhas = montarProtocolo(corpus, molde).split('\n').filter((l) => l.trim());

  assert.equal(new Set(linhas).size, linhas.length, 'nenhuma linha repetida');
  // Comparação contra o corpus NORMALIZADO: o protocolo grava a forma com o
  // tema neutralizado de propósito — gravar a original levaria o tema de uma
  // skill arbitrária para dentro do protocolo comum a todas.
  const doCorpus = new Set(
    corpus.flatMap((s) => normalizarTema(s.texto, { id: s.id, titulo: s.titulo }).split('\n').map((l) => l.trim()))
  );
  for (const linha of linhas) {
    assert.ok(doCorpus.has(linha.trim()), `linha que não veio do corpus: ${linha}`);
  }
});

test('o corte é ABSOLUTO, não proporcional — molde de família também é molde', () => {
  // 100 skills; 30 delas compartilham um bloco. 30% do corpus jamais passaria
  // num corte proporcional de 90%, mas uma linha repetida em 30 skills
  // distintas não carrega matéria de nenhuma delas.
  const corpus = corpusSintetico(100, {
    protocolo: PROTOCOLO,
    materiaDe: (i) => (i < 30 ? ['Bloco compartilhado pela família A.'] : [`Único ${i}.`]),
  });

  const molde = identificarMolde(corpus, { corte: 21 });
  assert.ok(molde.has('Bloco compartilhado pela família A.'));
});

test('corte inválido LANÇA — nunca vira no-op silencioso', () => {
  const corpus = corpusSintetico(30, { protocolo: PROTOCOLO, materiaDe: () => ['x'] });
  for (const corte of [0, -1, 1.5, Number.NaN, 'muitas']) {
    assert.throws(() => identificarMolde(corpus, { corte }), /corte/i, `corte=${String(corte)}`);
  }
});

test('corpus menor que o corte devolve molde vazio, não erro', () => {
  const corpus = corpusSintetico(3, { protocolo: PROTOCOLO, materiaDe: (i) => [`m${i}`] });
  const molde = identificarMolde(corpus, { corte: 21 });
  assert.equal(molde.size, 0);
});

test('CORTE_MOLDE_PADRAO é um inteiro utilizável', () => {
  assert.ok(Number.isInteger(CORTE_MOLDE_PADRAO) && CORTE_MOLDE_PADRAO > 1);
});

// ---------------------------------------------------------------------------
// separarMolde — o que sai do arquivo e o que fica
// ---------------------------------------------------------------------------

const CORPUS = corpusSintetico(30, {
  protocolo: PROTOCOLO,
  materiaDe: (i) => [`Regra específica número ${i}.`],
});
const MOLDE = identificarMolde(CORPUS, { corte: 21 });

test('frontmatter fica INTACTO mesmo sendo idêntico em todo o corpus', () => {
  const alvo = CORPUS[0];
  const { materia } = separarMolde(alvo.texto, { ...alvo, linhasDeMolde: MOLDE });

  // `lifecycle: active` aparece nas 30 skills — é molde pelo critério de
  // frequência. Removê-lo quebraria o YAML e a skill inteira deixaria de
  // carregar. O frontmatter não é prosa; é contrato.
  assert.match(materia, /^---\n/);
  assert.match(materia, /lifecycle: active/);
  assert.match(materia, /name: skill-0/);
});

test('o primeiro H1 sobrevive — sem ele a skill perde a identidade', () => {
  const alvo = CORPUS[0];
  const { materia } = separarMolde(alvo.texto, { ...alvo, linhasDeMolde: MOLDE });
  assert.match(materia, /^# Skill 0$/m);
});

test('a matéria sobrevive e o protocolo sai', () => {
  const alvo = CORPUS[5];
  const { materia, molde } = separarMolde(alvo.texto, { ...alvo, linhasDeMolde: MOLDE });

  assert.match(materia, /Regra específica número 5\./);
  for (const linha of PROTOCOLO) {
    assert.ok(!materia.includes(linha), `protocolo deveria ter saído: ${linha}`);
    assert.ok(molde.includes(linha), `protocolo deveria estar no bloco extraído: ${linha}`);
  }
});

test('heading cuja seção inteira é molde sai junto — não sobra título órfão', () => {
  const alvo = CORPUS[5];
  const { materia } = separarMolde(alvo.texto, { ...alvo, linhasDeMolde: MOLDE });
  assert.ok(!materia.includes('## Protocolo'), 'título de seção vazia deveria sair');
  assert.ok(materia.includes('## Matéria'), 'título de seção com conteúdo deveria ficar');
});

test('normalizarTema preserva a contagem de linhas — o mapeamento depende disso', () => {
  // `separarMolde` compara a linha NORMALIZADA e remove a linha ORIGINAL pelo
  // mesmo índice. Se a normalização inserisse ou removesse uma quebra de
  // linha, o corte cairia na linha errada — e o estrago seria silencioso.
  for (const skill of CORPUS.slice(0, 5)) {
    const norm = normalizarTema(skill.texto, { id: skill.id, titulo: skill.titulo });
    assert.equal(norm.split('\n').length, skill.texto.split('\n').length, skill.id);
  }
});

test('a matéria preservada é subconjunto fiel do original — nada é reescrito', () => {
  const alvo = CORPUS[9];
  const { materia } = separarMolde(alvo.texto, { ...alvo, linhasDeMolde: MOLDE });
  const originais = new Set(alvo.texto.split('\n'));
  for (const linha of materia.split('\n')) {
    if (!linha.trim()) continue;
    if (linha.startsWith('> **Protocolo operacional')) continue; // remissão inserida
    assert.ok(originais.has(linha), `linha alterada: ${linha}`);
  }
});
