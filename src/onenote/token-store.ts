/**
 * Token Store
 *
 * Persists OneNote OAuth tokens to the local filesystem.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { OneNoteTokenData } from "./oauth.js";

/** Get the default token store directory based on platform conventions. */
export function getDefaultStoreDir(): string {
  if (process.platform === "win32") {
    const appData = process.env["APPDATA"];
    if (appData) {
      return join(appData, "onenote-mcp");
    }
    return join(homedir(), "AppData", "Roaming", "onenote-mcp");
  }

  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "onenote-mcp");
  }

  const xdgConfig = process.env["XDG_CONFIG_HOME"];
  if (xdgConfig) {
    return join(xdgConfig, "onenote-mcp");
  }

  return join(homedir(), ".config", "onenote-mcp");
}

/** Get token store file path. */
export function getTokenStorePath(): string {
  const envPath = process.env["ONENOTE_TOKEN_STORE_PATH"];
  if (envPath) {
    return envPath;
  }

  return join(getDefaultStoreDir(), "tokens.json");
}

/** Load tokens from disk. */
export function loadTokens(): OneNoteTokenData | undefined {
  const path = getTokenStorePath();

  if (!existsSync(path)) {
    return undefined;
  }

  try {
    const raw = readFileSync(path, "utf-8");
    const data: unknown = JSON.parse(raw);

    if (
      typeof data === "object" &&
      data !== null &&
      "accessToken" in data &&
      typeof (data as Record<string, unknown>)["accessToken"] === "string"
    ) {
      return data as OneNoteTokenData;
    }

    console.error("[onenote-mcp] Token store file has invalid structure");
    return undefined;
  } catch (error) {
    console.error("[onenote-mcp] Failed to load token store:", error);
    return undefined;
  }
}

/** Save tokens to disk. */
export function saveTokens(tokens: OneNoteTokenData): void {
  const path = getTokenStorePath();
  const dir = dirname(path);

  try {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(path, JSON.stringify(tokens, null, 2), {
      encoding: "utf-8",
      mode: 0o600,
    });
  } catch (error) {
    console.error("[onenote-mcp] Failed to save token store:", error);
    throw error;
  }
}

/** Clear stored tokens. */
export function clearTokens(): void {
  const path = getTokenStorePath();

  if (existsSync(path)) {
    try {
      rmSync(path, { force: true });
    } catch (error) {
      console.error("[onenote-mcp] Failed to clear token store:", error);
    }
  }
}
