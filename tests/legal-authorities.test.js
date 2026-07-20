import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { checkLegalAuthorities } from '../scripts/check-legal-authorities.mjs';
import { CORE_DEMO, SKILLS_DEMO } from './fixtures/caminhos.js';

// A fixture está no "formato de destino" (uma área já instalada) — core/
// direto na raiz da área, sem o prefixo _criminalsquad/ que o motor usa para
// seu próprio core mecânico. checkLegalAuthorities aceita os dois diretórios
// explicitamente por isso (ver scripts/check-legal-authorities.mjs).
const opcoes = (today) => ({
  today,
  registryDir: join(CORE_DEMO, 'authorities'),
  skillsDir: SKILLS_DEMO,
});

test('registro vivo de autoridades é íntegro e não promove item sem revisão', () => {
  const result = checkLegalAuthorities(opcoes('2026-07-09'));
  assert.equal(result.ok, true, result.problems.join('\n'));
  assert.ok(result.records >= 1);
});

test('registro quarantined expirado avisa sem se tornar fonte de produção', () => {
  const result = checkLegalAuthorities(opcoes('2026-07-10'));
  assert.equal(result.ok, true, result.problems.join('\n'));
  assert.ok(result.warnings.some((warning) => warning.includes('expirada')));
});
