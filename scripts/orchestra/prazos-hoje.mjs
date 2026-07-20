#!/usr/bin/env node
// Prazos com data fatal HOJE (lê o cache local; instantâneo, sem API).
// Uso: node scripts/orchestra/prazos-hoje.mjs [--json]
import { readTracker, today, output, printFreshness } from './_lib.mjs';

const t = today();
const rows = readTracker()
  .filter((e) => e.fatal === t)
  .sort((a, b) => (a.processo || '').localeCompare(b.processo || ''));

printFreshness();
output(rows, ['fatal', 'processo', 'tipo', 'cliente', 'teor']);
