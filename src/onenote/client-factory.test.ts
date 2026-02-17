import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { OneNoteClient } from "./client.js";
import { OneNoteClientError } from "./types.js";

vi.mock("./client.js", () => ({
  OneNoteClient: class OneNoteClient {
    readonly kind = "onenote";
  },
  createClientFromAuth: vi.fn(),
}));

import { getOneNoteClient, getOneNoteClientOrThrow } from "./client-factory.js";
import { createClientFromAuth } from "./client.js";

describe("getOneNoteClient", () => {
  let extra: Parameters<typeof getOneNoteClient>[0];

  beforeEach(() => {
    vi.clearAllMocks();
    extra = {} as Parameters<typeof getOneNoteClient>[0];
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("returns client when auth succeeds", async () => {
    const client = {} as OneNoteClient;
    vi.mocked(createClientFromAuth).mockResolvedValue({
      success: true,
      data: client,
    });

    const result = await getOneNoteClient(extra);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.client).toBe(client);
    }
  });

  it("returns error message when auth fails", async () => {
    vi.mocked(createClientFromAuth).mockResolvedValue({
      success: false,
      error: new OneNoteClientError("auth failed", "UNKNOWN"),
    });

    const result = await getOneNoteClient(extra);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("auth failed");
    }
  });

  it("uses oneNoteToken from authInfo.extra in HTTP mode", async () => {
    const httpExtra = {
      authInfo: {
        extra: {
          oneNoteToken: "ms-token-from-proxy",
        },
      },
    } as unknown as Parameters<typeof getOneNoteClient>[0];

    const result = await getOneNoteClient(httpExtra);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.client).toBeDefined();
    }
    // Should NOT call createClientFromAuth (uses direct token instead)
    expect(createClientFromAuth).not.toHaveBeenCalled();
  });
});

describe("getOneNoteClientOrThrow", () => {
  it("returns the client when auth succeeds", async () => {
    const client = {} as OneNoteClient;
    vi.mocked(createClientFromAuth).mockResolvedValue({
      success: true,
      data: client,
    });

    const result = await getOneNoteClientOrThrow(
      {} as Parameters<typeof getOneNoteClient>[0]
    );

    expect(result).toBe(client);
  });

  it("throws when getOneNoteClient fails", async () => {
    vi.mocked(createClientFromAuth).mockResolvedValue({
      success: false,
      error: new OneNoteClientError("auth failed", "UNKNOWN"),
    });

    await expect(
      getOneNoteClientOrThrow({} as Parameters<typeof getOneNoteClient>[0])
    ).rejects.toThrow("auth failed");
  });
});
