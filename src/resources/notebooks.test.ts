import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerNotebookResources } from "./notebooks.js";

vi.mock("../onenote/client-factory.js", () => ({
  getOneNoteClientOrThrow: vi.fn(),
}));

import { getOneNoteClientOrThrow } from "../onenote/client-factory.js";

describe("registerNotebookResources", () => {
  let mockRegisterResource: ReturnType<typeof vi.fn>;
  let server: McpServer;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRegisterResource = vi.fn();
    server = { registerResource: mockRegisterResource } as unknown as McpServer;
  });

  it("registers 2 resources", () => {
    registerNotebookResources(server);
    expect(mockRegisterResource).toHaveBeenCalledTimes(2);
  });

  it("registers the notebooks-list resource", () => {
    registerNotebookResources(server);
    expect(mockRegisterResource.mock.calls[0]?.[0]).toBe("notebooks-list");
  });

  it("registers the notebook template resource", () => {
    registerNotebookResources(server);
    expect(mockRegisterResource.mock.calls[1]?.[0]).toBe("notebook");
  });

  describe("notebooks-list callback", () => {
    it("returns notebooks as JSON on success", async () => {
      registerNotebookResources(server);
      const callback = mockRegisterResource.mock.calls[0]?.[3] as (
        uri: URL,
        extra: unknown
      ) => Promise<unknown>;

      const mockClient = {
        request: vi.fn().mockResolvedValue({
          success: true,
          data: {
            value: [
              { id: "nb1", displayName: "Notebook 1" },
              { id: "nb2", displayName: "Notebook 2" },
            ],
          },
        }),
      };
      vi.mocked(getOneNoteClientOrThrow).mockResolvedValue(mockClient as never);

      const uri = new URL("onenote://notebooks");
      const result = (await callback(uri, {})) as {
        contents: { uri: string; mimeType: string; text: string }[];
      };

      expect(result.contents).toHaveLength(1);
      expect(result.contents[0]?.mimeType).toBe("application/json");
      const parsed = JSON.parse(result.contents[0]?.text ?? "") as unknown[];
      expect(parsed).toHaveLength(2);
    });

    it("throws on API error", async () => {
      registerNotebookResources(server);
      const callback = mockRegisterResource.mock.calls[0]?.[3] as (
        uri: URL,
        extra: unknown
      ) => Promise<unknown>;

      const mockClient = {
        request: vi.fn().mockResolvedValue({
          success: false,
          error: { message: "Unauthorized" },
        }),
      };
      vi.mocked(getOneNoteClientOrThrow).mockResolvedValue(mockClient as never);

      const uri = new URL("onenote://notebooks");
      await expect(callback(uri, {})).rejects.toThrow("Unauthorized");
    });
  });

  describe("notebook template callback", () => {
    it("returns a specific notebook on success", async () => {
      registerNotebookResources(server);
      const callback = mockRegisterResource.mock.calls[1]?.[3] as (
        uri: URL,
        variables: Record<string, string>,
        extra: unknown
      ) => Promise<unknown>;

      const mockClient = {
        request: vi.fn().mockResolvedValue({
          success: true,
          data: {
            id: "nb1",
            displayName: "My Notebook",
            sections: [],
            sectionGroups: [],
          },
        }),
      };
      vi.mocked(getOneNoteClientOrThrow).mockResolvedValue(mockClient as never);

      const uri = new URL("onenote://notebooks/nb1");
      const result = (await callback(uri, { notebookId: "nb1" }, {})) as {
        contents: { uri: string; mimeType: string; text: string }[];
      };

      expect(result.contents).toHaveLength(1);
      expect(result.contents[0]?.mimeType).toBe("application/json");
      const parsed = JSON.parse(result.contents[0]?.text ?? "") as {
        id: string;
      };
      expect(parsed.id).toBe("nb1");
    });

    it("calls the correct API endpoint with notebookId", async () => {
      registerNotebookResources(server);
      const callback = mockRegisterResource.mock.calls[1]?.[3] as (
        uri: URL,
        variables: Record<string, string>,
        extra: unknown
      ) => Promise<unknown>;

      const mockClient = {
        request: vi.fn().mockResolvedValue({
          success: true,
          data: { id: "nb-abc" },
        }),
      };
      vi.mocked(getOneNoteClientOrThrow).mockResolvedValue(mockClient as never);

      const uri = new URL("onenote://notebooks/nb-abc");
      await callback(uri, { notebookId: "nb-abc" }, {});

      expect(mockClient.request).toHaveBeenCalledWith({
        path: "/me/onenote/notebooks/nb-abc",
        params: { $expand: "sections,sectionGroups" },
      });
    });

    it("throws on API error", async () => {
      registerNotebookResources(server);
      const callback = mockRegisterResource.mock.calls[1]?.[3] as (
        uri: URL,
        variables: Record<string, string>,
        extra: unknown
      ) => Promise<unknown>;

      const mockClient = {
        request: vi.fn().mockResolvedValue({
          success: false,
          error: { message: "Not found" },
        }),
      };
      vi.mocked(getOneNoteClientOrThrow).mockResolvedValue(mockClient as never);

      const uri = new URL("onenote://notebooks/nb1");
      await expect(callback(uri, { notebookId: "nb1" }, {})).rejects.toThrow(
        "Not found"
      );
    });
  });
});
