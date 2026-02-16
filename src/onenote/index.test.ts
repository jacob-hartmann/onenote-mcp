import { describe, it, expect } from "vitest";
import * as oneNoteModule from "./index.js";

describe("OneNote module exports", () => {
  it("exports client constructors", () => {
    expect(oneNoteModule.OneNoteClient).toBeDefined();
    expect(oneNoteModule.createClientFromEnv).toBeDefined();
    expect(oneNoteModule.createClientFromAuth).toBeDefined();
  });

  it("exports client factory functions", () => {
    expect(oneNoteModule.getOneNoteClient).toBeDefined();
    expect(oneNoteModule.getOneNoteClientOrThrow).toBeDefined();
  });

  it("exports auth and oauth helpers", () => {
    expect(oneNoteModule.getOneNoteAccessToken).toBeDefined();
    expect(oneNoteModule.buildAuthorizeUrl).toBeDefined();
    expect(oneNoteModule.exchangeCodeForToken).toBeDefined();
    expect(oneNoteModule.refreshAccessToken).toBeDefined();
    expect(oneNoteModule.isTokenExpired).toBeDefined();
    expect(oneNoteModule.generateState).toBeDefined();
  });

  it("exports token store helpers", () => {
    expect(oneNoteModule.loadTokens).toBeDefined();
    expect(oneNoteModule.saveTokens).toBeDefined();
    expect(oneNoteModule.clearTokens).toBeDefined();
    expect(oneNoteModule.getTokenStorePath).toBeDefined();
  });

  it("exports core error classes", () => {
    expect(oneNoteModule.OneNoteClientError).toBeDefined();
    expect(oneNoteModule.OneNoteAuthError).toBeDefined();
    expect(oneNoteModule.OneNoteOAuthError).toBeDefined();
  });
});
