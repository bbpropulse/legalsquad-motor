---
name: demo-preview-engine
description: >-
  Use ao lidar com demo-preview-engine na área fictícia demo — cenário sintético que exercita o motor
  sem depender de matéria jurídica real. Gatilhos: demo-preview-engine, demo engine.
  Não use para decisão final, entrega de produção ou qualquer caso real.
metadata:
  type: "prompt"
  version: "3.0.0"
  categories: [demo, sintetico]
  lifecycle: "preview"
  schema_version: "5"
  quality_profile: "legal-calculation"
  contract_version: "5.0.0"
  quality_status: "contracted"
  eval_case_ids: ["demo-v5-demo-preview-engine"]
  risk_level: "r3"
  delivery_type: "audit-calculation"
  freshness_policy: "official-current-source-required"
  positive_triggers: ["demo-preview-engine", "demo engine"]
  negative_triggers: ["entrega_producao", "peca_protocolavel", "parecer_final"]
  guard_triggers: ["objetivo ou fase indefinidos", "documento determinante ausente", "regra não verificada"]
  env: []
  engines: []
---

# demo-preview-engine (fixture sintética)

<!-- CRIMINALSQUAD:HP-CONTRACT:START -->

## Quando usar

Cenário sintético da área demo. Este arquivo existe para exercitar o motor —
catálogo, busca, política de runtime e resolvedor — sem conteúdo jurídico real.

## Entradas mínimas

- objetivo declarado
- fase do fluxo demo
- documento de referência

## Limites

Não produz entrega de produção. Não substitui revisão humana.

<!-- CRIMINALSQUAD:HP-CONTRACT:END -->
