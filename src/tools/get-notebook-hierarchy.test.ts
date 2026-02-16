import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getOneNoteClientOrThrow } from "../onenote/client-factory.js";
import { OneNoteClientError } from "../onenote/types.js";
import { registerGetNotebookHierarchy } from "./get-notebook-hierarchy.js";

vi.mock("../onenote/client-factory.js", () => ({
  getOneNoteClientOrThrow: vi.fn(),
}));

describe("get-notebook-hierarchy tool", () => {
  const mockRegisterTool = vi.fn();
  const server = { registerTool: mockRegisterTool } as unknown as McpServer;
  const mockExtra = {} as Parameters<typeof getOneNoteClientOrThrow>[0];

  beforeEach(() => {
    vi.clearAllMocks();
    registerGetNotebookHierarchy(server);
  });

  it("registers with the name 'get-notebook-hierarchy'", () => {
    expect(mockRegisterTool).toHaveBeenCalledTimes(1);
    expect(mockRegisterTool.mock.calls[0]![0]).toBe("get-notebook-hierarchy");
  });

  it("returns hierarchy data on success", async () => {
    const notebooks = [
      {
        id: "nb-1",
        displayName: "Notebook 1",
        sections: [{ id: "sec-1", displayName: "Section 1" }],
        sectionGroups: [],
      },
    ];
    const mockRequest = vi.fn().mockResolvedValue({
      success: true,
      data: { value: notebooks },
    });
    vi.mocked(getOneNoteClientOrThrow).mockResolvedValue({
      request: mockRequest,
      requestRaw: vi.fn(),
      requestHtmlBody: vi.fn(),
    } as never);

    const callback = mockRegisterTool.mock.calls[0]![2] as Function;
    const result = await callback({}, mockExtra);

    const callArgs = mockRequest.mock.calls[0]![0] as {
      path: string;
      params: Record<string, string>;
    };
    expect(callArgs.path).toBe("/me/onenote/notebooks");
    expect(callArgs.params["$select"]).toBe(
      "id,displayName,isDefault,isShared,userRole,self"
    );
    expect(callArgs.params["$expand"]).toContain("sections");
    expect(callArgs.params["$expand"]).toContain("sectionGroups");

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toEqual(notebooks);
  });

  it("recursively expands nested section groups", async () => {
    const notebooks = [
      {
        id: "nb-1",
        displayName: "Notebook 1",
        sections: [],
        sectionGroups: [
          {
            id: "sg-1",
            displayName: "Group 1",
            sections: [{ id: "sec-1", displayName: "Section 1" }],
            sectionGroups: [
              {
                // Stub: no sections expanded (would need follow-up call)
                id: "sg-nested",
                displayName: "Nested Group",
              },
            ],
          },
        ],
      },
    ];

    const expandedGroup = {
      id: "sg-1",
      displayName: "Group 1",
      sections: [{ id: "sec-1", displayName: "Section 1" }],
      sectionGroups: [
        {
          id: "sg-nested",
          displayName: "Nested Group",
          sections: [{ id: "sec-deep", displayName: "Deep Section" }],
          sectionGroups: [],
        },
      ],
    };

    const mockRequest = vi
      .fn()
      .mockResolvedValueOnce({
        success: true,
        data: { value: notebooks },
      })
      .mockResolvedValueOnce({
        success: true,
        data: expandedGroup,
      });

    vi.mocked(getOneNoteClientOrThrow).mockResolvedValue({
      request: mockRequest,
      requestRaw: vi.fn(),
      requestHtmlBody: vi.fn(),
    } as never);

    const callback = mockRegisterTool.mock.calls[0]![2] as Function;
    const result = await callback({}, mockExtra);

    // First call: fetch notebooks with 2-level expand
    expect(mockRequest).toHaveBeenCalledTimes(2);
    expect(mockRequest.mock.calls[0]![0].path).toBe("/me/onenote/notebooks");

    // Second call: expand the section group with stub children
    expect(mockRequest.mock.calls[1]![0].path).toBe(
      "/me/onenote/sectionGroups/sg-1"
    );

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed[0].sectionGroups[0].sectionGroups[0].sections[0].id).toBe(
      "sec-deep"
    );
  });

  it("returns error on API failure", async () => {
    const mockRequest = vi.fn().mockResolvedValue({
      success: false,
      error: new OneNoteClientError("Rate limited", "RATE_LIMITED", 429),
    });
    vi.mocked(getOneNoteClientOrThrow).mockResolvedValue({
      request: mockRequest,
      requestRaw: vi.fn(),
      requestHtmlBody: vi.fn(),
    } as never);

    const callback = mockRegisterTool.mock.calls[0]![2] as Function;
    const result = await callback({}, mockExtra);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("RATE_LIMITED");
  });
});
