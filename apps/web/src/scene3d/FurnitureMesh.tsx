/**
 * Parametric primitive rendering for catalog furniture. Each catalog `id` maps
 * to a builder that composes the item out of simple boxes/cylinders sized from
 * the item's `dimensions` (meters). No GLB downloads this phase — but the
 * renderer is KEYED BY `catalogId`, so a future phase can register a GLB loader
 * for a given id in `BUILDERS` and everything else (placement, selection,
 * collision) keeps working unchanged.
 *
 * Local frame: origin at the footprint center on the floor (y = 0), width along
 * X, depth along Z, height up +Y. The parent group applies world position and
 * Y-rotation, so builders work purely in local space.
 */

import { Component, Suspense, useMemo, type ReactNode } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import type { Dimensions3D } from "@interior/core";
import { computeFitTransform } from "./modelFit";

type Vec3 = [number, number, number];

/** A single box primitive in the item's local frame. */
interface BoxPart {
  kind: "box";
  size: Vec3;
  /** Center position of the box in local space. */
  position: Vec3;
  /** Optional per-part color override (else the item base color is used). */
  color?: string;
  /** Lamp shade: glows warm when its lamp light is on. */
  glow?: boolean;
}

/** A single cylinder primitive (used for lamp poles / shades). */
interface CylinderPart {
  kind: "cylinder";
  radiusTop: number;
  radiusBottom: number;
  height: number;
  position: Vec3;
  color?: string;
  /** Lamp shade: glows warm when its lamp light is on. */
  glow?: boolean;
}

type Part = BoxPart | CylinderPart;

type Builder = (d: Dimensions3D) => Part[];

const LEG = "#3a2f25";

/** Table-like: a top slab on four legs. */
function tableBuilder(topThickness = 0.05): Builder {
  return (d) => {
    const legInset = 0.06;
    const legH = d.h - topThickness;
    const lx = d.w / 2 - legInset;
    const lz = d.d / 2 - legInset;
    const legSize: Vec3 = [0.05, legH, 0.05];
    return [
      { kind: "box", size: [d.w, topThickness, d.d], position: [0, d.h - topThickness / 2, 0] },
      { kind: "box", size: legSize, position: [-lx, legH / 2, -lz], color: LEG },
      { kind: "box", size: legSize, position: [lx, legH / 2, -lz], color: LEG },
      { kind: "box", size: legSize, position: [-lx, legH / 2, lz], color: LEG },
      { kind: "box", size: legSize, position: [lx, legH / 2, lz], color: LEG }
    ];
  };
}

/** Seat with a back and (optionally) two arms. */
function seatBuilder(withArms: boolean): Builder {
  return (d) => {
    const seatH = Math.min(0.42, d.h * 0.55);
    const backThick = Math.min(0.15, d.d * 0.2);
    const armW = withArms ? Math.min(0.15, d.w * 0.12) : 0;
    const cushionW = d.w - armW * 2;
    const parts: Part[] = [
      // seat cushion
      { kind: "box", size: [cushionW, seatH * 0.6, d.d - backThick], position: [0, seatH * 0.55, backThick / 2] },
      // back
      { kind: "box", size: [d.w, d.h, backThick], position: [0, d.h / 2, -d.d / 2 + backThick / 2] }
    ];
    if (withArms) {
      const armH = seatH + 0.12;
      parts.push({ kind: "box", size: [armW, armH, d.d - backThick], position: [-d.w / 2 + armW / 2, armH / 2, backThick / 2] });
      parts.push({ kind: "box", size: [armW, armH, d.d - backThick], position: [d.w / 2 - armW / 2, armH / 2, backThick / 2] });
    }
    return parts;
  };
}

/** Simple dining chair: seat slab, backrest, four legs. */
const chairBuilder: Builder = (d) => {
  const seatY = d.h * 0.5;
  const legH = seatY;
  const legSize: Vec3 = [0.04, legH, 0.04];
  const lx = d.w / 2 - 0.04;
  const lz = d.d / 2 - 0.04;
  return [
    { kind: "box", size: [d.w, 0.05, d.d], position: [0, seatY, 0] },
    { kind: "box", size: [d.w, d.h - seatY, 0.05], position: [0, seatY + (d.h - seatY) / 2, -d.d / 2 + 0.025] },
    { kind: "box", size: legSize, position: [-lx, legH / 2, -lz], color: LEG },
    { kind: "box", size: legSize, position: [lx, legH / 2, -lz], color: LEG },
    { kind: "box", size: legSize, position: [-lx, legH / 2, lz], color: LEG },
    { kind: "box", size: legSize, position: [lx, legH / 2, lz], color: LEG }
  ];
};

