// Os testes de init/update criam centenas de arquivos por fixture. O progresso
// é útil no CLI real, mas em uma suíte completa gerava dezenas de milhares de
// linhas, consumia memória do subprocesso e tornava o CI instável. Use
// CRIMINALSQUAD_TEST_VERBOSE=1 quando precisar inspecionar esses logs.
if (process.env.CRIMINALSQUAD_TEST_VERBOSE !== '1') {
  console.log = () => {};
}
