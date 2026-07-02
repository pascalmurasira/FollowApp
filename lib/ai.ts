/**
 * Central AI model configuration.
 *
 * All text/structured-generation routes share one model so swapping providers
 * is a one-line change here instead of touching every route.
 *
 * `google/gemini-2.5-flash-lite` is chosen for production: it's a
 * non-reasoning model (so responses are fast with no reasoning-token latency),
 * inexpensive ($0.10/M in, $0.40/M out via the AI Gateway), and reliable at the
 * structured JSON + vision/OCR work these routes need. All IDs route through the
 * Vercel AI Gateway, so no provider SDK or API key is required beyond the
 * gateway's own env vars.
 */
export const TEXT_MODEL = 'google/gemini-2.5-flash-lite'

/**
 * Search-grounded model used only where we need live web research (contact
 * enrichment). Perplexity Sonar searches the web; TEXT_MODEL then structures
 * the findings.
 */
export const SEARCH_MODEL = 'perplexity/sonar'
