#!/usr/bin/env node
// Instala um pacote assinado num projeto (SPEC §6.5).
//
//   node tools/apply-pack.mjs <dir-do-pacote> --into <projeto> --pubkey <chave.pub.pem>
//
// É o elo que permite testar numa máquina de verdade: `build-area` produz o
// pacote, este comando o instala. Quando o F3 terminar, `legalsquad acervo sync`
// faz isso sozinho, baixando o pacote em vez de recebê-lo por caminho.
//
// VERIFICA ANTES DE ESCREVER, sempre. Um pacote assinado ainda é conteúdo remoto
// materializando arquivos na máquina de um advogado; a verificação é o que
// separa "instalar" de "confiar em qualquer um".

import { createPublicKey } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { decodeEntity, verificarPacote } from '../src/pack-format.js';
import { lerPacoteDoDisco } from '../src/pack-io.js';
import { aplicarPacote } from '../src/pack-apply.js';

const USO = `Uso:
  node tools/apply-pack.mjs <dir-do-pacote> --into <projeto> --pubkey <chave.pub.pem>

Opções:
  --into <dir>      projeto de destino (padrão: diretório atual)
  --pubkey <path>   chave pública Ed25519 que verifica a assinatura. Obrigatória.
  --dry-run         verifica e lista o que seria escrito, sem escrever nada
`;

function falhar(mensagem) {
  console.error(`apply-pack: ${mensagem}\n\n${USO}`);
  process.exit(1);
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    into: { type: 'string' },
    pubkey: { type: 'string' },
    'dry-run': { type: 'boolean' },
  },
});

const [dirPacote] = positionals;
if (!dirPacote) falhar('informe o diretório do pacote');
// Sem chave pública não há verificação, e sem verificação isto vira um
// descompactador de conteúdo remoto. A obrigatoriedade é o ponto.
if (!values.pubkey) falhar('--pubkey é obrigatória: sem verificar, instalar é confiar em qualquer um');

const destino = values.into || process.cwd();

let chavePublica;
try {
  chavePublica = createPublicKey(readFileSync(values.pubkey));
} catch (erro) {
  falhar(`não consegui ler a chave pública em ${values.pubkey} — ${erro.message}`);
}

let manifesto;
let entidades;
try {
  ({ manifesto, entidades } = lerPacoteDoDisco(dirPacote));
} catch (erro) {
  falhar(erro.message);
}

const veredito = verificarPacote(manifesto, entidades, chavePublica);
if (!veredito.ok) {
  console.error(`apply-pack: pacote RECUSADO — ${manifesto.pack_id}@${manifesto.version}\n`);
  for (const problema of veredito.problemas) console.error(`  · ${problema}`);
  console.error('\nNada foi escrito.');
  process.exit(1);
}

if (manifesto.payload_kind !== 'tree') {
  falhar(`payload_kind "${manifesto.payload_kind}" ainda não tem aplicador neste comando (só "tree")`);
}

const arquivos = entidades
  .filter((entidade) => entidade.role === 'content')
  .flatMap((entidade) => decodeEntity(entidade.buffer));

if (values['dry-run']) {
  console.log(`apply-pack: ${manifesto.pack_id}@${manifesto.version} verificado · ${arquivos.length} arquivos\n`);
  for (const arquivo of arquivos) console.log(`  ${arquivo.path}`);
  console.log('\n--dry-run: nada foi escrito.');
  process.exit(0);
}

const resultado = aplicarPacote(destino, manifesto, arquivos);
if (!resultado.ok) {
  console.error(`apply-pack: aplicação RECUSADA — ${manifesto.pack_id}@${manifesto.version}\n`);
  for (const problema of resultado.problemas) console.error(`  · ${problema}`);
  console.error('\nNada foi escrito.');
  process.exit(1);
}

const { skills = 0, squads = 0, best_practices: bp = 0 } = manifesto.counts || {};
console.log(`apply-pack: ${manifesto.pack_id}@${manifesto.version} instalado em ${destino}`);
console.log(`  ${resultado.escritos.length} arquivos · ${skills} skills · ${squads} squads · ${bp} best-practices`);
console.log('\nRode `npx legalsquad check-skills` para reindexar e conferir o catálogo.');
