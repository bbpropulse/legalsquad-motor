import { readFile, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ASSETS_DIR = join(ROOT, 'templates', 'ide-assets');
const IDE = 'templates/ide-templates';

// Single source of truth: each shared body lives once in templates/ide-assets/.
// The files below carry that body, each wrapped in its own per-IDE frontmatter
// (which is legitimately IDE-specific and stays in the file). Paths are relative
// to the repo root, so this also covers the repo's OWN copies (the CriminalSquad
// repo functioning as a project). Editing a body asset + `npm run build:ide`
// propagates the change everywhere — replacing the old hand-maintained mirroring.
const MANIFEST = {
  'command-body.md': [
    `${IDE}/claude-code/.claude/skills/criminalsquad/SKILL.md`,
    `${IDE}/gemini-cli/.gemini/skills/criminalsquad/SKILL.md`,
    `${IDE}/qwen-code/.qwen/skills/criminalsquad/SKILL.md`,
    `${IDE}/vscode-copilot/.github/prompts/criminalsquad.prompt.md`,
    `${IDE}/antigravity/.agent/workflows/criminalsquad.md`,
    `${IDE}/codex/AGENTS.md`,
    `${IDE}/opencode/AGENTS.md`,
    '.claude/skills/criminalsquad/SKILL.md', // cópia do próprio repo
  ],
  'instructions-body.md': [
    `${IDE}/claude-code/CLAUDE.md`,
    `${IDE}/gemini-cli/GEMINI.md`,
    `${IDE}/qwen-code/QWEN.md`,
    `${IDE}/antigravity/.agent/rules/criminalsquad.md`,
    `${IDE}/cursor/.cursor/rules/criminalsquad.mdc`,
    `${IDE}/trae/.trae/rules/criminalsquad.md`,
    'CLAUDE.md', // cópia do próprio repo
  ],
};

// CRLF-tolerant: a target edited on Windows (or git autocrlf) must not silently
// lose its IDE-specific frontmatter when the generator runs.
const FRONTMATTER_RE = /^(---\r?\n[\s\S]*?\r?\n---)\r?\n/;

// Reassembles a target file: preserve its existing frontmatter (if any) and use
// the shared body. Frontmatter + blank line + body, or just the body.
function render(currentContent, body) {
  const match = currentContent.match(FRONTMATTER_RE);
  return match ? `${match[1]}\n\n${body}` : body;
}

// Regenerates the IDE template bodies from templates/ide-assets/. With
// { check: true } nothing is written — it returns the files that are out of sync
// (used by tests/CI). Returns the list of changed (or would-be-changed) files.
export async function buildIdeTemplates({ check = false } = {}) {
  const changed = [];
  for (const [asset, files] of Object.entries(MANIFEST)) {
    const body = await readFile(join(ASSETS_DIR, asset), 'utf-8');
    for (const rel of files) {
      const path = join(ROOT, rel);
      const current = await readFile(path, 'utf-8');
      const next = render(current, body);
      if (next !== current) {
        changed.push(rel);
        if (!check) await writeFile(path, next, 'utf-8');
      }
    }
  }
  return changed;
}

// Run directly: `node src/build-ide-templates.js`
const isMain = process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const changed = await buildIdeTemplates();
  console.log(
    changed.length
      ? `IDE templates atualizados (${changed.length}):\n  ${changed.join('\n  ')}`
      : 'IDE templates já estão em sincronia com templates/ide-assets/.'
  );
}
