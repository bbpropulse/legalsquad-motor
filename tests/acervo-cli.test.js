import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import { acervoCli } from '../src/acervo-cli.js';
import { CAMINHO_ESTADO, gravarEstado, lerEstado } from '../src/acervo-estado.js';
import { construirPacotes } from '../src/pack-build.js';
import { empacotarParaTransporte } from '../src/pack-archive.js';
import { AREA_DEMO } from './fixtures/caminhos.js';

// O CLI é camada fina — decisão está em `acervo-sync.js`, estado em
// `acervo-estado.js`. O que se testa aqui é o que só existe aqui: que os
// comandos DIZEM A VERDADE sobre o estado do mundo, e que a fiação de rede
// (F3) de fato baixa, verifica e aplica.

function projeto() {
  return mkdtempSync(join(tmpdir(), 'legalsquad-acervo-cli-'));
}

async function silenciar(fn) {
  const log = console.log;
  const err = console.error;
  const saida = [];
  console.log = (...a) => saida.push(a.join(' '));
  console.error = (...a) => saida.push(a.join(' '));
  try {
    return { resultado: await fn(), saida: saida.join('\n') };
  } finally {
    console.log = log;
    console.error = err;
  }
}

test('status sem nunca ter sincronizado diz isso, e não "vazio"', async () => {
  const { resultado, saida } = await silenciar(() => acervoCli('status', projeto()));

  assert.equal(resultado.success, true);
  assert.match(saida, /NUNCA-SINCRONIZADO/);
});

test('status mostra o que está instalado e há quantos dias', async () => {
  const raiz = projeto();
  gravarEstado(raiz, { packs: { 'area.criminal': '2026.07.2' } }, { sincronizadoEm: '2026-07-01T00:00:00Z' });

  const { saida } = await silenciar(() => acervoCli('status', raiz, {}, Date.parse('2026-07-29T00:00:00Z')));

  assert.match(saida, /area\.criminal@2026\.07\.2/);
  assert.match(saida, /28 dia/);
});

test('cache velho recebe selo de DESATUALIZADO', async () => {
  const raiz = projeto();
  gravarEstado(raiz, { packs: { 'area.criminal': '1' } }, { sincronizadoEm: '2026-01-01T00:00:00Z' });

  const { saida } = await silenciar(() => acervoCli('status', raiz, {}, Date.parse('2026-07-29T00:00:00Z')));

  assert.match(saida, /DESATUALIZADO/);
});

test('estado ilegível BLOQUEIA o comando em vez de reportar vazio', async () => {
  const raiz = projeto();
  mkdirSync(join(raiz, 'acervo', '_packs'), { recursive: true });
  writeFileSync(join(raiz, CAMINHO_ESTADO), '{ quebrado');

  const { resultado, saida } = await silenciar(() => acervoCli('status', raiz));

  assert.equal(resultado.success, false);
  assert.match(saida, /BLOQUEADO/);
});

test('sync sem servidor configurado recusa — e diz a verdade sobre o porquê', async () => {
  const { resultado, saida } = await silenciar(() => acervoCli('sync', projeto()));

  assert.equal(resultado.success, false);
  assert.match(saida, /BLOQUEADO/);
  assert.match(saida, /apply-pack/, 'precisa apontar o caminho local, que funciona hoje');
});

test('subcomando desconhecido é recusado, não ignorado', async () => {
  const { resultado, saida } = await silenciar(() => acervoCli('inventado', projeto()));

  assert.equal(resultado.success, false);
  assert.match(saida, /sync, status ou packs/);
});

test('sync com catalog_url mas sem chave pública configurada recusa — não dá pra verificar sem chave', async () => {
  const raiz = projeto();
  mkdirSync(join(raiz, '_legalsquad', 'config'), { recursive: true });
  writeFileSync(
    join(raiz, '_legalsquad', 'config', 'acervo.json'),
    JSON.stringify({ catalog_url: 'http://localhost:1/v1/catalog' })
  );

  const { resultado, saida } = await silenciar(() => acervoCli('sync', raiz));

  assert.equal(resultado.success, false);
  assert.match(saida, /chave p[úu]blica/i);
});

// --- laço completo: servidor de fixture (catálogo + download) → sync real ---

function subirServidorDeFixture({ catalogo, arquivoBaixavel }) {
  const servidor = createServer((req, res) => {
    if (req.url.startsWith('/v1/catalog')) {
      const corpo = JSON.stringify(catalogo);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(corpo);
    }
    if (req.url === '/download') {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      return res.end(arquivoBaixavel);
    }
    res.writeHead(404, {});
    res.end();
  });
  return new Promise((resolve) => {
    servidor.listen(0, () => {
      const { port } = servidor.address();
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        fechar: () => new Promise((r) => { servidor.closeAllConnections(); servidor.close(r); }),
      });
    });
  });
}

test('sync completo: baixa, verifica e aplica um pacote real, e o estado reflete a versão instalada', async () => {
  const chaves = generateKeyPairSync('ed25519');
  const { pacotes } = construirPacotes({
    raizConteudo: AREA_DEMO,
    areaId: 'demo',
    chavePrivada: chaves.privateKey,
    versao: '2026.07.1',
  });
  const areaDemo = pacotes.find((p) => p.packId === 'area.demo');
  const buffer = empacotarParaTransporte(areaDemo.manifesto, areaDemo.entidades);

  const catalogo = {
    status: 'active',
    expires: '2099-12-31',
    packs: [{
      pack_id: 'area.demo',
      payload_kind: 'tree',
      latest: '2026.07.1',
      entitled: true,
      catalog: { url: null, sha256: 'x', bytes: buffer.length },
      content: { url: null, sha256: 'x', bytes: buffer.length },
    }],
    revoked: [],
  };
  const s = await subirServidorDeFixture({ catalogo, arquivoBaixavel: buffer });
  catalogo.packs[0].catalog.url = `${s.baseUrl}/download`;
  catalogo.packs[0].content.url = `${s.baseUrl}/download`;

  const raiz = projeto();
  const pubKeyPath = join(raiz, 'signing.pub.pem');
  writeFileSync(pubKeyPath, chaves.publicKey.export({ type: 'spki', format: 'pem' }));
  mkdirSync(join(raiz, '_legalsquad', 'config'), { recursive: true });
  writeFileSync(
    join(raiz, '_legalsquad', 'config', 'acervo.json'),
    JSON.stringify({ catalog_url: `${s.baseUrl}/v1/catalog`, license: 'LS-TESTE-0001', signing_public_key_path: pubKeyPath })
  );

  try {
    const { resultado, saida } = await silenciar(() => acervoCli('sync', raiz));

    assert.equal(resultado.success, true, saida);
    assert.deepEqual(resultado.aplicados, ['area.demo']);

    const estado = lerEstado(raiz);
    assert.equal(estado.packs['area.demo'], '2026.07.1');

    // Um arquivo de verdade do pacote precisa ter sido escrito no destino.
    assert.ok(
      existsSync(join(raiz, 'skills', 'demo-peca-alpha', 'SKILL.md')),
      'esperava a skill do pacote aplicada no disco'
    );
  } finally {
    await s.fechar();
  }
});
