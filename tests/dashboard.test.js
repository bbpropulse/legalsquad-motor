import test from 'node:test';
import assert from 'node:assert/strict';

import { isAllowedOrigin } from '../dashboard/src/plugin/originGuard.ts';
import { validateSquadState } from '../dashboard/src/lib/validateState.ts';
import { staleFor, STALE_AFTER_MS } from '../dashboard/src/lib/freshness.ts';

// ── estado válido de referência (contrato: _legalsquad/core/state.schema.json) ──
function estadoValido(over = {}) {
  return {
    squad: 'demo',
    status: 'running',
    step: { current: 1, total: 3, label: 'passo' },
    agents: [{ id: 'a1', name: 'Agente', icon: '', status: 'working', desk: { col: 1, row: 1 } }],
    handoff: null,
    startedAt: '2026-07-21T10:00:00.000Z',
    updatedAt: '2026-07-21T10:00:00.000Z',
    ...over,
  };
}

// ── Defeito 1: WebSocket sem checagem de Origin ────────────────────────────────
test('origin guard aceita apenas a origem do proprio dev server', () => {
  assert.equal(isAllowedOrigin('http://localhost:5173', 'localhost:5173'), true);
  assert.equal(isAllowedOrigin('http://127.0.0.1:5173', '127.0.0.1:5173'), true);
  // WebSocket nao obedece same-origin: sem esta checagem qualquer site le o snapshot.
  assert.equal(isAllowedOrigin('https://evil.example', 'localhost:5173'), false);
  // Mesma maquina, porta diferente = outra origem.
  assert.equal(isAllowedOrigin('http://localhost:4321', 'localhost:5173'), false);
});

test('origin guard e fail-closed com Origin ausente, vazio ou ilegivel', () => {
  assert.equal(isAllowedOrigin(undefined, 'localhost:5173'), false);
  assert.equal(isAllowedOrigin('', 'localhost:5173'), false);
  assert.equal(isAllowedOrigin('null', 'localhost:5173'), false);
  assert.equal(isAllowedOrigin('nao-e-url', 'localhost:5173'), false);
  assert.equal(isAllowedOrigin('http://localhost:5173', undefined), false);
});

// ── Defeitos 2 e 4: estado invalido precisa ser DISTINGUIVEL, nao silencioso ────
test('validateSquadState aceita o estado do contrato', () => {
  const r = validateSquadState(estadoValido());
  assert.equal(r.ok, true);
});

test('validateSquadState devolve motivo legivel para cada campo quebrado', () => {
  const casos = [
    [estadoValido({ status: 'rodando' }), /status/],
    [estadoValido({ step: {} }), /step/],
    [estadoValido({ agents: 'nenhum' }), /agents/],
    [estadoValido({ agents: [{ id: 'a1', name: 'x', status: 'working' }] }), /desk/],
    [null, /objeto/],
    ['[]', /objeto/],
  ];
  for (const [entrada, padrao] of casos) {
    const r = validateSquadState(entrada);
    assert.equal(r.ok, false, `deveria rejeitar: ${JSON.stringify(entrada)}`);
    assert.match(r.reason, padrao);
    assert.ok(r.reason.length > 0);
  }
});

test('validateSquadState valida handoff (defeito 4: handoff.message derruba a cena)', () => {
  assert.equal(validateSquadState(estadoValido({ handoff: null })).ok, true);
  assert.equal(
    validateSquadState(
      estadoValido({ handoff: { from: 'a1', to: 'a2', message: 'oi', completedAt: 'x' } })
    ).ok,
    true
  );

  const semMessage = validateSquadState(
    estadoValido({ handoff: { from: 'a1', to: 'a2', completedAt: 'x' } })
  );
  assert.equal(semMessage.ok, false);
  assert.match(semMessage.reason, /handoff/);

  const messageNumero = validateSquadState(
    estadoValido({ handoff: { from: 'a1', to: 'a2', message: 42, completedAt: 'x' } })
  );
  assert.equal(messageNumero.ok, false);
  assert.match(messageNumero.reason, /handoff/);
});

test('validateSquadState exige updatedAt (frescor do defeito 5 depende dele)', () => {
  const r = validateSquadState(estadoValido({ updatedAt: undefined }));
  assert.equal(r.ok, false);
  assert.match(r.reason, /updatedAt/);
});

// ── Defeito 5: execucao morta renderizada como viva ────────────────────────────
test('staleFor devolve null enquanto o estado esta fresco', () => {
  const agora = Date.parse('2026-07-21T10:00:00.000Z');
  assert.equal(staleFor('2026-07-21T09:59:30.000Z', agora), null);
});

test('staleFor devolve a idade quando passa do limite', () => {
  const agora = Date.parse('2026-07-21T10:00:00.000Z');
  const idade = staleFor('2026-07-21T09:50:00.000Z', agora);
  assert.equal(idade, 10 * 60 * 1000);
  assert.ok(idade > STALE_AFTER_MS);
});

test('staleFor nao inventa idade a partir de updatedAt ausente ou ilegivel', () => {
  const agora = Date.parse('2026-07-21T10:00:00.000Z');
  assert.equal(staleFor(undefined, agora), null);
  assert.equal(staleFor('ontem', agora), null);
  // Relogio adiantado no escritor nao vira "morto".
  assert.equal(staleFor('2026-07-21T10:05:00.000Z', agora), null);
});
