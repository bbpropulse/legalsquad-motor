# Descoberta — como o Arquiteto acha skills, e o squad acha jurisprudência

> Documento de decisão. Fecha o desenho de **descoberta e distribuição** antes do `build-area` (F1),
> porque duas das escolhas aqui são de **formato de pacote assinado** — e formato assinado não se
> remenda depois sem re-assinar e re-distribuir tudo.
>
> Complementa a [`ARQUITETURA.md`](ARQUITETURA.md) (a decisão de produto) e o
> [`SPEC do acervo-server`](../acervo-server/SPEC.md) (o formato). Onde este documento e o SPEC
> divergirem, o SPEC é normativo — as seções afetadas já foram atualizadas.

---

## 1. Três relógios, não um

O erro fácil é tratar "o Arquiteto pesquisa conteúdo" como **uma** operação. São três, com
velocidades e sigilos diferentes, e fundi-las custa caro nos três eixos que importam (latência,
sigilo, reuso):

| Momento | Entrada | Onde roda | Rede |
|---|---|---|---|
| **Sync** | licença | servidor → disco | sim, **fora** do caminho crítico |
| **Criação de squad** | *capacidade* ("recorrer de sentença trabalhista") | 100% local | **não** |
| **Execução de squad** | *o caso* (partes, fatos, número do processo) | 100% local | **nunca** |

### 1.1 Na criação de squad não existe caso

Um squad é uma **máquina reutilizável**. Se ele nasce grudado na jurisprudência de um caso
concreto, deixa de servir para o próximo — e a criação, que deveria ser instantânea, passa a pagar
o custo de uma pesquisa jurídica completa.

Jurisprudência, tese e legislação entram no **run**, no step de pesquisa do pipeline, contra o
acervo local, por caso. Isso não é restrição: é o que faz o squad valer para os 200 casos seguintes.

### 1.2 A consulta com dado de caso não sai da máquina

Não é preciosismo. É (a) o ativo comercial do produto — *"tudo local, nada vaza"*; e (b) a postura
LGPD de **distribuidor de conteúdo** em vez de **operador de busca**. Um servidor que recebe
*"réu primário, tráfico privilegiado, comarca X"* vira controlador de dado sensível de terceiro,
com o passivo que isso carrega.

O princípio já está escrito — [`SPEC §2.1`](../acervo-server/SPEC.md): *"Busca é local. Nenhuma
query sai da máquina."* Este documento mostra **por que não é preciso abrir mão de nada** para
mantê-lo.

---

## 2. Catálogo fino sincronizado, conteúdo gordo sob demanda

"Buscar no servidor" *parece* necessário por uma suposição: a de que o catálogo é grande demais
para viver local. **Ele não é — o conteúdo é.**

Ancorando no número medido da [`SPEC §6.1`](../acervo-server/SPEC.md): 520 skills de **conteúdo
completo** = 1,93 MB comprimidos, ou ~3,7 KB por skill. Um registro *de descoberta* por skill
(id, área, gatilhos, `quality_status`, `high_performance_eligible`, `sha256`) é ~500 bytes crus.

Estimativa (não medição — a medição real sai do primeiro `build-area`):

| | catálogo fino | conteúdo completo |
|---|---:|---:|
| 5.000 skills | **~400 KB** | ~18 MB |

O catálogo de **todas** as áreas cabe num download único de menos de meio mega, e buscar sobre
5.000 registros em JS é sub-100 ms. O fluxo:

```
sync    →  catálogo fino de TODOS os pacotes  (sempre, rápido)
busca   →  100% local sobre o catálogo        (sem rede, sem round-trip)
seleção →  Arquiteto escolhe uma skill  →  conteúdo baixado sob demanda, por sha256
```

Isso entrega o que se queria do "pesquisar no servidor", sem trair o princípio:

- **"A qualquer hora o Arquiteto pesquisa novas skills"** → ele pesquisa o catálogo local, que
  conhece **todo** o servidor. A única operação de rede possível é *"tem coisa nova?"* — um check
  de versão com ETag, que carrega zero informação sobre a intenção do usuário.
