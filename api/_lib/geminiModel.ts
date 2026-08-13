// ============================================================
// geminiModel.ts — the ONE place the Gemini model id is chosen.
//
// Why this file exists: the model id used to be a string literal inside
// `api/gemini-proxy.ts` AND `api/auto-sync-gmail.ts`. Google shut
// `gemini-2.0-flash` down on 1 June 2026, both literals went stale, and
// `generativelanguage.googleapis.com` began answering every request with
// 404 NOT_FOUND. The proxy forwarded that 404 verbatim, the client's
// `isFatalProxyError` check treated 404 as terminal, and every AI verdict
// became `null` — which the scanner correctly reads as "no AI opinion, use
// the regex ladder". So the classifier was completely dead for ~10 weeks
// while the app reported nothing wrong at all.
//
// Two rules follow from that, and both are load-bearing:
//   1. ONE definition, imported by every caller. Two literals cannot drift.
//   2. Overridable WITHOUT a code change. Model ids now churn on a scale of
//      months; when the next one is retired the fix must be an env var in the
//      Vercel dashboard, not a pull request.
// ============================================================

/**
 * Model used for email classification (the scanner) and AI insights.
 *
 * Default chosen 2026-08-13 for the classification workload: it is the
 * cheapest current tier and this is high-volume, low-reasoning structured
 * extraction. Override with the GEMINI_MODEL environment variable.
 */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite'

export function resolveGeminiModel(env: NodeJS.ProcessEnv = process.env): string {
  return env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL
}

export function geminiEndpoint(apiKey: string, model: string = resolveGeminiModel()): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
}

/**
 * True when an upstream status means "this model id does not resolve" rather
 * than "the request was bad" or "we are busy".
 *
 * 404 is the signature of a retired or misspelled model. It is the single
 * most important failure to name explicitly, because it is silent by nature:
 * every downstream layer is built to degrade gracefully when the AI has no
 * opinion, so a permanently dead model looks exactly like a model that keeps
 * answering "I'm not sure".
 */
export function isModelNotFoundStatus(status: number): boolean {
  return status === 404
}

/** Operator-facing explanation for a dead model id. Logged AND returned to the client. */
export function modelNotFoundMessage(model: string): string {
  return (
    `Gemini model "${model}" was not found (404). It has most likely been retired by Google. ` +
    `Set the GEMINI_MODEL environment variable to a current model id — ` +
    `see https://ai.google.dev/gemini-api/docs/deprecations`
  )
}
