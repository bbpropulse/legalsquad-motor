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

/** Subárvores de conteúdo de uma área, e a entidade em que cada uma viaja. */
const SUBARVORES = [
  { prefixo: 'skills/', entidade: 'skills.jsonl.zst' },
  { prefixo: 'squads/', entidade: 'squads.jsonl.zst' },
  { prefixo: 'core/best-practices/', entidade: 'best-practices.jsonl.zst' },
];

const CATALOGO = 'catalog.jsonl.zst';

/** Agrupa as entidades-arquivo por entidade de conteúdo, preservando a ordem. */
function porEntidade(arquivos) {
  const grupos = new Map();
  for (const arquivo of arquivos) {
    const alvo = SUBARVORES.find((s) => arquivo.path.startsWith(s.prefixo));
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
      applies_to: SUBARVORES.filter((s) => grupos.has(s.entidade)).map((s) => s.prefixo),
      counts: {
        files: arquivos.length,
        skills: registros.filter((r) => r.kind === 'skill').length,
        squads: registros.filter((r) => r.kind === 'squad').length,
        best_practices: registros.filter((r) => r.kind === 'best-practice').length,
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

  const arquivos = lerArvore(raizConteudo, SUBARVORES.map((s) => s.prefixo));
  const { transversal, area } = separarEntidades(arquivos, corte.transversalSkills);

  const base = { version: versao };
  const pacotes = [];

  if (transversal.length) {
    pacotes.push(montarPacote({
      packId: 'transversal',
      arquivos: transversal,
      base,
      chavePrivada,
      criadoEm,
      signingKid,
    }));
  }
  pacotes.push(montarPacote({
    packId: `area.${areaId}`,
    arquivos: area,
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
