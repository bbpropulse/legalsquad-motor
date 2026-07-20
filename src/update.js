import { cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocale, t } from './i18n.js';
import { getTemplateEntries, loadSavedLocale, copyCanonicalSources, readPreferences, filesIdentical, isMergedIdeSettings, mergeIdeSettings, syncSkillCatalogArtifacts } from './init.js';
import { listAvailable as listAvailableSkills, listInstalled as listInstalledSkills, installSkill, getSkillMeta, isSkillAutoInstallable } from './skills.js';
import { logEvent } from './logger.js';

async function loadSavedIdes(targetDir) {
  const prefs = await readPreferences(targetDir);
  if (Array.isArray(prefs?.ides) && prefs.ides.length > 0) return prefs.ides;
  return ['claude-code'];
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, '..', 'templates');

const PROTECTED_PATHS = [
  '_criminalsquad/_memory',
  'acervo', // dados do usuário (materiais + índice + casos sigilosos) — semeado no init, nunca sobrescrito no update
  'agents',
  'squads',
];

function isProtected(relativePath) {
  const normalized = relativePath.replaceAll('\\', '/');
  return PROTECTED_PATHS.some(
    (p) => normalized === p || normalized.startsWith(p + '/')
  );
}

// package.json is the mentee's OWN project manifest (their scripts/deps live here).
// A wholesale copy would wipe their additions, so we MERGE: keep everything the user
// has, and ensure the CriminalSquad scripts/dependencies are present/current.
// Returns true if the file changed (for the update count).
async function mergePackageJson(templatePath, destPath, backupFn) {
  const templateObj = JSON.parse(await readFile(templatePath, 'utf-8'));

  let userRaw = null;
  try {
    userRaw = await readFile(destPath, 'utf-8');
  } catch {
    // not present yet — place the template as-is
  }
  if (userRaw === null) {
    await mkdir(dirname(destPath), { recursive: true });
    await cp(templatePath, destPath);
    return true;
  }

  let userObj;
  try {
    userObj = JSON.parse(userRaw);
  } catch {
    return false; // invalid user JSON — never risk clobbering it
  }

  const merged = {
    ...userObj,
    scripts: { ...(userObj.scripts || {}), ...(templateObj.scripts || {}) },
    dependencies: { ...(userObj.dependencies || {}), ...(templateObj.dependencies || {}) },
  };
  const next = JSON.stringify(merged, null, 2) + '\n';
  if (next === userRaw) return false; // already current

  await backupFn(destPath);
  await writeFile(destPath, next, 'utf-8');
  return true;
}

async function backupIfExists(destPath) {
  try {
    await stat(destPath);
  } catch {
    return false; // nothing to back up
  }
  const backupPath = destPath + '.bak';
  // Preserve the user's ORIGINAL: never overwrite an existing .bak on a re-update
  // (otherwise the backup would hold an already-updated copy, not the original).
  try {
    await stat(backupPath);
    return true; // a backup already exists — keep it
  } catch {
    await cp(destPath, backupPath);
    return true;
  }
}

