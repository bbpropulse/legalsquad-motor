import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSquad } from '../src/squad-check.js';
import { SQUADS_DEMO } from './fixtures/caminhos.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Copia a fixture para um tmp e aplica uma avaria — prova que o gate morde. */
async function comAvaria(avariar) {
  const tmp = await mkdtemp(join(tmpdir(), 'squad-check-'));
  await cp(join(SQUADS_DEMO, 'demo-squad'), join(tmp, 'demo-squad'), { recursive: true });
  await avariar(join(tmp, 'demo-squad'));
  return { tmp, resultado: checkSquad('demo-squad', { squadsDir: tmp }) };
}

const codigos = (r) => r.issues.map((i) => i.code);

test('a fixture demo-squad passa no validador sem nenhum erro', () => {
  const r = checkSquad('demo-squad', { squadsDir: SQUADS_DEMO });

  assert.equal(r.ok, true, `issues: ${JSON.stringify(r.issues, null, 2)}`);
  assert.equal(r.issues.filter((i) => i.severity === 'error').length, 0);
  assert.equal(r.squad, 'demo-squad');
});

test('squad inexistente é erro claro, não exceção', () => {
  const r = checkSquad('nao-existe', { squadsDir: SQUADS_DEMO });
  assert.equal(r.ok, false);
  assert.ok(codigos(r).includes('squad-nao-encontrado'));
});

