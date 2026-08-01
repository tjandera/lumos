import { describe, expect, it } from "vitest";
import { corsOriginMatcher, resolveTrustProxy } from "./security.js";

describe("resolveTrustProxy", () => {
  it("trusts nothing by default", () => {
    // A directly-exposed process must not believe a header anyone can send.
    expect(resolveTrustProxy({})).toBe(false);
    expect(resolveTrustProxy({ TRUST_PROXY: "" })).toBe(false);
  });

  it("accepts an explicit hop count", () => {
    expect(resolveTrustProxy({ TRUST_PROXY: "1" })).toBe(1);
    expect(resolveTrustProxy({ TRUST_PROXY: "2" })).toBe(2);
  });

  it("accepts the whole chain only when asked in so many words", () => {
    expect(resolveTrustProxy({ TRUST_PROXY: "true" })).toBe(true);
    expect(resolveTrustProxy({ TRUST_PROXY: "false" })).toBe(false);
  });

  it("falls back to trusting nothing on nonsense rather than trusting everything", () => {
    // Failing open here would silently re-enable IP spoofing against the rate limiters.
    for (const raw of ["yes", "-1", "0", "abc", "1.5"]) {
      expect(resolveTrustProxy({ TRUST_PROXY: raw })).toBe(false);
    }
  });
});

describe("corsOriginMatcher", () => {
  const PROD = { NODE_ENV: "production", VITE_ORIGIN: "https://interior.example.com" };

  it("allows the configured origin", () => {
    const allow = corsOriginMatcher(undefined, PROD);
    expect(allow("https://interior.example.com")).toBe(true);
  });

  it("ignores a trailing slash mismatch", () => {
    const allow = corsOriginMatcher("https://interior.example.com/", PROD);
    expect(allow("https://interior.example.com")).toBe(true);
  });

  it("allows requests with no Origin — curl, same-origin, server-to-server", () => {
    expect(corsOriginMatcher(undefined, PROD)(undefined)).toBe(true);
  });

  it("rejects anything else in production", () => {
    const allow = corsOriginMatcher(undefined, PROD);
    expect(allow("https://evil.example.com")).toBe(false);
    // The old policy allowed this unconditionally: any app the visitor happened to be
    // running locally could then read and modify their designs on the deployed API.
    expect(allow("http://localhost:3000")).toBe(false);
    expect(allow("http://127.0.0.1:8080")).toBe(false);
  });

  it("still allows localhost outside production, so dev keeps working", () => {
    const allow = corsOriginMatcher(undefined, { NODE_ENV: "development" });
    expect(allow("http://localhost:5173")).toBe(true);
    expect(allow("http://127.0.0.1:4173")).toBe(true);
    expect(allow("https://evil.example.com")).toBe(false);
  });

  it("accepts a list of allowed origins", () => {
    const allow = corsOriginMatcher(["https://a.example.com", "https://b.example.com"], PROD);
    expect(allow("https://a.example.com")).toBe(true);
    expect(allow("https://b.example.com")).toBe(true);
    expect(allow("https://c.example.com")).toBe(false);
  });

  it("does not let a lookalike host through on a prefix match", () => {
    const allow = corsOriginMatcher("https://interior.example.com", PROD);
    expect(allow("https://interior.example.com.evil.net")).toBe(false);
    expect(allow("https://evil-interior.example.com")).toBe(false);
  });
});

describe("resolveCookiePolicy", () => {
  it("defaults to lax, secure only in production", async () => {
    const { resolveCookiePolicy } = await import("./auth/session.js");
    expect(resolveCookiePolicy({ NODE_ENV: "production" })).toEqual({ sameSite: "lax", secure: true });
    expect(resolveCookiePolicy({ NODE_ENV: "development" })).toEqual({ sameSite: "lax", secure: false });
  });

  it("forces secure alongside sameSite=none, in every environment", async () => {
    // A SameSite=None cookie without Secure is dropped by the browser without a word,
    // which reproduces exactly the broken-ownership symptom the setting exists to cure.
    const { resolveCookiePolicy } = await import("./auth/session.js");
    expect(resolveCookiePolicy({ SESSION_COOKIE_SAMESITE: "none" })).toEqual({ sameSite: "none", secure: true });
    expect(resolveCookiePolicy({ SESSION_COOKIE_SAMESITE: "none", NODE_ENV: "development" })).toEqual({
      sameSite: "none",
      secure: true,
    });
  });

  it("supports strict, and ignores unknown values rather than guessing", async () => {
    const { resolveCookiePolicy } = await import("./auth/session.js");
    expect(resolveCookiePolicy({ SESSION_COOKIE_SAMESITE: "strict", NODE_ENV: "production" })).toEqual({
      sameSite: "strict",
      secure: true,
    });
    expect(resolveCookiePolicy({ SESSION_COOKIE_SAMESITE: "banana" })).toEqual({ sameSite: "lax", secure: false });
  });

  it("is case-insensitive, since env vars get typed by hand", async () => {
    const { resolveCookiePolicy } = await import("./auth/session.js");
    expect(resolveCookiePolicy({ SESSION_COOKIE_SAMESITE: "None" }).sameSite).toBe("none");
  });
});
