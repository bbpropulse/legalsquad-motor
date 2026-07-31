// Configuração do acervo: o que o cliente precisa saber para sincronizar.
//
// Fecha a pendência da SPEC §7.2 — "verificação nunca depende de rede, chave
// já embarcada". O aluno recebe UMA coisa: a licença. A URL do catálogo e a
// chave pública de verificação vêm embarcadas aqui.
//
// **A chave pública não é segredo.** Ela já é servida em `/v1/signing-keys`;
// embarcá-la num repositório público é o esperado. O que embarcar resolve é
// confiança sem rede: o cliente verifica a assinatura do pacote sem perguntar
// a ninguém qual é a chave — e é exatamente isso que impede um servidor
// comprometido de entregar chave própria junto com pacote próprio.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Servidor de distribuição oficial. HTTPS obrigatório: a licença vai no header. */
export const CATALOG_URL_PADRAO = 'https://acervo-server-production.up.railway.app/v1/catalog';

/** Ed25519, `kid: prod-2026-07`. Corresponde à privada guardada fora de qualquer git. */
export const CHAVE_PUBLICA_PRODUCAO = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEABCuD8oG9/vEXU0NRKwZzHJu/9sfZAKxFz5wkWrs+/E4=
-----END PUBLIC KEY-----
`;

const CAMINHO_CONFIG = join('_legalsquad', 'config', 'acervo.json');

/**
 * Resolve a configuração efetiva. Devolve `{ok, motivo, license, catalogUrl,
 * chavePublicaPem}` — `ok: false` traz o motivo em linguagem de gente, para o
 * chamador decidir se bloqueia ou orienta.
 *
 * Config ausente ≠ config ilegível: a primeira é o estado normal de quem
 * ainda não ativou (devolve `ok:false`); a segunda é um engano do usuário que
 * ele precisa ver (lança).
 */
export function resolverConfigDeAcervo(rootDir) {
  const caminho = join(rootDir, CAMINHO_CONFIG);

  let bruto = {};
  if (existsSync(caminho)) {
    try {
      bruto = JSON.parse(readFileSync(caminho, 'utf8'));
    } catch (erro) {
      throw new Error(`acervo-config: ${caminho} ilegível — ${erro.message}`, { cause: erro });
    }
  }

  const catalogUrl = bruto.catalog_url || CATALOG_URL_PADRAO;

  // Chave declarada e ilegível BLOQUEIA. Cair na embarcada em silêncio
  // trocaria a autoridade que o usuário escolheu por outra, sem avisar.
  let chavePublicaPem = CHAVE_PUBLICA_PRODUCAO;
  if (bruto.signing_public_key_path) {
    try {
      chavePublicaPem = readFileSync(bruto.signing_public_key_path, 'utf8');
    } catch (erro) {
      return {
        ok: false,
        motivo: `chave pública declarada em ${bruto.signing_public_key_path} está ilegível — ${erro.message}`,
        license: bruto.license || null,
        catalogUrl,
        chavePublicaPem: null,
      };
    }
  }

  if (!bruto.license) {
    return {
      ok: false,
      motivo: 'nenhuma licença configurada — informe a licença recebida na compra para ativar',
      license: null,
      catalogUrl,
      chavePublicaPem,
    };
  }

  return { ok: true, motivo: null, license: bruto.license, catalogUrl, chavePublicaPem };
}

/** Grava a config de ativação. Só a licença — URL e chave vêm dos padrões. */
export function gravarConfigDeAcervo(rootDir, { license, catalogUrl }) {
  const caminho = join(rootDir, CAMINHO_CONFIG);
  const conteudo = { license, ...(catalogUrl && catalogUrl !== CATALOG_URL_PADRAO ? { catalog_url: catalogUrl } : {}) };
  return { caminho, conteudo: `${JSON.stringify(conteudo, null, 2)}\n` };
}
