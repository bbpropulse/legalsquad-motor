# LegalSquad — Arquitetura de produto único, áreas em pacotes

> Status: **Rascunho para decisão** · Substitui a estratégia de *um fork por área*.
> Reaproveita integralmente o mecanismo de sync especificado em
> [`../acervo-server/SPEC.md`](../acervo-server/SPEC.md).

---

## 1. A decisão

**Um motor. Áreas do Direito como pacotes baixáveis, liberados por licença.**

Área do Direito **não é motor — é conteúdo**. A prova está em casa: `DTSquad` e `EJsquad` são forks
com o **motor idêntico** ao CriminalSquad; o que muda é skill, squad, best-practice e perfil de
instituição. Já foi preciso **portar correção de bug à mão** entre repos — o custo de manter N
motores para variar conteúdo. Com 3 áreas é chato; com 8 é inviável.

### Princípios

1. **Um núcleo, um repositório.** Correção de motor é feita uma vez.
2. **Conteúdo viaja em pacote**, não em fork.
3. **Sincroniza, não serve.** Pacote assinado + cache local; nada é buscado em runtime (preserva
   offline, sigilo e latência — ver [`../acervo-server/SPEC.md §1.1`](../acervo-server/SPEC.md)).
4. **Local-first.** Depois de baixado, tudo funciona sem rede.
5. **Degradação graciosa.** Licença vencida nunca vira tijolo: o cache continua, somente leitura.
6. **Vertical na apresentação.** O motor é único; o produto **se apresenta** como o núcleo da área
   do usuário.

---

## 2. Anatomia: o que é núcleo, o que é pacote

O corte é: **mecanismo fica; conhecimento viaja.**

| Fica no **NÚCLEO** (motor, um repo) | Viaja em **PACOTE** (conteúdo, por área) |
|---|---|
| Chefe-roteador e o loop de orquestração | Skills da área |
| **Arquiteto** (cria squads/agentes/skills) | Squads da área |
| Pipeline Runner + checkpoints | Best-practices da área |
| Resolvedor **fail-closed** (lifecycle/evidência) | Perfil de instituição e ética da área |
| **Citation Gate** / verificação de citações | Acervo (legislação, jurisprudência, teses) |
| CLI (`init`, `update`, `search-*`, `sync`) | Vocabulário e onboarding da área |
| **`sync`** (manifesto, assinatura, delta, cache) | |
| `captura` (áudio/vídeo), OCR | |
| Motores de cálculo genéricos | |
| Integrações (DJEN, e-mail, agenda) | |
| Indexadores (`indexar-skills`, `indexar-acervo`) | |

Regra prática: **se depende de matéria jurídica, é pacote. Se é mecanismo, é núcleo.**

---

## 3. Tipos de pacote

Namespace único para skills e acervo — **o mesmo pipeline carrega os dois**.

| Pacote | Conteúdo | Licença |
|---|---|---|
| `transversal` | O que serve todas as áreas: prazos, OCR/captura, ética/LGPD, gestão de escritório, pesquisa jurisprudencial, peças genéricas | **base** (vem instalado) |
| `area.criminal` | 520 skills criminais + 9 squads + best-practices + perfil | por licença |
| `area.trabalhista` | conteúdo do atual DTSquad | por licença |
| `area.extrajudicial` | conteúdo do atual EJsquad | por licença |
| `acervo.criminal.*` | legislação, jurisprudência, teses da área | por licença/tier |
| `area.<nova>` | qualquer área futura | por licença |

O conjunto transversal já foi identificado na prática: foi exatamente o que se preservou ao criar o
EJsquad (~20 skills que sobrevivem a qualquer área).

---

## 4. O sync único

Reuso direto do desenho do acervo — **um mecanismo, duas cargas**:

```
legalsquad sync            # sincroniza pacotes com direito (skills + acervo)
legalsquad sync --check    # o que está desatualizado
legalsquad areas           # áreas instaladas vs disponíveis
legalsquad areas add <id>  # instala uma área que a licença libera
```

Fluxo: lê o manifesto local → `GET /v1/catalog?license&product&have=` → baixa só o delta →
**verifica sha256 + assinatura Ed25519** → grava (escrita atômica) → reindexa
(`indexar-skills` / `indexar-acervo`).

Invariantes herdadas do spec do acervo: **nada é gravado sem verificação**; a **busca é local**
(nenhuma query sai da máquina); `acervo/casos/` nunca toca a rede.

