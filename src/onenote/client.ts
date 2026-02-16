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

  /** Make an authenticated request to Microsoft Graph. */
  async request<T>(options: RequestOptions): Promise<OneNoteResult<T>> {
    const { path, method = "GET", params, body } = options;

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
      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json",
      };

      const init: RequestInit = {
        method,
        headers,
        signal: controller.signal,
      };

      if (body !== undefined) {
        headers["Content-Type"] = "application/json";
        init.body = JSON.stringify(body);
      }

      const response = await fetch(url.toString(), init);

      if (!response.ok) {
        return { success: false, error: await this.mapHttpError(response) };
      }

      const text = await response.text();
      if (text.length === 0) {
        return { success: true, data: undefined as T };
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
    } catch (error) {
      return { success: false, error: this.mapNetworkError(error) };
    } finally {
      clearTimeout(timeoutId);
    }
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
