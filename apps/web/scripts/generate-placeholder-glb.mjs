#!/usr/bin/env node
/**
 * Generates a tiny, dependency-free, spec-valid GLB (binary glTF 2.0) — a
 * unit box with per-face normals and a flat PBR material — and writes it to
 * `apps/web/public/models/<name>.glb`.
 *
 * Why this exists: the backlog task asked for a curated set of licensed CC0
 * furniture GLBs (Poly Haven / Khronos sample models). This sandbox's
 * outbound network is restricted to a small domain allowlist that does not
 * include any binary-asset CDN (`dl.polyhaven.org`, `raw.githubusercontent.com`,
 * `cdn.jsdelivr.net`, `objects.githubusercontent.com`, etc. all return
 * `403 blocked-by-allowlist`); only `github.com` (HTML only), the npm
 * registry, and `api.polyhaven.com` (JSON metadata via the `web_fetch` tool)
 * were reachable — see `LICENSES.md` for the exact reachability report and
 * the Poly Haven asset slugs + license info already resolved for a future
 * drop-in. Real GLB bytes could not be fetched, so per the task's documented
 * fallback we prove the `modelUrl` → GLTF-load → bbox-fit → primitive-fallback
 * pipeline end-to-end with this procedurally generated placeholder instead.
 *
 * Run: `node scripts/generate-placeholder-glb.mjs` from `apps/web/`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "public", "models");

const GLTF_MAGIC = 0x46546c67; // "glTF"
const CHUNK_TYPE_JSON = 0x4e4f534a; // "JSON"
const CHUNK_TYPE_BIN = 0x004e4942; // "BIN\0"

/** Build a unit box (centered at origin, 1x1x1) as 24 vertices (4 per face)
 * so each face gets a flat, correct normal — good enough for a visible test
 * asset without pulling in a geometry library. */
function buildBoxGeometry() {
  // Each face: 4 corners in CCW winding (as seen from outside), plus its normal.
  const faces = [
    { normal: [0, 0, 1], corners: [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]] }, // +Z
    { normal: [0, 0, -1], corners: [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]] }, // -Z
    { normal: [1, 0, 0], corners: [[0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5]] }, // +X
    { normal: [-1, 0, 0], corners: [[-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5]] }, // -X
    { normal: [0, 1, 0], corners: [[-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5]] }, // +Y
    { normal: [0, -1, 0], corners: [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]] } // -Y
  ];

  const positions = [];
  const normals = [];
  const indices = [];
  let vertexOffset = 0;
  for (const face of faces) {
    for (const corner of face.corners) {
      positions.push(...corner);
      normals.push(...face.normal);
    }
    indices.push(vertexOffset, vertexOffset + 1, vertexOffset + 2, vertexOffset, vertexOffset + 2, vertexOffset + 3);
    vertexOffset += 4;
  }
  return { positions, normals, indices };
}

function align4(buf) {
  const pad = (4 - (buf.length % 4)) % 4;
  if (pad === 0) return buf;
  return Buffer.concat([buf, Buffer.alloc(pad)]);
}

function buildGlb({ positions, normals, indices }, { baseColor = [0.6, 0.45, 0.32, 1] } = {}) {
  const positionBuf = Buffer.from(new Float32Array(positions).buffer);
  const normalBuf = Buffer.from(new Float32Array(normals).buffer);
  const indexBuf = Buffer.from(new Uint16Array(indices).buffer);

  // Pad each section to a 4-byte boundary so bufferView byteOffsets stay aligned.
  const positionPadded = align4(positionBuf);
  const normalPadded = align4(normalBuf);
  const indexPadded = align4(indexBuf);

  const positionOffset = 0;
  const normalOffset = positionOffset + positionPadded.length;
  const indexOffset = normalOffset + normalPadded.length;
  const totalBinLength = indexOffset + indexPadded.length;

  const xs = positions.filter((_, i) => i % 3 === 0);
  const ys = positions.filter((_, i) => i % 3 === 1);
  const zs = positions.filter((_, i) => i % 3 === 2);
  const min = [Math.min(...xs), Math.min(...ys), Math.min(...zs)];
  const max = [Math.max(...xs), Math.max(...ys), Math.max(...zs)];

  const gltf = {
    asset: { version: "2.0", generator: "interior-app placeholder GLB generator (no deps)" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: "PlaceholderBox" }],
    meshes: [
      {
        name: "PlaceholderBoxMesh",
        primitives: [
          {
            attributes: { POSITION: 0, NORMAL: 1 },
            indices: 2,
            material: 0,
            mode: 4
          }
        ]
      }
    ],
    materials: [
      {
        name: "PlaceholderMaterial",
        pbrMetallicRoughness: { baseColorFactor: baseColor, metallicFactor: 0.05, roughnessFactor: 0.8 }
      }
    ],
    buffers: [{ byteLength: totalBinLength }],
    bufferViews: [
      { buffer: 0, byteOffset: positionOffset, byteLength: positionBuf.length, target: 34962 },
      { buffer: 0, byteOffset: normalOffset, byteLength: normalBuf.length, target: 34962 },
      { buffer: 0, byteOffset: indexOffset, byteLength: indexBuf.length, target: 34963 }
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126, // FLOAT
        count: positions.length / 3,
        type: "VEC3",
        min,
        max
      },
      { bufferView: 1, componentType: 5126, count: normals.length / 3, type: "VEC3" },
      { bufferView: 2, componentType: 5123, count: indices.length, type: "SCALAR" } // UNSIGNED_SHORT
    ]
  };

  // JSON chunk padding must use spaces (0x20) per spec, not NUL.
  const jsonText = JSON.stringify(gltf);
  const jsonBytes = Buffer.from(jsonText, "utf8");
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  const jsonPadded = Buffer.concat([jsonBytes, Buffer.alloc(jsonPad, 0x20)]);

  const binPadded = Buffer.concat([positionPadded, normalPadded, indexPadded]);

  const jsonChunkHeader = Buffer.alloc(8);
  jsonChunkHeader.writeUInt32LE(jsonPadded.length, 0);
  jsonChunkHeader.writeUInt32LE(CHUNK_TYPE_JSON, 4);

  const binChunkHeader = Buffer.alloc(8);
  binChunkHeader.writeUInt32LE(binPadded.length, 0);
  binChunkHeader.writeUInt32LE(CHUNK_TYPE_BIN, 4);

  const totalLength = 12 + jsonChunkHeader.length + jsonPadded.length + binChunkHeader.length + binPadded.length;

  const header = Buffer.alloc(12);
  header.writeUInt32LE(GLTF_MAGIC, 0);
  header.writeUInt32LE(2, 4); // version
  header.writeUInt32LE(totalLength, 8);

  return Buffer.concat([header, jsonChunkHeader, jsonPadded, binChunkHeader, binPadded]);
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const geometry = buildBoxGeometry();
  const glb = buildGlb(geometry, { baseColor: [0.55, 0.42, 0.3, 1] });
  const outPath = join(OUT_DIR, "test-box.glb");
  writeFileSync(outPath, glb);
  console.log(`Wrote ${outPath} (${glb.length} bytes)`);
}

main();
