import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { generateKeyPairSync } from 'node:crypto';
import { encodeEntity, selarPacote, verificarPacote } from '../src/pack-format.js';
import { empacotarParaTransporte } from '../src/pack-archive.js';
import { baixar } from '../src/acervo-transport.js';

// `baixar(url)` é o fio de rede que falta ao `sync` (§9.2) — busca bytes e
// devolve `{manifesto, entidades}` no MESMO shape que `lerPacoteDoDisco`
// devolve, pra `verificarPacote`/`aplicarPacote` consumirem sem diferença
// entre pacote local e baixado.

const CHAVES = generateKeyPairSync('ed25519');

function pacoteReal() {
  const entidades = [
    { file: 'catalog.jsonl.zst', role: 'catalog', buffer: encodeEntity([{ path: 'a', v: 1 }]) },
    { file: 'skills.jsonl.zst', role: 'content', buffer: encodeEntity([{ path: 'b', v: 2 }]) },
  ];
  const manifesto = selarPacote(
    { pack_id: 'area.demo', version: '2026.07.1', payload_kind: 'tree' },
    entidades,
    CHAVES.privateKey
  );
  return { manifesto, entidades };
}

function subirServidorDeFixture(resposta) {
  const servidor = createServer((req, res) => {
    if (typeof resposta === 'function') return resposta(req, res);
    res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
    res.end(resposta);
  });
  return new Promise((resolve) => {
    servidor.listen(0, () => {
      const { port } = servidor.address();
      resolve({
        url: `http://127.0.0.1:${port}/pacote.bin`,
        fechar: () => new Promise((r) => { servidor.closeAllConnections(); servidor.close(r); }),
      });
    });
  });
}

test('baixar: devolve {manifesto, entidades} no mesmo shape de lerPacoteDoDisco, e passa em verificarPacote', async () => {
  const { manifesto, entidades } = pacoteReal();
  const buffer = empacotarParaTransporte(manifesto, entidades);
  const s = await subirServidorDeFixture(buffer);

  try {
    const baixado = await baixar(s.url);
    assert.deepEqual(baixado.manifesto, manifesto);
    assert.equal(baixado.entidades.length, entidades.length);

    const veredito = verificarPacote(baixado.manifesto, baixado.entidades, CHAVES.publicKey);
    assert.equal(veredito.ok, true, `esperava ok — recebido: ${JSON.stringify(veredito.problemas)}`);
  } finally {
    await s.fechar();
  }
});

test('baixar: HTTP não-2xx lança erro com o status, não devolve dado parcial', async () => {
  const s = await subirServidorDeFixture((req, res) => {
    res.writeHead(404, {});
    res.end('não achei');
  });

  try {
    await assert.rejects(() => baixar(s.url), /404/);
  } finally {
    await s.fechar();
  }
});

test('baixar: resposta com corpo corrompido (não é um pack-archive válido) lança erro claro, não trava', async () => {
  const s = await subirServidorDeFixture(Buffer.from('isto não é um pacote de verdade'));

  try {
    await assert.rejects(() => baixar(s.url), /pack-archive/);
  } finally {
    await s.fechar();
  }
});
