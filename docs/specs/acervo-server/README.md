# Acervo-as-a-Service

Infraestrutura compartilhada de acervo jurídico (legislação, jurisprudência, súmulas, teses) para
**todos os squads** (LegalSquad, DTSquad, EJsquad e futuros). O servidor **distribui** pacotes
assinados; cada squad **baixa, cacheia e pesquisa localmente** — a busca nunca sai da máquina.

- **[SPEC.md](SPEC.md)** — especificação técnica: princípios, topologia multi-squad, modelo de
  dados (URN, entidades, temporal), formato do pacote, contratos de API, spec do servidor e do
  cliente, segurança/LGPD, não-funcionais.
- **[PLAN.md](PLAN.md)** — plano de implementação: fatiamento (cliente-primeiro), fases 0–5 com
  tarefas, critérios de aceite, riscos e sequenciamento. MVP = motor de sync + pacote-semente
  assinado, offline, sem servidor.

Princípio-mãe: **o servidor distribui dados (saída); nunca recebe buscas (entrada).**
