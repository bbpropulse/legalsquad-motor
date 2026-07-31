import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ativarCli } from '../src/acervo-ativar.js';
import { CATALOG_URL_PADRAO } from '../src/acervo-config.js';

// `ativar` é o único passo que o ALUNO executa. Ele recebe uma coisa da
// compra — a licença — e nada mais: URL do servidor e chave de verificação
// vêm embarcadas. O comando existe para que a skill possa fazer isso por ele
// em linguagem natural ("minha licença é LS-…"), sem ninguém editar JSON.

function projeto() {
  return mkdtempSync(join(tmpdir(), 'legalsquad-ativar-'));
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

function subirServidorDeFixture(respostaDoCatalogo) {
  const servidor = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(respostaDoCatalogo(req)));
  });
  return new Promise((resolve) => {
    servidor.listen(0, () => {
      const { port } = servidor.address();
      resolve({
        url: `http://127.0.0.1:${port}/v1/catalog`,
        fechar: () => new Promise((r) => { servidor.closeAllConnections(); servidor.close(r); }),
      });
    });
  });
}

const configDe = (raiz) => JSON.parse(readFileSync(join(raiz, '_legalsquad', 'config', 'acervo.json'), 'utf8'));

test('ativar sem licença recusa e explica — nunca grava config vazia', async () => {
  const raiz = projeto();
  const { resultado, saida } = await silenciar(() => ativarCli('', raiz, { skipSync: true }));

  assert.equal(resultado.success, false);
  assert.match(saida, /licen[çc]a/i);
  assert.equal(existsSync(join(raiz, '_legalsquad', 'config', 'acervo.json')), false);
});

test('ativar recusa uma licença com formato claramente inválido antes de bater no servidor', async () => {
  const raiz = projeto();
  const { resultado, saida } = await silenciar(() => ativarCli('isso-nao-e-uma-licenca', raiz, { skipSync: true }));

  assert.equal(resultado.success, false);
  assert.match(saida, /formato/i);
  assert.equal(existsSync(join(raiz, '_legalsquad', 'config', 'acervo.json')), false);
});

test('ativar grava SÓ a licença — URL e chave ficam implícitas nos padrões embarcados', async () => {
  const s = await subirServidorDeFixture(() => ({ status: 'active', expires: '2099-12-31', packs: [], revoked: [] }));
  const raiz = projeto();

  try {
    const { resultado } = await silenciar(
      () => ativarCli('LS-1234-5678-90AB-CDEF', raiz, { skipSync: true, catalogUrl: s.url })
    );

    assert.equal(resultado.success, true);
    const config = configDe(raiz);
    assert.equal(config.license, 'LS-1234-5678-90AB-CDEF');
    assert.equal(config.signing_public_key_path, undefined, 'a chave vem embarcada — o aluno não tem arquivo .pem');
  } finally {
    await s.fechar();
  }
});

test('ativar aceita a licença em caixa baixa e com espaços — copiar do WhatsApp não pode quebrar', async () => {
  const s = await subirServidorDeFixture(() => ({ status: 'active', expires: '2099-12-31', packs: [], revoked: [] }));
  const raiz = projeto();

  try {
    await silenciar(() => ativarCli('  ls-1234-5678-90ab-cdef  ', raiz, { skipSync: true, catalogUrl: s.url }));
    assert.equal(configDe(raiz).license, 'LS-1234-5678-90AB-CDEF');
  } finally {
    await s.fechar();
  }
});

test('a licença normalizada é a que vai no header — servidor não recebe caixa baixa', async () => {
  let recebido = null;
  const s = await subirServidorDeFixture((req) => {
    recebido = req.headers.authorization;
    return { status: 'active', expires: '2099-12-31', packs: [], revoked: [] };
  });

  try {
    await silenciar(() => ativarCli(' ls-1234-5678-90ab-cdef ', projeto(), { skipSync: true, catalogUrl: s.url }));
    assert.equal(recebido, 'Bearer LS-1234-5678-90AB-CDEF');
  } finally {
    await s.fechar();
  }
});

test('ativar confere a licença contra o servidor e reporta que valeu', async () => {
  const s = await subirServidorDeFixture(() => ({ status: 'active', expires: '2099-12-31', packs: [], revoked: [] }));
  const raiz = projeto();

  try {
    const { resultado, saida } = await silenciar(
      () => ativarCli('LS-1234-5678-90AB-CDEF', raiz, { skipSync: true, catalogUrl: s.url })
    );
    assert.equal(resultado.success, true);
    assert.equal(resultado.status, 'active');
    assert.match(saida, /ativad|v[áa]lida/i);
  } finally {
    await s.fechar();
  }
});

test('licença que o servidor NÃO reconhece: recusa, avisa, e não deixa config mentirosa para trás', async () => {
  // Gravar uma licença que o servidor rejeita faria todo `sync` seguinte
  // falhar com uma mensagem sobre outra coisa. Melhor não gravar.
  const s = await subirServidorDeFixture(() => ({ status: 'none', expires: null, packs: [], revoked: [] }));
  const raiz = projeto();

  try {
    const { resultado, saida } = await silenciar(
      () => ativarCli('LS-1234-5678-90AB-CDEF', raiz, { skipSync: true, catalogUrl: s.url })
    );
    assert.equal(resultado.success, false);
    assert.match(saida, /n[ãa]o (foi )?reconhecid|inv[áa]lida/i);
    assert.equal(existsSync(join(raiz, '_legalsquad', 'config', 'acervo.json')), false);
  } finally {
    await s.fechar();
  }
});

test('licença VENCIDA ativa mesmo assim, com aviso — cache vale, e o aluno precisa saber pra renovar', async () => {
  const s = await subirServidorDeFixture(() => ({ status: 'expired', expires: '2020-01-01', packs: [], revoked: [] }));
  const raiz = projeto();

  try {
    const { resultado, saida } = await silenciar(
      () => ativarCli('LS-1234-5678-90AB-CDEF', raiz, { skipSync: true, catalogUrl: s.url })
    );
    assert.equal(resultado.success, true, 'vencida não é inválida — degrada, não bloqueia');
    assert.equal(resultado.status, 'expired');
    assert.match(saida, /vencid|expirad/i);
    assert.equal(configDe(raiz).license, 'LS-1234-5678-90AB-CDEF');
  } finally {
    await s.fechar();
  }
});

test('servidor fora do ar: não grava e diz que não deu para conferir — sem fingir sucesso', async () => {
  const raiz = projeto();
  const { resultado, saida } = await silenciar(
    () => ativarCli('LS-1234-5678-90AB-CDEF', raiz, {
      skipSync: true,
      catalogUrl: 'http://127.0.0.1:1/v1/catalog',
    })
  );

  assert.equal(resultado.success, false);
  assert.match(saida, /servidor|conex|alcan/i);
  assert.equal(existsSync(join(raiz, '_legalsquad', 'config', 'acervo.json')), false);
});

test('a URL padrão embarcada é a usada quando nenhuma é passada', async () => {
  // Sem rede de propósito: uma licença de formato inválido retorna ANTES de
  // qualquer fetch, e o resultado já carrega a URL que teria sido usada. É o
  // que garante que o aluno sem config nenhuma aponta para produção, e não
  // para lugar nenhum.
  const { resultado } = await silenciar(() => ativarCli('formato-invalido', projeto(), { skipSync: true }));
  assert.equal(resultado.success, false);
  assert.equal(resultado.catalogUrl, CATALOG_URL_PADRAO);
});
