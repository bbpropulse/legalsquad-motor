// Extração do catálogo (SPEC §6.1) — a metade FINA do pacote.
//
// Um registro de descoberta por item, separado das entidades de conteúdo. É o
// que o cliente sincroniza sempre, de todos os pacotes, para poder buscar
// localmente sem baixar conteúdo nenhum. Os campos são exatamente os que o
// `search-skills` já devolve e os que o Arquiteto já exige da shortlist — o
// catálogo não introduz conceito novo, só o desacopla do conteúdo.
//
// READ-ONLY sobre as entidades que recebe: o catálogo é derivado, nunca uma
// oportunidade de mexer no conteúdo (ver `promoverNuncaReescreve` abaixo).

import { parseSkillMetadata } from './frontmatter.js';

/** Marcadores de contrato de forks anteriores a este motor (§6.8). */
const MARCADORES_LEGADOS = [/CRIMINALSQUAD:HP-CONTRACT/, /\bcsq-v5-/];

/** Status que significam desempenho comprovado — e que exigem evidência local. */
const STATUS_PROMOVIDOS = new Set(['verified', 'certified']);

const LIMITE_DESCRICAO = 220;

function recortar(texto, max = LIMITE_DESCRICAO) {
  const limpo = String(texto || '').replace(/\s+/g, ' ').trim();
  if (limpo.length <= max) return limpo;
  return `${limpo.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}

/**
 * Por que esta skill não pode sair do build como promovida.
 *
 * Duas razões, e a primeira vale SEMPRE: a evidência comportamental mora em
 * `skills/_evals/results/`, que é user-owned e não viaja no pacote (§6.5). Numa
 * instalação limpa não existe evidência nenhuma — então uma skill que chegasse
 * marcada `verified` hard-falharia no destino, ou pior, seria acreditada.
 * O pacote leva o CONTRATO e os CASOS de eval; a PROVA é local, por construção.
 */
function motivosDeBloqueio(metadata, texto) {
  const motivos = [];
  if (STATUS_PROMOVIDOS.has(metadata.qualityStatus)) {
    motivos.push(
      `declarado "${metadata.qualityStatus}" na origem, sem evidência comportamental no pacote ` +
        '(skills/_evals/results/ é user-owned e não viaja) — promoção exige forward-run local'
    );
  }
  if (MARCADORES_LEGADOS.some((padrao) => padrao.test(texto))) {
    motivos.push(
      'marcador de contrato legado (fork anterior a este motor) — identifica o contrato, ' +
        'nunca promove; o curador reemite a evidência sobre os bytes atuais'
    );
  }
  return motivos;
}

function registroDeSkill(entidade, nomeDaEntidade, id) {
  const metadata = parseSkillMetadata(entidade.text, { fallbackName: id });
  const bloqueios = motivosDeBloqueio(metadata, entidade.text);

  return {
    kind: 'skill',
    id,
    entity: nomeDaEntidade,
    path: entidade.path,
    sha256: entidade.sha256,
    bytes: entidade.bytes,
    description: recortar(metadata.description),
    triggers: metadata.positiveTriggers || [],
    aliases: metadata.aliases || [],
    categories: metadata.categories || [],
    lifecycle: metadata.lifecycle,
    // Capado de propósito. Ver `motivosDeBloqueio`.
    quality_status: bloqueios.length ? 'contracted' : metadata.qualityStatus,
    quality_profile: metadata.qualityProfile,
    risk: metadata.riskLevel,
    delivery_type: metadata.deliveryType,
    // Sempre falso num pacote recém-construído: elegibilidade é recalculada no
    // cliente, depois que existir evidência local.
    high_performance_eligible: false,
    eval_case_ids: metadata.evalCaseIds || [],
    ...(bloqueios.length ? { promotion_blocked_by: bloqueios } : {}),
  };
}

function registroDeSquad(entidade, nomeDaEntidade, id) {
  const descricao = entidade.text?.match(/^description:\s*(.+)$/m)?.[1] || '';
  return {
    kind: 'squad',
    id,
    entity: nomeDaEntidade,
    path: entidade.path,
    sha256: entidade.sha256,
    bytes: entidade.bytes,
    description: recortar(descricao.replace(/^["'>|-]+\s*/, '')),
  };
}

function registroDeBestPractice(entidade, nomeDaEntidade, id) {
  const titulo = entidade.text?.match(/^#\s+(.+)$/m)?.[1] || id;
  return {
    kind: 'best-practice',
    id,
    entity: nomeDaEntidade,
    path: entidade.path,
    sha256: entidade.sha256,
    bytes: entidade.bytes,
    description: recortar(titulo),
  };
}

/**
 * Deriva o catálogo a partir das entidades de conteúdo.
 *
 * Só arquivos que são ITENS DESCOBRÍVEIS viram registro: `SKILL.md`,
 * `squad.yaml`, e cada best-practice. Arquivos de apoio (`references/`,
 * `agents/`, assets) viajam no conteúdo e não poluem o catálogo — é justamente
 * essa razão de tamanho que torna a descoberta local viável.
 *
 * Não muta nada do que recebe: o conteúdo sai daqui byte a byte como entrou.
 */
export function extrairCatalogo(entidades, nomeDaEntidade) {
  const registros = [];

  for (const entidade of entidades) {
    const skill = entidade.path.match(/^skills\/([^/]+)\/SKILL\.md$/);
    if (skill) {
      registros.push(registroDeSkill(entidade, nomeDaEntidade, skill[1]));
      continue;
    }
    const squad = entidade.path.match(/^squads\/([^/]+)\/squad\.yaml$/);
    if (squad) {
      registros.push(registroDeSquad(entidade, nomeDaEntidade, squad[1]));
      continue;
    }
    const bp = entidade.path.match(/^core\/best-practices\/([^/]+)\.md$/);
    if (bp && !bp[1].startsWith('_')) {
      registros.push(registroDeBestPractice(entidade, nomeDaEntidade, bp[1]));
    }
  }

  return registros;
}
