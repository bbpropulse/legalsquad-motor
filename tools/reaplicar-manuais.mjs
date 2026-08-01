#!/usr/bin/env node
// Reaplica corpos escritos à mão (backup permanente) sobre skills recém
// extraídas, preservando o frontmatter do pacote. Existe porque
// `extrair-molde.mjs` lê da ORIGEM (nunca das edições manuais, que só vivem
// no destino) — sem este passo, reextrair do zero apaga qualquer skill
// enriquecida à mão.
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const [backupDir, areaDir] = process.argv.slice(2);
if (!backupDir || !areaDir) {
  console.error('uso: reaplicar-manuais.mjs <dir-de-backup> <dir-da-area>');
  process.exit(1);
}

let aplicadas = 0;
for (const id of readdirSync(backupDir)) {
  const corpo = join(backupDir, id, 'CORPO.md');
  const alvo = join(areaDir, 'skills', id, 'SKILL.md');
  if (!existsSync(corpo) || !existsSync(alvo)) continue;

  const original = readFileSync(alvo, 'utf8');
  const fim = original.indexOf('\n---', 4);
  if (!original.startsWith('---') || fim < 0) { console.error(`  sem frontmatter reconhecível: ${id}`); continue; }
  const frontmatter = original.slice(0, fim + 4);

  writeFileSync(alvo, `${frontmatter}\n\n${readFileSync(corpo, 'utf8')}`, 'utf8');
  aplicadas++;
}
console.log(`REAPLICAR_MANUAIS: ${aplicadas} skills`);
