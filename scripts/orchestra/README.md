# Scripts "orchestra" — cache local de intimações

Padrão trazido do **My-Brain-Is-Full-Crew**: helpers leves e **pré-aprovados** que
consultam um **cache local** em vez de re-chamar a API do DJEN a cada pergunta.
Ganhos: respostas **instantâneas**, funcionam **offline**, dão **histórico pesquisável**
de intimações e evitam novos prompts de permissão de Bash a cada comando.

## O cache: `_criminalsquad/_memory/djen-tracker.jsonl`

Um objeto JSON **por linha** (append-only, gitignored — é dado privado/sigiloso). Esquema:

```json
{
  "id": "0000000-00.0000.0.00.0000|3f2a1b9c",
  "capturado_em": "2026-06-17T14:00:00Z",
  "processo": "0000000-00.0000.0.00.0000",
  "tribunal": "TJSP",
  "orgao": "1ª Vara Criminal da Comarca de ...",
  "tipo": "intimacao",            // intimacao | despacho | decisao | sentenca | publicacao
  "teor": "texto da publicação/intimação",
  "cliente": "Fulano de Tal",
  "prazo_dias": 5,
  "fatal": "2026-06-24",          // data fatal (AAAA-MM-DD) calculada por gestao-prazos-processuais; ou null
  "lido": false
}
```

> O `id` (nº do processo + hash do teor) é a **chave de dedupe**: a mesma intimação não entra duas vezes.

## Quem alimenta

O agente **`monitor-dje-djen`** / a skill **`djen-api-oficial`** capturam o DJEN e gravam cada item
com `djen-tracker-add.mjs`. A **data fatal** deve ser calculada pela best-practice
`gestao-prazos-processuais` (dias corridos, art. 798 CPP; dobro p/ Defensoria) antes de gravar `fatal`.

## Consultas (instantâneas, sem API)

| Script | O que faz |
|--------|-----------|
| `node scripts/orchestra/prazos-hoje.mjs` | Prazos com fatal **hoje** |
| `node scripts/orchestra/prazos-semana.mjs` | Prazos com fatal nos **próximos 7 dias** |
| `node scripts/orchestra/intimacoes-recentes.mjs [horas]` | Intimações das últimas N horas (default 24) |
| `node scripts/orchestra/processo-lookup.mjs <nº>` | Tudo sobre um processo |
| `node scripts/orchestra/cliente-lookup.mjs <nome>` | Intimações de um cliente |

Todas aceitam `--json` (saída para máquina); sem a flag, imprimem tabela legível.
Atalhos npm: `npm run prazos:hoje`, `npm run prazos:semana`, `npm run intimacoes`.

## Gravar

```bash
node scripts/orchestra/djen-tracker-add.mjs --data '{"processo":"...","teor":"...","fatal":"2026-06-24","cliente":"...","tipo":"intimacao"}'
# ou via stdin (um objeto ou um array):
echo '[{...},{...}]' | node scripts/orchestra/djen-tracker-add.mjs
```

> O `djen-tracker.jsonl` é **privado** (gitignored) — contém dados de processo/cliente. Nunca o versione.

## Carteira (dataset consolidado)

`carteira-consolidar.mjs` varre `acervo/casos/*/carteira-row.json` (uma linha-plana por caso,
emitida pela skill `carteira-lote`) e produz a **tabela normalizada da carteira** em
`acervo/casos/_carteira/carteira.{json,csv}`, ordenada por prazo fatal (mais urgente primeiro).
Determinístico e sem dependência de YAML (a linha-plana é JSON puro); linhas malformadas são
puladas com aviso, nunca derrubam a consolidação. É o dataset que alimenta relatório executivo,
mail-merge (`mail-merge-pecas`) e dashboard.

```bash
node scripts/orchestra/carteira-consolidar.mjs        # tabela legível + resumo
node scripts/orchestra/carteira-consolidar.mjs --json  # resumo em JSON
# ou: npm run carteira
```

`carteira-metricas.mjs` agrega esse dataset em **métricas gerenciais determinísticas** (total,
por fase/gargalos, em risco, com pendência, com/sem prazo, por confiança, valor total) — os
NÚMEROS reproduzíveis que a skill `relatorio-executivo-escritorio` usa no one-pager gerencial.

```bash
node scripts/orchestra/carteira-metricas.mjs          # métricas legíveis
node scripts/orchestra/carteira-metricas.mjs --json   # métricas em JSON
# ou: npm run carteira:metricas
```

> `acervo/casos/` (e o dataset em `_carteira/`) é **sigiloso** (gitignored) — nunca versione.
