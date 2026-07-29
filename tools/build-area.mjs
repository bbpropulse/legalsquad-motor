#!/usr/bin/env node
// Empacotador de área (F1).
//
//   node tools/build-area.mjs <diretorio-de-conteudo> <area-id> --key <chave.pem> [--out <dir>]
//
// GENÉRICO E CEGO por definição: nenhum caminho de repositório aparece aqui.
// Empacota o que apontarem — um checkout, um diretório exportado, um tarball
// extraído. Se um dia precisar saber *de quem* é o conteúdo, o desenho está
// errado.
//
// Ele LÊ a origem e JAMAIS escreve nela; a invariante é verificada no CI com
// fixture sintética (`tests/pack-build.test.js`), por hash da árvore antes e
// depois — não por `git status` de um repositório externo.

import { createPrivateKey } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { construirPacotes } from '../src/pack-build.js';

const USO = `Uso:
  node tools/build-area.mjs <diretorio-de-conteudo> <area-id> --key <chave.pem> [opções]

Opções:
  --key <caminho>      chave privada Ed25519 (PEM). Obrigatória: a assinatura é o selo de curadoria.
  --out <diretorio>    onde gravar os pacotes (padrão: ./dist/packs)
  --version <versao>   versão do pacote, calendário AAAA.MM.SEQ (padrão: derivada da data informada)
  --created-at <iso>   timestamp do manifesto (padrão: agora)
  --kid <id>           identificador da chave pública que verifica (signing_kid)
`;

function falhar(mensagem) {
  console.error(`build-area: ${mensagem}\n\n${USO}`);
  process.exit(1);
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    key: { type: 'string' },
    out: { type: 'string' },
    version: { type: 'string' },
    'created-at': { type: 'string' },
    kid: { type: 'string' },
  },
});

const [raizConteudo, areaId] = positionals;
if (!raizConteudo || !areaId) falhar('informe o diretório de conteúdo e o area-id');
// Sem chave não há pacote. A assinatura é o selo de curadoria, não um detalhe de
// empacotamento — gerar uma efêmera "para testar" produziria um artefato que
// ninguém consegue verificar e que parece válido.
if (!values.key) falhar('--key é obrigatória: a assinatura é o selo de curadoria');

const criadoEm = values['created-at'] || new Date().toISOString();
const versao = values.version || `${criadoEm.slice(0, 4)}.${criadoEm.slice(5, 7)}.1`;
const destino = values.out || join(process.cwd(), 'dist', 'packs');

let chavePrivada;
try {
  chavePrivada = createPrivateKey(readFileSync(values.key));
} catch (erro) {
  falhar(`não consegui ler a chave privada em ${values.key} — ${erro.message}`);
}

const { pacotes, relatorio } = construirPacotes({
  raizConteudo,
  areaId,
  chavePrivada,
  versao,
  criadoEm,
  signingKid: values.kid || null,
});

for (const pacote of pacotes) {
  const dir = join(destino, `${pacote.packId}@${versao}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'manifest.json'), `${JSON.stringify(pacote.manifesto, null, 2)}\n`);
  for (const entidade of pacote.entidades) {
    writeFileSync(join(dir, entidade.file), entidade.buffer);
  }
}

console.log(`build-area: ${pacotes.length} pacote(s) em ${destino}\n`);
for (const linha of relatorio.pacotes) {
  const { skills, squads, best_practices: bp, files } = linha.counts;
  console.log(`  ${linha.packId}@${versao}`);
  console.log(`    ${skills} skills · ${squads} squads · ${bp} best-practices · ${files} arquivos`);
  console.log(`    catálogo ${linha.bytesCatalogo}B · conteúdo ${linha.bytesConteudo}B · razão ${linha.razao}x`);
  console.log(`    ${linha.contentHash}\n`);
}
