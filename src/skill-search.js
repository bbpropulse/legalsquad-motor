import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { discoverSkillCatalog } from './skill-catalog.js';
import { auditSkillCatalogQuality } from './skill-quality.js';
import { queryTokens, rankSkills } from './skill-rank.js';
import {
  defaultBestPracticesDir,
  parseBestPracticesCatalog,
  parseBestPracticesCatalogDir,
} from './best-practices-catalog.js';
import { ehTituloOco, lerSubstanciaDoIndice } from './skill-substancia.js';

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;
const DEFAULT_LIFECYCLES = new Set(['active', 'pilot']);
const PREVIEW_LIFECYCLES = new Set(['active', 'pilot', 'preview']);

function boundedLimit(value) {
  const parsed = Number.parseInt(String(value || DEFAULT_LIMIT), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, parsed));
}

function clipped(value, max = 220) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}

/**
 * Best-practices reusam o MESMO motor de ranking das skills (`rankSkills` é
 * puro e genérico o bastante para qualquer doc `{id, description}`). Sem
 * índice próprio: um `_catalog.yaml` de área cabe inteiro em memória, ao
 * contrário de `skills/_index.yaml` — não há o mesmo problema de escala que
 * justificou a auditoria/corte em duas fases da busca de skills acima.
 *
 * Sem catálogo instalado (área ausente) → `[]`, nunca erro: mesma degradação
 * graciosa de toda leitura de `_legalsquad/core/best-practices/` no motor.
 */
function searchBestPractices(query, rootDir, options) {
  // A pasta inteira, não um arquivo: uma instalação tem N áreas e cada pacote
  // traz o seu catálogo. Ler só `_catalog.yaml` enxergava a última área
  // instalada e escondia as demais da busca.
  const entradas = options.bestPracticesCatalogPath
    ? parseBestPracticesCatalog(options.bestPracticesCatalogPath)
    : parseBestPracticesCatalogDir(defaultBestPracticesDir(rootDir));
  if (!entradas.length) return [];

  const ranked = rankSkills(
    entradas.map((entrada) => ({ id: entrada.id, description: entrada.whenToUse || entrada.name })),
    query
  );
  const porId = new Map(entradas.map((entrada) => [entrada.id, entrada]));

  return ranked
    .slice(0, boundedLimit(options.limit))
    .map((match) => {
      const entrada = porId.get(match.id);
      return {
        id: entrada.id,
        name: entrada.name,
        score: match.score,
        matched_by: match.reasons,
        description: clipped(entrada.whenToUse || entrada.name),
        ...(entrada.obrigatoria ? { obrigatoria: true } : {}),
      };
    });
}

