# kernel/ (root) — DO NOT EDIT, stale mirror

Canonical source: `evolucao-android/app/src/main/assets/kernel/`
(`app.js`, `charts.js`, `db.js`, `fmt.js`, `icons.js`, `notif.js`, `theme.css`, `ui.js`).

This root folder is a shared-ancestor copy. The apps each vendor their own copy
under `assets/kernel/` — always edit the app copy, never this folder.

Drift evidence (Phase 1, 2026-09-05, via Get-Content count): root `kernel/db.js`
is 193 lines while the canonical
`evolucao-android/app/src/main/assets/kernel/db.js` is 283 lines
(`node split('\n')` reports 194 vs 284 — same delta, trailing-newline counting).
The root copy retains only legacy `typeof exerciseIdFor === 'function'`
call-site fallbacks (lines 6, 117, 169, 173) but lacks the canonical fallback
definition (`if (typeof exerciseIdFor === 'undefined')...`, canonical lines 8-12)
and the persisted-ID regex guard (`/^ex_[a-z0-9]...$/`, canonical lines 150-152).
It also lacks `draft.dateExplicit` (canonical line 30), `marathonState`
(canonical line 32), the `wearSync` envelope state (canonical line 33), and the
~84-line wear-merge tail (`sessionSig`/`mergeWearSync`/`mergeState`, canonical
lines 200-283).
The copies are NOT byte-identical — editing here silently diverges.

Deletion (NOT done in Phase 1, listed for a future decision) would remove exactly:
`kernel/app.js`, `kernel/charts.js`, `kernel/db.js`, `kernel/fmt.js`,
`kernel/icons.js`, `kernel/notif.js`, `kernel/theme.css`, `kernel/ui.js`
(8 files). Kept for now; this README is the reversible guard instead.
