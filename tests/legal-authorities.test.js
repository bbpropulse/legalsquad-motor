import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkLegalAuthorities } from '../scripts/check-legal-authorities.mjs';

test('registro vivo de autoridades é íntegro e não promove item sem revisão', () => {
  const result = checkLegalAuthorities({ today: '2026-07-09' });
  assert.equal(result.ok, true, result.problems.join('\n'));
  assert.ok(result.records >= 1);
});

test('registro quarantined expirado avisa sem se tornar fonte de produção', () => {
  const result = checkLegalAuthorities({ today: '2026-07-10' });
  assert.equal(result.ok, true, result.problems.join('\n'));
  assert.ok(result.warnings.some((warning) => warning.includes('expirada')));
});
