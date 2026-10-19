/* apps/evolucao/maratonaplano.js — PLANO AUTORITATIVO da Maratona BH 2027.
   GERADO a partir de Plano_Maratona_BH_2027.xlsx (não editar à mão; regenere
   com tools/marathon-plan/gen_maratona.js). Datas em ISO local (segunda→domingo). */

var MARATONA_META = {
 "name": "PROJETO 42K — MARATONA BH 2027",
 "raceDate": "2027-05-16",
 "startDate": "2026-08-24",
 "totalWeeks": 38,
 "objective": "Completar 42,195 km saudável e controlado",
 "totalKm": 943.2,
 "peakWeekKm": 52,
 "longestLongRunKm": 30,
 "howToRead": "RPE 2–3 = fácil, conversa em frases completas. RPE 4–5 = moderado e controlado. Nos primeiros meses, caminhar faz parte do treino. Não recupere km perdidos. Semanas leves são obrigatórias. Dor que altera a passada, piora progressivamente ou persiste = reduza/pare e avalie.",
 "checkpoints": [
  {
   "week": 12,
   "label": "5 km fácil, sem dor relevante"
  },
  {
   "week": 20,
   "label": "10 km fácil e controlado"
  },
  {
   "week": 27,
   "label": "21,1 km fácil / simulado"
  },
  {
   "week": 35,
   "label": "30 km — ensaio geral"
  },
  {
   "week": 38,
   "label": "MARATONA 42,195 km"
  }
 ],
 "rules": [
  {
   "tema": "Ritmo fácil",
   "regra": "RPE 2–3; deve dar para conversar em frases completas."
  },
  {
   "tema": "Corrida/caminhada",
   "regra": "Pode ser usada em qualquer fase. Caminhar cedo é melhor do que quebrar tarde."
  },
  {
   "tema": "Progressão",
   "regra": "Evite aumentar volume e intensidade agressivamente na mesma semana."
  },
  {
   "tema": "Semanas leves",
   "regra": "São parte do plano. Não 'pague' os km que deixou de fazer."
  },
  {
   "tema": "Longão",
   "regra": "É treino de tempo em pé, não teste de velocidade."
  },
  {
   "tema": "Carboidrato",
   "regra": "A partir de ~75–90 min, pratique ingestão durante o treino; teste tudo antes da prova."
  },
  {
   "tema": "Hidratação",
   "regra": "Treine a estratégia em longões; ajuste por clima e suor."
  },
  {
   "tema": "Musculação",
   "regra": "Mantenha, mas reduza o volume de pernas à medida que o longão cresce."
  },
  {
   "tema": "Perna pesada",
   "regra": "Evite treino pesado de pernas nas 24–48 h antes do longão."
  },
  {
   "tema": "Dor",
   "regra": "Dor que muda a passada, aumenta durante a corrida ou persiste: reduza/pare e avalie."
  },
  {
   "tema": "Fadiga",
   "regra": "Queda de desempenho por vários treinos, sono ruim e pernas sempre pesadas = reduza carga."
  },
  {
   "tema": "Bulk",
   "regra": "Não tente 'comer de volta' cada caloria do relógio; acompanhe a tendência semanal do peso."
  },
  {
   "tema": "Checkpoint",
   "regra": "Se 5K/10K/21K não estiverem confortáveis nas semanas-alvo, repita base."
  },
  {
   "tema": "Objetivo real",
   "regra": "Chegar saudável à linha de largada vale mais do que cumprir 100% da planilha."
  }
 ]
};

