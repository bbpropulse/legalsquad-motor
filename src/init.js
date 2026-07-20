import { cp, mkdir, readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createPrompt } from './prompt.js';
import { loadLocale, t } from './i18n.js';
import { listAvailable, installSkill, getSkillMeta, isSkillAutoInstallable } from './skills.js';
import { logEvent } from './logger.js';
import { discoverSkillCatalog, renderSkillIndex } from './skill-catalog.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, '..', 'templates');

const PACKAGE_ROOT = join(__dirname, '..');

const CANONICAL_SOURCES = [
  { src: join(PACKAGE_ROOT, '_criminalsquad', 'core'), dest: join('_criminalsquad', 'core') },
  { src: join(PACKAGE_ROOT, '_criminalsquad', 'config'), dest: join('_criminalsquad', 'config') },
  { src: join(PACKAGE_ROOT, 'dashboard'), dest: 'dashboard' },
  { src: join(PACKAGE_ROOT, 'scripts', 'legal-calculators'), dest: join('scripts', 'legal-calculators') },
];

const DASHBOARD_EXCLUDES = ['node_modules', 'tsconfig.tsbuildinfo', 'squads', 'test-results'];

const LANGUAGES = [
  { label: 'Português (Brasil)', value: 'Português (Brasil)' },
  { label: 'English', value: 'English' },
  { label: 'Español', value: 'Español' },
];

const IDES = [
  { label: 'Antigravity', value: 'antigravity', checked: true },
  { label: 'Claude Code', value: 'claude-code' },
  { label: 'Codex (OpenAI)', value: 'codex' },
  { label: 'Cursor', value: 'cursor' },
  { label: 'Gemini CLI', value: 'gemini-cli' },
  { label: 'OpenCode', value: 'opencode' },
  { label: 'Qwen Code', value: 'qwen-code' },
  { label: 'Trae', value: 'trae' },
  { label: 'VS Code + Copilot', value: 'vscode-copilot' },
];

