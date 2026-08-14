import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lerCorteDePacotes, separarEntidades } from '../src/pack-split.js';

// O corte `transversal` × `area.*` (SPEC §6.3). O empacotador e' cego: ele nao
// pode ADIVINHAR que uma skill serve qualquer area. Quem sabe e' o curador, e
// ele declara num `_packs.yaml` na raiz do conteudo — um lugar so, auditavel de
// uma vez, porque o corte tem consequencia: skill presente nos dois pacotes e'
// erro de build, e skill transversal que cai na area vira duplicacao em todas
// as areas, que e' exatamente o que a migracao quer eliminar.

function criarConteudo(packsYaml) {
  const raiz = mkdtempSync(join(tmpdir(), 'legalsquad-corte-'));
  mkdirSync(join(raiz, 'skills'), { recursive: true });
  if (packsYaml !== null) writeFileSync(join(raiz, '_packs.yaml'), packsYaml);
  return raiz;
}

const ENTIDADES = [
  { path: 'skills/conector-mcp/SKILL.md', sha256: 'a' },
  { path: 'skills/conector-mcp/references/x.md', sha256: 'b' },
  { path: 'skills/peca-alpha/SKILL.md', sha256: 'c' },
  { path: 'squads/demo/squad.yaml', sha256: 'd' },
  { path: 'core/best-practices/_catalog.yaml', sha256: 'e' },
];

test('skill declarada transversal sai do pacote de área, com toda a sua subárvore', () => {
  const corte = separarEntidades(ENTIDADES, new Set(['conector-mcp']));

  assert.deepEqual(
    corte.transversal.map((e) => e.path).sort(),
    ['skills/conector-mcp/SKILL.md', 'skills/conector-mcp/references/x.md'].sort(),
    'a skill inteira viaja junta — `references/` não pode ficar para trás'
  );
  assert.deepEqual(
    corte.area.map((e) => e.path).sort(),
    ['core/best-practices/_catalog.yaml', 'skills/peca-alpha/SKILL.md', 'squads/demo/squad.yaml'].sort(),
    'squads e best-practices são de área por definição (§6.3) — só skills são transversais'
  );
});

test('id declarado transversal que não existe no conteúdo falha o build', () => {
  // Declaração que aponta para o vazio é sintoma de skill renomeada ou removida.
  // Aceitar em silêncio produziria um `transversal` menor do que o curador
  // pensa que produziu — e ninguém descobre até faltar a skill numa área.
  assert.throws(
    () => separarEntidades(ENTIDADES, new Set(['conector-mcp', 'skill-fantasma'])),
    /skill-fantasma/,
    'a mensagem precisa nomear o id que não casou'
  );
});

test('`_packs.yaml` ausente falha o build em vez de assumir "sem transversal"', () => {
  // Fail-closed. Se a ausência valesse "nenhuma skill é transversal", esquecer o
  // arquivo mandaria as ~19 skills transversais para dentro do pacote de área —
  // duplicadas em toda área, em silêncio. É a duplicação que a migração existe
  // para eliminar.
  const raiz = criarConteudo(null);

  assert.throws(() => lerCorteDePacotes(raiz), /_packs\.yaml/);
});

test('corte lido do `_packs.yaml` traz os ids transversais e o perfil da área', () => {
  const raiz = criarConteudo([
    '# Corte de pacotes deste diretório de conteúdo.',
    'area_id: demo',
    'area_titulo: "Área Demo"',
    'area_curador: "Curadoria Fictícia"',
    'area_ramos: [alfa, beta]',
    'transversal_skills: [conector-mcp, gerador-imagem]',
    '',
  ].join('\n'));

  const corte = lerCorteDePacotes(raiz);

  assert.equal(corte.areaId, 'demo');
  assert.equal(corte.titulo, 'Área Demo');
  assert.equal(corte.curador, 'Curadoria Fictícia');
  assert.deepEqual(corte.ramos, ['alfa', 'beta']);
  assert.deepEqual([...corte.transversalSkills].sort(), ['conector-mcp', 'gerador-imagem']);
});

test('`transversal_skills` ausente falha do mesmo jeito que o arquivo ausente', () => {
  // Mesmo modo de falha da ausência do arquivo, um nível abaixo: chave que não
  // existe não pode significar lista vazia. "Nenhuma transversal" é uma decisão
  // de curadoria e precisa estar escrita.
  const raiz = criarConteudo('area_id: demo\narea_titulo: "Área Demo"\n');

  assert.throws(() => lerCorteDePacotes(raiz), /transversal_skills/);
});

test('lista transversal vazia é válida — só precisa ser explícita', () => {
  const raiz = criarConteudo('area_id: demo\ntransversal_skills: []\n');

  const corte = lerCorteDePacotes(raiz);

  assert.equal(corte.transversalSkills.size, 0);
});