export function searchSkillCatalog(query, rootDir, options = {}) {
  const tokens = queryTokens(query);
  if (!tokens.length) {
    return {
      success: false,
      results: [],
      best_practices: [],
      error: { code: 'search-query-empty', message: 'informe termos materiais da capability' },
    };
  }
  const skillsDir = join(rootDir, 'skills');
  if (!existsSync(skillsDir)) {
    return {
      success: false,
      results: [],
      best_practices: [],
      error: { code: 'skills-directory-missing', message: 'diretório skills/ ausente' },
    };
  }

  const catalog = discoverSkillCatalog(skillsDir);
  // Substância vem do índice já calculado. Medir na hora custa ~16s em 5523
  // skills — inviável numa busca. Índice ausente ou velho devolve mapa vazio,
  // e `ehTituloOco` trata ausência como "não sei", nunca como "está vazia".
  const indicePath = join(skillsDir, '_index.yaml');
  const substancia = existsSync(indicePath)
    ? lerSubstanciaDoIndice(readFileSync(indicePath, 'utf8'))
    : new Map();
  const profilesPath = join(rootDir, '_legalsquad', 'core', 'skill-quality-profiles.json');
  const allowedLifecycles = options.includePreview ? PREVIEW_LIFECYCLES : DEFAULT_LIFECYCLES;
  const limit = boundedLimit(options.limit);

  // O corpus do IDF é o conjunto ELEGÍVEL, não o catálogo inteiro: a raridade de
  // um termo tem de ser medida entre as skills que podem ser escolhidas. Contar
  // documentos que a busca nunca devolveria distorceria o peso.
  const elegiveis = catalog.entries
    .filter((entry) => allowedLifecycles.has(entry.metadata.lifecycle));
  const entryById = new Map(elegiveis.map((entry) => [entry.id, entry]));

  const candidatos = rankSkills(
    elegiveis.map((entry) => ({
      id: entry.id,
      description: entry.metadata.description,
      group: entry.group,
      positiveTriggers: entry.metadata.positiveTriggers,
      aliases: entry.metadata.aliases,
      categories: entry.metadata.categories,
    })),
    query
  );

  // Audita SÓ quem casou a consulta. `evaluateSkillQuality` é por skill — só
  // compartilha contexto, sem estado cruzado —, então o resultado é idêntico ao
  // de auditar o catálogo inteiro. Medido em 4521 skills importadas: auditar
  // todas custava 516 ms de uma busca de 2,4 s, para exibir 8 resultados; um
  // termo real casa 1–15% do catálogo.
  //
  // O corte tem de ser exatamente ESTE. Auditar só os `limit` finais seria
  // errado: o `maturityBonus` abaixo entra no rank, então a auditoria decide
  // QUEM chega ao topo — cortar antes mudaria a ordem, em silêncio.
  const audit = auditSkillCatalogQuality(
    { ...catalog, entries: candidatos.map((match) => entryById.get(match.id)) },
    { profilesPath: existsSync(profilesPath) ? profilesPath : undefined }
  );
  const qualityById = new Map(audit.results.map((result) => [result.id, result]));

  const ranked = candidatos
    .map((match) => {
      const entry = entryById.get(match.id);
      const quality = qualityById.get(entry.id);
      const maturityBonus = quality?.highPerformanceEligible
        ? (quality.qualityStatus === 'certified' ? 10 : 8)
        : 0;
      const lifecycleBonus = entry.metadata.lifecycle === 'active' ? 4 : 0;
      // Título oco desce no rank, mas NÃO some da shortlist: o Arquiteto
      // precisa saber que o tema já tem entrada no catálogo — senão criaria
      // uma segunda com outro nome e duplicaria a taxonomia. O que ele
      // precisa é enxergar que o corpo está vazio, para preencher em vez de
      // reusar. Ocultar seria trocar um erro por outro.
      const substanciaDaSkill = substancia.get(entry.id);
      const penalidadeDeVazio = ehTituloOco(substanciaDaSkill) ? -30 : 0;
      return {
        entry,
        quality,
        match,
        substancia: substanciaDaSkill,
        rank: match.score + maturityBonus + lifecycleBonus + penalidadeDeVazio,
      };
    })
    .sort((left, right) => right.rank - left.rank || left.entry.id.localeCompare(right.entry.id))
    .slice(0, limit)
    .map(({ entry, quality, match, rank, substancia: sub }) => ({
      id: entry.id,
      score: rank,
      matched_by: match.reasons,
      // O que o Arquiteto usa para decidir REUSAR × ENRIQUECER × CRIAR.
      linhas_proprias: sub?.linhasProprias ?? null,
      titulo_oco: ehTituloOco(sub),
      // Sinal independente de `linhas_proprias`: skills irmãs que citam o
      // MESMO dispositivo legítimo derrubam a exclusividade de ambas sem
      // esvaziar o conteúdo — isto é o que faz `titulo_oco` ser `false`
      // mesmo com `linhas_proprias` baixo nesse caso.
      base_legal_verificada: sub?.baseLegalVerificada === true,
      precedentes_identificados: sub?.precedentesIdentificados === true,
      local: entry.local === true,
      lifecycle: entry.metadata.lifecycle,
      quality_status: quality?.qualityStatus || entry.metadata.qualityStatus,
      high_performance_eligible: quality?.highPerformanceEligible === true,
      // Supervisão é o PADRÃO; promoção comprovada é a exceção que a dispensa.
      //
      // Antes isto era `status === 'contracted'`, e o buraco só aparece com uma
      // skill posta à mão num projeto instalado — fluxo real e suportado. A
      // evidência comportamental é local e user-owned (`skills/_evals/results/`),
      // então qualquer frontmatter pode ALEGAR `certified` sem prova nenhuma.
      // Com a regra antiga, essa skill saía da shortlist como `certified` e
      // `supervision_required: false`: alegar promoção rendia MENOS cuidado que
      // ser honesto e declarar `contracted`. Quem paga é quem confia na
      // shortlist para escolher a skill de uma peça.
      supervision_required: quality?.highPerformanceEligible !== true,
      pilot_opt_in_required: entry.metadata.lifecycle === 'pilot',
      risk: entry.metadata.riskLevel,
      quality_profile: entry.metadata.qualityProfile,
      delivery_type: entry.metadata.deliveryType,
      description: clipped(entry.metadata.description),
      positive_triggers: (entry.metadata.positiveTriggers || []).slice(0, 5),
      negative_triggers: (entry.metadata.negativeTriggers || []).slice(0, 3),
    }));

  return {
    success: true,
    result_count: ranked.length,
    // Quantas skills foram auditadas para produzir esta shortlist. É diagnóstico
    // de ESCALA: se um dia voltar a crescer com o tamanho do catálogo em vez de
    // com o número de candidatos, a regressão aparece aqui antes de aparecer no
    // relógio de quem usa.
    audited: audit.results.length,
    limit,
    include_preview: options.includePreview === true,
    results: ranked,
    best_practices: searchBestPractices(query, rootDir, options),
    error: null,
  };
}

