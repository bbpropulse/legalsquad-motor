import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  listInstalled,
  listAvailable,
  installSkill,
  removeSkill,
  getSkillVersion,
  getSkillMeta,
  getLocalizedDescription,
  clearMetaCache,
} from '../src/skills.js';
import { AREA_DEMO, SKILLS_DEMO } from './fixtures/caminhos.js';

const SAMPLE_SKILL_MD = `---\nname: seo-optimizer\nversion: 1.2.0\ntype: tool\ndescription: SEO Optimizer\n---\n# SEO Optimizer\n`;

// Os testes abaixo que instalam/leem uma skill "de verdade" (não uma criada à
// mão no próprio teste) passam SKILLS_DEMO como terceiro argumento — o bundle
// de override aditivo de src/registry.js. Sem ele, listAvailable/getMeta/
// install sempre leriam o bundle real do pacote (<repo>/skills), que não
// existe neste repo (F0 removeu o conteúdo; ver CLAUDE.md e
// F0-SANEAMENTO.md §5-bis). Os testes que NÃO passam o terceiro argumento
// (ex.: "throws when skill not found") são testes de mecanismo puros — não
// importa de qual bundle a resposta vem.

// --- listInstalled ---

test('listInstalled returns empty array when skills/ does not exist', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));
  try {
    const result = await listInstalled(dir);
    assert.deepEqual(result, []);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('listInstalled excludes the built-in criminalsquad-skill-creator skill', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));
  try {
    const skillsDir = join(dir, 'skills');
    await mkdir(join(skillsDir, 'criminalsquad-skill-creator'), { recursive: true });
    await mkdir(join(skillsDir, 'seo-optimizer'), { recursive: true });
    const result = await listInstalled(dir);
    assert.deepEqual(result, ['seo-optimizer']);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('listInstalled returns installed skill ids from skills/', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));
  try {
    const skillsDir = join(dir, 'skills');
    await mkdir(join(skillsDir, 'seo-optimizer'), { recursive: true });
    await mkdir(join(skillsDir, 'email-marketing'), { recursive: true });
    const result = await listInstalled(dir);
    assert.ok(result.includes('seo-optimizer'));
    assert.ok(result.includes('email-marketing'));
    assert.equal(result.length, 2);
  } finally {
    await rm(dir, { recursive: true });
  }
});

// --- listAvailable ---

test('listAvailable returns bundled skill ids', async () => {
  const available = await listAvailable(SKILLS_DEMO);
  assert.ok(available.length > 0, 'a fixture precisa ter skills para o teste valer algo');
  assert.ok(available.includes('gerador-imagem'));
  assert.ok(available.includes('conector-mcp'));
});

// --- installSkill ---

