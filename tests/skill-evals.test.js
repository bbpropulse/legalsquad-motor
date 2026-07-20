import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkSkillEvals } from '../scripts/check-skill-evals.mjs';
import { discoverSkillCatalog } from '../src/skill-catalog.js';
import { AREA_DEMO, SKILLS_DEMO } from './fixtures/caminhos.js';

test('skills v5 e pilotos v4 têm casos normal e adversarial vinculados', () => {
  const result = checkSkillEvals({ root: AREA_DEMO });
  assert.equal(result.ok, true, result.problems.join('\n'));
  // 1 caso por skill (demo-v5-<nome>) + o caso canônico extra de demo-piloto —
  // por isso >= e não ===, sem hardcodar o total exato.
  const catalog = discoverSkillCatalog(SKILLS_DEMO);
  assert.ok(catalog.entries.length > 0, 'a fixture precisa ter skills para o teste valer algo');
  assert.ok(result.caseCount >= catalog.entries.length);
});

test('forward-test independente mantém os pilotos da fixture em hold, sem promoção automática', () => {
  const catalog = discoverSkillCatalog(SKILLS_DEMO);
  const pilotIds = new Set(
    catalog.entries.filter((entry) => entry.metadata.lifecycle === 'pilot').map((entry) => entry.id),
  );
  assert.ok(pilotIds.size > 0, 'a fixture precisa ter ao menos uma skill pilot para o teste valer algo');

  const reports = [
    'demo-forward-legal-drafting-2026-07-09.json',
    'demo-forward-legal-calculation-2026-07-09.json',
  ].map((name) => JSON.parse(readFileSync(join(SKILLS_DEMO, '_evals', 'results', name), 'utf8')));

  for (const report of reports) {
    assert.equal(report.evaluator_context, 'independent_fresh_agent');
    assert.equal(report.summary.promotion_approved, 0);
  }

  const pilotResults = reports.flatMap((report) => report.results)
    .filter((result) => pilotIds.has(result.skill));
  assert.equal(pilotResults.length, pilotIds.size);
  assert.ok(pilotResults.every((result) => (
    result.behavioral_run === true && result.verdict === 'pass_not_promoted'
  )));
});

test('forward-tests da fixture cobrem todos os perfis usados no catálogo sem promoção automática', () => {
  const catalog = discoverSkillCatalog(SKILLS_DEMO);
  const reports = [
    'demo-forward-legal-drafting-2026-07-09.json',
    'demo-forward-legal-calculation-2026-07-09.json',
  ].map((name) => JSON.parse(readFileSync(join(SKILLS_DEMO, '_evals', 'results', name), 'utf8')));
  const results = reports.flatMap((report) => report.results);
  assert.ok(results.length > 0, 'os relatórios da fixture precisam ter resultados para o teste valer algo');
  assert.equal(results.length, catalog.entries.length);
  const catalogProfiles = new Set(catalog.entries.map((entry) => entry.metadata.qualityProfile));
  assert.deepEqual(
    new Set(results.map((result) => result.profile)),
    catalogProfiles,
  );
  assert.ok(results.every((result) => result.behavioral_run && result.hard_fails.length === 0));
  assert.equal(reports.reduce((sum, report) => sum + report.summary.promotion_approved, 0), 0);
});
