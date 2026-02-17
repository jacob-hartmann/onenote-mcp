/**
 * HTML Utilities
 *
 * Shared HTML helper functions for escaping, rendering, and content processing.
 */

/**
 * Escape HTML special characters to prevent XSS attacks.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Maximum content length for HTML sanitization (1MB) */
const MAX_SANITIZE_LENGTH = 1_000_000;

/**
 * Sanitize HTML content to be valid XHTML.
 * LLMs commonly produce HTML (not XHTML), so we convert common patterns:
 * - Self-close void elements: <br> -> <br/>, <hr> -> <hr/>, <img ...> -> <img .../>
 * - Escape bare ampersands: & (not already part of an entity) -> &amp;
 * This is best-effort -- we cannot fully parse HTML, but we handle common LLM patterns.
 */
export function sanitizeHtmlForXhtml(html: string): string {
  if (html.length > MAX_SANITIZE_LENGTH) {
    throw new Error(
      `Content too large for sanitization (${html.length} characters, max ${MAX_SANITIZE_LENGTH})`
    );
  }
  let result = html;
  // Self-close void elements that aren't already self-closed
  const voidElements = [
    "br",
    "hr",
    "img",
    "input",
    "meta",
    "link",
    "col",
    "area",
    "base",
    "embed",
    "source",
    "track",
    "wbr",
  ];
  for (const tag of voidElements) {
    // Match <tag ...> that isn't already self-closed
    result = result.replace(
      new RegExp(`<(${tag})(\\s[^>]*)?>(?!\\s*</${tag}>)`, "gi"),
      (_match, name: string, attrs: string | undefined) =>
        `<${name}${attrs ?? ""}/>`
    );
  }
  // Escape bare ampersands (not part of entities)
  result = result.replace(
    /&(?!(?:#[0-9]+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);)/g,
    "&amp;"
  );
  return result;
}

/**
 * Wrap page body content with the required HTML envelope for page creation.
 * The Graph API expects a full XHTML document. The body content is sanitized
 * to convert common HTML patterns to valid XHTML.
 */
export function buildPageHtml(title: string, bodyContent?: string): string {
  const escapedTitle = escapeHtml(title);
  const body = bodyContent ? sanitizeHtmlForXhtml(bodyContent) : "";
  return `<!DOCTYPE html>\n<html>\n  <head>\n    <title>${escapedTitle}</title>\n  </head>\n  <body>\n    ${body}\n  </body>\n</html>`;
}
