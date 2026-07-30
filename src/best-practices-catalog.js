// Parser estruturado de `_catalog.yaml` — o índice de descoberta que o
// Arquiteto lê em `_legalsquad/core/best-practices/` (SPEC §6.2.1).
//
// Existia até aqui um `parseBestPracticeIds` em skill-catalog.js que só
// extraía ids (suficiente pra validar alvo de canonicalização). Cinco arquivos
// de prompt, porém, instruem repetidamente a ler "as best-practices que o
// `_catalog.yaml` marcar como obrigatórias" — e não havia campo nenhum no
// schema pra essa obrigatoriedade viver; era promessa em prosa. `obrigatoria`
// é o campo real; este módulo é a única leitura de `_catalog.yaml`, reusada
// por quem precisa dela (canonicalização, empacotamento, busca, squad-check).
//
// Sem dependência de lib YAML, mas SEM assumir formato próprio: ao contrário
// de pipeline.yaml/squad.yaml (que o motor gera), `_catalog.yaml` é AUTORADO
// PELO CURADOR fora deste repositório (CLAUDE.md) — indentação e encoding não
// têm garantia nenhuma. Por isso a indentação é tolerante (`\s+`, não um
// número fixo de espaços) e o BOM é removido antes de qualquer match, mesma
// razão de `frontmatter.js:extractFrontMatter`: sem isso, um arquivo salvo no
// Notepad/Word perde o catálogo INTEIRO em silêncio — indistinguível de "área
// não instalada", que é a confusão que este motor promete nunca cometer.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function semAspas(valor) {
  return String(valor || '').trim().replace(/^["']|["']$/g, '');
}

function campo(bloco, chave) {
  return bloco.match(new RegExp(`^\\s+${chave}:\\s*(.*)$`, 'm'))?.[1];
}

/** Corta `catalog:` em um bloco por entrada — cada um começa em `- id: ...`, indentação livre. */
function blocosDeEntrada(raw) {
  const secao = raw.match(/^catalog:\s*\n([\s\S]*)$/m);
  if (!secao) return [];
  const corpo = secao[1];
  const inicios = [...corpo.matchAll(/^\s+- id:.*$/gm)].map((m) => m.index);
  return inicios.map((inicio, i) => corpo.slice(inicio, inicios[i + 1] ?? undefined));
}

function parseEntrada(bloco) {
  // `semAspas` aqui é o que evita `"redacao"` (aspeamento natural, já que todo
  // campo vizinho no bloco é aspeado) virar um id literal com aspas dentro —
  // o que quebraria silenciosamente `bestPractices.has(target)` em
  // `validateCanonicalization` (skill-catalog.js).
  const id = semAspas(bloco.match(/^\s+- id:\s*(\S+)\s*$/m)?.[1]);
  if (!id) return null;
  return {
    id,
    name: semAspas(campo(bloco, 'name')) || id,
    whenToUse: semAspas(campo(bloco, 'whenToUse')),
    file: semAspas(campo(bloco, 'file')) || `${id}.md`,
    // Palavra virando dado: até esta mudança, "obrigatória" só existia em
    // prosa nos prompts do Arquiteto. Ausente no YAML = false, nunca throw.
    obrigatoria: semAspas(campo(bloco, 'obrigatoria')) === 'true',
  };
}

/**
 * Núcleo PURO: texto já em mãos → registros. Sem isso, quem já tem o conteúdo
 * lido (o empacotador, que opera sobre entidades em memória, nunca sobre
 * disco) precisaria escrever o arquivo só pra poder parseá-lo.
 */
const BOM = String.fromCharCode(0xfeff);

export function parseBestPracticesCatalogText(raw) {
  // Mesma nota de frontmatter.js:extractFrontMatter — sem strip de BOM, um
  // `_catalog.yaml` salvo no Notepad/Word perde o catálogo inteiro em
  // silêncio.
  const semBom = String(raw || '').replace(new RegExp(`^${BOM}`), '');
  return blocosDeEntrada(semBom).map(parseEntrada).filter(Boolean);
}

/**
 * Lê `_catalog.yaml` do disco. Ausente → `[]` (degradação graciosa — área não
 * instalada é estado normal deste motor, nunca erro).
 */
export function parseBestPracticesCatalog(catalogPath) {
  if (!catalogPath || !existsSync(catalogPath)) return [];
  return parseBestPracticesCatalogText(readFileSync(catalogPath, 'utf8'));
}

/** Caminho de INSTALAÇÃO do catálogo (§6.2.1) — nunca o de autoria. */
export function defaultBestPracticesCatalogPath(rootDir) {
  return join(rootDir, '_legalsquad', 'core', 'best-practices', '_catalog.yaml');
}
