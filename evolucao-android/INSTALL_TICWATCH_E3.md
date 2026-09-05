# Instalar o Evolução no TicWatch E3

Este guia não apaga dados. O APK mobile vai no telefone; o APK Wear vai no relógio. Ambos usam o package `com.evolucao.treino`, então escolha o serial com atenção.

## 1. Preparar os APKs

Abra PowerShell na pasta:

```text
C:\Users\gabri\OneDrive\Área de Trabalho\Android\evolucao-android
```

Compile e valide testes/lint (recomendado antes de instalar):

```powershell
.\build-wear.ps1 -WithTests -WithLint
```

Para uma recompilação rápida depois de uma validação completa, use apenas `.\build-wear.ps1`.

Arquivos gerados:

```text
app\build\outputs\apk\debug\app-debug.apk
wear\build\outputs\apk\debug\wear-debug.apk
```

## 2. Instalar Android SDK Platform Tools

O projeto tenta usar primeiro `_toolchain\android-sdk\platform-tools\adb.exe`. Se ele não existir:

1. Baixe **SDK Platform Tools for Windows** na página oficial: [developer.android.com/tools/releases/platform-tools](https://developer.android.com/tools/releases/platform-tools).
2. Extraia, por exemplo, em `C:\Android\platform-tools`.
3. Você pode definir `ANDROID_SDK_ROOT` para a pasta do SDK, mas os scripts não alteram seu PATH permanentemente.
4. Confirme:

```powershell
C:\Android\platform-tools\adb.exe version
```

Para os comandos manuais deste guia reconhecerem `adb` sem alterar o PATH, crie um alias que vale somente na janela atual do PowerShell. Se usar o SDK incluído no projeto:

```powershell
Set-Alias adb (Resolve-Path .\_toolchain\android-sdk\platform-tools\adb.exe)
adb version
```

Se extraiu somente o Platform Tools em `C:\Android`:

```powershell
Set-Alias adb C:\Android\platform-tools\adb.exe
adb version
```

Ao fechar o PowerShell, o alias desaparece; nada é gravado permanentemente no sistema.

## 3. Ativar Opções do desenvolvedor no TicWatch

Os nomes variam um pouco conforme a versão:

1. No relógio, abra **Configurações**.
2. Entre em **Sistema > Sobre** ou **Sobre > Versões**.
3. Toque 7 vezes em **Número da versão / Build number**.
4. Informe PIN/padrão se solicitado.
5. Volte e abra **Opções do desenvolvedor**.

## 4. Wear OS com Wireless debugging e pareamento

1. Relógio e PC precisam estar na mesma rede Wi‑Fi.
2. Em **Opções do desenvolvedor**, ligue **ADB debugging**.
3. Ligue **Wireless debugging / Depuração sem fio**.
4. Abra **Pair new device / Parear novo dispositivo**.
5. Anote o IP, a **porta de pareamento** e o código de seis dígitos.
6. No PowerShell, use a porta mostrada nessa tela:

```powershell
adb pair IP_DO_RELOGIO:PORTA_DE_PAREAMENTO
```

7. Digite o código quando solicitado.
8. Volte à tela principal de depuração sem fio e anote a **porta de depuração** — normalmente ela é diferente.
9. Conecte:

```powershell
adb connect IP_DO_RELOGIO:PORTA_DE_DEPURACAO
```

Exemplo ilustrativo (não copie as portas):

```powershell
adb pair 192.168.1.50:37123
adb connect 192.168.1.50:40991
```

## 5. Wear OS antigo: ADB por Wi‑Fi

Se não existir “Parear novo dispositivo”:

1. Ligue **ADB debugging** e **Debug over Wi‑Fi / Depurar por Wi‑Fi**.
2. Aceite a confirmação no relógio.
3. Anote o IP exibido, normalmente com porta `5555`.
4. Execute:

```powershell
adb connect IP_DO_RELOGIO:5555
```

Algumas versões antigas exigem conexão USB/base de desenvolvimento para ativar `adb tcpip 5555`; o TicWatch E3 normalmente usa o fluxo oferecido no próprio menu.

## 6. Conectar o telefone

No Android do telefone:

1. Ative Opções do desenvolvedor tocando 7 vezes no Build number.
2. Ative **Depuração USB** e conecte por cabo, ou use o mesmo fluxo de depuração sem fio.
3. Aceite a impressão digital RSA na tela do telefone.

## 7. Ver os seriais e diferenciar os aparelhos

```powershell
adb devices -l
```

Saída típica:

```text
R58...             device product:... model:SM_...       transport_id:1
192.168.1.50:40991 device product:rubyfish model:TicWatch_E3 transport_id:2
```

Confirme o relógio:

```powershell
adb -s SERIAL_DO_RELOGIO shell getprop ro.product.model
adb -s SERIAL_DO_RELOGIO shell getprop ro.build.version.sdk
adb -s SERIAL_DO_RELOGIO shell getprop ro.build.version.release
adb -s SERIAL_DO_RELOGIO shell getprop ro.build.characteristics
```

O último comando deve conter `watch`. Os scripts fazem essa validação e recusam o dispositivo errado.

## 8. Instalar no relógio

Forma segura recomendada:

```powershell
.\install-wear-debug.ps1 -Serial SERIAL_DO_RELOGIO
```

Para compilar antes:

```powershell
.\install-wear-debug.ps1 -Serial SERIAL_DO_RELOGIO -Build
```

Comando ADB equivalente:

```powershell
adb -s SERIAL_DO_RELOGIO install -r "C:\Users\gabri\OneDrive\Área de Trabalho\Android\evolucao-android\wear\build\outputs\apk\debug\wear-debug.apk"
```

## 9. Instalar no telefone

```powershell
.\install-mobile-debug.ps1 -Serial SERIAL_DO_TELEFONE
```

Comando equivalente:

```powershell
adb -s SERIAL_DO_TELEFONE install -r "C:\Users\gabri\OneDrive\Área de Trabalho\Android\evolucao-android\app\build\outputs\apk\debug\app-debug.apk"
```

`-r` atualiza sem limpar dados. Não use `pm clear` nem desinstale se quiser preservar o histórico/localStorage.

## 10. Abrir o app

Os scripts abrem automaticamente. Manualmente:

```powershell
adb -s SERIAL_DO_RELOGIO shell am start -n com.evolucao.treino/com.evolucao.treino.wear.MainActivity
adb -s SERIAL_DO_TELEFONE shell am start -n com.evolucao.treino/com.evolucao.treino.MainActivity
```

No launcher do relógio, procure **Evolução**.

## 11. Validar sincronização/Data Layer

1. Verifique que relógio e telefone continuam pareados no app Wear OS/Mobvoi.
2. Abra Evolução no telefone e selecione a ficha A, B ou C.
3. Abra Evolução no relógio; toque **Tentar sincronizar** se necessário.
4. Confira nome, data lógica, exercícios e quantidade de séries.
5. Inicie e conclua uma série de teste.
6. O relógio deve iniciar descanso e mostrar `Pendente` ou `Será enviado ao conectar`.
7. Reconecte. O status deve virar **Sincronizado**.
8. No telefone, confira carga, reps, RIR/parciais no treino em andamento.
9. Finalize pelo resumo do relógio e confirme exatamente uma sessão no histórico.

Diagnóstico automatizado, sem apagar nada:

```powershell
.\diagnose-wear-sync.ps1 -PhoneSerial SERIAL_DO_TELEFONE -WearSerial SERIAL_DO_RELOGIO
```

## 12. Consultar logs

Telefone:

```powershell
adb -s SERIAL_DO_TELEFONE logcat -d -t 500 EvolucaoWearMobile:D EvolucaoWearListener:D *:S
```

Relógio:

```powershell
adb -s SERIAL_DO_RELOGIO logcat -d -t 500 EvolucaoWearData:D EvolucaoWearRepo:D *:S
```

Os logs não exibem o payload completo do treino.

## 13. Reconectar depois

A porta pode mudar quando a depuração sem fio é desligada/reiniciada:

```powershell
adb disconnect IP_ANTIGO:PORTA_ANTIGA
adb connect IP_ATUAL:PORTA_ATUAL
adb devices -l
```

Se o pareamento expirou/removido, repita `adb pair` com o novo código e depois `adb connect` com a porta de depuração.

## 14. Desativar depuração ao terminar

No relógio e telefone:

1. Abra Opções do desenvolvedor.
2. Desligue **Wireless debugging/Depuração sem fio**.
3. Desligue **ADB debugging/Depuração USB** se não precisar mais.
4. Opcionalmente remova computadores pareados em **Revoke wireless debugging authorizations**.

No PC:

```powershell
adb disconnect
```

## 15. Se não conectar

- **IP/porta errados:** a porta de pareamento não é a porta de conexão; releia a tela principal após parear.
- **Código expirou:** abra “Parear novo dispositivo” outra vez e gere novo código.
- **Redes diferentes/isolamento de clientes:** PC e relógio devem se alcançar; redes de convidados costumam bloquear.
- **`unauthorized`:** desbloqueie a tela e aceite a chave RSA; depois rode `adb devices -l`.
- **`offline`:** execute `adb disconnect IP:PORTA`, desligue/ligue depuração e conecte de novo.
- **Múltiplos dispositivos:** sempre use `-s SERIAL` ou os scripts com `-Serial`.
- **APK não aparece:** confirme `adb -s SERIAL shell pm path com.evolucao.treino` e que o serial é do relógio.
- **Package/assinatura incompatível:** ambos precisam ser `com.evolucao.treino` e assinados pela mesma chave. Se houver versão de outra chave, faça backup antes; desinstalar apaga dados.
- **Play Services/Data Layer:** atualize Google Play Services e confirme o pareamento no Wear OS/Mobvoi. ADB conectado não substitui o pareamento de companion.
- **Treino não aparece:** abra o mobile atualizado, selecione A/B/C e toque sincronizar no relógio; rode o diagnóstico.
- **API abaixo de 26:** o script recusa a instalação; registre o resultado de `ro.build.version.sdk` antes de considerar outra build.

Veja também [TROUBLESHOOTING_WEAR.md](TROUBLESHOOTING_WEAR.md).
