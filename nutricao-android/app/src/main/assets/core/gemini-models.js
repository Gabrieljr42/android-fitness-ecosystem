/* core/gemini-models.js — central Gemini model fallback config (Phase 2, 2026-09-05).
 *
 * Single source of truth for the ordered model fallback list, the API base
 * URL and the retry delay shared by every core/gemini.js flow (foto, texto,
 * resumo do dia, atividade). core/gemini.js reads GEMINI_MODELS_CONFIG when
 * present and falls back to identical inline constants when this file is not
 * loaded, so behavior/order never changes.
 *
 * Why a JS const module instead of JSON: index.html loads scripts with plain
 * <script src> tags over file:// (no fetch before first use), and the Node
 * test harness evals core/*.js one file at a time via vm.runInContext — a
 * .json file cannot be synchronously required in either context. Keep the
 * schema below JSON-compatible so it can be serialized 1:1 if needed.
 *
 * Schema: { version: number, apiBase: string, retryDelayMs: number,
 *           models: [{ id: string, label: string, thinkingLevel: string }] }
 * Order of `models` IS the fallback order. Do not reorder without updating
 * Coach SupportedModels.kt + docs/configuration.md.
 */
var GEMINI_MODELS_CONFIG = {
  version: 1,
  apiBase: 'https://generativelanguage.googleapis.com/v1beta/models/',
  retryDelayMs: 3000,
  models: [
    { id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash', thinkingLevel: 'low' },
    { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', thinkingLevel: 'low' },
    { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', thinkingLevel: 'low' }
  ]
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = GEMINI_MODELS_CONFIG;
}
