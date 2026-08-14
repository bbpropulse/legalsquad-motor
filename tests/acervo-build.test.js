import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { construirAcervo } from '../src/acervo-build.js';
import { aplicarPacote } from '../src/pack-apply.js';
import { decodeEntity, verificarPacote } from '../src/pack-format.js';

// Empacotamento do ACERVO — a metade que faltava do "um pipeline carrega skills
// e acervo".
//
// Decisão medida antes de escrever isto: o acervo inteiro, comprimido, dá 56 MB
// (55.871 julgados), e por área fica entre 0,2 MB e 20 MB. Cabe em `tree`, o
// formato que o motor já sabe aplicar — então o `payload_kind: records` da SPEC
// §6, que manda só metadados e descarta o corpo, deixa de ser necessário para
// este volume. Com `tree` o advogado tem o INTEIRO TEOR offline, e o
// `verificador-citacoes` confere sem sair da máquina, que é o princípio nº 1.

async function fixtureDeAcervo() {
  const raiz = await mkdtemp(join(tmpdir(), 'acervo-build-'));
  const civil = join(raiz, 'direito-civil');
  const trab = join(raiz, 'direito-do-trabalho');
  await mkdir(civil, { recursive: true });
  await mkdir(trab, { recursive: true });

  await writeFile(
    join(civil, 'resp-111.md'),
    '---\ntribunal: "STJ"\nprocesso: "REsp 111"\n---\n\n# Boa-fé objetiva\n\ntexto do julgado civil\n'
  );
  await writeFile(
    join(civil, 'resp-222.md'),
    '---\ntribunal: "STJ"\nprocesso: "REsp 222"\n---\n\n# Função social do contrato\n\noutro julgado\n'
  );
  await writeFile(
    join(trab, 'rr-333.md'),
    '---\ntribunal: "TST"\nprocesso: "RR 333"\n---\n\n# Horas in itinere\n\njulgado trabalhista\n'
  );
  return raiz;
}

test('cada área do acervo vira UM pacote `acervo.<area>`', async () => {
  // Um pacote por área, e não um só gigante: quem instalou direito civil baixa
  // os julgados civis, não os 17.669 eleitorais. É o mesmo recorte que o usuário
  // já escolheu ao instalar a área.
  const raiz = await fixtureDeAcervo();
  const chaves = generateKeyPairSync('ed25519');

  const { pacotes } = construirAcervo({ raizConteudo: raiz, chavePrivada: chaves.privateKey, versao: '2026.08.1' });

  assert.deepEqual(
    pacotes.map((p) => p.packId).sort(),
    ['acervo.direito-civil', 'acervo.direito-do-trabalho']
  );
  await rm(raiz, { recursive: true, force: true });
});

test('o pacote de acervo é assinado e verificável como qualquer outro', async () => {
  const raiz = await fixtureDeAcervo();
  const chaves = generateKeyPairSync('ed25519');

  const { pacotes } = construirAcervo({ raizConteudo: raiz, chavePrivada: chaves.privateKey, versao: '2026.08.1' });

  for (const p of pacotes) {
    assert.deepEqual(
      verificarPacote(p.manifesto, p.entidades, chaves.publicKey).problemas,
      [],
      `${p.packId}: acervo não pode ser conteúdo remoto não conferido`
    );
  }
  await rm(raiz, { recursive: true, force: true });
});

