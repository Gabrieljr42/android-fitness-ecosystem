# 🏋️ Evolução — Treino

Aplicativo Android nativo (baseado em WebView de alto desempenho) para controle e progressão inteligente de treinos de musculação, com motor de **progressão autorregulada (RIR)**, cronômetro de descanso com **notificações e vibração nativas**, suporte offline e design moderno.

---

## 📱 Visão Geral e Recursos

- **Auto-Regulação & Progressão (RIR / Reps in Reserve):**
  - Motor de progressão determinístico (`app/src/main/assets/core/progressao.js`).
  - Suporte a **RIR (Repetições na Reserva)** para estimativa de capacidade real por série.
  - Cálculo contínuo de **e1RM** (\(\text{carga} \times (1 + \text{reps até falha} / 30)\)).
  - Ajuste respeitando incrementos reais do equipamento (halteres, polia, máquina, barra, peso corporal).
  - Detecção de platôs (estagnação por $N$ sessões) e sugestão de deload automático.
  - Suporte legado à dupla progressão clássica e compatibilidade total com treinos curtos (séries ausentes não penalizam a meta).
- **Interface de Treino em Tempo Real:**
  - Carrossel de exercícios com status visual de conclusão.
  - Tabela dinâmica de séries com identificação de aquecimento (*warmup*) e séries de trabalho.
  - Teclado numérico customizado integrado na tela com seletor de RIR.
  - Tela de conclusão de treino com métricas de volume e visualização anatômica dos grupamentos musculares trabalhados.
- **Timer de Descanso Nativo:**
  - Início automático ao concluir uma série.
  - Notificação contínua (*ongoing ticker*) em segundo plano mostrando a contagem regressiva.
  - Alerta sonoro e vibração nativa disparados via Java Bridge (`AndroidBridge`) ao zerar o tempo.
- **Dashboard & Histórico:**
  - Anéis de meta semanal e volume total levantado.
  - Gráficos vetoriais (SVG) de carga máxima, 1RM estimado e volume por exercício.
  - Registro e acompanhamento de peso corporal.
- **Backup & Segurança:**
  - Salvamento nativo do arquivo `.json` diretamente na pasta `Downloads/` via MediaStore (API 29+).
  - Algoritmo de restauração com **merge inteligente** (combina dados sem nunca sobrescrever ou perder treinos antigos).

---

## 🏗️ Estrutura do Projeto

```text
evolucao-android/
├── build.ps1                              # Script autônomo de compilação do APK
├── LEIAME.txt                             # Instruções rápidas de uso
├── PROGRESSAO.md                          # Documentação detalhada do motor de progressão
├── _toolchain/                            # JDK 17 + Android SDK (baixados automaticamente)
└── app/
    └── src/
        ├── test/js/progressao.test.js     # Suíte de testes unitários do motor
        └── main/
            ├── AndroidManifest.xml        # Permissões (VIBRATE, POST_NOTIFICATIONS)
            ├── res/                       # Ícones e recursos do Android
            ├── java/com/evolucao/treino/
            │   └── MainActivity.java      # Wrapper WebView, canais de notificação e Bridge JS
            └── assets/
                ├── index.html             # Shell principal da aplicação
                ├── manifest.webmanifest   # Metadados PWA
                ├── core/
                │   └── progressao.js      # Motor de progressão matemática e autorregulação
                ├── kernel/
                │   ├── app.js             # Shell de navegação e ciclo de vida
                │   ├── db.js              # Schema, migrações, persistência e merge de backup
                │   ├── fmt.js             # Formatadores de data, tempo e peso
                │   ├── icons.js           # Ícones SVG e renderizador anatômico
                │   ├── charts.js          # Gráficos SVG leves
                │   ├── ui.js              # Modais, diálogos e toasts
                │   └── notif.js           # Gerenciamento de permissões de notificação
                └── apps/evolucao/
                    ├── dados.js           # Mapeamento de descansos e metas padrão
                    ├── logic.js           # Lógica de sessões, draft e histórico
                    ├── exercicios/
                    │   ├── nomes.js       # Normalização de nomes, aliases e IDs canônicos
                    │   └── fotos.js       # Ilustrações base64 dos exercícios
                    └── views/
                        ├── treino.js      # Interface de treino, teclado e resumo
                        ├── progresso.js   # Dashboard de gráficos e peso
                        ├── historico.js   # Lista detalhada de treinos anteriores
                        └── ficha.js       # Editor da rotina A/B/C e configurações
```

---

## 🚀 Como Compilar o APK

O projeto possui um pipeline autônomo em PowerShell que não requer a instalação prévia do Android Studio ou do JDK no sistema operacional.

### Requisitos
- Windows 10/11 com PowerShell.
- Conexão com a internet na primeira execução (baixa ~1 GB do JDK 17 e Android SDK em `_toolchain/`).

### Passos de Compilação
1. Abra o PowerShell na pasta `evolucao-android`:
   ```powershell
   powershell -ExecutionPolicy Bypass -File build.ps1
   ```
2. O script executará automaticamente:
   - Configuração do JDK 17 e Android SDK em cache local (`_toolchain`).
   - Compilação dos recursos via `aapt2`.
   - Aplicação do patch binário para correção de caminhos de assets no Windows (`\` $\rightarrow$ `/`).
   - Compilação do `MainActivity.java` via `javac`.
   - Geração do bytecode `classes.dex` via `d8`.
   - Empacotamento, `zipalign` e assinatura do APK com keystore persistente.
3. Ao término, o arquivo `Evolucao.apk` estará gerado na raiz da pasta.

---

## 🧪 Testes Unitários

Para validar a lógica do motor de progressão e autorregulação:

```bash
node app/src/test/js/progressao.test.js
```
Saída esperada: `progressao.test.js: OK`

---

## 🔒 Dados e Privacidade
Todos os dados ficam armazenados localmente no dispositivo (`localStorage`). Recomenda-se realizar backups periódicos pela aba **Ficha > Fazer backup**.
