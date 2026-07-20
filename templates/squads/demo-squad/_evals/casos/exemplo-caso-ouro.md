# Caso-ouro — exemplo

Modelo de caso-ouro. **Todo input aqui é fictício** — nunca use dado real de
cliente num caso-ouro (sigilo profissional e LGPD; este arquivo é versionado).

Um caso-ouro torna a avaliação **repetível**: em vez de julgar o output de um run
qualquer, o squad roda sempre sobre o mesmo input e a nota fica comparável ao
longo do tempo. É assim que se pega regressão depois de mexer num prompt.

## Input

> Descreva aqui o pedido fictício, com o mesmo nível de detalhe que um caso real
> teria: objetivo, fase, documentos de referência e o que se espera de volta.

## O que um bom output deve conter

Derive cada item dos `success_criteria` do `squad.yaml` — a rubrica é **fonte
única**: os mesmos critérios servem ao `eval` e à Verificação da Meta do runner.
Escreva-os de forma verificável ("cita a fonte de cada afirmação"), não vaga
("boa qualidade").

1. …
2. …
3. …

## Sinais de falha

Liste o que reprova de imediato — é o que o juiz procura primeiro.

- …
