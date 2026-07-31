import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPublicKey } from 'node:crypto';
import {
  CATALOG_URL_PADRAO,
  CHAVE_PUBLICA_PRODUCAO,
  resolverConfigDeAcervo,
} from '../src/acervo-config.js';

// Fecha a pendência da SPEC §7.2 ("verificação nunca depende de rede, chave
// já embarcada"). Sem isto, ativar exigia que o aluno tivesse um arquivo .pem
// na máquina — inviável quando o único dado que ele recebe é a licença.
//
// A chave PÚBLICA não é segredo: ela já é servida em /v1/signing-keys. O que
// embarcar resolve é confiança sem rede — o cliente verifica a assinatura do
// pacote sem perguntar a ninguém qual é a chave, o que é justamente o que
// impede um servidor comprometido de mandar chave própria junto com pacote
// próprio.

function projeto() {
  return mkdtempSync(join(tmpdir(), 'legalsquad-acervo-config-'));
}

function escreverConfig(raiz, conteudo) {
  mkdirSync(join(raiz, '_legalsquad', 'config'), { recursive: true });
  writeFileSync(join(raiz, '_legalsquad', 'config', 'acervo.json'), JSON.stringify(conteudo));
}

test('a chave pública embarcada é uma chave Ed25519 válida de verdade', () => {
  const chave = createPublicKey(CHAVE_PUBLICA_PRODUCAO);
  assert.equal(chave.asymmetricKeyType, 'ed25519');
});

test('o catálogo padrão aponta para o servidor de produção por HTTPS', () => {
  assert.match(CATALOG_URL_PADRAO, /^https:\/\//, 'licença não pode trafegar em texto claro');
  assert.match(CATALOG_URL_PADRAO, /\/v1\/catalog$/);
});

test('config só com a licença já basta — URL e chave vêm dos padrões embarcados', () => {
  const raiz = projeto();
  escreverConfig(raiz, { license: 'LS-1234-5678-90AB-CDEF' });

  const config = resolverConfigDeAcervo(raiz);
  assert.equal(config.license, 'LS-1234-5678-90AB-CDEF');
  assert.equal(config.catalogUrl, CATALOG_URL_PADRAO);
  assert.equal(config.chavePublicaPem, CHAVE_PUBLICA_PRODUCAO);
  assert.equal(config.ok, true);
});

test('sem arquivo de config nenhum, devolve ok:false com motivo — nunca inventa licença', () => {
  const config = resolverConfigDeAcervo(projeto());
  assert.equal(config.ok, false);
  assert.match(config.motivo, /licen/i);
  // Mas os padrões continuam preenchidos: a falta é só da licença.
  assert.equal(config.catalogUrl, CATALOG_URL_PADRAO);
});

test('config pode sobrescrever o catalog_url — servidor próprio/homologação', () => {
  const raiz = projeto();
  escreverConfig(raiz, { license: 'LS-AAAA', catalog_url: 'https://homolog.exemplo/v1/catalog' });

  const config = resolverConfigDeAcervo(raiz);
  assert.equal(config.catalogUrl, 'https://homolog.exemplo/v1/catalog');
});

test('config pode apontar uma chave pública própria por arquivo, e ela vence a embarcada', () => {
  const raiz = projeto();
  const pem = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA++bQRd/kdVElL/y/g+eWxVGL5OMVwzI6iLmTiVI8z+E=
-----END PUBLIC KEY-----
`;
  const caminho = join(raiz, 'outra.pub.pem');
  writeFileSync(caminho, pem);
  escreverConfig(raiz, { license: 'LS-AAAA', signing_public_key_path: caminho });

  const config = resolverConfigDeAcervo(raiz);
  assert.equal(config.chavePublicaPem.trim(), pem.trim(), 'quem publica área própria assina com chave própria');
});

test('chave pública declarada e ILEGÍVEL bloqueia — nunca cai em silêncio na embarcada', () => {
  // Cair na embarcada seria trocar a chave que o usuário escolheu por outra,
  // sem avisar: o pacote passaria a ser verificado contra uma autoridade que
  // ele não pediu. Fail-closed.
  const raiz = projeto();
  escreverConfig(raiz, { license: 'LS-AAAA', signing_public_key_path: join(raiz, 'nao-existe.pem') });

  const config = resolverConfigDeAcervo(raiz);
  assert.equal(config.ok, false);
  assert.match(config.motivo, /chave p[úu]blica/i);
});

test('config ilegível (JSON quebrado) lança — não é o mesmo que config ausente', () => {
  const raiz = projeto();
  mkdirSync(join(raiz, '_legalsquad', 'config'), { recursive: true });
  writeFileSync(join(raiz, '_legalsquad', 'config', 'acervo.json'), '{ quebrado');

  assert.throws(() => resolverConfigDeAcervo(raiz), /ileg[íi]vel/i);
});