test('instala em `acervo/_packs/<pack_id>/` — a ÚNICA subárvore gerenciada', async () => {
  // `acervo/` é curadoria do usuário e é user-owned: um pacote que tentasse
  // gravar em `acervo/jurisprudencia/` seria recusado pela contenção, e com
  // razão — apagaria o que o advogado juntou à mão. `acervo/_packs/` existe
  // exatamente para o sync ter onde escrever sem tocar no que é dele.
  const raiz = await fixtureDeAcervo();
  const chaves = generateKeyPairSync('ed25519');
  const { pacotes } = construirAcervo({ raizConteudo: raiz, chavePrivada: chaves.privateKey, versao: '2026.08.1' });

  const destino = await mkdtemp(join(tmpdir(), 'acervo-destino-'));
  // Curadoria própria, que o sync não pode tocar.
  await mkdir(join(destino, 'acervo', 'jurisprudencia'), { recursive: true });
  await writeFile(join(destino, 'acervo', 'jurisprudencia', 'meu.md'), 'meu julgado\n');

  for (const p of pacotes) {
    const conteudo = p.entidades.filter((e) => e.role === 'content').flatMap((e) => decodeEntity(e.buffer));
    const r = aplicarPacote(destino, p.manifesto, conteudo);
    assert.equal(r.ok, true, `${p.packId}: ${JSON.stringify(r.problemas)}`);
  }

  const julgado = await readFile(
    join(destino, 'acervo', '_packs', 'acervo.direito-civil', 'jurisprudencia', 'resp-111.md'),
    'utf-8'
  );
  assert.match(julgado, /Boa-fé objetiva/, 'o julgado tem de chegar com o INTEIRO TEOR, não só metadados');

  assert.equal(
    await readFile(join(destino, 'acervo', 'jurisprudencia', 'meu.md'), 'utf-8'),
    'meu julgado\n',
    'a curadoria do usuário sai intacta'
  );

  await rm(raiz, { recursive: true, force: true });
  await rm(destino, { recursive: true, force: true });
});

test('o catálogo traz um registro por julgado, com tribunal e processo', async () => {
  // O catálogo é o que a busca local consulta sem abrir os arquivos. Sem
  // tribunal e processo nele, achar "REsp 111" exigiria varrer o corpus inteiro.
  const raiz = await fixtureDeAcervo();
  const chaves = generateKeyPairSync('ed25519');
  const { pacotes } = construirAcervo({ raizConteudo: raiz, chavePrivada: chaves.privateKey, versao: '2026.08.1' });

  const civil = pacotes.find((p) => p.packId === 'acervo.direito-civil');
  const registros = civil.entidades.filter((e) => e.role === 'catalog').flatMap((e) => decodeEntity(e.buffer));

  assert.equal(registros.length, 2, 'um registro por julgado');
  const r = registros.find((x) => x.id === 'resp-111');
  assert.equal(r.kind, 'julgado');
  assert.equal(r.tribunal, 'STJ');
  assert.equal(r.processo, 'REsp 111');
  assert.match(r.description, /Boa-fé objetiva/, 'o título do julgado vira a descrição buscável');
  assert.equal(r.text, undefined, 'o catálogo NÃO carrega corpo — é isso que o mantém fino');

  await rm(raiz, { recursive: true, force: true });
});

test('diretório sem nenhum julgado não vira pacote', async () => {
  const raiz = await mkdtemp(join(tmpdir(), 'acervo-vazio-'));
  await mkdir(join(raiz, 'area-vazia'), { recursive: true });
  await writeFile(join(raiz, 'CATALOGO.md'), '# catálogo solto na raiz\n');
  const chaves = generateKeyPairSync('ed25519');

  const { pacotes } = construirAcervo({ raizConteudo: raiz, chavePrivada: chaves.privateKey, versao: '2026.08.1' });

  assert.deepEqual(pacotes, [], 'pasta sem julgado não produz pacote assinado de nada');
  await rm(raiz, { recursive: true, force: true });
});

test('empacotar duas vezes dá o mesmo content_hash', async () => {
  const raiz = await fixtureDeAcervo();
  const chaves = generateKeyPairSync('ed25519');
  const opts = { raizConteudo: raiz, chavePrivada: chaves.privateKey, versao: '2026.08.1' };

  const a = construirAcervo(opts);
  const b = construirAcervo(opts);

  assert.deepEqual(
    a.pacotes.map((p) => p.manifesto.content_hash),
    b.pacotes.map((p) => p.manifesto.content_hash)
  );
  await rm(raiz, { recursive: true, force: true });
});
