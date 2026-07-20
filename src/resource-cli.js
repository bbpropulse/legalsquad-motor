import { createInterface } from 'node:readline';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { loadLocale, t, getLocaleCode } from './i18n.js';
import { loadSavedLocale } from './init.js';
import { logEvent } from './logger.js';

async function confirm(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

// Builds the install/remove/list/update CLI for a resource type. skills-cli.js
// and agents-cli.js were ~95% identical; this keeps one implementation and
// parametrizes the i18n prefix, list rendering, log names and usage strings.
//
// config:
//   resource    { listInstalled, install, remove, getMeta, getLocalizedDescription }
//   i18nPrefix  'skills' | 'agents' — prefixes every translation key
//   header      title printed by `list`
//   browseLine  trailing "Browse available ... at: <url>" line
//   formatListItem (meta, desc) => string — renders one installed entry
//   logResource 'skill' | 'agent' — logEvent name prefix
//   usage       { install, remove, updateOne } — usage strings per subcommand
//
// Returns an async `(subcommand, args, targetDir) => { success }` handler.
export function createResourceCli(config) {
  const { resource, i18nPrefix, header, browseLine, formatListItem, logResource, usage } = config;

  const tp = (suffix, vars) => t(`${i18nPrefix}${suffix}`, vars);

  async function runList(targetDir) {
    console.log(`\n  ${header}\n`);

    const installed = await resource.listInstalled(targetDir);

    if (installed.length > 0) {
      console.log(`  ${tp('InstalledHeader')}`);
      for (const id of installed) {
        const meta = await resource.getMeta(id);
        if (meta) {
          const desc = resource.getLocalizedDescription(meta, getLocaleCode());
          console.log(`    ${formatListItem(meta, desc)}`);
        } else {
          console.log(`    ${id}`);
        }
      }
    } else {
      console.log(`  ${tp('NoneInstalled')}`);
    }

    console.log(`\n  ${browseLine}\n`);
  }

  async function runInstall(id, targetDir) {
    if (!id) {
      console.log(usage.install);
      return false;
    }

    const installed = await resource.listInstalled(targetDir);
    if (installed.includes(id)) {
      const answer = await confirm(`\n  ${tp('AlreadyInstalled', { id })}`);
      // Accept 'y' (English) or 's' (Portuguese "sim") as affirmative answers
      // Declining a reinstall is the user's choice, NOT a failure — return
      // (undefined = success) so the CLI doesn't exit 1 and break `&&` chains/CI.
      if (answer !== 'y' && answer !== 's') return;
      console.log(`  ${tp('Installing', { id })}`);
      await resource.install(id, targetDir);
      console.log(`  ${tp('Reinstalled', { id })}\n`);
      await logEvent(`${logResource}:install`, { name: id, reinstall: true }, targetDir);
      return;
    }

    console.log(`\n  ${tp('Installing', { id })}`);
    await resource.install(id, targetDir);
    console.log(`  ${tp('Installed', { id })}\n`);
    await logEvent(`${logResource}:install`, { name: id }, targetDir);
  }

  async function runRemove(id, targetDir) {
    if (!id) {
      console.log(usage.remove);
      return false;
    }

    const installed = await resource.listInstalled(targetDir);
    if (!installed.includes(id)) {
      console.log(`\n  ${tp('NotInstalled', { id })}\n`);
      return;
    }

    console.log(`\n  ${tp('Removing', { id })}`);
    await resource.remove(id, targetDir);
    await logEvent(`${logResource}:remove`, { name: id }, targetDir);
    console.log(`  ${tp('Removed', { id })}\n`);
  }

  async function runUpdate(targetDir) {
    const installed = await resource.listInstalled(targetDir);
    if (installed.length === 0) {
      console.log(`\n  ${tp('UpdateNone')}\n`);
      return;
    }

    console.log(`\n  ${tp('Updating')}`);
    for (const id of installed) {
      console.log(`  ${tp('Installing', { id })}`);
      await resource.install(id, targetDir);
      console.log(`  ${tp('Installed', { id })}`);
    }
    await logEvent(`${logResource}:update`, { count: installed.length }, targetDir);
    console.log(`\n  ${tp('UpdateDone', { count: installed.length })}\n`);
  }

  async function runUpdateOne(id, targetDir) {
    if (!id) {
      console.log(usage.updateOne);
      return;
    }

    const installed = await resource.listInstalled(targetDir);
    if (!installed.includes(id)) {
      console.log(`\n  ${tp('NotInstalled', { id })}\n`);
      return;
    }

    console.log(`\n  ${tp('Installing', { id })}`);
    await resource.install(id, targetDir);
    await logEvent(`${logResource}:update`, { name: id }, targetDir);
    console.log(`  ${tp('Installed', { id })}\n`);
  }

  return async function run(subcommand, args, targetDir) {
    // Require initialized project
    try {
      await stat(join(targetDir, '_criminalsquad'));
    } catch {
      await loadLocale('English');
      console.log(`\n  ${tp('NotInitialized')}\n`);
      return { success: false };
    }

    await loadSavedLocale(targetDir);

    try {
      if (subcommand === 'list' || !subcommand) {
        await runList(targetDir);
      } else if (subcommand === 'install') {
        const installed = await runInstall(args[0], targetDir);
        if (installed === false) return { success: false };
      } else if (subcommand === 'remove') {
        const removed = await runRemove(args[0], targetDir);
        if (removed === false) return { success: false };
      } else if (subcommand === 'update') {
        await runUpdate(targetDir);
      } else if (subcommand === 'update-one') {
        await runUpdateOne(args[0], targetDir);
      } else {
        console.log(`\n  ${tp('UnknownCommand', { cmd: subcommand })}\n`);
        return { success: false };
      }
    } catch (err) {
      console.log(`\n  ${tp('Error', { message: err.message })}\n`);
      return { success: false };
    }

    return { success: true };
  };
}
