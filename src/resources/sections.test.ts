import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSectionResources } from "./sections.js";

vi.mock("../onenote/client-factory.js", () => ({
  getOneNoteClientOrThrow: vi.fn(),
}));

import { getOneNoteClientOrThrow } from "../onenote/client-factory.js";

describe("registerSectionResources", () => {
  let mockRegisterResource: ReturnType<typeof vi.fn>;
  let server: McpServer;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRegisterResource = vi.fn();
    server = { registerResource: mockRegisterResource } as unknown as McpServer;
  });

  it("registers 1 resource", () => {
    registerSectionResources(server);
    expect(mockRegisterResource).toHaveBeenCalledTimes(1);
  });

  it("registers the notebook-sections resource", () => {
    registerSectionResources(server);
    expect(mockRegisterResource.mock.calls[0]?.[0]).toBe("notebook-sections");
  });

  describe("notebook-sections callback", () => {
    it("returns sections as JSON on success", async () => {
      registerSectionResources(server);
      const callback = mockRegisterResource.mock.calls[0]?.[3] as (
        uri: URL,
        variables: Record<string, string>,
        extra: unknown
      ) => Promise<unknown>;

      const mockClient = {
        request: vi.fn().mockResolvedValue({
          success: true,
          data: {
            value: [
              { id: "sec1", displayName: "Section 1" },
              { id: "sec2", displayName: "Section 2" },
            ],
          },
        }),
      };
      vi.mocked(getOneNoteClientOrThrow).mockResolvedValue(mockClient as never);

      const uri = new URL("onenote://notebooks/nb1/sections");
      const result = (await callback(uri, { notebookId: "nb1" }, {})) as {
        contents: { uri: string; mimeType: string; text: string }[];
      };

      expect(result.contents).toHaveLength(1);
      expect(result.contents[0]?.mimeType).toBe("application/json");
      const parsed = JSON.parse(result.contents[0]?.text ?? "") as unknown[];
      expect(parsed).toHaveLength(2);
    });

    it("calls the correct API endpoint with notebookId", async () => {
      registerSectionResources(server);
      const callback = mockRegisterResource.mock.calls[0]?.[3] as (
        uri: URL,
        variables: Record<string, string>,
        extra: unknown
      ) => Promise<unknown>;

      const mockClient = {
        request: vi.fn().mockResolvedValue({
          success: true,
          data: { value: [] },
        }),
      };
      vi.mocked(getOneNoteClientOrThrow).mockResolvedValue(mockClient as never);

      const uri = new URL("onenote://notebooks/nb-xyz/sections");
      await callback(uri, { notebookId: "nb-xyz" }, {});

      expect(mockClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "/me/onenote/notebooks/nb-xyz/sections",
        })
      );
    });

    it("throws on API error", async () => {
      registerSectionResources(server);
      const callback = mockRegisterResource.mock.calls[0]?.[3] as (
        uri: URL,
        variables: Record<string, string>,
        extra: unknown
      ) => Promise<unknown>;

      const mockClient = {
        request: vi.fn().mockResolvedValue({
          success: false,
          error: { message: "Forbidden" },
        }),
      };
      vi.mocked(getOneNoteClientOrThrow).mockResolvedValue(mockClient as never);

      const uri = new URL("onenote://notebooks/nb1/sections");
      await expect(callback(uri, { notebookId: "nb1" }, {})).rejects.toThrow(
        "Forbidden"
      );
    });
  });
});
