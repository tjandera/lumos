#!/usr/bin/env node
/**
 * Minimal, dependency-free GLB structural validator: parses the 12-byte GLB
 * header, the JSON chunk, and (if present) the BIN chunk, then checks the
 * handful of invariants that matter for this project (required top-level
 * keys, buffer byte-length agreement, accessor/bufferView index bounds).
 * No `@gltf-transform`/`gltf-validator` package was added as a dependency
 * (see LICENSES.md — the sandbox's network is restricted to a domain
 * allowlist, but `registry.npmjs.org` IS reachable, so `@gltf-transform/cli`
 * could be `pnpm add -D`'d by a follow-up agent with network access to run
 * real Draco/texture-resize optimization on genuine downloaded assets).
 *
 * Usage: node scripts/validate-glb.mjs <path-to-glb> [more paths...]
 * Exits non-zero if any file fails validation.
 */
import { readFileSync } from "node:fs";

function validateOne(path) {
  const buf = readFileSync(path);
  const errors = [];

  if (buf.length < 12) {
    return [`file too short to contain a GLB header (${buf.length} bytes)`];
  }

  const magic = buf.readUInt32LE(0);
  const version = buf.readUInt32LE(4);
  const length = buf.readUInt32LE(8);

  if (magic !== 0x46546c67) errors.push(`bad magic: 0x${magic.toString(16)} (expected glTF/0x46546c67)`);
  if (version !== 2) errors.push(`unsupported glTF version: ${version} (expected 2)`);
  if (length !== buf.length) errors.push(`header length ${length} does not match actual file size ${buf.length}`);

  let offset = 12;
  let json;
  let binChunk;
  while (offset + 8 <= buf.length) {
    const chunkLength = buf.readUInt32LE(offset);
    const chunkType = buf.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkLength;
    if (chunkEnd > buf.length) {
      errors.push(`chunk at offset ${offset} overruns file (declares ${chunkLength} bytes)`);
      break;
    }
    if (chunkType === 0x4e4f534a) {
      try {
        json = JSON.parse(buf.subarray(chunkStart, chunkEnd).toString("utf8"));
      } catch (e) {
        errors.push(`JSON chunk is not valid JSON: ${e.message}`);
      }
    } else if (chunkType === 0x004e4942) {
      binChunk = buf.subarray(chunkStart, chunkEnd);
    }
    offset = chunkEnd;
  }

  if (!json) {
    errors.push("no JSON chunk found");
    return errors;
  }

  if (!json.asset || json.asset.version !== "2.0") errors.push("missing/invalid asset.version (expected '2.0')");
  if (!Array.isArray(json.meshes) || json.meshes.length === 0) errors.push("no meshes[] present");
  if (!Array.isArray(json.accessors) || json.accessors.length === 0) errors.push("no accessors[] present");
  if (!Array.isArray(json.bufferViews) || json.bufferViews.length === 0) errors.push("no bufferViews[] present");
  if (!Array.isArray(json.buffers) || json.buffers.length === 0) errors.push("no buffers[] present");

  if (json.buffers?.[0] && binChunk) {
    const declared = json.buffers[0].byteLength;
    if (declared > binChunk.length) {
      errors.push(`buffers[0].byteLength (${declared}) exceeds actual BIN chunk size (${binChunk.length})`);
    }
  }

  // Index-bounds sanity: every accessor's bufferView index must resolve, and
  // every primitive's attribute/indices accessor index must resolve.
  const bvCount = json.bufferViews?.length ?? 0;
  (json.accessors ?? []).forEach((a, i) => {
    if (a.bufferView !== undefined && (a.bufferView < 0 || a.bufferView >= bvCount)) {
      errors.push(`accessors[${i}].bufferView ${a.bufferView} out of range (0..${bvCount - 1})`);
    }
  });
  const accCount = json.accessors?.length ?? 0;
  (json.meshes ?? []).forEach((mesh, mi) => {
    (mesh.primitives ?? []).forEach((prim, pi) => {
      if (prim.indices !== undefined && (prim.indices < 0 || prim.indices >= accCount)) {
        errors.push(`meshes[${mi}].primitives[${pi}].indices ${prim.indices} out of range`);
      }
      for (const [attrName, accIdx] of Object.entries(prim.attributes ?? {})) {
        if (accIdx < 0 || accIdx >= accCount) {
          errors.push(`meshes[${mi}].primitives[${pi}].attributes.${attrName} -> accessor ${accIdx} out of range`);
        }
      }
    });
  });

  return errors;
}

const paths = process.argv.slice(2);
if (paths.length === 0) {
  console.error("Usage: node scripts/validate-glb.mjs <path.glb> [more...]");
  process.exit(2);
}

let anyFailed = false;
for (const p of paths) {
  const errors = validateOne(p);
  if (errors.length === 0) {
    console.log(`OK   ${p}`);
  } else {
    anyFailed = true;
    console.log(`FAIL ${p}`);
    for (const e of errors) console.log(`     - ${e}`);
  }
}
process.exit(anyFailed ? 1 : 0);
