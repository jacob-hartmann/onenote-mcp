/**
 * Validation Utilities
 *
 * Input validation and sanitization helpers for safe API interactions.
 */

/**
 * Validate and encode a Graph API entity ID for safe URL interpolation.
 * IDs from the Graph API are typically base64-like strings, but we must
 * protect against path traversal and query injection.
 */
export function sanitizeId(id: string, paramName: string): string {
  if (!id || id.trim().length === 0) {
    throw new Error(`${paramName} must not be empty`);
  }
  // Encode to prevent path traversal (../), query injection (?), fragment injection (#)
  return encodeURIComponent(id);
}
