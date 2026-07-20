#!/usr/bin/env node
// Tudo o que o cache tem sobre um processo (por nº, parcial).
// Uso: node scripts/orchestra/processo-lookup.mjs <nº do processo> [--json]
import { readTracker, output, firstArg } from './_lib.mjs';

const q = firstArg();
if (!q) { console.error('uso: node scripts/orchestra/processo-lookup.mjs <nº do processo> [--json]'); process.exit(1); }
const rows = readTracker()
  .filter((e) => (e.processo || '').includes(q))
  .sort((a, b) => (b.capturado_em || '').localeCompare(a.capturado_em || ''));

output(rows, ['capturado_em', 'processo', 'tipo', 'fatal', 'teor']);
