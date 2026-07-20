import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { calculateExecutoryLimitation } from '../scripts/legal-calculators/executory-limitation-engine.mjs';
import { calculateFractionDate } from '../scripts/legal-calculators/fraction-date-engine.mjs';
import { calculateRemission } from '../scripts/legal-calculators/remission-engine.mjs';

const definitions = [
  {
    engine: 'fraction-date',
    calculator: calculateFractionDate,
    fixtureUrl: new URL('./gold/legal-calculators/fraction-date.json', import.meta.url),
  },
  {
    engine: 'remission',
    calculator: calculateRemission,
    fixtureUrl: new URL('./gold/legal-calculators/remission.json', import.meta.url),
  },
  {
    engine: 'executory-limitation',
    calculator: calculateExecutoryLimitation,
    fixtureUrl: new URL('./gold/legal-calculators/executory-limitation.json', import.meta.url),
  },
];

function loadFixture(url) {
  return JSON.parse(readFileSync(url, 'utf8'));
}

function assertSubset(actual, expected, path = '$') {
  if (expected === null || typeof expected !== 'object') {
    assert.deepEqual(actual, expected, `valor divergente em ${path}`);
    return;
  }
  if (Array.isArray(expected)) {
    assert.deepEqual(actual, expected, `lista divergente em ${path}`);
    return;
  }
  assert.ok(actual !== null && typeof actual === 'object', `objeto ausente em ${path}`);
  for (const [key, value] of Object.entries(expected)) {
    assertSubset(actual[key], value, `${path}.${key}`);
  }
}

for (const definition of definitions) {
  const fixture = loadFixture(definition.fixtureUrl);
  assert.equal(fixture.engine, definition.engine);

  for (const goldCase of fixture.cases) {
    test(`gold ${definition.engine}: ${goldCase.id}`, () => {
      const output = definition.calculator(structuredClone(goldCase.input));

      assert.equal(output.schemaVersion, 'criminalsquad.legal-calculation-memory.v1');
      assert.equal(output.engine.id, definition.engine);
      assert.equal(output.status, goldCase.expect.status);
      assert.ok(output.warnings.some((warning) => warning.code === 'HUMAN_REVIEW_REQUIRED'));
      assert.ok(output.warnings.some((warning) => warning.code === 'CALLER_ATTESTATION_ONLY'));

      const blockerCodes = output.blockers.map((blocker) => blocker.code);
      for (const expectedCode of goldCase.expect.blockerCodes) {
        assert.ok(blockerCodes.includes(expectedCode), `bloqueio ${expectedCode} ausente; recebidos: ${blockerCodes.join(', ')}`);
      }

      if (output.status === 'completed') {
        assert.match(output.inputHash, /^sha256:[a-f0-9]{64}$/, `${definition.engine}/${goldCase.id}: inputHash`);
        assert.equal(output.legalReadiness, 'human_review_required', `${definition.engine}/${goldCase.id}: legalReadiness`);
        assert.ok(output.steps.length > 0, 'a memória concluída deve registrar passos');
        assertSubset(output.result, goldCase.expect.result);
      } else {
        assert.equal(output.result, null);
      }

      if (goldCase.expect.ignoredEventIds) {
        assert.deepEqual(output.result.ignoredEvents.map((event) => event.id), goldCase.expect.ignoredEventIds);
      }

      const serialized = JSON.stringify(output);
      assert.deepEqual(JSON.parse(serialized), output, 'a memória deve ser JSON serializável sem perda');
    });
  }

  test(`${definition.engine}: recusa regra meramente pendente`, () => {
    const validCase = fixture.cases.find((goldCase) => goldCase.expect.status === 'completed');
    const input = structuredClone(validCase.input);
    input.calculationId = `${definition.engine}-unverified-guard`;
    input.legalRule.verification.status = 'pending';

    const output = definition.calculator(input);
    assert.equal(output.status, 'blocked');
    assert.ok(output.blockers.some((blocker) => blocker.code === 'LEGAL_RULE_NOT_VERIFIED'));
    assert.equal(output.result, null);
  });
}

test('motores não incorporam uma lei ou fração penal como regra universal', () => {
  const scriptUrls = [
    new URL('../scripts/legal-calculators/fraction-date-engine.mjs', import.meta.url),
    new URL('../scripts/legal-calculators/remission-engine.mjs', import.meta.url),
    new URL('../scripts/legal-calculators/executory-limitation-engine.mjs', import.meta.url),
  ];
  const source = scriptUrls.map((url) => readFileSync(url, 'utf8')).join('\n');

  assert.doesNotMatch(source, /Lei\s+\d|15[.]402|15[.]358|art[.]\s*112/i);
  assert.doesNotMatch(source, /PRAZOS|FRACOES|PERCENTUAIS/);
});
