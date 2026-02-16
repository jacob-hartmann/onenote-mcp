/**
 * Utilities Module
 *
 * Shared utility functions.
 */

export {
  escapeHtml,
  buildPageHtml,
  sanitizeHtmlForXhtml,
  stripHtml,
} from "./html.js";
export { sanitizeId } from "./validation.js";
export { LRUCache, type LRUCacheOptions } from "./lru-cache.js";
