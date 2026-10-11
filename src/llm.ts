// Aid's single entry point for AI: every task routes through Neon AI Gateway with its own credential,
// best model and cross-provider fallback. Implementation lives in src/llm/*.
export { ROUTES, DEFAULT_MODEL, EMBED_MODEL, model, modelFor, hasModel, routeInfo, primaryModel, candidateIds } from './llm/routes.js';
export type { AiTask, Route, TokenName } from './llm/routes.js';
export { generateWithFallback, generateObjectWithFallback, setLlmDeps, parseJsonObject } from './llm/fallback.js';
export { embedTexts, EMBED_DIM, EMBED_BATCH } from './llm/embed.js';
export { translate, detectLanguage } from './llm/text.js';
