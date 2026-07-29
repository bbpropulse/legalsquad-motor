import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { decodeEntity, verificarPacote } from '../src/pack-format.js';
import { construirPacotes } from '../src/pack-build.js';
import { AREA_DEMO } from './fixtures/caminhos.js';

// Aceite do F1, verificável no CI, sem depender de máquina nenhuma. Roda contra
// a fixture sintética `tests/fixtures/area-demo/` — nunca contra um repositório
// de conteúdo específico: o empacotador é genérico e cego por definição.

const CHAVES = generateKeyPairSync('ed25519');

function construir(extras = {}) {
  return construirPacotes({
    raizConteudo: AREA_DEMO,
    areaId: 'demo',
    chavePrivada: CHAVES.privateKey,
    versao: '2026.07.1',
    criadoEm: '2026-07-28T00:00:00Z',
    signingKid: '2026-a',
    ...extras,
  });
}

/** Hash da árvore inteira — prova a invariante read-only sem `git status`. */
function hashDaArvore(raiz) {
  const h = createHash('sha256');
  const andar = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const alvo = join(dir, e.name);
      if (e.isDirectory()) { h.update(`D:${relative(raiz, alvo)}\n`); andar(alvo); continue; }
      h.update(`F:${relative(raiz, alvo)}:${statSync(alvo).mode}:`);
      h.update(readFileSync(alvo));
    }
  };
  andar(raiz);
  return h.digest('hex');
}

