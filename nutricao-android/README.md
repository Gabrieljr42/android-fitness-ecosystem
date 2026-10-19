# 🥗 NutriTrack — Nutrição com IA

Aplicativo Android (baseado em WebView de alto desempenho) para controle nutricional, contagem de calorias e cálculo de macronutrientes, equipado com **análise visual de refeições por Inteligência Artificial (Google Gemini API)**, cálculo de TDEE e plano semanal de refeições.

---

## 📱 Visão Geral e Recursos

- **Interface e navegação:** resumo do dia, macros e refeições em destaque; botão de registro sempre acessível; abas Hoje, Histórico, Alimentos e Metas, com Ajustes no cabeçalho.
- **Aparência:** temas escuro, claro e automático em Ajustes. A preferência é salva em `nt_theme`, separadamente dos registros nutricionais.
- **Revisão e histórico:** foto, texto/voz, catálogo, entrada manual e resumo do dia reunidos no menu de registro; revisão antes de confirmar; média semanal calculada sobre os dias com refeições, incluindo hoje. Dias sem registro aparecem como “—”.

- **Análise de Fotos de Refeições com IA (Google Gemini):**
  - Identificação visual dos alimentos e estimativa de porções em gramas.
  - Estimativa discriminada de calorias, proteínas, carboidratos e gorduras.
  - **Modo Preciso:** Executa 3 requisições e calcula a média ponderada com descarte automático de outliers estatísticos.
  - **Modo Rápido:** Execução única para economia de tempo e cota.
  - Suporte a execução paralela ou sequencial com sistema de retry automático e chaveamento inteligente de modelos (`gemini-3.7-flash` $\rightarrow$ `gemini-3.6-flash` $\rightarrow$ `gemini-3.5-flash`).
  - Campo opcional para inclusão de legenda/descrição pelo usuário para auxiliar na identificação.
  - Captura direta via câmera nativa do dispositivo ou seleção na galeria.
- **Diário e Métricas:**
  - Acompanhamento visual dos macros diários em barras de progresso percentuais.
  - Histórico dos últimos 7 dias com gráfico de barras comparativo em relação à meta diária.
  - Cálculo de média semanal de calorias e macros.
- **Catálogo de Alimentos & Plano Semanal:**
  - Banco de alimentos de referência com itens típicos da alimentação brasileira (valores por 100g).
  - Cadastro rápido de alimentos e refeições personalizadas com persistência local.
  - Plano semanal com refeições pré-estruturadas (pré-treino, pós-treino, almoço, lanche, jantar) com carregamento em 1 toque.
- **Metas Nutricionais Inteligentes:**
  - Modo Personalizado (inserção direta de metas de calorias e macros).
  - Modo Sugerido via **TDEE / Mifflin-St Jeor**: cálculo automático da taxa metabólica basal e gasto energético com base em peso, altura, idade, sexo biológico e nível de atividade física.
- **Backup & Segurança:**
  - Exportação e importação de backups completos em formato `.json`.
  - Salvamento nativo na pasta `Downloads/` do dispositivo via `AndroidBridge`.
  - Chave de API do Gemini armazenada exclusivamente no armazenamento local do aparelho (`localStorage`).

---

## 🏗️ Estrutura do Projeto

```text
nutricao-android/
├── build.ps1                              # Script autônomo de compilação do APK
├── LEIAME.txt                             # Instruções de configuração e uso
├── _toolchain/                            # JDK 17 + Android SDK (reutiliza do evolucao se presente)
└── app/
    └── src/
        └── main/
            ├── AndroidManifest.xml        # Permissões (INTERNET, CAMERA, RECORD_AUDIO, notificações, alarmes exatos + boot, READ_WORKOUTS)
            ├── res/                       # Ícones e recursos do Android
            ├── java/com/nutricao/app/
            │   └── MainActivity.java      # WebView wrapper, captura via MediaStore e Bridge JS
            └── assets/
                ├── core/
                │   └── gemini.js          # Fluxo de chamada à API Gemini, schema e merging
                └── apps/nutricao/
                    ├── index.html         # Shell principal da interface
                    ├── theme.css          # Estilos globais e componentes do design
                    ├── design.css         # Tema verde, layout responsivo e componentes atualizados
                    ├── appearance.js      # Preferência de tema e acompanhamento do sistema
                    ├── estado.js          # Chaves de LocalStorage, estados e helpers
                    ├── referencia.js      # Banco de alimentos de referência (macros/100g)
                    ├── logic.js           # Cálculos diários, formatação e toasts
                    ├── nav.js             # Controle de navegação por abas e modais
                    └── views/
                        ├── hoje.js        # Visão diária, progresso e lista de refeições
                        ├── diario.js      # Gráfico de 7 dias e histórico semanal
                        ├── alimentos.js   # Catálogo, cadastro de itens e plano semanal
                        ├── metas.js       # Configuração de metas e calculadora TDEE
                        └── ajustes.js     # Configuração de API Key, precisão e backup
```

---

## 🔑 Configuração da Chave da IA (Google Gemini)

1. Obtenha uma chave gratuita em [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Abra o aplicativo no celular.
3. Acesse a aba **Ajustes**, cole a chave no campo **API do Gemini** e clique em **Salvar chave**.
4. *Nota:* O aplicativo continua funcionando 100% no modo manual mesmo sem uma chave configurada.

---

## 🚀 Como Compilar o APK

O projeto utiliza um pipeline autônomo em PowerShell sem dependências externas instaladas no sistema.

### Passos de Compilação
1. Abra o PowerShell na pasta `nutricao-android`:
   ```powershell
   powershell -ExecutionPolicy Bypass -File build.ps1
   ```
2. O script detectará e reutilizará o JDK e o SDK já baixados no projeto vizinho (`evolucao-android/_toolchain`) para evitar downloads duplicados.
3. Ao finalizar, o arquivo `NutriTrack.apk` será gerado na raiz da pasta.

---

## 🔒 Dados e Privacidade
Nenhum dado pessoal ou alimentar é enviado para servidores externos. As únicas conexões de rede realizadas pelo app são as chamadas diretas para a API do Google Gemini com a chave fornecida pelo próprio usuário.
