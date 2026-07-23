import { describe, expect, it } from "vitest";
import { toolDefinitions, toolArgSchemas, TOOL_NAMES, isToolName } from "./tools.js";

describe("tool definitions", () => {
  it("exposes exactly the seven Phase-4 tools", () => {
    expect(toolDefinitions.map((t) => t.name).sort()).toEqual([...TOOL_NAMES].sort());
  });

  it("every tool has a non-empty description and an object JSON schema", () => {
    for (const def of toolDefinitions) {
      expect(def.description.length).toBeGreaterThan(10);
      expect(def.parameters).toMatchObject({ type: "object" });
      // strict() zod objects forbid unknown keys in the JSON schema.
      expect(def.parameters.additionalProperties).toBe(false);
      // No leftover meta key.
      expect(def.parameters).not.toHaveProperty("$schema");
    }
  });

  it("placeFurniture parameters are derived from the zod schema (snapshot)", () => {
    const place = toolDefinitions.find((t) => t.name === "placeFurniture");
    expect(place?.parameters).toMatchInlineSnapshot(`
      {
        "additionalProperties": false,
        "properties": {
          "catalogId": {
            "minLength": 1,
            "type": "string",
          },
          "constraints": {
            "additionalProperties": false,
            "default": {},
            "properties": {
              "adjacentTo": {
                "type": "string",
              },
              "facingItem": {
                "type": "string",
              },
              "minClearance": {
                "exclusiveMinimum": 0,
                "maximum": 10,
                "type": "number",
              },
              "nearWall": {
                "type": "boolean",
              },
              "zone": {
                "enum": [
                  "corner",
                  "center",
                  "window",
                ],
                "type": "string",
              },
            },
            "type": "object",
          },
        },
        "required": [
          "catalogId",
        ],
        "type": "object",
      }
    `);
  });

  it("keeps the zod schema and tool definition in lock-step for every tool", () => {
    for (const name of TOOL_NAMES) {
      expect(isToolName(name)).toBe(true);
      expect(toolArgSchemas[name]).toBeDefined();
    }
    expect(isToolName("notATool")).toBe(false);
  });
});
