import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSkillEvals } from '../scripts/check-skill-evals.mjs';
import { discoverSkillCatalog } from '../src/skill-catalog.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('skills v5 e pilotos v4 têm casos normal e adversarial vinculados', () => {
  const result = checkSkillEvals();
  assert.equal(result.ok, true, result.problems.join('\n'));
  assert.ok(result.caseCount >= 487);
});

test('forward-test independente mantém as 16 canônicas em pilot', () => {
  const report = JSON.parse(readFileSync(
    new URL('../skills/_evals/results/execucao-canonicas-forward-test-2026-07-09.json', import.meta.url),
    'utf8',
  ));
  assert.equal(report.evaluator_context, 'independent_fresh_agent');
  assert.equal(report.summary.skills, 16);
  assert.equal(report.summary.contract_pass, 16);
  assert.equal(report.summary.promotion_approved, 0);
  assert.equal(report.results.length, 16);
  assert.ok(report.results.every((result) => result.lifecycle === 'pilot' && result.promotion === 'hold'));
});

test('oito forward-tests cobrem todos os perfis usados no catálogo sem promoção automática', () => {
  const reports = [
    'profile-forward-legal-2026-07-09.json',
    'profile-forward-operations-2026-07-09.json',
  ].map((name) => JSON.parse(readFileSync(
    new URL(`../skills/_evals/results/${name}`, import.meta.url),
    'utf8',
  )));
  const results = reports.flatMap((report) => report.results);
  assert.equal(results.length, 8);
  const catalogProfiles = new Set(
    discoverSkillCatalog(join(ROOT, 'skills')).entries
      .map((entry) => entry.metadata.qualityProfile),
  );
  assert.deepEqual(
    new Set(results.map((result) => result.profile)),
    catalogProfiles,
  );
  assert.ok(results.every((result) => result.behavioral_run && result.hard_fails.length === 0));
  assert.equal(reports.reduce((sum, report) => sum + report.summary.promotion_approved, 0), 0);
});
