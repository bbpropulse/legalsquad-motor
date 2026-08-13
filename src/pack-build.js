// Orquestração do `build-area` (F1): amarra leitura da árvore, corte, catálogo
// e selo num pacote assinado. Sem I/O de ESCRITA — devolve os buffers e deixa a
// gravação para o CLI, o que mantém o aceite testável sem tocar o disco.
//
// Genérico e cego por definição: recebe a raiz do conteúdo por argumento e nunca
// conhece caminho de repositório específico. Empacota um checkout, um diretório
// exportado ou um tarball extraído, sem diferença.

import { encodeEntity, selarPacote } from './pack-format.js';
import { extrairCatalogo } from './pack-catalog.js';
import { lerCorteDePacotes, separarEntidades } from './pack-split.js';
import { lerArvore } from './pack-tree.js';

/**
 * Subárvores de conteúdo de uma área. `prefixo` é onde o CURADOR escreve, no
 * diretório de conteúdo; `destino` é onde o motor de fato PROCURA em runtime —
 * e os dois nem sempre coincidem. Best-practices é o caso que provou isso:
 * curador escreve em `core/best-practices/`, o motor procura em
 * `_legalsquad/core/best-practices/` (confirmado em `src/skill-catalog.js:584`
 * e três citações em `runner.pipeline.md`). Empacotar no caminho de autoria
 * materializava conteúdo que o motor nunca via — em silêncio, porque a injeção
 * degrada com um WARNING e segue sem a régua, então lia como "área sem essa
 * best-practice" em vez de "pacote materializou no lugar errado".
 */
const SUBARVORES = [
  { prefixo: 'skills/', destino: 'skills/', entidade: 'skills.jsonl.zst' },
  { prefixo: 'squads/', destino: 'squads/', entidade: 'squads.jsonl.zst' },
  { prefixo: 'core/best-practices/', destino: '_legalsquad/core/best-practices/', entidade: 'best-practices.jsonl.zst' },
  { prefixo: 'core/agents/', destino: '.claude/agents/', entidade: 'agents.jsonl.zst' },
];

const CATALOGO = 'catalog.jsonl.zst';

/**
 * Reescreve `path` do caminho de autoria para o de instalação. Roda uma vez,
 * logo após a leitura da árvore — tudo depois disto (agrupamento, corte,
 * catálogo, `applies_to`) opera sobre o caminho de INSTALAÇÃO, porque é esse
 * que precisa bater com o que `pack-apply` vai escrever e com o que o motor
 * vai procurar.
 */
function remapearParaInstalacao(arquivos, areaId) {
  return arquivos.map((arquivo) => {
    const subarvore = SUBARVORES.find((s) => arquivo.path.startsWith(s.prefixo));
    if (!subarvore || subarvore.destino === subarvore.prefixo) return arquivo;
    const relativo = nomeDeCatalogoPorArea(arquivo.path.slice(subarvore.prefixo.length), areaId);
    return { ...arquivo, path: subarvore.destino + relativo };
  });
}

/**
 * `_catalog.yaml` → `_catalog.<area>.yaml`.
 *
 * O nome fixo era uma colisão garantida: toda área traz o seu catálogo, todas
 * gravam na MESMA pasta de instalação, e `pack-apply` escreve arquivo a arquivo
 * com `rename`. Medido numa instalação de 14 áreas, o catálogo final listava uma
 * entrada de quinze — a última área instalada vencia e as outras treze viravam
 * invisíveis para a busca e para o campo `obrigatoria`, embora os `.md`
 * estivessem todos no disco. Com o nome da área, não há dois no mesmo caminho;
 * quem lê é `parseBestPracticesCatalogDir`, que funde a pasta inteira e ainda
 * aceita o nome legado.
 */
function nomeDeCatalogoPorArea(relativo, areaId) {
  if (relativo !== '_catalog.yaml' || !areaId) return relativo;
  return `_catalog.${areaId}.yaml`;
}

/** Agrupa as entidades-arquivo por entidade de conteúdo, preservando a ordem. */
function porEntidade(arquivos) {
  const grupos = new Map();
  for (const arquivo of arquivos) {
    const alvo = SUBARVORES.find((s) => arquivo.path.startsWith(s.destino));
    if (!alvo) continue;
    if (!grupos.has(alvo.entidade)) grupos.set(alvo.entidade, []);
    grupos.get(alvo.entidade).push(arquivo);
  }
  return grupos;
}

