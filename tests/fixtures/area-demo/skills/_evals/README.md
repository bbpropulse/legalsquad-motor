# Avaliação e promoção de skills — fixture "demo"

Esta pasta é a fixture sintética de `_evals/` usada para testar o motor sem
depender de conteúdo jurídico real. Reproduz a mesma separação de
responsabilidades do pacote real:

1. `catalog-v5.json` e `demo-canonicas.json` são **especificações de
   contrato**: descrevem comportamento normal, adversarial e hard fails, mas não
   provam que um modelo executou a skill.
2. `results/*.json` são **observações representativas e sintéticas** de
   forward-run desta fixture. Não concedem maturidade.
3. Um resultado que promove usaria obrigatoriamente
   `promotion-evidence.schema.json`. O resolvedor confere o envelope e a
   instalação local antes de reconhecer `verified` ou `certified`.

## Distribuição

O `init` copia estas especificações e este guia para o projeto do usuário,
mas nunca copia nem sobrescreve `_evals/results/`: cada instalação constrói
sua própria evidência.