- **"O Arquiteto tem que ser rápido"** → criação de squad com **zero** chamadas de rede. Toda
  round-trip fora do caminho crítico é latência que o advogado não espera.

### 2.1 Direito a tudo ≠ posse de tudo

A licença é completa (§6, decisão 3): quem compra tem direito a todas as áreas. **Isso torna a
distribuição preguiçosa obrigatória, não opcional.**

O exemplo do próprio [`SPEC §7.1`](../acervo-server/SPEC.md) mostra
`acervo.jurisprudencia.stj.penal` com `bytes: 91223344` — **91 MB para uma área só de
jurisprudência**. Com todas as áreas liberadas, um download *eager* de primeira execução seriam
centenas de megas antes da primeira tela útil.

### 2.2 Granularidade do conteúdo, por tipo de pacote

Laziness máxima em todo lugar seria N requisições por squad. A granularidade certa difere por tipo:

| Tipo | Granularidade do fetch | Por quê |
|---|---|---|
| `area.*`, `transversal` (`tree`) | **por entidade** (`skills.jsonl.zst` inteiro) | 1,9 MB por área é barato; sharding aqui é complexidade sem ganho |
| `acervo.*` (`records`) | **por shard**, por faceta (`tribunal.ramo.ano`) | 91 MB não desce inteiro; e faceta é justamente como se consulta |

### 2.3 Cache endereçado por conteúdo

A skill é identificada pelo `sha256` do seu conteúdo, não pela versão do pacote. Skill que não
mudou entre `2026.07.1` e `2026.07.2` **não é baixada de novo** — o delta fica quase de graça, e o
mesmo blob serve qualquer pacote que o referencie.

### 2.4 Prefetch pelas áreas de atuação

Quando o usuário declara em que áreas atua (§4), baixa-se em **background** o conteúdo das skills
mais usadas dessas áreas. O caso comum nunca espera; o caso raro espera uma vez, ~1,9 MB.

### 2.5 O Citation Gate fica mais rápido, não mais lento

Consequência de desenho que vale nomear: para um pacote `acervo.*`, o **catálogo carrega URN,
ementa recortada e `situacao`** de cada julgado/dispositivo. Isso significa que
`verificador-citacoes` consegue confirmar **existência + vigência/superação** sem baixar inteiro
teor nenhum — local, offline, instantâneo. O inteiro teor só desce quando alguém vai de fato lê-lo.

---

## 3. Embeddings: não agora — e a razão é jurídica

**Texto é a verdade, sempre.** Você não cita um vetor. O `verificador-citacoes` e o
`skill_binding.skill_sha256` dependem do texto existir byte a byte. Embedding é lossy e
não-auditável: como **armazenamento**, está fora de questão, sem exceção.

A pergunta real é sobre o **índice de recuperação**. Resposta: **léxico + facetas primeiro;
embeddings depois, se sobrar necessidade medida.** Quatro razões — a primeira sozinha decide:

**a) Busca jurídica é dominantemente exata e numérica.** "art. 33, §4º", "Súmula 443",
"Tema 1.234", "REsp 1.234.567". Embedding é *pior* que match exato nisso — uma busca vetorial por
"Súmula 443" devolve alegremente a 444, porque são semanticamente vizinhas. Em Direito isso é
precisamente o modo de falha que gera sanção: você teria construído, com esforço, uma máquina de
alucinar citação plausível.

**b) O corpus já tem estrutura forte.** O [`SPEC §4`](../acervo-server/SPEC.md) especifica URN
LexML, ramo/matéria, situação temporal e vínculo de superação. Faceta sobre estrutura ganha de
similaridade semântica na consulta que mais importa — *"o que vale hoje sobre X"*. Similaridade
não sabe o que foi revogado.

