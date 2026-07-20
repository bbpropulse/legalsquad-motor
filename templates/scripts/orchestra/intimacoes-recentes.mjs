#!/usr/bin/env node
// Intimações capturadas nas últimas N horas (default 24) — cache local.
// Uso: node scripts/orchestra/intimacoes-recentes.mjs [horas] [--json]
import { readTracker, output, firstArg, printFreshness } from './_lib.mjs';

const horas = Number(firstArg()) > 0 ? Number(firstArg()) : 24;
const corte = new Date(Date.now() - horas * 3600 * 1000).toISOString();
const rows = readTracker()
  .filter((e) => (e.capturado_em || '') >= corte)
  .sort((a, b) => (b.capturado_em || '').localeCompare(a.capturado_em || ''));

printFreshness();
output(rows, ['capturado_em', 'processo', 'tipo', 'cliente', 'teor']);
