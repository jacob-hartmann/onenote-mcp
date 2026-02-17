import { describe, it, expect } from "vitest";
import { sanitizeId } from "./validation.js";

describe("sanitizeId", () => {
  it("encodes a normal ID string", () => {
    const result = sanitizeId("abc-123", "testParam");
    expect(result).toBe("abc-123");
  });

  it("throws for empty string", () => {
    expect(() => sanitizeId("", "myId")).toThrow("myId must not be empty");
  });

  it("throws for whitespace-only string", () => {
    expect(() => sanitizeId("   ", "myId")).toThrow("myId must not be empty");
  });

  it("encodes path traversal characters", () => {
    const result = sanitizeId("../../../etc/passwd", "notebookId");
    expect(result).not.toContain("/");
    expect(result).toBe("..%2F..%2F..%2Fetc%2Fpasswd");
  });

  it("encodes query injection characters", () => {
    const result = sanitizeId("id?$select=secret", "pageId");
    expect(result).not.toContain("?");
    expect(result).toBe("id%3F%24select%3Dsecret");
  });

  it("encodes fragment injection characters", () => {
    const result = sanitizeId("id#fragment", "sectionId");
    expect(result).not.toContain("#");
    expect(result).toBe("id%23fragment");
  });

  it("includes paramName in error message", () => {
    expect(() => sanitizeId("", "notebookId")).toThrow(
      "notebookId must not be empty"
    );
  });

  it("handles base64-like IDs (typical Graph API IDs)", () => {
    const id = "0-abc123DEF456ghi789jkl_mnopqrstuvwxyz!012";
    const result = sanitizeId(id, "id");
    expect(result).toBe("0-abc123DEF456ghi789jkl_mnopqrstuvwxyz!012");
  });
});
