import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

// Matéria jurídica de ÁREA que não deveria estar no motor. Não inclui o vocabulário
// de citação (REsp, Súmula, CPP) — o Citation Gate é núcleo por definição da
// ARQUITETURA §2, e reconhecer o formato de uma citação é mecanismo.
const MATERIA = 'dosimetria|remicao|remição|habeas.corpus|art\\.? 112|execucao.penal|execução.penal|\\bLEP\\b|\\bep-[a-z-]+|queixa-crime|revisao-criminal|mandado-seguranca';

// Inventário congelado em F0-SANEAMENTO.md §5-bis. Estes arquivos JÁ contêm matéria;
// a dívida está registrada e datada. Nenhum arquivo NOVO pode entrar nesta lista.
const DIVIDA_CONHECIDA = new Set([
  'src/skill-quality.js',
  'src/skill-catalog.js',
  'src/skill-catalog-cli.js',
  'src/skill-contract.js',
  'src/init.js',
  'scripts/verify.mjs',
  'templates/package.json',
]);

test('a matéria jurídica no motor não se espalha para arquivos novos', () => {
  let saida = '';
  try {
    saida = execFileSync(
      'grep',
      ['-rlEi', MATERIA, 'src/', 'bin/', 'scripts/', 'templates/package.json'],
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
