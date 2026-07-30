import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { aplicarPacote, validarContencao } from '../src/pack-apply.js';
import { construirPacotes } from '../src/pack-build.js';
import { decodeEntity, verificarPacote } from '../src/pack-format.js';
import { AREA_DEMO } from './fixtures/caminhos.js';

// Contenção na aplicação (SPEC §6.5). Um pacote assinado ainda é conteúdo REMOTO
// materializando arquivos na máquina de um advogado — a assinatura prova origem,
// não boa-fé de quem tinha a chave.
//
// A semântica que atravessa tudo aqui: violação recusa o PACOTE INTEIRO, nunca
// só a linha. Pular a linha hostil em silêncio instalaria o resto de um pacote
// que já provou não merecer confiança, e o usuário veria uma instalação normal.

const APPLIES_TO = ['skills/', 'squads/', 'core/best-practices/'];

function arquivos(...caminhos) {
  return caminhos.map((path) => ({ path, sha256: 'x', bytes: 1, text: 'x' }));
}

function verificar(lista, appliesTo = APPLIES_TO) {
  return validarContencao({ applies_to: appliesTo, payload_kind: 'tree' }, lista);
}

test('caminho legítimo dentro de applies_to é aceito', () => {
  const veredito = verificar(arquivos('skills/alfa/SKILL.md', 'squads/demo/squad.yaml'));

  assert.deepEqual(veredito.problemas, []);
  assert.equal(veredito.ok, true);
});

test('caminho absoluto ou com `..` recusa o pacote inteiro', () => {
  for (const hostil of ['/etc/passwd', 'skills/../../.ssh/authorized_keys', '../fora.md']) {
    const veredito = verificar(arquivos('skills/alfa/SKILL.md', hostil));

    assert.equal(veredito.ok, false, `${hostil} tinha de recusar`);
    assert.ok(
      veredito.problemas.some((p) => p.includes(hostil)),
      `o motivo precisa nomear o caminho — recebido: ${JSON.stringify(veredito.problemas)}`
    );
  }
});

test('caminho fora de applies_to recusa o pacote inteiro', () => {
  const veredito = verificar(arquivos('skills/alfa/SKILL.md', 'dashboard/index.html'));

  assert.equal(veredito.ok, false);
  assert.ok(veredito.problemas.some((p) => /applies_to/.test(p)));
});

test('área user-owned é recusada MESMO que o pacote a declare em applies_to', () => {
  // O teste que separa contenção de teatro. `applies_to` vem do próprio pacote —
  // um pacote hostil declara o que quiser. Se a regra 2 fosse a única, bastaria
  // declarar `casos/` para escrever em cima do dado sigiloso do cliente.
  const proibidos = [
    'casos/cliente-x/segredo.md',
    'output/peca-final.md',
    'skills/_evals/results/alfa.json',
    '.env',
    '_legalsquad/_memory/company.md',
    'acervo/jurisprudencia/stj.md',
  ];

  for (const caminho of proibidos) {
    const prefixo = `${caminho.split('/')[0]}/`;
    const veredito = verificar(arquivos(caminho), [...APPLIES_TO, prefixo]);

    assert.equal(veredito.ok, false, `${caminho} é user-owned e tinha de recusar`);
    assert.ok(
      veredito.problemas.some((p) => p.includes(caminho)),
      `o motivo precisa nomear ${caminho} — recebido: ${JSON.stringify(veredito.problemas)}`
    );
  }
});

test('`acervo/_packs/` é a exceção gerenciada dentro de `acervo/`', () => {
  // `acervo/` é do usuário; `acervo/_packs/` é a subárvore que o sync gerencia.
  // Confundir as duas ou apagaria curadoria do usuário, ou impediria o sync de
  // gravar o que baixou.
  const veredito = verificar(arquivos('acervo/_packs/acervo.demo/dados.jsonl'), ['acervo/_packs/']);

  assert.deepEqual(veredito.problemas, []);
});

