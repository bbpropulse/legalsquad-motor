#!/usr/bin/env node
// Preenche a base legal das skills que estão vazias, a partir das normas já
// coletadas no acervo.
//
//   node tools/enriquecer-base-legal.mjs <dir-da-area> <raiz-com-acervo> [--aplicar] [--extra <arquivo.html>=<SIGLA>=<url>]
//
// Só toca em skill **sem uma linha de corpo próprio** — nunca sobrescreve
// conteúdo escrito à mão. E só grava quando o casamento de tema com dispositivo
// é forte (ver `src/base-legal.js`): preencher com o artigo errado é pior que
// deixar a casca, porque a skill passa a parecer fundamentada apontando para o
// lugar errado.
//
// O que isto NÃO faz: a camada de julgamento — armadilha, contra-tese,
// distinção de figuras próximas. Isso não escala e é onde a invenção entra.
// O bloco gerado se declara "ponto de partida, não rol exaustivo".

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { montarBaseLegal } from '../src/base-legal.js';
import { htmlParaTexto, fatiarArtigos } from '../src/legislacao-parse.js';

// Quais normas alimentam cada área. Sem entrada aqui, a área não é enriquecida
// — melhor não fazer nada do que casar tema contra corpo de lei alheio.
const NORMAS_POR_AREA = {
  eleitoral: ['CE', 'LC64', 'L9504'],
  'direito-constitucional': ['CF', 'L12016', 'L9868', 'L9882'],
  'direito-administrativo': ['L8112', 'L14133', 'L9784', 'L8429', 'L7347'],
  'direito-civil': ['CC', 'CPC', 'L9099'],
  'direito-previdenciario': ['L8213'],
  'direito-do-consumidor': ['CDC'],
  'direito-imobiliario': ['L6015', 'L8245'],
  'direito-tributario': ['CTN'],
  'direito-trabalhista': ['CLT'],
  'direito-penal': ['CP', 'CPP'],
};

const args = process.argv.slice(2);
const posicionais = args.filter((a) => !a.startsWith('--'));
const [dirArea, raizAcervo] = posicionais;
const aplicar = args.includes('--aplicar');
const extras = args.filter((a) => a.startsWith('--extra=')).map((a) => a.slice(8));

if (!dirArea || !raizAcervo) {
  console.error('uso: enriquecer-base-legal.mjs <dir-da-area> <raiz-com-acervo> [--aplicar] [--extra=arquivo.html=SIGLA=url]');
  process.exit(1);
}

const area = basename(dirArea);
const corpus = [];

for (const sigla of NORMAS_POR_AREA[area] || []) {
  const dir = join(raizAcervo, 'acervo', 'legislacao', sigla);
  if (!existsSync(dir)) continue;
  for (const arquivo of readdirSync(dir)) {
    if (!arquivo.includes('-art-')) continue;
    const bruto = readFileSync(join(dir, arquivo), 'utf8');
    const numero = (bruto.match(/^artigo:\s*"(.+?)"$/m) || [])[1];
    const url = (bruto.match(/^fonte_url:\s*"(.+?)"$/m) || [])[1] || '';
    const texto = bruto.split(/^---$/m).slice(2).join('---').replace(/^\s*#\s+.*$/m, '').trim();
    if (numero && texto) corpus.push({ sigla, url, numero, texto });
  }
}

// Normas fora do Planalto (resoluções de tribunal) entram por --extra.
for (const extra of extras) {
  const [arquivo, sigla, url] = extra.split('=');
  if (!existsSync(arquivo)) { console.error(`  extra ausente: ${arquivo}`); continue; }
  for (const artigo of fatiarArtigos(htmlParaTexto(readFileSync(arquivo)))) {
    corpus.push({ sigla, url, numero: artigo.numero, texto: artigo.texto });
  }
}

if (!corpus.length) {
  console.log(`ENRIQUECER:${area} — nenhuma norma carregada; nada a fazer`);
  process.exit(0);
}

const skillsDir = join(dirArea, 'skills');
const ids = readdirSync(skillsDir).filter((d) => existsSync(join(skillsDir, d, 'SKILL.md')));

function corpoProprio(texto) {
  return texto
    .split(/^---$/m).slice(2).join('---')
    .split('\n').map((l) => l.trim())
    .filter((l) => l && !/^#\s/.test(l) && !/^> \*\*Protocolo operacional/.test(l));
}

let vazias = 0;
let preenchidas = 0;
const semCasamento = [];

for (const id of ids) {
  const caminho = join(skillsDir, id, 'SKILL.md');
  const original = readFileSync(caminho, 'utf8');
  if (corpoProprio(original).length) continue;
  vazias++;

  const titulo = (original.match(/^#\s+(.+)$/m) || [])[1] || id.replace(/-/g, ' ');
  const bloco = montarBaseLegal(titulo, corpus);
  if (!bloco) { semCasamento.push(id); continue; }

  preenchidas++;
  if (!aplicar) continue;
  writeFileSync(caminho, `${original.trimEnd()}\n\n${bloco}`, 'utf8');
}

console.log(`ENRIQUECER:${area}`);
console.log(`  normas carregadas:  ${new Set(corpus.map((c) => c.sigla)).size} (${corpus.length} artigos)`);
console.log(`  skills vazias:      ${vazias}`);
console.log(`  base legal montada: ${preenchidas} (${vazias ? ((preenchidas / vazias) * 100).toFixed(0) : 0}%)`);
console.log(`  sem casamento forte: ${semCasamento.length} — seguem vazias, marcadas como lacuna`);
if (!aplicar) console.log('\n  (dry-run — use --aplicar)');
