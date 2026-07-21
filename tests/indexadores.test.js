// Indexadores com raiz parametrizada.
//
// Bloqueio que estes testes destravam: `scripts/indexar-skills.js` e
// `scripts/indexar-acervo.js` resolviam a raiz por `__dirname/..`, o que impedia
// (a) o `pack-apply` do F3 apontá-los ao projeto do usuário e (b) testá-los
// contra fixture. Agora aceitam `--root <dir>` (e um positional), mantendo o
// default antigo para quem chama sem argumento.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AREA_DEMO } from './fixtures/caminhos.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const INDEXAR_SKILLS = join(ROOT, 'scripts', 'indexar-skills.js');
const INDEXAR_ACERVO = join(ROOT, 'scripts', 'indexar-acervo.js');
const INDEXAR_ACERVO_TEMPLATE = join(ROOT, 'templates', 'scripts', 'indexar-acervo.mjs');

// Cópia descartável da fixture: os indexadores ESCREVEM `_index.yaml`, e a
// fixture versionada não pode ser suja por uma rodada de teste.
function copiaDaFixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'lsq-indexadores-'));
  cpSync(AREA_DEMO, dir, { recursive: true });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function tmpVazio(t) {
  const dir = mkdtempSync(join(tmpdir(), 'lsq-indexadores-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// spawnSync (e não execFileSync) porque o stderr do caso de SUCESSO importa:
// é lá que o indexador avisa sobre packs que não sabe abrir.
function roda(script, args, { esperaFalha = false } = {}) {
  const saida = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  const resultado = {
    code: saida.status ?? 1,
    stdout: String(saida.stdout || ''),
    stderr: String(saida.stderr || ''),
  };
  const rotulo = `${script} ${args.join(' ')}`;
  if (esperaFalha) {
    assert.notEqual(resultado.code, 0, `esperava falha em ${rotulo}`);
  } else {
    assert.equal(
      resultado.code,
      0,
      `${rotulo} falhou inesperadamente:\n${resultado.stdout}\n${resultado.stderr}`,
    );
  }
  return resultado;
}

// --- indexar-skills --------------------------------------------------------

test('indexar-skills: --root reindexa a fixture e reproduz o índice versionado', (t) => {
  const raiz = copiaDaFixture(t);
  const antes = readFileSync(join(AREA_DEMO, 'skills', '_index.yaml'), 'utf8');
  writeFileSync(join(raiz, 'skills', '_index.yaml'), '# lixo\n', 'utf8');

  const { stdout } = roda(INDEXAR_SKILLS, ['--root', raiz]);

  assert.equal(readFileSync(join(raiz, 'skills', '_index.yaml'), 'utf8'), antes);
  assert.match(stdout, /Indexadas \d+ skills/);
});

test('indexar-skills: --root=DIR (forma colada) é aceito igual', (t) => {
  const raiz = copiaDaFixture(t);
  const antes = readFileSync(join(AREA_DEMO, 'skills', '_index.yaml'), 'utf8');
  writeFileSync(join(raiz, 'skills', '_index.yaml'), '# lixo\n', 'utf8');

  roda(INDEXAR_SKILLS, [`--root=${raiz}`]);

  assert.equal(readFileSync(join(raiz, 'skills', '_index.yaml'), 'utf8'), antes);
});

test('indexar-skills: --check valida a raiz passada, não a do repo', (t) => {
  const raiz = copiaDaFixture(t);
  roda(INDEXAR_SKILLS, ['--root', raiz]);
  // A fixture não traz manifesto de integração de área; o --check tem de
  // reclamar DESSA raiz (código do validador) e não da ausência de `skills/`
  // no repo motor — é isso que prova que a flag foi respeitada.
  const { stderr } = roda(INDEXAR_SKILLS, ['--root', raiz, '--check'], { esperaFalha: true });
  assert.match(stderr, /\[missing-integration-manifest\]/);
  assert.doesNotMatch(stderr, /Pasta de skills não existe/);
});

test('indexar-skills: raiz sem skills/ falha com mensagem clara, não com stack', (t) => {
  const raiz = tmpVazio(t);
  const { stderr } = roda(INDEXAR_SKILLS, ['--root', raiz], { esperaFalha: true });
  assert.match(stderr, /skills/);
  assert.match(stderr, /não (existe|encontrad)/i);
  assert.doesNotMatch(stderr, /at Object\.<anonymous>|ENOENT: no such file/);
});

test('indexar-skills: sem --root mantém o default (raiz do próprio repo)', () => {
  // Este repo é o motor puro: não tem `skills/`. O default preservado tem de
  // reclamar exatamente desse caminho — prova de que não mudou de raiz.
  const { stderr } = roda(INDEXAR_SKILLS, [], { esperaFalha: true });
  assert.match(stderr, new RegExp(join(ROOT, 'skills').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

// --- indexar-acervo --------------------------------------------------------

test('indexar-acervo: --root reindexa a fixture e reproduz o índice versionado', (t) => {
  const raiz = copiaDaFixture(t);
  const antes = readFileSync(join(AREA_DEMO, 'acervo', '_index.yaml'), 'utf8');
  writeFileSync(join(raiz, 'acervo', '_index.yaml'), '# lixo\n', 'utf8');

  const { stdout } = roda(INDEXAR_ACERVO, ['--root', raiz]);
  assert.equal(readFileSync(join(raiz, 'acervo', '_index.yaml'), 'utf8'), antes);
  assert.match(stdout, /Indexados 3 arquivos/);
});

test('indexar-acervo: positional também vale como raiz', (t) => {
  const raiz = copiaDaFixture(t);
  const antes = readFileSync(join(AREA_DEMO, 'acervo', '_index.yaml'), 'utf8');
  writeFileSync(join(raiz, 'acervo', '_index.yaml'), '# lixo\n', 'utf8');
  roda(INDEXAR_ACERVO, [raiz]);
  assert.equal(readFileSync(join(raiz, 'acervo', '_index.yaml'), 'utf8'), antes);
});

test('indexar-acervo: o vault-map segue a raiz passada', (t) => {
  const raiz = copiaDaFixture(t);
  writeFileSync(
    join(raiz, 'acervo', 'jurisprudencia', 'tribunal-demo', 'DEMO_2023.md'),
    '---\nconfianca: DISCOVERY_ONLY\n---\n\n# Demo com link\n\nVer [[Nota Que Nao Existe]].\n',
    'utf8',
  );
  rmSync(join(raiz, 'acervo', 'legislacao'), { recursive: true, force: true });

  const semVault = roda(INDEXAR_ACERVO, ['--root', raiz]);
  assert.match(semVault.stdout, /QUEBRADOS/);

  mkdirSync(join(raiz, '_legalsquad', '_memory'), { recursive: true });
  writeFileSync(
    join(raiz, '_legalsquad', '_memory', 'vault-map.yaml'),
    'vault_root: "/algum/vault"\n',
    'utf8',
  );

  const comVault = roda(INDEXAR_ACERVO, ['--root', raiz]);
  assert.match(comVault.stdout, /vault configurado/);
  assert.doesNotMatch(comVault.stdout, /QUEBRADOS/);
});

test('indexar-acervo: --strict falha quando há wikilink quebrado sob a raiz dada', (t) => {
  const raiz = copiaDaFixture(t);
  writeFileSync(
    join(raiz, 'acervo', 'jurisprudencia', 'tribunal-demo', 'DEMO_2023.md'),
    '---\nconfianca: DISCOVERY_ONLY\n---\n\n# Demo\n\n[[Inexistente]]\n',
    'utf8',
  );
  rmSync(join(raiz, 'acervo', 'legislacao'), { recursive: true, force: true });
  const { code } = roda(INDEXAR_ACERVO, ['--root', raiz, '--strict'], { esperaFalha: true });
  assert.equal(code, 1);
});

test('indexar-acervo: raiz sem acervo/ falha com mensagem clara, não com stack', (t) => {
  const raiz = tmpVazio(t);
  const { stderr } = roda(INDEXAR_ACERVO, ['--root', raiz], { esperaFalha: true });
  assert.match(stderr, /acervo/);
  assert.match(stderr, /não (existe|encontrad)/i);
  assert.doesNotMatch(stderr, /ENOENT: no such file/);
});

test('indexar-acervo: sem --root mantém o default (raiz do próprio repo)', () => {
  const { stderr } = roda(INDEXAR_ACERVO, [], { esperaFalha: true });
  assert.match(stderr, new RegExp(join(ROOT, 'acervo').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

// "Não sei ler" ≠ "não existe": um pack do SPEC (.jsonl.zst) não é indexável
// hoje, mas não pode sumir no mesmo silêncio de um arquivo irrelevante.
test('indexar-acervo: pack .jsonl.zst é reportado como não suportado, não ignorado em silêncio', (t) => {
  const raiz = copiaDaFixture(t);
  writeFileSync(join(raiz, 'acervo', 'jurisprudencia', 'lote-2026.jsonl.zst'), 'binário', 'utf8');
  const { stdout, stderr } = roda(INDEXAR_ACERVO, ['--root', raiz]);
  const saida = `${stdout}\n${stderr}`;
  assert.match(saida, /lote-2026\.jsonl\.zst/);
  assert.match(saida, /pack/i);
});

// --- paridade --------------------------------------------------------------

test('indexar-acervo: a cópia distribuída aceita a mesma raiz parametrizada', (t) => {
  const raiz = copiaDaFixture(t);
  const antes = readFileSync(join(AREA_DEMO, 'acervo', '_index.yaml'), 'utf8');
  writeFileSync(join(raiz, 'acervo', '_index.yaml'), '# lixo\n', 'utf8');
  roda(INDEXAR_ACERVO_TEMPLATE, ['--root', raiz]);
  assert.equal(readFileSync(join(raiz, 'acervo', '_index.yaml'), 'utf8'), antes);
});

test('indexar-acervo distribuído não importa nada de src/ (projeto do usuário não tem src/)', () => {
  const conteudo = readFileSync(INDEXAR_ACERVO_TEMPLATE, 'utf8');
  assert.doesNotMatch(conteudo, /from\s+['"][^'"]*\/src\//);
});
