import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getOneNoteClientOrThrow } from "../onenote/client-factory.js";
import { OneNoteClientError } from "../onenote/types.js";
import { registerListSectionGroups } from "./list-section-groups.js";

vi.mock("../onenote/client-factory.js", () => ({
  getOneNoteClientOrThrow: vi.fn(),
}));

describe("list-section-groups tool", () => {
  const mockRegisterTool = vi.fn();
  const server = { registerTool: mockRegisterTool } as unknown as McpServer;
  const mockExtra = {} as Parameters<typeof getOneNoteClientOrThrow>[0];

  beforeEach(() => {
    vi.clearAllMocks();
    registerListSectionGroups(server);
  });

  it("registers with the name 'list-section-groups'", () => {
    expect(mockRegisterTool).toHaveBeenCalledTimes(1);
    expect(mockRegisterTool.mock.calls[0]![0]).toBe("list-section-groups");
  });

  it("lists all section groups when no notebookId is provided", async () => {
    const groups = [{ id: "sg-1", displayName: "Group 1" }];
    const mockRequest = vi.fn().mockResolvedValue({
      success: true,
      data: { value: groups },
    });
    vi.mocked(getOneNoteClientOrThrow).mockResolvedValue({
      request: mockRequest,
      requestRaw: vi.fn(),
      requestHtmlBody: vi.fn(),
    } as never);

    const callback = mockRegisterTool.mock.calls[0]![2] as Function;
    const result = await callback({}, mockExtra);

    const callArgs = mockRequest.mock.calls[0]![0] as { path: string };
    expect(callArgs.path).toBe("/me/onenote/sectionGroups");

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toEqual(groups);
  });

  it("lists section groups for a specific notebook", async () => {
    const groups = [{ id: "sg-2", displayName: "Group 2" }];
    const mockRequest = vi.fn().mockResolvedValue({
      success: true,
      data: { value: groups },
    });
    vi.mocked(getOneNoteClientOrThrow).mockResolvedValue({
      request: mockRequest,
      requestRaw: vi.fn(),
      requestHtmlBody: vi.fn(),
    } as never);

    const callback = mockRegisterTool.mock.calls[0]![2] as Function;
    const result = await callback({ notebookId: "nb-1" }, mockExtra);

    const callArgs = mockRequest.mock.calls[0]![0] as { path: string };
    expect(callArgs.path).toBe("/me/onenote/notebooks/nb-1/sectionGroups");

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toEqual(groups);
  });

  it("returns error on API failure", async () => {
    const mockRequest = vi.fn().mockResolvedValue({
      success: false,
      error: new OneNoteClientError("Forbidden", "FORBIDDEN", 403),
    });
    vi.mocked(getOneNoteClientOrThrow).mockResolvedValue({
      request: mockRequest,
      requestRaw: vi.fn(),
      requestHtmlBody: vi.fn(),
    } as never);

    const callback = mockRegisterTool.mock.calls[0]![2] as Function;
    const result = await callback({}, mockExtra);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("FORBIDDEN");
  });
});