export async function init(targetDir, options = {}) {

  // Check if already initialized
  let isReInit = false;
  try {
    await stat(join(targetDir, '_criminalsquad'));
    isReInit = true;
  } catch {
    // Not initialized yet — continue
  }

  console.log(isReInit ? '\n  🔄 CriminalSquad — Re-configure\n' : '\n  🟢 CriminalSquad — Setup\n');

  // Guided installation (skip in test mode)
  let language = options._language || 'English';
  let ides = options._ides ?? ['claude-code'];
  let userName = '';

  if (!options._skipPrompts) {
    const prompt = createPrompt();

    try {
      // Language is asked FIRST (in English, before locale is loaded)
      const langChoice = await prompt.choose('What language do you prefer for outputs?', LANGUAGES);
      language = langChoice.value;

      // Load locale — all messages from here are translated
      await loadLocale(language);

      console.log(`\n  ${t('welcome')}\n`);

      userName = (await prompt.ask(`  ${t('askName')}`)).trim();

      ides = await prompt.multiChoose(t('chooseIdes'), IDES);
    } finally {
      prompt.close();
    }
  } else {
    await loadLocale(language);
  }

  // Copy template files
  await copyCommonTemplates(targetDir);
  await copyCanonicalSources(targetDir);
  await copyIdeTemplates(ides, targetDir);
  await installAllSkills(targetDir);
  await syncSkillCatalogArtifacts(targetDir);
  if (!options._skipPrompts && !options.skipDeps) {
    await installDependencies(targetDir);
  }
  await writeProjectReadme(targetDir);

  // Write user preferences. The JSON file is the canonical, machine-read source;
  // the Markdown file is the human-friendly doc. Readers prefer JSON and fall
  // back to Markdown so hand-edits that break the .md never silently lose state.
  const memoryDir = join(targetDir, '_criminalsquad', '_memory');
  await mkdir(memoryDir, { recursive: true });
  const prefsContent = `# CriminalSquad Preferences

- **User Name:** ${userName}
- **Output Language:** ${language}
- **IDEs:** ${ides.join(', ')}
- **Date Format:** YYYY-MM-DD
`;
  await writeFile(join(memoryDir, 'preferences.md'), prefsContent, 'utf-8');
  const prefsJson = {
    userName,
    outputLanguage: language,
    ides,
    dateFormat: 'YYYY-MM-DD',
  };
  await writeFile(
    join(memoryDir, 'preferences.json'),
    JSON.stringify(prefsJson, null, 2) + '\n',
    'utf-8'
  );

  // Seed the criminal-law company profile (only if not already present)
  const companyPath = join(targetDir, '_criminalsquad', '_memory', 'company.md');
  try {
    await stat(companyPath);
  } catch {
    const seedPath = join(PACKAGE_ROOT, '_criminalsquad', 'core', 'seeds', 'company.md');
    try {
      await cp(seedPath, companyPath);
      console.log(`  ${t('createdFile', { path: '_criminalsquad/_memory/company.md' })}`);
    } catch {
      // seed missing — skip; the onboarding flow will collect the profile
    }
  }

  // Seed/merge the project .gitignore (npm strips .gitignore from tarballs).
  // Idempotent: if the user already has a .gitignore, APPEND any missing
  // CriminalSquad entries so sensitive paths (acervo/casos/, _criminalsquad/logs/,
  // browser profile, etc.) are ALWAYS ignored — sigilo/LGPD.
  const gitignorePath = join(targetDir, '.gitignore');
  const giSeed = join(PACKAGE_ROOT, '_criminalsquad', 'core', 'seeds', 'gitignore');
  try {
    const seedContent = await readFile(giSeed, 'utf-8');
    let existing = null;
    try {
      existing = await readFile(gitignorePath, 'utf-8');
    } catch {
      // no .gitignore yet
    }
    if (existing === null) {
      await writeFile(gitignorePath, seedContent, 'utf-8');
      console.log(`  ${t('createdFile', { path: '.gitignore' })}`);
    } else {
      const have = new Set(existing.split(/\r?\n/).map((l) => l.trim()));
      const missing = seedContent
        .split(/\r?\n/)
        .filter((l) => l.trim() && !l.trim().startsWith('#') && !have.has(l.trim()));
      if (missing.length > 0) {
        const sep = existing.endsWith('\n') ? '' : '\n';
        await writeFile(gitignorePath, `${existing}${sep}\n# CriminalSquad\n${missing.join('\n')}\n`, 'utf-8');
        console.log(`  ${t('updatedFile', { path: '.gitignore' })}`);
      }
    }
  } catch {
    // seed missing — skip
  }

  await logEvent('init', { language, ides: ides.join(',') }, targetDir);

  console.log(`\n  ${t('success')}\n`);
  console.log(`  ⚠️  ${t('tokenCostWarning')}\n`);
  console.log(`  ${t('nextSteps')}`);
  for (const ide of ides) {
    if (ide === 'claude-code') {
      console.log(`  ${t('step1ClaudeCode')}`);
      console.log(`  ${t('step2ClaudeCode')}`);
      console.log(`  ${t('step3ClaudeCode')}\n`);
    } else if (ide === 'codex') {
      console.log(`  ${t('step1Codex')}\n`);
    } else if (ide === 'antigravity') {
      console.log(`  ${t('step1Antigravity')}\n`);
    } else if (ide === 'cursor') {
      console.log(`  ${t('step1Cursor')}\n`);
    } else if (ide === 'opencode') {
      console.log(`  ${t('step1Opencode')}\n`);
    } else if (ide === 'vscode-copilot') {
      console.log(`  ${t('step1VsCodeCopilot')}`);
      console.log(`  ${t('step2VsCodeCopilot')}`);
      console.log(`  ${t('step3VsCodeCopilot')}\n`);
    } else if (ide === 'gemini-cli') {
      console.log(`  ${t('step1GeminiCli')}`);
      console.log(`  ${t('step2GeminiCli')}\n`);
    } else if (ide === 'qwen-code') {
      console.log(`  ${t('step1QwenCode')}`);
      console.log(`  ${t('step2QwenCode')}\n`);
    } else if (ide === 'trae') {
      console.log(`  ${t('step1Trae')}`);
      console.log(`  ${t('step2Trae')}\n`);
    }
  }
}

