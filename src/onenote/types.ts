/**
 * OneNote API Types
 *
 * Shared types for OneNote client and auth modules.
 */

/** Error codes returned by the OneNote client */
export type OneNoteErrorCode =
  | "MISSING_TOKEN"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "SERVER_ERROR"
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "UNKNOWN";

/**
 * Typed error for OneNote API operations.
 */
export class OneNoteClientError extends Error {
  constructor(
    message: string,
    public readonly code: OneNoteErrorCode,
    public readonly statusCode?: number,
    public readonly retryable = false,
    public readonly apiMessage?: string
  ) {
    super(message);
    this.name = "OneNoteClientError";
  }
}

/** Success result from an OneNote API call */
export interface OneNoteSuccess<T> {
  success: true;
  data: T;
}

/** Error result from an OneNote API call */
export interface OneNoteError {
  success: false;
  error: OneNoteClientError;
}

/** Discriminated union for API results */
export type OneNoteResult<T> = OneNoteSuccess<T> | OneNoteError;

/** OneNote client configuration */
export interface OneNoteClientConfig {
  token: string;
  baseUrl?: string;
  timeoutMs?: number;
}
