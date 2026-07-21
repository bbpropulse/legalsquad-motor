import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = new URL('..', import.meta.url).pathname;
const HOOK = join(ROOT, '.claude', 'hooks', 'verifica-citacoes.mjs');
let sandbox;

before(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'legalsquad-citation-gate-'));
});

after(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

async function put(relativePath, content) {
  const path = join(sandbox, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
  return path;
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function hook(filePath) {
  return spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ tool_input: { file_path: filePath } }),
    encoding: 'utf8',
  });
}

function manifestFor(artifactPath, content, overrides = {}) {
  return {
    schema_version: '1',
    kind: 'legalsquad.citation-gate-attestation',
    artifact: artifactPath.split('/').pop(),
    artifact_sha256: sha256(content),
    gate_status: 'aprovado',
    verification_type: 'material',
    scope: 'citacoes_materiais',
    verified_by: 'verificador-isolado-teste',
    verified_at: '2026-07-09T18:00:00-03:00',
    citations: [
      {
        title: 'Constituição, art. 5º',
        status: 'verificada',
        source_url: 'https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm',
        consulted_at: '2026-07-09T17:45:00-03:00',
      },
    ],
    ...overrides,
  };
}

test('preserva minuta interna mesmo com marcador pendente', async () => {
  const artifact = await put(
    'squads/defesa/output/peticao-minuta.md',
    '# Minuta\n\n[NÃO VERIFICADO] HC 123',
  );
  const result = hook(artifact);
  assert.equal(result.status, 0, result.stderr);
});

test('ignora arquivos fora de squads/*/output', async () => {
  const artifact = await put('acervo/peticao-final.md', '[NÃO VERIFICADO] HC 123');
  const result = hook(artifact);
  assert.equal(result.status, 0, result.stderr);
});

test('preserva relatórios internos mesmo quando o nome contém final', async () => {
  const artifact = await put(
    'squads/defesa/output/revisao-final.md',
    '# Revisão interna\n\n[NÃO VERIFICADO] devolver ao redator.',
  );
  const result = hook(artifact);
  assert.equal(result.status, 0, result.stderr);
});

test('bloqueia peça jurídica final sem manifesto', async () => {
  const artifact = await put('squads/defesa/output/recurso.md', '# Recurso\n\nArt. 5º da CF.');
  const result = hook(artifact);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /manifesto ausente ou inválido/i);
  assert.match(result.stderr, /NÃO consulta nem confirma fontes/);
});

test('bloqueia marcador pendente mesmo quando existe manifesto aprovado', async () => {
  const content = '# Petição final\n\n[NÃO VERIFICADO] HC 123.';
  const artifact = await put('squads/defesa/output/peticao-final.md', content);
  await put(
    'squads/defesa/output/peticao-final.md.citation-gate.json',
    JSON.stringify(manifestFor(artifact, content)),
  );
  const result = hook(artifact);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /marcador\(es\) de pendência/i);
});

test('bloqueia manifesto desvinculado da versão atual pelo SHA-256', async () => {
  const content = '# Parecer final\n\nArt. 5º da CF.';
  const artifact = await put('squads/defesa/output/parecer-final.md', content);
  await put(
    'squads/defesa/output/parecer-final.md.citation-gate.json',
    JSON.stringify(manifestFor(artifact, 'versão anterior')),
  );
  const result = hook(artifact);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /não corresponde ao artefato atual/i);
});

test('bloqueia falsa declaração de ausência quando detecta citação material', async () => {
  const content = '# Memoriais\n\nAplica-se o art. 155 do CPP.';
  const artifact = await put('squads/defesa/output/memoriais.md', content);
  await put(
    'squads/defesa/output/memoriais.md.citation-gate.json',
    JSON.stringify(manifestFor(artifact, content, { scope: 'sem_citacoes_materiais', citations: [] })),
  );
  const result = hook(artifact);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /aparenta conter citação material/i);
});

test('aprova sentinela estrutural com atestação material íntegra', async () => {
  const content = '# Resposta à acusação\n\nAplica-se o art. 396-A do CPP.';
  const artifact = await put('squads/defesa/output/resposta-acusacao-final.md', content);
  const manifestPath = await put(
    'squads/defesa/output/resposta-acusacao-final.md.citation-gate.json',
    JSON.stringify(manifestFor(artifact, content)),
  );

  const artifactResult = hook(artifact);
  assert.equal(artifactResult.status, 0, artifactResult.stderr);

  // Escrever o manifesto também dispara a validação do artefato a que ele se vincula.
  const manifestResult = hook(manifestPath);
  assert.equal(manifestResult.status, 0, manifestResult.stderr);
});

test('aceita atestação explícita sem citações em artefato final sem referência material', async () => {
  const content = '<!-- LEGALSQUAD:CITATION-GATE:FINAL -->\n# Pedido\n\nRequer deferimento.';
  const artifact = await put('squads/defesa/output/pedido.md', content);
  await put(
    'squads/defesa/output/pedido.md.citation-gate.json',
    JSON.stringify(manifestFor(artifact, content, { scope: 'sem_citacoes_materiais', citations: [] })),
  );
  const result = hook(artifact);
  assert.equal(result.status, 0, result.stderr);
});

test('modo --check usa a mesma política fail-closed', async () => {
  const content = '# Agravo\n\nArt. 197 da LEP.';
  const artifact = await put('squads/execucao/output/agravo-final.md', content);
  const result = spawnSync(process.execPath, [HOOK, '--check', artifact], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /manifesto ausente/i);
});

test('schema distribuído explicita que o manifesto é atestação, não consulta externa', async () => {
  const schema = JSON.parse(
    await readFile(join(ROOT, 'templates', 'scripts', 'citation-gate-manifest.schema.json'), 'utf8'),
  );
  assert.equal(schema.properties.verification_type.const, 'material');
  assert.match(schema.description, /Atestação local/);
  assert.match(schema.properties.verification_type.description, /sentinela não realiza/);
});
