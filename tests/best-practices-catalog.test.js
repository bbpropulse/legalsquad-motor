import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  parseBestPracticesCatalog,
  parseBestPracticesCatalogText,
  parseBestPracticesCatalogDir,
  defaultBestPracticesCatalogPath,
} from '../src/best-practices-catalog.js';
import { CORE_DEMO } from './fixtures/caminhos.js';

// A dívida que este parser fecha: cinco arquivos de prompt (architect.agent.yaml,
// discovery/design/build.prompt.md) instruem o Arquiteto a ler "as best-practices
// que o _catalog.yaml marcar como obrigatórias" — mas até aqui não existia campo
// nenhum no schema pra isso. `obrigatoria` é a palavra virando dado.

const CATALOGO = join(CORE_DEMO, 'best-practices', '_catalog.yaml');

test('devolve [] quando o catálogo não existe — degradação graciosa, não throw', () => {
  const entradas = parseBestPracticesCatalog(join(CORE_DEMO, 'best-practices', 'nao-existe.yaml'));
  assert.deepEqual(entradas, []);
});

test('parseia id/name/whenToUse/file de cada entrada', () => {
  const entradas = parseBestPracticesCatalog(CATALOGO);
  assert.equal(entradas.length, 2);

  const fluxo = entradas.find((e) => e.id === 'fluxo-demo-basico');
  assert.ok(fluxo, `esperava fluxo-demo-basico — recebido: ${JSON.stringify(entradas.map((e) => e.id))}`);
  assert.equal(fluxo.name, 'Fluxo Demo Básico');
  assert.equal(fluxo.whenToUse, 'Criar agentes que executam o fluxo sintético triagem → análise → redação da área demo.');
  assert.equal(fluxo.file, 'fluxo-demo-basico.md');
});

test('obrigatoria é false por padrão, true quando o campo declara', () => {
  const entradas = parseBestPracticesCatalog(CATALOGO);
  const fluxo = entradas.find((e) => e.id === 'fluxo-demo-basico');
  const revisao = entradas.find((e) => e.id === 'revisao-dupla-demo');

  assert.equal(fluxo.obrigatoria, false, 'sem o campo no YAML, não é obrigatória');
  assert.equal(revisao.obrigatoria, true, 'fixture declara obrigatoria: true pra esta entrada');
});

// `_catalog.yaml` é AUTORADO PELO CURADOR, fora deste repositório (CLAUDE.md)
// — ao contrário de pipeline.yaml/squad.yaml, que o próprio motor gera. Não
// há garantia nenhuma de indentação exata nem de encoding sem BOM; um parser
// que exige 2 espaços cravados ou quebra com BOM degrada TODO o catálogo pro
// mesmo estado de "área não instalada" — indistinguível de "não existe", que
// é a confusão que o motor promete nunca cometer.

test('tolera indentação de 4 espaços (estilo YAML comum), não só 2 cravados', () => {
  const raw = [
    'catalog:',
    '    - id: redacao',
    '      name: "Redação"',
    '      whenToUse: "Redigir peça."',
    '      file: redacao.md',
    '',
  ].join('\n');
  const entradas = parseBestPracticesCatalogText(raw);
  assert.equal(entradas.length, 1, `esperava 1 entrada — recebido: ${JSON.stringify(entradas)}`);
  assert.equal(entradas[0].id, 'redacao');
  assert.equal(entradas[0].whenToUse, 'Redigir peça.');
});

test('tolera BOM no início do arquivo (Notepad/Word) — mesmo caso que frontmatter.js já trata', () => {
  const BOM = String.fromCharCode(0xfeff);
  const raw = `${BOM}catalog:\n  - id: redacao\n    name: "Redação"\n    whenToUse: "Redigir peça."\n    file: redacao.md\n`;
  const entradas = parseBestPracticesCatalogText(raw);
  assert.equal(entradas.length, 1, `BOM não pode apagar o catálogo inteiro — recebido: ${JSON.stringify(entradas)}`);
  assert.equal(entradas[0].id, 'redacao');
});

test('id aspeado (`- id: "redacao"`) não carrega as aspas pro dado — mesma normalização que name/whenToUse/file já têm', () => {
  // Aspeamento é natural: todo campo vizinho no mesmo bloco é aspeado, então um
  // curador aspeando o id também não é cenário exótico.
  const raw = 'catalog:\n  - id: "redacao-persuasiva"\n    name: "Redação"\n    whenToUse: "x"\n    file: r.md\n';
  const entradas = parseBestPracticesCatalogText(raw);
  assert.equal(
    entradas[0].id,
    'redacao-persuasiva',
    `id não pode carregar aspas — quebraria bestPractices.has(target) em validateCanonicalization`
  );
});