/** Bed: mattress block plus a headboard along the -Z (back) edge. */
const bedBuilder: Builder = (d) => {
  const frameH = d.h * 0.6;
  const headH = d.h * 1.3;
  return [
    { kind: "box", size: [d.w, frameH, d.d], position: [0, frameH / 2, 0], color: LEG },
    { kind: "box", size: [d.w - 0.08, frameH * 0.5, d.d - 0.1], position: [0, frameH + frameH * 0.25, 0.05] },
    { kind: "box", size: [d.w, headH, 0.1], position: [0, headH / 2, -d.d / 2 + 0.05] }
  ];
};

/** Closed cabinet (wardrobe): a body box with a subtle top/plinth. */
const cabinetBuilder: Builder = (d) => [
  { kind: "box", size: [d.w, d.h, d.d], position: [0, d.h / 2, 0] },
  { kind: "box", size: [d.w + 0.03, 0.04, d.d + 0.03], position: [0, d.h - 0.02, 0], color: LEG }
];

/** Open shelving: back panel plus evenly spaced shelves. */
const bookshelfBuilder: Builder = (d) => {
  const parts: Part[] = [
    { kind: "box", size: [d.w, d.h, 0.03], position: [0, d.h / 2, -d.d / 2 + 0.015], color: LEG },
    { kind: "box", size: [0.03, d.h, d.d], position: [-d.w / 2 + 0.015, d.h / 2, 0] },
    { kind: "box", size: [0.03, d.h, d.d], position: [d.w / 2 - 0.015, d.h / 2, 0] }
  ];
  const shelves = 4;
  for (let i = 0; i <= shelves; i++) {
    const y = (d.h / shelves) * i;
    parts.push({ kind: "box", size: [d.w, 0.03, d.d], position: [0, Math.min(y, d.h - 0.015), 0] });
  }
  return parts;
};

/** Floor lamp: round base, thin pole, tapered shade at the top. */
const lampBuilder: Builder = (d) => {
  const poleTop = d.h - 0.25;
  return [
    { kind: "cylinder", radiusTop: 0.16, radiusBottom: 0.18, height: 0.04, position: [0, 0.02, 0], color: LEG },
    { kind: "cylinder", radiusTop: 0.02, radiusBottom: 0.02, height: poleTop, position: [0, poleTop / 2, 0], color: LEG },
    { kind: "cylinder", radiusTop: 0.12, radiusBottom: 0.2, height: 0.25, position: [0, d.h - 0.125, 0], glow: true }
  ];
};

/** Registry keyed by catalog id. Fallback is a plain box. */
const BUILDERS: Record<string, Builder> = {
  "sofa-3seat": seatBuilder(true),
  armchair: seatBuilder(true),
  "dining-chair": chairBuilder,
  "coffee-table": tableBuilder(0.04),
  "dining-table": tableBuilder(0.05),
  "bed-single": bedBuilder,
  "bed-double": bedBuilder,
  wardrobe: cabinetBuilder,
  bookshelf: bookshelfBuilder,
  desk: tableBuilder(0.04),
  "tv-stand": cabinetBuilder,
  "floor-lamp": lampBuilder
};

function fallbackBuilder(d: Dimensions3D): Part[] {
  return [{ kind: "box", size: [d.w, d.h, d.d], position: [0, d.h / 2, 0] }];
}

export interface FurnitureMeshProps {
  catalogId: string;
  dimensions: Dimensions3D;
  color: string;
  selected?: boolean;
  colliding?: boolean;
  /** When this item is a lamp, whether its light is switched on (shade glows). */
  lampOn?: boolean;
  /**
   * Optional path/URL to a licensed GLB (see `../catalog/catalogData.ts`).
   * When present, this is the GLB swap point the primitive builders'
   * doc-comment always promised: the model is loaded via drei's `useGLTF`,
   * its bounding box is fit to `dimensions` (uniform scale + floor-centered
   * translate, see `./modelFit.ts`), and every mesh gets
   * `castShadow`/`receiveShadow`. A missing `modelUrl`, or any load error,
   * falls back to the parametric primitive builder unchanged — the GLB path
   * is purely additive.
   */
  modelUrl?: string;
}

/**
 * Render one furniture item as a primitive composition. Selection adds an
 * emissive tint; collision (or out-of-bounds) overrides the color to red.
 */
