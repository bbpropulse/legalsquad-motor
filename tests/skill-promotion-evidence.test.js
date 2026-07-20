import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadSkillEvaluationEvidence,
  PROMOTION_EVIDENCE_SCHEMA_VERSION,
  readSkillEvidenceBinding,
  validateSkillPromotionEvidence,
} from '../src/skill-quality.js';
import { discoverSkillCatalog } from '../src/skill-catalog.js';
import { SKILLS_DEMO } from './fixtures/caminhos.js';

const SKILLS = SKILLS_DEMO;
const MODEL = Object.freeze({ provider: 'test-provider', name: 'test-model', version: '2026-07-09' });
const WHEN = '2026-07-09T12:00:00.000Z';

function scenarios(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `case-${index + 1}`,
    kind: index === 0 ? 'normal' : index === 1 ? 'adversarial' : 'edge',
    behavioral_run: true,
    status: 'pass',
    executed_at: WHEN,
    input_sha256: (index + 1).toString(16).padStart(64, '0'),
    output_sha256: (index + 101).toString(16).padStart(64, '0'),
    trace_sha256: (index + 201).toString(16).padStart(64, '0'),
    grader: {
      id: 'behavior-grader',
      type: 'model',
      model: MODEL,
      rubric_version: 'criminalsquad-rubric/1.0.0',
    },
  }));
}

function promotionResult(binding, overrides = {}) {
  const cases = scenarios(12);
  return {
    evidence_id: 'evidence-demo-peca-alpha-001',
    skill: 'demo-peca-alpha',
    skill_binding: {
      algorithm: binding.algorithm,
      skill_sha256: binding.skill_sha256,
      skill_version: binding.skill_version,
      contract_version: binding.contract_version,
    },
    risk_level: 'r4',
    awarded_status: 'certified',
    behavioral_run: true,
    verdict: 'pass',
    hard_fails: [],
    scenarios: cases,
    baseline: {
      method: 'same-cases-without-skill',
      executed_at: WHEN,
      model: MODEL,
      metric: 'task-success',
      direction: 'higher-is-better',
      case_ids: cases.map((item) => item.id),
      without_skill_score: 0.5,
      with_skill_score: 1,
      improvement: 0.5,
    },
    reviewers: [
      {
        id: 'human-reviewer-1',
        type: 'human',
        independent: true,
        decision: 'approved',
        reviewed_at: WHEN,
      },
      {
        id: 'human-reviewer-2',
        type: 'human',
        independent: true,
        decision: 'approved',
        reviewed_at: WHEN,
      },
    ],
    regression: {
      suite_id: 'regression-demo-peca-alpha-v1',
      executed_at: WHEN,
      status: 'pass',
      case_count: 12,
    },
    ...overrides,
  };
}

function suite(result, overrides = {}) {
  return {
    schema_version: PROMOTION_EVIDENCE_SCHEMA_VERSION,
    suite: 'promotion-governance-test',
    evaluated_at: WHEN,
    execution_model: MODEL,
    evaluator: { id: 'independent-evaluator', type: 'model', model: MODEL },
    results: [result],
    ...overrides,
  };
}

