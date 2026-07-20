#!/usr/bin/env node
// Regenera o catálogo canônico de skills. O conteúdo é determinístico: não há
// timestamp, ordem de filesystem ou outro dado volátil no arquivo gerado.
//
// Uso:
//   npm run indexar-skills
//   node scripts/indexar-skills.js --check

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  discoverSkillCatalog,
  renderSkillIndex,
  validateSkillCatalog,
} from '../src/skill-catalog.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const skillsDir = join(__dirname, '..', 'skills');
const indexPath = join(skillsDir, '_index.yaml');

if (process.argv.includes('--check')) {
  const result = validateSkillCatalog({ skillsDir, indexPath });
  if (!result.ok) {
    for (const error of result.errors) {
      console.error(`[${error.code}] ${error.message}`);
    }
    process.exitCode = 1;
  } else {
    console.log(`Catálogo íntegro e fresco: ${result.catalog.entries.length} skills.`);
  }
} else {
  const catalog = discoverSkillCatalog(skillsDir);
  const output = renderSkillIndex(catalog);
  writeFileSync(indexPath, output, 'utf8');
  console.log(`Indexadas ${catalog.entries.length} skills em skills/_index.yaml.`);
  if (catalog.missingSkillFiles.length) {
    console.warn(`Atenção: ${catalog.missingSkillFiles.length} pasta(s) sem SKILL.md; rode npm run check:skills.`);
  }
}
