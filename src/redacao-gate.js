// Redação Gate — o irmão determinístico do Citation Gate.
//
// O Citation Gate bloqueia citação pendente e inventada. Ele NÃO bloqueia peça
// rasa: um esqueleto bem formatado, sem os fatos do caso, passa por ele inteiro.
// `skills:` no squad.yaml é declaração; o `check-squad` confere que a skill
// existe — mas existir não é ter sido lida nem aplicada.
//
// Módulo PURO de propósito. O gate de citação tem 225 linhas de lógica dentro do
// hook, o que o torna difícil de testar; aqui o hook é casca e a decisão mora
// aqui, exercitada por teste.
//
// ── Três sinais, em ordem de força ────────────────────────────────────────
//
// 1. ANCORAGEM — a peça cita os identificadores do caso? É o único que mede
//    profundidade. Peça rasa é genérica por construção: serve para qualquer
//    caso, e por isso não cita âncora nenhuma.
// 2. COBERTURA — a peça contempla o "Contrato de saída" que a skill declara?
//    Derivado da skill, não hardcoded: o núcleo não sabe o que é uma petição,
//    sabe ler o contrato v5.
// 3. ANDAIME — template vazou para a entrega? Reprova sozinho, como os outros:
//    `{{variavel}}` ou `[INSERIR]` numa peça protocolada é indefensável, e um
//    sinal que só corrobora deixaria isso passar sempre que os demais
//    aprovassem. O risco conhecido é o inverso — blacklist em prosa gera falso
//    positivo (`(tese 1)` citando um repetitivo, p.ex.) —, e ele é aceito
//    porque reprovar aqui não apaga nem reescreve nada: o gate PARA e escala ao
//    humano com o padrão nomeado, que então libera em um passo.
//
// O que NÃO se faz aqui: exigir hash dos SKILL.md como prova de leitura. Hash de
// arquivo se produz rodando um script, sem nenhum modelo ter consumido nada — é
// carimbo automático, o mesmo defeito do re-bind de evidência de promoção. A
// força do Citation Gate vem de refutar o manifesto olhando o artefato; é essa
// propriedade que este módulo copia, não o formato do manifesto.

const NAO_AVALIADO = 'nao-avaliado';

/** Andaime de pipeline que nunca deveria chegar à entrega. */
const ANDAIME = [
  /\(tese\s+\d+\)/i,
  /^\s*Agente:\s/im,
  /^\s*Run:\s/im,
  /^\s*step[-_]?\d+\s*:/im,
  /\{\{\s*[a-z_.]+\s*\}\}/i,
  /\[(?:INSERIR|PREENCHER|TODO|XXX)\]/i,
];

/**
 * Identificadores do caso: número de processo, data, valor, sigla/parte em caixa
 * alta. Vocabulário jurídico comum NÃO entra — ele aparece em qualquer peça e
 * não distingue caso nenhum, que é justamente o que se quer medir.
 */