**c) Embedding no servidor quebra o sigilo.** Para buscar por vetor é preciso vetorizar a
*consulta*. Se a consulta é o caso e a vetorização é no servidor, o caso vazou. Se é local, carrega
um modelo de 100–500 MB — contra o princípio "`main` leve" e contra a postura de zero-dependência
do formato (hoje: `node:zlib` + `node:crypto`, nada mais).

**d) Custo recorrente e fragilidade de versão.** Jurisprudência muda todo dia; re-embeddar
continuamente é custo permanente. E o índice fica amarrado à versão do modelo — trocou o modelo,
invalidou tudo.

> Isto **confirma** o que a [`SPEC §12`](../acervo-server/SPEC.md) já colocava fora de escopo da
> v1. O que muda aqui é a alternativa concreta (§3.1) e a condição de reabertura (§3.2).

### 3.1 O que fazer em vez disso — 80% do ganho, ~1% do custo

**Léxico de sinônimos curado, distribuído dentro do pacote.** O vocabulário jurídico tem sinonímia
fechada e catalogável: *dano moral ↔ dano extrapatrimonial*, *apelação ↔ apelo*, *prisão preventiva
↔ custódia cautelar*, *verba rescisória ↔ haveres trabalhistas*. Alguns milhares de entradas,
curadas por quem já assina o pacote.

Resolve quase toda a falha de recall que faria querer embeddings — e é **auditável e depurável**,
coisa que embedding não é. Quando a busca erra, lê-se a linha do léxico e corrige-se. Quando um
embedding erra, encolhem-se os ombros.

### 3.2 Quando embeddings passam a valer

Para a única consulta genuinamente difusa: *"ache teses parecidas com esta situação de fato"*. O
desenho honesto, se e quando: embeddings **dos documentos** viajam pré-computados dentro do pacote
(são só mais um payload) e o vetor **da consulta** é calculado localmente, por opt-in. O servidor
continua sem ver consulta nenhuma, jamais. É **aditivo** — não invalida nada do que vier antes.

---

## 4. Área: atuação declarada × direito

A área tem **dois papéis distintos**, e vale separá-los mesmo com licença completa:

- **Direito** — o que a licença libera. Com "quem compra leva tudo" (§6), é *tudo* ou *nada*, e quem
  decide é o servidor. O cliente não adivinha.
- **Atuação** — em que áreas o escritório trabalha. Declarado pelo usuário, e vale só como **dica de
  desempenho e relevância**.

A distinção sobrevive à decisão 3 porque atuação **nunca** foi fronteira de direito: mesmo com tudo
liberado, um escritório criminal não quer a shortlist dominada por previdenciário.

A atuação, concretamente:

- **`areas_de_atuacao` no perfil**, coletado no `init` junto com tipo de instituição e polo.
  **Multivalorado** — escritório criminal que também faz trabalhista declara os dois.
- Usada para: ordem do **prefetch** (§2.4) e *boost* de ranking na busca. **Nunca** para filtrar
  dentro do que a licença já libera.
- **`area:` opcional no `squad.yaml`**, para o squad que foge da atuação declarada.

Perguntar a área a cada criação de squad é atrito. Perguntar uma vez, no `init`, e deixar o squad
sobrescrever quando precisar, não é.

**Área sem direito aparece, mas não baixa.** O catálogo cobre tudo (decisão 2), então a busca
enxerga skills de áreas que a licença não libera — e a resposta certa é *"existe, sua licença não
cobre"*, nunca omitir. Omitir devolveria o motor à confusão que o princípio 3 do `CLAUDE.md` proíbe:
"não tenho direito" se apresentando como "não existe".

---

## 5. Squads e agentes prontos

Já previsto: [`SPEC §6.3`](../acervo-server/SPEC.md) diz que `area.<id>` carrega "skills, squads,
best-practices e perfil". Não há prefixo novo de `pack_id` — decisão 1 (§6).

O que falta é **experiência**, não formato:

```
legalsquad squads catalog          # squads prontos disponíveis (do catálogo local)
legalsquad squads install <id>     # materializa um squad pronto
```

