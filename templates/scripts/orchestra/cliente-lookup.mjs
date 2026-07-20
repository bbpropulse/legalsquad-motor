#!/usr/bin/env node
// Intimações por cliente (nome parcial, sem distinção de maiúsculas).
// Uso: node scripts/orchestra/cliente-lookup.mjs <nome do cliente> [--json]
import { readTracker, output, firstArg } from './_lib.mjs';

const q = (firstArg() || '').toLowerCase();
if (!q) { console.error('uso: node scripts/orchestra/cliente-lookup.mjs <nome do cliente> [--json]'); process.exit(1); }
const rows = readTracker()
  .filter((e) => (e.cliente || '').toLowerCase().includes(q))
  .sort((a, b) => (b.capturado_em || '').localeCompare(a.capturado_em || ''));

output(rows, ['capturado_em', 'processo', 'tipo', 'fatal', 'cliente']);
