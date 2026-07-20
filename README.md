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
| `ejsquad` | Fonte do conteúdo extrajudicial | **intocado** |

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
- [`docs/specs/acervo-server/SPEC.md`](docs/specs/acervo-server/SPEC.md) — o mecanismo de pacote,
  assinatura, delta e sync (um pipeline carrega **skills e acervo**).

## Estado: F0 (scaffold)

O motor foi copiado do CriminalSquad — **a última cópia que será feita** — e todo o conteúdo
jurídico foi removido. Daqui pra frente, evolução de motor acontece **só aqui**.

### Pendências conhecidas do F0

- **Identidade interna ainda é `criminalsquad`** (comando, `_criminalsquad/`, textos). O rename é
  mecânico e está pendente de decisão — ver `ARQUITETURA.md §6`.
- **Pacote `transversal` ainda não extraído** (as ~20 skills que servem qualquer área).
- **Testes dependentes de conteúdo** (calculadoras, execução, acervo, catálogo de skills) foram
  copiados e **vão falhar sem conteúdo** — eles pertencem ao repo da área. Separar em F1.

## Regras do projeto

1. **Nenhum passo escreve nos repos de conteúdo.** O `build-area` é somente leitura.
2. **Motor novo só aqui.** O CriminalSquad está em manutenção (correção crítica apenas).
3. **Uma área só vira pacote com curador responsável.**
