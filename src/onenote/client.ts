/**
 * OneNote API Client
 *
 * Generic HTTP client wrapper for Microsoft Graph requests.
 */

import { FETCH_TIMEOUT_MS, MICROSOFT_GRAPH_BASE_URL } from "../constants.js";
import {
  OneNoteClientError,
  type OneNoteClientConfig,
  type OneNoteResult,
} from "./types.js";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface RequestOptions {
  /** URL path relative to the base URL (e.g., "/me") */
  path: string;
  /** HTTP method (defaults to GET) */
  method?: HttpMethod;
  /** Query parameters */
  params?: Record<string, string>;
  /** JSON request body */
  body?: unknown;
}

/** Internal options for the shared _fetch method. */
interface FetchOptions {
  /** URL path relative to the base URL */
  path: string;
  /** HTTP method (defaults to GET) */
  method: HttpMethod;
  /** Query parameters */
  params?: Record<string, string> | undefined;
  /** Request headers (merged with Authorization) */
  headers: Record<string, string>;
  /** Serialized request body */
  body?: string | undefined;
}

/**
 * OneNote API client.
 */
export class OneNoteClient {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: OneNoteClientConfig) {
    this.token = config.token;
    this.baseUrl = (config.baseUrl ?? MICROSOFT_GRAPH_BASE_URL).replace(
      /\/+$/,
      ""
    );
    this.timeoutMs = config.timeoutMs ?? FETCH_TIMEOUT_MS;
  }

  /**
   * Shared HTTP lifecycle: URL construction, timeout, auth header, fetch,
   * error mapping, and cleanup. Returns the raw Response on success.
   */
  private async _fetch(
    options: FetchOptions
  ): Promise<OneNoteResult<Response>> {
    const { path, method, params, headers, body } = options;

    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    try {
      const mergedHeaders: Record<string, string> = {
        Authorization: `Bearer ${this.token}`,
        ...headers,
      };

      const init: RequestInit = {
        method,
        headers: mergedHeaders,
        signal: controller.signal,
      };

      if (body !== undefined) {
        init.body = body;
      }

      const response = await fetch(url.toString(), init);

      if (!response.ok) {
        return { success: false, error: await this.mapHttpError(response) };
      }

      return { success: true, data: response };
    } catch (error) {
      return { success: false, error: this.mapNetworkError(error) };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /** Make an authenticated JSON request to Microsoft Graph. */
  async request<T>(options: RequestOptions): Promise<OneNoteResult<T>> {
    const { path, method = "GET", params, body } = options;

    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    let serializedBody: string | undefined;
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      serializedBody = JSON.stringify(body);
    }

    const result = await this._fetch({
      path,
      method,
      params,
      headers,
      body: serializedBody,
    });

    if (!result.success) {
      return result;
    }

    const response = result.data;
    const text = await response.text();

    if (text.length === 0) {
      // Empty response body (e.g. 204 No Content). Callers that expect an
      // empty body should use requestEmpty() instead. This fallback keeps
      // backward compatibility but the cast is intentionally opaque so that
      // callers are nudged toward requestEmpty() for void endpoints.
      return { success: true, data: undefined as unknown as T };
    }

    try {
      const data = JSON.parse(text) as T;
      return { success: true, data };
    } catch {
      return {
        success: false,
        error: new OneNoteClientError(
          "Received non-JSON response from Microsoft Graph",
          "UNKNOWN",
          response.status,
          false
        ),
      };
    }
  }

  /**
   * Make an authenticated request that returns the raw response body as a string.
   * Used for endpoints that return non-JSON content (e.g., page HTML content).
   */
  async requestRaw(
    options: RequestOptions & { accept?: string }
  ): Promise<OneNoteResult<string>> {
    const { path, method = "GET", params, accept } = options;

    const result = await this._fetch({
      path,
      method,
      params,
      headers: {
        Accept: accept ?? "text/html",
      },
    });

    if (!result.success) {
      return result;
    }

    const text = await result.data.text();
    return { success: true, data: text };
  }

  /**
   * Make an authenticated request with a raw string body (not JSON).
   * Used for page creation where the body is HTML.
   */
  async requestHtmlBody<T>(options: {
    path: string;
    method?: HttpMethod;
    body: string;
    contentType?: string;
  }): Promise<OneNoteResult<T>> {
    const {
      path,
      method = "POST",
      body,
      contentType = "application/xhtml+xml",
    } = options;

    const result = await this._fetch({
      path,
      method,
      headers: {
        "Content-Type": contentType,
        Accept: "application/json",
      },
      body,
    });

    if (!result.success) {
      return result;
    }

    const response = result.data;
    const text = await response.text();

    if (text.length === 0) {
      // See comment in request<T>() -- callers should prefer requestEmpty().
      return { success: true, data: undefined as unknown as T };
    }

    try {
      const data = JSON.parse(text) as T;
      return { success: true, data };
    } catch {
      return {
        success: false,
        error: new OneNoteClientError(
          "Received non-JSON response from Microsoft Graph",
          "UNKNOWN",
          response.status,
          false
        ),
      };
    }
  }

  /**
   * Make an authenticated request that expects no response body (e.g. 204 No Content).
   * Used for DELETE and PATCH operations that return empty responses.
   *
   * Returns OneNoteResult<void> -- the success case carries no data, avoiding
   * the `undefined as T` type erasure present in request<T>().
   */
  async requestEmpty(options: RequestOptions): Promise<OneNoteResult<void>> {
    const { path, method = "GET", params, body } = options;

    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    let serializedBody: string | undefined;
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      serializedBody = JSON.stringify(body);
    }

    const result = await this._fetch({
      path,
      method,
      params,
      headers,
      body: serializedBody,
    });

    if (!result.success) {
      return result;
    }

    // Intentionally discard the response body. The caller has declared
    // they expect no meaningful content.
    const empty: OneNoteResult<void> = { success: true, data: undefined };
    return empty;
  }

  private async mapHttpError(response: Response): Promise<OneNoteClientError> {
    const status = response.status;

    let apiMessage: string | undefined;
    try {
      const body = (await response.json()) as
        | { message?: string; error?: { message?: string } }
        | undefined;
      apiMessage = body?.message ?? body?.error?.message;
    } catch {
      // ignore parse errors for error body
    }

    const suffix = apiMessage ? `: ${apiMessage}` : "";

    switch (status) {
      case 401:
        return new OneNoteClientError(
          `Invalid or expired access token${suffix}`,
          "UNAUTHORIZED",
          status,
          false,
          apiMessage
        );
      case 403:
        return new OneNoteClientError(
          `Access forbidden by Microsoft Graph${suffix}`,
          "FORBIDDEN",
          status,
          false,
          apiMessage
        );
      case 404:
        return new OneNoteClientError(
          `Resource not found${suffix}`,
          "NOT_FOUND",
          status,
          false,
          apiMessage
        );
      case 429:
        return new OneNoteClientError(
          `Rate limit exceeded${suffix}`,
          "RATE_LIMITED",
          status,
          true,
          apiMessage
        );
      default:
        if (status >= 500) {
          return new OneNoteClientError(
            `Server error (${status})${suffix}`,
            "SERVER_ERROR",
            status,
            true,
            apiMessage
          );
        }

        return new OneNoteClientError(
          `Unexpected error (${status})${suffix}`,
          "UNKNOWN",
          status,
          false,
          apiMessage
        );
    }
  }

  private mapNetworkError(error: unknown): OneNoteClientError {
    if (error instanceof Error) {
      if (error.name === "AbortError" || error.name === "TimeoutError") {
        return new OneNoteClientError(
          "Request timed out",
          "TIMEOUT",
          undefined,
          true
        );
      }

      return new OneNoteClientError(
        `Network error: ${error.message}`,
        "NETWORK_ERROR",
        undefined,
        false
      );
    }

    return new OneNoteClientError(
      "Unknown network error",
      "UNKNOWN",
      undefined,
      false
    );
  }
}

