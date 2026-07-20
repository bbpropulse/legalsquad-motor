import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateFineAmount } from '../skills/calculadora-pena-multa/scripts/pena-multa.mjs';

function validInput() {
  return {
    calculationId: 'multa-ficticia-001',
    legalRule: {
      id: 'regra-ficticia-multa',
      version: '2026-07-09',
      description: 'Parâmetros fictícios aprovados exclusivamente para teste.',
      jurisdiction: 'BR-ficticio',
      verification: {
        status: 'verified',
        verifiedBy: 'revisor-ficticio',
        verifiedAt: '2026-07-09',
        caseApplicability: 'confirmed',
        caseApplicabilityConfirmedBy: 'revisor-ficticio',
        caseApplicabilityConfirmedAt: '2026-07-09',
      },
      sources: [{ type: 'official', url: 'https://example.gov.br/regra-ficticia', retrievedAt: '2026-07-09' }],
      parameters: {
        dayCountMin: 1,
        dayCountMax: 500,
        unitAmountMinCents: 1,
        unitAmountMaxCents: 1_000_000,
        rounding: 'nearest',
      },
    },
    facts: {
      dayCount: 11,
      unitAmountCents: 1_001,
      correctionFactorBps: 10_050,
      installments: 3,
      dayCountEvidenceRef: 'decisao-ficticia:p1',
      unitAmountEvidenceRef: 'decisao-ficticia:p2',
      correctionEvidenceRef: 'indice-ficticio:p1',
    },
  };
}

test('motor de multa produz memória reproduzível e parcelas exatas', () => {
  const result = calculateFineAmount(validInput());
  assert.equal(result.status, 'completed');
  assert.equal(result.legalReadiness, 'human_review_required');
  assert.match(result.inputHash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(result.result.baseAmountCents, 11_011);
  assert.equal(result.result.correctedAmountCents, 11_066);
  assert.deepEqual(result.result.installmentAmountsCents, [3_689, 3_689, 3_688]);
  assert.equal(result.result.installmentAmountsCents.reduce((sum, value) => sum + value, 0), 11_066);
  assert.equal(result.steps.length, 3);
});

test('motor produz hash canônico dos inputs e detecta alteração material', () => {
  const original = calculateFineAmount(validInput());
  const reordered = validInput();
  reordered.facts = Object.fromEntries(Object.entries(reordered.facts).reverse());
  const same = calculateFineAmount(reordered);
  assert.equal(same.inputHash, original.inputHash);

  const changed = validInput();
  changed.facts.dayCount += 1;
  assert.notEqual(calculateFineAmount(changed).inputHash, original.inputHash);
});

test('motor bloqueia regra não verificada', () => {
  const input = validInput();
  input.legalRule.verification.status = 'pending';
  const result = calculateFineAmount(input);
  assert.equal(result.status, 'blocked');
  assert.ok(result.blockers.some((item) => item.code === 'LEGAL_RULE_NOT_VERIFIED'));
});

test('motor bloqueia valor fora da regra e falta de âncora', () => {
  const input = validInput();
  input.facts.dayCount = 999;
  delete input.facts.unitAmountEvidenceRef;
  const result = calculateFineAmount(input);
  assert.equal(result.status, 'blocked');
  assert.ok(result.blockers.some((item) => item.code === 'INPUT_OUTSIDE_VERIFIED_RULE'));
  assert.ok(result.blockers.some((item) => item.code === 'EVIDENCE_REFERENCE_REQUIRED'));
});

test('motor não incorpora faixas jurídicas universais', () => {
  const input = validInput();
  input.legalRule.parameters.dayCountMax = 7;
  input.facts.dayCount = 7;
  const result = calculateFineAmount(input);
  assert.equal(result.status, 'completed');
  assert.equal(result.result.dayCount, 7);
});
