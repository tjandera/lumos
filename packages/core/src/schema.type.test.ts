import { describe, expect, it } from "vitest";
import { createEmptyDocument } from "./document.js";
import { sceneDocumentSchema, type ValidatedSceneDocument } from "./schema.js";
import type { SceneDocument } from "./types.js";

/**
 * Compile-time compatibility between the hand-written `SceneDocument` interface
 * and the zod schema (the source of truth). We keep the interface hand-written
 * (with `schemaVersion`/`site` OPTIONAL, purely for back-compat with existing
 * construction sites) while the schema requires them. The safe, load-bearing
 * direction is asserted here: a validated document is always assignable to the
 * `SceneDocument` interface.
 */

// A value that satisfies the schema must be usable anywhere a SceneDocument is.
const _validatedIsSceneDocument: SceneDocument = {} as ValidatedSceneDocument;
void _validatedIsSceneDocument;

describe("schema/type compatibility", () => {
  it("createEmptyDocument output satisfies the zod schema", () => {
    const doc = createEmptyDocument("Compat", "compat-1");
    const result = sceneDocumentSchema.safeParse(doc);
    expect(result.success).toBe(true);
  });

  it("a parsed document is assignable to the SceneDocument interface at runtime", () => {
    const parsed = sceneDocumentSchema.parse(createEmptyDocument("Compat", "compat-2"));
    const asDoc: SceneDocument = parsed;
    expect(asDoc.schemaVersion).toBe(2);
    expect(asDoc.site).toBeDefined();
  });
});
