import { describe, it, expect } from "vitest";
import {
  isCorsAllowedPath,
  matchesAllowedPathBoundary,
  getAllowedCorsPaths,
} from "./cors.js";

describe("getAllowedCorsPaths", () => {
  it("returns a non-empty array of allowed paths", () => {
    const paths = getAllowedCorsPaths();
    expect(paths.length).toBeGreaterThan(0);
    expect(paths).toContain("/authorize");
    expect(paths).toContain("/token");
    expect(paths).toContain("/register");
    expect(paths).toContain("/oauth/callback");
    expect(paths).toContain("/.well-known/oauth-authorization-server");
    expect(paths).toContain("/.well-known/oauth-protected-resource");
  });
});

describe("matchesAllowedPathBoundary", () => {
  it("matches exact path", () => {
    expect(matchesAllowedPathBoundary("/authorize", "/authorize")).toBe(true);
  });

  it("matches subpath with trailing slash", () => {
    expect(
      matchesAllowedPathBoundary("/authorize/callback", "/authorize")
    ).toBe(true);
  });

  it("does not match prefix bypass (e.g. /authorize-admin)", () => {
    expect(matchesAllowedPathBoundary("/authorize-admin", "/authorize")).toBe(
      false
    );
  });

  it("does not match unrelated paths", () => {
    expect(matchesAllowedPathBoundary("/other", "/authorize")).toBe(false);
  });

  it("matches when allowed path has trailing slash", () => {
    expect(matchesAllowedPathBoundary("/foo/bar", "/foo/")).toBe(true);
  });

  it("does not match when request path is a prefix of allowed path", () => {
    expect(matchesAllowedPathBoundary("/auth", "/authorize")).toBe(false);
  });
});

describe("isCorsAllowedPath", () => {
  it('allows exact "/authorize"', () => {
    expect(isCorsAllowedPath("/authorize")).toBe(true);
  });

  it('allows subpath "/authorize/callback"', () => {
    expect(isCorsAllowedPath("/authorize/callback")).toBe(true);
  });

  it('blocks prefix bypass "/authorize-admin"', () => {
    expect(isCorsAllowedPath("/authorize-admin")).toBe(false);
  });

  it('blocks "/mcp"', () => {
    expect(isCorsAllowedPath("/mcp")).toBe(false);
  });

  it('allows "/.well-known/oauth-authorization-server"', () => {
    expect(isCorsAllowedPath("/.well-known/oauth-authorization-server")).toBe(
      true
    );
  });

  it('allows "/.well-known/oauth-protected-resource"', () => {
    expect(isCorsAllowedPath("/.well-known/oauth-protected-resource")).toBe(
      true
    );
  });

  it('allows "/oauth/callback"', () => {
    expect(isCorsAllowedPath("/oauth/callback")).toBe(true);
  });

  it('allows "/token"', () => {
    expect(isCorsAllowedPath("/token")).toBe(true);
  });

  it('allows "/register"', () => {
    expect(isCorsAllowedPath("/register")).toBe(true);
  });

  it("blocks root path", () => {
    expect(isCorsAllowedPath("/")).toBe(false);
  });

  it("blocks unrelated paths", () => {
    expect(isCorsAllowedPath("/api/data")).toBe(false);
  });

  it('blocks "/mcp/sse"', () => {
    expect(isCorsAllowedPath("/mcp/sse")).toBe(false);
  });

  it('allows subpath of "/token"', () => {
    expect(isCorsAllowedPath("/token/revoke")).toBe(true);
  });

  it('blocks "/tokenize" (prefix bypass on /token)', () => {
    expect(isCorsAllowedPath("/tokenize")).toBe(false);
  });
});
