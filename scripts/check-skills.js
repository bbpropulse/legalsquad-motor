#!/usr/bin/env node
// Gate determinístico do catálogo de skills: estrutura, nomes, referências,
// lifecycle, grafo semântico, manifesto de integração e frescor do índice.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSkillCatalog } from '../src/skill-catalog.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const skillsDir = join(__dirname, '..', 'skills');
const result = validateSkillCatalog({ skillsDir });

if (!result.ok) {
  console.error(`Catálogo de skills inválido (${result.errors.length} problema(s)):`);
  for (const error of result.errors) {
    console.error(`  - [${error.code}] ${error.message}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Catálogo de skills íntegro: ${result.catalog.entries.length} skills; índice fresco; grafo válido.`);
}
