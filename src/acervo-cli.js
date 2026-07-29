// CLI do acervo (SPEC §9.1): `sync`, `status`, `packs`.
//
// Camada fina de propósito — a decisão está em `acervo-sync.js` (puro) e o
// estado em `acervo-estado.js`. Aqui só ficam a rede, a impressão e o wiring.
//
// **O servidor ainda não existe** (§7.1). Enquanto não existir, `sync` recusa em
// vez de fingir: um comando que diz "tudo em dia" sem falar com servidor nenhum
// seria exatamente a mentira que este cliente foi escrito para não contar.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lerEstado, gravarEstado } from './acervo-estado.js';
import { planejarSync } from './acervo-sync.js';

/** Config opcional; ausente significa "sem servidor", não erro de leitura. */
function urlDoCatalogo(targetDir) {
  const config = join(targetDir, '_legalsquad', 'config', 'acervo.json');
  if (!existsSync(config)) return null;
  try {
    return JSON.parse(readFileSync(config, 'utf8')).catalog_url || null;
  } catch (erro) {
    // Config presente e ilegível é diferente de config ausente: a primeira é
    // um engano do usuário que ele precisa ver.
    throw new Error(`acervo-cli: ${config} ilegível — ${erro.message}`, { cause: erro });
  }
}

function idade(sincronizadoEm, agora) {
  if (!sincronizadoEm) return null;
  const dias = Math.floor((agora - Date.parse(sincronizadoEm)) / 86_400_000);
  return Number.isFinite(dias) ? dias : null;
}

function imprimirEstado(estado, agora) {
  if (estado.novo) {
    console.log('ACERVO:NUNCA-SINCRONIZADO');
    console.log('  Nenhum pacote instalado por sync. O pacote-base do `main` continua valendo.');
    return;
  }
  const dias = idade(estado.sincronizado_em, agora);
  console.log(`ACERVO:${Object.keys(estado.packs).length}`);
  if (dias !== null) {
    // O selo de frescor do §9.4. Sem ele, cache velho é indistinguível de cache
    // fresco — e num acervo jurídico isso é a diferença entre citar o precedente
    // vigente e citar o superado.
    console.log(`  último sync há ${dias} dia(s)${dias > 30 ? ' — DESATUALIZADO' : ''}`);
  }
  for (const [packId, versao] of Object.entries(estado.packs).sort()) {
    console.log(`  - ${packId}@${versao}`);
  }
}

// `values` (flags do parseArgs) entra na assinatura mas ainda não é consumido:
// `--content` e `--check` do §9.1 só têm efeito quando o transporte HTTP existir.
// Fica declarado para o wiring do bin não mudar depois.
// eslint-disable-next-line no-unused-vars
export function acervoCli(sub, targetDir, values = {}, agora = Date.now()) {
  let estado;
  try {
    estado = lerEstado(targetDir);
  } catch (erro) {
    // Estado ilegível para o comando. Seguir com "vazio" mandaria o sync
    // rebaixar tudo e perder o rastro do que está no disco.
    console.error(`ACERVO:BLOQUEADO — ${erro.message}`);
    return { success: false, error: { code: 'estado-ilegivel', message: erro.message } };
  }

  if (sub === 'status' || sub === 'packs') {
    imprimirEstado(estado, agora);
    return { success: true, estado };
  }

  if (sub !== 'sync') {
    console.error(`ACERVO:BLOQUEADO — subcomando desconhecido "${sub}". Use sync, status ou packs.`);
    return { success: false, error: { code: 'subcomando-desconhecido', message: String(sub) } };
  }

  const url = urlDoCatalogo(targetDir);
  if (!url) {
    // Fail-closed, e com o motivo verdadeiro. O servidor de distribuição é
    // serviço novo (§8) e ainda não subiu; até lá o caminho suportado é o
    // pacote local, via `tools/apply-pack.mjs`.
    console.error(
      'ACERVO:BLOQUEADO — nenhum servidor de catálogo configurado '
      + '(`_legalsquad/config/acervo.json`, chave `catalog_url`).\n'
      + '  O servidor de distribuição ainda não existe (SPEC §8). Até lá, instale pacotes locais:\n'
      + '    node tools/apply-pack.mjs <dir-do-pacote> --into . --pubkey <chave.pub.pem>'
    );
    return { success: false, error: { code: 'catalogo-nao-configurado', message: 'catalog_url ausente' } };
  }

  // A partir daqui é a plumbing de rede que só faz sentido com servidor de pé.
  // O planejador e o executor já estão prontos e testados (`acervo-sync.js`).
  console.error(`ACERVO:BLOQUEADO — sync contra ${url} ainda não implementado (F3, plumbing de rede).`);
  return {
    success: false,
    error: { code: 'sync-nao-implementado', message: 'planejador e executor prontos; falta o transporte HTTP' },
  };
}

export { planejarSync, gravarEstado };
