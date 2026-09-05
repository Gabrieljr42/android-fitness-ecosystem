# apps/evolucao/ (root) — DO NOT EDIT, stale mirror

Canonical sources:

- `evolucao-android/app/src/main/assets/apps/evolucao/` (dados, logic, strava,
  peso, maratonaplano, wear-sync, `views/`, `exercicios/`)
- `evolucao-android/app/src/main/assets/core/` (`progressao.js`, `gemini.js`)
- `evolucao-android/app/src/main/assets/kernel/` (`app.js`, `db.js`, `fmt.js`, …)

This root folder is a partial, drifted mirror — always edit the canonical
`evolucao-android/.../assets/` copies, never this folder.

Drift evidence (Phase 1, 2026-09-05):

- `views/`: root has 1 file (`treino.js`); canonical has 7 (`ble-diag.js`,
  `corrida.js`, `ficha.js`, `historico.js`, `maratona.js`, `progresso.js`,
  `treino.js`).
- `kernel/`: root has a 2-file subset (`db.js`, `ui.js`); canonical has 8 files.
  This mirror's `kernel/db.js` (199 lines via Get-Content, 200 via node split)
  differs from both root `kernel/db.js` (193 lines) and canonical `kernel/db.js`
  (283 lines). Unlike root `kernel/db.js`, this mirror DOES have
  `draft.dateExplicit`, `marathonState`, `wearSync`, and the persisted-ID regex
  guard — but it lacks the canonical ~84-line wear-merge tail
  (`sessionSig`/`mergeWearSync`/`mergeState`, canonical lines 200-283) and adds
  a Node `module.exports` shim (mirror lines 197-199) absent in the canonical
  WebView-global file. `kernel/ui.js` also differs (mirror 7789 bytes vs
  canonical 8219 bytes).
- `core/`: root has (`logic.js`, `progressao.js`); canonical has (`gemini.js`,
  `progressao.js`) — different sets. `core/progressao.js` is currently
  byte-identical to canonical, but `core/logic.js` is not (mirror 5438 bytes vs
  canonical `apps/evolucao/logic.js` 4793 bytes).
- `strava.js` (293 lines) and `views/treino.js` are currently byte-identical to
  canonical (verified 2026-09-05: `strava.js` full diff 0 lines,
  `treino.js` 53779 chars identical, `progressao.js` 24988 chars identical).
  The surrounding tree has still diverged (see `kernel/db.js`, `ui.js`,
  `logic.js` above), so DO NOT treat any file here as canonical — identical
  today does not mean safe to edit here.

Deletion (NOT done in Phase 1, listed for a future decision) would remove exactly:
`apps/evolucao/core/logic.js`, `apps/evolucao/core/progressao.js`,
`apps/evolucao/kernel/db.js`, `apps/evolucao/kernel/ui.js`,
`apps/evolucao/strava.js`, `apps/evolucao/tests/progressao.test.js`,
`apps/evolucao/tests/timer_inactivity.test.js`,
`apps/evolucao/views/treino.js` (8 files). Kept for now; this README is the
reversible guard instead.
