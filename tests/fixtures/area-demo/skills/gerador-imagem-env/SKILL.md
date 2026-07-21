---
name: gerador-imagem-env
description: >-
  Use ao lidar com gerador-imagem-env na área fictícia demo — cenário sintético que exercita o motor
  sem depender de matéria jurídica real. Gatilhos: gerador-imagem-env, demo env.
  Não use para decisão final, entrega de produção ou qualquer caso real.
metadata:
  type: "prompt"
  version: "1.0.0"
  categories: [demo, sintetico]
  lifecycle: "active"
  schema_version: "5"
  quality_profile: "legal-drafting"
  contract_version: "5.0.0"
  quality_status: "contracted"
  eval_case_ids: ["demo-v5-gerador-imagem-env"]
  risk_level: "r1"
  delivery_type: "external-mutation"
  freshness_policy: "official-current-source-required"
  positive_triggers: ["gerador-imagem-env", "demo env"]
  negative_triggers: ["entrega_producao", "peca_protocolavel", "parecer_final"]
  guard_triggers: ["objetivo ou fase indefinidos", "documento determinante ausente", "regra não verificada"]
  env: ["DEMO_API_KEY"]
  engines: []
---

# gerador-imagem-env (fixture sintética)

<!-- LEGALSQUAD:HP-CONTRACT:START -->

## Quando usar

Cenário sintético da área demo. Este arquivo existe para exercitar o motor —
catálogo, busca, política de runtime e resolvedor — sem conteúdo jurídico real.

## Entradas mínimas

- objetivo declarado
- fase do fluxo demo
- documento de referência

## Limites

Não produz entrega de produção. Não substitui revisão humana. Toda citação de
fonte oficial exige proveniência registrada — ver
[contrato de alta performance](references/high-performance-contract.md).

<!-- LEGALSQUAD:HP-CONTRACT:END -->
