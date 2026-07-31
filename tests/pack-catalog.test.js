import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extrairCatalogo } from '../src/pack-catalog.js';

// Extração do catálogo (SPEC §6.1): um registro de DESCOBERTA por item, separado
// das entidades de conteúdo. É o que o cliente sincroniza sempre (fino) para
// poder buscar localmente sem baixar conteúdo nenhum.
//
// A regra que atravessa tudo aqui: o pacote leva o CONTRATO e os CASOS de eval,
// nunca a PROVA. A evidência comportamental mora em `skills/_evals/results/`,
// que é user-owned e não viaja (§6.5) — então um pacote recém-construído não
// pode apresentar skill nenhuma como promovida, ainda que o frontmatter alegue.

function entidadeDeSkill(id, frontmatter, corpo = '\ncorpo da skill\n') {
  const texto = `---\n${frontmatter}\n---\n${corpo}`;
  return { path: `skills/${id}/SKILL.md`, sha256: `sha-${id}`, bytes: texto.length, text: texto };
}

const FM_BASE = [
  'name: alfa',
  'description: >-',
  '  Use ao lidar com alfa na área fictícia demo. Gatilhos: alfa, demo alfa.',
  'metadata:',
  '  type: "prompt"',
  '  lifecycle: "active"',
  '  categories: [demo]',
  '  quality_status: "contracted"',
  '  quality_profile: "legal-drafting"',
  '  risk_level: "r2"',
  '  delivery_type: "advisory"',
  '  positive_triggers: ["alfa", "demo alfa"]',
  '  eval_case_ids: ["demo-v5-alfa"]',
].join('\n');

test('a skill vira um registro de descoberta que aponta para a entidade de conteúdo', () => {
  const registros = extrairCatalogo([entidadeDeSkill('alfa', FM_BASE)], 'skills.jsonl.zst');

  assert.equal(registros.length, 1);
  const alfa = registros[0];
  assert.equal(alfa.kind, 'skill');
  assert.equal(alfa.id, 'alfa');
  assert.equal(alfa.entity, 'skills.jsonl.zst', 'o catálogo precisa dizer ONDE o conteúdo vive');
  assert.equal(alfa.path, 'skills/alfa/SKILL.md');
  assert.equal(alfa.sha256, 'sha-alfa');
  assert.deepEqual(alfa.triggers, ['alfa', 'demo alfa']);
  assert.deepEqual(alfa.categories, ['demo']);
  assert.equal(alfa.lifecycle, 'active');
  assert.deepEqual(alfa.eval_case_ids, ['demo-v5-alfa']);
  assert.ok(alfa.description.length > 0 && alfa.description.length <= 220, 'descrição recortada');
  assert.equal(alfa.text, undefined, 'o catálogo é FINO — o corpo da skill não entra nele');
});

test('skill que se declara promovida desce para `contracted` no catálogo', () => {
  // O que NÃO pode acontecer é o pacote sair com skills marcadas `certified`
  // cuja prova ninguém pode conferir (§6.8). A evidência não viaja; declarar
  // promoção sem ela é o motor voltando a mentir na única dimensão em que ele
  // acabou de parar de mentir.
  const promovida = FM_BASE.replace('quality_status: "contracted"', 'quality_status: "certified"');

  const [alfa] = extrairCatalogo([entidadeDeSkill('alfa', promovida)], 'skills.jsonl.zst');

  assert.equal(alfa.quality_status, 'contracted', 'promoção declarada não sobrevive ao empacotamento');
  assert.equal(alfa.high_performance_eligible, false);
  assert.ok(
    alfa.promotion_blocked_by?.some((motivo) => /evid[êe]ncia/i.test(motivo)),
    `o motivo precisa estar no artefato, auditável — recebido: ${JSON.stringify(alfa.promotion_blocked_by)}`
  );
});

test('skill com marcador de contrato legado desce para `contracted`, com o motivo', () => {
  // SPEC §6.8, opção A: o pacote preserva os bytes originais e o marcador antigo
  // serve só para IDENTIFICAR o contrato — nunca para promover.
  const corpo = '\n<!-- CRIMINALSQUAD:HP-CONTRACT:START -->\ncontrato\n<!-- CRIMINALSQUAD:HP-CONTRACT:END -->\n';
  const promovida = FM_BASE.replace('quality_status: "contracted"', 'quality_status: "verified"');

  const [alfa] = extrairCatalogo([entidadeDeSkill('alfa', promovida, corpo)], 'skills.jsonl.zst');

  assert.equal(alfa.quality_status, 'contracted');
  assert.ok(
    alfa.promotion_blocked_by?.some((motivo) => /legad|CRIMINALSQUAD/i.test(motivo)),
    `o marcador legado precisa aparecer como motivo — recebido: ${JSON.stringify(alfa.promotion_blocked_by)}`
  );
});

test('skill com marcador ELEITORAL:HP-CONTRACT (fork de OUTRO produto) também desce pra `contracted`', () => {
  // Achado ao importar o lote de advocacia eleitoral (1000 skills, terceiro):
  // contrato próprio, "alta performance"-like mas de outra ferramenta —
  // `quality_status: "contracted-reviewed"` não é `verified`/`certified`
  // literal, então passaria batido sem o marcador entrar na lista. O motor
  // não confia em rótulo de promoção que não seja o seu próprio vocabulário.
  const corpo = '\n<!-- ELEITORAL:HP-CONTRACT:START -->\ncontrato\n<!-- ELEITORAL:HP-CONTRACT:END -->\n';
  const comStatusEstrangeiro = FM_BASE.replace('quality_status: "contracted"', 'quality_status: "contracted-reviewed"');

  const [alfa] = extrairCatalogo([entidadeDeSkill('alfa', comStatusEstrangeiro, corpo)], 'skills.jsonl.zst');

  assert.equal(alfa.quality_status, 'contracted', 'status estrangeiro normaliza pro vocabulário do motor');
  assert.ok(
    alfa.promotion_blocked_by?.some((motivo) => /legad|ELEITORAL/i.test(motivo)),
    `o marcador ELEITORAL precisa aparecer como motivo — recebido: ${JSON.stringify(alfa.promotion_blocked_by)}`
  );
});

