import { describe, it, expect } from "vitest";
import { escapeHtml, sanitizeHtmlForXhtml, buildPageHtml } from "./html.js";

describe("escapeHtml", () => {
  it("escapes ampersands", () => {
    expect(escapeHtml("a & b")).toBe("a &amp; b");
  });

  it("escapes angle brackets", () => {
    expect(escapeHtml("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;"
    );
  });

  it("escapes double quotes", () => {
    expect(escapeHtml('say "hello"')).toBe("say &quot;hello&quot;");
  });
});

describe("sanitizeHtmlForXhtml", () => {
  it("self-closes void elements like <br>", () => {
    expect(sanitizeHtmlForXhtml("<br>")).toBe("<br/>");
  });

  it("self-closes void elements with attributes", () => {
    expect(sanitizeHtmlForXhtml('<img src="a.png">')).toBe(
      '<img src="a.png"/>'
    );
  });

  it("does not double-close already self-closed void elements", () => {
    expect(sanitizeHtmlForXhtml("<br/>")).toBe("<br/>");
  });

  it("self-closes <hr> tags", () => {
    expect(sanitizeHtmlForXhtml("<hr>")).toBe("<hr/>");
  });

  it("self-closes <input> tags", () => {
    expect(sanitizeHtmlForXhtml('<input type="text">')).toBe(
      '<input type="text"/>'
    );
  });

  it("escapes bare ampersands", () => {
    expect(sanitizeHtmlForXhtml("a & b")).toBe("a &amp; b");
  });

  it("does not escape existing HTML entities", () => {
    expect(sanitizeHtmlForXhtml("&amp; &lt; &#60; &#x3C;")).toBe(
      "&amp; &lt; &#60; &#x3C;"
    );
  });

  it("handles mixed content with void elements and bare ampersands", () => {
    const input = "<p>Hello & world</p><br><hr>";
    const result = sanitizeHtmlForXhtml(input);
    expect(result).toContain("&amp;");
    expect(result).toContain("<br/>");
    expect(result).toContain("<hr/>");
  });

  it("handles empty string", () => {
    expect(sanitizeHtmlForXhtml("")).toBe("");
  });

  it("handles content with no void elements or bare ampersands", () => {
    const input = "<p>Hello world</p>";
    expect(sanitizeHtmlForXhtml(input)).toBe("<p>Hello world</p>");
  });

  it("does not close tags followed by an explicit closing tag", () => {
    // Edge case: <br></br> should remain as-is if pattern explicitly matches
    const result = sanitizeHtmlForXhtml("<br></br>");
    expect(result).toBe("<br></br>");
  });

  it("throws when content exceeds MAX_SANITIZE_LENGTH (1MB)", () => {
    const hugeContent = "x".repeat(1_000_001);
    expect(() => sanitizeHtmlForXhtml(hugeContent)).toThrow(
      "Content too large for sanitization"
    );
  });

  it("does not throw for content exactly at the limit", () => {
    const exactContent = "x".repeat(1_000_000);
    expect(() => sanitizeHtmlForXhtml(exactContent)).not.toThrow();
  });
});

describe("buildPageHtml", () => {
  it("constructs valid XHTML with title and body", () => {
    const html = buildPageHtml("My Page", "<p>Hello world</p>");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<html>");
    expect(html).toContain("<title>My Page</title>");
    expect(html).toContain("<p>Hello world</p>");
    expect(html).toContain("</body>");
    expect(html).toContain("</html>");
  });

  it("escapes the title to prevent XSS", () => {
    const html = buildPageHtml('<script>alert("xss")</script>', "<p>safe</p>");
    expect(html).toContain(
      "<title>&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;</title>"
    );
    expect(html).not.toContain("<title><script>");
  });

  it("handles missing body content", () => {
    const html = buildPageHtml("Empty Page");
    expect(html).toContain("<title>Empty Page</title>");
    expect(html).toContain("<body>");
    expect(html).toContain("</body>");
  });

  it("handles empty string body content", () => {
    const html = buildPageHtml("Page", "");
    expect(html).toContain("<body>");
    expect(html).toContain("</body>");
  });

  it("escapes ampersands in title", () => {
    const html = buildPageHtml("A & B Notes");
    expect(html).toContain("<title>A &amp; B Notes</title>");
  });
});
