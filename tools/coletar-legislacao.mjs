#!/usr/bin/env node
// Baixa legislação federal da fonte oficial e a grava no acervo, por artigo.
//
//   node tools/coletar-legislacao.mjs <raiz-da-instalacao> [--only SIGLA] [--dry-run]
//
// **Por que isto existe.** No piloto de enriquecimento, o agente tentou abrir
// dispositivos no Planalto, levou ECONNRESET e escreveu o conteúdo mesmo assim
// — texto de lei inventado. A causa raiz não era instabilidade da fonte: o
// Planalto **recusa requisição sem user-agent de navegador**. Enquanto a lei
// depender de rede no instante da redação, toda falha de rede vira invenção.
//
// Com a lei no acervo, o gate de citação passa a ter contra o que resolver — e
// a busca continua local, sem consulta saindo da máquina.
//
// Fail-closed em cada porta: download que não vem 200, página que não rende
// nenhum artigo, ou lei que encolheu em relação ao que já está no disco **não
// grava** e entra no relatório. Meia lei no acervo é pior que lei nenhuma:
// o verificador devolveria NÃO ENCONTRADA para dispositivo que existe.

import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { htmlParaTexto, fatiarArtigos } from '../src/legislacao-parse.js';

// O bloqueio é por user-agent. Sem isto, todo download falha com ECONNRESET.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const BASE = 'https://www.planalto.gov.br/ccivil_03/';

const LEIS = [
  { sigla: 'CF', nome: 'Constituição Federal de 1988', area: 'constitucional', url: 'constituicao/constituicao.htm' },
  { sigla: 'CC', nome: 'Código Civil — Lei 10.406/2002', area: 'civil', url: 'leis/2002/l10406compilada.htm' },
  { sigla: 'CPC', nome: 'Código de Processo Civil — Lei 13.105/2015', area: 'civil', url: '_ato2015-2018/2015/lei/l13105.htm' },
  { sigla: 'CP', nome: 'Código Penal — Decreto-Lei 2.848/1940', area: 'penal', url: 'decreto-lei/del2848compilado.htm' },
  { sigla: 'CPP', nome: 'Código de Processo Penal — Decreto-Lei 3.689/1941', area: 'penal', url: 'decreto-lei/del3689compilado.htm' },
  { sigla: 'CLT', nome: 'Consolidação das Leis do Trabalho — Decreto-Lei 5.452/1943', area: 'trabalhista', url: 'decreto-lei/del5452compilado.htm' },
  { sigla: 'CDC', nome: 'Código de Defesa do Consumidor — Lei 8.078/1990', area: 'consumidor', url: 'leis/l8078compilado.htm' },
  { sigla: 'CTN', nome: 'Código Tributário Nacional — Lei 5.172/1966', area: 'tributario', url: 'leis/l5172compilado.htm' },
  { sigla: 'CE', nome: 'Código Eleitoral — Lei 4.737/1965', area: 'eleitoral', url: 'leis/l4737compilado.htm' },
  { sigla: 'LC64', nome: 'Lei das Inelegibilidades — LC 64/1990', area: 'eleitoral', url: 'leis/lcp/lcp64.htm' },
  { sigla: 'L9504', nome: 'Lei das Eleições — Lei 9.504/1997', area: 'eleitoral', url: 'leis/l9504.htm' },
  { sigla: 'L12016', nome: 'Lei do Mandado de Segurança — Lei 12.016/2009', area: 'constitucional', url: '_ato2007-2010/2009/lei/l12016.htm' },
  { sigla: 'L8213', nome: 'Planos de Benefícios da Previdência — Lei 8.213/1991', area: 'previdenciario', url: 'leis/l8213cons.htm' },
  { sigla: 'L8112', nome: 'Regime Jurídico dos Servidores — Lei 8.112/1990', area: 'administrativo', url: 'leis/l8112cons.htm' },
  { sigla: 'L14133', nome: 'Lei de Licitações e Contratos — Lei 14.133/2021', area: 'administrativo', url: '_ato2019-2022/2021/lei/L14133.htm' },
  { sigla: 'L9784', nome: 'Processo Administrativo Federal — Lei 9.784/1999', area: 'administrativo', url: 'leis/l9784.htm' },
  { sigla: 'L8429', nome: 'Lei de Improbidade Administrativa — Lei 8.429/1992', area: 'administrativo', url: 'leis/l8429.htm' },
  { sigla: 'L13709', nome: 'Lei Geral de Proteção de Dados — Lei 13.709/2018', area: 'digital', url: '_ato2015-2018/2018/lei/L13709.htm' },
  { sigla: 'L6015', nome: 'Lei de Registros Públicos — Lei 6.015/1973', area: 'imobiliario', url: 'leis/l6015compilada.htm' },
  { sigla: 'L8245', nome: 'Lei do Inquilinato — Lei 8.245/1991', area: 'imobiliario', url: 'leis/l8245.htm' },
  { sigla: 'L7347', nome: 'Lei da Ação Civil Pública — Lei 7.347/1985', area: 'administrativo', url: 'leis/l7347orig.htm' },
  { sigla: 'L9099', nome: 'Juizados Especiais — Lei 9.099/1995', area: 'civil', url: 'leis/l9099.htm' },
];

