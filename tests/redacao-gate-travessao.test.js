import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avaliarRedacao } from '../src/redacao-gate.js';

// Regra de produto: travessão (—) na prosa REDIGIDA de peça é marca de texto
// de IA e reprova sozinho — tolerância zero, distinta da densidade dos demais
// vícios. Citação transcrita (blockquote) fica de fora: fidelidade à fonte
// não é estilo do redator. Hífen nunca casa (palavra composta, art. 1.035-A).

const ENTRADA = 'Processo 1001074-51.2018.5.02.0005, autor ACME LTDA, valor R$ 78.000,00 em 12/05/2026.';

function peca(corpo) {
  return [
    '# Contestação',
    `No processo 1001074-51.2018.5.02.0005, a ré ACME LTDA impugna o valor de R$ 78.000,00 apontado em 12/05/2026.`,
    corpo,
  ].join('\n\n');
}

test('um único travessão na prosa redigida reprova, e o motivo o nomeia', () => {
  const r = avaliarRedacao({ artefato: peca('A preliminar não prospera — o autor foi citado válido.'), entrada: ENTRADA });
  assert.equal(r.ok, false);
  assert.equal(r.sinais.vicios, 'reprovado');
  assert.ok(r.problemas.some((p) => /travessão REPROVADO/.test(p)), JSON.stringify(r.problemas));
});

test('en-dash espaçado como conector também reprova', () => {
  const r = avaliarRedacao({ artefato: peca('O contrato – assinado em 2024 – prevê multa.'), entrada: ENTRADA });
  assert.equal(r.sinais.vicios, 'reprovado');
});

test('travessão DENTRO de citação transcrita não reprova — fidelidade à fonte', () => {
  const r = avaliarRedacao({
    artefato: peca('Como decidiu o STJ:\n\n> A pretensão — simples reexame de prova — não enseja recurso especial.\n\nAplica-se ao caso.'),
    entrada: ENTRADA,
  });
  assert.equal(r.sinais.vicios, 'aprovado', JSON.stringify(r.problemas));
});

test('hífen nunca casa: palavra composta e artigo com sufixo passam ilesos', () => {
  const r = avaliarRedacao({
    artefato: peca('O art. 1.035-A e a decisão infra-legal seguem o rito. A ré é micro-empresa.'),
    entrada: ENTRADA,
  });
  assert.equal(r.sinais.vicios, 'aprovado', JSON.stringify(r.problemas));
});
