// Public API of the text conversation engine (see docs/messaging.md).
export { handleIncomingMessage, proactiveMessage, householdIdFor, normalizeFrom } from './engine.js';
export type { IncomingMessage, OutgoingMessage, Channel, ProactiveKind } from './engine.js';
export { registerConversationRoutes } from './routes.js';
export { setConversationDeps } from './deps.js';
