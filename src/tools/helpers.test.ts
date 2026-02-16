import { describe, it, expect } from "vitest";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { OneNoteClientError } from "../onenote/types.js";
import type { OneNoteResult } from "../onenote/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  toolJsonSuccess,
  toolTextSuccess,
  toolError,
  handleApiResult,
  mapOneNoteError,
} from "./helpers.js";

/** Extract the text from the first content item (assumes text type). */
function firstText(result: CallToolResult): string {
  const item = result.content[0];
  if (item?.type !== "text") {
    throw new Error("Expected text content");
  }
  return item.text;
}

describe("toolJsonSuccess", () => {
  it("returns JSON-serialized data in text content", () => {
    const data = { id: "123", name: "Test" };
    const result = toolJsonSuccess(data);

    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toEqual({
      type: "text",
      text: JSON.stringify(data, null, 2),
    });
    expect(result.isError).toBeUndefined();
  });

  it("handles arrays", () => {
    const data = [1, 2, 3];
    const result = toolJsonSuccess(data);

    expect(result.content[0]).toEqual({
      type: "text",
      text: JSON.stringify(data, null, 2),
    });
  });

  it("handles null", () => {
    const result = toolJsonSuccess(null);

    expect(result.content[0]).toEqual({
      type: "text",
      text: "null",
    });
  });
});

describe("toolTextSuccess", () => {
  it("returns plain text content", () => {
    const result = toolTextSuccess("Hello world");

    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toEqual({
      type: "text",
      text: "Hello world",
    });
    expect(result.isError).toBeUndefined();
  });

  it("handles empty string", () => {
    const result = toolTextSuccess("");

    expect(result.content[0]).toEqual({
      type: "text",
      text: "",
    });
  });
});

describe("toolError", () => {
  it("returns error content with isError flag", () => {
    const result = toolError("Something went wrong");

    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toEqual({
      type: "text",
      text: "Something went wrong",
    });
    expect(result.isError).toBe(true);
  });
});

describe("handleApiResult", () => {
  it("returns JSON success with default transform", () => {
    const apiResult: OneNoteResult<{ id: string }> = {
      success: true,
      data: { id: "abc" },
    };

    const result = handleApiResult(apiResult);

    expect(result.content[0]).toEqual({
      type: "text",
      text: JSON.stringify({ id: "abc" }, null, 2),
    });
    expect(result.isError).toBeUndefined();
  });

  it("uses custom transform when provided", () => {
    const apiResult: OneNoteResult<{ items: string[] }> = {
      success: true,
      data: { items: ["a", "b"] },
    };

    const result = handleApiResult(apiResult, (data) =>
      toolTextSuccess(data.items.join(", "))
    );

    expect(result.content[0]).toEqual({
      type: "text",
      text: "a, b",
    });
  });

  it("maps errors for failed results", () => {
    const apiResult: OneNoteResult<unknown> = {
      success: false,
      error: new OneNoteClientError("Not found", "NOT_FOUND", 404),
    };

    const result = handleApiResult(apiResult);

    expect(result.isError).toBe(true);
    expect(firstText(result)).toContain("NOT_FOUND");
    expect(firstText(result)).toContain("404");
  });
});

describe("mapOneNoteError", () => {
  it("throws McpError for MISSING_TOKEN", () => {
    const error = new OneNoteClientError("No token", "MISSING_TOKEN");

    expect(() => mapOneNoteError(error)).toThrow(McpError);

    try {
      mapOneNoteError(error);
    } catch (e) {
      expect(e).toBeInstanceOf(McpError);
      const mcpError = e as McpError;
      expect(mcpError.code).toBe(ErrorCode.InternalError);
      expect(mcpError.message).toContain("Authentication failed");
    }
  });

  it("throws McpError for UNAUTHORIZED", () => {
    const error = new OneNoteClientError("Invalid token", "UNAUTHORIZED", 401);

    expect(() => mapOneNoteError(error)).toThrow(McpError);

    try {
      mapOneNoteError(error);
    } catch (e) {
      expect(e).toBeInstanceOf(McpError);
      const mcpError = e as McpError;
      expect(mcpError.code).toBe(ErrorCode.InternalError);
      expect(mcpError.message).toContain("Authentication failed");
    }
  });

  it("returns toolError for NOT_FOUND", () => {
    const error = new OneNoteClientError("Not found", "NOT_FOUND", 404);

    const result = mapOneNoteError(error);

    expect(result.isError).toBe(true);
    expect(firstText(result)).toContain("NOT_FOUND");
    expect(firstText(result)).toContain("HTTP 404");
  });

  it("returns toolError for RATE_LIMITED", () => {
    const error = new OneNoteClientError(
      "Too many requests",
      "RATE_LIMITED",
      429
    );

    const result = mapOneNoteError(error);

    expect(result.isError).toBe(true);
    expect(firstText(result)).toContain("RATE_LIMITED");
    expect(firstText(result)).toContain("HTTP 429");
  });

  it("returns toolError for NETWORK_ERROR without statusCode", () => {
    const error = new OneNoteClientError("Connection refused", "NETWORK_ERROR");

    const result = mapOneNoteError(error);

    expect(result.isError).toBe(true);
    expect(firstText(result)).toContain("NETWORK_ERROR");
    expect(firstText(result)).not.toContain("HTTP");
  });

  it("returns toolError for SERVER_ERROR", () => {
    const error = new OneNoteClientError("Internal error", "SERVER_ERROR", 500);

    const result = mapOneNoteError(error);

    expect(result.isError).toBe(true);
    expect(firstText(result)).toContain("SERVER_ERROR");
    expect(firstText(result)).toContain("HTTP 500");
  });
});
