/**
 * Minimal typed surface for the `@react-three/postprocessing` components used
 * by the lighting rig.
 *
 * Why this exists: `@react-three/postprocessing` ships extensionless ESM
 * `.d.ts` re-exports (`export * from './effects/N8AO'`), which the renderer's
 * NodeNext `moduleResolution` cannot follow, so its members resolve to nothing.
 * Rather than switch the whole package to Bundler resolution, we declare the
 * exact subset we consume. (The web app, on Bundler resolution, sees the real
 * types.)
 */
declare module "@react-three/postprocessing" {
  import type { ReactNode } from "react";
  import type { ColorRepresentation } from "three";

  export interface EffectComposerProps {
    children?: ReactNode;
    enabled?: boolean;
    enableNormalPass?: boolean;
    multisampling?: number;
    depthBuffer?: boolean;
    stencilBuffer?: boolean;
    autoClear?: boolean;
    resolutionScale?: number;
    renderPriority?: number;
  }
  export const EffectComposer: (props: EffectComposerProps) => JSX.Element;

  export interface N8AOProps {
    aoRadius?: number;
    distanceFalloff?: number;
    intensity?: number;
    quality?: "performance" | "low" | "medium" | "high" | "ultra";
    aoSamples?: number;
    denoiseSamples?: number;
    denoiseRadius?: number;
    color?: ColorRepresentation;
    halfRes?: boolean;
    depthAwareUpsampling?: boolean;
    screenSpaceRadius?: boolean;
    renderMode?: 0 | 1 | 2 | 3 | 4;
  }
  export const N8AO: (props: N8AOProps) => JSX.Element;

  export interface ToneMappingProps {
    mode?: number;
    blendFunction?: number;
    opacity?: number;
    resolution?: number;
    whitePoint?: number;
    middleGrey?: number;
    minLuminance?: number;
    averageLuminance?: number;
    adaptationRate?: number;
  }
  export const ToneMapping: (props: ToneMappingProps) => JSX.Element;
}
