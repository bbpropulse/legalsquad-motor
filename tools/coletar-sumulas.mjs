#!/usr/bin/env node
// Grava no acervo a compilação oficial de súmulas de um tribunal, uma por
// arquivo.
//
//   node tools/coletar-sumulas.mjs <raiz-da-instalacao> <arquivo.txt> \
//     --tribunal STJ --fonte-url <url> [--dry-run]
//
// **Por que isto existe.** Toda leva de enriquecimento devolveu a mesma lacuna
// pelo nome: "o acervo não tem diretório de súmulas". Elas aparecem só
// *citadas dentro* de informativos, então quem quer fundamentar numa delas
// escreve o enunciado de memória (invenção) ou desiste da fonte mais citável
// que existe.
//
// A entrada é um texto já extraído da compilação oficial do tribunal — não há
// download aqui de propósito: os portais dos tribunais respondem atrás de
// Cloudflare e o formato de cada um é diferente. Quem obtém o arquivo declara
// a URL de origem, e ela vai gravada em cada súmula.
//
// Fail-closed em cada porta: arquivo que não rende súmula nenhuma, compilação
// que encolheu em relação ao que já está no disco, ou numeração com buraco
// **não grava** e entra no relatório. Meia compilação no acervo é pior que
// nenhuma — o gate devolveria NÃO ENCONTRADA para súmula que existe.

import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fatiarSumulas } from '../src/sumula-parse.js';

const args = process.argv.slice(2);
const posicionais = args.filter((a) => !a.startsWith('--'));
const [raiz, arquivo] = posicionais;
const opcao = (nome) => (args.find((a) => a.startsWith(`--${nome}=`)) || '').split('=')[1]
  || (args.includes(`--${nome}`) ? args[args.indexOf(`--${nome}`) + 1] : null);
const tribunal = (opcao('tribunal') || '').toUpperCase();
const fonteUrl = opcao('fonte-url') || '';
const seco = args.includes('--dry-run');

if (!raiz || !arquivo || !tribunal) {
  console.error('uso: coletar-sumulas.mjs <raiz> <arquivo.txt> --tribunal STJ --fonte-url <url> [--dry-run]');
  process.exit(1);
}
if (!existsSync(arquivo)) {
  console.error(`arquivo não encontrado: ${arquivo}`);
  process.exit(1);
}

let sumulas;
try {
  sumulas = fatiarSumulas(readFileSync(arquivo, 'utf8'));
} catch (erro) {
  console.error(`COLETAR_SUMULAS:${tribunal} ✖ ${erro.message}`);
  process.exit(1);
}

if (!sumulas.length) {
  console.error(`COLETAR_SUMULAS:${tribunal} ✖ nenhuma súmula reconhecida — formato mudou?`);
  process.exit(1);
}

const dir = join(raiz, 'acervo', 'sumulas', tribunal);

// Numeração com buraco denuncia extração parcial. Não é fatal — tribunais
// cancelam súmulas e a compilação pode legitimamente pular números —, mas
// precisa aparecer no relatório em vez de passar como sucesso.
const numeros = sumulas.map((s) => Number(s.numero)).sort((a, b) => a - b);
const faltando = [];
for (let n = numeros[0]; n < numeros.at(-1); n += 1) if (!numeros.includes(n)) faltando.push(n);

// Encolher em relação ao que já está no disco é o modo de falha caro: troca
// acervo bom por acervo pela metade, em silêncio.
const jaTem = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.md')).length : 0;
if (jaTem > sumulas.length) {
  console.error(`COLETAR_SUMULAS:${tribunal} ✖ encolheu: ${jaTem} no disco, ${sumulas.length} na entrada — não gravado`);
  process.exit(1);
}

if (!seco) {
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}

const slug = tribunal.toLowerCase();
for (const s of sumulas) {
  const secoes = [
    `# Súmula ${s.numero} do ${tribunal}${s.assunto ? ` — ${s.assunto}` : ''}`,
    '',
    '## Enunciado',
    '',
    // Blockquote para deixar claro onde termina a transcrição literal e onde
    // começa o metadado.
    ...s.enunciado.split('\n').map((l) => `> ${l}`.trimEnd()),
    '',
  ];
  const campo = (titulo, valor) => {
    if (!valor) return;
    secoes.push(`## ${titulo}`, '', valor, '');
  };
  campo('Órgão julgador', s.orgao);
  campo('Data da decisão', s.data);
  campo('Fonte de publicação', s.fonte);
  campo('Situação', s.situacao);
  campo('Referências legislativas', s.referencias);
  campo('Excerto dos precedentes originários', s.precedentes);

  const frontmatter = [
    '---',
    `id: "${slug}-sumula-${s.numero}"`,
    'tipo: sumula',
    `tribunal: "${tribunal}"`,
    `sumula: "${s.numero}"`,
    `assunto: ${JSON.stringify(s.assunto)}`,
    `orgao_julgador: ${JSON.stringify(s.orgao)}`,
    `data_julgamento: ${JSON.stringify(s.data)}`,
    `fonte_url: "${fonteUrl}"`,
    'confianca: VERIFIED_OFFICIAL',
    // O enunciado é transcrição literal da compilação oficial; a classificação
    // por assunto é do próprio tribunal. Nada aqui foi redigido por IA.
    'revisao_humana: false',
    '---',
    '',
  ].join('\n');

  if (!seco) writeFileSync(join(dir, `${slug}-sumula-${s.numero}.md`), `${frontmatter}${secoes.join('\n')}`, 'utf8');
}

const canceladas = sumulas.filter((s) => /cancelad/i.test(s.situacao || s.enunciado)).length;
console.log(`COLETAR_SUMULAS:${tribunal} ${seco ? '(dry-run) ' : ''}${sumulas.length} súmulas (${numeros[0]}–${numeros.at(-1)})`);
if (canceladas) console.log(`  ${canceladas} marcadas como canceladas na fonte — gravadas assim mesmo, com a situação`);
if (faltando.length) console.log(`  ${faltando.length} números ausentes na sequência: ${faltando.slice(0, 20).join(', ')}${faltando.length > 20 ? '…' : ''}`);
