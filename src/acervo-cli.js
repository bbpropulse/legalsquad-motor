// CLI do acervo (SPEC §9.1): `sync`, `status`, `packs`.
//
// Camada fina de propósito — a decisão está em `acervo-sync.js` (puro), o
// estado em `acervo-estado.js`, e a verificação/aplicação em `pack-format.js`/
// `pack-apply.js` (já prontos e testados antes de existir servidor nenhum).
// Aqui só ficam a rede, a impressão e o wiring.
import { createPublicKey } from 'node:crypto';
import { lerEstado, gravarEstado } from './acervo-estado.js';
import { planejarSync, executarSync } from './acervo-sync.js';
import { baixar } from './acervo-transport.js';
import { decodeEntity, verificarPacote } from './pack-format.js';
import { aplicarPacote } from './pack-apply.js';
import { resolverConfigDeAcervo } from './acervo-config.js';

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

/**
 * A licença vai no header `Authorization`, NUNCA na query string: query
 * string entra em log de acesso, de proxy e de CDN, e um identificador de
 * assinante nesses logs é rastreamento gratuito de quem paga.
 */
async function buscarCatalogo(url, license) {
  const resposta = await fetch(url, {
    headers: license ? { authorization: `Bearer ${license}` } : {},
  });
  if (!resposta.ok) {
    throw new Error(`GET ${url} devolveu HTTP ${resposta.status}`);
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

  // Despublicado é informação, não ação: os arquivos ficam e o usuário decide.
  // Silenciar faria o pacote sumir do `status` sem explicação — some da lista e
  // ninguém sabe por quê, que é a pior forma de comunicar uma mudança.
  for (const packId of resultado.despublicados || []) {
    console.log(`  - ${packId} saiu do catálogo (despublicado) — o que já estava no disco foi mantido`);
  }
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
    config = resolverConfigDeAcervo(targetDir);
  } catch (erro) {
    console.error(`ACERVO:BLOQUEADO — ${erro.message}`);
    return { success: false, error: { code: 'config-ilegivel', message: erro.message } };
  }

  if (!config.ok) {
    // Fail-closed com o motivo verdadeiro. URL, chave pública e token de acesso
    // vêm embarcados, e o acesso é aberto — então licença NÃO chega mais aqui.
    // O que sobra é a autenticidade: uma chave pública própria que o usuário
    // declarou e está ilegível. Verificar assinatura continua inegociável.
    console.error(`ACERVO:BLOQUEADO — ${config.motivo}`);
    return { success: false, error: { code: 'config-incompleta', message: config.motivo } };
  }

  let chavePublica;
  try {
    chavePublica = createPublicKey(config.chavePublicaPem);
  } catch (erro) {
    console.error(`ACERVO:BLOQUEADO — chave pública inválida — ${erro.message}`);
    return { success: false, error: { code: 'chave-publica-invalida', message: erro.message } };
  }

  let catalogo;
  try {
    catalogo = await buscarCatalogo(config.catalogUrl, config.license);
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