// Uma lei real tem dezenas de artigos. Um punhado é sinal de que a página veio
// truncada, virou portal de erro, ou mudou de formato — grava nada.
const MINIMO_DE_ARTIGOS = 5;

/**
 * O mínimo absoluto não pega o modo de falha que de fato aconteceu: a Lei
 * 14.133 rendeu **17 artigos de 194** e passou folgado por qualquer piso.
 * O sinal que pega é interno ao documento — quantos "Art." o texto contém
 * versus quantos viraram artigo. Se a página menciona muito mais aberturas do
 * que o parser reconheceu, o formato mudou e o resultado é lixo silencioso.
 */
function aberturasNaoReconhecidas(texto, artigos) {
  const mencoes = (texto.match(/\bArt\./g) || []).length;
  return mencoes > Math.max(artigos.length * 1.5, artigos.length + 20);
}

const args = process.argv.slice(2);
const raiz = args.find((a) => !a.startsWith('--'));
const only = (args.find((a) => a.startsWith('--only=')) || '').split('=')[1]
  || (args.includes('--only') ? args[args.indexOf('--only') + 1] : null);
const dryRun = args.includes('--dry-run');

if (!raiz) {
  console.error('COLETAR_LEGISLACAO:ERRO — informe a raiz da instalação');
  process.exit(1);
}

