# Integração segura com Strava

## Decisão da versão 0.2.0

O Coach ainda não contém credenciais nem OAuth do Strava. A API oficial permite listar atividades do atleta, mas a troca do código de autorização e toda renovação exigem `client_id` **e `client_secret`.** Um APK é um cliente público e pode ser desmontado; portanto, gravar o segredo no código, assets ou `BuildConfig` não é aceitável.

Enquanto o backend não existir, a dimensão Corrida usa sessões explicitamente registradas no Evolução. Passos do Health Connect nunca são convertidos em corrida.

## Fluxo proposto

```text
Coach ──abre navegador/Strava──> /oauth/mobile/authorize
  ▲                                  │ código + state
  │                                  ▼
  └── sessão autenticada ── Backend OAuth privado
                               │ guarda client_secret/tokens cifrados
                               ▼
                    GET /athlete/activities (activity:read)
                               │ resumo sanitizado
                               ▼
                         Coach / SQLite
```

Regras:

- usar navegador/app Strava, nunca WebView, para autorização;
- `state` aleatório, de uso único e com expiração;
- pedir apenas `activity:read`, elevando para `activity:read_all` somente se atividades “Somente você” forem realmente necessárias;
- manter segredo, access token e refresh token fora de assets/logs; rotacionar sempre para o refresh token mais novo;
- importar somente tipos de corrida, deduplicados pelo ID da atividade;
- armazenar apenas data, distância, tempos, ganho de elevação e FC agregada quando disponível — sem mapa/rota por padrão;
- oferecer desconectar/revogar e apagar os dados importados;
- respeitar rate limits e atribuição exigida pela plataforma.

## Etapas para ativar

1. Registrar um aplicativo em `https://www.strava.com/settings/api` e escolher o callback domain.
2. Implantar um endpoint HTTPS mínimo de OAuth (Cloudflare Worker, serviço próprio ou equivalente) com o segredo em secret storage.
3. Configurar no Coach somente a URL pública do backend e o `client_id`, que não é secreto.
4. Implementar deep link verificado, conexão/desconexão e sincronização incremental.
5. Testar consentimento negado, escopo parcial, código repetido, token expirado, revogação, rate limit e atividade privada.

Documentação oficial usada no desenho:

- `https://developers.strava.com/docs/authentication/`
- `https://developers.strava.com/docs/reference/#api-Activities-getLoggedInAthleteActivities`
- `https://developers.strava.com/guidelines/`
- `https://developers.strava.com/docs/changelog/`