var MARATONA_PLAN = [
 {
  "week": 1,
  "start": "2026-08-24",
  "end": "2026-08-30",
  "phase": "Adaptação corrida/caminhada",
  "targetKm": 5,
  "longRunKm": 2.5,
  "runsPerWeek": 2,
  "sessions": {
   "ter": "20 min — 2' correr / 1' andar",
   "qui": "",
   "sab": "25 min — 2' correr / 1' andar",
   "dom": "Descanso"
  },
  "focus": "Adapte músculos, tendões e articulações. Ritmo conversável.",
  "strength": "3x/sem; pernas 1–2x, sem falha"
 },
 {
  "week": 2,
  "start": "2026-08-31",
  "end": "2026-09-06",
  "phase": "Adaptação corrida/caminhada",
  "targetKm": 6,
  "longRunKm": 3,
  "runsPerWeek": 2,
  "sessions": {
   "ter": "24 min — 2' correr / 1' andar",
   "qui": "",
   "sab": "28 min — 2' correr / 1' andar",
   "dom": "Descanso"
  },
  "focus": "Adapte músculos, tendões e articulações. Ritmo conversável.",
  "strength": "3x/sem; pernas 1–2x, sem falha"
 },
 {
  "week": 3,
  "start": "2026-09-07",
  "end": "2026-09-13",
  "phase": "Adaptação corrida/caminhada",
  "targetKm": 7,
  "longRunKm": 3.5,
  "runsPerWeek": 2,
  "sessions": {
   "ter": "28 min — 3' correr / 1' andar",
   "qui": "",
   "sab": "32 min — 3' correr / 1' andar",
   "dom": "Descanso"
  },
  "focus": "Adapte músculos, tendões e articulações. Ritmo conversável.",
  "strength": "3x/sem; pernas 1–2x, sem falha"
 },
 {
  "week": 4,
  "start": "2026-09-14",
  "end": "2026-09-20",
  "phase": "Adaptação corrida/caminhada",
  "targetKm": 5,
  "longRunKm": 2.5,
  "runsPerWeek": 2,
  "sessions": {
   "ter": "20–22 min — 2' correr / 1' andar",
   "qui": "",
   "sab": "25 min bem fácil",
   "dom": "Descanso"
  },
  "focus": "Semana leve: termine com sensação de sobra.",
  "strength": "3x/sem; pernas 1–2x, sem falha"
 },
 {
  "week": 5,
  "start": "2026-09-21",
  "end": "2026-09-27",
  "phase": "Base I",
  "targetKm": 8,
  "longRunKm": 4,
  "runsPerWeek": 3,
  "sessions": {
   "ter": "1.9 km fácil — RPE 2–3",
   "qui": "2.1 km fácil",
   "sab": "Descanso / caminhada leve",
   "dom": "4 km longão fácil — corrida/caminhada permitida"
  },
  "focus": "Construir consistência; corrida/caminhada continua válida.",
  "strength": "3x/sem; pernas 1–2x, sem falha"
 },
 {
  "week": 6,
  "start": "2026-09-28",
  "end": "2026-10-04",
  "phase": "Base I",
  "targetKm": 10,
  "longRunKm": 5,
  "runsPerWeek": 3,
  "sessions": {
   "ter": "2.4 km fácil — RPE 2–3",
   "qui": "2.6 km fácil",
   "sab": "Descanso / caminhada leve",
   "dom": "5 km longão fácil — corrida/caminhada permitida"
  },
  "focus": "Construir consistência; corrida/caminhada continua válida.",
  "strength": "3x/sem; pernas 1–2x, sem falha"
 },
 {
  "week": 7,
  "start": "2026-10-05",
  "end": "2026-10-11",
  "phase": "Base I",
  "targetKm": 12,
  "longRunKm": 6,
  "runsPerWeek": 3,
  "sessions": {
   "ter": "2.9 km fácil — RPE 2–3",
   "qui": "3.1 km fácil",
   "sab": "Descanso / caminhada leve",
   "dom": "6 km longão fácil — corrida/caminhada permitida"
  },
  "focus": "Construir consistência; corrida/caminhada continua válida.",
  "strength": "3x/sem; pernas 1–2x, sem falha"
 },
 {
  "week": 8,
  "start": "2026-10-12",
  "end": "2026-10-18",
  "phase": "Base I",
  "targetKm": 9,
  "longRunKm": 4,
  "runsPerWeek": 3,
  "sessions": {
   "ter": "2.4 km fácil — RPE 2–3",
   "qui": "2.6 km fácil",
   "sab": "Descanso / caminhada leve",
   "dom": "4 km longão fácil — corrida/caminhada permitida"
  },
  "focus": "Semana leve: consolide a rotina.",
  "strength": "3x/sem; pernas 1–2x, sem falha"
 },
 {
  "week": 9,
  "start": "2026-10-19",
  "end": "2026-10-25",
  "phase": "Base I",
  "targetKm": 13,
  "longRunKm": 7,
  "runsPerWeek": 3,
  "sessions": {
   "ter": "2.9 km fácil — RPE 2–3",
   "qui": "3.1 km fácil",
   "sab": "Descanso / caminhada leve",
   "dom": "7 km longão fácil — corrida/caminhada permitida"
  },
  "focus": "Construir consistência; corrida/caminhada continua válida.",
  "strength": "3x/sem; pernas 1–2x, sem falha"
 },
 {
  "week": 10,
  "start": "2026-10-26",
  "end": "2026-11-01",
  "phase": "Base I",
  "targetKm": 15,
  "longRunKm": 8,
  "runsPerWeek": 3,
  "sessions": {
   "ter": "3.4 km fácil — RPE 2–3",
   "qui": "3.6 km fácil",
   "sab": "Descanso / caminhada leve",
   "dom": "8 km longão fácil — corrida/caminhada permitida"
  },
  "focus": "Construir consistência; corrida/caminhada continua válida.",
  "strength": "3x/sem; pernas 1–2x, sem falha"
 },
 {
  "week": 11,
  "start": "2026-11-02",
  "end": "2026-11-08",
  "phase": "Base I",
  "targetKm": 17,
  "longRunKm": 9,
  "runsPerWeek": 3,
  "sessions": {
   "ter": "3.8 km fácil — RPE 2–3",
   "qui": "4.2 km fácil",
   "sab": "Descanso / caminhada leve",
   "dom": "9 km longão fácil — corrida/caminhada permitida"
  },
  "focus": "Construir consistência; corrida/caminhada continua válida.",
  "strength": "3x/sem; pernas 1–2x, sem falha"
 },
 {
  "week": 12,
  "start": "2026-11-09",
  "end": "2026-11-15",
  "phase": "Base I",
  "targetKm": 12,
  "longRunKm": 6,
  "runsPerWeek": 3,
  "sessions": {
   "ter": "2.9 km fácil — RPE 2–3",
   "qui": "3.1 km fácil",
   "sab": "Descanso / caminhada leve",
   "dom": "6 km longão fácil — corrida/caminhada permitida"
  },
  "focus": "CHECKPOINT: 5 km fácil e sem dor relevante. Se não, repita 3–4 semanas de base.",
  "strength": "3x/sem; pernas 1–2x, sem falha"
 },
 {
  "week": 13,
  "start": "2026-11-16",
  "end": "2026-11-22",
  "phase": "Base II",
  "targetKm": 18,
  "longRunKm": 10,
  "runsPerWeek": 3,
  "sessions": {
   "ter": "3.8 km fácil — RPE 2–3",
   "qui": "4.2 km fácil + 4×20s strides",
   "sab": "Descanso / caminhada leve",
   "dom": "10 km longão fácil — corrida/caminhada permitida"
  },
  "focus": "Aumentar resistência sem perseguir velocidade.",
  "strength": "2–3x/sem; pernas 1x principal + 1x leve"
 },
 {
  "week": 14,
  "start": "2026-11-23",
  "end": "2026-11-29",
  "phase": "Base II",
  "targetKm": 20,
  "longRunKm": 11,
  "runsPerWeek": 3,
  "sessions": {
   "ter": "4.3 km fácil — RPE 2–3",
   "qui": "4.7 km fácil + 4×20s strides",
   "sab": "Descanso / caminhada leve",
   "dom": "11 km longão fácil — corrida/caminhada permitida"
  },
  "focus": "Aumentar resistência sem perseguir velocidade.",
  "strength": "2–3x/sem; pernas 1x principal + 1x leve"
 },
 {
  "week": 15,
  "start": "2026-11-30",
  "end": "2026-12-06",
  "phase": "Base II",
  "targetKm": 22,
  "longRunKm": 12,
  "runsPerWeek": 3,
  "sessions": {
   "ter": "4.8 km fácil — RPE 2–3",
   "qui": "5.2 km fácil + 4×20s strides",
   "sab": "Descanso / caminhada leve",
   "dom": "12 km longão fácil — corrida/caminhada permitida"
  },
  "focus": "Aumentar resistência sem perseguir velocidade.",
  "strength": "2–3x/sem; pernas 1x principal + 1x leve"
 },
 {
  "week": 16,
  "start": "2026-12-07",
  "end": "2026-12-13",
  "phase": "Base II",
  "targetKm": 16,
  "longRunKm": 8,
  "runsPerWeek": 3,
  "sessions": {
   "ter": "3.8 km fácil — RPE 2–3",
   "qui": "4.2 km fácil + 4×20s strides",
   "sab": "Descanso / caminhada leve",
   "dom": "8 km longão fácil — corrida/caminhada permitida"
  },
  "focus": "Semana leve: recuperação de tendões e articulações.",
  "strength": "2–3x/sem; pernas 1x principal + 1x leve"
 },
 {
  "week": 17,
  "start": "2026-12-14",
  "end": "2026-12-20",
  "phase": "Base II",
  "targetKm": 23,
  "longRunKm": 13,
  "runsPerWeek": 3,
  "sessions": {
   "ter": "4.8 km fácil — RPE 2–3",
   "qui": "5.2 km fácil + 4×20s strides",
   "sab": "Descanso / caminhada leve",
   "dom": "13 km longão fácil — corrida/caminhada permitida"
  },
  "focus": "Aumentar resistência sem perseguir velocidade.",
  "strength": "2–3x/sem; pernas 1x principal + 1x leve"
 },
 {
  "week": 18,
  "start": "2026-12-21",
  "end": "2026-12-27",
  "phase": "Base II",
  "targetKm": 25,
  "longRunKm": 14,
  "runsPerWeek": 3,
  "sessions": {
   "ter": "5.3 km fácil — RPE 2–3",
   "qui": "5.7 km fácil + 4×20s strides",
   "sab": "Descanso / caminhada leve",
   "dom": "14 km longão fácil — corrida/caminhada permitida"
  },
  "focus": "Aumentar resistência sem perseguir velocidade.",
  "strength": "2–3x/sem; pernas 1x principal + 1x leve"
 },
 {
  "week": 19,
  "start": "2026-12-28",
  "end": "2027-01-03",
  "phase": "Base II",
  "targetKm": 27,
  "longRunKm": 15,
  "runsPerWeek": 3,
  "sessions": {
   "ter": "5.8 km fácil — RPE 2–3",
   "qui": "6.2 km fácil + 4×20s strides",
   "sab": "Descanso / caminhada leve",
   "dom": "15 km longão fácil — corrida/caminhada permitida"
  },
  "focus": "Aumentar resistência sem perseguir velocidade.",
  "strength": "2–3x/sem; pernas 1x principal + 1x leve"
 },
 {
  "week": 20,
  "start": "2027-01-04",
  "end": "2027-01-10",
  "phase": "Base II",
  "targetKm": 20,
  "longRunKm": 10,
  "runsPerWeek": 3,
  "sessions": {
   "ter": "4.8 km fácil — RPE 2–3",
   "qui": "5.2 km fácil + 4×20s strides",
   "sab": "Descanso / caminhada leve",
   "dom": "10 km longão fácil — corrida/caminhada permitida"
  },
  "focus": "CHECKPOINT: 10 km fácil e controlado. Só avance se recuperar bem.",
  "strength": "2–3x/sem; pernas 1x principal + 1x leve"
 },
 {
  "week": 21,
  "start": "2027-01-11",
  "end": "2027-01-17",
  "phase": "Resistência / Meia",
  "targetKm": 28,
  "longRunKm": 16,
  "runsPerWeek": 4,
  "sessions": {
   "ter": "3.8 km fácil — RPE 2–3",
   "qui": "4.8 km: fácil + 10–20 min moderado (RPE 4–5)",
   "sab": "3.4 km regenerativo — muito fácil",
   "dom": "16 km longão fácil — pratique hidratação/carbo"
  },
  "focus": "Longões maiores; blocos moderados curtos e controlados.",
  "strength": "2–3x/sem; pernas 1x principal + 1x leve"
 },
 {
  "week": 22,
  "start": "2027-01-18",
  "end": "2027-01-24",
  "phase": "Resistência / Meia",
  "targetKm": 30,
  "longRunKm": 17,
  "runsPerWeek": 4,
  "sessions": {
   "ter": "4.2 km fácil — RPE 2–3",
   "qui": "5.2 km: fácil + 10–20 min moderado (RPE 4–5)",
   "sab": "3.6 km regenerativo — muito fácil",
   "dom": "17 km longão fácil — pratique hidratação/carbo"
  },
  "focus": "Longões maiores; blocos moderados curtos e controlados.",
  "strength": "2–3x/sem; pernas 1x principal + 1x leve"
 },
 {
  "week": 23,
  "start": "2027-01-25",
  "end": "2027-01-31",
  "phase": "Resistência / Meia",
  "targetKm": 32,
  "longRunKm": 18,
  "runsPerWeek": 4,
  "sessions": {
   "ter": "4.5 km fácil — RPE 2–3",
   "qui": "5.6 km: fácil + 10–20 min moderado (RPE 4–5)",
   "sab": "3.9 km regenerativo — muito fácil",
   "dom": "18 km longão fácil — pratique hidratação/carbo"
  },
  "focus": "Longões maiores; blocos moderados curtos e controlados.",
  "strength": "2–3x/sem; pernas 1x principal + 1x leve"
 },
 {
  "week": 24,
  "start": "2027-02-01",
  "end": "2027-02-07",
  "phase": "Resistência / Meia",
  "targetKm": 24,
  "longRunKm": 12,
  "runsPerWeek": 4,
  "sessions": {
   "ter": "3.8 km fácil — RPE 2–3",
   "qui": "4.8 km: fácil + 10–20 min moderado (RPE 4–5)",
   "sab": "3.4 km regenerativo — muito fácil",
   "dom": "12 km longão fácil — pratique hidratação/carbo"
  },
  "focus": "Semana leve antes do bloco de meia.",
  "strength": "2–3x/sem; pernas 1x principal + 1x leve"
 },
 {
  "week": 25,
  "start": "2027-02-08",
  "end": "2027-02-14",
  "phase": "Resistência / Meia",
  "targetKm": 33,
  "longRunKm": 19,
  "runsPerWeek": 4,
  "sessions": {
   "ter": "4.5 km fácil — RPE 2–3",
   "qui": "5.6 km: fácil + 10–20 min moderado (RPE 4–5)",
   "sab": "3.9 km regenerativo — muito fácil",
   "dom": "19 km longão fácil — pratique hidratação/carbo"
  },
  "focus": "Longões maiores; blocos moderados curtos e controlados.",
  "strength": "2–3x/sem; pernas 1x principal + 1x leve"
 },
 {
  "week": 26,
  "start": "2027-02-15",
  "end": "2027-02-21",
  "phase": "Resistência / Meia",
  "targetKm": 35,
  "longRunKm": 20,
  "runsPerWeek": 4,
  "sessions": {
   "ter": "4.8 km fácil — RPE 2–3",
   "qui": "6 km: fácil + 10–20 min moderado (RPE 4–5)",
   "sab": "4.2 km regenerativo — muito fácil",
   "dom": "20 km longão fácil — pratique hidratação/carbo"
  },
  "focus": "Longões maiores; blocos moderados curtos e controlados.",
  "strength": "2–3x/sem; pernas 1x principal + 1x leve"
 },
 {
  "week": 27,
  "start": "2027-02-22",
  "end": "2027-02-28",
  "phase": "Resistência / Meia",
  "targetKm": 37,
  "longRunKm": 21.1,
  "runsPerWeek": 4,
  "sessions": {
   "ter": "5.1 km fácil — RPE 2–3",
   "qui": "6.4 km: fácil + 10–20 min moderado (RPE 4–5)",
   "sab": "4.4 km regenerativo — muito fácil",
   "dom": "21.1 km longão fácil — pratique hidratação/carbo"
  },
  "focus": "CHECKPOINT: 21,1 km em esforço fácil; caminhada é permitida.",
  "strength": "2–3x/sem; pernas 1x principal + 1x leve"
 },
 {
  "week": 28,
  "start": "2027-03-01",
  "end": "2027-03-07",
  "phase": "Resistência / Meia",
  "targetKm": 28,
  "longRunKm": 14,
  "runsPerWeek": 4,
  "sessions": {
   "ter": "4.5 km fácil — RPE 2–3",
   "qui": "5.6 km: fácil + 10–20 min moderado (RPE 4–5)",
   "sab": "3.9 km regenerativo — muito fácil",
   "dom": "14 km longão fácil — pratique hidratação/carbo"
  },
  "focus": "Recuperação após a meia/simulado.",
  "strength": "2–3x/sem; pernas 1x principal + 1x leve"
 },
 {
  "week": 29,
  "start": "2027-03-08",
  "end": "2027-03-14",
  "phase": "Específico Maratona",
  "targetKm": 38,
  "longRunKm": 22,
  "runsPerWeek": 4,
  "sessions": {
   "ter": "5.1 km fácil — RPE 2–3",
   "qui": "6.4 km: fácil + 10–20 min moderado (RPE 4–5)",
   "sab": "4.5 km regenerativo — muito fácil",
   "dom": "22 km longão fácil — pratique hidratação/carbo"
  },
  "focus": "Tempo em pé, alimentação e controle de esforço.",
  "strength": "2x/sem; reduzir volume de pernas 20–40%"
 },
 {
  "week": 30,
  "start": "2027-03-15",
  "end": "2027-03-21",
  "phase": "Específico Maratona",
  "targetKm": 40,
  "longRunKm": 24,
  "runsPerWeek": 4,
  "sessions": {
   "ter": "5.1 km fácil — RPE 2–3",
   "qui": "6.4 km: fácil + 10–20 min moderado (RPE 4–5)",
   "sab": "4.5 km regenerativo — muito fácil",
   "dom": "24 km longão fácil — pratique hidratação/carbo"
  },
  "focus": "Tempo em pé, alimentação e controle de esforço.",
  "strength": "2x/sem; reduzir volume de pernas 20–40%"
 },
 {
  "week": 31,
  "start": "2027-03-22",
  "end": "2027-03-28",
  "phase": "Específico Maratona",
  "targetKm": 42,
  "longRunKm": 26,
  "runsPerWeek": 4,
  "sessions": {
   "ter": "5.1 km fácil — RPE 2–3",
   "qui": "6.4 km: fácil + 10–20 min moderado (RPE 4–5)",
   "sab": "4.5 km regenerativo — muito fácil",
   "dom": "26 km longão fácil — pratique hidratação/carbo"
  },
  "focus": "Tempo em pé, alimentação e controle de esforço.",
  "strength": "2x/sem; reduzir volume de pernas 20–40%"
 },
 {
  "week": 32,
  "start": "2027-03-29",
  "end": "2027-04-04",
  "phase": "Específico Maratona",
  "targetKm": 32,
  "longRunKm": 18,
  "runsPerWeek": 4,
  "sessions": {
   "ter": "4.5 km fácil — RPE 2–3",
   "qui": "5.6 km: fácil + 10–20 min moderado (RPE 4–5)",
   "sab": "3.9 km regenerativo — muito fácil",
   "dom": "18 km longão fácil — pratique hidratação/carbo"
  },
  "focus": "Semana leve dentro do bloco específico.",
  "strength": "2x/sem; reduzir volume de pernas 20–40%"
 },
 {
  "week": 33,
  "start": "2027-04-05",
  "end": "2027-04-11",
  "phase": "Específico Maratona",
  "targetKm": 44,
  "longRunKm": 27,
  "runsPerWeek": 4,
  "sessions": {
   "ter": "5.4 km fácil — RPE 2–3",
   "qui": "6.8 km: fácil + 10–20 min moderado (RPE 4–5)",
   "sab": "4.8 km regenerativo — muito fácil",
   "dom": "27 km longão fácil — pratique hidratação/carbo"
  },
  "focus": "Tempo em pé, alimentação e controle de esforço.",
  "strength": "2x/sem; reduzir volume de pernas 20–40%"
 },
 {
  "week": 34,
  "start": "2027-04-12",
  "end": "2027-04-18",
  "phase": "Específico Maratona",
  "targetKm": 48,
  "longRunKm": 28,
  "runsPerWeek": 4,
  "sessions": {
   "ter": "6.4 km fácil — RPE 2–3",
   "qui": "8 km: fácil + 10–20 min moderado (RPE 4–5)",
   "sab": "5.6 km regenerativo — muito fácil",
   "dom": "28 km longão fácil — pratique hidratação/carbo"
  },
  "focus": "Tempo em pé, alimentação e controle de esforço.",
  "strength": "2x/sem; reduzir volume de pernas 20–40%"
 },
 {
  "week": 35,
  "start": "2027-04-19",
  "end": "2027-04-25",
  "phase": "Específico Maratona",
  "targetKm": 52,
  "longRunKm": 30,
  "runsPerWeek": 4,
  "sessions": {
   "ter": "7 km fácil — RPE 2–3",
   "qui": "8.8 km: fácil + 10–20 min moderado (RPE 4–5)",
   "sab": "6.2 km regenerativo — muito fácil",
   "dom": "30 km longão fácil — pratique hidratação/carbo"
  },
  "focus": "Pico: 30 km fácil. Teste roupa, tênis, hidratação e carboidrato.",
  "strength": "2x/sem; reduzir volume de pernas 20–40%"
 },
 {
  "week": 36,
  "start": "2027-04-26",
  "end": "2027-05-02",
  "phase": "Taper + Prova",
  "targetKm": 36,
  "longRunKm": 20,
  "runsPerWeek": 4,
  "sessions": {
   "ter": "5.1 km fácil — RPE 2–3",
   "qui": "6.4 km fácil",
   "sab": "4.5 km regenerativo — muito fácil",
   "dom": "20 km longão fácil — pratique hidratação/carbo"
  },
  "focus": "Taper: reduza volume e mantenha frequência.",
  "strength": "1–2x leve; nada pesado perto da prova"
 },
 {
  "week": 37,
  "start": "2027-05-03",
  "end": "2027-05-09",
  "phase": "Taper + Prova",
  "targetKm": 24,
  "longRunKm": 12,
  "runsPerWeek": 4,
  "sessions": {
   "ter": "3.8 km fácil — RPE 2–3",
   "qui": "4.8 km fácil",
   "sab": "3.4 km regenerativo — muito fácil",
   "dom": "12 km longão fácil — pratique hidratação/carbo"
  },
  "focus": "Taper: tudo fácil; objetivo é chegar descansado.",
  "strength": "1–2x leve; nada pesado perto da prova"
 },
 {
  "week": 38,
  "start": "2027-05-10",
  "end": "2027-05-16",
  "phase": "Taper + Prova",
  "targetKm": 50.2,
  "longRunKm": 42.2,
  "runsPerWeek": 4,
  "sessions": {
   "ter": "3 km muito fácil + 4 acelerações de 15s",
   "qui": "3 km muito fácil",
   "sab": "2 km soltura OU descanso",
   "dom": "PROVA 42,195 km — esforço conservador"
  },
  "focus": "SEMANA DA PROVA: 42,195 km. Comece conservador.",
  "strength": "1–2x leve; nada pesado perto da prova"
 }
];

