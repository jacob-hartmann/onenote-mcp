import { describe, it, expect } from "vitest";
import { escapeHtml, buildPageHtml, stripHtml } from "./index.js";

describe("utils barrel", () => {
  it("exports escapeHtml", () => {
    expect(escapeHtml).toBeDefined();
  });

  it("exports buildPageHtml", () => {
    expect(buildPageHtml).toBeDefined();
  });

  it("exports stripHtml", () => {
    expect(stripHtml).toBeDefined();
  });
});
