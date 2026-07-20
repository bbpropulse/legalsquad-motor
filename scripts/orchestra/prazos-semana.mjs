#!/usr/bin/env node
// Prazos com data fatal nos próximos 7 dias (cache local).
// Uso: node scripts/orchestra/prazos-semana.mjs [--json]
import { readTracker, today, addDays, output, printFreshness } from './_lib.mjs';

const ini = today();
const fim = addDays(ini, 7);
const rows = readTracker()
  .filter((e) => e.fatal && e.fatal >= ini && e.fatal <= fim)
  .sort((a, b) => (a.fatal || '').localeCompare(b.fatal || ''));

printFreshness();
output(rows, ['fatal', 'processo', 'tipo', 'cliente', 'teor']);
