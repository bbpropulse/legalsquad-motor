#!/usr/bin/env node
// Builds the public distribution tree: exactly the npm-packable set (package.json
// `files[]`) plus package.json and the mentee-facing docs. This is what goes into
// the PUBLIC bbpropulse/criminalsquad-dist repo — no dev history, no tests, no
// dev-only dirs, no commercial staging, and nothing gitignored (real cases,
// _memory, .env are never referenced here). Re-run on each release, then commit
// and push the output dir to the dist repo.
//
// Usage: node scripts/build-dist.mjs <output-dir>
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = process.argv[2];
if (!OUT) {
  console.error('Uso: node scripts/build-dist.mjs <diretório-de-saída>');
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
// files[] is the authoritative distributable set. Extra root files the mentee reads.
const DOCS = ['README.md', 'INSTALL.md', 'GUIA-ALUNO.md', 'LICENSE', 'LICENSE.md', 'CHANGELOG.md'];
const entries = [...(pkg.files || []), 'package.json', ...DOCS];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

let copied = 0;
let skipped = 0;
for (const entry of entries) {
  const src = join(ROOT, entry.replace(/\/$/, ''));
  if (!existsSync(src)) { skipped++; continue; }
  const dest = join(OUT, entry.replace(/\/$/, ''));
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, {
    recursive: true,
    filter: (p) => !/(^|\/)node_modules(\/|$)|(^|\/)\.git(\/|$)|(^|\/)__pycache__(\/|$)|\.pyc$|tsconfig\.tsbuildinfo$/.test(p),
  });
  copied++;
}

// A minimal .gitignore for the dist repo (only matters if someone works inside it).
writeFileSync(join(OUT, '.gitignore'), [
  'node_modules/',
  '_criminalsquad/_memory/',
  '_criminalsquad/_browser_profile/',
  '_criminalsquad/logs/',
  'acervo/casos/',
  'squads/*/_memory/',
  '.env',
  '',
].join('\n'), 'utf8');

console.log(`Dist construído em ${OUT}: ${copied} entradas copiadas, ${skipped} ausentes.`);
console.log(`Pacote: ${pkg.name}@${pkg.version}`);
