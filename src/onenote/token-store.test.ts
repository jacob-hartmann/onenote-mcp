import * as fs from "node:fs";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  clearTokens,
  getDefaultStoreDir,
  getTokenStorePath,
  loadTokens,
  saveTokens,
} from "./token-store.js";

describe("token-store", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    clearTokens();
    process.env = { ...originalEnv };
  });

  it("uses ONENOTE_TOKEN_STORE_PATH override", () => {
    process.env["ONENOTE_TOKEN_STORE_PATH"] = "C:/tmp/onenote-token-store.json";
    expect(getTokenStorePath()).toBe("C:/tmp/onenote-token-store.json");
  });

  it("saveTokens and loadTokens round trip", () => {
    process.env["ONENOTE_TOKEN_STORE_PATH"] =
      `${process.cwd()}/.tmp-onenote-token-store.json`;

    saveTokens({
      accessToken: "access",
      refreshToken: "refresh",
      expiresAt: new Date(Date.now() + 1000).toISOString(),
    });

    const loaded = loadTokens();
    expect(loaded?.accessToken).toBe("access");
    expect(loaded?.refreshToken).toBe("refresh");
  });

  it("loadTokens returns undefined for malformed file", () => {
    process.env["ONENOTE_TOKEN_STORE_PATH"] =
      `${process.cwd()}/.tmp-onenote-token-store.json`;
    saveTokens({ accessToken: "ok" });

    fs.writeFileSync(
      process.env["ONENOTE_TOKEN_STORE_PATH"],
      "{bad json",
      "utf-8"
    );

    const loaded = loadTokens();
    expect(loaded).toBeUndefined();
  });

  it("loadTokens returns undefined for invalid object shape", () => {
    process.env["ONENOTE_TOKEN_STORE_PATH"] =
      `${process.cwd()}/.tmp-onenote-token-store.json`;

    fs.writeFileSync(
      process.env["ONENOTE_TOKEN_STORE_PATH"],
      JSON.stringify({ refreshToken: "only-refresh" }),
      "utf-8"
    );

    const loaded = loadTokens();
    expect(loaded).toBeUndefined();
  });

  it("clearTokens removes the token file", () => {
    process.env["ONENOTE_TOKEN_STORE_PATH"] =
      `${process.cwd()}/.tmp-onenote-token-store.json`;
    saveTokens({ accessToken: "access" });

    clearTokens();

    const loaded = loadTokens();
    expect(loaded).toBeUndefined();
  });

  it("saveTokens creates missing parent directories", () => {
    process.env["ONENOTE_TOKEN_STORE_PATH"] =
      `${process.cwd()}/.tmp-onenote-token-dir/sub/tokens.json`;

    saveTokens({ accessToken: "dir-create" });

    const loaded = loadTokens();
    expect(loaded?.accessToken).toBe("dir-create");
  });

  it("computes platform default path for win32", () => {
    process.env["APPDATA"] = "C:/Users/test/AppData/Roaming";
    vi.spyOn(process, "platform", "get").mockReturnValue("win32");

    const dir = getDefaultStoreDir();
    expect(dir).toContain("onenote-mcp");
    expect(dir).toContain("AppData");
  });

  it("computes platform default path for win32 without APPDATA", () => {
    delete process.env["APPDATA"];
    vi.spyOn(process, "platform", "get").mockReturnValue("win32");

    const dir = getDefaultStoreDir();
    expect(dir).toContain("AppData");
    expect(dir).toContain("Roaming");
    expect(dir).toContain("onenote-mcp");
  });

  it("computes platform default path for darwin", () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("darwin");

    const dir = getDefaultStoreDir();
    expect(dir).toContain("Library");
    expect(dir).toContain("onenote-mcp");
  });

  it("computes platform default path for linux", () => {
    process.env["XDG_CONFIG_HOME"] = "/tmp/xdg-config";
    vi.spyOn(process, "platform", "get").mockReturnValue("linux");

    const dir = getDefaultStoreDir();
    expect(dir).toContain("xdg-config");
    expect(dir).toContain("onenote-mcp");
  });

  it("computes platform default path for linux when XDG_CONFIG_HOME is unset", () => {
    delete process.env["XDG_CONFIG_HOME"];
    vi.spyOn(process, "platform", "get").mockReturnValue("linux");

    const dir = getDefaultStoreDir();
    expect(dir).toContain(".config");
    expect(dir).toContain("onenote-mcp");
  });

  it("loadTokens returns undefined when file does not exist", () => {
    process.env["ONENOTE_TOKEN_STORE_PATH"] =
      `${process.cwd()}/.nonexistent-token-store.json`;

    const loaded = loadTokens();
    expect(loaded).toBeUndefined();
  });

  it("getTokenStorePath returns default path when env is not set", () => {
    delete process.env["ONENOTE_TOKEN_STORE_PATH"];
    const path = getTokenStorePath();
    expect(path).toContain("tokens.json");
  });

  it("saveTokens creates directory when it does not exist", () => {
    process.env["ONENOTE_TOKEN_STORE_PATH"] =
      `${process.cwd()}/.tmp-create-dir-test/tokens.json`;

    // This will actually create the directory
    saveTokens({ accessToken: "dir-create-test" });

    const loaded = loadTokens();
    expect(loaded?.accessToken).toBe("dir-create-test");
  });
});
