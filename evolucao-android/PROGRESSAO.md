# Progressao autorregulada

O motor em `app/src/main/assets/core/progressao.js` calcula uma meta por
exercicio e continua aceitando backups do formato anterior.

## Dois modos compativeis

- Registros antigos sem RIR usam a dupla progressao legada.
- Registros novos com RIR usam capacidade estimada: `reps realizadas + RIR`.
- A capacidade tambem e normalizada pela carga usando uma estimativa de e1RM.
- O historico recente recebe mais peso, mas varias sessoes sao usadas para
  reduzir oscilacoes de uma unica sessao ruim ou excepcional.

No modo RIR, o motor compara a capacidade observada com o centro da faixa mais
o RIR-alvo. Assim, `8 @ 3`, `9 @ 2`, `10 @ 1` e `11 @ 0` podem representar o
mesmo nivel de capacidade quando a prescricao e `7-9 @ 2 RIR`.

## Escolha da proxima meta

O motor gera candidatos de carga e repeticoes respeitando:

- incremento real do equipamento;
- faixa minima e maxima;
- expansao opcional da faixa para saltos grandes;
- preferencia opcional por manter a mesma carga;
- carga por lado em halteres e movimentos unilaterais.

Cada recomendacao retorna `carga`, `repsMeta`, `status` e `motivo`, alem de
`targetRir`, `modelo`, `capacidadeReps`, `confianca` e os candidatos avaliados.

## Esforco e reducao

RIR realizado e alvo ficam salvos junto da serie. Treinos curtos continuam
servindo como evidencia; series ausentes nao contam como falha. O caminho
legado mantem a regra de duas sessoes completas abaixo do minimo para deload.
No caminho RIR, uma queda consistente de capacidade pode sugerir um candidato
de carga menor, sempre arredondado ao incremento disponivel.

## Testes

```text
node app/src/test/js/progressao.test.js
```