/* ---------- helpers (usam apenas o plano acima + corridas[]) ---------- */

/** Semana do plano que contém a data ISO (limites inclusivos, fuso local). */
function maratonaWeekForDate(iso) {
  var d = String(iso || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  for (var i = 0; i < MARATONA_PLAN.length; i++) {
    if (d >= MARATONA_PLAN[i].start && d <= MARATONA_PLAN[i].end) return MARATONA_PLAN[i];
  }
  return null;
}

function maratonaWeekByNumber(n) {
  for (var i = 0; i < MARATONA_PLAN.length; i++) if (MARATONA_PLAN[i].week === n) return MARATONA_PLAN[i];
  return null;
}

/** Volume real (km) das corridas registradas dentro da semana do plano. */
function maratonaActualKm(corridas, planWeek) {
  var total = 0;
  (Array.isArray(corridas) ? corridas : []).forEach(function(c) {
    var d = String((c && (c.date || c.data)) || '').slice(0, 10);
    if (d >= planWeek.start && d <= planWeek.end) {
      var km = Number(c.distanciaKm);
      if (isFinite(km) && km > 0) total += km;
    }
  });
  return Math.round(total * 10) / 10;
}

/** Longão realizado na semana: associação explícita vence; sem associação,
 *  sugere a maior corrida da semana. */
function maratonaLongRunInfo(corridas, planWeek, assoc) {
  var inWeek = (Array.isArray(corridas) ? corridas : []).filter(function(c) {
    var d = String((c && (c.date || c.data)) || '').slice(0, 10);
    return d >= planWeek.start && d <= planWeek.end && isFinite(Number(c.distanciaKm));
  });
  var explicit = null;
  if (assoc && Array.isArray(assoc.longRunIds)) {
    for (var i = 0; i < inWeek.length; i++) {
      if (assoc.longRunIds.indexOf(String(inWeek[i].id)) >= 0) { explicit = inWeek[i]; break; }
    }
  }
  var best = null;
  inWeek.forEach(function(c) {
    if (!best || Number(c.distanciaKm) > Number(best.distanciaKm)) best = c;
  });
  var chosen = explicit || best;
  return {
    explicit: !!explicit,
    run: chosen,
    km: chosen ? Math.round(Number(chosen.distanciaKm) * 10) / 10 : 0,
    suggestion: !explicit && best ? String(best.id) : null
  };
}

/** Aderência: 100% no alvo; desvios PARA QUALQUER lado reduzem a nota.
 *  score = max(0, 100 − |pct−100|). 140% do volume NÃO é "melhor" que 100%.
 *  Status: >=90 'no plano' · 70–89 'próximo' · <70 'abaixo' · pct>120 'acima ⚠'. */
function maratonaAdherence(actualKm, targetKm) {
  if (!(targetKm > 0)) return { pct: null, score: null, status: 'sem meta' };
  var pct = Math.round((actualKm / targetKm) * 100);
  var score = Math.max(0, 100 - Math.abs(pct - 100));
  var status;
  if (pct > 120) status = 'acima ⚠';
  else if (score >= 90) status = 'no plano';
  else if (score >= 70) status = 'próximo';
  else status = 'abaixo';
  return { pct: pct, score: score, status: status };
}

function maratonaCumulative(corridas) {
  var planned = 0, actual = 0;
  var rows = MARATONA_PLAN.map(function(w) {
    planned += w.targetKm;
    var act = maratonaActualKm(corridas, w);
    actual += act;
    return { week: w.week, plannedKm: Math.round(planned * 10) / 10, actualKm: Math.round(actual * 10) / 10 };
  });
  return rows;
}

var api = {
  MARATONA_META: MARATONA_META,
  MARATONA_PLAN: MARATONA_PLAN,
  maratonaWeekForDate: maratonaWeekForDate,
  maratonaWeekByNumber: maratonaWeekByNumber,
  maratonaActualKm: maratonaActualKm,
  maratonaLongRunInfo: maratonaLongRunInfo,
  maratonaAdherence: maratonaAdherence,
  maratonaCumulative: maratonaCumulative
};

if (typeof window !== 'undefined') {
  window.MARATONA_META = MARATONA_META;
  window.MARATONA_PLAN = MARATONA_PLAN;
  window.maratonaWeekForDate = maratonaWeekForDate;
  window.maratonaWeekByNumber = maratonaWeekByNumber;
  window.maratonaActualKm = maratonaActualKm;
  window.maratonaLongRunInfo = maratonaLongRunInfo;
  window.maratonaAdherence = maratonaAdherence;
  window.maratonaCumulative = maratonaCumulative;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
