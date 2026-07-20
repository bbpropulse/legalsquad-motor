import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { discoverSkillCatalog } from './skill-catalog.js';
import { auditSkillCatalogQuality } from './skill-quality.js';

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;
const DEFAULT_LIFECYCLES = new Set(['active', 'pilot']);
const PREVIEW_LIFECYCLES = new Set(['active', 'pilot', 'preview']);
const STOPWORDS = new Set([
  'a', 'ao', 'aos', 'as', 'com', 'como', 'da', 'das', 'de', 'do', 'dos', 'e',
  'em', 'na', 'nas', 'no', 'nos', 'o', 'os', 'ou', 'para', 'por', 'que', 'um',
  'uma', 'the', 'to', 'of', 'and', 'for', 'with',
]);

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function queryTokens(query) {
  return [...new Set(normalize(query).split(' ')
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token)))];
}

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

function includesToken(text, token) {
  return text.split(' ').some((word) => word === token || word.startsWith(token));
}

function scoreEntry(entry, phrase, tokens) {
  const meta = entry.metadata;
  const id = normalize(entry.id);
  const description = normalize(meta.description);
  const group = normalize(entry.group);
  const positive = (meta.positiveTriggers || []).map(normalize);
  const aliases = (meta.aliases || []).map(normalize);
  const categories = (meta.categories || []).map(normalize);
  const reasons = new Set();
  let score = 0;

  if (id === phrase) {
    score += 220;
    reasons.add('nome-exato');
  } else if (phrase && id.includes(phrase)) {
    score += 110;
    reasons.add('nome-frase');
  }
  if (positive.some((value) => value === phrase)) {
    score += 100;
    reasons.add('gatilho-exato');
  } else if (phrase && positive.some((value) => value.includes(phrase))) {
    score += 65;
    reasons.add('gatilho-frase');
  }
  if (aliases.some((value) => value === phrase || (phrase && value.includes(phrase)))) {
    score += 80;
    reasons.add('alias');
  }

  let covered = 0;
  for (const token of tokens) {
    let tokenCovered = false;
    if (includesToken(id, token)) {
      score += 26;
      tokenCovered = true;
      reasons.add('nome');
    }
    if (positive.some((value) => includesToken(value, token))) {
      score += 18;
      tokenCovered = true;
      reasons.add('gatilho');
    }
    if (aliases.some((value) => includesToken(value, token))) {
      score += 16;
      tokenCovered = true;
      reasons.add('alias');
    }
    if (categories.some((value) => includesToken(value, token))) {
      score += 8;
      tokenCovered = true;
      reasons.add('categoria');
    }
    if (includesToken(group, token)) {
      score += 4;
      tokenCovered = true;
      reasons.add('dominio');
    }
    if (includesToken(description, token)) {
      score += 3;
      tokenCovered = true;
      reasons.add('descricao');
    }
    if (tokenCovered) covered++;
  }
  if (tokens.length && covered === tokens.length) {
    score += 35;
    reasons.add('todos-os-termos');
  }
  return { score, reasons: [...reasons].sort() };
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
  const profilesPath = join(rootDir, '_criminalsquad', 'core', 'skill-quality-profiles.json');
  const audit = auditSkillCatalogQuality(catalog, {
    profilesPath: existsSync(profilesPath) ? profilesPath : undefined,
  });
  const qualityById = new Map(audit.results.map((result) => [result.id, result]));
  const allowedLifecycles = options.includePreview ? PREVIEW_LIFECYCLES : DEFAULT_LIFECYCLES;
  const phrase = normalize(query);
  const limit = boundedLimit(options.limit);

  const ranked = catalog.entries
    .filter((entry) => allowedLifecycles.has(entry.metadata.lifecycle))
    .map((entry) => {
      const match = scoreEntry(entry, phrase, tokens);
      const quality = qualityById.get(entry.id);
      const maturityBonus = quality?.highPerformanceEligible
        ? (quality.qualityStatus === 'certified' ? 10 : 8)
        : 0;
      const lifecycleBonus = entry.metadata.lifecycle === 'active' ? 4 : 0;
      return { entry, quality, match, rank: match.score + maturityBonus + lifecycleBonus };
    })
    .filter((item) => item.match.score > 0)
    .sort((left, right) => right.rank - left.rank || left.entry.id.localeCompare(right.entry.id))
    .slice(0, limit)
    .map(({ entry, quality, match, rank }) => ({
      id: entry.id,
      score: rank,
      matched_by: match.reasons,
      lifecycle: entry.metadata.lifecycle,
      quality_status: quality?.qualityStatus || entry.metadata.qualityStatus,
      high_performance_eligible: quality?.highPerformanceEligible === true,
      supervision_required: (quality?.qualityStatus || entry.metadata.qualityStatus) === 'contracted',
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
    const gate = item.high_performance_eligible
      ? 'alta-performance-elegível'
      : item.supervision_required ? 'supervisão-obrigatória' : 'não-promovida';
    const pilot = item.pilot_opt_in_required ? '; pilot-opt-in' : '';
    console.log(`  - ${item.id} — ${gate}${pilot} — ${item.description}`);
  }
  return result;
}
