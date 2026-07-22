import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Guarda de ESCALA. O `skills/_index.yaml` cresce O(n) com o número de skills
// da área instalada: medido em ~1 KB por skill, uma área com 2000 skills produz
// um índice de ~2 MB (~530K tokens). Se qualquer prompt do fluxo de criação de
// squad mandar LER O ÍNDICE INTEIRO, isso entra no contexto a cada criação —
// domina o custo com 500 skills e ESTOURA a janela com 1000+. O caminho certo é
// sempre a busca compacta (`search-skills`, teto de 8 resultados); o índice é a
// fonte que a busca lê, nunca conteúdo de prompt.
//
// Este teste prende a regressão: um edit futuro que reintroduza "Leia o índice"
// falha aqui, como o motor irmão descobriu tarde demais (a instrução tinha
// escapado numa linha e derrubava a criação de squad com o catálogo grande).

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Arquivos no caminho de criação de squad — os que o modelo carrega/segue.
const FLUXO_DE_CRIACAO = [
  '_legalsquad/core/architect.agent.yaml',
  '_legalsquad/core/prompts/discovery.prompt.md',
  '_legalsquad/core/prompts/design.prompt.md',
  '_legalsquad/core/prompts/build.prompt.md',
  '_legalsquad/core/prompts/sherlock-shared.md',
  '_legalsquad/core/skills.engine.md',
  '.claude/agents/catalog-scout.md',
  'templates/ide-assets/command-body.md',
];

// Uma menção ao índice é "mitigada" quando a mesma sentença deixa claro que ele
// NÃO vai inteiro ao prompt, ou aponta a busca compacta como o caminho.
const MITIGA = /\b(nunca|n[aã]o|never|not)\b|\bpor inteiro\b|\bin full\b|search-skills|shortlist|compact|fonte (completa|do motor|de verdade)|source|regenera|reindex|indexar-skills|check-skills|aparece em|fresco|stale/i;

// Verbo que, junto do índice na MESMA sentença sem mitigação, é o antipadrão:
// "Leia `skills/_index.yaml`", "Read the index", "Carregue o índice"…
const LEITURA = /\b(leia|read|carregue|load|consulte|abra|open)\b/i;

/** Quebra em "sentenças" por ponto final e por quebra de linha/bullet. */
function sentencas(texto) {
  return texto.split(/(?:\.\s)|\n/).map((s) => s.trim()).filter(Boolean);
}

for (const arquivo of FLUXO_DE_CRIACAO) {
  test(`${arquivo} não manda ler o índice inteiro`, () => {
    const conteudo = readFileSync(join(ROOT, arquivo), 'utf8');

    const violacoes = sentencas(conteudo).filter(
      (s) => /skills\/_index\.yaml/.test(s) && LEITURA.test(s) && !MITIGA.test(s)
    );

    assert.deepEqual(
      violacoes,
      [],
      `${arquivo} instrui ler o índice inteiro (explode com área grande):\n  ` +
        violacoes.join('\n  ') +
        '\n\nUse `search-skills` (shortlist compacta). O índice é a fonte que a busca lê, não conteúdo de prompt.'
    );
  });
}

test('design.prompt.md não lista o índice em "Read these files before starting"', () => {
  const conteudo = readFileSync(join(ROOT, '_legalsquad/core/prompts/design.prompt.md'), 'utf8');
  // Recorta a seção de Context Loading (da chave até a próxima "## ").
  const secao = conteudo.match(/##\s*Context Loading[\s\S]*?(?=\n## )/)?.[0] || '';
  const listaComoLeituraObrigatoria =
    /Read these files before starting[\s\S]*?- `skills\/_index\.yaml`/.test(secao);

  assert.equal(
    listaComoLeituraObrigatoria,
    false,
    'o Design lista `skills/_index.yaml` entre os arquivos a LER antes de começar — ' +
      'com uma área grande, o índice inteiro entra no prompt. Descubra por `search-skills`; ' +
      'referencie o índice só como a fonte que a busca lê.'
  );
});
