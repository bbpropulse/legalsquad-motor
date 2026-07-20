#!/usr/bin/env node
// Resumo AGREGADO dos scores de eval de um squad — lê squads/<squad>/_evals/scores.md
// (preenchido pelo `/criminalsquad eval`). Determinístico (sem IA): serve para ver a
// nota média/última e pegar REGRESSÃO ao longo do tempo.
//   node scripts/eval-resumo.mjs <squad>   (ou: npm run eval:resumo <squad>)
//   node scripts/eval-resumo.mjs           (todos os squads com scores)
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SQUADS = join(__dirname, '..', 'squads');

// Lê a tabela markdown `| Data | Run/Caso | Nota | Verdict | Observações |` (linhas anexadas).
function parseScores(file) {
  const out = [];
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.trim().startsWith('|')) continue;
    if (/^\|[\s|:-]+\|?\s*$/.test(line)) continue; // linha separadora (---)
    const cells = line.split('|').map((c) => c.trim());
    if (cells[1] === 'Data') continue;             // cabeçalho
    // Extrai o PRIMEIRO número da célula (aceita "85", "8,5", "85/100" → 85) e
    // ignora placeholders não-numéricos ("n/a", "—", "TBD") — senão a média e a
    // detecção de regressão eram corrompidas silenciosamente.
    const m = String(cells[3] ?? '').match(/\d+(?:[.,]\d+)?/);
    const nota = m ? Number(m[0].replace(',', '.')) : NaN;
    if (Number.isFinite(nota)) {
      out.push({ data: cells[1], caso: cells[2], nota, verdict: cells[4] ?? '' });
    }
  }
  return out;
}

function statsFor(squad) {
  const file = join(SQUADS, squad, '_evals', 'scores.md');
  if (!existsSync(file)) return null;
  const rows = parseScores(file);
  if (!rows.length) return { squad, n: 0 };
  const notas = rows.map((r) => r.nota);
  const media = Math.round(notas.reduce((a, b) => a + b, 0) / notas.length);
  return {
    squad,
    n: rows.length,
    media,
    ultima: rows[rows.length - 1].nota,
    min: Math.min(...notas),
    max: Math.max(...notas),
    aprovados: rows.filter((r) => /APROVAD/i.test(r.verdict)).length,
  };
}

const arg = process.argv[2];
const list = arg
  ? [arg]
  : (existsSync(SQUADS) ? readdirSync(SQUADS) : []).filter((d) => existsSync(join(SQUADS, d, '_evals', 'scores.md')));

if (!list.length) {
  console.log('Nenhum squad com _evals/scores.md ainda. Rode /criminalsquad eval <squad> primeiro.');
  process.exit(0);
}

console.log('Squad | Avaliações | Média | Última | Min–Max | Aprovados');
console.log('------|-----------|-------|--------|---------|----------');
for (const sq of list) {
  const st = statsFor(sq);
  if (!st) { console.log(`${sq} | (sem scores.md)`); continue; }
  if (st.n === 0) { console.log(`${sq} | 0 | — | — | — | —`); continue; }
  const tend = st.ultima < st.media ? ' ⚠️ abaixo da média' : '';
  console.log(`${sq} | ${st.n} | ${st.media} | ${st.ultima}${tend} | ${st.min}–${st.max} | ${st.aprovados}/${st.n}`);
}
