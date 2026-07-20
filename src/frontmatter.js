// Single source of truth for parsing SKILL.md / AGENT.md YAML frontmatter.
//
// This is intentionally a focused parser instead of a general-purpose YAML
// implementation.  The registries only need scalars, folded/literal scalars,
// inline lists and simple block lists, either at the top level or inside the
// official `metadata:` map.  Keeping the supported surface explicit makes the
// catalogue deterministic without adding a runtime dependency.

export const SKILL_LIFECYCLES = Object.freeze([
  'preview',
  'pilot',
  'active',
  'deprecated',
  'quarantined',
]);

// Returns the raw frontmatter body (between the leading `---` fences) or null.
export function extractFrontMatter(raw) {
  const content = raw.replace(/\r\n/g, '\n');
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  return match ? match[1] : null;
}

function indentation(line) {
  return line.match(/^ */)?.[0].length || 0;
}

function stripMatchingQuotes(value) {
  const text = value.trim();
  if (text.length >= 2) {
    const first = text[0];
    const last = text[text.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return text.slice(1, -1);
    }
  }
  return text;
}

function splitInlineList(value) {
  const inner = value.trim().slice(1, -1);
  if (!inner.trim()) return [];

  const items = [];
  let current = '';
  let quote = null;
  for (const char of inner) {
    if ((char === '"' || char === "'") && (!quote || quote === char)) {
      quote = quote ? null : char;
      current += char;
      continue;
    }
    if (char === ',' && !quote) {
      if (current.trim()) items.push(stripMatchingQuotes(current));
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) items.push(stripMatchingQuotes(current));
  return items;
}

// Finds a direct key in a line range.  `indent` is significant so a key in an
// example/code block cannot accidentally shadow frontmatter metadata.
function findKey(lines, key, indent, start = 0, end = lines.length) {
  const prefix = `${' '.repeat(indent)}${key}:`;
  for (let index = start; index < end; index++) {
    if (lines[index].startsWith(prefix)) {
      return { index, value: lines[index].slice(prefix.length).trim() };
    }
  }
  return null;
}

function metadataRange(lines) {
  const metadata = findKey(lines, 'metadata', 0);
  if (!metadata || metadata.value) return null;
  let end = metadata.index + 1;
  while (end < lines.length) {
    const line = lines[end];
    if (line.trim() && indentation(line) === 0) break;
    end++;
  }
  return { start: metadata.index + 1, end };
}

function locateKey(fm, key) {
  const lines = fm.replace(/\r\n/g, '\n').split('\n');
  const topLevel = findKey(lines, key, 0);
  if (topLevel) return { lines, ...topLevel, indent: 0 };

  const range = metadataRange(lines);
  if (!range) return null;
  const nested = findKey(lines, key, 2, range.start, range.end);
  return nested ? { lines, ...nested, indent: 2 } : null;
}

function continuationLines(lines, index, parentIndent) {
  const body = [];
  for (let cursor = index + 1; cursor < lines.length; cursor++) {
    const line = lines[cursor];
    if (line.trim() && indentation(line) <= parentIndent) break;
    body.push(line);
  }
  return body;
}

// Reads a scalar value, supporting YAML folded (`>`, `>-`) and literal (`|`,
// `|-`) scalars. Legacy top-level keys take precedence over nested metadata.
export function parseScalar(fm, key) {
  const located = locateKey(fm, key);
  if (!located) return null;

  const { lines, index, indent, value } = located;
  if (/^[>|][+-]?$/.test(value)) {
    const literal = value.startsWith('|');
    const body = continuationLines(lines, index, indent)
      .map((line) => line.trim() ? line.slice(Math.min(line.length, indent + 2)) : '');
    const rendered = literal
      ? body.join('\n').trim()
      : body.map((line) => line.trim()).filter(Boolean).join(' ').trim();
    return rendered;
  }

  if (!value || (value.startsWith('[') && value.endsWith(']'))) return value || null;
  return stripMatchingQuotes(value);
}

// Reads a simple YAML list, both inline (`key: [a, b]`) and block form. Lists
// may live at the top level or inside `metadata:`.
export function parseList(fm, key) {
  const located = locateKey(fm, key);
  if (!located) return [];
  const { lines, index, indent, value } = located;
  if (value.startsWith('[') && value.endsWith(']')) return splitInlineList(value);
  if (value) return [];

  const items = [];
  for (const line of continuationLines(lines, index, indent)) {
    const match = line.match(/^\s*-\s+(.+)$/);
    if (match) items.push(stripMatchingQuotes(match[1]));
  }
  return items;
}

function firstScalar(fm, keys) {
  for (const key of keys) {
    const value = parseScalar(fm, key);
    if (value !== null && value !== '') return value;
  }
  return null;
}

function firstList(fm, keys, { scalarFallback = true } = {}) {
  for (const key of keys) {
    const values = parseList(fm, key);
    if (values.length) return values;
    if (scalarFallback) {
      const scalar = parseScalar(fm, key);
      if (scalar && !scalar.startsWith('[')) return [scalar];
    }
  }
  return [];
}

// Normalized metadata used by the runtime registry, the generated catalogue
// and the deterministic checker. Missing lifecycle is treated as `active` for
// backwards compatibility with the pre-lifecycle skill library.
export function parseSkillMetadata(raw, { fallbackName = '' } = {}) {
  const fm = extractFrontMatter(raw);
  if (!fm) return null;

  const explicitLifecycle = firstScalar(fm, ['lifecycle']);
  const categories = [
    ...firstList(fm, ['categories'], { scalarFallback: false }),
    ...firstList(fm, ['category']),
  ].filter(Boolean);

  return {
    name: firstScalar(fm, ['name']) || fallbackName,
    description: firstScalar(fm, ['description']) || '',
    type: firstScalar(fm, ['type']) || 'prompt',
    version: firstScalar(fm, ['version']) || '',
    lifecycle: (explicitLifecycle || 'active').toLowerCase(),
    lifecycleExplicit: Boolean(explicitLifecycle),
    categories: [...new Set(categories)],
    aliases: firstList(fm, ['aliases', 'alias']),
    supersedes: firstList(fm, ['supersedes']),
    coexists: firstList(fm, ['coexists', 'coexists_with']),
    positiveTriggers: firstList(fm, ['positive_triggers', 'triggers', 'activation_triggers']),
    negativeTriggers: firstList(fm, ['negative_triggers', 'do_not_use_when', 'exclusion_triggers']),
    nextSkills: firstList(fm, ['next_skills_sugeridas', 'next_skills', 'recommended_next_skills']),
    engines: firstList(fm, ['engines', 'deterministic_engines']),
    riskLevel: firstScalar(fm, ['risk_level', 'risk']) || '',
    deliveryType: firstScalar(fm, ['delivery_type']) || '',
    schemaVersion: firstScalar(fm, ['schema_version']) || '',
    qualityProfile: firstScalar(fm, ['quality_profile']) || '',
    qualityStatus: firstScalar(fm, ['quality_status']) || 'legacy',
    contractVersion: firstScalar(fm, ['contract_version']) || '',
    freshnessPolicy: firstScalar(fm, ['freshness_policy']) || '',
    guardTriggers: firstList(fm, ['guard_triggers', 'input_guards']),
    evalCaseIds: firstList(fm, ['eval_case_ids']),
    sourcePackage: firstScalar(fm, ['source_package']) || '',
  };
}

export function getSkillLifecyclePolicy(value = 'active') {
  const lifecycle = String(value || 'active').toLowerCase();
  switch (lifecycle) {
    case 'active':
      return { lifecycle, productionEligible: true, autoInstallable: true, selection: 'default' };
    case 'pilot':
      // Pilot skills are installed so discovery can inspect/evaluate them, but
      // routing remains explicit and must declare an active fallback.
      return { lifecycle, productionEligible: true, autoInstallable: true, selection: 'explicit' };
    case 'preview':
      return { lifecycle, productionEligible: false, autoInstallable: false, selection: 'test-only' };
    case 'deprecated':
      return { lifecycle, productionEligible: false, autoInstallable: false, selection: 'compatibility-only' };
    case 'quarantined':
      return { lifecycle, productionEligible: false, autoInstallable: false, selection: 'blocked' };
    default:
      return { lifecycle, productionEligible: false, autoInstallable: false, selection: 'invalid' };
  }
}

// Reads localized descriptions (description_pt-BR, description_es, ...).
// Returns an object with only the codes that are present.
export function parseLocalizedDescriptions(fm, codes) {
  const descriptions = {};
  for (const code of codes) {
    const value = parseScalar(fm, `description_${code}`);
    if (value !== null) descriptions[code] = value;
  }
  return descriptions;
}
