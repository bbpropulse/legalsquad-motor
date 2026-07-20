import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverSkillCatalog } from '../src/skill-catalog.js';
import {
  auditSkillCatalogQuality,
  evaluateSkillQuality,
  loadSkillEvalCases,
  loadSkillEvaluationEvidence,
  loadSkillQualityProfiles,
  SKILL_QUALITY_STATUSES,
} from '../src/skill-quality.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SKILLS = join(ROOT, 'skills');

test('as 520 skills têm contrato v5, perfil, risco, guards e eval vinculada', () => {
  const catalog = discoverSkillCatalog(SKILLS);
  const report = auditSkillCatalogQuality(catalog);
  assert.equal(catalog.entries.length, 520);
  assert.equal(report.summary.skills, 520);
  assert.equal(report.summary.structural_pass, 520);
  assert.equal(report.summary.hard_fail_skills, 0);
  assert.equal(report.summary.high_performance_eligible, 0, 'contrato não deve fingir evidência comportamental');
  assert.ok(report.summary.minimum_behavioral_cases_backlog > 4000);
  assert.equal(
    Object.values(report.summary.by_certification_wave).reduce((sum, value) => sum + value, 0),
    520,
  );

  for (const entry of catalog.entries) {
    const meta = entry.metadata;
    assert.equal(meta.schemaVersion, '5', entry.id);
    assert.equal(meta.contractVersion, '5.0.0', entry.id);
    assert.ok(meta.qualityProfile, entry.id);
    assert.ok(SKILL_QUALITY_STATUSES.includes(meta.qualityStatus), entry.id);
    assert.match(meta.riskLevel, /^r[1-4]$/, entry.id);
    assert.ok(meta.deliveryType, entry.id);
    assert.ok(meta.freshnessPolicy, entry.id);
    assert.ok(meta.guardTriggers.length >= 3, entry.id);
    assert.ok(meta.evalCaseIds.length >= 1, entry.id);
    assert.match(entry.raw, /CRIMINALSQUAD:HP-CONTRACT:START/, entry.id);
    assert.ok(entry.raw.split(/\r?\n/).length <= 500, `${entry.id} excede 500 linhas`);
    assert.ok(existsSync(join(dirname(entry.skillPath), 'references', 'high-performance-contract.md')), entry.id);
    assert.ok(existsSync(join(dirname(entry.skillPath), 'agents', 'openai.yaml')), entry.id);
  }
});

test('metadados OpenAI têm prompt explícito e só habilitam invocação implícita com evidência', () => {
  const catalog = discoverSkillCatalog(SKILLS);
  const eligibility = new Map(
    auditSkillCatalogQuality(catalog).results.map((result) => [result.id, result]),
  );
  for (const entry of catalog.entries) {
    const yaml = readFileSync(join(dirname(entry.skillPath), 'agents', 'openai.yaml'), 'utf8');
    assert.match(yaml, new RegExp(`default_prompt: .*\\$${entry.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), entry.id);
    assert.match(yaml, /short_description: ".{25,64}"/, entry.id);
    const expected = entry.metadata.lifecycle === 'active'
      && eligibility.get(entry.id)?.highPerformanceEligible === true
      ? 'true'
      : 'false';
    assert.match(yaml, new RegExp(`allow_implicit_invocation: ${expected}`), entry.id);
  }
});

test('frontmatter distribuível usa apenas chaves permitidas no topo', () => {
  const allowed = new Set(['name', 'description', 'license', 'allowed-tools', 'metadata']);
  for (const dir of readdirSync(SKILLS, { withFileTypes: true }).filter((item) => item.isDirectory() && !item.name.startsWith('_'))) {
    const path = join(SKILLS, dir.name, 'SKILL.md');
    if (!existsSync(path)) continue;
    const raw = readFileSync(path, 'utf8');
    const frontmatter = raw.match(/^---\n([\s\S]*?)\n---/)?.[1];
    assert.ok(frontmatter, dir.name);
    const keys = frontmatter.split('\n')
      .map((line) => line.match(/^([A-Za-z0-9_-]+):(?:\s|$)/)?.[1])
      .filter(Boolean);
    assert.deepEqual(keys.filter((key) => !allowed.has(key)), [], dir.name);
  }
});

test('metadata verified sem forward-run explícito não fabrica elegibilidade', () => {
  const catalog = discoverSkillCatalog(SKILLS);
  const source = catalog.entries.find((entry) => entry.id === 'habeas-corpus');
  assert.ok(source);
  const raw = source.raw.replace(/quality_status:\s*"?contracted"?/, 'quality_status: "verified"');
  const entry = {
    ...source,
    raw,
    frontmatter: raw.match(/^---\n([\s\S]*?)\n---/)?.[1],
    metadata: { ...source.metadata, qualityStatus: 'verified' },
  };
  const result = evaluateSkillQuality(entry, {
    profiles: loadSkillQualityProfiles(),
    evalCases: loadSkillEvalCases(SKILLS),
    evidence: new Map(),
  });
  assert.equal(result.highPerformanceEligible, false);
  assert.match(result.hardFails.join(' '), /sem evidência comportamental persistida/);
});

test('preview não vira elegível mesmo com rótulo e evidência de promoção', () => {
  const catalog = discoverSkillCatalog(SKILLS);
  const source = catalog.entries.find((entry) => entry.metadata.lifecycle === 'preview');
  assert.ok(source);
  const raw = source.raw.replace(/quality_status:\s*"?contracted"?/, 'quality_status: "verified"');
  const entry = {
    ...source,
    raw,
    frontmatter: raw.match(/^---\n([\s\S]*?)\n---/)?.[1],
    metadata: { ...source.metadata, qualityStatus: 'verified' },
  };
  const result = evaluateSkillQuality(entry, {
    profiles: loadSkillQualityProfiles(),
    evalCases: loadSkillEvalCases(SKILLS),
    evidence: new Map([[
      source.id,
      { qualifiesForPromotion: true, awardedStatus: 'verified' },
    ]]),
  });
  assert.equal(result.checks.evidence_required_satisfied, true);
  assert.equal(result.highPerformanceEligible, false);
});

test('evidência persistida usa caminhos relativos e portáveis', () => {
  const evidence = loadSkillEvaluationEvidence(SKILLS);
  assert.equal(evidence.size, 8);
  for (const item of evidence.values()) {
    assert.match(item.source, /^_evals\/results\//);
    assert.equal(item.source.startsWith('/'), false);
    assert.equal(item.source.includes('\\'), false);
  }
});
