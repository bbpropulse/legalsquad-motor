import {
  existsSync,
  readdirSync,
  readFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, normalize, relative, resolve } from 'node:path';
import {
  extractFrontMatter,
  getSkillLifecyclePolicy,
  parseSkillMetadata,
  SKILL_LIFECYCLES,
} from './frontmatter.js';
import { auditSkillCatalogQuality } from './skill-quality.js';

// Classification is intentionally centralized here: the indexer, checker and
// tests must agree on the catalogue a routing agent sees.
const GROUP_RULES = [
  [/justica-militar|administracao-militar|\bcppm\b|\bcpm\b|\bjm-|\bmpm-/, 'Justiça militar'],
  [/eleitoral/, 'Crimes eleitorais'],
  [/cooperacao-internacional|extradicao|rogatoria|interpol|difusao-vermelha|\btpi\b|\bmlat\b|jurisdicao-internacional|sentenca-penal-estrangeira|prova-exterior|transferencia-pessoas-condenadas|auxilio-direto/, 'Cooperação internacional'],
  [/propriedade-imaterial|propriedade-industrial|direito-autoral|pirataria|marca-patente|\b9279\b|\b9609\b|concorrencia-desleal|segredo-empresa/, 'Propriedade intelectual e industrial'],
  [/execucao-penal|execucao/, 'Execução penal'],
  [/\bjuri\b|plenario|pronuncia|quesit|jurado/, 'Tribunal do júri'],
  [/inquerito|investigacao/, 'Inquérito e investigação'],
  [/\bhonra\b|calunia|difamacao|injuria/, 'Crimes contra a honra'],
  [/\btransito\b|\bctb\b/, 'Crimes de trânsito'],
  [/fe-publica/, 'Crimes de fé pública'],
  [/administracao-publica|administracao-justica|peculato|concussao|prevaricacao|desacato|desobediencia|corrupcao-passiva|licitacao|responsabilidade-prefeito|responsabilidade-governador|\bdl-201\b|governador-lei-1079|imunidade-parlamentar|inviolabilidade-vereador/, 'Crimes contra a Adm. Pública'],
  [/sonegacao|tributari|previdenciari|mercado-capitais|ordem-economica|lavagem|contrabando|descaminho|financeiro|sistema-financeiro|\b7492\b|evasao-divisas|dolar-cabo|marco-cambial|piramide|captacao-irregular|criptoativo|171a-marco|economia-popular|\busura\b|\b1521\b|organizacao-trabalho|obtencao-desvio-financiamento/, 'Crimes econômicos e tributários'],
  [/patrimonio|patrimonial|insignificancia|arrependimento-reparacao|perdimento|confisco-alargado/, 'Crimes contra o patrimônio'],
  [/paz-publica|perigo-comum|\bincendio\b|explosao|inundacao|contra-familia|bigamia|abandono-material|mortos-e-sentimento|sentimento-religioso|trafico-pessoas|\b149-?a\b|estatuto-torcedor|maus-tratos-animais/, 'Outros tipos penais'],
  [/contra-pessoa|crimes-pessoa|crimes-contra-liberdade|defesa-ameaca|sequestro-carcere|reducao-condicao|abandono-omissao-socorro|constrangimento|maus-tratos|periclitacao|aborto|rixa|perseguicao-stalking|\b147-?a\b|importunacao-sexual|\b215-?a\b|violencia-psicologica|\b147-?b\b|induzimento-instigacao|automutilacao|divulgacao-cena|\b218-?c\b|revenge-porn|violacao-domicilio/, 'Crimes contra a pessoa'],
  [/leis-especiais|drogas|entorpecente|\b11343\b|desarmamento|tortura|terrorismo|genocidio|saude-publica|dignidade-sexual|vulneravel-217a|estatuto-crianca|\beca\b|ambiental|idoso|contravencao|protetiv|violencia-domestica|maria-penha|maria-da-penha|\b11340\b|henry-borel|consumidor|falimentar|prisao-temporaria|epidemia|adulteracao-alimentos|exercicio-ilegal-medicina|falsificacao-medicamentos|charlatanismo/, 'Leis especiais e vulneráveis'],
  [/multimodal|cftv|deepfake|manuscrito|croqui/, 'Leitura de imagens'],
  [/acusacao|assistente/, 'Acusação e assistente'],
  [/\bprova\b|provas|pericia|cadeia-custodia|reconhecimento/, 'Análise de provas'],
  [/recurso|recursal/, 'Recursos'],
  [/estrategia|transversal|matriz|mapa-|arvore-decisao|linha-tempo|imputacao|excludentes|standard-probatorio|efeitos-extrapenais|concurso-crimes|nulidades|prescricao-virtual|viabilidade-suspensao|cabimento-recursal|teoria-do-caso|selecao-tese|decisao-recorrer|redacao-persuasiva|antecedentes|justica-gratuita|perdao-perempcao|foro-criminal|conflito-competencia|inquiricao|oratoria|argumentacao|persuasao|retorica|protesto|consignacao-ata|revisao-gramatical|ortografica|correicao-parcial|restauracao-autos/, 'Estratégia e análise'],
  [/\bpeca\b|pecas/, 'Peças criminais'],
  [/creator|monitor-dje|\bdjen\b|obsidian|template-designer|transcricao|assinatura|triagem-email|integracao|infra|ferramenta|\bmcp\b|social|email|agenda|midia|conteudo/, 'Integrações e ferramentas'],
];

