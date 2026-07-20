import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { searchSkillCatalog } from '../src/skill-search.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('busca ranqueia capability exata sem carregar bodies no resultado', () => {
  const result = searchSkillCatalog('habeas corpus', ROOT, { limit: 5 });
  assert.equal(result.success, true);
  assert.equal(result.results[0].id, 'habeas-corpus');
  assert.equal(result.results.length <= 5, true);
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /CRIMINALSQUAD:HP-CONTRACT/);
  assert.doesNotMatch(serialized, /skillPath|"raw"|"frontmatter"/);
});

test('busca exclui preview e quarentena por padrão e sinaliza gates', () => {
  const normal = searchSkillCatalog('fracao progressao engine', ROOT, { limit: 20 });
  const architecture = searchSkillCatalog('fracao progressao engine', ROOT, {
    limit: 20,
    includePreview: true,
  });
  assert.equal(normal.results.some((item) => item.id === 'ep-fracao-progressao-engine'), false);
  const preview = architecture.results.find((item) => item.id === 'ep-fracao-progressao-engine');
  assert.ok(preview);
  assert.equal(preview.lifecycle, 'preview');
  assert.equal(preview.high_performance_eligible, false);
  assert.ok(normal.results.every((item) => !['preview', 'deprecated', 'quarantined'].includes(item.lifecycle)));
});

test('busca reflete perfis corrigidos e mantém shortlist compacta', () => {
  const result = searchSkillCatalog('publicar post redes sociais', ROOT, { limit: 3 });
  const publication = result.results.find((item) => item.id === 'publicacao-redes');
  assert.ok(publication);
  assert.equal(publication.quality_profile, 'external-action');
  assert.equal(publication.delivery_type, 'external-mutation');
  assert.equal(publication.supervision_required, true);
  assert.ok(Buffer.byteLength(JSON.stringify(result), 'utf8') < 8_000);
  const broad = searchSkillCatalog('defesa criminal prova recurso', ROOT, { limit: 8 });
  assert.ok(Buffer.byteLength(JSON.stringify(broad), 'utf8') < 8_000);
});

test('CLI JSON devolve shortlist determinística e falha em query vazia', () => {
  const bin = join(ROOT, 'bin', 'criminalsquad.js');
  const found = spawnSync(process.execPath, [
    bin,
    'search-skills',
    '--query',
    'audiencia de custodia',
    '--limit',
    '2',
    '--json',
  ], { cwd: ROOT, encoding: 'utf8' });
  const empty = spawnSync(process.execPath, [bin, 'search-skills', '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(found.status, 0, found.stderr);
  const parsed = JSON.parse(found.stdout);
  assert.equal(parsed.results[0].id, 'audiencia-de-custodia');
  assert.equal(parsed.results[0].quality_profile, 'legal-drafting');
  assert.equal(empty.status, 1);
  assert.equal(JSON.parse(empty.stdout).error.code, 'search-query-empty');
});