// Reads saved preferences, preferring the canonical JSON file and falling back
// to parsing the Markdown doc (legacy installs or hand-edited .json). Returns
// null when neither is present. Shape: { outputLanguage, ides, ... }.
export async function readPreferences(targetDir) {
  const memoryDir = join(targetDir, '_criminalsquad', '_memory');

  // 1. Canonical JSON — only a plain object counts (array/scalar is ignored).
  let json = null;
  try {
    const parsed = JSON.parse(await readFile(join(memoryDir, 'preferences.json'), 'utf-8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) json = parsed;
  } catch {
    // missing or malformed JSON
  }

  // 2. Markdown doc (legacy / hand-edited).
  let md = null;
  try {
    const content = await readFile(join(memoryDir, 'preferences.md'), 'utf-8');
    const outputLanguage = content.match(/\*\*Output Language:\*\*\s*(.+)/)?.[1]?.trim() || null;
    const idesLine = content.match(/\*\*IDEs:\*\*\s*(.+)/)?.[1]?.trim();
    md = { outputLanguage, ides: idesLine ? idesLine.split(/,\s*/) : null };
  } catch {
    // no markdown
  }

  if (!json && !md) return null;
  // Merge per field: JSON wins where present, Markdown fills the gaps — so a
  // valid-but-INCOMPLETE JSON never silently drops state the .md still holds.
  return { ...(md || {}), ...(json || {}) };
}

export async function loadSavedLocale(targetDir) {
  const prefs = await readPreferences(targetDir);
  await loadLocale(prefs?.outputLanguage || 'English');
}

async function installAllSkills(targetDir) {
  const available = await listAvailable();
  for (const id of available) {
    const meta = await getSkillMeta(id);
    if (!meta) continue;
    if (!isSkillAutoInstallable(meta)) continue;
    // Idempotent: never overwrite a skill that already exists — the user may have
    // edited it in place. Mirrors copyCommonTemplates/update.js (skip-if-present).
    try {
      await stat(join(targetDir, 'skills', id));
      continue;
    } catch {
      // not installed yet — install it
    }
    await installSkill(id, targetDir);
    console.log(`  ${t('createdFile', { path: `skills/${id}/SKILL.md` })}`);
  }
}

// The top-level catalogue artifacts are not skill directories, so the registry
// installer does not copy them. Generate the index from what is actually
// installed (including user skills) and copy the execution-penal integration
// manifest separately. This guarantees that Architect/Sherlock always have the
// two sources of truth their prompts require.
export async function syncSkillCatalogArtifacts(targetDir, { overwriteManifest = false, backupFn = null } = {}) {
  const targetSkills = join(targetDir, 'skills');
  await mkdir(targetSkills, { recursive: true });

  let count = 0;
  const manifestName = '_execucao-penal-v3-integration.yaml';
  const sourceManifest = join(PACKAGE_ROOT, 'skills', manifestName);
  const targetManifest = join(targetSkills, manifestName);
  try {
    await stat(sourceManifest);
    let shouldCopy = true;
    try {
      await stat(targetManifest);
      shouldCopy = overwriteManifest && !(await filesIdentical(sourceManifest, targetManifest));
    } catch {
      // destination does not exist
    }
    if (shouldCopy) {
      if (overwriteManifest && backupFn) await backupFn(targetManifest);
      await cp(sourceManifest, targetManifest);
      count++;
    }
  } catch {
    // Partial/legacy package without the integration manifest.
  }

  // Eval specifications are top-level catalogue artifacts (their directory
  // starts with `_`) and therefore are not copied by the per-skill installer.
  // Ship immutable specifications, but never copy/overwrite `_evals/results/`:
  // those are local behavioral evidence owned by each mentee installation.
  const sourceEvals = join(PACKAGE_ROOT, 'skills', '_evals');
  const targetEvals = join(targetSkills, '_evals');
  await mkdir(targetEvals, { recursive: true });
  for (const specName of [
    'README.md',
    'catalog-v5.json',
    'execucao-canonicas.json',
    'promotion-evidence.schema.json',
  ]) {
    const sourceSpec = join(sourceEvals, specName);
    const targetSpec = join(targetEvals, specName);
    try {
      await stat(sourceSpec);
      let shouldCopy = true;
      try {
        await stat(targetSpec);
        shouldCopy = overwriteManifest && !(await filesIdentical(sourceSpec, targetSpec));
      } catch {
        // destination does not exist
      }
      if (shouldCopy) {
        if (overwriteManifest && backupFn) await backupFn(targetSpec);
        await cp(sourceSpec, targetSpec);
        count++;
      }
    } catch {
      // Partial/legacy package without v5 eval specifications.
    }
  }

  const indexPath = join(targetSkills, '_index.yaml');
  const rendered = renderSkillIndex(discoverSkillCatalog(targetSkills));
  let previous = null;
  try {
    previous = await readFile(indexPath, 'utf8');
  } catch {
    // first index
  }
  if (previous !== rendered) {
    await writeFile(indexPath, rendered, 'utf8');
    count++;
  }
  return count;
}

async function installDependencies(targetDir) {
  // Each step is best-effort: a network failure must not abort init, because the
  // project files are already in place. We report what failed and how to retry.
  const steps = [
    { label: 'project dependencies', cmd: 'npm install', cwd: targetDir, hint: 'npm install' },
    { label: 'dashboard dependencies', cmd: 'npm install', cwd: join(targetDir, 'dashboard'), hint: 'cd dashboard && npm install' },
    { label: 'Playwright browser (chromium)', cmd: 'npx playwright install chromium', cwd: targetDir, hint: 'npx playwright install chromium' },
  ];

  const failed = [];
  for (const step of steps) {
    console.log(`\n  Installing ${step.label}...`);
    try {
      execSync(step.cmd, { cwd: step.cwd, stdio: 'inherit' });
    } catch {
      failed.push(step);
      console.log(`  ⚠️  Could not install ${step.label}. Retry later with: ${step.hint}`);
    }
  }

  if (failed.length > 0) {
    console.log(
      `\n  ⚠️  ${failed.length} dependency step(s) failed — your project files are already installed.`
    );
    console.log(`     Re-run the commands above when ready, or run init with --skip-deps to skip this step.`);
  }
}

async function writeProjectReadme(targetDir) {
  const destPath = join(targetDir, 'README.md');
  try {
    await stat(destPath);
    // README already exists — skip to avoid overwriting user content
    return;
  } catch {
    // does not exist — write it
  }
  const readmePath = join(__dirname, 'readme', 'README.md');
  const content = await readFile(readmePath, 'utf-8');
  await writeFile(destPath, content, 'utf-8');
}

async function copyCommonTemplates(targetDir) {
  const entries = await getTemplateEntries(TEMPLATES_DIR);

  for (const entry of entries) {
    const normalized = entry.replace(/\\/g, '/');
    // Skip ide-templates/ (handled by copyIdeTemplates) and ide-assets/ (build-time
    // SOURCE for the IDE generator — not project content for the mentee).
    if (normalized.includes('/ide-templates/') || normalized.includes('/ide-assets/')) continue;

    const relativePath = entry.slice(TEMPLATES_DIR.length + 1);
    const destPath = join(targetDir, relativePath);
    const destDir = dirname(destPath);
    await mkdir(destDir, { recursive: true });
    try {
      await stat(destPath);
      continue; // file already exists — skip
    } catch {
      // does not exist — copy it
    }
    await cp(entry, destPath);
    console.log(`  ${t('createdFile', { path: relativePath })}`);
  }
}

async function copyIdeTemplates(ides, targetDir) {
  const ideTemplatesDir = join(TEMPLATES_DIR, 'ide-templates');
  const writtenPaths = new Set();

  for (const ide of ides) {
    const ideSrcDir = join(ideTemplatesDir, ide);
    let entries;
    try {
      entries = await getTemplateEntries(ideSrcDir);
    } catch {
      continue; // no template dir for this IDE yet
    }

    for (const entry of entries) {
      const relativePath = entry.slice(ideSrcDir.length + 1);
      // settings.json (vscode/qwen/gemini) is merged separately to preserve user keys — skip here
      if (isMergedIdeSettings(ide, relativePath)) continue;
      if (writtenPaths.has(relativePath)) continue;
      writtenPaths.add(relativePath);

      const destPath = join(targetDir, relativePath);
      const destDir = dirname(destPath);
      await mkdir(destDir, { recursive: true });
      try {
        await stat(destPath);
        continue; // file already exists — skip
      } catch {
        // does not exist — copy it
      }
      await cp(entry, destPath);
      console.log(`  ${t('createdFile', { path: relativePath })}`);
    }
  }

  await mergeIdeSettings(ides, targetDir);
}

// The settings.json files that are MERGED (not copied wholesale) to preserve the
// user's own keys — shared by init and update so both stay consistent.
const MERGED_IDE_SETTINGS = {
  'vscode-copilot': '.vscode/settings.json',
  'qwen-code': '.qwen/settings.json',
  'gemini-cli': '.gemini/settings.json',
};

export function isMergedIdeSettings(ide, relativePath) {
  return MERGED_IDE_SETTINGS[ide] === relativePath.replace(/\\/g, '/');
}

export async function mergeIdeSettings(ides, targetDir) {
  if (ides.includes('vscode-copilot')) await mergeVsCodeSettings(targetDir);
  if (ides.includes('qwen-code')) await mergeQwenSettings(targetDir);
  if (ides.includes('gemini-cli')) await mergeGeminiSettings(targetDir);
}

// Single source for the three IDE settings.json merges (vscode/qwen/gemini),
// which were copy-pasted and only differed in path, the key to ensure, and the
// warn hint. Absent file → copy template; invalid JSON → warn and skip;
// otherwise apply `ensure(parsed)` idempotently and rewrite.
async function mergeJsonSetting({ settingsPath, templatePath, displayName, ensure, warnHint }) {
  let exists = false;
  try {
    await stat(settingsPath);
    exists = true;
  } catch {
    // doesn't exist
  }

  if (!exists) {
    await mkdir(dirname(settingsPath), { recursive: true });
    await cp(templatePath, settingsPath);
    return;
  }

  const raw = await readFile(settingsPath, 'utf-8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.log(`  ⚠️  ${displayName} has invalid JSON — skipping merge. ${warnHint}`);
    return;
  }

  ensure(parsed);
  await writeFile(settingsPath, JSON.stringify(parsed, null, 2), 'utf-8');
}

// Ensures the playwright MCP server is present (shared by qwen and gemini).
function ensurePlaywrightMcp(parsed) {
  if (!parsed.mcpServers) parsed.mcpServers = {};
  if (!parsed.mcpServers.playwright) {
    parsed.mcpServers.playwright = {
      command: 'npx',
      args: ['@playwright/mcp@latest', '--config', '_criminalsquad/config/playwright.config.json'],
    };
  }
}

function mergeVsCodeSettings(targetDir) {
  return mergeJsonSetting({
    settingsPath: join(targetDir, '.vscode', 'settings.json'),
    templatePath: join(TEMPLATES_DIR, 'ide-templates', 'vscode-copilot', '.vscode', 'settings.json'),
    displayName: '.vscode/settings.json',
    warnHint: 'Add manually: "chat.promptFilesLocations": [".github/prompts"]',
    ensure: (s) => {
      if (!s['chat.promptFilesLocations']) {
        s['chat.promptFilesLocations'] = ['.github/prompts'];
      } else if (!s['chat.promptFilesLocations'].includes('.github/prompts')) {
        s['chat.promptFilesLocations'].push('.github/prompts');
      }
    },
  });
}

function mergeQwenSettings(targetDir) {
  return mergeJsonSetting({
    settingsPath: join(targetDir, '.qwen', 'settings.json'),
    templatePath: join(TEMPLATES_DIR, 'ide-templates', 'qwen-code', '.qwen', 'settings.json'),
    displayName: '.qwen/settings.json',
    warnHint: 'Add manually: "mcpServers": { "playwright": { ... } }',
    ensure: ensurePlaywrightMcp,
  });
}

function mergeGeminiSettings(targetDir) {
  return mergeJsonSetting({
    settingsPath: join(targetDir, '.gemini', 'settings.json'),
    templatePath: join(TEMPLATES_DIR, 'ide-templates', 'gemini-cli', '.gemini', 'settings.json'),
    displayName: '.gemini/settings.json',
    warnHint: 'Add manually: "mcpServers": { "playwright": { ... } }',
    ensure: ensurePlaywrightMcp,
  });
}

export async function getTemplateEntries(dir) {
  const results = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...await getTemplateEntries(fullPath));
    } else {
      results.push(fullPath);
    }
  }

  return results;
}

