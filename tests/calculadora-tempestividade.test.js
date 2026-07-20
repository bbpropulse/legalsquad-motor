import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularTempestividade } from '../skills/calculadora-tempestividade/scripts/tempestividade.mjs';

// Âncora: 2024-01-01 é SEGUNDA. 01-06 sáb, 01-07 dom, 01-08 seg.

test('embargos (2 dias) em dia útil: limite sem prorrogação', () => {
  const r = calcularTempestividade({ tipo: 'embargos_declaracao', data_intimacao: '2024-01-01' });
  assert.equal(r.prazo_dias, 2);
  assert.equal(r.data_limite, '2024-01-03'); // qua, útil
  assert.equal(r.prorrogado_por_dia_nao_util, false);
});

test('apelação (5 dias): vencimento no sábado prorroga para segunda', () => {
  const r = calcularTempestividade({ tipo: 'apelacao', data_intimacao: '2024-01-01' });
  assert.equal(r.vencimento_bruto, '2024-01-06'); // sábado
  assert.equal(r.data_limite, '2024-01-08'); // segunda
  assert.equal(r.prorrogado_por_dia_nao_util, true);
});

test('feriado no vencimento prorroga para o próximo útil', () => {
  const r = calcularTempestividade({ prazo_dias: 2, data_intimacao: '2024-01-01', feriados: ['2024-01-03'] });
  assert.equal(r.vencimento_bruto, '2024-01-03');
  assert.equal(r.data_limite, '2024-01-04');
});

test('prazo em dobro (Defensoria) duplica o prazo', () => {
  const r = calcularTempestividade({ tipo: 'apelacao', data_intimacao: '2024-01-01', prazo_dobro: true });
  assert.equal(r.prazo_dias, 10);
  assert.match(r.avisos.join(' '), /DOBRO/);
});

test('tempestividade: protocolo no limite é tempestivo; um dia depois, não', () => {
  const dentro = calcularTempestividade({ tipo: 'apelacao', data_intimacao: '2024-01-01', data_protocolo: '2024-01-08' });
  assert.equal(dentro.tempestivo, true);
  assert.equal(dentro.dias_de_folga, 0);
  const fora = calcularTempestividade({ tipo: 'apelacao', data_intimacao: '2024-01-01', data_protocolo: '2024-01-09' });
  assert.equal(fora.tempestivo, false);
});

test('intimação em dia não útil desloca o início para o próximo útil', () => {
  const r = calcularTempestividade({ tipo: 'apelacao', data_intimacao: '2024-01-06' }); // sábado
  assert.equal(r.inicio_contagem, '2024-01-08'); // segunda
});

test('tipo desconhecido sem prazo_dias lança erro', () => {
  assert.throws(() => calcularTempestividade({ tipo: 'inexistente', data_intimacao: '2024-01-01' }), /prazo_dias ou um tipo/);
});
