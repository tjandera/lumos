import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { applyRealismMaterials, createRealismMaterial } from "./realismMaterials.js";

describe("realismMaterials", () => {
  it("builds a physical material for each catalog category without throwing", () => {
    for (const category of ["seating", "tables", "storage", "beds", "lighting", "decor"] as const) {
      const mat = createRealismMaterial({ category, color: "#8a6f52" });
      expect(mat).toBeInstanceOf(THREE.MeshPhysicalMaterial);
      mat.dispose();
    }
  });

  it("builds floor/wall/ceiling materials", () => {
    for (const category of ["floor", "wall", "ceiling"] as const) {
      const mat = createRealismMaterial({ category, color: "#e8e4dc", roughness: 0.9 });
      expect(mat.roughness).toBeGreaterThan(0);
      mat.dispose();
    }
  });

  it("applyRealismMaterials does not dispose the previous shared material", () => {
    const shared = new THREE.MeshStandardMaterial({ color: "#fff" });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), shared);
    const root = new THREE.Group();
    root.add(mesh);

    applyRealismMaterials(root, "seating", "#8a6f52");

    expect(mesh.material).not.toBe(shared);
    // Shared Kenney materials must stay alive for the GLTF cache.
    expect(() => shared.color.set("#000")).not.toThrow();
    shared.dispose();
    (mesh.material as THREE.Material).dispose();
    mesh.geometry.dispose();
  });
});
