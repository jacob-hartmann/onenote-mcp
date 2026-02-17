import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { sanitizeId, validateMicrosoftUrl } from "./validation.js";

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

describe("validateMicrosoftUrl", () => {
  const originalNodeEnv = process.env["NODE_ENV"];

  beforeEach(() => {
    // Set NODE_ENV to something other than test/development so validation runs
    process.env["NODE_ENV"] = "production";
  });

  afterEach(() => {
    process.env["NODE_ENV"] = originalNodeEnv;
  });

  // -- Valid authority hostnames --

  it("accepts login.microsoftonline.com for authority", () => {
    expect(() => {
      validateMicrosoftUrl("https://login.microsoftonline.com", "authority");
    }).not.toThrow();
  });

  it("accepts login.microsoftonline.us for authority (US Gov)", () => {
    expect(() => {
      validateMicrosoftUrl("https://login.microsoftonline.us", "authority");
    }).not.toThrow();
  });

  it("accepts login.chinacloudapi.cn for authority (China)", () => {
    expect(() => {
      validateMicrosoftUrl("https://login.chinacloudapi.cn", "authority");
    }).not.toThrow();
  });

  it("accepts login.microsoftonline.de for authority (Germany)", () => {
    expect(() => {
      validateMicrosoftUrl("https://login.microsoftonline.de", "authority");
    }).not.toThrow();
  });

  // -- Valid Graph hostnames --

  it("accepts graph.microsoft.com for graph", () => {
    expect(() => {
      validateMicrosoftUrl("https://graph.microsoft.com", "graph");
    }).not.toThrow();
  });

  it("accepts graph.microsoft.us for graph (US Gov)", () => {
    expect(() => {
      validateMicrosoftUrl("https://graph.microsoft.us", "graph");
    }).not.toThrow();
  });

  it("accepts microsoftgraph.chinacloudapi.cn for graph (China)", () => {
    expect(() => {
      validateMicrosoftUrl("https://microsoftgraph.chinacloudapi.cn", "graph");
    }).not.toThrow();
  });

  it("accepts graph.microsoft.de for graph (Germany)", () => {
    expect(() => {
      validateMicrosoftUrl("https://graph.microsoft.de", "graph");
    }).not.toThrow();
  });

  // -- Invalid hostnames --

  it("throws for invalid authority hostname", () => {
    expect(() => {
      validateMicrosoftUrl("https://evil.example.com", "authority");
    }).toThrow("not in the allowed list");
  });

  it("throws for invalid graph hostname", () => {
    expect(() => {
      validateMicrosoftUrl("https://evil.example.com", "graph");
    }).toThrow("not in the allowed list");
  });

  it("includes the hostname in the error message for authority", () => {
    expect(() => {
      validateMicrosoftUrl("https://evil.example.com", "authority");
    }).toThrow("evil.example.com");
  });

  it("includes the hostname in the error message for graph", () => {
    expect(() => {
      validateMicrosoftUrl("https://evil.example.com", "graph");
    }).toThrow("evil.example.com");
  });

  // -- Invalid URL format --

  it("throws for completely invalid URL format", () => {
    expect(() => {
      validateMicrosoftUrl("not-a-url", "authority");
    }).toThrow("Invalid authority base URL");
  });

  it("throws for invalid graph URL format", () => {
    expect(() => {
      validateMicrosoftUrl(":::invalid", "graph");
    }).toThrow("Invalid graph base URL");
  });

  // -- NODE_ENV bypass --

  it("bypasses validation when NODE_ENV is development", () => {
    process.env["NODE_ENV"] = "development";
    expect(() => {
      validateMicrosoftUrl("https://evil.example.com", "authority");
    }).not.toThrow();
  });

  it("bypasses validation when NODE_ENV is test", () => {
    process.env["NODE_ENV"] = "test";
    expect(() => {
      validateMicrosoftUrl("https://evil.example.com", "graph");
    }).not.toThrow();
  });

  // -- Re-throw path --

  it("re-throws the 'not in the allowed list' error without wrapping it", () => {
    try {
      validateMicrosoftUrl("https://bad.example.com", "authority");
      expect.fail("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      // The error message should contain "not in the allowed list", not "Invalid authority base URL"
      expect((error as Error).message).toContain("not in the allowed list");
      expect((error as Error).message).not.toContain(
        "Invalid authority base URL"
      );
    }
  });
});