function withTempSkill(run) {
  const root = mkdtempSync(join(tmpdir(), 'criminalsquad-promotion-'));
  try {
    mkdirSync(join(root, 'demo-peca-alpha'), { recursive: true });
    cpSync(join(SKILLS, 'demo-peca-alpha', 'SKILL.md'), join(root, 'demo-peca-alpha', 'SKILL.md'));
    mkdirSync(join(root, '_evals', 'results'), { recursive: true });
    return run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('evidência v1 válida vincula hash/versão/contrato e certifica R4 com dois humanos', () => {
  const binding = readSkillEvidenceBinding(SKILLS, 'demo-peca-alpha');
  assert.ok(binding);
  const result = promotionResult(binding);
  const validation = validateSkillPromotionEvidence(suite(result), result, binding);
  assert.equal(validation.valid, true, validation.failures.join('; '));
  assert.equal(validation.qualifiesForPromotion, true);
  assert.equal(validation.awardedStatus, 'certified');
});

test('hash/versão/contrato divergente, baseline inválido ou regressão ausente nunca promovem', () => {
  const binding = readSkillEvidenceBinding(SKILLS, 'demo-peca-alpha');
  const invalidBinding = promotionResult(binding, {
    skill_binding: {
      algorithm: 'sha256',
      skill_sha256: '0'.repeat(64),
      skill_version: '0.0.0',
      contract_version: '0.0.0',
    },
  });
  const bindingCheck = validateSkillPromotionEvidence(suite(invalidBinding), invalidBinding, binding);
  assert.equal(bindingCheck.qualifiesForPromotion, false);
  assert.match(bindingCheck.failures.join(' '), /sha256 divergente/);
  assert.match(bindingCheck.failures.join(' '), /skill_version divergente/);
  assert.match(bindingCheck.failures.join(' '), /contract_version divergente/);

  const invalidBaseline = promotionResult(binding);
  invalidBaseline.baseline.improvement = 0;
  invalidBaseline.regression.status = 'fail';
  const baselineCheck = validateSkillPromotionEvidence(suite(invalidBaseline), invalidBaseline, binding);
  assert.equal(baselineCheck.qualifiesForPromotion, false);
  assert.match(baselineCheck.failures.join(' '), /baseline não demonstra melhoria/);
  assert.match(baselineCheck.failures.join(' '), /regressão exige/);

  const unboundArtifacts = promotionResult(binding);
  unboundArtifacts.scenarios[0].output_sha256 = 'not-a-digest';
  unboundArtifacts.scenarios[1].grader.rubric_version = '';
  const artifactCheck = validateSkillPromotionEvidence(
    suite(unboundArtifacts),
    unboundArtifacts,
    binding,
  );
  assert.equal(artifactCheck.qualifiesForPromotion, false);
  assert.match(artifactCheck.failures.join(' '), /hashes de input\/output\/trace/);
  assert.match(artifactCheck.failures.join(' '), /grader versionado/);
});

test('mínimos mecânicos e independência impedem certificação R4 subdimensionada', () => {
  const binding = readSkillEvidenceBinding(SKILLS, 'demo-peca-alpha');
  const result = promotionResult(binding);
  result.scenarios = result.scenarios.slice(0, 11);
  result.baseline.case_ids = result.scenarios.map((item) => item.id);
  result.reviewers = [
    {
      id: 'independent-evaluator',
      type: 'human',
      independent: true,
      decision: 'approved',
      reviewed_at: WHEN,
    },
  ];
  const validation = validateSkillPromotionEvidence(suite(result), result, binding);
  assert.equal(validation.qualifiesForPromotion, false);
  assert.match(validation.failures.join(' '), /r4 exige ao menos 12 cenários/);
  assert.match(validation.failures.join(' '), /r4 certified exige 2 revisor/);
  assert.match(validation.failures.join(' '), /revisor deve ser distinto do avaliador/);
  assert.match(validation.failures.join(' '), /2 revisor\(es\) humano/);
});

test('o resultado mais recente revoga um passe antigo, inclusive quando a nova promoção é inválida', () => {
  withTempSkill((skillsDir) => {
    const binding = readSkillEvidenceBinding(skillsDir, 'demo-peca-alpha');
    const oldPass = promotionResult(binding, {
      awarded_status: 'verified',
      evidence_id: 'old-pass',
    });
    writeFileSync(
      join(skillsDir, '_evals', 'results', '001-old-pass.json'),
      `${JSON.stringify(suite(oldPass, { evaluated_at: '2026-07-01T12:00:00.000Z' }), null, 2)}\n`,
    );
    const failedLatest = promotionResult(binding, {
      evidence_id: 'failed-latest',
      awarded_status: 'verified',
      verdict: 'fail',
    });
    writeFileSync(
      join(skillsDir, '_evals', 'results', '002-failed.json'),
      `${JSON.stringify(suite(failedLatest, { evaluated_at: '2026-07-02T12:00:00.000Z' }), null, 2)}\n`,
    );
    let evidence = loadSkillEvaluationEvidence(skillsDir).get('demo-peca-alpha');
    assert.equal(evidence.evidenceValid, false);
    assert.equal(evidence.qualifiesForPromotion, false);
    assert.match(evidence.validationFailures.join(' '), /verdict deve ser pass/);

    const revoked = {
      evidence_id: 'explicit-revocation',
      skill: 'demo-peca-alpha',
      skill_binding: {
        algorithm: binding.algorithm,
        skill_sha256: binding.skill_sha256,
        skill_version: binding.skill_version,
        contract_version: binding.contract_version,
      },
      awarded_status: 'revoked',
      verdict: 'revoked',
      revocation_reason: 'regressão comportamental detectada',
    };
    writeFileSync(
      join(skillsDir, '_evals', 'results', '003-revoked.json'),
      `${JSON.stringify(suite(revoked, { evaluated_at: '2026-07-03T12:00:00.000Z' }), null, 2)}\n`,
    );
    evidence = loadSkillEvaluationEvidence(skillsDir).get('demo-peca-alpha');
    assert.equal(evidence.awardedStatus, 'revoked');
    assert.equal(evidence.evidenceValid, true);
    assert.equal(evidence.qualifiesForPromotion, false);

    const invalidLatest = promotionResult(binding, {
      evidence_id: 'invalid-latest',
      skill_binding: {
        algorithm: 'sha256',
        skill_sha256: 'f'.repeat(64),
        skill_version: binding.skill_version,
        contract_version: binding.contract_version,
      },
    });
    writeFileSync(
      join(skillsDir, '_evals', 'results', '004-invalid-latest.json'),
      `${JSON.stringify(suite(invalidLatest, { evaluated_at: '2026-07-04T12:00:00.000Z' }), null, 2)}\n`,
    );
    evidence = loadSkillEvaluationEvidence(skillsDir).get('demo-peca-alpha');
    assert.equal(evidence.evidenceValid, false);
    assert.equal(evidence.qualifiesForPromotion, false);
    assert.match(evidence.validationFailures.join(' '), /sha256 divergente/);
  });
});

test('forward-runs legados continuam observáveis, sem virar promoção', () => {
  const catalog = discoverSkillCatalog(SKILLS);
  const evidence = loadSkillEvaluationEvidence(SKILLS);
  assert.ok(catalog.entries.length > 0, 'a fixture precisa ter skills para o teste valer algo');
  // Cada skill da fixture tem uma observação de forward-run — o tamanho do
  // mapa é por skill (loadSkillEvaluationEvidence chaveia por `skill`), não
  // pelo número de arquivos em _evals/results/ (a fixture agrupa várias
  // skills por arquivo, uma por quality_profile).
  assert.equal(evidence.size, catalog.entries.length);
  for (const item of evidence.values()) {
    assert.equal(item.evidenceKind, 'forward-run');
    assert.equal(item.qualifiesForPromotion, false);
  }
  const schema = JSON.parse(readFileSync(join(SKILLS, '_evals', 'promotion-evidence.schema.json'), 'utf8'));
  assert.equal(schema.properties.schema_version.const, PROMOTION_EVIDENCE_SCHEMA_VERSION);
});
