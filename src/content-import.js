// Conversão de um export externo para a árvore de conteúdo do motor.
//
// O módulo é genérico quanto à ORIGEM: recebe registros com um schema
// documentado (§ abaixo) e não conhece de que biblioteca vieram. O que ele
// conhece é o formato de destino — `skills/<slug>/SKILL.md` com o frontmatter
// que o motor lê.
//
// ── A regra que define este arquivo: NÃO INVENTAR ──────────────────────────
//
// Um export de biblioteca traz slug, título, resumo, tags e corpo — tudo que
// descreve o QUE a skill faz. Ele não traz `risk_level` nem `delivery_type`, e
// esses dois são exatamente os campos de que os gates fail-closed dependem:
// risco define quanta evidência a promoção exige (§PROMOTION_EVIDENCE_MINIMUMS)
// e delivery_type define se a skill mexe no mundo externo.
//
// Deduzi-los por heurística sobre texto livre seria fabricar a metadata que
// existe para impedir que uma skill errada entre numa peça — e fabricar de um
// jeito plausível, que é o pior: ninguém revisaria. Então o conversor recusa, e
// o curador declara uma vez por lote.
//
// Schema de entrada esperado (campos ausentes são tolerados, exceto os marcados):
//   slug*                   → identidade da skill
//   summary | title*        → descrição
//   tags[]                  → categorias e gatilhos
//   instructions_markdown*  → corpo
//   version, area           → metadata informativa

/** Os dois campos que o conversor se recusa a adivinhar. */
const EXIGE_DECISAO = ['risk_level', 'delivery_type'];

function limpar(texto) {
  return String(texto || '').replace(/\s+/g, ' ').trim();
}

/** Escapa para valor YAML entre aspas simples, que é o que o parser do motor lê. */
function listaYaml(valores) {
  return `[${valores.map((v) => limpar(v)).filter(Boolean).join(', ')}]`;
}

/**
 * Converte um registro em `{ path, conteudo }`.
 * `defaults` precisa trazer `risk_level` e `delivery_type` — sem eles, lança.
 */
export function converterRegistro(registro, defaults = {}) {
  const faltando = EXIGE_DECISAO.filter((campo) => !defaults[campo]);
  if (faltando.length) {
    throw new Error(
      `content-import: recuso converter sem ${faltando.join(' e ')} declarados. ` +
        'Estes campos governam os gates fail-closed (quanta evidência a promoção exige, e se a ' +
        'skill mexe no mundo externo) e o export não os traz. Deduzi-los de texto livre seria ' +
        'fabricar metadata de segurança plausível — que é a pior espécie, porque ninguém revisa. ' +
        'Declare-os por lote, depois de olhar o lote.'
    );
  }

  const slug = limpar(registro.slug);
  if (!slug) throw new Error('content-import: registro sem `slug` — não há como nomear a skill');

  const corpo = String(registro.instructions_markdown || '');
  if (!corpo.trim()) {
    throw new Error(`content-import: registro "${slug}" com corpo vazio — nada a converter`);
  }

  const tags = (registro.tags || []).map(limpar).filter(Boolean);
  const resumo = limpar(registro.summary) || limpar(registro.title) || slug;
  const gatilhos = [slug, ...tags].slice(0, 6);

  const frontmatter = [
    '---',
    `name: ${slug}`,
    'description: >-',
    `  ${resumo} Gatilhos: ${gatilhos.join(', ')}.`,
    '  Rascunho técnico — exige revisão humana antes de qualquer uso real.',
    'metadata:',
    '  type: "prompt"',
    '  lifecycle: "active"',
    // Nunca promovida: a evidência comportamental é local e não existe numa
    // importação. Sair como `verified` seria o motor mentindo.
    '  quality_status: "contracted"',
    `  categories: ${listaYaml(tags.length ? tags : [registro.area || 'importada'])}`,
    `  positive_triggers: ${listaYaml(gatilhos)}`,
    `  risk_level: "${defaults.risk_level}"`,
    `  delivery_type: "${defaults.delivery_type}"`,
    ...(registro.version ? [`  version: "${limpar(registro.version)}"`] : []),
    ...(registro.area ? [`  source_area: "${limpar(registro.area)}"`] : []),
    // `quality_profile` fica AUSENTE de propósito: `classifySkillQualityProfile`
    // deriva o perfil da função da skill (id + categorias) e a declaração
    // explícita tem precedência. Declarar aqui seria sobrepor a regra do motor
    // com um palpite do importador.
    '---',
    '',
    '<!-- PROVENIÊNCIA DA IMPORTAÇÃO',
    `  risk_level e delivery_type NÃO vieram desta skill: foram herdados de um`,
    `  default de lote — ${limpar(defaults.origem) || 'origem não declarada'}.`,
    '  São valores de lote, não curados por skill. Reveja antes de promover.',
    '-->',
    '',
  ].join('\n');

  return { path: `skills/${slug}/SKILL.md`, conteudo: `${frontmatter}${corpo.trimEnd()}\n` };
}
