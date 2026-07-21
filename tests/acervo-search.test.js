import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { searchAcervoCatalog, parseAcervoIndex } from '../src/acervo-search.js';
import { ACERVO_DEMO, AREA_DEMO } from './fixtures/caminhos.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('parseAcervoIndex lê o índice gerado sem depender de lib YAML', () => {
  const entries = parseAcervoIndex(join(ACERVO_DEMO, '_index.yaml'));
  assert.ok(Array.isArray(entries));
  assert.ok(entries.length > 0);
  const sample = entries[0];
  assert.ok(typeof sample.path === 'string' && sample.path.length > 0);
  assert.ok(Array.isArray(sample.tags));
  assert.ok(['DISCOVERY_ONLY', 'VERIFIED_OFFICIAL', 'QUARANTINED'].includes(sample.confianca));
});

test('busca ranqueia o tema exato no topo', () => {
  const result = searchAcervoCatalog('tribunal demo tema 2024', AREA_DEMO, { limit: 3 });
  assert.equal(result.success, true);
  assert.ok(result.results.length > 0, 'a fixture precisa devolver resultado para o teste valer algo');
  assert.equal(result.results[0].path, 'jurisprudencia/tribunal-demo/DEMO_2024.md');
  assert.ok(result.results[0].matched_by.includes('tema-exato'));
  assert.ok(result.results.length <= 3);
});

test('query vazia bloqueia com código estável', () => {
  const result = searchAcervoCatalog('   ', AREA_DEMO, {});
  assert.equal(result.success, false);
  assert.equal(result.error.code, 'search-query-empty');
});

test('índice ausente bloqueia em vez de estourar', () => {
  const result = searchAcervoCatalog('qualquer tema', join(ROOT, 'src'), {});
  assert.equal(result.success, false);
  assert.equal(result.error.code, 'acervo-index-missing');
});

test('shortlist é compacta e não vaza confiança quarentenada por padrão', () => {
  const result = searchAcervoCatalog('jurisprudencia tribunal demo', AREA_DEMO, { limit: 8 });
  assert.equal(result.success, true);
  assert.ok(result.results.length > 0, 'a fixture precisa devolver resultado para o teste valer algo');
  assert.ok(Buffer.byteLength(JSON.stringify(result), 'utf8') < 8_000);
  assert.ok(result.results.every((item) => item.confianca !== 'QUARANTINED'));
});

test('CLI JSON devolve shortlist determinística e falha em query vazia', () => {
  const bin = join(ROOT, 'bin', 'legalsquad.js');
  const found = spawnSync(process.execPath, [
    bin, 'search-acervo', '--query', 'tribunal demo tema 2024', '--limit', '2', '--json',
  ], { cwd: AREA_DEMO, encoding: 'utf8' });
  const empty = spawnSync(process.execPath, [bin, 'search-acervo', '--json'], {
    cwd: AREA_DEMO, encoding: 'utf8',
  });
  assert.equal(found.status, 0, found.stderr);
  const parsed = JSON.parse(found.stdout);
  assert.ok(parsed.results.length > 0, 'a fixture precisa devolver resultado para o teste valer algo');
  assert.equal(parsed.results[0].path, 'jurisprudencia/tribunal-demo/DEMO_2024.md');
  assert.equal(empty.status, 1);
  assert.equal(JSON.parse(empty.stdout).error.code, 'search-query-empty');
});
