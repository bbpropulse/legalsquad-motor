// Gate mecânico de citação: extrai as citações de um texto e classifica cada
// uma contra fonte verificável, antes de qualquer humano ler.
//
// ## Por que precisa ser mecânico
//
// O piloto de enriquecimento passou por revisão adversarial de três lentes
// independentes. Elas pegaram — depois. Antes disso o texto já existia, com
// `Res. 23.609, art. 2º, § 4º` transcrito literalmente (parágrafo inexistente)
// e um acórdão de 1986 sustentando tese central sem confirmação. Revisão por
// LLM é boa e cara; o que ela não pode ser é a PRIMEIRA barreira, porque falha
// de forma correlacionada com quem escreveu.
//
// Este módulo não julga se a tese está certa. Responde uma pergunta estreita e
// verificável: **esta citação resolve contra alguma fonte, e qual?**
//
// ## Fail-closed, com a distinção que o projeto exige
//
// "Não encontrei no acervo" e "não tenho acervo" são coisas diferentes, e
// confundi-las faz o autor remover citação boa. Os estados são separados de
// propósito — nenhum deles é `VERIFICADA`.

const MARCA_NAO_VERIFICADO = /\[NÃO VERIFICADO\]/i;

const PADROES = [
  {
    tipo: 'sumula',
    // "Súmula 49 do TSE", "Súmula Vinculante 11", "Súmula 7/STJ"
    regex: /S[úu]mula(?:\s+Vinculante)?\s+n?[º°]?\s*(\d+)(?:\s*(?:do|da|\/)\s*([A-Z]{2,5}))?/gi,
    campos: (m) => ({ numero: m[1], orgao: (m[2] || '').toUpperCase() }),
  },
  {
    tipo: 'lei',
    // "LC 64/90, art. 3º", "Lei 9.504/1997 art. 41", "CF art. 5º", "CPC, art. 300"
    regex: /\b(LC|Lei(?:\s+Complementar)?|CF|CPC|CPP|CLT|CDC|CTN|CP|CC|CE)\s*n?[º°]?\s*([\d.]+(?:\/\d{2,4})?)?[^\n.;]{0,20}?art(?:igo)?\.?\s*(\d+)/gi,
    campos: (m) => ({ diploma: m[1].toUpperCase(), numeroLei: m[2] || '', artigo: m[3] }),
  },
  {
    tipo: 'acordao',
    // "REspe nº 6373", "AgR-REspEI nº 060020820", "RE 190.364", "HC 123456"
    regex: /\b((?:AgR-)?(?:REspe?(?:EI)?|RE|HC|MS|ADI|ADPF|RHC|AREsp|EDcl)[A-Za-z-]*)\s+n?[º°]?\s*([\d.\-/]{4,})/g,
    campos: (m) => ({ classe: m[1].toUpperCase(), numero: m[2].replace(/\D/g, '') }),
  },
];

function linhaDe(texto, indice) {
  return texto.slice(0, indice).split('\n').length - 1;
}

/**
 * @param {string} texto
 * @returns {{tipo: string, bruto: string, linha: number}[]} sem as já marcadas
 *   `[NÃO VERIFICADO]` — quem declarou a incerteza cumpriu o contrato, e
 *   re-listá-la afogaria o relatório justamente nas que se dizem certas.
 */
export function extrairCitacoes(texto) {
  const conteudo = String(texto || '');
  const linhas = conteudo.split('\n');
  const encontradas = [];

  for (const padrao of PADROES) {
    for (const m of conteudo.matchAll(padrao.regex)) {
      const linha = linhaDe(conteudo, m.index);
      if (MARCA_NAO_VERIFICADO.test(linhas[linha] || '')) continue;
      encontradas.push({ tipo: padrao.tipo, bruto: m[0].trim(), linha: linha + 1, ...padrao.campos(m) });
    }
  }

  return encontradas.sort((a, b) => a.linha - b.linha || a.bruto.localeCompare(b.bruto));
}

// "REspe" e "AgR-REspe" são a mesma família de recurso; o que não pode é um
// RO virar REspe. Reduzir à raiz mantém o casamento tolerante ao prefixo de
// agravo/embargos sem afrouxar a distinção entre classes diferentes.
function raizDaClasse(classe) {
  return String(classe || '')
    .replace(/^(AGR|EDCL|EMBDECL|AGRG)-?/i, '')
    .replace(/EI$/i, '')
    .toUpperCase();
}

function casaNoAcervo(citacao, acervo) {
  const alvo = citacao.tipo === 'sumula'
    ? [citacao.numero, citacao.orgao].filter(Boolean)
    // Número sozinho não identifica decisão. Medido contra 64.459 documentos:
    // "REspe nº 6373" do TSE casou com um "RO 6373" do TST — outro tribunal,
    // outra classe, outra matéria — e saiu VERIFICADA. Carimbar citação
    // inventada como conferida é pior que não ter gate nenhum.
    : [citacao.numero, raizDaClasse(citacao.classe)];

  return acervo.find((entrada) => {
    const campo = `${entrada.tema || ''} ${entrada.path || ''}`;
    return alvo.every((termo) => {
      // Número: borda dos DOIS lados — "49" casaria dentro de "1949".
      if (/^\d+$/.test(termo)) {
        return new RegExp(`(?<![\\p{L}\\p{N}])${termo}(?![\\p{L}\\p{N}])`, 'iu').test(campo);
      }
      // Classe: borda só à ESQUERDA. O acervo grava a classe completa
      // ("agr-respei"), e exigir borda à direita rejeitaria o próprio acórdão
      // que a citação nomeia. À esquerda a borda continua impedindo que "RESP"
      // case dentro de outra palavra.
      return new RegExp(`(?<![\\p{L}\\p{N}])${termo}`, 'iu').test(campo);
    });
  });
}

/**
 * @param {ReturnType<extrairCitacoes>} citacoes
 * @param {{acervo: {path: string, tema: string}[] | null, fontesAbertas?: string[]}} contexto
 */
export function classificarCitacoes(citacoes, contexto = {}) {
  const { acervo, fontesAbertas = [] } = contexto;

  return citacoes.map((citacao) => {
    // Legislação é consultada online no Planalto, no ato da redação. O gate
    // não tem como resolvê-la contra o acervo — e carimbar VERIFICADA por
    // ausência de contraprova local seria exatamente o fail-open que este
    // módulo existe para impedir. Só a fonte declaradamente aberta libera.
    if (citacao.tipo === 'lei') {
      const fonte = fontesAbertas.find((url) => /planalto\.gov\.br/i.test(url));
      return fonte
        ? { ...citacao, status: 'VERIFICADA', fonte }
        : { ...citacao, status: 'FONTE_NAO_DECLARADA', fonte: null };
    }

    if (!Array.isArray(acervo)) {
      return { ...citacao, status: 'ACERVO_AUSENTE', fonte: null };
    }

    const achado = casaNoAcervo(citacao, acervo);
    return achado
      ? { ...citacao, status: 'VERIFICADA', fonte: achado.path }
      : { ...citacao, status: 'NAO_ENCONTRADA', fonte: null };
  });
}