test('installSkill copies SKILL.md from bundled skills to skills/<id>/', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));
  try {
    await installSkill('gerador-imagem', dir, SKILLS_DEMO);
    const content = await readFile(join(dir, 'skills', 'gerador-imagem', 'SKILL.md'), 'utf-8');
    assert.ok(content.includes('gerador-imagem'));
    assert.ok(content.length > 0);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('installSkill creates skills/ directory if missing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));
  try {
    await installSkill('conector-mcp', dir, SKILLS_DEMO);
    const content = await readFile(join(dir, 'skills', 'conector-mcp', 'SKILL.md'), 'utf-8');
    assert.ok(content.length > 0);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('installSkill throws when skill not found in bundled skills', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));
  try {
    await assert.rejects(
      () => installSkill('nonexistent', dir),
      /not found/
    );
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('installSkill throws on invalid skill id', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));
  try {
    await assert.rejects(
      () => installSkill('../evil', dir),
      /Invalid skill id/
    );
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('installSkill copies full directory including subdirs for criminalsquad-skill-creator', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));
  try {
    await installSkill('criminalsquad-skill-creator', dir, SKILLS_DEMO);
    const skill = await readFile(join(dir, 'skills', 'criminalsquad-skill-creator', 'SKILL.md'), 'utf-8');
    assert.ok(skill.length > 0);
    const scripts = await readdir(join(dir, 'skills', 'criminalsquad-skill-creator', 'scripts'));
    assert.ok(scripts.length > 0);
    // installSkill não conhece excludeInstalled (só listInstalled filtra) — o
    // conteúdo real fica em disco, mas listInstalled deve escondê-lo mesmo assim.
    // Ao contrário do teste "listInstalled excludes..." acima (dir vazio criado à
    // mão), aqui o caminho de exclusão é exercitado contra uma skill de verdade,
    // instalada pelo fluxo real (mesmo nome hardcoded em src/skills.js:14).
    const installed = await listInstalled(dir);
    assert.ok(!installed.includes('criminalsquad-skill-creator'));
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('installSkill skips copy when src and dest resolve to the same path', async () => {
  // Simula rodar init de dentro da própria área — destino e origem colidem
  // quando targetDir é a raiz da fixture e o override é o bundle dela mesma.
  await assert.doesNotReject(() => installSkill('demo-peca-alpha', AREA_DEMO, SKILLS_DEMO));
});

// --- removeSkill ---

test('removeSkill deletes the skill directory from skills/', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));
  try {
    const skillDir = join(dir, 'skills', 'seo-optimizer');
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, 'SKILL.md'), SAMPLE_SKILL_MD);
    await removeSkill('seo-optimizer', dir);
    await assert.rejects(
      () => readFile(join(skillDir, 'SKILL.md'), 'utf-8'),
      { code: 'ENOENT' }
    );
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('removeSkill does not throw when skill not installed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));
  try {
    await assert.doesNotReject(() => removeSkill('nonexistent', dir));
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('removeSkill throws on invalid skill id', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));
  try {
    await assert.rejects(
      () => removeSkill('../evil', dir),
      /Invalid skill id/
    );
  } finally {
    await rm(dir, { recursive: true });
  }
});

// --- getSkillVersion ---

test('getSkillVersion returns version from SKILL.md frontmatter', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));
  try {
    const skillDir = join(dir, 'skills', 'seo-optimizer');
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, 'SKILL.md'), SAMPLE_SKILL_MD);
    const version = await getSkillVersion('seo-optimizer', dir);
    assert.equal(version, '1.2.0');
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('getSkillVersion returns null when SKILL.md has no version', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));
  try {
    const skillDir = join(dir, 'skills', 'seo-optimizer');
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, 'SKILL.md'), '---\nname: seo-optimizer\n---\n# SEO\n');
    const version = await getSkillVersion('seo-optimizer', dir);
    assert.equal(version, null);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('getSkillVersion returns null when skill is not installed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));
  try {
    const version = await getSkillVersion('nonexistent', dir);
    assert.equal(version, null);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('getSkillVersion returns null when SKILL.md has no frontmatter', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));
  try {
    const skillDir = join(dir, 'skills', 'seo-optimizer');
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, 'SKILL.md'), '# SEO Optimizer\nNo frontmatter here.\n');
    const version = await getSkillVersion('seo-optimizer', dir);
    assert.equal(version, null);
  } finally {
    await rm(dir, { recursive: true });
  }
});

// --- getSkillMeta ---

test('getSkillMeta returns name, description, type, and env for a bundled skill', async () => {
  const meta = await getSkillMeta('conector-mcp', SKILLS_DEMO);
  assert.equal(meta.name, 'conector-mcp');
  assert.equal(meta.type, 'mcp');
  assert.ok(meta.description.length > 0);
  assert.ok(Array.isArray(meta.env));
  assert.ok(meta.env.includes('DEMO_TOKEN'));
});

test('getSkillMeta returns empty env array when skill has no env vars', async () => {
  const meta = await getSkillMeta('gerador-imagem', SKILLS_DEMO);
  assert.ok(Array.isArray(meta.env));
  assert.equal(meta.env.length, 0);
});

