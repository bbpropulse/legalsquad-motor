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

test('acervo-search avisa quando o índice está desatualizado em relação ao disco', async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const raiz = await mkdtemp(join(tmpdir(), 'acervo-stale-'));

  try {
    await mkdir(join(raiz, 'acervo', 'jurisprudencia'), { recursive: true });
    // Índice com UMA entrada...
    await writeFile(
      join(raiz, 'acervo', '_index.yaml'),
      'acervo:\n  - path: jurisprudencia/indexado.md\n    tipo: jurisprudencia\n    tema: "tema demo indexado"\n    tags: [demo]\n    confianca: DISCOVERY_ONLY\n'
    );
    await writeFile(join(raiz, 'acervo', 'jurisprudencia', 'indexado.md'), '# indexado\n\ntema demo indexado\n');
    // ...e um arquivo NOVO no disco que o índice não conhece. Sem aviso, ele
    // seria invisível à busca e ninguém saberia: é a falha muda que o gate cobre.
    await writeFile(join(raiz, 'acervo', 'jurisprudencia', 'nao-indexado.md'), '# novo\n\ntema demo indexado\n');

    const r = searchAcervoCatalog('tema demo indexado', raiz);

    assert.equal(r.success, true, 'a busca continua funcionando — degradação graciosa, não bloqueio');
    assert.ok(r.stale, 'deve sinalizar que o índice está defasado');
    assert.match(r.stale.message, /indexar-acervo/, 'a mensagem deve dizer como corrigir');
    assert.ok(
      r.stale.naoIndexados.includes('jurisprudencia/nao-indexado.md'),
      `deve nomear o arquivo ausente do índice; veio: ${JSON.stringify(r.stale.naoIndexados)}`
    );
  } finally {
    await rm(raiz, { recursive: true, force: true });
  }
});

test('acervo-search não acusa staleness quando índice e disco batem', async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const raiz = await mkdtemp(join(tmpdir(), 'acervo-fresh-'));

  try {
    await mkdir(join(raiz, 'acervo', 'jurisprudencia'), { recursive: true });
    await writeFile(
      join(raiz, 'acervo', '_index.yaml'),
      'acervo:\n  - path: jurisprudencia/unico.md\n    tipo: jurisprudencia\n    tema: "tema demo unico"\n    tags: [demo]\n    confianca: DISCOVERY_ONLY\n'
    );
    await writeFile(join(raiz, 'acervo', 'jurisprudencia', 'unico.md'), '# unico\n\ntema demo unico\n');
    // casos/ é sigiloso e NUNCA indexado — sua presença não pode acusar staleness
    await mkdir(join(raiz, 'acervo', 'casos'), { recursive: true });
    await writeFile(join(raiz, 'acervo', 'casos', 'cliente-sigiloso.md'), '# sigiloso\n');
    // README.md e o próprio _index.yaml também ficam fora do índice por regra
    await writeFile(join(raiz, 'acervo', 'README.md'), '# leia-me\n');

    const r = searchAcervoCatalog('tema demo unico', raiz);

    assert.equal(r.success, true);
    assert.equal(r.stale, undefined, `índice coerente não deve acusar staleness; veio: ${JSON.stringify(r.stale)}`);
  } finally {
    await rm(raiz, { recursive: true, force: true });
  }
});
