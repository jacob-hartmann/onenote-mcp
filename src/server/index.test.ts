import { describe, it, expect } from "vitest";

describe("server/index barrel exports", () => {
  it("exports getHttpServerConfig", async () => {
    const mod = await import("./index.js");
    expect(mod.getHttpServerConfig).toBeTypeOf("function");
  });

  it("exports startHttpServer", async () => {
    const mod = await import("./index.js");
    expect(mod.startHttpServer).toBeTypeOf("function");
  });

  it("exports OneNoteProxyOAuthProvider", async () => {
    const mod = await import("./index.js");
    expect(mod.OneNoteProxyOAuthProvider).toBeTypeOf("function");
  });

  it("exports getServerTokenStore", async () => {
    const mod = await import("./index.js");
    expect(mod.getServerTokenStore).toBeTypeOf("function");
  });
});