test('goal ausente ou vazio reprova', async () => {
  const { tmp, resultado } = await comAvaria(async (dir) => {
    const yaml = await readFile(join(dir, 'squad.yaml'), 'utf8');
    await writeFile(join(dir, 'squad.yaml'), yaml.replace(/^goal: .*$/m, 'goal: ""'));
  });
  try {
    assert.equal(resultado.ok, false);
    assert.ok(codigos(resultado).includes('goal-ausente'));
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('success_criteria fora da faixa 3–6 reprova (a rubrica precisa ser útil)', async () => {
  const { tmp, resultado } = await comAvaria(async (dir) => {
    const yaml = await readFile(join(dir, 'squad.yaml'), 'utf8');
    // Deixa só 1 critério: rubrica curta demais para medir qualquer coisa.
    await writeFile(
      join(dir, 'squad.yaml'),
      yaml.replace(/^success_criteria:\n(?: {2}- .*\n)+/m, 'success_criteria:\n  - "Único critério"\n')
    );
  });
  try {
    assert.ok(codigos(resultado).includes('success-criteria-insuficiente'));
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('_evals/scores.md ausente reprova — o harness de eval nasce com o squad', async () => {
  const { tmp, resultado } = await comAvaria(async (dir) => {
    await rm(join(dir, '_evals', 'scores.md'));
  });
  try {
    assert.equal(resultado.ok, false);
    assert.ok(codigos(resultado).includes('evals-scores-ausente'));
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('nenhum caso-ouro reprova', async () => {
  const { tmp, resultado } = await comAvaria(async (dir) => {
    await rm(join(dir, '_evals', 'casos'), { recursive: true });
  });
  try {
    assert.ok(codigos(resultado).includes('caso-ouro-ausente'));
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('step com file: que não existe em disco reprova', async () => {
  const { tmp, resultado } = await comAvaria(async (dir) => {
    await rm(join(dir, 'pipeline', 'steps', 'step-03-analise.md'));
  });
  try {
    assert.equal(resultado.ok, false);
    const issue = resultado.issues.find((i) => i.code === 'step-file-ausente');
    assert.ok(issue, 'deve apontar o arquivo de step faltante');
    assert.match(issue.detail, /step-03/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('agent: que não está no squad-party.csv reprova', async () => {
  const { tmp, resultado } = await comAvaria(async (dir) => {
    const y = await readFile(join(dir, 'pipeline', 'pipeline.yaml'), 'utf8');
    await writeFile(
      join(dir, 'pipeline', 'pipeline.yaml'),
      y.replace('agent: analista-demo', 'agent: fantasma-demo')
    );
  });
  try {
    assert.ok(codigos(resultado).includes('agent-fora-do-party'));
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('agente do party sem arquivo .custom.md em disco reprova', async () => {
  const { tmp, resultado } = await comAvaria(async (dir) => {
    await rm(join(dir, 'agents', 'analista-demo.custom.md'));
  });
  try {
    assert.ok(codigos(resultado).includes('agent-file-ausente'));
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('on_reject apontando para step inexistente reprova', async () => {
  const { tmp, resultado } = await comAvaria(async (dir) => {
    const y = await readFile(join(dir, 'pipeline', 'pipeline.yaml'), 'utf8');
    await writeFile(
      join(dir, 'pipeline', 'pipeline.yaml'),
      y.replace(/on_reject: step-05/g, 'on_reject: step-99')
    );
  });
  try {
    assert.ok(codigos(resultado).includes('on-reject-invalido'));
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('checkpoint declarado que não existe entre os steps reprova', async () => {
  const { tmp, resultado } = await comAvaria(async (dir) => {
    const y = await readFile(join(dir, 'pipeline', 'pipeline.yaml'), 'utf8');
    await writeFile(
      join(dir, 'pipeline', 'pipeline.yaml'),
      y.replace(/^checkpoints:\n {2}- step-01$/m, 'checkpoints:\n  - step-77')
    );
  });
  try {
    assert.ok(codigos(resultado).includes('checkpoint-invalido'));
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('code do squad.yaml divergente da pasta reprova (o dashboard casa por code)', async () => {
  const { tmp, resultado } = await comAvaria(async (dir) => {
    const yaml = await readFile(join(dir, 'squad.yaml'), 'utf8');
    await writeFile(join(dir, 'squad.yaml'), yaml.replace(/^code: .*$/m, 'code: "outro-nome"'));
  });
  try {
    assert.ok(codigos(resultado).includes('code-divergente'));
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('squad sem nenhum checkpoint humano gera aviso, não erro', async () => {
  const { tmp, resultado } = await comAvaria(async (dir) => {
    const y = await readFile(join(dir, 'pipeline', 'pipeline.yaml'), 'utf8');
    await writeFile(join(dir, 'pipeline', 'pipeline.yaml'), y.replace(/^checkpoints:\n(?: {2}- .*\n)+/m, 'checkpoints: []\n'));
  });
  try {
    const issue = resultado.issues.find((i) => i.code === 'sem-checkpoint');
    assert.ok(issue, 'deve avisar sobre ausência de checkpoint');
    assert.equal(issue.severity, 'warn', 'é aviso: nem todo squad precisa de aprovação humana');
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

// --- grafo de dependências: depends_on, ciclos, parallel_group, artefatos ---

/** Reescreve o pipeline.yaml da cópia avariada. */
async function editarPipeline(dir, transformar) {
  const caminho = join(dir, 'pipeline', 'pipeline.yaml');
  await writeFile(caminho, transformar(await readFile(caminho, 'utf8')));
}

test('depends_on apontando para step inexistente reprova', async () => {
  const { tmp, resultado } = await comAvaria(async (dir) => {
    await editarPipeline(dir, (y) => y.replace('depends_on: step-01', 'depends_on: step-00'));
  });
  try {
    assert.equal(resultado.ok, false);
    const issue = resultado.issues.find((i) => i.code === 'depends-on-invalido');
    assert.ok(issue, `esperava depends-on-invalido; veio ${codigos(resultado)}`);
    assert.match(issue.detail, /step-00/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('ciclo em depends_on reprova — pipeline que nunca começa', async () => {
  const { tmp, resultado } = await comAvaria(async (dir) => {
    // step-02 passa a depender de step-03, que já depende de step-02.
    await editarPipeline(dir, (y) => y.replace('depends_on: step-01', 'depends_on: step-03'));
  });
  try {
    assert.equal(resultado.ok, false);
    const issue = resultado.issues.find((i) => i.code === 'depends-on-ciclico');
    assert.ok(issue, `esperava depends-on-ciclico; veio ${codigos(resultado)}`);
    assert.match(issue.detail, /step-02|step-03/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('parallel_group cujos membros não convergem num depends_on comum reprova', async () => {
  const { tmp, resultado } = await comAvaria(async (dir) => {
    // step-09 passa a esperar só a Revisão A: a Revisão B fica sem junção.
    await editarPipeline(dir, (y) => y.replace('depends_on: [step-07, step-08]', 'depends_on: step-07'));
  });
  try {
    assert.equal(resultado.ok, false);
    const issue = resultado.issues.find((i) => i.code === 'parallel-group-sem-convergencia');
    assert.ok(issue, `esperava parallel-group-sem-convergencia; veio ${codigos(resultado)}`);
    assert.match(issue.detail, /revisao-dupla-demo/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('parallel_group com um único membro é aviso — grupo de um não paraleliza nada', async () => {
  const { tmp, resultado } = await comAvaria(async (dir) => {
    await editarPipeline(dir, (y) =>
      y.replace(/^ {4}parallel_group: revisao-dupla-demo$/m, '    parallel_group: revisao-solo-demo')
    );
  });
  try {
    const issue = resultado.issues.find((i) => i.code === 'parallel-group-unitario');
    assert.ok(issue, `esperava parallel-group-unitario; veio ${codigos(resultado)}`);
    assert.equal(issue.severity, 'warn');
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('artefato prometido no output do pipeline sem step que o produza reprova', async () => {
  const { tmp, resultado } = await comAvaria(async (dir) => {
    await editarPipeline(dir, (y) =>
      y.replace(/^ {4}- output\/entrega-demo-final\.md$/m, '    - output/entrega-demo-final.md\n    - output/fantasma.md')
    );
  });
  try {
    assert.equal(resultado.ok, false);
    const issue = resultado.issues.find((i) => i.code === 'artefato-sem-produtor');
    assert.ok(issue, `esperava artefato-sem-produtor; veio ${codigos(resultado)}`);
    assert.match(issue.detail, /fantasma\.md/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('dois steps declarando o mesmo artefato reprova — um sobrescreve o outro', async () => {
  const { tmp, resultado } = await comAvaria(async (dir) => {
    await editarPipeline(dir, (y) => y.replace('        - output/analise.md', '        - output/triagem.md'));
  });
  try {
    assert.equal(resultado.ok, false);
    const issue = resultado.issues.find((i) => i.code === 'artefato-duplicado');
    assert.ok(issue, `esperava artefato-duplicado; veio ${codigos(resultado)}`);
    assert.match(issue.detail, /triagem\.md/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('o CLI check-squad sai 0 no squad íntegro e != 0 no avariado', async () => {
  const ok = spawnSync(
    process.execPath,
    [join(RAIZ, 'bin', 'legalsquad.js'), 'check-squad', 'demo-squad', '--squads-dir', SQUADS_DEMO],
    { encoding: 'utf8' }
  );
  assert.equal(ok.status, 0, ok.stderr || ok.stdout);
  assert.match(ok.stdout, /demo-squad/);

  const tmp = await mkdtemp(join(tmpdir(), 'squad-check-cli-'));
  try {
    await mkdir(join(tmp, 'quebrado'), { recursive: true });
    const ruim = spawnSync(
      process.execPath,
      [join(RAIZ, 'bin', 'legalsquad.js'), 'check-squad', 'quebrado', '--squads-dir', tmp],
      { encoding: 'utf8' }
    );
    assert.notEqual(ruim.status, 0, 'squad quebrado precisa sair com código != 0 para servir de gate');
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Chefe do squad — a VOZ do run, não mais um executor
// ---------------------------------------------------------------------------
//
// O chefe é quem fala com o profissional durante a execução e é onde cabe o
// pedido fora do fluxo ("espera, o valor da causa mudou"), que hoje não tem
// lugar nenhum: só existem os checkpoints declarados no pipeline. Ele NÃO
// decide a ordem dos steps — isso é do pipeline.yaml, e trocar essa lei por
// improviso perderia os gates que tornam o run auditável.
//
// Por isso ele vive no squad.yaml e não no squad-party.csv: quem está no party
// executa step e ocupa desk no dashboard. O chefe nunca executa.

test('squad sem chefe continua válido — o campo é opcional', async () => {
  // Todo squad existente foi criado sem ele; exigir agora quebraria a base.
  const r = checkSquad('demo-squad', { squadsDir: SQUADS_DEMO });
  assert.equal(r.ok, true);
  assert.ok(!codigos(r).includes('chefe-sem-nome'));
});

test('chefe sem nome NÃO reprova — o motor tem um chefe padrão', async () => {
  // O nome default (Mike) existe justamente para que nenhum squad precise
  // declarar chefe para ganhar uma voz. Reprovar aqui obrigaria todo squad a
  // repetir a mesma linha, que é o oposto de ter um padrão.
  const { tmp, resultado } = await comAvaria(async (dir) => {
    const yaml = await readFile(join(dir, 'squad.yaml'), 'utf8');
    await writeFile(join(dir, 'squad.yaml'), `${yaml}\nchefe:\n  icon: "🎩"\n`);
  });
  try {
    assert.equal(resultado.ok, true, JSON.stringify(resultado.issues));
    assert.ok(!codigos(resultado).includes('chefe-sem-nome'));
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('chefe bem formado passa', async () => {
  const { tmp, resultado } = await comAvaria(async (dir) => {
    const yaml = await readFile(join(dir, 'squad.yaml'), 'utf8');
    await writeFile(join(dir, 'squad.yaml'), `${yaml}\nchefe:\n  nome: "Helena Braga"\n  icon: "🎩"\n`);
  });
  try {
    assert.equal(resultado.ok, true, JSON.stringify(resultado.issues));
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('chefe com id de agente do party reprova — dois donos para a mesma voz', async () => {
  // Se o chefe usar o id de quem executa, o handoff do dashboard passa a apontar
  // para alguém que é, ao mesmo tempo, quem fala e quem produz — e o registro do
  // run deixa de dizer quem fez o quê.
  const { tmp, resultado } = await comAvaria(async (dir) => {
    const yaml = await readFile(join(dir, 'squad.yaml'), 'utf8');
    await writeFile(join(dir, 'squad.yaml'), `${yaml}\nchefe:\n  id: redator-demo\n  nome: "Helena"\n`);
  });
  try {
    assert.equal(resultado.ok, false);
    assert.ok(codigos(resultado).includes('chefe-colide-com-agente'));
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});