const GROUP_ORDER = [...new Set(GROUP_RULES.map(([, label]) => label)), 'Outras'];

export function classifySkillGroup(categories, type, name) {
  if (/^leitura-/.test(name)) return 'Leitura de imagens';
  if (/^ep-/.test(name)) return 'Execução penal';
  const haystack = `${categories.join(' ')} ${name}`.toLowerCase();
  for (const [pattern, label] of GROUP_RULES) {
    if (pattern.test(haystack)) return label;
  }
  if (type && type !== 'prompt') return 'Integrações e ferramentas';
  return 'Outras';
}

export function summarizeSkillDescription(description) {
  if (!description) return '';
  let summary = description.split(/\s+Aciona com[:.]/i)[0].trim();
  if (summary.length > 170) {
    summary = `${summary.slice(0, 167).replace(/\s+\S*$/, '')}…`;
  }
  return summary;
}

export function discoverSkillCatalog(skillsDir) {
  const directories = readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const entries = [];
  const missingSkillFiles = [];
  for (const id of directories) {
    const skillPath = join(skillsDir, id, 'SKILL.md');
    if (!existsSync(skillPath)) {
      missingSkillFiles.push(id);
      continue;
    }

    const raw = readFileSync(skillPath, 'utf8');
    const metadata = parseSkillMetadata(raw, { fallbackName: id });
    const policy = getSkillLifecyclePolicy(metadata?.lifecycle);
    entries.push({
      id,
      skillPath,
      raw,
      frontmatter: extractFrontMatter(raw),
      metadata,
      policy,
      group: classifySkillGroup(metadata?.categories || [], metadata?.type || 'prompt', id),
    });
  }

  entries.sort((a, b) => {
    const group = GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group);
    return group || a.id.localeCompare(b.id);
  });

  return { skillsDir, directories, entries, missingSkillFiles };
}

function yamlString(value) {
  return JSON.stringify(String(value));
}

function yamlList(values) {
  return `[${values.map((value) => yamlString(value)).join(', ')}]`;
}