---

## 5. Licença, tiers e a "sensação de estar pagando"

O portão é a **checagem de licença no sync** — não o funcionamento da ferramenta.

- **Com licença ativa:** sincroniza; conteúdo novo chega na cadência da curadoria; sem selo.
- **Sem licença / vencida:** o que já está baixado **continua funcionando**, em modo somente
  leitura, com selo **"desatualizado há N dias"** nos resultados de busca e no `status`.

Por que assim: o valor percebido passa a ser o **fluxo** (atualização semanal), não o arquivo. O
usuário sente a defasagem crescer sem nunca ser punido — é o mesmo motivo pelo qual ninguém cancela
assinatura de jurisprudência. Bloquear a ferramenta gera raiva e pedido de reembolso; deixar
envelhecer gera renovação.

**Escopo da licença:** `{ areas: [...], tier, expires }`. Uma licença de criminal não abre pacote
trabalhista (salvo bundle multi-área).

> **Nota honesta:** servir skills remotamente **não protege o IP** — o conteúdo precisa chegar ao
> contexto do modelo de qualquer forma. O moat real é a curadoria viva + o acompanhamento do
> Núcleo, não o arquivo estático.

---

## 6. A camada vertical (o que salva o marketing)

Motor único **não** significa experiência genérica.

No `init`, o usuário escolhe **área + tipo de instituição + polo**. A partir daí o sistema:
1. instala os pacotes daquela área;
2. escreve o perfil (`company.md`) com a **ética aplicável** — OAB/Provimento 205, CNMP, LC 80/94, CNJ;
3. carrega squads, best-practices e vocabulário da área;
4. **se apresenta como o núcleo daquela área.**

Você continua vendendo **"Núcleo de Prática Criminal com IA"**, **"Núcleo Trabalhista…"** — verticais,
específicos e caros — construindo **uma vez só**. Produto único por baixo, marcas verticais por cima.

### Nome e comando (decisão pendente)

Duas saídas, ambas viáveis:
- **(a) Manter `criminalsquad`** como o *bundle comercial* (motor + `area.criminal` pré-instalada) e
  usar `legalsquad` como o nome do motor internamente. Zero ruptura para quem já instalou.
- **(b) Renomear o pacote para `legalsquad`** com alias `criminalsquad` mantido por compatibilidade.

Recomendação: **(a) agora, (b) quando a segunda área for comercializada.** Não renomear enquanto o
único produto vendido é o criminal.

---

## 7. Impacto nos repositórios

> **O CriminalSquad não muda.** Ele segue como está — o produto que vende hoje **e** a fonte de
> conteúdo criminal. Tudo abaixo descreve o **repositório novo** (`legalsquad`).
> Ver [`MIGRACAO.md`](MIGRACAO.md).

**No `legalsquad` (novo):**
- `skills/`, `squads/` e best-practices de matéria **não são versionados como fonte** — são
  **destino de pacote**, instalados pelo `sync`.
- `files[]` do npm leva **núcleo + `transversal`** (instala e funciona offline no dia 1); as áreas
  chegam por sync.
- `acervo/` é **PROTECTED** (dado do usuário); o sync escreve só na subárvore gerenciada.
- O **resolvedor fail-closed continua local** — a assinatura do pacote vira mais uma garantia de
  procedência, somada às checagens de lifecycle/evidência.
- O `_index.yaml` ganha a origem: `fonte_pack: <id>@<versão>`.

**Nos repos de conteúdo (`criminalsquad`, `dtsquad`, `ejsquad`):**
- **Nada muda.** São lidos pelo `build-area` (somente leitura) e continuam sendo onde o conteúdo é
  autorado e validado pelos gates que já existem.

---

## 8. Ressalva estratégica: amplo na arquitetura, profundo no mercado

O risco de virar "LegalSquad, todas as áreas" é **virar catálogo raso** — o erro do concorrente que
anuncia 22 áreas sem profundidade em nenhuma. A vantagem atual é o oposto: 520 skills criminais com
um professor curando toda semana.

> **Regra: uma área só abre com um curador de verdade.** Sem curador, não vira pacote.

Arquitetura multi-área **agora**; abertura comercial **uma área por vez**.

---

## 9. Não-objetivos (v1)

- Servir skill em runtime (rejeitado — quebra offline, vaza a query, põe o servidor no caminho crítico).
- DRM de conteúdo.
- Renomear o produto comercial antes da segunda área.
- Motor diferente por área.
