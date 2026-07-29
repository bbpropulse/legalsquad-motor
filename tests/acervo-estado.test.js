import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CAMINHO_ESTADO, gravarEstado, lerEstado } from '../src/acervo-estado.js';

// Estado do cache do sync: o que está instalado, em que versão
// (`acervo/_packs/_manifest.json`).
//
// É um arquivo pequeno com uma responsabilidade grande: ele decide o que o
// próximo sync vai considerar em dia. Errar aqui não dá erro — dá silêncio.

function projeto() {
  return mkdtempSync(join(tmpdir(), 'legalsquad-estado-'));
}

test('primeira execução, sem estado, é normal — devolve vazio', () => {
  // Nunca sincronizou ainda. Isso não é falha, é o começo.
  const raiz = projeto();

  const estado = lerEstado(raiz);

  assert.deepEqual(estado.packs, {});
  assert.equal(estado.novo, true, 'quem chama precisa poder distinguir "vazio" de "nunca existiu"');
});

test('estado ILEGÍVEL falha ruidosamente — jamais vira "vazio"', () => {
  // O teste que sustenta o módulo. Tratar corrompido como vazio faria o sync
  // rebaixar tudo: baixaria de novo o corpus inteiro E perderia o rastro do que
  // já está no disco, deixando arquivos instalados que o estado não conhece.
  //
  // É o mesmo princípio que o motor aplica em toda parte: "não sei ler" nunca
  // pode se apresentar como "não existe".
  const raiz = projeto();
  mkdirSync(join(raiz, 'acervo', '_packs'), { recursive: true });
  writeFileSync(join(raiz, CAMINHO_ESTADO), '{ isto não é json');

  assert.throws(() => lerEstado(raiz), /_manifest\.json/);
});

test('estado com `packs` de tipo errado também é recusado', () => {
  // JSON válido não é estado válido. Um `packs` que veio como lista faria o
  // `pack_id in packs` do planejador responder besteira, em silêncio.
  const raiz = projeto();
  mkdirSync(join(raiz, 'acervo', '_packs'), { recursive: true });
  writeFileSync(join(raiz, CAMINHO_ESTADO), '{"packs": ["area.criminal"]}');

  assert.throws(() => lerEstado(raiz), /packs/);
});

test('grava e relê o que foi instalado', () => {
  const raiz = projeto();

  gravarEstado(raiz, { packs: { 'area.criminal': '2026.07.2' } });

  const estado = lerEstado(raiz);
  assert.equal(estado.packs['area.criminal'], '2026.07.2');
  assert.equal(estado.novo, false);
});

test('a gravação é atômica — não deixa temporário nem arquivo pela metade', () => {
  // Mesma razão do `pack-apply`: estado meio-escrito é pior que estado antigo,
  // porque o antigo pelo menos é consistente.
  const raiz = projeto();

  gravarEstado(raiz, { packs: { 'area.alfa': '1' } });
  gravarEstado(raiz, { packs: { 'area.alfa': '2' } });

  const dir = readdirSync(join(raiz, 'acervo', '_packs'));
  assert.deepEqual(dir, ['_manifest.json'], 'só o arquivo final pode restar');
  assert.equal(JSON.parse(readFileSync(join(raiz, CAMINHO_ESTADO), 'utf8')).packs['area.alfa'], '2');
});

test('o estado registra QUANDO sincronizou — é o que alimenta o selo de frescor', () => {
  // O `§9.4` promete "desatualizado há N dias" na licença vencida. Sem carimbo
  // de tempo no estado não há N.
  const raiz = projeto();

  gravarEstado(raiz, { packs: {} }, { sincronizadoEm: '2026-07-29T00:00:00Z' });

  assert.equal(lerEstado(raiz).sincronizado_em, '2026-07-29T00:00:00Z');
});
