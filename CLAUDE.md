# LegalSquad — Instruções do Projeto

Este repositório é o **motor** de orquestração multi-agente para o Direito. **Áreas do Direito não
vivem aqui** — chegam como **pacotes assinados** (skills + squads + best-practices + acervo)
baixados por `sync` e liberados por licença.

## O arranjo entre repositórios (leia primeiro)

| Repositório | Papel | Pode ser modificado? |
|---|---|---|
| **`legalsquad`** (este) | Motor + plataforma de distribuição | **sim** — é onde o motor evolui |
| `~/Documents/Projetos/Devlop/criminalsquad/app` | Fonte do conteúdo criminal **e** produto que vende hoje (Núcleo, turma fundadora) | **NÃO** |
| `~/Devlop/dtsquad` | Fonte do conteúdo trabalhista | **NÃO** |
| `~/Devlop/ejsquad/app` | Fonte do conteúdo extrajudicial | **NÃO** |

> **Regra dura:** o `build-area` **lê** os repos de conteúdo e produz pacotes. Nenhum passo escreve
> neles. O critério de aceite de toda fase inclui conferir que esses repos ficam com
> **`git status` limpo** depois do build.

O conteúdo continua sendo **autorado no repo da área** (com os gates que já funcionam lá); o
LegalSquad apenas **empacota e distribui**.

## Fronteira núcleo × pacote

**Fica no motor:** roteador e loop de orquestração · Arquiteto · Pipeline Runner e checkpoints ·
resolvedor fail-closed (lifecycle/evidência) · Citation Gate · CLI · `sync` · `captura` (áudio/vídeo)
· OCR · indexadores · integrações (DJEN, e-mail, agenda) · dashboard.

**Vira pacote:** skills de matéria · squads · best-practices jurídicas · acervo · perfil/ética de
instituição · **calculadoras específicas de área** (dosimetria, prescrição, remição são criminais) ·
`core/authorities/`.

Regra prática: **se depende de matéria jurídica, é pacote; se é mecanismo, é núcleo.**

## Princípios inegociáveis

1. **Sincroniza, não serve.** Nada é buscado em runtime — preserva offline, sigilo (a query nunca
   sai da máquina) e latência. Pacote assinado (Ed25519) + cache local.
2. **Local-first.** Depois de baixado, tudo funciona sem rede.
3. **Degradação graciosa.** Licença vencida nunca vira tijolo: cache segue read-only com selo
   *"desatualizado há N dias"*.
4. **Uma área só vira pacote com curador de verdade.** Arquitetura ampla, vitrine estreita.
5. **Motor novo só aqui.** O CriminalSquad está em manutenção (correção crítica apenas).

## Documentação

- [`docs/specs/legalsquad/ARQUITETURA.md`](docs/specs/legalsquad/ARQUITETURA.md) — a decisão, tipos de
  pacote, licença/tiers, camada vertical, nome/comando.
- [`docs/specs/legalsquad/MIGRACAO.md`](docs/specs/legalsquad/MIGRACAO.md) — plano F0–F5.
- [`docs/specs/acervo-server/SPEC.md`](docs/specs/acervo-server/SPEC.md) — formato de pacote,
  manifesto, assinatura, delta, contratos de API. **Um pipeline carrega skills e acervo.**

## Estado atual: F0 concluído

Motor copiado do CriminalSquad (**a última cópia**) com todo o conteúdo jurídico removido.
Commit inicial: `19e29be`.

### Pendências abertas (não são bugs — é o F0 inacabado por decisão)

- **Identidade interna ainda é `criminalsquad`**: o comando, a pasta `_criminalsquad/`, textos e
  templates. Rename é mecânico mas é diff grande — decisão em `ARQUITETURA.md §6`
  (recomendação: manter `criminalsquad` como bundle comercial e renomear quando a 2ª área for
  vendida). `legalsquad` já existe como alias de bin.
- **Pacote `transversal` não extraído** — as ~20 skills que servem qualquer área.
- **Testes dependentes de conteúdo falham**: a suíte foi copiada inteira e calculadoras, execução,
  acervo e catálogo de skills não têm conteúdo para testar. Eles pertencem ao repo da área;
  separar em F1. **Não trate como regressão.**

## Próximo passo: F1 — o exportador

`tools/build-area.mjs <repo-de-conteudo> <area-id>` → lê `skills/`, `squads/`,
`core/best-practices/` e o perfil; separa `transversal` de `area.*`; produz o pacote assinado.

**Aceite do F1:** gerar `area.criminal` a partir do CriminalSquad com **`git status` limpo lá**
(prova de que o build é read-only) e contagem batendo com as **520 skills**.

**Aceite do F2 (paridade):** instalação limpa `legalsquad` + `transversal` + `area.criminal`
reproduz a experiência atual do CriminalSquad — 9 squads, gates verdes, resolvedor e Citation Gate
funcionando. **Se não houver paridade, para** — não se abre área nova nem se migra aluno.
