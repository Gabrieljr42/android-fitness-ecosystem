# Instruções para agentes — Coach Android

Estas regras são obrigatórias para qualquer agente que continue o projeto.

## Escopo e autoridade

- Trabalhe somente em `coach-android/`, salvo pedido explícito do usuário.
- Não modifique `evolucao-android`, NutriTrack ou outros projetos irmãos, exceto quando a tarefa pedir explicitamente uma alteração no contrato de integração entre apps. O JDK portátil do Evolução pode ser usado para executar a build.
- A versão 0.2.0 é review-only: aceitar/editar uma proposta registra uma decisão local; os providers do Evolução/NutriTrack são somente leitura e nada escreve neles ou no Health Connect.
- Preserve alterações existentes e nunca use `git reset --hard`, `git checkout --` ou limpeza recursiva ampla.

## Invariantes do produto

1. Dados ausentes são `ABSENT`/`null`, nunca zero ou valor inventado.
2. O mesmo snapshot + versão do motor deve produzir exatamente a mesma saída.
3. O plano local funciona sem rede, chave, Health Connect ou relógio.
4. Passos não representam corrida; corrida exige sessão do Evolução/Strava e alimentação exige registro agregado do NutriTrack. Fonte ausente fica insuficiente.
5. Dor articular ou dor muscular forte bloqueia mudanças agressivas sem emitir diagnóstico.
6. Gemini é consultivo: sem function calling, sem mutação, sem confiança em texto livre e sem evidência inventada.
7. Chaves/segredos nunca entram em assets, SQLite, logs, mensagens de erro ou respostas da bridge.
8. Toda operação WebView precisa estar na allowlist, ser versionada, limitada em bytes e validada no nativo.
9. Uma resposta assíncrona obsoleta deve ser descartada por hash de snapshot/plano.
10. Toda escrita futura em fontes externas exige aprovação granular, contrato versionado e recibo — não implemente implicitamente.

## Mapa do código

- `domain/`: contratos puros, canonicalização, snapshot e data lógica.
- `data/`: schema SQLite v1 e acesso tipado.
- `health/`: adaptador Health Connect e sincronização/deduplicação.
- `bridge/`: envelope, allowlist e parsers de fronteira.
- `ai/`: payload sanitizado, JSON Schema, transporte e validador Gemini.
- `security/`: política de credencial e Android Keystore.
- `notify/`: cálculo/agendamento do briefing e receivers.
- `assets/www/`: UI local e motor determinístico.
- `src/test/java/`: testes JUnit/Robolectric.
- `src/test/js/`: testes Node do motor e smoke visual.

## Build confiável no Windows

Use JDK 17. Não use o JDK 20 do sistema. O workspace com caminho Unicode exige `android.overridePathCheck=true`, já configurado.

```powershell
$env:JAVA_HOME = (Resolve-Path '..\evolucao-android\_toolchain\jdk17\jdk-17.0.19+10').Path
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
.\gradlew.bat :app:testDebugUnitTest --no-daemon --no-watch-fs --console=plain
node app/src/test/js/engine.test.js
.\gradlew.bat :app:assembleDebug --no-daemon --no-watch-fs --console=plain
```

- Rode o Gradle diretamente. Pipelines PowerShell que filtram a saída podem deixar o agente “aguardando” após o processo terminar.
- `kotlin.compiler.execution.strategy=in-process` é intencional: evita falhas do daemon Kotlin em AppData/caminho Unicode.
- Aguarde o processo atual e faça polling; nunca lance builds Gradle duplicadas.
- Não use um `JUnitCore` manual: ele perde classes/recursos do Android. Use a task Gradle.

## Gate para qualquer mudança

- Adicione ou atualize testes para comportamento e abuso da fronteira.
- Rode JUnit/Robolectric e `engine.test.js`.
- Para UI, rode `ui-smoke.js`; se houver AVD/aparelho, siga ADB: resolução, `uiautomator dump`, interação, screenshot e logcat.
- Rode `assembleDebug` e registre exit code, tamanho e SHA-256 no status.
- Confirme que nenhum arquivo de projeto irmão foi alterado.
- Atualize README/arquitetura/status se o contrato ou limite mudar.
