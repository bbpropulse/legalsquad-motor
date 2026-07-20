#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverSkillCatalog } from '../src/skill-catalog.js';
import { auditSkillCatalogQuality } from '../src/skill-quality.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SKILLS = join(ROOT, 'skills');
const OUTPUT = join(SKILLS, '_quality-report.json');

const report = auditSkillCatalogQuality(discoverSkillCatalog(SKILLS));
if (!process.argv.includes('--check')) {
  writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

const { summary } = report;
console.log(
  `Qualidade das skills: ${summary.skills} catalogadas; `
  + `${summary.structural_pass} sem hard fail estrutural; `
  + `${summary.high_performance_eligible} elegíveis por evidência. `
  + `Maturidade: ${summary.by_status.contracted || 0} contracted, `
  + `${summary.by_status.verified || 0} verified, `
  + `${summary.by_status.certified || 0} certified, `
  + `${summary.by_status.quarantined || 0} quarantined; `
  + `${summary.behavioral_evidence_skills || 0} com forward-run persistido e `
  + `${summary.promotion_evidence_skills || 0} com evidência de promoção reconhecida.`,
);

const productionFailures = report.results.filter(
  (item) => ['active', 'pilot'].includes(item.lifecycle) && item.hardFails.length,
);
if (process.argv.includes('--check') && productionFailures.length) {
  for (const item of productionFailures.slice(0, 50)) {
    console.error(`- ${item.id}: ${item.hardFails.join('; ')}`);
  }
  if (productionFailures.length > 50) {
    console.error(`- ... e mais ${productionFailures.length - 50} skills`);
  }
  process.exitCode = 1;
}
