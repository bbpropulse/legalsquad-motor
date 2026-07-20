import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { searchAcervoCatalog, parseAcervoIndex } from '../src/acervo-search.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('parseAcervoIndex lê o índice gerado sem depender de lib YAML', () => {
  const entries = parseAcervoIndex(join(ROOT, 'acervo', '_index.yaml'));
  assert.ok(Array.isArray(entries));
  assert.ok(entries.length > 0);
  const sample = entries[0];
  assert.ok(typeof sample.path === 'string' && sample.path.length > 0);
  assert.ok(Array.isArray(sample.tags));
  assert.ok(['DISCOVERY_ONLY', 'VERIFIED_OFFICIAL', 'QUARANTINED'].includes(sample.confianca));
});

test('busca ranqueia o tema exato no topo', () => {
  const result = searchAcervoCatalog('STF 2024', ROOT, { limit: 3 });
  assert.equal(result.success, true);
  assert.equal(result.results[0].path, 'jurisprudencia/stf/STF_2024.md');
  assert.ok(result.results[0].matched_by.includes('tema-exato'));
  assert.ok(result.results.length <= 3);
});

test('query vazia bloqueia com código estável', () => {
  const result = searchAcervoCatalog('   ', ROOT, {});
  assert.equal(result.success, false);
  assert.equal(result.error.code, 'search-query-empty');
});

test('índice ausente bloqueia em vez de estourar', () => {
  const result = searchAcervoCatalog('qualquer tema', join(ROOT, 'src'), {});
  assert.equal(result.success, false);
  assert.equal(result.error.code, 'acervo-index-missing');
});

test('shortlist é compacta e não vaza confiança quarentenada por padrão', () => {
  const result = searchAcervoCatalog('jurisprudencia stj stf', ROOT, { limit: 8 });
  assert.equal(result.success, true);
  assert.ok(Buffer.byteLength(JSON.stringify(result), 'utf8') < 8_000);
  assert.ok(result.results.every((item) => item.confianca !== 'QUARANTINED'));
});

test('CLI JSON devolve shortlist determinística e falha em query vazia', () => {
  const bin = join(ROOT, 'bin', 'criminalsquad.js');
  const found = spawnSync(process.execPath, [
    bin, 'search-acervo', '--query', 'STF 2024', '--limit', '2', '--json',
  ], { cwd: ROOT, encoding: 'utf8' });
  const empty = spawnSync(process.execPath, [bin, 'search-acervo', '--json'], {
    cwd: ROOT, encoding: 'utf8',
  });
  assert.equal(found.status, 0, found.stderr);
  const parsed = JSON.parse(found.stdout);
  assert.equal(parsed.results[0].path, 'jurisprudencia/stf/STF_2024.md');
  assert.equal(empty.status, 1);
  assert.equal(JSON.parse(empty.stdout).error.code, 'search-query-empty');
});
