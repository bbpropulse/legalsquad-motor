#!/usr/bin/env node
// Gera o par de chaves Ed25519 do curador.
//
//   node tools/gen-signing-key.mjs --out ./chaves/curador
//
// Produz `<out>.pem` (privada) e `<out>.pub.pem` (pública). A privada assina os
// pacotes; a pública é a que o cliente embarca para verificar.
//
// A privada NUNCA vai para o repositório. Em produção ela vive num KMS/HSM e não
// sai de lá (SPEC §10) — este comando existe para desenvolvimento e teste local.

import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { out: { type: 'string' }, force: { type: 'boolean' } } });
if (!values.out) {
  console.error('Uso: node tools/gen-signing-key.mjs --out <prefixo-do-caminho> [--force]');
  process.exit(1);
}

const privado = `${values.out}.pem`;
const publico = `${values.out}.pub.pem`;

// Sobrescrever uma chave privada em silêncio inutilizaria todo pacote já
// assinado com ela — e sem aviso, porque os pacotes continuam existindo.
if (!values.force && (existsSync(privado) || existsSync(publico))) {
  console.error(
    `gen-signing-key: já existe chave em ${values.out} — sobrescrever invalidaria todo pacote ` +
      'assinado com ela. Use --force se é isso mesmo que você quer.'
  );
  process.exit(1);
}

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
mkdirSync(dirname(privado), { recursive: true });
writeFileSync(privado, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
writeFileSync(publico, publicKey.export({ type: 'spki', format: 'pem' }));

console.log(`gen-signing-key: chave privada em ${privado} (modo 600)`);
console.log(`gen-signing-key: chave pública  em ${publico}`);
console.log('\nA privada assina (--key do build-area) e NUNCA vai para o repositório.');
console.log('A pública verifica (--pubkey do apply-pack) e pode ser distribuída.');
