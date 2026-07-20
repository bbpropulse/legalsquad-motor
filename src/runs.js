import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const MAX_RUNS = 20;

export async function listRuns(squadName, targetDir = process.cwd()) {
  const squadsDir = join(targetDir, 'squads');
  let squadNames;

  try {
    if (squadName) {
      squadNames = [squadName];
    } else {
      const entries = await readdir(squadsDir, { withFileTypes: true });
      squadNames = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    }
  } catch {
    return [];
  }

  const runs = [];

  for (const name of squadNames) {
    const outputDir = join(squadsDir, name, 'output');
    let runDirs;
    try {
      const entries = await readdir(outputDir, { withFileTypes: true });
      runDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch {
      continue;
    }

    for (const runId of runDirs) {
      const run = { squad: name, runId, status: 'unknown', steps: null, duration: null };

      try {
        const raw = await readFile(join(outputDir, runId, 'state.json'), 'utf-8');
        const state = JSON.parse(raw);
        run.status = state.status || 'unknown';
        if (state.step) run.steps = `${state.step.current}/${state.step.total}`;
        if (state.startedAt && (state.completedAt || state.failedAt)) {
          const start = new Date(state.startedAt).getTime();
          const end = new Date(state.completedAt || state.failedAt).getTime();
          run.duration = formatDuration(end - start);
        }
      } catch {
        // No state.json or malformed — keep defaults
      }

      runs.push(run);
    }
  }

  runs.sort((a, b) => b.runId.localeCompare(a.runId));
  return runs.slice(0, MAX_RUNS);
}

export function formatDuration(ms) {
  if (ms <= 0) return '0s';
  const seconds = Math.floor(ms / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

export function printRuns(runs) {
  if (runs.length === 0) {
    console.log('\n  No runs found.\n');
    return;
  }

  // Group by squad before printing. listRuns sorts globally by recency, which
  // intercalates squads — printing a header per "squad change" would repeat a
  // squad's header. Grouping keeps each squad's runs (already recency-ordered)
  // under a single header.
  const bySquad = new Map();
  for (const run of runs) {
    if (!bySquad.has(run.squad)) bySquad.set(run.squad, []);
    bySquad.get(run.squad).push(run);
  }
  for (const [squad, squadRuns] of bySquad) {
    console.log(`\n  ${squad}`);
    console.log('  ' + '─'.repeat(50));
    for (const run of squadRuns) {
      const parts = [`    ${run.runId}`];
      parts.push(`[${run.status}]`);
      if (run.steps) parts.push(`${run.steps} steps`);
      if (run.duration) parts.push(run.duration);
      console.log(parts.join('  '));
    }
  }
  console.log();
}