test('caminho repetido no mesmo pacote recusa o pacote inteiro', () => {
  const veredito = verificar(arquivos('skills/alfa/SKILL.md', 'skills/alfa/SKILL.md'));

  assert.equal(veredito.ok, false);
  assert.ok(veredito.problemas.some((p) => /skills\/alfa\/SKILL\.md/.test(p)));
});

test('o veredito nomeia TODAS as violações, não só a primeira', () => {
  // Recusar na primeira esconde as outras: o curador corrige uma, roda de novo,
  // descobre a seguinte. Um pacote hostil merece ser diagnosticado de uma vez.
  const veredito = verificar(arquivos('/etc/passwd', 'casos/x.md', 'fora/y.md'));

  assert.equal(veredito.ok, false);
  assert.ok(veredito.problemas.length >= 3, `esperava 3+ motivos, veio ${veredito.problemas.length}`);
});

// ── Aplicação: nada é escrito antes de tudo ser verificado ─────────────────

function sha(texto) {
  return createHash('sha256').update(Buffer.from(texto, 'utf8')).digest('hex');
}

function arquivo(path, texto) {
  return { path, sha256: sha(texto), bytes: Buffer.byteLength(texto, 'utf8'), text: texto };
}

function destinoLimpo() {
  return mkdtempSync(join(tmpdir(), 'legalsquad-aplicar-'));
}

const MANIFESTO = { applies_to: APPLIES_TO, payload_kind: 'tree' };

test('aplicar materializa os arquivos do pacote', () => {
  const destino = destinoLimpo();
  const lista = [arquivo('skills/alfa/SKILL.md', 'conteúdo alfa\n'), arquivo('squads/demo/squad.yaml', 'name: demo\n')];

  const resultado = aplicarPacote(destino, MANIFESTO, lista);

  assert.equal(resultado.ok, true, JSON.stringify(resultado.problemas));
  assert.equal(readFileSync(join(destino, 'skills/alfa/SKILL.md'), 'utf8'), 'conteúdo alfa\n');
  assert.equal(readFileSync(join(destino, 'squads/demo/squad.yaml'), 'utf8'), 'name: demo\n');
});

test('pacote que viola contenção não escreve NADA', () => {
  // Uma área meio-instalada é pior que nenhuma: o resolvedor a veria como
  // instalada e responderia "essa skill não existe" no lugar de "essa área não
  // terminou de instalar".
  const destino = destinoLimpo();
  const lista = [arquivo('skills/alfa/SKILL.md', 'legítimo\n'), arquivo('casos/segredo.md', 'hostil\n')];

  const resultado = aplicarPacote(destino, MANIFESTO, lista);

  assert.equal(resultado.ok, false);
  assert.equal(
    existsSync(join(destino, 'skills/alfa/SKILL.md')),
    false,
    'o arquivo legítimo do mesmo pacote também não pode ser escrito'
  );
  assert.deepEqual(readdirSync(destino), [], 'o destino tem de ficar como estava');
});

test('sha256 que não confere com o conteúdo não escreve NADA', () => {
  // O manifesto assinado cobre o hash da ENTIDADE; este é o hash de cada arquivo
  // dentro dela. Divergência aqui significa payload inconsistente com o que foi
  // assinado — recusa, não conserto.
  const destino = destinoLimpo();
  const lista = [
    arquivo('skills/alfa/SKILL.md', 'legítimo\n'),
    { path: 'skills/beta/SKILL.md', sha256: sha('outra coisa'), bytes: 5, text: 'texto\n' },
  ];

  const resultado = aplicarPacote(destino, MANIFESTO, lista);

  assert.equal(resultado.ok, false);
  assert.ok(resultado.problemas.some((p) => /skills\/beta\/SKILL\.md/.test(p)));
  assert.deepEqual(readdirSync(destino), [], 'nada é escrito quando um arquivo não confere');
});

