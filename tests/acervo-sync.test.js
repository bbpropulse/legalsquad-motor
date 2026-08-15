import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executarSync, planejarSync } from '../src/acervo-sync.js';

// O núcleo decisório do `sync` (SPEC §9.2), separado da rede de propósito: o que
// baixar é decisão, baixar é I/O. Escrever o cliente ANTES do servidor é o jeito
// mais barato de descobrir que o contrato do §7.1 está mal desenhado — e aqui
// ele é exercitado inteiro sem esperar nenhum serviço subir.

const CATALOGO = {
  status: 'active',
  expires: '2026-12-31',
  packs: [
    { pack_id: 'area.criminal', payload_kind: 'tree', latest: '2026.07.2', entitled: true,
      catalog: { url: 'https://cdn/criminal-cat', sha256: 'c1', bytes: 44902 },
      content: { url: 'https://cdn/criminal-con', sha256: 'k1', bytes: 1930244 } },
    { pack_id: 'area.trabalhista', payload_kind: 'tree', latest: '2026.07.1', entitled: true,
      catalog: { url: 'https://cdn/trab-cat', sha256: 'c2', bytes: 51203 },
      content: { url: 'https://cdn/trab-con', sha256: 'k2', bytes: 900000 } },
  ],
  revoked: [],
};

test('sincronizar baixa o catálogo de TODOS os packs e conteúdo de NENHUM', () => {
  // O coração do §6.1: catálogo é fino e desce sempre, conteúdo é gordo e espera
  // ser usado. Com o corpus real medido (4701 itens, 74,5 MB), baixar conteúdo
  // no sync seria centenas de megas antes da primeira tela útil.
  const plano = planejarSync(CATALOGO, { packs: {} }, {});

  assert.deepEqual(
    plano.baixarCatalogo.map((p) => p.pack_id).sort(),
    ['area.criminal', 'area.trabalhista'],
    'o catálogo de tudo desce sempre — é ele que faz a busca local enxergar o corpus inteiro'
  );
  assert.deepEqual(plano.baixarConteudo, [], 'conteúdo não desce no sync de um pack ainda não instalado');
});

test('conteúdo de pack JÁ INSTALADO é atualizado — não vira cache órfão', () => {
  // Quem já tem a área instalada precisa da versão nova: deixar o conteúdo para
  // trás enquanto o catálogo avança produziria uma instalação que se diz
  // atualizada e responde com o conteúdo velho.
  const plano = planejarSync(CATALOGO, { packs: { 'area.criminal': '2026.07.1' } }, {});

  assert.deepEqual(plano.baixarConteudo.map((p) => p.pack_id), ['area.criminal']);
});

test('pack já na versão mais recente não é rebaixado nem rebaixado de novo', () => {
  const plano = planejarSync(CATALOGO, { packs: { 'area.criminal': '2026.07.2' } }, {});

  assert.deepEqual(plano.baixarConteudo, [], 'nada a fazer quando já está na última');
  assert.deepEqual(
    plano.baixarCatalogo.map((p) => p.pack_id),
    ['area.trabalhista'],
    'nem o catálogo, se a versão instalada já é a última'
  );
});

test('`--content` força o conteúdo de tudo a que se tem direito', () => {
  // Para quem vai ficar sem rede de propósito e quer pagar o download antes.
  const plano = planejarSync(CATALOGO, { packs: {} }, { incluirConteudo: true });

  assert.deepEqual(
    plano.baixarConteudo.map((p) => p.pack_id).sort(),
    ['area.criminal', 'area.trabalhista']
  );
});

test('`entitled: false` desce o catálogo e NUNCA o conteúdo', () => {
  // A forma normativa de "existe, sua licença não cobre" (§7.1). O item aparece
  // na busca com o selo certo, em vez de sumir — sumir faria o motor dizer "não
  // existe" para o que o usuário poderia comprar.
  const semDireito = {
    ...CATALOGO,
    status: 'none',
    packs: CATALOGO.packs.map((p) => ({ pack_id: p.pack_id, payload_kind: p.payload_kind, latest: p.latest, entitled: false, catalog: p.catalog })),
  };

  const plano = planejarSync(semDireito, { packs: {} }, { incluirConteudo: true });

  assert.equal(plano.baixarCatalogo.length, 2, 'sem licença o catálogo desce igual');
  assert.deepEqual(plano.baixarConteudo, [], 'nem com --content: não há direito');
});

test('licença vencida NÃO atualiza e NÃO revoga', () => {
  // Assinatura vencida é rotina, não anomalia (§8.0). O que foi baixado durante
  // a vigência continua servindo, somente leitura — apagar conteúdo pago no meio
  // de um caso é problema com o cliente, não decisão de produto.
  const vencido = { ...CATALOGO, status: 'expired' };

  const plano = planejarSync(vencido, { packs: { 'area.criminal': '2026.07.1' } }, { incluirConteudo: true });

  assert.deepEqual(plano.baixarCatalogo, [], 'vencida não atualiza');
  assert.deepEqual(plano.baixarConteudo, []);
  assert.deepEqual(plano.revogar, [], 'e sobretudo NÃO apaga o que já está instalado');
  assert.match(plano.motivo, /vencid|expired/i, 'o motivo precisa dizer por que nada será feito');
});

