# Changelog e notas de migração Wear

## 1.1-wear / Wear 1.0

- Estrutura Gradle `:app`, `:protocol`, `:wear`, mantendo o comando histórico `build.ps1`.
- Protocolo v1 estrito e reducer determinístico.
- Adapter JS `wear-sync.js` com export A/B/C, import idempotente e finalização exata.
- Room inbox/outbox no mobile e plano/sessão/ledger/outbox no Wear.
- DataClient durável, MessageClient como poke, CapabilityClient e WorkManager.
- UI Compose Wear completa, timer persistente, alarmes hápticos, ambient e Ongoing Activity.
- Scripts de build, instalação segura e diagnóstico.

## Migração do app existente

- `applicationId` e autoridade do provider permanecem `com.evolucao.treino`.
- Assets, `evolucao_treino_state`, sessões antigas, draft, progressão, backup/restore, corrida e balança continuam no mesmo app.
- `wearSync` é aditivo no estado JS e é incluído no backup. Estados antigos recebem defaults durante `migrate()`.
- IDs canônicos `ex_...` válidos são preservados mesmo após rename; somente IDs legados inválidos são recalculados.
- O mirror do `WorkoutProvider` continua somente leitura e fora do canal Wear.
- Bancos Room Wear são novos, schema v1; não existe banco Wear antigo a migrar.
- Mobile `versionCode` Gradle passa a 2. O APK Wear tem versionCode 1.

## Assinatura

Debug mobile e Wear usam `_toolchain/debug.keystore`, alias `ak`, para serem companions compatíveis. Uma futura release deve mover a senha para configuração segura e assinar ambos com a mesma chave de produção. Não misture APK debug com uma instalação de assinatura diferente sem backup.

## Compatibilidade do build anterior

`build.ps1` agora delega ao módulo mobile Gradle, executa os testes e ainda entrega `Evolucao.apk`. O corpo manual anterior permanece no arquivo para rastreabilidade, mas não é executado quando `settings.gradle.kts` e `build-wear.ps1` existem. Use `build-wear.ps1` para gerar explicitamente o par integrado mobile + Wear.

## Limitação de validação desta entrega

O build e os testes foram executados localmente; não havia TicWatch/AVD Wear conectado durante a implementação. O script de instalação registra `ro.product.model`, `ro.build.version.sdk` e `ro.build.version.release` quando o dispositivo real estiver disponível. A sincronização física só pode ser declarada validada depois desse passo.
