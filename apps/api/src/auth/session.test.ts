import { describe, expect, it } from "vitest";
import { signSessionValue, verifySessionValue } from "./session.js";

describe("session cookie signing", () => {
  const secret = "test-secret";

  it("round-trips a signed value", () => {
    const value = signSessionValue("user-123", secret);
    expect(verifySessionValue(value, secret)).toBe("user-123");
  });

  it("rejects a value signed with a different secret", () => {
    const value = signSessionValue("user-123", "other-secret");
    expect(verifySessionValue(value, secret)).toBeNull();
  });

  it("rejects a tampered uid (signature no longer matches)", () => {
    const value = signSessionValue("user-123", secret);
    const [, mac] = value.split(".");
    const tampered = `user-456.${mac}`;
    expect(verifySessionValue(tampered, secret)).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const value = signSessionValue("user-123", secret);
    const tampered = value.slice(0, -1) + (value.endsWith("A") ? "B" : "A");
    expect(verifySessionValue(tampered, secret)).toBeNull();
  });

  it("rejects missing, empty, and malformed values", () => {
    expect(verifySessionValue(undefined, secret)).toBeNull();
    expect(verifySessionValue(null, secret)).toBeNull();
    expect(verifySessionValue("", secret)).toBeNull();
    expect(verifySessionValue("no-dot-here", secret)).toBeNull();
    expect(verifySessionValue(".just-a-mac", secret)).toBeNull();
  });

  it("produces different uids for different signed values (no forgeable pattern)", () => {
    const a = signSessionValue("alice", secret);
    const b = signSessionValue("bob", secret);
    expect(a).not.toBe(b);
    expect(verifySessionValue(a, secret)).toBe("alice");
    expect(verifySessionValue(b, secret)).toBe("bob");
  });
});
