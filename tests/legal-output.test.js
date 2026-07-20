import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateLegalOutput } from '../scripts/validate-legal-output.mjs';

function validOutput() {
  return {
    schema_version: '4',
    status: 'concluido',
    objetivo_juridico: 'Caso fictício de regressão',
    polo: 'defesa',
    fase_processual: 'execução penal',
    cronologia: [{ conteudo: 'Evento fictício', ancora: 'doc-1:p.1', data: '2026-01-01', confianca: 'alta' }],
    fatos_documentados: [{ conteudo: 'Fato fictício', ancora: 'doc-1:p.1', confianca: 'alta' }],
    provas: [{ conteudo: 'Documento fictício', ancora: 'doc-1', confianca: 'alta' }],
    inferencias: [],
    lacunas_documentais: [],
    teses: { principal: [], subsidiarias: [], exploratorias: [] },
    objecoes_provaveis: [],
    respostas_e_distinguishing: [],
    regra_temporal_aplicada: { status: 'verificada', regra_id: 'regra-ficticia-v1', justificativa: 'Caso-ouro', fontes: [] },
    citacoes_verificadas: [{ tipo: 'legislacao', titulo: 'Fonte fictícia', url_oficial: 'https://example.gov.br/fonte', consultada_em: '2026-07-09', status: 'verificada' }],
    calculos: [{ motor: 'motor-ficticio', versao: '1.0.0', inputs: {}, resultado: {}, memoria: [], regra_id: 'regra-ficticia-v1', revisado_por_humano: true }],
    riscos: { nivel: 'baixo', hard_fails: [], ressalvas: [] },
    nivel_confianca: 'alto',
    pedido_operacional: [],
    proxima_acao: { acao: 'Revisar', responsavel: 'Profissional', prazo: null },
    revisao_humana_obrigatoria: true,
  };
}

test('sidecar v4: aceita caso completo para release', () => {
  assert.deepEqual(validateLegalOutput(validOutput(), { release: true }), { ok: true, errors: [] });
});

test('sidecar v4: bloqueia release sem revisão do cálculo', () => {
  const output = validOutput();
  output.calculos[0].revisado_por_humano = false;
  const result = validateLegalOutput(output, { release: true });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /revisão humana do cálculo/);
});

test('sidecar v4: bloqueia citação pendente em qualquer modo', () => {
  const output = validOutput();
  output.objecoes_provaveis.push('[NÃO VERIFICADO] precedente');
  const result = validateLegalOutput(output);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /marcador de citação pendente/);
});
