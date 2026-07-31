// CLI do acervo (SPEC §9.1): `sync`, `status`, `packs`.
//
// Camada fina de propósito — a decisão está em `acervo-sync.js` (puro), o
// estado em `acervo-estado.js`, e a verificação/aplicação em `pack-format.js`/
// `pack-apply.js` (já prontos e testados antes de existir servidor nenhum).
// Aqui só ficam a rede, a impressão e o wiring.
import { createPublicKey } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lerEstado, gravarEstado } from './acervo-estado.js';
import { planejarSync, executarSync } from './acervo-sync.js';
import { baixar } from './acervo-transport.js';
import { decodeEntity, verificarPacote } from './pack-format.js';
import { aplicarPacote } from './pack-apply.js';

/** Config opcional; ausente significa "sem servidor", não erro de leitura. */
function lerConfig(targetDir) {
  const caminho = join(targetDir, '_legalsquad', 'config', 'acervo.json');
  if (!existsSync(caminho)) return {};
  try {
    return JSON.parse(readFileSync(caminho, 'utf8'));
  } catch (erro) {
    // Config presente e ilegível é diferente de config ausente: a primeira é
    // um engano do usuário que ele precisa ver.
    throw new Error(`acervo-cli: ${caminho} ilegível — ${erro.message}`, { cause: erro });
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

async function buscarCatalogo(url, license) {
  const alvo = new URL(url);
  if (license) alvo.searchParams.set('license', license);
  const resposta = await fetch(alvo);
  if (!resposta.ok) {
    throw new Error(`GET ${alvo} devolveu HTTP ${resposta.status}`);
  }
  return resposta.json();
}

/** `arquivos` que `aplicarPacote` espera: os registros DECODIFICADOS das entidades de conteúdo. */
function arquivosDoConteudo(entidades) {
  return entidades
    .filter((entidade) => entidade.role === 'content')
    .flatMap((entidade) => decodeEntity(entidade.buffer));
}

function imprimirResultadoDoSync(resultado) {
  console.log(`ACERVO:SYNC ${resultado.aplicados.length} aplicado(s), ${resultado.recusados.length} recusado(s)`);
  for (const packId of resultado.aplicados) console.log(`  - ${packId} instalado`);
  for (const { pack_id: packId, motivo } of resultado.recusados) console.error(`  · ${packId} recusado — ${motivo}`);
  for (const packId of resultado.revogados) console.log(`  - ${packId} removido (revogado)`);
}

export async function acervoCli(sub, targetDir, values = {}, agora = Date.now()) {
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

  let config;
  try {
    config = lerConfig(targetDir);
  } catch (erro) {
    console.error(`ACERVO:BLOQUEADO — ${erro.message}`);
    return { success: false, error: { code: 'config-ilegivel', message: erro.message } };
  }

  if (!config.catalog_url) {
    // Fail-closed, e com o motivo verdadeiro. Até configurar um servidor, o
    // caminho suportado é o pacote local, via `tools/apply-pack.mjs`.
    console.error(
      'ACERVO:BLOQUEADO — nenhum servidor de catálogo configurado '
      + '(`_legalsquad/config/acervo.json`, chave `catalog_url`).\n'
      + '  Até lá, instale pacotes locais:\n'
      + '    node tools/apply-pack.mjs <dir-do-pacote> --into . --pubkey <chave.pub.pem>'
    );
    return { success: false, error: { code: 'catalogo-nao-configurado', message: 'catalog_url ausente' } };
  }

  if (!config.signing_public_key_path) {
    // Verificar sem chave pública não é verificar — seria a assinatura Ed25519
    // inteira virando decoração. `--pubkey` de `apply-pack.mjs` exige o mesmo.
    console.error(
      'ACERVO:BLOQUEADO — nenhuma chave pública configurada '
      + '(`_legalsquad/config/acervo.json`, chave `signing_public_key_path`). '
      + 'Sem ela não dá para verificar nada do que baixar.'
    );
    return { success: false, error: { code: 'chave-publica-ausente', message: 'signing_public_key_path ausente' } };
  }

  let chavePublica;
  try {
    chavePublica = createPublicKey(readFileSync(config.signing_public_key_path));
  } catch (erro) {
    console.error(`ACERVO:BLOQUEADO — chave pública ilegível em ${config.signing_public_key_path} — ${erro.message}`);
    return { success: false, error: { code: 'chave-publica-ilegivel', message: erro.message } };
  }

  let catalogo;
  try {
    catalogo = await buscarCatalogo(config.catalog_url, config.license);
  } catch (erro) {
    console.error(`ACERVO:BLOQUEADO — catálogo inacessível — ${erro.message}`);
    return { success: false, error: { code: 'catalogo-inacessivel', message: erro.message } };
  }

  const plano = planejarSync(catalogo, estado, { incluirConteudo: values.content === true });
  if (!plano.ok) {
    console.error(`ACERVO:BLOQUEADO — ${plano.motivo}`);
    return { success: false, error: { code: 'plano-invalido', message: plano.motivo } };
  }

  const resultado = await executarSync(plano, {
    baixar,
    verificar: (manifesto, entidades) => verificarPacote(manifesto, entidades, chavePublica),
    aplicar: (pack, manifesto, entidades) => {
      const veredito = aplicarPacote(targetDir, manifesto, arquivosDoConteudo(entidades));
      if (!veredito.ok) throw new Error(veredito.problemas.join('; '));
    },
  }, estado);

  gravarEstado(targetDir, resultado.estado, { sincronizadoEm: new Date(agora).toISOString() });
  imprimirResultadoDoSync(resultado);

  return { success: true, ...resultado };
}

export { planejarSync, gravarEstado };
