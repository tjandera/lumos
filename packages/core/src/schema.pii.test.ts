import { describe, expect, it } from "vitest";
import { z } from "zod";
import { sceneDocumentSchema, siteSchema } from "./schema.js";

/**
 * PII rule (see IMPLEMENTATION_PLAN.md item 8 and `Site` in types.ts): the home
 * address is PII and MUST NOT appear anywhere in the serializable document —
 * only coarse lat/lng + a north offset travel with a design. These tests fail
 * loudly if an address-like field is ever added to the schema.
 */

const ADDRESS_LIKE = /address|street|postcode|postal|zip|city|county|house(no|number)?/i;

/** Recursively collect every object key declared anywhere in a zod schema tree. */
function collectKeys(schema: z.ZodTypeAny, acc = new Set<string>(), seen = new Set<z.ZodTypeAny>()): Set<string> {
  if (seen.has(schema)) return acc;
  seen.add(schema);
  const def = schema._def as { typeName?: string; [k: string]: unknown };

  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    for (const [key, child] of Object.entries(shape)) {
      acc.add(key);
      collectKeys(child, acc, seen);
    }
  } else if (schema instanceof z.ZodArray) {
    collectKeys(schema.element, acc, seen);
  } else if (schema instanceof z.ZodUnion || schema instanceof z.ZodDiscriminatedUnion) {
    for (const option of (def.options as z.ZodTypeAny[]) ?? []) collectKeys(option, acc, seen);
  } else if (def.innerType) {
    collectKeys(def.innerType as z.ZodTypeAny, acc, seen);
  }
  return acc;
}

describe("PII: no address-like keys in the document schema", () => {
  it("the full document schema declares no address-like key", () => {
    const keys = [...collectKeys(sceneDocumentSchema)];
    const offenders = keys.filter((k) => ADDRESS_LIKE.test(k));
    expect(offenders).toEqual([]);
  });

  it("the site schema declares only coarse siting keys", () => {
    expect(new Set(Object.keys(siteSchema.shape))).toEqual(new Set(["lat", "lng", "trueNorthOffsetDeg"]));
  });

  it("rejects a site payload carrying a street address", () => {
    const result = siteSchema.safeParse({ lat: 51.5, lng: -0.1, trueNorthOffsetDeg: 0, address: "10 Downing St" });
    expect(result.success).toBe(false);
  });
});
