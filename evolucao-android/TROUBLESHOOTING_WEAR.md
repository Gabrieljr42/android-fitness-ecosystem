# Solução de problemas Wear

## Diagnóstico rápido

```powershell
.\diagnose-wear-sync.ps1 -PhoneSerial SERIAL_TELEFONE -WearSerial SERIAL_RELOGIO
```

O script confirma modelo/API/característica, package instalado, estado dos serviços Google Play e logs allowlisted. Ele não limpa banco, localStorage nem fila.

## Relógio mostra “Nenhum treino recebido”

1. Instale também o novo APK mobile; o Wear sozinho não possui bridge/listener.
2. Abra o Evolução no telefone e selecione/inicie A, B ou C.
3. Confirme pareamento normal no app Wear OS/Mobvoi — ADB não é o Data Layer.
4. No relógio, toque **Tentar sincronizar**.
5. Confirme package nos dois: `adb -s SERIAL shell pm path com.evolucao.treino`.
6. Verifique assinatura comum; APKs produzidos pelo mesmo build já usam a mesma chave.

## Fica offline mesmo com Wi‑Fi

O Data Layer usa o companion/Google Play Services e pode funcionar por Bluetooth ou Wi‑Fi. “Wi‑Fi conectado” sozinho não garante um node alcançável. Abra o app companion no telefone, verifique Bluetooth, modo avião/economia extrema e Play Services. Eventos continuam salvos e o WorkManager tenta novamente sem polling agressivo.

## Série aparece duas vezes

Não repita manualmente finalização no telefone antes de investigar. Capture logs e backup. O contrato usa `eventId`, hash e `syncSetId`; retries idênticos retornam `ALREADY_APPLIED`. Uma duplicação real indica ID diferente ou dados anteriores à migração e deve ser preservada para análise, não apagada automaticamente.

## Série fica “Pendente”

- `RECEIVED`: telefone comitou inbox, mas o WebView ainda precisa aplicar/persistir.
- `BLOCKED`: chegou edit/undo/finish antes da dependência; a base deve reconciliar depois.
- Telefone fechado por muito tempo: abra o Evolução para drenar a inbox JS.
- Fila perto do limite: conecte antes de continuar; o relógio bloqueia novas séries em vez de descartar.

## Plano mudou no meio do treino

Uma revisão da mesma sessão atualiza somente a parte não executada. Heads concluídos no Wear permanecem. Um `sessionId` novo aguarda o treino/resumo atual fechar; isso evita trocar a ficha silenciosamente.

## Timer não vibra

1. Ative **Hápticos ligados** na tela de hoje.
2. Verifique permissão de notificações e vibração do sistema.
3. Economia extrema pode tornar alarmes inexatos; o deadline persistido corrige o valor ao acordar.
4. Execute `adb shell dumpsys alarm` e procure `com.evolucao.treino.wear.REST_MARKER`.

## Timer zerou após reiniciar

O app usa `bootCount`: após reboot restaura pelo deadline de parede. Se o prazo já venceu, avançar é correto. Mudança manual drástica do relógio durante um descanso pode afetar somente a recuperação pós-reboot; no mesmo boot vale o relógio monotônico.

## App não aparece no launcher

```powershell
adb -s SERIAL_RELOGIO shell pm path com.evolucao.treino
adb -s SERIAL_RELOGIO shell am start -n com.evolucao.treino/com.evolucao.treino.wear.MainActivity
```

Se o segundo comando disser “Activity class does not exist”, provavelmente o APK mobile foi instalado no relógio. Reinstale com `install-wear-debug.ps1`, que detecta o tipo do dispositivo.

## `INSTALL_FAILED_UPDATE_INCOMPATIBLE`

A versão instalada usa outra assinatura. Faça backup do Evolução no telefone antes de qualquer remoção. Para manter dados, assine ambos os APKs com a chave original. Desinstalar resolve tecnicamente, mas apaga dados locais e não deve ser a primeira ação.

## `unauthorized`, `offline` ou duas portas

Veja as seções 4, 13 e 15 de [INSTALL_TICWATCH_E3.md](INSTALL_TICWATCH_E3.md). Pareamento usa uma porta; conexão usa outra. Sempre passe `-s SERIAL` quando há dois devices.

## Coletar evidência sem expor o treino

Use os tags `EvolucaoWearMobile`, `EvolucaoWearListener`, `EvolucaoWearData` e `EvolucaoWearRepo`. Eles não imprimem payload. Não publique backup, banco Room ou `localStorage` em issue pública.
