import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkSquad } from '../src/squad-check.js';
import { AREA_DEMO, SKILLS_DEMO, SQUADS_DEMO } from './fixtures/caminhos.js';

// `skills:` no squad.yaml e no frontmatter dos agentes é DECLARAÇÃO. O
// `check-squad` validava 20 coisas e nenhuma sobre skills — dava para declarar
// skill inexistente, ou `quarantined`, e passar verde.
//
// É a mesma classe que este motor persegue em toda parte: declaração que ninguém
// confere. Aqui ela é pega no DESENHO, uma camada antes da execução.

/** Copia o squad da fixture para um temporário e troca a lista de skills. */
function squadCom(skills) {
  const raiz = mkdtempSync(join(tmpdir(), 'legalsquad-squad-skills-'));
  const squadsDir = join(raiz, 'squads');
  cpSync(SQUADS_DEMO, squadsDir, { recursive: true });

  const yamlPath = join(squadsDir, 'demo-squad', 'squad.yaml');
  const yaml = readFileSync(yamlPath, 'utf8')
    .replace(/^skills:\n(?:\s+-\s+.+\n)*/m, `skills:\n${skills.map((s) => `  - ${s}\n`).join('')}`);
  writeFileSync(yamlPath, yaml);

  return { squadsDir, skillsDir: SKILLS_DEMO };
}

function codigos(resultado, severidade) {
  return resultado.issues.filter((i) => i.severity === severidade).map((i) => i.code);
}

test('squad da fixture, com skills que existem e são active, passa', () => {
  const resultado = checkSquad('demo-squad', { squadsDir: SQUADS_DEMO, skillsDir: SKILLS_DEMO });

  assert.equal(
    codigos(resultado, 'error').includes('skill-declarada-inexistente'),
    false,
    `a fixture não pode falhar no caminho feliz — ${JSON.stringify(resultado.issues)}`
  );
});

test('skill declarada que NÃO existe no disco é erro, e o id aparece', () => {
  // Promessa quebrada no desenho: o runner injetaria uma skill que não está lá,
  // e o step seguiria com menos instrução do que o squad diz que tem.
  const { squadsDir, skillsDir } = squadCom(['demo-peca-alpha', 'skill-que-nao-existe']);

  const resultado = checkSquad('demo-squad', { squadsDir, skillsDir });

  assert.ok(codigos(resultado, 'error').includes('skill-declarada-inexistente'));
  assert.match(JSON.stringify(resultado.issues), /skill-que-nao-existe/);
  assert.equal(resultado.ok, false);
});

test('skill quarantined ou deprecated não entra em squad de produção', () => {
  // O resolvedor já bloqueia isso em runtime. Pegar no desenho evita que alguém
  // descubra só quando o advogado estiver rodando a peça.
  for (const proibida of ['demo-quarentena', 'demo-deprecada']) {
    const { squadsDir, skillsDir } = squadCom([proibida]);

    const resultado = checkSquad('demo-squad', { squadsDir, skillsDir });

    assert.ok(
      codigos(resultado, 'error').includes('skill-lifecycle-proibido'),
      `${proibida} tinha de ser recusada no desenho`
    );
  }
});

test('skill pilot passa com AVISO — exige opt-in, não é proibida', () => {
  // `pilot` é escolha consciente com fallback, não erro. Tratá-la como erro
  // impediria o uso legítimo; tratá-la como `active` esconderia a escolha.
  const { squadsDir, skillsDir } = squadCom(['demo-piloto']);

  const resultado = checkSquad('demo-squad', { squadsDir, skillsDir });

  assert.equal(codigos(resultado, 'error').includes('skill-lifecycle-proibido'), false);
  assert.ok(codigos(resultado, 'warn').includes('skill-pilot-sem-opt-in'));
});

test('sem `skills/` no disco a checagem degrada com UM aviso, não N erros', () => {
  // Área não instalada é estado normal do motor (ele é content-free). Cuspir um
  // erro por skill declarada transformaria "área ausente" em "squad quebrado",
  // que é a confusão entre ausência e defeito que o motor já não comete.
  const { squadsDir } = squadCom(['demo-peca-alpha', 'demo-calculo-beta']);

  const resultado = checkSquad('demo-squad', { squadsDir, skillsDir: join(AREA_DEMO, 'nao-existe') });

  assert.equal(codigos(resultado, 'error').includes('skill-declarada-inexistente'), false);
  assert.deepEqual(
    codigos(resultado, 'warn').filter((c) => c === 'skills-nao-instaladas'),
    ['skills-nao-instaladas'],
    'exatamente um aviso, não um por skill'
  );
});
