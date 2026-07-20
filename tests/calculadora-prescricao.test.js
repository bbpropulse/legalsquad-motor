import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularPrescricao, prazoArt109, penaEmAnos, idadeEm } from '../skills/calculadora-prescricao/scripts/prescricao.mjs';

test('art. 109 — fronteiras dos prazos', () => {
  assert.equal(prazoArt109(20), 20);   // > 12
  assert.equal(prazoArt109(12), 16);   // > 8 e ≤ 12
  assert.equal(prazoArt109(8), 12);    // > 4 e ≤ 8
  assert.equal(prazoArt109(4), 8);     // > 2 e ≤ 4
  assert.equal(prazoArt109(4.01), 12); // acabou de passar de 4
  assert.equal(prazoArt109(1), 4);     // = 1
  assert.equal(prazoArt109(0.5), 3);   // < 1 (pós Lei 12.234)
  assert.equal(prazoArt109(0.5, true), 2); // < 1, fato pré-2010
});

test('pena em anos a partir de {anos,meses,dias}', () => {
  assert.ok(Math.abs(penaEmAnos({ anos: 1, meses: 6 }) - 1.5) < 1e-9);
  assert.equal(penaEmAnos(4), 4);
});

test('PPP abstrata: furto (máx 4 anos → prazo 8) prescreve entre fato e recebimento tardio', () => {
  const r = calcularPrescricao({
    modalidade: 'PPP_abstrata', pena: { anos: 4 },
    data_fato: '2010-01-01',
    marcos: [{ tipo: 'recebimento_denuncia', data: '2019-06-01' }],
  });
  assert.equal(r.prazo_aplicavel_anos, 8);
  assert.equal(r.prescrito, true);
  assert.equal(r.intervalos[0].prescrito_neste_intervalo, true);
});

test('PPP abstrata: mesmos prazos, recebimento a tempo → não prescreve', () => {
  const r = calcularPrescricao({
    modalidade: 'PPP_abstrata', pena: { anos: 4 },
    data_fato: '2018-01-01',
    marcos: [{ tipo: 'recebimento_denuncia', data: '2020-01-01' }],
  });
  assert.equal(r.prescrito, false);
});

test('art. 115: menor de 21 no fato reduz o prazo à metade e faz prescrever', () => {
  const base = {
    modalidade: 'PPP_abstrata', pena: { anos: 4 },
    data_fato: '2018-06-01',
    marcos: [{ tipo: 'recebimento_denuncia', data: '2023-01-01' }],
  };
  const semReducao = calcularPrescricao(base);
  assert.equal(semReducao.prescrito, false); // prazo 8, gap ~4,6

  const comReducao = calcularPrescricao({ ...base, reu_data_nascimento: '2000-01-01' });
  assert.equal(comReducao.prazo_aplicavel_anos, 4); // metade de 8
  assert.equal(comReducao.prescrito, true);
  assert.match(comReducao.avisos.join(' '), /Art\. 115/);
});

test('PPE reincidente: prazo do art. 109 aumentado de 1/3 (art. 110)', () => {
  const r = calcularPrescricao({ modalidade: 'PPE', pena: { anos: 4 }, reincidente: true, data_fato: '2020-01-01', marcos: [] });
  assert.ok(Math.abs(r.prazo_aplicavel_anos - 8 * (4 / 3)) < 0.01);
  assert.match(r.avisos.join(' '), /Art\. 110/);
});

test('retroativa pós-2010 recebe o aviso da vedação (Lei 12.234)', () => {
  const r = calcularPrescricao({ modalidade: 'PPP_retroativa', pena: { anos: 2 }, data_fato: '2015-01-01', marcos: [] });
  assert.match(r.avisos.join(' '), /12\.234/);
});

test('marcos fora de ordem cronológica lançam erro', () => {
  assert.throws(() => calcularPrescricao({
    pena: { anos: 4 }, data_fato: '2020-01-01',
    marcos: [{ tipo: 'sentenca', data: '2019-01-01' }],
  }), /fora de ordem/);
});

test('idadeEm calcula idade corretamente', () => {
  assert.equal(idadeEm(new Date('2000-06-01T00:00:00Z'), new Date('2018-05-31T00:00:00Z')), 17);
  assert.equal(idadeEm(new Date('2000-06-01T00:00:00Z'), new Date('2018-06-01T00:00:00Z')), 18);
});

test('art. 10 CP: inclui o dia do começo — 4 anos de 01/01/2010 consumam-se em 31/12/2013', () => {
  // pena 2 anos → prazo 4 anos (art. 109 V). Consumação no dia-espelho menos 1.
  const base = { modalidade: 'PPP_abstrata', pena: { anos: 2 }, data_fato: '2010-01-01' };
  const noDia = calcularPrescricao({ ...base, marcos: [{ tipo: 'marco', data: '2013-12-31' }] });
  assert.equal(noDia.intervalos[0].data_consumacao_prescricao, '2013-12-31');
  assert.equal(noDia.prescrito, true); // marco na data de consumação = prescrito
  const vespera = calcularPrescricao({ ...base, marcos: [{ tipo: 'marco', data: '2013-12-30' }] });
  assert.equal(vespera.prescrito, false); // véspera ainda não prescrita
});

test('art. 115: septuagenário (70 completos) na sentença aplica a metade + aviso', () => {
  const r = calcularPrescricao({
    modalidade: 'PPP_abstrata', pena: { anos: 8 }, // prazo 12 anos
    data_fato: '2015-01-01', reu_data_nascimento: '1945-01-01', data_sentenca: '2015-06-01',
    marcos: [],
  });
  assert.equal(r.prazo_aplicavel_anos, 6); // metade de 12
  assert.match(r.avisos.join(' '), /70 anos completos/);
});
