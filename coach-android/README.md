# Coach Android

Aplicativo pessoal, local-first, para conciliar evolução na musculação com a preparação saudável para uma maratona em 2027. Ele reúne sinais do Health Connect, peso/corridas do Evolução, resumos do NutriTrack e um check-in rápido, calcula um briefing determinístico e, opcionalmente, pede uma segunda opinião estruturada ao Gemini.

Na versão `0.2.0`, as integrações entre os três aplicativos são somente leitura. Propostas aceitas continuam sendo apenas decisões locais: nada é alterado silenciosamente no Evolução ou no NutriTrack.

## O que já funciona

- Briefing em português com prontidão, cobertura dos dados e explicações.
- Health Connect real e somente leitura: sono, passos, frequência cardíaca de repouso e peso de fallback, com agregação oficial para evitar duplicar telefone, relógio e Sleep Cycle.
- Peso primário vindo do Evolução, com a data original preservada; se o Evolução não tiver pesagem, o Health Connect continua como fallback.
- Corridas realmente registradas no Evolução: quantidade, distância e duração. Passos isolados continuam sem ser tratados como corrida.
- NutriTrack por contrato agregado: refeições, calorias, proteína, carboidrato, gordura, água e metas do dia. Nomes de refeições/alimentos, fotos, hábitos e chave Gemini não atravessam o provider.
- Concessão parcial: importa somente os sinais autorizados, informa quantos faltam e solicita depois apenas as permissões restantes.
- Estados distintos para indisponibilidade, atualização do provider, acesso parcial/ausente, ausência de registro, sincronização pausada e valor observado.
- Check-in de aproximadamente 30 segundos: energia, sono percebido, motivação, dor muscular, dor articular e nota curta.
- Motor JavaScript puro e determinístico, funcional offline e sem sensores.
- Regras conservadoras: ausente nunca vira zero; passos nunca viram treino de corrida; alertas bloqueiam progressões agressivas.
- Propostas granulares com motivo, benefício, custo, confiança e alternativa; aceitar ou rejeitar apenas registra a primeira decisão local, de forma atômica.
- Gemini opcional com Structured Output, schema e validador local; nenhuma ferramenta/function calling.
- Chave Gemini cifrada com AES-GCM e chave não exportável no Android Keystore.
- Preview obrigatório “O que será enviado”, sem nota livre, banco bruto ou chave, seguido de confirmação nativa e recibo de uso único com expiração.
- Notificação diária inexacta perto de 05:40, respeitando as políticas de bateria do Android.
- Gerenciamento de acesso ao Health Connect, remoção da chave e exclusão completa dos dados locais com confirmação nativa; após excluir, a reimportação fica pausada até a reconexão explícita.
- Insets nativos encaminhados ao CSS, mantendo cabeçalho, abas inferiores e toast fora da área dos controles/gestos do Android.

## Requisitos

- Android 8.0 / API 26 ou superior para instalar.
- Health Connect efetivamente disponível no Android 9 ou superior; no Android 14 ele faz parte do sistema. Sem ele, o check-in e o briefing local continuam funcionando.
- JDK 17 para compilar.
- Android SDK com `compileSdk 36`.
- Node.js para a suíte do motor e para o teste visual opcional.
- Para as fontes locais, instale as builds atualizadas do Evolução e do NutriTrack e abra cada uma uma vez para publicar os dados já existentes.

## Compilar e testar

No PowerShell, dentro de `coach-android/`, aponte `JAVA_HOME` para um JDK 17. Este workspace já possui um toolchain portátil no projeto irmão:

```powershell
$env:JAVA_HOME = (Resolve-Path '..\evolucao-android\_toolchain\jdk17\jdk-17.0.19+10').Path
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
```

Execute cada comando diretamente, sem envolver o Gradle em `Select-Object`, `Tee-Object` ou jobs de segundo plano:

```powershell
.\gradlew.bat :app:testDebugUnitTest --no-daemon --no-watch-fs --console=plain
node app/src/test/js/engine.test.js
.\gradlew.bat :app:assembleDebug --no-daemon --no-watch-fs --console=plain
```

O APK é gerado em `app/build/outputs/apk/debug/app-debug.apk`.

O teste visual usa Chrome/Edge headless, uma ponte simulada e os assets reais:

```powershell
node app/src/test/js/ui-smoke.js
```

