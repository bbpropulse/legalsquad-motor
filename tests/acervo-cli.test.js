import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acervoCli } from '../src/acervo-cli.js';
import { CAMINHO_ESTADO, gravarEstado } from '../src/acervo-estado.js';

// O CLI é camada fina — decisão está em `acervo-sync.js`, estado em
// `acervo-estado.js`. O que se testa aqui é o que só existe aqui: que os
// comandos DIZEM A VERDADE sobre o estado do mundo.
//
// O servidor de distribuição ainda não existe (SPEC §8). Um `sync` que
// respondesse "tudo em dia" sem falar com servidor nenhum seria exatamente a
// mentira que este cliente foi escrito para não contar.

function projeto() {
  return mkdtempSync(join(tmpdir(), 'legalsquad-acervo-cli-'));
}

function silenciar(fn) {
  const log = console.log;
  const err = console.error;
  const saida = [];
  console.log = (...a) => saida.push(a.join(' '));
  console.error = (...a) => saida.push(a.join(' '));
  try {
    return { resultado: fn(), saida: saida.join('\n') };
  } finally {
    console.log = log;
    console.error = err;
  }
}

test('status sem nunca ter sincronizado diz isso, e não "vazio"', () => {
  const { resultado, saida } = silenciar(() => acervoCli('status', projeto()));

  assert.equal(resultado.success, true);
  assert.match(saida, /NUNCA-SINCRONIZADO/);
});

test('status mostra o que está instalado e há quantos dias', () => {
  // O selo de frescor do §9.4. Sem ele, cache velho é indistinguível de cache
  // fresco — e num acervo jurídico isso separa citar o precedente vigente de
  // citar o superado.
  const raiz = projeto();
  gravarEstado(raiz, { packs: { 'area.criminal': '2026.07.2' } }, { sincronizadoEm: '2026-07-01T00:00:00Z' });

  const { saida } = silenciar(() => acervoCli('status', raiz, {}, Date.parse('2026-07-29T00:00:00Z')));

  assert.match(saida, /area\.criminal@2026\.07\.2/);
  assert.match(saida, /28 dia/);
});

test('cache velho recebe selo de DESATUALIZADO', () => {
  const raiz = projeto();
  gravarEstado(raiz, { packs: { 'area.criminal': '1' } }, { sincronizadoEm: '2026-01-01T00:00:00Z' });

  const { saida } = silenciar(() => acervoCli('status', raiz, {}, Date.parse('2026-07-29T00:00:00Z')));

  assert.match(saida, /DESATUALIZADO/);
});

test('estado ilegível BLOQUEIA o comando em vez de reportar vazio', () => {
  const raiz = projeto();
  mkdirSync(join(raiz, 'acervo', '_packs'), { recursive: true });
  writeFileSync(join(raiz, CAMINHO_ESTADO), '{ quebrado');

  const { resultado, saida } = silenciar(() => acervoCli('status', raiz));

  assert.equal(resultado.success, false);
  assert.match(saida, /BLOQUEADO/);
});

test('sync sem servidor configurado recusa — e diz a verdade sobre o porquê', () => {
  // Fail-closed com o motivo REAL: o servidor de distribuição ainda não existe.
  // E a mensagem precisa apontar o caminho que funciona hoje, senão o usuário
  // fica sem saída.
  const { resultado, saida } = silenciar(() => acervoCli('sync', projeto()));

  assert.equal(resultado.success, false);
  assert.match(saida, /BLOQUEADO/);
  assert.match(saida, /apply-pack/, 'precisa apontar o caminho local, que funciona hoje');
});

test('subcomando desconhecido é recusado, não ignorado', () => {
  const { resultado, saida } = silenciar(() => acervoCli('inventado', projeto()));

  assert.equal(resultado.success, false);
  assert.match(saida, /sync, status ou packs/);
});