export function extrairAncoras(texto) {
  const fonte = String(texto || '');
  const ancoras = new Set();

  // Qualquer token com dígito: processo, data, valor, artigo, competência.
  for (const bruto of fonte.match(/[0-9][0-9./:-]*[0-9]|[0-9]/g) || []) {
    if (bruto.replace(/\D/g, '').length >= 4) ancoras.add(bruto);
  }
  // Siglas e partes em caixa alta (ACME, LTDA, INSS) — 3+ letras para não pegar
  // início de frase nem numeral romano curto.
  for (const bruto of fonte.match(/\b[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{3,}\b/g) || []) ancoras.add(bruto);

  return [...ancoras];
}

/**
 * Elementos obrigatórios da entrega, lidos do bloco `## Contrato de saída` do
 * contrato v5. Cada bullet contribui o seu termo-cabeça.
 */
export function extrairExigenciasDeSaida(contrato) {
  // `$(?![\s\S])` é fim de STRING. Um `$` solto, com a flag /m, casaria fim de
  // LINHA e a captura preguiçosa pararia no primeiro bullet — lendo uma
  // exigência de quatro e aprovando peça que falta três.
  const bloco = String(contrato || '').match(/^##\s+Contrato de sa[íi]da\s*\n([\s\S]*?)(?=\n##\s|$(?![\s\S]))/m);
  if (!bloco) return [];

  const exigencias = new Set();
  for (const linha of bloco[1].split('\n')) {
    const item = linha.match(/^\s*-\s+(.+?)\s*$/)?.[1];
    if (!item) continue;
    // Termo-cabeça: primeira palavra significativa do bullet.
    const cabeca = item.split(/[\s:,]/).find((p) => p.length >= 4);
    if (cabeca) exigencias.add(cabeca.toLowerCase());
  }
  return [...exigencias];
}

function normalizar(texto) {
  return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * V\u00edcios que denunciam texto de IA numa pe\u00e7a \u2014 par mec\u00e2nico da best-practice
 * `redacao-sem-marcas-de-ia`, que julga os treze padr\u00f5es. Aqui s\u00f3 entram os que
 * d\u00e1 para CONTAR sem interpretar; tr\u00edade ornamental e cita\u00e7\u00e3o decorativa ficam
 * com o guia, porque exigem ler o argumento.
 *
 * Isto \u00e9 estilo do portugu\u00eas forense, n\u00e3o instituto jur\u00eddico \u2014 mesma natureza
 * da lista `ANDAIME` acima, e por isso mora no n\u00facleo. Ainda assim vem por
 * par\u00e2metro em `avaliarRedacao`: uma \u00e1rea em outro idioma traz a sua.
 */
const VICIOS_DE_REDACAO = [
  {
    id: 'assercao-sem-prova',
    rotulo: 'afirma a conclus\u00e3o em vez de demonstr\u00e1-la',
    regex: /\b(?:[\u00e9e]\s+cedi[\u00e7c]o\s+que|resta[m]?\s+(?:cristalino|evidente|claro|patente)|n[\u00e3a]o\s+h[\u00e1a]\s+d[\u00fau]vidas?\s+de\s+que|[\u00e9e]\s+not[\u00f3o]rio\s+que|[\u00e9e]\s+ineg[\u00e1a]vel\s+que)/gi,
  },
  {
    id: 'conectivo-em-cadeia',
    rotulo: 'conectivo pesado como enchimento',
    regex: /\b(?:outrossim|destarte|ademais|nesse\s+diapas[\u00e3a]o|por\s+derradeiro|d'?outra\s+banda)\b/gi,
  },
  {
    id: 'superlativo-empilhado',
    rotulo: 'superlativo no lugar de prova',
    regex: /\b(?:absolutamente|totalmente|completamente|manifestamente|flagrantemente|inquestionavelmente)\s+\p{L}+/giu,
  },
  {
    id: 'fecho-generico',
    rotulo: 'fecho de estilo, sem pedido espec\u00edfico',
    regex: /\bmedida\s+de\s+(?:mais\s+)?l[\u00edi]dima\s+justi[\u00e7c]a|\bpor\s+ser\s+medida\s+de\s+justi[\u00e7c]a/gi,
  },
];

/** Acima disto, o ac\u00famulo deixa de ser escolha de estilo e vira enchimento. */
const LIMITE_DE_VICIOS = 4;

/**
 * Remove o que a pe\u00e7a CITA, deixando s\u00f3 o que ela REDIGE.
 *
 * Blockquote \u00e9 fonte: ementa, dispositivo, depoimento. Contar o estilo de quem
 * escreveu a ementa contra quem a transcreveu empurraria o redator a adulterar
 * a cita\u00e7\u00e3o para passar no gate \u2014 exatamente o que a best-practice pro\u00edbe.
 */
function semCitacoes(texto) {
  return String(texto || '')
    .split('\n')
    .filter((linha) => !/^\s*>/.test(linha))
    .join('\n');
}

/**
 * Avalia uma peça. Devolve `{ ok, problemas[], sinais }`, onde cada sinal é
 * `aprovado`, `reprovado` ou `nao-avaliado`.
 *
 * **`nao-avaliado` nunca é aprovação.** O que não dá para verificar é declarado,
 * não presumido — mesma regra que o runner aplica à best-practice de redação
 * ausente. Aprovar em silêncio seria o gate mentindo exatamente onde deveria calar.
 */
export function avaliarRedacao({ artefato, entrada, contratos = [], vicios = VICIOS_DE_REDACAO }) {
  const texto = String(artefato || '');
  const problemas = [];
  const sinais = {};

  // ── 1. Ancoragem ao caso ────────────────────────────────────────────────
  const ancoras = extrairAncoras(entrada);
  if (ancoras.length === 0) {
    sinais.ancoragem = NAO_AVALIADO;
    problemas.push(
      'ancoragem NÃO AVALIADA: o material de entrada não tem identificadores (número, data, valor, '
      + 'sigla) para confrontar. Sem eles não dá para distinguir peça do caso de peça genérica.'
    );
  } else {
    const usadas = ancoras.filter((a) => texto.includes(a));
    if (usadas.length === 0) {
      sinais.ancoragem = 'reprovado';
      problemas.push(
        `ancoragem REPROVADA: a peça não cita nenhum dos ${ancoras.length} identificadores do caso `
        + `(ex.: ${ancoras.slice(0, 3).join(', ')}). Peça que serve para qualquer caso é peça rasa.`
      );
    } else {
      sinais.ancoragem = 'aprovado';
    }
  }

  // ── 2. Cobertura do contrato de saída ───────────────────────────────────
  const exigencias = [...new Set(contratos.flatMap((c) => extrairExigenciasDeSaida(c)))];
  if (exigencias.length === 0) {
    // Área não instalada, ou skill sem contrato v5. Desliga esta dimensão, não o
    // gate inteiro — degradação por dimensão, como o runner faz.
    sinais.cobertura = NAO_AVALIADO;
    problemas.push('cobertura NÃO AVALIADA: nenhum "Contrato de saída" encontrado nas skills declaradas.');
  } else {
    const corpo = normalizar(texto);
    const faltando = exigencias.filter((e) => !corpo.includes(normalizar(e)));
    if (faltando.length) {
      sinais.cobertura = 'reprovado';
      problemas.push(`cobertura REPROVADA: a peça não contempla ${faltando.join(', ')} — exigido pelo contrato da skill.`);
    } else {
      sinais.cobertura = 'aprovado';
    }
  }

  // ── 3. Andaime vazado ───────────────────────────────────────────────────
  const vazamentos = ANDAIME.filter((padrao) => padrao.test(texto));
  if (vazamentos.length) {
    sinais.andaime = 'reprovado';
    problemas.push(`andaime REPROVADO: template do pipeline vazou para a entrega (${vazamentos.length} padrão/ões).`);
  } else {
    sinais.andaime = 'aprovado';
  }

  // ── 4. Vícios de redação (marcas de IA) ─────────────────────────────────
  // Mede DENSIDADE fora de citação. Presença isolada não reprova: "outrossim"
  // uma vez é conectivo, e reprovar aí ensinaria a evitar a palavra em vez de
  // evitar o enchimento — o gate viraria superstição.
  const lista = Array.isArray(vicios) ? vicios.filter((v) => v && v.regex) : [];
  if (!lista.length) {
    sinais.vicios = NAO_AVALIADO;
    problemas.push('vícios NÃO AVALIADOS: nenhuma lista de padrões de redação foi fornecida ao gate.');
  } else {
    const redigido = semCitacoes(texto);

    // ── Travessão de IA: tolerância ZERO no que a peça REDIGE ──────────────
    // Regra de produto, distinta da densidade: o travessão (—, ou – espaçado
    // como conector) é a marca tipográfica de texto de IA, e a prosa forense
    // brasileira não precisa dele — vírgula, dois-pontos, parênteses ou ponto
    // resolvem. Diferente de "outrossim" (palavra legítima em dose), UM
    // travessão já denuncia; por isso não entra na conta de densidade: é
    // reprovação própria. Citações (blockquote) ficam de fora — ementa
    // transcrita com travessão é fidelidade à fonte, não estilo do redator. O
    // hífen (-) nunca casa: palavra composta e "art. 1.035-A" são intocáveis.
    const travessoes = (redigido.match(/\u2014|\s\u2013\s/g) || []).length;
    if (travessoes > 0) {
      sinais.vicios = 'reprovado';
      problemas.push(
        `travessão REPROVADO: ${travessoes} travessão(ões) na prosa redigida — marca de texto de IA. `
        + 'Reescreva com vírgula, dois-pontos, parênteses ou ponto final; travessão só sobrevive dentro de citação transcrita.'
      );
    }
    const achados = [];
    let total = 0;
    for (const vicio of lista) {
      const n = (redigido.match(vicio.regex) || []).length;
      if (n) {
        total += n;
        achados.push(`${vicio.id}${vicio.rotulo ? ` (${vicio.rotulo})` : ''} ×${n}`);
      }
    }
    if (total > LIMITE_DE_VICIOS) {
      sinais.vicios = 'reprovado';
      problemas.push(
        `vícios REPROVADO: ${total} marcas de redação genérica fora de citação — ${achados.join('; ')}. `
        + 'Troque a asserção pela demonstração e corte o conectivo de enchimento (ver `redacao-sem-marcas-de-ia`).'
      );
    } else if (sinais.vicios !== 'reprovado') {
      // Não sobrescreve a reprovação do travessão acima.
      sinais.vicios = 'aprovado';
    }
  }

  return {
    ok: !Object.values(sinais).includes('reprovado'),
    problemas,
    sinais,
  };
}
