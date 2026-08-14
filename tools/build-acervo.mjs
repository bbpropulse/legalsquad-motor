// Empacotador de acervo jurisprudencial.
//
//   node tools/build-acervo.mjs <diretorio-de-jurisprudencia> --key <chave.pem> \
//     [--version <AAAA.MM.SEQ>] [--out <dir>] [--area <nome>]
//
// GENÉRICO E CEGO, como o `build-area`: recebe o diretório por argumento e
// nunca conhece repositório específico. Espera uma pasta por área
// (`direito-civil/`, `direito-do-trabalho/`…) com os julgados em markdown.
//
// Produz um pacote `acervo.<area>` por área, cada um instalando em
// `acervo/_packs/acervo.<area>/jurisprudencia/` — a única subárvore que o sync
// pode gravar dentro de `acervo/`, que no resto é curadoria do usuário.

import { createPrivateKey } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { construirAcervo } from '../src/acervo-build.js';

function falhar(mensagem) {
  console.error(`build-acervo: ${mensagem}\n`);
  console.error('Uso:');
  console.error('  node tools/build-acervo.mjs <dir-jurisprudencia> --key <chave.pem> [--version <v>] [--out <dir>]');
  process.exit(1);
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    key: { type: 'string' },
    version: { type: 'string' },
    out: { type: 'string' },
    area: { type: 'string' },
  },
});

const [raizConteudo] = positionals;
if (!raizConteudo) falhar('informe o diretório de jurisprudência');
if (!values.key) falhar('--key é obrigatória (chave privada Ed25519)');

const criadoEm = new Date().toISOString();
const versao = values.version || `${criadoEm.slice(0, 4)}.${criadoEm.slice(5, 7)}.1`;
const destino = values.out || join(process.cwd(), 'packs-acervo');

let resultado;
try {
  resultado = construirAcervo({
    raizConteudo,
    chavePrivada: createPrivateKey(readFileSync(values.key)),
    versao,
    criadoEm,
    signingKid: process.env.LEGALSQUAD_SIGNING_KID,
  });
} catch (erro) {
  falhar(erro.message);
}

const pacotes = values.area
  ? resultado.pacotes.filter((p) => p.packId === `acervo.${values.area}`)
  : resultado.pacotes;

if (!pacotes.length) falhar(values.area ? `área "${values.area}" não encontrada` : 'nenhum julgado encontrado');

for (const pacote of pacotes) {
  const dir = join(destino, `${pacote.packId}@${versao}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(pacote.manifesto, null, 2));
  for (const entidade of pacote.entidades) writeFileSync(join(dir, entidade.file), entidade.buffer);
}

console.log(`build-acervo: ${pacotes.length} pacote(s) em ${destino}\n`);
let total = 0;
for (const pacote of pacotes) {
  const bytes = pacote.entidades.reduce((s, e) => s + e.buffer.length, 0);
  total += bytes;
  console.log(`  ${pacote.packId}@${versao}`);
  console.log(`    ${pacote.manifesto.counts.julgados} julgados · ${(bytes / 1024 / 1024).toFixed(1)} MB`);
}
console.log(`\n  total: ${(total / 1024 / 1024).toFixed(1)} MB`);
