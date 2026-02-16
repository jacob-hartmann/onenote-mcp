import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchPage, fetchAllPages } from "./pagination.js";
import type { OneNoteClient } from "./client.js";

describe("fetchPage", () => {
  let mockClient: { request: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = { request: vi.fn() };
  });

  it("calls client.request with correct path", async () => {
    mockClient.request.mockResolvedValue({
      success: true,
      data: { value: [] },
    });

    await fetchPage(
      mockClient as unknown as OneNoteClient,
      "/me/onenote/pages"
    );

    expect(mockClient.request).toHaveBeenCalledWith({
      path: "/me/onenote/pages",
    });
  });

  it("passes params to client.request", async () => {
    mockClient.request.mockResolvedValue({
      success: true,
      data: { value: [] },
    });

    await fetchPage(
      mockClient as unknown as OneNoteClient,
      "/me/onenote/pages",
      { $top: "10", $select: "id,title" }
    );

    expect(mockClient.request).toHaveBeenCalledWith({
      path: "/me/onenote/pages",
      params: { $top: "10", $select: "id,title" },
    });
  });

  it("does not include params key when params is undefined", async () => {
    mockClient.request.mockResolvedValue({
      success: true,
      data: { value: [] },
    });

    await fetchPage(
      mockClient as unknown as OneNoteClient,
      "/me/onenote/pages"
    );

    const callArg = mockClient.request.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(callArg).not.toHaveProperty("params");
  });

  it("returns the client result directly", async () => {
    const expectedResult = {
      success: true as const,
      data: { value: [{ id: "1" }] },
    };
    mockClient.request.mockResolvedValue(expectedResult);

    const result = await fetchPage<{ id: string }>(
      mockClient as unknown as OneNoteClient,
      "/me/onenote/pages"
    );

    expect(result).toEqual(expectedResult);
  });
});

describe("fetchAllPages", () => {
  let mockClient: { request: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = { request: vi.fn() };
  });

  it("returns all items from a single page", async () => {
    mockClient.request.mockResolvedValue({
      success: true,
      data: {
        value: [{ id: "1" }, { id: "2" }],
      },
    });

    const result = await fetchAllPages<{ id: string }>(
      mockClient as unknown as OneNoteClient,
      "/me/onenote/pages"
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(2);
      expect(result.data[0]?.id).toBe("1");
      expect(result.data[1]?.id).toBe("2");
    }
  });

  it("follows @odata.nextLink across multiple pages", async () => {
    mockClient.request
      .mockResolvedValueOnce({
        success: true,
        data: {
          value: [{ id: "1" }],
          "@odata.nextLink":
            "https://graph.microsoft.com/v1.0/me/onenote/pages?$skip=1",
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          value: [{ id: "2" }],
          "@odata.nextLink":
            "https://graph.microsoft.com/v1.0/me/onenote/pages?$skip=2",
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          value: [{ id: "3" }],
        },
      });

    const result = await fetchAllPages<{ id: string }>(
      mockClient as unknown as OneNoteClient,
      "/me/onenote/pages"
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(3);
      expect(result.data.map((d) => d.id)).toEqual(["1", "2", "3"]);
    }
    expect(mockClient.request).toHaveBeenCalledTimes(3);
  });

  it("stops when no nextLink is present", async () => {
    mockClient.request.mockResolvedValue({
      success: true,
      data: {
        value: [{ id: "1" }],
      },
    });

    await fetchAllPages<{ id: string }>(
      mockClient as unknown as OneNoteClient,
      "/me/onenote/pages"
    );

    expect(mockClient.request).toHaveBeenCalledTimes(1);
  });

  it("respects maxPages safety limit", async () => {
    // Always return a nextLink so pagination would continue forever
    mockClient.request.mockImplementation(() =>
      Promise.resolve({
        success: true,
        data: {
          value: [{ id: "item" }],
          "@odata.nextLink":
            "https://graph.microsoft.com/v1.0/me/onenote/pages?$skip=1",
        },
      })
    );

    const result = await fetchAllPages<{ id: string }>(
      mockClient as unknown as OneNoteClient,
      "/me/onenote/pages",
      undefined,
      3
    );

    expect(result.success).toBe(true);
    if (result.success) {
      // 1 initial page + 3 paginated pages = 4 total calls,
      // but maxPages limits to 3 iterations in the while loop:
      // iteration 0: fetch page 0, see nextLink, pageCount becomes 1
      // iteration 1: fetch page 1, see nextLink, pageCount becomes 2
      // iteration 2: fetch page 2, see nextLink, pageCount becomes 3
      // loop exits because pageCount (3) >= maxPages (3)
      expect(result.data.length).toBeLessThanOrEqual(4);
    }
    expect(mockClient.request.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it("returns error if first page fails", async () => {
    mockClient.request.mockResolvedValue({
      success: false,
      error: { message: "Unauthorized", code: "UNAUTHORIZED" },
    });

    const result = await fetchAllPages<{ id: string }>(
      mockClient as unknown as OneNoteClient,
      "/me/onenote/pages"
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe("Unauthorized");
    }
  });

  it("returns error if a subsequent page fails", async () => {
    mockClient.request
      .mockResolvedValueOnce({
        success: true,
        data: {
          value: [{ id: "1" }],
          "@odata.nextLink":
            "https://graph.microsoft.com/v1.0/me/onenote/pages?$skip=1",
        },
      })
      .mockResolvedValueOnce({
        success: false,
        error: { message: "Server error", code: "SERVER_ERROR" },
      });

    const result = await fetchAllPages<{ id: string }>(
      mockClient as unknown as OneNoteClient,
      "/me/onenote/pages"
    );

    expect(result.success).toBe(false);
  });

  it("parses nextLink URL to extract path and params", async () => {
    mockClient.request
      .mockResolvedValueOnce({
        success: true,
        data: {
          value: [{ id: "1" }],
          "@odata.nextLink":
            "https://graph.microsoft.com/v1.0/me/onenote/sections/sec1/pages?$skip=10&$top=10",
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          value: [{ id: "2" }],
        },
      });

    await fetchAllPages<{ id: string }>(
      mockClient as unknown as OneNoteClient,
      "/me/onenote/sections/sec1/pages",
      { $top: "10" }
    );

    const secondCall = mockClient.request.mock.calls[1]?.[0] as {
      path: string;
      params?: Record<string, string>;
    };
    expect(secondCall.path).toBe("/me/onenote/sections/sec1/pages");
    expect(secondCall.params).toEqual({ $skip: "10", $top: "10" });
  });
});