function skillsNaFixture() {
  return readdirSync(join(AREA_DEMO, 'skills'), { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('_'))
    .map((e) => e.name);
}

// ── Aceite 1: pacote assinado válido, contagem batendo com a fixture ────────

test('empacotar a fixture produz pacotes assinados válidos', () => {
  const { pacotes } = construir();

  assert.deepEqual(
    pacotes.map((p) => p.packId).sort(),
    ['area.demo', 'transversal'],
    'o build emite os dois pacotes: a área e o transversal'
  );

  for (const pacote of pacotes) {
    const veredito = verificarPacote(pacote.manifesto, pacote.entidades, CHAVES.publicKey);
    assert.deepEqual(veredito.problemas, [], `${pacote.packId} não verificou`);
  }
});

test('a EVIDÊNCIA de promoção não viaja no pacote, só o contrato e os casos', () => {
  // `skills/_evals/results/` é user-owned (§6.5): é a prova comportamental
  // DAQUELA instalação. Empacotá-la mandaria a evidência de uma máquina para
  // dentro de outra, onde ela não significa nada — e faria o destino acreditar
  // numa promoção que ninguém rodou ali.
  //
  // Este teste nasceu de um bug real: o build empacotava `results/` e só o teste
  // de ida e volta (`pack-apply.test.js`) percebeu, porque o applier recusou.
  // O guarda focado fica aqui para o diagnóstico não depender da integração.
  const { pacotes } = construir();

  for (const pacote of pacotes) {
    const caminhos = pacote.entidades
      .filter((e) => e.role === 'content')
      .flatMap((e) => decodeEntity(e.buffer))
      .map((a) => a.path);

    assert.deepEqual(
      caminhos.filter((p) => p.startsWith('skills/_evals/results/')),
      [],
      `${pacote.packId}: evidência de promoção viajando no pacote`
    );
  }
});

test('a contagem de skills bate com a fixture, sem perder nem duplicar nenhuma', () => {
  const { pacotes } = construir();

  const idsPorPacote = pacotes.map((pacote) => {
    const catalogo = pacote.entidades.find((e) => e.role === 'catalog');
    return decodeEntity(catalogo.buffer).filter((r) => r.kind === 'skill').map((r) => r.id);
  });

  const todos = idsPorPacote.flat().sort();
  assert.deepEqual(todos, skillsNaFixture().sort(), 'toda skill da fixture aparece em exatamente um pacote');
  assert.equal(new Set(todos).size, todos.length, 'nenhuma skill pode viajar nos dois pacotes');
});

// ── Aceite 2: origem intocada ──────────────────────────────────────────────

test('o diretório de origem fica byte a byte idêntico depois do build', () => {
  const antes = hashDaArvore(AREA_DEMO);

  construir();

  assert.equal(hashDaArvore(AREA_DEMO), antes, 'o build LÊ a origem e nunca escreve nela');
});

// ── Aceite 3: determinismo ─────────────────────────────────────────────────

test('empacotar duas vezes dá o mesmo content_hash', () => {
  const primeiro = construir();
  const segundo = construir();

  for (const [i, pacote] of primeiro.pacotes.entries()) {
    assert.equal(
      segundo.pacotes[i].manifesto.content_hash,
      pacote.manifesto.content_hash,
      `${pacote.packId}: mesmo conteúdo tem de dar o mesmo hash, ou o delta não é calculável`
    );
  }
});

// ── Aceite 5 e 6: catálogo único e consistente com o conteúdo ──────────────

test('cada pacote tem exatamente um catálogo, e catálogo e conteúdo se referenciam mutuamente', () => {
  const { pacotes } = construir();

  for (const pacote of pacotes) {
    const catalogos = pacote.manifesto.entities.filter((e) => e.role === 'catalog');
    assert.equal(catalogos.length, 1, `${pacote.packId}: exatamente um catálogo`);

    const registros = decodeEntity(pacote.entidades.find((e) => e.role === 'catalog').buffer);
    const conteudo = new Map();
    for (const entidade of pacote.entidades.filter((e) => e.role === 'content')) {
      for (const arquivo of decodeEntity(entidade.buffer)) conteudo.set(arquivo.path, arquivo.sha256);
    }

    for (const registro of registros) {
      assert.equal(
        conteudo.get(registro.path),
        registro.sha256,
        `${pacote.packId}: o catálogo aponta para ${registro.path}, que não confere no conteúdo`
      );
      assert.equal(
        pacote.manifesto.entities.some((e) => e.file === registro.entity),
        true,
        `${pacote.packId}: o registro declara a entidade ${registro.entity}, que não existe no pacote`
      );
    }
  }
});

// ── Aceite 7: catálogo muito menor que o conteúdo ──────────────────────────
//
// A razão MEDIDA na fixture é modesta (transversal 2,5× · area.demo 9,9×) e isso
// é propriedade da fixture, não do formato: as skills sintéticas têm corpo curto,
// então a metadata pesa quase tanto quanto o conteúdo. A razão cresce com a
// quantidade de arquivos de apoio por item — a fixture tem 3–5 arquivos por item;
// o conteúdo medido no SPEC (520 skills, 1671 arquivos, 1,93 MB) projeta ~27×.
//
// Por isso o guarda NÃO é um limiar em bytes, que seria um número arbitrário
// calibrado numa fixture. O que faz a razão se sustentar em QUALQUER escala é
// estrutural: o catálogo não carrega corpo e tem um registro por item, não por
// arquivo. É isso que se prende aqui.

test('o relatório traz a razão catálogo/conteúdo medida', () => {
  const { relatorio } = construir();

  for (const linha of relatorio.pacotes) {
    assert.ok(linha.bytesCatalogo > 0 && linha.bytesConteudo > 0);
    assert.ok(
      linha.razao > 1,
      `${linha.packId}: catálogo ${linha.bytesCatalogo}B contra conteúdo ${linha.bytesConteudo}B — ` +
        'a razão medida entra no relatório para que a regressão de tamanho apareça no build, não em campo'
    );
  }
});

test('o catálogo não carrega corpo, e traz um registro por item e não por arquivo', () => {
  // As duas propriedades ESTRUTURAIS que fazem o catálogo continuar barato com
  // 5.000 skills. Um limiar em bytes na fixture não pegaria a regressão que
  // importa — alguém acrescentar `text` ao registro passaria por qualquer
  // limiar folgado e destruiria a economia inteira em produção.
  const { pacotes } = construir();

  for (const pacote of pacotes) {
    const registros = decodeEntity(pacote.entidades.find((e) => e.role === 'catalog').buffer);

    for (const registro of registros) {
      assert.equal(registro.text, undefined, `${pacote.packId}/${registro.id}: corpo no catálogo`);
      assert.equal(registro.b64, undefined, `${pacote.packId}/${registro.id}: binário no catálogo`);
    }
    assert.ok(
      registros.length < pacote.manifesto.counts.files,
      `${pacote.packId}: ${registros.length} registros para ${pacote.manifesto.counts.files} arquivos — ` +
        'o catálogo indexa ITENS descobríveis, não arquivos; um por arquivo anularia a separação'
    );
  }
});

// ── Fail-closed: o id da área tem de casar com o que o curador declarou ────

test('area-id divergente do `_packs.yaml` falha o build', () => {
  assert.throws(
    () => construir({ areaId: 'outra-coisa' }),
    /outra-coisa|demo/,
    'divergência entre argumento e declaração é engano, não algo a resolver em silêncio'
  );
});
