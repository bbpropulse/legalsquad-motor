#!/usr/bin/env node
// Publica um pacote assinado (saída de `build-area`) no servidor de acervo.
//
//   node tools/publish-pack.mjs <dir-do-pacote> --server <url> \
//     --admin-secret <segredo> --pubkey <chave.pub.pem>
//
// VERIFICA ANTES DE PUBLICAR, sempre — `--pubkey` é obrigatória de propósito.
// O servidor de distribuição nunca importa lógica de assinatura de conteúdo
// (ver README de legalsquad-acervo-server): a verificação Ed25519 acontece
// AQUI, com `pack-format.js`, antes de qualquer byte subir. O segredo de
// admin autentica QUEM publica; esta verificação garante O QUE é publicado.

import { createPublicKey } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { verificarPacote } from '../src/pack-format.js';
import { lerPacoteDoDisco } from '../src/pack-io.js';
import { empacotarParaTransporte } from '../src/pack-archive.js';
import { versaoAvanca } from '../src/pack-version.js';

const USO = `Uso:
  node tools/publish-pack.mjs <dir-do-pacote> --server <url> --admin-secret <segredo> --pubkey <chave.pub.pem>

Opções:
  --server <url>        URL base do servidor (ex.: https://acervo.example.com)
  --admin-secret <val>  segredo do endpoint POST /v1/admin/publish
  --pubkey <path>       chave pública Ed25519 que verifica o pacote ANTES de publicar. Obrigatória.
`;

function falhar(mensagem) {
  console.error(`publish-pack: ${mensagem}\n\n${USO}`);
  process.exit(1);
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    server: { type: 'string' },
    'admin-secret': { type: 'string' },
    pubkey: { type: 'string' },
    'force-version': { type: 'boolean' },
  },
});

const [dirPacote] = positionals;
if (!dirPacote) falhar('informe o diretório do pacote (saída de build-area)');
if (!values.server) falhar('--server é obrigatória');
if (!values['admin-secret']) falhar('--admin-secret é obrigatória');
// Sem verificação local, publicar seria confiar cegamente no que está em
// disco — a mesma regra de `apply-pack.mjs`, na outra ponta do transporte.
if (!values.pubkey) falhar('--pubkey é obrigatória: nunca publica sem verificar antes');

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
  console.error(`publish-pack: pacote RECUSADO — ${manifesto.pack_id}@${manifesto.version}\n`);
  for (const problema of veredito.problemas) console.error(`  · ${problema}`);
  console.error('\nNada foi publicado.');
  process.exit(1);
}

// ── Porta contra retrocesso de versão ─────────────────────────────────────
//
// O servidor guarda por versão e serve a MAIOR como `latest`. Publicar um
// número menor sobe, responde 200 e não move nada: o curador lê "publicado" e
// os usuários continuam baixando o conteúdo antigo. Aconteceu nesta base — um
// build sem `--version` saiu `2026.08.1` contra uma produção em `2026.08.11`,
// os 14 pacotes subiram e a `latest` não se moveu.
//
// A verificação vive AQUI, no cliente, e não no servidor, pelo mesmo motivo da
// verificação de assinatura (§7.2): quem publica é quem tem o contexto para
// decidir. `--force-version` existe para o caso legítimo de republicar por
// cima (rollback deliberado), e precisa ser digitado.
if (!values['force-version']) {
  let publicada = null;
  try {
    const catalogo = await fetch(new URL('/v1/catalog', values.server), {
      headers: { authorization: `Bearer ${values['admin-secret']}` },
    }).then((r) => (r.ok ? r.json() : null));
    publicada = catalogo?.packs?.find((p) => p.pack_id === manifesto.pack_id)?.latest ?? null;
  } catch {
    // Servidor inalcançável para consulta: o POST logo abaixo falha com
    // mensagem própria. Não inventamos um veredito de versão a partir do
    // silêncio da rede.
  }

  if (publicada && !versaoAvanca(manifesto.version, publicada)) {
    falhar(
      `versão NÃO avança — ${manifesto.pack_id}@${manifesto.version} contra ${publicada} já publicada.\n` +
        '  O servidor serve a MAIOR versão como `latest`: isto subiria, responderia 200 e não mudaria\n' +
        '  nada para os usuários. Reconstrua com `--version` maior (ex.: suba o SEQ), ou passe\n' +
        '  `--force-version` se a intenção é mesmo republicar por cima.'
    );
  }
}

const buffer = empacotarParaTransporte(manifesto, entidades);
const url = new URL('/v1/admin/publish', values.server);

let resposta;
try {
  resposta = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${values['admin-secret']}`,
      'x-pack-id': manifesto.pack_id,
      'x-payload-kind': manifesto.payload_kind,
      'x-pack-version': manifesto.version,
      'content-type': 'application/octet-stream',
    },
    body: buffer,
  });
} catch (erro) {
  falhar(`não consegui alcançar ${url} — ${erro.message}`);
}

const corpo = await resposta.json().catch(() => ({}));
if (!resposta.ok) {
  falhar(`servidor recusou — HTTP ${resposta.status}: ${corpo.error || JSON.stringify(corpo)}`);
}

console.log(`publish-pack: ${manifesto.pack_id}@${manifesto.version} publicado em ${values.server}`);
console.log(`  ${buffer.length} bytes · sha256 ${corpo.sha256}`);
