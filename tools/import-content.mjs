#!/usr/bin/env node
// Converte um export JSONL numa árvore de conteúdo pronta para o `build-area`.
//
//   node tools/import-content.mjs <export.jsonl> --out <dir> --area <slug> \
//        --risk r3 --delivery advisory --origem "revisado por Fulano em ..."
//
// Genérico quanto à ORIGEM: lê o schema documentado em `src/content-import.js` e
// não conhece de que biblioteca os registros vieram.
//
// RECUSA converter sem `--risk` e `--delivery` declarados. Esses dois campos
// governam os gates fail-closed e nenhum export de biblioteca os traz; deduzi-los
// de texto livre seria fabricar metadata de segurança plausível.

import { createReadStream, mkdirSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { converterRegistro } from '../src/content-import.js';

const USO = `Uso:
  node tools/import-content.mjs <export.jsonl> --out <dir> [opções]

Opcionais:
  --area <slug>              converte só os registros desta área
  --tipo <content_type>      converte só este content_type (padrão: skill)
  --origem "<texto>"         proveniência gravada em cada SKILL.md
  --limite <n>               para depois de n registros (piloto)

Override de curadoria — use SÓ se conhecer o instituto:
  --risk <r1|r2|r3|r4>       SUPRIME a classificação de risco do motor
  --delivery <tipo>          SUPRIME a derivação de delivery_type

  Sem estes, os campos saem AUSENTES e o \`contract-skills\` classifica pela
  função da skill. É o caminho recomendado: declaração explícita vence a
  inferência, então um default de lote silencia o motor. Medido em 4521 skills:
  \`--risk r3\` rebaixou 1489 que o motor classificaria como r4.
`;

function falhar(mensagem) {
  console.error(`import-content: ${mensagem}\n\n${USO}`);
  process.exit(1);
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: 'string' },
    area: { type: 'string' },
    tipo: { type: 'string' },
    risk: { type: 'string' },
    delivery: { type: 'string' },
    origem: { type: 'string' },
    limite: { type: 'string' },
  },
});

const [entrada] = positionals;
if (!entrada) falhar('informe o arquivo JSONL de entrada');
if (!values.out) falhar('--out é obrigatório');

const defaults = { risk_level: values.risk, delivery_type: values.delivery, origem: values.origem };
const tipoAlvo = values.tipo || 'skill';
const limite = values.limite ? Number.parseInt(values.limite, 10) : Infinity;

const rl = createInterface({ input: createReadStream(entrada), crlfDelay: Infinity });
let lidos = 0;
let escritos = 0;
const recusados = [];
const vistos = new Set();

for await (const linha of rl) {
  if (!linha.trim() || escritos >= limite) continue;

  let registro;
  try {
    registro = JSON.parse(linha);
  } catch (erro) {
    recusados.push(`linha ${lidos + 1}: JSON inválido — ${erro.message}`);
    continue;
  }
  lidos++;

  if (values.area && registro.area !== values.area) continue;
  if (registro.content_type !== tipoAlvo) continue;

  // Slug repetido produziria duas skills no mesmo caminho — o `build-area` já
  // recusa isso, mas descobrir aqui é mais barato que descobrir no empacotamento.
  if (vistos.has(registro.slug)) {
    recusados.push(`slug repetido: ${registro.slug}`);
    continue;
  }

  try {
    const { path, conteudo } = converterRegistro(registro, defaults);
    const alvo = join(values.out, path);
    mkdirSync(dirname(alvo), { recursive: true });
    writeFileSync(alvo, conteudo);
    vistos.add(registro.slug);
    escritos++;
  } catch (erro) {
    recusados.push(`${registro.slug || '(sem slug)'}: ${erro.message}`);
  }
}

console.log(`import-content: ${escritos} skills escritas em ${values.out}`);
console.log(`  lidos: ${lidos} · filtro: area=${values.area || 'todas'} tipo=${tipoAlvo}`);
if (values.risk || values.delivery) {
  console.log(
    `  ATENÇÃO: risk_level="${values.risk || '(motor)'}" delivery_type="${values.delivery || '(motor)'}" ` +
      '— override de lote SUPRIME a classificação do motor. Rode sem as flags se não conhece o instituto.'
  );
} else {
  console.log('  risk_level/delivery_type/quality_profile em aberto — `contract-skills` classifica por função.');
}

if (recusados.length) {
  console.log(`\n  ${recusados.length} recusado(s):`);
  for (const motivo of recusados.slice(0, 10)) console.log(`    · ${motivo}`);
  if (recusados.length > 10) console.log(`    … e mais ${recusados.length - 10}`);
}
