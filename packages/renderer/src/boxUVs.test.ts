import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyBoxUVs, tilesPerMeterFor, writeBoxUVs } from './boxUVs.js';

function uvRange(geo: THREE.BufferGeometry) {
  const uv = geo.getAttribute('uv');
  let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
  for (let i = 0; i < uv.count; i++) {
    uMin = Math.min(uMin, uv.getX(i));
    uMax = Math.max(uMax, uv.getX(i));
    vMin = Math.min(vMin, uv.getY(i));
    vMax = Math.max(vMax, uv.getY(i));
  }
  return { uSpan: uMax - uMin, vSpan: vMax - vMin };
}

describe('writeBoxUVs', () => {
  it('spans one tile across a 1m cube at 1 tile per metre', () => {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    writeBoxUVs(geo, 1, 1);
    const { uSpan, vSpan } = uvRange(geo);
    expect(uSpan).toBeCloseTo(1, 5);
    expect(vSpan).toBeCloseTo(1, 5);
  });

  it('scales tiling with tilesPerMeter', () => {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    writeBoxUVs(geo, 1, 4);
    expect(uvRange(geo).uSpan).toBeCloseTo(4, 5);
  });

  it('accounts for the parent scale, so density is in real-world metres', () => {
    // A model authored 10 units wide but scaled to 1m must tile like a 1m object.
    const authored = new THREE.BoxGeometry(10, 10, 10);
    writeBoxUVs(authored, 0.1, 1); // scaled down to 1m
    expect(uvRange(authored).uSpan).toBeCloseTo(1, 5);
  });

  it('gives a big and a small object the same texture density', () => {
    // The whole point: a 0.5m stool and a 2m sofa show the same weave size.
    const small = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const big = new THREE.BoxGeometry(2, 2, 2);
    writeBoxUVs(small, 1, 2);
    writeBoxUVs(big, 1, 2);
    const sPerMetre = uvRange(small).uSpan / 0.5;
    const bPerMetre = uvRange(big).uSpan / 2;
    expect(sPerMetre).toBeCloseTo(bPerMetre, 5);
  });

  it('replaces the authored UVs rather than adding to them', () => {
    // BoxGeometry ships 0..1 UVs; the regression this guards is those surviving and
    // compounding with the projection.
    const geo = new THREE.BoxGeometry(3, 3, 3);
    writeBoxUVs(geo, 1, 1);
    expect(uvRange(geo).uSpan).toBeCloseTo(3, 5);
  });

  it('writes one uv pair per vertex', () => {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    writeBoxUVs(geo, 1, 1);
    expect(geo.getAttribute('uv').count).toBe(geo.getAttribute('position').count);
    expect(geo.getAttribute('uv').itemSize).toBe(2);
  });

  it('produces finite UVs for every vertex', () => {
    const geo = new THREE.SphereGeometry(1, 8, 6);
    writeBoxUVs(geo, 1, 2);
    const uv = geo.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) {
      expect(Number.isFinite(uv.getX(i))).toBe(true);
      expect(Number.isFinite(uv.getY(i))).toBe(true);
    }
  });

  it('computes normals when the geometry has none rather than bailing', () => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
    expect(writeBoxUVs(geo, 1, 1)).toBe(true);
    expect(geo.getAttribute('uv')).toBeTruthy();
  });

  it('reports failure for geometry with no positions', () => {
    expect(writeBoxUVs(new THREE.BufferGeometry(), 1, 1)).toBe(false);
  });
});

describe('applyBoxUVs', () => {
  it('does not mutate the shared source geometry', () => {
    // Geometry is shared with useGLTF's cache via scene.clone(true); writing in place
    // would corrupt every other instance of the same model.
    const shared = new THREE.BoxGeometry(1, 1, 1);
    const beforeUv = shared.getAttribute('uv').array.slice(0);
    const mesh = new THREE.Mesh(shared, new THREE.MeshStandardMaterial());
    const root = new THREE.Group();
    root.add(mesh);

    applyBoxUVs(root, 1, 5);

    expect(mesh.geometry).not.toBe(shared);
    expect(Array.from(shared.getAttribute('uv').array)).toEqual(Array.from(beforeUv));
    expect(uvRange(mesh.geometry).uSpan).toBeCloseTo(5, 5);
  });

  it('applies to every mesh under the root', () => {
    const root = new THREE.Group();
    const a = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    const b = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshStandardMaterial());
    root.add(a);
    a.add(b);

    applyBoxUVs(root, 1, 1);

    expect(uvRange(a.geometry).uSpan).toBeCloseTo(1, 5);
    expect(uvRange(b.geometry).uSpan).toBeCloseTo(2, 5);
  });

  it('ignores a non-positive or non-finite scale instead of writing NaN UVs', () => {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial());
    const root = new THREE.Group();
    root.add(mesh);

    applyBoxUVs(root, 0, 1);
    applyBoxUVs(root, Number.NaN, 1);

    expect(mesh.geometry).toBe(geo); // untouched
  });
});

describe('tilesPerMeterFor', () => {
  it('tiles fabric much finer than floorboards', () => {
    expect(tilesPerMeterFor('seating')).toBeGreaterThan(tilesPerMeterFor('floor'));
  });

  it('falls back for an unknown category', () => {
    expect(tilesPerMeterFor('nonexistent')).toBeGreaterThan(0);
  });
});
