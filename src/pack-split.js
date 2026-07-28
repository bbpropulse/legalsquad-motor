// Corte `transversal` × `area.*` (SPEC §6.3).
//
// O empacotador é cego: ele não pode ADIVINHAR que uma skill serve qualquer
// área. Quem sabe é o curador, e ele declara num `_packs.yaml` na raiz do
// conteúdo — um lugar só, auditável de uma vez. O corte tem consequência: uma
// skill presente nos dois pacotes é erro de build, e uma skill transversal que
// cai na área vira duplicação em TODA área, que é exatamente o que a migração
// existe para eliminar.
//
// O arquivo é YAML PLANO de propósito, para reusar `parseScalar`/`parseList` do
// frontmatter — parser já testado, incluindo os casos de comentário que já
// custaram bug. Sem dependência nova para ler cinco chaves.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseList, parseScalar } from './frontmatter.js';

const ARQUIVO = '_packs.yaml';

/** Skills viajam no corte; squads e best-practices são de área por definição. */
const PREFIXO_SKILLS = 'skills/';

function chavePresente(bruto, chave) {
  return new RegExp(`^\\s*${chave}\\s*:`, 'm').test(bruto);
}

/**
 * Lê o corte declarado na raiz do conteúdo.
 * Fail-closed: sem o arquivo, ou sem a chave `transversal_skills`, o build para.
 */
export function lerCorteDePacotes(raizConteudo) {
  const caminho = join(raizConteudo, ARQUIVO);
  if (!existsSync(caminho)) {
    throw new Error(
      `pack-split: ${ARQUIVO} ausente em ${raizConteudo} — o empacotador não adivinha o corte ` +
        'transversal × área. Sem ele, skills transversais iriam para o pacote de área e ' +
        'apareceriam duplicadas em toda área instalada.'
    );
  }

  const bruto = readFileSync(caminho, 'utf8');
  if (!chavePresente(bruto, 'transversal_skills')) {
    throw new Error(
      `pack-split: ${ARQUIVO} sem a chave \`transversal_skills\` — chave ausente não significa ` +
        'lista vazia. "Nenhuma skill transversal" é decisão de curadoria e precisa estar escrita ' +
        '(`transversal_skills: []`).'
    );
  }

  return {
    areaId: parseScalar(bruto, 'area_id') || null,
    titulo: parseScalar(bruto, 'area_titulo') || null,
    curador: parseScalar(bruto, 'area_curador') || null,
    ramos: parseList(bruto, 'area_ramos'),
    transversalSkills: new Set(parseList(bruto, 'transversal_skills')),
  };
}

/** O id da skill é o primeiro segmento depois de `skills/`. */
function idDaSkill(caminho) {
  if (!caminho.startsWith(PREFIXO_SKILLS)) return null;
  const resto = caminho.slice(PREFIXO_SKILLS.length);
  const barra = resto.indexOf('/');
  return barra === -1 ? null : resto.slice(0, barra);
}

/**
 * Roteia cada entidade-arquivo para `transversal` ou `area`.
 * A skill inteira viaja junta — `references/`, `agents/`, tudo.
 */
export function separarEntidades(entidades, transversalSkills) {
  const transversal = [];
  const area = [];
  const casados = new Set();

  for (const entidade of entidades) {
    const id = idDaSkill(entidade.path);
    if (id && transversalSkills.has(id)) {
      casados.add(id);
      transversal.push(entidade);
    } else {
      area.push(entidade);
    }
  }

  // Declaração que aponta para o vazio é sintoma de skill renomeada ou removida.
  // Aceitar em silêncio produziria um `transversal` menor do que o curador pensa
  // que produziu — e ninguém descobre até a skill faltar numa área.
  const fantasmas = [...transversalSkills].filter((id) => !casados.has(id)).sort();
  if (fantasmas.length) {
    throw new Error(
      `pack-split: ${ARQUIVO} declara skill(s) transversal(is) que não existem no conteúdo — ` +
        `${fantasmas.join(', ')}. Renomeada, removida, ou erro de digitação.`
    );
  }

  return { transversal, area };
}
