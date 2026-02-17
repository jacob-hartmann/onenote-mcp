import { describe, it, expect } from "vitest";
import { escapeHtml, buildPageHtml } from "./index.js";

describe("utils barrel", () => {
  it("exports escapeHtml", () => {
    expect(escapeHtml).toBeDefined();
  });

  it("exports buildPageHtml", () => {
    expect(buildPageHtml).toBeDefined();
  });
});
