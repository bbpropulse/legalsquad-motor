import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { discoverSkillCatalog } from './skill-catalog.js';
import { auditSkillCatalogQuality } from './skill-quality.js';
import { queryTokens, rankSkills } from './skill-rank.js';

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

export function searchSkillCatalog(query, rootDir, options = {}) {
  const tokens = queryTokens(query);
  if (!tokens.length) {
    return {
      success: false,
      results: [],
      error: { code: 'search-query-empty', message: 'informe termos materiais da capability' },
    };
  }
  const skillsDir = join(rootDir, 'skills');
  if (!existsSync(skillsDir)) {
    return {
      success: false,
      results: [],
      error: { code: 'skills-directory-missing', message: 'diretório skills/ ausente' },
    };
  }

  const catalog = discoverSkillCatalog(skillsDir);
  const profilesPath = join(rootDir, '_legalsquad', 'core', 'skill-quality-profiles.json');
  const audit = auditSkillCatalogQuality(catalog, {
    profilesPath: existsSync(profilesPath) ? profilesPath : undefined,
  });
  const qualityById = new Map(audit.results.map((result) => [result.id, result]));
  const allowedLifecycles = options.includePreview ? PREVIEW_LIFECYCLES : DEFAULT_LIFECYCLES;
  const limit = boundedLimit(options.limit);

  // O corpus do IDF é o conjunto ELEGÍVEL, não o catálogo inteiro: a raridade de
  // um termo tem de ser medida entre as skills que podem ser escolhidas. Contar
  // documentos que a busca nunca devolveria distorceria o peso.
  const elegiveis = catalog.entries
    .filter((entry) => allowedLifecycles.has(entry.metadata.lifecycle));
  const entryById = new Map(elegiveis.map((entry) => [entry.id, entry]));

  const ranked = rankSkills(
    elegiveis.map((entry) => ({
      id: entry.id,
      description: entry.metadata.description,
      group: entry.group,
      positiveTriggers: entry.metadata.positiveTriggers,
      aliases: entry.metadata.aliases,
      categories: entry.metadata.categories,
    })),
    query
  )
    .map((match) => {
      const entry = entryById.get(match.id);
      const quality = qualityById.get(entry.id);
      const maturityBonus = quality?.highPerformanceEligible
        ? (quality.qualityStatus === 'certified' ? 10 : 8)
        : 0;
      const lifecycleBonus = entry.metadata.lifecycle === 'active' ? 4 : 0;
      return { entry, quality, match, rank: match.score + maturityBonus + lifecycleBonus };
    })
    .sort((left, right) => right.rank - left.rank || left.entry.id.localeCompare(right.entry.id))
    .slice(0, limit)
    .map(({ entry, quality, match, rank }) => ({
      id: entry.id,
      score: rank,
      matched_by: match.reasons,
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
    limit,
    include_preview: options.includePreview === true,
    results: ranked,
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
    console.log(`  - ${item.id} — ${gate}${pilot} — ${item.description}`);
  }
  return result;
}