export function PrimitiveFurnitureMesh({
  catalogId,
  dimensions,
  color,
  selected = false,
  colliding = false,
  lampOn = false
}: Omit<FurnitureMeshProps, "modelUrl">): JSX.Element {
  const builder = BUILDERS[catalogId] ?? fallbackBuilder;
  const parts = builder(dimensions);

  const emissive = colliding ? "#ff2d2d" : selected ? "#2d6cff" : "#000000";
  const emissiveIntensity = colliding ? 0.55 : selected ? 0.35 : 0;

  return (
    <group>
      {parts.map((part, index) => {
        const partColor = colliding ? "#d94f4f" : part.color ?? color;
        const glowing = !!part.glow && lampOn && !colliding && !selected;
        const partEmissive = glowing ? "#ffdca6" : emissive;
        const partEmissiveIntensity = glowing ? 1.1 : emissiveIntensity;
        return (
          <mesh key={index} position={part.position} castShadow receiveShadow>
            {part.kind === "box" ? (
              <boxGeometry args={part.size} />
            ) : (
              <cylinderGeometry args={[part.radiusTop, part.radiusBottom, part.height, 20]} />
            )}
            <meshStandardMaterial
              color={partColor}
              roughness={0.7}
              emissive={partEmissive}
              emissiveIntensity={partEmissiveIntensity}
            />
          </mesh>
        );
      })}
    </group>
  );
}

/**
 * Flat, semi-transparent floor indicator used to carry selection/collision
 * feedback onto GLB items — primitives get emissive tinting on their parts,
 * but a loaded GLB's shared cached materials must not be mutated per-instance
 * (drei's `useGLTF` caches and reuses the parsed scene graph across every
 * placed instance of the same `modelUrl`), so this is a separate, cheap
 * overlay instead.
 */
function SelectionFloorIndicator({ dimensions, selected, colliding }: { dimensions: Dimensions3D; selected: boolean; colliding: boolean }) {
  if (!selected && !colliding) return null;
  const tint = colliding ? "#ff2d2d" : "#2d6cff";
  return (
    <mesh position={[0, 0.008, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
      <planeGeometry args={[dimensions.w * 1.08, dimensions.d * 1.08]} />
      <meshBasicMaterial color={tint} transparent opacity={0.32} depthWrite={false} />
    </mesh>
  );
}

/**
 * Loads `modelUrl` via drei's `useGLTF` (Suspense-based), fits its bounding
 * box to `dimensions` (see `./modelFit.ts`), and enables shadows on every
 * mesh. Must be rendered inside a `<Suspense>` (for the initial load) and a
 * `GltfErrorBoundary` (for load failures — `useGLTF` re-throws a caught
 * fetch/parse error synchronously on the next render once its internal
 * promise rejects, which only a class error boundary can catch).
 */
function GltfFurnitureMesh({ modelUrl, dimensions, selected = false, colliding = false }: FurnitureMeshProps) {
  const { scene } = useGLTF(modelUrl as string);

  const { object, fit } = useMemo(() => {
    const cloned = scene.clone(true);
    cloned.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    const box = new THREE.Box3().setFromObject(cloned);
    const bbox = {
      min: { x: box.min.x, y: box.min.y, z: box.min.z },
      max: { x: box.max.x, y: box.max.y, z: box.max.z }
    };
    return { object: cloned, fit: computeFitTransform(bbox, dimensions) };
  }, [scene, dimensions]);

  return (
    <group>
      <group scale={fit.scale} position={fit.position}>
        <primitive object={object} />
      </group>
      <SelectionFloorIndicator dimensions={dimensions} selected={selected} colliding={colliding} />
    </group>
  );
}

interface GltfErrorBoundaryProps {
  fallback: ReactNode;
  children: ReactNode;
  onError?: (error: Error) => void;
}
interface GltfErrorBoundaryState {
  hasError: boolean;
}

/**
 * Class error boundary (React requires a class here — there is no stable
 * hook-based equivalent) catching GLB load/parse failures from
 * `GltfFurnitureMesh` and rendering the primitive builder instead, so a bad
 * or missing `modelUrl` never breaks the scene.
 */
class GltfErrorBoundary extends Component<GltfErrorBoundaryProps, GltfErrorBoundaryState> {
  state: GltfErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): GltfErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error): void {
    this.props.onError?.(error);
  }

  render(): ReactNode {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

/**
 * Public entry point used by the scene: dispatches to the GLB loader when
 * `modelUrl` is present (wrapped in `Suspense` + `GltfErrorBoundary`, both
 * falling back to the primitive builder), otherwise renders the primitive
 * builder directly — the fast, dependency-free default path unchanged from
 * before this module gained GLB support.
 */
export function FurnitureMesh(props: FurnitureMeshProps): JSX.Element {
  const { modelUrl, ...primitiveProps } = props;
  const primitive = <PrimitiveFurnitureMesh {...primitiveProps} />;

  if (!modelUrl) return primitive;

  return (
    <GltfErrorBoundary fallback={primitive} onError={(error) => console.warn(`[FurnitureMesh] GLB load failed for "${modelUrl}", falling back to primitive:`, error)}>
      <Suspense fallback={primitive}>
        <GltfFurnitureMesh {...props} />
      </Suspense>
    </GltfErrorBoundary>
  );
}
