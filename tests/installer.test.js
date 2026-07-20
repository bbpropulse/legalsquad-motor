import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { init, readPreferences, loadSavedLocale, filesIdentical } from '../src/init.js';
import { update } from '../src/update.js';
import { getLocaleCode, loadLocale } from '../src/i18n.js';

// --- preferences.json (canonical) ---

test('init writes preferences.json with the expected fields', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));
  try {
    await init(dir, { _skipPrompts: true, _language: 'Português (Brasil)', _ides: ['claude-code', 'codex'] });
    const raw = await readFile(join(dir, '_criminalsquad', '_memory', 'preferences.json'), 'utf-8');
    const prefs = JSON.parse(raw);
    assert.equal(prefs.outputLanguage, 'Português (Brasil)');
    assert.deepEqual(prefs.ides, ['claude-code', 'codex']);
    assert.equal(prefs.dateFormat, 'YYYY-MM-DD');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('init still writes the human-readable preferences.md', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));
  try {
    await init(dir, { _skipPrompts: true });
    const md = await readFile(join(dir, '_criminalsquad', '_memory', 'preferences.md'), 'utf-8');
    assert.ok(md.includes('Output Language:'));
    assert.ok(md.includes('English'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// --- readPreferences ---

test('readPreferences prefers the JSON file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));
  try {
    const memoryDir = join(dir, '_criminalsquad', '_memory');
    await mkdir(memoryDir, { recursive: true });
    await writeFile(join(memoryDir, 'preferences.json'), JSON.stringify({ outputLanguage: 'Español', ides: ['cursor'] }), 'utf-8');
    await writeFile(join(memoryDir, 'preferences.md'), '**Output Language:** English\n**IDEs:** claude-code\n', 'utf-8');
    const prefs = await readPreferences(dir);
    assert.equal(prefs.outputLanguage, 'Español');
    assert.deepEqual(prefs.ides, ['cursor']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('readPreferences falls back to Markdown when JSON is absent', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));
  try {
    const memoryDir = join(dir, '_criminalsquad', '_memory');
    await mkdir(memoryDir, { recursive: true });
    await writeFile(join(memoryDir, 'preferences.md'), '**Output Language:** Português (Brasil)\n**IDEs:** claude-code, codex\n', 'utf-8');
    const prefs = await readPreferences(dir);
    assert.equal(prefs.outputLanguage, 'Português (Brasil)');
    assert.deepEqual(prefs.ides, ['claude-code', 'codex']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('readPreferences falls back to Markdown when JSON is malformed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));
  try {
    const memoryDir = join(dir, '_criminalsquad', '_memory');
    await mkdir(memoryDir, { recursive: true });
    await writeFile(join(memoryDir, 'preferences.json'), 'not valid json', 'utf-8');
    await writeFile(join(memoryDir, 'preferences.md'), '**Output Language:** English\n', 'utf-8');
    const prefs = await readPreferences(dir);
    assert.equal(prefs.outputLanguage, 'English');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('readPreferences returns null when no preferences exist', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));
  try {
    assert.equal(await readPreferences(dir), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('loadSavedLocale honors the JSON output language', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));
  try {
    // Estabelece um estado-base conhecido para o flip ser observável independente
    // da ordem de execução dos testes (getLocaleCode é um singleton de módulo).
    await loadLocale('English');
    assert.equal(getLocaleCode(), 'en');
    const memoryDir = join(dir, '_criminalsquad', '_memory');
    await mkdir(memoryDir, { recursive: true });
    await writeFile(join(memoryDir, 'preferences.json'), JSON.stringify({ outputLanguage: 'Português (Brasil)' }), 'utf-8');
    await loadSavedLocale(dir);
    assert.equal(getLocaleCode(), 'pt-BR');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// --- filesIdentical ---

test('filesIdentical is true for identical files and false otherwise', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));
  try {
    const a = join(dir, 'a.txt');
    const b = join(dir, 'b.txt');
    const c = join(dir, 'c.txt');
    await writeFile(a, 'same', 'utf-8');
    await writeFile(b, 'same', 'utf-8');
    await writeFile(c, 'different', 'utf-8');
    assert.equal(await filesIdentical(a, b), true);
    assert.equal(await filesIdentical(a, c), false);
    assert.equal(await filesIdentical(a, join(dir, 'missing.txt')), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// --- incremental update ---

test('update does not back up files the user has not changed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));
  try {
    await init(dir, { _skipPrompts: true });
    // CLAUDE.md is identical to the template right after init.
    await update(dir);
    await assert.rejects(stat(join(dir, 'CLAUDE.md.bak')), { code: 'ENOENT' });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('update backs up and overwrites files the user changed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));
  try {
    await init(dir, { _skipPrompts: true });
    await writeFile(join(dir, 'CLAUDE.md'), 'changed by user', 'utf-8');
    await update(dir);
    const backup = await readFile(join(dir, 'CLAUDE.md.bak'), 'utf-8');
    assert.equal(backup, 'changed by user');
    const current = await readFile(join(dir, 'CLAUDE.md'), 'utf-8');
    assert.ok(current.includes('CriminalSquad'));
    assert.ok(!current.includes('changed by user'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// --- regressões da revisão de bugs ---

test('readPreferences merges a partial JSON with the Markdown (não perde estado)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));
  try {
    const memoryDir = join(dir, '_criminalsquad', '_memory');
    await mkdir(memoryDir, { recursive: true });
    // JSON válido mas incompleto (ex.: hand-edit removeu campos)
    await writeFile(join(memoryDir, 'preferences.json'), JSON.stringify({ userName: 'Bruno' }), 'utf-8');
    await writeFile(join(memoryDir, 'preferences.md'), '**Output Language:** Português (Brasil)\n**IDEs:** claude-code, cursor\n', 'utf-8');
    const prefs = await readPreferences(dir);
    assert.equal(prefs.outputLanguage, 'Português (Brasil)'); // preenchido pelo .md
    assert.deepEqual(prefs.ides, ['claude-code', 'cursor']); // preenchido pelo .md
    assert.equal(prefs.userName, 'Bruno'); // veio do .json
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('readPreferences ignora JSON não-objeto (array) e usa o Markdown', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));
  try {
    const memoryDir = join(dir, '_criminalsquad', '_memory');
    await mkdir(memoryDir, { recursive: true });
    await writeFile(join(memoryDir, 'preferences.json'), '[1,2,3]', 'utf-8');
    await writeFile(join(memoryDir, 'preferences.md'), '**Output Language:** English\n', 'utf-8');
    const prefs = await readPreferences(dir);
    assert.equal(prefs.outputLanguage, 'English');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('update preserva chaves do usuário no settings.json de IDE (merge, não overwrite)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));
  try {
    await init(dir, { _skipPrompts: true, _ides: ['vscode-copilot'] });
    const settingsPath = join(dir, '.vscode', 'settings.json');
    const before = JSON.parse(await readFile(settingsPath, 'utf-8'));
    before['editor.fontSize'] = 14;
    await writeFile(settingsPath, JSON.stringify(before), 'utf-8');

    await update(dir);

    const after = JSON.parse(await readFile(settingsPath, 'utf-8'));
    assert.equal(after['editor.fontSize'], 14, 'chave do usuário deve ser preservada');
    assert.ok(after['chat.promptFilesLocations'].includes('.github/prompts'), 'chave gerenciada mantida');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('update tolera ides não-array em preferences.json (cai no default sem travar)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));
  try {
    await init(dir, { _skipPrompts: true });
    // hand-edit inválido: ides como string
    const pj = join(dir, '_criminalsquad', '_memory', 'preferences.json');
    await writeFile(pj, JSON.stringify({ outputLanguage: 'English', ides: 'claude-code' }), 'utf-8');
    const result = await update(dir);
    assert.equal(result.success, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('update preserva o acervo do usuário (materiais próprios não são sobrescritos)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));
  try {
    await init(dir, { _skipPrompts: true });
    // material próprio do aluno no acervo
    const minhaTese = join(dir, 'acervo', 'teses-modelos', 'minha-tese-autoral.md');
    await writeFile(minhaTese, '# Minha tese\nConteúdo do escritório.\n', 'utf-8');
    // edição num arquivo que veio semeado
    const indexPath = join(dir, 'acervo', '_index.yaml');
    await writeFile(indexPath, '# meu índice editado\n', 'utf-8');

    await update(dir);

    assert.equal(await readFile(minhaTese, 'utf-8'), '# Minha tese\nConteúdo do escritório.\n');
    assert.equal(await readFile(indexPath, 'utf-8'), '# meu índice editado\n');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('update não sobrescreve o .gitignore do usuário (fonte única = seed)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));
  try {
    await init(dir, { _skipPrompts: true });
    const giPath = join(dir, '.gitignore');
    const before = await readFile(giPath, 'utf-8');
    await writeFile(giPath, `${before}\nminha-pasta-secreta/\n`, 'utf-8');

    await update(dir);

    const after = await readFile(giPath, 'utf-8');
    assert.ok(after.includes('minha-pasta-secreta/'), 'entrada do usuário preservada');
    assert.ok(after.includes('acervo/casos/'), 'entrada sigilosa preservada');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