/**
 * Create a OneNoteClient from ONENOTE_ACCESS_TOKEN only.
 */
export function createClientFromEnv(): OneNoteResult<OneNoteClient> {
  const token = process.env["ONENOTE_ACCESS_TOKEN"];

  if (!token) {
    return {
      success: false,
      error: new OneNoteClientError(
        "ONENOTE_ACCESS_TOKEN is not set. Configure OAuth credentials or provide a manual token.",
        "MISSING_TOKEN"
      ),
    };
  }

  return {
    success: true,
    data: new OneNoteClient({ token }),
  };
}

/**
 * Create a OneNoteClient using the full auth chain.
 */
export async function createClientFromAuth(): Promise<
  OneNoteResult<OneNoteClient>
> {
  const { getOneNoteAccessToken, OneNoteAuthError } = await import("./auth.js");

  try {
    const result = await getOneNoteAccessToken();
    return {
      success: true,
      data: new OneNoteClient({ token: result.accessToken }),
    };
  } catch (error) {
    if (error instanceof OneNoteAuthError) {
      return {
        success: false,
        error: new OneNoteClientError(error.message, "MISSING_TOKEN"),
      };
    }

    return {
      success: false,
      error: new OneNoteClientError(
        error instanceof Error ? error.message : "Unknown authentication error",
        "UNKNOWN"
      ),
    };
  }
}
