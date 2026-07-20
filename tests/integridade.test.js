// Testes de INTEGRIDADE DE CONTEÚDO (não do CLI).
// Garante que catálogo, skills, subagentes e squads não cheguem quebrados ao usuário:
// arquivos referenciados existem, frontmatter é parseável e tem os campos obrigatórios,
// e os nomes seguem o padrão de descoberta (lowercase-hifen, <= 64).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
test('integridade: _catalog.yaml referencia arquivos existentes', () => {
  const catPath = join(REPO, '_criminalsquad/core/best-practices/_catalog.yaml');
  assert.ok(existsSync(catPath), '_catalog.yaml deve existir');
  const cat = readFileSync(catPath, 'utf8');
  const files = [...cat.matchAll(/^\s*file:\s*(.+)$/gm)].map((m) => m[1].trim());
  assert.ok(files.length > 0, 'catálogo deve listar best-practices');
  const faltando = files.filter((f) => !existsSync(join(REPO, '_criminalsquad/core/best-practices', f)));
  assert.deepEqual(faltando, [], `best-practices do catálogo sem arquivo: ${faltando.join(', ')}`);
});

// 2. Skills: frontmatter com name (formato válido) + description.
test('integridade: skills têm frontmatter válido (name + description)', () => {
  const base = join(REPO, 'skills');
  const semFm = []; const semDesc = []; const nomeRuim = [];
  for (const d of dirs(base)) {
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
  const base = join(REPO, 'squads');
  const sem = dirs(base).filter((s) => !existsSync(join(base, s, 'squad.yaml')));
  assert.deepEqual(sem, [], `squads sem squad.yaml: ${sem.join(', ')}`);
});

// 4b. squad.yaml: o `code` (top-level) DEVE bater com o nome da pasta. O dashboard
// casa o estado do squad pelo `code`; se `code != pasta`, o squad nunca aparece como
// ativo (não monitorável). Vale para squads/ e a cópia de distribuição templates/squads/.
test('integridade: squad.yaml code (top-level) == nome da pasta', () => {
  for (const rel of ['squads', 'templates/squads']) {
    const base = join(REPO, rel);
    const bad = [];
    for (const d of dirs(base)) {
      const p = join(base, d, 'squad.yaml');
      if (!existsSync(p)) continue;
      const m = readFileSync(p, 'utf8').match(/^code:\s*["']?([^"'\s]+)["']?\s*$/m);
      const code = m ? m[1] : null;
      if (code !== d) bad.push(`${rel}/${d} (code=${code})`);
    }
    assert.deepEqual(bad, [], `squad.yaml com code != pasta (quebra o dashboard): ${bad.join(', ')}`);
  }
});

// 5. Progressive disclosure (aviso, não-bloqueante): SKILL.md muito grande.
test('integridade: aviso de SKILL.md grandes (progressive disclosure)', () => {
  const base = join(REPO, 'skills');
  const grandes = [];
  for (const d of dirs(base)) {
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

// 6. O pacote especializado de execução penal entrou como preview isolado:
// schema compatível, progressive disclosure e sem autorreferência de roteamento.
test('integridade: preview ep-* permanece isolada e estruturalmente válida', () => {
  const base = join(REPO, 'skills');
  const ep = dirs(base).filter((d) => d.startsWith('ep-')).sort();
  assert.equal(ep.length, 73, 'o pacote preview de execução penal deve ter 73 skills');

  const problemas = [];
  for (const d of ep) {
    const skillPath = join(base, d, 'SKILL.md');
    const referencePath = join(base, d, 'references', 'protocolo-v3.md');
    const content = readFileSync(skillPath, 'utf8');
    const fm = frontmatter(content);
    const topLevelKeys = fm.raw
      .split('\n')
      .filter((line) => /^[A-Za-z0-9_-]+:/.test(line))
      .map((line) => line.match(/^([A-Za-z0-9_-]+):/)[1]);

    if (fm.name !== d) problemas.push(`${d}: name != pasta`);
    if (topLevelKeys.some((key) => !['name', 'description', 'metadata'].includes(key))) {
      problemas.push(`${d}: chave top-level fora do schema`);
    }
    if (!/^\s{2}lifecycle:\s*["']?preview["']?\s*$/m.test(fm.raw)) {
      problemas.push(`${d}: lifecycle preview ausente`);
    }
    if (content.split('\n').length > 500) problemas.push(`${d}: SKILL.md > 500 linhas`);
    if (!existsSync(referencePath)) problemas.push(`${d}: references/protocolo-v3.md ausente`);
    if (!content.includes('(references/protocolo-v3.md)')) problemas.push(`${d}: referência v3 não ligada`);

    if (existsSync(referencePath)) {
      const reference = readFileSync(referencePath, 'utf8');
      for (const block of reference.matchAll(/"proximas_skills_sugeridas"\s*:\s*\[([\s\S]*?)\]/g)) {
        if (new RegExp(`"skill"\\s*:\\s*"${d}"`).test(block[1])) {
          problemas.push(`${d}: autorreferência em proximas_skills_sugeridas`);
        }
      }
    }
  }

  assert.deepEqual(problemas, []);
});