test('não sobra arquivo temporário depois de aplicar', () => {
  // Cada arquivo é escrito num temporário e RENOMEADO por cima — rename no mesmo
  // sistema de arquivos é atômico, então nenhum arquivo fica pela metade. Se um
  // temporário sobreviver, a troca não aconteceu e o estado é ambíguo.
  const destino = destinoLimpo();

  aplicarPacote(destino, MANIFESTO, [arquivo('skills/alfa/SKILL.md', 'conteúdo\n')]);

  assert.deepEqual(
    readdirSync(join(destino, 'skills/alfa')),
    ['SKILL.md'],
    'só o arquivo final pode restar no diretório'
  );
});

test('arquivo user-owned já existente no destino não é tocado', () => {
  const destino = destinoLimpo();
  mkdirSync(join(destino, 'casos'), { recursive: true });
  writeFileSync(join(destino, 'casos/cliente.md'), 'sigiloso\n');

  aplicarPacote(destino, MANIFESTO, [arquivo('casos/cliente.md', 'substituído\n')]);

  assert.equal(readFileSync(join(destino, 'casos/cliente.md'), 'utf8'), 'sigiloso\n');
});

// ── Ida e volta: o que o build produz, o apply reconstrói ──────────────────

// Caminho de INSTALAÇÃO (o que `conteudo[].path` traz, depois do remapeamento em
// `pack-build.js`) → caminho de AUTORIA na fixture (`AREA_DEMO`). Só existe
// porque best-practices e agentes de área instalam num lugar diferente de onde o
// curador escreve — ver `src/pack-build.js` SUBARVORES para o porquê.
const INSTALACAO_PARA_AUTORIA = [
  ['_legalsquad/core/best-practices/', 'core/best-practices/'],
  ['.claude/agents/', 'core/agents/'],
];
function caminhoDeAutoria(caminhoInstalado) {
  for (const [instalacao, autoria] of INSTALACAO_PARA_AUTORIA) {
    if (caminhoInstalado.startsWith(instalacao)) return autoria + caminhoInstalado.slice(instalacao.length);
  }
  return caminhoInstalado;
}

test('construir e aplicar reconstrói a árvore de origem byte a byte', () => {
  // O teste que prova que as duas metades se encaixam. Cada uma passar sozinha
  // não diz nada sobre a outra: o formato só vale se o que sai do empacotador
  // volta a ser o mesmo conteúdo do outro lado — no caminho de INSTALAÇÃO, que
  // pode diferir do de autoria (best-practices, agentes de área).
  const chaves = generateKeyPairSync('ed25519');
  const { pacotes } = construirPacotes({
    raizConteudo: AREA_DEMO,
    areaId: 'demo',
    chavePrivada: chaves.privateKey,
    versao: '2026.07.1',
  });

  const destino = destinoLimpo();
  let total = 0;

  for (const pacote of pacotes) {
    assert.deepEqual(
      verificarPacote(pacote.manifesto, pacote.entidades, chaves.publicKey).problemas,
      [],
      `${pacote.packId}: aplicar sem verificar seria instalar conteúdo remoto não conferido`
    );

    const conteudo = pacote.entidades
      .filter((e) => e.role === 'content')
      .flatMap((e) => decodeEntity(e.buffer));

    const resultado = aplicarPacote(destino, pacote.manifesto, conteudo);
    assert.equal(resultado.ok, true, `${pacote.packId}: ${JSON.stringify(resultado.problemas)}`);
    total += resultado.escritos.length;

    for (const arquivoOriginal of conteudo) {
      assert.deepEqual(
        readFileSync(join(destino, ...arquivoOriginal.path.split('/'))),
        readFileSync(join(AREA_DEMO, ...caminhoDeAutoria(arquivoOriginal.path).split('/'))),
        `${arquivoOriginal.path} chegou diferente do que saiu`
      );
    }
  }

  assert.ok(total > 50, `esperava a árvore inteira da fixture, vieram ${total} arquivos`);
});
