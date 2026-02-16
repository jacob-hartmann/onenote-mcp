import { describe, it, expect } from "vitest";
import { escapeHtml } from "./index.js";

describe("utils barrel", () => {
  it("exports escapeHtml", () => {
    expect(escapeHtml).toBeDefined();
  });
});
