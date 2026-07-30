import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { decodeEntity } from '../src/pack-format.js';
import { construirPacotes } from '../src/pack-build.js';
import { AREA_DEMO } from './fixtures/caminhos.js';

// Caminho de AUTORIA (onde o curador escreve, no diretório de conteúdo) não é
// sempre o mesmo caminho de INSTALAÇÃO (onde o motor de fato procura em
// runtime). Best-practices é o caso que provou isso: o curador escreve em
// `core/best-practices/`, mas o motor procura em `_legalsquad/core/best-practices/`
// (confirmado em `src/skill-catalog.js:584` e três citações em
// `runner.pipeline.md`) — e o empacotador materializava no caminho de AUTORIA,
// não no de INSTALAÇÃO. As best-practices empacotadas eram invisíveis ao motor,
// em silêncio: o runner só registra WARNING e segue sem a régua, então ninguém
// jamais veria isto quebrado — leria como "área sem essa best-practice".

const CHAVES = generateKeyPairSync('ed25519');

function construir() {
  return construirPacotes({
    raizConteudo: AREA_DEMO,
    areaId: 'demo',
    chavePrivada: CHAVES.privateKey,
    versao: '2026.07.1',
  });
}

function conteudoDoPacote(pacotes, packId) {
  const pacote = pacotes.find((p) => p.packId === packId);
  return pacote.entidades
    .filter((e) => e.role === 'content')
    .flatMap((e) => decodeEntity(e.buffer));
}

test('best-practice materializa em `_legalsquad/core/best-practices/`, não em `core/best-practices/`', () => {
  const { pacotes } = construir();
  const conteudo = conteudoDoPacote(pacotes, 'area.demo');

  const caminhos = conteudo.map((a) => a.path);
  assert.ok(
    caminhos.some((p) => p.startsWith('_legalsquad/core/best-practices/')),
    `nenhuma best-practice em _legalsquad/core/best-practices/ — recebido: ${JSON.stringify(caminhos.filter((p) => p.includes('best-practice')))}`
  );
  assert.equal(
    caminhos.some((p) => p.startsWith('core/best-practices/') && !p.startsWith('_legalsquad/')),
    false,
    'nada pode sobrar no caminho de autoria — só no de instalação'
  );
});

test('`applies_to` do manifesto declara o caminho de INSTALAÇÃO, não o de autoria', () => {
  // `applies_to` é o whitelist de contenção que o `pack-apply` checa contra o
  // `path` de cada arquivo (§6.5) — se declarasse o caminho de autoria, a
  // contenção rejeitaria o próprio pacote que o build acabou de gerar.
  const { pacotes } = construir();
  const area = pacotes.find((p) => p.packId === 'area.demo');

  assert.ok(area.manifesto.applies_to.includes('_legalsquad/core/best-practices/'));
  assert.equal(area.manifesto.applies_to.includes('core/best-practices/'), false);
});

// ── Agente reutilizável de área: mesmo mecanismo, gancho novo ──────────────

test('agente de área materializa em `.claude/agents/`, e conta no manifesto', () => {
  const { pacotes } = construir();
  const area = pacotes.find((p) => p.packId === 'area.demo');
  const conteudo = conteudoDoPacote(pacotes, 'area.demo');

  assert.ok(
    conteudo.some((a) => a.path === '.claude/agents/analista-demo.md'),
    `esperava .claude/agents/analista-demo.md — recebido: ${JSON.stringify(conteudo.map((a) => a.path).filter((p) => p.includes('agent')))}`
  );
  assert.ok(area.manifesto.applies_to.includes('.claude/agents/'));
  assert.equal(area.manifesto.counts.agents, 1);
});

test('o catálogo indexa o agente de área com `kind: agent`', () => {
  const { pacotes } = construir();
  const area = pacotes.find((p) => p.packId === 'area.demo');
  const catalogo = area.entidades.find((e) => e.role === 'catalog');
  const registros = decodeEntity(catalogo.buffer);

  const agente = registros.find((r) => r.id === 'analista-demo');
  assert.ok(agente, `analista-demo ausente do catálogo — recebido: ${JSON.stringify(registros.map((r) => r.id))}`);
  assert.equal(agente.kind, 'agent');
  assert.match(agente.description, /analisa o material bruto/);
});
