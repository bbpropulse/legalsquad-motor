// Lib compartilhada dos scripts "orchestra" do CriminalSquad.
// Padrão importado do My-Brain-Is-Full-Crew: helpers pré-aprovados que consultam um
// cache LOCAL (JSONL) — respostas instantâneas, sem re-consultar a API do DJEN.
// O cache vive em _criminalsquad/_memory/djen-tracker.jsonl (gitignored, privado).

import { readFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
// scripts/orchestra/ -> raiz do projeto -> _criminalsquad/_memory/
export const TRACKER = join(__dirname, '..', '..', '_criminalsquad', '_memory', 'djen-tracker.jsonl');

/** Lê o tracker tolerante a arquivo ausente e linhas inválidas. */
export function readTracker() {
  if (!existsSync(TRACKER)) return [];
  return readFileSync(TRACKER, 'utf8')
    .split('\n').map((l) => l.trim()).filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

/** Chave de dedupe: nº do processo + hash curto do teor. */
export function entryId(obj) {
  const teorHash = createHash('sha1').update(String(obj.teor || '')).digest('hex').slice(0, 8);
  return obj.id || `${obj.processo || '?'}|${teorHash}`;
}

/** Acrescenta uma intimação ao cache, ignorando duplicatas (mesmo processo+teor). */
export function appendEntry(obj) {
  const id = entryId(obj);
  if (readTracker().some((e) => e.id === id)) return { added: false, id };
  const entry = { capturado_em: new Date().toISOString(), lido: false, ...obj, id };
  mkdirSync(dirname(TRACKER), { recursive: true });
  appendFileSync(TRACKER, JSON.stringify(entry) + '\n', 'utf8');
  return { added: true, id };
}

// Data LOCAL (não UTC): o campo `fatal` é data de calendário local (Brasil, UTC-3).
// Usar UTC faria prazos:hoje perder um vencimento à noite (após ~21h BRT vira o dia seguinte).
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export function addDays(isoDate, n) {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const hasFlag = (f) => process.argv.includes(f);
export const firstArg = () => process.argv.slice(2).find((a) => !a.startsWith('--'));

/** Timestamp ISO da captura mais recente no tracker, ou null se vazio. */
export function lastCapture(entries = readTracker()) {
  let max = null;
  for (const e of entries) {
    if (e.capturado_em && (!max || e.capturado_em > max)) max = e.capturado_em;
  }
  return max;
}

/**
 * Imprime 1 linha de frescor do cache — cache velho responde silêncio e vira
 * falsa tranquilidade ("nenhum prazo hoje") num produto de prazo penal.
 * ⚠️ quando vazio ou última captura > maxHoras. Omitido em --json (saída pura).
 */
export function printFreshness(maxHoras = 24) {
  if (hasFlag('--json')) return;
  const last = lastCapture();
  const horas = last ? Math.floor((Date.now() - Date.parse(last)) / 3600000) : NaN;
  if (last && Number.isFinite(horas) && horas <= maxHoras) {
    console.log(`última captura do DJEN: ${horas < 1 ? 'há menos de 1 h' : `há ${horas} h`}\n`);
    return;
  }
  const quando = last && Number.isFinite(horas) ? `última captura há ${horas} h` : 'nenhuma captura no cache';
  console.log(`⚠️ monitoramento desatualizado — ${quando}. Acione a varredura do DJEN antes de confiar nesta resposta.\n`);
}

function trunc(v, n = 60) { const s = v == null ? '' : String(v).replace(/\s+/g, ' '); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

/** Imprime tabela (pipe-delimitada) ou JSON com --json. */
export function output(rows, columns, json = hasFlag('--json')) {
  if (json) { console.log(JSON.stringify(rows, null, 2)); return; }
  if (!rows.length) { console.log('(nenhum registro no cache para este filtro)'); return; }
  console.log(columns.join(' | '));
  for (const r of rows) console.log(columns.map((c) => trunc(r[c])).join(' | '));
  console.log(`\n${rows.length} registro(s).`);
}
