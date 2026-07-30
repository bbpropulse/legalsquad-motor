import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { searchSkillCatalog } from '../src/skill-search.js';
import { AREA_DEMO } from './fixtures/caminhos.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('busca ranqueia capability exata sem carregar bodies no resultado', () => {
  const result = searchSkillCatalog('demo peca alpha', AREA_DEMO, { limit: 5 });
  assert.equal(result.success, true);
  assert.ok(result.results.length > 0, 'a fixture precisa devolver resultado para o teste valer algo');
  assert.equal(result.results[0].id, 'demo-peca-alpha');
  assert.equal(result.results.length <= 5, true);
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /LEGALSQUAD:HP-CONTRACT/);
  assert.doesNotMatch(serialized, /skillPath|"raw"|"frontmatter"/);
});

test('busca exclui preview e quarentena por padrão e sinaliza gates', () => {
  const normal = searchSkillCatalog('demo preview engine', AREA_DEMO, { limit: 20 });
  const architecture = searchSkillCatalog('demo preview engine', AREA_DEMO, {
    limit: 20,
    includePreview: true,
  });
  assert.ok(normal.results.length > 0, 'a busca normal precisa achar algo (só não a preview)');
  assert.equal(normal.results.some((item) => item.id === 'demo-preview-engine'), false);
  const preview = architecture.results.find((item) => item.id === 'demo-preview-engine');
  assert.ok(preview);
  assert.equal(preview.lifecycle, 'preview');
  assert.equal(preview.high_performance_eligible, false);
  assert.ok(normal.results.every((item) => !['preview', 'deprecated', 'quarantined'].includes(item.lifecycle)));
});

test('busca reflete perfis corrigidos e mantém shortlist compacta', () => {
  const result = searchSkillCatalog('demo publicacao', AREA_DEMO, { limit: 3 });
  const publication = result.results.find((item) => item.id === 'demo-publicacao');
  assert.ok(publication);
  assert.equal(publication.quality_profile, 'legal-drafting');
  assert.equal(publication.delivery_type, 'external-mutation');
  assert.equal(publication.supervision_required, true);
  assert.ok(Buffer.byteLength(JSON.stringify(result), 'utf8') < 8_000);
  const broad = searchSkillCatalog('demo peca calculo publicacao', AREA_DEMO, { limit: 8 });
  assert.ok(broad.results.length > 0);
  assert.ok(Buffer.byteLength(JSON.stringify(broad), 'utf8') < 8_000);
});

test('busca também casa best-practices do `_catalog.yaml`, description = whenToUse', () => {
  // Skills já têm busca dedicada (rankSkills + índice); best-practices não —
  // o Arquiteto só tinha "ler _catalog.yaml inteiro" ou "listar a pasta às
  // cegas" (o caso do `format:`). Reusa o MESMO motor de ranking: um
  // `_catalog.yaml` cabe inteiro em memória, não precisa de índice próprio.
  const result = searchSkillCatalog('revisão dupla revisores paralelo', AREA_DEMO, {
    bestPracticesCatalogPath: join(AREA_DEMO, 'core', 'best-practices', '_catalog.yaml'),
  });
  assert.equal(result.success, true);
  assert.ok(Array.isArray(result.best_practices));
  const revisao = result.best_practices.find((bp) => bp.id === 'revisao-dupla-demo');
  assert.ok(revisao, `esperava revisao-dupla-demo — recebido: ${JSON.stringify(result.best_practices)}`);
  assert.equal(revisao.obrigatoria, true, 'obrigatoria: true do catálogo precisa sobreviver na busca');
  assert.match(revisao.description, /revisam em paralelo/, 'description vem do whenToUse, não só do nome');
});

test('sem catálogo de best-practices instalado (caminho padrão), best_practices vem [] sem quebrar skills', () => {
  const result = searchSkillCatalog('demo peca alpha', AREA_DEMO, { limit: 3 });
  assert.equal(result.success, true);
  assert.deepEqual(result.best_practices, [], 'AREA_DEMO não tem _legalsquad/ instalado — caminho padrão não existe');
  assert.ok(result.results.length > 0, 'a ausência de best-practices não pode afetar a busca de skills');
});

test('nos dois caminhos de erro (query vazia, skills/ ausente), `best_practices` continua presente como []', () => {
  // architect.agent.yaml promete "o resultado traz results e best_practices
  // na mesma chamada" — se a chave sumir em qualquer `return`, um consumidor
  // que confia nisso (leitura direta do JSON, sem checar `success` primeiro)
  // quebra com "Cannot read properties of undefined".
  const queryVazia = searchSkillCatalog('', AREA_DEMO);
  assert.equal(queryVazia.success, false);
  assert.deepEqual(queryVazia.best_practices, [], 'shape consistente mesmo no erro de query vazia');

  const semSkillsDir = searchSkillCatalog('qualquer coisa', join(AREA_DEMO, 'nao-existe'));
  assert.equal(semSkillsDir.success, false);
  assert.deepEqual(semSkillsDir.best_practices, [], 'shape consistente mesmo no erro de skills/ ausente');
});

test('CLI JSON devolve shortlist determinística e falha em query vazia', () => {
  const bin = join(ROOT, 'bin', 'legalsquad.js');
  const found = spawnSync(process.execPath, [
    bin,
    'search-skills',
    '--query',
    'demo peca alpha',
    '--limit',
    '2',
    '--json',
  ], { cwd: AREA_DEMO, encoding: 'utf8' });
  const empty = spawnSync(process.execPath, [bin, 'search-skills', '--json'], {
    cwd: AREA_DEMO,
    encoding: 'utf8',
  });
  assert.equal(found.status, 0, found.stderr);
  const parsed = JSON.parse(found.stdout);
  assert.ok(parsed.results.length > 0, 'a fixture precisa devolver resultado para o teste valer algo');
  assert.equal(parsed.results[0].id, 'demo-peca-alpha');
  assert.equal(parsed.results[0].quality_profile, 'legal-drafting');
  assert.equal(empty.status, 1);
  assert.equal(JSON.parse(empty.stdout).error.code, 'search-query-empty');
});
