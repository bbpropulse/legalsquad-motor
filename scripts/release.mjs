#!/usr/bin/env node
// Corta uma release do CriminalSquad em 1 comando (ferramenta do MANTENEDOR — não é
// distribuída ao aluno). Sem isso, alunos instalam o HEAD de main com a
// versão congelada e o update anuncia "vX → vX" trocando dezenas de arquivos.
//   npm run release -- patch|minor|major|x.y.z
// Faz: bump do package.json + version file (fonte única em templates/), move a seção
// [Unreleased] do CHANGELOG para [x.y.z] datada, commit + tag vx.y.z. NÃO faz push —
// imprime o comando para você revisar e enviar.
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PKG = join(ROOT, 'package.json');
const VERSION_FILE = join(ROOT, 'templates', '_criminalsquad', '.criminalsquad-version');
const CHANGELOG = join(ROOT, 'CHANGELOG.md');

function die(msg) {
  console.error(`release: ${msg}`);
  process.exit(1);
}

const sh = (cmd) => execSync(cmd, { cwd: ROOT, encoding: 'utf-8' }).trim();

// --- argumento: patch|minor|major|x.y.z ---
const arg = process.argv[2];
if (!arg) die('uso: npm run release -- <patch|minor|major|x.y.z>');

const pkg = JSON.parse(readFileSync(PKG, 'utf-8'));
const cur = String(pkg.version).match(/^(\d+)\.(\d+)\.(\d+)$/);
if (!cur) die(`versão atual inválida no package.json: ${pkg.version}`);
const [, MA, MI, PA] = cur.map(Number);

let next;
if (arg === 'patch') next = `${MA}.${MI}.${PA + 1}`;
else if (arg === 'minor') next = `${MA}.${MI + 1}.0`;
else if (arg === 'major') next = `${MA + 1}.0.0`;
else if (/^\d+\.\d+\.\d+$/.test(arg)) next = arg;
else die(`argumento inválido: ${arg} (use patch|minor|major|x.y.z)`);

// --- guardas ---
if (sh('git status --porcelain')) {
  die('working tree tem alterações não commitadas — commite (ou stashe) antes de cortar a release');
}
if (sh(`git tag -l v${next}`)) die(`a tag v${next} já existe`);

const changelog = readFileSync(CHANGELOG, 'utf-8');
if (!changelog.includes('## [Unreleased]')) die('CHANGELOG.md sem seção "## [Unreleased]"');

// --- aplica: package.json + version file + CHANGELOG ---
pkg.version = next;
writeFileSync(PKG, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
writeFileSync(VERSION_FILE, next + '\n', 'utf-8');

// Keep a Changelog: o conteúdo de [Unreleased] passa a viver sob a nova versão;
// [Unreleased] volta a existir vazia no topo para o próximo ciclo.
const d = new Date();
const hoje = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
writeFileSync(
  CHANGELOG,
  changelog.replace('## [Unreleased]', `## [Unreleased]\n\n## [${next}] - ${hoje}`),
  'utf-8'
);

// --- commit + tag (sem push) ---
sh('git add package.json templates/_criminalsquad/.criminalsquad-version CHANGELOG.md');
sh(`git commit -m "chore(release): v${next}"`);
sh(`git tag v${next}`);

console.log(`\n  ✅ Release v${next} cortada (commit + tag locais).`);
console.log('  Revise com `git show HEAD` e publique com:');
console.log('    git push origin main --tags\n');
