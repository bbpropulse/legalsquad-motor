// Guardas de motor: três defeitos medidos em 28/07/2026 num smoke-run real do
// squad de negociação penal. Todos os três eram silenciosos — o pipeline
// "passava" e entregava peça. Prosa não segura nenhum deles; estes testes seguram.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const ler = (...p) => readFileSync(join(RAIZ, ...p), 'utf8');

// O verificador existe em duas cópias: a local (para trabalhar NESTE repo) e a
// que o `init` instala no projeto do usuário. A que importa para o advogado é a
// segunda — e era justamente a que ficava para trás quando só a primeira era editada.
const COPIAS_DO_VERIFICADOR = [
  ['.claude', 'agents', 'verificador-citacoes.md'],
  ['templates', 'ide-templates', 'claude-code', '.claude', 'agents', 'verificador-citacoes.md'],
];

const frontmatter = (texto) => {
  const m = /^---\n([\s\S]*?)\n---/.exec(texto);
  assert.ok(m, 'arquivo sem frontmatter');
  return m[1];
};
const ferramentas = (texto) => {
  const linha = frontmatter(texto).split('\n').find((l) => /^tools:/.test(l));
  assert.ok(linha, 'frontmatter sem a chave tools:');
  return linha.replace(/^tools:/, '').split(',').map((s) => s.trim()).filter(Boolean);
};

for (const caminho of COPIAS_DO_VERIFICADOR) {
  test(`verificador-citacoes consegue abrir fonte oficial (${caminho.join('/')})`, () => {
    const arq = join(RAIZ, ...caminho);
    if (!existsSync(arq)) return; // cópia ausente é problema de empacotamento, coberto em outro teste
    const tools = ferramentas(readFileSync(arq, 'utf8'));

    // O gate anti-alucinação nº 1 declarava `tools: Read, Grep, Glob`. Sem WebFetch
    // ele não abre Planalto/STF/STJ: só confirma o que o próprio repositório já dizia,
    // que é exatamente o viés que a existência dele deveria quebrar. Num smoke-run
    // real devolveu 10 de 15 citações como `acesso_falhou`.
    for (const exigida of ['WebFetch', 'WebSearch']) {
      assert.ok(
        tools.includes(exigida),
        `verificador-citacoes precisa de ${exigida} — sem ela o gate é decorativo (tools atuais: ${tools.join(', ')})`,
      );
    }

    // Continua READ-ONLY: quem audita não altera a peça nem o repositório.
    for (const proibida of ['Write', 'Edit', 'Bash', 'NotebookEdit']) {
      assert.ok(
        !tools.includes(proibida),
        `verificador-citacoes não pode ter ${proibida} — ele audita e relata, nunca escreve`,
      );
    }
  });
}

test('validação de input resolve a MESMA versão em que o output foi gravado', () => {
  const runner = ler('_legalsquad', 'core', 'runner.pipeline.md');
  const i = runner.indexOf('Pre-Step Input Validation');
  assert.ok(i > 0, 'seção Pre-Step Input Validation não encontrada');
  const secao = runner.slice(i, i + 2000);

  // O output é gravado com Steps 1 e 2 (run_id + pasta vN). Se a validação de input
  // aplicar só o Step 1, ela procura em `{run_id}/arquivo.md` enquanto o arquivo está
  // em `{run_id}/vN/arquivo.md` — e TODO step que consome saída anterior falha.
  assert.ok(
    /Step 2|vers(ã|a)o|v\[0-9\]|grep -E '\^v/.test(secao),
    'a validação de input precisa resolver a pasta de versão (Step 2), não só o run_id',
  );
  assert.ok(
    !/Apply the Output Path Transformation \(Step 1: run_id injection\) to the `inputFile`/.test(secao),
    'a validação de input voltou a aplicar SÓ o Step 1 — assimetria que trava o pipeline do 2º step em diante',
  );
});

test('o build ensina que checkpoint sem outputFile no frontmatter não grava nada', () => {
  const build = ler('_legalsquad', 'core', 'prompts', 'build.prompt.md');

  // O runner só persiste a resposta do usuário se `outputFile` estiver no FRONTMATTER.
  // Instrução em prosa no corpo do step não gera arquivo — e o checkpoint em que o
  // profissional aprova a peça passa sem deixar rastro de quem autorizou o quê.
  assert.match(
    build,
    /CHECKPOINT NÃO EXECUTA TRABALHO/,
    'build.prompt.md perdeu a regra de que checkpoint não executa trabalho',
  );
  assert.match(
    build,
    /FRONTMATTER/,
    'build.prompt.md precisa dizer explicitamente que o outputFile vai no frontmatter',
  );
  assert.match(
    build,
    /aprova(ção|r)[^.]*(não existe|rastro)|rastro/i,
    'build.prompt.md deve explicar a consequência: aprovação humana sem rastro em disco',
  );
});
