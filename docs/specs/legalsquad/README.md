# LegalSquad — produto único, áreas em pacotes

A decisão: **um motor só**; cada área do Direito é **conteúdo em pacote baixável**, liberado por
licença. Área do Direito não é motor — e manter um fork por área já custou portar correção de bug à
mão entre repositórios.

- **[ARQUITETURA.md](ARQUITETURA.md)** — a decisão e o desenho: o corte núcleo × pacote, os tipos de
  pacote (`transversal`, `area.*`, `acervo.*`), o `sync` único, o modelo de licença e a
  "sensação de estar pagando" (degradação graciosa), a camada vertical que preserva o marketing,
  e a ressalva estratégica (amplo na arquitetura, profundo no mercado).
- **[MIGRACAO.md](MIGRACAO.md)** — o plano de construção em **repositório novo**: o LegalSquad
  **não é tocado** (segue vendendo e vira *fonte de conteúdo*, lida em modo somente leitura pelo
  `build-area`). Fases F0–F5, com critério de **paridade** antes de qualquer coisa avançar.

Mecanismo de distribuição (manifesto, assinatura, delta, cache): reuso integral de
**[`../acervo-server/SPEC.md`](../acervo-server/SPEC.md)** — um só pipeline carrega **skills e acervo**.

Duas regras que atravessam tudo:

1. **Sincroniza, não serve.** Nada é buscado em runtime — preserva offline, sigilo e latência.
2. **Uma área só abre com curador.** Sem curador, não vira pacote.