export function renderSkillIndex(catalog) {
  const qualityBySkill = new Map(
    auditSkillCatalogQuality(catalog).results.map((result) => [result.id, result]),
  );
  const groups = new Map();
  for (const entry of catalog.entries) {
    if (!groups.has(entry.group)) groups.set(entry.group, []);
    groups.get(entry.group).push(entry);
  }

  let yaml = '# Índice de Skills — GERADO por `npx criminalsquad indexar-skills` (não editar à mão; será sobrescrito).\n';
  yaml += '# Fonte de verdade para Arquiteto, Sherlock, chefe-roteador e catalog-scout.\n';
  yaml += '# Lifecycle e maturidade são dimensões independentes; qualidade exige evidência.\n';
  yaml += `# Última indexação determinística: ${catalog.entries.length} skills.\n\n`;
  yaml += 'schema_version: 3\n';
  yaml += 'lifecycle_policy:\n';
  yaml += '  legacy_default: active\n';
  yaml += '  production_default: active\n';
  yaml += '  explicit_opt_in: pilot\n';
  yaml += '  blocked_in_production: [preview, deprecated, quarantined]\n\n';
  yaml += 'quality_policy:\n';
  yaml += '  contract_version: "5.0.0"\n';
  yaml += '  evidence_required: [verified, certified]\n';
  yaml += '  structural_only: [contracted]\n';
  yaml += '  blocked: [legacy, quarantined]\n';
  yaml += '  implicit_selection_requires: high_performance_eligible\n';
  yaml += '  contracted_execution_requires: supervised\n';
  yaml += '  promotion_evidence_schema: "criminalsquad.skill-promotion-evidence/v1"\n';
  yaml += '  label_without_computed_eligibility: blocked\n\n';
  yaml += 'discovery_policy:\n';
  yaml += '  command: "npx criminalsquad search-skills --query <capability> --limit 8 --json"\n';
  yaml += '  max_prompt_results: 8\n';
  yaml += '  full_index_in_prompt: false\n';
  yaml += '  query_must_exclude_case_data: true\n\n';
  yaml += 'skills:\n';

  for (const [group, entries] of groups) {
    yaml += `  # ── ${group} (${entries.length}) ──\n`;
    for (const entry of entries) {
      const meta = entry.metadata;
      yaml += `  - name: ${entry.id}\n`;
      yaml += `    type: ${meta.type}\n`;
      yaml += `    grupo: ${yamlString(group)}\n`;
      yaml += `    desc: ${yamlString(summarizeSkillDescription(meta.description))}\n`;
      yaml += `    lifecycle: ${meta.lifecycle}\n`;
      yaml += `    production_eligible: ${entry.policy.productionEligible}\n`;
      yaml += `    selection: ${entry.policy.selection}\n`;
      yaml += `    high_performance_eligible: ${qualityBySkill.get(entry.id)?.highPerformanceEligible === true}\n`;
      if (meta.version) yaml += `    version: ${yamlString(meta.version)}\n`;
      if (meta.categories.length) yaml += `    categories: ${yamlList(meta.categories)}\n`;
      if (meta.aliases.length) yaml += `    aliases: ${yamlList(meta.aliases)}\n`;
      if (meta.supersedes.length) yaml += `    supersedes: ${yamlList(meta.supersedes)}\n`;
      if (meta.coexists.length) yaml += `    coexists: ${yamlList(meta.coexists)}\n`;
      if (meta.positiveTriggers.length) yaml += `    positive_triggers: ${yamlList(meta.positiveTriggers)}\n`;
      if (meta.negativeTriggers.length) yaml += `    negative_triggers: ${yamlList(meta.negativeTriggers)}\n`;
      if (meta.nextSkills.length) yaml += `    next_skills: ${yamlList(meta.nextSkills)}\n`;
      if (meta.engines.length) yaml += `    engines: ${yamlList(meta.engines)}\n`;
      if (meta.riskLevel) yaml += `    risk: ${yamlString(meta.riskLevel)}\n`;
      if (meta.deliveryType) yaml += `    delivery_type: ${yamlString(meta.deliveryType)}\n`;
      if (meta.schemaVersion) yaml += `    skill_schema: ${yamlString(meta.schemaVersion)}\n`;
      if (meta.qualityProfile) yaml += `    quality_profile: ${yamlString(meta.qualityProfile)}\n`;
      if (meta.qualityStatus) yaml += `    quality_status: ${yamlString(meta.qualityStatus)}\n`;
      if (meta.contractVersion) yaml += `    contract_version: ${yamlString(meta.contractVersion)}\n`;
      if (meta.freshnessPolicy) yaml += `    freshness_policy: ${yamlString(meta.freshnessPolicy)}\n`;
      if (meta.guardTriggers.length) yaml += `    guard_triggers: ${yamlList(meta.guardTriggers)}\n`;
      if (meta.evalCaseIds.length) yaml += `    eval_case_ids: ${yamlList(meta.evalCaseIds)}\n`;
      if (meta.sourcePackage) yaml += `    source_package: ${yamlString(meta.sourcePackage)}\n`;
    }
  }
  return yaml;
}

