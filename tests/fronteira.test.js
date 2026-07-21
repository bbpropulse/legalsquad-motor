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

// A dívida está PAGA: o motor não contém mais matéria jurídica de área.
//
// Este conjunto era o inventário congelado da F0-SANEAMENTO.md §5-bis — 34 arquivos
// que ainda falavam de execução penal, habeas corpus, júri e dosimetria dentro do
// núcleo. Todos foram limpos: a apresentação do comando passou a ser genérica, os
// prompts do Arquiteto descobrem o manifesto e as best-practices obrigatórias pelo
// catálogo da ÁREA INSTALADA (`skills/_*-integration.yaml`, `_catalog.yaml`) em vez
// de nomes criminais fixos, e as calculadoras criminais saíram dos dois package.json.
//
// O conjunto fica vazio de propósito, e o teste continua valendo: ele agora impede
// que QUALQUER matéria de área volte a entrar no motor. Se algo legítimo precisar
// entrar (não deveria), acrescente aqui E na §5-bis — nunca só aqui.
const DIVIDA_CONHECIDA = new Set([]);

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
