# Perfil da Instituição (CriminalSquad)

> Preencha/ajuste os campos entre colchetes angulares com os dados reais. Este arquivo é carregado em
> TODA execução de squad e orienta foco, **polo**, tom e conformidade.
> Normalmente é gerado/atualizado pelo onboarding do `/criminalsquad` — você também
> pode editá-lo à mão ou rodar `/criminalsquad edit-company`.

## Identidade
- Tipo de instituição: <Escritório de advocacia | Advogado(a) autônomo(a) | Gabinete do Ministério Público (Promotoria/Procuradoria) | Defensoria Pública | Departamento jurídico | Outro>
- Nome/denominação: <preencher>
- Responsável: <nome> — <OAB/UF nº (advocacia) **ou** cargo: Promotor(a)/Defensor(a)/Procurador(a)>
- Contato: <e-mail institucional>
- Comarcas/Tribunais: <ex.: TJ__, TRF__, STJ, STF>

## Polo de atuação (define a postura padrão do sistema)
- Polo principal: <Defesa | Acusação (MP/querelante) | Assistente de acusação | Misto>
- Implicação prática:
  - **Defesa** → teses defensivas, nulidades, garantias, liberdade, recursos da defesa.
  - **Acusação** → análise e elaboração de denúncia/queixa, requisições, recursos da acusação.
  - **Assistente de acusação** → habilitação e atuação ao lado do MP (vítima/querelante), recursos do assistente.
- Áreas e nichos de foco: Direito Penal e Processual Penal — <ex.: drogas, júri, violência doméstica, econômico/tributário, execução penal, honra>

## Posicionamento
- Proposta de valor: <ex.: defesa técnica combativa, foco em garantias constitucionais>
- Perfil de cliente/assistido: <ex.: pessoa física acusada; vítima/querelante; empresa em crime econômico>
- Tom de voz institucional: formal, técnico e sóbrio — sem sensacionalismo e sem promessa de resultado

## Conhecimento e fontes
- Acervo local: `./acervo/` (jurisprudência, doutrina, legislação, teses-modelo) — rode `npm run indexar-acervo` após adicionar material
- Fontes oficiais: STJ, STF, Planalto, DJEN
- Peças e habilidades: `./skills/` (peças criminais) e `./.claude/agents/` (subagentes especialistas)

## Operação
- Sistemas processuais: <ex.: PJe, e-SAJ, Projudi, Eproc — conforme tribunal>
- E-mail: <Gmail / Resend — definir na 1ª execução de um squad que envie e-mail>
- Agenda: <Google Calendar>
- Redes (autoridade): <Instagram / LinkedIn — handles>

## Conformidade (transversal e obrigatória)
> Ajuste a moldura ética ao **tipo de instituição**:
> - **Advocacia** → Código de Ética da OAB + **Provimento 205/2021** (sem captação/mercantilização, sem promessa de resultado).
> - **Ministério Público** → regime do MP (CNMP) e deveres funcionais; **não** se aplica a publicidade advocatícia.
> - **Defensoria Pública** → LC 80/94 e regras próprias; foco no assistido hipossuficiente.
- Revisão humana **obrigatória**: toda peça/parecer é rascunho técnico — "hipótese a confirmar".
- Verificação de citações (`verificacao-citacoes`) **antes** de qualquer protocolo — nada citado de memória.
- Sigilo profissional e LGPD: dados de cliente/assistido nunca em repositório público (`acervo/casos/` é gitignored).
- Conflito de interesses: checagem do art. 17 do Estatuto da OAB (ou equivalente) na triagem.
