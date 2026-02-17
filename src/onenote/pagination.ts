/**
 * Pagination Helpers
 *
 * Utilities for fetching paginated OData collections from the Graph API.
 */

import { ONENOTE_MAX_PAGINATION_PAGES } from "../constants.js";
import type { OneNoteClient } from "./client.js";
import type { GraphODataCollection } from "./graph-types.js";
import type { OneNoteResult } from "./types.js";

/**
 * Fetch a single page from a collection endpoint.
 */
export async function fetchPage<T>(
  client: OneNoteClient,
  path: string,
  params?: Record<string, string>
): Promise<OneNoteResult<GraphODataCollection<T>>> {
  const options: { path: string; params?: Record<string, string> } = { path };
  if (params !== undefined) {
    options.params = params;
  }
  return client.request<GraphODataCollection<T>>(options);
}

/**
 * Fetch ALL items from a paginated collection endpoint,
 * automatically following @odata.nextLink.
 *
 * @param client    - Authenticated OneNoteClient
 * @param path      - Initial API path (e.g., "/me/onenote/sections/abc/pages")
 * @param params    - OData query parameters for the initial request
 * @param maxPages  - Safety limit to prevent infinite loops (default: ONENOTE_MAX_PAGINATION_PAGES)
 */
export async function fetchAllPages<T>(
  client: OneNoteClient,
  path: string,
  params?: Record<string, string>,
  maxPages: number = ONENOTE_MAX_PAGINATION_PAGES
): Promise<OneNoteResult<T[]>> {
  const allItems: T[] = [];
  let currentPath = path;
  let currentParams: Record<string, string> | undefined = params;
  let pageCount = 0;

  while (pageCount < maxPages) {
    const result = await fetchPage<T>(client, currentPath, currentParams);

    if (!result.success) {
      return result;
    }

    allItems.push(...result.data.value);

    const nextLink = result.data["@odata.nextLink"];
    if (!nextLink) {
      break;
    }

    // Parse the nextLink URL to extract path and params for the next request.
    // The nextLink is a full URL; we need to make it relative to the base URL.
    const nextUrl = new URL(nextLink);
    currentPath = nextUrl.pathname.replace(/^\/v1\.0/, "");

    // Validate the path to prevent SSRF via malicious nextLink values
    if (!currentPath.startsWith("/me/onenote/")) {
      break;
    }

    currentParams = Object.fromEntries(nextUrl.searchParams.entries());
    pageCount++;
  }

  return { success: true, data: allItems };
}
