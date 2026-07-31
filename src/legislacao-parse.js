// Converte a página de uma lei em texto e a fatia por artigo.
//
// Existe por causa de uma falha medida em campo: no piloto de enriquecimento,
// o agente tentou abrir dispositivos no Planalto, levou ECONNRESET, e **escreveu
// o conteúdo mesmo assim** — inventando texto de lei. A causa raiz não era
// instabilidade: o Planalto recusa requisição sem user-agent de navegador. Com
// UA de navegador responde 200.
//
// A lição de desenho é essa: enquanto a fonte da lei depender de rede no
// momento da redação, a falha de rede vira invenção. A lei precisa estar no
// acervo, local, antes de qualquer agente precisar dela.

const ENTIDADES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ordm: 'º', ordf: 'ª',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', agrave: 'à',
  acirc: 'â', ecirc: 'ê', ocirc: 'ô', atilde: 'ã', otilde: 'õ', ccedil: 'ç',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Agrave: 'À',
  Acirc: 'Â', Ecirc: 'Ê', Ocirc: 'Ô', Atilde: 'Ã', Otilde: 'Õ', Ccedil: 'Ç',
  uuml: 'ü', Uuml: 'Ü', laquo: '«', raquo: '»', deg: '°', sect: '§',
};

/**
 * O Planalto serve ISO-8859-1 e o restante do ecossistema serve utf-8.
 * Decodificar errado não quebra — corrompe **todo acento em silêncio**, e um
 * texto de lei com acento corrompido passaria no gate de citação como se
 * estivesse certo.
 */
function decodificar(buffer) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(String(buffer), 'utf8');
  const comoUtf8 = bytes.toString('utf8');
  // U+FFFD é o que o decodificador utf-8 emite ao encontrar byte inválido:
  // sinal de que a fonte não era utf-8.
  return comoUtf8.includes('�') ? bytes.toString('latin1') : comoUtf8;
}

export function htmlParaTexto(entrada) {
  let texto = decodificar(entrada).replace(/\r\n?/g, '\n');
  texto = texto.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  // Quebra na ABERTURA e no fechamento de bloco. Só no fechamento não basta:
  // a página da Lei 14.133 abre `<p>` e nunca fecha, e a lei inteira colapsava
  // em 17 linhas — o coletor gravava 17 artigos de 194 achando que deu certo.
  texto = texto.replace(/<\s*(br|\/?p|\/?div|\/?tr|\/?li|\/?h[1-6])\b[^>]*>/gi, '\n');
  texto = texto.replace(/<[^>]+>/g, '');
  texto = texto.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
  texto = texto.replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
  texto = texto.replace(/&([a-z]+);/gi, (todo, nome) => ENTIDADES[nome] ?? todo);
  texto = texto.replace(/[ \t\u00a0]+/g, ' ');
  texto = texto.replace(/[ \t]*\n[ \t]*/g, '\n').replace(/\n{3,}/g, '\n\n');
  // Reúne o "Art." que ficou órfão do próprio número. Medido na Lei 14.133:
  // o HTML exportado do Word separa os dois, e as 194 aberturas viravam 194
  // linhas soltas com "Art." e nenhum artigo reconhecido.
  texto = texto.replace(/\bArt\.[ \t]*\n+[ \t]*(?=\d)/g, 'Art. ');
  return texto.trim();
}

// `Art.` só abre dispositivo no INÍCIO da linha e com A maiúsculo. "no art. 5º
// desta Lei" é remissão dentro do texto — tratá-la como abertura partiria o
// artigo ao meio e o gate validaria contra meio dispositivo.
// `[\d.]` aceita a forma com separador de milhar ("Art.1.048."), encontrada na
// Lei 14.133. Lida como "artigo 1", o gate resolveria a citação contra outro
// dispositivo e devolveria VERIFICADA — pior que não verificar.
const ABERTURA = /^[ \t]*Art\.[ \t]*(\d[\d.]*?)\.?(?:[ºo°])?(?:[ \t]*-[ \t]*([A-Z]))?(?=[ \t]|$|[^\d.])/;

/**
 * @param {string} texto
 * @returns {{numero: string, texto: string}[]} na ordem do documento,
 *   preservando repetições (o texto compilado traz redação revogada e vigente).
 */
export function fatiarArtigos(texto) {
  const linhas = String(texto || '').split('\n');
  const artigos = [];
  let atual = null;

  for (const linha of linhas) {
    const abre = linha.match(ABERTURA);
    if (abre) {
      const numero = abre[1].replace(/\./g, '');
      atual = { numero: abre[2] ? `${numero}-${abre[2]}` : numero, linhas: [linha] };
      artigos.push(atual);
      continue;
    }
    // Texto anterior ao primeiro artigo (ementa, preâmbulo) não pertence a
    // dispositivo nenhum e é descartado aqui — vai inteiro no arquivo da lei.
    if (atual) atual.linhas.push(linha);
  }

  return artigos.map(({ numero, linhas: corpo }) => ({
    numero,
    texto: corpo.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
  }));
}