async function fileHash(path) {
  try {
    const buf = await readFile(path);
    return createHash('sha256').update(buf).digest('hex');
  } catch {
    return null;
  }
}

// True only when both files exist and their contents are byte-identical. Used by
// update to skip rewriting (and backing up) files the user has not changed.
export async function filesIdentical(srcPath, destPath) {
  const destHash = await fileHash(destPath);
  if (destHash === null) return false; // dest missing — must copy
  return destHash === (await fileHash(srcPath));
}

export async function copyCanonicalSources(targetDir, { overwrite = false, backupFn = null, protectedFn = null } = {}) {
  let count = 0;

  for (const { src, dest } of CANONICAL_SOURCES) {
    const isDashboard = dest === 'dashboard';
    let entries;
    try {
      entries = await getTemplateEntries(src);
    } catch {
      continue; // source dir doesn't exist (e.g., running from a partial install)
    }

    for (const entry of entries) {
      const relativeToSrc = entry.slice(src.length + 1);
      const normalizedRel = relativeToSrc.replace(/\\/g, '/');

      // Skip dashboard-local artifacts
      if (isDashboard && DASHBOARD_EXCLUDES.some(ex => normalizedRel === ex || normalizedRel.startsWith(ex + '/'))) {
        continue;
      }

      const relativePath = join(dest, relativeToSrc);
      const normalizedPath = relativePath.replace(/\\/g, '/');

      // Skip protected paths (update mode)
      if (protectedFn && protectedFn(normalizedPath)) continue;

      const destPath = join(targetDir, relativePath);
      await mkdir(dirname(destPath), { recursive: true });

      if (!overwrite) {
        // Init mode: skip existing files
        try {
          await stat(destPath);
          continue;
        } catch {
          // does not exist — copy it
        }
        await cp(entry, destPath);
        console.log(`  ${t('createdFile', { path: normalizedPath })}`);
      } else {
        // Update mode: skip files identical to the template, otherwise back up
        // (only when the user changed them) and overwrite.
        if (await filesIdentical(entry, destPath)) continue;
        const backed = backupFn ? await backupFn(destPath) : false;
        await cp(entry, destPath);
        if (backed) {
          console.log(`  ${t('updatedFile', { path: normalizedPath })} (backup: ${normalizedPath}.bak)`);
        } else {
          console.log(`  ${t('updatedFile', { path: normalizedPath })}`);
        }
      }
      count++;
    }
  }

  return count;
}