function yamlEscape(valor) {
  return String(valor).replace(/"/g, '\\"');
}

function frontmatter(campos) {
  return ['---', ...Object.entries(campos).map(([k, v]) => `${k}: ${v}`), '---', ''].join('\n');
}

const alvo = only ? LEIS.filter((l) => l.sigla === only) : LEIS;
if (!alvo.length) {
  console.error(`COLETAR_LEGISLACAO:ERRO — sigla desconhecida: ${only}`);
  process.exit(1);
}

const destinoBase = join(raiz, 'acervo', 'legislacao');
const relatorio = [];

for (const lei of alvo) {
  const url = `${BASE}${lei.url}`;
  let bytes;
  try {
    const resposta = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'pt-BR' } });
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    bytes = Buffer.from(await resposta.arrayBuffer());
  } catch (erro) {
    relatorio.push({ sigla: lei.sigla, ok: false, motivo: erro.message });
    console.log(`  ✖ ${lei.sigla.padEnd(8)} ${erro.message}`);
    continue;
  }

  const texto = htmlParaTexto(bytes);
  const artigos = fatiarArtigos(texto);

  if (artigos.length < MINIMO_DE_ARTIGOS) {
    relatorio.push({ sigla: lei.sigla, ok: false, motivo: `só ${artigos.length} artigos` });
    console.log(`  ✖ ${lei.sigla.padEnd(8)} só ${artigos.length} artigos — não gravado`);
    continue;
  }

  if (aberturasNaoReconhecidas(texto, artigos)) {
    const mencoes = (texto.match(/\bArt\./g) || []).length;
    relatorio.push({ sigla: lei.sigla, ok: false, motivo: `${mencoes} "Art." × ${artigos.length} reconhecidos` });
    console.log(`  ✖ ${lei.sigla.padEnd(8)} ${mencoes} menções a "Art." × ${artigos.length} reconhecidos — formato mudou, não gravado`);
    continue;
  }

  const dir = join(destinoBase, lei.sigla);
  // Encolher em relação ao que já existe indica fonte degradada, não lei
  // revogada — revogação mantém o artigo com a marca "(Revogado)".
  //
  // A contagem anterior vem do frontmatter da coleta passada, NÃO de contar
  // arquivos no diretório: um parser corrigido muda o agrupamento e o disco
  // fica com órfãos da versão antiga. Contando arquivos, o conserto do
  // `Art. 30-A` fez o guard ler 234 arquivos contra 199 artigos e recusar
  // gravar a versão correta — bloqueando justamente a melhoria.
  if (existsSync(dir)) {
    const anterior = existsSync(join(dir, `${lei.sigla}.md`))
      ? Number((readFileSync(join(dir, `${lei.sigla}.md`), 'utf8').match(/^artigos:\s*(\d+)$/m) || [])[1])
      : 0;
    const antes = Number.isFinite(anterior) ? anterior : 0;
    if (antes && artigos.length < antes * 0.9) {
      relatorio.push({ sigla: lei.sigla, ok: false, motivo: `encolheu ${antes}→${artigos.length}` });
      console.log(`  ✖ ${lei.sigla.padEnd(8)} encolheu ${antes}→${artigos.length} — não gravado`);
      continue;
    }
  }

  relatorio.push({ sigla: lei.sigla, ok: true, artigos: artigos.length, bytes: bytes.length });
  console.log(`  ✔ ${lei.sigla.padEnd(8)} ${String(artigos.length).padStart(4)} artigos · ${(bytes.length / 1024).toFixed(0)}KB`);
  if (dryRun) continue;

  // Apaga a coleta anterior antes de regravar. Sem isto, um parser corrigido
  // deixa órfãos da versão antiga convivendo com os novos — foi o que
  // aconteceu ao consertar o `Art. 30-A`: o diretório ficou com 234 arquivos
  // para 199 artigos, e na passada seguinte o guard leu isso como "a lei
  // encolheu" e recusou gravar. Pior que o falso alarme seria o silêncio: um
  // `art-30-b` obsoleto continuaria respondendo à busca com texto de um
  // agrupamento que não existe mais.
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const hash = createHash('sha256').update(bytes).digest('hex');

  writeFileSync(
    join(dir, `${lei.sigla}.md`),
    frontmatter({
      id: `"legislacao-${lei.sigla.toLowerCase()}"`,
      tipo: 'legislacao',
      tema: `"${yamlEscape(lei.nome)}"`,
      sigla: `"${lei.sigla}"`,
      area_primaria: `"${lei.area}"`,
      tags: `[legislacao, ${lei.sigla.toLowerCase()}, ${lei.area}, lei, texto-integral]`,
      fonte_url: `"${url}"`,
      confianca: 'VERIFIED_OFFICIAL',
      hash_conteudo_sha256: `"${hash}"`,
      artigos: artigos.length,
    }) + `\n# ${lei.nome}\n\nTexto integral obtido de ${url}.\n\n${texto}\n`,
    'utf8'
  );

  const ocorrencias = new Map();
  for (const artigo of artigos) {
    // Redação revogada e vigente coexistem no texto compilado: sufixo -b, -c…
    // preserva as duas em vez de a segunda sobrescrever a primeira em silêncio.
    const n = (ocorrencias.get(artigo.numero) || 0) + 1;
    ocorrencias.set(artigo.numero, n);
    const sufixo = n > 1 ? `-${String.fromCharCode(96 + n)}` : '';
    const slug = `${lei.sigla.toLowerCase()}-art-${artigo.numero.toLowerCase()}${sufixo}`;
    writeFileSync(
      join(dir, `${slug}.md`),
      frontmatter({
        id: `"${slug}"`,
        tipo: 'legislacao',
        tema: `"${lei.sigla} art. ${artigo.numero}"`,
        sigla: `"${lei.sigla}"`,
        artigo: `"${artigo.numero}"`,
        area_primaria: `"${lei.area}"`,
        tags: `[legislacao, ${lei.sigla.toLowerCase()}, artigo, art-${artigo.numero.toLowerCase()}, ${lei.area}]`,
        fonte_url: `"${url}"`,
        confianca: 'VERIFIED_OFFICIAL',
      }) + `\n# ${lei.sigla} — Art. ${artigo.numero}\n\n${artigo.texto}\n`,
      'utf8'
    );
  }
}

const ok = relatorio.filter((r) => r.ok);
console.log(`\nCOLETAR_LEGISLACAO:${ok.length}/${relatorio.length} leis · ${ok.reduce((s, r) => s + r.artigos, 0)} artigos`);
for (const falha of relatorio.filter((r) => !r.ok)) console.log(`  falhou: ${falha.sigla} — ${falha.motivo}`);
if (dryRun) console.log('  (dry-run — nada gravado)');
process.exit(ok.length === relatorio.length ? 0 : 1);