test('best-practice declarada transversal sai do pacote de área', () => {
  // Sem isto, TODA best-practice cai no pacote de área, porque o corte só sabia
  // ler `transversal_skills`. No conteúdo real isso empurrou
  // `redacao-sem-marcas-de-ia` — a régua obrigatória do Redação Gate — para uma
  // pseudo-área `area._transversal` que ninguém instala por nome: quem instala
  // `transversal` + uma área de verdade não recebia a régua, e o gate passava a
  // declarar a dimensão como "não avaliada". A best-practice existia, estava
  // assinada e publicada, e mesmo assim não chegava a ninguém.
  const corte = separarEntidades(
    [
      { path: 'core/best-practices/redacao.md', sha256: 'r' },
      { path: 'core/best-practices/execucao-penal.md', sha256: 'p' },
      { path: 'core/best-practices/_catalog.yaml', sha256: 'c' },
      { path: 'skills/peca-alpha/SKILL.md', sha256: 's' },
    ],
    new Set(),
    new Set(['redacao'])
  );

  assert.deepEqual(
    corte.transversal.map((e) => e.path).sort(),
    ['core/best-practices/_catalog.yaml', 'core/best-practices/redacao.md'],
    'o catálogo ACOMPANHA a best-practice — sem ele, `whenToUse` e `obrigatoria` não viajam'
  );
  assert.deepEqual(
    corte.area.map((e) => e.path).sort(),
    ['core/best-practices/_catalog.yaml', 'core/best-practices/execucao-penal.md', 'skills/peca-alpha/SKILL.md'],
    'best-practice de matéria continua sendo de área — e o catálogo também fica, descrevendo as dela'
  );
});

test('o catálogo de best-practices é DUPLICADO quando há transversais dos dois lados', () => {
  // Medido no conteúdo real: declarar as best-practices transversais fez os
  // `.md` migrarem para o pacote transversal e o `_catalog.yaml` ficar no de
  // área. Resultado — `obrigatoria: true` sumia e a description caía pro título,
  // que é EXATAMENTE o defeito que a declaração veio consertar, reintroduzido um
  // elo adiante.
  //
  // Duplicar é a saída certa, não preguiça: o catálogo descreve entradas dos
  // dois lados, é alguns KB, o leitor da instalação já funde vários
  // `_catalog*.yaml` com "primeiro id vence", e entrada apontando para arquivo
  // ausente já é tolerada (best-practice órfã cai no título).
  const corte = separarEntidades(
    [
      { path: 'core/best-practices/redacao.md', sha256: 'r' },
      { path: 'core/best-practices/_catalog.yaml', sha256: 'c' },
    ],
    new Set(),
    new Set(['redacao'])
  );

  assert.equal(
    corte.transversal.filter((e) => e.path.endsWith('_catalog.yaml')).length, 1,
    'o transversal precisa do catálogo para descrever a best-practice que leva'
  );
  assert.equal(
    corte.area.filter((e) => e.path.endsWith('_catalog.yaml')).length, 1,
    'a área não pode PERDER o catálogo por causa de uma transversal declarada'
  );
});

test('sem best-practice transversal, o catálogo NÃO é duplicado', () => {
  // O caso comum — toda área que não declara nada — não pode pagar por isto.
  const corte = separarEntidades(
    [
      { path: 'core/best-practices/execucao-penal.md', sha256: 'p' },
      { path: 'core/best-practices/_catalog.yaml', sha256: 'c' },
    ],
    new Set(),
    new Set()
  );

  assert.deepEqual(corte.transversal, [], 'nada transversal declarado, nada no pacote transversal');
  assert.equal(corte.area.length, 2);
});

test('id de best-practice declarado que não existe no conteúdo falha o build', () => {
  // Mesma porta fail-closed das skills: declaração que aponta para o vazio é
  // sintoma de arquivo renomeado, e aceitar em silêncio produz um `transversal`
  // menor do que o curador pensa que produziu.
  assert.throws(
    () => separarEntidades([{ path: 'core/best-practices/redacao.md', sha256: 'r' }], new Set(), new Set(['nao-existe'])),
    /nao-existe/
  );
});

test('`transversal_best_practices` é opcional — omitir não quebra conteúdo já autorado', () => {
  // Diferente de `transversal_skills`, que é fail-closed: aquela chave nasceu
  // com o formato e a sua ausência esconderia duplicação em toda área. Esta
  // chegou depois, e exigi-la invalidaria de uma vez todo `_packs.yaml` já
  // escrito — trocando um defeito silencioso por uma quebra ruidosa em conteúdo
  // que está correto. Omitir significa "nenhuma", que é o comportamento antigo.
  const raiz = criarConteudo('area_id: demo\ntransversal_skills: []\n');

  const corte = lerCorteDePacotes(raiz);

  assert.equal(corte.transversalBestPractices.size, 0);
});

test('corte lê `transversal_best_practices` quando declarada', () => {
  const raiz = criarConteudo([
    'area_id: demo',
    'transversal_skills: [conector-mcp]',
    'transversal_best_practices: [redacao-sem-marcas-de-ia, protocolo-operacional]',
    '',
  ].join('\n'));

  const corte = lerCorteDePacotes(raiz);

  assert.deepEqual(
    [...corte.transversalBestPractices].sort(),
    ['protocolo-operacional', 'redacao-sem-marcas-de-ia']
  );
});
