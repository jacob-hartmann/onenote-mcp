import { describe, it, expect } from "vitest";
import {
  escapeHtml,
  sanitizeHtmlForXhtml,
  buildPageHtml,
  stripHtml,
} from "./html.js";

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

describe("stripHtml", () => {
  it("strips HTML tags and returns plain text", () => {
    const result = stripHtml("<p>Hello <strong>world</strong></p>");
    expect(result).toBe("Hello world");
  });

  it("removes style blocks entirely", () => {
    const result = stripHtml(
      '<style type="text/css">.cls { color: red; }</style><p>Content</p>'
    );
    expect(result).toBe("Content");
    expect(result).not.toContain("color");
  });

  it("removes script blocks entirely", () => {
    const result = stripHtml(
      '<script>alert("xss")</script><p>Safe content</p>'
    );
    expect(result).toBe("Safe content");
    expect(result).not.toContain("alert");
  });

  it("collapses whitespace", () => {
    const result = stripHtml("<div>  Hello   <span>  world  </span>  </div>");
    expect(result).toBe("Hello world");
  });

  it("trims leading and trailing whitespace", () => {
    const result = stripHtml("  <p>content</p>  ");
    expect(result).toBe("content");
  });

  it("handles empty string", () => {
    expect(stripHtml("")).toBe("");
  });

  it("handles plain text with no tags", () => {
    expect(stripHtml("Just plain text")).toBe("Just plain text");
  });

  it("handles nested tags", () => {
    const result = stripHtml(
      "<div><ul><li>Item 1</li><li>Item 2</li></ul></div>"
    );
    expect(result).toContain("Item 1");
    expect(result).toContain("Item 2");
  });

  it("removes multiline style blocks", () => {
    const result = stripHtml(
      `<style>
        body { margin: 0; }
        p { color: blue; }
      </style>
      <p>Visible text</p>`
    );
    expect(result).toBe("Visible text");
  });
});