export async function update(targetDir) {
  console.log('\n  🔄 CriminalSquad — Update\n');

  // 1. Check initialized
  try {
    await stat(join(targetDir, '_criminalsquad'));
  } catch {
    await loadLocale('English');
    console.log(`  ${t('updateNotInitialized')}`);
    return { success: false };
  }

  // 2. Load user's locale
  await loadSavedLocale(targetDir);

  // 3. Read versions
  let currentVersion = null;
  try {
    currentVersion = (
      await readFile(join(targetDir, '_criminalsquad', '.criminalsquad-version'), 'utf-8')
    ).trim();
  } catch {
    // Legacy install — no version file
  }

  const newVersion = (
    await readFile(join(TEMPLATES_DIR, '_criminalsquad', '.criminalsquad-version'), 'utf-8')
  ).trim();

  // 4. Announce
  if (currentVersion) {
    console.log(
      `  ${t('updateStarting', { old: `v${currentVersion}`, new: `v${newVersion}` })}`
    );
  } else {
    console.log(`  ${t('updateStartingUnknown', { new: `v${newVersion}` })}`);
  }

  // 5. Copy common templates, skipping protected paths and ide-templates/
  const entries = await getTemplateEntries(TEMPLATES_DIR);
  let count = 0;

  for (const entry of entries) {
    const relativePath = relative(TEMPLATES_DIR, entry);
    const normalizedRel = relativePath.replaceAll('\\', '/');
    if (isProtected(relativePath)) continue;
    // Skip ide-templates (handled below) and ide-assets (build-time source).
    if (normalizedRel.startsWith('ide-templates/') || normalizedRel.startsWith('ide-assets/')) continue;

    const destPath = join(targetDir, relativePath);
    // package.json belongs to the user — merge instead of overwriting (preserves
    // their scripts/deps while delivering new CriminalSquad scripts).
    if (normalizedRel === 'package.json') {
      if (await mergePackageJson(entry, destPath, backupIfExists)) {
        console.log(`  ${t('updatedFile', { path: normalizedRel })}`);
        count++;
      }
      continue;
    }
    await mkdir(dirname(destPath), { recursive: true });
    if (await filesIdentical(entry, destPath)) continue;
    const backed = await backupIfExists(destPath);
    await cp(entry, destPath);
    const displayPath = relativePath.replaceAll('\\', '/');
    if (backed) {
      console.log(`  ${t('updatedFile', { path: displayPath })} (backup: ${displayPath}.bak)`);
    } else {
      console.log(`  ${t('updatedFile', { path: displayPath })}`);
    }
    count++;
  }

  // 6. Copy IDE-specific templates based on saved preferences
  const ides = await loadSavedIdes(targetDir);
  for (const ide of ides) {
    const ideSrcDir = join(TEMPLATES_DIR, 'ide-templates', ide);
    let ideEntries;
    try {
      ideEntries = await getTemplateEntries(ideSrcDir);
    } catch {
      continue; // no template dir for this IDE
    }
    for (const entry of ideEntries) {
      const relPath = relative(ideSrcDir, entry);
      if (isProtected(relPath)) continue;
      // settings.json (vscode/qwen/gemini) is merged below to preserve user keys — never overwrite it
      if (isMergedIdeSettings(ide, relPath)) continue;

      const destPath = join(targetDir, relPath);
      await mkdir(dirname(destPath), { recursive: true });
      if (await filesIdentical(entry, destPath)) continue;
      const backed = await backupIfExists(destPath);
      await cp(entry, destPath);
      const displayPath = relPath.replaceAll('\\', '/');
      if (backed) {
        console.log(`  ${t('updatedFile', { path: displayPath })} (backup: ${displayPath}.bak)`);
      } else {
        console.log(`  ${t('updatedFile', { path: displayPath })}`);
      }
      count++;
    }
  }

  // 6-merge. Merge IDE settings.json (preserves user keys; matches init behavior)
  await mergeIdeSettings(ides, targetDir);

  // 6a. Copy canonical sources (core, config, dashboard)
  count += await copyCanonicalSources(targetDir, {
    overwrite: true,
    backupFn: backupIfExists,
    protectedFn: isProtected,
  });

  // 6b. Install new non-MCP, non-hybrid bundled skills not already present
  const availableSkills = await listAvailableSkills();
  const installedSkills = await listInstalledSkills(targetDir);
  for (const id of availableSkills) {
    if (id === 'criminalsquad-skill-creator') continue;
    if (installedSkills.includes(id)) continue;
    const meta = await getSkillMeta(id);
    if (!meta) continue;
    if (!isSkillAutoInstallable(meta)) continue;
    if (meta.type === 'mcp' || meta.type === 'hybrid') continue;
    await installSkill(id, targetDir);
    console.log(`  ${t('createdFile', { path: `skills/${id}/SKILL.md` })}`);
    count++;
  }

  // Refresh the catalogue after active and discoverable pilot skills are
  // present. Preview, deprecated and quarantined sources remain bundled only.
  count += await syncSkillCatalogArtifacts(targetDir, {
    overwriteManifest: true,
    backupFn: backupIfExists,
  });

  // 7. Summary
  console.log(`\n  ${t('updateFileCount', { count })}`);
  console.log(`  ${t('updatePreserved')}`);
  console.log(`  ${t('updateSuccess', { version: `v${newVersion}` })}`);
  console.log(`\n  ${t('updateLatestHint')}\n`);

  await logEvent('update', { from: currentVersion || 'unknown', to: newVersion }, targetDir);

  return { success: true };
}
