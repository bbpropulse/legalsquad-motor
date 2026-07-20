// Testes de INTEGRIDADE DE CONTEÚDO (não do CLI).
// Garante que catálogo, skills, subagentes e squads não cheguem quebrados ao usuário:
// arquivos referenciados existem, frontmatter é parseável e tem os campos obrigatórios,
// e os nomes seguem o padrão de descoberta (lowercase-hifen, <= 64).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverSkillCatalog } from '../src/skill-catalog.js';
import { getSkillLifecyclePolicy } from '../src/frontmatter.js';
import { isSkillAutoInstallable } from '../src/skills.js';
import { searchSkillCatalog } from '../src/skill-search.js';
import { AREA_DEMO, CORE_DEMO, SKILLS_DEMO, SQUADS_DEMO } from './fixtures/caminhos.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');
const NAME_RE = /^[a-z0-9-]{1,64}$/;

function frontmatter(content) {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const block = m[1];
  const nameM = block.match(/^name:\s*(.+)$/m);
  return {
    raw: block,
    name: nameM ? nameM[1].replace(/^["']|["']$/g, '').trim() : null,
    hasDescription: /^description(_[A-Za-z-]+)?:/m.test(block),
  };
}

const dirs = (p) => (existsSync(p) ? readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) : []);

// 1. Catálogo de best-practices: todo `file:` aponta para um arquivo existente.
// A fixture está no formato de destino (core/ direto na raiz da área, sem o
// prefixo _criminalsquad/ do motor) — ver tests/legal-authorities.test.js.
test('integridade: _catalog.yaml referencia arquivos existentes', () => {
  const catPath = join(CORE_DEMO, 'best-practices', '_catalog.yaml');
  assert.ok(existsSync(catPath), '_catalog.yaml deve existir');
  const cat = readFileSync(catPath, 'utf8');
  const files = [...cat.matchAll(/^\s*file:\s*(.+)$/gm)].map((m) => m[1].trim());
  assert.ok(files.length > 0, 'catálogo deve listar best-practices');
  const faltando = files.filter((f) => !existsSync(join(CORE_DEMO, 'best-practices', f)));
  assert.deepEqual(faltando, [], `best-practices do catálogo sem arquivo: ${faltando.join(', ')}`);
});

// 2. Skills: frontmatter com name (formato válido) + description.
test('integridade: skills têm frontmatter válido (name + description)', () => {
  const base = SKILLS_DEMO;
  const nomesDeSkill = dirs(base);
  assert.ok(nomesDeSkill.length > 0, 'a fixture precisa ter skills para o teste valer algo');
  const semFm = []; const semDesc = []; const nomeRuim = [];
  for (const d of nomesDeSkill) {
    const p = join(base, d, 'SKILL.md');
    if (!existsSync(p)) continue; // pode haver dir auxiliar sem SKILL.md
    const fm = frontmatter(readFileSync(p, 'utf8'));
    if (!fm) { semFm.push(d); continue; }
    if (!fm.hasDescription) semDesc.push(d);
    if (!fm.name || !NAME_RE.test(fm.name)) nomeRuim.push(`${d} (name=${fm.name})`);
  }
  assert.deepEqual(semFm, [], `skills sem frontmatter: ${semFm.join(', ')}`);
  assert.deepEqual(semDesc, [], `skills sem description: ${semDesc.join(', ')}`);
  assert.deepEqual(nomeRuim, [], `skills com name fora do padrão [a-z0-9-]{1,64}: ${nomeRuim.join(', ')}`);
});

// 3. Subagentes nativos: frontmatter com name (formato válido) + description.
// Conteúdo real do motor (.claude/agents/), não da fixture — restaurado na
// Classe A (Task 1) e não removido pelo F0.
test('integridade: subagentes .claude/agents têm frontmatter válido', () => {
  const base = join(REPO, '.claude/agents');
  const files = existsSync(base) ? readdirSync(base).filter((f) => f.endsWith('.md') && f !== 'README.md') : [];
  assert.ok(files.length > 0, 'deve haver subagentes em .claude/agents');
  const semFm = []; const semDesc = []; const nomeRuim = [];
  for (const f of files) {
    const fm = frontmatter(readFileSync(join(base, f), 'utf8'));
    if (!fm) { semFm.push(f); continue; }
    if (!fm.hasDescription) semDesc.push(f);
    if (!fm.name || !NAME_RE.test(fm.name)) nomeRuim.push(`${f} (name=${fm.name})`);
  }
  assert.deepEqual(semFm, [], `agentes sem frontmatter: ${semFm.join(', ')}`);
  assert.deepEqual(semDesc, [], `agentes sem description: ${semDesc.join(', ')}`);
  assert.deepEqual(nomeRuim, [], `agentes com name fora do padrão: ${nomeRuim.join(', ')}`);
});

// 4. Squads: cada squad tem squad.yaml.
test('integridade: cada squad tem squad.yaml', () => {
  const base = SQUADS_DEMO;
  const nomesDeSquad = dirs(base);
  assert.ok(nomesDeSquad.length > 0, 'a fixture precisa ter squads para o teste valer algo');
  const sem = nomesDeSquad.filter((s) => !existsSync(join(base, s, 'squad.yaml')));
  assert.deepEqual(sem, [], `squads sem squad.yaml: ${sem.join(', ')}`);
});

// 4b. squad.yaml: o `code` (top-level) DEVE bater com o nome da pasta. O dashboard
// casa o estado do squad pelo `code`; se `code != pasta`, o squad nunca aparece como
// ativo (não monitorável). Vale para a fixture (squads instalados) e a cópia de
// distribuição templates/squads/ (seed real, copiado por init/update).
test('integridade: squad.yaml code (top-level) == nome da pasta', () => {
  for (const base of [SQUADS_DEMO, join(REPO, 'templates/squads')]) {
    const nomes = dirs(base);
    assert.ok(nomes.length > 0, `${base} precisa ter squads para o teste valer algo`);
    const bad = [];
    for (const d of nomes) {
      const p = join(base, d, 'squad.yaml');
      if (!existsSync(p)) continue;
      const m = readFileSync(p, 'utf8').match(/^code:\s*["']?([^"'\s]+)["']?\s*$/m);
      const code = m ? m[1] : null;
      if (code !== d) bad.push(`${base}/${d} (code=${code})`);
    }
    assert.deepEqual(bad, [], `squad.yaml com code != pasta (quebra o dashboard): ${bad.join(', ')}`);
  }
});

// 5. Progressive disclosure (aviso, não-bloqueante): SKILL.md muito grande.
test('integridade: aviso de SKILL.md grandes (progressive disclosure)', () => {
  const base = SKILLS_DEMO;
  const nomesDeSkill = dirs(base);
  assert.ok(nomesDeSkill.length > 0, 'a fixture precisa ter skills para o teste valer algo');
  const grandes = [];
  for (const d of nomesDeSkill) {
    const p = join(base, d, 'SKILL.md');
    if (!existsSync(p)) continue;
    const linhas = readFileSync(p, 'utf8').split('\n').length;
    if (linhas > 500) grandes.push(`${d} (${linhas} linhas)`);
  }
  if (grandes.length) {
    console.warn(`[aviso] SKILL.md > 500 linhas (considere mover material para reference/): ${grandes.join(', ')}`);
  }
  assert.ok(true);
});

// 6. Skill com lifecycle preview não vaza para produção/descoberta normal.
// Recupera a regra de mecanismo perdida na Task 4 (tests/integridade.test.js,
// "preview ep-* permanece isolada e estruturalmente válida" — removida porque
// dependia de skills/ep-* real e de uma contagem fixa de 73). A versão
// genérica não fixa quantidade: usa qualquer skill preview que a fixture
// tiver (demo-preview-engine hoje) e prova a regra em três camadas
// independentes — política de lifecycle, elegibilidade de auto-instalação
// (a mesma função que init.js usa para decidir o que copiar) e busca padrão.
test('integridade: skill com lifecycle preview não vaza para produção/descoberta', () => {
  const catalog = discoverSkillCatalog(SKILLS_DEMO);
  const previews = catalog.entries.filter((entry) => entry.metadata.lifecycle === 'preview');
  assert.ok(previews.length > 0, 'a fixture precisa ter uma skill preview para o teste valer algo');
  for (const entry of previews) {
    assert.equal(
      getSkillLifecyclePolicy(entry.metadata.lifecycle).productionEligible,
      false,
      `${entry.id}: preview não pode ser productionEligible`,
    );
    assert.equal(
      isSkillAutoInstallable(entry.metadata),
      false,
      `${entry.id}: preview não pode ser auto-instalável`,
    );
    const busca = searchSkillCatalog(entry.id.replace(/-/g, ' '), AREA_DEMO, { limit: 20 });
    assert.equal(
      busca.results.some((item) => item.id === entry.id),
      false,
      `${entry.id}: vazou na busca padrão (sem includePreview)`,
    );
  }
});
