# Changelog

## 0.3.0 — 2026-08-22

- **Mike (chefe de squad) de alta performance**: abertura com a meta, narração
  do rigor dos gates (citações verificadas, ciclos, meta critério a critério),
  escalada e falhas traduzidas, checkpoint emoldurado, retomada com molde,
  handoff explícito roteador→chefe.
- **Arquiteto — análise profunda de skills por agente**: Phase D.5 (matriz de
  cobertura, inspeção via `detail-skill`, registro auditável por agente),
  busca com variantes + léxico do curador (`skills/_lexico*.yaml`), filtros
  `--delivery-type/--risk/--quality-profile`, `negative_triggers` como
  penalidade de frase no ranking.
- **Comandos novos**: `detail-skill <id>` (digest estrutural de uma skill);
  registro de uso por ciclo de revisão em `skills/_evals/uso/`.
- **Run ledger com tempo**: `startedAt`/`endedAt`, histórico `steps[]` e
  carimbo de checkpoints — retomada e entrega com duração real.
- **Correções**: fluxo de atualização aponta para o dist público
  (`legalsquad-nucleo`); assistente não pede mais licença (acesso aberto
  embutido); extração de frames compatível com ffmpeg 8+ (`-fps_mode`).

## 0.1.0 — 2026-07/08

- Motor F0–F3: empacotador de áreas, sync assinado (Ed25519) com o servidor de
  acervo, gates de citação e redação, squads jurídicos padrão-ouro.