export function skillSearchCli(query, targetDir, values = {}) {
  const result = searchSkillCatalog(query, targetDir, {
    limit: values.limit,
    includePreview: values['include-preview'] === true,
  });
  if (values.json === true) {
    console.log(JSON.stringify(result));
    return result;
  }
  if (!result.success) {
    console.error(`BUSCA_SKILLS:BLOQUEADA — ${result.error.message}`);
    return result;
  }
  console.log(`BUSCA_SKILLS:${result.result_count}`);
  for (const item of result.results) {
    // Só dois estados agora: comprovada, ou supervisionada. Não há terceiro —
    // era ele que deixava a skill "promovida sem prova" passar por dispensada.
    // Quando o frontmatter ALEGA promoção sem evidência, a alegação aparece
    // junto: a discrepância é informação, e esconder foi o defeito.
    const alegaSemProva = !item.high_performance_eligible
      && ['verified', 'certified'].includes(item.quality_status);
    const gate = item.high_performance_eligible
      ? 'alta-performance-elegível'
      : `supervisão-obrigatória${alegaSemProva ? ` (alega ${item.quality_status} sem evidência)` : ''}`;
    const pilot = item.pilot_opt_in_required ? '; pilot-opt-in' : '';
    // O aviso mais importante da linha: existe o título, não existe o corpo.
    // Sem isto o Arquiteto reusa casca achando que reusou capacidade.
    const oco = item.titulo_oco
      ? ` ⚠ TÍTULO OCO (${item.linhas_proprias} linhas próprias) — ENRIQUEÇA, não reuse como está`
      : '';
    const local = item.local ? '; adaptada localmente' : '';
    console.log(`  - ${item.id} — ${gate}${pilot}${local}${oco} — ${item.description}`);
  }
  if (result.best_practices.length) {
    console.log(`BUSCA_BEST_PRACTICES:${result.best_practices.length}`);
    for (const bp of result.best_practices) {
      const obrigatoria = bp.obrigatoria ? '; obrigatória' : '';
      console.log(`  - ${bp.id} — ${bp.name}${obrigatoria} — ${bp.description}`);
    }
  }
  return result;
}