test('`revoked` remove do cache — e é só para conteúdo errado', () => {
  const comRevogado = { ...CATALOGO, revoked: ['acervo.jurisprudencia.stj.penal'] };

  const plano = planejarSync(comRevogado, { packs: { 'acervo.jurisprudencia.stj.penal': '2026.07.1' } }, {});

  assert.deepEqual(plano.revogar, ['acervo.jurisprudencia.stj.penal']);
});

test('catálogo sem `packs` é recusado em vez de virar "nada a sincronizar"', () => {
  // Lista vazia é indistinguível de "não há nada" — e o §7.1 proíbe o servidor de
  // devolver isso. Se vier assim mesmo, o cliente precisa gritar: um sync que
  // reporta "tudo em dia" sobre uma resposta vazia é a mentira mais barata de
  // produzir e a mais cara de descobrir.
  const plano = planejarSync({ status: 'active', packs: [] }, { packs: { 'area.criminal': '2026.07.1' } }, {});

  assert.equal(plano.ok, false);
  assert.match(plano.motivo, /vazi|nenhum pack/i);
  assert.deepEqual(plano.revogar, [], 'e não pode interpretar a ausência como revogação');
});

// ── Execução: verificar antes de aplicar, e não deixar um pack derrubar o sync ──

const PACK_A = { pack_id: 'area.alfa', latest: '2026.07.2', catalog: { url: 'u-a' } };
const PACK_B = { pack_id: 'area.beta', latest: '2026.07.1', catalog: { url: 'u-b' } };

/** Injeções mínimas: baixar devolve o pacote já desempacotado; verificar é o gate. */
function ambiente({ falhaAoBaixar = [], falhaAoVerificar = [] } = {}) {
  const aplicados = [];
  return {
    aplicados,
    baixar: async (url) => {
      if (falhaAoBaixar.includes(url)) throw new Error(`rede caiu em ${url}`);
      return { manifesto: { pack_id: url }, entidades: [] };
    },
    verificar: (manifesto) => (falhaAoVerificar.includes(manifesto.pack_id)
      ? { ok: false, problemas: [`sha256 não confere — ${manifesto.pack_id}`] }
      : { ok: true, problemas: [] }),
    aplicar: async (pack) => { aplicados.push(pack.pack_id); },
  };
}

test('pacote com assinatura inválida é recusado e o sync SEGUE com os demais', async () => {
  // §6.7: "o sync segue com os demais e reporta o recusado com o motivo". Abortar
  // tudo por causa de um pacote deixaria o usuário sem as atualizações boas por
  // causa da ruim — e recusar em silêncio seria indistinguível de não haver pacote.
  const env = ambiente({ falhaAoVerificar: ['u-a'] });

  const r = await executarSync({ baixarCatalogo: [PACK_A, PACK_B], baixarConteudo: [], revogar: [] }, env);

  assert.deepEqual(env.aplicados, ['area.beta'], 'o pacote bom foi aplicado');
  assert.equal(r.recusados.length, 1);
  assert.match(r.recusados[0].motivo, /sha256/);
  assert.equal(r.recusados[0].pack_id, 'area.alfa', 'o recusado é nomeado');
});

test('falha de rede num pack não impede os outros', async () => {
  const env = ambiente({ falhaAoBaixar: ['u-a'] });

  const r = await executarSync({ baixarCatalogo: [PACK_A, PACK_B], baixarConteudo: [], revogar: [] }, env);

  assert.deepEqual(env.aplicados, ['area.beta']);
  assert.match(r.recusados[0].motivo, /rede caiu/);
});

test('o estado NÃO registra como instalado o pack que falhou', async () => {
  // A consequência silenciosa: se o estado avançasse a versão de um pack que não
  // aplicou, o próximo sync o consideraria em dia e ele nunca mais seria baixado.
  // O usuário ficaria com a versão velha achando que tem a nova.
  const env = ambiente({ falhaAoVerificar: ['u-a'] });
  const estadoAnterior = { packs: { 'area.alfa': '2026.06.1', 'area.beta': '2026.06.1' } };

  const r = await executarSync(
    { baixarCatalogo: [PACK_A, PACK_B], baixarConteudo: [], revogar: [] },
    env,
    estadoAnterior
  );

  assert.equal(r.estado.packs['area.alfa'], '2026.06.1', 'o que falhou fica na versão antiga');
  assert.equal(r.estado.packs['area.beta'], '2026.07.1', 'o que aplicou avança');
});