test('o empacotador NÃO reescreve os bytes da skill', () => {
  // A tentação óbvia é normalizar `CRIMINALSQUAD:` → `LEGALSQUAD:` ao empacotar.
  // Reescrever muda os bytes, e `skill_binding.skill_sha256` amarra a evidência
  // a esses bytes exatos: normalizar sem re-bindar converte um erro ruidoso em
  // falha silenciosa, e re-bindar torna o binding tautológico (§6.8).
  const corpo = '\n<!-- CRIMINALSQUAD:HP-CONTRACT:START -->\ncontrato\n';
  const entidade = entidadeDeSkill('alfa', FM_BASE, corpo);
  const original = entidade.text;

  extrairCatalogo([entidade], 'skills.jsonl.zst');

  assert.equal(entidade.text, original, 'a entidade de conteúdo sai do catálogo intocada');
  assert.match(entidade.text, /CRIMINALSQUAD:HP-CONTRACT/, 'os bytes originais são preservados');
});

test('best-practice com entrada no `_catalog.yaml` usa `whenToUse` como description, não só o título', () => {
  // Antes desta mudança, `registroDeBestPractice` só olhava pro `# Título` do
  // markdown — o `whenToUse`, o texto rico que o Arquiteto usa pra casar
  // squad↔best-practice, nunca chegava ao catálogo sincronizável. Resultado:
  // busca local sobre best-practices seria bem mais pobre que a leitura direta
  // do `_catalog.yaml` que o Arquiteto já faz hoje.
  const catalogo = [
    'catalog:',
    '  - id: redacao',
    '    name: "Redação Persuasiva"',
    '    whenToUse: "Redigir ou revisar qualquer peça, parecer ou memorial jurídico."',
    '    file: redacao.md',
    '    obrigatoria: true',
    '',
  ].join('\n');

  const registros = extrairCatalogo([
    { path: '_legalsquad/core/best-practices/_catalog.yaml', sha256: 'sha-cat', bytes: catalogo.length, text: catalogo },
    { path: '_legalsquad/core/best-practices/redacao.md', sha256: 'sha-bp', bytes: 9, text: '# Redação\n\ntexto\n' },
  ], 'best-practices.jsonl.zst');

  assert.equal(registros.length, 1, 'o _catalog.yaml em si não vira registro — é metadado, não item');
  const [redacao] = registros;
  assert.equal(redacao.kind, 'best-practice');
  assert.equal(redacao.id, 'redacao');
  assert.equal(
    redacao.description,
    'Redigir ou revisar qualquer peça, parecer ou memorial jurídico.',
    'description vem do whenToUse do catálogo, não do # Título do markdown'
  );
  assert.equal(redacao.obrigatoria, true, '`obrigatoria: true` do _catalog.yaml precisa sobreviver ao empacotamento');
});

test('best-practice SEM entrada no `_catalog.yaml` (ou sem catálogo nenhum) cai pro título — nunca quebra', () => {
  const registros = extrairCatalogo([
    { path: '_legalsquad/core/best-practices/orfa.md', sha256: 'sha-orfa', bytes: 20, text: '# Best-Practice Órfã\n\ntexto\n' },
  ], 'best-practices.jsonl.zst');

  const [orfa] = registros;
  assert.equal(orfa.description, 'Best-Practice Órfã', 'sem catálogo, o título continua sendo o fallback');
  assert.equal(orfa.obrigatoria, undefined, 'nunca inventa obrigatoriedade pra quem o catálogo não declarou');
});

test('squads, best-practices e agentes de área também entram no catálogo', () => {
  // `extrairCatalogo` recebe entidades já no caminho de INSTALAÇÃO — o remapeamento
  // de autoria → instalação acontece antes, em `pack-build.js`.
  const registros = extrairCatalogo([
    entidadeDeSkill('alfa', FM_BASE),
    { path: 'squads/demo/squad.yaml', sha256: 'sha-squad', bytes: 12, text: 'name: demo\ndescription: Squad sintético\n' },
    { path: '_legalsquad/core/best-practices/redacao.md', sha256: 'sha-bp', bytes: 9, text: '# Redação\n\ntexto\n' },
    { path: '.claude/agents/analista-demo.md', sha256: 'sha-ag', bytes: 40, text: '---\nname: analista-demo\ndescription: Agente sintético de teste.\n---\n\ncorpo\n' },
    { path: 'skills/alfa/references/x.md', sha256: 'sha-ref', bytes: 3, text: 'x' },
    { path: 'squads/demo/agents/redator-demo.custom.md', sha256: 'sha-sq-ag', bytes: 3, text: 'x' },
  ], 'skills.jsonl.zst');

  const tipos = registros.map((r) => `${r.kind}:${r.id}`).sort();
  assert.deepEqual(
    tipos,
    ['agent:analista-demo', 'best-practice:redacao', 'skill:alfa', 'squad:demo'],
    'um registro por ITEM descobrível — arquivos de apoio (references/, agente amarrado a UM squad) não são itens'
  );
});
