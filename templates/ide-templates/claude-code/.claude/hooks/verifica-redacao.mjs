#!/usr/bin/env node
/**
 * Redação Gate — sentinela determinística contra peça RASA.
 *
 * Irmão do Citation Gate, e complementar a ele: aquele bloqueia citação pendente
 * e inventada; este bloqueia o esqueleto bem formatado que não tem os fatos do
 * caso dentro. `skills:` no squad.yaml é declaração, e o `check-squad` confere
 * que a skill existe — mas existir não é ter sido lida nem aplicada.
 *
 * FAZ (fail-closed no escopo):
 * - identifica artefatos jurídicos finais em squads/<squad>/output/;
 * - ANCORAGEM: a peça cita os identificadores do caso (nº, data, valor, sigla)?
 * - COBERTURA: contempla o "Contrato de saída" que a skill declara?
 * - ANDAIME: template do pipeline vazou para a entrega?
 *
 * NÃO FAZ:
 * - não julga mérito, estilo nem correção jurídica;
 * - não substitui o revisor isolado nem a revisão humana;
 * - não exige hash dos SKILL.md como "prova de leitura" — hash de arquivo se
 *   produz rodando um script, sem nenhum modelo ter lido nada.
 *
 * A DECISÃO mora em `src/redacao-gate.js`, testada. Este arquivo é casca: lê o
 * disco, monta o contexto e reporta. Se não conseguir carregar o módulo, BLOQUEIA
 * — gate que vira no-op em silêncio é pior que gate nenhum, porque passa a
 * sensação de que existe proteção.
 */
import { basename, dirname, isAbsolute, join, normalize, resolve } from 'node:path';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const EXIT_BLOCKED = 2;
const SUPPORTED_EXT = /\.(?:md|txt|rtf)$/i;
const MANIFEST_SUFFIX = /\.(?:citation|redacao)-gate\.json$/i;
const LEGAL_NAME = /(?:^|[-_.])(?:peti[çc][ãa]o|peticao|pe[çc]a|peca|recurso|apela[çc][ãa]o|apelacao|agravo|habeas[-_]?corpus|hc|resposta[-_]?acusa[çc][ãa]o|memoriais|alega[çc][õo]es|contrarraz[õo]es|raz[õo]es|queixa[-_]?crime|den[úu]ncia|notifica[çc][ãa]o|parecer|contrato|acordo)(?:[-_.]|$)/i;
const FINAL_NAME = /(?:^|[-_.])final(?:[-_.]|$)/i;
const DRAFT_NAME = /(?:^|[-_.])(?:minuta|rascunho|draft|intern[oa])(?:[-_.]|$)/i;
const INTERNAL_NAME = /^(?:revis[ãa]o|aprova[çc][ãa]o|checklist|relat[óo]rio|pesquisa|resumo|diagn[óo]stico|fatos|teses|estrat[ée]gia|intake)(?:[-_.]|$)/i;

function p(value = '') {
  return String(value).replace(/\\/g, '/');
}

function block(message) {
  process.stderr.write(`REDAÇÃO GATE — BLOQUEADO: ${message}\n`);
  process.exit(EXIT_BLOCKED);
}

