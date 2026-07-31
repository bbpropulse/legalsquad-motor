#!/usr/bin/env node
// Separa o protocolo repetido das skills de uma área e o promove a
// best-practice, deixando cada `SKILL.md` só com a matéria.
//
//   node tools/extrair-molde.mjs <diretorio-de-conteudo> --out <dir> [--corte N] [--aplicar]
//
// **Genérico e cego**, como o `build-area`: recebe o diretório por argumento e
// nunca conhece caminho de repositório. **Lê a origem e jamais escreve nela** —
// a saída vai para `--out`, o que torna o antes/depois comparável e a operação
// reversível por construção.
//
// Sem `--aplicar` é dry-run: mede e relata, não escreve nada.

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, cpSync, rmSync } from 'node:fs';
import { join, basename } from 'node:path';
import { identificarMolde, montarProtocolo, separarMolde, CORTE_MOLDE_PADRAO } from '../src/molde-extract.js';

function parseArgs(argv) {
  const posicionais = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) { posicionais.push(arg); continue; }
    const [chave, colado] = arg.slice(2).split('=');
    if (colado !== undefined) flags[chave] = colado;
    else if (argv[i + 1] && !argv[i + 1].startsWith('--')) flags[chave] = argv[++i];
    else flags[chave] = true;
  }
  return { posicionais, flags };
}

function falhar(mensagem) {
  console.error(`EXTRAIR_MOLDE:ERRO — ${mensagem}`);
  process.exit(1);
}

function lerAreaId(origem) {
  const packs = join(origem, '_packs.yaml');
  if (!existsSync(packs)) return basename(origem);
  const m = readFileSync(packs, 'utf8').match(/^area_id:\s*(.+)$/m);
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : basename(origem);
}

function tituloDe(texto) {
  return (texto.match(/^#\s+(.+)$/m) || [])[1] || '';
}

const { posicionais, flags } = parseArgs(process.argv.slice(2));
const origem = posicionais[0];
if (!origem) falhar('informe o diretório de conteúdo: extrair-molde.mjs <dir> --out <dir>');
if (!existsSync(join(origem, 'skills'))) falhar(`${origem} não tem skills/`);

const corte = flags.corte === undefined ? CORTE_MOLDE_PADRAO : Number(flags.corte);
const aplicar = flags.aplicar === true;
const destino = flags.out;
if (aplicar && !destino) falhar('--aplicar exige --out <dir> (a origem nunca é modificada)');
if (destino && destino === origem) falhar('--out não pode ser a própria origem (invariante read-only)');

const areaId = lerAreaId(origem);
const skillsDir = join(origem, 'skills');
const ids = readdirSync(skillsDir).filter((d) => existsSync(join(skillsDir, d, 'SKILL.md')));
if (!ids.length) falhar(`${skillsDir} não tem nenhuma SKILL.md`);

const corpus = ids.map((id) => {
  const texto = readFileSync(join(skillsDir, id, 'SKILL.md'), 'utf8');
  return { id, titulo: tituloDe(texto), texto };
});

const linhasDeMolde = identificarMolde(corpus, { corte });
const protocoloId = `protocolo-operacional-${areaId}`;
const remissao = `\`${protocoloId}\` — o protocolo desta área (leitura obrigatória; não repetido aqui).`;

// O protocolo canônico é a UNIÃO ordenada do que saiu, na ordem em que
// aparece na skill mais completa: preserva a sequência que o autor deu ao
// fluxo em vez de embaralhar as linhas por frequência.
const protocoloTexto = montarProtocolo(corpus, linhasDeMolde);
const ordemCanonica = protocoloTexto ? protocoloTexto.split('\n') : [];

const resultados = corpus.map((skill) => {
  const r = separarMolde(skill.texto, { ...skill, linhasDeMolde, remissao });
  return {
    id: skill.id,
    antes: skill.texto.split('\n').length,
    depois: r.materia.split('\n').length,
    materia: r.materia,
  };
});

const antes = resultados.reduce((s, r) => s + r.antes, 0);
const depois = resultados.reduce((s, r) => s + r.depois, 0);
const mediana = [...resultados].sort((a, b) => a.depois - b.depois)[Math.floor(resultados.length / 2)];

console.log(`EXTRAIR_MOLDE:${areaId}`);
console.log(`  skills:            ${resultados.length}`);
console.log(`  corte:             ≥${corte} skills distintas`);
console.log(`  linhas de molde:   ${linhasDeMolde.size} distintas`);
console.log(`  protocolo:         ${ordemCanonica.length} linhas`);
console.log(`  corpus:            ${antes} → ${depois} linhas (${(antes / Math.max(depois, 1)).toFixed(1)}× menor)`);
console.log(`  mediana por skill: ${mediana.antes} → ${mediana.depois} linhas`);
const ocas = resultados.filter((r) => r.depois < 25).length;
console.log(`  ficam com <25 linhas: ${ocas} (${((ocas / resultados.length) * 100).toFixed(0)}%) — lacuna revelada, não criada`);

if (!aplicar) {
  console.log('\n  (dry-run — nada foi escrito; use --aplicar --out <dir>)');
  process.exit(0);
}

if (existsSync(destino)) rmSync(destino, { recursive: true, force: true });
mkdirSync(destino, { recursive: true });

// Copia a árvore inteira e depois sobrescreve só as SKILL.md — assim nada do
// que a área traz (squads, references, _packs.yaml) se perde por omissão.
cpSync(origem, destino, { recursive: true });

for (const r of resultados) writeFileSync(join(destino, 'skills', r.id, 'SKILL.md'), r.materia, 'utf8');

const bpDir = join(destino, 'core', 'best-practices');
mkdirSync(bpDir, { recursive: true });
writeFileSync(
  join(bpDir, `${protocoloId}.md`),
  [
    '---',
    `name: ${protocoloId}`,
    `description: Protocolo operacional comum às skills de ${areaId} — extraído do corpo das skills, onde estava repetido.`,
    '---',
    '',
    `# Protocolo operacional — ${areaId}`,
    '',
    `Este documento reúne o protocolo que estava repetido no corpo de ${resultados.length} skills`,
    `de ${areaId}. Cada skill agora carrega apenas a sua matéria e remete a este arquivo.`,
    '',
    ...ordemCanonica,
    '',
  ].join('\n'),
  'utf8'
);

const catalogo = join(bpDir, '_catalog.yaml');
const entrada = [
  `  - id: ${protocoloId}`,
  `    name: "Protocolo Operacional — ${areaId}"`,
  `    whenToUse: "Criar agentes que executam qualquer skill de ${areaId}: fluxo, gates, disciplina factual e formato de entrega."`,
  `    file: ${protocoloId}.md`,
  '    obrigatoria: true',
].join('\n');
writeFileSync(
  catalogo,
  existsSync(catalogo)
    ? `${readFileSync(catalogo, 'utf8').trimEnd()}\n\n${entrada}\n`
    : `---\n# Catálogo de best-practices — ${areaId}\n\ncatalog:\n${entrada}\n`,
  'utf8'
);

console.log(`\n  escrito em ${destino}`);
console.log(`  best-practice: core/best-practices/${protocoloId}.md (obrigatória)`);
