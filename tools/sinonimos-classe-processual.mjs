// Sigla ↔ nome por extenso de classe processual, para o Citation Gate
// (`src/citacao-gate.js`) resolver citação contra acervo que grava a classe
// de uma das duas formas.
//
// Fica em `tools/`, fora do núcleo, de propósito: é vocabulário de
// nomenclatura jurídica — o mesmo motivo pelo qual `NORMAS_POR_AREA` e
// `SINONIMOS` de `enriquecer-base-legal.mjs` vivem aqui. `tests/fronteira.test.js`
// bloqueia a string "habeas corpus" dentro de `src/` (era o símbolo da dívida
// de execução penal que o F0 removeu) — o mapa precisa morar do lado de fora
// dessa fronteira, não porque o CONCEITO seja matéria de área (reconhecer o
// formato de uma citação é mecanismo), mas porque o PAR sigla↔extenso de cada
// classe é dado de vocabulário, igual synonyms de tema.
//
// Chaves são a RAIZ já normalizada por `raizDaClasse` (prefixo AGR-/EDCL-
// removido quando há classe-base depois; maiúscula).
export const SINONIMOS_CLASSE_PROCESSUAL = {
  RESPE: 'recurso especial eleitoral',
  RE: 'recurso extraordinario',
  HC: 'habeas corpus',
  MS: 'mandado de seguranca',
  ADI: 'acao direta de inconstitucionalidade',
  ADPF: 'arguicao de descumprimento de preceito fundamental',
  RHC: 'recurso (?:ordinario )?em habeas corpus',
  ARESP: 'agravo em recurso especial',
  EDCL: 'embargos de declaracao',
};