/** `squads/<code>/output/...` → a raiz do projeto e o code do squad. */
function contexto(filePath) {
  const m = p(filePath).match(/^(.*?)\/squads\/([^/]+)\/output\//i);
  return m ? { raiz: m[1] || '.', squad: m[2] } : null;
}

function ehArtefatoFinal(filePath, texto) {
  const nome = basename(p(filePath));
  if (MANIFEST_SUFFIX.test(nome) || !SUPPORTED_EXT.test(nome)) return false;
  if (nome.startsWith('_') || nome.startsWith('.')) return false;
  if (DRAFT_NAME.test(nome) || INTERNAL_NAME.test(nome)) return false;
  return /\/output\/final\//i.test(p(filePath)) || FINAL_NAME.test(nome) || LEGAL_NAME.test(nome)
    || /<!--\s*LEGALSQUAD:REDACAO-GATE:FINAL\s*-->/i.test(texto);
}

/** O material do caso: os demais artefatos que o pipeline já produziu. */
function entradaDoCaso(outputDir, alvo) {
  if (!existsSync(outputDir)) return '';
  return readdirSync(outputDir)
    .filter((f) => SUPPORTED_EXT.test(f) && !MANIFEST_SUFFIX.test(f) && join(outputDir, f) !== alvo)
    .map((f) => { try { return readFileSync(join(outputDir, f), 'utf8'); } catch { return ''; } })
    .join('\n');
}

/** Ids em `skills:` — lista de bloco (squad.yaml) ou inline (frontmatter). */
function skillsDeclaradas(texto) {
  const inline = texto.match(/^\s*skills:\s*\[([^\]]*)\]\s*$/m);
  if (inline) return inline[1].split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  const bloco = texto.match(/^skills:\s*\n((?:\s+-\s+.+\n?)+)/m);
  if (!bloco) return [];
  return bloco[1].split('\n')
    .map((l) => l.match(/^\s*-\s+(.+?)\s*$/)?.[1]).filter(Boolean)
    .map((s) => s.replace(/^["']|["']$/g, ''));
}

function contratosDasSkills(raiz, squadDir) {
  const ids = new Set();
  const fontes = [join(squadDir, 'squad.yaml')];
  const agentsDir = join(squadDir, 'agents');
  if (existsSync(agentsDir)) {
    for (const f of readdirSync(agentsDir).filter((x) => x.endsWith('.md'))) fontes.push(join(agentsDir, f));
  }
  for (const arquivo of fontes) {
    if (!existsSync(arquivo)) continue;
    for (const id of skillsDeclaradas(readFileSync(arquivo, 'utf8'))) ids.add(id);
  }

  const contratos = [];
  for (const id of ids) {
    const caminho = join(raiz, 'skills', id, 'references', 'high-performance-contract.md');
    if (existsSync(caminho)) {
      try { contratos.push(readFileSync(caminho, 'utf8')); } catch { /* ilegível vira ausente */ }
    }
  }
  return contratos;
}

async function carregarAvaliador() {
  for (const alvo of ['legalsquad/src/redacao-gate.js', new URL('../../src/redacao-gate.js', import.meta.url).href]) {
    try {
      return (await import(alvo)).avaliarRedacao;
    } catch { /* tenta o próximo */ }
  }
  // Fail-closed. Um gate que não consegue carregar a própria lógica e mesmo assim
  // deixa passar é pior que gate nenhum: dá a sensação de proteção que não existe.
  block('não consegui carregar src/redacao-gate.js — o gate não roda desarmado');
}

/**
 * Avalia um arquivo, SEM a heurística de "é artefato final?". Usado tanto pelo
 * modo passivo (que aplica a heurística por cima) quanto pelo `--json` — o
 * runner que chama `--json` já sabe que este é o output do step de redação; a
 * heurística de nome existe só para escopar o hook automático, que dispara sem
 * ninguém ter dito "isto é uma peça".
 *
 * Devolve `null` quando não há como avaliar (fora de squads/*​/output/, ou
 * ilegível) — distinto de `{ok: true}` ou `{ok: false}`.
 */
async function avaliarArquivo(filePath) {
  const ctx = contexto(filePath);
  if (!ctx) return null;

  let texto = '';
  try { texto = readFileSync(filePath, 'utf8'); } catch { return null; }

  const squadDir = join(ctx.raiz, 'squads', ctx.squad);
  const avaliarRedacao = await carregarAvaliador();
  return avaliarRedacao({
    artefato: texto,
    entrada: entradaDoCaso(dirname(filePath), filePath),
    contratos: contratosDasSkills(ctx.raiz, squadDir),
  });
}

/** Modo PASSIVO (PostToolUse) — só age sobre o que parece artefato final. */
async function rodar(filePath) {
  const alvo = normalize(filePath);
  let texto = '';
  try { texto = readFileSync(alvo, 'utf8'); } catch { return; }
  if (!contexto(alvo) || !ehArtefatoFinal(alvo, texto)) return;

  const veredito = await avaliarArquivo(alvo);
  if (!veredito) return;
  if (!veredito.ok) block(`${basename(alvo)}\n  · ${veredito.problemas.join('\n  · ')}`);
  for (const aviso of veredito.problemas) process.stderr.write(`REDAÇÃO GATE — aviso: ${aviso}\n`);
}

const checkIndex = process.argv.indexOf('--check');
if (checkIndex >= 0) {
  const pedido = process.argv[checkIndex + 1];
  if (!pedido) block('uso: verifica-redacao.mjs --check <artefato> [--json]');
  const alvo = isAbsolute(pedido) ? normalize(pedido) : normalize(resolve(pedido));

  if (process.argv.includes('--json')) {
    // Consulta, não enforcement. O runner usa isto para saber COMO está a
    // minuta e decidir REJECT/ADVANCE dentro do loop de revisão — nunca sai
    // com erro aqui, mesmo reprovado: quem decide o que fazer é quem chamou.
    const veredito = await avaliarArquivo(alvo);
    process.stdout.write(JSON.stringify(veredito ?? { ok: null, problemas: ['fora de squads/*/output/ ou ilegível'], sinais: {} }));
    process.exit(0);
  }

  await rodar(alvo);
  process.exit(0);
}

let raw = '';
try { raw = readFileSync(0, 'utf8'); } catch { process.exit(0); }
let entrada = {};
try { entrada = JSON.parse(raw); } catch { process.exit(0); }
const caminho = (entrada.tool_input || {}).file_path || (entrada.tool_input || {}).path || '';
if (!caminho) process.exit(0);
await rodar(normalize(caminho));
process.exit(0);
