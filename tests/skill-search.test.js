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
  assert.doesNotMatch(serialized, /CRIMINALSQUAD:HP-CONTRACT/);
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

test('CLI JSON devolve shortlist determinística e falha em query vazia', () => {
  const bin = join(ROOT, 'bin', 'criminalsquad.js');
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
