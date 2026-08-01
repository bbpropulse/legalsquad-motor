#!/usr/bin/env node
// Acrescenta a seção "Precedentes a conferir" às skills, a partir do acervo
// local de informativos oficiais.
//
//   node tools/enriquecer-precedentes.mjs <dir-da-area> <raiz-com-acervo> <ramo> [--aplicar]
//
// Reusa `selecionarDispositivos` — o mesmo casamento conservador da base legal
// (proximidade dos termos, recusa em empate grande). O que muda é o corpus:
// em vez de artigos de lei, os documentos do acervo de jurisprudência daquele
// ramo, representados pelo `assunto` (metadado limpo) em vez do corpo (que em
// informativo antigo do TSE vem com colunas de PDF intercaladas).
//
// Só toca skill que JÁ tem base legal — precedente sem o dispositivo que ele
// interpreta é citação solta. E nunca sobrescreve: a seção é acrescentada ao
// fim, depois da base legal.

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { selecionarDispositivos } from '../src/base-legal.js';
import { extrairPrecedente, montarPrecedentes } from '../src/precedentes.js';
import { contemBaseLegalVerificada } from '../src/base-legal.js';

const args = process.argv.slice(2);
const posicionais = args.filter((a) => !a.startsWith('--'));
const [dirArea, raizAcervo, ...ramos] = posicionais;
const aplicar = args.includes('--aplicar');

// Por padrão exige base legal na skill — precedente sem o dispositivo que ele
// interpreta é citação solta. Mas há área cujo vocabulário de título não casa
// com o das leis e casa muito bem com o dos julgados: medido na área médica,
// o título "negativa de cobertura plano de saúde" não encontra artigo da Lei
// 9.656 (que fala em "operadora", "produto", "beneficiário") e encontra na
// hora o REsp 1.823.077-SP, cujo assunto é literalmente "Plano de saúde.
// Negativa de cobertura". Nessas áreas a skill já tem corpo próprio, e o
// precedente complementa em vez de ficar solto.
const semExigirBaseLegal = args.includes('--sem-exigir-base-legal');

if (!dirArea || !raizAcervo || !ramos.length) {
  console.error('uso: enriquecer-precedentes.mjs <dir-da-area> <raiz-com-acervo> <ramo...> [--aplicar] [--sem-exigir-base-legal]');
  console.error('  <ramo...> um ou mais diretórios em acervo/jurisprudencia/ (ex.: direito-eleitoral)');
  process.exit(1);
}

for (const ramo of ramos) {
  if (!existsSync(join(raizAcervo, 'acervo', 'jurisprudencia', ramo))) {
    console.error(`ENRIQUECER_PRECEDENTES:ERRO — ramo inexistente: ${ramo}`);
    process.exit(1);
  }
}

// Carrega o acervo do ramo. O texto usado para CASAR é o `assunto` do
// frontmatter: é metadado editorial do tribunal, limpo mesmo quando o corpo
// veio de PDF de duas colunas mal extraído.
const corpus = [];
function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (!e.name.endsWith('.md')) continue;
    const raw = readFileSync(p, 'utf8');
    const assunto = (raw.match(/^assunto:\s*"(.*)"\s*$/m) || [])[1] || '';
    if (assunto.length < 25) continue; // assunto truncado curto não discrimina
    const precedente = extrairPrecedente(raw);
    if (!precedente) continue;
    corpus.push({ sigla: precedente.tribunal, url: precedente.fonte, numero: precedente.processo, texto: assunto, precedente });
  }
}
for (const ramo of ramos) walk(join(raizAcervo, 'acervo', 'jurisprudencia', ramo));

console.log(`ENRIQUECER_PRECEDENTES:${basename(dirArea)}`);
console.log(`  ramos:              ${ramos.join(', ')}`);
console.log(`  acervo dos ramos:   ${corpus.length} precedentes identificáveis`);

const skillsDir = join(dirArea, 'skills');
const ids = readdirSync(skillsDir).filter((d) => existsSync(join(skillsDir, d, 'SKILL.md')));

let elegiveis = 0;
let comPrecedente = 0;

for (const id of ids) {
  const caminho = join(skillsDir, id, 'SKILL.md');
  const original = readFileSync(caminho, 'utf8');
  // Precedente sem o dispositivo que ele interpreta é citação solta — salvo
  // quando a skill já traz corpo próprio com fundamentação (ver a nota sobre
  // `--sem-exigir-base-legal` no topo).
  if (!semExigirBaseLegal && !contemBaseLegalVerificada(original)) continue;
  if (original.includes('## Precedentes a conferir')) continue;
  elegiveis++;

  const titulo = (original.match(/^#\s+(.+)$/m) || [])[1] || id.replace(/-/g, ' ');
  const achados = selecionarDispositivos(titulo, corpus);
  if (!achados.length) continue;

  const bloco = montarPrecedentes(achados.map((a) => a.precedente));
  if (!bloco) continue;

  comPrecedente++;
  if (!aplicar) continue;
  writeFileSync(caminho, `${original.trimEnd()}\n\n${bloco}`, 'utf8');
}

console.log(`  skills com base legal: ${elegiveis}`);
console.log(`  ganharam precedentes:  ${comPrecedente} (${elegiveis ? ((comPrecedente / elegiveis) * 100).toFixed(0) : 0}%)`);
if (!aplicar) console.log('\n  (dry-run — use --aplicar)');
