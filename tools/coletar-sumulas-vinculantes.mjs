#!/usr/bin/env node
// Grava no acervo as Súmulas Vinculantes do STF, uma por arquivo.
//
//   node tools/coletar-sumulas-vinculantes.mjs <raiz-da-instalacao> [--dry-run]
//
// **Por que isto existe, separado de `coletar-sumulas.mjs`.** Súmula
// Vinculante e súmula ordinária do STF são séries numéricas distintas — a
// SV 10 (reserva de plenário) não é a Súmula 10 ordinária (tempo de serviço
// militar). O coletor de ordinárias já preenchia `acervo/sumulas/STF/`, e um
// subagente citou aquele diretório como se cobrisse as vinculantes também —
// o BRIEFING chegou a afirmar isso por engano, e mais de um agente
// independente bateu na mesma lacuna depois. Ver `src/sumula-vinculante-parse.js`
// para os detalhes do formato de origem.
//
// Este coletor BAIXA da rede (diferente do de legislação/súmulas ordinárias,
// que recebem arquivo já obtido) porque a fonte é uma página por súmula, não
// um PDF único — não há como declarar isso como parâmetro sem reimplementar
// o mesmo fluxo em quem chama.

import { mkdirSync, writeFileSync, existsSync, rmSync, renameSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { htmlParaTexto } from '../src/legislacao-parse.js';
import { fatiarSumulaVinculante } from '../src/sumula-vinculante-parse.js';

const raiz = process.argv[2];
const seco = process.argv.includes('--dry-run');
if (!raiz) {
  console.error('uso: coletar-sumulas-vinculantes.mjs <raiz> [--dry-run]');
  process.exit(1);
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const INDICE = 'https://portal.stf.jus.br/jurisprudencia/sumariosumulas.asp?base=26';

// `fetch` nativo do Node valida a cadeia de certificado contra o store
// embutido do runtime, que neste ambiente rejeita a CA do portal do STF
// (UNABLE_TO_VERIFY_LEAF_SIGNATURE) mesmo com o certificado válido — o
// mesmo host abre normal em qualquer navegador. `curl` usa o keychain do
// sistema, que já confia na cadeia; é a mesma ferramenta que todo o resto
// do coletor de legislação já usa para driblar o bloqueio por user-agent,
// então isto reaproveita caminho já testado em vez de abrir um segundo.
function buscar(url) {
  return execFileSync('curl', ['-sSL', '-A', UA, url], { maxBuffer: 64 * 1024 * 1024 });
}

const indiceHtml = buscar(INDICE).toString('utf8');

// Os links do índice vêm na MESMA ORDEM da numeração das súmulas — é essa
// posição, não o ID interno do link, que dá o número real. Ver o comentário
// de `sumula-vinculante-parse.js` para o porquê.
const links = [...new Set(
  [...indiceHtml.matchAll(/href="([^"]*sumariosumulas\.asp\?base=26&(?:amp;)?sumula=\d+)"/g)]
    .map((m) => m[1].replace(/&amp;/g, '&'))
)];

if (!links.length) {
  console.error('COLETAR_SUMULAS_VINCULANTES ✖ nenhum link reconhecido no índice — a página mudou de formato');
  process.exit(1);
}

const dir = join(raiz, 'acervo', 'sumulas', 'STF-VINCULANTE');
const dirNovo = `${dir}.novo`;
if (!seco) {
  if (existsSync(dirNovo)) rmSync(dirNovo, { recursive: true, force: true });
  mkdirSync(dirNovo, { recursive: true });
}

let ok = 0;
let canceladas = 0;
const falhas = [];

for (const [indice, link] of links.entries()) {
  const numero = String(indice + 1);
  try {
    const html = buscar(`https://portal.stf.jus.br/jurisprudencia/${link}`);
    const texto = htmlParaTexto(html);
    const sv = fatiarSumulaVinculante(texto, { numeroPorPosicao: numero });
    if (sv.cancelada) canceladas += 1;

    if (!seco) {
      const secoes = [
        `# Súmula Vinculante ${sv.numero} do STF${sv.cancelada ? ' (cancelada)' : ''}`,
        '',
        '## Enunciado',
        '',
        ...sv.enunciado.split('\n').map((l) => `> ${l}`.trimEnd()),
        '',
      ];
      if (sv.precedente) secoes.push('## Precedente representativo', '', sv.precedente, '');
      if (sv.teses) secoes.push('## Teses de repercussão geral relacionadas', '', sv.teses, '');

      const frontmatter = [
        '---',
        `id: "stf-sv-${sv.numero}"`,
        'tipo: sumula',
        'subtipo: sumula_vinculante',
        'tribunal: "STF"',
        `sumula_vinculante: "${sv.numero}"`,
        `cancelada: ${sv.cancelada}`,
        `fonte_url: "https://portal.stf.jus.br/jurisprudencia/${link}"`,
        'confianca: VERIFIED_OFFICIAL',
        'revisao_humana: false',
        '---',
        '',
      ].join('\n');

      writeFileSync(join(dirNovo, `stf-sv-${sv.numero}.md`), `${frontmatter}${secoes.join('\n')}`, 'utf8');
    }
    ok += 1;
  } catch (erro) {
    falhas.push({ numero, motivo: erro.message });
  }
}

// Encolher em relação ao que já está gravado indica fonte degradada, não
// súmula cancelada em massa — cancelamento mantém o arquivo, com a marca.
const jaTinha = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.md')).length : 0;
if (jaTinha && ok < jaTinha * 0.9) {
  console.error(`COLETAR_SUMULAS_VINCULANTES ✖ encolheu: ${jaTinha} no disco, ${ok} coletadas — não gravado`);
  if (!seco) rmSync(dirNovo, { recursive: true, force: true });
  process.exit(1);
}

if (!seco) {
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  renameSync(dirNovo, dir);
}

console.log(`COLETAR_SUMULAS_VINCULANTES ${seco ? '(dry-run) ' : ''}${ok}/${links.length} súmulas vinculantes (${canceladas} canceladas)`);
if (falhas.length) {
  console.log(`  ${falhas.length} falharam:`);
  falhas.forEach((f) => console.log(`    SV ${f.numero}: ${f.motivo}`));
}
process.exit(falhas.length ? 1 : 0);
