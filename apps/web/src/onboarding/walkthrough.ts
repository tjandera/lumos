/**
 * Pure step-machine for the interactive "Build your first room" walkthrough.
 * Kept UI-free (no React/DOM) so the whole flow's transitions are unit
 * testable in isolation; `Onboarding.tsx` renders based on the current
 * `WalkthroughStage` and dispatches `WalkthroughEvent`s produced by user
 * actions (button clicks) or detected document changes (furniture added,
 * sun time changed).
 *
 * Flow:
 *   choice --CHOOSE_SAMPLE--------------------------------> furniture
 *   choice --CHOOSE_DRAW---------> plan --NEXT------------> furniture
 *   furniture --FURNITURE_ADDED-------------> furniture-success
 *   furniture-success --NEXT-----------------> sun
 *   sun --SUN_CHANGED-------------------------> sun-success
 *   sun-success --NEXT------------------------> save
 *   save --FINISH------------------------------> done
 *   (any stage) --SKIP--------------------------> done
 */

export type WalkthroughStage =
  | "choice"
  | "plan"
  | "furniture"
  | "furniture-success"
  | "sun"
  | "sun-success"
  | "save"
  | "done";

export type WalkthroughEvent =
  | { type: "CHOOSE_SAMPLE" }
  | { type: "CHOOSE_DRAW" }
  | { type: "NEXT" }
  | { type: "FURNITURE_ADDED" }
  | { type: "SUN_CHANGED" }
  | { type: "SKIP" }
  | { type: "FINISH" };

export const INITIAL_STAGE: WalkthroughStage = "choice";

/** Stages that expect the 3D tab to be active (vs. the Plan tab). */
const STAGES_NEEDING_3D_TAB: ReadonlySet<WalkthroughStage> = new Set([
  "furniture",
  "furniture-success",
  "sun",
  "sun-success",
  "save"
]);

/** Stages rendered as a small non-blocking "watching for you" hint rather
 *  than a blocking modal with a Next button (they wait on a detected
 *  document change instead of an explicit user click). */
const WATCHING_STAGES: ReadonlySet<WalkthroughStage> = new Set(["furniture", "sun"]);

export function isWalkthroughDone(stage: WalkthroughStage): boolean {
  return stage === "done";
}

export function stageWantsTab(stage: WalkthroughStage): "plan" | "3d" | null {
  if (stage === "plan") return "plan";
  if (STAGES_NEEDING_3D_TAB.has(stage)) return "3d";
  return null;
}

export function isWatchingStage(stage: WalkthroughStage): boolean {
  return WATCHING_STAGES.has(stage);
}

/** Pure stage transition — no side effects, no randomness. Events that
 *  don't apply to the current stage are no-ops (stage unchanged). */
export function walkthroughReducer(stage: WalkthroughStage, event: WalkthroughEvent): WalkthroughStage {
  if (event.type === "SKIP") return "done";

  switch (stage) {
    case "choice":
      if (event.type === "CHOOSE_SAMPLE") return "furniture";
      if (event.type === "CHOOSE_DRAW") return "plan";
      return stage;
    case "plan":
      if (event.type === "NEXT") return "furniture";
      return stage;
    case "furniture":
      if (event.type === "FURNITURE_ADDED") return "furniture-success";
      return stage;
    case "furniture-success":
      if (event.type === "NEXT") return "sun";
      return stage;
    case "sun":
      if (event.type === "SUN_CHANGED") return "sun-success";
      return stage;
    case "sun-success":
      if (event.type === "NEXT") return "save";
      return stage;
    case "save":
      if (event.type === "FINISH") return "done";
      return stage;
    case "done":
      return stage;
    default:
      return stage;
  }
}
