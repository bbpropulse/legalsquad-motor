# LegalSquad

Motor de orquestração multi-agente para o Direito.

**Áreas do Direito não vivem neste repositório.** Elas chegam como **pacotes assinados**
(skills + squads + best-practices + acervo) baixados por `sync` e liberados por licença.

## O arranjo

| Repositório | Papel | Muda? |
|---|---|---|
| **`legalsquad`** (este) | Motor + plataforma: roteador, Arquiteto, gates, CLI, `sync`, licença, empacotamento | é onde o motor evolui |
| `criminalsquad` | Fonte do conteúdo criminal **e** o produto que vende hoje | **intocado** |
| `dtsquad` | Fonte do conteúdo trabalhista | **intocado** |

> `ejsquad` (fonte do conteúdo extrajudicial) **não existe no disco**. Hoje só `criminalsquad`
> (520 skills) e `dtsquad` (405) estão presentes — ver
> [`F0-SANEAMENTO.md §7`](docs/specs/legalsquad/F0-SANEAMENTO.md).

O `build-area` **lê** um repositório de conteúdo e produz o pacote assinado — **somente leitura**.
O conteúdo continua sendo autorado no repo da sua área; o LegalSquad empacota e distribui.

## O que está aqui (motor)

Roteador e loop de orquestração · Arquiteto · Pipeline Runner e checkpoints · resolvedor
fail-closed (lifecycle/evidência) · Citation Gate · CLI · `captura` (áudio/vídeo) · indexadores ·
integrações (DJEN, e-mail, agenda) · dashboard.

## O que **não** está aqui (vira pacote)

Skills de matéria · squads · best-practices jurídicas · acervo · perfis de instituição ·
calculadoras específicas de área.

## Documentação

- [`docs/specs/legalsquad/ARQUITETURA.md`](docs/specs/legalsquad/ARQUITETURA.md) — a decisão, o corte
  núcleo × pacote, tipos de pacote, licença e a camada vertical.
- [`docs/specs/legalsquad/MIGRACAO.md`](docs/specs/legalsquad/MIGRACAO.md) — plano de construção F0–F5.
- [`docs/specs/legalsquad/F0-SANEAMENTO.md`](docs/specs/legalsquad/F0-SANEAMENTO.md) — o saneamento da
  suíte e da fronteira núcleo × pacote, incluindo a dívida de matéria criminal ainda hardcoded no
  motor.
- [`docs/specs/acervo-server/SPEC.md`](docs/specs/acervo-server/SPEC.md) — o mecanismo de pacote,
  assinatura, delta e sync (um pipeline carrega **skills e acervo**).

## Estado: F0 (scaffold)

O motor foi copiado do CriminalSquad — **a última cópia que será feita** — e todo o conteúdo
jurídico foi removido. Daqui pra frente, evolução de motor acontece **só aqui**.

### Pendências conhecidas do F0

- **Identidade interna ainda é `criminalsquad`** (comando, `_criminalsquad/`, textos). O rename é
  mecânico e está pendente de decisão — ver `ARQUITETURA.md §6`.
- **Pacote `transversal` ainda não extraído** (as ~20 skills que servem qualquer área). O conjunto já
  é derivável hoje: a interseção de nomes entre `criminalsquad` e `dtsquad` dá exatamente 20 entradas
  (19 skills + `_evals`), sem depender do `ejsquad` — ver
  [`F0-SANEAMENTO.md §7`](docs/specs/legalsquad/F0-SANEAMENTO.md).
- **A suíte tem 7 falhas conhecidas, não está 100% verde:** `npm test` → 314 passam, 7 falham, 321 no
  total, 0 skip, 0 todo. São dívida documentada (não bug), mas por **duas causas diferentes**: 6 delas
  (`init.test.js` ×4, `update.test.js` ×1, `cli.test.js` ×1) são ENOENT puro — `installAllSkills` e o
  `resource-cli` tentam copiar skills de um `<repo>/skills` que este repo não tem mais. Só a 7ª
  (`update.test.js:225`) é causada por `syncSkillCatalogArtifacts` (`src/init.js`, chamada por `init`
  e `update`) resolver o manifesto `_execucao-penal-v3-integration.yaml` por nome fixo em vez de raiz
  parametrizada. Detalhe completo em
  [`F0-SANEAMENTO.md §5-bis`](docs/specs/legalsquad/F0-SANEAMENTO.md). A não-regressão dessa dívida é
  guardada por `tests/fronteira.test.js`.
- **`npm run verify` continua vermelho** (não é regressão desta branch): `scripts/verify.mjs` exige
  487 `SKILL.md`, os motores de `legal-calculators/` e `_criminalsquad/core/authorities/
  execucao-penal-art-112.json` — tudo conteúdo de área que este repo não tem mais. Só volta a passar
  quando o `build-area` (F1) alimentar o tarball com um pacote de área real.

## Regras do projeto

1. **Nenhum passo escreve nos repos de conteúdo.** O `build-area` é somente leitura.
2. **Motor novo só aqui.** O CriminalSquad está em manutenção (correção crítica apenas).
3. **Uma área só vira pacote com curador responsável.**