function issue(code, message, path = '') {
  return { code, message, path };
}

function extractLocalMarkdownReferences(raw) {
  const references = [];
  const regex = /!?\[[^\]]*\]\(([^)]+)\)/g;
  let match;
  while ((match = regex.exec(raw))) {
    let target = match[1].trim();
    if (target.startsWith('<') && target.endsWith('>')) target = target.slice(1, -1);
    // Markdown link titles follow whitespace; paths with spaces should use <...>.
    target = target.split(/\s+["']/)[0];
    if (!target || /^(?:#|https?:|mailto:|data:|javascript:)/i.test(target)) continue;
    if (/[{}]/.test(target)) continue; // documented placeholders are not file refs
    target = target.split('#')[0].split('?')[0];
    if (target) references.push(target);
  }
  return references;
}

function validateLocalReferences(entry, errors) {
  const skillDir = dirname(entry.skillPath);
  for (const reference of extractLocalMarkdownReferences(entry.raw)) {
    const target = isAbsolute(reference) ? normalize(reference) : resolve(skillDir, reference);
    if (!existsSync(target)) {
      errors.push(issue(
        'broken-reference',
        `${entry.id}: referência local inexistente ${reference}`,
        relative(entry.skillPath, target),
      ));
    }
  }
}

function detectCycles(edges) {
  const visiting = new Set();
  const visited = new Set();
  const cycles = [];

  function visit(node, trail) {
    if (visiting.has(node)) {
      const start = trail.indexOf(node);
      cycles.push([...trail.slice(start), node]);
      return;
    }
    if (visited.has(node)) return;
    visiting.add(node);
    for (const target of edges.get(node) || []) visit(target, [...trail, node]);
    visiting.delete(node);
    visited.add(node);
  }

  for (const node of edges.keys()) visit(node, []);
  return cycles;
}

export function extractIntegrationReferences(raw) {
  const references = [];
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  let section = '';
  let inSpecialized = false;
  let inWaveSkills = false;

  for (const line of lines) {
    if (/^[a-z_]+:\s*$/.test(line)) {
      section = line.slice(0, -1);
      inSpecialized = false;
      inWaveSkills = false;
      continue;
    }
    if (section === 'semantic_bridges') {
      const bridge = line.match(/^ {2}([a-z0-9][a-z0-9-]*):\s*$/);
      if (bridge) {
        references.push({ id: bridge[1], kind: 'bridge' });
        inSpecialized = false;
        continue;
      }
      if (/^ {4}specialized:\s*$/.test(line)) {
        inSpecialized = true;
        continue;
      }
      const specialized = inSpecialized && line.match(/^ {6}- ([a-z0-9][a-z0-9-]*)\s*$/);
      if (specialized) references.push({ id: specialized[1], kind: 'specialized' });
    }
    if (section === 'promotion_waves') {
      if (/^ {4}skills:\s*$/.test(line)) {
        inWaveSkills = true;
        continue;
      }
      if (/^ {2}- wave:/.test(line)) inWaveSkills = false;
      const promoted = inWaveSkills && line.match(/^ {6}- ([a-z0-9][a-z0-9-]*)\s*$/);
      if (promoted) references.push({ id: promoted[1], kind: 'promotion-wave' });
    }
  }
  return references;
}

function parseTargets(value) {
  return value
    .split(',')
    .map((target) => target.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

// Parses the deliberately compact canonicalization table in the integration
// manifest. It supports both inline rows and the expanded MS row whose action
// and gate live on separate lines.
export function parseCanonicalization(raw) {
  const marker = raw.match(/^canonicalization:\s*$/m);
  if (!marker) return null;
  const section = raw.slice(marker.index);
  const counts = {};
  for (const match of section.matchAll(/^ {4}(ADD|MERGE|SPLIT|ABSORB):\s*(\d+)\s*$/gm)) {
    counts[match[1]] = Number(match[2]);
  }

  const lines = section.replace(/\r\n/g, '\n').split('\n');
  const entries = [];
  for (let index = 0; index < lines.length; index++) {
    const inline = lines[index].match(/^ {4}- \{source:\s*([^,}]+),\s*action:\s*(ADD|MERGE|SPLIT|ABSORB),\s*targets:\s*\[([^\]]*)\]\s*\}\s*$/);
    if (inline) {
      entries.push({ source: inline[1].trim(), action: inline[2], targets: parseTargets(inline[3]) });
      continue;
    }

    const expanded = lines[index].match(/^ {4}- source:\s*([^\s]+)\s*$/);
    if (!expanded) continue;
    let action = '';
    let targets = [];
    for (let cursor = index + 1; cursor < lines.length; cursor++) {
      if (/^ {4}- /.test(lines[cursor]) || (/^[a-z_]+:\s*$/.test(lines[cursor]) && !lines[cursor].startsWith(' '))) break;
      const actionMatch = lines[cursor].match(/^ {6}action:\s*(ADD|MERGE|SPLIT|ABSORB)\s*$/);
      if (actionMatch) action = actionMatch[1];
      const targetMatch = lines[cursor].match(/^ {6}targets:\s*\[([^\]]*)\]\s*$/);
      if (targetMatch) targets = parseTargets(targetMatch[1]);
    }
    entries.push({ source: expanded[1], action, targets });
  }
  return { counts, entries };
}

export function parseDeterministicEngines(raw) {
  const marker = raw.match(/^deterministic_engines:\s*$/m);
  if (!marker) return [];
  const section = raw.slice(marker.index).split(/^canonicalization:\s*$/m)[0];
  const lines = section.replace(/\r\n/g, '\n').split('\n');
  const engines = [];
  let current = null;
  for (const line of lines) {
    const id = line.match(/^ {2}([a-z0-9][a-z0-9-]*):\s*$/);
    if (id) {
      current = { id: id[1], file: '', canonicalSkills: [] };
      engines.push(current);
      continue;
    }
    if (!current) continue;
    const file = line.match(/^ {4}file:\s*([^\s]+)\s*$/);
    if (file) current.file = file[1];
    const skills = line.match(/^ {4}canonical_skills:\s*\[([^\]]*)\]\s*$/);
    if (skills) current.canonicalSkills = parseTargets(skills[1]);
  }
  return engines;
}

function validateDeterministicEngines(raw, catalog, errors, {
  integrationPath,
  requireSourceSkills,
}) {
  const engines = parseDeterministicEngines(raw);
  if (!engines.length) {
    errors.push(issue('invalid-engine-registry', 'manifesto sem deterministic_engines', integrationPath));
    return;
  }
  const ids = new Set(catalog.entries.map((entry) => entry.id));
  const engineIds = new Set();
  const rootDir = dirname(catalog.skillsDir);
  for (const engine of engines) {
    if (engineIds.has(engine.id)) {
      errors.push(issue('invalid-engine-registry', `engine duplicado: ${engine.id}`, integrationPath));
    }
    engineIds.add(engine.id);
    if (!engine.file || !existsSync(resolve(rootDir, engine.file))) {
      errors.push(issue('broken-reference', `engine ${engine.id}: arquivo inexistente ${engine.file || '(vazio)'}`, integrationPath));
    }
    if (!engine.canonicalSkills.length) {
      errors.push(issue('invalid-engine-registry', `engine ${engine.id}: canonical_skills vazio`, integrationPath));
    }
    if (requireSourceSkills) {
      for (const skill of engine.canonicalSkills) {
        if (!ids.has(skill)) {
          errors.push(issue('invalid-engine-registry', `engine ${engine.id}: skill canônica inexistente ${skill}`, integrationPath));
        }
      }
    }
  }

  for (const entry of catalog.entries) {
    for (const engine of entry.metadata.engines) {
      if (!engineIds.has(engine)) {
        errors.push(issue('invalid-engine-registry', `${entry.id}: engine ${engine} não registrado no manifesto`, entry.skillPath));
      }
    }
  }
}

function parseBestPracticeIds(path) {
  if (!path || !existsSync(path)) return new Set();
  const raw = readFileSync(path, 'utf8');
  return new Set([...raw.matchAll(/^\s+- id:\s*([a-z0-9][a-z0-9-]*)\s*$/gm)].map((match) => match[1]));
}

function validateCanonicalization(raw, catalog, errors, {
  integrationPath,
  bestPracticesCatalogPath,
  requireSourceSkills,
}) {
  const canonicalization = parseCanonicalization(raw);
  if (!canonicalization) {
    errors.push(issue('invalid-canonicalization', 'manifesto sem canonicalization.entries', integrationPath));
    return;
  }

  const allowedActions = new Set(['ADD', 'MERGE', 'SPLIT', 'ABSORB']);
  const sources = new Map();
  const actionCounts = { ADD: 0, MERGE: 0, SPLIT: 0, ABSORB: 0 };
  for (const entry of canonicalization.entries) {
    if (sources.has(entry.source)) {
      errors.push(issue('invalid-canonicalization', `fonte canônica duplicada: ${entry.source}`, integrationPath));
    } else {
      sources.set(entry.source, entry);
    }
    if (!allowedActions.has(entry.action)) {
      errors.push(issue('invalid-canonicalization', `${entry.source}: action ausente ou inválida`, integrationPath));
      continue;
    }
    actionCounts[entry.action]++;
    if (!entry.targets.length) {
      errors.push(issue('invalid-canonicalization', `${entry.source}: nenhum target declarado`, integrationPath));
    }
    if (new Set(entry.targets).size !== entry.targets.length) {
      errors.push(issue('invalid-canonicalization', `${entry.source}: target duplicado`, integrationPath));
    }
    if (entry.action === 'SPLIT' && entry.targets.length < 2) {
      errors.push(issue('invalid-canonicalization', `${entry.source}: SPLIT exige ao menos dois targets`, integrationPath));
    }
  }

  for (const action of allowedActions) {
    const declared = canonicalization.counts[action];
    if (declared !== actionCounts[action]) {
      errors.push(issue(
        'invalid-canonicalization',
        `contagem ${action}: manifesto declara ${declared ?? '(ausente)'}, tabela contém ${actionCounts[action]}`,
        integrationPath,
      ));
    }
  }

  const packId = raw.match(/^ {2}id:\s*([^\s]+)\s*$/m)?.[1] || '';
  const declaredPackSize = Number(raw.match(/^ {2}skills:\s*(\d+)\s*$/m)?.[1] || 0);
  let expectedSources = catalog.entries
    .filter((entry) => entry.metadata.sourcePackage === packId)
    .map((entry) => entry.id);
  if (!expectedSources.length) {
    expectedSources = catalog.entries.filter((entry) => entry.id.startsWith('ep-')).map((entry) => entry.id);
  }

  if (requireSourceSkills && declaredPackSize && expectedSources.length !== declaredPackSize) {
    errors.push(issue(
      'invalid-canonicalization',
      `pack declara ${declaredPackSize} skills, catálogo encontrou ${expectedSources.length}`,
      integrationPath,
    ));
  }
  if (declaredPackSize && canonicalization.entries.length !== declaredPackSize) {
    errors.push(issue(
      'invalid-canonicalization',
      `pack declara ${declaredPackSize} skills, canonicalization cobre ${canonicalization.entries.length}`,
      integrationPath,
    ));
  }

  const expectedSet = new Set(expectedSources);
  if (requireSourceSkills) {
    for (const source of expectedSources) {
      if (!sources.has(source)) {
        errors.push(issue('invalid-canonicalization', `fonte do pack sem decisão canônica: ${source}`, integrationPath));
      }
    }
    for (const source of sources.keys()) {
      if (!expectedSet.has(source)) {
        errors.push(issue('invalid-canonicalization', `canonicalization contém fonte fora do pack: ${source}`, integrationPath));
      }
    }
  }

  const ids = new Set(catalog.entries.map((entry) => entry.id));
  const aliases = new Set(catalog.entries.flatMap((entry) => entry.metadata.aliases));
  const addTargets = new Set(canonicalization.entries
    .filter((entry) => entry.action === 'ADD')
    .flatMap((entry) => entry.targets));
  const bestPractices = parseBestPracticeIds(bestPracticesCatalogPath);
  const rootDir = dirname(catalog.skillsDir);

  function resolves(target, action) {
    if (ids.has(target) || aliases.has(target) || addTargets.has(target) || bestPractices.has(target)) return true;
    if (action !== 'ABSORB') return false;
    if (target === 'tests' || target === 'evals' || /^gate-[a-z0-9-]+$/.test(target)) return true;
    if (target.startsWith('acervo/')) return existsSync(resolve(rootDir, target));
    return false;
  }

  for (const entry of canonicalization.entries) {
    for (const target of entry.targets) {
      if (!resolves(target, entry.action)) {
        errors.push(issue(
          'invalid-canonicalization',
          `${entry.source}: target ${target} não resolve para skill, alias, destino ADD, best-practice ou absorção permitida`,
          integrationPath,
        ));
      }
    }
  }
}

function validateGraph(catalog, errors) {
  const ids = new Set(catalog.entries.map((entry) => entry.id));
  const entriesById = new Map(catalog.entries.map((entry) => [entry.id, entry]));
  const aliases = new Map();
  const supersedes = new Map();

  for (const entry of catalog.entries) {
    const meta = entry.metadata;
    for (const alias of meta.aliases) {
      if (alias === entry.id) {
        errors.push(issue('invalid-graph', `${entry.id}: alias aponta para o próprio id`));
      } else if (ids.has(alias)) {
        const shadowed = entriesById.get(alias);
        // Canonical active skills may retain the exact id of an imported
        // preview/deprecated/quarantined source as a compatibility alias while
        // that source remains preserved for audit. The integration manifest is
        // the authority that decides routing between them.
        if (entry.policy.productionEligible && !shadowed.policy.productionEligible) {
          aliases.set(alias, entry.id);
        } else {
          errors.push(issue('invalid-graph', `${entry.id}: alias ${alias} colide com uma skill existente`));
        }
      } else if (aliases.has(alias) && aliases.get(alias) !== entry.id) {
        errors.push(issue('invalid-graph', `${entry.id}: alias ${alias} já pertence a ${aliases.get(alias)}`));
      } else {
        aliases.set(alias, entry.id);
      }
    }

    const relations = [
      ['supersedes', meta.supersedes],
      ['coexists', meta.coexists],
      ['next_skills', meta.nextSkills],
    ];
    for (const [kind, targets] of relations) {
      for (const target of targets) {
        if (target === entry.id) {
          errors.push(issue('invalid-graph', `${entry.id}: ${kind} contém autorreferência`));
        } else if (!ids.has(target)) {
          errors.push(issue('invalid-graph', `${entry.id}: ${kind} aponta para skill inexistente ${target}`));
        }
      }
    }
    supersedes.set(entry.id, meta.supersedes.filter((target) => ids.has(target)));
  }

  for (const cycle of detectCycles(supersedes)) {
    errors.push(issue('invalid-graph', `ciclo em supersedes: ${cycle.join(' -> ')}`));
  }
}

export function validateSkillCatalog({
  skillsDir,
  indexPath = join(skillsDir, '_index.yaml'),
  integrationPath = join(skillsDir, '_execucao-penal-v3-integration.yaml'),
  checkIndex = true,
  requireIntegration = true,
  bestPracticesCatalogPath = join(dirname(skillsDir), '_criminalsquad', 'core', 'best-practices', '_catalog.yaml'),
  requireCanonicalSources = true,
} = {}) {
  const catalog = discoverSkillCatalog(skillsDir);
  const expectedIndex = renderSkillIndex(catalog);
  const errors = [];
  const warnings = [];

  for (const id of catalog.missingSkillFiles) {
    errors.push(issue('missing-skill-file', `${id}: pasta sem SKILL.md`, join(skillsDir, id)));
  }

  for (const entry of catalog.entries) {
    const meta = entry.metadata;
    if (!entry.frontmatter || !meta) {
      errors.push(issue('invalid-frontmatter', `${entry.id}: frontmatter ausente ou inválido`, entry.skillPath));
      continue;
    }
    if (meta.name !== entry.id) {
      errors.push(issue('folder-name-mismatch', `${entry.id}: frontmatter name é ${meta.name || '(vazio)'}`, entry.skillPath));
    }
    if (!meta.description) {
      errors.push(issue('invalid-frontmatter', `${entry.id}: description ausente`, entry.skillPath));
    }
    if (!SKILL_LIFECYCLES.includes(meta.lifecycle)) {
      errors.push(issue('invalid-lifecycle', `${entry.id}: lifecycle desconhecido ${meta.lifecycle}`, entry.skillPath));
    }
    for (const engine of meta.engines) {
      const enginePath = join(dirname(skillsDir), 'scripts', 'legal-calculators', `${engine}-engine.mjs`);
      if (!existsSync(enginePath)) {
        errors.push(issue('broken-reference', `${entry.id}: engine determinístico inexistente ${engine}`, enginePath));
      }
    }
    validateLocalReferences(entry, errors);
  }

  validateGraph(catalog, errors);

  if (requireIntegration && !existsSync(integrationPath)) {
    errors.push(issue('missing-integration-manifest', 'manifesto de integração de execução penal ausente', integrationPath));
  } else if (existsSync(integrationPath)) {
    const ids = new Set(catalog.entries.map((entry) => entry.id));
    const raw = readFileSync(integrationPath, 'utf8');
    const canonicalSources = new Set(parseCanonicalization(raw)?.entries.map((entry) => entry.source) || []);
    for (const reference of extractIntegrationReferences(raw)) {
      if (!ids.has(reference.id)) {
        if (!requireCanonicalSources && canonicalSources.has(reference.id)) continue;
        errors.push(issue(
          'invalid-graph',
          `manifesto: ${reference.kind} aponta para skill inexistente ${reference.id}`,
          integrationPath,
        ));
      }
    }
    validateCanonicalization(raw, catalog, errors, {
      integrationPath,
      bestPracticesCatalogPath,
      requireSourceSkills: requireCanonicalSources,
    });
    validateDeterministicEngines(raw, catalog, errors, {
      integrationPath,
      requireSourceSkills: requireCanonicalSources,
    });
  }

  if (checkIndex) {
    if (!existsSync(indexPath)) {
      errors.push(issue('stale-index', 'skills/_index.yaml ausente', indexPath));
    } else {
      const actual = readFileSync(indexPath, 'utf8');
      if (actual !== expectedIndex) {
        errors.push(issue('stale-index', 'skills/_index.yaml está desatualizado; rode npx criminalsquad indexar-skills', indexPath));
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    catalog,
    expectedIndex,
  };
}
