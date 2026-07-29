#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { join } from 'node:path';
import { init } from '../src/init.js';
import { installGlobal } from '../src/install-global.js';
import { update } from '../src/update.js';
import { skillsCli } from '../src/skills-cli.js';
import { agentsCli } from '../src/agents-cli.js';
import { listRuns, printRuns } from '../src/runs.js';
import {
  auditSkillsProject,
  checkSkillsProject,
  contractSkillsProject,
  indexSkillsProject,
} from '../src/skill-catalog-cli.js';
import { skillRuntimeCli } from '../src/skill-runtime-cli.js';
import { skillSearchCli } from '../src/skill-search.js';
import { acervoSearchCli } from '../src/acervo-search.js';
import { acervoCli } from '../src/acervo-cli.js';
import { capturaCli } from '../src/captura-cli.js';
import { checkSquad } from '../src/squad-check.js';

const HELP = `
  legalsquad — Multi-agent orchestration for Claude Code

  Usage:
    npx legalsquad init                    Initialize LegalSquad (in this folder)
    npx legalsquad init --skip-deps        Initialize without installing dependencies
    npx legalsquad install-global          Install for ALL Claude conversations (~/.claude)
    npx legalsquad update                  Update LegalSquad core
    npx legalsquad install <name>          Install a skill
    npx legalsquad uninstall <name>        Remove a skill
    npx legalsquad update <name>           Update a specific skill
    npx legalsquad skills                  List installed skills
    npx legalsquad agents                  List installed agents
    npx legalsquad agents install <name>   Install a predefined agent
    npx legalsquad agents remove <name>    Remove an agent
    npx legalsquad agents update           Update all agents
    npx legalsquad indexar-skills          Regenerate skills/_index.yaml
    npx legalsquad contract-skills         Apply the v5 operational contract + reindex
    npx legalsquad check-skills            Validate skill catalogue and graph
    npx legalsquad audit-skills            Audit skill contracts and evidence maturity
    npx legalsquad search-skills <query>   Return a compact, ranked skill shortlist
    npx legalsquad search-acervo <query>   Return a compact, ranked acervo shortlist
    npx legalsquad captura <file|URL>      Watch video + transcribe audio (local by default)
    npx legalsquad captura setup           Install on-use deps (ffmpeg/yt-dlp/faster-whisper)
    npx legalsquad resolve-skills <id...>  Enforce runtime lifecycle/evidence gates
    npx legalsquad check-squad <code>      Validate a squad's structure, rubric and eval harness
    npx legalsquad acervo status           Show synced packs and cache freshness
    npx legalsquad acervo sync             Sync pack catalogues (needs a configured server)
    npx legalsquad runs [squad-name]       View execution history

  Learn more: https://github.com/bbpropulse/legalsquad
  `;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  strict: false,
  options: {
    'skip-deps': { type: 'boolean' },
    force: { type: 'boolean' },
    yes: { type: 'boolean' },
    lang: { type: 'string' },
    ide: { type: 'string' },
    supervised: { type: 'boolean' },
    selection: { type: 'boolean' },
    'explicit-selection': { type: 'boolean' },
    query: { type: 'string' },
    limit: { type: 'string' },
    'include-preview': { type: 'boolean' },
    'include-quarantined': { type: 'boolean' },
    json: { type: 'boolean' },
    'pilot-opt-in': { type: 'string', multiple: true },
    'pilot-fallback': { type: 'string', multiple: true },
    'squads-dir': { type: 'string' },
  },
});

const command = positionals[0];
const cwd = process.cwd();

// Command table: each entry returns a result; `checkSuccess` entries set a
// non-zero exit code when the handler reports { success: false }.
const commands = {
  init: {
    run: () => init(cwd, {
      skipDeps: values['skip-deps'] === true,
      // Non-interactive (`--yes`) lets the /legalsquad skill auto-initialize the
      // current project folder without prompting — keeping every project's data local.
      ...(values.yes
        ? {
          _skipPrompts: true,
          _language: values.lang || 'Português (Brasil)',
          _ides: values.ide
            ? String(values.ide).split(',').map((s) => s.trim()).filter(Boolean)
            : ['claude-code'],
        }
        : {}),
    }),
  },
  'install-global': { run: () => installGlobal() },
  install: { run: () => skillsCli('install', positionals.slice(1), cwd), checkSuccess: true },
  uninstall: { run: () => skillsCli('remove', positionals.slice(1), cwd), checkSuccess: true },
  update: {
    run: () => {
      const target = positionals[1];
      // `update <name>` updates a single skill; bare `update` updates the core.
      return target ? skillsCli('update-one', [target], cwd) : update(cwd);
    },
    checkSuccess: true,
  },
  skills: { run: () => skillsCli(positionals[1], positionals.slice(2), cwd), checkSuccess: true },
  agents: { run: () => agentsCli(positionals[1], positionals.slice(2), cwd), checkSuccess: true },
  'indexar-skills': { run: () => indexSkillsProject(cwd), checkSuccess: true },
  'contract-skills': {
    run: () => contractSkillsProject(cwd, { force: values.force === true }),
    checkSuccess: true,
  },
  'check-skills': { run: () => checkSkillsProject(cwd), checkSuccess: true },
  // Gate mecânico de squad: o que o build.prompt.md descreve como
  // "Filesystem Validation" verificado por código, com exit code utilizável.
  'check-squad': {
    run: () => {
      const alvo = positionals[1];
      if (!alvo) {
        console.error('Uso: npx legalsquad check-squad <code> [--squads-dir <dir>]');
        return { success: false };
      }
      const squadsDir = values['squads-dir'] || join(cwd, 'squads');
      const r = checkSquad(alvo, { squadsDir });

      const erros = r.issues.filter((i) => i.severity === 'error');
      const avisos = r.issues.filter((i) => i.severity === 'warn');

      console.log(`Squad: ${r.squad}`);
      for (const i of erros) console.log(`  ✖ [${i.code}] ${i.detail}`);
      for (const i of avisos) console.log(`  ⚠ [${i.code}] ${i.detail}`);
      console.log(
        r.ok
          ? `  ✓ estrutura íntegra${avisos.length ? ` (${avisos.length} aviso(s))` : ''}`
          : `  ${erros.length} erro(s) — corrija antes de rodar o squad`
      );

      return { success: r.ok };
    },
    checkSuccess: true,
  },
  'audit-skills': { run: () => auditSkillsProject(cwd), checkSuccess: true },
  'search-skills': {
    run: () => skillSearchCli(values.query || positionals.slice(1).join(' '), cwd, values),
    checkSuccess: true,
  },
  'search-acervo': {
    run: () => acervoSearchCli(values.query || positionals.slice(1).join(' '), cwd, values),
    checkSuccess: true,
  },
  // Forward the raw argv tail (not parseArgs output) so engine flags like
  // --sigiloso / --start / --transcribe survive intact.
  captura: {
    run: () => capturaCli(process.argv.slice(3)),
    checkSuccess: true,
  },
  'resolve-skills': {
    run: () => skillRuntimeCli(positionals.slice(1), cwd, values),
    checkSuccess: true,
  },
  acervo: {
    run: () => acervoCli(positionals[1] || 'status', cwd, values),
    checkSuccess: true,
  },
  runs: {
    run: async () => {
      const runs = await listRuns(positionals[1] || null, cwd);
      printRuns(runs);
    },
  },
};

const entry = commands[command];

if (entry) {
  const result = await entry.run();
  if (entry.checkSuccess && result && !result.success) process.exitCode = 1;
} else {
  console.log(HELP);
  if (command) process.exitCode = 1;
}
