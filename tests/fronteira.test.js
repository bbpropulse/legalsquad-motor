import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

// Matéria jurídica de ÁREA que não deveria estar no motor. Não inclui o vocabulário
// de citação (REsp, Súmula, CPP, LEP) — o Citation Gate é núcleo por definição da
// ARQUITETURA §2, e reconhecer o formato de uma citação é mecanismo. LEP fora do padrão
// por esse mesmo motivo: em templates/ide-templates/*/hooks/verifica-citacoes.mjs ela é
// só mais um token da regex de reconhecimento de citação (junto com CPP/CF/Lei/Decreto),
// não uma referência substantiva à matéria — ver F0-SANEAMENTO.md §5-bis, "Classificado
// como mecanismo, não matéria".
const MATERIA = 'dosimetria|remicao|remição|habeas.corpus|art\\.? 112|execucao.penal|execução.penal|\\bep-[a-z-]+|queixa-crime|revisao-criminal|mandado-seguranca';

// Inventário congelado em F0-SANEAMENTO.md §5-bis. Estes arquivos JÁ contêm matéria;
// a dívida está registrada e datada. Nenhum arquivo NOVO pode entrar nesta lista.
//
// Os 15 arquivos abaixo de templates/ide-assets/ e templates/ide-templates/ são uma
// dívida só: command-body.md e instructions-body.md (fonte) e as 13 cópias que
// `npm run build:ide` gera a partir deles por IDE (mesmo corpo, frontmatter próprio) —
// ver F0-SANEAMENTO.md §5-bis, "Também propaga matéria".
//
// Os 12 arquivos abaixo de _criminalsquad/core/ e .claude/skills/criminalsquad/SKILL.md
// são outra dívida: _criminalsquad/core/ é copiado pelo `init` (está em CANONICAL_SOURCES
// de src/init.js) — é o caminho pelo qual matéria criminal chega a todo usuário novo —
// ver F0-SANEAMENTO.md §5-bis, "Chega a todo usuário novo via init".
const DIVIDA_CONHECIDA = new Set([
  'src/skill-quality.js',
  'src/skill-catalog.js',
  'src/skill-catalog-cli.js',
  'src/skill-contract.js',
  'src/init.js',
  'scripts/verify.mjs',
  'templates/package.json',
  'templates/ide-assets/command-body.md',
  'templates/ide-assets/instructions-body.md',
  'templates/ide-templates/claude-code/CLAUDE.md',
  'templates/ide-templates/claude-code/.claude/skills/criminalsquad/SKILL.md',
  'templates/ide-templates/cursor/.cursor/rules/criminalsquad.mdc',
  'templates/ide-templates/qwen-code/QWEN.md',
  'templates/ide-templates/qwen-code/.qwen/skills/criminalsquad/SKILL.md',
  'templates/ide-templates/codex/AGENTS.md',
  'templates/ide-templates/gemini-cli/GEMINI.md',
  'templates/ide-templates/gemini-cli/.gemini/skills/criminalsquad/SKILL.md',
  'templates/ide-templates/vscode-copilot/.github/prompts/criminalsquad.prompt.md',
  'templates/ide-templates/trae/.trae/rules/criminalsquad.md',
  'templates/ide-templates/antigravity/.agent/rules/criminalsquad.md',
  'templates/ide-templates/antigravity/.agent/workflows/criminalsquad.md',
  'templates/ide-templates/opencode/AGENTS.md',
  '_criminalsquad/core/architect.agent.yaml',
  '_criminalsquad/core/runner.pipeline.md',
  '_criminalsquad/core/seeds/company.md',
  '_criminalsquad/core/prompts/discovery.prompt.md',
  '_criminalsquad/core/prompts/design.prompt.md',
  '_criminalsquad/core/prompts/build.prompt.md',
  '_criminalsquad/core/prompts/sherlock-shared.md',
  '_criminalsquad/core/prompts/sherlock-instagram.md',
  '_criminalsquad/core/prompts/sherlock-youtube.md',
  '_criminalsquad/core/prompts/sherlock-twitter.md',
  '_criminalsquad/core/prompts/sherlock-linkedin.md',
  '.claude/skills/criminalsquad/SKILL.md',
]);

test('a matéria jurídica no motor não se espalha para arquivos novos', () => {
  let saida = '';
  try {
    saida = execFileSync(
      'grep',
      ['-rlEi', MATERIA, 'src/', 'bin/', 'scripts/', 'templates/', '_criminalsquad/', '.claude/'],
      { encoding: 'utf8' }
    );
  } catch (e) {
    // grep sai 1 quando não há match — significa fronteira totalmente limpa.
    if (e.status !== 1) throw e;
  }

  const encontrados = saida.split('\n').filter(Boolean).map((p) => p.replace(/^\.\//, ''));
  const novos = encontrados.filter((f) => !DIVIDA_CONHECIDA.has(f));

  assert.deepEqual(
    novos,
    [],
    `Matéria jurídica de área apareceu em arquivo(s) fora do inventário da dívida:\n` +
      `  ${novos.join('\n  ')}\n\n` +
      `Ou remova a matéria, ou — se for dívida legítima e consciente — acrescente o arquivo ` +
      `a DIVIDA_CONHECIDA aqui E à tabela da §5-bis de F0-SANEAMENTO.md. Nunca só aqui.`
  );

  // O inventário também não pode encolher sem atualizar a doc: se um arquivo foi
  // limpo, ótimo — mas a §5-bis precisa refletir isso.
  const resolvidos = [...DIVIDA_CONHECIDA].filter((f) => !encontrados.includes(f));
  assert.deepEqual(
    resolvidos,
    [],
    `Estes arquivos foram limpos — remova-os de DIVIDA_CONHECIDA e da §5-bis:\n  ${resolvidos.join('\n  ')}`
  );
});
