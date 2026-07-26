import { describe, expect, it } from "vitest";
import { buildShareUrl, parseShareToken } from "./hashRoute";

describe("parseShareToken", () => {
  it("extracts the token from a share hash", () => {
    expect(parseShareToken("#/share/abc123")).toBe("abc123");
  });

  it("returns null for an empty hash", () => {
    expect(parseShareToken("")).toBeNull();
  });

  it("returns null for a non-share hash", () => {
    expect(parseShareToken("#/something-else")).toBeNull();
  });

  it("returns null for a share hash with no token", () => {
    expect(parseShareToken("#/share/")).toBeNull();
  });

  it("decodes a percent-encoded token", () => {
    expect(parseShareToken(`#/share/${encodeURIComponent("a+b/c")}`)).toBe("a+b/c");
  });
});

describe("buildShareUrl", () => {
  it("builds a full share URL from an origin and token", () => {
    expect(buildShareUrl("http://localhost:5173", "abc123")).toBe("http://localhost:5173/#/share/abc123");
  });

  it("round-trips through parseShareToken", () => {
    const url = buildShareUrl("https://example.com", "tok-with-special_chars.123");
    const hash = url.slice(url.indexOf("#"));
    expect(parseShareToken(hash)).toBe("tok-with-special_chars.123");
  });
});
