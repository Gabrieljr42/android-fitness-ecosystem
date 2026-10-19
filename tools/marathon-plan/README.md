# tools/marathon-plan — gerador do plano Maratona BH 2027 (one-shot, histórico)

O plano autoritativo em
`evolucao-android/app/src/main/assets/apps/evolucao/maratonaplano.js`
foi gerado a partir de `Plano_Maratona_BH_2027.xlsx` via:

1. `extract_plan.js` — extração descartável do xlsx para `maratona_plan_raw.json`
   (aponta para um diretório temporário local; uso histórico, não reexecutar).
2. `gen_maratona.js` — gera o `maratonaplano.js` a partir de
   `maratona_plan_raw.json`. Reexecutável: `node tools/marathon-plan/gen_maratona.js`
   (exige exatamente 38 semanas no JSON, senão aborta).

Não editar o `maratonaplano.js` à mão; regenere com o script.
Mantido aqui como proveniência do plano, fora do código dos apps.