**Gate obrigatório na instalação.** Squad importado de pacote **passa pelo `check-squad` e pelos
gates jurídicos (Gate 4) localmente antes de rodar**. Se squad pronto entra direto, o marketplace
vira a porta dos fundos que contorna revisão isolada, Citation Gate e checkpoint humano.
**Assinatura prova origem, não prova que o squad tem os gates.**

### 5.1 O caminho de volta

Criação de skill continua local (`contract-skills` / `audit-skills`). Falta o `pack contribute`:
exporta a skill autorada localmente no formato que o curador revisa e assina. Fecha o ciclo sem
deixar conteúdo não-assinado entrar no nível de confiança máxima (`VERIFIED_OFFICIAL`).

---

## 6. As decisões, fechadas

| # | Decisão | Consequência |
|---|---|---|
| 1 | **Squads não são vendidos separadamente** | Namespace de `pack_id` continua fechado em `acervo.*` / `area.*` / `transversal`. Squads viajam dentro de `area.*`. |
| 2 | **Catálogo fino cobre todas as áreas** | Uma busca só, sobre tudo. Sem "área não instalada" na descoberta. |
| 3 | **Licença completa — comprou leva tudo** | Não há entitlement por área nem tiers. Fetch preguiçoso continua **requisito** (§2.1). |

### 6.1 Um vaivém, e o que sobrou dele

A decisão 3 foi tomada, revertida e restaurada. O registro fica porque a lição é
reaproveitável.

**O que aconteceu.** Ao importar conteúdo de um projeto chamado `JusSkills`, encontrei um schema que
parecia ser este servidor pronto — `skills`, `legal_areas`, `access_packages`, `entitlements`,
`user_packages`, `orders` — com API pública de catálogo e conteúdo atrás de login. Concluí que "o
acervo-server já existe" e reverti a decisão 3 para entitlement por pacote, argumentando que uma
spec não deve contradizer um sistema que já fatura.

**A conclusão estava errada.** O `JusSkills` é uma **biblioteca de conteúdo**, usada uma vez para
exportar o pacote básico. Ele **não é** e não será o servidor de distribuição deste motor. A
semelhança do schema é convergência de desenho, não identidade de papel.

**Então a decisão 3 volta a ser a original**, que foi explícita e direta: licença completa, sem
entitlement por área, sem tiers.

**A lição:** encontrar um sistema com o schema parecido não prova que ele ocupa o mesmo papel. Eu
inferi arquitetura de um formato de tabela, e formato de tabela é a evidência mais fraca que existe
para papel de sistema — schemas convergem porque os problemas convergem.

**O que sobrou da reversão, porque se sustenta sozinho:** o campo `entitled` no contrato de catálogo
(§`SPEC 7.1`). Mesmo com licença completa ele tem uso — é o que distingue *"você não tem licença"* de
*"isto não existe"* para quem está sem licença ou com licença vencida. Nunca omitir o item é a regra;
`entitled` é como ela se escreve.

### 6.2 Camada gratuita