test('nada é aplicado sem passar pela verificação', async () => {
  // O gate não é opcional. Se algum caminho aplicasse antes de verificar, toda a
  // assinatura Ed25519 viraria decoração.
  const ordem = [];
  const env = {
    baixar: async () => { ordem.push('baixar'); return { manifesto: { pack_id: 'x' }, entidades: [] }; },
    verificar: () => { ordem.push('verificar'); return { ok: true, problemas: [] }; },
    aplicar: async () => { ordem.push('aplicar'); },
  };

  await executarSync({ baixarCatalogo: [PACK_A], baixarConteudo: [], revogar: [] }, env);

  assert.deepEqual(ordem, ['baixar', 'verificar', 'aplicar']);
});

test('pack instalado que SUMIU do catálogo é reportado como despublicado', () => {
  // O servidor nunca esconde pack por falta de direito — ele o lista com
  // `entitled: false`, para a busca poder dizer "existe, não está liberado".
  // Então AUSÊNCIA da lista só tem um significado: foi despublicado.
  //
  // Sem isto, a entrada ficava no manifesto local para sempre: `acervo status`
  // contava 36 packs enquanto o servidor tinha 35, e o número mentia sobre o
  // que existe. Aconteceu de verdade ao despublicar `area._transversal`.
  const catalogo = {
    status: 'active',
    packs: [{ pack_id: 'area.civil', payload_kind: 'tree', latest: '2026.08.14', entitled: true }],
  };
  const estado = { packs: { 'area.civil': '2026.08.14', 'area._transversal': '2026.08.14' } };

  const plano = planejarSync(catalogo, estado);

  assert.equal(plano.ok, true);
  assert.deepEqual(plano.despublicados, ['area._transversal']);
});

test('despublicado NÃO entra em `revogar` — são coisas diferentes', () => {
  // `revogar` existe para conteúdo ERRADO ("apague isto"), e por isso apaga.
  // Despublicar é "não distribuo mais": o que o usuário já baixou continua
  // valendo, e apagar por ausência transformaria uma área descontinuada em
  // perda de conteúdo que ele tinha o direito de ter. Mesma família da regra de
  // licença vencida — degrada, nunca revoga.
  // O catálogo traz OUTRO pack de propósito: `packs: []` é recusado antes
  // (§7.1 — lista vazia é servidor com problema, e tratá-la como despublicação
  // apagaria o manifesto inteiro por causa de uma resposta suspeita).
  const catalogo = {
    status: 'active',
    packs: [{ pack_id: 'area.viva', payload_kind: 'tree', latest: '2026.08.14', entitled: true }],
  };
  const estado = { packs: { 'area.viva': '2026.08.14', 'area.sumiu': '2026.08.14' } };

  const plano = planejarSync(catalogo, estado);

  assert.deepEqual(plano.despublicados, ['area.sumiu']);
  assert.deepEqual(plano.revogar, [], 'sumir do catálogo não é ordem de apagar');
});

test('catálogo VAZIO não despublica nada — é servidor com problema, não despublicação em massa', () => {
  // A porta que já existia (§7.1) cobre o pior caso deste recurso: uma resposta
  // vazia marcaria TODO pack instalado como despublicado e esvaziaria o
  // manifesto de uma instalação inteira.
  const plano = planejarSync({ status: 'active', packs: [] }, { packs: { 'area.civil': '2026.08.14' } });

  assert.equal(plano.ok, false, 'catálogo vazio é recusado, não interpretado');
  assert.deepEqual(plano.despublicados || [], []);
});

test('licença vencida NÃO marca nada como despublicado', () => {
  // Com `expired` o catálogo pode vir sem packs, e tratar isso como
  // despublicação apagaria o manifesto inteiro de quem só atrasou o pagamento —
  // exatamente o "vira tijolo" que o produto promete não fazer.
  const catalogo = { status: 'expired', expires: '2026-01-01', packs: [] };
  const estado = { packs: { 'area.civil': '2026.08.14' } };

  const plano = planejarSync(catalogo, estado);

  assert.deepEqual(plano.despublicados || [], [], 'vencida degrada, não despublica');
});

test('executarSync tira o despublicado do estado, sem tocar em arquivo', async () => {
  const catalogo = {
    status: 'active',
    packs: [{ pack_id: 'area.civil', payload_kind: 'tree', latest: '2026.08.14', entitled: true }],
  };
  const estado = { packs: { 'area.civil': '2026.08.14', 'area._transversal': '2026.08.14' } };
  const plano = planejarSync(catalogo, estado);

  const aplicados = [];
  const resultado = await executarSync(
    plano,
    { baixar: async () => Buffer.alloc(0), verificar: () => ({ ok: true, problemas: [] }), aplicar: (p) => { aplicados.push(p); return { ok: true }; } },
    estado
  );

  assert.equal(resultado.estado.packs['area._transversal'], undefined, 'a entrada órfã sai do manifesto');
  assert.equal(resultado.estado.packs['area.civil'], '2026.08.14', 'o que continua no catálogo fica');
  assert.ok(!aplicados.length, 'despublicar não aplica nem apaga nada em disco');
});
