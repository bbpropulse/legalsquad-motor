import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularDosimetria, fmt, fracao } from '../skills/calculadora-dosimetria/scripts/dosimetria.mjs';

test('formatação de pena (mês=30d, ano=360d)', () => {
  assert.equal(fmt(48), '4 anos');
  assert.equal(fmt(24), '2 anos');
  assert.equal(fmt(56), '4 anos, 8 meses');
  assert.equal(fmt(0), '0 dia');
});

test('frações aceitam "1/6", "1/3" e decimal', () => {
  assert.ok(Math.abs(fracao('1/6') - 1 / 6) < 1e-9);
  assert.ok(Math.abs(fracao('1/2') - 0.5) < 1e-9);
  assert.equal(fracao(0.25), 0.25);
});

test('roubo tentado: base mín, agravante+atenuante compensam, tentativa 1/2', () => {
  const r = calcularDosimetria({
    pena_min_meses: 48, pena_max_meses: 120,
    fase1: { pena_base_meses: 48 },
    fase2: [
      { tipo: 'agravante', nome: 'reincidência', fracao: '1/6' },
      { tipo: 'atenuante', nome: 'confissão', fracao: '1/6' },
    ],
    fase3: [{ tipo: 'diminuicao', nome: 'tentativa', fracao: '1/2' }],
  });
  assert.equal(r.pena_base.meses, 48);
  assert.equal(r.pena_provisoria.meses, 48); // 48+8-8
  assert.equal(r.pena_definitiva.meses, 24); // 48/2
  assert.equal(r.pena_definitiva.formatada, '2 anos');
});

test('Súmula 231: atenuante não leva abaixo do mínimo do tipo', () => {
  const r = calcularDosimetria({
    pena_min_meses: 48, pena_max_meses: 120,
    fase1: { pena_base_meses: 48 },
    fase2: [{ tipo: 'atenuante', nome: 'menoridade', fracao: '1/6' }],
  });
  assert.equal(r.pena_provisoria.meses, 48); // travado no mínimo
  const passo2 = r.passos.find((p) => p.fase === 2 && p.nota);
  assert.match(passo2.nota, /Súmula 231/);
});

test('3ª fase PODE ultrapassar o máximo do tipo', () => {
  const r = calcularDosimetria({
    pena_min_meses: 48, pena_max_meses: 120,
    fase1: { pena_base_meses: 120 },
    fase3: [{ tipo: 'aumento', nome: 'concurso formal', fracao: '1/2' }],
  });
  assert.equal(r.pena_definitiva.meses, 180); // 120 × 1.5, acima do máximo (permitido)
});

test('regime e substituição: 2 anos, primário, sem violência → aberto + substituível', () => {
  const r = calcularDosimetria({
    pena_min_meses: 12, pena_max_meses: 48,
    fase1: { pena_base_meses: 24 },
    reincidente: false, violencia_grave_ameaca: false,
  });
  assert.match(r.regime_inicial_sugerido, /aberto/);
  assert.equal(r.substituicao_art44.elegivel, true);
});

test('reincidente com pena > 8 anos → fechado; substituição negada', () => {
  const r = calcularDosimetria({
    pena_min_meses: 96, pena_max_meses: 180,
    fase1: { pena_base_meses: 120 }, // 10 anos
    reincidente: true, violencia_grave_ameaca: true,
  });
  assert.match(r.regime_inicial_sugerido, /fechado/);
  assert.equal(r.substituicao_art44.elegivel, false);
});

test('pena-base fora dos limites do tipo lança erro', () => {
  assert.throws(() => calcularDosimetria({
    pena_min_meses: 48, pena_max_meses: 120, fase1: { pena_base_meses: 200 },
  }), /fora dos limites/);
});

test('limites do tipo inválidos lançam erro', () => {
  assert.throws(() => calcularDosimetria({ pena_min_meses: 120, pena_max_meses: 48 }), /válidos/);
});

test('pena-base não numérica (NaN) lança erro em vez de sair "0 dia"', () => {
  assert.throws(() => calcularDosimetria({
    pena_min_meses: 48, pena_max_meses: 120, fase1: { pena_base_meses: 'abc' },
  }), /inválida/);
  assert.throws(() => calcularDosimetria({
    pena_min_meses: 48, pena_max_meses: 120, fase1: { circunstancias_desfavoraveis: 'x' },
  }), /circunstancias_desfavoraveis/);
});

test('crime culposo: substituição cabe qualquer que seja a pena (art. 44 I)', () => {
  const r = calcularDosimetria({
    pena_min_meses: 24, pena_max_meses: 96,
    fase1: { pena_base_meses: 72 }, // 6 anos (> 4)
    culposo: true, reincidente: false,
  });
  assert.equal(r.substituicao_art44.elegivel, true); // culposo dispensa o teto de 4 anos
});
