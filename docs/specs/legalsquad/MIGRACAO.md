# LegalSquad — Plano de construção (repositório novo)

> Companheiro de [`ARQUITETURA.md`](ARQUITETURA.md).
> **Decisão: o LegalSquad NÃO é tocado.** O LegalSquad nasce em repositório próprio.

## Por que repo novo é a decisão certa

1. **O LegalSquad está lançando.** Turma fundadora, 30 vagas, aula de implementação de 3h. Refatorar
   o produto vivo para um sistema de pacotes às vésperas do lançamento é risco desnecessário —
   qualquer regressão aparece na frente de 30 advogados pagantes.
2. **Repo novo dá liberdade de acertar.** Sem a trava de "não pode quebrar o que já vende", a
   arquitetura de pacotes nasce limpa.
3. **Nada se perde.** O conteúdo do LegalSquad é reaproveitado por **leitura**, não por mudança.

---

## O arranjo (a parte elegante)

| Repositório | Papel | Muda? |
|---|---|---|
| **`legalsquad`** (novo) | **Motor + plataforma**: roteador, Arquiteto, gates, CLI, `sync`, licença, empacotamento | é onde o motor evolui daqui pra frente |
| `legalsquad` | **Fonte de conteúdo criminal** + o produto que vende hoje | **intocado** |
| `dtsquad` | fonte de conteúdo trabalhista | **intocado** |
| `ejsquad` | fonte de conteúdo extrajudicial | **intocado** |

Um passo de build no LegalSquad **lê** o repositório de conteúdo e produz o pacote assinado.
**Somente leitura** — nenhum arquivo dos repos de conteúdo é modificado.

Consequência prática que vale ouro:

> O conteúdo criminal continua sendo **autorado no LegalSquad** — o ambiente que você e o Prof.
> Salim já dominam, com os gates (`check:skills`, `check:skill-evals`, Citation Gate) que já
> funcionam. O LegalSquad só **empacota e distribui**.

E é **re-executável**: conteúdo novo entra no LegalSquad na curadoria semanal → roda o build →
sai `area.criminal@nova-versão` → os assinantes sincronizam. Sem migração, sem mexer no que existe.

---

## Fases

### F0 — Criar o repositório e a fronteira · *~1 semana*
- Criar `legalsquad` (sugestão: `~/Devlop/legalsquad`).
- **Última cópia do motor**: partir do motor do LegalSquad (maduro: roteador, Arquiteto, pipeline
  runner, resolvedor fail-closed, CLI, `captura`, calculadoras, integrações) e **remover todo o
  conteúdo jurídico** — skills, squads, best-practices de matéria, acervo.
- Aplicar a fronteira núcleo × pacote da [`ARQUITETURA.md §2`](ARQUITETURA.md).
- Chave Ed25519 + formato de pacote ([`../acervo-server/SPEC.md §6`](../acervo-server/SPEC.md)).
- **Aceite:** `legalsquad init` roda numa pasta limpa, com **só o transversal**, e os testes do motor
  passam. Nenhuma skill de matéria no repo.

### F1 — Exportador de conteúdo · *~1 semana* ⭐ o coração
- `tools/build-area.mjs <repo-de-conteudo> <area-id>`: lê `skills/`, `squads/`,
  `core/best-practices/` e o perfil, e produz o pacote assinado.
- Separa o **transversal** (as ~20 skills que sobrevivem a qualquer área — as mesmas isoladas ao
  criar o EJsquad) do conteúdo específico da área.
- **Aceite:** `area.criminal` gerado a partir do `legalsquad` **com `git status` limpo no
  legalsquad** (prova de que o build é read-only). Contagem de skills bate com as 520.

### F2 — Paridade · *~1–2 semanas*
- Instalação limpa: `legalsquad` + `transversal` + `area.criminal`.
- **Aceite:** reproduz a experiência atual do LegalSquad — mesmos 9 squads, mesmas skills,
  `check:skills` / `check:skill-evals` / `check:skill-quality` verdes, resolvedor fail-closed e
  Citation Gate funcionando. **Se não houver paridade, para aqui** — não se abre área nova nem se
  fala em migrar aluno.

### F3 — Sync + licença · *~1–2 semanas*
- `sync`, `areas`, `areas add`; entitlement (`/v1/catalog`), URLs assinadas.
- Degradação graciosa: sem licença → cache read-only + selo *"desatualizado há N dias"*.
- **Aceite:** licença de criminal baixa `area.criminal`; sem trabalhista → 403; vencida → cache
  funciona com selo.

### F4 — Trabalhista e extrajudicial · *~1 semana cada*
- Rodar o **mesmo exportador** sobre `dtsquad` e `ejsquad`. Sem tocar nesses repos.
- **Aceite:** `area.trabalhista` e `area.extrajudicial` instalam e funcionam sobre o motor único.

### F5 — Áreas novas · *sob demanda*
- Só com curador responsável (ver regra abaixo).

---

## Regras inegociáveis do plano

1. **Nenhum passo escreve nos repos de conteúdo.** O build é read-only, e o aceite de cada fase
   inclui conferir que `legalsquad`, `dtsquad` e `ejsquad` continuam com `git status` limpo.
2. **Motor novo só no LegalSquad.** A partir da F0, evolução de motor acontece só lá. O
   LegalSquad entra em modo manutenção (só correção crítica) — o que **para a sangria** de portar
   correção à mão entre forks.
3. **Uma área só vira pacote com curador de verdade.** Arquitetura ampla, vitrine estreita — é o que
   te separa do catálogo raso do concorrente.

---

## Coexistência dos dois produtos

Durante a turma fundadora, **os dois convivem**:
- Quem comprou o Núcleo usa o **LegalSquad** como está — nada muda para ele.
- O **LegalSquad** amadurece em paralelo, alimentado pelo mesmo conteúdo.

A migração da base de alunos é uma **decisão comercial futura**, não um requisito técnico. Quando o
LegalSquad tiver paridade + sync + licença, você escolhe: migrar os fundadores (com o preço travado)
ou manter o LegalSquad como o bundle criminal rodando sobre o motor novo.

---

## Riscos e mitigação

| Risco | Impacto | Mitigação |
|---|---|---|
| Motor diverge entre os repos | médio | Regra 2: motor novo só no LegalSquad; LegalSquad em manutenção |
| Exportação perder conteúdo | alto | F2 tem aceite de **paridade** verificado pelos gates que já existem |
| Construir plataforma e atrasar o Núcleo | alto | F0–F2 não bloqueiam o lançamento; o LegalSquad segue intocado e vendendo |
| Diluir em N áreas rasas | alto | Regra 3 (curador) + go-to-market uma área por vez |
| Duplicar esforço de conteúdo | médio | Conteúdo continua sendo autorado uma vez, no repo da área; o build só empacota |

## Ordem

```
F0 repo+fronteira → F1 exportador → F2 paridade → F3 sync+licença → F4 trabalhista/extrajudicial → F5 novas
```

F0–F2 (~3 semanas) prova a tese sem encostar no produto que vende. F3 liga a monetização.
F4 encerra a duplicação de motor.