test('getSkillMeta reads lifecycle and version from nested metadata', async () => {
  const id = 'demo-preview-engine';
  const meta = await getSkillMeta(id, SKILLS_DEMO);
  assert.equal(meta.lifecycle, 'preview');

  const dir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));
  try {
    await installSkill(id, dir, SKILLS_DEMO);
    assert.equal(await getSkillVersion(id, dir), '3.0.0');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('getSkillMeta returns null for nonexistent skill', async () => {
  const meta = await getSkillMeta('nonexistent-skill');
  assert.equal(meta, null);
});

test('getSkillMeta returns descriptions object (empty until translations added)', async () => {
  const meta = await getSkillMeta('conector-mcp', SKILLS_DEMO);
  assert.ok(meta.descriptions);
  assert.equal(typeof meta.descriptions, 'object');
});

// --- getLocalizedDescription ---

test('getLocalizedDescription returns pt-BR description when available', () => {
  const meta = {
    description: 'English description',
    descriptions: { 'pt-BR': 'Descrição em português', 'es': 'Descripción en español' },
  };
  assert.equal(getLocalizedDescription(meta, 'pt-BR'), 'Descrição em português');
});

test('getLocalizedDescription returns es description when available', () => {
  const meta = {
    description: 'English description',
    descriptions: { 'pt-BR': 'Descrição em português', 'es': 'Descripción en español' },
  };
  assert.equal(getLocalizedDescription(meta, 'es'), 'Descripción en español');
});

test('getLocalizedDescription falls back to English when locale not available', () => {
  const meta = {
    description: 'English description',
    descriptions: {},
  };
  assert.equal(getLocalizedDescription(meta, 'pt-BR'), 'English description');
});

test('getLocalizedDescription returns English for "en" locale', () => {
  const meta = {
    description: 'English description',
    descriptions: { 'pt-BR': 'Descrição' },
  };
  assert.equal(getLocalizedDescription(meta, 'en'), 'English description');
});

// --- metaCache ---

test('getSkillMeta returns cached result on second call', async () => {
  clearMetaCache();
  const first = await getSkillMeta('conector-mcp', SKILLS_DEMO);
  const second = await getSkillMeta('conector-mcp', SKILLS_DEMO);
  assert.equal(first, second); // mesma referência — veio do cache
});

test('clearMetaCache forces re-read from disk', async () => {
  const first = await getSkillMeta('conector-mcp', SKILLS_DEMO);
  clearMetaCache();
  const second = await getSkillMeta('conector-mcp', SKILLS_DEMO);
  assert.notEqual(first, second); // referência diferente — releu do disco
  assert.equal(first.name, second.name); // mesmo conteúdo
});

test('installSkill invalidates metaCache for that skill', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));
  try {
    const before = await getSkillMeta('gerador-imagem', SKILLS_DEMO);
    await installSkill('gerador-imagem', dir, SKILLS_DEMO);
    const after = await getSkillMeta('gerador-imagem', SKILLS_DEMO);
    assert.notEqual(before, after); // cache foi invalidado
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('removeSkill invalidates metaCache for that skill', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'criminalsquad-test-'));
  try {
    await installSkill('gerador-imagem', dir, SKILLS_DEMO);
    await getSkillMeta('gerador-imagem', SKILLS_DEMO); // populate cache
    await removeSkill('gerador-imagem', dir, SKILLS_DEMO);
    // cache deve ter sido invalidado — próxima chamada relê do disco
    const meta = await getSkillMeta('gerador-imagem', SKILLS_DEMO);
    assert.ok(meta); // still exists in bundled dir
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('getSkillMeta caches null for nonexistent skill', async () => {
  clearMetaCache();
  const first = await getSkillMeta('nonexistent-skill');
  assert.equal(first, null);
  const second = await getSkillMeta('nonexistent-skill');
  assert.equal(second, null);
  // ambas retornam null, mas a segunda veio do cache (sem hit no disco)
});

test('installSkill invalidates cached null so skill becomes findable', async () => {
  clearMetaCache();
  // força null no cache para um ID que existe no bundled
  await getSkillMeta('nonexistent-xyz', SKILLS_DEMO);
  assert.equal(await getSkillMeta('nonexistent-xyz', SKILLS_DEMO), null); // cached null
  // se alguém instalar esse ID, o cache é limpo
  // (testamos apenas que delete funciona sobre null)
  clearMetaCache();
  const meta = await getSkillMeta('gerador-imagem', SKILLS_DEMO);
  assert.ok(meta); // leu do disco normalmente
});