Ele verifica 360, 412 e 480 px, overflow horizontal, alvos de toque de 48 px, foco, as nove regiões do check-in, reidratação, alerta de segurança, decisão persistida, acesso parcial e os dois passos da revisão Gemini. Oito screenshots ficam em `artifacts/ui/`.

Também rode o lint antes de distribuir:

```powershell
.\gradlew.bat :app:lintDebug --no-daemon --no-watch-fs --console=plain
```

### Instalar no telefone

O arquivo pronto desta build é `app/build/outputs/apk/debug/app-debug.apk` (`com.coach.app`). Há duas opções:

1. Copie o APK para o telefone, abra o arquivo e autorize “instalar apps desconhecidos” somente para o gerenciador usado; ou
2. Ative **Opções do desenvolvedor → Depuração USB**, conecte o cabo, confirme a impressão digital e execute:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" devices
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" install -r .\app\build\outputs\apk\debug\app-debug.apk
```

Para as integrações locais funcionarem já na primeira abertura, instale/atualize nesta ordem:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" install -r ..\evolucao-android\app\build\outputs\apk\debug\app-debug.apk
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" install -r ..\nutricao-android\NutriTrack.apk
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" install -r .\app\build\outputs\apk\debug\app-debug.apk
```

Abra o **Evolução** e o **NutriTrack** uma vez depois da atualização; isso cria os resumos sanitizados usados pelo Coach. Estas são builds de desenvolvimento assinadas localmente, não publicações da Play Store.

## Primeiro uso

1. Abra o app. A ausência do Health Connect não bloqueia a inicialização.
2. Abra Evolução e NutriTrack uma vez, volte ao Coach e toque em **Sincronizar tudo**.
3. Em “Sinais observados”, toque em **Conectar** e escolha entre as quatro permissões do Health Connect. O app continua com acesso parcial e nunca solicita escrita.
4. Faça o check-in. O briefing e as propostas são recalculados imediatamente.
5. Se quiser a revisão remota, abra **Ajustes**, salve sua chave da Gemini API e volte ao briefing.
6. Ao pedir a revisão, confira o preview obrigatório e confirme novamente no diálogo nativo.
7. Ative o briefing das 05:40 se desejar a notificação diária.

## Privacidade e segurança

- Não há analytics.
- Todo conteúdo da interface vem do próprio APK; navegação, downloads, conteúdo misto, arquivos e providers são bloqueados no WebView.
- O banco SQLite é privado ao app e o backup Android está desativado.
- A chave não entra em assets, SQLite, respostas da ponte ou logs.
- A chamada Gemini usa HTTPS e a chave no header `x-goog-api-key`, com timeouts e limites de resposta.
- A resposta remota não modifica plano nem proposta; só uma opinião estruturada, revalidada localmente e vinculada ao snapshot/plano atual é armazenada.
- O provider do Evolução expõe somente treinos normalizados e peso/data; o provider do NutriTrack expõe somente totais e metas diárias agregadas. Ambos validam o pacote chamador e são read-only.
- **Excluir todos os dados locais** remove registros normalizados, check-ins, snapshots, planos, propostas, opiniões, decisões, chave e agendamento. Dados originais permanecem sob controle do Health Connect, Evolução e NutriTrack.

## Limites conhecidos da versão 0.2.0

- A leitura local só se atualiza depois que a build nova do aplicativo-fonte é aberta ao menos uma vez; o Coach não tenta abrir outros apps em segundo plano.
- Corrida vem do Evolução. A conexão direta com Strava requer OAuth e um backend que mantenha o `client_secret` fora do APK; o desenho seguro está em [STRAVA_INTEGRATION.md](STRAVA_INTEGRATION.md).
- Alimentação representa o que foi registrado no NutriTrack no próprio dia; ausência de registro continua sendo “dados insuficientes”, nunca zero ingerido.
- Agregados de 7/28 dias e baseline individual de 21–28 dias ainda não estão disponíveis.
- Notificação é inexacta; o Android pode atrasá-la para economizar bateria.
- A base anterior foi validada em AVD Android 14. Os providers entre apps e os novos insets da v0.2 ainda precisam ser confirmados no telefone com dados pessoais e o modo de navegação real do aparelho.
- O Coach não diagnostica, prescreve ou substitui médico, nutricionista ou treinador.

Veja [ARCHITECTURE.md](ARCHITECTURE.md) para contratos e fluxo interno, [AGENTS.md](AGENTS.md) para manutenção e [NIGHTLY_STATUS.md](NIGHTLY_STATUS.md) para evidências de execução.
