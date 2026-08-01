import { describe, expect, it } from "vitest";
import { createSpendGuard, resolveDailyImageBudget } from "./spendGuard.js";

describe("createSpendGuard", () => {
  it("allows exactly the configured number of calls", () => {
    const g = createSpendGuard({ maxPerDay: 3 });
    expect([g.tryConsume(), g.tryConsume(), g.tryConsume()]).toEqual([true, true, true]);
    expect(g.tryConsume()).toBe(false);
  });

  it("keeps refusing once spent — this is the wallet's backstop, not a soft hint", () => {
    const g = createSpendGuard({ maxPerDay: 1 });
    g.tryConsume();
    for (let i = 0; i < 50; i++) expect(g.tryConsume()).toBe(false);
  });

  it("refunds a reservation when the call never reached the model", () => {
    // A misconfigured key fails every request; without refunds it would burn the whole
    // day's budget on calls that generated nothing.
    const g = createSpendGuard({ maxPerDay: 2 });
    g.tryConsume();
    g.refund();
    expect([g.tryConsume(), g.tryConsume()]).toEqual([true, true]);
    expect(g.tryConsume()).toBe(false);
  });

  it("never lets a refund manufacture budget", () => {
    const g = createSpendGuard({ maxPerDay: 1 });
    g.refund();
    g.refund();
    expect(g.status().used).toBe(0);
    expect(g.tryConsume()).toBe(true);
    expect(g.tryConsume()).toBe(false);
  });

  it("resets when the UTC day rolls over", () => {
    let now = Date.parse("2026-08-01T23:59:00Z");
    const g = createSpendGuard({ maxPerDay: 2 }, () => now);
    g.tryConsume();
    g.tryConsume();
    expect(g.tryConsume()).toBe(false);

    now = Date.parse("2026-08-02T00:01:00Z");
    expect(g.tryConsume()).toBe(true);
    expect(g.status().used).toBe(1);
  });

  it("keys on the calendar day, not a rolling 24h window", () => {
    // Two hours across midnight resets...
    let now = Date.parse("2026-08-01T23:00:00Z");
    const short = createSpendGuard({ maxPerDay: 1 }, () => now);
    short.tryConsume();
    now = Date.parse("2026-08-02T01:00:00Z");
    expect(short.tryConsume()).toBe(true);

    // ...while twenty-two hours within one day does not. A rolling window would get
    // this backwards, and the budget is meant to line up with a billing day.
    let t = Date.parse("2026-08-01T01:00:00Z");
    const long = createSpendGuard({ maxPerDay: 1 }, () => t);
    long.tryConsume();
    t = Date.parse("2026-08-01T23:00:00Z");
    expect(long.tryConsume()).toBe(false);
  });

  it("maxPerDay of 0 disables generation entirely", () => {
    const g = createSpendGuard({ maxPerDay: 0 });
    expect(g.tryConsume()).toBe(false);
    expect(g.status()).toMatchObject({ maxPerDay: 0, remaining: 0 });
  });

  it("reports remaining budget and when it resets", () => {
    const now = Date.parse("2026-08-01T10:00:00Z");
    const g = createSpendGuard({ maxPerDay: 5 }, () => now);
    g.tryConsume();
    const s = g.status();
    expect(s).toMatchObject({ used: 1, maxPerDay: 5, remaining: 4 });
    expect(s.resetsAt).toBe("2026-08-02T00:00:00.000Z");
  });
});

describe("resolveDailyImageBudget", () => {
  it("defaults to a small number, so forgetting to configure it fails safe", () => {
    // The failure mode of an unset budget should be "the demo stopped", not "the card
    // was charged".
    expect(resolveDailyImageBudget({})).toBe(100);
  });

  it("honours an explicit value, including zero", () => {
    expect(resolveDailyImageBudget({ IMAGE_DAILY_MAX: "25" })).toBe(25);
    expect(resolveDailyImageBudget({ IMAGE_DAILY_MAX: "0" })).toBe(0);
  });

  it("falls back to the default on garbage rather than to unlimited", () => {
    for (const raw of ["abc", "-5", "NaN"]) {
      expect(resolveDailyImageBudget({ IMAGE_DAILY_MAX: raw })).toBe(100);
    }
  });
});
