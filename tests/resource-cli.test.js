import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createResourceCli } from '../src/resource-cli.js';
import { validateId } from '../src/path-safe.js';

// Recurso falso com o MESMO contrato do registry real (src/registry.js), layout
// de diretório como o das skills. Usar o registry de verdade aqui é impossível:
// o bundle dele é `<pacote>/skills`, que este repo não tem enquanto o pacote de
// área não existir (F1). O que importa para o dispatcher está reproduzido fiel:
// `install` valida o id como o real, e por isso um artefato de catálogo (`_evals`)
// derruba o loop exatamente como derruba em produção.
function recursoFalso(bundleDir) {
  return {
    listInstalled: async (targetDir) => {
      const { readdir } = await import('node:fs/promises');
      try {
        const entries = await readdir(join(targetDir, 'skills'), { withFileTypes: true });
        return entries.filter((e) => e.isDirectory()).map((e) => e.name);
      } catch {
        return [];
      }
    },
    install: async (id, targetDir) => {
      validateId(id, 'skill id');
      await cp(join(bundleDir, id), join(targetDir, 'skills', id), { recursive: true });
    },
    remove: async (id, targetDir) => {
      validateId(id, 'skill id');
      await rm(join(targetDir, 'skills', id), { recursive: true, force: true });
    },
    getMeta: async (id) => ({ name: id, description: `descrição de ${id}` }),
    getLocalizedDescription: (meta) => meta.description,
  };
}

function cliFalso(bundleDir) {
  return createResourceCli({
    resource: recursoFalso(bundleDir),
    i18nPrefix: 'skills',
    header: 'LegalSquad Skills',
    browseLine: 'Browse',
    formatListItem: (meta, desc) => `${meta.name} - ${desc}`,
    logResource: 'skill',
    usage: { install: 'uso install', remove: 'uso remove', updateOne: 'uso update-one' },
  });
}

/** Projeto inicializado + bundle com uma skill `alpha`, já instalada. */
async function cenario({ comArtefatoDeCatalogo = false } = {}) {
  const raiz = await mkdtemp(join(tmpdir(), 'resource-cli-'));
  const bundle = join(raiz, 'bundle');
  const projeto = join(raiz, 'projeto');

  await mkdir(join(bundle, 'alpha'), { recursive: true });
  await writeFile(join(bundle, 'alpha', 'SKILL.md'), 'versão do pacote\n');
  await writeFile(join(bundle, 'alpha', 'referencia.md'), 'referência do pacote\n');

  await mkdir(join(projeto, '_legalsquad'), { recursive: true });
  await mkdir(join(projeto, 'skills'), { recursive: true });
  await cp(join(bundle, 'alpha'), join(projeto, 'skills', 'alpha'), { recursive: true });

  if (comArtefatoDeCatalogo) {
    // É o que `syncSkillCatalogArtifacts` cria em toda instalação limpa.
    await mkdir(join(projeto, 'skills', '_evals', 'results'), { recursive: true });
    await writeFile(join(projeto, 'skills', '_evals', 'README.md'), 'especificações\n');
  }

  return { raiz, bundle, projeto, cli: cliFalso(bundle) };
}

async function capturar(fn) {
  const original = console.log;
  let saida = '';
  console.log = (...args) => { saida += args.join(' ') + '\n'; };
  try {
    const resultado = await fn();
    return { resultado, saida };
  } finally {
    console.log = original;
  }
}

// --- artefatos de catálogo não são recursos ---

test('`update` não trata `_evals` como skill instalada — o loop inteiro morria nele', async () => {
  const { raiz, projeto, cli } = await cenario({ comArtefatoDeCatalogo: true });
  try {
    const { resultado, saida } = await capturar(() => cli('update', [], projeto));
    assert.equal(resultado.success, true, `update falhou: ${saida}`);
    assert.ok(!saida.includes('_evals'), `_evals não pode aparecer como recurso: ${saida}`);
    // E o artefato continua onde estava — ninguém o removeu nem o reinstalou.
    assert.equal(await readFile(join(projeto, 'skills', '_evals', 'README.md'), 'utf8'), 'especificações\n');
  } finally {
    await rm(raiz, { recursive: true, force: true });
  }
});

