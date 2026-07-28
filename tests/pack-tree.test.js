import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { lerArvore } from '../src/pack-tree.js';

// Leitura da árvore de conteúdo (SPEC §6.2). O empacotador recebe um diretório
// por argumento e o transforma em entidades-arquivo. Duas coisas não podem
// falhar aqui, e as duas têm teste:
//
//   · o `sha256` é do CONTEÚDO DECODIFICADO, não da linha do JSONL — é ele que
//     o `skill_binding` da evidência de promoção amarra (§6.8);
//   · a origem é READ-ONLY. O build lê um checkout de curador; escrever nele,
//     ainda que um `.DS_Store`, é corromper conteúdo de outra pessoa.

function criarArvore() {
  const raiz = mkdtempSync(join(tmpdir(), 'legalsquad-arvore-'));
  mkdirSync(join(raiz, 'skills', 'alfa'), { recursive: true });
  mkdirSync(join(raiz, 'node_modules', 'lixo'), { recursive: true });
  mkdirSync(join(raiz, '.git'), { recursive: true });
  writeFileSync(join(raiz, 'skills', 'alfa', 'SKILL.md'), '---\nname: alfa\n---\n\ncorpo\n');
  writeFileSync(join(raiz, 'skills', 'alfa', 'selo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]));
  writeFileSync(join(raiz, 'skills', '.DS_Store'), 'lixo do finder');
  writeFileSync(join(raiz, 'node_modules', 'lixo', 'index.js'), 'module.exports = 1;');
  writeFileSync(join(raiz, '.git', 'HEAD'), 'ref: refs/heads/main');
  return raiz;
}

/** Hash da árvore inteira — caminho, modo e bytes. Prova a invariante read-only. */
function hashDaArvore(raiz) {
  const h = createHash('sha256');
  const andar = (dir) => {
    for (const entrada of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const alvo = join(dir, entrada.name);
      if (entrada.isDirectory()) {
        h.update(`D:${relative(raiz, alvo)}\n`);
        andar(alvo);
      } else {
        h.update(`F:${relative(raiz, alvo)}:${statSync(alvo).mode}:`);
        h.update(readFileSync(alvo));
        h.update('\n');
      }
    }
  };
  andar(raiz);
  return h.digest('hex');
}

test('a árvore vira entidades-arquivo com sha256 do conteúdo decodificado', () => {
  const raiz = criarArvore();
  const conteudoDaSkill = readFileSync(join(raiz, 'skills', 'alfa', 'SKILL.md'));

  const entidades = lerArvore(raiz, ['skills/']);

  const skill = entidades.find((e) => e.path === 'skills/alfa/SKILL.md');
  assert.ok(skill, `SKILL.md tem de aparecer — recebido: ${entidades.map((e) => e.path).join(', ')}`);
  assert.equal(skill.sha256, createHash('sha256').update(conteudoDaSkill).digest('hex'));
  assert.equal(skill.bytes, conteudoDaSkill.length);
  assert.equal(skill.text, conteudoDaSkill.toString('utf8'), 'arquivo de texto viaja como texto');
  assert.equal(skill.b64, undefined, '`text` e `b64` são mutuamente exclusivos');
});

test('arquivo binário viaja em base64, com sha256 do conteúdo decodificado', () => {
  const raiz = criarArvore();
  const bytes = readFileSync(join(raiz, 'skills', 'alfa', 'selo.png'));

  const png = lerArvore(raiz, ['skills/']).find((e) => e.path === 'skills/alfa/selo.png');

  assert.ok(png);
  assert.equal(png.text, undefined);
  assert.equal(png.b64, bytes.toString('base64'));
  assert.equal(
    png.sha256,
    createHash('sha256').update(bytes).digest('hex'),
    'o sha256 é do conteúdo, não do base64 — senão a verificação dependeria de como o arquivo viajou'
  );
});

test('artefatos de SO e diretórios de máquina ficam de fora', () => {
  const raiz = criarArvore();

  const caminhos = lerArvore(raiz, ['skills/', 'node_modules/', '.git/']).map((e) => e.path);

  assert.equal(caminhos.some((p) => p.includes('.DS_Store')), false, '.DS_Store não é conteúdo');
  assert.equal(caminhos.some((p) => p.startsWith('node_modules/')), false, 'node_modules não é conteúdo');
  assert.equal(caminhos.some((p) => p.startsWith('.git/')), false, '.git não é conteúdo');
});

test('o diretório de origem fica byte a byte idêntico depois da leitura', () => {
  // Invariante read-only (aceite 2 do F1), provada por hash da árvore — não por
  // `git status` de um repositório externo. O empacotador lê conteúdo autorado
  // por um curador; escrever nele, ainda que um arquivo temporário, é corromper
  // trabalho de outra pessoa.
  const raiz = criarArvore();
  const antes = hashDaArvore(raiz);

  lerArvore(raiz, ['skills/', 'node_modules/', '.git/']);

  assert.equal(hashDaArvore(raiz), antes, 'o build NÃO pode escrever na origem');
});