function montarPacote({ packId, arquivos, base, chavePrivada, criadoEm, signingKid }) {
  const grupos = porEntidade(arquivos);

  // O catálogo é derivado de TODAS as entidades, mas cada registro aponta para a
  // entidade em que o seu conteúdo vive — é isso que permite ao cliente resolver
  // "preciso desta skill" em "preciso desta entidade" sem baixar as outras.
  const registros = [...grupos].flatMap(([entidade, itens]) => extrairCatalogo(itens, entidade));

  const entidades = [
    { file: CATALOGO, role: 'catalog', buffer: encodeEntity(registros) },
    ...[...grupos].map(([file, itens]) => ({
      file,
      role: 'content',
      buffer: encodeEntity(itens),
    })),
  ];

  const manifesto = selarPacote(
    {
      ...base,
      pack_id: packId,
      payload_kind: 'tree',
      // O caminho de INSTALAÇÃO, não o de autoria — é contra `path` (já
      // remapeado) que o `pack-apply` checa a contenção (§6.5). Declarar o
      // caminho de autoria faria a contenção rejeitar o próprio pacote.
      applies_to: SUBARVORES.filter((s) => grupos.has(s.entidade)).map((s) => s.destino),
      counts: {
        files: arquivos.length,
        skills: registros.filter((r) => r.kind === 'skill').length,
        squads: registros.filter((r) => r.kind === 'squad').length,
        best_practices: registros.filter((r) => r.kind === 'best-practice').length,
        agents: registros.filter((r) => r.kind === 'agent').length,
      },
      // §6.8, opção A: os bytes de origem são preservados. O marcador legado
      // identifica o contrato e nunca promove — o catálogo capa em `contracted`
      // e diz por quê, em vez de reescrever e quebrar o `skill_binding`.
      normalization: { rewritten_bytes: false, rebound_evidence: false },
    },
    entidades,
    chavePrivada,
    { created_at: criadoEm, signing_kid: signingKid }
  );

  return { packId, manifesto, entidades };
}

/**
 * Constrói os pacotes `transversal` e `area.<id>` a partir de um diretório de
 * conteúdo. Devolve `{ pacotes, relatorio }` — nada é gravado aqui.
 */
export function construirPacotes({
  raizConteudo,
  areaId,
  chavePrivada,
  versao,
  criadoEm = null,
  signingKid = null,
}) {
  const corte = lerCorteDePacotes(raizConteudo);
  // Divergência entre o argumento e o que o curador declarou é engano — e um
  // engano que sairia assinado, com o pack_id errado, para dentro do cache de
  // quem instalasse. Melhor parar aqui.
  if (corte.areaId && corte.areaId !== areaId) {
    throw new Error(
      `pack-build: area-id "${areaId}" diverge do declarado em _packs.yaml ("${corte.areaId}") — ` +
        'corrija o argumento ou a declaração; o build não escolhe por você.'
    );
  }

  const lidos = lerArvore(raizConteudo, SUBARVORES.map((s) => s.prefixo));
  // O corte (`transversal_skills`) opera sobre id de SKILL, que não muda de
  // caminho — por isso remapeia DEPOIS de cortar, não antes: mais simples, e a
  // ordem não afeta o resultado porque só `skills/` participa do corte, e
  // `skills/` não é remapeado (destino === prefixo).
  const { transversal, area } = separarEntidades(lidos, corte.transversalSkills);
  const arquivos = {
    transversal: remapearParaInstalacao(transversal, areaId),
    area: remapearParaInstalacao(area, areaId),
  };

  const base = { version: versao };
  const pacotes = [];

  if (transversal.length) {
    pacotes.push(montarPacote({
      packId: 'transversal',
      arquivos: arquivos.transversal,
      base,
      chavePrivada,
      criadoEm,
      signingKid,
    }));
  }
  pacotes.push(montarPacote({
    packId: `area.${areaId}`,
    arquivos: arquivos.area,
    base: {
      ...base,
      area: { id: areaId, titulo: corte.titulo, curador: corte.curador, ramos: corte.ramos },
      ...(transversal.length ? { requires: [`transversal@>=${versao}`] } : {}),
    },
    chavePrivada,
    criadoEm,
    signingKid,
  }));

  return { pacotes, relatorio: montarRelatorio(pacotes) };
}

/**
 * Relatório do build. A razão catálogo/conteúdo entra aqui de propósito: se ela
 * encolher, a descoberta local deixa de ser barata — e a regressão precisa
 * aparecer no build, não em campo.
 */
export function montarRelatorio(pacotes) {
  return {
    pacotes: pacotes.map((pacote) => {
      const bytesDe = (papel) => pacote.manifesto.entities
        .filter((e) => e.role === papel)
        .reduce((total, e) => total + e.bytes, 0);
      const bytesCatalogo = bytesDe('catalog');
      const bytesConteudo = bytesDe('content');
      return {
        packId: pacote.packId,
        contentHash: pacote.manifesto.content_hash,
        counts: pacote.manifesto.counts,
        bytesCatalogo,
        bytesConteudo,
        razao: bytesCatalogo ? Math.round((bytesConteudo / bytesCatalogo) * 10) / 10 : 0,
      };
    }),
  };
}