test('defaultBestPracticesCatalogPath aponta pro caminho de INSTALAÇÃO, não de autoria', () => {
  assert.equal(
    defaultBestPracticesCatalogPath('/projeto'),
    join('/projeto', '_legalsquad', 'core', 'best-practices', '_catalog.yaml')
  );
});

// ---------------------------------------------------------------------------
// Vários catálogos na mesma pasta — uma instalação tem N áreas
// ---------------------------------------------------------------------------
//
// Bug medido em instalação real: as 14 áreas gravam `_catalog.yaml` no MESMO
// caminho de destino, arquivo a arquivo. A última instalada sobrescreve as
// outras 13, e o catálogo instalado passa a listar UMA entrada quando deveria
// listar quinze — os arquivos .md continuam no disco, mas nada os referencia.

function pastaComCatalogos(arquivos) {
  const dir = mkdtempSync(join(tmpdir(), 'bp-cat-'));
  for (const [nome, conteudo] of Object.entries(arquivos)) {
    writeFileSync(join(dir, nome), conteudo, 'utf-8');
  }
  return dir;
}

const catalogoDe = (id, extra = '') => `---
catalog:
  - id: ${id}
    name: "BP ${id}"
    whenToUse: "quando ${id}"
    file: ${id}.md
    obrigatoria: true
${extra}`;

test('funde os catálogos de TODAS as áreas instaladas, não só o último', () => {
  const dir = pastaComCatalogos({
    '_catalog.direito-civil.yaml': catalogoDe('protocolo-civil'),
    '_catalog.direito-penal.yaml': catalogoDe('protocolo-penal'),
    '_catalog._transversal.yaml': catalogoDe('redacao-sem-marcas-de-ia'),
  });
  try {
    const ids = parseBestPracticesCatalogDir(dir).map((e) => e.id).sort();
    assert.deepEqual(ids, ['protocolo-civil', 'protocolo-penal', 'redacao-sem-marcas-de-ia']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('o nome legado `_catalog.yaml` continua valendo — instalação antiga não quebra', () => {
  const dir = pastaComCatalogos({ '_catalog.yaml': catalogoDe('protocolo-legado') });
  try {
    assert.deepEqual(parseBestPracticesCatalogDir(dir).map((e) => e.id), ['protocolo-legado']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('legado e nomeados convivem — durante a migração a pasta tem os dois', () => {
  const dir = pastaComCatalogos({
    '_catalog.yaml': catalogoDe('protocolo-legado'),
    '_catalog.direito-civil.yaml': catalogoDe('protocolo-civil'),
  });
  try {
    const ids = parseBestPracticesCatalogDir(dir).map((e) => e.id).sort();
    assert.deepEqual(ids, ['protocolo-civil', 'protocolo-legado']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('id repetido entre áreas aparece uma vez só, e de forma determinística', () => {
  const dir = pastaComCatalogos({
    '_catalog.aaa.yaml': catalogoDe('mesmo-id'),
    '_catalog.zzz.yaml': catalogoDe('mesmo-id'),
  });
  try {
    const entradas = parseBestPracticesCatalogDir(dir);
    assert.equal(entradas.length, 1, 'sem dedup, o mesmo id entraria duas vezes');
    // Ordem de leitura é alfabética: o resultado não pode depender da ordem do
    // sistema de arquivos, senão duas instalações iguais divergem.
    assert.equal(entradas[0].name, 'BP mesmo-id');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pasta inexistente devolve [] — área não instalada é estado normal, não erro', () => {
  assert.deepEqual(parseBestPracticesCatalogDir(join(tmpdir(), 'nao-existe-bp-cat')), []);
});

test('arquivo .yaml que não é catálogo é ignorado, não quebra a leitura', () => {
  const dir = pastaComCatalogos({
    '_catalog.civil.yaml': catalogoDe('protocolo-civil'),
    'outra-coisa.yaml': 'chave: valor\n',
  });
  try {
    assert.deepEqual(parseBestPracticesCatalogDir(dir).map((e) => e.id), ['protocolo-civil']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
