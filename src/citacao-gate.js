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

// "(Vide ADIN 2332)", "(Vide ADI 6096)" — remissão que o próprio texto
// consolidado traz dentro do dispositivo, não citação de quem escreveu.
const NOTA_EDITORIAL = /\(\s*Vide\s$/i;

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
    //
    // Duas guardas, ambas nascidas de falso positivo medido no corpus inteiro:
    //
    // `(?![\p{L}])` — a sigla precisa de fronteira à DIREITA. Sem ela, "CE"
    // casava dentro de "CESSAÇÃO" e o título "CESSAÇÃO – ALCANCE DO ARTIGO 11"
    // virava uma citação ao art. 11 do Código Eleitoral.
    //
    // Número obrigatório no ramo `Lei`/`LC` — "lei" é substantivo comum, e
    // "...previsto em lei. Inteligência do art. 96" virava "Lei ., art. 96".
    // Sigla de código dispensa número porque `CF`/`CPC` já identificam o
    // diploma sozinhas.
    regex: /\b(?:(LC|Lei\s+Complementar|Lei)(?![\p{L}])\s*n?[º°]?\s*(\d[\d.]*(?:\/\d{2,4})?)|(CF|CPC|CPP|CLT|CDC|CTN|CP|CC|CE)(?![\p{L}]))[^\n.;]{0,20}?art(?:igo)?\.?\s*(\d+)/giu,
    campos: (m) => ({ diploma: (m[1] || m[3]).toUpperCase(), numeroLei: m[2] || '', artigo: m[4] }),
  },
  {
    tipo: 'acordao',
    // "REspe nº 6373", "AgR-REspEI nº 060020820", "RE 190.364", "MS 17.526-DF"
    //
    // O número para em dígitos/pontos/barra e a UF é capturada à parte. Antes o
    // hífen entrava no número: `MS 17.526-DF` virava `MS 17.526-`, o "DF" ficava
    // de fora e `17526` não casava com o path do acervo (`ms-17-526-df`) —
    // 182 skills receberam NAO_ENCONTRADA para citação que existia, que é o
    // erro mais caro do gate: leva a remover fundamentação correta.
    regex: /\b((?:AgR-)?(?:REspe?(?:EI)?|RE|HC|MS|ADI|ADPF|RHC|AREsp|EDcl)[A-Za-z-]*)\s+n?[º°]?\s*([\d][\d./]{3,})(?:-([A-Z]{2}))?/g,
    campos: (m) => ({ classe: m[1].toUpperCase(), numero: m[2].replace(/\D/g, ''), uf: m[3] || '' }),
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
      // Nota editorial DO PLANALTO dentro do dispositivo transcrito — o texto
      // consolidado insere "(Vide ADIN 6096)" no corpo do art. 103 da Lei
      // 8.213. Quem transcreve fielmente carrega a nota junto; tratá-la como
      // citação do autor reprova transcrição correta e ensina a truncar a
      // fonte para passar no gate.
      if (NOTA_EDITORIAL.test(conteudo.slice(Math.max(0, m.index - 8), m.index))) continue;
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
    // O acervo grava o número do processo com separadores variáveis: o tema
    // traz "MS 17.526-DF" e o path traz "ms-17-526-df". Comparar só a forma
    // literal faria a citação certa não casar com o próprio documento dela.
    //
    // A normalização junta os GRUPOS DE DÍGITOS separados por ponto ou hífen
    // ("17-526" e "17.526" viram "17526") preservando a fronteira com letras —
    // remover os separadores de tudo grudaria "MS17526DF" e a borda de palavra
    // rejeitaria o próprio número que deveria casar.
    const campoSoDigitos = campo.replace(/(\d)[.-](?=\d)/g, '$1');
    return alvo.every((termo) => {
      // Número: borda dos DOIS lados — "49" casaria dentro de "1949".
      if (/^\d+$/.test(termo)) {
        const borda = new RegExp(`(?<![\\p{L}\\p{N}])${termo}(?![\\p{L}\\p{N}])`, 'iu');
        return borda.test(campo) || borda.test(campoSoDigitos);
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
      // Vale a URL oficial OU o caminho do acervo de legislação: aquele
      // acervo foi coletado do Planalto e cada arquivo guarda a fonte_url de
      // origem, então ler de lá é reproduzível — mais verificável, não menos.
      const fonte = fontesAbertas.find((url) => /planalto\.gov\.br/i.test(url) || /acervo\/legislacao\//i.test(url));
      return fonte
        ? { ...citacao, status: 'VERIFICADA', fonte }
        : { ...citacao, status: 'FONTE_NAO_DECLARADA', fonte: null };
    }

    // Precedente aberto no portal oficial do tribunal tem a mesma qualidade
    // de verificação que a lei aberta no Planalto. Exigir que ALÉM disso
    // esteja no acervo local de informativos rejeitaria tese de repercussão
    // geral — justamente a mais citável.
    if (citacao.tipo === 'acordao') {
      const oficial = fontesAbertas.find((url) => /(stf|stj|tse|tst)\.jus\.br/i.test(url));
      if (oficial) return { ...citacao, status: 'VERIFICADA', fonte: oficial };
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