test('`list` não anuncia artefatos de catálogo como recursos instalados', async () => {
  const { raiz, projeto, cli } = await cenario({ comArtefatoDeCatalogo: true });
  try {
    const { resultado, saida } = await capturar(() => cli('list', [], projeto));
    assert.equal(resultado.success, true);
    assert.ok(saida.includes('alpha'));
    assert.ok(!saida.includes('_evals'), saida);
  } finally {
    await rm(raiz, { recursive: true, force: true });
  }
});

// --- update não pode apagar a edição do escritório ---

test('`update` preserva num .bak o arquivo que o usuário editou', async () => {
  const { raiz, projeto, cli } = await cenario();
  try {
    const instalado = join(projeto, 'skills', 'alpha', 'SKILL.md');
    await writeFile(instalado, 'ajustado ao jeito do escritório\n');

    const { resultado, saida } = await capturar(() => cli('update', [], projeto));
    assert.equal(resultado.success, true);

    assert.equal(await readFile(instalado, 'utf8'), 'versão do pacote\n', 'o update entrega a versão nova');
    assert.equal(
      await readFile(`${instalado}.bak`, 'utf8'),
      'ajustado ao jeito do escritório\n',
      'a edição local tem de sobreviver em backup'
    );
    assert.match(saida, /backup/i, 'e o usuário precisa ser avisado de onde ela foi parar');
  } finally {
    await rm(raiz, { recursive: true, force: true });
  }
});

test('`update` de recurso intocado não cria backup nenhum', async () => {
  const { raiz, projeto, cli } = await cenario();
  try {
    const { resultado, saida } = await capturar(() => cli('update', [], projeto));
    assert.equal(resultado.success, true);
    await assert.rejects(
      () => readFile(join(projeto, 'skills', 'alpha', 'SKILL.md.bak'), 'utf8'),
      { code: 'ENOENT' }
    );
    assert.ok(!/backup/i.test(saida), saida);
  } finally {
    await rm(raiz, { recursive: true, force: true });
  }
});

test('uma segunda edição ganha o próximo slot (.bak.2) — o original não é perdido', async () => {
  const { raiz, projeto, cli } = await cenario();
  try {
    const instalado = join(projeto, 'skills', 'alpha', 'SKILL.md');

    await writeFile(instalado, 'primeira edição\n');
    await capturar(() => cli('update', [], projeto));

    await writeFile(instalado, 'segunda edição\n');
    await capturar(() => cli('update', [], projeto));

    assert.equal(await readFile(`${instalado}.bak`, 'utf8'), 'primeira edição\n');
    assert.equal(await readFile(`${instalado}.bak.2`, 'utf8'), 'segunda edição\n');
  } finally {
    await rm(raiz, { recursive: true, force: true });
  }
});

test('`update-one` protege a edição local igual ao `update` completo', async () => {
  const { raiz, projeto, cli } = await cenario();
  try {
    const instalado = join(projeto, 'skills', 'alpha', 'referencia.md');
    await writeFile(instalado, 'referência anotada pelo escritório\n');

    const { resultado } = await capturar(() => cli('update-one', ['alpha'], projeto));
    assert.equal(resultado.success, true);
    assert.equal(await readFile(instalado, 'utf8'), 'referência do pacote\n');
    assert.equal(await readFile(`${instalado}.bak`, 'utf8'), 'referência anotada pelo escritório\n');
  } finally {
    await rm(raiz, { recursive: true, force: true });
  }
});

test('arquivo que só existe localmente não vira backup nem é tocado', async () => {
  const { raiz, projeto, cli } = await cenario();
  try {
    const proprio = join(projeto, 'skills', 'alpha', 'notas-do-escritorio.md');
    await writeFile(proprio, 'só nosso\n');

    const { resultado } = await capturar(() => cli('update', [], projeto));
    assert.equal(resultado.success, true);
    assert.equal(await readFile(proprio, 'utf8'), 'só nosso\n');
    await assert.rejects(() => readFile(`${proprio}.bak`, 'utf8'), { code: 'ENOENT' });
  } finally {
    await rm(raiz, { recursive: true, force: true });
  }
});