**Sem licença** o catálogo continua descendo (é ele que permite dizer "existe, sua licença não
cobre") e o pacote-base embarcado no `main` funciona offline, sem conta. **Com licença válida**, tudo.

### 6.3 O corpus real, medido

O dimensionamento deste documento usava 520 skills (a medição do `SPEC §6.1`). O primeiro corpus
real importado é **~9× maior** — e isto vale independentemente de onde o servidor venha a ficar,
porque é medida do **conteúdo**, não da infraestrutura:

| | medido na importação |
|---|---:|
| Itens | **4701** (4521 `skill`, 160 `prompt`, 20 `agent`) |
| Markdown | **74,5 MB** · média 16,6 KB por item |
| Áreas povoadas | 11 de 27 declaradas |
| Maior área | `direito-administrativo`, 1505 skills |

Isso reforça o §2 em vez de contradizê-lo: baixar tudo de uma vez nunca foi opção, e a razão
catálogo/conteúdo medida na importação real ficou entre **2,6× e 12,3×** por área — menor que a
projeção de ~27×, porque estas skills têm corpo curto e metadata rica. O ganho estrutural (catálogo
sem corpo, um registro por item) continua valendo; o multiplicador não.

---

## 7. As buscas, concretamente

### 7.1 Skills — IDF ✅ feito

O ranking pontuava por soma de pesos fixos: um match no nome valia 26 pontos, fosse o termo
"recurso" (que aparece em centenas de skills) ou "dosimetria" (que aparece em três). Com 500 skills
passa; com 5.000, **o termo comum afogava o raro** e a shortlist degradava exatamente quando mais
importa.

O ranking virou [`src/skill-rank.js`](../../../src/skill-rank.js) — módulo **puro** (0 I/O, como o
`review-loop.js`), o que permite testá-lo com corpus sintético em memória, sem fixture no disco. O
peso de cada token passou a ser `peso-de-campo × peso-de-raridade`, com a raridade no formato IDF
do BM25.

**A normalização é a decisão de desenho que torna a mudança segura.** O peso de raridade é
normalizado para `(0, 1]`: o teto é o termo que aparece em **um** documento, e nesse caso vale
exatamente o que valia antes. Termo comum só **desconta** — nada infla. Duas consequências, ambas
presas por teste:

- os bônus de frase (`nome-exato` = 220) seguem dominando em **qualquer** tamanho de catálogo; se o
  peso de token pudesse crescer com N, uma área grande afogaria o casamento exato de nome;
- o peso nunca chega a zero (a forma `+0.5` do BM25, não o IDF clássico), então um termo presente em
  todos os documentos **não some da shortlist**. Zerar seria degradação silenciosa: a busca diria
  "nada encontrado" para o que existe — e "não encontrei" lido como "não há" é o erro que chega na
  peça.

Medido na fixture: para `demo peca alpha`, o alvo exato passou a marcar **454,88** contra **5,88**
dos vizinhos — o token `demo`, que está em toda skill da fixture, perdeu quase todo o peso, que é
precisamente o comportamento desejado.

O que **não** foi implementado, de propósito: normalização por comprimento de documento (`b`/`k1`
do BM25 completo). O motor já satura a frequência por construção — cada campo contribui **uma vez**
por token, não por repetição —, então não há inflação por repetição a saturar.

### 7.2 Acervo — o que falta não é pontuação

| Necessidade | Por quê |
|---|---|
| **Resolução por identificador** | URN, nº de súmula, nº de tema, nº de acórdão precisam de *lookup exato*, não de ranking. "Súmula 443" é uma chave, não um score. |
| **Filtro temporal de primeira classe** | *"o que vale em `<data>`"*. O `SPEC §4.2` já modela versão de dispositivo; o índice precisa expor isso como faceta. |
| **Estado de superação bloqueante** | Devolver precedente superado ou dispositivo revogado **sem marcar** é o defeito mais caro do produto. Não é feature de busca: a busca carrega o estado, o Citation Gate bloqueia com base nele (§2.5). |

---

## 8. Plano, na ordem que evita retrabalho

| # | Passo | Urgência |
|---|---|---|
| 1 | **`build-area` (F1) emite catálogo + conteúdo separados** | **Tem prazo** — é formato assinado; retrofitar exige re-assinar e re-distribuir tudo |
| 2 | ~~**IDF no ranking de skills**~~ ✅ **feito** (§7.1) | — |
| 3 | **`sync` (F3)**: catálogo primeiro, conteúdo preguiçoso, prefetch por atuação | Depois de 1 |
| 4 | `areas_de_atuacao` no perfil + `area:` no `squad.yaml` | Depois de 3 |
| 5 | `squads catalog` / `squads install`, com `check-squad` obrigatório | Depois de 3 |
| 6 | Léxico de sinônimos no pacote + facetas temporais no acervo | Depois de 3 |
| 7 | Embeddings | **Só** se, após 6, houver lacuna de recall **medida** |

Só o passo 1 tem prazo. Todo o resto é aditivo.
