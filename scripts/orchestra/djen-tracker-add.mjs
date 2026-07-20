#!/usr/bin/env node
// Grava intimação(ões) no cache local, com dedupe por nº de processo + teor.
// Quem captura o DJEN (agente monitor-dje-djen / skill djen-api-oficial) chama isto.
// Uso:
//   node scripts/orchestra/djen-tracker-add.mjs --data '{"processo":"...","teor":"...","fatal":"2026-06-24","cliente":"..."}'
//   echo '<json ou array de json>' | node scripts/orchestra/djen-tracker-add.mjs
import { appendEntry } from './_lib.mjs';

const i = process.argv.indexOf('--data');
if (i !== -1 && process.argv[i + 1]) {
  run(process.argv[i + 1]);
} else {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => { raw += c; });
  process.stdin.on('end', () => run(raw));
}

function run(raw) {
  let obj;
  try { obj = JSON.parse(raw); } catch (e) { console.error('JSON inválido:', e.message); process.exit(1); }
  const items = Array.isArray(obj) ? obj : [obj];
  let added = 0, dup = 0;
  for (const it of items) { (appendEntry(it).added ? added++ : dup++); }
  console.log(`adicionados: ${added} | duplicados (ignorados): ${dup}`);
}
